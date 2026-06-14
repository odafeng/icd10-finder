# ICD-10 Finder

A Chrome extension (Manifest V3) that turns highlighted text into recommended
ICD-10-CM codes. Highlight a disease name or keyword on any web page and a small
card shows the best-matching codes; click one to copy it.

Built for a web-based EMR workflow, so **all search runs offline on your machine
by default** — nothing leaves the browser unless you explicitly enable the online
enhancement.

## How it works

```
highlight text
  → content script (Shadow DOM card)         src/ui/content.ts
  → service worker                           src/background/service-worker.ts
      ├─ keyword search (inverted index)      src/search/keyword.ts
      ├─ vector search (offline embeddings)   src/search/vector.ts
      │     └─ query embedding (offscreen)    src/offscreen/offscreen.ts
      ├─ Reciprocal Rank Fusion               src/search/fuse.ts
      └─ (optional) NLM online enhancement    src/background/nlm.ts
  → top codes rendered in the card
```

> The embedding model runs in an **offscreen document**, not the service worker:
> onnxruntime-web's WASM backend needs dynamic `import()`, which is disallowed in
> a service worker. The worker delegates query embedding to the offscreen page.

- **Keyword search** is precise for official terminology and `C18`-style code
  prefixes.
- **Vector search** bridges lay terms to formal wording — e.g. `colon cancer` →
  `C18.x Malignant neoplasm of colon`, `piles` → `K64.x Hemorrhoids` — using a
  bundled `all-MiniLM-L6-v2` model and precomputed int8 embeddings, all offline.
- The two are combined with Reciprocal Rank Fusion (no per-engine score tuning).
- An optional LLM reranker interface exists but is a no-op in v1
  (`src/search/rerank.ts`).

See `docs/adr/` for the design decisions and their trade-offs.

## Build

```bash
npm install

# One-time data pipeline (regenerates committed/bundled artifacts):
npm run fetch:icd10        # data/icd10cm.json   (CMS FY2026, 74,719 codes)
npm run fetch:model        # models/...          (MiniLM ONNX, for offline embedding)
npm run build:embeddings   # data/embeddings.bin (int8 vectors, ~29 MB)
# or all three:  npm run build:data

# Bundle the extension into dist/:
npm run build
```

## Install (load unpacked)

1. `npm run build`
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `dist/` folder.
4. Highlight a disease name on any page, or right-click a selection → "Find
   ICD-10 for …".

The first lookup loads the model (a few seconds); subsequent lookups are instant
until the service worker idles out.

## Options

- **Floating popup on selection** — auto-show the result card when you highlight
  text. Turn it off to trigger lookups only via the right-click context menu.
- **Online enhancement (NLM)** — also query the NLM Clinical Table Search Service
  for the freshest matches. **Off by default**; turning it on sends the
  highlighted text to `clinicaltables.nlm.nih.gov` and requests that host
  permission. Leave it off when working with patient data.
- **LLM query expansion** — **opt-in, off by default.** Before searching, an LLM
  rewrites a lay term ("heart attack") into formal ICD-10 phrasing ("acute
  myocardial infarction") and the engine searches those too; LLM-surfaced codes
  get an `llm` badge. Two modes:
  - **Local** — an OpenAI-compatible endpoint on the same machine (e.g. Ollama).
    Only works where such a server is installed — a stock hospital PC has none.
  - **Cloud** — OpenAI / Anthropic / a custom OpenAI-compatible API. Pick a model
    (the list loads live from the provider's `/models`), enter an API key (stored
    in `chrome.storage.local`, never synced). **Sends the highlighted text to the
    provider — do not use with patient data.**

  Host permission for the chosen endpoint is requested at save time. The default
  offline keyword+vector search is unaffected when this is off.

> **Note on the target machine.** This is built to run on a hospital PC with **no
> local LLM and uncertain/blocked network egress**. So the generative-LLM layer
> above is best-effort and often unavailable there. A fully-offline bundled
> in-browser LLM was evaluated and rejected: the smallest usable instruct model
> (Qwen2.5-0.5B) is ~512 MB and runs a single expansion in tens of seconds on
> WASM, with marginal medical-synonym quality. The realistic offline quality
> lever is the embedding model (see Known limitations), not a generative LLM.

## Develop

```bash
npm run dev         # esbuild watch → dist/
npm test            # unit + integration (vitest)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint + prettier --check
npm run format      # prettier --write
```

`scripts/smoke-search.mjs` and `scripts/compare-model.mjs` are manual harnesses
to eyeball semantic quality / compare embedding models (not run in CI).

## Known limitations

- The data is pinned to **FY2026**; refreshing is a manual re-run of the fetch
  script.
- MiniLM is a small general model, so some clinical synonyms miss — notably
  **"heart attack" does not surface `I21` acute MI**. Swapping in a clinical
  embedding model (BioLORD / PubMedBERT) or enabling an LLM rerank/expansion layer
  would improve this; the model is swappable via `MODEL_ID` in
  `src/background/embedder.ts` (+ rebuild embeddings).
- Codes and descriptions are US ICD-10-CM English; Taiwan NHI uses the same
  English base, but Chinese-language lookup is not supported in v1.
