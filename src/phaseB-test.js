// phaseB-test.js — Phase B acceptance: a captured memory is stored and reads back
// across a close/reopen (durable). No LLM needed (deterministic + fast).
// Run: node src/phaseB-test.js

import { rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, insertMemory, listMemories, getMemory, countMemories } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = resolve(__dirname, "../data/test-phaseB.sqlite");

for (const ext of ["", "-wal", "-shm"]) {
  try { rmSync(TEST_DB + ext); } catch {}
}

const sample = {
  raw_text: "Hôm nay mình hoàn thành pipeline AI chạy local, thấy nhẹ cả người.",
  summary: "Tôi vừa hoàn thành pipeline AI chạy local và thấy nhẹ nhõm.",
  emotion: "grateful",
  emotion_score: 0.7,
  tags: ["pipeline", "local", "ai"],
  source_type: "text",
};

console.log("=== PHASE B — Local Memory ===");

// Write, then close.
let db = openDb(TEST_DB);
const { id } = insertMemory(db, sample);
console.log(`Inserted memory id=${id}, count=${countMemories(db)}`);
db.close();

// Reopen a fresh handle → durability proof.
db = openDb(TEST_DB);
const got = getMemory(db, id);
const list = listMemories(db);
db.close();

const ok =
  got &&
  got.raw_text === sample.raw_text &&
  got.summary === sample.summary &&
  got.emotion === sample.emotion &&
  got.emotion_score === sample.emotion_score &&
  Array.isArray(got.tags) && got.tags.join(",") === sample.tags.join(",") &&
  got.source_type === sample.source_type &&
  typeof got.created_at === "string" && got.created_at.length > 0 &&
  list.length === 1;

console.log("\nRead back after reopen:");
console.log(JSON.stringify(got, null, 2));
console.log(`\ntags is array: ${Array.isArray(got.tags)} | emotion_score is number: ${typeof got.emotion_score === "number"}`);
console.log(`\n=== RESULT: ${ok ? "PASS ✅" : "FAIL ❌"} (durable round-trip of all fields) ===`);
process.exit(ok ? 0 : 1);
