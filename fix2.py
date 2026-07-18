import sys, re
with open('server.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip().startswith('const authUrl = bank.cityCorpAuthUrl'):
        new_lines.append('        const authUrl = bank.cityCorpAuthUrl || `https://dashboard.cityrp.org/authorize?app_id=${bank.cityCorpAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scopes=${scopes}&state=${state}&response_type=code`;\n')
    elif 'redirect_uri=${encodeURIComponent(redirectUri)}const authUrl =' in line or 'scopes=${scopes}const authUrl =' in line or 'state=${state}const authUrl =' in line or 'response_type=code`;' in line and 'const authUrl = ' not in line:
        pass # skip these corrupted lines
    else:
        new_lines.append(line)

with open('server.ts', 'w') as f:
    f.writelines(new_lines)
print('Fixed2')
