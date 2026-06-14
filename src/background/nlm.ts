import type { SearchResult } from '../search/types';

const ENDPOINT = 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search';

/**
 * Optional online enhancement: query the NLM Clinical Table Search Service for
 * the freshest ICD-10-CM matches. Only called when the user enables the toggle
 * (and grants the host permission). Sends the selected text to NLM, so it is
 * off by default for privacy. Response shape: [total, codes, null, [[code,name]]].
 */
export async function queryNlm(text: string, maxList = 8): Promise<SearchResult[]> {
  const url = `${ENDPOINT}?sf=code,name&df=code,name&terms=${encodeURIComponent(text)}&maxList=${maxList}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NLM HTTP ${res.status}`);
  const [, , , rows] = (await res.json()) as [number, string[], unknown, [string, string][]];
  return rows.map(([code, name], i) => ({
    code,
    name,
    score: (maxList - i) / maxList,
    sources: ['online'],
  }));
}

/** Merge online hits into local results, de-duping by code and tagging sources. */
export function mergeOnline(local: SearchResult[], online: SearchResult[]): SearchResult[] {
  const byCode = new Map(local.map((r) => [r.code, r]));
  for (const hit of online) {
    const existing = byCode.get(hit.code);
    if (existing) {
      if (!existing.sources.includes('online')) existing.sources.push('online');
    } else {
      byCode.set(hit.code, hit);
    }
  }
  return [...byCode.values()];
}
