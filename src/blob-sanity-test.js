// blob-sanity-test.js — Retires the two silent-bug risks of the BLOB/cosine plan
// BEFORE Phase D depends on them:
//   Trap #1: embed -> BLOB -> read back -> cosine-with-self MUST be ~1.0
//            (catches byteOffset / alignment / pool-aliasing corruption).
//   Trap #2: report whether QVAC embeddings are already L2-normalized
//            (if norm ~= 1.0, v2 cosine can be a plain dot product).
// Also confirms the embedding model loads on-device and reports its dimension.
// Run: node src/blob-sanity-test.js

import { DatabaseSync } from "node:sqlite";
import { loadModel, unloadModel, embed, EMBEDDINGGEMMA_300M_Q8_0 } from "@qvac/sdk";
import { vectorToBlob, blobToVector, cosine, l2norm, dot } from "./vector.js";
import { logEvent } from "./logger.js";

try {
  console.log("=== BLOB Sanity Test (Gate-3 prerequisite) ===");

  const t0 = Date.now();
  const modelId = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
  logEvent({ event: "load", model: "EMBEDDINGGEMMA_300M_Q8_0", model_id: modelId, duration_ms: Date.now() - t0 });
  console.log(`Embedding model loaded: ${modelId}`);

  const text = "Hôm nay mình học về Rust và thấy ownership rất thú vị.";
  const te = Date.now();
  const { embedding, stats } = await embed({ modelId, text });
  logEvent({
    event: "embed",
    model: "EMBEDDINGGEMMA_300M_Q8_0",
    model_id: modelId,
    dim: embedding.length,
    duration_ms: Date.now() - te,
    tokens_per_sec: stats?.tokensPerSecond ?? null,
    backend_device: stats?.backendDevice ?? null,
  });

  const dim = embedding.length;
  console.log(`\nDimension: ${dim}`);
  console.log(`backend_device: ${stats?.backendDevice ?? "n/a"} (on-device proof)`);

  // --- Trap #2: L2-normalized? ---
  const norm = l2norm(Float32Array.from(embedding));
  const normalized = Math.abs(norm - 1.0) < 1e-3;
  console.log(`\n[Trap #2] L2 norm of raw embedding: ${norm.toFixed(6)} -> ${normalized ? "NORMALIZED (cosine == dot)" : "NOT normalized (use full cosine)"}`);

  // --- Trap #1: BLOB round-trip through SQLite ---
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, emb BLOB)");
  db.prepare("INSERT INTO t(emb) VALUES (?)").run(vectorToBlob(embedding));
  const row = db.prepare("SELECT emb FROM t WHERE id = 1").get();
  db.close();

  const restored = blobToVector(row.emb, dim);
  const selfCos = cosine(Float32Array.from(embedding), restored);
  const maxAbsDiff = Math.max(...embedding.map((v, i) => Math.abs(v - restored[i])));

  console.log(`\n[Trap #1] BLOB round-trip:`);
  console.log(`  restored length: ${restored.length} (expected ${dim})`);
  console.log(`  max abs element diff: ${maxAbsDiff}`);
  console.log(`  cosine(original, restored): ${selfCos.toFixed(8)}`);

  const trap1Ok = restored.length === dim && maxAbsDiff === 0 && Math.abs(selfCos - 1.0) < 1e-6;

  // Sanity: cosine distinguishes related vs unrelated text.
  const { embedding: e2 } = await embed({ modelId, text: "Tôi lo lắng về tài chính tháng này." });
  const relCos = cosine(Float32Array.from(embedding), Float32Array.from(e2));
  console.log(`\n  cosine(Rust note, finance-worry note): ${relCos.toFixed(4)} (should be clearly < 1.0)`);

  await unloadModel({ modelId });
  logEvent({ event: "unload", model: "EMBEDDINGGEMMA_300M_Q8_0", model_id: modelId });

  console.log(`\n=== RESULT: ${trap1Ok ? "PASS ✅" : "FAIL ❌"} (exact BLOB round-trip, cosine-self == 1.0) ===`);
  process.exit(trap1Ok ? 0 : 1);
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
