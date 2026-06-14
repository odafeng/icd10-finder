import { describe, it, expect } from 'vitest';
import { rrf } from '../src/search/fuse';

describe('rrf', () => {
  it('rewards items ranked highly by both lists', () => {
    const fused = rrf([
      {
        source: 'keyword',
        hits: [
          { index: 1, score: 9 },
          { index: 2, score: 8 },
        ],
      },
      {
        source: 'vector',
        hits: [
          { index: 2, score: 0.9 },
          { index: 3, score: 0.8 },
        ],
      },
    ]);
    // index 2 appears in both lists → should win.
    expect(fused[0].index).toBe(2);
    expect(fused[0].sources.sort()).toEqual(['keyword', 'vector']);
  });

  it('tags single-source hits with only that source', () => {
    const fused = rrf([
      { source: 'keyword', hits: [{ index: 5, score: 1 }] },
      { source: 'vector', hits: [] },
    ]);
    expect(fused[0].sources).toEqual(['keyword']);
  });

  it('combines scores additively across lists', () => {
    const fused = rrf(
      [
        { source: 'keyword', hits: [{ index: 1, score: 1 }] },
        { source: 'vector', hits: [{ index: 1, score: 1 }] },
      ],
      60,
    );
    // 1/(60+1) twice
    expect(fused[0].score).toBeCloseTo(2 / 61, 6);
  });
});
