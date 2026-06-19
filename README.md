# MemoryOS

> A privacy-first AI memory companion that helps you remember what matters — not everything.
> Powered entirely by on-device AI (QVAC SDK). **Nothing leaves your machine.**

MemoryOS is **not** a screen recorder, spyware, activity tracker, or keylogger. It only remembers
what you choose to save. **Intentional. Private. Useful.** Memory should be understood, not just stored.

---

## ⛔ PRE-SUBMIT CHECKLIST (do not ship until all checked)

- [ ] **Fill author/team name** below (replace `[TODO: AUTHOR/TEAM]`).
- [ ] **Paste the public GitHub URL** below and in the submission form (replace `[TODO: GITHUB URL]`).
      The repo must be **pushed to a public GitHub** — judges clone this to run it.
- [ ] **Regenerate `logs/demo-run.jsonl` in the SAME session as the demo video**, using the
      **same** `samples/demo-vi.m4a`. Log ↔ video ↔ hardware numbers must match. Re-shoot + regenerate
      if v2 changes the demo. (See [DEMO.md](DEMO.md).)
- [ ] **Remote audit**: `grep -rniE "https?:|//|cdn|googleapis|fonts\.|analytics" public/` returns
      only comments → confirms `disclosure.json` (empty remote calls) is true.
- [ ] **Dry-run reproducibility**: on a clean checkout, `npm install` → `npm start` → open the app →
      capture a memory. Confirm it works before submitting.

---

## Pipeline

```
Capture (you decide)  →  AI Organizes  →  Local Memory  →  Reflection
```

1. **Capture** — You actively choose what's worth remembering (text or voice). No background collection.
2. **AI Organizes** — On-device LLM turns raw input into a structured memory: summary, emotion, score, tags.
3. **Local Memory** — Everything stored locally in SQLite. (v2: embeddings for semantic search.)
4. **Reflection** — A timeline + emotion-over-time chart to look back and understand yourself.

## Stack

- **Node.js** (tested on v24.15.0) + **Express** + plain HTML/CSS/JS (no CDN, no framework, no remote fonts).
- **SQLite** via Node's built-in `node:sqlite` (single driver; no external DB, no native extension).
- **[`@qvac/sdk`](https://www.npmjs.com/package/@qvac/sdk) `0.13.3`** (pinned, exact) — all inference on-device.

## Models (downloaded automatically on first use, from the QVAC registry)

| Role | Model | Approx size |
|------|-------|-------------|
| LLM (organize / answer) | `LLAMA_3_2_1B_INST_Q4_0` | ~0.7 GB |
| Transcription (voice)   | `WHISPER_TINY`           | ~75 MB  |
| Embeddings (v2 search)  | `EMBEDDINGGEMMA_300M_Q8_0` | ~0.3 GB |

> Model weights are **not** committed (git-ignored). The QVAC SDK fetches them from its registry on
> first run (needs internet **once**, ~1.1 GB total, cached under `~/.qvac/models`). After that the
> app runs **fully offline** — no further network calls.

## Install & run

```bash
npm install         # installs @qvac/sdk@0.13.3 + express
npm run fetch-models # one-time: downloads the 3 on-device models (~1.1 GB, needs internet once)
npm start           # starts the server (default http://localhost:3777)
```

Open **http://localhost:3777**, choose **Text** or **Voice**, capture a memory, then switch to
**Timeline** to see it, the emotion chart, and **Ask** (semantic search over your memories).

> `npm run fetch-models` is optional but recommended — it pre-caches models so your first capture
> isn't waiting on a download. If you skip it, the first capture downloads models lazily. Either way,
> after the one-time download the app runs **fully offline**.

## On-device & privacy

- **Zero cloud AI.** Every inference (LLM, transcription, embeddings) runs locally via QVAC.
  The structured inference log (`logs/inference.jsonl`) records `backend_device` (cpu/gpu),
  TTFT and tokens/sec as evidence.
- **Zero remote at runtime**, including the frontend — system font stack, no CDN, no analytics.
  See [`disclosure.json`](disclosure.json): `remote_api_calls` is empty.
- Cosine similarity for semantic search (v2) is plain local arithmetic, not inference.

## Hardware (this build was developed/verified on)

- **CPU:** AMD Ryzen 9 7900X (12-core)
- **RAM:** 31.6 GB
- **GPU:** AMD Radeon RX 5700 XT (inference ran on GPU: `backend_device: "gpu"`)
- **OS:** Windows 11 Pro · **Node.js:** v24.15.0

## Project

- **Author/Team:** `[TODO: AUTHOR/TEAM]`  <!-- fill before submitting the DoraHacks form -->
- **Repository:** https://github.com/Vmolk/memoryos
- **Hackathon:** QVAC Hackathon I (Tether)

## License

Apache-2.0 — see [LICENSE](LICENSE).
