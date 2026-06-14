import type { ScoredIndex } from './keyword';
import type { MatchSource } from './types';

export interface FusedHit {
  index: number;
  score: number;
  sources: MatchSource[];
}

/**
 * Reciprocal Rank Fusion. Combines ranked lists without needing their scores to
 * be on the same scale: each list contributes 1 / (k + rank) per item. k=60 is
 * the value from the original RRF paper and damps the influence of low ranks.
 */
export function rrf(lists: { source: MatchSource; hits: ScoredIndex[] }[], k = 60): FusedHit[] {
  const acc = new Map<number, { score: number; sources: Set<MatchSource> }>();
  for (const { source, hits } of lists) {
    hits.forEach((hit, rank) => {
      const entry = acc.get(hit.index) ?? { score: 0, sources: new Set() };
      entry.score += 1 / (k + rank + 1);
      entry.sources.add(source);
      acc.set(hit.index, entry);
    });
  }
  return [...acc.entries()]
    .map(([index, { score, sources }]) => ({ index, score, sources: [...sources] }))
    .sort((a, b) => b.score - a.score);
}
