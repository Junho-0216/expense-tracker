# 셋업 가이드 — Junho 단계별 작업

> 생성: 2026-05-04
>
> 코드는 모두 작성 + 의존성 설치 완료. 아래 순서대로 진행하세요.

## 사전 점검 ✅ (이미 완료됨)

- ✅ `worker/node_modules/` (bcryptjs + wrangler 설치됨)
- ✅ `admin/.venv/` (Flask + Google API libs 설치됨)
- ✅ `admin/.env` 생성됨 (placeholder — STEP 4에서 채움)
- ✅ `worker/.dev.vars` 생성됨 (placeholder — STEP 4에서 채움)
- ✅ `%APPDATA%\expense_tracker\` + `logs\` 디렉토리 생성됨
- ✅ `claude` CLI 동작 확인 (v2.1.126)

---

## STEP 1 — Google Cloud 셋업 (사람이 해야 함, ~10분)

### 1-1. 프로젝트 + API 활성화
1. https://console.cloud.google.com 접속
2. 상단 프로젝트 선택 → **새 프로젝트** → 이름: `expense-tracker` → 만들기
3. 좌측 메뉴 → **API 및 서비스 → 라이브러리**
4. 다음 두 API를 검색해서 각각 **사용 설정**:
   - `Google Drive API`
   - `Google Sheets API`

### 1-2. Service Account 생성
1. 좌측 메뉴 → **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**
2. 이름: `expense-tracker-sa` → 만들기 → 역할은 비워두고 완료
3. 만들어진 서비스 계정 행 클릭 → **키 → 키 추가 → 새 키 만들기 → JSON → 만들기**
4. 다운로드된 JSON 파일을 다음 위치로 옮기기:
   ```powershell
   # PowerShell (다운로드 폴더에서 실행)
   Move-Item "$env:USERPROFILE\Downloads\expense-tracker-*.json" "$env:APPDATA\expense_tracker\sa.json"
   ```
5. **SA 이메일 메모해 두기**: JSON 파일에서 `client_email` 필드의 값
   - 예: `expense-tracker-sa@expense-tracker.iam.gserviceaccount.com`

### 1-3. 검증
```powershell
# SA 파일 존재 확인
Test-Path "$env:APPDATA\expense_tracker\sa.json"   # → True 떠야 함

# client_email 추출
(Get-Content "$env:APPDATA\expense_tracker\sa.json" | ConvertFrom-Json).client_email
```

---

## STEP 2 — 사본 시트 + Drive 폴더 (사람이 해야 함, ~5분)

### 2-1. 시트 사본
1. 실 [비용기록] 시트 열기:
   https://docs.google.com/spreadsheets/d/1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA/edit
2. **파일 → 사본 만들기** → 이름: `[테스트] 비용기록` → 사본 만들기
3. 만들어진 사본의 URL에서 **시트 ID**를 추출:
   - URL: `https://docs.google.com/spreadsheets/d/▮▮▮ID여기▮▮▮/edit#gid=...`
   - 가운데 ID 부분(보통 44자) 메모

### 2-2. SA에게 사본 시트 공유
1. 사본 시트 우상단 **공유** 클릭
2. STEP 1-2에서 메모한 SA 이메일 입력 → **편집자** → 보내기
3. (선택) "이메일 보내기" 체크 해제

### 2-3. 시트 탭 이름 확인
- 사본 시트 하단 탭 이름 (예: `Sheet1`, `시트1`, `2025` 등)을 메모
- 한글이어도 OK

### 2-4. Drive 폴더 생성
1. https://drive.google.com 접속 → **새로 만들기 → 폴더** → 이름: `비용기록_업로드`
2. 만들어진 폴더 우클릭 **공유** → SA 이메일 추가 → **편집자**
3. 폴더 진입 후 URL에서 **폴더 ID** 추출:
   - URL: `https://drive.google.com/drive/folders/▮▮▮폴더ID▮▮▮`

### 2-5. 메모 정리 (다음 단계에서 사용)
```
SHEET_ID         = (STEP 2-1)
SHEET_TAB        = (STEP 2-3, 예: Sheet1)
DRIVE_FOLDER_ID  = (STEP 2-4)
```

---

## STEP 3 — admin/.env 채우기 (1분)

