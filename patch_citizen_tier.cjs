const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'citizen.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '      // Determine transfer fee rate (using custom account fee override if defined, else bank default)\n      let transferFeeBps = sourceAccount.customTransferFeePercent;\n      if (transferFeeBps === null || transferFeeBps === undefined) {\n        const fromSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, fromBank)).get();\n        transferFeeBps = fromSettings?.transferFeePercent ?? 0;\n      }',
  '      // Determine transfer fee rate (using custom account fee override if defined, else bank default)\n      const fromSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, fromBank)).get();\n      let transferFeeBps = sourceAccount.customTransferFeePercent;\n      if (transferFeeBps === null || transferFeeBps === undefined) {\n        let tierFee = null;\n        if (fromSettings?.enableAccountTiers && sourceAccount.tierId && fromSettings.accountTiers) {\n           const t = fromSettings.accountTiers.find((x:any) => x.id === sourceAccount.tierId);\n           if (t && t.transferFeePercent !== null) tierFee = t.transferFeePercent;\n        }\n        transferFeeBps = tierFee !== null ? tierFee : (fromSettings?.transferFeePercent ?? 0);\n      }'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
