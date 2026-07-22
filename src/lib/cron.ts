import cron from "node-cron";
import { db } from "../db";
import { bankAccounts, payrollJobs, subscriptions, loans, transactions, banks } from "../db/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { CityCorpClient } from "./citycorp_api";
import { processYieldsAndAutomations } from "./yield_engine";

export function startCronJobs() {
  console.log("[Cron] Starting background automated pipelines...");
  
  // Run yields processor every 15 minutes
  setInterval(async () => {
    try {
      await processYieldsAndAutomations();
    } catch (e) {
      console.error("[Cron] Yield engine error:", e);
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
         if (empAcc.balance >= job.amount) {
            await db.update(bankAccounts).set({ balance: empAcc.balance - job.amount }).where(eq(bankAccounts.id, job.employerAccountId));
            const eeAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employeeAccountId)))[0];
            await db.update(bankAccounts).set({ balance: eeAcc.balance + job.amount }).where(eq(bankAccounts.id, job.employeeAccountId));
            
            await db.insert(transactions).values({
               id: uuidv4(),
               bankId: job.bankId,
               fromAccountId: job.employerAccountId,
               toAccountId: job.employeeAccountId,
               amount: job.amount,
               type: 'transfer',
               description: 'Automated Payroll Transfer',
               timestamp: new Date()
            });

            let nextRun = new Date(job.nextRun);
            if (job.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
            else if (job.frequency === 'biweekly') nextRun.setDate(nextRun.getDate() + 14);
            else if (job.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

            await db.update(payrollJobs).set({ nextRun }).where(eq(payrollJobs.id, job.id));
         }
      }

      // Subscription Processing
      const dueSubs = await db.select().from(subscriptions).where(and(eq(subscriptions.isActive, true), lte(subscriptions.nextRun, now)));
      for (const sub of dueSubs) {
         const custAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.customerAccountId)))[0];
         if (custAcc.balance >= sub.amount) {
            await db.update(bankAccounts).set({ balance: custAcc.balance - sub.amount }).where(eq(bankAccounts.id, sub.customerAccountId));
            const bAcc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.billerAccountId)))[0];
            await db.update(bankAccounts).set({ balance: bAcc.balance + sub.amount }).where(eq(bankAccounts.id, sub.billerAccountId));
            
            await db.insert(transactions).values({
               id: uuidv4(),
               bankId: sub.bankId,
               fromAccountId: sub.customerAccountId,
               toAccountId: sub.billerAccountId,
               amount: sub.amount,
               type: 'transfer',
               description: sub.description || 'Automated Subscription Billing',
               timestamp: new Date()
            });

            let nextRun = new Date(sub.nextRun);
            if (sub.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
            else if (sub.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

            await db.update(subscriptions).set({ nextRun }).where(eq(subscriptions.id, sub.id));
         }
      }

      // Loan Processing (Automated collections)
      const dueLoans = await db.select().from(loans).where(and(eq(loans.status, 'active'), lte(loans.nextPaymentDate, now)));
      for (const loan of dueLoans) {
         const acc = (await db.select().from(bankAccounts).where(eq(bankAccounts.id, loan.accountId)))[0];
         
         const paymentAmt = Math.round(loan.principalAmount / 12) + Math.round((loan.principalAmount * (loan.interestRate / 100)) / 12);
         const chargeAmount = Math.min(acc.balance, Math.min(paymentAmt, loan.remainingAmount));

         if (chargeAmount > 0) {
            await db.update(bankAccounts).set({ balance: acc.balance - chargeAmount }).where(eq(bankAccounts.id, loan.accountId));
            const newRemaining = loan.remainingAmount - chargeAmount;
            
            await db.insert(transactions).values({
               id: uuidv4(),
               bankId: loan.bankId,
               fromAccountId: loan.accountId,
               toAccountId: null,
               amount: chargeAmount,
               type: 'transfer',
               description: 'Automated Loan Payment & Accrual',
               timestamp: new Date()
            });

            let nextRun = new Date(loan.nextPaymentDate);
            nextRun.setMonth(nextRun.getMonth() + 1);

            await db.update(loans).set({ 
              remainingAmount: newRemaining,
              nextPaymentDate: nextRun,
              status: newRemaining <= 0 ? 'paid' : 'active'
            }).where(eq(loans.id, loan.id));
         } else {
             // Failed to collect, push next payment date 1 logic or label as overdue
         }
      }

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

  // Automated Operations Engine (Cron)
  cron.schedule("0 0 * * *", async () => {
    console.log("Running Daily Automated Operations Engine...");
    const { db } = await import("../db/index");
    const { banks, loans, auditLogs } = await import("../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const allBanks = await db.select().from(banks);
      for (const bank of allBanks) {
        let notes = [];
        
        // 1. Process Loans (accrue interest)
        const openLoans = await db.select().from(loans).where(and(eq(loans.bankId, bank.id), eq(loans.status, 'active')));
        let loansAccrued = 0;
        for (const loan of openLoans) {
          if (loan.interestRate && loan.principalAmount) {
            const dailyInterest = Math.round((loan.principalAmount * (loan.interestRate / 100)) / 365);
            if (dailyInterest > 0) {
              await db.update(loans)
                .set({ remainingAmount: loan.remainingAmount + dailyInterest })
                .where(eq(loans.id, loan.id));
              loansAccrued++;
            }
          }
        }
        if (loansAccrued > 0) notes.push(`Accrued interest on ${loansAccrued} loans.`);

        if (notes.length > 0) {
          await db.insert(auditLogs).values({
             id: uuidv4(),
             bankId: bank.id,
             userDiscordId: 'SYSTEM',
             action: `daily_processing_cron`,
             details: `Automated Engine Executed. ${notes.join(' ')}`,
             timestamp: new Date()
          });
        }
      }
      console.log("Daily Automated Operations Engine completed.");
    } catch (e) {
      console.error("Failed automated operations engine run:", e);
    }
  });

  // Recurring Transfer Processor
setInterval(async () => {
  const { db } = await import("../db/index");
  const { recurringTransfers, bankAccounts, transactions, clearinghouseBalances, bankSettings } = await import("../db/schema");
  const { eq, and, lt } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const now = new Date();
    const due = await db.select().from(recurringTransfers).where(and(eq(recurringTransfers.isActive, true), lt(recurringTransfers.nextRunAt, now)));
    
    for (const rt of due) {
       // Process payment
       const source = await db.select().from(bankAccounts).where(eq(bankAccounts.id, rt.fromAccountId)).get();
       const target = await db.select().from(bankAccounts).where(eq(bankAccounts.id, rt.toAccountId)).get();
       
       if (source && target && source.balance >= rt.amount) {
          // Subtract from source
          await db.update(bankAccounts).set({ balance: source.balance - rt.amount }).where(eq(bankAccounts.id, source.id));
          // Add to target
          await db.update(bankAccounts).set({ balance: target.balance + rt.amount }).where(eq(bankAccounts.id, target.id));
          
          // Log transactions
          await db.insert(transactions).values([
            {
              id: uuidv4(),
              type: "transfer",
              bankId: source.bankId,
              fromAccountId: source.id,
              toAccountId: target.id,
              amount: rt.amount,
              description: rt.description + " (Auto)",
              timestamp: new Date()
            }
          ]);
       }
       
       // Calculate next run
       let nextRun = new Date(rt.nextRunAt);
       if (rt.frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
       else if (rt.frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
       else if (rt.frequency === "biweekly") nextRun.setDate(nextRun.getDate() + 14);
       else if (rt.frequency === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
       
       // If it's still in the past (e.g. system was off), catch up to future
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
