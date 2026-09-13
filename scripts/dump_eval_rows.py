# -*- coding: utf-8 -*-
import openpyxl, io
PATH = r"docs/回答評価シート(最終).xlsx"
out = io.StringIO()
def p(*a): print(*a, file=out)
wb = openpyxl.load_workbook(PATH, data_only=True)
ev = wb["評価データ"]
def rowstr(r):
    vals = [ev.cell(r, c).value for c in range(1, 12)]
    return f"r{r}: " + " | ".join(str(v) for v in vals)
p("--- rows 2..75 ---")
for r in range(2, 76):
    p(rowstr(r))
p("\n--- rows 595..610 ---")
for r in range(595, 611):
    p(rowstr(r))
p("\n--- last rows 1175..1181 ---")
for r in range(1175, 1182):
    p(rowstr(r))
with open("scripts/_eval_rows.txt", "w", encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
