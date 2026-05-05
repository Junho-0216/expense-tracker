// 생성: 2026-05-04
// 회원가입/로그인. 성공 시 토큰 + 이름을 localStorage 저장 후 index.html로 이동.

import { WORKER_URL } from "./config.js";

const TOKEN_KEY = "et_token";
const NAME_KEY = "et_name";

if (localStorage.getItem(TOKEN_KEY)) {
  location.replace("./index.html");
}

const form = document.getElementById("authForm");
const nameInput = document.getElementById("nameInput");
const pinInput = document.getElementById("pinInput");
const submitBtn = document.getElementById("submitBtn");
const errMsg = document.getElementById("errMsg");
const tabs = document.querySelectorAll(".auth-tab");
const subText = document.getElementById("modeSub");

let mode = "login";

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => {
      const active = t === tab;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    mode = tab.dataset.mode;
    submitBtn.textContent = mode === "signup" ? "회원가입" : "로그인";
    subText.textContent =
      mode === "signup"
        ? "이름 3글자 + PIN 4자리로 가입하세요. 이미 사용된 이름은 거부됩니다."
        : "이름 3글자 + PIN 4자리로 로그인하세요";
    errMsg.textContent = "";
    pinInput.setAttribute(
      "autocomplete",
      mode === "signup" ? "new-password" : "current-password"
    );
  });
});

const NAME_RE = /^[\p{L}\p{N}]{3}$/u;
const PIN_RE = /^\d{4}$/;

function setBusy(busy) {
  submitBtn.disabled = busy;
  submitBtn.textContent = busy
    ? mode === "signup"
      ? "가입 중…"
      : "로그인 중…"
    : mode === "signup"
    ? "회원가입"
    : "로그인";
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  errMsg.textContent = "";
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim();

  if (!NAME_RE.test(name)) {
    errMsg.textContent = "이름은 한글/영문/숫자 3글자여야 합니다.";
    return;
  }
  if (!PIN_RE.test(pin)) {
    errMsg.textContent = "PIN은 숫자 4자리여야 합니다.";
    return;
  }

  setBusy(true);
  try {
    const res = await fetch(`${WORKER_URL}/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pin }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `요청 실패 (${res.status})`);
    }
    if (!data.token) {
      throw new Error("서버 응답이 올바르지 않습니다.");
    }
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(NAME_KEY, name);
    location.replace("./index.html");
  } catch (err) {
    errMsg.textContent = err.message || String(err);
  } finally {
    setBusy(false);
  }
});
