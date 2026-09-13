# -*- coding: utf-8 -*-
import openpyxl, io, json
PATH = r"docs/回答評価シート(最終).xlsx"
BASE = 2090
out = io.StringIO()
def p(*a): print(*a, file=out)
ev = openpyxl.load_workbook(PATH)["評価データ"]
def gr(qid, run): return BASE + (qid-1)*6 + (run-1)*2
p("A2090:", ev.cell(BASE,1).value, "| C2090:", ev.cell(BASE,3).value, "| max_row:", ev.max_row)
p("\n--- Qwen 代表行 ---")
for (qid,run) in [(1,1),(16,1),(68,2),(100,3),(174,3)]:
    r=gr(qid,run); v=[ev.cell(r,c).value for c in [2,4,5,6,7,8,9,10,11]]
    p(f"qid={qid} run={run} row={r}: B={v[0]} D={v[1]} E-K={v[2:]}")
# 非破壊: Llama(r2), ELYZA(r1046)
p("\n--- 他ブロック非破壊 ---")
for r in [2,1046,1045,2089]:
    v=[ev.cell(r,c).value for c in [1,2,4]]
    p(f"r{r}: A={v[0]} B={v[1]} D={v[2]}")
issues=[]
for qid in range(1,175):
    for run in range(1,4):
        r=gr(qid,run)
        if ev.cell(r,2).value!="Qwen": issues.append(("B",qid,run))
        if ev.cell(r,4).value!="生成AI": issues.append(("D",qid,run))
        if any(ev.cell(r,c).value is None for c in range(5,12)): issues.append(("NONE",qid,run))
p("\nQwenブロック異常:", len(issues), issues[:10])
data=json.load(open("scripts/scores-qwen.json",encoding="utf-8"))["scores"]
cols=["正確性","網羅性","具体性","初心者適合性","安全性/倫理","情報開示適切性","日本語の自然さ"]
avg={c:round(sum(s[c] for s in data)/len(data),2) for c in cols}
overall=round(sum(sum(s[c] for c in cols) for s in data)/(len(data)*7),3)
p("\nQwen 平均:", avg); p("全体平均:", overall, "件数:", len(data))
open("scripts/_verify_qwen.txt","w",encoding="utf-8").write(out.getvalue())
print("done")
