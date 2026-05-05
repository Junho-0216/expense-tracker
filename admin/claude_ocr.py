# 생성: 2026-05-04
"""`claude -p` 서브프로세스로 영수증 OCR.

규칙 (CLAUDE.md §0.1):
- Anthropic API/SDK 직접 호출 금지.
- 오로지 `claude -p <prompt>` 서브프로세스만 사용.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import time
from typing import Dict

logger = logging.getLogger("admin.ocr")

PROMPT_TEMPLATE = """다음 이미지 파일은 카드 결제 영수증입니다: {path}

이미지에서 두 가지 정보를 추출하여 JSON만 출력하세요.
스키마: {{"date": "YY.MM.DD", "vendor": "업체명"}}

규칙:
- date: 결제 일시. 연도 끝 2자리.월(2자리).일(2자리). 예: 25.11.03
- vendor: 결제 업체명. 카드사명/승인번호/금액은 제외.
- 코드펜스나 설명 없이 JSON 한 줄만 출력하세요.
- 판독 불가 항목은 빈 문자열 ""로.
"""

CODE_FENCE_RE = re.compile(r"```(?:json)?\s*|\s*```", re.MULTILINE)
JSON_BLOCK_RE = re.compile(r"\{.*?\}", re.DOTALL)


def _resolve_claude_cli() -> str:
    """PATH에서 claude CLI를 찾는다. Windows에서는 .cmd 변형도 고려."""
    for name in ("claude", "claude.cmd", "claude.exe"):
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError(
        "claude CLI를 찾을 수 없습니다. https://docs.claude.com/en/docs/claude-code 에서 설치하세요."
    )


def _parse_json(stdout: str) -> Dict[str, str]:
    """stdout에서 JSON dict 추출. 코드펜스/잡문 제거 후 첫 {} 블록 파싱."""
    cleaned = CODE_FENCE_RE.sub("", stdout).strip()
    # 우선 통째로 시도
    try:
        parsed = json.loads(cleaned)
    except Exception:
        m = JSON_BLOCK_RE.search(cleaned)
        if not m:
            raise ValueError(f"응답에서 JSON 객체를 찾지 못했습니다. raw={cleaned[:200]}")
        parsed = json.loads(m.group(0))

    if not isinstance(parsed, dict):
        raise ValueError(f"JSON이 객체가 아닙니다: {parsed!r}")
    if "date" not in parsed or "vendor" not in parsed:
        raise ValueError(f"필수 키 누락 (date/vendor): {parsed!r}")

    return {
        "date": str(parsed.get("date", "")).strip(),
        "vendor": str(parsed.get("vendor", "")).strip(),
    }


def ocr_receipt(image_path: str, *, timeout: int = 120) -> Dict[str, str]:
    """단일 호출 (재시도 없음)."""
    if not os.path.isfile(image_path):
        raise FileNotFoundError(image_path)

    cli = _resolve_claude_cli()
    abs_path = os.path.abspath(image_path)
    prompt = PROMPT_TEMPLATE.format(path=abs_path)

    logger.info("claude -p 호출: cli=%s, image=%s", cli, abs_path)
    proc = subprocess.run(
        [cli, "-p", prompt, "--dangerously-skip-permissions"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"claude CLI 실패 (code={proc.returncode}): {(proc.stderr or '')[:500]}"
        )
    stdout = (proc.stdout or "").strip()
    if not stdout:
        raise RuntimeError("claude CLI stdout이 비어있습니다.")

    return _parse_json(stdout)


def ocr_with_retry(image_path: str, *, retries: int = 2, timeout: int = 120) -> Dict[str, str]:
    """retries회 재시도. 모두 실패 시 마지막 예외 raise."""
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            return ocr_receipt(image_path, timeout=timeout)
        except Exception as e:
            last_err = e
            logger.warning("OCR 시도 %d 실패: %s", attempt + 1, e)
            if attempt < retries:
                time.sleep(2)
    assert last_err is not None
    raise last_err


# CLI 검증용 — Phase 4 시작 시 sample 영수증으로 테스트.
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("사용법: python claude_ocr.py <image_path>", file=sys.stderr)
        sys.exit(2)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = ocr_with_retry(sys.argv[1], retries=1)
    print(json.dumps(result, ensure_ascii=False, indent=2))
