# ローカルLLMセットアップガイド

AI チューターが使う Ollama のモデルと、その設定方法をまとめます。ChromaDB や知識ベースを含めた手順全体は [AIチューター完全ローカルセットアップガイド](./AIチューター完全ローカルセットアップガイド.md) を参照してください。

チューターは Ollama だけで動きます。外部の API やキーは使いません。

## 使うモデル

| 用途 | 既定のモデル | 変更する環境変数 |
|------|--------------|------------------|
| チャット（回答生成） | `elyza-jp:8b` | `OLLAMA_MODEL` |
| 埋め込み（知識ベース検索） | `bge-m3` | `OLLAMA_EMBEDDING_MODEL` |

既定値は `src/services/tutorService.js` と `src/services/vectorStore.js` に書かれています。

## 1. Ollama のインストール

[Ollama](https://ollama.com/download) をインストールします。インストール後は `http://localhost:11434` で待ち受けます。

Linux / Mac の場合は次でも入れられます。

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## 2. モデルの取得

```powershell
ollama pull hf.co/elyza/Llama-3-ELYZA-JP-8B-GGUF:latest
ollama create elyza-jp:8b -f config/ollama/Modelfile.elyza
ollama pull bge-m3
ollama list
```

`ollama list` に `hf.co/elyza/...`、`elyza-jp:8b`、`bge-m3` の 3 つが表示されれば完了です。

`ollama create` は、ELYZA を正しいチャットテンプレート（Llama 3 形式）で登録し直す手順です。Hugging Face から pull しただけのモデルはテンプレートが ChatML 形式になっていて、回答が途中で止まったり、指示文が回答に写ったりしやすくなります。モデル本体は使い回すので、追加のダウンロードはありません。元のモデルに戻すときは `OLLAMA_MODEL` に `hf.co/elyza/Llama-3-ELYZA-JP-8B-GGUF:latest` を指定します。

## 3. 環境変数（任意）

既定のままなら設定は不要です。プロジェクトは `.env` を読み込まないため、変更する場合は `npm start` と同じシェルで設定します。

```powershell
$env:OLLAMA_MODEL = "elyza-jp:8b"
$env:OLLAMA_EMBEDDING_MODEL = "bge-m3"
npm start
```

| 変数 | 意味 | 未設定のとき |
|------|------|--------------|
| `OLLAMA_BASE_URL` | Ollama の URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | チャットモデル | `elyza-jp:8b` |
| `OLLAMA_EMBEDDING_MODEL` | 埋め込みモデル | `bge-m3` |
| `OLLAMA_EMBEDDING_NUM_GPU` | 埋め込みに使う GPU レイヤー数 | `0`（埋め込みは CPU で計算） |
| `CHROMA_URL` | ChromaDB の URL | `http://localhost:8000` |

埋め込みを CPU で動かすのは、GPU をチャットモデル専用にして、モデルの入れ替えが起きないようにするためです。GPU に余裕があれば `OLLAMA_EMBEDDING_NUM_GPU` を設定して GPU を使えます。

## 4. 起動と確認

```powershell
npm start
```

チューターが初期化されると、サーバーのログに次の行が出ます。

```text
✅ ローカルLLM（Ollama）を初期化しました: elyza-jp:8b at http://localhost:11434
```

ログインして `http://localhost:3333/tutor` を開き、画面上部のステータスが次のようになれば準備完了です。

```text
準備完了 (ローカルLLM: elyza-jp:8b, 知識ベース: XX件)
```

## チャットモデルの生成設定

`src/services/tutorService.js` の `initialize()` で固定しています。変える場合はこのコードを編集します。

| 設定 | 値 | 意味 |
|------|----|------|
| `temperature` | 0.2 | 回答のばらつきを抑える |
| `numPredict` | 1024 | 1 回の回答の最大トークン数 |
| `numCtx` | 4096 | コンテキスト長 |
| `numGpu` | 999 | 可能な限り GPU に載せる |
| `repeatPenalty` | 1.15 | 同じ語句の繰り返しを抑える |

## モデルを変える場合

- チャットモデル：`ollama pull <モデル名>` のあと `OLLAMA_MODEL` を設定して再起動します。知識ベースの作り直しは不要です。
- 埋め込みモデル：`OLLAMA_EMBEDDING_MODEL` を変えたら、知識ベースを作り直します（`/tutor/rebuild`）。既存の索引は前のモデルで作られているため、そのままでは検索が合いません。

## トラブルシューティング

### ステータスが「⚠️ Ollamaが起動していません」

Ollama に接続できていません。`ollama list` が動くか確認し、動かなければ Ollama を起動します（Windows はスタートメニューから、Linux / Mac は `ollama serve`）。URL を変えている場合は `OLLAMA_BASE_URL` も確認します。

### 回答時にモデルが見つからないエラーになる

`ollama list` に `OLLAMA_MODEL`（未設定なら ELYZA）と同じ名前のモデルがあるか確認し、なければ `ollama pull` します。

### 知識ベースの初期化に失敗する

`ollama list` に埋め込みモデル（`OLLAMA_EMBEDDING_MODEL`、未設定なら `bge-m3`）があるか確認し、なければエラーメッセージに出るコマンドで pull します。

### 応答が遅い、またはメモリが足りない

- 他のアプリを閉じてメモリと GPU を空ける
- 軽いモデル（例：`llama3.2`）を pull して `OLLAMA_MODEL` に設定する。ただし日本語の回答品質は下がる可能性がある

チューターの回答生成は 1 件ずつ順番に処理されます。複数人が同時に質問すると、後の人は待ち行列で順番を待ちます。
