import { db } from "../db/index.js";
import { bankAccounts, banks, transactions } from "../db/schema.js";
import { eq, and, or, inArray, sql, isNull } from "drizzle-orm";

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

/**
 * Ultra-flexible counterparty lookup for transfers and escrow agreements.
 * Matches by:
 * - Exact Account ID
 * - Account Name (case-insensitive, with or without common prefixes like ACC-, CORP-, SAV-)
 * - Owner Discord ID / Mention / Handle
 * - Owner Minecraft Username / UUID
 * - Authorized Account Members / Operators
 * - Registered Bank Customer identities
 */
export async function resolveEscrowCounterpartyAccount(
  rawQuery: string,
  opts: {
    bankId: string;
    excludeAccountId?: string;
  }
): Promise<{ account?: typeof bankAccounts.$inferSelect & { bankName?: string | null }; error?: string }> {
  let q = normalize(rawQuery);
  if (!q) return { error: "Enter a recipient account name, ID, or user handle." };
  if (q.startsWith("@")) q = q.slice(1).trim();
  if (!opts.bankId) return { error: "Bank ID required." };

  const exclude = opts.excludeAccountId;
  const { bankCustomers, accountMembers } = await import("../db/schema.js");

  // Fetch all candidate accounts at this bank
  const allAccounts = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, opts.bankId),
      or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
    )
  ).all();

  const activeCandidates = allAccounts.filter(a => a.isActive !== false && !a.isFrozen && a.id !== exclude);
  const qLower = q.toLowerCase();

  // 1. Direct Account ID match
  let matched = activeCandidates.find(a => a.id.toLowerCase() === qLower);
  if (matched) return { account: { ...matched, bankName: await bankName(matched.bankId) } };

  // 2. Exact Account Name match
  matched = activeCandidates.find(a => a.accountName.toLowerCase() === qLower);
  if (matched) return { account: { ...matched, bankName: await bankName(matched.bankId) } };

  // 3. Prefix-normalized Account Name match (e.g. "steve" matches "ACC-steve", or "CORP-steve" matches "steve")
  matched = activeCandidates.find(a => {
    const accLower = a.accountName.toLowerCase();
    const strippedAcc = accLower.replace(/^(acc|corp|sav|chk|checking|savings)-/i, "");
    const strippedQ = qLower.replace(/^(acc|corp|sav|chk|checking|savings)-/i, "");
    return accLower === strippedQ || strippedAcc === qLower || strippedAcc === strippedQ;
  });
  if (matched) return { account: { ...matched, bankName: await bankName(matched.bankId) } };

  // 4. Owner Discord ID
  matched = activeCandidates.find(a =>
    a.ownerDiscordId && (a.ownerDiscordId.toLowerCase() === qLower || a.ownerDiscordId === q)
  );
  if (matched) return { account: { ...matched, bankName: await bankName(matched.bankId) } };

  // 5. Account Members (operators / signers)
  const memberMatches = await db.select().from(accountMembers).where(
    or(
      eq(accountMembers.discordId, q),
      sql`lower(${accountMembers.discordId}) = ${qLower}`,
      eq(accountMembers.mcUsername, q),
      sql`lower(${accountMembers.mcUsername}) = ${qLower}`,
      eq(accountMembers.mcUuid, q)
    )
  ).all();

  if (memberMatches.length > 0) {
    const matchingAccIds = memberMatches.map(m => m.accountId);
    matched = activeCandidates.find(a => matchingAccIds.includes(a.id));
    if (matched) return { account: { ...matched, bankName: await bankName(matched.bankId) } };
  }

  // 6. Registered Bank Customers table
  const customerMatches = await db.select().from(bankCustomers).where(
    and(
      eq(bankCustomers.bankId, opts.bankId),
      or(
        eq(bankCustomers.discordId, q),
        sql`lower(${bankCustomers.discordId}) = ${qLower}`,
        eq(bankCustomers.mcUsername, q),
        sql`lower(${bankCustomers.mcUsername}) = ${qLower}`,
        sql`lower(${bankCustomers.rpName}) = ${qLower}`
      )
    )
  ).all();

  if (customerMatches.length > 0) {
    const customerDiscordIds = customerMatches.map(c => c.discordId).filter(Boolean);
    const linkedDiscordIds = customerMatches.map(c => c.linkedDiscordId).filter(Boolean) as string[];
    const allMatchIds = [...customerDiscordIds, ...linkedDiscordIds];
    matched = activeCandidates.find(a =>
      a.ownerDiscordId && allMatchIds.includes(a.ownerDiscordId)
    );
    if (matched) return { account: { ...matched, bankName: await bankName(matched.bankId) } };
  }

  // 7. Partial match (if unique)
  const partials = activeCandidates.filter(a => a.accountName.toLowerCase().includes(qLower));
  if (partials.length === 1) {
    return { account: { ...partials[0], bankName: await bankName(partials[0].bankId) } };
  }
  if (partials.length > 1) {
    return { error: `Multiple accounts match "${q}". Please enter the exact account name or ID.` };
  }

  return { error: `Could not find recipient account or user matching "${rawQuery}" at this bank.` };
}

