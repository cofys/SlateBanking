const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'authRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const isCustomDomain = bankToUse && bankToUse.customDomain && hostname && hostname.includes(bankToUse.customDomain);',
  'const isCustomDomain = bankToUse && bankToUse.customDomain && hostname && hostname.includes(bankToUse.customDomain as string);'
);

// We need to handle 'bank' is possibly null
content = content.replace(
  /const redirectUri = await getRedirectUri\(req\);([\s\S]*?)const authUrl = `https:\/\/discord.com\/oauth2\/authorize\?client_id=\${clientId}&redirect_uri=\${encodeURIComponent\(redirectUri\)}&response_type=code&scope=identify%20guilds%20email&state=\${state}`;\n\n    res.json\(\{ url: authUrl \}\);/g,
  `const redirectUri = await getRedirectUri(req);
    const authUrl = \`https://discord.com/oauth2/authorize?client_id=\${clientId}&redirect_uri=\${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds%20email&state=\${state}\`;

    res.json({ url: authUrl });`
);


fs.writeFileSync(file, content);
console.log("Patched authRoutes.ts");
