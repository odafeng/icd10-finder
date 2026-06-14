import { SearchEngine, VectorIndex } from '../search/engine';
import type { IcdRecord, SearchResult } from '../search/types';
import { embedQuery } from './embedder';
import { queryNlm, mergeOnline } from './nlm';

interface EmbeddingMeta {
  dim: number;
  count: number;
}

let enginePromise: Promise<SearchEngine> | null = null;

async function loadEngine(): Promise<SearchEngine> {
  const [records, meta, embBuf] = await Promise.all([
    fetch(chrome.runtime.getURL('data/icd10cm.json')).then((r) => r.json() as Promise<IcdRecord[]>),
    fetch(chrome.runtime.getURL('data/embeddings.meta.json')).then(
      (r) => r.json() as Promise<EmbeddingMeta>,
    ),
    fetch(chrome.runtime.getURL('data/embeddings.bin')).then((r) => r.arrayBuffer()),
  ]);
  const vectorIndex = new VectorIndex(new Int8Array(embBuf), meta.dim);
  return new SearchEngine({ records, vectorIndex, embedder: embedQuery });
}

function getEngine(): Promise<SearchEngine> {
  enginePromise ??= loadEngine();
  return enginePromise;
}

async function search(query: string): Promise<SearchResult[]> {
  const engine = await getEngine();
  let results = await engine.search(query, 8);

  const { onlineEnhance } = await chrome.storage.sync.get({ onlineEnhance: false });
  if (onlineEnhance) {
    try {
      results = mergeOnline(results, await queryNlm(query));
    } catch (err) {
      console.warn('online enhancement failed:', err);
    }
  }
  return results;
}

// Content script asks for a lookup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'icd-search' && typeof msg.query === 'string') {
    search(msg.query)
      .then((results) => sendResponse({ results }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // keep the channel open for the async response
  }
  return false;
});

// Right-click fallback on a text selection.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'icd-lookup',
    title: '查 ICD-10:「%s」',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'icd-lookup' || !info.selectionText || !tab?.id) return;
  const results = await search(info.selectionText);
  chrome.tabs.sendMessage(tab.id, { type: 'icd-show', query: info.selectionText, results });
});
