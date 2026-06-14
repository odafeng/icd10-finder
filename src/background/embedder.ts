import type { Embedder } from '../search/types';

export { MODEL_ID } from '../shared/model';

// The embedding model uses ONNX/WASM, which can't load in a service worker
// (dynamic import() is disallowed there). So the model lives in an offscreen
// document and the worker delegates embedding to it over runtime messaging.
const OFFSCREEN_URL = 'offscreen.html';
let creating: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });
  if (existing.length > 0) return;

  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Run the ICD-10 embedding model (ONNX/WASM) off the service worker.',
      })
      .catch((err) => {
        // A concurrent caller may have created it first; ignore that race.
        if (!String(err).includes('Only a single offscreen')) throw err;
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

/** Embeds a query by delegating to the offscreen document. */
export const embedQuery: Embedder = async (text: string) => {
  await ensureOffscreen();
  const resp = await chrome.runtime.sendMessage({ type: 'icd-embed-offscreen', text });
  if (!resp || resp.error) throw new Error(resp?.error ?? 'offscreen embed failed');
  return Float32Array.from(resp.vector as number[]);
};
