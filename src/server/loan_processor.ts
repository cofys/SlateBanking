import { db } from "../db/index";
import { loans, bankAccounts, transactions, auditLogs, banks } from "../db/schema";
import { eq, and, lte, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { botManager } from "../lib/bot_manager";

/**
 * Process automated loan repayment debits, late fees, delinquency, and defaults.
 */
export async function processDueLoanRepayments(targetBankId?: string) {
  const now = new Date();
  
  // Find active or delinquent loans where nextPaymentDate is due
  let query = db.select()
    .from(loans)
    .where(
      and(
        inArray(loans.status, ["active", "approved", "delinquent"]),
        lte(loans.nextPaymentDate, now)
      )
    );

  const dueLoans = await query;
  if (dueLoans.length === 0) {
    return { processed: 0, debited: 0, defaulted: 0, lateFees: 0 };
  }

  let debitedCount = 0;
  let defaultedCount = 0;
  let lateFeesCount = 0;

  for (const loan of dueLoans) {
    if (targetBankId && loan.bankId !== targetBankId) continue;

    // Check borrower's linked account balance
    const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, loan.accountId)).get();

    // Monthly repayment installment calculation (e.g. principal / 12 or total remaining)
    const installment = Math.min(loan.remainingAmount, Math.max(100, Math.ceil(loan.principalAmount / 12)));

    if (account && account.balance >= installment) {
      // SUCCESSFUL AUTOMATED DEBIT
      const { getOrCreateBankCorpAccount } = await import("./feeService");
      const corpAcc = await getOrCreateBankCorpAccount(db, loan.bankId);

      const newAccountBalance = account.balance - installment;
      const newRemainingLoan = loan.remainingAmount - installment;
      const isPaidOff = newRemainingLoan <= 0;

      // Deduct from customer account
      await db.update(bankAccounts)
        .set({ balance: newAccountBalance })
        .where(eq(bankAccounts.id, account.id));

      // Credit Bank Corporate Revenue Account
      await db.update(bankAccounts)
        .set({ balance: sql`${bankAccounts.balance} + ${installment}` })
        .where(eq(bankAccounts.id, corpAcc.id));

      // Check for late fee settlement
      const currentLateFee = loan.lateFeeAmount || 0;
      const lateFeeSettled = Math.min(installment, currentLateFee);
      const newLateFeeAmount = Math.max(0, currentLateFee - lateFeeSettled);

      if (lateFeeSettled > 0) {
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: loan.bankId,
          fromAccountId: account.id,
          toAccountId: corpAcc.id,
          type: "fee",
          feeType: "late_fee",
          amount: lateFeeSettled,
          description: `Loan Late Fee Settlement (Loan #${loan.id.substring(0, 8)})`,
          category: "Fee Income",
          timestamp: now
        });
      }

      // Calculate next payment date (+30 days)
      const nextDate = new Date(loan.nextPaymentDate);
      nextDate.setDate(nextDate.getDate() + 30);

      // Update loan status
      await db.update(loans)
        .set({
          remainingAmount: isPaidOff ? 0 : newRemainingLoan,
          lateFeeAmount: newLateFeeAmount,
          status: isPaidOff ? "paid_off" : "active",
          isDelinquent: newLateFeeAmount > 0,
          missedPaymentsCount: newLateFeeAmount > 0 ? loan.missedPaymentsCount : 0,
          collateralStatus: isPaidOff ? (loan.collateralStatus === "pledged" ? "released" : loan.collateralStatus) : loan.collateralStatus,
          nextPaymentDate: isPaidOff ? loan.nextPaymentDate : nextDate,
          lastPaymentAttemptAt: now
        })
        .where(eq(loans.id, loan.id));

      // Insert transaction record into bank corporate ledger
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: loan.bankId,
        fromAccountId: account.id,
        toAccountId: corpAcc.id,
        type: "loan_payment",
        amount: installment,
        description: isPaidOff ? `Loan Final Repayment (Loan #${loan.id.substring(0, 8)})` : `Automated Monthly Loan Debit (Loan #${loan.id.substring(0, 8)})`,
        timestamp: now,
        category: "Loan Repayment"
      });

      // Insert audit log
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: loan.bankId,
        userDiscordId: loan.discordId,
        action: "loan_auto_debit_success",
        details: `Automated debit of $${(installment/100).toFixed(2)} successful for Loan #${loan.id.substring(0, 8)}. Remaining balance: $${(Math.max(0, newRemainingLoan)/100).toFixed(2)}`,
        timestamp: now
      });

      debitedCount++;

      botManager.sendNotification(
        loan.bankId,
        `💳 **Automated Loan Repayment**: Debited $${(installment/100).toFixed(2)} from account **${account.accountName}** (<@${loan.discordId}>) for Loan #${loan.id.substring(0, 8)}.${isPaidOff ? ' 🎉 **LOAN FULLY PAID OFF!**' : ''}`
      );
    } else {
      // INSUFFICIENT FUNDS -> DELINQUENCY, LATE FEES & DEFAULT HANDLING
      const missedCount = (loan.missedPaymentsCount || 0) + 1;
      // Fixed late fee penalty: $25.00 (2500 cents) or 5% of installment, whichever is greater
      const lateFee = Math.max(2500, Math.round(installment * 0.05));
      const updatedRemaining = loan.remainingAmount + lateFee;
      const updatedTotalLateFees = (loan.lateFeeAmount || 0) + lateFee;

      const isDefault = missedCount >= 3;
      const newStatus = isDefault ? "defaulted" : "delinquent";
      const newCollateralStatus = (isDefault && loan.collateralStatus === "pledged") ? "seized" : loan.collateralStatus;

      // Push next payment date by 7 days to attempt retry next week
      const nextAttemptDate = new Date();
      nextAttemptDate.setDate(nextAttemptDate.getDate() + 7);

      await db.update(loans)
        .set({
          remainingAmount: updatedRemaining,
          lateFeeAmount: updatedTotalLateFees,
          isDelinquent: true,
          missedPaymentsCount: missedCount,
          status: newStatus,
          collateralStatus: newCollateralStatus,
          nextPaymentDate: nextAttemptDate,
          lastPaymentAttemptAt: now
        })
        .where(eq(loans.id, loan.id));

      lateFeesCount++;
      if (isDefault) defaultedCount++;

      // Record audit log
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: loan.bankId,
        userDiscordId: loan.discordId,
        action: isDefault ? "loan_defaulted" : "loan_auto_debit_failed",
        details: `Auto debit failed for Loan #${loan.id.substring(0, 8)} (Account balance: $${((account?.balance || 0)/100).toFixed(2)} < installment $${(installment/100).toFixed(2)}). Missed count: ${missedCount}. Late fee assessed: $${(lateFee/100).toFixed(2)}.${isDefault ? ' LOAN MARKED AS DEFAULTED. Collateral status: SEIZED.' : ''}`,
        timestamp: now
      });

      botManager.sendNotification(
        loan.bankId,
        isDefault
          ? `🚨 **LOAN DEFAULT NOTICE**: Loan #${loan.id.substring(0, 8)} (<@${loan.discordId}>) has DEFAULTED after ${missedCount} missed payments! Late fee $${(lateFee/100).toFixed(2)} added. Collateral status updated to **SEIZED**.`
          : `⚠️ **Loan Repayment Failed**: Automated debit of $${(installment/100).toFixed(2)} failed for Loan #${loan.id.substring(0, 8)} (<@${loan.discordId}>). Late fee penalty of $${(lateFee/100).toFixed(2)} added. Loan is now **DELINQUENT**.`
      );
    }
  }

  return { processed: dueLoans.length, debited: debitedCount, defaulted: defaultedCount, lateFees: lateFeesCount };
}

