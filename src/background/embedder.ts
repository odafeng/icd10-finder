import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import type { Embedder } from '../search/types';

// Keep in sync with scripts/build-embeddings.mjs — the corpus vectors must be
// produced by the same model the runtime embeds queries with.
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

// Fully offline: load the model and ONNX runtime WASM from bundled extension
// assets, never the network. Single-threaded WASM avoids the cross-origin
// isolation (SharedArrayBuffer) requirement that extensions don't satisfy.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL('models/');
const wasm = env.backends?.onnx?.wasm;
if (wasm) {
  wasm.wasmPaths = chrome.runtime.getURL('wasm/');
  wasm.numThreads = 1;
}

let pipePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  pipePromise ??= pipeline('feature-extraction', MODEL_ID, {
    dtype: 'q8',
  }) as unknown as Promise<FeatureExtractionPipeline>;
  return pipePromise;
}

/** Lazily-initialized query embedder; first call loads the model (~seconds). */
export const embedQuery: Embedder = async (text: string) => {
  const extractor = await getPipeline();
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(out.data as Float32Array);
};
