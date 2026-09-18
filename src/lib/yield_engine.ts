import { db } from "../db/index";
import { banks, bankAccounts, bankSettings } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { dispatchDiscordWebhook } from "./webhook_dispatcher";

async function resolveInterestPool(bankId: string, poolName?: string | null) {
  const name = poolName?.trim();
  if (!name) return null;
  return await db.select().from(bankAccounts).where(
    and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.accountName, name))
  ).get() || await db.select().from(bankAccounts).where(
    and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.id, name))
  ).get() || null;
}

export async function processYieldsAndAutomations(targetBankId?: string) {
  console.log(`[YieldEngine] Starting automated yield distribution & background jobs${targetBankId ? ` for bank ${targetBankId}` : ""}...`);

  try {
    // --- SAVINGS APY PAYOUTS (CityCorp pool only; never mint) ---
    // Loan interest is owned by loan_processor.accrueLoanInterest — do not accrue here.
    const allBanks = targetBankId 
      ? await db.select().from(banks).where(eq(banks.id, targetBankId))
      : await db.select().from(banks);

    for (const bank of allBanks) {
      if (bank.maintenanceMode) continue;

      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bank.id)).get();
      const apyBasisPoints = settings?.savingsApyPercent || 300; // 3.00% default
      if (apyBasisPoints <= 0) continue;

      // Scheduled (daily/weekly/monthly) payouts are handled by the hourly cron engine.
      const schedule = settings?.interestPaymentSchedule;
      if (schedule && schedule !== "manual") continue;

      // At most one daily pass — this job runs every 15 minutes.
      const lastAccrual = settings?.lastInterestAccrualAt;
      if (lastAccrual && (Date.now() - new Date(lastAccrual).getTime()) < 24 * 60 * 60 * 1000) {
        continue;
      }

      let poolAcc = await resolveInterestPool(bank.id, settings?.interestPoolAccount);
      if (!poolAcc) {
        // No interest pool → skip/defer. Do not locally increment balances.
        continue;
      }

      const activeAccounts = await db
        .select()
        .from(bankAccounts)
        .where(and(
          eq(bankAccounts.bankId, bank.id),
          eq(bankAccounts.isActive, true),
          eq(bankAccounts.isSystem, false),
          gt(bankAccounts.balance, 0)
        ));

      const { executeSameBankBookTransfer } = await import("./citycorp_money");
      let totalYieldPaidCents = 0;
      let countAccounts = 0;

      for (const acc of activeAccounts) {
        if (acc.id === poolAcc.id) continue;

        const dailyRate = (apyBasisPoints / 10000) / 365;
        const interestEarnedCents = Math.round(acc.balance * dailyRate);
        if (interestEarnedCents <= 0) continue;
        if (poolAcc.balance < interestEarnedCents) continue;

        try {
          await executeSameBankBookTransfer({
            sourceAccount: poolAcc,
            destAccount: acc,
            desiredCents: interestEarnedCents,
            mode: "sender_covers",
            description: `Automated Yield APY Payout (${(apyBasisPoints / 100).toFixed(2)}% APY)`,
            type: "interest_payout",
            skipQuote: true,
          });
          poolAcc = { ...poolAcc, balance: poolAcc.balance - interestEarnedCents };
          totalYieldPaidCents += interestEarnedCents;
          countAccounts++;
        } catch (e) {
          console.error(`[YieldEngine] interest payout failed for account ${acc.id}:`, e);
        }
      }

      await db.update(bankSettings)
        .set({ lastInterestAccrualAt: new Date() })
        .where(eq(bankSettings.bankId, bank.id));

      if (totalYieldPaidCents > 0) {
        dispatchDiscordWebhook(bank.id, "interest_yield", {
          title: "📈 Automated Interest & Yields Distributed",
          description: `**${bank.name}** processed daily APY savings distributions from the interest pool.`,
          color: 0x10b981,
          fields: [
            { name: "Total Yield Dispersed", value: `$${(totalYieldPaidCents / 100).toFixed(2)}`, inline: true },
            { name: "Accounts Credited", value: `${countAccounts}`, inline: true },
            { name: "APY Rate", value: `${(apyBasisPoints / 100).toFixed(2)}%`, inline: true }
          ]
        });
      }
    }

    // Payroll and subscriptions are booked through CityCorp rails in cron.ts.
    // Do not print money here. Do not accrue loan interest here.

    console.log("[YieldEngine] Automated yield and background jobs completed successfully.");
  } catch (e) {
    console.error("[YieldEngine] Error in yield processor:", e);
  }
}
