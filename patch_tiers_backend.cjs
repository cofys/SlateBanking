const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();',
  'const bank = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();'
);

content = content.replace(
  'await db.update(banks)\n      .set({ accountTiers })\n      .where(eq(banks.id, bankId));',
  'await db.update(bankSettings)\n      .set({ accountTiers })\n      .where(eq(bankSettings.bankId, bankId));'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
