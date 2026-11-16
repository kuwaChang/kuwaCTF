# CTFツール・コマンド

コマンドを出すときは、対応OSを「Windows」または「(LinuxまたはWSL)」と書き、各オプションの意味もセットで書く。両方で使えるときは両方書く。

## Forensics / Steganography

| ツール | 対応OS | 用途 | 例とオプション |
|---|---|---|---|
| file | (LinuxまたはWSL) | 形式判定 | `file target`。中身から種別を推定する。Windowsのコマンドプロンプトには無い |
| xxd | (LinuxまたはWSL) | 16進表示 | `xxd -l 32 target`。`-l 32` は先頭32バイトだけ。Windows では PowerShell の `Format-Hex -Path target -Count 32` |
| strings | (LinuxまたはWSL) | 可読文字列抽出 | `strings -a target`。`-a` は実行可能領域以外の文字列も出す。Windowsのコマンドプロンプトには無い |
| grep | (LinuxまたはWSL) | 文字列の絞り込み | `grep -i flag`。`-i` は大文字小文字を無視する。Windows では `findstr /I` |
| binwalk | (LinuxまたはWSL) | 埋め込みファイル検出 | `binwalk target` は中の別ファイルを探す。`-e` は見つかったものを抽出する |
| exiftool | Windows と (LinuxまたはWSL) | メタデータ確認 | `exiftool image.jpg` は主要な項目。`-a` は重複項目も出す。`-u` は未知タグも出す。`-g1` はグループごとに分ける |
| zsteg | (LinuxまたはWSL) | PNG/BMPのLSB解析 | `zsteg image.png`。`-a` はビットの組み合わせを広く試す |
| steghide | (LinuxまたはWSL) | JPEG/WAV等の隠しデータ | `steghide info image.jpg` は埋め込みの有無を見る。`extract -sf ファイル` は取り出す |
| foremost | (LinuxまたはWSL) | ファイルカービング | `foremost target`。シグネチャからファイルを切り出す |

## Web

| ツール | 対応OS | 用途 | 例とオプション |
|---|---|---|---|
| curl | Windows と (LinuxまたはWSL) | HTTP確認 | `curl -i http://localhost:3333/`。`-i` はレスポンスヘッダーも表示する |
| Burp Suite | Windows と (LinuxまたはWSL) | リクエスト改変 | Proxyでパラメータを変更する |
| OWASP ZAP | Windows と (LinuxまたはWSL) | 脆弱性診断学習 | Passive Scanで通信を確認する |
| sqlite3 | Windows と (LinuxまたはWSL) | SQLite調査 | `.tables` はテーブル一覧。`.schema` はCREATE文 |
| browser DevTools | Windows と (LinuxまたはWSL) | Cookie/Network確認 | Application と Network |

## Crypto

| ツール | 対応OS | 用途 | 例とオプション |
|---|---|---|---|
| CyberChef | ブラウザ | 変換・復号 | Base64、XOR、ROT。URLは資料にあるもの以外を作らない |
| python | Windows と (LinuxまたはWSL) | 総当たり・復号 | `python` または `python3`。入っている方を使う |
| base64 | (LinuxまたはWSL) | Base64のデコード | `base64 -d`。`-d` はデコード。Windows では `certutil -decode 入力 出力` |
| hashcat | (LinuxまたはWSL) | GPU向けハッシュ解析 | ハッシュ形式を先に確認する |
| John the Ripper | (LinuxまたはWSL) | パスワード解析 | `john hash.txt --wordlist=辞書`。`--wordlist` は試す単語リスト |

## Reversing / Pwn

