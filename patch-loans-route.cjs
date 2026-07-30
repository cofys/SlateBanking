const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

const newRoute = `
banksRouter.put("/api/banks/:bankId/loans/:loanId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { loans } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    try {
      const { principalAmount, interestRate, purpose, collateralDescription, collateralValue, contractUrl, contractText, status } = req.body;
      const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
      if (!loan || loan.bankId !== req.params.bankId) return res.status(404).json({ error: "Loan not found" });

      const updates: any = {};
      if (principalAmount !== undefined) {
         updates.principalAmount = principalAmount;
         updates.remainingAmount = principalAmount;
      }
      if (interestRate !== undefined) updates.interestRate = interestRate;
      if (purpose !== undefined) updates.purpose = purpose;
      if (collateralDescription !== undefined) updates.collateralDescription = collateralDescription;
      if (collateralValue !== undefined) updates.collateralValue = collateralValue;
      if (contractUrl !== undefined) updates.contractUrl = contractUrl;
      if (contractText !== undefined) updates.contractText = contractText;
      if (status !== undefined) updates.status = status;

      await db.update(loans).set(updates).where(eq(loans.id, req.params.loanId));
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
});
`;

if (!content.includes('banksRouter.put("/api/banks/:bankId/loans/:loanId"')) {
    content = content.replace(
        'banksRouter.put("/api/banks/:bankId/loans/:loanId/status", requireBankStaff',
        newRoute + '\n\nbanksRouter.put("/api/banks/:bankId/loans/:loanId/status", requireBankStaff'
    );
    fs.writeFileSync(file, content);
    console.log("Patched successfully");
} else {
    console.log("Already patched");
}
