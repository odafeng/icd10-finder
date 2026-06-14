import { describe, it, expect } from 'vitest';
import { SearchEngine } from '../src/search/engine';
import { VectorIndex, quantize, normalize } from '../src/search/vector';
import type { Embedder, IcdRecord } from '../src/search/types';

const records: IcdRecord[] = [
  { code: 'C18.7', name: 'Malignant neoplasm of sigmoid colon' },
  { code: 'K62.1', name: 'Rectal polyp' },
  { code: 'E11.9', name: 'Type 2 diabetes mellitus without complications' },
];

// One synthetic 2D vector per record; a query embedding near record 0.
const dim = 2;
const vecs = [
  normalize(new Float32Array([1, 0])),
  normalize(new Float32Array([0, 1])),
  normalize(new Float32Array([-1, 0])),
];
const buf = new Int8Array(records.length * dim);
vecs.forEach((v, i) => buf.set(quantize(v), i * dim));
const vectorIndex = new VectorIndex(buf, dim);
const embedder: Embedder = async () => normalize(new Float32Array([1, 0.05]));

describe('SearchEngine', () => {
  it('runs keyword-only when no embedder/vector index is supplied', async () => {
    const engine = new SearchEngine({ records });
    const results = await engine.search('rectal polyp');
    expect(results[0].code).toBe('K62.1');
    expect(results[0].sources).toEqual(['keyword']);
  });

  it('fuses keyword and vector hits and labels sources', async () => {
    const engine = new SearchEngine({ records, vectorIndex, embedder });
    const results = await engine.search('sigmoid colon tumour');
    expect(results[0].code).toBe('C18.7');
    expect(results[0].sources).toContain('vector');
  });

  it('falls back to keyword results if the embedder throws', async () => {
    const boom: Embedder = async () => {
      throw new Error('model not loaded');
    };
    const engine = new SearchEngine({ records, vectorIndex, embedder: boom });
    const results = await engine.search('rectal polyp');
    expect(results[0].code).toBe('K62.1');
  });

  it('applies an optional reranker', async () => {
    const engine = new SearchEngine({
      records,
      reranker: async (_q, c) => [...c].reverse(),
    });
    const normal = await new SearchEngine({ records }).search('colon');
    const reranked = await engine.search('colon');
    expect(reranked[0].code).toBe(normal[normal.length - 1].code);
  });
});
