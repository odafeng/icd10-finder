// Precompute sentence embeddings for every ICD-10-CM description and write them
// as an int8-quantized flat binary, plus a small meta JSON.
//
// The model (all-MiniLM-L6-v2, 384-dim) is cached under ./models so build.mjs
// can bundle it for fully-offline query-time embedding. The pipeline already
// L2-normalizes outputs (normalize: true), so we only quantize to int8 here.
// See docs/adr/0002-semantic-engine.md.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;
const BATCH = 128;

// Load the model from the repo's bundled copy (scripts/setup downloads it into
// ./models). This is the same layout build.mjs ships in the extension and the
// runtime embedder loads from, so the build path matches production.
env.localModelPath = join(ROOT, 'models');
env.allowRemoteModels = false;

function quantize(unit, out, offset) {
  for (let i = 0; i < unit.length; i++) {
    out[offset + i] = Math.max(-127, Math.min(127, Math.round(unit[i] * 127)));
  }
}

async function main() {
  const records = JSON.parse(await readFile(join(ROOT, 'data', 'icd10cm.json'), 'utf8'));
  console.log(`loaded ${records.length} records; loading model ${MODEL}`);

  const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const out = new Int8Array(records.length * DIM);

  const t0 = Date.now();
  for (let start = 0; start < records.length; start += BATCH) {
    const batch = records.slice(start, start + BATCH).map((r) => r.name);
    const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
    const vectors = tensor.tolist(); // number[][], each length DIM
    for (let j = 0; j < vectors.length; j++) {
      quantize(vectors[j], out, (start + j) * DIM);
    }
    const done = Math.min(start + BATCH, records.length);
    const rate = done / ((Date.now() - t0) / 1000);
    process.stdout.write(`\rembedded ${done}/${records.length} (${rate.toFixed(0)}/s)`);
  }
  process.stdout.write('\n');

  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(join(ROOT, 'data', 'embeddings.bin'), Buffer.from(out.buffer));
  await writeFile(
    join(ROOT, 'data', 'embeddings.meta.json'),
    JSON.stringify({ model: MODEL, dim: DIM, count: records.length, quant: 'int8' }),
  );
  console.log(`wrote data/embeddings.bin (${(out.length / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
