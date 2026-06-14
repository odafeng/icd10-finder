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

- Embedding model: `all-MiniLM-L6-v2` (22 M params, 384-dim), run via
  transformers.js. Corpus vectors are precomputed and int8-quantized
  (`data/embeddings.bin`, ~29 MB); the query is embedded at runtime. Everything —
  model, WASM runtime, vectors — is bundled, so semantic search is fully offline.
- Keyword search (inverted index + code-prefix match) runs alongside for exact
  terminology and code lookups.
- The two ranked lists are combined with **Reciprocal Rank Fusion** (`k = 60`),
  which needs no score calibration between engines.
- An LLM reranker interface exists (`src/search/rerank.ts`) but defaults to a
  no-op. A future Ollama/Claude backend can plug in behind a toggle.

## Consequences

- **+** Bridges lay ↔ formal terminology with zero rule maintenance; verified on
  "colon cancer" → C18.x, "piles" → K64.x, "high blood pressure" → hypertension.
- **+** Fully offline and portable; no LLM, no GPU, no server. Query latency is a
  few ms of dot products after the model warms up.
- **+** Model is swappable via one constant (`MODEL_ID`) + rebuilding embeddings.
- **−** MiniLM is a small general model and misses some clinical synonyms (e.g.
  "heart attack" does not surface I21 acute MI). **Empirically, model size is not
  the lever**: a 5× larger general model (all-mpnet-base-v2, 110 M) still missed
  "heart attack" and was actually _worse_ on "piles" and "colon cancer" ordering
  (see `scripts/compare-model.mjs`). The gap is clinical domain knowledge, so the
  real fixes are a clinical embedding model (BioLORD/PubMedBERT — needs ONNX
  conversion via optimum, no anonymous pre-built ONNX today) or an LLM
  query-expansion step that knows "heart attack = myocardial infarction".
- **−** Bundle grows by the model (~23 MB) + vectors (~29 MB) + ORT WASM (~21 MB).
- **−** int8 quantization is a small accuracy trade for a ~4× smaller vector file.
- **−** Reranking can only reorder retrieved candidates, so retrieval quality
  (the embedding model) is the real ceiling — not the optional LLM layer.
