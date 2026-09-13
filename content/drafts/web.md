# WEB 問題別ヒント集

AI先生が WEB カテゴリの各問題に答えるときに参照するための補助資料です。  
直接の答え（フラグそのもの）は示さず、着眼点と段階ヒントをまとめます。  
攻撃は本問題の学習環境（`http://localhost:3333/...`）内に限定し、実在サービスへの試行は勧めないこと。

---

## web4（★SQLインジェクション）
- カテゴリー: web
- 対象: `http://localhost:3333/html/sql_index.html`
- 着眼点:
  - ログインフォームの入力がSQL文に直接連結されている可能性
  - 認証回避（常に真になる条件）を狙う典型問題
- 段階ヒント:
  - 入力値に `'` を入れてSQLエラーが出るか観察する
  - `OR '1'='1` のように条件を常に真にできないか考える
  - 通ったら、なぜ通ったか（文字列連結の問題）と対策（プレースホルダ）も理解する

---

## web5（★邪魔な広告）
- カテゴリー: web
- 対象: `http://localhost:3333/html/advertisement.html`
- 着眼点:
  - 広告は見た目上の障害物。DOM・CSS・ソースを見ればフラグに到達できる
  - 「隠しページが15種類」あり、解法は一つではない
- 段階ヒント:
  - F12（DevTools）のElementsで広告要素を消す/非表示にする
  - ページソース（Ctrl+U）やJavaScript内のリンク・パスを確認する
  - Networkタブで読み込まれている隠しページを探す

---

## web6（★HTTPレスポンスヘッダー）
- カテゴリー: web
- 対象: `http://localhost:3333/web/header-flag`
- 着眼点:
  - フラグは画面ではなくレスポンスヘッダーにある
  - カスタムヘッダー（`X-...` など）に注目
- 段階ヒント:
  - F12 → Networkタブでリクエストを選ぶ
  - Response Headers を確認する
  - 見慣れない独自ヘッダーの値を読む（`curl -i` でも可）

```sh
curl -i http://localhost:3333/web/header-flag
```

---

## web7（★リクエストヘッダーを変更）
- カテゴリー: web
- 対象: `http://localhost:3333/web/request-header-flag`
- 着眼点:
  - サーバーが特定のリクエストヘッダー値を要求している
  - 送る側のヘッダーを書き換える必要がある
- 段階ヒント:
  - DevToolsやプロキシでリクエストヘッダーを編集する
  - `User-Agent` や独自ヘッダー（`X-Secret-Header` 等）の値を要求どおりに変える
  - `curl -H` で任意ヘッダーを付けて送る

```sh
curl -H "X-Secret-Header: ..." http://localhost:3333/web/request-header-flag
```

---

## web8（★HTMLコメント）
- カテゴリー: web
- 対象: `http://localhost:3333/web/comment-flag`
- 着眼点:
  - フラグはHTMLソースのコメント `<!-- -->` に隠れている
- 段階ヒント:
  - ページのソースを表示（Ctrl+U）する
  - DevToolsのElementsでコメントノードを探す
  - `<!-- ... -->` の中の文字列を読む

---

## web9（★ETagヘッダー）
- カテゴリー: web
- 対象: `http://localhost:3333/web/etag-flag`
- 着眼点:
  - フラグは標準ヘッダーの一つ `ETag` に入っている
- 段階ヒント:
  - NetworkタブでResponse Headersを開く
  - `ETag` の値を確認する（キャッシュ制御用ヘッダー）
  - `curl -i` でヘッダーを直接見る

```sh
curl -i http://localhost:3333/web/etag-flag
```

---

## web10（★XSS）
- カテゴリー: web
- 対象: `http://localhost:3333/html/xss_index.html`
- 着眼点:
  - フォーラム投稿内容がエスケープされずに表示される保存/反射型XSS
  - 目標は攻撃成功ページ `/xss/attack-success` へ遷移させること
- 段階ヒント:
  - 投稿欄に `<script>` などが実行されるか確認する
  - 実行できたら、成功ページへ遷移させるスクリプトを組み立てる
  - なぜ実行されるか（出力エスケープ不足）と対策（textContent, CSP）も学ぶ

---

## web11（脆弱性のあるショッピングサーバー）
- カテゴリー: web
- 対象: `http://localhost:3333/shop`
- 着眼点:
  - 自由にXSSを試せる学習用の脆弱なショップ
  - 入力が反映される箇所（商品名・コメント・検索など）を探す
- 段階ヒント:
  - 反射・保存される入力欄を見つける
  - スクリプトが実行される箇所を特定する
  - 学習環境限定で挙動を確認し、対策も併せて理解する

---

## web12（★パストラバーサル攻撃）
- カテゴリー: web
- 対象: `http://localhost:3333/html/path-traversal_index.html`
- 着眼点:
  - ファイル取得系のパラメータに `../` を混ぜて想定外のファイルを読む
- 段階ヒント:
  - `file=` などのパラメータがファイルパスに使われていないか確認する
  - `../` を重ねて上位ディレクトリのファイルへ到達できるか試す
  - 到達できたら、原因（パス検証不足）と対策（許可リスト・正規化）を理解する

---

## 問題メタ情報（補足）

### web4
- タイトル: ★SQLインジェクション / カテゴリー: web / URL: /html/sql_index.html
- 説明文: ログインページで実際にSQLインジェクションを試す。

### web5
- タイトル: ★邪魔な広告 / カテゴリー: web / URL: /html/advertisement.html
- 説明文: 広告をよけてフラグ入手。DevTools・ソース確認。隠しページ15種、解法は複数。

### web6
- タイトル: ★HTTPレスポンスヘッダー / カテゴリー: web / URL: /web/header-flag
- 説明文: レスポンスヘッダー（カスタムヘッダー）にフラグ。

### web7
- タイトル: ★リクエストヘッダーを変更 / カテゴリー: web / URL: /web/request-header-flag
- 説明文: 特定のリクエストヘッダーを要求。User-Agentや独自ヘッダーを変更。

### web8
- タイトル: ★HTMLコメント / カテゴリー: web / URL: /web/comment-flag
- 説明文: HTMLコメントにフラグ。ソース表示・Elementsで確認。

### web9
- タイトル: ★ETagヘッダー / カテゴリー: web / URL: /web/etag-flag
- 説明文: ETagヘッダーにフラグ。

### web10
- タイトル: ★XSS / カテゴリー: web / URL: /html/xss_index.html
- 説明文: フォーラムでXSS。`/xss/attack-success` へ遷移で成功。学習目的の脆弱実装。

### web11
- タイトル: 脆弱性のあるショッピングサーバー / カテゴリー: web / URL: /shop
- 説明文: 脆弱なショップでXSS。自由に試せる学習環境。

### web12
- タイトル: ★パストラバーサル攻撃 / カテゴリー: web / URL: /html/path-traversal_index.html
- 説明文: パストラバーサル攻撃を実際に試す。
