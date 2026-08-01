const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankOverview.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'fetch(`/api/banks/${bank.id}/customers`).then(r => r.json()),',
  'fetch(`/api/banks/${bank.id}/customers`).then(r => r.ok ? r.json() : []).catch(() => []),',
);

fs.writeFileSync(file, content);
console.log("Patched BankOverview.tsx");
