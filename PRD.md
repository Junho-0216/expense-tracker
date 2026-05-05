# PRD: 비용기록 자동화 웹앱 (Expense Tracker)

> **v4 (FINAL)** — 동석자 명단 2섹션 분리 + 칩 UI + 직접 입력 + 회원가입 제약 없음

## 1. 배경 및 목표

| 항목 | 내용 |
|------|------|
| 목적 | 사용자들이 카드 결제 영수증 이미지를 제출 → Junho PC에서 매주 토요일 11시 자동(또는 수동) 일괄 OCR → [비용기록] Sheets 기록 |
| 비용 제약 | **Anthropic API 호출 없음.** OCR은 Claude Code Max 정액 토큰 (`claude -p` 서브프로세스) |
| 운영 규모 | 동시 접속 ~50명, 일 제출 추정 ~50~200건 |
| 처리 방식 | **배치.** ① 매주 토요일 11시 자동 (PC 꺼져 있었으면 다음 켜질 때) ② Admin 페이지 [지금 처리] 수시 |
| 인증 | 이름 3글자 + 4자리 PIN 회원가입/로그인 (화이트리스트 없음, 누구나 가입 가능) |
| 대상 시트 | `https://docs.google.com/spreadsheets/d/1fWogSFD677k_RVklkXUUwHh5uiBpGRDEmBUv8JfKKIA/edit?gid=249292790#gid=249292790` |

## 2. 명단 (참조용 — 동석자 List 표시 전용)

### 통합과학 (42명)
김수빈, 조준호, 김태윤, 정종현, 정창민, 이준우, 이지훈, 주재우, 김은솔, 유시환, 박범준, 송명규, 이래헌, 장민준, 황희원, 김동환, 김준호, 변윤아, 성대욱, 이시은, 김재민, 신익순, 허윤정, 김도현, 김시윤, 전현수, 홍정원, 김용우, 백이안, 이승민, 김민성, 김한빈, 박규빈, 신재훈, 오윤아, 이지민, 이채민, 정준서, 최수혁, 안준혁, 장원준, 황세빈

### 통합사회 (15명)
김윤, 구민준, 제종영, 허윤정, 최여진, 변지인, 엄시우, 윤도현, 김태건, 유지우, 정아라, 오민석, 이정진, 장승우, 김승우

> 허윤정은 양쪽 모두에 표시 (중복 제거 안 함). 명단은 **동석자 List 표시 전용**이며, 회원가입을 제약하지 않음.

## 3. 사용자 시나리오

### 3.1 신규 사용자 (최초 1회)
1. URL 접속 → "회원가입" 클릭
2. 이름(3글자, 한글/영문/숫자) + PIN(숫자 4자리) 입력
3. 동일 이름 중복 시 거부
4. 가입 완료 → 자동 로그인

### 3.2 기존 사용자 (제출 흐름)
1. 미로그인이면 이름 + PIN 입력 → 로그인 (토큰 30일 유효)
2. 폼 화면에서 입력:
   - **이미지** (PC: 드래그앤드롭/파일선택, 모바일: 카메라/갤러리)
   - **A. 동석자**:
     - [통합과학] 섹션 — 42명이 칩(chip)으로 표시, 화면 크기에 따라 한 줄에 4~6명. **다중 선택 토글**
     - [통합사회] 섹션 — 15명이 동일한 칩 UI. **다중 선택 토글**
     - [이름 직접 쓰기] — 텍스트 input, 콤마로 구분된 자유 입력 ("거래처 김부장, 외부 강사")
     - 양쪽 섹션 + 직접 입력 모두 동시 사용 가능
     - 최종 H열 저장 형식: `김수빈, 조준호, 김윤, 거래처 김부장` (콤마+공백 구분)
   - **B. 회의**: 라디오 — 통합과학 정기 회의 / 통합사회 정기 회의 / 기타(주관식)
   - 결제자(C)는 폼에 없음 — 로그인 본인 이름 자동
3. [제출] 활성 조건: 이미지 + (동석자 1개 이상) + B
4. 제출 완료 메시지: "제출되었습니다. 영수증 인식은 매주 토요일 자동 처리됩니다."

### 3.3 Admin (Junho)
- **자동**: 매주 토요일 11:00 Windows 작업 스케줄러가 `admin.py --auto-run` 실행. PC가 11시에 꺼져 있었으면 다음 부팅 후 실행 (Start-when-available)
- **수동**: 언제든 PC에서 `http://localhost:8765`에서 [지금 일괄 처리] 클릭
- 에러 행: dashboard에 표시 → [재시도] 또는 [시트에서 수동 입력]

