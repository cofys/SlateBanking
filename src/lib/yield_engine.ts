import { db } from "../db/index";
import { banks, bankAccounts, bankSettings, loans, transactions } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { dispatchDiscordWebhook } from "./webhook_dispatcher";

export async function processYieldsAndAutomations(targetBankId?: string) {
  console.log(`[YieldEngine] Starting automated yield distribution & background jobs${targetBankId ? ` for bank ${targetBankId}` : ""}...`);

  try {
    // --- 1. SAVINGS & YIELD APY PAYOUTS ---
    const allBanks = targetBankId 
      ? await db.select().from(banks).where(eq(banks.id, targetBankId))
      : await db.select().from(banks);

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
    const activeLoans = targetBankId
      ? await db.select().from(loans).where(and(eq(loans.status, "active"), gt(loans.remainingAmount, 0), eq(loans.bankId, targetBankId)))
      : await db.select().from(loans).where(and(eq(loans.status, "active"), gt(loans.remainingAmount, 0)));
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

    // Payroll and subscriptions are booked through CityCorp rails in cron.ts.
    // Do not print money here.

    console.log("[YieldEngine] Automated yield and background jobs completed successfully.");
  } catch (e) {
    console.error("[YieldEngine] Error in yield processor:", e);
  }
}
