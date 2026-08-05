import base64

ans = "kogaCTF{********}".encode()
tmp = ans
for i in range(20):
    tmp = base64.b64encode(tmp)
    print(i)

print(type(tmp))
with open("Question?.txt","wb") as file:
    file.write(tmp)
