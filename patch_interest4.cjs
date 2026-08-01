const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'interestRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

// There are remaining instances in the cron job where 'settings?' is being used but 'settings' doesn't exist in scope, it was actually 'bank' representing the bankSettings result. Let's fix this in the cron job.
content = content.replace(
  'const eligibleAccounts = accounts.filter(account => {',
  'const eligibleAccounts = accounts.filter(account => {\n          const settings = bank;'
);

content = content.replace(
  'for (const account of eligibleAccounts) {',
  'const settings = bank;\n      for (const account of eligibleAccounts) {'
);

fs.writeFileSync(file, content);
console.log("Patched interestRoutes.ts");
