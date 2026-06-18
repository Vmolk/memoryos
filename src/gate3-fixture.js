// gate3-fixture.js — FILL THIS IN (you author it so the gate stays honest).
//
// 5 memories with DISTINCT topics + 3 fact-retrieval queries, each with the
// memory id(s) that SHOULD be retrieved (decided in advance). Include >= 1
// Vietnamese query (the known risk direction).
//
// Rules for a meaningful gate:
//  - Topics must be separable (Rust / a meeting / work-emotion / health / finance).
//  - Queries are FACT-RETRIEVAL ("which memory mentions X?"), NOT synthesis
//    ("how did I change over 6 months?") — small-RAG hallucinates on synthesis.
//  - Mix Vietnamese + English memories; at least one query in Vietnamese.

export const memories = [
  { id: 1, topic: "rust",         text: "" },
  { id: 2, topic: "meeting",      text: "" },
  { id: 3, topic: "work-emotion", text: "" },
  { id: 4, topic: "health",       text: "" },
  { id: 5, topic: "finance",      text: "" },
];

export const queries = [
  // expectedIds = the memory id(s) that MUST appear in top-3 for this query.
  { q: "", expectedIds: [], lang: "en" },
  { q: "", expectedIds: [], lang: "vi" }, // keep at least one Vietnamese query
  { q: "", expectedIds: [], lang: "en" },
];
