export type FeePayerMode = "from_payment" | "sender_covers";

export type FeeSource = "citycorp" | "bank" | "platform" | "government";

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

/** Direct percent to rate: 1.75 -> 0.0175 (1.75%) */
export function slatePercentToRate(percent: number | null | undefined): number {
  if (percent === null || percent === undefined) return 0;
  const n = Number(percent);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // If stored as basis points (e.g. > 100, like 175)
  if (n > 100) return n / 10000;
  return n / 100;
}

/** Basis points to rate: 175 -> 0.0175 (1.75%) */
export function slateBpsToRate(bps: number | null | undefined): number {
  if (bps === null || bps === undefined) return 0;
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // If stored directly as a decimal percent (e.g. 1.75 instead of 175)
  if (!Number.isInteger(n) || (n < 20 && n > 0 && n % 1 !== 0)) return n / 100;
  return n / 10000;
}

/**
 * Normalizes any fee percentage input (e.g. 0.25 for 0.25%, 25 for 0.25% bps, 1.75 for 1.75%)
 * to decimal rate (0.0025, 0.0175).
 */
export function normalizePercentToRate(val: number | null | undefined, defaultPercent = 0): number {
  if (val === null || val === undefined) {
    return defaultPercent > 0 ? normalizePercentToRate(defaultPercent) : 0;
  }
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // If stored as integer basis points (e.g. 25 bps = 0.25%, 175 bps = 1.75%, 200 bps = 2.0%)
  if (Number.isInteger(n) && n >= 20) {
    return n / 10000;
  }
  // Otherwise it's a direct percentage (e.g. 0.25 = 0.25%, 1.75 = 1.75%)
  return n / 100;
}

/** Slate stores percents in various formats (1.75% as 1.75 or 175 bps).
 * Automatically converts to decimal rate (0.0175).
 */
export function slateStoredToRate(stored: number | null | undefined): number {
  if (stored === null || stored === undefined) return 0;
  const n = Number(stored);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 50) return n / 10000;
  return n / 100;
}

export function parseCityCorpFeeList(fees: any): { withdrawPct: number; depositPct: number } {
  let withdrawPct = 0;
  let depositPct = 0;
  if (!fees) return { withdrawPct, depositPct };

  const apply = (key: string, value: number) => {
    const t = String(key).toUpperCase();
    if (t === "WITHDRAW") withdrawPct = value;
    if (t === "DEPOSIT") depositPct = value;
  };

  if (typeof fees === "string") {
    try {
      fees = JSON.parse(fees);
    } catch {
      const parts = fees.split(/[,;\n]/);
      for (const part of parts) {
        const [k, v] = part.split(/[:=]/);
        if (k && v) apply(k.trim(), Number(v.trim()) || 0);
      }
      return { withdrawPct, depositPct };
    }
  }

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
  const totalRate = filtered.reduce((acc, l) => acc + l.rate, 0);

  if (desired === 0 || totalRate <= 0) {
    return {
      mode,
      desiredCents: desired,
      submittedCents: desired,
      receivedCents: desired,
      totalFeeCents: 0,
      combinedRate: 0,
      lines: filtered.map((l) => ({ ...l, amountCents: 0 })),
    };
  }

  let submittedCents: number;
  let receivedCents: number;
  let quotedLines: QuotedFeeLine[];
  let totalFeeCents: number;

  if (mode === "sender_covers") {
    // In CityCorp (in-game), fees are deducted from the submitted transfer amount:
    // received_in_game = submitted - round(submitted * totalRate).
    // To ensure the destination account receives EXACTLY `desiredCents`,
    // the submitted amount must be grossed up: submitted = desired / (1 - totalRate).
    if (totalRate >= 1) {
      submittedCents = desired;
      totalFeeCents = 0;
      receivedCents = desired;
      quotedLines = filtered.map((l) => ({ ...l, amountCents: 0 }));
    } else {
      let gross = Math.round(desired / (1 - totalRate));
      let feeInGame = Math.round(gross * totalRate);
      if (gross - feeInGame < desired) {
        gross++;
        feeInGame = Math.round(gross * totalRate);
      }
      submittedCents = gross;
      totalFeeCents = submittedCents - desired;
      receivedCents = desired;

      // Allocate fee lines proportionally based on each line's rate share
      let allocatedFee = 0;
      quotedLines = filtered.map((line, idx) => {
        if (idx === filtered.length - 1) {
          // Last line absorbs any 1-cent rounding difference to guarantee exact sum === totalFeeCents
          return {
            ...line,
            amountCents: Math.max(0, totalFeeCents - allocatedFee),
          };
        }
        const lineAmt = Math.round(totalFeeCents * (line.rate / totalRate));
        allocatedFee += lineAmt;
        return {
          ...line,
          amountCents: lineAmt,
        };
      });
    }
  } else {
    // Fees are deducted from the payment amount:
    // Sender pays `desired` total, in-game deducts fees, and recipient receives the net.
    submittedCents = desired;
    totalFeeCents = Math.round(desired * totalRate);
    receivedCents = Math.max(0, desired - totalFeeCents);

    let allocatedFee = 0;
    quotedLines = filtered.map((line, idx) => {
      if (idx === filtered.length - 1) {
        // Last line absorbs any 1-cent rounding difference to guarantee exact sum === totalFeeCents
        return {
          ...line,
          amountCents: Math.max(0, totalFeeCents - allocatedFee),
        };
      }
      const lineAmt = Math.round(totalFeeCents * (line.rate / totalRate));
      allocatedFee += lineAmt;
      return {
        ...line,
        amountCents: lineAmt,
      };
    });
  }

  return {
    mode,
    desiredCents: desired,
    submittedCents,
    receivedCents,
    totalFeeCents,
    combinedRate: totalRate,
    lines: quotedLines,
  };
}

export function parseFeePayerMode(raw: any, fallback: FeePayerMode = "from_payment"): FeePayerMode {
  const v = String(raw || "").trim().toLowerCase();
  if (
    v === "sender_covers" ||
    v === "sender-covers" ||
    v === "sender" ||
    v === "gross" ||
    v === "cover" ||
    v === "covers" ||
    v === "on_top" ||
    v === "ontop" ||
    v === "payer"
  ) {
    return "sender_covers";
  }
  if (
    v === "from_payment" ||
    v === "from-payment" ||
    v === "net" ||
    v === "deduct" ||
    v === "deducted" ||
    v === "sub" ||
    v === "recipient"
  ) {
    return "from_payment";
  }
  return fallback;
}