## 4. 시스템 아키텍처

```
[사용자 50명]
    │ 회원가입/로그인 → 이미지 + A,B 제출
    ▼
[FE: GitHub Pages 정적]
    │ POST /signup, /login, /submit
    ▼
[Cloudflare Worker (SA + KV)]
    │ - KV에 사용자 (name, pin_hash, token)
    │ - Drive 업로드 + Sheets append (결제자 = 로그인 이름)
    ▼
[Google Drive] + [Google Sheets: pending 누적, B/D 비어 있음]

  ── 매주 토요일 11:00 (또는 수동 클릭) ──

[Windows 작업 스케줄러 → admin.py 실행]
    │ 자동 모드: --auto-run → 즉시 일괄 처리 후 종료
    │ 수동 모드: 플래그 없음 → 브라우저 열고 dashboard 대기
    ▼
[Local Admin (Flask, 127.0.0.1:8765)]
    1) Sheets에서 status='pending' 행 조회
    2) 각 행: Drive 다운로드 → claude -p (OCR) → JSON 파싱
    3) Sheets B/D 업데이트, status='done' 또는 'error'
```

## 5. 기능 요구사항

### 5.1 사용자 인증 (FE + Worker)

| ID | 요구사항 |
|----|--------|
| AU-1 | `POST /signup` — body: `{name, pin}`. name 3글자, pin 4자리 숫자 |
| AU-2 | name 중복 시 409. 성공 시 `{token}` 반환 |
| AU-3 | `POST /login` — `{name, pin}` → `{token}` 또는 401 |
| AU-4 | PIN은 bcrypt 해시로 KV에 저장 |
| AU-5 | 토큰 30일 유효, localStorage 저장 |
| AU-6 | `/submit`은 `Authorization: Bearer <token>` 필수 |
| AU-7 | KV 구조: `user:<name>` → `{pin_hash, created_at}`, `token:<token>` → `{name, expires_at}` |
| AU-8 | 로그아웃 버튼 (토큰 삭제) |
| AU-9 | brute force 방지: name별 1분 5회 실패 시 10분 lock |

### 5.2 사용자 웹 폼 (FE) — 핵심 변경 사항

| ID | 요구사항 |
|----|--------|
| FE-1 | 모바일/PC 반응형 |
| FE-2 | 이미지 입력: PC 드래그앤드롭 + 파일 선택, 모바일 `<input type="file" accept="image/*" capture="environment">` |
| FE-3 | **동석자 섹션 1: 통합과학** — 42명을 칩(chip) UI로 표시. CSS Grid `grid-template-columns: repeat(auto-fit, minmax(80px, 1fr))` |
| FE-4 | **동석자 섹션 2: 통합사회** — 15명을 동일한 칩 UI로 표시 |
| FE-5 | 칩 동작: 클릭 시 토글(선택↔해제). 선택 시 시각적 강조 (배경색 변경 + 체크 표시) |
| FE-6 | **동석자 섹션 3: 이름 직접 쓰기** — 텍스트 input. placeholder "콤마로 구분 (예: 거래처 김부장, 외부 강사)" |
| FE-7 | 세 섹션 모두 동시 사용 가능. 최종 H열 값은 `[과학섹션 선택 + 사회섹션 선택 + 직접 입력]`을 콤마+공백으로 join |
| FE-8 | 선택된 동석자 미리보기: 폼 상단 또는 제출 버튼 위에 "동석자: 김수빈, 조준호, 거래처 김부장 (3명)" 표시 |
| FE-9 | B. 회의: 라디오 3개. "기타" 선택 시 주관식 input 활성화 (required) |
| FE-10 | C(결제자) 폼에 없음. 헤더에 "결제자: <로그인이름>" 표시 |
| FE-11 | 제출 버튼 활성 조건: 이미지 ∧ (동석자 ≥ 1명) ∧ B |
| FE-12 | 이미지 FE에서 2048px 장변 기준 리사이즈 |
| FE-13 | 명단은 `frontend/config.js`에 배열로 저장. Junho가 직접 편집 가능 |
| FE-14 | 제출 완료 후: "제출되었습니다. 영수증 인식은 매주 토요일 자동 처리됩니다." |

### 5.3 동석자 칩 UI 상세 스펙

**반응형 동작 (CSS Grid):**

```css
.attendee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
}
```

| 화면폭 | 한 줄 칩 수 (참고) |
|--------|------------------|
| ~360px (작은 모바일) | 3~4개 |
| ~480px (모바일) | 4~5개 |
| ~768px (태블릿) | 6~8개 |
| ~1200px (PC) | 10~14개 |

