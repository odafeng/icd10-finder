import { describe, it, expect } from 'vitest';
import { VectorIndex, quantize, normalize } from '../src/search/vector';

describe('normalize', () => {
  it('produces a unit-length vector', () => {
    const v = normalize(new Float32Array([3, 4]));
    expect(Math.hypot(v[0], v[1])).toBeCloseTo(1, 6);
  });

  it('leaves a zero vector finite', () => {
    const v = normalize(new Float32Array([0, 0]));
    expect(v.every(Number.isFinite)).toBe(true);
  });
});

describe('quantize', () => {
  it('maps a unit component to the int8 range', () => {
    const q = quantize(new Float32Array([1, -1, 0]));
    expect([...q]).toEqual([127, -127, 0]);
  });
});

describe('VectorIndex', () => {
  // Three orthonormal-ish 2D rows, quantized.
  const dim = 2;
  const rows = [
    normalize(new Float32Array([1, 0])),
    normalize(new Float32Array([0, 1])),
    normalize(new Float32Array([1, 1])),
  ];
  const data = new Int8Array(rows.length * dim);
  rows.forEach((r, i) => data.set(quantize(r), i * dim));
  const index = new VectorIndex(data, dim);

  it('ranks the nearest direction first', () => {
    const hits = index.search(normalize(new Float32Array([1, 0])), 3);
    expect(hits[0].index).toBe(0);
    expect(hits[0].score).toBeCloseTo(1, 1);
  });

  it('puts the diagonal row between the two axes for a 45° query', () => {
    const hits = index.search(normalize(new Float32Array([1, 1])), 3);
    expect(hits[0].index).toBe(2);
  });

  it('throws on a dimension mismatch', () => {
    expect(() => index.search(new Float32Array([1, 0, 0]))).toThrow();
  });
});
