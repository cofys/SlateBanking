const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'authRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'if (!bank || (!bank.cityCorpAppId && !bank.cityCorpAuthUrl)) {',
  'if (!bank || (!bank?.cityCorpAppId && !bank?.cityCorpAuthUrl)) {'
);

fs.writeFileSync(file, content);
console.log("Patched authRoutes.ts");
