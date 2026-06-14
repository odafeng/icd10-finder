import type { SearchResult } from './types';

/**
 * Optional LLM re-ranking layer (v1: not implemented — interface only).
 *
 * The default reranker is the identity function, so the engine ships with pure
 * offline vector + keyword fusion. A future backend (local Ollama at
 * localhost:11434, or the Claude API) can implement this signature to reorder
 * the candidate list and attach a recommendation rationale, gated behind a
 * user-facing toggle. See docs/adr/0002-semantic-engine.md.
 */
export type Reranker = (query: string, candidates: SearchResult[]) => Promise<SearchResult[]>;

export const identityReranker: Reranker = async (_query, candidates) => candidates;
