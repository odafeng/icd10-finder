import type { IcdRecord } from './types';

const TOKEN_RE = /[a-z0-9]+/g;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

/** Looks like an ICD code prefix, e.g. "C18", "C18.7", "k35". */
function looksLikeCode(q: string): boolean {
  return /^[a-z]\d/i.test(q.trim());
}

export interface ScoredIndex {
  index: number;
  score: number;
}

/**
 * In-memory inverted index over ICD record names plus exact/prefix matching on
 * codes. Pure lexical — precise for official terminology and code lookups,
 * complements the semantic vector index.
 */
export class KeywordIndex {
  private readonly postings = new Map<string, number[]>();

  constructor(private readonly records: IcdRecord[]) {
    records.forEach((rec, i) => {
      for (const tok of new Set(tokenize(rec.name))) {
        const list = this.postings.get(tok);
        if (list) list.push(i);
        else this.postings.set(tok, [i]);
      }
    });
  }

  search(query: string, topK = 20): ScoredIndex[] {
    const q = query.trim();
    if (!q) return [];

    // Code lookup: prefix match on the (dotted) code, ranked by how much of the
    // code the query pins down.
    if (looksLikeCode(q)) {
      const needle = q.toUpperCase();
      const hits: ScoredIndex[] = [];
      this.records.forEach((rec, i) => {
        if (rec.code.startsWith(needle)) {
          hits.push({ index: i, score: needle.length / rec.code.length });
        }
      });
      hits.sort((a, b) => b.score - a.score);
      return hits.slice(0, topK);
    }

    const terms = tokenize(q);
    if (terms.length === 0) return [];

    // Count how many distinct query terms each record matches.
    const matched = new Map<number, number>();
    for (const term of new Set(terms)) {
      const list = this.postings.get(term);
      if (!list) continue;
      for (const idx of list) matched.set(idx, (matched.get(idx) ?? 0) + 1);
    }

    const scored: ScoredIndex[] = [];
    for (const [index, hitCount] of matched) {
      // Fraction of query terms present; shorter names with full coverage win.
      const coverage = hitCount / terms.length;
      const brevity = 1 / (1 + tokenize(this.records[index].name).length);
      scored.push({ index, score: coverage + 0.1 * coverage * brevity });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
}
