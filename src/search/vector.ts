import type { ScoredIndex } from './keyword';

/**
 * Brute-force cosine similarity over int8-quantized, unit-normalized embeddings.
 *
 * Each stored vector is `round(unit_vector * 127)`. With a unit-length query,
 * the dot product of the query and a stored row is proportional to cosine
 * similarity, so we can rank by the raw dot product and divide by 127 to recover
 * an approximate cosine score. 74k rows × 384 dims is a few ms in plain JS.
 */
export class VectorIndex {
  private readonly count: number;

  constructor(
    private readonly data: Int8Array,
    private readonly dim: number,
  ) {
    this.count = data.length / dim;
    if (!Number.isInteger(this.count)) {
      throw new Error(`embedding buffer length ${data.length} not divisible by dim ${dim}`);
    }
  }

  /** @param query unit-length embedding of the search text. */
  search(query: Float32Array, topK = 20): ScoredIndex[] {
    if (query.length !== this.dim) {
      throw new Error(`query dim ${query.length} != index dim ${this.dim}`);
    }
    const { data, dim, count } = this;
    const scored: ScoredIndex[] = new Array(count);
    for (let i = 0; i < count; i++) {
      let dot = 0;
      const base = i * dim;
      for (let d = 0; d < dim; d++) dot += query[d] * data[base + d];
      scored[i] = { index: i, score: dot / 127 };
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}

/** Quantize a unit-length float vector to int8 (build-time helper). */
export function quantize(unit: Float32Array): Int8Array {
  const out = new Int8Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    out[i] = Math.max(-127, Math.min(127, Math.round(unit[i] * 127)));
  }
  return out;
}

/** L2-normalize a vector in place and return it. */
export function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}
