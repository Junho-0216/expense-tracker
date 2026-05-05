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
# 실 시트 헤더가 B부터 시작 (A 비어있음). 메타 컬럼은 N-Q에 위치.
COL_DATE = 1   # B (결제 날짜)
COL_VENDOR = 3 # D (품목)
COL_PAYER = 4  # E (결제자)
COL_ATTENDEE = 7  # H (이니셜)
COL_LINK = 8   # I (결제내역)
COL_MEETING = 9  # J (설명)
COL_STATUS = 13  # N (상태 — M="2열" 다음 빈 칸)
COL_FILE_ID = 14  # O (파일 ID)
COL_ERROR = 15  # P (에러)
COL_SUBMITTED = 16  # Q (제출시각)


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
        """헤더는 1행. 데이터는 2행부터. N='pending' 만 반환, Q 오름차순."""
        result = (
            self.svc.spreadsheets()
            .values()
            .get(
                spreadsheetId=self.sheet_id,
                range=self._range("A2:Q"),
                valueRenderOption="UNFORMATTED_VALUE",
            )
            .execute()
        )
        values = result.get("values", []) or []
        rows: List[PendingRow] = []
        for offset, row in enumerate(values):
            row_idx = offset + 2  # 시트 1-based, 헤더 제외 시작
            row = list(row) + [""] * (17 - len(row))
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
        # Q 오름차순 (제출 시각)
        rows.sort(key=lambda r: r.submitted_at or "")
        return rows

    def count_by_status(self) -> dict:
        """N열 status 카운트."""
        result = (
            self.svc.spreadsheets()
            .values()
            .get(
                spreadsheetId=self.sheet_id,
                range=self._range("N2:N"),
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
        """B/D/N/P 셀만 선택적으로 업데이트. batchUpdate."""
        data = []
        if date is not None:
            data.append({"range": self._range(f"B{row_idx}"), "values": [[date]]})
        if vendor is not None:
            data.append({"range": self._range(f"D{row_idx}"), "values": [[vendor]]})
        if status is not None:
            data.append({"range": self._range(f"N{row_idx}"), "values": [[status]]})
        if error is not None:
            data.append({"range": self._range(f"P{row_idx}"), "values": [[error]]})
        if not data:
            return
        self.svc.spreadsheets().values().batchUpdate(
            spreadsheetId=self.sheet_id,
            body={"valueInputOption": "RAW", "data": data},
        ).execute()
