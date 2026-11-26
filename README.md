# kuwaCTF

LAN 内で使う、CTF 形式のセキュリティ学習サーバーです。Node.js / Express 上で、問題演習、スコアとランキング、実績、意図的に脆弱なラボ、ローカル LLM の AI チューターを提供します。

アクセスはプライベート IP（`localhost`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）からのみ許可します。ラボには学習用の脆弱性が含まれます。公開インターネットや本番環境では使わないでください。

## できること

- ログイン・新規登録、マイページ、ユーザーアイコン
- ストーリー形式の問題（Easy / Medium / Hard）と、Web・フォレンジック・暗号・OSINT のカテゴリ問題
- スコア、ランキング、実績、デコレーション
- XSS ショップ、攻撃者ラボ、SQL インジェクション、パストラバーサルの演習
- 管理者画面
- 意見箱（改善点・不具合の送信と、管理者による対応）
- AI チューター（任意。Ollama と ChromaDB）

ブラウザで開く主な画面は次のとおりです。

| パス | 内容 |
|------|------|
| `/` | ログインと問題画面 |
| `/register` | 新規登録 |
| `/mypage` | マイページ |
| `/tutor` | AI チューター |
| `/ranking` | ランキング |
| `/game` | ゲーム |
| `/admin` | 管理者画面（`admin` ロール） |
| `/feedback` | 意見箱（改善点・不具合） |

## 必要なもの

- Node.js 20 LTS（20.12 以降。`.env` の読み込みに使う）
- npm
- Git

`bcrypt` と `sqlite3` はネイティブモジュールです。`npm install` でビルドに失敗する場合は、Build Tools for Visual Studio の「C++ によるデスクトップ開発」を入れてからやり直してください。

## 起動

プロジェクトルートで依存関係を入れます。ラボは独自の `package.json` を持つので、それぞれインストールします。

```powershell
npm install
cd labs\attack-server
npm install
cd ..\xss
npm install
cd ..\..
```

サーバーを起動します。

```powershell
npm start
```

`node src/server.js` と `node server.js` でも同じプロセスが起動します。ブラウザで `http://localhost:3333` を開きます。同じ LAN の別端末からは、起動ログに出る `http://192.168.x.x:3333` を開きます。停止は Ctrl+C です。

| 役割 | 起動 | ポート |
|------|------|--------|
| メインサーバー（ログイン、問題、ランキング） | `npm start` | 3333 |
| 攻撃者ラボ（Cookie 受け取り） | メイン起動時に自動起動 | 3001 |
| XSS ショップ | 問題利用時にセッションごとに起動 | 3000 から空きポート |

初回起動時に `storage/users.db`、`storage/sessions.sqlite`、`public/icons/`、`public/uploads/user_database.db` が作られます。手で作る必要はありません。

## 最初のユーザー

画面の新規登録（`/register`）から作ります。

- ユーザー ID: 英数字とアンダースコア、3〜20 文字
- ユーザー名: 3〜50 文字
- パスワード: 8 文字以上

新規登録のロールは `user` です。ユーザー ID が `admin` のアカウントは、サーバー起動時にロールが `admin` に更新されます。管理者画面を使う手順は次のとおりです。

1. ユーザー ID `admin` で登録する
2. サーバーを一度止めて、もう一度 `npm start` する
3. `admin` でログインし直す

## 問題

問題データは `config/quizData.json`、実績は `config/achievements.json` です。配布ファイルは `public/uploads/` にあり、URL は `/files/...` です。

| 区分 | 内容 |
|------|------|
| Easy1 / Easy2 | 入門のストーリー問題 |
| Medium1 / Medium2 | 中級のストーリー問題 |
| Hard1 / Hard2 | 上級のストーリー問題 |
| WEB | Web の脆弱性 |
| Forensics | フォレンジック |
| Crypto | 暗号 |
| OSINT | 公開情報の調査 |

## AI チューター（任意）

