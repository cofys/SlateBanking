import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index";
import { banks, bankAccounts, bankSettings, transactions, clearinghouseBalances } from "../db/schema";
import { CityCorpClient } from "./citycorp_api";
import {
  FeeLine,
  FeePayerMode,
  FeeQuote,
  cityCorpPercentToRate,
  parseCityCorpFeeList,
  parseFeePayerMode,
  quoteFees,
  slateStoredToRate,
} from "./fee_quote";

export const DEFAULT_SETTLEMENT_ACCOUNT = "SETTLEMENT";

export type BankRow = typeof banks.$inferSelect;
export type AccountRow = typeof bankAccounts.$inferSelect;
export type SettingsRow = typeof bankSettings.$inferSelect;

export class MoneyRailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyRailError";
  }
}

export function clientForBank(bank: BankRow): CityCorpClient | null {
  if (!bank.corpId || !bank.corpApiUuid || !bank.corpApiKey) return null;
  return new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
}

export async function loadBank(bankId: string): Promise<BankRow> {
  const row = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  if (!row) throw new MoneyRailError("Bank not found");
  return row;
}

export async function loadSettings(bankId: string): Promise<SettingsRow | undefined> {
  return db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
}

export function dollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function isCityCorpOk(res: any): boolean {
  if (!res) return false;
  if (res.success === false) return false;
  if (res.error) return false;
  return true;
}

export function extractLiveBalanceCents(payload: any): number | null {
  if (!payload) return null;
  const raw =
    payload.balance ??
    payload.account?.balance ??
    payload.data?.balance ??
    payload.newBalance ??
    payload.newAccount?.balance;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // CityCorp balances are dollars.
  return Math.round(n * 100);
}

export async function refreshAccountCache(opts: {
  bankId: string;
  accountName: string;
  accountId?: string;
  liveBalanceCents?: number | null;
  client?: CityCorpClient | null;
}): Promise<number | null> {
  let cents = opts.liveBalanceCents ?? null;
  if (cents === null && opts.client) {
    const details = await opts.client.getAccountDetails(opts.accountName);
    if (details?.success) cents = extractLiveBalanceCents(details);
  }
  if (cents === null) return null;

  if (opts.accountId) {
    await db.update(bankAccounts).set({
      balance: cents,
      lastSyncedAt: new Date(),
      syncError: null,
      existsInGame: true,
    }).where(eq(bankAccounts.id, opts.accountId));
  } else {
    await db.update(bankAccounts).set({
      balance: cents,
      lastSyncedAt: new Date(),
      syncError: null,
      existsInGame: true,
    }).where(and(eq(bankAccounts.bankId, opts.bankId), eq(bankAccounts.accountName, opts.accountName)));
  }
  return cents;
}

export async function readCityCorpAccountFees(
  client: CityCorpClient,
  accountName: string
): Promise<{ withdrawRate: number; depositRate: number; raw: any }> {
  const details = await client.getAccountDetails(accountName);
  const account = details?.account || details || {};
  const parsed = parseCityCorpFeeList(account.fees || details?.fees);
  return {
    withdrawRate: cityCorpPercentToRate(parsed.withdrawPct),
    depositRate: cityCorpPercentToRate(parsed.depositPct),
    raw: details,
  };
}

function slateAccountFeeRate(
  account: AccountRow | undefined,
  settings: SettingsRow | undefined,
  kind: "withdraw" | "deposit" | "transfer"
): number {
  if (!account && !settings) return 0;
  if (kind === "withdraw") {
    if (account?.customWithdrawFeePercent != null) return slateStoredToRate(account.customWithdrawFeePercent);
    if (settings?.enableAccountTiers && account?.tierId && settings.accountTiers) {
      const t = settings.accountTiers.find((x: any) => x.id === account.tierId);
      if (t && t.withdrawFeePercent != null) return slateStoredToRate(t.withdrawFeePercent);
    }
    return slateStoredToRate(settings?.withdrawFeePercent);
  }
  if (kind === "deposit") {
    if (account?.customDepositFeePercent != null) return slateStoredToRate(account.customDepositFeePercent);
    if (settings?.enableAccountTiers && account?.tierId && settings.accountTiers) {
      const t = settings.accountTiers.find((x: any) => x.id === account.tierId);
      if (t && t.depositFeePercent != null) return slateStoredToRate(t.depositFeePercent);
    }
    return slateStoredToRate(settings?.depositFeePercent);
  }
  if (account?.customTransferFeePercent != null) return slateStoredToRate(account.customTransferFeePercent);
  if (settings?.enableAccountTiers && account?.tierId && settings.accountTiers) {
    const t = settings.accountTiers.find((x: any) => x.id === account.tierId);
    if (t && t.transferFeePercent != null) return slateStoredToRate(t.transferFeePercent);
  }
  return slateStoredToRate(settings?.transferFeePercent);
}

