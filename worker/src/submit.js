// 생성: 2026-05-04
// /submit 핸들러 — multipart 파싱 → Drive 업로드 → Sheets append.

import { verifyToken } from "./auth.js";
import { driveUpload, sheetsAppend } from "./google.js";
import { rateLimit } from "./kv.js";

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

const MAX_BYTES = 10 * 1024 * 1024;

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function fmtTimestamp(d = new Date()) {
  return (
    d.getFullYear().toString() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    "_" +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

function rand4() {
  const arr = new Uint8Array(2);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function extFromMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function handleSubmit(request, env, origin, corsHeaders) {
  const cors = corsHeaders(env, origin);
  const json = (data, init) =>
    new Response(JSON.stringify(data), {
      ...init,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...cors,
        ...(init?.headers || {}),
      },
    });

  // 1) Auth
  const name = await verifyToken(env, request.headers.get("Authorization"));
  if (!name) return json({ error: "인증이 필요합니다." }, { status: 401 });

  // 2) Rate limit
  await rateLimit(env.KV, name, 10);

  // 3) Multipart parse
  const form = await request.formData();
  const image = form.get("image");
  const attendee = (form.get("attendee") || "").toString().trim();
  const meeting = (form.get("meeting") || "").toString().trim();
  const meetingOther = (form.get("meeting_other") || "").toString().trim();

  if (!(image instanceof File)) throw err(400, "이미지 파일이 없습니다.");
  if (image.size === 0) throw err(400, "이미지가 비어 있습니다.");
  if (image.size > MAX_BYTES) throw err(413, "이미지가 10MB를 초과합니다.");
  if (!ALLOWED_MIMES.has(image.type)) {
    throw err(415, `지원하지 않는 이미지 형식: ${image.type}`);
  }
  if (!attendee) throw err(400, "동석자를 1명 이상 선택해주세요.");
  if (!meeting) throw err(400, "회의를 선택해주세요.");
  if (meeting === "기타" && !meetingOther) {
    throw err(400, "기타 회의명을 입력해주세요.");
  }

  // 4) Drive 업로드
  const ts = fmtTimestamp();
  const ext = extFromMime(image.type);
  const filename = `${ts}_${name}_${rand4()}.${ext}`;
  const arrayBuf = await image.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  const driveRes = await driveUpload(env, {
    filename,
    mimeType: image.type,
    bytes,
    parentFolderId: env.DRIVE_FOLDER_ID,
  });

  const fileId = driveRes.id;
  const link = driveRes.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  const meetingValue = meeting === "기타" ? meetingOther : meeting;
  const submittedAtISO = new Date().toISOString();

  // 5) Sheets append: A~P (B/D는 빈 칸; OCR 후 admin이 채움)
  // 헤더 제외 데이터 행, 16개 열 (A..P).
  const row = [
    "", // A
    "", // B (결제일시 — OCR 후)
    "", // C
    "", // D (업체명 — OCR 후)
    name, // E (결제자)
    "", // F
    "", // G
    attendee, // H
    link, // I
    meetingValue, // J
    "", // K
    "", // L
    "pending", // M
    fileId, // N
    "", // O
    submittedAtISO, // P
  ];

  const tab = env.SHEET_TAB || "Sheet1";
  // 시트 탭 이름에 한글이 들어가면 작은따옴표 권장
  const range = `'${tab}'!A:P`;
  await sheetsAppend(env, env.SHEET_ID, range, [row]);

  return json({ ok: true });
}
