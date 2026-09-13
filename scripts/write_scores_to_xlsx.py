# -*- coding: utf-8 -*-
"""
scripts/scores.json を読み、docs/回答評価シート(最終).xlsx の
評価データシートの「生成AI」行(E〜K)へスコアを書き込む。
- 1問=6行構造: 行 = 2 + (qid-1)*6 + (run-1)*2 が生成AI行、その次行が人間行
- B列='Llama3.2', D列ラベル（生成AI/人間）を補完
- 人間行のスコア(E〜K)は非破壊（既存値を残す）
- A列/C列の数式、他シート、グラフはそのまま保全
- 書き込み前にタイムスタンプ付きバックアップを作成
"""
import openpyxl, json, shutil, datetime, os, sys

PATH = r"docs/回答評価シート(最終).xlsx"
SCORES = r"scripts/scores.json"
MODEL_LABEL = "Llama3.2"

COLS = ["正確性", "網羅性", "具体性", "初心者適合性", "安全性/倫理", "情報開示適切性", "日本語の自然さ"]
# scores.json のキー名（採点側の出力に合わせる。別名も許容）
KEY_ALIASES = {
    "正確性": ["正確性", "accuracy"],
    "網羅性": ["網羅性", "coverage"],
    "具体性": ["具体性", "specificity"],
    "初心者適合性": ["初心者適合性", "初心者適合", "beginner"],
    "安全性/倫理": ["安全性/倫理", "安全性・倫理", "安全性倫理", "safety"],
    "情報開示適切性": ["情報開示適切性", "disclosure"],
    "日本語の自然さ": ["日本語の自然さ", "日本語自然さ", "fluency"],
}

def get_score(item, canonical):
    for k in KEY_ALIASES[canonical]:
        if k in item and item[k] is not None:
            return item[k]
    return None

def gen_ai_row(qid, run):
    return 2 + (qid - 1) * 6 + (run - 1) * 2

def main():
    if not os.path.exists(SCORES):
        print("scores.json がありません:", SCORES); sys.exit(1)
    data = json.load(open(SCORES, encoding="utf-8"))
    scores = data["scores"] if isinstance(data, dict) else data

    # バックアップ
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = PATH.replace(".xlsx", f".backup-{stamp}.xlsx")
    shutil.copyfile(PATH, bak)
    print("バックアップ:", bak)

    wb = openpyxl.load_workbook(PATH)  # 数式保全
    ev = wb["評価データ"]

    written = 0
    for it in scores:
        qid = int(it["qid"]); run = int(it["run"])
        r = gen_ai_row(qid, run)
        # ラベル補完
        ev.cell(r, 2).value = MODEL_LABEL      # B 言語モデル
        ev.cell(r, 4).value = "生成AI"          # D 評価者
        # 人間行のラベルも補完（スコアは触らない）
        hr = r + 1
        if ev.cell(hr, 2).value in (None, ""):
            ev.cell(hr, 2).value = MODEL_LABEL
        if ev.cell(hr, 4).value in (None, ""):
            ev.cell(hr, 4).value = "人間"
        # スコア E(5)〜K(11)
        for i, canonical in enumerate(COLS):
            v = get_score(it, canonical)
            ev.cell(r, 5 + i).value = v
        written += 1

    wb.save(PATH)
    print(f"書き込み完了: {written} 行(生成AI)。ファイル: {PATH}")

if __name__ == "__main__":
    main()
