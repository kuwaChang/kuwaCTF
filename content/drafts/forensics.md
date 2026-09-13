# Forensics 問題別ヒント集

AI先生が Forensics カテゴリの各問題に答えるときに参照するための補助資料です。  
直接の答え（フラグそのもの）は示さず、着眼点と段階ヒントをまとめます。

> 注意: `quizData.json` 上、問題文が登録されているのは `forensics1〜forensics4` のみです。  
> `forensics5〜forensics16` はタイトル・説明文が空欄（未設定）のため、内容を推測して断定しないこと。  
> それらを聞かれた場合は「この問題はまだ問題文が未登録です」と伝え、`forensics.md`（一般ナレッジ）の初動手順（file → strings → exiftool → binwalk）を案内する。

---

## forensics1（Welcome!）
- カテゴリー: forensics
- 添付: `anthem.flag.txt`
- 着眼点:
  - テキスト/ファイルの中から `FLAG{...}` を探す導入問題
  - 目視で探しづらい場合は文字列抽出・検索を使う
- 段階ヒント:
  - `strings` で可読文字列を抽出する
  - `grep` で `FLAG` を含む行を絞り込む
  - 大文字小文字や記号（`{`）も検索対象にする

```sh
strings -a anthem.flag.txt | grep -i flag
```

---

## forensics2（ここどこ？）
- カテゴリー: forensics
- 添付: `kokodoko.jpg`
- 着眼点:
  - ヒント「色が気持ち悪い」＝色調・チャンネルが不自然に加工されている可能性
  - 見えている場所を特定するというより、色操作で隠された情報を炙り出すタイプ
- 段階ヒント:
  - 画像編集ツールやStego解析で色チャンネル・階調を反転/分離してみる
  - コントラストや特定チャンネルを強調して隠れた文字が出ないか確認する
  - 出てきた文字（施設名など）をフラグ形式に整える

---

## forensics3（プロパティ）
- カテゴリー: forensics
- 添付: `biwa.jpg`
- 着眼点:
  - タイトル「プロパティ」＝ファイルのプロパティ＝メタデータ（EXIF）を見る問題
  - 画像の中身よりも付随情報にフラグがある
- 段階ヒント:
  - `exiftool` でメタデータを一覧する
  - Comment / Description / Artist などの項目を確認する
  - 見つかった文字列をフラグ形式に整える

```sh
exiftool biwa.jpg
```

---

## forensics4（真っ白）
- カテゴリー: forensics
- 添付: （なし）
- 着眼点:
  - 「真っ白・まぶしすぎる」＝白背景に白文字、または極端な明るさで情報が隠れている可能性
  - 添付ファイルが未登録のため、まず提示物（画像やテキスト）の所在を確認する
- 段階ヒント:
  - 対象がある場合は明度/コントラスト/階調を調整して文字を浮かせる
  - 画像なら色反転や特定チャンネル抽出を試す
  - 添付が見当たらない場合は、問題側の素材が未配置の可能性を伝える

---

## forensics5〜forensics16（未登録）
- カテゴリー: forensics
- 状態: `quizData.json` にタイトル・説明文・添付が未設定（`FLAG{}` プレースホルダ）
- 対応方針:
  - 具体的なヒントを推測で作らない
  - 「この問題はまだ問題文が登録されていません」と正直に伝える
  - 一般的なForensics初動（下記）だけを案内する

```sh
file target
strings -a target | less
exiftool target
binwalk target
```

---

## 問題メタ情報（補足）

### forensics1
- タイトル: Welcome! / カテゴリー: forensics / 添付: anthem.flag.txt
- 説明文: FLAGをさがせ！（strings + grep）

### forensics2
- タイトル: ここどこ？ / カテゴリー: forensics / 添付: kokodoko.jpg
- 説明文: どこかで見たことがある…。ヒント「色が気持ち悪い」（色操作で情報を隠している）。

### forensics3
- タイトル: プロパティ / カテゴリー: forensics / 添付: biwa.jpg
- 説明文: ビワについてもっと知りたい。詳細（プロパティ/EXIF）を見る。

### forensics4
- タイトル: 真っ白 / カテゴリー: forensics / 添付: なし
- 説明文: 真っ白！まぶしすぎる（明度・階調調整や色反転で隠し情報を出す）。

### forensics5〜16
- タイトル・説明文: 未設定（プレースホルダ）
