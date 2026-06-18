// gate3-test.js — RAG/embeddings validation gate (run BEFORE building v2).
//
// Measures what the v2 demo will actually do — FACT RETRIEVAL:
//   1. Embed 5 fixture memories (EMBEDDINGGEMMA, on-device).
//   2. For each query: embed -> cosine vs all memories -> rank -> top-3.
//   3. Report in-topic vs cross-topic separation + whether expected id in top-3.
//   4. Feed top-3 to the LLM with a strict grounding prompt; print the answer.
//
// PASS (you judge): expected memory in top-3 for >= 2/3 queries AND the LLM
// answers only from retrieved memories (no fabricated facts). Vietnamese query
// must pull the right Vietnamese memory.
//
// Run: node src/gate3-test.js

import {
  loadModel, unloadModel, embed, completion,
  EMBEDDINGGEMMA_300M_Q8_0, LLAMA_3_2_1B_INST_Q4_0,
} from "@qvac/sdk";
import { cosine } from "./vector.js";
import { logEvent } from "./logger.js";
import { memories, queries } from "./gate3-fixture.js";

// --- Guard: fixture must be filled ---
if (memories.some((m) => !m.text.trim()) || queries.some((q) => !q.q.trim() || q.expectedIds.length === 0)) {
  console.error("❌ gate3-fixture.js is not filled in. Add 5 memory texts and 3 queries with expectedIds.");
  process.exit(1);
}

const TOP_K = 3;

try {
  console.log("=== GATE 3 — RAG / Embeddings validation ===\n");

  // 1. Embed memories
  const embId = await loadModel({ modelSrc: EMBEDDINGGEMMA_300M_Q8_0 });
  logEvent({ event: "load", model: "EMBEDDINGGEMMA_300M_Q8_0", model_id: embId });
  console.log("Embedding 5 memories...");
  for (const m of memories) {
    const { embedding, stats } = await embed({ modelId: embId, text: m.text });
    m.vec = Float32Array.from(embedding);
    logEvent({ event: "embed", model: "EMBEDDINGGEMMA_300M_Q8_0", model_id: embId,
      dim: embedding.length, backend_device: stats?.backendDevice ?? null });
  }

  // 2 + 3. Retrieve per query, measure separation
  const retrieval = [];
  let inTopicSum = 0, inTopicN = 0, crossSum = 0, crossN = 0;

  for (const query of queries) {
    const { embedding } = await embed({ modelId: embId, text: query.q });
    const qvec = Float32Array.from(embedding);
    const ranked = memories
      .map((m) => ({ id: m.id, topic: m.topic, score: cosine(qvec, m.vec) }))
      .sort((a, b) => b.score - a.score);

    const top = ranked.slice(0, TOP_K);
    const hit = query.expectedIds.some((id) => top.some((r) => r.id === id));
    retrieval.push({ query, ranked, top, hit });

    for (const r of ranked) {
      if (query.expectedIds.includes(r.id)) { inTopicSum += r.score; inTopicN++; }
      else { crossSum += r.score; crossN++; }
    }

    console.log(`\n[${query.lang}] "${query.q}"  (expected: ${query.expectedIds.join(",")})`);
    for (const r of ranked) {
      const mark = query.expectedIds.includes(r.id) ? " <= EXPECTED" : "";
      const intop = top.some((t) => t.id === r.id) ? "*" : " ";
      console.log(`   ${intop} #${r.id} ${r.topic.padEnd(13)} ${r.score.toFixed(4)}${mark}`);
    }
    console.log(`   -> expected in top-${TOP_K}: ${hit ? "✅ YES" : "❌ NO"}`);
  }

  await unloadModel({ modelId: embId });
  logEvent({ event: "unload", model: "EMBEDDINGGEMMA_300M_Q8_0", model_id: embId });

  const inTopicAvg = inTopicSum / inTopicN;
  const crossAvg = crossSum / crossN;
  console.log(`\n--- Separation (the real signal, not a lone number) ---`);
  console.log(`   in-topic avg cosine:    ${inTopicAvg.toFixed(4)}`);
  console.log(`   cross-topic avg cosine: ${crossAvg.toFixed(4)}`);
  console.log(`   gap: ${(inTopicAvg - crossAvg).toFixed(4)}  (bigger = embeddings discriminate well)`);

  const hits = retrieval.filter((r) => r.hit).length;
  console.log(`\n   retrieval hits: ${hits}/${queries.length} (need >= 2)`);

  // 4. LLM grounding on the retrieved context
  console.log(`\n--- LLM answers grounded ONLY in retrieved memories ---`);
  const llmId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 });
  logEvent({ event: "load", model: "LLAMA_3_2_1B_INST_Q4_0", model_id: llmId });

  for (const { query, top } of retrieval) {
    const context = top.map((t) => `- (memory #${t.id}) ${memories.find((m) => m.id === t.id).text}`).join("\n");
    const run = completion({
      modelId: llmId,
      history: [
        { role: "system", content: "Answer the user's question using ONLY the provided memories. If the answer is not in them, reply exactly: \"I don't have a memory about that.\" Do not invent facts. Answer in the same language as the question." },
        { role: "user", content: `Memories:\n${context}\n\nQuestion: ${query.q}` },
      ],
      stream: false,
    });
    const final = await run.final;
    logEvent({ event: "inference", model: "LLAMA_3_2_1B_INST_Q4_0", model_id: llmId,
      ttft_ms: final.stats?.timeToFirstToken ?? null, tokens_per_sec: final.stats?.tokensPerSecond ?? null,
      backend_device: final.stats?.backendDevice ?? null });
    console.log(`\nQ [${query.lang}]: ${query.q}`);
    console.log(`A: ${final.contentText.trim()}`);
  }

  await unloadModel({ modelId: llmId });
  logEvent({ event: "unload", model: "LLAMA_3_2_1B_INST_Q4_0", model_id: llmId });

  console.log(`\n=== GATE 3 SUMMARY — YOU JUDGE ===`);
  console.log(`Retrieval: ${hits}/${queries.length} expected memories in top-${TOP_K} (auto-pass threshold: >=2)`);
  console.log(`Separation gap: ${(inTopicAvg - crossAvg).toFixed(4)}`);
  console.log(`Read the answers above: PASS if no fabricated facts + Vietnamese query worked.`);
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
