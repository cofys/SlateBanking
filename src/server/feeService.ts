import { eq, and, sql, or, like, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { bankAccounts, transactions, banks, bankSettings } from "../db/schema";
import { CityCorpClient } from "../lib/citycorp_api";

export type FeeType = 
  | "transfer_fee"
  | "deposit_fee"
  | "withdraw_fee"
  | "wire_fee"
  | "late_fee"
  | "origination_fee"
  | "loan_payment"
  | "service_fee"
  | "onyx_fee"
  | "in_game_tax"
  | "other_fee";

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  transfer_fee: "Transfer Fees",
  deposit_fee: "Deposit Fees",
  withdraw_fee: "Withdrawal Fees",
  wire_fee: "Wire / Inter-Bank Fees",
  late_fee: "Loan Late Fees",
  origination_fee: "Loan Origination Fees",
  loan_payment: "Loan Repayments / Interest",
  service_fee: "Service & Tier Fees",
  onyx_fee: "Onyx & Merchant Fees",
  in_game_tax: "In-Game Economy Taxes",
  other_fee: "Other In-Game Corp Fees"
};

export const FEE_TYPE_COLORS: Record<FeeType, string> = {
  transfer_fee: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  deposit_fee: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  withdraw_fee: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  wire_fee: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  late_fee: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  origination_fee: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  loan_payment: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  service_fee: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  onyx_fee: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
  in_game_tax: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  other_fee: "text-slate-400 bg-slate-500/10 border-slate-500/20"
};

/**
 * Intelligent parser for in-game CityCorp transactions.
 * Inspects all possible fields (description, memo, type, category, comment)
 * to accurately identify and label all in-game fees and corporate inflows.
 */
