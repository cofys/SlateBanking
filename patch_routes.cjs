const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'enableTreasury: true',
  'enableTreasury: true,\n          enableAccountTiers: true'
);

content = content.replace(
  'enableTreasury: req.body.enableTreasury,',
  'enableTreasury: req.body.enableTreasury,\n        enableAccountTiers: req.body.enableAccountTiers,'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
