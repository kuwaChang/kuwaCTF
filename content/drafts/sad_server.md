# sad server 問題別ヒント集

AI先生が sad server カテゴリ（Linux操作シナリオ）の各問題に答えるときに参照するための補助資料です。  
直接の答え（フラグそのもの）は示さず、着眼点と段階ヒントをまとめます。  
このカテゴリはターミナル上でファイル探索・権限操作を行うシナリオ型です。

---

## easy1（★easy1）
- カテゴリー: sad server / シナリオ: easy1
- 着眼点:
  - シンプルなファイル読み取り。まずは所定のディレクトリを探索する
- 段階ヒント:
  - `/challenge` ディレクトリを `ls` で確認する
  - `README.txt` を読む
  - flagらしきファイルを `cat` で表示する

```sh
ls -la /challenge
cat /challenge/README.txt
```

---

## easy2（easy2）
- カテゴリー: sad server / シナリオ: easy2
- 着眼点:
  - `index.txt` に隠されたflagを探す。ファイルが大きい場合は検索で絞る
- 段階ヒント:
  - `/challenge` を探索し `README.txt` を読む
  - `index.txt` の中身を `cat` で確認する
  - `grep` で `FLAG` らしき文字列を検索する

```sh
grep -i flag /challenge/index.txt
```

---

## medium1（medium1）
- カテゴリー: sad server / シナリオ: medium
- 着眼点:
  - エンコードされたflagファイル（`flag.enc`）を復号する
  - Base64エンコードの可能性が高い
- 段階ヒント:
  - `README.txt` と `/srv/app/log/` を探索してヒントを集める
  - `cat /challenge/flag.enc` で中身の形式を確認する
  - Base64なら `base64 -d` で復号する

```sh
cat /challenge/flag.enc
base64 -d /challenge/flag.enc
```

---

## hard1（hard1）
- カテゴリー: sad server / シナリオ: hard
- 着眼点:
  - `/challenge/service` が異常終了。原因はパーミッション
  - `flag.txt` の権限が `0000` になっていて読めない
- 段階ヒント:
  - `README.txt` を読み、`/challenge/service` を実行してエラーを確認する
  - `ls -la /challenge/` で各ファイルの権限を確認する
  - `/tmp/hint.txt` を読み、`chmod` で読み取り権限を付けてから `cat` する

```sh
ls -la /challenge/
chmod 644 /challenge/flag.txt
cat /challenge/flag.txt
```

---

## test1（test1）
- カテゴリー: sad server / シナリオ: test1
- 着眼点:
  - 動作確認用のテストシナリオ
- 段階ヒント:
  - `README.txt` を読み、指示に従う

---

## 問題メタ情報（補足）

### easy1
- タイトル: ★easy1 / カテゴリー: sad server / シナリオ: easy1
- 説明文: シンプルなファイル読み取り。flagファイルを見つけて内容を確認。

### easy2
- タイトル: easy2 / カテゴリー: sad server / シナリオ: easy2
- 説明文: index.txt に隠されたflagを見つける。

### medium1
- タイトル: medium1 / カテゴリー: sad server / シナリオ: medium
- 説明文: エンコード（Base64）されたflagファイルを復号。ヒントディレクトリ `/srv/app/log/`。

### hard1
- タイトル: hard1 / カテゴリー: sad server / シナリオ: hard
- 説明文: `/challenge/service` が異常終了。flag.txt の権限が 0000。chmodで変更して読み取る。

### test1
- タイトル: test1 / カテゴリー: sad server / シナリオ: test1
- 説明文: testシナリオ。README.txt を読む。
