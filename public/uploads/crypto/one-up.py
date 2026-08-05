flag="CSL24{***************}"

def oneup(flag):
    ss=[]
    for i in flag:
        b=ord(i)+1
        c=chr(b)
        ss.append(c)
    return ss

s=oneup(flag)
print(s)