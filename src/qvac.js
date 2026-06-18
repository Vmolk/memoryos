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
  WHISPER_TINY,
  LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";
import { logEvent } from "./logger.js";

const WHISPER = { name: "WHISPER_TINY", src: WHISPER_TINY };
const LLM = { name: "LLAMA_3_2_1B_INST_Q4_0", src: LLAMA_3_2_1B_INST_Q4_0 };

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

// emotion_score is a float in [-1.0, 1.0]: -1 = very negative, +1 = very positive.
// emotion is a short lowercase label (e.g. "joyful", "anxious", "calm").
// tags is an array of 1-5 short lowercase keywords.
const MEMORY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    emotion: { type: "string" },
    emotion_score: { type: "number" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "emotion", "emotion_score", "tags"],
  additionalProperties: false,
};

const ORGANIZE_SYSTEM_PROMPT = `You turn a raw personal note into a structured memory. Return ONLY valid JSON matching the schema.
Rules:
- summary: 1-2 sentences, first person, written in the SAME language as the input note.
- emotion: ONE short lowercase English label for the dominant feeling (e.g. "joyful", "anxious", "calm", "sad", "angry", "neutral").
- emotion_score: a float between -1.0 and 1.0 (-1.0 = very negative, 0 = neutral, 1.0 = very positive).
- tags: 1-5 short lowercase keywords capturing the key topics/entities of the note.
Do not add any text outside the JSON.`;

let whisperId = null;
let llmId = null;

// Object wrappers so ensureModel can read/write the module-level ids.
const whisperSlot = { get id() { return whisperId; }, set id(v) { whisperId = v; } };
const llmSlot = { get id() { return llmId; }, set id(v) { llmId = v; } };

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

function parseMemory(contentText) {
  let obj;
  try {
    obj = JSON.parse((contentText ?? "").trim());
  } catch {
    throw new Error("LLM did not return valid JSON: " + String(contentText).slice(0, 200));
  }
  // Normalize / clamp as a safety net (GBNF doesn't enforce numeric range).
  const score = Number(obj.emotion_score);
  return {
    summary: String(obj.summary ?? "").trim(),
    emotion: String(obj.emotion ?? "neutral").trim().toLowerCase(),
    emotion_score: Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0,
    tags: Array.isArray(obj.tags) ? obj.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
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
}
