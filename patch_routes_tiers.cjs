const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

const routeCode = `
banksRouter.get("/api/banks/:bankId/tiers", requireBankStaff, async (req: any, res: any) => {
  const { bankId } = req.params;
  try {
    const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    if (!bank) return res.status(404).json({ error: "Bank not found" });
    res.json({ accountTiers: bank.accountTiers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

banksRouter.put("/api/banks/:bankId/tiers", [requireBankStaff, requireRole(["owner", "admin", "manager"])], async (req: any, res: any) => {
  const { bankId } = req.params;
  const { accountTiers } = req.body;
  try {
    await db.update(banks)
      .set({ accountTiers })
      .where(eq(banks.id, bankId));
    res.json({ accountTiers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
`;

content = content.replace(
  'export const banksRouter = express.Router();',
  'export const banksRouter = express.Router();\n' + routeCode
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
