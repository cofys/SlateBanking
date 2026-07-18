import sys, re
with open('server.ts', 'r') as f:
    content = f.read()

pattern = re.compile(r'const authUrl = bank\.cityCorpAuthUrl \|\| `https://dashboard\.cityrp\.org/authorize\?app_id=\$\{bank\.cityCorpAppId\}const authUrl.*?;', re.DOTALL)

content = pattern.sub(r'const authUrl = bank.cityCorpAuthUrl || `https://dashboard.cityrp.org/authorize?app_id=${bank.cityCorpAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scopes=${scopes}&state=${state}&response_type=code`;', content)

with open('server.ts', 'w') as f:
    f.write(content)
print('Fixed')
