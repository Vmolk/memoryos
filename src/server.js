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
import { transcribeAudio, organize, embedText, answer, unloadAll } from "./qvac.js";
import {
  openDb, insertMemory, listMemories,
  setEmbedding, memoriesMissingEmbedding, memoriesWithEmbedding,
} from "./db.js";
import { vectorToBlob, blobToVector, cosine } from "./vector.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "../public");
const TMP_DIR = resolve(__dirname, "../data/tmp");
const PORT = process.env.PORT || 3777;

// Semantic-search tuning. Below this cosine, we treat the query as "not in memory"
// and refuse rather than feed weak context to the LLM (anti-hallucination + the
// "honest memory" promise). Tuned against Gate 3 separation (in-topic ~0.65-0.80,
// cross-topic <= ~0.59).
const SIMILARITY_THRESHOLD = 0.6;
const TOP_K = 3;

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

// Organize + embed + store one capture.
async function storeCapture(raw_text, source_type) {
  const mem = await organize(raw_text);
  const vec = await embedText(raw_text);
  const { id } = insertMemory(db, { raw_text, ...mem, source_type, embedding: vectorToBlob(vec) });
  return { id, raw_text, ...mem, source_type };
}

app.post("/api/capture/text", async (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) return res.status(400).json({ error: "empty text" });
  res.json(await storeCapture(text, "text"));
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
    res.json(await storeCapture(transcript, "voice"));
  } finally {
    try { rmSync(tmp); } catch {}
  }
});

// Semantic search + grounded answer. Two-part response: a (fragile) LLM answer
// AND the (rock-solid) matching memories as grounding evidence.
app.post("/api/ask", async (req, res) => {
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "empty question" });

  const qvec = Float32Array.from(await embedText(question));
  const rows = memoriesWithEmbedding(db);
  const scored = rows
    .map((r) => ({
      id: r.id, summary: r.summary, raw_text: r.raw_text,
      emotion: r.emotion, emotion_score: r.emotion_score, created_at: r.created_at,
      score: cosine(qvec, blobToVector(r.embedding, qvec.length)),
    }))
    .sort((a, b) => b.score - a.score);

  // Only memories above the threshold count as relevant. Feed ONLY these to the LLM
  // (mixing in weak/off-topic notes makes 1B cross-contaminate or hallucinate).
  const strong = scored.slice(0, TOP_K).filter((r) => r.score >= SIMILARITY_THRESHOLD);

  // Nothing relevant -> honest refusal (this is the "intentional memory" promise).
  if (strong.length === 0) {
    return res.json({ grounded: false, answer: "Mình không có memory nào về việc này.", matches: [] });
  }

  // Retrieval is the product; the LLM answer is a best-effort bonus. If 1B wobbles
  // (refuses / NOT_FOUND), we DON'T claim "no memory" — the matches below carry it.
  const raw = await answer(question, strong.map((s) => s.raw_text));
  const notFound = raw === "" || /^\s*not[\s_-]?found\b/i.test(raw);

  res.json({
    grounded: !notFound,
    answer: notFound ? null : raw, // null => UI shows matches under a neutral header
    matches: strong.map((t) => ({
      id: t.id, summary: t.summary, emotion: t.emotion,
      emotion_score: t.emotion_score, score: Number(t.score.toFixed(4)), created_at: t.created_at,
    })),
  });
});

// Surface async errors as JSON instead of crashing the process.
app.use((err, _req, res, _next) => {
  console.error("[server] error:", err);
  res.status(500).json({ error: String(err?.message ?? err) });
});

// v1 -> v2: embed any memories created before semantic search existed, so they're
// searchable. Same Float32 BLOB path as new rows; verify self-cosine on one row.
async function backfillEmbeddings() {
  const missing = memoriesMissingEmbedding(db);
  if (!missing.length) return;
  console.log(`[backfill] embedding ${missing.length} pre-v2 memorie(s)...`);
  for (const row of missing) {
    const vec = await embedText(row.raw_text);
    setEmbedding(db, row.id, vectorToBlob(vec));
  }
  const sample = memoriesWithEmbedding(db).find((r) => missing.some((m) => m.id === r.id));
  if (sample) {
    const dim = sample.embedding.byteLength / 4;
    const v = blobToVector(sample.embedding, dim);
    console.log(`[backfill] done. self-cosine on row ${sample.id}: ${cosine(v, v).toFixed(6)} (expect 1.0)`);
  }
}

const server = app.listen(PORT, () => {
  console.log(`MemoryOS running at http://localhost:${PORT}`);
  backfillEmbeddings().catch((e) => console.error("[backfill] error:", e));
});

async function shutdown() {
  try { await unloadAll(); } catch {}
  try { db.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