function incrementalBankRate(slateRate: number, cityRate: number): number {
  if (slateRate <= cityRate + 1e-12) return 0;
  return slateRate - cityRate;
}

export async function buildTransferFeeLines(opts: {
  sourceBank: BankRow;
  destBank: BankRow;
  sourceAccount: AccountRow;
  destAccount: AccountRow;
  sourceSettings?: SettingsRow;
  destSettings?: SettingsRow;
  sourceClient?: CityCorpClient | null;
  destClient?: CityCorpClient | null;
  extraLines?: FeeLine[];
}): Promise<FeeLine[]> {
  const lines: FeeLine[] = [];
  let cityWithdraw = 0;
  let cityDeposit = 0;

  if (opts.sourceClient) {
    try {
      const f = await readCityCorpAccountFees(opts.sourceClient, opts.sourceAccount.accountName);
      cityWithdraw = f.withdrawRate;
      if (cityWithdraw > 0) {
        lines.push({
          code: "citycorp_withdraw",
          label: "CityCorp withdraw fee",
          rate: cityWithdraw,
          source: "citycorp",
        });
      }
    } catch (e) {
      console.warn("[fee quote] source CityCorp fees failed", e);
    }
  }
  if (opts.destClient) {
    try {
      const f = await readCityCorpAccountFees(opts.destClient, opts.destAccount.accountName);
      cityDeposit = f.depositRate;
      if (cityDeposit > 0) {
        lines.push({
          code: "citycorp_deposit",
          label: "CityCorp deposit fee",
          rate: cityDeposit,
          source: "citycorp",
        });
      }
    } catch (e) {
      console.warn("[fee quote] dest CityCorp fees failed", e);
    }
  }

  const slateWithdraw = slateAccountFeeRate(opts.sourceAccount, opts.sourceSettings, "withdraw");
  const slateDeposit = slateAccountFeeRate(opts.destAccount, opts.destSettings, "deposit");
  const slateTransfer = slateAccountFeeRate(opts.sourceAccount, opts.sourceSettings, "transfer");

  const extraW = incrementalBankRate(slateWithdraw, cityWithdraw);
  if (extraW > 0) {
    lines.push({ code: "bank_withdraw", label: "Bank withdraw fee", rate: extraW, source: "bank" });
  }
  const extraD = incrementalBankRate(slateDeposit, cityDeposit);
  if (extraD > 0) {
    lines.push({ code: "bank_deposit", label: "Bank deposit fee", rate: extraD, source: "bank" });
  }
  if (slateTransfer > 0) {
    lines.push({ code: "bank_transfer", label: "Bank transfer fee", rate: slateTransfer, source: "bank" });
  }

  if (opts.extraLines) lines.push(...opts.extraLines);
  return lines;
}

export async function quoteBookTransfer(opts: {
  sourceAccount: AccountRow;
  destAccount: AccountRow;
  desiredCents: number;
  mode: FeePayerMode;
  extraLines?: FeeLine[];
}): Promise<{ quote: FeeQuote; lines: FeeLine[]; sourceBank: BankRow; destBank: BankRow }> {
  const sourceBank = await loadBank(opts.sourceAccount.bankId);
  const destBank = opts.destAccount.bankId === sourceBank.id
    ? sourceBank
    : await loadBank(opts.destAccount.bankId);
  const sourceSettings = await loadSettings(sourceBank.id);
  const destSettings = destBank.id === sourceBank.id ? sourceSettings : await loadSettings(destBank.id);
  const sourceClient = clientForBank(sourceBank);
  const destClient = destBank.id === sourceBank.id ? sourceClient : clientForBank(destBank);

  const lines = await buildTransferFeeLines({
    sourceBank,
    destBank,
    sourceAccount: opts.sourceAccount,
    destAccount: opts.destAccount,
    sourceSettings,
    destSettings,
    sourceClient,
    destClient,
    extraLines: opts.extraLines,
  });
  const quote = quoteFees(opts.desiredCents, lines, opts.mode);
  return { quote, lines, sourceBank, destBank };
}

