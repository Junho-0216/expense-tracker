# 생성: 2026-05-04
"""Google Sheets 클라이언트 — pending 행 조회 / 업데이트."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# 컬럼 인덱스 (0-based, A=0)
COL_DATE = 1   # B
COL_VENDOR = 3 # D
COL_PAYER = 4  # E
COL_ATTENDEE = 7  # H
COL_LINK = 8   # I
COL_MEETING = 9  # J
COL_STATUS = 12  # M
COL_FILE_ID = 13  # N
COL_ERROR = 14  # O
COL_SUBMITTED = 15  # P


@dataclass
class PendingRow:
    row_idx: int  # 1-based 시트 행 번호 (헤더 포함)
    file_id: str
    payer: str
    attendee: str
    submitted_at: str


def _service(sa_path: str):
    creds = service_account.Credentials.from_service_account_file(
        sa_path, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


class SheetsClient:
    def __init__(self, sheet_id: str, sa_path: str, tab: str = "Sheet1"):
        self.sheet_id = sheet_id
        self.tab = tab
        self.svc = _service(sa_path)

    def _range(self, a1: str) -> str:
        return f"'{self.tab}'!{a1}"

    def get_pending_rows(self) -> List[PendingRow]:
        """헤더는 1행. 데이터는 2행부터. M='pending' 만 반환, P 오름차순."""
        result = (
            self.svc.spreadsheets()
            .values()
            .get(
                spreadsheetId=self.sheet_id,
                range=self._range("A2:P"),
                valueRenderOption="UNFORMATTED_VALUE",
            )
            .execute()
        )
        values = result.get("values", []) or []
        rows: List[PendingRow] = []
        for offset, row in enumerate(values):
            row_idx = offset + 2  # 시트 1-based, 헤더 제외 시작
            row = list(row) + [""] * (16 - len(row))
            status = (row[COL_STATUS] or "").strip()
            if status != "pending":
                continue
            rows.append(
                PendingRow(
                    row_idx=row_idx,
                    file_id=str(row[COL_FILE_ID] or "").strip(),
                    payer=str(row[COL_PAYER] or "").strip(),
                    attendee=str(row[COL_ATTENDEE] or "").strip(),
                    submitted_at=str(row[COL_SUBMITTED] or "").strip(),
                )
            )
        # P 오름차순 (제출 시각)
        rows.sort(key=lambda r: r.submitted_at or "")
        return rows

    def count_by_status(self) -> dict:
        """M열 status 카운트."""
        result = (
            self.svc.spreadsheets()
            .values()
            .get(
                spreadsheetId=self.sheet_id,
                range=self._range("M2:M"),
            )
            .execute()
        )
        values = result.get("values", []) or []
        counts = {"pending": 0, "done": 0, "error": 0, "other": 0}
        for v in values:
            s = (v[0] if v else "").strip()
            if s in counts:
                counts[s] += 1
            elif s:
                counts["other"] += 1
        return counts

    def update_row(
        self,
        row_idx: int,
        *,
        date: str | None = None,
        vendor: str | None = None,
        status: str | None = None,
        error: str | None = None,
    ) -> None:
        """B/D/M/O 셀만 선택적으로 업데이트. batchUpdate."""
        data = []
        if date is not None:
            data.append({"range": self._range(f"B{row_idx}"), "values": [[date]]})
        if vendor is not None:
            data.append({"range": self._range(f"D{row_idx}"), "values": [[vendor]]})
        if status is not None:
            data.append({"range": self._range(f"M{row_idx}"), "values": [[status]]})
        if error is not None:
            data.append({"range": self._range(f"O{row_idx}"), "values": [[error]]})
        if not data:
            return
        self.svc.spreadsheets().values().batchUpdate(
            spreadsheetId=self.sheet_id,
            body={"valueInputOption": "RAW", "data": data},
        ).execute()
