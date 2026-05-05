# CLAUDE.md — Expense Tracker (비용기록 자동화)

> **v4 (FINAL).** Claude Code가 이 프로젝트에서 작업할 때 반드시 따라야 할 규칙. 매 세션 시작 시 이 파일을 먼저 읽으세요.

## 0. 절대 원칙 (Hard Rules)

1. **Anthropic API를 호출하는 코드를 절대 작성하지 마세요.** `anthropic` 패키지 import, `client.messages.create`, HTTP `api.anthropic.com` 직접 호출 — 모두 금지. OCR은 오로지 `subprocess.run(["claude", "-p", ...])`로만. 이유: Junho는 Claude Code Max 정액 사용자이며 핵심 제약은 **API 비용 0원**.
2. **사용자는 부재 중이라고 가정합니다.** 사소한 의사결정은 합리적 기본값으로 진행 후 `DECISION_LOG.md`에 1줄 기록.
3. **시크릿 하드코딩 금지.** Worker는 환경변수/Secret, Local admin은 `%APPDATA%\expense_tracker\sa.json` + `.env`. `.gitignore` 필수.
4. **실 시트에 쓰기 전 반드시 사본 시트로 검증.** target sheet ID: `1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA`. Phase 0~6은 사본, Phase 7에서만 실제 시트로 전환.
5. **24/7 폴링/큐 시스템 금지.** 처리 트리거는 두 가지뿐: (a) 매주 토요일 11시 Windows 작업 스케줄러 (b) admin 페이지 수동 버튼. cron, schedule 라이브러리, while-True 폴링 모두 금지.
6. **PIN 평문 저장 금지.** bcrypt 해시. KV에는 해시만.
7. **명단(`frontend/config.js`)은 동석자 List 표시 전용.** 회원가입을 제약하는 화이트리스트로 사용 금지.

## 1. 프로젝트 컨텍스트

- 50명이 이름 3글자 + PIN 4자리로 회원가입/로그인 → 영수증 이미지 + 동석자(A) + 회의(B) 제출
- 결제자(C)는 로그인 본인 이름이 자동 사용 (폼에 결제자 필드 없음)
- 동석자(A)는 **3섹션 UI**: 통합과학 칩 / 통합사회 칩 / 직접 입력. 세 섹션 동시 사용 가능, 콤마+공백으로 join하여 H열 1셀에 저장
- 매주 토요일 11:00 Windows 작업 스케줄러가 `admin.py --auto-run` 실행 → pending 일괄 OCR
- PC가 꺼져 있었으면 다음 부팅 후 자동 실행 (Start-when-available)
- 시트 구조: B=결제일시, D=업체명, E=결제자, H=동석자, I=Drive링크, J=회의, M=상태, N=파일ID, O=에러, P=제출시각
- 상세는 `PRD.md`

## 2. 디렉토리 구조

```
expense_tracker/
├── CLAUDE.md
├── PRD.md
├── PROGRESS.md
├── DECISION_LOG.md
├── frontend/
│   ├── index.html              # 폼 (로그인 후)
│   ├── login.html              # 로그인/회원가입
│   ├── app.js                  # 폼 로직 (칩 토글, 직접 입력 결합)
│   ├── auth.js                 # 회원가입/로그인/토큰
│   ├── style.css               # 칩 UI 반응형 그리드
│   └── config.js               # 명단 (통합과학/통합사회), Worker URL
├── worker/
│   ├── src/
│   │   ├── index.js            # 라우터
│   │   ├── auth.js             # signup/login/token
│   │   ├── submit.js           # /submit 핸들러
│   │   ├── google.js           # Drive/Sheets 클라이언트
│   │   └── kv.js               # KV 헬퍼
│   ├── wrangler.toml
│   ├── .dev.vars.example
│   └── README.md
├── admin/
│   ├── admin.py                # 진입점 (수동 + --auto-run)
│   ├── sheets_client.py
│   ├── drive_client.py
│   ├── claude_ocr.py
│   ├── templates/
│   │   └── dashboard.html
│   ├── static/
│   │   └── style.css
│   ├── setup_scheduler.ps1     # 작업 스케줄러 등록
│   ├── requirements.txt
│   ├── .env.example
│   └── README.md
└── tests/
    ├── sample_receipts/        # 영수증 5장
    └── test_ocr.py
```

## 3. 기술 스택 (확정)

