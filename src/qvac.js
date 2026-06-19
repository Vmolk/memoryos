// qvac.js — QVAC SDK wrapper. All inference is on-device; every call is logged.
//
// Public API:
//   transcribeAudio(filePath)  -> string   (Whisper)
//   organize(rawText)          -> { summary, emotion, emotion_score, tags }  (LLM)
//   unloadAll()                -> void      (free models)
//
// Models are lazily loaded once and cached by id, then reused across calls
// (loading is the slow part — we don't reload per request).

import {
  loadModel,
  unloadModel,
  transcribe,
  completion,
  embed,
  WHISPER_TINY,
  LLAMA_3_2_1B_INST_Q4_0,
  EMBEDDINGGEMMA_300M_Q8_0,
} from "@qvac/sdk";
import { logEvent } from "./logger.js";

const WHISPER = { name: "WHISPER_TINY", src: WHISPER_TINY };
const LLM = { name: "LLAMA_3_2_1B_INST_Q4_0", src: LLAMA_3_2_1B_INST_Q4_0 };
const EMBED = { name: "EMBEDDINGGEMMA_300M_Q8_0", src: EMBEDDINGGEMMA_300M_Q8_0 };

const WHISPER_CONFIG = {
  audio_format: "f32le",
  language: "vi",
  translate: false,
  strategy: "greedy",
  n_threads: 4,
  suppress_blank: true,
  suppress_nst: true,
  temperature: 0.0,
  vad_params: {
    threshold: 0.35,
    min_speech_duration_ms: 200,
    min_silence_duration_ms: 150,
    max_speech_duration_s: 30.0,
    speech_pad_ms: 600,
    samples_overlap: 0.3,
  },
};

// Fixed emotion vocabulary. Enforced at grammar level via JSON-schema `enum`
// (llama.cpp converts the schema to GBNF), with an app-layer fallback in
// parseMemory() in case any future model/SDK path doesn't honor the grammar.
export const EMOTION_LABELS = [
  "joyful",
  "grateful",
  "calm",
  "neutral",
  "tired",
  "anxious",
  "sad",
  "angry",
];
// Sign expectation per label, used to keep emotion ↔ emotion_score consistent.
const POSITIVE_EMOTIONS = new Set(["joyful", "grateful", "calm"]);
const NEGATIVE_EMOTIONS = new Set(["anxious", "sad", "angry"]);
// "neutral" and "tired" are intentionally sign-neutral (no enforcement).

// emotion_score is a float in [-1.0, 1.0]: -1 = very negative, +1 = very positive.
// tags is an array of 1-5 short lowercase keywords.
const MEMORY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    emotion: { type: "string", enum: EMOTION_LABELS },
    emotion_score: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "emotion", "emotion_score", "tags"],
  additionalProperties: false,
};

const ORGANIZE_SYSTEM_PROMPT = `You turn a raw personal note into a structured memory. Return ONLY valid JSON matching the schema.
Rules:
- summary: 1-2 sentences, first person, written in the SAME language as the input note.
- emotion: EXACTLY ONE label from this list: ${EMOTION_LABELS.join(", ")}. Pick the closest dominant feeling.
- emotion_score: a float between -1.0 and 1.0 (-1.0 = very negative, 0 = neutral, 1.0 = very positive). Its sign MUST match the emotion (positive emotions > 0, negative emotions < 0).
- tags: 1-5 short lowercase keywords capturing the key topics/entities of the note.
Do not add any text outside the JSON.`;

// Grounded-answer prompt (v2 /api/ask). Kept SHORT on purpose — 1B wobbles on long
// output, so we constrain length at the source. Same NOT_FOUND contract as Gate 3.
const ANSWER_SYSTEM_PROMPT = `You answer a question about the user's past journal notes. Use ONLY the facts in the numbered notes provided. Write a SHORT 1-2 sentence answer in the SAME language as the question. Never copy the notes verbatim. If the notes do not contain the answer, reply with exactly: NOT_FOUND`;

let whisperId = null;
let llmId = null;
let embedId = null;

// Object wrappers so ensureModel can read/write the module-level ids.
const whisperSlot = { get id() { return whisperId; }, set id(v) { whisperId = v; } };
const llmSlot = { get id() { return llmId; }, set id(v) { llmId = v; } };
const embedSlot = { get id() { return embedId; }, set id(v) { embedId = v; } };

async function ensureModel(slot, def, modelConfig) {
  if (slot.id) return slot.id;
  const t0 = Date.now();
  const id = await loadModel({ modelSrc: def.src, ...(modelConfig ? { modelConfig } : {}) });
  slot.id = id;
  logEvent({ event: "load", model: def.name, model_id: id, duration_ms: Date.now() - t0 });
  return id;
}

/**
 * Transcribe an audio file (.m4a/.mp3/.wav/.ogg) to text via on-device Whisper.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function transcribeAudio(filePath) {
  const modelId = await ensureModel(whisperSlot, WHISPER, WHISPER_CONFIG);
  const t0 = Date.now();
  const segments = await transcribe({ modelId, audioChunk: filePath, metadata: true });
  const text = segments.map((s) => s.text).join("").trim();
  logEvent({
    event: "transcribe",
    model: WHISPER.name,
    model_id: modelId,
    duration_ms: Date.now() - t0,
    segments: segments.length,
    text_len: text.length,
  });
  return text;
}

/**
 * Organize raw text into a structured memory via on-device LLM.
 * @param {string} rawText
 * @returns {Promise<{summary:string, emotion:string, emotion_score:number, tags:string[]}>}
 */
