import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldStr = `      const isGlobalAdmin = userData.username === 'cofys' || userData.email === 'cofysmc@gmail.com';`;
const newStr = `      const { globalAdmins } = await import("./src/db/schema");
      const { eq } = await import("drizzle-orm");
      const { db } = await import("./src/db/index");
      const dbAdmin = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, userData.id)).get();
      const isGlobalAdmin = userData.username === 'cofys' || userData.email === 'cofysmc@gmail.com' || !!dbAdmin;`;

if (code.includes(oldStr)) {
    code = code.replace(oldStr, newStr);
    fs.writeFileSync('server.ts', code);
    console.log("Replaced");
} else {
    console.log("Not found");
}
