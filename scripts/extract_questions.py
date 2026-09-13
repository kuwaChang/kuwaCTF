# -*- coding: utf-8 -*-
import openpyxl, json
PATH = r"docs/回答評価シート(最終).xlsx"
wb = openpyxl.load_workbook(PATH, data_only=True)
qs = wb["質問シート"]
out = []
for r in range(2, qs.max_row + 1):
    cat = qs.cell(r, 1).value
    q = qs.cell(r, 2).value
    if q is None:
        continue
    out.append({"qid": r - 1, "category": cat, "question": str(q).strip()})
with open("scripts/questions.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print("questions:", len(out))
