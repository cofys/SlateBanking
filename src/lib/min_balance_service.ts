import { db } from "../db/index.js";
import { banks, bankSettings, bankAccounts, customerNotifications } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sendCustomerDm } from "./customer_notify.js";

/**
 * Derives the in-game CityCorp corporation name for a given bank.
 */
export function getBankCorpName(bank: any, settings?: any): string {
  const explicit = (bank?.cityCorpOrgName || settings?.cityCorpOrgName || "")?.trim();
  if (explicit) return explicit;

  if (bank?.name) {
    const rawName = String(bank.name).trim();

    // Check for parentheses acronym, e.g., "Vance & Hamilton (VH)"
    const matchParen = rawName.match(/\(([^)]+)\)/);
    if (matchParen && matchParen[1]?.trim()) {
      return matchParen[1].trim();
    }

    // Known canonical server banks: "Vance & Hamilton" -> "VH"
    const lower = rawName.toLowerCase();
    if (lower.includes("vance") && lower.includes("hamilton")) {
      return "VH";
    }

    // Default clean alphanumeric
    const clean = rawName.replace(/[^a-zA-Z0-9]/g, "");
    if (clean) return clean;
  }
  return "Bank";
}

/**
 * Builds the canonical Minecraft CityCorp slash command to deposit funds.
 */
export function getDepositCommand(bankCorpName: string, accountName: string, depositDollars: number): string {
  const cleanCorp = bankCorpName || "Bank";
  const cleanAccount = accountName || "account";
  const cleanDollars = Math.max(1, Math.ceil(depositDollars || 1));
  return `/c account deposit ${cleanCorp} ${cleanAccount} ${cleanDollars}`;
}

/**
 * Checks an account against its assigned tier minimum balance.
 * If the balance is below the required threshold, creates a notification
 * and optionally dispatches a Discord DM.
 */
export async function checkAndNotifyAccountMinBalance(
  accountId: string,
  options?: { isNewAccount?: boolean }
): Promise<{
  notified: boolean;
  isBelowMinBalance?: boolean;
  deficitCents?: number;
  minBalanceCents?: number;
  depositCommand?: string;
}> {
  try {
    const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
    if (!account || !account.isActive || account.isSystem) {
      return { notified: false, isBelowMinBalance: false };
    }

    const bank = await db.select().from(banks).where(eq(banks.id, account.bankId)).get();
    if (!bank) return { notified: false, isBelowMinBalance: false };

    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, account.bankId)).get();
    const rawTiers = Array.isArray(settings?.accountTiers) ? (settings.accountTiers as any[]) : [];

    const tier = rawTiers.find((t: any) => t.id === account.tierId) || rawTiers.find((t: any) => t.isDefault);
    const minBalance = tier?.minBalance ? Number(tier.minBalance) : 0;

    if (minBalance <= 0) {
      return { notified: false, isBelowMinBalance: false, minBalanceCents: 0 };
    }

    const currentBalance = account.balance || 0;
    const isBelowMin = currentBalance < minBalance;
    if (!isBelowMin) {
      return { notified: false, isBelowMinBalance: false, minBalanceCents: minBalance };
    }

    const deficitCents = minBalance - currentBalance;
    const depositDollars = Math.ceil(deficitCents / 100);
    const bankCorpName = getBankCorpName(bank, settings);
    const depositCommand = getDepositCommand(bankCorpName, account.accountName, depositDollars);

    // Deduping: Avoid spamming notifications if an unread or recent deficit notification already exists
    if (!options?.isNewAccount) {
      const existingNotif = await db.select()
        .from(customerNotifications)
        .where(
          and(
            eq(customerNotifications.bankId, account.bankId),
            eq(customerNotifications.discordId, account.ownerDiscordId),
            eq(customerNotifications.type, "min_balance_deficit")
          )
        )
        .orderBy(desc(customerNotifications.createdAt))
        .limit(1)
        .get();

      if (existingNotif) {
        const timeSince = Date.now() - new Date(existingNotif.createdAt).getTime();
        // Skip duplicate notification if created in the last 24 hours
        if (timeSince < 24 * 60 * 60 * 1000) {
          return {
            notified: false,
            isBelowMinBalance: true,
            deficitCents,
            minBalanceCents: minBalance,
            depositCommand,
          };
        }
      }
    }

    const now = new Date();
    const notifId = `notif_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const title = options?.isNewAccount ? "Initial Minimum Balance Required" : "Minimum Balance Deficit Alert";
    const message = options?.isNewAccount
      ? `Your account "${account.accountName}" has an initial minimum balance requirement of $${(minBalance / 100).toFixed(2)}. Run the following command in-game to deposit funds: ${depositCommand}`
      : `Account "${account.accountName}" has fallen below its required maintenance minimum balance of $${(minBalance / 100).toFixed(2)}. Deficit: $${(deficitCents / 100).toFixed(2)}. Deposit funds using: ${depositCommand}`;

    await db.insert(customerNotifications).values({
      id: notifId,
      bankId: account.bankId,
      discordId: account.ownerDiscordId,
      type: "min_balance_deficit",
      title,
      message,
      data: JSON.stringify({
        accountId: account.id,
        accountName: account.accountName,
        minBalance,
        balance: currentBalance,
        deficitCents,
        depositCommand,
      }),
      isRead: false,
      createdAt: now,
    });

    // Send customer Discord DM if enabled
    try {
      await sendCustomerDm({
        bankId: account.bankId,
        discordId: account.ownerDiscordId,
        title: `⚠️ ${title}`,
        body: `**Account:** \`${account.accountName}\`\n**Required Minimum:** **$${(minBalance / 100).toFixed(2)}**\n**Current Balance:** **$${(currentBalance / 100).toFixed(2)}**\n**Deficit:** **$${(deficitCents / 100).toFixed(2)}**\n\n**To resolve, execute in Minecraft:**\n\`${depositCommand}\``,
        color: 0xf59e0b,
      });
    } catch (e) {
      console.warn("[min_balance_service] Discord DM failed:", e);
    }

    return {
      notified: true,
      isBelowMinBalance: true,
      deficitCents,
      minBalanceCents: minBalance,
      depositCommand,
    };
  } catch (err) {
    console.error("[min_balance_service] Error checking account min balance:", err);
    return { notified: false, isBelowMinBalance: false };
  }
}

/**
 * Sweeps all active banks and accounts with tiers having minimum maintenance balance requirements.
 */
export async function runBankMinBalanceSweep(): Promise<{ sweptAccounts: number; notifiedCount: number }> {
  try {
    const allAccounts = await db.select({
      id: bankAccounts.id,
      bankId: bankAccounts.bankId,
      tierId: bankAccounts.tierId,
      balance: bankAccounts.balance,
      isActive: bankAccounts.isActive,
      isFrozen: bankAccounts.isFrozen,
      isSystem: bankAccounts.isSystem,
    })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.isActive, true), eq(bankAccounts.isFrozen, false), eq(bankAccounts.isSystem, false)));

    let notifiedCount = 0;
    for (const acc of allAccounts) {
      const res = await checkAndNotifyAccountMinBalance(acc.id);
      if (res.notified) notifiedCount++;
    }

    return { sweptAccounts: allAccounts.length, notifiedCount };
  } catch (err) {
    console.error("[min_balance_service] Error during sweep:", err);
    return { sweptAccounts: 0, notifiedCount: 0 };
  }
}
