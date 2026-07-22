import { db } from "../db/index";
import { banks, bankAccounts, bankSettings, loans, payrollJobs, subscriptions, recurringTransfers, transactions } from "../db/schema";
import { eq, and, lte, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { dispatchDiscordWebhook } from "./webhook_dispatcher";

export async function processYieldsAndAutomations() {
  console.log("[YieldEngine] Starting automated yield distribution & background jobs...");

  try {
    // --- 1. SAVINGS & YIELD APY PAYOUTS ---
    const allBanks = await db.select().from(banks);
    for (const bank of allBanks) {
      if (bank.maintenanceMode) continue;

      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bank.id)).get();
      const apyBasisPoints = settings?.savingsApyPercent || 300; // 3.00% default
      if (apyBasisPoints <= 0) continue;

      // Yield for non-zero active customer accounts
      const activeAccounts = await db
        .select()
        .from(bankAccounts)
        .where(and(
          eq(bankAccounts.bankId, bank.id),
          eq(bankAccounts.isActive, true),
          eq(bankAccounts.isSystem, false),
          gt(bankAccounts.balance, 0)
        ));

      let totalYieldPaidCents = 0;
      let countAccounts = 0;

      for (const acc of activeAccounts) {
        // Daily yield = Balance * (APY / 10000) / 365
        const dailyRate = (apyBasisPoints / 10000) / 365;
        const interestEarnedCents = Math.round(acc.balance * dailyRate);

        if (interestEarnedCents > 0) {
          const newBalance = acc.balance + interestEarnedCents;
          await db.update(bankAccounts).set({ balance: newBalance }).where(eq(bankAccounts.id, acc.id));

          await db.insert(transactions).values({
            id: uuidv4(),
            bankId: bank.id,
            fromAccountId: null,
            toAccountId: acc.id,
            amount: interestEarnedCents,
            type: "interest_payout",
            description: `Automated Yield APY Payout (${(apyBasisPoints / 100).toFixed(2)}% APY)`,
            timestamp: new Date()
          });

          totalYieldPaidCents += interestEarnedCents;
          countAccounts++;
        }
      }

      if (totalYieldPaidCents > 0) {
        dispatchDiscordWebhook(bank.id, "interest_yield", {
          title: "📈 Automated Interest & Yields Distributed",
          description: `**${bank.name}** processed daily APY savings distributions.`,
          color: 0x10b981,
          fields: [
            { name: "Total Yield Dispersed", value: `$${(totalYieldPaidCents / 100).toFixed(2)}`, inline: true },
            { name: "Accounts Credited", value: `${countAccounts}`, inline: true },
            { name: "APY Rate", value: `${(apyBasisPoints / 100).toFixed(2)}%`, inline: true }
          ]
        });
      }
    }

    // --- 2. AUTOMATED LOAN INTEREST CHARGES ---
    const activeLoans = await db.select().from(loans).where(and(eq(loans.status, "active"), gt(loans.remainingAmount, 0)));
    const now = new Date();

    for (const loan of activeLoans) {
      if (loan.nextPaymentDate && new Date(loan.nextPaymentDate) <= now) {
        // Monthly Interest Charge = Remaining * (interestRate / 10000)
        const interestFeeCents = Math.round(loan.remainingAmount * (loan.interestRate / 10000));
        const newRemaining = loan.remainingAmount + interestFeeCents;
        const nextDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

        await db.update(loans).set({
          remainingAmount: newRemaining,
          nextPaymentDate: nextDate
        }).where(eq(loans.id, loan.id));

        dispatchDiscordWebhook(loan.bankId, "loan_interest_accrual", {
          title: "🏦 Loan Interest Compounded",
          description: `Loan ID \`${loan.id.substring(0, 8)}\` interest charge applied.`,
          color: 0xf59e0b,
          fields: [
            { name: "Interest Added", value: `$${(interestFeeCents / 100).toFixed(2)}`, inline: true },
            { name: "New Total Balance", value: `$${(newRemaining / 100).toFixed(2)}`, inline: true },
            { name: "Next Due Date", value: nextDate.toLocaleDateString(), inline: true }
          ]
        });
      }
    }

    // --- 3. AUTOMATED PAYROLL JOBS ---
    const duePayrolls = await db.select().from(payrollJobs).where(and(eq(payrollJobs.isActive, true), lte(payrollJobs.nextRun, now)));
    for (const job of duePayrolls) {
      const employerAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employerAccountId)).get();
      const employeeAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employeeAccountId)).get();

      if (employerAcc && employeeAcc && employerAcc.balance >= job.amount) {
        await db.update(bankAccounts).set({ balance: employerAcc.balance - job.amount }).where(eq(bankAccounts.id, employerAcc.id));
        await db.update(bankAccounts).set({ balance: employeeAcc.balance + job.amount }).where(eq(bankAccounts.id, employeeAcc.id));

        let nextRun = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // default biweekly
        if (job.frequency === 'weekly') nextRun = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        else if (job.frequency === 'monthly') nextRun = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        await db.update(payrollJobs).set({ nextRun }).where(eq(payrollJobs.id, job.id));

        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: job.bankId,
          fromAccountId: job.employerAccountId,
          toAccountId: job.employeeAccountId,
          amount: job.amount,
          type: "transfer",
          description: `Automated Payroll Payment (${job.frequency})`,
          timestamp: now
        });

        dispatchDiscordWebhook(job.bankId, "payroll_executed", {
          title: "💼 Automated Payroll Executed",
          description: `Direct deposit paid to **${employeeAcc.accountName}**.`,
          color: 0x3b82f6,
          fields: [
            { name: "Amount", value: `$${(job.amount / 100).toFixed(2)}`, inline: true },
            { name: "Employer", value: employerAcc.accountName, inline: true }
          ]
        });
      }
    }

    console.log("[YieldEngine] Automated yield and background jobs completed successfully.");
  } catch (e) {
    console.error("[YieldEngine] Error in yield processor:", e);
  }
}
