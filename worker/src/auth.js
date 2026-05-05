// 생성: 2026-05-04
// signup / login / verifyToken (bcryptjs + Bearer 토큰).

import bcrypt from "bcryptjs";
import { getJson, putJson, checkLock, recordFail, clearFail } from "./kv.js";

const NAME_RE = /^[\p{L}\p{N}]{3}$/u;
const PIN_RE = /^\d{4}$/;
const TOKEN_TTL_SEC = 30 * 86400;

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function validateInput(name, pin) {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw err(400, "이름은 한글/영문/숫자 3글자여야 합니다.");
  }
  if (typeof pin !== "string" || !PIN_RE.test(pin)) {
    throw err(400, "PIN은 숫자 4자리여야 합니다.");
  }
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function issueToken(env, name) {
  const token = randomToken();
  const expires_at = Date.now() + TOKEN_TTL_SEC * 1000;
  await putJson(env.KV, `token:${token}`, { name, expires_at }, { expirationTtl: TOKEN_TTL_SEC });
  return token;
}

export async function signup(env, name, pin) {
  validateInput(name, pin);
  const exists = await env.KV.get(`user:${name}`);
  if (exists) {
    throw err(409, "이미 사용 중인 이름입니다.");
  }
  const pin_hash = await bcrypt.hash(pin, 10);
  await putJson(env.KV, `user:${name}`, { pin_hash, created_at: Date.now() });
  return await issueToken(env, name);
}

export async function login(env, name, pin) {
  validateInput(name, pin);
  if (await checkLock(env.KV, name)) {
    throw err(429, "로그인 시도 횟수 초과. 10분 후 다시 시도하세요.");
  }
  const rec = await getJson(env.KV, `user:${name}`);
  if (!rec) {
    await recordFail(env.KV, name);
    throw err(401, "이름 또는 PIN이 잘못되었습니다.");
  }
  const ok = await bcrypt.compare(pin, rec.pin_hash);
  if (!ok) {
    await recordFail(env.KV, name);
    throw err(401, "이름 또는 PIN이 잘못되었습니다.");
  }
  await clearFail(env.KV, name);
  return await issueToken(env, name);
}

export async function verifyToken(env, authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const rec = await getJson(env.KV, `token:${token}`);
  if (!rec) return null;
  if (rec.expires_at && rec.expires_at < Date.now()) return null;
  return rec.name;
}
