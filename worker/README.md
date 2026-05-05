# Cloudflare Worker — Expense Tracker

> 생성: 2026-05-04
>
> FE → 이 Worker → Google Drive/Sheets

## 사전 준비

1. **Google Cloud**
   - 프로젝트 생성 → Drive API + Sheets API 활성화
   - Service Account 생성 → 키(JSON) 다운로드
   - 사본 시트(Phase 0~6)와 Drive `/비용기록_업로드/` 폴더에 SA 이메일을 **편집자**로 공유
2. **Cloudflare**
   - 계정 생성 후 `npm install -g wrangler` (또는 `npx wrangler`)
   - `npx wrangler login`

## 1회 셋업

```bash
cd worker
npm install

# KV 네임스페이스 생성 (출력된 id를 wrangler.toml에 반영)
npx wrangler kv namespace create expense-tracker-kv
npx wrangler kv namespace create expense-tracker-kv --preview

# Secrets 등록
npx wrangler secret put GOOGLE_SA_JSON   # SA JSON 파일 내용 전체 paste
npx wrangler secret put SHEET_ID         # 사본 시트 ID
npx wrangler secret put DRIVE_FOLDER_ID  # Drive 폴더 ID
```

## 로컬 개발

```bash
cp .dev.vars.example .dev.vars   # 값 채움
npx wrangler dev
# http://127.0.0.1:8787
```

`.dev.vars` 는 `.gitignore` 에 의해 보호됨.

## 배포

```bash
npx wrangler deploy
# https://expense-tracker.<account>.workers.dev
```

배포 URL을 `frontend/config.js` 의 `WORKER_URL` 에 반영.

## 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/signup` | `{name, pin}` → `{token}` |
| POST | `/login` | `{name, pin}` → `{token}` |
| POST | `/submit` | multipart: image, attendee, meeting, meeting_other (Bearer 토큰 필수) |
| GET | `/health` | 헬스체크 |

## 시트 컬럼 매핑

`A B C D E F G H I J K L M N O P`
- E: 결제자 (로그인 이름)
- H: 동석자 (콤마 구분)
- I: Drive 링크
- J: 회의명 또는 "기타" 입력값
- M: `pending` (제출 시) → admin이 `done`/`error`로 변경
- N: Drive 파일 ID
- P: 제출 시각 ISO

## Phase 7 전환 (실 시트로)

```bash
npx wrangler secret put SHEET_ID  # 실 시트 ID 입력
npx wrangler deploy               # 재배포
```

## 트러블슈팅

- `Drive 업로드 실패 (403)` → SA 이메일을 Drive 폴더에 편집자로 공유했는지 확인
- `Sheets append 실패 (403)` → 시트에 SA 이메일 편집자 공유 확인
- `토큰 발급 실패 (400)` → SA JSON의 `private_key` 줄바꿈(`\n`)이 문자열로 잘 들어갔는지 확인
- `KV not found` → `wrangler.toml` 의 `id`/`preview_id` 가 `REPLACE_WITH_*` 그대로면 교체 필요
