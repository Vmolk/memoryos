# MemoryOS — Demo script (≤ 5 minutes)

**Locked, single-pass shot list.** Record one clean take that hits every judged beat.
The log (`logs/demo-run.jsonl`) and the video MUST come from the **same session** so the numbers
match what's on screen — don't pre-generate the log, don't stitch runs.

## Honesty rule (warm/cold)

Record from a **genuinely cold** state. The **first** inference of the session shows a ~1s pause on
camera — that's fine and honest. Later answers are naturally warm/fast. Because the log is captured
from this same session, it is **cold-first-then-warm by construction** → it matches the video without
any editing. Headline metric = the cold-start number. Never warm the model off-camera then present
warm numbers as if cold.

## Before recording (off camera)

1. **Pre-cache models once** so the video isn't a 1GB download (run the app, do one capture, stop).
2. Clean state so the log + timeline are clean:
   ```bash
   rm -f logs/inference.jsonl data/memories.sqlite data/memories.sqlite-*
   ```
3. Have the system profiler / Task Manager open (to show GPU activity), and `samples/demo-vi.m4a` ready.
4. `npm start` → open http://localhost:3777. **Do NOT capture anything yet** (keep it cold for the take).

## On camera — shot list (target ~4:30, leaves buffer)

| # | Beat | ~Time | What to show |
|---|------|-------|--------------|
| 1 | **Intro + on-device claim** | 0:00–0:20 | "MemoryOS — on-device AI memory. Nothing leaves my machine." Show GPU in the profiler. |
| 2 | **Capture → Organize (text, VI)** | 0:20–1:10 | Type a short Vietnamese note → **Save**. First inference (~1s cold pause). Show organized result: summary / emotion / score / tags. |
| 3 | **Capture → Organize (voice)** | 1:10–2:10 | Voice tab → upload **`samples/demo-vi.m4a`** → **Transcribe & save**. Show transcript → organized memory. (Same `.m4a` as the log. No live mic — browser `webm` isn't a QVAC format and would desync.) |
| 4 | **Local Memory → Reflection** | 2:10–2:50 | Timeline tab: memory list + emotion chart (fixed −1..+1 axis, zero baseline, colored dots). |
| 5 | **Ask v2 — grounded answer** | 2:50–3:40 | Ask the **VI work-feeling** question (the one the LLM answers cleanly) → grounded answer + the matched memory shown beneath as evidence. |
| 6 | **Ask v2 — honest refusal** | 3:40–4:10 | Ask something **not** in memory (e.g. "what did I eat for dinner?") → "Mình không có memory nào về việc này." This *is* the "intentional/honest memory" pitch — show it deliberately. |
| 7 | **Proof artifacts** | 4:10–4:40 | Show `logs/inference.jsonl`: `backend_device: "gpu"`, cold `ttft_ms`, `tokens_per_sec`. Show `disclosure.json` (`remote_api_calls: []`). Optionally: network tab silent. |

> Beat 5 query is fixed because 1B answers it cleanly; beat 6 proves refusal. Retrieval is the star,
> the LLM answer is a bonus — if it wobbles, the matched-memory card beneath still carries the point.

## Right after recording (same session)

```bash
cp logs/inference.jsonl logs/demo-run.jsonl
git add logs/demo-run.jsonl && git commit -m "demo-run log (matches submission video)"
```

> Re-recording (e.g. after any change) means regenerating `logs/demo-run.jsonl` the same way.
> The log is never "locked once" — it must always match the current video.
