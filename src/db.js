// db.js — Local memory store on node:sqlite (built-in, no external driver).
//
// Single driver / single file for both v1 (store + timeline) and v2 (semantic search):
// v2 will ADD an `embedding BLOB` column (+ JS cosine over rows), never a second DB —
// see vector.js. No vector extension, no wasm.
//
// Schema:
//   memories(id, raw_text, summary, emotion, emotion_score REAL, tags TEXT(JSON),
//            source_type TEXT('voice'|'text'), created_at TEXT(ISO))

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = resolve(__dirname, "../data/memories.sqlite");

/**
 * Open (and initialize) the memory database.
 * @param {string} [dbPath]
 * @returns {DatabaseSync}
 */
export function openDb(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  initSchema(db);
  ensureEmbeddingColumn(db); // v2 migration (additive; v1 rows backfilled at startup)
  return db;
}

// Adds the `embedding BLOB` column if it isn't there yet (v1 -> v2 migration).
function ensureEmbeddingColumn(db) {
  const cols = db.prepare("PRAGMA table_info(memories)").all();
  if (!cols.some((c) => c.name === "embedding")) {
    db.exec("ALTER TABLE memories ADD COLUMN embedding BLOB");
  }
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text      TEXT NOT NULL,
      summary       TEXT NOT NULL,
      emotion       TEXT NOT NULL,
      emotion_score REAL NOT NULL,
      tags          TEXT NOT NULL,            -- JSON array string
      source_type   TEXT NOT NULL,            -- 'voice' | 'text'
      created_at    TEXT NOT NULL             -- ISO 8601
    );
  `);
}

/**
 * Insert one memory.
 * @param {DatabaseSync} db
 * @param {{raw_text:string, summary:string, emotion:string, emotion_score:number,
 *          tags:string[], source_type:'voice'|'text', created_at?:string}} m
 * @returns {{id:number}}
 */
export function insertMemory(db, m) {
  const created_at = m.created_at ?? new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO memories (raw_text, summary, emotion, emotion_score, tags, source_type, created_at, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    m.raw_text,
    m.summary,
    m.emotion,
    m.emotion_score,
    JSON.stringify(m.tags ?? []),
    m.source_type,
    created_at,
    m.embedding ?? null
  );
  return { id: Number(info.lastInsertRowid) };
}

/** Set/replace the embedding BLOB for a memory (used by backfill). */
export function setEmbedding(db, id, blob) {
  db.prepare(`UPDATE memories SET embedding = ? WHERE id = ?`).run(blob, id);
}

/** Rows that still need an embedding (v1 memories created before v2). */
export function memoriesMissingEmbedding(db) {
  return db.prepare(`SELECT id, raw_text FROM memories WHERE embedding IS NULL`).all();
}

/** Memories that have an embedding, including the raw BLOB (for semantic search). */
export function memoriesWithEmbedding(db) {
  return db
    .prepare(`SELECT id, raw_text, summary, emotion, emotion_score, created_at, embedding
              FROM memories WHERE embedding IS NOT NULL`)
    .all();
}

function rowToMemory(row) {
  return {
    id: row.id,
    raw_text: row.raw_text,
    summary: row.summary,
    emotion: row.emotion,
    emotion_score: row.emotion_score,
    tags: safeParseTags(row.tags),
    source_type: row.source_type,
    created_at: row.created_at,
  };
}

function safeParseTags(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** List memories, newest first. */
export function listMemories(db, { limit = 500 } = {}) {
  const rows = db.prepare(`SELECT * FROM memories ORDER BY created_at DESC, id DESC LIMIT ?`).all(limit);
  return rows.map(rowToMemory);
}

/** Get one memory by id (or undefined). */
export function getMemory(db, id) {
  const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id);
  return row ? rowToMemory(row) : undefined;
}

/** Count memories. */
export function countMemories(db) {
  return db.prepare(`SELECT COUNT(*) AS n FROM memories`).get().n;
}