| ツール | 対応OS | 用途 | 例とオプション |
|---|---|---|---|
| Ghidra | Windows と (LinuxまたはWSL) | 静的解析 | main関数と比較処理を見る |
| gdb | (LinuxまたはWSL) | 動的解析 | `gdb ./chall`。`run` は実行。`info registers` はレジスタ表示 |
| checksec | (LinuxまたはWSL) | 防御機構確認 | `checksec --file=chall`。`--file` は対象ファイル |
| ltrace | (LinuxまたはWSL) | ライブラリ関数呼び出し | `ltrace ./chall` |
| strace | (LinuxまたはWSL) | システムコール確認 | `strace ./chall` |
| objdump | (LinuxまたはWSL) | 逆アセンブル | `objdump -d chall`。`-d` は実行部分を逆アセンブルする |

## よく聞かれる使い方の補足

### grep で複数のキーワードを探す
- `grep -e flag -e key file.txt`（(LinuxまたはWSL)。`-e` は検索語を1つずつ指定し、どれかを含む行を出す）
- `grep -E "flag|key" file.txt`（`-E` は拡張正規表現。`|` で「または」を表す）
- Windows では `findstr "flag key" file.txt`（スペース区切りの語のどれかを含む行を出す）

### フォルダの中を再帰的に文字列検索する
- `grep -rn "flag" .`（(LinuxまたはWSL)。`-r` はサブフォルダも検索、`-n` は行番号を表示）
- `find` はファイル名や種類で探すコマンドで、ファイルの中身は検索しない
- Windows では `findstr /S /N "flag" *`（`/S` はサブフォルダも検索、`/N` は行番号）

### strings と xxd の違い
- `strings` は、ファイルの中から人が読める文字列だけを抜き出す
- `xxd` は、ファイルの中身をすべて16進数で表示する（文字列の抽出はしない）。マジックナンバーの確認や書き換え位置の確認に使う

### Windows で strings を使う
- Microsoft の Sysinternals に `strings.exe` がある。例: `strings.exe -n 6 target`（`-n 6` は6文字以上の文字列だけ出す）
- WSL を入れれば Linux の `strings` もそのまま使える
- PowerShell の `Format-Hex` は16進表示で、文字列抽出ではない

### exiftool で特定のタグだけ出す
- `exiftool -GPSLatitude -GPSLongitude image.jpg`（`-タグ名` で指定したタグだけ出す）
- `exiftool -s image.jpg`（`-s` は説明文ではなくタグ名で表示する。指定したいタグ名を調べるときに使う）

### Windows で隠しファイルを表示する
- Windows 11: エクスプローラーの「表示」→「表示」→「隠しファイル」にチェック
- Windows 10: エクスプローラーの「表示」タブ →「隠しファイル」にチェック
- コマンドプロンプトでは `dir /a`（`/a` は隠しファイルも含めて表示）

### Windows でファイルのプロパティ（メタ情報）を見る
- ファイルを右クリック →「プロパティ」→「詳細」タブ。作成者、撮影日時、カメラ機種などが見える

### curl と wget の違い
- `wget` はファイルのダウンロード向け。`wget -r` でリンクをたどってまとめて取得できる
- `curl` はリクエストを細かく指定するのに向く。`-X` でメソッド、`-H` でヘッダー、`-d` で送信データを指定し、結果は画面に出る

### hashcat と John the Ripper の違い
- どちらも、許可されたハッシュ（CTFの配布物など）の元のパスワードを探すツール
- hashcat は GPU を使って高速に試すのが得意。ハッシュの種類を `-m` で番号指定する
- John the Ripper は CPU 中心で、ハッシュの種類を自動判別しやすい。`pdf2john` や `zip2john` など、ファイルから解析用ハッシュを取り出す補助スクリプトが付属する
- `pdf2john` は John the Ripper（jumbo版）の `run` フォルダに入っている。pip でインストールするものではない

