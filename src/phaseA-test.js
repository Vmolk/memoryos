// phaseA-test.js — Phase A acceptance test.
// Verifies BOTH capture modes produce a valid 4-field memory JSON + write logs.
//   1. text  -> organize
//   2. voice -> transcribeAudio -> organize
// Run: node src/phaseA-test.js

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transcribeAudio, organize, unloadAll, EMOTION_LABELS } from "./qvac.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_AUDIO = resolve(__dirname, "../samples/demo-vi.m4a");

const NEGATIVE = new Set(["anxious", "sad", "angry"]);
const POSITIVE = new Set(["joyful", "grateful", "calm"]);

function validate(mem, label) {
  const fieldsOk =
    typeof mem.summary === "string" && mem.summary.length > 0 &&
    typeof mem.emotion === "string" && mem.emotion.length > 0 &&
    typeof mem.emotion_score === "number" && mem.emotion_score >= -1 && mem.emotion_score <= 1 &&
    Array.isArray(mem.tags) && mem.tags.length > 0;
  // Empirical proof the enum grammar holds: emotion must be in the fixed list.
  const enumOk = EMOTION_LABELS.includes(mem.emotion);
  // Sign alignment: label and score must not contradict.
  const signOk =
    !(NEGATIVE.has(mem.emotion) && mem.emotion_score > 0) &&
    !(POSITIVE.has(mem.emotion) && mem.emotion_score < 0);
  const ok = fieldsOk && enumOk && signOk;
  console.log(`\n[${label}] 4-field=${fieldsOk ? "✅" : "❌"} enum=${enumOk ? "✅" : "❌"} sign=${signOk ? "✅" : "❌"}`);
  console.log(JSON.stringify(mem, null, 2));
  return ok;
}

try {
  console.log("=== PHASE A — Capture + Organize ===");

  // --- Mode 1: TEXT ---
  console.log("\n--- Mode 1: TEXT capture ---");
  const sampleText =
    "Hôm nay mình hoàn thành xong phần pipeline AI chạy local, thấy nhẹ cả người. " +
    "Hơi mệt vì thức khuya nhưng rất hứng khởi vì mọi thứ cuối cùng cũng chạy được.";
  console.log(`Input: "${sampleText}"`);
  const mem1 = await organize(sampleText);
  const ok1 = validate(mem1, "TEXT");

  // --- Mode 2: VOICE ---
  console.log("\n--- Mode 2: VOICE capture ---");
  console.log(`Audio: ${SAMPLE_AUDIO}`);
  const transcript = await transcribeAudio(SAMPLE_AUDIO);
  console.log(`Transcript: "${transcript}"`);
  const mem2 = await organize(transcript);
  const ok2 = validate(mem2, "VOICE");

  await unloadAll();

  console.log("\n=== RESULT ===");
  console.log(`TEXT mode:  ${ok1 ? "PASS" : "FAIL"}`);
  console.log(`VOICE mode: ${ok2 ? "PASS" : "FAIL"}`);
  console.log("Logs written to logs/inference.jsonl");
  process.exit(ok1 && ok2 ? 0 : 1);
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
