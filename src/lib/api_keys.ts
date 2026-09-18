import crypto from "crypto";
import { decryptSecret } from "./encryption.js";

export function hashApiKey(plain: string): string {
  return crypto.createHash("sha256").update(String(plain), "utf8").digest("hex");
}

export function last4OfKey(plain: string): string {
  const s = String(plain || "");
  return s.slice(-4);
}

export function hashesMatch(plain: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashApiKey(plain), "hex");
  const b = Buffer.from(String(storedHash), "hex");
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function timingEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Verify a presented key against a hashed column, with encrypted-plaintext fallback + backfill. */
export function verifyPresentedKey(opts: {
  presented: string;
  storedHash?: string | null;
  storedEncrypted?: string | null;
}): { ok: boolean; needsBackfill: boolean; last4?: string } {
  const presented = String(opts.presented || "");
  if (!presented) return { ok: false, needsBackfill: false };

  if (opts.storedHash && hashesMatch(presented, opts.storedHash)) {
    return { ok: true, needsBackfill: false, last4: last4OfKey(presented) };
  }

  if (opts.storedEncrypted) {
    const plain = opts.storedEncrypted === presented
      ? presented
      : (decryptSecret(opts.storedEncrypted) || "");
    if (plain && timingEqualStrings(plain, presented)) {
      return { ok: true, needsBackfill: !opts.storedHash, last4: last4OfKey(presented) };
    }
  }

  return { ok: false, needsBackfill: false };
}

export function generateBankApiKey(): string {
  return "sk_live_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").substring(0, 8);
}

export function generateWebhookSecret(): string {
  return "whsec_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").substring(0, 8);
}

export function generateMerchantApiKey(): string {
  return "onyx_" + crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").substring(0, 8);
}
