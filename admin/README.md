# Local Admin (Flask) — Expense Tracker

> 생성: 2026-05-04
>
> 매주 토요일 11시 또는 수동 클릭으로 pending 영수증을 일괄 OCR + 시트 갱신.

## 사전 준비

1. **Python 3.11+** 설치 (`python --version`)
2. **claude CLI** 가 PATH에 있어야 함 (`claude --help`)
3. **Service Account JSON** → `%APPDATA%\expense_tracker\sa.json` 위치
   - PowerShell:
     ```powershell
     New-Item -ItemType Directory -Force "$env:APPDATA\expense_tracker"
     Copy-Item "C:\path\to\downloaded\sa.json" "$env:APPDATA\expense_tracker\sa.json"
     ```
4. SA 이메일을 **사본 시트** + **Drive 폴더**에 편집자 공유

## 설치

```powershell
cd admin
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

Copy-Item env.example .env
# .env 파일을 열어 SHEET_ID, SHEET_TAB, DRIVE_FOLDER_ID 채움
```

## 수동 실행 (대시보드)

```powershell
python admin.py
# → http://127.0.0.1:8765 자동으로 브라우저 오픈
```

대시보드에서:
- 현재 시트의 pending/done/error 카운트
- "지금 일괄 처리" 버튼
- 진행률 (1초 폴링)
- 마지막 자동 실행 결과

## 자동 실행 등록

```powershell
.\setup_scheduler.ps1
```

매주 토요일 11:00 `admin.py --auto-run` 실행. PC가 꺼져 있었으면 Start-when-available로 다음 부팅 시 실행.

검증:
```powershell
Get-ScheduledTask -TaskName "ExpenseTracker_AutoRun"
Get-ScheduledTaskInfo -TaskName "ExpenseTracker_AutoRun"
```

수동 트리거:
```powershell
Start-ScheduledTask -TaskName "ExpenseTracker_AutoRun"
```

## 로그/상태 위치

- `%APPDATA%\expense_tracker\sa.json` — SA 키
- `%APPDATA%\expense_tracker\logs\auto_run_<ts>.log` — 자동 실행 로그
- `%APPDATA%\expense_tracker\last_auto_run.json` — 마지막 자동 실행 요약 (대시보드 표시)

## OCR 단독 테스트

```powershell
python claude_ocr.py "C:\path\to\receipt.jpg"
# {"date": "25.11.03", "vendor": "스타벅스 강남점"}
```

## Phase 7 전환 (실 시트로)

1. `.env` 의 `SHEET_ID` 를 실 시트 ID(`1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA`)로 교체
2. SA 이메일을 실 시트에 편집자 공유
3. Worker 측도 `wrangler secret put SHEET_ID` 후 재배포 (`worker/README.md` 참고)

## 트러블슈팅

| 증상 | 원인 / 조치 |
|------|------|
| `SA 키 파일 없음` | `%APPDATA%\expense_tracker\sa.json` 경로 확인 |
| `Sheets append 실패 (403)` | SA 이메일이 시트에 편집자 공유되어 있는지 확인 |
| `claude CLI를 찾을 수 없습니다` | `claude --help` 동작 확인. PATH 점검 |
| `JSON 객체를 찾지 못했습니다` | claude 응답 형식 변경. `logs/auto_run_*.log` 확인 후 `claude_ocr.py` 프롬프트 조정 |
| 작업 스케줄러 실행 안 됨 | `Get-ScheduledTaskInfo -TaskName ExpenseTracker_AutoRun` 의 LastTaskResult 확인 |
| `이미 실행 중입니다 (409)` | 다른 처리 중. 잠시 대기 |
