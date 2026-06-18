# MemoryOS — Demo script (≤ 5 minutes)

**Locked sequence for the submission video.** The log (`logs/demo-run.jsonl`) and the video MUST
come from the **same session** so the numbers match what's on screen. Don't pre-generate the log.

## Before recording

1. Make sure models are already cached (do one warm-up run first, so the video isn't 1GB of download).
2. **Clear the running log** so the demo log is clean:
   ```bash
   rm -f logs/inference.jsonl
   ```
3. Start fresh data (optional, for a clean timeline):
   ```bash
   rm -f data/memories.sqlite data/memories.sqlite-*
   ```
4. `npm start` → open http://localhost:3777.

## On camera (the exact sequence)

1. **Intro (15s):** one line — "MemoryOS: on-device AI memory. Nothing leaves my machine."
2. **Capture #1 — text (VI):** type a short Vietnamese note about today → **Save**. Show the AI-organized
   result (summary / emotion / score / tags) appearing.
3. **Capture #2 — voice:** Voice tab → upload **`samples/demo-vi.m4a`** (the SAME file referenced in the log)
   → **Transcribe & save**. Show transcript → organized memory.
   > Use this exact `.m4a` (short, clear, slow speech). Do NOT live-mic-record — browser records `webm`,
   > which QVAC's transcription doesn't accept, and a different audio source would desync log ↔ video.
4. **Timeline:** switch to Timeline → show the memory list + the emotion chart (zero baseline, colored dots).
5. **(v2, only if built) Ask:** ask one **fact-retrieval** question ("which memory is about X?") →
   show the grounded answer pulled from local memories. (Avoid open-ended synthesis questions.)
6. **Proof of on-device (30s):** show `logs/inference.jsonl` — point at `backend_device`, `ttft_ms`,
   `tokens_per_sec`. Show `disclosure.json` (`remote_api_calls: []`). Optionally show the network tab is silent.

## Right after recording (same session)

```bash
cp logs/inference.jsonl logs/demo-run.jsonl
git add logs/demo-run.jsonl && git commit -m "demo-run log (matches submission video)"
```

> If you re-record (e.g. after v2 lands), regenerate `logs/demo-run.jsonl` the same way. The log is
> not "locked once" — it must always match the current video.

## Headline metric (avoid cherry-pick optics)

Quote the **cold-start** TTFT as the headline number (first inference after model load). The much
faster warm numbers are a bonus — show them with context, not as the lone figure.