### バイナリエディタ（16進エディタ）はどんな時に使う？
- ファイルの中身を1バイトずつ16進数で見て、書き換えるときに使う
- CTFでの主な使い道: 壊されたファイルシグネチャ（マジックナンバー）を直す、ファイル末尾に付け足されたデータを見つける、PNGの幅・高さなどの値を書き換える
- Windows: HxD（無料のバイナリエディタ）
- (LinuxまたはWSL): `hexedit file`（その場で書き換え。Ctrl+X で保存して終了）
- `xxd` で編集する方法: `xxd file > dump.txt` で16進テキストにし、テキストを直してから `xxd -r dump.txt > fixed`（`-r` は16進テキストをバイナリに戻す）
- 書き換える前に、必ず元のファイルのコピーを取っておく

### tcpdump はどんな時に使う？
- コマンドラインで通信（パケット）をキャプチャ・表示するツール。画面の無いサーバーで通信を記録するときに使う。(LinuxまたはWSL)
- `sudo tcpdump -i eth0 -w out.pcap`（`-i` は監視するネットワークインターフェース、`-w` はファイルに保存。保存した pcap は Wireshark で開ける）
- `tcpdump -r capture.pcap -n`（`-r` は保存済みファイルを読む、`-n` はIPアドレスやポートを名前に変換しない）
- `tcpdump -r capture.pcap -A port 80`（`-A` は中身をASCIIで表示、`port 80` はポート80の通信だけに絞る）
- Windows では Wireshark を使うのが一般的
- 自分の環境やCTFの配布ファイル以外の通信を、許可なくキャプチャしてはいけない

### bash のパイプ `|` の役割
- 左のコマンドの出力（標準出力）を、右のコマンドの入力（標準入力）として渡す。小さいコマンドをつないで処理できる。(LinuxまたはWSL)
- `strings target | grep -i flag`（文字列を抜き出し、その中から flag を含む行だけ出す）
- `cat access.log | sort | uniq -c | sort -nr`（同じ行を数え、多い順に並べる。`uniq -c` は連続した同じ行を数える、`sort -nr` は数値の大きい順）
- `ls | wc -l`（ファイルの数を数える。`wc -l` は行数を数える）
- エラー出力（標準エラー出力）はそのままでは渡らない。一緒に渡すには `command 2>&1 | grep error`
- Windows の PowerShell にも `|` があるが、文字列ではなくオブジェクトを渡す点が違う

### Docker の基本概念
- アプリと、それが動くのに必要な環境（ライブラリや設定）をまとめて、どのPCでも同じように動かす仕組み
- イメージ: 環境のひな形（読み取り専用）。コンテナ: イメージから起動した実行中の環境。Dockerfile: イメージの作り方を書いた設定ファイル
- 仮想マシンと違い、ホストのOSカーネルを共有するので軽くて起動が速い
- `docker run -it ubuntu bash`（`-it` は対話的に操作する。ubuntu イメージからコンテナを起動してシェルに入る）
- `docker ps`（動いているコンテナの一覧。`-a` で停止中も表示）、`docker exec -it コンテナ名 sh`（動いているコンテナの中でシェルを開く）
- CTFでは、問題環境が Dockerfile や `docker-compose.yml` で配られ、`docker compose up` で手元に立ち上げて試すことがある
- Windows では Docker Desktop（WSL2 を使う）、Linux では Docker Engine を入れる

### Git の commit 履歴を調べるときのポイント
- `git log --oneline`（コミット一覧を1行ずつ表示）、`git log -p`（各コミットの変更内容も表示）
- `git show コミットID`（そのコミットの変更内容を表示）
- `git log --all`（他のブランチのコミットも含める）、`git branch -a`（ブランチ一覧）
- `git reflog`（取り消したコミットや消したブランチの履歴も残っていることがある）
- 見るポイント: 削除されたファイルや行（一度コミットされたパスワードや鍵は、消しても履歴に残る）、コミットメッセージ、作者名とメールアドレス（`git log --format="%an <%ae>"`）
- Web問題で `/.git/` が公開されていたら、リポジトリを復元して履歴を調べられることがある
- Windows と (LinuxまたはWSL) のどちらでも Git をインストールすれば同じコマンドが使える
