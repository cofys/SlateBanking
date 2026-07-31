import express from "express";
import { requireAuth, requireBankStaff } from "./middleware.js";
import { db } from "../db/index.js";
import { banks, bankAccounts, transactions } from "../db/schema.js";
import { eq, and, lte, or, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export function registerInterestRoutes(app: express.Express) {
  app.get("/api/banks/:bankId/interest-settings", requireBankStaff, async (req, res) => {
    const { bankId } = req.params;
    try {
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      
      res.json({
        savingsApyPercent: bank.savingsApyPercent,
        interestPaymentSchedule: bank.interestPaymentSchedule,
        interestNextPaymentAt: bank.interestNextPaymentAt,
        interestTargetAccounts: bank.interestTargetAccounts,
        interestMinBalance: bank.interestMinBalance,
        interestMaxAccountBalance: bank.interestMaxAccountBalance,
        interestRequiresActivityDays: bank.interestRequiresActivityDays,
        lastInterestAccrualAt: bank.lastInterestAccrualAt
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/banks/:bankId/interest-settings", requireBankStaff, async (req, res) => {
    const { bankId } = req.params;
    const {
      savingsApyPercent,
      interestPaymentSchedule,
      interestTargetAccounts,
      interestMinBalance,
      interestMaxAccountBalance,
      interestRequiresActivityDays
    } = req.body;

    try {
      const staffRole = (req as any).staffRole;
      if (staffRole !== "admin" && staffRole !== "manager") {
         return res.status(403).json({ error: "Only Managers and Admins can configure interest settings." });
      }

      await db.update(banks)
        .set({
          savingsApyPercent,
          interestPaymentSchedule,
          interestTargetAccounts,
          interestMinBalance,
          interestMaxAccountBalance,
          interestRequiresActivityDays
        })
        .where(eq(banks.id, bankId));

      const updated = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/banks/:bankId/interest-run", requireBankStaff, async (req, res) => {
    const { bankId } = req.params;
    try {
      const staffRole = (req as any).staffRole;
      if (staffRole !== "admin" && staffRole !== "manager") {
         return res.status(403).json({ error: "Only Managers and Admins can trigger interest runs." });
      }

      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      let targetAccountTypes: string[] = [];
      if (bank.interestTargetAccounts === "savings_only") {
         targetAccountTypes = ["personal", "business"]; // We'll filter by name later, wait, what's a savings account?
      }
      
      // Let's get all active accounts for this bank
      const accounts = await db.select().from(bankAccounts)
        .where(and(
          eq(bankAccounts.bankId, bankId),
          eq(bankAccounts.isActive, true),
          eq(bankAccounts.isSystem, false)
        )).all();

      let eligibleAccounts = accounts;

      if (bank.interestTargetAccounts === "savings_only") {
        eligibleAccounts = eligibleAccounts.filter(a => a.accountName.toLowerCase().includes("saving"));
      } else if (bank.interestTargetAccounts === "personal_only") {
        eligibleAccounts = eligibleAccounts.filter(a => a.accountType === "personal");
      } else if (bank.interestTargetAccounts === "business_only") {
        eligibleAccounts = eligibleAccounts.filter(a => a.accountType === "business");
      }

      if (bank.interestMinBalance > 0) {
        eligibleAccounts = eligibleAccounts.filter(a => a.balance >= (bank.interestMinBalance || 0));
      }

      if (bank.interestRequiresActivityDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - bank.interestRequiresActivityDays);
        eligibleAccounts = eligibleAccounts.filter(a => {
           if (!a.lastSyncedAt) return false;
           return new Date(a.lastSyncedAt) >= cutoff;
        });
      }

      let count = 0;
      let totalAmount = 0;
      
      // Usually APY is annual. We should probably calculate it as a monthly/daily rate based on schedule, 
      // but if it's a manual run, let's assume it's a monthly payout by default, or maybe the user wants 1/12th of the APY?
      // Since it's a game, often they just want a simple percentage per run.
      // 300 basis points = 3.00%
      // So if schedule is monthly, 3% / 12 = 0.25% per month.
      // Let's calculate the divisor based on schedule.
      let divisor = 12; // default monthly
      if (bank.interestPaymentSchedule === "daily") divisor = 365;
      if (bank.interestPaymentSchedule === "weekly") divisor = 52;
      
      // Process in a transaction? SQLite can handle it.
      for (const account of eligibleAccounts) {
        const apyToUse = account.customApyPercent !== null ? account.customApyPercent : bank.savingsApyPercent;
        if (!apyToUse || apyToUse <= 0) continue;

        let principal = account.balance;
        if (bank.interestMaxAccountBalance && principal > bank.interestMaxAccountBalance) {
          principal = bank.interestMaxAccountBalance;
        }

        // apyToUse is basis points. 300 = 3% = 0.03.
        // amount = principal * (apyToUse / 10000) / divisor
        const interestEarned = Math.floor(principal * (apyToUse / 10000) / divisor);
        
        if (interestEarned > 0) {
          await db.update(bankAccounts)
            .set({ balance: account.balance + interestEarned })
            .where(eq(bankAccounts.id, account.id));

          await db.insert(transactions).values({
            id: uuidv4(),
            bankId: bank.id,
            toAccountId: account.id,
            fromAccountId: null,
            amount: interestEarned,
            type: "deposit",
            description: "Interest Payment (APY)",
            timestamp: new Date()
          });

          count++;
          totalAmount += interestEarned;
        }
      }

      await db.update(banks)
        .set({ lastInterestAccrualAt: new Date() })
        .where(eq(banks.id, bank.id));

      res.json({ count, totalAmount });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}
