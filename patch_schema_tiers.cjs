const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'db', 'schema.ts');
let content = fs.readFileSync(file, 'utf8');

// Add enableAccountTiers to banks
content = content.replace(
  'enableTreasury: integer("enable_treasury", { mode: "boolean" }).default(true),',
  'enableTreasury: integer("enable_treasury", { mode: "boolean" }).default(true),\n  enableAccountTiers: integer("enable_account_tiers", { mode: "boolean" }).default(false),'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
