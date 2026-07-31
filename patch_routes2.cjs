const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername, accountType } = req.body;',
  'const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername, accountType, tierId } = req.body;'
);

content = content.replace(
  'accountType: finalAccountType,\n        balance: req.body.initialBalanceCents || initialBalanceCents || 0,\n        createdAt: new Date(),',
  'accountType: finalAccountType,\n        tierId: req.body.tierId || tierId || null,\n        balance: req.body.initialBalanceCents || initialBalanceCents || 0,\n        createdAt: new Date(),'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
