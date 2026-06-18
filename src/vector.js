// vector.js — Embedding <-> BLOB serialization + similarity math (all local, no inference).
//
// THE TRAP this module exists to neutralize: a Node Buffer read back from SQLite is
// usually a slice of a shared ArrayBuffer pool, so it has a NON-ZERO byteOffset and may
// be 4-byte-misaligned. Doing `new Float32Array(buf.buffer)` then (a) ignores byteOffset
// → reads pool garbage, or (b) throws "start offset must be a multiple of 4".
// blobToVector() copies the exact bytes into a fresh aligned ArrayBuffer to be bulletproof.

/**
 * Serialize a vector to a Buffer for BLOB storage.
 * @param {number[]|Float32Array} vec
 * @returns {Buffer}
 */
export function vectorToBlob(vec) {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
 * Deserialize a BLOB back to a Float32Array, honoring byteOffset and alignment.
 * @param {Buffer|Uint8Array} blob
 * @param {number} dim - expected number of floats
 * @returns {Float32Array}
 */
export function blobToVector(blob, dim) {
  const expected = dim * 4;
  if (blob.byteLength !== expected) {
    throw new Error(`blob length ${blob.byteLength} != dim*4 (${expected})`);
  }
  // Copy exact source bytes (respecting source byteOffset) into a fresh, aligned buffer.
  const ab = new ArrayBuffer(expected);
  new Uint8Array(ab).set(new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength));
  return new Float32Array(ab);
}

/** Dot product. */
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** L2 norm. */
export function l2norm(a) {
  return Math.sqrt(dot(a, a));
}

/**
 * Cosine similarity with div-by-zero guard. If both inputs are L2-normalized,
 * this equals the dot product (callers may use dot() directly as an optimization).
 */
export function cosine(a, b) {
  const na = l2norm(a);
  const nb = l2norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}
