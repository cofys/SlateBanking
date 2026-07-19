import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldStaffLogic = `      const { bankStaff } = await import("./src/db/schema");
      const isGlobalAdmin = (req as any).user.isGlobalAdmin;
      let isStaff = isGlobalAdmin;
      if (!isStaff) {
        const staff = await db.select().from(bankStaff).where(and(eq(bankStaff.bankId, bankId), eq(bankStaff.discordId, discordId))).get();
        if (staff) isStaff = true;
      }`;

const newStaffLogic = `      const { bankStaff } = await import("./src/db/schema");
      let isStaff = false;
      const staff = await db.select().from(bankStaff).where(and(eq(bankStaff.bankId, bankId), eq(bankStaff.discordId, discordId))).get();
      if (staff) isStaff = true;`;

code = code.replace(oldStaffLogic, newStaffLogic);

fs.writeFileSync('server.ts', code);
console.log("Replaced isStaff logic");
