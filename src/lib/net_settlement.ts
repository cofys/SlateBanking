import { eq, and, or, desc, gte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index";
import { banks, bankAccounts, bankSettings, clearinghouseBalances, clearinghouseSettlements, onyxSettings, transactions } from "../db/schema";
import {
  MoneyRailError,
  clientForBank,
  dollars,
  ensureNamedCityCorpAccount,
  isCityCorpOk,
  loadBank,
  loadSettings,
  refreshAccountCache,
  settlementAccountName,
} from "./citycorp_money";
import { botManager } from "./bot_manager";

function isCityCorpFail(res: any): boolean {
  return !isCityCorpOk(res);
}

async function reverseIou(debtorBankId: string, creditorBankId: string, amountCents: number) {
  const from = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, debtorBankId)).get();
  const to = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, creditorBankId)).get();
  const now = new Date();
  if (!from) {
    await db.insert(clearinghouseBalances).values({ bankId: debtorBankId, balance: amountCents, lastSettled: now });
  } else {
    await db.update(clearinghouseBalances).set({
      balance: (from.balance || 0) + amountCents,
      lastSettled: now,
    }).where(eq(clearinghouseBalances.bankId, debtorBankId));
  }
  if (!to) {
    await db.insert(clearinghouseBalances).values({ bankId: creditorBankId, balance: -amountCents, lastSettled: now });
  } else {
    await db.update(clearinghouseBalances).set({
      balance: (to.balance || 0) - amountCents,
      lastSettled: now,
    }).where(eq(clearinghouseBalances.bankId, creditorBankId));
  }
}

async function settlementRow(bankId: string) {
  const bank = await loadBank(bankId);
  const settings = await loadSettings(bankId);
  const name = settlementAccountName(settings);
  const acc = await ensureNamedCityCorpAccount({
    bank,
    settings,
    accountName: name,
    systemCategory: "clearinghouse",
  });
  return { bank, settings, name, acc };
}

export async function fundSettlementFromOwner(bankId: string, amountCents: number) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new MoneyRailError("Invalid amount.");
  const { bank, name, acc } = await settlementRow(bankId);
  const client = clientForBank(bank);
  if (!client) throw new MoneyRailError("This bank is not connected to CityCorp.");
  const res = await client.deposit(name, dollars(amountCents));
  if (isCityCorpFail(res)) {
    throw new MoneyRailError(`SETTLEMENT deposit failed: ${res?.message || res?.error || "unknown error"}`);
  }
  const live = await refreshAccountCache({ bankId, accountName: name, accountId: acc.id, client });
  if (live != null) {
    const row = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, bankId)).get();
    if (!row) await db.insert(clearinghouseBalances).values({ bankId, balance: 0, settlementCashCents: live });
    else await db.update(clearinghouseBalances).set({ settlementCashCents: live }).where(eq(clearinghouseBalances.bankId, bankId));
  }
  return { settlementCashCents: live };
}

export async function withdrawSettlementToOwner(bankId: string, amountCents: number) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new MoneyRailError("Invalid amount.");
  const { bank, settings, name, acc } = await settlementRow(bankId);
  const client = clientForBank(bank);
  if (!client) throw new MoneyRailError("This bank is not connected to CityCorp.");
  const live = await refreshAccountCache({ bankId, accountName: name, accountId: acc.id, client }) ?? acc.balance;
  const floor = settings?.settlementFloorCents || 0;
  if (live - amountCents < floor) {
    throw new MoneyRailError(
      `Release would leave SETTLEMENT below the payout floor (live $${dollars(live)}, floor $${dollars(floor)}).`
    );
  }
  const res = await client.withdraw(name, dollars(amountCents));
  if (isCityCorpFail(res)) {
    throw new MoneyRailError(`SETTLEMENT withdraw failed: ${res?.message || res?.error || "unknown error"}`);
  }
  const after = await refreshAccountCache({ bankId, accountName: name, accountId: acc.id, client });
  if (after != null) {
    await db.update(clearinghouseBalances).set({ settlementCashCents: after }).where(eq(clearinghouseBalances.bankId, bankId)).catch(() => {});
  }
  return { settlementCashCents: after };
}

/**
 * Try a cross-corp named-account book transfer first. CityCorp usually rejects this
 * (caller is not a subuser of the destination). Then fall back to owner-wallet:
 * debtor withdraws from SETTLEMENT, pays in-game, creditor deposits into SETTLEMENT.
 */
