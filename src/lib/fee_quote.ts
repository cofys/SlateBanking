export type FeePayerMode = "from_payment" | "sender_covers";

export type FeeSource = "citycorp" | "bank" | "platform";

export interface FeeLine {
  code: string;
  label: string;
  /** Decimal rate, e.g. 0.0025 = 0.25% */
  rate: number;
  source: FeeSource;
}

export interface QuotedFeeLine extends FeeLine {
  amountCents: number;
}

export interface FeeQuote {
  mode: FeePayerMode;
  /** Amount the sender asked to send / the recipient should receive, depending on mode. */
  desiredCents: number;
  /** Amount submitted to CityCorp `amount`. */
  submittedCents: number;
  /** Amount the destination account is expected to receive after automatic cuts. */
  receivedCents: number;
  totalFeeCents: number;
  combinedRate: number;
  lines: QuotedFeeLine[];
}

/** CityCorp account fee value is a percent (0.25 → 0.25%, 2 → 2%). */
export function cityCorpPercentToRate(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return percent / 100;
}

/** Slate stores percents × 100 (200 → 2.00%). */
export function slateStoredToRate(stored: number | null | undefined): number {
  if (stored === null || stored === undefined) return 0;
  const n = Number(stored);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n / 10000;
}

export function parseCityCorpFeeList(fees: any): { withdrawPct: number; depositPct: number } {
  let withdrawPct = 0;
  let depositPct = 0;
  if (!fees) return { withdrawPct, depositPct };

  const apply = (key: string, value: number) => {
    const t = key.toUpperCase();
    if (t === "WITHDRAW") withdrawPct = value;
    if (t === "DEPOSIT") depositPct = value;
  };

  if (Array.isArray(fees)) {
    for (const entry of fees) {
      if (Array.isArray(entry) && entry.length >= 2) {
        apply(String(entry[0]), Number(entry[1]) || 0);
      } else if (entry && typeof entry === "object") {
        const k = entry.fee_type || entry.type || entry.name;
        const v = entry.fee ?? entry.percent ?? entry.value;
        if (k != null) apply(String(k), Number(v) || 0);
      }
    }
  } else if (typeof fees === "object") {
    if (fees.WITHDRAW != null) withdrawPct = Number(fees.WITHDRAW) || 0;
    if (fees.withdraw != null) withdrawPct = Number(fees.withdraw) || 0;
    if (fees.DEPOSIT != null) depositPct = Number(fees.DEPOSIT) || 0;
    if (fees.deposit != null) depositPct = Number(fees.deposit) || 0;
  }
  return { withdrawPct, depositPct };
}

export function combinedCutRate(lines: FeeLine[]): number {
  const active = lines.filter((l) => l.rate > 0);
  if (active.length === 0) return 0;
  let keep = 1;
  for (const line of active) {
    keep *= 1 - line.rate;
  }
  return 1 - keep;
}

export function quoteFees(desiredCents: number, lines: FeeLine[], mode: FeePayerMode): FeeQuote {
  const desired = Math.max(0, Math.round(desiredCents));
  const filtered = lines.filter((l) => l.rate > 0);
  const p = combinedCutRate(filtered);

  let submittedCents: number;
  let receivedCents: number;
  if (desired === 0) {
    submittedCents = 0;
    receivedCents = 0;
  } else if (p <= 0) {
    submittedCents = desired;
    receivedCents = desired;
  } else if (p >= 0.9999) {
    throw new Error("Combined fee rate is too high to quote.");
  } else if (mode === "sender_covers") {
    submittedCents = Math.ceil(desired / (1 - p));
    receivedCents = desired;
  } else {
    submittedCents = desired;
    receivedCents = Math.floor(desired * (1 - p));
  }

  const totalFeeCents = submittedCents - receivedCents;
  const quotedLines: QuotedFeeLine[] = filtered.map((line) => ({
    ...line,
    amountCents: Math.round(submittedCents * line.rate),
  }));

  return {
    mode,
    desiredCents: desired,
    submittedCents,
    receivedCents,
    totalFeeCents,
    combinedRate: p,
    lines: quotedLines,
  };
}

export function parseFeePayerMode(raw: any, fallback: FeePayerMode = "from_payment"): FeePayerMode {
  const v = String(raw || "").toLowerCase();
  if (v === "sender_covers" || v === "sender-covers" || v === "gross") return "sender_covers";
  if (v === "from_payment" || v === "from-payment" || v === "net") return "from_payment";
  return fallback;
}
