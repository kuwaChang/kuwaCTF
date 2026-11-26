# AIチューターセットアップガイド

AI チューターの機能、知識ベース、API、カスタマイズ方法をまとめます。インストールと起動の手順は [AIチューター完全ローカルセットアップガイド](./AIチューター完全ローカルセットアップガイド.md)、モデルと環境変数は [ローカルLLMセットアップガイド](./ローカルLLMセットアップガイド.md) を参照してください。

## 概要

AI チューターは、問題を解いている学習者に、答えそのものではなく考え方や段階的なヒントを返す機能です。RAG（検索拡張生成）の構成で、次の 3 つを組み合わせて回答します。

- `content/knowledge/` から検索した知識（ChromaDB）
- 学習者が開いている問題の情報と、その問題のヒント集
- 直近の会話履歴

生成は Ollama のローカルモデル（既定は `elyza-jp:8b`）で行い、外部の API は使いません。

## 機能

| 機能 | 内容 |
|------|------|
| 質問 | `/tutor` で質問を送ると、回答がストリーミングで表示される |
| 問題からの連携 | 問題のモーダルの「AIチューター」ボタンで `/tutor?category=<カテゴリー>&questionId=<問題ID>` が開き、その問題を踏まえて回答する |
| 問題別ヒント | 開いている問題のヒント集の節を、会話が進むごとに浅いものから一段ずつ使う |
| 会話履歴 | ユーザーごとにサーバーのメモリで直近 20 件を保持する。サーバーを再起動すると消える |
| 順番待ち | 回答生成は 1 件ずつ。待っている人には順番が表示される |
| Q&A ログ | 質問と回答を `storage/tutor_qa_pending.jsonl` に記録し、知識ベースを作り直すときに `docs/tutor-qa-<日時>.json` に書き出す |

回答には次の後処理がかかります（`src/services/tutorService.js` の `finalizeAnswer`）。

- フラグ文字列を伏せる
- 参照資料にない URL を取り除く
- 指示文のオウム返し、決まり文句の書き出し、同じ文の繰り返しを取り除く
- 英語の拒否応答を日本語にする
- 6,000 文字を超える回答は切り詰める

## 知識ベース

`content/knowledge/` の Markdown が知識ベースです。

| ファイル | 内容 | 使われ方 |
|----------|------|----------|
| `crypto.md` | 暗号 | 検索 |
| `forensics.md` | フォレンジック | 検索 |
| `web.md` | Web セキュリティ | 検索 |
| `osint.md` | OSINT | 検索 |
| `steganography.md` | ステガノグラフィ | 検索 |
| `reversing_pwn.md` | リバースエンジニアリング・Pwn | 検索 |
| `tools_and_commands.md` | CTF ツールとコマンド | 検索 |
| `learning_sites_and_terms.md` | 学習サイトと用語 | 検索 |
| `meta.md` | CTF の進め方 | 検索 |
| `easy1.md`〜`hard2.md`（6 ファイル） | ストーリー問題の問題別ヒント集 | その問題を開いているときだけ使う |

検索用のファイルは、見出しごとに分けて Chroma に登録されます。検索結果の `category` にはファイル名（拡張子なし）が入ります。次の名前の節は、LLM への指示用なので索引に入れません。

- ローカルLLM回答方針
- 安全な回答方針
- 情報開示の注意

### 知識を追加・修正する

1. `content/knowledge/` に Markdown を追加するか、既存のファイルを編集する
2. ログインして `/tutor/rebuild` を開き、索引を作り直す

作り直さないと既存の索引がそのまま使われ、変更は反映されません。

問題別ヒント集を追加する場合は、カテゴリー名を小文字にしたファイル名（`Easy1` → `easy1.md`）にし、問題ごとに `## <問題ID>` の節を作ります。対象はファイル名が `easy`・`medium`・`hard` + 数字のものだけです。

## API

すべてログインが必要です（未ログインは 401）。

