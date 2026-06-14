// Bundle the extension into dist/: esbuild for the three TS entry points, plus
// a copy of the static assets, generated data, the embedding model, and the
// ONNX runtime WASM. Pass --watch to rebuild on change.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MODEL_DIR = 'Xenova/all-MiniLM-L6-v2'; // keep in sync with src/background/embedder.ts
const ORT = 'node_modules/@huggingface/transformers/dist';
const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: {
    'service-worker': join(ROOT, 'src/background/service-worker.ts'),
    content: join(ROOT, 'src/ui/content.ts'),
    options: join(ROOT, 'src/ui/options.ts'),
    offscreen: join(ROOT, 'src/offscreen/offscreen.ts'),
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  splitting: false,
  outdir: DIST,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

async function copyAssets() {
  await cp(join(ROOT, 'public/manifest.json'), join(DIST, 'manifest.json'));
  await cp(join(ROOT, 'src/ui/options.html'), join(DIST, 'options.html'));
  await cp(join(ROOT, 'src/offscreen/offscreen.html'), join(DIST, 'offscreen.html'));
  await cp(join(ROOT, 'data'), join(DIST, 'data'), { recursive: true });
  await cp(join(ROOT, 'models', MODEL_DIR), join(DIST, 'models', MODEL_DIR), { recursive: true });
  await mkdir(join(DIST, 'wasm'), { recursive: true });
  for (const f of ['ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.mjs']) {
    await cp(join(ROOT, ORT, f), join(DIST, 'wasm', f));
  }
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.rebuild();
    await copyAssets();
    await ctx.watch();
    console.log('watching for changes…');
  } else {
    await esbuild.build(buildOptions);
    await copyAssets();
    console.log(`built extension to ${DIST}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
