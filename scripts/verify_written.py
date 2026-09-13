# -*- coding: utf-8 -*-
import openpyxl, io, json
PATH = r"docs/回答評価シート(最終).xlsx"
out = io.StringIO()
def p(*a): print(*a, file=out)

# 数式保持確認（data_onlyなし）
wbf = openpyxl.load_workbook(PATH)
ev = wbf["評価データ"]
p("A2 formula:", ev.cell(2,1).value, "| C2 formula:", ev.cell(3,3).value)

def row(qid, run):
    return 2 + (qid-1)*6 + (run-1)*2

# 値確認（data_only=Trueは保存後キャッシュがない場合Noneになるため、ここでは書いた値=E-Kを直接確認）
p("\n--- 代表的な生成AI行 (B,D,E..K) ---")
for (qid,run) in [(1,1),(1,2),(1,3),(2,1),(6,2),(100,3),(174,1),(174,3)]:
    r = row(qid,run)
    vals = [ev.cell(r,c).value for c in [2,4,5,6,7,8,9,10,11]]
    p(f"qid={qid} run={run} row={r}: B={vals[0]} D={vals[1]} E-K={vals[2:]}")

# 人間行の非破壊確認（qid1-9は既存値が残っているはず）
p("\n--- 人間行（qid1 run1..3 の次行）---")
for (qid,run) in [(1,1),(1,2),(1,3)]:
    hr = row(qid,run)+1
    vals = [ev.cell(hr,c).value for c in [2,4,5,6,7,8,9,10,11]]
    p(f"qid={qid} run={run} humanrow={hr}: B={vals[0]} D={vals[1]} E-K={vals[2:]}")

# 生成AIラベルの網羅チェック
missing_label = []
for qid in range(1,175):
    for run in range(1,4):
        r = row(qid,run)
        if ev.cell(r,4).value != "生成AI":
            missing_label.append((qid,run,ev.cell(r,4).value))
        if any(ev.cell(r,c).value is None for c in range(5,12)):
            missing_label.append(("SCORE_NONE",qid,run))
p("\nラベル/スコア異常:", len(missing_label), missing_label[:10])

# スコア分布（平均）
data = json.load(open("scripts/scores.json", encoding="utf-8"))["scores"]
cols = ["正確性","網羅性","具体性","初心者適合性","安全性/倫理","情報開示適切性","日本語の自然さ"]
avg = {c: round(sum(s[c] for s in data)/len(data),2) for c in cols}
p("\n生成AI採点 平均(7観点):", avg)
overall = round(sum(sum(s[c] for c in cols) for s in data)/(len(data)*7),3)
p("全体平均:", overall, "  件数:", len(data))

with open("scripts/_verify_written.txt","w",encoding="utf-8") as f:
    f.write(out.getvalue())
print("done")
