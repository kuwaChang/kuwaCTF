# Forensics ナレッジ

## 目的
ファイル解析、メモリ解析、ディスク解析、ログ解析、ネットワーク解析、メタデータ調査の基本手順をまとめる。

---

## Forensicsカテゴリとは
CTFのForensicsカテゴリでは、ファイル、メモリ、ディスク、ネットワーク通信、ログなどの証拠データを解析し、隠された情報やフラグを見つける能力が問われる。

よく出る対象:

- 画像ファイル
- ZIP、PDF、Officeファイル
- pcap
- メモリダンプ
- ディスクイメージ
- ログファイル
- 削除ファイル
- 実行ファイル
- メタデータ

---

## 基本的な解析方針

Forensicsでは、いきなり中身を書き換えず、まず観察とコピーを行う。

基本手順:

1. 元ファイルを保全する
2. ハッシュ値を計算する
3. ファイル形式を確認する
4. メタデータを確認する
5. 文字列を抽出する
6. バイナリ構造を確認する
7. 専用ツールで解析する
8. 結果を根拠とともに整理する

代表コマンド:

```bash
sha256sum sample.bin
file sample.bin
exiftool sample.bin
strings sample.bin
xxd sample.bin | head
binwalk sample.bin
```

---

## ファイルシグネチャ

ファイルシグネチャは、ファイル先頭付近にある形式識別用のバイト列である。  
拡張子が偽装されていても、シグネチャを見ると本当の形式を推測できる。

代表例:

- PNG: `89 50 4E 47 0D 0A 1A 0A`
- JPG: `FF D8 FF`
- PDF: `%PDF`
- ZIP: `50 4B 03 04`
- GIF: `GIF87a` または `GIF89a`

確認コマンド:

```bash
file sample
xxd sample | head
hexdump -C sample | head
```

拡張子とシグネチャが一致しない場合、偽装や破損の可能性がある。

---

## メタデータ

メタデータは、ファイル本体とは別に付与された説明情報である。

含まれる可能性がある情報:

- 作成日時
- 更新日時
- 作成者
- 使用ソフト
- カメラ機種
- GPS座標
- サムネイル
- 文書プロパティ

代表ツール:

```bash
exiftool file
```

メタデータは改ざん・削除されることがあるため、絶対的な証拠ではなく、他の情報と合わせて判断する。

---

## exiftool

exiftoolは、画像やPDF、Office文書などのメタデータを確認するツールである。

使用例:

```bash
exiftool image.jpg
exiftool document.pdf
exiftool -a -u -g1 file
```

対応OS: Windows と (LinuxまたはWSL)。
- 引数なし: 主要なメタデータを出す
- `-a`: 重複している項目も出す
- `-u`: 未知のタグも出す
- `-g1`: グループごとに分ける

よく見る項目:

- Create Date
- Modify Date
- GPS Latitude / Longitude
- Software
- Author
- Creator
- Comment
- Thumbnail

CTFでは、コメント欄、GPS情報、作成者名、編集ソフト名にヒントが隠れていることがある。

---

## strings

stringsは、バイナリファイル中の読める文字列を抽出するコマンドである。

使用例:

```bash
strings file
strings -a file
strings file | grep -i flag
```

対応OS: (LinuxまたはWSL)。Windows のコマンドプロンプトには無い。
- 引数なし: 表示できる文字列を出す
- `-a`: 実行可能領域以外の文字列も出す
- `grep -i` の対応OSは (LinuxまたはWSL)。`-i` は大文字小文字を無視する。Windows では `findstr /I`

用途:

- フラグ文字列の探索
- URLやパスの確認
- 埋め込まれたメッセージの発見
- 実行ファイル内の文字列確認

注意点:

- 文字列が出るだけで意味があるとは限らない
- 圧縮・暗号化されたデータには効きにくい
- UTF-16文字列は別のオプションやツールが必要な場合がある

---

## hexdump / xxd

hexdumpやxxdは、ファイルを16進数で確認するためのツールである。

用途:

- ファイルシグネチャ確認
- バイナリの一部書き換え
- 不自然な埋め込みデータの確認
- ファイル末尾の余分なデータ確認

例:

```bash
xxd sample | head
xxd sample | tail
hexdump -C sample | head
```

