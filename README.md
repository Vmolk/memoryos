# MemoryOS

> A privacy-first AI memory companion that helps you remember what matters — not everything.
> Powered entirely by on-device AI (QVAC SDK). **Nothing leaves your machine.**

MemoryOS is **not** a screen recorder, spyware, activity tracker, or keylogger. It only remembers
what you choose to save. **Intentional. Private. Useful.** Memory should be understood, not just stored.

> ⚠️ Phase -1 scaffold. This README is a stub — full pitch, hardware specs, install/run steps,
> model-download command, and disclosure are completed in Phase E.

## Pipeline

```
Capture (you decide)  →  AI Organizes  →  Local Memory  →  Reflection
```

## Stack

- Node.js + Express + plain HTML/CSS/JS (no CDN, no framework)
- SQLite (local) for memory storage
- [`@qvac/sdk`](https://www.npmjs.com/package/@qvac/sdk) `0.13.3` (pinned) — all inference on-device

## Setup (filled out in Phase E)

```bash
npm install
npm start
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