| メソッド | パス | 内容 |
|----------|------|------|
| POST | `/tutor/ask` | 質問に答える（回答をまとめて返す） |
| POST | `/tutor/ask/stream` | 質問に答える（NDJSON でストリーミング） |
| POST | `/tutor/hint` | 指定した問題のヒントを返す |
| POST | `/tutor/clear` | 自分の会話履歴を消す |
| GET / POST | `/tutor/rebuild` | 知識ベースを作り直し、Q&A ログを書き出す |
| GET | `/tutor/status` | Ollama と知識ベースの状態を返す |

### POST /tutor/ask

リクエスト（`category` と `questionId` は任意。指定するとその問題を踏まえて回答する）：

```json
{
  "question": "ROT13暗号の解き方を教えてください",
  "category": "Easy1",
  "questionId": "beginner1"
}
```

レスポンス：

```json
{
  "answer": "ROT13は...",
  "sources": [
    { "category": "crypto", "source": "crypto.md", "relevance": "0.62" }
  ]
}
```

`relevance` は 1 − 距離を小数 2 桁の文字列にしたものです。`question` が空なら 400 を返します。

### POST /tutor/ask/stream

リクエストは `/tutor/ask` と同じです。レスポンスは `application/x-ndjson` で、1 行に 1 つの JSON を次の順で送ります。

| `type` | 中身 | 意味 |
|--------|------|------|
| `queue` | `position`、`status`（`waiting` / `generating`） | 待ち順。自分の番になると `position: 1, status: "generating"` |
| `sources` | `sources` | 回答に使った検索結果 |
| `chunk` | `text` | 生成中の回答の断片 |
| `done` | `answer` | 後処理を済ませた最終回答 |
| `error` | `answer`、`sources`、`error` | エラー |

画面は `chunk` を順に表示し、`done` の `answer` で置き換えます。

### POST /tutor/hint

リクエスト：

```json
{ "category": "Easy1", "questionId": "beginner1" }
```

レスポンスは `/tutor/ask` と同じ形です。`category` か `questionId` がなければ 400 を返します。

### GET /tutor/status

レスポンス：

```json
{
  "llmReady": true,
  "embeddingReady": true,
  "knowledgeBaseInitialized": true,
  "knowledgeBaseCount": 120,
  "ready": true,
  "ollamaBaseUrl": "http://localhost:11434",
  "ollamaModel": "elyza-jp:8b"
}
```

`ready` は `llmReady`・`embeddingReady`・`knowledgeBaseInitialized` がすべて true のときに true です。最初の呼び出しで知識ベースの構築が始まります。

## カスタマイズ

| 変えたいもの | 場所 |
|--------------|------|
| 回答の口調や方針（システムプロンプト） | `src/services/tutorService.js` の `_buildMessagesAndDocs` 内の `systemPrompt` |
| 生成設定（temperature など） | `src/services/tutorService.js` の `initialize` |
| チャットモデル・埋め込みモデル | 環境変数 `OLLAMA_MODEL`・`OLLAMA_EMBEDDING_MODEL` |
| 検索件数（既定 5 件） | `src/services/tutorService.js` の `vectorStore.search(searchQuery, 5)` |
| 分割サイズ（400 文字、重なり 40 文字） | `src/services/vectorStore.js` の `loadKnowledgeBase` |
| 回答の後処理 | `src/services/tutorService.js` の `finalizeAnswer` |

分割の方法や埋め込みモデルを変えたら、`/tutor/rebuild` で知識ベースを作り直してください。

## 注意

- `/tutor/rebuild` は管理者に限定されておらず、ログインしていれば誰でも実行できる
- 会話履歴はメモリにしか保存されないため、サーバーの再起動で消える
- Q&A ログには学習者の質問がそのまま残る。`docs/` に書き出したファイルの扱いに注意する

## トラブルシューティング

[AIチューター完全ローカルセットアップガイド](./AIチューター完全ローカルセットアップガイド.md) のトラブルシューティングを参照してください。
