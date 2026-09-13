# -*- coding: utf-8 -*-
"""answers.json を採点バッチに分割する。
各バッチ = QPB 問（1問=3回答）。scripts/batches/batch_XX.json に出力。"""
import json, os, math

ANSWERS = os.environ.get("ANSWERS", "scripts/answers.json")
OUTDIR = os.environ.get("BATCHDIR", "scripts/batches")
QPB = int(os.environ.get("QPB", "15"))  # 1バッチあたりの質問数

os.makedirs(OUTDIR, exist_ok=True)
data = json.load(open(ANSWERS, encoding="utf-8"))
results = data["results"] if isinstance(data, dict) else data
results = sorted(results, key=lambda x: x["qid"])

batches = math.ceil(len(results) / QPB)
for b in range(batches):
    chunk = results[b*QPB:(b+1)*QPB]
    items = []
    for res in chunk:
        for i, run in enumerate(res["runs"], start=1):
            items.append({
                "qid": res["qid"],
                "run": i,
                "category": res.get("category"),
                "question": res["question"],
                "answer": run.get("answer", ""),
            })
    path = os.path.join(OUTDIR, f"batch_{b+1:02d}.json")
    json.dump({"items": items}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"{path}: {len(items)} items (qid {chunk[0]['qid']}..{chunk[-1]['qid']})")

print("batches:", batches)