`admin/.env` 파일을 메모장으로 열어서 STEP 2-5의 값으로 교체:
```dotenv
SHEET_ID=▮STEP 2-1 값▮
SHEET_TAB=▮STEP 2-3 값▮
DRIVE_FOLDER_ID=▮STEP 2-4 값▮
```

저장 후 **로컬에서 admin 동작 확인**:
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\admin"
.\.venv\Scripts\Activate.ps1
python admin.py
```
→ 브라우저가 자동으로 http://127.0.0.1:8765 를 엽니다.
→ 대시보드에 `pending: 0 / done: 0 / error: 0` 카운트가 보이면 성공.
→ 종료는 PowerShell 창에서 Ctrl+C.

⚠️ 만약 "SA 키 파일 없음" 또는 "403" 에러가 보이면 STEP 1-2 / 2-2 점검.

---

## STEP 4 — Cloudflare 셋업 (사람이 해야 함, ~10분)

### 4-1. 계정 + 로그인
1. https://dash.cloudflare.com 가입 (무료)
2. 터미널에서:
   ```powershell
   cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\worker"
   npx wrangler login
   ```
   브라우저가 열리고 권한 허용 → 터미널에 `Successfully logged in.` 뜨면 성공.

### 4-2. KV 네임스페이스 생성
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\worker"
npx wrangler kv namespace create expense-tracker-kv
npx wrangler kv namespace create expense-tracker-kv --preview
```
출력 예:
```
{ binding = "KV", id = "abc123def456..." }
{ binding = "KV", preview_id = "xyz789..." }
```

`worker/wrangler.toml` 파일을 열어 `REPLACE_WITH_KV_ID` / `REPLACE_WITH_KV_PREVIEW_ID` 부분을 위 출력값으로 교체:
```toml
[[kv_namespaces]]
binding = "KV"
id = "abc123def456..."        # ← 첫 번째 명령 출력
preview_id = "xyz789..."      # ← 두 번째 명령 출력
```

### 4-3. Secrets 등록
다음 3개를 한 번에 등록 (각 명령 실행 후 값 paste):

```powershell
# 1) SA JSON 전체를 paste (PowerShell에서 한 줄)
Get-Content "$env:APPDATA\expense_tracker\sa.json" -Raw | npx wrangler secret put GOOGLE_SA_JSON

# 2) 시트 ID
"▮STEP 2-1 값▮" | npx wrangler secret put SHEET_ID

# 3) Drive 폴더 ID
"▮STEP 2-4 값▮" | npx wrangler secret put DRIVE_FOLDER_ID
```

⚠️ 첫 번째 명령은 SA JSON 파일을 그대로 stdin으로 주입합니다. 따옴표 없이 통째로 들어가야 합니다.

### 4-4. 시트 탭 이름 (필요 시)
기본값은 `Sheet1`. 사본 시트 탭이 다르면 `wrangler.toml` 의 `[vars]` 에서 수정:
```toml
[vars]
SHEET_TAB = "시트1"   # 한글이면 따옴표 필수
```

---

## STEP 5 — Worker 로컬 테스트 (3분)

### 5-1. .dev.vars 채우기
`worker/.dev.vars` 파일을 열어 채움 (방금 등록한 secrets와 동일한 값):
```dotenv
GOOGLE_SA_JSON='{"type":"service_account",...,"private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}'
SHEET_ID="▮STEP 2-1 값▮"
DRIVE_FOLDER_ID="▮STEP 2-4 값▮"
```

PowerShell로 자동 채우기 (편함):
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\worker"
$sa = (Get-Content "$env:APPDATA\expense_tracker\sa.json" -Raw).Trim()
$sa = $sa -replace "`r`n","\n" -replace "`n","\n"
$content = "GOOGLE_SA_JSON='$sa'`nSHEET_ID=""▮STEP 2-1 값▮""`nDRIVE_FOLDER_ID=""▮STEP 2-4 값▮"""
Set-Content -Path .dev.vars -Value $content -Encoding utf8
```

### 5-2. dev 서버 기동
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\worker"
npx wrangler dev
```
→ http://127.0.0.1:8787 에서 동작.

### 5-3. health check
다른 PowerShell에서:
```powershell
curl http://127.0.0.1:8787/health
# {"ok":true,"service":"expense-tracker"}
```

