/**
 * Slate Banking Platform — Loan Interest Calculation & Display Utilities
 * Supports Weekly Simple Interest, Monthly Simple Interest, Flat Surcharges, and Standard APR.
 */

export type LoanInterestType = "apr" | "weekly" | "monthly" | "flat";
export type LoanTermUnit = "days" | "weeks" | "months";
export type RepaymentFrequency = "daily" | "weekly" | "biweekly" | "monthly";

export interface LoanCalculationOptions {
  principalCents: number;
  rate: number; // Percent (e.g. 2.0 or 200 for 2.00%)
  rateType?: LoanInterestType | string;
  termDuration?: number; // e.g. 2
  termUnit?: LoanTermUnit | string; // 'weeks' | 'days' | 'months'
  termDays?: number; // fallback raw days if termDuration/unit not provided
  repaymentFrequency?: RepaymentFrequency | string;
}

export interface LoanCalculationResult {
  principalCents: number;
  ratePercent: number;
  rateType: LoanInterestType;
  rateDisplay: string;
  rateLabelLong: string;
  termDays: number;
  termDisplay: string;
  equivalentApr: number;
  totalInterestCents: number;
  totalPayoffCents: number;
  installmentCount: number;
  installmentCents: number;
  frequencyLabel: string;
}

/**
 * Normalizes an interest rate input into a standard percentage number (e.g. 5.0).
 */
export function normalizeRatePercent(rawRate: number | string | null | undefined): number {
  if (rawRate == null) return 0;
  const num = typeof rawRate === "number" ? rawRate : parseFloat(String(rawRate));
  if (!Number.isFinite(num) || num < 0) return 0;
  // If stored in basis points (> 100, e.g. 500 for 5.0%), normalize to percentage
  // Note: exception if rawRate is truly a 104% APR passed as 104 vs 10400 basis points
  return num > 1000 ? num / 100 : num > 100 && num % 25 === 0 && num <= 10000 ? num / 100 : num;
}

/**
 * Converts any combination of duration and unit into raw calendar days.
 */
export function convertTermToDays(duration?: number | null, unit?: string | null, fallbackDays: number = 30): number {
  const dur = Math.max(1, Math.round(Number(duration || 0)));
  const u = (unit || "days").toLowerCase();
  if (u === "weeks" || u === "week" || u === "w") return dur * 7;
  if (u === "months" || u === "month" || u === "m" || u === "mo") return dur * 30;
  if (dur > 0 && unit) return dur;
  return Math.max(1, fallbackDays);
}

/**
 * Formats a concise human-readable loan rate string (e.g. "2.00% / wk", "5.00% / mo", "12.00% APR").
 */
export function formatLoanRate(rate: number | string | null | undefined, type?: string | null, short: boolean = true): string {
  const pct = normalizeRatePercent(rate);
  const cleanType = (type || "apr").toLowerCase() as LoanInterestType;

  if (cleanType === "weekly") {
    return short ? `${pct.toFixed(pct % 1 === 0 ? 1 : 2)}% / wk` : `${pct.toFixed(2)}% Simple Interest / week`;
  }
  if (cleanType === "monthly") {
    return short ? `${pct.toFixed(pct % 1 === 0 ? 1 : 2)}% / mo` : `${pct.toFixed(2)}% Simple Interest / month`;
  }
  if (cleanType === "flat") {
    return short ? `${pct.toFixed(pct % 1 === 0 ? 1 : 2)}% Flat` : `${pct.toFixed(2)}% Flat Term Surcharge`;
  }
  return short ? `${pct.toFixed(pct % 1 === 0 ? 1 : 2)}% APR` : `${pct.toFixed(2)}% Fixed APR`;
}

/**
 * Calculates the annualized equivalent APR for transparent disclosure.
 */
export function getEquivalentApr(rate: number | string | null | undefined, type?: string | null, termDays: number = 30): number {
  const pct = normalizeRatePercent(rate);
  const cleanType = (type || "apr").toLowerCase() as LoanInterestType;

  if (cleanType === "weekly") {
    return pct * 52;
  }
  if (cleanType === "monthly") {
    return pct * 12;
  }
  if (cleanType === "flat") {
    const days = Math.max(1, termDays);
    return pct * (365 / days);
  }
  return pct;
}

/**
 * Computes complete loan repayment figures including total simple/APR interest and installment amounts.
 */
export function calculateLoanBreakdown(opts: LoanCalculationOptions): LoanCalculationResult {
  const principalCents = Math.max(0, Math.round(opts.principalCents));
  const ratePercent = normalizeRatePercent(opts.rate);
  const rateType = ((opts.rateType || "apr").toLowerCase()) as LoanInterestType;
  
  // Calculate term in days
  let termDays = opts.termDays || 30;
  if (opts.termDuration && opts.termDuration > 0) {
    termDays = convertTermToDays(opts.termDuration, opts.termUnit, termDays);
  } else if (opts.termUnit === "weeks") {
    termDays = Math.max(7, termDays);
  }

  // Calculate term display
  let termDisplay = `${termDays} Days`;
  if (termDays % 30 === 0) {
    termDisplay = `${termDays / 30} Month${termDays / 30 > 1 ? "s" : ""}`;
  } else if (termDays % 7 === 0) {
    termDisplay = `${termDays / 7} Week${termDays / 7 > 1 ? "s" : ""}`;
  }

  const equivalentApr = getEquivalentApr(ratePercent, rateType, termDays);

  // Compute Total Interest
  let totalInterestCents = 0;
  if (rateType === "weekly") {
    const elapsedWeeks = termDays / 7;
    const weeklyRateDecimal = ratePercent / 100;
    totalInterestCents = Math.round(principalCents * weeklyRateDecimal * elapsedWeeks);
  } else if (rateType === "monthly") {
    const elapsedMonths = termDays / 30;
    const monthlyRateDecimal = ratePercent / 100;
    totalInterestCents = Math.round(principalCents * monthlyRateDecimal * elapsedMonths);
  } else if (rateType === "flat") {
    const flatRateDecimal = ratePercent / 100;
    totalInterestCents = Math.round(principalCents * flatRateDecimal);
  } else {
    // APR Standard Simple Accrual over term
    const annualRateDecimal = ratePercent / 100;
    totalInterestCents = Math.round(principalCents * annualRateDecimal * (termDays / 365));
  }

  const totalPayoffCents = principalCents + totalInterestCents;

  // Repayment Frequency & Installment calculation
  const freq = (opts.repaymentFrequency || (termDays <= 14 ? "weekly" : "monthly")).toLowerCase() as RepaymentFrequency;
  let freqDays = 30;
  let frequencyLabel = "Monthly";
  if (freq === "daily") {
    freqDays = 1;
    frequencyLabel = "Daily";
  } else if (freq === "weekly") {
    freqDays = 7;
    frequencyLabel = "Weekly";
  } else if (freq === "biweekly") {
    freqDays = 14;
    frequencyLabel = "Bi-weekly";
  }

  const installmentCount = Math.max(1, Math.round(termDays / freqDays));
  const installmentCents = Math.ceil(totalPayoffCents / installmentCount);

  return {
    principalCents,
    ratePercent,
    rateType,
    rateDisplay: formatLoanRate(ratePercent, rateType, true),
    rateLabelLong: formatLoanRate(ratePercent, rateType, false),
    termDays,
    termDisplay,
    equivalentApr,
    totalInterestCents,
    totalPayoffCents,
    installmentCount,
    installmentCents,
    frequencyLabel,
  };
}
