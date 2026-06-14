"""Export FremyCompany/BioLORD-2023 to ONNX, quantize to int8, and lay it out
the way transformers.js expects so the extension can embed queries offline.

Output: models/FremyCompany/BioLORD-2023/{config.json, tokenizer.json,
tokenizer_config.json, special_tokens_map.json, onnx/model_quantized.onnx}

Run: .venv-exp/bin/python scripts/convert-biolord.py
"""

import shutil
from pathlib import Path

from optimum.onnxruntime import ORTModelForFeatureExtraction
from onnxruntime.quantization import quantize_dynamic, QuantType
from transformers import AutoTokenizer

MODEL = "FremyCompany/BioLORD-2023"
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "models" / MODEL
TMP = ROOT / ".biolord_export"

print(f"exporting {MODEL} to ONNX…", flush=True)
model = ORTModelForFeatureExtraction.from_pretrained(MODEL, export=True)
model.save_pretrained(TMP)
AutoTokenizer.from_pretrained(MODEL).save_pretrained(TMP)

print("quantizing to int8…", flush=True)
(DEST / "onnx").mkdir(parents=True, exist_ok=True)
quantize_dynamic(TMP / "model.onnx", DEST / "onnx" / "model_quantized.onnx", weight_type=QuantType.QInt8)

# transformers.js layout: config + tokenizer at model root, onnx under onnx/
for name in ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]:
    src = TMP / name
    if src.exists():
        shutil.copy(src, DEST / name)

shutil.rmtree(TMP, ignore_errors=True)
size_mb = (DEST / "onnx" / "model_quantized.onnx").stat().st_size / 1e6
print(f"done → {DEST}  (model_quantized.onnx {size_mb:.0f} MB)", flush=True)
