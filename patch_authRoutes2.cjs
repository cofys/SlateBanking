const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'authRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const isCustomDomain = bankToUse && bankToUse.customDomain && hostname && hostname.includes(bankToUse.customDomain as string);',
  'const isCustomDomain = bankToUse && bankToUse.customDomain && hostname && hostname.includes(bankToUse.customDomain as string);\n    if (bankToUse && isCustomDomain && bankToUse.discordClientId && bankToUse.discordClientSecret) {\n       clientId = bankToUse.discordClientId;\n       clientSecret = bankToUse.discordClientSecret;\n    }'
);
content = content.replace(
  'if (isCustomDomain && bankToUse.discordClientId && bankToUse.discordClientSecret) {\n       clientId = bankToUse.discordClientId;\n       clientSecret = bankToUse.discordClientSecret;\n    }',
  ''
);

fs.writeFileSync(file, content);
console.log("Patched authRoutes.ts");
