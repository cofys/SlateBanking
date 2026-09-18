import { db } from "../db/index";
import { loans, bankAccounts, bankSettings, loanProducts, banks, auditLogs, cards } from "../db/schema";
import { eq, and, lte, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { botManager } from "../lib/bot_manager";

export type LoanRow = typeof loans.$inferSelect;
export type AccountRow = typeof bankAccounts.$inferSelect;

export const DEFAULT_LOAN_APR = 500; // 5.00% stored as percent * 100
export const DEFAULT_TERM_MONTHS = 12;
export const MIN_INSTALLMENT_CENTS = 100;
export const LATE_FEE_FLAT_CENTS = 2500;
export const LATE_FEE_RATE = 0.05;
export const MISSES_TO_DEFAULT = 3;

export type LoanPolicy = {
  defaultApr: number;
  defaultTermMonths: number;
  maxAmountCents: number;
  paymentPeriodDays: number;
  autoDebit: boolean;
  lateFeeFlatCents: number;
  lateFeePercent: number;
  missesToDefault: number;
  gracePeriodDays: number;
  retryDays: number;
  accrueInterest: boolean;
  interestAccrual: "daily" | "monthly" | "none";
  accrueOnDefaulted: boolean;
  compoundLateFees: boolean;
  minInstallmentCents: number;
  requireSignature: boolean;
  allowCitizenApply: boolean;
  cureDefaultOnPay: boolean;
  daysInYear: number;
};

const policyCache = new Map<string, { at: number; policy: LoanPolicy }>();

function num(v: any, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function policyFromSettings(settings: any | null | undefined): LoanPolicy {
  const accrual = String(settings?.loanInterestAccrual || "daily");
  return {
    defaultApr: Math.max(0, num(settings?.defaultLoanApr, DEFAULT_LOAN_APR)),
    defaultTermMonths: Math.max(1, Math.round(num(settings?.defaultLoanTermMonths, DEFAULT_TERM_MONTHS))),
    maxAmountCents: Math.max(0, Math.round(num(settings?.maxLoanAmountCents, 0))),
    paymentPeriodDays: Math.max(1, Math.round(num(settings?.loanPaymentPeriodDays, 30))),
    autoDebit: settings?.loanAutoDebitEnabled !== false && settings?.loanAutoDebitEnabled !== 0,
    lateFeeFlatCents: Math.max(0, Math.round(num(settings?.loanLateFeeFlatCents, LATE_FEE_FLAT_CENTS))),
    lateFeePercent: Math.max(0, num(settings?.loanLateFeePercent, 500)),
    missesToDefault: Math.max(1, Math.round(num(settings?.loanMissesToDefault, MISSES_TO_DEFAULT))),
    gracePeriodDays: Math.max(0, Math.round(num(settings?.loanGracePeriodDays, 0))),
    retryDays: Math.max(1, Math.round(num(settings?.loanRetryDays, 7))),
    accrueInterest: settings?.loanAccrueInterest !== false && settings?.loanAccrueInterest !== 0,
    interestAccrual: accrual === "monthly" || accrual === "none" ? accrual : "daily",
    accrueOnDefaulted: settings?.loanAccrueOnDefaulted !== false && settings?.loanAccrueOnDefaulted !== 0,
    compoundLateFees: settings?.loanCompoundLateFees !== false && settings?.loanCompoundLateFees !== 0,
    minInstallmentCents: Math.max(1, Math.round(num(settings?.loanMinInstallmentCents, MIN_INSTALLMENT_CENTS))),
    requireSignature: !!settings?.loanRequireSignature,
    allowCitizenApply: settings?.loanAllowCitizenApply !== false && settings?.loanAllowCitizenApply !== 0,
    cureDefaultOnPay: !!settings?.loanCureDefaultOnPay,
    daysInYear: num(settings?.loanDaysInYear, 365) === 360 ? 360 : 365,
  };
}

export async function loadLoanPolicy(bankId: string): Promise<LoanPolicy> {
  const hit = policyCache.get(bankId);
  if (hit && Date.now() - hit.at < 15_000) return hit.policy;
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const policy = policyFromSettings(settings);
  policyCache.set(bankId, { at: Date.now(), policy });
  return policy;
}

export const COLLECTABLE_LOAN_STATUSES = new Set(["active", "delinquent", "defaulted"]);
export const PENDING_LOAN_STATUSES = new Set(["pending", "awaiting_signature"]);
export const TERMINAL_LOAN_STATUSES = new Set(["paid_off", "paid", "rejected"]);

export function presentLoan(loan: any) {
  if (!loan) return loan;
  return {
    ...loan,
    amount: loan.principalAmount,
    remainingBalance: loan.remainingAmount,
    termMonths: loan.termMonths || DEFAULT_TERM_MONTHS,
  };
}

/** Products store APR as percent (5 or 5.5). Loans store percent * 100 (500 = 5.00%). */
export function productAprToLoanRate(productRate: number | null | undefined): number {
  if (productRate == null || !Number.isFinite(Number(productRate)) || Number(productRate) < 0) {
    return DEFAULT_LOAN_APR;
  }
  const n = Number(productRate);
  if (n <= 100) return Math.round(n * 100);
  return Math.round(n);
}

export function computeInstallment(loan: {
  principalAmount: number;
  remainingAmount: number;
  termMonths?: number | null;
}, minCents: number = MIN_INSTALLMENT_CENTS): number {
  const months = Math.max(1, loan.termMonths || DEFAULT_TERM_MONTHS);
  const byTerm = Math.ceil(Math.max(0, loan.principalAmount) / months);
  return Math.min(Math.max(0, loan.remainingAmount), Math.max(minCents, byTerm));
}

export function normalizeLoanStatus(status: string | undefined | null): string {
  if (!status) return "pending";
  if (status === "paid") return "paid_off";
  if (status === "approved") return "active";
  return status;
}

function parseCollateralCents(raw: any): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Ledger-only application of a collected payment. Cash must already have moved via CityCorp.
 * Late fees live inside remainingAmount; lateFeeAmount is a tracker, not an extra balance.
 * Penny payments reduce remaining but do not roll the due date.
 */
export async function applyLoanPaymentLedger(opts: {
  loan: LoanRow;
  amountCents: number;
  now?: Date;
  policy?: LoanPolicy;
}): Promise<{
  newRemaining: number;
  isPaidOff: boolean;
  lateFeeSettled: number;
  nextPaymentDate: Date;
  status: string;
  isDelinquent: boolean;
}> {
  const now = opts.now || new Date();
  const policy = opts.policy || await loadLoanPolicy(opts.loan.bankId);
  const amount = Math.max(0, Math.round(opts.amountCents));
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const currentLateFee = opts.loan.lateFeeAmount || 0;
  const totalOwed = policy.compoundLateFees
    ? opts.loan.remainingAmount
    : opts.loan.remainingAmount + currentLateFee;
  const applied = Math.min(amount, totalOwed);
  if (applied <= 0) {
    throw new Error("Loan has no remaining balance");
  }

  const installment = computeInstallment(opts.loan, policy.minInstallmentCents);

  let lateFeeSettled: number;
  let newLateFee: number;
  let newRemaining: number;
  if (policy.compoundLateFees) {
    newRemaining = Math.max(0, opts.loan.remainingAmount - applied);
    lateFeeSettled = Math.min(applied, currentLateFee);
    newLateFee = Math.max(0, currentLateFee - lateFeeSettled);
  } else {
    lateFeeSettled = Math.min(applied, currentLateFee);
    newLateFee = Math.max(0, currentLateFee - lateFeeSettled);
    newRemaining = Math.max(0, opts.loan.remainingAmount - (applied - lateFeeSettled));
  }

  const isPaidOff = newRemaining <= 0 && newLateFee <= 0;
  const coversInstallment = applied >= installment;

  let nextPaymentDate = opts.loan.nextPaymentDate ? new Date(opts.loan.nextPaymentDate) : now;
  if (!isPaidOff && coversInstallment) {
    const base = nextPaymentDate.getTime() < now.getTime() ? now : nextPaymentDate;
    nextPaymentDate = new Date(base);
    nextPaymentDate.setDate(nextPaymentDate.getDate() + policy.paymentPeriodDays);
  }

  let status: string;
  if (isPaidOff) status = "paid_off";
  else if (opts.loan.status === "defaulted" && !policy.cureDefaultOnPay) status = "defaulted";
  else if (opts.loan.status === "defaulted" && policy.cureDefaultOnPay && newLateFee === 0) status = "active";
  else if (opts.loan.status === "defaulted") status = "defaulted";
  else if (newLateFee > 0) status = "delinquent";
  else status = "active";

  const isDelinquent = !isPaidOff && (newLateFee > 0 || status === "delinquent" || status === "defaulted");
  const missedPaymentsCount = isDelinquent ? (opts.loan.missedPaymentsCount || 0) : 0;
  const collateralStatus = isPaidOff && opts.loan.collateralStatus === "pledged"
    ? "released"
    : opts.loan.collateralStatus;

  await db.update(loans)
    .set({
      remainingAmount: newRemaining,
      lateFeeAmount: newLateFee,
      isDelinquent,
      missedPaymentsCount,
      status,
      collateralStatus,
      nextPaymentDate: isPaidOff ? opts.loan.nextPaymentDate : nextPaymentDate,
      lastPaymentAttemptAt: now,
    })
    .where(eq(loans.id, opts.loan.id));

  return { newRemaining, isPaidOff, lateFeeSettled, nextPaymentDate, status, isDelinquent };
}

export async function collectLoanPayment(opts: {
  loan: LoanRow;
  fromAccount: AccountRow;
  amountCents: number;
  description?: string;
}): Promise<{
  txId: string;
  newRemaining: number;
  isPaidOff: boolean;
  status: string;
  appliedCents: number;
}> {
  if (opts.fromAccount.bankId !== opts.loan.bankId) {
    throw new Error("Payment account must belong to the same bank as the loan");
  }
  const status = opts.loan.status || "pending";
  if (TERMINAL_LOAN_STATUSES.has(status)) {
    throw new Error("Loan is already closed");
  }
  if (!COLLECTABLE_LOAN_STATUSES.has(status)) {
    throw new Error("Loan is not in a collectable status");
  }

  const policy = await loadLoanPolicy(opts.loan.bankId);
  const owed = policy.compoundLateFees
    ? opts.loan.remainingAmount
    : opts.loan.remainingAmount + (opts.loan.lateFeeAmount || 0);
  const appliedCents = Math.min(Math.max(0, Math.round(opts.amountCents)), owed);
  if (appliedCents <= 0) {
    throw new Error("Loan has no remaining balance");
  }

  const { collectToPoolOrTreasury } = await import("../lib/citycorp_money");
  const moved = await collectToPoolOrTreasury({
    bankId: opts.loan.bankId,
    fromAccount: opts.fromAccount,
    amountCents: appliedCents,
    description: opts.description || `Loan payment (Loan #${opts.loan.id.substring(0, 8)})`,
    type: "loan_payment",
  });

  const ledger = await applyLoanPaymentLedger({ loan: opts.loan, amountCents: appliedCents, policy });
  return {
    txId: moved.txId,
    newRemaining: ledger.newRemaining,
    isPaidOff: ledger.isPaidOff,
    status: ledger.status,
    appliedCents,
  };
}

/**
 * Handles disbursement of loan funds via CityCorp pool/operating book transfer.
 */
export async function disburseLoan(loan: LoanRow) {
  const ts = new Date();
  const targetAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, loan.accountId)).get();
  if (!targetAcc) throw new Error("Loan target account not found");
  if (targetAcc.bankId !== loan.bankId) throw new Error("Loan target account is not at this bank");
  if (targetAcc.isFrozen || !targetAcc.isActive) {
    throw new Error("Loan target account is frozen or inactive");
  }

  const { disburseFromPoolOrOperating } = await import("../lib/citycorp_money");
  const moved = await disburseFromPoolOrOperating({
    bankId: loan.bankId,
    toAccount: targetAcc,
    amountCents: loan.principalAmount,
    description: `Loan Disbursement (Principal: $${(loan.principalAmount / 100).toFixed(2)})`,
  });

  await db.update(loans)
    .set({ lastInterestAccrualAt: ts })
    .where(eq(loans.id, loan.id));

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId: loan.bankId,
    userDiscordId: loan.discordId,
    action: "loan_disbursed",
    details: `Disbursed $${(loan.principalAmount / 100).toFixed(2)} to ${targetAcc.accountName} via CityCorp book transfer (tx ${moved.txId}).`,
    timestamp: ts,
  });
}

