import { format, isValid } from "date-fns";

/**
 * Formats a monetary amount in cents into a highly polished USD string.
 * e.g., 275560908 -> "$2,755,609.08"
 */
export function formatMoney(amountInCents: number | undefined | null): string {
  if (amountInCents === undefined || amountInCents === null || isNaN(amountInCents)) {
    return "$0.00";
  }
  const dollars = amountInCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dollars);
}

/**
 * Formats a standard number with thousands separators.
 * e.g., 15000 -> "15,000"
 */
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) {
    return "0";
  }
  return new Intl.NumberFormat("en-US").format(num);
}

/**
 * Safely format a date string or timestamp. Returns fallback string if invalid.
 */
export function safeFormatDate(dateVal: any, formatStr: string = "MMM d, yyyy", fallback: string = "Never"): string {
  if (!dateVal) return fallback;
  try {
    const d = new Date(dateVal);
    if (!isValid(d) || isNaN(d.getTime())) return fallback;
    return format(d, formatStr);
  } catch (e) {
    return fallback;
  }
}

