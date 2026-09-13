# -*- coding: utf-8 -*-
import openpyxl, io, json
PATH = r"docs/回答評価シート(最終).xlsx"
BASE = 1046
out = io.StringIO()
def p(*a): print(*a, file=out)

wbf = openpyxl.load_workbook(PATH)          # 数式ビュー
ev = wbf["評価データ"]

def gen_row(qid, run): return BASE + (qid-1)*6 + (run-1)*2

p("A1046 formula:", ev.cell(BASE,1).value, "| C1046 formula:", ev.cell(BASE,3).value)
p("\n--- ELYZA 代表行 (A式,C式,B,D,E..K) ---")
for (qid,run) in [(1,1),(1,2),(1,3),(2,1),(64,1),(100,3),(174,1),(174,3)]:
    r = gen_row(qid,run)
    vals = [ev.cell(r,c).value for c in [1,3,2,4,5,6,7,8,9,10,11]]
    p(f"qid={qid} run={run} row={r}: A={vals[0]} C={vals[1]} B={vals[2]} D={vals[3]} E-K={vals[4:]}")

# Llamaブロック非破壊確認（行2,3,1044,1045）
p("\n--- Llamaブロック（非破壊確認）---")
for r in [2,3,1044,1045]:
    vals = [ev.cell(r,c).value for c in [1,2,4,5,6,7,8,9,10,11]]
    p(f"r{r}: A={vals[0]} B={vals[1]} D={vals[2]} E-K={vals[3:]}")

# ELYZAブロック網羅チェック
issues = []
for qid in range(1,175):
    for run in range(1,4):
        r = gen_row(qid,run)
        if ev.cell(r,2).value != "Elyza": issues.append(("B",qid,run,ev.cell(r,2).value))
        if ev.cell(r,4).value != "生成AI": issues.append(("D",qid,run,ev.cell(r,4).value))
        if any(ev.cell(r,c).value is None for c in range(5,12)): issues.append(("SCORE_NONE",qid,run))
    # 人間行ラベル
    for run in range(1,4):
        hr = gen_row(qid,run)+1
        if ev.cell(hr,4).value != "人間": issues.append(("D_HUMAN",qid,run,ev.cell(hr,4).value))
p("\nELYZAブロック 異常:", len(issues), issues[:10])

# 平均
data = json.load(open("scripts/scores-elyza.json", encoding="utf-8"))["scores"]
cols = ["正確性","網羅性","具体性","初心者適合性","安全性/倫理","情報開示適切性","日本語の自然さ"]
avg = {c: round(sum(s[c] for s in data)/len(data),2) for c in cols}
overall = round(sum(sum(s[c] for c in cols) for s in data)/(len(data)*7),3)
p("\nELYZA 生成AI採点 平均:", avg)
p("全体平均:", overall, " 件数:", len(data))

with open("scripts/_verify_elyza.txt","w",encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