/**
 * Accrue and compound daily loan interest on active or delinquent loans.
 */
export async function accrueLoanInterest(targetBankId?: string) {
  const now = new Date();

  // Find active or delinquent loans
  const activeLoans = await db.select()
    .from(loans)
    .where(inArray(loans.status, ["active", "approved", "delinquent"]));

  let accruedCount = 0;
  let totalInterestCents = 0;

  for (const loan of activeLoans) {
    if (targetBankId && loan.bankId !== targetBankId) continue;

    const lastAccrual = loan.lastInterestAccrualAt || loan.createdAt;
    const diffMs = now.getTime() - new Date(lastAccrual).getTime();
    const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (daysElapsed >= 1) {
      // APR is in basis points (e.g. 500 = 5.00% APR)
      const annualRate = loan.interestRate / 10000;
      const dailyInterest = Math.floor((loan.remainingAmount * annualRate * daysElapsed) / 365);

      if (dailyInterest > 0) {
        const newRemaining = loan.remainingAmount + dailyInterest;

        await db.update(loans)
          .set({
            remainingAmount: newRemaining,
            lastInterestAccrualAt: now
          })
          .where(eq(loans.id, loan.id));

        await db.insert(auditLogs).values({
          id: uuidv4(),
          bankId: loan.bankId,
          userDiscordId: loan.discordId,
          action: "loan_interest_accrued",
          details: `Accrued $${(dailyInterest/100).toFixed(2)} interest over ${daysElapsed} days at APR ${(loan.interestRate/100).toFixed(2)}% on Loan #${loan.id.substring(0, 8)}. New balance: $${(newRemaining/100).toFixed(2)}`,
          timestamp: now
        });

        accruedCount++;
        totalInterestCents += dailyInterest;
      }
    }
  }

  return { accruedLoans: accruedCount, totalInterestAccruedCents: totalInterestCents };
}

/**
 * Initialize background interval for automated loan management.
 * Runs loan processing every 30 minutes.
 */
let loanCronInterval: NodeJS.Timeout | null = null;

export function startLoanCron() {
  if (loanCronInterval) return;

  const runTasks = async () => {
    try {
      await processDueLoanRepayments();
      await accrueLoanInterest();
    } catch (err) {
      console.error("[Loan Cron Error]:", err);
    }
  };

  // Run initial check after 10 seconds
  setTimeout(runTasks, 10000);

  // Repeat every 30 minutes
  loanCronInterval = setInterval(runTasks, 30 * 60 * 1000);
}