| 영역 | 선택 |
|------|------|
| FE | Vanilla JS + HTML/CSS Grid |
| FE 호스팅 | GitHub Pages |
| BE | Cloudflare Workers + KV |
| 인증 | bcryptjs + Bearer 토큰 (랜덤 32바이트) |
| Drive/Sheets | Google Service Account |
| Admin App | Python Flask + threading |
| 진행률 | Polling 1초 |
| OCR | `claude -p` 서브프로세스 |
| 자동 실행 | Windows 작업 스케줄러 |

**금지 선택:**
- Anthropic SDK
- React/Next.js (Vanilla JS로 충분)
- Celery/RQ/Redis
- cron / schedule / APScheduler
- 24/7 백그라운드 데몬

## 4. 명단 데이터 (`frontend/config.js`)

```javascript
// frontend/config.js
export const WORKER_URL = "https://expense-tracker.<account>.workers.dev";

export const ATTENDEE_LIST = {
  "통합과학": [
    "김수빈", "조준호", "김태윤", "정종현", "정창민", "이준우", "이지훈",
    "주재우", "김은솔", "유시환", "박범준", "송명규", "이래헌", "장민준",
    "황희원", "김동환", "김준호", "변윤아", "성대욱", "이시은", "김재민",
    "신익순", "허윤정", "김도현", "김시윤", "전현수", "홍정원", "김용우",
    "백이안", "이승민", "김민성", "김한빈", "박규빈", "신재훈", "오윤아",
    "이지민", "이채민", "정준서", "최수혁", "안준혁", "장원준", "황세빈"
  ],
  "통합사회": [
    "김윤", "구민준", "제종영", "허윤정", "최여진", "변지인", "엄시우",
    "윤도현", "김태건", "유지우", "정아라", "오민석", "이정진", "장승우",
    "김승우"
  ]
};

export const MEETINGS = [
  "통합과학 정기 회의",
  "통합사회 정기 회의",
  "기타"
];
```

**주의:**
- 허윤정은 양쪽 모두에 의도적으로 존재. 중복 제거하지 말 것
- 명단 수정은 Junho가 이 파일을 직접 편집 후 GitHub Pages 재배포

## 5. 동석자 칩 UI 구현 가이드

### 5.1 핵심 동작
- **선택 상태**는 JavaScript Set으로 관리 (`selectedAttendees = new Set()`)
- 칩 클릭 → Set에 add/delete 토글 → 칩 DOM의 `aria-pressed` + class 갱신
- 직접 입력 텍스트는 별도 `customInput` 변수
- 제출 시 최종 H열 값:
  ```javascript
  const finalAttendees = [
    ...Array.from(selectedAttendees),
    ...customInput.split(",").map(s => s.trim()).filter(Boolean)
  ].join(", ");
  ```

### 5.2 반응형 그리드 (필수 CSS)

```css
.attendee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
}

.chip {
  min-height: 44px;          /* 모바일 터치 영역 */
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: white;
  cursor: pointer;
  text-align: center;
  font-size: 14px;
  user-select: none;
  transition: all 0.15s;
}

.chip:hover { background: #f3f4f6; }

.chip[aria-pressed="true"] {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}

.chip[aria-pressed="true"]::before {
  content: "✓ ";
}

.attendee-section {
  margin-bottom: 16px;
}

.section-header {
  font-weight: 600;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
}

.attendee-preview {
  margin-top: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 14px;
}
```

### 5.3 접근성
- 칩은 `<button type="button" aria-pressed="false">` 사용 (a, div 금지)
- 키보드: Tab으로 순회, Space/Enter로 토글
- 스크린 리더: 섹션 헤더는 `<h3>`, 칩 그룹은 `role="group" aria-label="통합과학"`

### 5.4 명단 변경 시 자동 갱신
- `config.js`의 ATTENDEE_LIST를 import하여 동적으로 칩 생성
- 하드코딩된 칩 DOM 금지

## 6. `claude -p` OCR 통합

```python
# admin/claude_ocr.py
import subprocess, json, re

PROMPT_TEMPLATE = """다음 이미지 파일은 카드 결제 영수증입니다: {path}

이미지에서 두 가지 정보를 추출하여 JSON만 출력하세요.
스키마: {{"date": "YY.MM.DD", "vendor": "업체명"}}
규칙:
- date: 결제 일시. 연도 끝 2자리.월(2자리).일(2자리). 예: 25.11.03
- vendor: 결제 업체명. 카드사명/승인번호/금액은 제외.
- 코드펜스나 설명 없이 JSON 한 줄만 출력하세요.
- 판독 불가 항목은 빈 문자열 ""로.
"""

def ocr_receipt(image_path: str) -> dict:
    prompt = PROMPT_TEMPLATE.format(path=image_path)
    result = subprocess.run(
        ["claude", "-p", prompt, "--dangerously-skip-permissions"],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed: {result.stderr[:500]}")
    raw = result.stdout.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    parsed = json.loads(raw)
    if not isinstance(parsed, dict) or "date" not in parsed or "vendor" not in parsed:
        raise ValueError(f"Invalid schema: {parsed}")
    return parsed
```

