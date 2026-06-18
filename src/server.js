// server.js — Express server (entry point: `npm start`). All inference on-device via qvac.js.
// Endpoints:
//   GET  /api/memories       -> { memories[], daily[] }  (timeline + emotion-by-day)
//   POST /api/capture/text   -> organize(text) -> store -> memory
//   POST /api/capture/voice  -> transcribe(audio) -> organize -> store -> memory
// Static UI served from public/ (zero remote resources).

import express from "express";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { transcribeAudio, organize, unloadAll } from "./qvac.js";
import { openDb, insertMemory, listMemories } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "../public");
const TMP_DIR = resolve(__dirname, "../data/tmp");
const PORT = process.env.PORT || 3777;

const db = openDb();
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC));

/** Average emotion_score per calendar day, oldest -> newest (for the chart). */
function dailySeries(memories) {
  const byDay = new Map();
  for (const m of memories) {
    const day = m.created_at.slice(0, 10);
    const d = byDay.get(day) ?? { date: day, sum: 0, count: 0 };
    d.sum += m.emotion_score;
    d.count += 1;
    byDay.set(day, d);
  }
  return [...byDay.values()]
    .map((d) => ({ date: d.date, avg_score: d.sum / d.count, count: d.count }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

app.get("/api/memories", (_req, res) => {
  const memories = listMemories(db);
  res.json({ memories, daily: dailySeries(memories) });
});

app.post("/api/capture/text", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "empty text" });
  const mem = await organize(text);
  const { id } = insertMemory(db, { raw_text: text, ...mem, source_type: "text" });
  res.json({ id, raw_text: text, ...mem, source_type: "text" });
});

app.post("/api/capture/voice", express.raw({ type: "*/*", limit: "50mb" }), async (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: "no audio data" });
  mkdirSync(TMP_DIR, { recursive: true });
  const ext = (extname(String(req.query.name ?? "")) || ".m4a").toLowerCase();
  const tmp = resolve(TMP_DIR, `cap-${Date.now()}${ext}`);
  writeFileSync(tmp, req.body);
  try {
    const transcript = await transcribeAudio(tmp);
    if (!transcript) return res.status(422).json({ error: "empty transcript (could not hear speech)" });
    const mem = await organize(transcript);
    const { id } = insertMemory(db, { raw_text: transcript, ...mem, source_type: "voice" });
    res.json({ id, raw_text: transcript, ...mem, source_type: "voice" });
  } finally {
    try { rmSync(tmp); } catch {}
  }
});

// Surface async errors as JSON instead of crashing the process.
app.use((err, _req, res, _next) => {
  console.error("[server] error:", err);
  res.status(500).json({ error: String(err?.message ?? err) });
});

const server = app.listen(PORT, () => {
  console.log(`MemoryOS running at http://localhost:${PORT}`);
});

async function shutdown() {
  try { await unloadAll(); } catch {}
  try { db.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