対応OS: (LinuxまたはWSL)。Windows では PowerShell の `Format-Hex -Path sample -Count 32`。
- `xxd` の `-l 32`: 先頭32バイトだけ出す
- `head`: 先頭側を見る。`tail`: 末尾側を見る
- `hexdump -C`: 16進と文字を並べて表示する

PNGに直す場合などは、先頭のシグネチャが壊れていないかを確認する。ただし、安易に元ファイルを直接編集せず、必ずコピーを使う。

---

## binwalk

binwalkは、ファイル中に埋め込まれた別ファイルや圧縮データを検出するツールである。

使用例:

```bash
binwalk sample.bin
binwalk -e sample.bin
```

対応OS: (LinuxまたはWSL)。
- 引数なし: 中に別ファイルが無いか探す
- `-e`: 見つかったものを抽出する。破損しているかの判定そのものではない

用途:

- 画像の中にZIPが埋め込まれていないか確認
- ファームウェア解析
- 複数ファイルの結合検出
- 隠しデータの抽出

---

## ZIPファイルの破損確認

ZIPが壊れているか確認する基本手順:

```bash
file archive.zip
unzip -t archive.zip
zipinfo archive.zip
7z t archive.zip
xxd archive.zip | head
xxd archive.zip | tail
```

見るべきポイント:

- ZIPシグネチャ `PK` があるか
- 中央ディレクトリが存在するか
- ファイル末尾が欠けていないか
- パスワード付きではないか
- 拡張子だけZIPになっていないか

ZIPはOfficeファイルや一部のアーカイブ形式でも使われるため、拡張子だけで判断しない。

---

## OfficeファイルとZIP

`.pptx`、`.docx`、`.xlsx` は内部的にはZIP形式である。  
拡張子を `.zip` に変える、またはunzipで展開すると内部構造を確認できる。

例:

```bash
unzip sample.pptx -d extracted
```

見る場所:

- `ppt/slides/`
- `word/document.xml`
- `xl/sharedStrings.xml`
- `docProps/`
- `media/`

CTFでは、スライド外の画像、コメント、非表示オブジェクト、XML内の文字列にフラグがある場合がある。

---

## PDF解析

PDFでは、メタデータ、埋め込みファイル、画像、テキスト、パスワード保護などを確認する。

代表ツール:

```bash
pdfinfo file.pdf
exiftool file.pdf
strings file.pdf
pdfimages -all file.pdf out
```

パスワード解析では、CTFや自分のファイルなど許可された範囲でのみ行う。  
John the Ripperの補助ツールでハッシュを抽出し、辞書攻撃する流れが使われることがある。

---

## PNG解析

PNGでは、シグネチャとチャンク構造を確認する。

PNGシグネチャ:

```text
89 50 4E 47 0D 0A 1A 0A
```

代表チャンク:

- IHDR
- IDAT
- IEND
- tEXt
- zTXt
- iTXt

確認ツール:

```bash
file image.png
exiftool image.png
pngcheck image.png
strings image.png
binwalk image.png
```

CTFでは、コメントチャンク、末尾に追加されたデータ、LSBステガノグラフィが題材になることがある。

---

## PCAP解析

pcapはネットワーク通信を記録したファイルである。

基本手順:

1. Wiresharkで開く
2. プロトコル一覧を確認する
3. HTTP、DNS、FTP、TCP Streamを見る
4. ファイル転送がないか確認する
5. 認証情報やフラグ文字列を検索する
6. 必要に応じてファイルを抽出する

Wiresharkの代表的な表示フィルタ:

```text
http
dns
tcp
udp
ip.addr == 192.168.0.1
http.request
http.response
```

HTTPだけを見たい場合は `http` を使う。

Follow TCP Streamを使うと、通信内容を会話単位で確認できる。

---

## ログフォレンジック

ログフォレンジックでは、複数のログを時系列に並べて何が起きたかを復元する。

見るポイント:

- タイムスタンプ
- IPアドレス
- ユーザー名
- イベントID
- 実行されたコマンド
- ログイン成功・失敗
- ファイル作成・削除
- 権限昇格
- 外部通信

タイムライン作成時の注意点:

- タイムゾーンを統一する
- システム時刻のずれを考慮する
- 複数ログを同じ基準で並べる
- 事実と推測を分ける
- 欠落したログがある可能性を考える

