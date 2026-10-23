# Web ナレッジ

## 目的
Web問題で共通する調査手順、脆弱性の考え方、代表的な確認項目をまとめる。

---

## CTF Webカテゴリとは
CTFのWebカテゴリでは、Webアプリケーションの仕組みや脆弱性を理解し、与えられた環境の中からフラグを見つける能力が問われる。

よく出るテーマ:

- HTML、JavaScript、CSS、コメントの確認
- HTTPリクエスト・レスポンスの理解
- Cookie、Session、JWT
- IDOR
- SQL Injection
- XSS
- CSRF
- SSRF
- ディレクトリトラバーサル
- robots.txt
- ステータスコード
- Burp Suiteや開発者ツールの使い方

---

## 最初に確認する優先順位

Web問題で最初に試すべき確認項目は、負荷が低く安全で、情報量が多いものから行う。

### 1. 画面とソースを見る
まず通常のブラウザ操作でページを確認し、HTMLソース、コメント、hiddenフィールド、JavaScriptファイル、リンクを確認する。

確認するもの:

- HTMLコメント
- hidden input
- JavaScript内のAPI URL
- 管理画面らしきパス
- フラグらしき文字列
- 不自然なパラメータ

### 2. 開発者ツールを確認する
F12で開発者ツールを開き、Elements、Console、Network、Applicationを確認する。

見る場所:

- Elements: HTML構造
- Console: エラー、ヒント
- Network: API通信、レスポンス
- Application: Cookie、LocalStorage、SessionStorage

### 3. URLとパラメータを確認する
URLに `id=1` や `page=home` のようなパラメータがある場合、動作を確認する。

例:

- `?id=1`
- `?id=2`
- `?file=about.txt`
- `?page=home`
- `?redirect=/home`

### 4. 既知ファイルを確認する
公開されがちなファイルやディレクトリを確認する。

例:

- `/robots.txt`
- `/sitemap.xml`
- `/admin`
- `/login`
- `/api`
- `/static`
- `/backup.zip`
- `/.git/`

### 5. 入力欄と認証を確認する
ログインフォーム、検索欄、問い合わせ欄、アップロード機能などを調べる。

観点:

- 入力値が画面に反映されるか
- SQLエラーが出るか
- 権限が正しく確認されているか
- CSRF対策があるか
- CookieやJWTが改ざんできないか

---

## HTMLソースとコメント

HTMLコメントは、ブラウザの「ページのソースを表示」や開発者ツールで見られる。

例:

```html
<!-- TODO: remove debug page /debug -->
<!-- admin password is not here -->
<input type="hidden" name="role" value="user">
```

CTFでは、コメントにヒント、隠しパス、古い機能名が残っていることがある。

---

## F12・開発者ツール

F12でできる主なこと:

- HTML構造を見る
- CSSやJavaScriptを確認する
- Consoleログを見る
- 通信内容を確認する
- CookieやLocalStorageを見る
- フォーム送信内容を確認する
- レスポンスヘッダーを見る

CTFではNetworkタブが特に重要で、画面には表示されないAPIレスポンスにフラグやヒントがある場合がある。

---

## HTTPの基本

HTTPでは、ブラウザがリクエストを送り、サーバーがレスポンスを返す。

代表的なメソッド:

- GET: 情報取得
- POST: データ送信
- PUT/PATCH: 更新
- DELETE: 削除
- OPTIONS: 利用可能メソッドの確認

代表的なステータスコード:

- 200: 成功
- 301/302: リダイレクト
- 400: リクエスト不正
- 401: 認証が必要
- 403: 権限がない
- 404: 見つからない
- 500: サーバー内部エラー

403は「存在するがアクセス不可」、404は「見つからない」という意味で使われることが多い。ただし、セキュリティ目的で存在するページを404に見せる場合もある。

---

## CookieとSession

Cookieはブラウザ側に保存される小さなデータで、Sessionはサーバー側で状態を管理する仕組みである。

Cookieの例:

```http
Set-Cookie: sessionid=abc123; HttpOnly; Secure
```

Sessionでは、Cookieに保存されたセッションIDを使って、サーバー側のログイン状態を参照する。

確認ポイント:

- Cookieにroleやuser_idが直接入っていないか
- HttpOnlyがあるか
- Secureがあるか
- SameSiteがあるか
- セッションIDが推測可能でないか

---

## JWT

JWTは、JSON形式の情報を署名付きで表現するトークンである。

構造:

```text
header.payload.signature
```

確認ポイント:

