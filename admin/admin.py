# 생성: 2026-05-04
"""Local Admin Flask app.

수동 모드: `python admin.py`
자동 모드: `python admin.py --auto-run`
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys
import threading
import time
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

import claude_ocr
from drive_client import DriveClient
from sheets_client import SheetsClient

load_dotenv()

# ────────── Paths ──────────
APPDATA = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
APP_DIR = APPDATA / "expense_tracker"
APP_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_SA_PATH = APP_DIR / "sa.json"
LAST_AUTO_RUN_PATH = APP_DIR / "last_auto_run.json"
LOGS_DIR = APP_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)


def _resolve_sa_path() -> Path:
    custom = os.environ.get("SA_JSON_PATH")
    if custom:
        return Path(custom)
    return DEFAULT_SA_PATH


SA_PATH = _resolve_sa_path()

SHEET_ID = os.environ.get("SHEET_ID", "")
SHEET_TAB = os.environ.get("SHEET_TAB", "Sheet1")
ADMIN_PORT = int(os.environ.get("ADMIN_PORT", "8765"))

# ────────── Logging ──────────
logger = logging.getLogger("admin")
logger.setLevel(logging.INFO)
_console = logging.StreamHandler()
_console.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(_console)


def _attach_file_log(prefix: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path = LOGS_DIR / f"{prefix}_{ts}.log"
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(fh)
    return log_path


# ────────── Flask app + 진행 상태 ──────────
app = Flask(__name__, template_folder="templates", static_folder="static")

state = {
    "lock": threading.Lock(),
    "progress": {"total": 0, "done": 0, "errors": [], "running": False, "started_at": None},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _read_last_auto_run():
    if not LAST_AUTO_RUN_PATH.exists():
        return None
    try:
        return json.loads(LAST_AUTO_RUN_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("last_auto_run.json 파싱 실패: %s", e)
        return None


def _write_last_auto_run(data: dict) -> None:
    LAST_AUTO_RUN_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _check_config_or_die() -> tuple[SheetsClient, DriveClient]:
    if not SHEET_ID:
        raise SystemExit("환경변수 SHEET_ID 미설정. admin/.env 확인.")
    if not SA_PATH.exists():
        raise SystemExit(
            f"SA 키 파일 없음: {SA_PATH}\n"
            f"  → Google Cloud에서 SA 키(JSON)를 다운로드해 위 경로에 두세요.\n"
            f"  → 또는 SA_JSON_PATH 환경변수로 다른 경로 지정."
        )
    sheets = SheetsClient(SHEET_ID, str(SA_PATH), tab=SHEET_TAB)
    drive = DriveClient(str(SA_PATH))
    return sheets, drive


# ────────── Batch runner ──────────
def run_batch(auto_mode: bool = False) -> None:
    """pending 행 일괄 처리. claude -p OCR + 시트 업데이트.

    auto_mode=True면 last_auto_run.json 기록.
    """
    state["progress"] = {
        "total": 0,
        "done": 0,
        "errors": [],
        "running": True,
        "started_at": _now_iso(),
    }
    started_iso = state["progress"]["started_at"]

    try:
        sheets, drive = _check_config_or_die()
        rows = sheets.get_pending_rows()
        state["progress"]["total"] = len(rows)
        logger.info("배치 시작: %d 건 pending", len(rows))

        for row in rows:
            tmp_dir = None
            try:
                if not row.file_id:
                    raise ValueError("N열 fileId 비어있음")
                logger.info("[row %d] 다운로드 fileId=%s", row.row_idx, row.file_id)
                img_path, _meta = drive.download_to_temp(row.file_id)
                tmp_dir = os.path.dirname(img_path)

                ocr = claude_ocr.ocr_with_retry(img_path, retries=2)
                logger.info("[row %d] OCR 결과: %s", row.row_idx, ocr)
                sheets.update_row(
                    row.row_idx,
                    date=ocr.get("date", ""),
                    vendor=ocr.get("vendor", ""),
                    status="done",
                    error="",
                )
            except Exception as e:
                msg = str(e)[:200]
                logger.exception("[row %d] 실패: %s", row.row_idx, msg)
                try:
                    sheets.update_row(row.row_idx, status="error", error=msg)
                except Exception as e2:
                    logger.exception("[row %d] error 마킹 실패: %s", row.row_idx, e2)
                state["progress"]["errors"].append({"row": row.row_idx, "msg": msg})
            finally:
                if tmp_dir and os.path.isdir(tmp_dir):
                    try:
                        shutil.rmtree(tmp_dir, ignore_errors=True)
                    except Exception:
                        pass
                state["progress"]["done"] += 1
                time.sleep(1)

        logger.info(
            "배치 완료: total=%d, errors=%d",
            state["progress"]["total"],
            len(state["progress"]["errors"]),
        )

        if auto_mode:
            _write_last_auto_run(
                {
                    "ran_at": started_iso,
                    "finished_at": _now_iso(),
                    "total": state["progress"]["total"],
                    "done": state["progress"]["done"],
                    "errors": len(state["progress"]["errors"]),
                    "error_details": state["progress"]["errors"],
                }
            )
    except Exception as e:
        logger.exception("배치 자체 실패: %s", e)
        if auto_mode:
            _write_last_auto_run(
                {
                    "ran_at": started_iso,
                    "finished_at": _now_iso(),
                    "total": 0,
                    "done": 0,
                    "errors": 1,
                    "error_details": [{"row": 0, "msg": str(e)[:200]}],
                }
            )
    finally:
        state["progress"]["running"] = False


# ────────── Routes ──────────
@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/status")
def api_status():
    try:
        sheets, _ = _check_config_or_die()
        counts = sheets.count_by_status()
    except SystemExit as e:
        return jsonify({"error": str(e), "counts": None, "last_auto_run": _read_last_auto_run()}), 500
    except Exception as e:
        logger.exception("status 실패")
        return jsonify({"error": str(e), "counts": None, "last_auto_run": _read_last_auto_run()}), 500
    return jsonify(
        {
            "counts": counts,
            "last_auto_run": _read_last_auto_run(),
            "running": state["progress"].get("running", False),
            "sheet_id": SHEET_ID,
            "sa_path": str(SA_PATH),
        }
    )


@app.route("/api/process", methods=["POST"])
def api_process():
    if not state["lock"].acquire(blocking=False):
        return jsonify({"error": "이미 실행 중입니다."}), 409

    def _runner():
        try:
            run_batch(auto_mode=False)
        finally:
            state["lock"].release()

    threading.Thread(target=_runner, daemon=True).start()
    return jsonify({"started": True})


@app.route("/api/progress")
def api_progress():
    return jsonify(state["progress"])


@app.route("/api/retry/<int:row>", methods=["POST"])
def api_retry(row: int):
    if not state["lock"].acquire(blocking=False):
        return jsonify({"error": "다른 작업 실행 중"}), 409
    try:
        sheets, _ = _check_config_or_die()
        sheets.update_row(row, status="pending", error="")
    except Exception as e:
        state["lock"].release()
        return jsonify({"error": str(e)}), 500
    state["lock"].release()
    return jsonify({"ok": True})


# ────────── Entrypoint ──────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--auto-run", action="store_true",
                        help="배치를 즉시 실행하고 종료 (Windows 작업 스케줄러용)")
    args = parser.parse_args()

    if args.auto_run:
        log_path = _attach_file_log("auto_run")
        logger.info("=== auto-run 시작 (log: %s) ===", log_path)
        run_batch(auto_mode=True)
        logger.info("=== auto-run 종료 ===")
        return

    logger.info("Admin 서버 기동: http://127.0.0.1:%d", ADMIN_PORT)
    threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{ADMIN_PORT}")).start()
    app.run(host="127.0.0.1", port=ADMIN_PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
