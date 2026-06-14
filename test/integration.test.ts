import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SearchEngine } from '../src/search/engine';
import type { IcdRecord } from '../src/search/types';

// Smoke test against the real committed dataset, keyword path only (no model /
// embeddings needed, so it runs in CI). Confirms the data loads and the engine
// returns sane codes end to end.
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'icd10cm.json');

describe.skipIf(!existsSync(DATA))('integration: real ICD-10 dataset (keyword)', () => {
  const records: IcdRecord[] = JSON.parse(readFileSync(DATA, 'utf8'));
  const engine = new SearchEngine({ records });

  it('loads the full FY2026 code set', () => {
    expect(records.length).toBe(74719);
    expect(records.find((r) => r.code === 'C18.7')?.name).toBe(
      'Malignant neoplasm of sigmoid colon',
    );
  });

  it('finds the official term for "rectal polyp"', async () => {
    const results = await engine.search('rectal polyp');
    expect(results[0].code).toBe('K62.1');
  });

  it('does a code-prefix lookup', async () => {
    const results = await engine.search('C18');
    expect(results.map((r) => r.code)).toContain('C18.7');
  });
});