export async function executeNetSettlement(opts: {
  fromBankId: string;
  toBankId: string;
  amountCents: number;
  actorId?: string;
  runId?: string;
  note?: string;
  existingId?: string;
}): Promise<{ id: string; status: string; mode: "book" | "owner_wallet"; message: string }> {
  const amountCents = Math.round(opts.amountCents);
  if (amountCents <= 0) throw new MoneyRailError("Invalid settlement amount.");
  if (opts.fromBankId === opts.toBankId) throw new MoneyRailError("Cannot settle with the same bank.");

  const debtor = await settlementRow(opts.fromBankId);
  const creditor = await settlementRow(opts.toBankId);
  const debtorClient = clientForBank(debtor.bank);
  if (!debtorClient) throw new MoneyRailError("Debtor bank is not connected to CityCorp.");

  const live = await refreshAccountCache({
    bankId: debtor.bank.id,
    accountName: debtor.name,
    accountId: debtor.acc.id,
    client: debtorClient,
  }) ?? debtor.acc.balance;
  const floor = debtor.settings?.settlementFloorCents || 0;
  if (live - amountCents < floor) {
    throw new MoneyRailError(
      `Debtor SETTLEMENT is below the amount + floor (need $${dollars(amountCents + floor)}, have $${dollars(live)}). Fund SETTLEMENT first.`
    );
  }

  let rowId = opts.existingId;
  if (!rowId) {
    rowId = uuidv4();
    await db.insert(clearinghouseSettlements).values({
      id: rowId,
      fromBankId: opts.fromBankId,
      toBankId: opts.toBankId,
      amount: amountCents,
      status: "pending",
      runId: opts.runId || null,
      note: opts.note || null,
      createdAt: new Date(),
    });
  }

  const book = await debtorClient.transferToAccount(
    debtor.name,
    dollars(amountCents),
    creditor.bank.corpId!,
    creditor.name
  );
  if (isCityCorpOk(book)) {
    await refreshAccountCache({ bankId: debtor.bank.id, accountName: debtor.name, accountId: debtor.acc.id, client: debtorClient });
    const creditorClient = clientForBank(creditor.bank);
    if (creditorClient) {
      await refreshAccountCache({ bankId: creditor.bank.id, accountName: creditor.name, accountId: creditor.acc.id, client: creditorClient });
    }
    await reverseIou(opts.fromBankId, opts.toBankId, amountCents);
    await db.update(clearinghouseSettlements).set({
      status: "paid",
      confirmedAt: new Date(),
      confirmedBy: opts.actorId || "SYSTEM",
      note: opts.note || "Cross-corp SETTLEMENT book transfer",
    }).where(eq(clearinghouseSettlements.id, rowId));
    botManager.sendNotification(
      opts.fromBankId,
      `⚖️ **Net settlement paid** $${dollars(amountCents).toFixed(2)} to the receiving bank via SETTLEMENT book transfer.`
    );
    botManager.sendNotification(
      opts.toBankId,
      `⚖️ **Net settlement received** $${dollars(amountCents).toFixed(2)} into SETTLEMENT.`
    );
    return { id: rowId, status: "paid", mode: "book", message: "Settled via SETTLEMENT book transfer." };
  }

  return {
    id: rowId,
    status: "pending",
    mode: "owner_wallet",
    message:
      "CityCorp cannot book SETTLEMENT→SETTLEMENT across corps. Release from your SETTLEMENT (owner wallet), pay the other bank's owner in-game, then they confirm receipt.",
  };
}

export async function releaseSettlement(settlementId: string, actorBankId: string, actorId: string) {
  const row = await db.select().from(clearinghouseSettlements).where(eq(clearinghouseSettlements.id, settlementId)).get();
  if (!row) throw new MoneyRailError("Settlement not found.");
  if (row.fromBankId !== actorBankId) throw new MoneyRailError("Only the debtor bank can release from SETTLEMENT.");
  if (row.status !== "pending") throw new MoneyRailError(`Settlement is ${row.status}, not pending.`);
  await withdrawSettlementToOwner(row.fromBankId, row.amount);
  await db.update(clearinghouseSettlements).set({
    status: "released",
    releasedAt: new Date(),
    releasedBy: actorId,
  }).where(eq(clearinghouseSettlements.id, row.id));
  botManager.sendNotification(
    row.toBankId,
    `⚖️ Debtor released $${dollars(row.amount).toFixed(2)} from SETTLEMENT. Expect an in-game owner payment, then confirm receipt to fund your SETTLEMENT.`
  );
  return { status: "released" };
}

export async function confirmSettlement(settlementId: string, actorBankId: string, actorId: string) {
  const row = await db.select().from(clearinghouseSettlements).where(eq(clearinghouseSettlements.id, settlementId)).get();
  if (!row) throw new MoneyRailError("Settlement not found.");
  if (row.toBankId !== actorBankId) throw new MoneyRailError("Only the creditor bank can confirm receipt.");
  if (row.status !== "pending" && row.status !== "released") {
    throw new MoneyRailError(`Settlement is ${row.status}.`);
  }
  await fundSettlementFromOwner(row.toBankId, row.amount);
  await reverseIou(row.fromBankId, row.toBankId, row.amount);
  await db.update(clearinghouseSettlements).set({
    status: "paid",
    confirmedAt: new Date(),
    confirmedBy: actorId,
  }).where(eq(clearinghouseSettlements.id, row.id));
  botManager.sendNotification(
    row.fromBankId,
    `⚖️ Creditor confirmed net settlement of $${dollars(row.amount).toFixed(2)}. IOU closed.`
  );
  return { status: "paid" };
}

