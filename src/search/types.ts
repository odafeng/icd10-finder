export interface IcdRecord {
  code: string;
  name: string;
}

export type MatchSource = 'keyword' | 'vector' | 'online' | 'llm';

export interface SearchResult {
  code: string;
  name: string;
  /** Fused relevance score, higher is better. */
  score: number;
  /** Which engines surfaced this result. */
  sources: MatchSource[];
}

/** Embeds a free-text query into a unit-length vector. Injected so the core
 *  stays testable without loading the model. */
export type Embedder = (text: string) => Promise<Float32Array>;
