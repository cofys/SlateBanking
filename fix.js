const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/const authUrl = bank\.cityCorpAuthUrl \|\| `https:\/\/dashboard\.cityrp\.org\/authorize\?app_id=\$\{bank\.cityCorpAppId\}const authUrl.*?;/g,
  'const authUrl = bank.cityCorpAuthUrl || `https://dashboard.cityrp.org/authorize?app_id=${bank.cityCorpAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scopes=${scopes}&state=${state}&response_type=code`;');
  
fs.writeFileSync('server.ts', code);