async function recordMove(opts: {
  bankId: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  type: string;
  amountCents: number;
  submittedCents?: number;
  receivedCents?: number;
  description?: string;
  category?: string;
  feeType?: string;
  feePayerMode?: string;
  feeBreakdown?: FeeQuote | null;
}): Promise<string> {
  const id = uuidv4();
  await db.insert(transactions).values({
    id,
    bankId: opts.bankId,
    fromAccountId: opts.fromAccountId,
    toAccountId: opts.toAccountId,
    type: opts.type,
    amount: opts.amountCents,
    amountSubmitted: opts.submittedCents ?? opts.amountCents,
    amountReceived: opts.receivedCents ?? opts.amountCents,
    feePayerMode: opts.feePayerMode || null,
    feeBreakdown: opts.feeBreakdown ? JSON.stringify(opts.feeBreakdown) : null,
    feeType: opts.feeType || null,
    description: opts.description || null,
    category: opts.category || null,
    timestamp: new Date(),
  });
  return id;
}

async function applyLocalDelta(accountId: string, deltaCents: number) {
  if (deltaCents === 0) return;
  await db.update(bankAccounts)
    .set({ balance: sql`${bankAccounts.balance} + ${deltaCents}` })
    .where(eq(bankAccounts.id, accountId));
}

/**
 * Same-corp book transfer. CityCorp `transfer/account` is the only cash pipe.
 * Owner-key deposit/withdraw are never used here.
 */
export async function executeSameBankBookTransfer(opts: {
  sourceAccount: AccountRow;
  destAccount: AccountRow;
  desiredCents: number;
  mode?: FeePayerMode | string;
  description?: string;
  type?: string;
  extraLines?: FeeLine[];
  skipLocalDelta?: boolean;
  /** Send desiredCents as-is. Used for settlement hops that were already quoted end-to-end. */
  skipQuote?: boolean;
}): Promise<{ quote: FeeQuote; txId: string; sourceBank: BankRow }> {
  if (opts.sourceAccount.id === opts.destAccount.id) {
    throw new MoneyRailError("Cannot transfer to the same account.");
  }
  if (opts.sourceAccount.bankId !== opts.destAccount.bankId) {
    throw new MoneyRailError("Use the cross-bank settlement rail for different banks.");
  }
  if (opts.sourceAccount.isFrozen || !opts.sourceAccount.isActive) {
    throw new MoneyRailError("Source account is frozen or inactive.");
  }
  if (opts.destAccount.isFrozen || !opts.destAccount.isActive) {
    throw new MoneyRailError("Destination account is frozen or inactive.");
  }

  const mode = parseFeePayerMode(opts.mode, "from_payment");
  let quote: FeeQuote;
  let sourceBank: BankRow;

  if (opts.skipQuote) {
    sourceBank = await loadBank(opts.sourceAccount.bankId);
    quote = {
      mode,
      desiredCents: Math.round(opts.desiredCents),
      submittedCents: Math.round(opts.desiredCents),
      receivedCents: Math.round(opts.desiredCents),
      totalFeeCents: 0,
      combinedRate: 0,
      lines: [],
    };
  } else {
    const quoted = await quoteBookTransfer({
      sourceAccount: opts.sourceAccount,
      destAccount: opts.destAccount,
      desiredCents: opts.desiredCents,
      mode,
      extraLines: opts.extraLines,
    });
    quote = quoted.quote;
    sourceBank = quoted.sourceBank;
  }

  if (quote.submittedCents <= 0) throw new MoneyRailError("Invalid amount.");
  if (opts.sourceAccount.balance < quote.submittedCents) {
    throw new MoneyRailError(
      `Insufficient funds. This transfer requires $${dollars(quote.submittedCents)} (including fees).`
    );
  }

  const client = clientForBank(sourceBank);
  if (client) {
    const res = await client.transferToAccount(
      opts.sourceAccount.accountName,
      dollars(quote.submittedCents),
      sourceBank.corpId!,
      opts.destAccount.accountName
    );
    if (!isCityCorpOk(res)) {
      throw new MoneyRailError(`CityCorp transfer failed: ${res?.message || res?.error || "unknown error"}`);
    }
    await refreshAccountCache({
      bankId: sourceBank.id,
      accountName: opts.sourceAccount.accountName,
      accountId: opts.sourceAccount.id,
      client,
    });
    await refreshAccountCache({
      bankId: sourceBank.id,
      accountName: opts.destAccount.accountName,
      accountId: opts.destAccount.id,
      client,
    });
  } else if (!opts.skipLocalDelta) {
    await applyLocalDelta(opts.sourceAccount.id, -quote.submittedCents);
    await applyLocalDelta(opts.destAccount.id, quote.receivedCents);
  }

  const txId = await recordMove({
    bankId: sourceBank.id,
    fromAccountId: opts.sourceAccount.id,
    toAccountId: opts.destAccount.id,
    type: opts.type || "transfer",
    amountCents: quote.desiredCents,
    submittedCents: quote.submittedCents,
    receivedCents: quote.receivedCents,
    description: opts.description || `Transfer to ${opts.destAccount.accountName}`,
    feePayerMode: mode,
    feeBreakdown: quote,
  });

  return { quote, txId, sourceBank };
}

