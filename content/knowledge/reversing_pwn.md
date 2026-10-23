# Reversing / Pwn 不足知識まとめ

## 目的
Ghidra解析、XOR復元、バッファオーバーフロー、ELF調査で、初心者が最初に見る場所をまとめる。

## 確認するポイント

この節の `file`、`strings`、`checksec`、`gdb`、`ltrace`、`strace`、`objdump` の対応OSは (LinuxまたはWSL) です。`strings -a` の `-a` は実行可能領域以外も含めます。`checksec --file=対象` の `--file` は調べるファイルです。`objdump -d` の `-d` は実行部分の逆アセンブルです。

### 1. 逆コンパイルコードの読み方
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

### 2. XOR復元
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

### 3. ELFの基本調査
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

### 4. バッファオーバーフロー
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
- CTFの配布ファイル、自作バイナリ、許可された環境だけで試す。
- 実在のシステムでは試さない。

### 5. Pwnで先に確認すること
- `checksec` の見方
- クラッシュするか
- 入力の長さと落ちる位置の関係
- 防御機構の意味

最初の確認（対応OS: (LinuxまたはWSL)）:

```sh
file chall
strings -a chall
checksec --file=chall
```

Ghidraで見る場所:
- `main`
- `strcmp` / `memcmp` の直前
- XORや加算が行われるループ
