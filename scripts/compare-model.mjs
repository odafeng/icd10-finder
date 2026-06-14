// Embed the full ICD corpus in-memory with a chosen model and print the top-5
// vector neighbours for a fixed set of lay-term queries, to compare retrieval
// quality against the current MiniLM baseline. Run:
//   node scripts/compare-model.mjs Xenova/all-mpnet-base-v2
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
env.localModelPath = join(ROOT, 'models');
env.allowRemoteModels = false;

const MODEL = process.argv[2] ?? 'Xenova/all-mpnet-base-v2';
const QUERIES = ['colon cancer', 'heart attack', 'high blood pressure', 'appendicitis', 'piles'];
const BATCH = 64;

const records = JSON.parse(await readFile(join(ROOT, 'data', 'icd10cm.json'), 'utf8'));
const names = records.map((r) => r.name);
console.log(`model=${MODEL}  corpus=${records.length}`);

const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const dim = (await extractor('probe', { pooling: 'mean', normalize: true })).dims.at(-1);
const mat = new Float32Array(records.length * dim);

const t0 = Date.now();
for (let s = 0; s < names.length; s += BATCH) {
  const t = await extractor(names.slice(s, s + BATCH), { pooling: 'mean', normalize: true });
  mat.set(t.data, s * dim);
  process.stdout.write(`\rembedded ${Math.min(s + BATCH, names.length)}/${names.length}`);
}
process.stdout.write(`  (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);

function topK(q, k = 5) {
  const scored = records.map((_, i) => {
    let dot = 0;
    const b = i * dim;
    for (let d = 0; d < dim; d++) dot += q[d] * mat[b + d];
    return { i, dot };
  });
  scored.sort((a, b) => b.dot - a.dot);
  return scored.slice(0, k);
}

for (const query of QUERIES) {
  const t = await extractor(query, { pooling: 'mean', normalize: true });
  console.log(`\n[${query}]`);
  for (const { i, dot } of topK(Float32Array.from(t.data))) {
    console.log(`  ${dot.toFixed(3)}  ${records[i].code}\t${records[i].name}`);
  }
}