export function parseInGameFeeType(tx: any): {
  feeType: FeeType;
  label: string;
  category: string;
  cleanedDescription: string;
  isFeeOrInflow: boolean;
} {
  const nativeType = String(tx.type || "");
  const nativeFeeType = String(tx.feeType || tx.fee_type || "").toUpperCase();
  const accName = tx.accountName || tx.account_name || "";

  // 1. Exact CityCorp Native Transaction Models
  if (nativeType === "CorpAccountFeeTransaction") {
    if (nativeFeeType === "WITHDRAW") {
      return {
        feeType: "withdraw_fee",
        label: "Account Withdrawal Fee",
        category: "Withdrawal Fees",
        cleanedDescription: accName ? `Withdrawal fee from ${accName}` : "In-Game Withdrawal Fee",
        isFeeOrInflow: true
      };
    }
    if (nativeFeeType === "DEPOSIT") {
      return {
        feeType: "deposit_fee",
        label: "Account Deposit Fee",
        category: "Deposit Fees",
        cleanedDescription: accName ? `Deposit fee from ${accName}` : "In-Game Deposit Fee",
        isFeeOrInflow: true
      };
    }
    return {
      feeType: "other_fee",
      label: "Account Fee Revenue",
      category: "Corporate Fees",
      cleanedDescription: accName ? `Fee collected from ${accName}` : "In-Game Account Fee",
      isFeeOrInflow: true
    };
  }

  if (nativeType === "PayTransaction") {
    return {
      feeType: "service_fee",
      label: "Direct Corp Payment (/corp/pay)",
      category: "Corporate Revenue",
      cleanedDescription: `Direct payment to bank treasury (${tx.executor ? `by ${tx.executor}` : "Citizen Payment"})`,
      isFeeOrInflow: true
    };
  }

  if (nativeType === "BankPoolTransaction") {
    const isDeposit = Boolean(tx.deposit);
    return {
      feeType: "other_fee",
      label: isDeposit ? "Bank Pool Deposit" : "Bank Pool Withdrawal",
      category: "Liquidity Pool",
      cleanedDescription: `Bank pool liquidity ${isDeposit ? "deposit" : "withdrawal"}`,
      isFeeOrInflow: isDeposit
    };
  }

  if (nativeType === "SendTransaction") {
    return {
      feeType: "other_fee",
      label: "Corp Treasury Outflow",
      category: "Treasury Disbursements",
      cleanedDescription: `Disbursement sent by corp staff to ${tx.recipient || "recipient"}`,
      isFeeOrInflow: false
    };
  }

  if (nativeType === "AccountTransaction") {
    const isCredit = tx.deposit === true || tx.type === "credit";
    return {
      feeType: isCredit ? "deposit_fee" : "withdraw_fee",
      label: isCredit ? "Account Credit" : "Account Debit",
      category: "Account Operations",
      cleanedDescription: `${isCredit ? "Deposit into" : "Withdrawal from"} ${accName || "account"}`,
      isFeeOrInflow: isCredit
    };
  }

  const rawText = [
    tx.description,
    tx.memo,
    tx.category,
    tx.type,
    tx.action,
    tx.feeType,
    tx.fee_type,
    tx.note,
    tx.message,
    tx.comment
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const amount = Number(tx.amount || tx.value || 0);

  // Check in order of specificity
  if (rawText.match(/late\s*fee|penalty|delinquen|missed\s*pay|overdue|fine|late\s*charge/i)) {
    return {
      feeType: "late_fee",
      label: "Loan Late Fee",
      category: "Loan Penalties",
      cleanedDescription: tx.description || tx.memo || "In-Game Late Fee Assessed",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/origination|underwriting|loan\s*app|contract\s*fee|loan\s*setup|issuance\s*fee/i)) {
    return {
      feeType: "origination_fee",
      label: "Loan Origination Fee",
      category: "Loan Origination",
      cleanedDescription: tx.description || tx.memo || "Loan Origination Fee",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/loan\s*repay|loan\s*payment|repay\s*loan|loan\s*interest|amortiz|installment/i)) {
    return {
      feeType: "loan_payment",
      label: "Loan Repayment / Interest",
      category: "Loan Income",
      cleanedDescription: tx.description || tx.memo || "In-Game Loan Payment Received",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/wire|inter-bank|clearinghouse|fedwire|swift/i)) {
    return {
      feeType: "wire_fee",
      label: "Wire / Inter-Bank Fee",
      category: "Wire Transfers",
      cleanedDescription: tx.description || tx.memo || "Inter-Bank Wire Fee",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/transfer\s*fee|fee.*transfer|t-fee|xfer\s*fee|transfer.*tax/i) || 
      (rawText.includes("transfer") && rawText.includes("fee"))) {
    return {
      feeType: "transfer_fee",
      label: "Transfer Fee",
      category: "Transfer Fees",
      cleanedDescription: tx.description || tx.memo || "Transfer Fee Assessed",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/deposit\s*fee|fee.*deposit|dep\s*fee|counter.*deposit|vault.*deposit|cash.*deposit/i) ||
      nativeFeeType === "DEPOSIT") {
    return {
      feeType: "deposit_fee",
      label: "Deposit Fee",
      category: "Deposit Fees",
      cleanedDescription: tx.description || tx.memo || "Deposit Fee Assessed",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/withdraw.*fee|fee.*withdraw|atm\s*fee|w\/d\s*fee|counter.*withdraw|cash.*out.*fee/i) ||
      nativeFeeType === "WITHDRAW") {
    return {
      feeType: "withdraw_fee",
      label: "Withdrawal Fee",
      category: "Withdrawal Fees",
      cleanedDescription: tx.description || tx.memo || "Withdrawal Fee Assessed",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/onyx|merchant.*fee|gateway.*fee|pos\s*fee|checkout\s*fee|b2b\s*fee|card\s*fee/i)) {
    return {
      feeType: "onyx_fee",
      label: "Onyx & Merchant Processing",
      category: "Payment Processing",
      cleanedDescription: tx.description || tx.memo || "Onyx Merchant Processing Fee",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/service\s*fee|maintenance|monthly\s*fee|account\s*fee|tier\s*fee|subscription|membership/i)) {
    return {
      feeType: "service_fee",
      label: "Service & Maintenance Fee",
      category: "Account Maintenance",
      cleanedDescription: tx.description || tx.memo || "Monthly Account Service Fee",
      isFeeOrInflow: true
    };
  }

  if (rawText.match(/chestshop|tax|city\s*tax|sales\s*tax|property\s*tax|market\s*toll|tariff|duty/i)) {
    return {
      feeType: "in_game_tax",
      label: "In-Game Economy Tax",
      category: "Economy Taxes",
      cleanedDescription: tx.description || tx.memo || "In-Game Economy Tax / Dues",
      isFeeOrInflow: true
    };
  }

  // General fee / inflow match
  if (rawText.match(/fee|charge|surcharge|commission|revenue|royalty|dues/i) || (tx.type === "fee")) {
    return {
      feeType: "other_fee",
      label: "Corporate Fee Revenue",
      category: "Corporate Revenue",
      cleanedDescription: tx.description || tx.memo || "In-Game Corporate Fee Received",
      isFeeOrInflow: true
    };
  }

  // Fallback: If amount > 0 and type is deposit/inflow to corp account, treat as general fee/revenue
  const isInflow = tx.type === "deposit" || amount > 0;
  return {
    feeType: "other_fee",
    label: "Corporate In-Game Income",
    category: "Corporate Operations",
    cleanedDescription: tx.description || tx.memo || "In-Game Corporate Transaction",
    isFeeOrInflow: isInflow
  };
}

/**
 * Resolves the bank's default in-game corporate account from the CityCorp plugin.
 * There is NO separate fee account; fees go directly into the bank's default corp account.
 */
export async function getOrCreateBankCorpAccount(db: any, bankId: string) {
  // 1. Check if bank settings specifies a default corp account name
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const configuredCorpAccountName = settings?.defaultCorpAccount?.trim();

  // 2. Query all local bank accounts for this bank
  const allAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));

  if (configuredCorpAccountName) {
    const matched = allAccounts.find((a: any) => 
      a.accountName.toLowerCase().trim() === configuredCorpAccountName.toLowerCase()
    );
    if (matched) {
      if (!matched.isSystem || matched.systemCategory !== "corporate") {
        await db.update(bankAccounts).set({
          isSystem: true,
          systemCategory: "corporate"
        }).where(eq(bankAccounts.id, matched.id));
      }
      return matched;
    }
  }

  // 3. Check for existing system corporate account
  const existingCorp = allAccounts.find((a: any) => 
    a.systemCategory === "corporate" || 
    a.systemCategory === "default_corp" ||
    a.accountName.toLowerCase() === "corporate" ||
    a.accountName.toLowerCase() === "main" ||
    a.accountName.toLowerCase() === "default"
  );
  if (existingCorp) return existingCorp;

  // 4. If bank has CityCorp credentials, check remote accounts list to find in-game default account
  const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  let defaultName = "Main";
  let inGameBalance = 0;

  if (bank?.corpId && bank?.corpApiUuid && bank?.corpApiKey) {
    try {
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      const remoteRes = await client.fetchAllAccounts(3);
      if (remoteRes.success && Array.isArray(remoteRes.accounts) && remoteRes.accounts.length > 0) {
        // Find default or first non-personal account
        const corpCandidate = remoteRes.accounts.find((a: any) => {
          const n = (a.account_name || a.name || "").toLowerCase();
          return a.is_default || a.default || n === "main" || n === "default" || n === "corporate" || n === bank.name.toLowerCase();
        }) || remoteRes.accounts[0];

        if (corpCandidate) {
          defaultName = corpCandidate.account_name || corpCandidate.name || "Main";
          inGameBalance = Math.round((Number(corpCandidate.balance) || 0) * 100);

          // Check if already in local accounts
          const matchRemote = allAccounts.find((a: any) => 
            a.accountName.toLowerCase().trim() === defaultName.toLowerCase().trim()
          );
          if (matchRemote) {
            await db.update(bankAccounts).set({
              isSystem: true,
              systemCategory: "corporate",
              balance: inGameBalance,
              existsInGame: true,
              lastSyncedAt: new Date()
            }).where(eq(bankAccounts.id, matchRemote.id));
            return { ...matchRemote, isSystem: true, systemCategory: "corporate", balance: inGameBalance };
          }
        }
      }
    } catch (e) {
      console.warn(`[getOrCreateBankCorpAccount] Could not query remote accounts for bank ${bankId}:`, e);
    }
  }

  // 5. Look for any business account or fallback to creating local mirror for the default corp account
  const fallbackBiz = allAccounts.find((a: any) => a.accountType === "business");
  if (fallbackBiz) {
    await db.update(bankAccounts).set({
      isSystem: true,
      systemCategory: "corporate"
    }).where(eq(bankAccounts.id, fallbackBiz.id));
    return { ...fallbackBiz, isSystem: true, systemCategory: "corporate" };
  }

  // 6. Create local mirror for the bank's default corp account
  const newCorpId = uuidv4();
  const newAccount = {
    id: newCorpId,
    bankId,
    ownerDiscordId: "SYSTEM",
    accountName: defaultName,
    accountType: "business",
    isSystem: true,
    systemCategory: "corporate",
    balance: inGameBalance,
    isActive: true,
    isFrozen: false,
    existsInGame: true,
    lastSyncedAt: new Date(),
    createdAt: new Date(),
  };

  await db.insert(bankAccounts).values(newAccount);
  return newAccount;
}

