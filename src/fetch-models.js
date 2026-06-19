// fetch-models.js — one-time model pre-download (reproducibility helper).
// Run `npm run fetch-models` after `npm install` to pull all three on-device models
// from the QVAC registry into the local cache (~/.qvac/models), so the first real
// capture/ask in the app (and in the demo video) isn't waiting on a ~1.1GB download.
//
// Needs internet ONCE. After this, the app runs fully offline.

import {
  loadModel, unloadModel,
  WHISPER_TINY, LLAMA_3_2_1B_INST_Q4_0, EMBEDDINGGEMMA_300M_Q8_0,
} from "@qvac/sdk";

const MODELS = [
  { name: "WHISPER_TINY", src: WHISPER_TINY },
  { name: "LLAMA_3_2_1B_INST_Q4_0", src: LLAMA_3_2_1B_INST_Q4_0 },
  { name: "EMBEDDINGGEMMA_300M_Q8_0", src: EMBEDDINGGEMMA_300M_Q8_0 },
];

try {
  for (const m of MODELS) {
    process.stdout.write(`\nFetching ${m.name} ... `);
    const id = await loadModel({
      modelSrc: m.src,
      onProgress: (p) => process.stdout.write(`\rFetching ${m.name} ... ${p.percentage.toFixed(0)}%   `),
    });
    await unloadModel({ modelId: id });
    process.stdout.write(`\rFetching ${m.name} ... done ✓            `);
  }
  console.log("\n\nAll models cached. The app now runs fully offline.");
  process.exit(0);
} catch (error) {
  console.error("\n❌ Error fetching models:", error);
  process.exit(1);
}