export async function submitLoanApplication(opts: {
  bankId: string;
  discordId: string;
  accountId: string;
  principalAmount: number;
  purpose?: string | null;
  productId?: string | null;
  termMonths?: number | null;
  interestRate?: number | null;
  collateralDescription?: string | null;
  collateralValue?: string | number | null;
  allowAutoApprove?: boolean;
}): Promise<{ loan: LoanRow; autoApprove: boolean; awaitingSignature: boolean; status: string }> {
  const principalAmount = Math.round(Number(opts.principalAmount));
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    throw new Error("Invalid loan amount");
  }

  const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, opts.accountId)).get();
  if (!account || account.bankId !== opts.bankId) {
    throw new Error("Deposit account not found at this bank");
  }

  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, opts.bankId)).get();
  if (!settings || !settings.enableLoans) {
    throw new Error("Loans are disabled for this bank");
  }
  const policy = policyFromSettings(settings);
  policyCache.set(opts.bankId, { at: Date.now(), policy });

  if (!policy.allowCitizenApply && opts.allowAutoApprove) {
    throw new Error("This bank is not accepting citizen loan applications. Contact staff.");
  }

  let interestRate = opts.interestRate != null ? Math.round(Number(opts.interestRate)) : policy.defaultApr;
  if (!Number.isFinite(interestRate) || interestRate < 0) interestRate = policy.defaultApr;
  let termMonths = opts.termMonths != null ? Math.round(Number(opts.termMonths)) : policy.defaultTermMonths;
  if (!Number.isFinite(termMonths) || termMonths < 1) termMonths = policy.defaultTermMonths;
  let productId: string | null = opts.productId || null;

  if (productId) {
    const product = await db.select().from(loanProducts).where(
      and(eq(loanProducts.id, productId), eq(loanProducts.bankId, opts.bankId))
    ).get();
    if (!product || !product.isActive) throw new Error("Loan product is not available");
    if (principalAmount > product.maxAmount) {
      throw new Error(`Amount exceeds this product's maximum of $${(product.maxAmount / 100).toFixed(2)}`);
    }
    interestRate = productAprToLoanRate(product.interestRate);
    termMonths = Math.max(1, Math.round((product.termDays || 30) / 30));
  }

  if (policy.maxAmountCents > 0 && principalAmount > policy.maxAmountCents) {
    throw new Error(`Amount exceeds this bank's maximum of $${(policy.maxAmountCents / 100).toFixed(2)}`);
  }

  let autoApprove = false;
  if (opts.allowAutoApprove) {
    if (settings.enableAccountTiers && account.tierId && settings.accountTiers) {
      const tier = (settings.accountTiers as any[]).find((t) => t.id === account.tierId);
      if (tier && tier.autoApproveLoans && principalAmount <= (tier.maxAutoApproveLoanAmount || 0)) {
        autoApprove = true;
      }
    } else if (!settings.enableAccountTiers) {
      autoApprove = !!settings.autoApproveLoans && principalAmount <= (settings.maxAutoApproveLoanAmount || 0);
    }
  }

  const nextPaymentDate = new Date();
  nextPaymentDate.setDate(nextPaymentDate.getDate() + policy.paymentPeriodDays);

  const loanId = uuidv4();
  let contractUrl: string | null = null;
  if (settings.enableGoogleDocsContracts) {
    const bankRec = await db.select().from(banks).where(eq(banks.id, opts.bankId)).get();
    const { generateContractUrl } = await import("../lib/google_docs_contracts");
    contractUrl = generateContractUrl(settings.googleDocsLoanTemplateUrl, {
      bankName: bankRec?.name || "Slate Bank",
      clientDiscordId: opts.discordId,
      contractType: "loan",
      contractId: loanId,
      amount: principalAmount,
      interestRate,
      termDays: termMonths * 30,
      purpose: opts.purpose || undefined,
    });
  }

  const colVal = parseCollateralCents(opts.collateralValue);
  const colStatus = opts.collateralDescription ? "pledged" : "none";
  const requireSignature = autoApprove && (policy.requireSignature || (!!settings.enableGoogleDocsContracts && !!settings.googleDocsAutoGenerate));

  await db.insert(loans).values({
    id: loanId,
    bankId: opts.bankId,
    discordId: opts.discordId,
    accountId: opts.accountId,
    principalAmount,
    remainingAmount: principalAmount,
    interestRate,
    nextPaymentDate,
    purpose: opts.purpose || null,
    collateralDescription: opts.collateralDescription || null,
    collateralValue: colVal,
    collateralStatus: colStatus,
    status: "pending",
    contractUrl,
    productId,
    termMonths,
    createdAt: new Date(),
  });

  let status = "pending";
  let awaitingSignature = false;

  if (autoApprove && requireSignature) {
    await db.update(loans).set({ status: "awaiting_signature" }).where(eq(loans.id, loanId));
    status = "awaiting_signature";
    awaitingSignature = true;
  } else if (autoApprove) {
    const insertedLoan = await db.select().from(loans).where(eq(loans.id, loanId)).get();
    if (insertedLoan) {
      try {
        await disburseLoan(insertedLoan);
        await db.update(loans).set({ status: "active" }).where(eq(loans.id, loanId));
        status = "active";
      } catch (err: any) {
        botManager.sendNotification(
          opts.bankId,
          `New Loan Application:\nDiscord ID: ${opts.discordId}\nAmount: $${(principalAmount / 100).toFixed(2)}\nPurpose: ${opts.purpose || "None specified"}\nStatus: Pending (auto-disburse failed: ${err.message || "CityCorp error"})`
        );
        const loan = await db.select().from(loans).where(eq(loans.id, loanId)).get();
        return { loan: loan!, autoApprove: false, awaitingSignature: false, status: "pending" };
      }
    }
  }

  botManager.sendNotification(
    opts.bankId,
    `New Loan Application:\nDiscord ID: ${opts.discordId}\nAmount: $${(principalAmount / 100).toFixed(2)}\nPurpose: ${opts.purpose || "None specified"}\nStatus: ${status === "active" ? "Auto-Approved" : awaitingSignature ? "Awaiting Signature" : "Pending Review"}`
  );

  const loan = await db.select().from(loans).where(eq(loans.id, loanId)).get();
  return { loan: loan!, autoApprove: status === "active" || awaitingSignature, awaitingSignature, status };
}