/**
 * Records an on-platform fee (e.g. transfer fee, late fee), credits the bank's default
 * in-game corporate account, and logs the transaction with its parsed fee type.
 */
export async function recordBankFee(
  dbOrTx: any,
  params: {
    bankId: string;
    fromAccountId?: string | null;
    amountCents: number;
    feeType: FeeType;
    description?: string;
    category?: string;
    timestamp?: Date;
  }
) {
  const { bankId, fromAccountId = null, amountCents, feeType, description, category, timestamp = new Date() } = params;
  if (amountCents <= 0) return null;

  // Retrieve the bank's default in-game corporate account
  const corpAccount = await getOrCreateBankCorpAccount(dbOrTx, bankId);

  // Credit bank's default corporate account
  await dbOrTx.update(bankAccounts)
    .set({ 
      balance: sql`${bankAccounts.balance} + ${amountCents}`,
      lastSyncedAt: new Date()
    })
    .where(eq(bankAccounts.id, corpAccount.id));

  // Insert fee transaction into the ledger
  const txId = uuidv4();
  const desc = description || `${FEE_TYPE_LABELS[feeType]} Assessed`;

  await dbOrTx.insert(transactions).values({
    id: txId,
    bankId,
    fromAccountId,
    toAccountId: corpAccount.id,
    type: "fee",
    feeType,
    amount: amountCents,
    description: desc,
    category: category || "Fee Income",
    timestamp
  });

  // If CityCorp credentials exist, attempt in-game deposit to the default corp account
  try {
    const bank = await dbOrTx.select().from(banks).where(eq(banks.id, bankId)).get();
    if (bank?.corpId && bank?.corpApiUuid && bank?.corpApiKey && corpAccount.accountName) {
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      await client.deposit(corpAccount.accountName, amountCents / 100);
    }
  } catch (e) {
    console.warn(`[recordBankFee] Remote deposit skipped:`, e);
  }

  return {
    success: true,
    txId,
    corpAccountId: corpAccount.id,
    amountCents,
    feeType
  };
}

