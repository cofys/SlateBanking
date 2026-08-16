import express from "express";
import { requireBankStaff, requireRole } from "../middleware.js";

export const bankSnapshotRouter = express.Router();

bankSnapshotRouter.get("/api/banks/:id/snapshot", [requireBankStaff, requireRole(["owner", "admin"])], async (req: express.Request, res: express.Response) => {
    try {
        const bankId = req.params.id;
        const { db } = await import("../../db/index.js");
        const schema = await import("../../db/schema.js");
        const { eq, or, inArray } = await import("drizzle-orm");

        const snapshot: any = {};
        
        // Find all tables in schema that have bankId
        snapshot.bank = await db.select().from(schema.banks).where(eq(schema.banks.id, bankId)).get();
        snapshot.bankSettings = await db.select().from(schema.bankSettings).where(eq(schema.bankSettings.bankId, bankId)).get();
        snapshot.bankStaff = await db.select().from(schema.bankStaff).where(eq(schema.bankStaff.bankId, bankId)).all();
        snapshot.bankCustomers = await db.select().from(schema.bankCustomers).where(eq(schema.bankCustomers.bankId, bankId)).all();
        snapshot.bankAccounts = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.bankId, bankId)).all();
        snapshot.transactions = await db.select().from(schema.transactions).where(eq(schema.transactions.bankId, bankId)).all();
        snapshot.onyxMerchants = await db.select().from(schema.onyxMerchants).where(eq(schema.onyxMerchants.bankId, bankId)).all();
        snapshot.escrows = await db.select().from(schema.escrows).where(eq(schema.escrows.bankId, bankId)).all();
        snapshot.supportTickets = await db.select().from(schema.supportTickets).where(eq(schema.supportTickets.bankId, bankId)).all();
        snapshot.auditLogs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.bankId, bankId)).all();
        snapshot.loans = await db.select().from(schema.loans).where(eq(schema.loans.bankId, bankId)).all();
        snapshot.creditApplications = await db.select().from(schema.creditApplications).where(eq(schema.creditApplications.bankId, bankId)).all();
        snapshot.vaultDeposits = await db.select().from(schema.vaultDeposits).where(eq(schema.vaultDeposits.bankId, bankId)).all();
        snapshot.cards = await db.select().from(schema.cards).where(eq(schema.cards.bankId, bankId)).all();
        snapshot.payrollJobs = await db.select().from(schema.payrollJobs).where(eq(schema.payrollJobs.bankId, bankId)).all();
        snapshot.subscriptions = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.bankId, bankId)).all();
        snapshot.invoices = await db.select().from(schema.invoices).where(eq(schema.invoices.bankId, bankId)).all();
        snapshot.loanProducts = await db.select().from(schema.loanProducts).where(eq(schema.loanProducts.bankId, bankId)).all();
        snapshot.creditProducts = await db.select().from(schema.creditProducts).where(eq(schema.creditProducts.bankId, bankId)).all();
        snapshot.saasInvoices = await db.select().from(schema.saasInvoices).where(eq(schema.saasInvoices.bankId, bankId)).all();
        snapshot.discordWebhooks = await db.select().from(schema.discordWebhooks).where(eq(schema.discordWebhooks.bankId, bankId)).all();

        // Also fetch related data that might not have a direct bankId but is related to accounts
        const accIds = snapshot.bankAccounts.map((a: any) => a.id);
        if (accIds.length > 0) {
            snapshot.accountMembers = await db.select().from(schema.accountMembers).where(inArray(schema.accountMembers.accountId, accIds)).all();
            snapshot.savingsGoals = await db.select().from(schema.savingsGoals).where(inArray(schema.savingsGoals.accountId, accIds)).all();
            snapshot.paymentLinks = await db.select().from(schema.paymentLinks).where(inArray(schema.paymentLinks.billerAccountId, accIds)).all();
            snapshot.recurringTransfers = await db.select().from(schema.recurringTransfers).where(
                or(inArray(schema.recurringTransfers.fromAccountId, accIds), inArray(schema.recurringTransfers.toAccountId, accIds))
            ).all();
        } else {
            snapshot.accountMembers = [];
            snapshot.savingsGoals = [];
            snapshot.paymentLinks = [];
            snapshot.recurringTransfers = [];
        }

        res.json(snapshot);
    } catch (e: any) {
        console.error("Snapshot generation error:", e);
        res.status(500).json({ error: e.message });
    }
});
