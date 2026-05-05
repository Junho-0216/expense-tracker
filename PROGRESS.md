# PROGRESS — 비용기록 자동화

> 매 Phase 완료 시 갱신. 시작: 2026-05-04

## Phase 상태

| Phase | 산출물 | 상태 | 완료일 |
|-------|--------|------|--------|
| 0 | 디렉토리 + 메타파일 + .gitignore | ✅ 완료 | 2026-05-04 |
| 1 | FE: 회원가입/로그인 + 폼 + 칩 UI 3섹션 | ✅ 완료 | 2026-05-04 |
| 2 | Worker: signup/login/submit + Drive/Sheets | ✅ 완료 | 2026-05-04 |
| 3 | Local Admin Flask: dashboard | ✅ 완료 | 2026-05-04 |
| 4 | claude -p OCR 통합 | ✅ 완료 | 2026-05-04 |
| 5 | Windows 작업 스케줄러 setup_scheduler.ps1 | ✅ 완료 | 2026-05-04 |
| 6 | E2E 테스트 (영수증 5장) | ⏳ 사용자 작업 (Junho 영수증 투입) | — |
| 7 | 실 [비용기록] 시트로 전환 + 50명 배포 | ⏳ 사용자 작업 (배포) | — |

## 운영 셋업 (외부 계정) — 2026-05-05 완료

- ✅ GCP 프로젝트 `expense-tracker-495406` + SA `expense-tracker-sa@expense-tracker-495406.iam.gserviceaccount.com`
- ✅ 사본 시트 `[테스트] 비용기록` (탭: `설문지 응답 시트1`) — SA 편집자 공유
- ✅ Drive 폴더 `비용기록_업로드` — SA 편집자 공유
- ✅ admin/.env 채움 → admin.py /api/status 200 OK 검증
- ✅ Cloudflare Workers 배포: `https://expense-tracker.junho000216.workers.dev`
- ✅ KV 네임스페이스 (prod + preview) 생성 + wrangler.toml 반영
- ✅ Secrets: GOOGLE_SA_JSON / SHEET_ID / DRIVE_FOLDER_ID
- ✅ Cloudflare Access 자동 정책 제거 → /health 200 정상 응답
- ✅ GitHub repo `Junho-0216/expense-tracker` (public) 생성 + push
- ✅ GitHub Pages 활성화 (gh-pages 브랜치 root) → `https://junho-0216.github.io/expense-tracker/`
- ✅ Worker CORS_ORIGIN = `https://junho-0216.github.io` (GitHub 계정 핸들 기준)
- ✅ frontend/config.js WORKER_URL 갱신
- ✅ CORS preflight 검증 (204 + ACAO 정상)

## 다음 작업 (Junho)

1. **Phase 6 — 직접 E2E 테스트** (브라우저)
   - `https://junho-0216.github.io/expense-tracker/login.html` 접속
   - 회원가입: 이름 3글자 + PIN 4자리
   - 영수증 1장 업로드 + 동석자 + 회의 선택 → 제출
   - 사본 시트에서 새 행 + M열=`pending` 확인
2. **Phase 6 — OCR 일괄 처리 검증**
   - `python admin/admin.py` → 대시보드 [지금 일괄 처리]
   - B(결제일시), D(업체명) 채워지고 M=`done` 되는지
3. **Phase 5 — 작업 스케줄러 등록**
   - `admin/setup_scheduler.ps1` 실행
4. **Phase 7 — 실 시트로 전환**
   - SA에 실 시트 공유 → wrangler secret put SHEET_ID 갱신 → 재배포
   - 50명에게 URL 전파

## frontend 갱신 방법

`frontend/config.js` (명단 등) 변경 시:
```powershell
git add frontend/config.js
git commit -m "update attendee list"
git push origin main
git subtree push --prefix frontend origin gh-pages
```

⚠️ Pages source가 `gh-pages` 브랜치라서 main에 push만 하면 반영 안 됨. subtree push 필수.

## 비고
- Anthropic API 호출 코드는 어디에도 없음 (CLAUDE.md §0.1 준수)
- 실 시트 ID(`1fWogSFD6...`)는 Phase 7 전까지 사용 금지
- GitHub 계정명 `Junho-0216` ≠ Cloudflare 서브도메인 `junho000216`. 두 핸들이 다름에 주의
