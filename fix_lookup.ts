import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldLookupStr = `      const userAccounts = await db.select({
        id: bankAccounts.id,`;

const newLookupStr = `      const { bankStaff } = await import("./src/db/schema");
      const isGlobalAdmin = (req as any).user.isGlobalAdmin;
      let isStaff = isGlobalAdmin;
      if (!isStaff) {
        const staff = await db.select().from(bankStaff).where(and(eq(bankStaff.bankId, bankId), eq(bankStaff.discordId, discordId))).get();
        if (staff) isStaff = true;
      }

      const userAccounts = await db.select({
        id: bankAccounts.id,`;

code = code.replace(oldLookupStr, newLookupStr);

const oldLookupRet = `      res.json({
        accounts: userAccounts,`;

const newLookupRet = `      res.json({
        isStaff,
        accounts: userAccounts,`;

code = code.replace(oldLookupRet, newLookupRet);

fs.writeFileSync('server.ts', code);
console.log("Replaced lookup");
