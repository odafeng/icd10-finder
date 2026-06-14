# 2. Semantic matching: local vector search + keyword fusion, no rule tables

## Status

Accepted

## Context

Users highlight colloquial terms ("colon cancer", "piles", "heart attack") but
ICD-10-CM uses formal wording ("malignant neoplasm of colon", "hemorrhoids",
"myocardial infarction"). A plain keyword search misses these. We explicitly do
**not** want a hand-maintained synonym table (incomplete, high maintenance).

Options considered:

1. **Local vector (embedding) search** — embed every code description offline,
   embed the query in-browser, rank by cosine similarity.
2. **LLM judgment** — have an LLM rerank/expand. Local (Ollama) only works on the
   user's own machine; cloud (Claude) sends text off-device (privacy) and needs a
   key. Reranking also cannot recover a correct code that retrieval never
   surfaced.
3. **Better keyword only** — cheap but fundamentally can't bridge vocabulary.

## Decision

Use **(1) as the primary engine, fused with keyword search**, and keep (2) as a
deferred, optional layer.

- Embedding model: **`FremyCompany/BioLORD-2023`** (mpnet-base, ~110 M params,
  768-dim) — a model trained specifically for clinical concept similarity. It is
  not published as transformers.js-ready ONNX, so `scripts/convert-biolord.py`
  exports it via optimum and quantizes to int8. Corpus vectors are precomputed
  and int8-quantized (`data/embeddings.bin`, ~57 MB); the query is embedded at
  runtime in the offscreen document. Model, WASM runtime, and vectors are all
  bundled — semantic search is fully offline, which matters because the target is
  a hospital PC with no local LLM and constrained network egress.
- Keyword search (inverted index + code-prefix match) runs alongside for exact
  terminology and code lookups.
- The two ranked lists are combined with **Reciprocal Rank Fusion** (`k = 60`),
  which needs no score calibration between engines.
- An LLM reranker interface exists (`src/search/rerank.ts`) but defaults to a
  no-op. A future Ollama/Claude backend can plug in behind a toggle.

## Consequences

- **+** Bridges lay ↔ formal terminology with zero rule maintenance. **Domain
  knowledge, not model size, is the lever** — measured on the same queries
  (`scripts/exp-clinical.py`, `scripts/compare-model.mjs`):
  - MiniLM (22 M) and all-mpnet (110 M, general) both **miss** "heart attack" →
    I21 and "high blood pressure" → I10; all-mpnet was even worse on "piles".
  - **BioLORD-2023** surfaces I21.9 (acute MI), I10 (essential hypertension), and
    K64.x (hemorrhoids for "piles") — the first model to get all three. PubMedBERT
    was weaker (missed I21; mapped "piles" → "pilates").
  - The int8 ONNX in transformers.js reproduces the PyTorch results (validated),
    so quantization didn't cost the clinical gains.
- **+** Fully offline and portable; no LLM, no GPU, no server — essential for the
  hospital PC. Query latency is a few ms of dot products after the model warms up.
- **+** Model is swappable via one constant (`MODEL_ID`) + rebuilding embeddings.
- **−** Bundle is large: model (~110 MB int8) + vectors (~57 MB) + ORT WASM
  (~21 MB) → the unpacked extension is ~200 MB. Accepted for the offline quality.
- **−** BioLORD has no anonymous prebuilt ONNX, so the build path needs Python +
  optimum (`scripts/convert-biolord.py`), a heavier dev dependency than MiniLM's
  direct download.
- **−** int8 quantization is a small accuracy trade for a ~4× smaller vector file.
- **−** Reranking can only reorder retrieved candidates, so retrieval quality
  (the embedding model) is the real ceiling — not the optional LLM layer.