- `alg` が `none` にならないか
- 署名検証が正しく行われているか
- 秘密鍵が弱くないか
- payloadに機密情報が入っていないか
- roleやadminの値を改ざんしても通らないか

JWTのpayloadはBase64URLでエンコードされているだけで、暗号化ではない。見えて困る情報を入れてはいけない。

---

## robots.txt

robots.txtは、検索エンジンのクローラーに対してクロールしてほしくない場所を示すためのファイルである。

例:

```txt
User-agent: *
Disallow: /admin/
Disallow: /backup/
Allow: /public/
```

重要な点:

- アクセス制御ではない
- 書かれているURLは誰でも見られる
- CTFでは隠しディレクトリのヒントになることがある
- 本当に隠したい情報をrobots.txtに書いてはいけない

---

## IDOR

IDORは、IDを変えるだけで他人の情報にアクセスできる脆弱性である。  
Insecure Direct Object Reference の略。

例:

```text
/profile?id=1
/profile?id=2
```

本来はユーザー1しか見られない情報が、`id=2` に変えるだけで見えてしまう場合、IDORの可能性がある。

対策:

- サーバー側で認可チェックを行う
- IDを推測しにくくするだけでなく、権限確認を必ず行う
- ログインユーザーが対象リソースにアクセス可能か確認する

---

## SQL Injection

SQL Injectionは、入力値がSQL文に安全に組み込まれず、SQL文の構造を変えられてしまう脆弱性である。

危険な例:

```sql
SELECT * FROM users WHERE name = '$name' AND password = '$pass';
```

入力値によって条件式が変わると、ログイン回避やデータ取得が可能になる場合がある。

安全な対策:

- プリペアドステートメントを使う
- パラメータ化クエリを使う
- 入力値をSQL文字列に直接連結しない
- エラーメッセージを詳細に出しすぎない
- 最小権限のDBユーザーを使う

CTFでは、SQLエラー、ログインフォーム、検索欄、数値IDなどが確認対象になる。

---

## XSS

XSSは、Webページに不正なスクリプトが埋め込まれ、他の利用者のブラウザ上で実行される脆弱性である。

種類:

- 反射型XSS: 入力が即座にレスポンスに反映される
- 保存型XSS: 投稿などに保存され、他ユーザーにも表示される
- DOM型XSS: JavaScriptがDOM操作で危険な出力をする

対策:

- 出力時エスケープ
- 入力値の検証
- CSP
- CookieにHttpOnlyを付ける
- 危険なDOM APIを避ける

代表的に危険な処理:

```javascript
element.innerHTML = userInput;
```

安全寄りの処理:

```javascript
element.textContent = userInput;
```

---

## CSRF

CSRFは、ログイン済みユーザーのブラウザに意図しないリクエストを送らせる攻撃である。

成立しやすい条件:

- Cookieによるログイン状態がある
- 重要操作がCSRF対策なしで実行できる
- CSRFトークンがない
- SameSite Cookieが適切でない
- GETで状態変更できる

対策:

- CSRFトークン
- SameSite Cookie
- 重要操作はPOSTにする
- 再認証
- Origin / Refererチェック

---

## SSRF

SSRFは、サーバーに任意のURLへアクセスさせる脆弱性である。  
Server-Side Request Forgery の略。

発生しやすい機能:

- URLプレビュー
- 画像取得
- Webhook
- PDF生成
- 外部API連携

危険な理由:

- 内部ネットワークへアクセスされる
- localhost上の管理画面へアクセスされる
- クラウドメタデータにアクセスされる
- 外部から見えない情報が漏れる

対策:

- アクセス先の許可リスト化
- localhostやプライベートIPを拒否
- リダイレクト先も検証
- タイムアウトやサイズ制限
- メタデータIPへのアクセス禁止

---

## ディレクトリトラバーサル

ディレクトリトラバーサルは、`../` を使って意図しないファイルにアクセスする脆弱性である。

発生例:

```text
/download?file=report.txt
/download?file=../../../../etc/passwd
```

原因:

- ユーザー入力をファイルパスに直接使う
- パス正規化や許可リストがない
- ディレクトリ制限が不十分

対策:

- ファイル名を許可リストで管理する
- ユーザー入力から直接パスを作らない
- パスを正規化して許可ディレクトリ内か確認する
- OSの権限を最小化する

---

## Burp Suite

Burp Suiteは、ブラウザとWebサーバーの間の通信を確認・変更するプロキシツールである。

主な用途:

