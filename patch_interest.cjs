const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'interestRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

// Add bankSettings to imports
content = content.replace(
  'import { banks, bankAccounts, transactions } from "../db/schema.js";',
  'import { banks, bankAccounts, transactions, bankSettings } from "../db/schema.js";'
);

content = content.replace(
  'const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();\n      if (!bank) return res.status(404).json({ error: "Bank not found" });',
  'const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();\n      if (!bank) return res.status(404).json({ error: "Bank not found" });\n      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();'
);

content = content.replace(
  'const apyToUse = account.customApyPercent !== null ? account.customApyPercent : bank.savingsApyPercent;',
  'let tierApy = null;\n        if (settings && settings.enableAccountTiers && account.tierId && settings.accountTiers) {\n          const t = settings.accountTiers.find((x:any) => x.id === account.tierId);\n          if (t && t.apyPercent !== null) tierApy = t.apyPercent;\n        }\n        const apyToUse = account.customApyPercent !== null ? account.customApyPercent : (tierApy !== null ? tierApy : bank.savingsApyPercent);'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
