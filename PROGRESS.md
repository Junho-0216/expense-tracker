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

## 다음 작업 (Junho)

1. **Phase 0 운영 셋업** (코드 외 작업, README들 참고)
   - Google Cloud SA 생성 → JSON 키 다운로드 → `%APPDATA%\expense_tracker\sa.json` 위치
   - 테스트용 시트 사본 생성 → ID `worker/.dev.vars` 및 `admin/.env`에 반영
   - Drive `/비용기록_업로드/` 폴더 생성 → 폴더 ID 반영
   - SA 이메일에 시트/폴더 편집 권한 부여
   - Cloudflare 계정 + KV 네임스페이스 생성 → `wrangler.toml` 반영
2. **Phase 1 배포**: `frontend/`를 GitHub Pages에 배포 후 `frontend/config.js` 의 `WORKER_URL` 갱신
3. **Phase 2 배포**: `cd worker && npx wrangler secret put ...; npx wrangler deploy`
4. **Phase 4 검증**: `tests/sample_receipts/`에 영수증 5장 → `python tests/test_ocr.py`
5. **Phase 5**: `admin/setup_scheduler.ps1` PowerShell 실행
6. **Phase 7**: 사본 시트 → 실 시트 ID로 전환, 친구 50명 URL 공유

## 비고
- Anthropic API 호출 코드는 어디에도 없음 (CLAUDE.md §0.1 준수)
- 실 시트 ID(`1fWogSFD6...`)는 Phase 7 전까지 사용 금지