/**
 * Checks in-game corp transactions directly via the CityCorp plugin endpoint,
 * parses all potential fee types, and synchronizes them into the bank's ledger.
 */
export async function syncInGameCorpTransactions(db: any, bankId: string) {
  const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  if (!bank) throw new Error("Bank not found");

  const corpAccount = await getOrCreateBankCorpAccount(db, bankId);

  let inGameTxsCount = 0;
  let newImportedCount = 0;
  let remoteBalanceCents = corpAccount.balance;
  let syncSource = "local";

  if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
    syncSource = "citycorp_api";
    const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);

    // 1. Fetch live balance of default corp account
    try {
      const details = await client.getAccountDetails(corpAccount.accountName);
      if (details.success && details.balance !== undefined) {
        remoteBalanceCents = Math.round(Number(details.balance) * 100);
        await db.update(bankAccounts).set({
          balance: remoteBalanceCents,
          existsInGame: true,
          lastSyncedAt: new Date(),
          syncError: null
        }).where(eq(bankAccounts.id, corpAccount.id));
      }
    } catch (e) {
      console.warn(`[syncInGameCorpTransactions] Balance fetch error:`, e);
    }

    // 2. Fetch in-game corp transactions from endpoint
    try {
      const remoteTxs = await client.fetchInGameCorpTransactions(corpAccount.accountName, 15);
      inGameTxsCount = remoteTxs.length;

      // Existing local transactions for deduplication
      const existingTxs = await db.select().from(transactions).where(
        and(
          eq(transactions.bankId, bankId),
          or(
            eq(transactions.toAccountId, corpAccount.id),
            eq(transactions.fromAccountId, corpAccount.id)
          )
        )
      );

      const existingIds = new Set(existingTxs.map((t: any) => t.id));
      const existingKeys = new Set(existingTxs.map((t: any) => 
        `${t.amount}_${t.feeType}_${(t.description || "").trim().toLowerCase()}`
      ));

      for (const rTx of remoteTxs) {
        const parsed = parseInGameFeeType(rTx);
        let amount = Number(rTx.amount || rTx.value || 0);
        if (typeof amount === "string") amount = parseFloat(String(amount).replace(/[^0-9.-]+/g, ""));
        const amountCents = Math.abs(Math.round(amount * 100));

        if (amountCents === 0) continue;

        const isOutflow = rTx.type === "withdraw" || rTx.type === "transfer_out" || amount < 0;
        const txDate = new Date(rTx.timestamp || rTx.date || rTx.created_at || Date.now());
        const txKey = `${amountCents}_${parsed.feeType}_${parsed.cleanedDescription.trim().toLowerCase()}`;

        const remoteId = rTx.id ? String(rTx.id) : null;

        if ((!remoteId || !existingIds.has(remoteId)) && !existingKeys.has(txKey)) {
          const newTxId = remoteId || uuidv4();
          await db.insert(transactions).values({
            id: newTxId,
            bankId,
            fromAccountId: isOutflow ? corpAccount.id : null,
            toAccountId: !isOutflow ? corpAccount.id : null,
            type: parsed.isFeeOrInflow ? "fee" : (isOutflow ? "withdraw" : "deposit"),
            feeType: parsed.feeType,
            amount: amountCents,
            description: parsed.cleanedDescription,
            category: parsed.category,
            timestamp: txDate
          });

          newImportedCount++;
          existingKeys.add(txKey);
          if (remoteId) existingIds.add(remoteId);
        }
      }
    } catch (e: any) {
      console.error(`[syncInGameCorpTransactions] Failed to query in-game corp transactions:`, e);
    }
  }

  // 3. Normalize all local fee records and compute comprehensive breakdown
  const stats = await calculateTreasuryFees(db, bankId);

  return {
    success: true,
    syncSource,
    inGameTxsCount,
    newImportedCount,
    defaultCorpAccount: {
      id: corpAccount.id,
      name: corpAccount.accountName,
      balance: remoteBalanceCents
    },
    ...stats
  };
}

