const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'citizen.ts');
let content = fs.readFileSync(file, 'utf8');

const newRoute = `
citizenRouter.post("/api/citizen/loans/:loanId/sign", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { loans, bankAccounts, transactions } = await import("../../db/schema.js");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
        const discordId = (req as any).user.discordId;
        const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
        if (!loan || loan.discordId !== discordId) return res.status(404).json({ error: "Loan not found" });
        if (loan.status !== "awaiting_signature") return res.status(400).json({ error: "Loan is not awaiting signature" });

        const ts = new Date();
        await db.update(bankAccounts).set({ balance: sql\`\${bankAccounts.balance} + \${loan.principalAmount}\` }).where(eq(bankAccounts.id, loan.accountId));
        await db.insert(transactions).values({
            id: uuidv4(),
            bankId: loan.bankId,
            fromAccountId: null,
            toAccountId: loan.accountId,
            type: "deposit",
            amount: loan.principalAmount,
            description: \`Loan Disbursement (Principal: $\${(loan.principalAmount/100).toFixed(2)})\`,
            timestamp: ts
        });
        await db.update(loans).set({ status: "active", clientSignedAt: ts }).where(eq(loans.id, loan.id));
        res.json({ success: true });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
    }
});
`;

if (!content.includes('citizenRouter.post("/api/citizen/loans/:loanId/sign"')) {
    content = content.replace(
        'citizenRouter.post("/api/citizen/pay-loan"',
        newRoute + '\n\ncitizenRouter.post("/api/citizen/pay-loan"'
    );
    fs.writeFileSync(file, content);
    console.log("Patched successfully");
} else {
    console.log("Already patched");
}