export async function organize(rawText) {
  const modelId = await ensureModel(llmSlot, LLM);

  const run = completion({
    modelId,
    history: [
      { role: "system", content: ORGANIZE_SYSTEM_PROMPT },
      { role: "user", content: rawText },
    ],
    stream: true,
    responseFormat: { type: "json_schema", json_schema: { name: "memory", schema: MEMORY_SCHEMA } },
  });

  const t0 = Date.now();
  let firstTokenAt = null;
  for await (const ev of run.events) {
    if (ev.type === "contentDelta" && firstTokenAt === null) firstTokenAt = Date.now();
  }
  const final = await run.final;

  const ttft = final.stats?.timeToFirstToken ?? (firstTokenAt ? firstTokenAt - t0 : null);
  logEvent({
    event: "inference",
    model: LLM.name,
    model_id: modelId,
    prompt_len: rawText.length,
    prompt_tokens: final.stats?.promptTokens ?? null,
    generated_tokens: final.stats?.generatedTokens ?? null,
    ttft_ms: ttft,
    tokens_per_sec: final.stats?.tokensPerSecond ?? null,
    backend_device: final.stats?.backendDevice ?? null,
    duration_ms: Date.now() - t0,
    stop_reason: final.stopReason ?? "eos",
  });

  return parseMemory(final.contentText);
}

/**
 * Embed text on-device (EmbeddingGemma, L2-normalized 768-d). Logged.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const modelId = await ensureModel(embedSlot, EMBED);
  const t0 = Date.now();
  const { embedding, stats } = await embed({ modelId, text });
  logEvent({
    event: "embed",
    model: EMBED.name,
    model_id: modelId,
    dim: embedding.length,
    duration_ms: Date.now() - t0,
    tokens_per_sec: stats?.tokensPerSecond ?? null,
    backend_device: stats?.backendDevice ?? null,
  });
  return embedding;
}

/**
 * Answer a question grounded ONLY in the provided note texts. Short by design.
 * Returns the raw LLM text (may be "NOT_FOUND"); caller decides how to present it.
 * @param {string} question
 * @param {string[]} notes
 * @returns {Promise<string>}
 */
export async function answer(question, notes) {
  const modelId = await ensureModel(llmSlot, LLM);
  const context = notes.map((n, i) => `[${i + 1}] ${n}`).join("\n");

  const run = completion({
    modelId,
    history: [
      { role: "system", content: ANSWER_SYSTEM_PROMPT },
      { role: "user", content: `Notes:\n${context}\n\nQuestion: ${question}\n\nAnswer:` },
    ],
    stream: true,
  });

  const t0 = Date.now();
  let firstTokenAt = null;
  for await (const ev of run.events) {
    if (ev.type === "contentDelta" && firstTokenAt === null) firstTokenAt = Date.now();
  }
  const final = await run.final;

  logEvent({
    event: "inference",
    kind: "ask",
    model: LLM.name,
    model_id: modelId,
    prompt_len: question.length,
    prompt_tokens: final.stats?.promptTokens ?? null,
    generated_tokens: final.stats?.generatedTokens ?? null,
    ttft_ms: final.stats?.timeToFirstToken ?? (firstTokenAt ? firstTokenAt - t0 : null),
    tokens_per_sec: final.stats?.tokensPerSecond ?? null,
    backend_device: final.stats?.backendDevice ?? null,
    duration_ms: Date.now() - t0,
  });

  return (final.contentText ?? "").trim();
}

function parseMemory(contentText) {
  let obj;
  try {
    obj = JSON.parse((contentText ?? "").trim());
  } catch {
    throw new Error("LLM did not return valid JSON: " + String(contentText).slice(0, 200));
  }

  // Emotion: grammar should already constrain to EMOTION_LABELS; fall back to
  // "neutral" if anything off-list slips through (app-layer guarantee).
  let emotion = String(obj.emotion ?? "").trim().toLowerCase();
  if (!EMOTION_LABELS.includes(emotion)) emotion = "neutral";

  // Score: clamp to [-1, 1] (GBNF doesn't enforce numeric range), then align
  // its sign to the emotion label so chart (score) and filter (label) agree.
  let score = Number(obj.emotion_score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.max(-1, Math.min(1, score));
  if (POSITIVE_EMOTIONS.has(emotion) && score < 0) score = -score;
  if (NEGATIVE_EMOTIONS.has(emotion) && score > 0) score = -score;

  return {
    summary: String(obj.summary ?? "").trim(),
    emotion,
    emotion_score: score,
    // Cap at 5 (grammar doesn't enforce maxItems); dedupe.
    tags: Array.isArray(obj.tags)
      ? [...new Set(obj.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 5)
      : [],
  };
}

/** Unload all loaded models and log it. */
export async function unloadAll() {
  if (whisperId) {
    await unloadModel({ modelId: whisperId });
    logEvent({ event: "unload", model: WHISPER.name, model_id: whisperId });
    whisperId = null;
  }
  if (llmId) {
    await unloadModel({ modelId: llmId });
    logEvent({ event: "unload", model: LLM.name, model_id: llmId });
    llmId = null;
  }
  if (embedId) {
    await unloadModel({ modelId: embedId });
    logEvent({ event: "unload", model: EMBED.name, model_id: embedId });
    embedId = null;
  }
}
