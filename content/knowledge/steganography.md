# Steganography 不足知識まとめ

## 目的
画像・音声・QRコードなどに隠された情報を調べる問題で、AI先生が具体的な探索手順を返せるようにする。

## 評価で見えた不足

### 1. QRコード隠蔽の説明が抽象的
QRコードを使った隠蔽では「QRを作る」だけでなく、どう隠すか・どう見つけるかを説明する。

代表例：
- 画像の一部に小さく配置する
- 透明度を変えて背景に重ねる
- 色差を小さくして肉眼で見えにくくする
- 反転・回転・分割する
- 画像のアルファチャンネルに埋める
- Officeファイル内の画像として隠す
- PDFやPPTX内に貼り付ける

調査手順：
```sh
file image.png
exiftool image.png
binwalk image.png
zsteg image.png
strings -a image.png
```

画像編集で見る：
- 明るさ・コントラストを上げる
- 色反転する
- RGBチャンネルを分離する
- アルファチャンネルを見る
- 拡大して隅や余白を見る

### 2. LSB解析の説明不足
PNG/BMPなどではLSBに情報が隠されることがある。

```sh
zsteg image.png
zsteg -a image.png
```

見るポイント：
- `b1,r,lsb`
- `b1,g,lsb`
- `b1,b,lsb`
- `b1,rgb,lsb`
- ASCII文字列やBase64らしい文字列

ヒント例：
> 色の見た目ではなく、各ピクセルの最下位ビットに注目してください。PNGなら `zsteg` が有効です。

### 3. steghideの用途の説明不足
JPEG/BMP/WAV/AUでは `steghide` が使われることがある。

```sh
steghide info image.jpg
steghide extract -sf image.jpg
```

注意：
- パスフレーズが必要な場合がある。
- パスワード候補は問題文・ファイル名・EXIF・stringsから探す。

### 4. 画像メタデータの確認不足
```sh
exiftool image.jpg
identify -verbose image.jpg
strings -a image.jpg | grep -iE 'flag|ctf|comment|password|key'
```

見る場所：
- Comment
- Author
- Software
- GPS
- CreateDate
- UserComment

### 5. 音声ステガノの基本不足
```sh
file audio.wav
exiftool audio.wav
strings -a audio.wav
binwalk audio.wav
sox audio.wav spectrogram -o spec.png
```

見るポイント：
- スペクトログラムに文字が描かれていないか
- 逆再生で意味が出ないか
- モールス信号ではないか
- DTMF音ではないか

## 回答テンプレート

```md
### 着眼点
この問題は画像の見た目だけでなく、メタデータ・ビット・埋め込みファイルを確認するタイプです。

### 確認手順
```sh
file <file>
exiftool <file>
binwalk <file>
zsteg <file>
strings -a <file>
```

### 見るポイント
- QRが薄く重なっていないか
- 端や余白に小さいコードがないか
- LSBにASCII文字列がないか
- 末尾にZIPなどが結合されていないか
```

## 情報開示の注意
- QRの読み取り結果そのものは最終答えに近いので、最初から出さない。
- 先に「どこを加工・確認すれば読めるか」を教える。