async function skipLoanUntilNextWindow(loanId: string, now: Date, retryDays: number) {
  const nextAttemptDate = new Date(now);
  nextAttemptDate.setDate(nextAttemptDate.getDate() + Math.max(1, retryDays));
  await db.update(loans)
    .set({
      lastPaymentAttemptAt: now,
      nextPaymentDate: nextAttemptDate,
    })
    .where(eq(loans.id, loanId));
}

/**
 * Process automated loan repayment debits, late fees, delinquency, and defaults.
 * Auto-debits ONLY active or delinquent loans (never pending or approved-unfunded).
 */
export async function processDueLoanRepayments(targetBankId?: string, opts?: { ignoreAutoDebitFlag?: boolean }) {
  const now = new Date();

  const dueLoans = await db.select()
    .from(loans)
    .where(
      and(
        inArray(loans.status, ["active", "delinquent"]),
        lte(loans.nextPaymentDate, now)
      )
    );

  if (dueLoans.length === 0) {
    return { processed: 0, debited: 0, defaulted: 0, lateFees: 0 };
  }

  let debitedCount = 0;
  let defaultedCount = 0;
  let lateFeesCount = 0;
  const policies = new Map<string, LoanPolicy>();

  for (const loan of dueLoans) {
    if (targetBankId && loan.bankId !== targetBankId) continue;

    let policy = policies.get(loan.bankId);
    if (!policy) {
      policy = await loadLoanPolicy(loan.bankId);
      policies.set(loan.bankId, policy);
    }
    if (!policy.autoDebit && !opts?.ignoreAutoDebitFlag) continue;

    let account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, loan.accountId)).get();
    if (account) {
      try {
        const { clientForBank, loadBank, refreshAccountCache } = await import("../lib/citycorp_money");
        const bank = await loadBank(loan.bankId);
        const client = clientForBank(bank);
        if (client) {
          const live = await refreshAccountCache({
            bankId: loan.bankId,
            accountName: account.accountName,
            accountId: account.id,
            client,
          });
          if (live != null) account = { ...account, balance: live };
        }
      } catch (e) {
        console.error("[loan auto debit] cache refresh failed", e);
      }
    }

    const installment = computeInstallment(loan, policy.minInstallmentCents);

    if (account && account.balance >= installment) {
      try {
        await collectLoanPayment({
          loan,
          fromAccount: account,
          amountCents: installment,
          description: `Automated loan debit (Loan #${loan.id.substring(0, 8)})`,
        });
      } catch (e: any) {
        console.error("[loan auto debit] CityCorp collect failed", e);
        await skipLoanUntilNextWindow(loan.id, now, policy.retryDays);
        continue;
      }

      const isPaidOff = installment >= loan.remainingAmount;
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: loan.bankId,
        userDiscordId: loan.discordId,
        action: "loan_auto_debit_success",
        details: `Automated debit of $${(installment / 100).toFixed(2)} successful for Loan #${loan.id.substring(0, 8)}.`,
        timestamp: now,
      });

      debitedCount++;
      botManager.sendNotification(
        loan.bankId,
        `💳 **Automated Loan Repayment**: Debited $${(installment / 100).toFixed(2)} from account **${account.accountName}** (<@${loan.discordId}>) for Loan #${loan.id.substring(0, 8)}.${isPaidOff ? " 🎉 **LOAN FULLY PAID OFF!**" : ""}`
      );
      import("../lib/customer_notify.js").then(({ notifyLoanEvent }) =>
        notifyLoanEvent({
          bankId: loan.bankId,
          discordId: loan.discordId,
          kind: "paid",
          loanId: loan.id,
          amountCents: installment,
          extra: isPaidOff ? "This loan is paid off." : undefined,
        })
      ).catch(() => {});
    } else {
      const due = loan.nextPaymentDate ? new Date(loan.nextPaymentDate) : now;
      const graceEnd = new Date(due);
      graceEnd.setDate(graceEnd.getDate() + policy.gracePeriodDays);
      if (now.getTime() < graceEnd.getTime()) {
        continue;
      }

      const missedCount = (loan.missedPaymentsCount || 0) + 1;
      const pct = policy.lateFeePercent / 10000;
      const lateFee = Math.max(policy.lateFeeFlatCents, Math.round(installment * pct));
      const updatedRemaining = policy.compoundLateFees ? loan.remainingAmount + lateFee : loan.remainingAmount;
      const updatedTotalLateFees = (loan.lateFeeAmount || 0) + lateFee;
      const isDefault = missedCount >= policy.missesToDefault;
      const newStatus = isDefault ? "defaulted" : "delinquent";
      const newCollateralStatus = (isDefault && loan.collateralStatus === "pledged") ? "seized" : loan.collateralStatus;

      const nextAttemptDate = new Date();
      nextAttemptDate.setDate(nextAttemptDate.getDate() + policy.retryDays);

      await db.update(loans)
        .set({
          remainingAmount: updatedRemaining,
          lateFeeAmount: updatedTotalLateFees,
          isDelinquent: true,
          missedPaymentsCount: missedCount,
          status: newStatus,
          collateralStatus: newCollateralStatus,
          nextPaymentDate: nextAttemptDate,
          lastPaymentAttemptAt: now,
        })
        .where(eq(loans.id, loan.id));

      lateFeesCount++;
      if (isDefault) defaultedCount++;

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: loan.bankId,
        userDiscordId: loan.discordId,
        action: isDefault ? "loan_defaulted" : "loan_auto_debit_failed",
        details: `Auto debit failed for Loan #${loan.id.substring(0, 8)} (Account balance: $${((account?.balance || 0) / 100).toFixed(2)} < installment $${(installment / 100).toFixed(2)}). Missed count: ${missedCount}. Late fee assessed: $${(lateFee / 100).toFixed(2)}.${isDefault ? " LOAN MARKED AS DEFAULTED. Collateral status: SEIZED." : ""}`,
        timestamp: now,
      });

      botManager.sendNotification(
        loan.bankId,
        isDefault
          ? `🚨 **LOAN DEFAULT NOTICE**: Loan #${loan.id.substring(0, 8)} (<@${loan.discordId}>) has DEFAULTED after ${missedCount} missed payments! Late fee $${(lateFee / 100).toFixed(2)} added. Collateral status updated to **SEIZED**.`
          : `⚠️ **Loan Repayment Failed**: Automated debit of $${(installment / 100).toFixed(2)} failed for Loan #${loan.id.substring(0, 8)} (<@${loan.discordId}>). Late fee penalty of $${(lateFee / 100).toFixed(2)} added. Loan is now **DELINQUENT**.`
      );
      import("../lib/customer_notify.js").then(({ notifyLoanEvent }) =>
        notifyLoanEvent({
          bankId: loan.bankId,
          discordId: loan.discordId,
          kind: isDefault ? "defaulted" : "failed",
          loanId: loan.id,
          amountCents: installment,
          extra: isDefault
            ? "This loan has defaulted. Contact the bank."
            : `Late fee $${(lateFee / 100).toFixed(2)} assessed. Please fund your account.`,
        })
      ).catch(() => {});
    }
  }

  return { processed: dueLoans.length, debited: debitedCount, defaulted: defaultedCount, lateFees: lateFeesCount };
}

