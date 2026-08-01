const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'global.ts');
let content = fs.readFileSync(file, 'utf8');

content += `
globalRouter.get("/api/global/audit", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { globalAuditLogs } = await import("../../db/schema.js");
  const { desc, limit } = await import("drizzle-orm");
  try {
    const logs = await db.select().from(globalAuditLogs)
      .orderBy(desc(globalAuditLogs.timestamp))
      .limit(150);
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
`;

fs.writeFileSync(file, content);
console.log("Patched global.ts");
