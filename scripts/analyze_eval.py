# -*- coding: utf-8 -*-
import openpyxl, io
from collections import defaultdict, Counter

PATH = r"docs/回答評価シート(最終).xlsx"
out = io.StringIO()
def p(*a): print(*a, file=out)

wb = openpyxl.load_workbook(PATH, data_only=True)

# 質問シート
qs = wb["質問シート"]
p("=== 質問シート ===")
p("max_row:", qs.max_row, "(=> 質問数:", qs.max_row - 1, ")")
cats = Counter()
for r in range(2, qs.max_row + 1):
    cat = qs.cell(r, 1).value
    q = qs.cell(r, 2).value
    if q is None and cat is None:
        continue
    cats[cat] += 1
p("カテゴリ別件数:", dict(cats))

# 評価データ
ev = wb["評価データ"]
p("\n=== 評価データ ===")
p("max_row:", ev.max_row)
models = Counter()
evaluator = Counter()
by_model_qid = defaultdict(set)
by_model_count = defaultdict(set)
rows = []
empty_ai = []  # 生成AIでE-Kが空の行
filled_ai = 0
for r in range(2, ev.max_row + 1):
    qid = ev.cell(r, 1).value
    model = ev.cell(r, 2).value
    cnt = ev.cell(r, 3).value
    ev_who = ev.cell(r, 4).value
    scores = [ev.cell(r, c).value for c in range(5, 12)]  # E..K
    if qid is None and model is None and ev_who is None:
        continue
    models[model] += 1
    evaluator[ev_who] += 1
    by_model_qid[model].add(qid)
    by_model_count[model].add(cnt)
    if ev_who == "生成AI":
        if all(s is None for s in scores):
            empty_ai.append((r, qid, model, cnt))
        else:
            filled_ai += 1

p("言語モデル別 行数:", dict(models))
p("評価者別 行数:", dict(evaluator))
for m in by_model_qid:
    qids = sorted([q for q in by_model_qid[m] if q is not None])
    p(f"  model={m!r}: 質問ID {min(qids) if qids else '-'}〜{max(qids) if qids else '-'} (種類{len(qids)}), 回答回数={sorted([c for c in by_model_count[m] if c is not None])}")
p("\n生成AI 行: 記入済み=", filled_ai, " 空欄=", len(empty_ai))
if empty_ai[:5]:
    p("空欄の例(先頭5):", empty_ai[:5])
if empty_ai:
    p("空欄の最終5:", empty_ai[-5:])

with open("scripts/_eval_analysis.txt", "w", encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
