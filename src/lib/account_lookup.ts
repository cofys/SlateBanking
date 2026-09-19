import { db } from "../db/index.js";
import { bankAccounts, banks, transactions } from "../db/schema.js";
import { eq, and, or, inArray, sql } from "drizzle-orm";

export type PayeeMatch = {
  id: string;
  accountName: string;
  bankId: string;
  bankName: string | null;
};

function normalize(raw: string): string {
  return String(raw || "").trim();
}

function isPayable(row: { isActive?: boolean | null; isFrozen?: boolean | null; isSystem?: boolean | null }): boolean {
  return !!row.isActive && !row.isFrozen && !row.isSystem;
}

async function bankName(bankId: string): Promise<string | null> {
  const row = await db.select({ name: banks.name }).from(banks).where(eq(banks.id, bankId)).get();
  return row?.name || null;
}

/**
 * Resolve a destination inside ONE bank.
 * Exact account id or exact in-game name only — no fuzzy search, no other banks.
 */
export async function resolvePayableAccount(raw: string, opts: {
  bankId: string;
  excludeId?: string;
}): Promise<{ account?: typeof bankAccounts.$inferSelect & { bankName?: string | null }; error?: string }> {
  const q = normalize(raw);
  if (!q) return { error: "Enter a destination account name." };
  if (!opts.bankId) return { error: "Bank required." };

  const exclude = opts.excludeId;

  const byId = await db.select().from(bankAccounts).where(
    and(eq(bankAccounts.id, q), eq(bankAccounts.bankId, opts.bankId))
  ).get();
  if (byId && byId.id !== exclude) {
    if (!isPayable(byId)) return { error: "Destination account is inactive or frozen." };
    return { account: { ...byId, bankName: await bankName(byId.bankId) } };
  }

  const lower = q.toLowerCase();
  const named = await db.select().from(bankAccounts).where(
    and(eq(bankAccounts.bankId, opts.bankId), sql`lower(${bankAccounts.accountName}) = ${lower}`)
  );
  const hits = named.filter((a) => a.id !== exclude && isPayable(a));
  if (hits.length === 1) {
    return { account: { ...hits[0], bankName: await bankName(hits[0].bankId) } };
  }
  if (hits.length > 1) {
    return { error: "More than one account has that name at this bank. Ask them for the exact name." };
  }
  return { error: "No account with that name at this bank." };
}

/** Prior counterparties at this bank — people this customer has already sent to or received from. */
export async function suggestPayees(opts: {
  bankId: string;
  ownerAccountIds: string[];
  q?: string;
  limit?: number;
}): Promise<PayeeMatch[]> {
  if (!opts.bankId || !opts.ownerAccountIds.length) return [];
  const mine = opts.ownerAccountIds;

  const txs = await db.select({
    fromAccountId: transactions.fromAccountId,
    toAccountId: transactions.toAccountId,
  }).from(transactions).where(
    and(
      eq(transactions.bankId, opts.bankId),
      or(inArray(transactions.fromAccountId, mine), inArray(transactions.toAccountId, mine))
    )
  );

  const otherIds = new Set<string>();
  for (const t of txs) {
    if (t.fromAccountId && !mine.includes(t.fromAccountId)) otherIds.add(t.fromAccountId);
    if (t.toAccountId && !mine.includes(t.toAccountId)) otherIds.add(t.toAccountId);
  }
  if (otherIds.size === 0) return [];

  const rows = await db.select().from(bankAccounts).where(
    and(eq(bankAccounts.bankId, opts.bankId), inArray(bankAccounts.id, Array.from(otherIds)))
  );
  let hits = rows.filter(isPayable);
  const q = normalize(opts.q || "").toLowerCase();
  if (q) hits = hits.filter((a) => a.accountName.toLowerCase().includes(q));

  const name = await bankName(opts.bankId);
  return hits.slice(0, opts.limit || 8).map((h) => ({
    id: h.id,
    accountName: h.accountName,
    bankId: h.bankId,
    bankName: name,
  }));
}
