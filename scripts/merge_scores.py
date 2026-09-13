# -*- coding: utf-8 -*-
"""scripts/scores/*.json を統合して scripts/scores.json を作る。
各バッチファイルは {"scores":[{qid,run,正確性,...,短評}]} または配列を想定。
検証: 全 (qid 1..174, run 1..3) が揃っているか、各点が1-5か。"""
import json, glob, os

INDIR = os.environ.get("SCOREDIR", "scripts/scores")
OUT = os.environ.get("SCOREOUT", "scripts/scores.json")
CANON = ["正確性", "網羅性", "具体性", "初心者適合性", "安全性/倫理", "情報開示適切性", "日本語の自然さ"]
ALIASES = {
    "正確性": ["正確性", "accuracy"],
    "網羅性": ["網羅性", "coverage"],
    "具体性": ["具体性", "specificity"],
    "初心者適合性": ["初心者適合性", "初心者適合", "beginner"],
    "安全性/倫理": ["安全性/倫理", "安全性・倫理", "安全性倫理", "safety"],
    "情報開示適切性": ["情報開示適切性", "disclosure"],
    "日本語の自然さ": ["日本語の自然さ", "日本語自然さ", "fluency"],
}

def norm(item):
    o = {"qid": int(item["qid"]), "run": int(item["run"])}
    for c in CANON:
        v = None
        for k in ALIASES[c]:
            if k in item and item[k] is not None:
                v = item[k]; break
        o[c] = v
    if "短評" in item: o["短評"] = item["短評"]
    elif "comment" in item: o["短評"] = item["comment"]
    return o

all_scores = {}
for f in sorted(glob.glob(os.path.join(INDIR, "*.json"))):
    d = json.load(open(f, encoding="utf-8"))
    arr = d["scores"] if isinstance(d, dict) and "scores" in d else d
    for it in arr:
        o = norm(it)
        all_scores[(o["qid"], o["run"])] = o

# 検証
missing, bad = [], []
for qid in range(1, 175):
    for run in range(1, 4):
        key = (qid, run)
        if key not in all_scores:
            missing.append(key); continue
        for c in CANON:
            v = all_scores[key][c]
            if not (isinstance(v, (int, float)) and 1 <= v <= 5):
                bad.append((qid, run, c, v))

out = {"scores": [all_scores[k] for k in sorted(all_scores)]}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("統合:", len(all_scores), "件 ->", OUT)
print("欠損:", len(missing), missing[:10])
print("範囲外/欠測:", len(bad), bad[:10])