/**
 * Accrue and compound daily loan interest on active, delinquent, or defaulted loans.
 * APR is stored as percent * 100 (500 = 5.00%), so annualRate = interestRate / 10000.
 */
export async function accrueLoanInterest(targetBankId?: string) {
  const now = new Date();

  const activeLoans = await db.select()
    .from(loans)
    .where(inArray(loans.status, ["active", "delinquent", "defaulted"]));

  let accruedCount = 0;
  let totalInterestCents = 0;
  const policies = new Map<string, LoanPolicy>();

  for (const loan of activeLoans) {
    if (targetBankId && loan.bankId !== targetBankId) continue;

    let policy = policies.get(loan.bankId);
    if (!policy) {
      policy = await loadLoanPolicy(loan.bankId);
      policies.set(loan.bankId, policy);
    }
    if (!policy.accrueInterest || policy.interestAccrual === "none") continue;
    if (loan.status === "defaulted" && !policy.accrueOnDefaulted) continue;

    const lastAccrual = loan.lastInterestAccrualAt || loan.createdAt;
    const diffMs = now.getTime() - new Date(lastAccrual).getTime();
    const daysElapsed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const minDays = policy.interestAccrual === "monthly" ? 30 : 1;
    if (daysElapsed < minDays) continue;

    const annualRate = loan.interestRate / 10000;
    const daysInYear = policy.daysInYear || 365;
    const interest = policy.interestAccrual === "monthly"
      ? Math.floor((loan.remainingAmount * annualRate * Math.floor(daysElapsed / 30)) / 12)
      : Math.floor((loan.remainingAmount * annualRate * daysElapsed) / daysInYear);

    if (interest > 0) {
      const newRemaining = loan.remainingAmount + interest;
      await db.update(loans)
        .set({
          remainingAmount: newRemaining,
          lastInterestAccrualAt: now,
        })
        .where(eq(loans.id, loan.id));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: loan.bankId,
        userDiscordId: loan.discordId,
        action: "loan_interest_accrued",
        details: `Accrued $${(interest / 100).toFixed(2)} interest over ${daysElapsed} days at APR ${(loan.interestRate / 100).toFixed(2)}% on Loan #${loan.id.substring(0, 8)}. New balance: $${(newRemaining / 100).toFixed(2)}`,
        timestamp: now,
      });

      accruedCount++;
      totalInterestCents += interest;
    } else {
      await db.update(loans)
        .set({ lastInterestAccrualAt: now })
        .where(eq(loans.id, loan.id));
    }
  }

  return { accruedLoans: accruedCount, totalInterestAccruedCents: totalInterestCents };
}

