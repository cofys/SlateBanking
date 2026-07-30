const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankPortal.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'if (!d.error) setBank(d);',
  'if (!d.error) { setBank(d); document.title = `${d.name} | Client Portal`; }'
);

fs.writeFileSync(file, content);
console.log("Patched portal successfully");