---

## Windowsイベントログ

Windowsイベントログで確認できる代表的な情報:

- ログオン・ログオフ
- ログオン失敗
- サービス起動
- プロセス作成
- アカウント変更
- 権限昇格
- RDP接続
- システムエラー

代表的なイベントID:

- 4624: ログオン成功
- 4625: ログオン失敗
- 4634: ログオフ
- 4688: プロセス作成
- 4720: ユーザー作成
- 7045: サービス作成

---

## メモリダンプ解析

メモリダンプ解析では、実行中のプロセス、ネットワーク接続、コマンド履歴、マルウェア痕跡などを抽出する。

代表的に得られる情報:

- 実行中プロセス
- 親子プロセス関係
- ネットワーク接続
- ロード済みDLL
- コマンドライン履歴
- 環境変数
- レジストリ情報
- クリップボード
- パスワードやトークンの痕跡
- 不審なプロセス

代表ツール:

- Volatility
- Volatility 3
- Rekall

基本的な流れ:

1. メモリイメージの情報を確認する
2. OSプロファイルやシンボルを確認する
3. プロセス一覧を見る
4. ネットワーク接続を見る
5. 不審プロセスをダンプする
6. 文字列やマルウェア痕跡を調べる

---

## ディスクイメージ解析

ディスクイメージでは、ファイルシステム、削除ファイル、ブラウザ履歴、ログ、設定ファイルなどを確認する。

最初に確認する3項目:

1. イメージ形式とハッシュ値  
   改ざん防止とファイル形式確認のため。

2. パーティション構造  
   どのファイルシステムが含まれるか把握するため。

3. ファイルシステムと重要ディレクトリ  
   ユーザーデータ、ログ、ブラウザ履歴などを調べるため。

代表ツール:

- Autopsy
- The Sleuth Kit
- FTK Imager
- mount
- fls
- mmls

---

## 削除ファイル復元

削除ファイル復元の基本原理は、ファイル削除後もデータ本体がディスク上に残っている場合があることを利用する。

注意点:

- 上書きされると復元は困難
- SSDのTRIMにより復元できない場合がある
- ファイル名やメタデータだけ消えている場合もある
- 元イメージを直接操作せずコピーを使う

代表ツール:

- foremost
- photorec
- scalpel
- Autopsy

---

## タイムライン解析

タイムライン解析は、ファイル作成・変更・アクセス、ログイン、通信、プロセス実行などの時刻情報を並べ、出来事の流れを復元する手法である。

目的:

- 侵入時刻の推定
- 攻撃者の行動把握
- ファイル改ざんの確認
- 不審プロセスの特定
- データ流出の時系列整理

重要な注意点:

- タイムゾーンを統一する
- 時刻改ざんの可能性を見る
- MAC timesを理解する
- 事実と推測を分ける
- 複数ソースで裏付ける

---

## 不審な実行ファイルの基本調査

CTFや解析用環境で、不審な実行ファイルを調べる場合は、安全な環境で静的解析から始める。

基本手順:

1. ハッシュ値を取得
2. fileで形式確認
3. stringsで文字列確認
4. PEヘッダーやインポート関数を見る
5. 実行せずに挙動を推測
6. 必要なら隔離環境で動的解析

代表ツール:

```bash
file sample.exe
sha256sum sample.exe
strings sample.exe
```

注意:

- 実機で不用意に実行しない
- VMやサンドボックスを使う
- ネットワークを隔離する
- 解析対象を外部にアップロードしてよいか確認する

---

## Volatility

Volatilityはメモリダンプ解析用ツールである。

主な用途:

- プロセス一覧
- ネットワーク接続
- コマンド履歴
- DLL一覧
- レジストリ確認
- プロセスダンプ
- マルウェア痕跡調査

Volatility 2とVolatility 3ではコマンド体系が異なるため、使用しているバージョンを確認する必要がある。

---

## 補足知識

## 整合性（Integrity）とは
### 定義
- データが改ざんされていないこと

### 確認方法
- ハッシュ値比較
- ファイルサイズ一致
- メタデータ一致

## 改ざん検知
### 手法
#### ハッシュ値比較
```bash
sha256sum original.img
sha256sum suspect.img
```
#### メタデータ不整合
- 作成日時 > 更新日時 -> 不自然
- 編集履歴あり

