// Download the official CMS ICD-10-CM code descriptions (FY2026) and write a
// compact data/icd10cm.json of { code, name } records.
//
// Source: a single ~2MB zip from CMS containing icd10cm_codes_2026.txt, a flat
// file of "<code><whitespace><description>" lines. Codes are stored without the
// decimal point (C187), so we reinsert it after the 3rd character (C18.7).
// See docs/adr/0001-data-source.md.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const ZIP_URL = 'https://www.cms.gov/files/zip/2026-code-descriptions-tabular-order.zip';
const ENTRY = 'icd10cm_codes_2026.txt';
const EXPECTED = 74719;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'icd10cm.json');

/** Reinsert the ICD-10-CM decimal point: codes longer than 3 chars get a dot
 *  after the category (e.g. C187 -> C18.7, K3580 -> K35.80). */
function dotted(raw) {
  return raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
}

async function main() {
  console.log(`downloading ${ZIP_URL}`);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading code zip`);
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const file = zip[ENTRY];
  if (!file) throw new Error(`${ENTRY} not found in zip`);

  const records = [];
  for (const line of strFromU8(file).split('\n')) {
    if (!line.trim()) continue;
    const sep = line.search(/\s/);
    records.push({ code: dotted(line.slice(0, sep)), name: line.slice(sep).trim() });
  }

  if (records.length !== EXPECTED) {
    throw new Error(`expected ${EXPECTED} records, got ${records.length}`);
  }

  await writeFile(OUT, JSON.stringify(records), 'utf8');
  console.log(`wrote ${records.length} records to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
