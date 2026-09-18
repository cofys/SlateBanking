import cron from "node-cron";
import { db } from "../db";
import { bankAccounts, payrollJobs, subscriptions, loans, transactions, banks } from "../db/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { CityCorpClient } from "./citycorp_api";
import { processYieldsAndAutomations } from "./yield_engine";
import { processDueLoanRepayments, processDueCreditRepayments, accrueLoanInterest, notifyUpcomingLoanPayments } from "../server/loan_processor";

export function startCronJobs() {
  console.log("[Cron] Starting background automated pipelines...");
  
  // Run loan processor & yields every 15 minutes
  setInterval(async () => {
    try {
      await processYieldsAndAutomations();
      await processDueLoanRepayments();
      await processDueCreditRepayments();
      await accrueLoanInterest();
      await notifyUpcomingLoanPayments();
      const { processDueNetSettlements } = await import("./net_settlement");
      await processDueNetSettlements();
    } catch (e) {
      console.error("[Cron] Loan/Yield processing error:", e);
    }
  }, 15 * 60 * 1000);
  
  // Run every 60 seconds
  setInterval(async () => {
    try {
      const now = new Date();
      // Payroll Processing
      const duePayroll = await db.select().from(payrollJobs).where(and(eq(payrollJobs.isActive, true), lte(payrollJobs.nextRun, now)));
      for (const job of duePayroll) {
         const empAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employerAccountId)))[0];
         const eeAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employeeAccountId)))[0];
         if (!empAcc || !eeAcc) continue;
         if (empAcc.balance < job.amount) continue;
         try {
            const { executeSameBankBookTransfer } = await import("./citycorp_money");
            if (empAcc.bankId === eeAcc.bankId) {
              await executeSameBankBookTransfer({
                sourceAccount: empAcc,
                destAccount: eeAcc,
                desiredCents: job.amount,
                mode: "sender_covers",
                description: "Automated Payroll Transfer",
              });
            } else {
              const { executeCrossBankSettledTransfer } = await import("./citycorp_money");
              await executeCrossBankSettledTransfer({
                sourceAccount: empAcc,
                destAccount: eeAcc,
                desiredCents: job.amount,
                mode: "sender_covers",
                description: "Automated Payroll Transfer",
              });
            }
         } catch (e) {
            console.error("[Cron] payroll failed", e);
            continue;
         }

            let nextRun = new Date(job.nextRun);
            if (job.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
            else if (job.frequency === 'biweekly') nextRun.setDate(nextRun.getDate() + 14);
            else if (job.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

            await db.update(payrollJobs).set({ nextRun }).where(eq(payrollJobs.id, job.id));
      }

      // Subscription Processing
      const dueSubs = await db.select().from(subscriptions).where(and(eq(subscriptions.isActive, true), lte(subscriptions.nextRun, now)));
      for (const sub of dueSubs) {
         const custAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.customerAccountId)))[0];
         const bAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.billerAccountId)))[0];
         if (!custAcc || !bAcc) continue;
         if (custAcc.balance < sub.amount) continue;
         try {
            const { executeSameBankBookTransfer, executeCrossBankSettledTransfer } = await import("./citycorp_money");
            if (custAcc.bankId === bAcc.bankId) {
              await executeSameBankBookTransfer({
                sourceAccount: custAcc,
                destAccount: bAcc,
                desiredCents: sub.amount,
                mode: "sender_covers",
                description: sub.description || "Automated Subscription Billing",
              });
            } else {
              await executeCrossBankSettledTransfer({
                sourceAccount: custAcc,
                destAccount: bAcc,
                desiredCents: sub.amount,
                mode: "sender_covers",
                description: sub.description || "Automated Subscription Billing",
              });
            }
         } catch (e) {
            console.error("[Cron] subscription failed", e);
            continue;
         }

            let nextRun = new Date(sub.nextRun);
            if (sub.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
            else if (sub.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

            await db.update(subscriptions).set({ nextRun }).where(eq(subscriptions.id, sub.id));
      }

      // Loan Processing is handled by processDueLoanRepayments() in loan_processor.ts

    } catch (e) {
      console.error("[Cron] Error processing jobs:", e);
    }
  }, 60 * 1000); 

  // CityCorp Periodic Ping (Every 5 minutes, checking status of the first configured bank)
  setInterval(async () => {
    try {
      // Find one bank with configured CityCorp API
      const configuredBank = await db.select().from(banks).where(isNotNull(banks.corpId)).limit(1);
      if (configuredBank.length > 0) {
        const bank = configuredBank[0];
        if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
          const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
          // Just list accounts page 1 as a general ping
          await client.listAccounts(1);
        }
      }
    } catch (e) {
      console.error("[Cron] Error pinging CityCorp:", e);
    }
  }, 5 * 60 * 1000); // 5 minutes


  // Automated Interest Engine (Checks every hour)
  cron.schedule("0 * * * *", async () => {
    console.log("Running Automated Interest Engine...");
    const { db } = await import("../db/index");
    const { banks, bankAccounts, transactions, bankSettings, auditLogs } = await import("../db/schema");
    const { eq, and, lt } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    // We need the calculateADB function here as well
    async function calculateADB(accountId: string, currentBalance: number, periodDays: number, bankId: string): Promise<number> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - periodDays);
        const { or } = await import("drizzle-orm");
        
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

    try {
      const now = new Date();
      const allSettings = await db.select().from(bankSettings).where(
          and(lt(bankSettings.interestNextPaymentAt, now))
      );
      
      for (const settings of allSettings) {
         if (!settings.interestPaymentSchedule || settings.interestPaymentSchedule === "manual") continue;
         
         const bank = await db.select().from(banks).where(eq(banks.id, settings.bankId)).get();
         if (!bank) continue;

         const poolName = settings.interestPoolAccount?.trim();
         if (!poolName) continue; // do not mint; defer until an interest pool is configured
         let poolAcc = await db.select().from(bankAccounts).where(
           and(eq(bankAccounts.bankId, bank.id), eq(bankAccounts.accountName, poolName))
         ).get() || await db.select().from(bankAccounts).where(
           and(eq(bankAccounts.bankId, bank.id), eq(bankAccounts.id, poolName))
         ).get();
         if (!poolAcc) continue;
         
         let targetAccountTypes: string[] = [];
         const accounts = await db.select().from(bankAccounts)
           .where(and(
             eq(bankAccounts.bankId, bank.id),
             eq(bankAccounts.isActive, true),
             eq(bankAccounts.isSystem, false)
           )).all();
           
         let eligibleAccounts = accounts;
         if (settings.interestTargetAccounts === "savings_only") {
           eligibleAccounts = eligibleAccounts.filter(a => (a.accountType || "").includes("savings") || a.accountName.toLowerCase().includes("saving"));
         } else if (settings.interestTargetAccounts === "personal_only") {
           eligibleAccounts = eligibleAccounts.filter(a => (a.accountType || "").includes("personal"));
         } else if (settings.interestTargetAccounts === "business_only") {
           eligibleAccounts = eligibleAccounts.filter(a => (a.accountType || "").includes("business"));
         }
         
         if (settings.interestMinBalance && settings.interestMinBalance > 0) {
           eligibleAccounts = eligibleAccounts.filter(a => a.balance >= (settings.interestMinBalance || 0));
         }
         
         if (settings.interestRequiresActivityDays) {
           const cutoff = new Date();
           cutoff.setDate(cutoff.getDate() - settings.interestRequiresActivityDays);
           eligibleAccounts = eligibleAccounts.filter(a => {
              if (!a.lastSyncedAt) return false;
              return new Date(a.lastSyncedAt) >= cutoff;
           });
         }
         
         if (settings.interestMinAccountAgeDays) {
           const cutoffAge = new Date();
           cutoffAge.setDate(cutoffAge.getDate() - settings.interestMinAccountAgeDays);
           eligibleAccounts = eligibleAccounts.filter(a => {
              return new Date(a.createdAt) <= cutoffAge;
           });
         }
         
         let count = 0;
         let totalAmount = 0;
         
         let divisor = 12;
         let periodDays = 30;
         const daysInYear = settings.interestDaysInYear === 360 ? 360 : 365;
         if (settings.interestPaymentSchedule === "daily") { divisor = daysInYear; periodDays = 1; }
         if (settings.interestPaymentSchedule === "weekly") { divisor = daysInYear === 360 ? 72 : 52; periodDays = 7; }
         
         for (const account of eligibleAccounts) {
           let tierApy = null;
           if (settings.enableAccountTiers && account.tierId && settings.accountTiers) {
             const t = (settings.accountTiers as any[]).find((x:any) => x.id === account.tierId);
             if (t && t.apyPercent !== null) tierApy = t.apyPercent;
           }
           const apyToUse = account.customApyPercent !== null ? account.customApyPercent : (tierApy !== null ? tierApy : settings.savingsApyPercent);
           if (!apyToUse || apyToUse <= 0) continue;
           
           let principal = account.balance;
           if (settings.interestCalculationMethod === "average_daily_balance") {
               principal = await calculateADB(account.id, account.balance, periodDays, bank.id);
           }
           
           if (settings.interestMaxAccountBalance && principal > settings.interestMaxAccountBalance) {
             principal = settings.interestMaxAccountBalance;
           }
           
           const interestEarned = Math.floor(principal * (apyToUse / 10000) / divisor);
           
           if (interestEarned > 0) {
             if (poolAcc.id === account.id || poolAcc.balance < interestEarned) continue;
             try {
               const { executeSameBankBookTransfer } = await import("./citycorp_money");
               await executeSameBankBookTransfer({
                 sourceAccount: poolAcc,
                 destAccount: account,
                 desiredCents: interestEarned,
                 mode: "sender_covers",
                 description: "Interest Payment (APY)",
                 type: "interest_payout",
                 skipQuote: true,
               });
               poolAcc = { ...poolAcc, balance: poolAcc.balance - interestEarned };
             } catch (e) {
               console.error("[Cron] interest payout failed", e);
               continue;
             }
             count++;
             totalAmount += interestEarned;
           }
         }
         
         let nextRun = settings.interestNextPaymentAt ? new Date(settings.interestNextPaymentAt) : new Date();
         if (settings.interestPaymentSchedule === "daily") nextRun.setDate(nextRun.getDate() + 1);
         else if (settings.interestPaymentSchedule === "weekly") nextRun.setDate(nextRun.getDate() + 7);
         else if (settings.interestPaymentSchedule === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
         
         while (nextRun <= new Date()) {
           if (settings.interestPaymentSchedule === "daily") nextRun.setDate(nextRun.getDate() + 1);
           else if (settings.interestPaymentSchedule === "weekly") nextRun.setDate(nextRun.getDate() + 7);
           else if (settings.interestPaymentSchedule === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
         }
         
         await db.update(bankSettings).set({ 
            lastInterestAccrualAt: new Date(),
            interestNextPaymentAt: nextRun
         }).where(eq(bankSettings.bankId, bank.id));
         
         if (count > 0) {
             await db.insert(auditLogs).values({
                 id: uuidv4(),
                 bankId: bank.id,
                 userDiscordId: 'SYSTEM',
                 action: `interest_auto_disperse`,
                 details: `Auto-dispersed interest to ${count} accounts. Total: ${totalAmount}. Schedule: ${settings.interestPaymentSchedule}.`,
                 timestamp: new Date()
             });
         }
      }
    } catch (e) {
      console.error("Failed automated interest engine run:", e);
    }
  });

  // Daily loan interest is owned by accrueLoanInterest in loan_processor (15-min cron).
  // Do not run a leftover interestRate/100 printer here.

  // Recurring Transfer Processor
setInterval(async () => {
  const { db } = await import("../db/index");
  const { recurringTransfers, bankAccounts } = await import("../db/schema");
  const { eq, and, lt } = await import("drizzle-orm");

  try {
    const now = new Date();
    const due = await db.select().from(recurringTransfers).where(and(eq(recurringTransfers.isActive, true), lt(recurringTransfers.nextRunAt, now)));
    
    for (const rt of due) {
       const source = await db.select().from(bankAccounts).where(eq(bankAccounts.id, rt.fromAccountId)).get();
       const target = await db.select().from(bankAccounts).where(eq(bankAccounts.id, rt.toAccountId)).get();
       
       if (source && target && source.balance >= rt.amount) {
          try {
            const { executeBookTransfer } = await import("./citycorp_money");
            await executeBookTransfer({
              sourceAccount: source,
              destAccount: target,
              desiredCents: rt.amount,
              mode: "from_payment",
              description: (rt.description || "Recurring transfer") + " (Auto)",
              type: "transfer",
            });
          } catch (e) {
            console.error("[Cron] recurring transfer failed", e);
          }
       }
       
       // Calculate next run even if this cycle failed so we don't tight-loop a dead rail.
       let nextRun = new Date(rt.nextRunAt);
       if (rt.frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
       else if (rt.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
       else if (rt.frequency === "biweekly") nextRun.setDate(nextRun.getDate() + 14);
       else if (rt.frequency === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
       
       while (nextRun <= new Date()) {
         if (rt.frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
         else if (rt.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
         else if (rt.frequency === "biweekly") nextRun.setDate(nextRun.getDate() + 14);
         else if (rt.frequency === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
       }
       
       await db.update(recurringTransfers).set({ nextRunAt: nextRun }).where(eq(recurringTransfers.id, rt.id));
    }
  } catch(e) {
    console.error("Cron error:", e);
  }
}, 1000 * 60); // Check every minute


}