#### タイムスタンプ矛盾（MAC times）
| 種類 | 意味       |
| -- | -------- |
| M  | Modified |
| A  | Accessed |
| C  | Changed  |

## チューン・オブ・カストディ
### 定義
- 証拠の取得から保管までの記録

### 重要性
- 証拠の信頼性確保
- 改ざん防止

### 記録内容
- 取得日時
- 取得者
- ハッシュ値
- 保管所

## よくある落とし穴
1. ハッシュを取らない
- 改ざん検証できない
2. 原本を直接操作
- 証拠破壊
3. タイムゾーン無視
- 時系列崩壊
4. ツール未使用
- 見落とし増加

## 解き方の方向性
1. バイナリのとき
- `file`/`strings`/`binwalk`
2. 画像のとき
- `EXIF`/`zsteg`
3. ディスクのとき
- `mmls`/`mount`
4. メモリのとき
- `strings`/`volatility`

---

---

## Forensics チューター補足

## 目的
ファイル解析・メモリ解析・ディスク解析・PCAP解析で、最初に確認する手順をまとめる。

## 確認するポイント

この節の `file`、`xxd`、`strings`、`binwalk`、`grep`、`unzip`、`tshark`、`volatility` の対応OSは (LinuxまたはWSL) です。`grep -i` の `-i` は大文字小文字を無視します。`xxd -l 32` の `-l` は表示するバイト数です。

### 1. ファイル形式の偽装
CTFでは拡張子だけを信用しない。

確認順序：
```sh
file target
xxd -l 32 target
strings -a target | head
binwalk target
```

代表的なマジックナンバー：

| 形式 | 先頭バイト |
|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| JPG | `FF D8 FF` |
| GIF | `47 49 46 38` |
| ZIP | `50 4B 03 04` |
| PDF | `25 50 44 46` |
| ELF | `7F 45 4C 46` |

ヒント例：
> 拡張子よりも先頭数バイトを見てください。`file` の結果とヘッダが食い違う場合、形式偽装の可能性があります。

### 2. 壊れたZIPの確認
ZIP破損・偽装問題では以下を使う。

```sh
file sample.zip
unzip -t sample.zip
zipinfo sample.zip
7z t sample.zip
xxd -l 64 sample.zip
binwalk sample.zip
```

見るポイント：
- 先頭が `PK` か
- 中央ディレクトリが壊れていないか
- 別ファイルが末尾に結合されていないか
- パスワード付きZIPか

補足：
- `binwalk -e` は抽出用であり、破損判定そのものではない。
- `strings` は補助であり、ZIP構造の完全性チェックではない。

### 3. 画像ファイルの末尾と埋め込みデータ
PNG/JPEGの後ろにZIPやテキストが連結されることがある。

```sh
binwalk image.png
foremost image.png
strings -a image.png | grep -iE 'flag|ctf|pass|key'
xxd image.png | tail
```

ヒント例：
> 画像として開けるだけでは終わりではありません。`binwalk` で後続データや埋め込みファイルを確認してください。

### 4. メモリ解析で見ること
Volatility系の基本手順：

```sh
volatility -f memory.raw imageinfo
volatility -f memory.raw --profile=<profile> pslist
volatility -f memory.raw --profile=<profile> netscan
volatility -f memory.raw --profile=<profile> cmdline
volatility -f memory.raw --profile=<profile> filescan
volatility -f memory.raw --profile=<profile> consoles
```

見るもの：
- 不審プロセス
- コマンド履歴
- ネットワーク接続
- 開かれていたファイル
- ブラウザ履歴
- クリップボードや平文文字列

### 5. PCAP解析で見ること
Wireshark/tsharkの確認順：

```sh
tshark -r capture.pcap -q -z io,phs
tshark -r capture.pcap -Y http
tshark -r capture.pcap -Y dns
tshark -r capture.pcap -Y 'tcp contains "flag"'
```

Wiresharkで見る場所：
- Protocol Hierarchy
- Conversations
- Follow TCP Stream
- HTTP objects export
- DNS query name

ヒント例：
> まず通信プロトコルの割合を見てください。HTTPがあればFollow Stream、DNSが多ければクエリ名に情報が分割されていないか確認します。
