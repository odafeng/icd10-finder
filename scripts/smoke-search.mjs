// Manual verification harness: loads the real model + embeddings + data and
// prints the top vector-search neighbours for a few lay-term queries. Confirms
// the semantic layer bridges colloquial -> official terminology
// (e.g. "colon cancer" -> C18.x "malignant neoplasm of colon").
// Not part of CI (needs the model + 28MB embeddings). Run: node scripts/smoke-search.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
env.localModelPath = join(ROOT, 'models');
env.allowRemoteModels = false;

const QUERIES = ['colon cancer', 'heart attack', 'high blood pressure', 'appendicitis', 'piles'];

const records = JSON.parse(await readFile(join(ROOT, 'data', 'icd10cm.json'), 'utf8'));
const meta = JSON.parse(await readFile(join(ROOT, 'data', 'embeddings.meta.json'), 'utf8'));
const data = new Int8Array((await readFile(join(ROOT, 'data', 'embeddings.bin'))).buffer);
const { dim, count } = meta;

const extractor = await pipeline('feature-extraction', meta.model, { dtype: 'q8' });

function topK(query, k = 5) {
  const out = query; // already unit-normalized by the pipeline
  const scored = new Array(count);
  for (let i = 0; i < count; i++) {
    let dot = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) dot += out[d] * data[base + d];
    scored[i] = { i, dot };
  }
  scored.sort((a, b) => b.dot - a.dot);
  return scored.slice(0, k);
}

for (const q of QUERIES) {
  const t = await extractor(q, { pooling: 'mean', normalize: true });
  const hits = topK(Float32Array.from(t.data));
  console.log(`\n[${q}]`);
  for (const { i, dot } of hits) {
    console.log(`  ${(dot / 127).toFixed(3)}  ${records[i].code}\t${records[i].name}`);
  }
}
