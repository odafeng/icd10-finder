import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { MODEL_ID } from '../shared/model';

// This runs in an offscreen document (a real Window context), so dynamic
// import() and WASM both work — unlike the service worker. Everything is loaded
// from bundled extension assets; nothing hits the network.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false; // chrome-extension:// scheme isn't a valid Cache key
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'icd-embed-offscreen' || typeof msg.text !== 'string') return false;
  getPipeline()
    .then((extractor) => extractor(msg.text, { pooling: 'mean', normalize: true }))
    // Plain array — typed arrays don't survive runtime messaging reliably.
    .then((out) => sendResponse({ vector: Array.from(out.data as ArrayLike<number>) }))
    .catch((err) => sendResponse({ error: String(err) }));
  return true; // async response
});
