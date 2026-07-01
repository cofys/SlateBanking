import { db } from "../db";
import { bankAccounts, payrollJobs, subscriptions, loans, transactions, banks } from "../db/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { CityCorpClient } from "./citycorp_api";

export function startCronJobs() {
  console.log("[Cron] Starting background automated pipelines...");
  
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
}
