// 생성: 2026-05-04
// 폼 로직: 칩 토글, 직접 입력 결합, 이미지 리사이즈, 제출.

import { WORKER_URL, ATTENDEE_LIST, MEETINGS } from "./config.js";

const TOKEN_KEY = "et_token";
const NAME_KEY = "et_name";
const MAX_DIM = 2048;
const JPEG_QUALITY = 0.85;
const MAX_BYTES = 10 * 1024 * 1024;

const token = localStorage.getItem(TOKEN_KEY);
const name = localStorage.getItem(NAME_KEY);
if (!token || !name) {
  location.replace("./login.html");
}

const els = {
  whoName: document.getElementById("whoName"),
  logoutBtn: document.getElementById("logoutBtn"),
  form: document.getElementById("receiptForm"),
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  preview: document.getElementById("preview"),
  fileMeta: document.getElementById("fileMeta"),
  customInput: document.getElementById("customInput"),
  previewText: document.getElementById("previewText"),
  meetingRadios: document.getElementById("meetingRadios"),
  meetingOther: document.getElementById("meetingOther"),
  submitBtn: document.getElementById("submitBtn"),
  errMsg: document.getElementById("errMsg"),
  overlay: document.getElementById("overlay"),
  overlayMsg: document.getElementById("overlayMsg"),
  successCard: document.getElementById("successCard"),
  againBtn: document.getElementById("againBtn"),
  sciCount: document.getElementById("sciCount"),
  socCount: document.getElementById("socCount"),
};

els.whoName.textContent = name;

els.logoutBtn.addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  location.replace("./login.html");
});

// 1) 칩 렌더 ───────────────────────────────────────────
const selected = new Set();

function renderChips(group) {
  const grid = document.querySelector(`[data-grid="${group}"]`);
  grid.innerHTML = "";
  ATTENDEE_LIST[group].forEach((person) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.name = person;
    btn.dataset.group = group;
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = person;
    btn.addEventListener("click", () => toggleChip(btn));
    grid.appendChild(btn);
  });
}

function chipKey(group, person) {
  return `${group}::${person}`;
}

function toggleChip(btn) {
  const key = chipKey(btn.dataset.group, btn.dataset.name);
  const next = !selected.has(key);
  if (next) selected.add(key);
  else selected.delete(key);
  btn.setAttribute("aria-pressed", next ? "true" : "false");
  updatePreview();
  updateSubmitState();
}

renderChips("통합과학");
renderChips("통합사회");
els.sciCount.textContent = `(${ATTENDEE_LIST["통합과학"].length}명)`;
els.socCount.textContent = `(${ATTENDEE_LIST["통합사회"].length}명)`;

// 섹션 헤더 접기/펼치기
document.querySelectorAll(".section-header").forEach((h) => {
  h.addEventListener("click", () => {
    const expanded = h.getAttribute("aria-expanded") === "true";
    h.setAttribute("aria-expanded", expanded ? "false" : "true");
    h.parentElement.classList.toggle("is-collapsed", expanded);
  });
});

