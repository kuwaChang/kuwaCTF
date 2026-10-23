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
