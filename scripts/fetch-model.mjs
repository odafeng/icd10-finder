// Download the all-MiniLM-L6-v2 ONNX model files into ./models in the layout
// transformers.js expects (modelId/...), for both build-time embedding and
// bundling into the extension for offline query-time embedding.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const BASE = `https://huggingface.co/${MODEL}/resolve/main`;
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
];
const DEST = join(dirname(fileURLToPath(import.meta.url)), '..', 'models', MODEL);

async function main() {
  for (const f of FILES) {
    const res = await fetch(`${BASE}/${f}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${f}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = join(DEST, f);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, buf);
    console.log(`${f} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  console.log(`model downloaded to ${DEST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
