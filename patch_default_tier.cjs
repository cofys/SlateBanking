const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername, accountType, tierId } = req.body;\n    \n    try {\n      // 1. Fetch Bank Configuration',
  'const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername, accountType, tierId } = req.body;\n    \n    try {\n      // 1. Fetch Bank Configuration\n      const { bankSettings } = await import("../../db/schema");\n      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId)).get();'
);

content = content.replace(
  'tierId: req.body.tierId || tierId || null,',
  'tierId: (req.body.tierId || tierId) || (settings?.enableAccountTiers && settings?.accountTiers?.find((t: any) => t.isDefault && t.type === finalAccountType)?.id) || null,'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