/**
 * Calculates accurate corporate fee totals and breakdown by parsing all potential fee types.
 */
export async function calculateTreasuryFees(db: any, bankId: string) {
  const corpAccount = await getOrCreateBankCorpAccount(db, bankId);

  // Retrieve all transactions tied to the bank and default corp account
  const allTxs = await db.select().from(transactions).where(
    and(
      eq(transactions.bankId, bankId),
      or(
        eq(transactions.toAccountId, corpAccount.id),
        eq(transactions.type, "fee"),
        sql`${transactions.feeType} IS NOT NULL`,
        like(transactions.category, "%Fee%"),
        like(transactions.description, "%fee%"),
        like(transactions.description, "%tax%")
      )
    )
  ).orderBy(desc(transactions.timestamp));

  const breakdownMap: Record<FeeType, { amount: number; count: number }> = {
    transfer_fee: { amount: 0, count: 0 },
    deposit_fee: { amount: 0, count: 0 },
    withdraw_fee: { amount: 0, count: 0 },
    wire_fee: { amount: 0, count: 0 },
    late_fee: { amount: 0, count: 0 },
    origination_fee: { amount: 0, count: 0 },
    loan_payment: { amount: 0, count: 0 },
    service_fee: { amount: 0, count: 0 },
    onyx_fee: { amount: 0, count: 0 },
    in_game_tax: { amount: 0, count: 0 },
    other_fee: { amount: 0, count: 0 }
  };

  let totalFeesCollected = 0;
  const parsedTransactions: any[] = [];

  for (const tx of allTxs) {
    let resolvedFeeType = (tx.feeType as FeeType);
    let label = FEE_TYPE_LABELS[resolvedFeeType];

    // If feeType was not previously stamped or needs normalization
    if (!resolvedFeeType || !FEE_TYPE_LABELS[resolvedFeeType]) {
      const parsed = parseInGameFeeType(tx);
      resolvedFeeType = parsed.feeType;
      label = parsed.label;

      // Retroactively stamp feeType on transaction record
      await db.update(transactions).set({
        type: "fee",
        feeType: resolvedFeeType,
        category: parsed.category,
        toAccountId: corpAccount.id
      }).where(eq(transactions.id, tx.id));
    }

    // Only accumulate positive inflows to the bank corp account
    if (tx.amount > 0) {
      breakdownMap[resolvedFeeType].amount += tx.amount;
      breakdownMap[resolvedFeeType].count += 1;
      totalFeesCollected += tx.amount;
    }

    parsedTransactions.push({
      id: tx.id,
      amount: tx.amount,
      feeType: resolvedFeeType,
      feeLabel: FEE_TYPE_LABELS[resolvedFeeType] || "Fee",
      colorClass: FEE_TYPE_COLORS[resolvedFeeType] || FEE_TYPE_COLORS.other_fee,
      description: tx.description,
      category: tx.category,
      timestamp: tx.timestamp
    });
  }

  const feeBreakdown = (Object.keys(breakdownMap) as FeeType[]).map((type) => {
    const data = breakdownMap[type];
    const percentage = totalFeesCollected > 0 ? (data.amount / totalFeesCollected) * 100 : 0;
    return {
      type,
      label: FEE_TYPE_LABELS[type],
      colorClass: FEE_TYPE_COLORS[type],
      amount: data.amount,
      count: data.count,
      percentage: Number(percentage.toFixed(1))
    };
  });

  return {
    totalFeesCollected,
    totalFeeCount: allTxs.length,
    feeBreakdown,
    recentTransactions: parsedTransactions.slice(0, 100)
  };
}
