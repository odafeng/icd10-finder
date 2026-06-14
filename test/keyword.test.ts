import { describe, it, expect } from 'vitest';
import { KeywordIndex } from '../src/search/keyword';
import type { IcdRecord } from '../src/search/types';

const records: IcdRecord[] = [
  { code: 'C18.7', name: 'Malignant neoplasm of sigmoid colon' },
  { code: 'C18.2', name: 'Malignant neoplasm of ascending colon' },
  { code: 'K62.1', name: 'Rectal polyp' },
  { code: 'K35.80', name: 'Unspecified acute appendicitis' },
];

describe('KeywordIndex', () => {
  it('returns nothing for an empty query', () => {
    expect(new KeywordIndex(records).search('')).toEqual([]);
  });

  it('ranks records covering more query terms higher', () => {
    const hits = new KeywordIndex(records).search('malignant colon');
    expect(hits[0].index).toBeLessThanOrEqual(1); // one of the colon neoplasms
    expect(records[hits[0].index].name).toContain('colon');
  });

  it('matches an exact-ish official term', () => {
    const hits = new KeywordIndex(records).search('rectal polyp');
    expect(records[hits[0].index].code).toBe('K62.1');
  });

  it('does code prefix lookup when the query looks like a code', () => {
    const hits = new KeywordIndex(records).search('C18');
    const codes = hits.map((h) => records[h.index].code);
    expect(codes).toContain('C18.7');
    expect(codes).toContain('C18.2');
    expect(codes).not.toContain('K62.1');
  });
});
