import { KeywordIndex } from './keyword';
import { VectorIndex, normalize } from './vector';
import { rrf } from './fuse';
import { identityReranker, type Reranker } from './rerank';
import type { Embedder, IcdRecord, SearchResult } from './types';

export interface EngineOptions {
  records: IcdRecord[];
  /** Omit to run keyword-only (e.g. before the model has loaded). */
  vectorIndex?: VectorIndex;
  /** Required for vector search; embeds the query into a vector. */
  embedder?: Embedder;
  /** Optional LLM re-ranking; defaults to identity (no-op). */
  reranker?: Reranker;
}

const CANDIDATES = 30;

export class SearchEngine {
  private readonly keyword: KeywordIndex;
  private readonly reranker: Reranker;

  constructor(private readonly opts: EngineOptions) {
    this.keyword = new KeywordIndex(opts.records);
    this.reranker = opts.reranker ?? identityReranker;
  }

  /** Fast keyword-only results — no model needed, returns in ms. Used as the
   *  instant first phase while vector search warms up. */
  keywordSearch(query: string, topK = 8): SearchResult[] {
    return this.keyword.search(query, topK).map((h) => ({
      code: this.opts.records[h.index].code,
      name: this.opts.records[h.index].name,
      score: h.score,
      sources: ['keyword'],
    }));
  }

  /** Warm up the embedding model (offscreen) so the first real lookup is fast. */
  async warm(): Promise<void> {
    if (this.opts.embedder) await this.opts.embedder('warmup');
  }

  async search(query: string, topK = 10): Promise<SearchResult[]> {
    const kwHits = this.keyword.search(query, CANDIDATES);

    let vecHits: ReturnType<KeywordIndex['search']> = [];
    if (this.opts.vectorIndex && this.opts.embedder) {
      try {
        const q = normalize(await this.opts.embedder(query));
        vecHits = this.opts.vectorIndex.search(q, CANDIDATES);
      } catch (err) {
        // Semantic layer is best-effort; fall back to keyword-only.
        console.warn('vector search failed, using keyword only:', err);
      }
    }

    const fused = rrf([
      { source: 'keyword', hits: kwHits },
      { source: 'vector', hits: vecHits },
    ]).slice(0, topK);

    const results: SearchResult[] = fused.map((h) => ({
      code: this.opts.records[h.index].code,
      name: this.opts.records[h.index].name,
      score: h.score,
      sources: h.sources,
    }));

    return this.reranker(query, results);
  }
}

export { VectorIndex } from './vector';
export type { Embedder, IcdRecord, SearchResult } from './types';
