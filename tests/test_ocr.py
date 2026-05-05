# 생성: 2026-05-04
"""tests/sample_receipts/ 의 모든 이미지에 대해 claude -p OCR 실행 후 결과 출력.

실행:
    python tests/test_ocr.py
또는 특정 폴더:
    python tests/test_ocr.py path/to/folder
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

# admin 디렉토리를 PYTHONPATH에 추가 (claude_ocr import 위해)
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "admin"))

import claude_ocr  # noqa: E402

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else (Path(__file__).parent / "sample_receipts")
    if not folder.is_dir():
        print(f"폴더 없음: {folder}", file=sys.stderr)
        sys.exit(2)

    images = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    if not images:
        print(f"이미지 없음: {folder}\n  → 영수증 5장을 위 폴더에 넣고 다시 실행하세요.")
        sys.exit(0)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )

    results = []
    fail = 0
    for path in images:
        print(f"\n=== {path.name} ===")
        try:
            data = claude_ocr.ocr_with_retry(str(path), retries=1)
            print(json.dumps(data, ensure_ascii=False, indent=2))
            results.append({"file": path.name, **data})
        except Exception as e:
            fail += 1
            print(f"[ERROR] {e}", file=sys.stderr)
            results.append({"file": path.name, "error": str(e)[:300]})

    out = folder / "_test_ocr_result.json"
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n결과 저장: {out}")
    print(f"성공 {len(results) - fail} / 실패 {fail}")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