export function settlementAccountName(settings?: SettingsRow | null): string {
  return (settings?.settlementAccount || DEFAULT_SETTLEMENT_ACCOUNT).trim() || DEFAULT_SETTLEMENT_ACCOUNT;
}

export async function ensureNamedCityCorpAccount(opts: {
  bank: BankRow;
  settings?: SettingsRow;
  accountName: string;
  systemCategory?: string;
}): Promise<AccountRow> {
  const client = clientForBank(opts.bank);
  const zeroClearingFees = async () => {
    if (!client || opts.systemCategory !== "clearinghouse") return;
    try {
      await client.setAccountFee(opts.accountName, "WITHDRAW", 0);
      await client.setAccountFee(opts.accountName, "DEPOSIT", 0);
    } catch (e) {
      console.warn(`[settlement] failed to zero CityCorp fees on ${opts.accountName}`, e);
    }
  };

  const existing = await db.select().from(bankAccounts).where(
    and(eq(bankAccounts.bankId, opts.bank.id), eq(bankAccounts.accountName, opts.accountName))
  ).get();
  if (existing) {
    await zeroClearingFees();
    return existing;
  }

  if (client) {
    const created = await client.createAccount(opts.accountName);
    if (!isCityCorpOk(created) && !String(created?.message || "").toLowerCase().includes("already")) {
      throw new MoneyRailError(`Could not create CityCorp account ${opts.accountName}: ${created?.message || "error"}`);
    }
    await zeroClearingFees();
  }

  const row = {
    id: uuidv4(),
    bankId: opts.bank.id,
    ownerDiscordId: "system",
    accountName: opts.accountName,
    accountType: "system_asset",
    balance: 0,
    isSystem: true,
    systemCategory: opts.systemCategory || "clearinghouse",
    existsInGame: true,
    createdAt: new Date(),
  };
  await db.insert(bankAccounts).values(row);
  return row as AccountRow;
}

export async function adjustNetPosition(fromBankId: string, toBankId: string, amountCents: number) {
  const from = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, fromBankId)).get();
  if (!from) await db.insert(clearinghouseBalances).values({ bankId: fromBankId, balance: -amountCents });
  else await db.update(clearinghouseBalances).set({ balance: sql`${clearinghouseBalances.balance} - ${amountCents}` }).where(eq(clearinghouseBalances.bankId, fromBankId));

  const to = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, toBankId)).get();
  if (!to) await db.insert(clearinghouseBalances).values({ bankId: toBankId, balance: amountCents });
  else await db.update(clearinghouseBalances).set({ balance: sql`${clearinghouseBalances.balance} + ${amountCents}` }).where(eq(clearinghouseBalances.bankId, toBankId));
}