チューターは Ollama のローカルモデルを使います。ChromaDB があると、`content/knowledge/` の Markdown を検索して回答に使います。Chroma が止まっていても、サーバー本体と、検索なしのチューターは動きます。

```powershell
ollama pull hf.co/elyza/Llama-3-ELYZA-JP-8B-GGUF:latest
ollama create elyza-jp:8b -f config/ollama/Modelfile.elyza
ollama pull bge-m3
```

知識ベース検索を使う場合は、別ターミナルで Chroma を先に起動します。

```powershell
pip install chromadb
chroma run --path ./storage/chroma
```

既定のチャットモデルは `elyza-jp:8b`、埋め込みモデルは `bge-m3`、Chroma の待ち受けは `http://localhost:8000` です。画面は `http://localhost:3333/tutor` です。

## 環境変数（任意）

未設定でも起動します。`SESSION_SECRET` を固定しない場合、再起動のたびにログインが切れます。

設定は、プロジェクト直下の `.env` ファイルに書くのが簡単です。見本の `.env.example` をコピーし、使う行の先頭の `#` を外して値を書きます。`.env` は Git に含めないので、PC ごとに作ります。

```powershell
Copy-Item .env.example .env
notepad .env
```

PowerShell の `$env:` や `setx` で設定した値があれば、`.env` よりそちらが優先されます。値を変えたら、サーバーを起動し直します。

| 変数 | 意味 | 未設定のとき |
|------|------|----------------|
| `SESSION_SECRET` | セッション署名 | 起動のたびにランダム生成 |
| `SERVER_HOST` | 問題文などに出すホスト名 | 自機の LAN IP |
| `ALLOWED_NETWORKS` | 追加で許可する接続元のアドレス帯（CIDR、カンマ区切り）。学内の端末にグローバルIPが割り当てられているときに使う。例: `133.10.0.0/16` | ループバックとプライベートIP（10/8、172.16/12、192.168/16）のみ |
| `OLLAMA_BASE_URL` | Ollama の URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | チューターのモデル | `elyza-jp:8b` |
| `OLLAMA_EMBEDDING_MODEL` | 埋め込みモデル | `bge-m3` |
| `OLLAMA_THINK` | 思考モード（Qwen3 など）。`1` でオン。オンだと遅くなり、ストリーミング中に考えている途中の文も画面に出るため、通常はオフのまま。思考モードの無いモデルでオンにするとエラーになる | オフ |
| `CHROMA_URL` | ChromaDB の URL | `http://localhost:8000` |

## ディレクトリ

| パス | 役割 |
|------|------|
| `src/` | サーバー、ルート、サービス |
| `config/` | 問題・実績・シナリオの JSON |
| `content/knowledge/` | AI チューター用ナレッジ |
| `storage/` | SQLite、セッション、Chroma |
| `views/pages/` | 公開 HTML（URL は `/html/...`） |
| `views/admin/` | 管理者画面 |
| `public/` | CSS、JS、画像 |
| `public/uploads/` | 配布ファイル（URL は `/files/...`） |
| `labs/attack-server/` | 攻撃演習用サブサーバー |
| `labs/xss/` | XSS 演習用サブサーバー |
| `scripts/` | 運用スクリプト |
| `docs/` | ドキュメント |

## ドキュメント

手順の詳細は次を参照してください。

- [サーバー環境構築手順](docs/サーバー環境構築手順.md)
- [プロジェクト構成](docs/PROJECT_STRUCTURE.md)
- [サーバー設定ガイド](docs/サーバー設定ガイド.md)（Nginx / Apache、ポート 80）
- [HTTPS設定ガイド](docs/HTTPS設定ガイド.md)
- [ローカルLLMセットアップガイド](docs/ローカルLLMセットアップガイド.md)
- [AIチューターセットアップガイド](docs/AIチューターセットアップガイド.md)
- [AIチューター完全ローカルセットアップガイド](docs/AIチューター完全ローカルセットアップガイド.md)
- [ユーザー管理ガイド](docs/ユーザー管理ガイド.md)

## ライセンス

[MIT License](docs/LICENSE)
