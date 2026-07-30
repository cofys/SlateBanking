const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'components', 'layout', 'BankAdminLayout.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'setBank(b);',
  'setBank(b);\n          document.title = `${b.name} | Staff Portal`;'
);

fs.writeFileSync(file, content);
console.log("Patched layout successfully");