/**
 * Cross-bank: A customer → A SETTLEMENT, B SETTLEMENT → B customer.
 * Each leg is same-corp transfer/account using that bank's owner key.
 */
export async function executeCrossBankSettledTransfer(opts: {
  sourceAccount: AccountRow;
  destAccount: AccountRow;
  desiredCents: number;
  mode?: FeePayerMode | string;
  description?: string;
  extraLines?: FeeLine[];
}): Promise<{ quote: FeeQuote; txOutId: string; txInId: string }> {
  if (opts.sourceAccount.bankId === opts.destAccount.bankId) {
    const same = await executeSameBankBookTransfer(opts);
    return { quote: same.quote, txOutId: same.txId, txInId: same.txId };
  }

  const mode = parseFeePayerMode(opts.mode, "from_payment");
  const sourceBank = await loadBank(opts.sourceAccount.bankId);
  const destBank = await loadBank(opts.destAccount.bankId);
  const sourceSettings = await loadSettings(sourceBank.id);
  const destSettings = await loadSettings(destBank.id);

  const aSettle = await ensureNamedCityCorpAccount({
    bank: sourceBank,
    settings: sourceSettings,
    accountName: settlementAccountName(sourceSettings),
    systemCategory: "clearinghouse",
  });
  const bSettle = await ensureNamedCityCorpAccount({
    bank: destBank,
    settings: destSettings,
    accountName: settlementAccountName(destSettings),
    systemCategory: "clearinghouse",
  });

  const aClient = clientForBank(sourceBank);
  const bClient = clientForBank(destBank);
  if (aClient) {
    await refreshAccountCache({ bankId: sourceBank.id, accountName: aSettle.accountName, accountId: aSettle.id, client: aClient });
  }
  if (bClient) {
    await refreshAccountCache({ bankId: destBank.id, accountName: bSettle.accountName, accountId: bSettle.id, client: bClient });
  }
  const bSettleLive = await db.select().from(bankAccounts).where(eq(bankAccounts.id, bSettle.id)).get() || bSettle;

  const floor = destSettings?.settlementFloorCents || 0;
  const { quote } = await quoteBookTransfer({
    sourceAccount: opts.sourceAccount,
    destAccount: opts.destAccount,
    desiredCents: opts.desiredCents,
    mode,
    extraLines: opts.extraLines,
  });

  if ((bSettleLive.balance || 0) - quote.receivedCents < floor) {
    throw new MoneyRailError(
      `Receiving bank settlement cash is below the payout floor (need $${dollars(quote.receivedCents + floor)} available).`
    );
  }

  const leg1 = await executeSameBankBookTransfer({
    sourceAccount: opts.sourceAccount,
    destAccount: aSettle,
    desiredCents: quote.submittedCents,
    mode: "from_payment",
    skipQuote: true,
    description: opts.description || `Settlement outbound to ${destBank.name}`,
    type: "transfer",
  });

  let leg2Tx = "";
  try {
    const liveB = await db.select().from(bankAccounts).where(eq(bankAccounts.id, bSettle.id)).get() || bSettle;
    const destLive = await db.select().from(bankAccounts).where(eq(bankAccounts.id, opts.destAccount.id)).get() || opts.destAccount;
    const leg2 = await executeSameBankBookTransfer({
      sourceAccount: liveB,
      destAccount: destLive,
      desiredCents: quote.receivedCents,
      mode: "sender_covers",
      skipQuote: true,
      description: opts.description || `Settlement inbound from ${sourceBank.name}`,
      type: "deposit",
    });
    leg2Tx = leg2.txId;
  } catch (e: any) {
    try {
      const liveA = await db.select().from(bankAccounts).where(eq(bankAccounts.id, aSettle.id)).get() || aSettle;
      const srcLive = await db.select().from(bankAccounts).where(eq(bankAccounts.id, opts.sourceAccount.id)).get() || opts.sourceAccount;
      await executeSameBankBookTransfer({
        sourceAccount: liveA,
        destAccount: srcLive,
        desiredCents: quote.submittedCents,
        mode: "from_payment",
        skipQuote: true,
        description: "Settlement rollback",
        type: "transfer",
      });
    } catch (rollbackErr) {
      console.error("[cross-bank] rollback failed", rollbackErr);
    }
    throw new MoneyRailError(`Receiving-bank settlement payout failed: ${e.message}`);
  }

  await adjustNetPosition(sourceBank.id, destBank.id, quote.receivedCents);
  return { quote, txOutId: leg1.txId, txInId: leg2Tx };
}