let loanCronInterval: NodeJS.Timeout | null = null;

/**
 * Automatically process credit card minimum payments from linked accounts.
 * Only active (unlocked) credit cards with nextPaymentDate <= now.
 * Collects via CityCorp pool/treasury rails — never locally mints.
 */
export async function processDueCreditRepayments(targetBankId?: string) {
  const now = new Date();

  const dueCards = await db.select()
    .from(cards)
    .where(
      and(
        eq(cards.type, "credit"),
        eq(cards.isLocked, false),
        lte(cards.nextPaymentDate, now)
      )
    );

  if (dueCards.length === 0) return { processed: 0, debited: 0, failed: 0 };

  let debitedCount = 0;
  let failedCount = 0;

  for (const card of dueCards) {
    if (targetBankId && card.bankId !== targetBankId) continue;
    const lastFour = String(card.cardNumber || "").slice(-4);

    if ((card.creditUsed || 0) <= 0) {
      const nextDate = new Date(card.nextPaymentDate || now);
      nextDate.setDate(nextDate.getDate() + 30);
      await db.update(cards).set({ nextPaymentDate: nextDate }).where(eq(cards.id, card.id));
      continue;
    }

    const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, card.accountId)).get();

    const apr = card.apr || 0;
    const monthlyRate = apr / 10000 / 12;
    let interestCharge = 0;
    if (monthlyRate > 0) {
      interestCharge = Math.floor((card.creditUsed || 0) * monthlyRate);
      if (interestCharge > 0) {
        await db.update(cards).set({ creditUsed: sql`${cards.creditUsed} + ${interestCharge}` }).where(eq(cards.id, card.id));
        card.creditUsed = (card.creditUsed || 0) + interestCharge;

        await db.insert(auditLogs).values({
          id: uuidv4(),
          bankId: card.bankId,
          userDiscordId: "SYSTEM",
          action: "credit_interest_accrued",
          details: `Accrued ${(interestCharge / 100).toFixed(2)} interest on Credit Card ending in ${lastFour}.`,
          timestamp: now,
        });
      }
    }

    let installment = card.minimumPayment || Math.max(2500, Math.ceil((card.creditUsed || 0) * 0.05));
    if (installment > (card.creditUsed || 0)) installment = (card.creditUsed || 0);

    const skipUntilRetryWindow = async () => {
      const nextAttemptDate = new Date(now);
      nextAttemptDate.setDate(nextAttemptDate.getDate() + 7);
      await db.update(cards).set({ nextPaymentDate: nextAttemptDate }).where(eq(cards.id, card.id));
      failedCount++;
    };

    if (account && account.balance >= installment) {
      try {
        const { collectToPoolOrTreasury } = await import("../lib/citycorp_money");
        await collectToPoolOrTreasury({
          bankId: card.bankId,
          fromAccount: account,
          amountCents: installment,
          description: `Automated Credit Card Payment (Card ending in ${lastFour})`,
          type: "loan_payment",
        });
      } catch (e: any) {
        console.error("[credit auto debit] CityCorp collect failed", e);
        await skipUntilRetryWindow();
        continue;
      }

      await db.update(cards)
        .set({ creditUsed: sql`${cards.creditUsed} - ${installment}` })
        .where(eq(cards.id, card.id));

      const nextDate = new Date(card.nextPaymentDate || now);
      nextDate.setDate(nextDate.getDate() + 30);
      await db.update(cards).set({ nextPaymentDate: nextDate }).where(eq(cards.id, card.id));

      debitedCount++;

      const accOwner = account.ownerDiscordId;
      botManager.sendNotification(
        card.bankId,
        `💳 **Automated Credit Card Payment**: Debited ${(installment / 100).toFixed(2)} from account **${account.accountName}** (<@${accOwner}>) for Card ending in ${lastFour}.`
      );
    } else {
      await skipUntilRetryWindow();
      const accOwner = account?.ownerDiscordId || "Unknown";
      botManager.sendNotification(
        card.bankId,
        `⚠️ **Credit Card Repayment Failed**: Automated debit of ${(installment / 100).toFixed(2)} failed for Card ending in ${lastFour} (<@${accOwner}>) due to insufficient funds.`
      );
    }
  }
  return { processed: dueCards.length, debited: debitedCount, failed: failedCount };
}

