flag="FLAG{***********}"
k="cyber"

def decrypto(s, k):
    ss = []

    for i in range(len(s)):
        a = int(s[i], 16)
        b = ord(k[i % len(k)])
        c = a ^ b
        ss.append(chr(c))

    return ''.join(ss)

s = [
    '0x25', '0x35', '0x23', '0x22', '0x9',
    '0x6', '0x1', '0x1', '0x9', '0x7',
    '0x10', '0x10', '0x14', '0x0', '0x1d',
    '0x11', '0x4'
]

decrypted_flag = decrypto(s, k)
print("Decrypted flag:", decrypted_flag)