**Phase 4 시작 시 검증:**
- `claude --help`로 현재 버전 인자 형식 확인
- 이미지 경로를 프롬프트에 포함하면 Claude Code가 자동으로 읽는지 5건 샘플로 확인
- 안 읽히면 폴백 시도 후 결과를 `DECISION_LOG.md`에 기록

## 7. Admin App 구조

```python
# admin/admin.py 골자
import argparse, threading, webbrowser, time
from flask import Flask, jsonify, render_template

app = Flask(__name__)
state = {
    "lock": threading.Lock(),
    "progress": {"total": 0, "done": 0, "errors": []}
}

@app.route("/")
def dashboard(): return render_template("dashboard.html")

@app.route("/api/status")
def status():
    counts = sheets.count_by_status()
    last_auto = read_last_auto_run()
    return jsonify({**counts, "last_auto_run": last_auto})

@app.route("/api/process", methods=["POST"])
def process():
    if not state["lock"].acquire(blocking=False):
        return jsonify({"error": "already running"}), 409
    threading.Thread(target=run_batch, daemon=True).start()
    return jsonify({"started": True})

@app.route("/api/progress")
def progress(): return jsonify(state["progress"])

def run_batch(auto_mode=False):
    try:
        rows = sheets.get_pending_rows()
        state["progress"] = {"total": len(rows), "done": 0, "errors": []}
        for row in rows:
            try:
                img = drive.download(row.file_id)
                ocr = claude_ocr.ocr_receipt(img)
                sheets.update_row(row.idx, date=ocr["date"], vendor=ocr["vendor"], status="done")
            except Exception as e:
                sheets.update_row(row.idx, status="error", error=str(e)[:200])
                state["progress"]["errors"].append({"row": row.idx, "msg": str(e)[:200]})
            state["progress"]["done"] += 1
            time.sleep(1)
        if auto_mode:
            write_last_auto_run({
                "ran_at": now_iso(),
                "total": state["progress"]["total"],
                "errors": len(state["progress"]["errors"])
            })
    finally:
        state["lock"].release()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--auto-run", action="store_true")
    args = parser.parse_args()
    if args.auto_run:
        run_batch(auto_mode=True)
        return
    threading.Timer(1.0, lambda: webbrowser.open("http://localhost:8765")).start()
    app.run(host="127.0.0.1", port=8765, debug=False)

if __name__ == "__main__":
    main()
```

## 8. Cloudflare Worker 인증 패턴

```javascript
// worker/src/auth.js 골자
import bcrypt from "bcryptjs";

export async function signup(env, name, pin) {
  if (!/^[\p{L}\p{N}]{3}$/u.test(name)) throw new Error("이름은 3글자");
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN은 숫자 4자리");
  const exists = await env.KV.get(`user:${name}`);
  if (exists) throw new Error("이미 사용 중인 이름");
  const hash = await bcrypt.hash(pin, 10);
  await env.KV.put(`user:${name}`, JSON.stringify({pin_hash: hash, created_at: Date.now()}));
  return await issueToken(env, name);
}

export async function login(env, name, pin) {
  const rec = await env.KV.get(`user:${name}`, "json");
  if (!rec) throw new Error("이름 또는 PIN이 잘못됨");
  const ok = await bcrypt.compare(pin, rec.pin_hash);
  if (!ok) { await incFailCounter(env, name); throw new Error("이름 또는 PIN이 잘못됨"); }
  return await issueToken(env, name);
}

async function issueToken(env, name) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await env.KV.put(`token:${token}`, JSON.stringify({name, expires_at: Date.now() + 30*86400*1000}),
                   {expirationTtl: 30 * 86400});
  return token;
}

export async function verifyToken(env, token) {
  if (!token) return null;
  const rec = await env.KV.get(`token:${token}`, "json");
  if (!rec || rec.expires_at < Date.now()) return null;
  return rec.name;
}
```

## 9. Windows 작업 스케줄러 (`setup_scheduler.ps1`)

```powershell
$TaskName = "ExpenseTracker_AutoRun"
$PythonExe = (Get-Command pythonw.exe).Source  # 자동 탐지
$Script = "$PSScriptRoot\admin.py"

$Action = New-ScheduledTaskAction -Execute $PythonExe -Argument "`"$Script`" --auto-run"
$Trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At 11:00am
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
    -Settings $Settings -RunLevel Limited -Force