export async function resolveLoanFundingAccount(bankId: string): Promise<{
  kind: "pool" | "operating" | "treasury";
  account?: AccountRow;
  name?: string;
}> {
  const settings = await loadSettings(bankId);
  const poolName = settings?.loanPoolAccount?.trim();
  if (poolName) {
    const acc = await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.accountName, poolName))
    ).get() || await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.id, poolName))
    ).get();
    if (acc) return { kind: "pool", account: acc, name: acc.accountName };
    return { kind: "pool", name: poolName };
  }

  const operating = settings?.defaultCorpAccount?.trim();
  if (operating) {
    const acc = await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.accountName, operating))
    ).get() || await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.id, operating))
    ).get();
    if (acc) return { kind: "operating", account: acc, name: acc.accountName };
    return { kind: "operating", name: operating };
  }

  return { kind: "treasury" };
}

/** Loan / credit repayment: pool or operating via transfer/account, else account → corp treasury. */
export async function collectToPoolOrTreasury(opts: {
  bankId: string;
  fromAccount: AccountRow;
  amountCents: number;
  description: string;
  type?: string;
}): Promise<{ txId: string; funding: Awaited<ReturnType<typeof resolveLoanFundingAccount>> }> {
  const bank = await loadBank(opts.bankId);
  const funding = await resolveLoanFundingAccount(opts.bankId);
  const client = clientForBank(bank);

  if (funding.kind !== "treasury" && funding.name) {
    let dest = funding.account;
    if (!dest) {
      dest = await ensureNamedCityCorpAccount({ bank, accountName: funding.name, systemCategory: "loan_pool" });
    }
    const result = await executeSameBankBookTransfer({
      sourceAccount: opts.fromAccount,
      destAccount: dest,
      desiredCents: opts.amountCents,
      mode: "from_payment",
      description: opts.description,
      type: opts.type || "loan_payment",
    });
    return { txId: result.txId, funding };
  }

  if (client) {
    const res = await client.transferToCorp(opts.fromAccount.accountName, dollars(opts.amountCents), bank.corpId!);
    if (!isCityCorpOk(res)) {
      throw new MoneyRailError(`Treasury collection failed: ${res?.message || "error"}`);
    }
    await refreshAccountCache({
      bankId: bank.id,
      accountName: opts.fromAccount.accountName,
      accountId: opts.fromAccount.id,
      client,
    });
  } else {
    await applyLocalDelta(opts.fromAccount.id, -opts.amountCents);
  }

  const txId = await recordMove({
    bankId: bank.id,
    fromAccountId: opts.fromAccount.id,
    toAccountId: null,
    type: opts.type || "loan_payment",
    amountCents: opts.amountCents,
    description: opts.description,
    category: "Loan Repayment",
  });
  return { txId, funding };
}

/** Disburse from pool/operating subaccount. Treasury cannot push into a named account. */
export async function disburseFromPoolOrOperating(opts: {
  bankId: string;
  toAccount: AccountRow;
  amountCents: number;
  description: string;
}): Promise<{ txId: string; fromAccountId: string | null }> {
  const bank = await loadBank(opts.bankId);
  const funding = await resolveLoanFundingAccount(opts.bankId);

  if (funding.kind === "treasury" || !funding.name) {
    throw new MoneyRailError(
      "Loan disbursement needs a loan pool or operating subaccount. Corp treasury cannot credit a named account. Set Loan Pool or Default Corp Account in bank settings."
    );
  }

  let source = funding.account;
  if (!source) {
    source = await ensureNamedCityCorpAccount({
      bank,
      accountName: funding.name,
      systemCategory: funding.kind === "pool" ? "loan_pool" : "vault_cash",
    });
  }

  const result = await executeSameBankBookTransfer({
    sourceAccount: source,
    destAccount: opts.toAccount,
    desiredCents: opts.amountCents,
    mode: "sender_covers",
    description: opts.description,
    type: "transfer",
  });
  return { txId: result.txId, fromAccountId: source.id };
}

export { parseFeePayerMode };
