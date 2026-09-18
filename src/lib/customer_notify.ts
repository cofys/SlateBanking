import { EmbedBuilder } from "discord.js";
import { db } from "../db/index.js";
import { banks, bankSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { botManager } from "./bot_manager.js";

function parseBrandColor(raw: string | null | undefined): number {
  const hex = String(raw || "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  return 0x4f46e5;
}

function money(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function loadBankCard(bankId: string) {
  const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  return { bank, settings };
}

export async function sendCustomerDm(opts: {
  bankId: string;
  discordId: string | null | undefined;
  title: string;
  body: string;
  color?: number;
}): Promise<void> {
  const discordId = String(opts.discordId || "").trim();
  if (!discordId || !/^\d{5,22}$/.test(discordId)) return;

  try {
    const { bank, settings } = await loadBankCard(opts.bankId);
    if (!bank) return;
    if (settings && settings.discordNotifyCustomers === false) return;

    const instance = botManager.getInstance(opts.bankId);
    if (!instance || instance.status !== "online") return;

    const color = opts.color ?? parseBrandColor(bank.brandingColor);
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(opts.title)
      .setDescription(opts.body)
      .setFooter({ text: settings?.discordFooter?.trim() || bank.name });
    if (bank.logoUrl || settings?.logoUrl) {
      embed.setThumbnail(bank.logoUrl || settings?.logoUrl || null);
    }

    const user = await instance.client.users.fetch(discordId).catch(() => null);
    if (!user) return;
    await user.send({ embeds: [embed] }).catch(() => {
      // User has DMs closed — silent. Staff channel still gets operational pings separately.
    });
  } catch (e) {
    console.error("[customer_notify] DM failed", e);
  }
}

export async function notifyTransferReceived(opts: {
  bankId: string;
  destOwnerDiscordId?: string | null;
  destAccountName: string;
  receivedCents: number;
  fromLabel?: string;
}) {
  if (!opts.destOwnerDiscordId) return;
  await sendCustomerDm({
    bankId: opts.bankId,
    discordId: opts.destOwnerDiscordId,
    title: "Incoming transfer",
    body: `**${money(opts.receivedCents)}** landed in **${opts.destAccountName}**${opts.fromLabel ? ` from ${opts.fromLabel}` : ""}.`,
  });
}

export async function notifyLoanEvent(opts: {
  bankId: string;
  discordId?: string | null;
  kind: "applied" | "approved" | "denied" | "disbursed" | "paid" | "failed" | "due" | "defaulted" | "delinquent";
  loanId: string;
  amountCents?: number;
  extra?: string;
}) {
  const titles: Record<typeof opts.kind, string> = {
    applied: "Loan application received",
    approved: "Loan approved",
    denied: "Loan application declined",
    disbursed: "Loan funds deposited",
    paid: "Loan payment posted",
    failed: "Loan auto-debit failed",
    due: "Loan payment coming up",
    defaulted: "Loan defaulted",
    delinquent: "Loan past due",
  };
  const short = opts.loanId.substring(0, 8);
  const amt = opts.amountCents != null ? money(opts.amountCents) : "";
  const lines = [
    `Loan **#${short}**`,
    amt ? `Amount: **${amt}**` : "",
    opts.extra || "",
  ].filter(Boolean);
  await sendCustomerDm({
    bankId: opts.bankId,
    discordId: opts.discordId,
    title: titles[opts.kind],
    body: lines.join("\n"),
  });
}

export async function notifyCardLocked(opts: {
  bankId: string;
  discordId?: string | null;
  last4?: string;
  locked: boolean;
}) {
  await sendCustomerDm({
    bankId: opts.bankId,
    discordId: opts.discordId,
    title: opts.locked ? "Card locked" : "Card unlocked",
    body: opts.last4
      ? `Card ending in **${opts.last4}** is now ${opts.locked ? "locked" : "active"}.`
      : `Your card is now ${opts.locked ? "locked" : "active"}.`,
  });
}