```

**주의:**
- `RunLevel Limited` (관리자 권한 불필요)
- `pythonw.exe`로 콘솔 창 미표시
- 검증: `Get-ScheduledTask -TaskName "ExpenseTracker_AutoRun"`

## 10. 코딩 스타일

- **언어**: 코드/주석/JSON 키는 영어, 사용자 노출 텍스트는 한국어
- **에러 처리**: 모든 외부 호출에 try/except. 한 행 실패해도 다음 진행
- **로깅**: Python `logging`, Worker `console.log`, timestamp 포함
- **시크릿**: `.gitignore`에 `.env`, `sa.json`, `.dev.vars` 등록
- **의존성**: admin은 `flask`, `google-api-python-client`, `google-auth`, `python-dotenv`만
- **Python**: 3.11+
- **Node**: Cloudflare Workers 기본 (V8 isolate)

## 11. Git 커밋 전략

- Phase 단위 커밋 + PROGRESS.md 갱신
- 메시지: `[Phase N] 짧은 영문 요약`
- 커밋 전: `git diff --cached | grep -iE "(api[_-]?key|secret|token|private[_-]?key|BEGIN.*PRIVATE|pin_hash)"` 자동 검사

## 12. 작업 시작 체크리스트

1. `CLAUDE.md` (이 파일) 읽기
2. `PROGRESS.md`로 현재 단계 확인
3. `DECISION_LOG.md`로 과거 결정 사항 확인
4. 진행 → 완료 시 `PROGRESS.md` 갱신 + 커밋

## 13. 자율 결정 기본값

| 상황 | 기본 결정 |
|------|----------|
| FE 디자인 톤 | 흰 배경, 큰 버튼, 모바일 우선, 한국어 |
| Admin 포트 | 8765 (충돌 시 8766, 8767…) |
| 진행률 polling | 1초 |
| 자동 OCR 재시도 | 2회 → error 확정 |
| 이미지 압축 | FE에서 2048px 장변 |
| 파일명 | `<timestamp>_<name>_<random4>.<ext>` |
| 회의명 J열 | "통합과학 정기 회의" / "통합사회 정기 회의" 그대로 |
| "기타" J열 | 사용자 입력 그대로 (접두어 없이) |
| 동석자 H열 | 콤마+공백 join한 단일 문자열 |
| 빈 OCR 결과 | B/D 빈칸 유지, M="done" |
| OCR sleep | 1초 |
| 토큰 만료 | 30일 |
| name 정규식 | `^[\p{L}\p{N}]{3}$` (한글/영문/숫자 3글자) |
| PIN 정규식 | `^\d{4}$` |
| 1배치 최대 처리 | 제한 없음 |
| 칩 그리드 minmax | `minmax(80px, 1fr)` |
| 칩 터치 최소 높이 | 44px |
| 섹션 기본 상태 | 펼침 |

## 14. 절대 하지 말 것

- ❌ Anthropic API 호출 (`anthropic` 패키지, HTTP, SDK)
- ❌ 시트 ID/SA 키/PIN을 FE나 GitHub에 노출
- ❌ 실 [비용기록] 시트에서 첫 테스트
- ❌ cron / systemd / schedule (오직 Windows 작업 스케줄러)
- ❌ Redis/Celery
- ❌ 사용자에게 묻기 위해 멈추기
- ❌ Admin을 외부 노출 (반드시 127.0.0.1)
- ❌ PIN 평문 저장
- ❌ FE에서 Drive/Sheets API 직접 호출 (반드시 Worker 경유)
- ❌ name을 토큰처럼 사용 (Bearer 토큰 검증 필수)
- ❌ 명단을 회원가입 화이트리스트로 사용 (표시 전용)
- ❌ 칩 UI에 고정 너비 (`width: 100px` 등) — 반드시 grid auto-fit
- ❌ 동석자 칩을 `<a>` 또는 `<div>` (반드시 `<button type="button">`)

## 15. 참고 링크

- Target Sheet: `https://docs.google.com/spreadsheets/d/1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA/edit?gid=249292790#gid=249292790`
- Google Sheets API: https://developers.google.com/sheets/api
- Google Drive API: https://developers.google.com/drive/api
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare KV: https://developers.cloudflare.com/kv/
- Windows Task Scheduler: https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/
- Claude Code CLI: https://docs.claude.com/en/docs/claude-code
- CSS Grid auto-fit: https://developer.mozilla.org/en-US/docs/Web/CSS/repeat