dev 서버 종료: `q` 입력 또는 Ctrl+C.

---

## STEP 6 — Worker 배포 (2분)

```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\worker"
npx wrangler deploy
```
출력 끝부분에 배포 URL이 표시됨:
```
Published expense-tracker
  https://expense-tracker.<your-account>.workers.dev
```
이 URL을 메모.

---

## STEP 7 — Frontend 셋업 (5분)

### 7-1. WORKER_URL 반영
`frontend/config.js` 파일 첫 줄을 STEP 6에서 얻은 URL로 교체:
```javascript
export const WORKER_URL = "https://expense-tracker.<your-account>.workers.dev";
```

### 7-2. CORS allowlist 갱신 (배포 URL 알 게 된 후)
GitHub Pages URL이 `https://junho000216.github.io` 라면 `worker/wrangler.toml` 의:
```toml
[vars]
CORS_ORIGIN = "https://junho000216.github.io"
```
이미 그 값으로 설정됨. 만약 다른 도메인을 쓴다면 변경 후:
```powershell
cd worker
npx wrangler deploy   # 재배포
```

### 7-3. GitHub Pages 배포 (선택지 2개 중 택1)

**옵션 A — 새 GitHub repo 만들기**:
1. https://github.com/new → 이름: `expense-tracker` → Public → Create
2. 로컬에서:
   ```powershell
   cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트"
   git init   # 이미 init 되어 있으면 skip
   git remote add origin https://github.com/junho000216/expense-tracker.git
   git checkout -b main
   git add frontend/ .gitignore PRD.md CLAUDE.md PROGRESS.md DECISION_LOG.md SETUP.md worker/ admin/ tests/
   git commit -m "[Phase 1-5] expense tracker initial"
   git push -u origin main
   ```
3. GitHub repo → **Settings → Pages**
4. **Source: Deploy from a branch** → Branch: `main` → `/frontend` 선택 → Save
5. 1~2분 후 `https://junho000216.github.io/expense-tracker/` 에서 확인

**옵션 B — 로컬 테스트만**:
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\frontend"
python -m http.server 5500
# http://127.0.0.1:5500/login.html 접속
```
⚠️ Worker의 `CORS_ORIGIN` 을 `http://127.0.0.1:5500` 으로 임시 변경 + 재배포 필요.

### 7-4. E2E 테스트
1. 브라우저에서 `https://.../login.html` 접속
2. 회원가입: 이름 3글자 + PIN 4자리
3. 폼에서 영수증 1장 + 동석자 1명 + 회의 선택 → 제출
4. 사본 시트에 새 행이 추가되었는지 확인 (M열 = `pending`)

---

## STEP 8 — OCR 검증 (5분)

영수증 사진 5장을 `tests/sample_receipts/` 에 복사:
```powershell
Copy-Item "C:\path\to\receipts\*.jpg" "C:\Users\J\Desktop\팀비 청구 자동화 사이트\tests\sample_receipts\"
```

테스트 실행:
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트"
admin\.venv\Scripts\Activate.ps1
python tests\test_ocr.py
```
→ `tests/sample_receipts/_test_ocr_result.json` 에 결과 누적.
→ `{"date": "25.11.03", "vendor": "스타벅스 강남점"}` 같은 JSON이 5건 나오면 성공.

문제 발생 시:
- `claude CLI 실패`: `claude --help` 단독 실행 확인
- `JSON을 찾지 못했습니다`: claude 응답 형식 변경. `admin/claude_ocr.py` 의 PROMPT_TEMPLATE 조정 필요. DECISION_LOG.md에 기록.

---

## STEP 9 — Admin 일괄 처리 검증 (5분)

```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\admin"
.\.venv\Scripts\Activate.ps1
python admin.py
```
→ http://127.0.0.1:8765 자동으로 열림.
→ STEP 7-4에서 제출한 행이 `pending` 으로 표시.
→ **[지금 일괄 처리]** 클릭.
→ 진행률 100% 후 사본 시트의 B(결제일시), D(업체명) 칸이 채워지고 M열이 `done` 으로 바뀜.

---

## STEP 10 — Windows 작업 스케줄러 등록 (1분)

```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\admin"
.\setup_scheduler.ps1
```
출력에 `[OK] 작업 등록 완료` 가 뜨면 성공.

검증:
```powershell
Get-ScheduledTask -TaskName "ExpenseTracker_AutoRun"
Get-ScheduledTaskInfo -TaskName "ExpenseTracker_AutoRun"
```

수동 트리거 테스트:
```powershell
Start-ScheduledTask -TaskName "ExpenseTracker_AutoRun"
# 로그 확인:
Get-ChildItem "$env:APPDATA\expense_tracker\logs\" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

