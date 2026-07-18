import sys
with open('src/lib/AuthContext.tsx', 'r') as f:
    code = f.read()

code = code.replace(
    'setUser(data);',
    'if (data && data.avatarUrl && data.avatarUrl.includes("crafatar.com")) {\n          data.avatarUrl = data.avatarUrl.replace("https://crafatar.com/avatars/", "https://mc-heads.net/avatar/").replace("?size=64&overlay=true", "/64");\n        }\n        setUser(data);'
)

with open('src/lib/AuthContext.tsx', 'w') as f:
    f.write(code)
print("AuthContext patched")
