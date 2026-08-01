const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankOverview.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const totalBalance = customers.reduce((sum: number, c: any) => sum + c.totalBalance, 0);',
  'const custArray = Array.isArray(customers) ? customers : [];\n          const totalBalance = custArray.reduce((sum: number, c: any) => sum + c.totalBalance, 0);'
);
content = content.replace(
  'const totalAccounts = customers.reduce((sum: number, c: any) => sum + c.accountCount, 0);',
  'const totalAccounts = custArray.reduce((sum: number, c: any) => sum + c.accountCount, 0);'
);
content = content.replace(
  'topCustomers: customers.sort((a: any, b: any) => b.totalBalance - a.totalBalance).slice(0, 5)',
  'topCustomers: custArray.sort((a: any, b: any) => b.totalBalance - a.totalBalance).slice(0, 5)'
);

fs.writeFileSync(file, content);
console.log("Patched BankOverview.tsx");