---

## STEP 11 — 실 [비용기록] 시트로 전환 (Phase 7, 2분)

테스트가 모두 통과하면 사본 → 실 시트로 한 번만 전환.

### 11-1. SA에 실 시트 공유
실 시트 https://docs.google.com/spreadsheets/d/1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA/edit
→ **공유** → SA 이메일 → **편집자**

### 11-2. Worker secret 갱신
```powershell
cd "C:\Users\J\Desktop\팀비 청구 자동화 사이트\worker"
"1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA" | npx wrangler secret put SHEET_ID
npx wrangler deploy
```
실 시트 탭 이름이 `Sheet1` 이 아니면 `wrangler.toml` 의 `SHEET_TAB` 도 수정 후 재배포.

### 11-3. admin/.env 갱신
```dotenv
SHEET_ID=1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA
SHEET_TAB=▮실 시트 탭 이름▮
```

### 11-4. 친구들에게 URL 공유
GitHub Pages URL을 50명에게 전파.

---

## STEP 12 — 운영 (지속)

- 매주 토요일 11:00 자동 처리. PC 꺼져 있어도 다음 부팅 시 실행.
- 수동: `python admin.py` → [지금 일괄 처리]
- 명단 변경: `frontend/config.js` 직접 편집 → `git push` (GitHub Pages 자동 재배포)
- PIN 분실: KV에서 사용자 항목 삭제
  ```powershell
  cd worker
  npx wrangler kv key delete --binding=KV "user:김수빈" --remote
  ```

---

## 문제 해결

| 증상 | 원인 / 조치 |
|------|------|
| FE 회원가입 시 CORS 에러 | `worker/wrangler.toml` 의 `CORS_ORIGIN` 이 FE 도메인과 일치하는지 확인 후 재배포 |
| `이미 사용 중인 이름` (자기 가입한 이름인데) | KV에서 항목 삭제 후 재가입 |
| Drive 업로드 403 | SA 이메일이 Drive 폴더에 편집자로 공유되어 있는지 |
| Sheets append 403 | SA 이메일이 시트에 편집자로 공유되어 있는지 |
| OCR 결과가 빈 칸 (M=done인데 B/D 비어있음) | 영수증이 흐릿하거나 형식이 특이. 시트에서 수동 입력 |
| 작업 스케줄러 실행 안 됨 | `Get-ScheduledTaskInfo -TaskName ExpenseTracker_AutoRun` 의 LastTaskResult 확인 |
| `KV not found` 에러 | `wrangler.toml` 의 KV id가 실제 id로 교체되어 있는지 |
| 친구가 회원가입 안 됨 | name 정규식 `^[\p{L}\p{N}]{3}$` (3글자 한글/영문/숫자만). 4글자 이름은 불가 |

---

## 빠른 참조 — 한 페이지 요약

```
STEP 1: GCP 프로젝트 + Drive/Sheets API + SA → sa.json → %APPDATA%\expense_tracker\sa.json
STEP 2: 사본 시트 + Drive 폴더 → SA에 둘 다 편집자 공유 → ID 메모
STEP 3: admin/.env 채움 → python admin.py로 동작 확인
STEP 4: Cloudflare 가입 + wrangler login + KV 생성 + 3개 secret 등록
STEP 5: wrangler dev로 로컬 테스트
STEP 6: wrangler deploy
STEP 7: frontend/config.js의 WORKER_URL 갱신 → GitHub Pages 배포
STEP 8: 영수증 5장으로 OCR 단독 테스트
STEP 9: 한 번 제출 후 admin 대시보드에서 일괄 처리 검증
STEP 10: setup_scheduler.ps1 실행
STEP 11: SHEET_ID를 실 시트로 교체 + 재배포
STEP 12: 친구들에게 URL 공유 + 매주 토요일 자동 처리
```
