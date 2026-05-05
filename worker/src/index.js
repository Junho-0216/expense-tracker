// 생성: 2026-05-04
// 라우터: /signup, /login, /submit + CORS 프리플라이트.

import { signup, login } from "./auth.js";
import { handleSubmit } from "./submit.js";

function corsHeaders(env, origin) {
  const allow = env.CORS_ORIGIN || "*";
  const allowed = allow === "*" || allow === origin;
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || allow) : allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonResponse(data, init, env, origin) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env, origin),
      ...(init?.headers || {}),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    try {
      if (url.pathname === "/signup" && request.method === "POST") {
        const { name, pin } = await request.json();
        const token = await signup(env, name, pin);
        return jsonResponse({ token }, { status: 200 }, env, origin);
      }

      if (url.pathname === "/login" && request.method === "POST") {
        const { name, pin } = await request.json();
        const token = await login(env, name, pin);
        return jsonResponse({ token }, { status: 200 }, env, origin);
      }

      if (url.pathname === "/submit" && request.method === "POST") {
        return await handleSubmit(request, env, origin, corsHeaders);
      }

      if (url.pathname === "/" || url.pathname === "/health") {
        return jsonResponse({ ok: true, service: "expense-tracker" }, { status: 200 }, env, origin);
      }

      return jsonResponse({ error: "Not found" }, { status: 404 }, env, origin);
    } catch (err) {
      const status = err.status || 500;
      const message = err.message || "Internal error";
      console.error("[router]", status, message);
      return jsonResponse({ error: message }, { status }, env, origin);
    }
  },
};
