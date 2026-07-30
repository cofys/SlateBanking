const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'authRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "if (provider === 'citycorp' || (bank && (bank.cityCorpAppId || bank.cityCorpAuthUrl)) || hasCityCorpEnv) {",
  "if (provider === 'citycorp' || (!provider && ((bank && (bank.cityCorpAppId || bank.cityCorpAuthUrl)) || hasCityCorpEnv))) {"
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
