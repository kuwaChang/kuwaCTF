# -*- coding: utf-8 -*-
"""
指定モデルのスコアを 評価データシートの新規ブロックに書き込む。
- ブロックは BASE_ROW から開始（1問=6行: 回答回数1-3 × 生成AI/人間）
- A列/C列は「ブロック先頭基準」の数式を設定（既存Llama3.2ブロックと同じ体裁）
    A: =INT((ROW()-BASE)/6)+1
    C: =INT(MOD(ROW()-BASE,6)/2)+1
- B列=モデル名, D列=生成AI/人間ラベル
- 生成AI行のE〜Kにスコアを記入（人間行は空のまま）
- 書き込み前にタイムスタンプ付きバックアップを作成

環境変数:
  SCORES      スコアJSON (default scripts/scores-elyza.json)
  MODEL_LABEL モデル名ラベル (default Elyza)
  BASE_ROW    ブロック先頭行 (default 1046)
  NQ          質問数 (default 174)
"""
import openpyxl, json, shutil, datetime, os, sys

PATH = r"docs/回答評価シート(最終).xlsx"
SCORES = os.environ.get("SCORES", "scripts/scores-elyza.json")
MODEL_LABEL = os.environ.get("MODEL_LABEL", "Elyza")
BASE_ROW = int(os.environ.get("BASE_ROW", "1046"))
NQ = int(os.environ.get("NQ", "174"))

COLS = ["正確性", "網羅性", "具体性", "初心者適合性", "安全性/倫理", "情報開示適切性", "日本語の自然さ"]
ALIASES = {
    "正確性": ["正確性", "accuracy"],
    "網羅性": ["網羅性", "coverage"],
    "具体性": ["具体性", "specificity"],
    "初心者適合性": ["初心者適合性", "初心者適合", "beginner"],
    "安全性/倫理": ["安全性/倫理", "安全性・倫理", "安全性倫理", "safety"],
    "情報開示適切性": ["情報開示適切性", "disclosure"],
    "日本語の自然さ": ["日本語の自然さ", "日本語自然さ", "fluency"],
}

def get_score(item, canonical):
    for k in ALIASES[canonical]:
        if k in item and item[k] is not None:
            return item[k]
    return None

def main():
    if not os.path.exists(SCORES):
        print("scores がありません:", SCORES); sys.exit(1)
    data = json.load(open(SCORES, encoding="utf-8"))
    arr = data["scores"] if isinstance(data, dict) else data
    lut = {(int(s["qid"]), int(s["run"])): s for s in arr}

    # 全 (qid,run) が揃っているか
    missing = [(q, r) for q in range(1, NQ+1) for r in range(1, 4) if (q, r) not in lut]
    if missing:
        print("スコア欠損:", len(missing), missing[:10]); sys.exit(1)

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    bak = PATH.replace(".xlsx", f".backup-{stamp}.xlsx")
    shutil.copyfile(PATH, bak)
    print("バックアップ:", bak)

    wb = openpyxl.load_workbook(PATH)  # 数式保全
    ev = wb["評価データ"]

    a_formula = "=INT((ROW()-{b})/6)+1".format(b=BASE_ROW)
    c_formula = "=INT(MOD(ROW()-{b},6)/2)+1".format(b=BASE_ROW)

    gen_rows = 0
    for qid in range(1, NQ+1):
        for offset in range(6):
            r = BASE_ROW + (qid-1)*6 + offset
            ev.cell(r, 1).value = a_formula     # A 質問ID（数式）
            ev.cell(r, 3).value = c_formula     # C 回答回数（数式）
            ev.cell(r, 2).value = MODEL_LABEL   # B 言語モデル
            is_ai = (offset % 2 == 0)
            ev.cell(r, 4).value = "生成AI" if is_ai else "人間"  # D 評価者
            if is_ai:
                run = offset // 2 + 1
                s = lut[(qid, run)]
                for i, c in enumerate(COLS):
                    ev.cell(r, 5 + i).value = get_score(s, c)
                gen_rows += 1

    wb.save(PATH)
    last = BASE_ROW + NQ*6 - 1
    print(f"書き込み完了: モデル={MODEL_LABEL} 行{BASE_ROW}〜{last} 生成AI={gen_rows}行")

if __name__ == "__main__":
    main()