/** Loan cron is owned by src/lib/cron.ts (15-min). This is a no-op so a second timer cannot double-debit. */
export function startLoanCron() {
  if (loanCronInterval) return;
}

export async function notifyUpcomingLoanPayments() {
  const now = Date.now();
  const horizon = now + 3 * 24 * 60 * 60 * 1000;
  const active = await db.select().from(loans).where(inArray(loans.status, ["active", "delinquent"]));
  let sent = 0;
  for (const loan of active) {
    const due = loan.nextPaymentDate ? new Date(loan.nextPaymentDate).getTime() : 0;
    if (!due || due > horizon || due + 12 * 60 * 60 * 1000 < now) continue;
    const last = (loan as any).lastDueReminderAt ? new Date((loan as any).lastDueReminderAt).getTime() : 0;
    if (last && now - last < 36 * 60 * 60 * 1000) continue;
    const days = Math.max(0, Math.ceil((due - now) / 86400000));
    try {
      const { notifyLoanEvent } = await import("../lib/customer_notify.js");
      await notifyLoanEvent({
        bankId: loan.bankId,
        discordId: loan.discordId,
        kind: "due",
        loanId: loan.id,
        amountCents: loan.remainingAmount,
        extra: days <= 0 ? "Payment is due today." : `Payment due in ${days} day${days === 1 ? "" : "s"}.`,
      });
      await db.update(loans).set({ lastDueReminderAt: new Date() } as any).where(eq(loans.id, loan.id));
      sent++;
    } catch (e) {
      console.error("[loan due reminder]", e);
    }
  }
  return { sent };
}
