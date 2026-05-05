// 생성: 2026-05-04
// Google Drive/Sheets REST 호출 (SA JWT).
// SDK 미사용 — Cloudflare Workers V8 isolate에서 직접 RS256 서명 후 토큰 교환.

const TOKEN_URI = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets";

let cachedAccessToken = null;
let cachedExpiresAt = 0;

function b64urlEncode(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeStr(str) {
  return b64urlEncode(new TextEncoder().encode(str));
}

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function signJWT(sa) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: SCOPES,
    aud: TOKEN_URI,
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = b64urlEncodeStr(JSON.stringify(header));
  const payloadB64 = b64urlEncodeStr(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const keyData = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(message)
  );
  const sigB64 = b64urlEncode(new Uint8Array(sigBuf));
  return `${message}.${sigB64}`;
}

async function getAccessToken(env) {
  if (cachedAccessToken && Date.now() < cachedExpiresAt - 60_000) {
    return cachedAccessToken;
  }
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const jwt = await signJWT(sa);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google 토큰 발급 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  cachedAccessToken = data.access_token;
  cachedExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

// ────────────────── Drive 업로드 ──────────────────
export async function driveUpload(env, { filename, mimeType, bytes, parentFolderId }) {
  const accessToken = await getAccessToken(env);

  // multipart upload
  const boundary = "et_boundary_" + crypto.randomUUID().replace(/-/g, "");
  const meta = {
    name: filename,
    parents: parentFolderId ? [parentFolderId] : undefined,
  };
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(meta) +
      `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink,name&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive 업로드 실패 (${res.status}): ${text.slice(0, 500)}`);
  }
  return await res.json(); // { id, webViewLink, name, ... }
}

// ────────────────── Sheets append ──────────────────
// values: 2차원 배열. range: "A1" 또는 "Sheet1!A1".
export async function sheetsAppend(env, sheetId, range, values) {
  const accessToken = await getAccessToken(env);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}` +
    `/values/${encodeURIComponent(range)}:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append 실패 (${res.status}): ${text.slice(0, 500)}`);
  }
  return await res.json();
}
