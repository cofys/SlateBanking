const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'interestRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /await db\.update\(banks\)\s*\.set\(\{([\s\S]*?)\}\)\s*\.where\(eq\(banks\.id,\s*bankId\)\);/g,
  `await db.update(bankSettings).set({$1}).where(eq(bankSettings.bankId, bankId));`
);

content = content.replace(
  /await db\.update\(banks\)\s*\.set\(\{([\s\S]*?)\}\)\s*\.where\(eq\(banks\.id,\s*bank\.id\)\);/g,
  `await db.update(bankSettings).set({$1}).where(eq(bankSettings.bankId, bank.id));`
);

fs.writeFileSync(file, content);
console.log("Patched interestRoutes.ts");
