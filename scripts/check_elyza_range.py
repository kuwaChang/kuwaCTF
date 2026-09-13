# -*- coding: utf-8 -*-
import openpyxl, io
PATH = r"docs/回答評価シート(最終).xlsx"
out = io.StringIO()
def p(*a): print(*a, file=out)

# 値ビュー（data_only）とформ式ビュー両方
wbv = openpyxl.load_workbook(PATH, data_only=True)
evv = wbv["評価データ"]
wbf = openpyxl.load_workbook(PATH)
evf = wbf["評価データ"]
p("max_row:", evv.max_row)

def show(r0, r1, label):
    p(f"\n--- {label} (rows {r0}..{r1}) ---")
    for r in range(r0, r1+1):
        vv = [evv.cell(r,c).value for c in range(1,12)]
        p(f"r{r} VAL: " + " | ".join(str(x) for x in vv))

show(1042, 1052, "Llama末尾〜ELYZA開始想定")
show(1178, 1184, "旧数式末尾付近")

# ELYZA範囲(1046..2089)に既存の非空データ(B/D/E-K)が無いか
dirty = []
for r in range(1046, 2090):
    for c in [2,4,5,6,7,8,9,10,11]:
        v = evv.cell(r,c).value
        if v not in (None, ""):
            dirty.append((r, c, v)); break
p("\nELYZA範囲(1046-2089) の既存非空セル数:", len(dirty), " 例:", dirty[:10])
with open("scripts/_elyza_range.txt","w",encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
