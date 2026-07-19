import * as fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

const oldStr = `  app.get("/api/stats", requireGlobalAdmin, async (req, res) => {`;
const newStr = `  app.get("/api/global-admins", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { globalAdmins } = await import("./src/db/schema");
    try {
      const admins = await db.select().from(globalAdmins);
      res.json(admins);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/global-admins", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { globalAdmins } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { discordId } = req.body;
      if (!discordId) return res.status(400).json({ error: "Missing discordId" });
      await db.insert(globalAdmins).values({
        id: uuidv4(),
        discordId,
        addedBy: (req as any).user.discordId,
        createdAt: new Date()
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/global-admins/:id", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { globalAdmins } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.delete(globalAdmins).where(eq(globalAdmins.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stats", requireGlobalAdmin, async (req, res) => {`;

if (code.includes(oldStr)) {
    code = code.replace(oldStr, newStr);
    fs.writeFileSync('server.ts', code);
    console.log("Replaced");
} else {
    console.log("Not found");
}
