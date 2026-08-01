const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'interestRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

// There are instances in the cron job where 'bank' was replaced with 'settings?' but 'settings' doesn't exist in scope, it was actually 'bank' representing the bankSettings result. Let's fix this in the cron job.
content = content.replace(
  'const eligibleAccounts = accounts.filter(account => {',
  'const settings = bank;\n        const eligibleAccounts = accounts.filter(account => {'
);

fs.writeFileSync(file, content);
console.log("Patched interestRoutes.ts");
