# -*- coding: utf-8 -*-
import json
d = json.load(open("scripts/answers.json", encoding="utf-8"))
res = d["results"]
print("model:", d.get("model"))
print("questions:", len(res))
bad = [r["qid"] for r in res if len(r["runs"]) != 3]
empty = [(r["qid"], i+1) for r in res for i, run in enumerate(r["runs"]) if not (run.get("answer") or "").strip()]
errs = [(r["qid"], i+1, run.get("error")) for r in res for i, run in enumerate(r["runs"]) if run.get("error")]
print("runs!=3:", bad)
print("empty answers:", empty[:20], "count=", len(empty))
print("errors:", errs[:20], "count=", len(errs))
qids = sorted(r["qid"] for r in res)
print("qid range:", qids[0], "..", qids[-1], "missing:", [q for q in range(1,175) if q not in set(qids)])
