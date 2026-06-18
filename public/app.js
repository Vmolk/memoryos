// app.js — MemoryOS UI logic + hand-drawn SVG emotion chart. No remote resources.

const $ = (sel) => document.querySelector(sel);

// ---- View / mode switching ----
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    $("#view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "timeline") loadTimeline();
  });
});

document.querySelectorAll(".mode").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $("#panel-" + btn.dataset.mode).classList.add("active");
  });
});

// ---- Capture ----
function setBusy(msg) {
  $("#status").textContent = msg || "";
  $("#btn-save-text").disabled = !!msg;
  $("#btn-save-voice").disabled = !!msg;
}

function renderMemoryCard(m) {
  const sign = m.emotion_score >= 0 ? "score-pos" : "score-neg";
  return `
    <div class="memory">
      <p class="summary">${escapeHtml(m.summary)}</p>
      ${m.raw_text ? `<p class="raw">“${escapeHtml(m.raw_text)}”</p>` : ""}
      <div class="meta">
        <span class="chip emotion">${escapeHtml(m.emotion)}</span>
        <span class="chip ${sign}">${m.emotion_score.toFixed(2)}</span>
        ${(m.tags || []).map((t) => `<span class="chip">#${escapeHtml(t)}</span>`).join("")}
        <span class="chip">${m.source_type}</span>
        ${m.created_at ? `<span class="date">${m.created_at.slice(0, 16).replace("T", " ")}</span>` : ""}
      </div>
    </div>`;
}

$("#btn-save-text").addEventListener("click", async () => {
  const text = $("#text-input").value.trim();
  if (!text) return;
  setBusy("Organizing on-device…");
  try {
    const m = await postJSON("/api/capture/text", { text });
    $("#result").innerHTML = renderMemoryCard(m);
    $("#text-input").value = "";
    setBusy("");
    $("#status").textContent = "Saved ✓";
  } catch (e) {
    setBusy("");
    $("#status").textContent = "Error: " + e.message;
  }
});

$("#btn-save-voice").addEventListener("click", async () => {
  const file = $("#audio-input").files[0];
  if (!file) { $("#status").textContent = "Pick an audio file first."; return; }
  setBusy("Transcribing + organizing on-device…");
  try {
    const res = await fetch("/api/capture/voice?name=" + encodeURIComponent(file.name), {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    const m = await res.json();
    if (!res.ok) throw new Error(m.error || res.statusText);
    $("#result").innerHTML = renderMemoryCard(m);
    setBusy("");
    $("#status").textContent = "Saved ✓";
  } catch (e) {
    setBusy("");
    $("#status").textContent = "Error: " + e.message;
  }
});

// ---- Timeline ----
async function loadTimeline() {
  const { memories, daily } = await fetch("/api/memories").then((r) => r.json());
  $("#chart").innerHTML = renderChart(daily);
  $("#memory-list").innerHTML = memories.length
    ? memories.map(renderMemoryCard).join("")
    : `<div class="empty">No memories yet. Capture one to get started.</div>`;
}

// Hand-drawn SVG line chart. Fixed y-axis [-1, 1] with a clear zero baseline,
// so the sign of the daily-average emotion is always readable. No libraries.
function renderChart(daily) {
  if (!daily || daily.length < 2) {
    return `<div class="empty">Need at least 2 days of memories to draw the trend.</div>`;
  }
  const W = 680, H = 240, padL = 34, padR = 14, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (daily.length === 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
  const y = (s) => padT + (1 - (s + 1) / 2) * innerH; // map [-1,1] -> [bottom,top]
  const zeroY = y(0);

  const points = daily.map((d, i) => [x(i), y(d.avg_score)]);
  const linePath = points.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");

  // x labels: first, last, and a couple in between (avoid clutter).
  const labelIdx = new Set([0, daily.length - 1, Math.floor((daily.length - 1) / 2)]);
  const xLabels = daily
    .map((d, i) => (labelIdx.has(i)
      ? `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${d.date.slice(5)}</text>`
      : ""))
    .join("");

  const dots = points
    .map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5"
        fill="${daily[i].avg_score >= 0 ? "#3ecf8e" : "#ff6b6b"}" />`)
    .join("");

  return `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Emotion trend by day">
    <style>
      .ax { fill: #9aa3b2; font-size: 11px; font-family: -apple-system, "Segoe UI", sans-serif; }
      .grid { stroke: #2a2f3a; stroke-width: 1; }
      .zero { stroke: #4a5160; stroke-width: 1; stroke-dasharray: 4 3; }
      .line { fill: none; stroke: #5b8cff; stroke-width: 2; }
    </style>
    <line class="grid" x1="${padL}" y1="${y(1).toFixed(1)}" x2="${W - padR}" y2="${y(1).toFixed(1)}" />
    <line class="zero" x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" />
    <line class="grid" x1="${padL}" y1="${y(-1).toFixed(1)}" x2="${W - padR}" y2="${y(-1).toFixed(1)}" />
    <text x="6" y="${(y(1) + 4).toFixed(1)}" class="ax">+1</text>
    <text x="6" y="${(zeroY + 4).toFixed(1)}" class="ax">0</text>
    <text x="6" y="${(y(-1) + 4).toFixed(1)}" class="ax">-1</text>
    <path class="line" d="${linePath}" />
    ${dots}
    ${xLabels}
  </svg>`;
}

// ---- helpers ----
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
