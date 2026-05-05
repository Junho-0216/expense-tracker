# 생성: 2026-05-04
"""Google Drive 클라이언트 — fileId로 임시 다운로드."""

from __future__ import annotations

import io
import os
import tempfile
from typing import Tuple

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def _service(sa_path: str):
    creds = service_account.Credentials.from_service_account_file(
        sa_path, scopes=SCOPES
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


class DriveClient:
    def __init__(self, sa_path: str):
        self.svc = _service(sa_path)

    def get_metadata(self, file_id: str) -> dict:
        return (
            self.svc.files()
            .get(fileId=file_id, fields="id,name,mimeType,size", supportsAllDrives=True)
            .execute()
        )

    def download_to_temp(self, file_id: str) -> Tuple[str, dict]:
        """임시 파일로 다운로드. (path, metadata) 반환. 호출자가 path 삭제."""
        meta = self.get_metadata(file_id)
        name = meta.get("name", f"{file_id}.bin")
        # 안전한 파일명만 (영문, 숫자, _, -, .만 허용 — 한글 파일명 임시 회피)
        safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)
        # 임시 디렉토리에 fileId prefix를 붙여 충돌 방지
        tmp_dir = tempfile.mkdtemp(prefix="et_ocr_")
        path = os.path.join(tmp_dir, safe)
        request = self.svc.files().get_media(fileId=file_id, supportsAllDrives=True)
        buf = io.FileIO(path, "wb")
        try:
            downloader = MediaIoBaseDownload(buf, request, chunksize=1024 * 1024)
            done = False
            while not done:
                _status, done = downloader.next_chunk()
        finally:
            buf.close()
        return path, meta
