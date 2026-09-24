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
        lastInterestAccrualAt: settings?.lastInterestAccrualAt,
        interestPoolAccount: settings?.interestPoolAccount,
        interestDaysInYear: settings?.interestDaysInYear || 365,
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
      interestCalculationMethod,
      interestDaysInYear,
      interestPoolAccount
    } = req.body;

    try {
      const staffRole = String((req as any).staffRole || "").toLowerCase().trim();
      const isGlobal = Boolean((req as any).user?.isGlobalAdmin);
      if (!isGlobal && !["owner", "admin", "manager"].includes(staffRole)) {
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
          interestCalculationMethod,
          interestDaysInYear: interestDaysInYear === 360 ? 360 : 365,
          interestPoolAccount: interestPoolAccount || currentSettings?.interestPoolAccount,
        }).where(eq(bankSettings.bankId, bankId));

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
        lastInterestAccrualAt: settings?.lastInterestAccrualAt,
        interestPoolAccount: settings?.interestPoolAccount,
        interestDaysInYear: settings?.interestDaysInYear || 365,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/banks/:bankId/interest-run", requireBankStaff, async (req, res) => {
    const { bankId } = req.params;

    try {
      const staffRole = String((req as any).staffRole || "").toLowerCase().trim();
      const isGlobal = Boolean((req as any).user?.isGlobalAdmin);
      if (!isGlobal && !["owner", "admin", "manager"].includes(staffRole)) {
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

      if (!settings?.interestPoolAccount) {
        return res.status(400).json({ error: "Set an interest pool account before running APY payouts. Interest cannot be minted locally." });
      }

      let count = 0;
      let totalAmount = 0;
      
      let divisor = 12;
      const daysInYear = settings?.interestDaysInYear === 360 ? 360 : 365;
      if (settings?.interestPaymentSchedule === "daily") divisor = daysInYear;
      if (settings?.interestPaymentSchedule === "weekly") divisor = daysInYear === 360 ? 72 : 52;

      const { payFromInterestPool } = await import("../lib/citycorp_money");
      
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

        const interestEarned = Math.floor(principal * (apyToUse / 10000) / divisor);
        
        if (interestEarned > 0) {
          try {
            const paid = await payFromInterestPool({
              bankId: bank.id,
              toAccount: account,
              amountCents: interestEarned,
              description: "Interest Payment (APY)",
            });
            if (!paid) continue;
            count++;
            totalAmount += interestEarned;
          } catch (e) {
            console.error("[interest-run] payout failed", e);
          }
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
