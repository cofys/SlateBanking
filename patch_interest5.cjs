const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'interestRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

// I need to add `const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();` inside the app.post("/api/banks/:bankId/interest-run" ...

content = content.replace(
  'const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();\n      if (!bank) return res.status(404).json({ error: "Bank not found" });',
  'const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();\n      if (!bank) return res.status(404).json({ error: "Bank not found" });\n      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();'
);

content = content.replace('const settings = bank;', '');

fs.writeFileSync(file, content);
console.log("Patched interestRoutes.ts");
