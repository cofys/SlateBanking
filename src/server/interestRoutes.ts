import express from "express";
import { requireAuth, requireBankStaff } from "./middleware.js";
import { db } from "../db/index.js";
import { banks, bankAccounts, transactions, bankSettings } from "../db/schema.js";
import { eq, and, lte, or, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";


async function calculateADB(accountId: string, currentBalance: number, periodDays: number, bankId: string): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    
    const txs = await db.select().from(transactions).where(and(
        or(eq(transactions.toAccountId, accountId), eq(transactions.fromAccountId, accountId)),
        eq(transactions.bankId, bankId)
    )).all();
    
    const periodTxs = txs.filter(t => t.timestamp >= cutoff).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    let runningBalance = currentBalance;
    let lastTime = Date.now();
    let totalBalanceMs = 0;
    
    for (const tx of periodTxs) {
        const txTime = tx.timestamp.getTime();
        totalBalanceMs += runningBalance * (lastTime - txTime);
        lastTime = txTime;
        
        if (tx.toAccountId === accountId) {
            runningBalance -= tx.amount;
        }
        if (tx.fromAccountId === accountId) {
            runningBalance += tx.amount;
        }
    }
    
    totalBalanceMs += runningBalance * (lastTime - cutoff.getTime());
    
    const adb = totalBalanceMs / (periodDays * 24 * 60 * 60 * 1000);
    return Math.max(0, Math.floor(adb));
}

export function registerInterestRoutes(app: express.Express) {
  app.get("/api/banks/:bankId/interest-settings", requireBankStaff, async (req, res) => {
    const { bankId } = req.params;
    try {
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      
      res.json({
        savingsApyPercent: settings?.savingsApyPercent,
        interestPaymentSchedule: settings?.interestPaymentSchedule,
        interestNextPaymentAt: settings?.interestNextPaymentAt,
        interestTargetAccounts: settings?.interestTargetAccounts,
        interestMinBalance: settings?.interestMinBalance,
        interestMaxAccountBalance: settings?.interestMaxAccountBalance,
        interestRequiresActivityDays: settings?.interestRequiresActivityDays,
        interestMinAccountAgeDays: settings?.interestMinAccountAgeDays,
        interestCalculationMethod: settings?.interestCalculationMethod,
        lastInterestAccrualAt: settings?.lastInterestAccrualAt
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
      interestRequiresActivityDays,
      interestMinAccountAgeDays,
      interestCalculationMethod
    } = req.body;

    try {
      const staffRole = (req as any).staffRole;
      if (staffRole !== "admin" && staffRole !== "manager") {
         return res.status(403).json({ error: "Only Managers and Admins can configure interest settings." });
      }

      const currentSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      let nextPaymentAt = currentSettings?.interestNextPaymentAt;
      if (interestPaymentSchedule !== "manual" && currentSettings?.interestPaymentSchedule !== interestPaymentSchedule) {
          nextPaymentAt = new Date();
          if (interestPaymentSchedule === "daily") nextPaymentAt.setDate(nextPaymentAt.getDate() + 1);
          else if (interestPaymentSchedule === "weekly") nextPaymentAt.setDate(nextPaymentAt.getDate() + 7);
          else if (interestPaymentSchedule === "monthly") nextPaymentAt.setMonth(nextPaymentAt.getMonth() + 1);
      }

      await db.update(bankSettings).set({
          savingsApyPercent,
          interestPaymentSchedule,
          interestNextPaymentAt: nextPaymentAt,
          interestTargetAccounts,
          interestMinBalance,
          interestMaxAccountBalance,
          interestRequiresActivityDays,
          interestMinAccountAgeDays,
          interestCalculationMethod
        }).where(eq(bankSettings.bankId, bankId));

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
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();

      // Let's get all active accounts for this bank
      const accounts = await db.select().from(bankAccounts)
        .where(and(
          eq(bankAccounts.bankId, bankId),
          eq(bankAccounts.isActive, true),
          eq(bankAccounts.isSystem, false)
        )).all();

      let eligibleAccounts = accounts;
      
      // Allow bank staff to decide which account types get interest
      if (settings?.interestTargetAccounts === "savings_only") {
        eligibleAccounts = eligibleAccounts.filter(a => (a.accountType || "").includes("savings") || a.accountName.toLowerCase().includes("saving"));
      } else if (settings?.interestTargetAccounts === "personal_only") {
        eligibleAccounts = eligibleAccounts.filter(a => (a.accountType || "").includes("personal"));
      } else if (settings?.interestTargetAccounts === "business_only") {
        eligibleAccounts = eligibleAccounts.filter(a => (a.accountType || "").includes("business"));
      }

      if (settings?.interestMinBalance && settings.interestMinBalance > 0) {
        eligibleAccounts = eligibleAccounts.filter(a => a.balance >= (settings.interestMinBalance || 0));
      }

      if (settings?.interestRequiresActivityDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - settings.interestRequiresActivityDays);
        eligibleAccounts = eligibleAccounts.filter(a => {
           if (!a.lastSyncedAt) return false;
           return new Date(a.lastSyncedAt) >= cutoff;
        });
      }
      
      if (settings?.interestMinAccountAgeDays) {
        const cutoffAge = new Date();
        cutoffAge.setDate(cutoffAge.getDate() - settings.interestMinAccountAgeDays);
        eligibleAccounts = eligibleAccounts.filter(a => {
           return new Date(a.createdAt) <= cutoffAge;
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
      if (settings?.interestPaymentSchedule === "daily") divisor = 365;
      if (settings?.interestPaymentSchedule === "weekly") divisor = 52;
      
      // Process in a transaction? SQLite can handle it.
      
      for (const account of eligibleAccounts) {
        let tierApy = null;
        if (settings && settings.enableAccountTiers && account.tierId && settings.accountTiers) {
          const t = (settings.accountTiers as any[]).find((x:any) => x.id === account.tierId);
          if (t && t.apyPercent !== null) tierApy = t.apyPercent;
        }

        const apyToUse = account.customApyPercent !== null ? account.customApyPercent : (tierApy !== null ? tierApy : settings?.savingsApyPercent);
        if (!apyToUse || apyToUse <= 0) continue;

        let periodDays = 30;
        if (settings?.interestPaymentSchedule === "daily") periodDays = 1;
        if (settings?.interestPaymentSchedule === "weekly") periodDays = 7;
        
        let principal = account.balance;
        if (settings?.interestCalculationMethod === "average_daily_balance") {
            principal = await calculateADB(account.id, account.balance, periodDays, bank.id);
        }
        
        if (settings?.interestMaxAccountBalance && principal > settings.interestMaxAccountBalance) {
          principal = settings.interestMaxAccountBalance;
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

      await db.update(bankSettings).set({ lastInterestAccrualAt: new Date() }).where(eq(bankSettings.bankId, bank.id));

      res.json({ count, totalAmount });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });
}
