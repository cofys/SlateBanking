const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankTeam.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '<th className="px-6 py-4 font-medium">Discord ID</th>',
  '<th className="px-6 py-4 font-medium">Identifier (Discord/MC)</th>'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
