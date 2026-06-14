# 3. Manifest V3 with a service-worker engine and Shadow DOM overlay

## Status

Accepted

## Context

Chrome only accepts new extensions on Manifest V3. We need to decide where the
search engine runs and how the on-page UI is injected without clashing with host
pages (including EMR apps with aggressive global CSS).

## Decision

- **Manifest V3.** The search engine (keyword + vectors) and data live in the
  **background service worker** (`type: module`). The content script is thin:
  detect the selection, ask the worker over `chrome.runtime.sendMessage`, render.
- **The embedding model runs in an offscreen document, not the worker.**
  onnxruntime-web's WASM backend uses dynamic `import()`, which the HTML spec
  forbids in a `ServiceWorkerGlobalScope`, so the model cannot load in the worker
  at all. An offscreen document is a real Window context where `import()` + WASM
  work; the worker delegates query embedding to it via runtime messaging.
- Loading the model + 29 MB of vectors is **lazy** — only on the first lookup —
  and the worker may be torn down between uses (an accepted MV3 trade-off).
- The on-page card is rendered into a **Shadow DOM** root with `:host { all:
initial }` and inline styles, so host-page CSS cannot leak in or out. No
  external content CSS file.
- Selection triggers an auto-popup (debounced); a **context-menu** item is the
  fallback path.
- Online enhancement uses **`optional_host_permissions`**, requested at runtime
  only when the user enables the toggle — keeping the default install permission
  footprint minimal and offline.

## Consequences

- **+** Style isolation makes the overlay robust on arbitrary pages.
- **+** Heavy work stays out of the page; the content script is ~5 KB.
- **+** Minimal default permissions; network host access is opt-in.
- **−** MV3 can terminate the worker, so the first lookup after idle pays the
  model load cost again (seconds). Acceptable for an interactive tool.
- **−** Auto-popup on selection can feel intrusive; mitigated by length/character
  guards and easy dismissal (Esc / click-away).
- **−** Shadow DOM + inline styles means the UI styling lives in TS, not a CSS
  file — slightly less convenient to edit.