**칩 레이아웃:**

```
┌─────────────────────────────────────────┐
│ 동석자 선택                              │
│                                         │
│ ▼ 통합과학 (42명)                        │
│ ┌──────┐┌──────┐┌──────┐┌──────┐        │
│ │김수빈││조준호││✓김태윤││정종현│  ...   │
│ └──────┘└──────┘└──────┘└──────┘        │
│ ... (auto-fit으로 줄바꿈)                │
│                                         │
│ ▼ 통합사회 (15명)                        │
│ ┌──────┐┌──────┐┌──────┐                │
│ │ 김윤 ││구민준││제종영│ ...             │
│ └──────┘└──────┘└──────┘                │
│                                         │
│ ▼ 이름 직접 쓰기                         │
│ ┌─────────────────────────────────┐    │
│ │ 콤마로 구분 (예: 거래처 김부장…)  │    │
│ └─────────────────────────────────┘    │
│                                         │
│ 선택된 동석자: 김태윤, 거래처 김부장 (2명) │
└─────────────────────────────────────────┘
```

**선택 상태 시각:**
- 미선택: 흰 배경, 회색 테두리, 검은 글자
- 선택: 진한 파란 배경, 흰 글자, 좌측에 ✓
- hover: 약한 배경색
- 모바일 터치 영역 최소 44×44px (Apple HIG 가이드)

**섹션 헤더:**
- 접기/펼치기 가능 (▼/▶ 토글). 기본은 펼침
- 헤더 클릭 시 전체 섹션 접기 — 작은 화면에서 스크롤 부담 감소

### 5.4 Cloudflare Worker (BE)

| ID | 요구사항 |
|----|--------|
| BE-1 | 5.1의 `/signup`, `/login` |
| BE-2 | `POST /submit` — multipart: image, attendee, meeting, meeting_other. Auth 필수 |
| BE-3 | 토큰에서 사용자 이름을 꺼내 결제자로 사용 |
| BE-4 | 이미지를 Drive `/비용기록_업로드/` 폴더에 `YYYYMMDD_HHMMSS_<name>_<random4>.<ext>` 업로드 |
| BE-5 | webViewLink 획득 |
| BE-6 | Sheets append: B=빈, D=빈, E=결제자, H=동석자(콤마구분 문자열), I=링크, J=회의(또는 기타텍스트), M="pending", N=fileId, O=빈, P=submittedAt(ISO) |
| BE-7 | 응답: `{ok: true}` |
| BE-8 | CORS는 FE 도메인만 |
| BE-9 | rate limit: 사용자당 분당 10건 |

### 5.5 Local Admin App (Python Flask)

| ID | 요구사항 |
|----|--------|
| AD-1 | `python admin.py` (수동) 또는 `python admin.py --auto-run` (자동) |
| AD-2 | Flask 서버 `127.0.0.1:8765` (외부 차단) |
| AD-3 | 수동 모드: 기동 시 자동 브라우저 오픈 |
| AD-4 | 자동 모드 (`--auto-run`): 브라우저 안 열고 즉시 일괄 처리 후 종료. 로그 `logs/auto_run_<timestamp>.log` |
| AD-5 | `GET /` dashboard, `GET /api/status`, `POST /api/process`, `GET /api/progress`, `POST /api/retry/<row>` |
| AD-6 | 동시 처리 lock |
| AD-7 | SA 키는 `%APPDATA%\expense_tracker\sa.json` |
| AD-8 | 마지막 자동 실행 결과 `last_auto_run.json` → dashboard 상단 표시 |

### 5.6 OCR 처리 (`claude -p`)

| ID | 요구사항 |
|----|--------|
| OC-1 | Sheets에서 `M열="pending"` 행 조회 (P열 오름차순) |
| OC-2 | N열 fileId로 Drive에서 이미지 임시 다운로드 |
| OC-3 | `subprocess.run(["claude", "-p", PROMPT_WITH_PATH, "--dangerously-skip-permissions"], timeout=120)` |
| OC-4 | stdout 코드펜스 제거 후 JSON 파싱 |
| OC-5 | Sheets 업데이트: B=date, D=vendor, M="done" |
| OC-6 | 자동 2회 재시도 → 그래도 실패 시 M="error", O열에 사유 |
| OC-7 | 처리 사이 1초 sleep |
| OC-8 | 임시 파일 삭제 |

### 5.7 OCR 프롬프트

