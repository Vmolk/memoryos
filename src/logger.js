// logger.js — Inference logging harness (Phase A).
//
// Every QVAC call (load / unload / transcribe / inference / embed) is routed through
// logEvent(), which appends ONE JSON object per line to logs/inference.jsonl.
// This is the evidence artifact the hackathon judges use to verify on-device execution
// (TTFT, tokens/sec, backend_device). Logging must never throw into the pipeline.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE = resolve(__dirname, "../logs/inference.jsonl");

/**
 * Append a structured event to the JSONL log.
 * @param {object} record - event fields (event, model, ttft_ms, tokens_per_sec, ...)
 * @returns {object} the same record (for convenient chaining)
 */
export function logEvent(record) {
  const entry = { ts: new Date().toISOString(), ...record };
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch (err) {
    // A logging failure must never break inference.
    console.error("[logger] failed to write log:", err.message);
  }
  return entry;
}

export { LOG_FILE };