// 2) 미리보기 / 결합 ───────────────────────────────────
function getCustomList() {
  return els.customInput.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getSelectedNames() {
  // 칩 선택 (중복 시 한 번만, 그룹순서: 과학 → 사회)
  const namesInOrder = [];
  ["통합과학", "통합사회"].forEach((g) => {
    ATTENDEE_LIST[g].forEach((p) => {
      if (selected.has(chipKey(g, p))) namesInOrder.push(p);
    });
  });
  return namesInOrder;
}

function getCombinedAttendees() {
  return [...getSelectedNames(), ...getCustomList()];
}

function updatePreview() {
  const list = getCombinedAttendees();
  if (list.length === 0) {
    els.previewText.textContent = "없음";
  } else {
    els.previewText.textContent = `${list.join(", ")} (${list.length}명)`;
  }
}

els.customInput.addEventListener("input", () => {
  updatePreview();
  updateSubmitState();
});

// 3) 회의 라디오 ───────────────────────────────────────
MEETINGS.forEach((m, i) => {
  const id = `meeting_${i}`;
  const wrap = document.createElement("label");
  wrap.className = "radio-row";
  wrap.innerHTML = `
    <input type="radio" name="meeting" id="${id}" value="${m}" />
    <span>${m}</span>
  `;
  els.meetingRadios.appendChild(wrap);
});

els.meetingRadios.addEventListener("change", () => {
  const v = currentMeeting();
  const isOther = v === "기타";
  els.meetingOther.hidden = !isOther;
  els.meetingOther.required = isOther;
  if (!isOther) els.meetingOther.value = "";
  updateSubmitState();
});

els.meetingOther.addEventListener("input", updateSubmitState);

function currentMeeting() {
  const checked = document.querySelector('input[name="meeting"]:checked');
  return checked ? checked.value : "";
}

// 4) 이미지 입력 + 리사이즈 ────────────────────────────
let processedBlob = null;
let processedFilename = null;

els.dropZone.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  els.dropZone.classList.add("is-drag");
});
els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("is-drag");
});
els.dropZone.addEventListener("drop", (ev) => {
  ev.preventDefault();
  els.dropZone.classList.remove("is-drag");
  const file = ev.dataTransfer.files?.[0];
  if (file) handleFile(file);
});
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files?.[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  els.errMsg.textContent = "";
  if (!file.type.startsWith("image/")) {
    els.errMsg.textContent = "이미지 파일만 업로드 가능합니다.";
    return;
  }
  if (file.size > MAX_BYTES) {
    els.errMsg.textContent = "이미지가 10MB를 초과합니다.";
    return;
  }
  try {
    const { blob, width, height } = await resizeImage(file);
    processedBlob = blob;
    processedFilename = `receipt_${Date.now()}.jpg`;
    const url = URL.createObjectURL(blob);
    els.preview.src = url;
    els.preview.hidden = false;
    els.fileMeta.textContent = `${width}×${height} · ${(blob.size / 1024).toFixed(0)} KB`;
  } catch (err) {
    els.errMsg.textContent = "이미지 처리 실패: " + (err.message || err);
  }
  updateSubmitState();
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지 디코드 실패 (HEIC?)"));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, MAX_DIM / Math.max(w, h));
        const tw = Math.round(w * scale);
        const th = Math.round(h * scale);
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, tw, th);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("toBlob 실패"));
            resolve({ blob, width: tw, height: th });
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 5) 제출 ──────────────────────────────────────────────
function updateSubmitState() {
  const ok =
    !!processedBlob &&
    getCombinedAttendees().length > 0 &&
    !!currentMeeting() &&
    (currentMeeting() !== "기타" || !!els.meetingOther.value.trim());
  els.submitBtn.disabled = !ok;
}

els.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (els.submitBtn.disabled) return;
  els.errMsg.textContent = "";
  els.overlay.hidden = false;
  els.overlayMsg.textContent = "제출 중…";

  const attendee = getCombinedAttendees().join(", ");
  const meeting = currentMeeting();
  const meeting_other = meeting === "기타" ? els.meetingOther.value.trim() : "";

  const body = new FormData();
  body.append("image", processedBlob, processedFilename);
  body.append("attendee", attendee);
  body.append("meeting", meeting);
  body.append("meeting_other", meeting_other);

  try {
    const res = await fetch(`${WORKER_URL}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(NAME_KEY);
      location.replace("./login.html");
      return;
    }
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `제출 실패 (${res.status})`);
    }
    showSuccess();
  } catch (err) {
    els.errMsg.textContent = err.message || String(err);
  } finally {
    els.overlay.hidden = true;
  }
});

function showSuccess() {
  els.form.hidden = true;
  els.successCard.hidden = false;
}

els.againBtn.addEventListener("click", () => {
  // 폼 초기화
  selected.clear();
  document.querySelectorAll(".chip[aria-pressed='true']").forEach((c) =>
    c.setAttribute("aria-pressed", "false")
  );
  els.customInput.value = "";
  els.fileInput.value = "";
  els.preview.hidden = true;
  els.preview.src = "";
  els.fileMeta.textContent = "";
  processedBlob = null;
  processedFilename = null;
  document.querySelectorAll('input[name="meeting"]').forEach((r) => (r.checked = false));
  els.meetingOther.value = "";
  els.meetingOther.hidden = true;
  els.errMsg.textContent = "";
  updatePreview();
  updateSubmitState();
  els.successCard.hidden = true;
  els.form.hidden = false;
});

updatePreview();
updateSubmitState();