- リクエストの確認
- パラメータ変更
- Cookieやヘッダーの確認
- Repeaterで再送
- Intruderでパターン検証
- レスポンス差分の確認

CTFでは、ブラウザだけでは見えにくい通信内容を理解するために使われる。

---

## ログインフォーム調査の観点

ログインフォームを調査するときは、次を確認する。

- 通信先URL
- GETかPOSTか
- 入力パラメータ名
- エラーメッセージの違い
- SQL Injectionの兆候
- レート制限
- CookieやSessionの発行
- JWTの内容
- hiddenパラメータ
- リダイレクト先
- 管理者権限の判定方法

ただし、実在サービスに対する無断試行は避け、CTFや許可された環境内で行う。

---

## 補足知識

## パラメータ改ざん
### 手順
1. URLパラメータ変更 
2. POSTデータ変更
3. hiddenフィールド確認

### 例
```html
<input type="hidden" name="role" value="user">
```
- adminに変更

## 典型的な攻撃フロー
1. ソース確認
2. 入力欄を探す
3. パラメータ改ざん
4. XSS / SQLi試す
5. API解析
6. SSRFや内部アクセス確認

## よくあるミス・落とし穴
1. ソースを見ない
   - 情報見逃し
2. 1箇所しか試さない
   - 他に脆弱点あり
3. 手動だけでやる
   - ツール併用が重要

---

---

## Web チューター補足

## 目的
SQLインジェクション、XSS、IDOR、SSRF、Cookie、robots.txtで、最初に確認することをまとめる。

## 確認するポイント

### 1. SQLインジェクションの列数
エラー例：
```txt
SELECTs to the left and right of UNION do not have the same number of result columns
```

意味：
- `UNION SELECT` の左右で列数が一致していない。
- 元の `SELECT` の列数に合わせる必要がある。

列数確認例：
```sql
' ORDER BY 1--
' ORDER BY 2--
' ORDER BY 3--
' ORDER BY 4--
```

または：
```sql
' UNION SELECT NULL--
' UNION SELECT NULL,NULL--
' UNION SELECT NULL,NULL,NULL--
' UNION SELECT NULL,NULL,NULL,NULL--
```

SQLiteで確認する代表例：
```sql
' UNION SELECT sqlite_version(),NULL,NULL--
```

注意：
- 元クエリが4列なら `UNION SELECT` 側も4列必要。
- 表示される列に文字列を入れる。

### 2. データベース名取得の誤り
SQLiteにはMySQLの `database()` のようなDB名関数はない。

SQLiteでよく見るもの：
```sql
SELECT sqlite_version();
SELECT name FROM sqlite_master WHERE type='table';
SELECT sql FROM sqlite_master WHERE type='table';
```

説明：
> SQLiteでは「DB名」より、`sqlite_master` からテーブル名やCREATE文を確認するのが基本です。

### 3. IDOR
IDORは、認可チェック不足により他人のデータへアクセスできる問題。

確認例：
```txt
/profile?id=1
/profile?id=2
/download?file=1
/api/user/1
/api/user/2
```

見るポイント：
- ログインユーザー以外の情報が見えるか
- `id`, `user_id`, `file_id`, `order_id` を変更できるか
- 403ではなく200で返るか

ヒント例：
> `id` 系パラメータは値を変えて、別ユーザーや別データに到達できないか確認します。ただし許可されたCTF環境内だけで試してください。

### 4. robots.txt とソースの確認
```txt
/robots.txt
/sitemap.xml
/.git/
/admin
/backup
```

ブラウザで見る場所：
- ページソース
- DevToolsのNetwork
- ApplicationタブのCookie/LocalStorage
- JavaScriptファイル

### 5. Cookie とセッション
確認ポイント：
- CookieにBase64らしい値がないか
- `role=user` を `role=admin` に変えるだけで通る設計ではないか
- 署名付きCookieか
- JWTならヘッダ・ペイロードを読む

JWT確認：
```txt
xxxxx.yyyyy.zzzzz
```
- 3つの`.`区切りならJWTの可能性。
- payloadはBase64URLで読めるが、署名を改ざんしてよいとは限らない。

### 6. XSSの確認例
学習用の基本確認：
```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
```

安全上の注意：
- 許可されたCTF環境だけで試す。
- 実サイトに入力しない。
- Cookie窃取や外部送信のコードは出さない。

## 防御の観点
- 試すのは配布されたCTF環境だけにする。
- SQLiの対策は、プレースホルダ、入力検証、最小権限、エラーを画面に出さないこと。
