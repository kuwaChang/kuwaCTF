# Reversing / Pwn 不足知識まとめ

## 目的
Ghidra解析、XOR復元、バッファオーバーフロー、ELF調査などで、AI先生が初心者向けに具体的な手順を返せるようにする。

## 評価で見えた不足

### 1. 逆コンパイルコードの読み方不足
Ghidraの変数名は自動生成なので、意味を推測してリネームする。

例：
- `local_38` → `encoded_flag`
- `local_40` → `i`
- `FUN_00101234` → `check_flag`

見るポイント：
- 入力を受け取る関数：`scanf`, `fgets`, `gets`, `read`
- 比較する関数：`strcmp`, `strncmp`, `memcmp`
- 変換処理：`xor`, `+`, `-`, `^`, `<<`, `>>`
- 固定配列：暗号化済みflagの可能性

### 2. XOR復元の具体性不足
Ghidraで以下のような配列が出たら、XORや加減算を疑う。

```c
local_38[0] = 0x01;
local_38[1] = 0x11;
local_38[2] = 0x0e;
```

復元例：
```python
data = [0x01, 0x11, 0x0e, 0x70, 0x76]
for key in range(256):
    out = bytes([x ^ key for x in data])
    if all(32 <= b < 127 for b in out):
        print(hex(key), out)
```

### 3. ELFの基本調査不足
```sh
file chall
checksec --file=chall
strings -a chall
ltrace ./chall
strace ./chall
objdump -d chall | less
```

見るポイント：
- 32bit/64bit
- PIE有無
- NX有無
- Canary有無
- RELRO
- `strings` にフラグやパスワードがないか

### 4. BOFの説明不足
初心者向け説明：
- 入力バッファより長い文字列を入れると、隣のメモリを書き換えることがある。
- CTFでは戻りアドレスや認証フラグ変数を書き換える問題がある。

確認：
```sh
python3 - <<'PY'
print('A' * 100)
PY
```

GDBで見る：
```sh
gdb ./chall
run
info registers
x/40gx $rsp
```

安全上の注意：
- CTF・自作バイナリ・許可された環境だけで試す。
- 実システムへの攻撃手順として説明しない。

### 5. Pwnで教えすぎない境界
出してよい：
- `checksec` の見方
- クラッシュ確認
- オフセット調査の考え方
- 防御機構の意味

慎重にする：
- 完成exploitコード
- リモート攻撃の自動化
- 実サービスを対象にした侵害手順

## 回答テンプレート

```md
### 着眼点
固定配列と比較処理があるので、入力を変換して照合するreversing問題の可能性があります。

### 確認手順
```sh
file chall
strings -a chall
checksec --file=chall
```

### Ghidraで見る場所
- `main`
- `strcmp` / `memcmp` の直前
- XORや加算が行われるループ
```
