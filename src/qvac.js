// qvac.js — QVAC SDK wrapper + logging harness.
// Phase A will implement: loadModel/unloadModel helpers, transcribe(), organize() (LLM),
// embed(), all routed through a single logInference() that appends one JSON line per call to
// logs/ with { timestamp, model, event, prompt_len, promptTokens, generatedTokens,
// ttft_ms, tokens_per_sec, backend_device }. STUB — no logic yet.
