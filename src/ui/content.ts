import type { SearchResult } from '../search/types';

// Self-contained, dependency-free overlay rendered into a shadow root so the
// host page's (e.g. EMR) CSS can't bleed in or out.

const HOST_ID = '__icd10_finder_host__';
const MIN_LEN = 2;
const MAX_LEN = 80;
const DEBOUNCE_MS = 250;

const STYLE = `
  :host { all: initial; }
  .card {
    position: fixed; z-index: 2147483647; max-width: 360px; min-width: 240px;
    font: 13px/1.4 -apple-system, system-ui, sans-serif; color: #1a1a1a;
    background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); overflow: hidden;
  }
  .head { display: flex; justify-content: space-between; align-items: center;
    padding: 6px 10px; background: #f6f8fa; border-bottom: 1px solid #eaecef; }
  .head .q { font-weight: 600; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; max-width: 280px; }
  .head .x { cursor: pointer; color: #888; padding: 0 4px; }
  .list { max-height: 320px; overflow-y: auto; }
  .row { display: flex; gap: 8px; padding: 7px 10px; cursor: pointer;
    border-bottom: 1px solid #f0f0f0; }
  .row:hover { background: #eef4ff; }
  .row:last-child { border-bottom: none; }
  .code { font-weight: 700; color: #0b5fff; font-variant-numeric: tabular-nums;
    white-space: nowrap; }
  .name { color: #333; }
  .src { font-size: 10px; color: #8a8a8a; margin-left: auto; white-space: nowrap; }
  .msg { padding: 10px; color: #666; }
  .toast { padding: 6px 10px; background: #e7f7ee; color: #176f3d;
    border-top: 1px solid #cdeed9; font-size: 12px; }
`;

let shadow: ShadowRoot | null = null;
let card: HTMLDivElement | null = null;
let debounce: ReturnType<typeof setTimeout> | undefined;
let reqSeq = 0;

function ensureShadow(): ShadowRoot {
  if (shadow) return shadow;
  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  shadow.appendChild(style);
  return shadow;
}

function close(): void {
  card?.remove();
  card = null;
}

function srcBadge(sources: SearchResult['sources']): string {
  if (sources.includes('online')) return 'online';
  if (sources.includes('vector') && sources.includes('keyword')) return 'kw+vec';
  if (sources.includes('vector')) return 'vec';
  return 'kw';
}

async function copyCode(code: string, toast: HTMLDivElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    toast.textContent = `Copied ${code} ✓`;
  } catch {
    toast.textContent = `Press ⌘C to copy ${code}`;
  }
  toast.style.display = 'block';
}

function render(query: string, results: SearchResult[], x: number, y: number): void {
  close();
  const root = ensureShadow();
  card = document.createElement('div');
  card.className = 'card';
  card.style.left = `${Math.min(x, window.innerWidth - 380)}px`;
  card.style.top = `${Math.min(y + 6, window.innerHeight - 360)}px`;

  const head = document.createElement('div');
  head.className = 'head';
  const q = document.createElement('span');
  q.className = 'q';
  q.textContent = query;
  const x0 = document.createElement('span');
  x0.className = 'x';
  x0.textContent = '✕';
  x0.onclick = close;
  head.append(q, x0);
  card.append(head);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.display = 'none';

  if (results.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = 'No ICD-10 match found.';
    card.append(msg);
  } else {
    const list = document.createElement('div');
    list.className = 'list';
    for (const r of results) {
      const row = document.createElement('div');
      row.className = 'row';
      row.onclick = () => copyCode(r.code, toast);
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = r.code;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = r.name;
      const src = document.createElement('span');
      src.className = 'src';
      src.textContent = srcBadge(r.sources);
      row.append(code, name, src);
      list.append(row);
    }
    card.append(list);
  }

  card.append(toast);
  root.append(card);
}

function requestLookup(query: string, x: number, y: number): void {
  const seq = ++reqSeq;
  render(query, [], x, y);
  const loading = card?.querySelector('.toast') as HTMLDivElement | null;
  if (loading) {
    loading.textContent = 'Searching…';
    loading.style.display = 'block';
  }
  chrome.runtime.sendMessage({ type: 'icd-search', query }, (resp) => {
    if (seq !== reqSeq) return; // a newer request superseded this one
    if (chrome.runtime.lastError || !resp || resp.error) {
      render(query, [], x, y);
      return;
    }
    render(query, resp.results as SearchResult[], x, y);
  });
}

document.addEventListener('mouseup', (e) => {
  const target = e.target as Node;
  const host = document.getElementById(HOST_ID);
  if (host && host.contains(target)) return; // ignore clicks inside our card

  clearTimeout(debounce);
  debounce = setTimeout(() => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (text.length < MIN_LEN || text.length > MAX_LEN || !/[a-z]/i.test(text)) {
      return;
    }
    const rect = sel?.getRangeAt(0).getBoundingClientRect();
    requestLookup(text, rect?.left ?? e.clientX, rect?.bottom ?? e.clientY);
  }, DEBOUNCE_MS);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});

document.addEventListener('mousedown', (e) => {
  const host = document.getElementById(HOST_ID);
  if (card && host && !host.contains(e.target as Node)) close();
});

// Context-menu path pushes results directly.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'icd-show') {
    const sel = window.getSelection();
    const rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
    render(msg.query, msg.results as SearchResult[], rect?.left ?? 80, rect?.bottom ?? 80);
  }
});
