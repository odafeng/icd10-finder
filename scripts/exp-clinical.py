"""Experiment: compare a clinical sentence-embedding model against the current
MiniLM baseline on the same lay-term queries (esp. "heart attack"). PyTorch
only — no ONNX yet; we convert for the extension only if a model wins here.

Usage: .venv-exp/bin/python scripts/exp-clinical.py <model_name>
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parent.parent
QUERIES = ["colon cancer", "heart attack", "high blood pressure", "appendicitis", "piles"]

model_name = sys.argv[1]
recs = json.loads((ROOT / "data" / "icd10cm.json").read_text())
names = [r["name"] for r in recs]
print(f"model={model_name}  corpus={len(recs)}", flush=True)

model = SentenceTransformer(model_name)
t0 = time.time()
emb = model.encode(
    names, batch_size=128, normalize_embeddings=True, show_progress_bar=True
).astype(np.float32)
print(f"embedded in {time.time() - t0:.0f}s, dim={emb.shape[1]}", flush=True)

for q in QUERIES:
    qe = model.encode([q], normalize_embeddings=True)[0].astype(np.float32)
    sims = emb @ qe
    idx = np.argsort(-sims)[:5]
    print(f"\n[{q}]")
    for i in idx:
        print(f"  {sims[i]:.3f}  {recs[i]['code']}\t{recs[i]['name']}")