export async function cancelSettlement(settlementId: string, actorBankId: string, actorId: string) {
  const row = await db.select().from(clearinghouseSettlements).where(eq(clearinghouseSettlements.id, settlementId)).get();
  if (!row) throw new MoneyRailError("Settlement not found.");
  if (row.fromBankId !== actorBankId && row.toBankId !== actorBankId) {
    throw new MoneyRailError("Not a party to this settlement.");
  }
  if (row.status === "paid") throw new MoneyRailError("Paid settlements cannot be cancelled.");
  await db.update(clearinghouseSettlements).set({
    status: "cancelled",
    note: `Cancelled by ${actorId}`,
  }).where(eq(clearinghouseSettlements.id, row.id));
  return { status: "cancelled" };
}

export type NetPair = { fromBankId: string; toBankId: string; amount: number };

export async function pairNets(minCents = 10000): Promise<NetPair[]> {
  const rows = await db.select().from(clearinghouseBalances);
  const debtors = rows
    .filter((r) => (r.balance || 0) <= -minCents)
    .map((r) => ({ bankId: r.bankId, working: r.balance || 0 }))
    .sort((a, b) => a.working - b.working);
  const creditors = rows
    .filter((r) => (r.balance || 0) >= minCents)
    .map((r) => ({ bankId: r.bankId, working: r.balance || 0 }))
    .sort((a, b) => b.working - a.working);

  const pairs: NetPair[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const amt = Math.min(-d.working, c.working);
    if (amt >= minCents) {
      pairs.push({ fromBankId: d.bankId, toBankId: c.bankId, amount: amt });
      d.working += amt;
      c.working -= amt;
    }
    if (-d.working < minCents) di++;
    if (c.working < minCents) ci++;
  }
  return pairs;
}

export async function runNetSettlement(opts?: { actorId?: string; minCents?: number }) {
  const settings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, "global")).get();
  const minCents = opts?.minCents ?? settings?.settlementMinCents ?? 10000;
  const runId = uuidv4();
  const pairs = await pairNets(minCents);
  const results: { pair: NetPair; result?: any; error?: string }[] = [];
  for (const pair of pairs) {
    const open = await db.select().from(clearinghouseSettlements).where(
      and(
        eq(clearinghouseSettlements.fromBankId, pair.fromBankId),
        eq(clearinghouseSettlements.toBankId, pair.toBankId),
        or(eq(clearinghouseSettlements.status, "pending"), eq(clearinghouseSettlements.status, "released"))
      )
    ).get();
    if (open) {
      results.push({ pair, result: { id: open.id, status: open.status, skipped: true } });
      continue;
    }
    try {
      const result = await executeNetSettlement({
        fromBankId: pair.fromBankId,
        toBankId: pair.toBankId,
        amountCents: pair.amount,
        actorId: opts?.actorId || "SYSTEM",
        runId,
        note: "Scheduled net settlement",
      });
      results.push({ pair, result });
    } catch (e: any) {
      results.push({ pair, error: e.message || "failed" });
    }
  }
  await db.update(onyxSettings).set({ lastNetSettlementAt: new Date() }).where(eq(onyxSettings.id, "global"));
  return { runId, pairs: pairs.length, results };
}

export async function processDueNetSettlements() {
  const settings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, "global")).get();
  const schedule = settings?.settlementSchedule || "weekly";
  if (schedule === "manual") return { skipped: true, reason: "manual" };
  const last = settings?.lastNetSettlementAt ? new Date(settings.lastNetSettlementAt).getTime() : 0;
  const days = schedule === "monthly" ? 30 : schedule === "biweekly" ? 14 : 7;
  if (last && Date.now() - last < days * 24 * 60 * 60 * 1000) {
    return { skipped: true, reason: "not due" };
  }
  return runNetSettlement({ actorId: "SYSTEM" });
}

export async function recentSlateDebitMatches(opts: {
  bankId: string;
  accountId?: string | null;
  dropCents: number;
  windowMs?: number;
}): Promise<boolean> {
  if (!opts.accountId) return false;
  const windowMs = opts.windowMs ?? 30_000;
  const cutoff = new Date(Date.now() - windowMs);
  const rows = await db.select().from(transactions).where(
    and(
      eq(transactions.bankId, opts.bankId),
      eq(transactions.fromAccountId, opts.accountId),
      gte(transactions.timestamp, cutoff)
    )
  ).orderBy(desc(transactions.timestamp)).limit(20);
  const slop = Math.max(200, Math.round(opts.dropCents * 0.02));
  return rows.some((t) => Math.abs((t.amount || 0) - opts.dropCents) <= slop || Math.abs((t.amountSubmitted || 0) - opts.dropCents) <= slop);
}
