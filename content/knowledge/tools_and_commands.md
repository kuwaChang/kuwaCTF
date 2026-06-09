# CTFツール・コマンド不足知識まとめ

## 目的
AI先生が「ツール名だけ」ではなく、目的・コマンド・出力の見方まで説明できるようにする。

## Forensics / Stego

| ツール | 用途 | 例 |
|---|---|---|
| file | 形式判定 | `file target` |
| xxd | 16進表示 | `xxd -l 32 target` |
| strings | 可読文字列抽出 | `strings -a target` |
| binwalk | 埋め込みファイル検出 | `binwalk target` |
| exiftool | メタデータ確認 | `exiftool image.jpg` |
| zsteg | PNG/BMPのLSB解析 | `zsteg image.png` |
| steghide | JPEG/WAV等の隠しデータ | `steghide info image.jpg` |
| foremost | ファイルカービング | `foremost target` |

## Web

| ツール | 用途 | 例 |
|---|---|---|
| curl | HTTP確認 | `curl -i http://localhost:3333/` |
| Burp Suite | リクエスト改変 | Proxyでパラメータ変更 |
| OWASP ZAP | 脆弱性診断学習 | Passive Scan確認 |
| sqlite3 | SQLite調査 | `.tables`, `.schema` |
| browser DevTools | Cookie/Network確認 | Application, Network |

## Crypto

| ツール | 用途 | 例 |
|---|---|---|
| CyberChef | 変換・復号 | Base64, XOR, ROT |
| python | 総当たり・復号 | 短いスクリプトを書く |
| hashcat | GPU向けハッシュ解析 | ハッシュ形式に注意 |
| John the Ripper | パスワード解析 | `john hash.txt --wordlist=...` |

## Reversing / Pwn

| ツール | 用途 | 例 |
|---|---|---|
| Ghidra | 静的解析 | main関数・比較処理を見る |
| gdb | 動的解析 | ブレークポイント、レジスタ確認 |
| checksec | 防御機構確認 | `checksec --file=chall` |
| ltrace | ライブラリ関数呼び出し | `ltrace ./chall` |
| strace | システムコール確認 | `strace ./chall` |
| objdump | 逆アセンブル | `objdump -d chall` |

## 回答時のコマンド提示ルール

悪い例：
> binwalkを使いましょう。

良い例：
```sh
binwalk sample.png
binwalk -e sample.png
```

そして、以下を添える：
- 何を調べるコマンドか
- どんな出力が出たら怪しいか
- 次に何をするか

## 安全性ルール
- 実在サービスへの攻撃ではなく、CTF・自作環境・許可済み環境に限定する。
- 攻撃コードよりも検証・観察・防御策を優先する。