```
다음 이미지 파일은 카드 결제 영수증입니다: <PATH>

이미지에서 두 가지 정보를 추출하여 JSON만 출력하세요.
스키마: {"date": "YY.MM.DD", "vendor": "업체명"}

규칙:
- date: 결제 일시. 연도 끝 2자리.월(2자리).일(2자리). 예: 25.11.03
- vendor: 결제 업체명. 카드사명/승인번호/금액은 제외.
- 코드펜스나 설명 없이 JSON 한 줄만 출력하세요.
- 판독 불가 항목은 빈 문자열 ""로.
```

### 5.8 Windows 작업 스케줄러

| ID | 요구사항 |
|----|--------|
| TS-1 | `setup_scheduler.ps1` 1회 실행 |
| TS-2 | 작업 이름: `ExpenseTracker_AutoRun` |
| TS-3 | 트리거: 매주 토요일 11:00, **`Start when available` 활성** |
| TS-4 | 동작: `pythonw.exe admin.py --auto-run` |
| TS-5 | 사용자 로그온 시에만 실행 |
| TS-6 | 실패 시 10분 간격 3회 재시도 |

## 6. 데이터 매핑

| 시트 열 | 항목 | 출처 | 시점 |
|--------|------|------|------|
| B | 결제일시 (YY.MM.DD) | OCR | admin 처리 시 |
| D | 업체명 | OCR | admin 처리 시 |
| E | 결제자 | 로그인 사용자 이름 | 제출 시 |
| H | 동석자 (콤마 구분) | 폼 A | 제출 시 |
| I | Drive 이미지 링크 | Worker | 제출 시 |
| J | 회의명 | 폼 B | 제출 시 |
| M | 상태 (pending/done/error) | 시스템 | 제출 / admin 처리 |
| N | Drive 파일 ID | Worker | 제출 시 |
| O | 에러 메시지 | admin | error 시 |
| P | 제출 시각 (ISO) | Worker | 제출 시 |

## 7. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 동시 접속 | 50명. Cloudflare Workers 무료 |
| 업로드 크기 | 10MB/장 |
| 처리 시간 | 100건 ~50분 |
| Admin 접근 | localhost only |
| 가용성 | PC 꺼져 있어도 제출 누적, 다음 부팅 시 처리 |
| 비용 | 모든 구성요소 무료 |
| 보안 | PIN bcrypt, SA 키 환경변수, 토큰 30일 |

## 8. 단계별 구현 계획

| Phase | 산출물 | 기간 |
|-------|-------|------|
| 0 | Google Cloud + SA + Drive 폴더 + 테스트용 시트 사본 + Cloudflare 계정 + KV | 0.5일 |
| 1 | FE: 회원가입/로그인 + 폼 + **동석자 칩 UI 3섹션** + 검증 (Worker mock) | 2일 |
| 2 | Worker: signup/login/submit + KV + Drive/Sheets 통합 (테스트 시트) | 1.5일 |
| 3 | Local Admin Flask: dashboard + Sheets 조회 (OCR mock) | 0.5일 |
| 4 | `claude -p` 통합 (인자 형식 검증, JSON 파싱, 재시도) | 1일 |
| 5 | Windows 작업 스케줄러 등록 + `--auto-run` 검증 | 0.5일 |
| 6 | E2E 테스트 (영수증 5장) | 0.5일 |
| 7 | 실 [비용기록] 시트로 전환 + 50명 배포 + 가이드 | 0.5일 |

## 9. 결정 사항 (확정)

- 인증: 이름 3글자 + PIN 4자리 (bcrypt 해시, 화이트리스트 없음)
- 결제자(C): 로그인 이름 자동, 폼에서 제거
- 동석자(A) UI: **3섹션 (통합과학 칩 / 통합사회 칩 / 직접 입력 텍스트)**
- 동석자 저장 형식: 콤마+공백 구분 단일 문자열 (H열 1셀)
- 회의(B)와 동석자 List 연동: **연동 안 함** — 양 섹션 항상 표시
- 운영 메타데이터: 본 시트 M/N/O/P 열
- OS: Windows
- 자동 실행: 매주 토요일 11:00, Start-when-available
- 수동 실행: admin 페이지 [지금 처리] 항상 가능
- 명단 관리: `frontend/config.js`에 배열로 저장, Junho 직접 편집

## 10. 미결 / 추후 검토

1. PIN 분실 reset: 별도 UI 없음. Junho가 admin에서 KV 항목 삭제. 가이드 문서 제공
2. 회원가입 무제한: 화이트리스트 없으므로 동일인이 여러 이름 가입 가능. 50명 신뢰 기반 운영
3. 동일 이미지 중복 제출 방지: MVP에는 미포함. 필요 시 후속 작업
