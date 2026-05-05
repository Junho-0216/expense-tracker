# DECISION_LOG

> 작은 의사결정도 1줄로 누적. 사용자 확인 없이 진행한 자율 결정.

## 2026-05-04 (Phase 0~5 일괄 구현)

- **D-001** Worker 패키지 매니저: `npm` (Cloudflare Workers 표준). bcryptjs는 `npm install` 필요.
- **D-002** Worker 모듈 시스템: ES Modules (`type: "module"`). `wrangler.toml`에서 `main = "src/index.js"`.
- **D-003** Drive/Sheets 호출: Worker에서 직접 SA JWT → REST API. `googleapis` SDK는 Workers 호환성 이슈로 제외.
- **D-004** SA 키 Worker 보관: `wrangler secret`에 `GOOGLE_SA_JSON` (전체 JSON 문자열). 운영 시 `wrangler secret put GOOGLE_SA_JSON < sa.json`.
- **D-005** 시트 ID와 Drive 폴더 ID도 Worker secret. FE/Git 노출 방지.
- **D-006** FE 모듈 로딩: `<script type="module">` ESM. config.js export.
- **D-007** 토큰 저장: `localStorage["et_token"]`. 추가로 `et_name`도 저장 (헤더 표시용).
- **D-008** 이미지 리사이즈: 캔버스로 장변 2048px 클램프, JPEG 0.85 품질. 원본이 더 작으면 그대로.
- **D-009** 이미지 변환 후 항상 JPEG 출력 (확장자 통일, HEIC 호환). 파일명은 `_<random4>.jpg`.
- **D-010** 회원가입/로그인 실패 lock: KV `lock:<name>` (10분 만료). 카운터 `fail:<name>` (1분 만료).
- **D-011** Submit rate limit: KV `rl:<name>:<minute>` 카운터, 60s 만료, 분당 10 초과 시 429.
- **D-012** Admin Flask 포트: 8765. 충돌 시 환경변수 `ADMIN_PORT`로 오버라이드 가능.
- **D-013** Admin auto-run 로그: `%APPDATA%\expense_tracker\logs\auto_run_<ts>.log`.
- **D-014** Admin last_auto_run 위치: `%APPDATA%\expense_tracker\last_auto_run.json`.
- **D-015** 칩 그룹 펼침/접힘 상태는 sessionStorage가 아닌 단순 DOM (페이지 로드시 펼침 기본).
- **D-016** Phase 6/7은 사용자(Junho) 운영 작업이므로 코드 단계에선 PROGRESS에 ⏳로 남기고 종료.
- **D-017** `claude -p` 인자 검증은 Phase 4 시작 시 실행 — 코드는 `--dangerously-skip-permissions` 포함, 실패 시 사용자에게 stderr 노출.
- **D-018** 테스트 시트로 전환 가이드는 `worker/README.md` + `admin/README.md`에 명시. 실 시트 ID는 코드 어디에도 하드코딩 안 함.
- **D-019** `.gitignore`에 `sa.json`, `.env`, `.dev.vars` 모두 명시. Worker `.dev.vars.example`만 커밋.
- **D-020** 칩 UI 접근성: `<button type="button" aria-pressed>` + `role="group"` (CLAUDE.md §5.3 준수).
- **D-021** 직접 입력은 컴마 split 시 빈 토큰 제거 (`.filter(Boolean)`).
- **D-022** "기타" 회의 J열 저장: 사용자 입력 그대로(접두어 없음, CLAUDE.md §13).
- **D-023** Worker `/submit` 응답에 row 인덱스 포함하지 않음 — FE는 단순 ok만 받음.
- **D-024** Sheets append 범위: 시트 이름은 `${SHEET_TAB}` env로 받음 (기본 "Sheet1"). 시트 탭 이름이 한글이면 single quote 처리.
