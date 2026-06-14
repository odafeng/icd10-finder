import type { Embedder } from '../search/types';

// Keep in sync with scripts/build-embeddings.mjs — the corpus vectors must be
// produced by the same model the runtime embeds queries with.
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// transformers.js is imported *dynamically* so its module-level code only runs
// the first time we actually embed. A static import executes that code when the
// service worker loads, and any incompatibility there would crash the worker
// before the message listener registers — taking down the keyword path too.
// Lazy-loading keeps the worker (and keyword search) alive even if the model
// fails; vector search is best-effort.
let pipePromise: Promise<
  (text: string, opts: object) => Promise<{ data: ArrayLike<number> }>
> | null = null;

async function getPipeline() {
  if (!pipePromise) {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = chrome.runtime.getURL('models/');
    const wasm = env.backends?.onnx?.wasm;
    if (wasm) {
      wasm.wasmPaths = chrome.runtime.getURL('wasm/');
      wasm.numThreads = 1;
    }
    pipePromise = pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' }) as unknown as Promise<
      (text: string, opts: object) => Promise<{ data: ArrayLike<number> }>
    >;
  }
  return pipePromise;
}

/** Lazily-initialized query embedder; first call loads the model (~seconds). */
export const embedQuery: Embedder = async (text: string) => {
  const extractor = await getPipeline();
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(out.data);
};
