const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankTeam.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '<label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord ID</label>',
  '<label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord ID or MC Username</label>'
);

content = content.replace(
  'placeholder="123456789"',
  'placeholder="123456789 or notch"'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
