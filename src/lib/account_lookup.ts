import { db } from "../db/index.js";
import { bankAccounts, banks } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

export type PayeeMatch = {
  id: string;
  accountName: string;
  bankId: string;
  bankName: string | null;
  ownerDiscordId: string | null;
};

function normalize(raw: string): string {
  return String(raw || "").trim();
}

async function withBankName(row: typeof bankAccounts.$inferSelect): Promise<PayeeMatch & typeof bankAccounts.$inferSelect> {
  const bank = await db.select({ name: banks.name }).from(banks).where(eq(banks.id, row.bankId)).get();
  return { ...row, bankName: bank?.name || null };
}

function isPayable(row: { isActive?: boolean | null; isFrozen?: boolean | null; isSystem?: boolean | null }): boolean {
  return !!row.isActive && !row.isFrozen && !row.isSystem;
}

/** Resolve a destination from UUID, short id, or in-game account name. */
export async function resolvePayableAccount(raw: string, opts?: {
  preferBankId?: string;
  excludeId?: string;
}): Promise<{ account?: typeof bankAccounts.$inferSelect & { bankName?: string | null }; error?: string; matches?: PayeeMatch[] }> {
  const q = normalize(raw);
  if (!q) return { error: "Enter a destination account name." };

  const exclude = opts?.excludeId;

  const byId = await db.select().from(bankAccounts).where(eq(bankAccounts.id, q)).get();
  if (byId && byId.id !== exclude) {
    if (!isPayable(byId)) return { error: "Destination account is inactive or frozen." };
    return { account: await withBankName(byId) };
  }

  const compact = q.replace(/-/g, "").toLowerCase();
  if (compact.length >= 8 && /^[a-z0-9_]+$/i.test(compact)) {
    const allIds = await db.select().from(bankAccounts);
    const shortHit = allIds.find((a) => a.id !== exclude && a.id.replace(/-/g, "").toLowerCase().endsWith(compact));
    if (shortHit) {
      if (!isPayable(shortHit)) return { error: "Destination account is inactive or frozen." };
      return { account: await withBankName(shortHit) };
    }
  }

  const lower = q.toLowerCase();
  const named = await db.select().from(bankAccounts).where(sql`lower(${bankAccounts.accountName}) = ${lower}`);
  let hits = named.filter((a) => a.id !== exclude && isPayable(a));

  if (hits.length === 0) {
    const fuzzy = await db.select().from(bankAccounts).where(sql`lower(${bankAccounts.accountName}) like ${"%" + lower + "%"}`);
    hits = fuzzy.filter((a) => a.id !== exclude && isPayable(a));
  }

  if (hits.length === 0) return { error: "Destination account not found. Use the in-game account name." };

  if (hits.length > 1 && opts?.preferBankId) {
    const sameBank = hits.filter((a) => a.bankId === opts.preferBankId);
    if (sameBank.length === 1) return { account: await withBankName(sameBank[0]) };
    if (sameBank.length > 1) hits = sameBank;
  }

  if (hits.length === 1) return { account: await withBankName(hits[0]) };

  const matches: PayeeMatch[] = [];
  for (const h of hits.slice(0, 8)) {
    const bank = await db.select({ name: banks.name }).from(banks).where(eq(banks.id, h.bankId)).get();
    matches.push({
      id: h.id,
      accountName: h.accountName,
      bankId: h.bankId,
      bankName: bank?.name || null,
      ownerDiscordId: h.ownerDiscordId,
    });
  }
  return {
    error: `Several accounts match “${q}”. Pick one.`,
    matches,
  };
}

export async function suggestPayees(raw: string, opts?: { preferBankId?: string; limit?: number }): Promise<PayeeMatch[]> {
  const q = normalize(raw);
  if (q.length < 2) return [];
  const lower = q.toLowerCase();
  const rows = await db.select().from(bankAccounts).where(sql`lower(${bankAccounts.accountName}) like ${"%" + lower + "%"}`);
  let hits = rows.filter(isPayable);
  if (opts?.preferBankId) {
    hits.sort((a, b) => Number(b.bankId === opts.preferBankId) - Number(a.bankId === opts.preferBankId));
  }
  const out: PayeeMatch[] = [];
  for (const h of hits.slice(0, opts?.limit || 8)) {
    const bank = await db.select({ name: banks.name }).from(banks).where(eq(banks.id, h.bankId)).get();
    out.push({
      id: h.id,
      accountName: h.accountName,
      bankId: h.bankId,
      bankName: bank?.name || null,
      ownerDiscordId: h.ownerDiscordId,
    });
  }
  return out;
}
