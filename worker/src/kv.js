// 생성: 2026-05-04
// KV 헬퍼.

export async function getJson(kv, key) {
  return await kv.get(key, "json");
}

export async function putJson(kv, key, value, opts) {
  return await kv.put(key, JSON.stringify(value), opts);
}

export async function incrementCounter(kv, key, ttlSec) {
  const cur = parseInt((await kv.get(key)) || "0", 10) + 1;
  await kv.put(key, String(cur), { expirationTtl: ttlSec });
  return cur;
}

// brute-force lock 유틸. 1분 5회 실패 → 10분 lock.
export async function checkLock(kv, name) {
  const locked = await kv.get(`lock:${name}`);
  return !!locked;
}

export async function recordFail(kv, name) {
  const fails = await incrementCounter(kv, `fail:${name}`, 60);
  if (fails >= 5) {
    await kv.put(`lock:${name}`, "1", { expirationTtl: 600 });
  }
}

export async function clearFail(kv, name) {
  await kv.delete(`fail:${name}`);
}

// rate limit: 사용자당 분당 N건
export async function rateLimit(kv, name, perMin = 10) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${name}:${minute}`;
  const cur = await incrementCounter(kv, key, 70);
  if (cur > perMin) {
    const err = new Error("요청 빈도 제한 (분당 10건). 잠시 후 다시 시도하세요.");
    err.status = 429;
    throw err;
  }
}
