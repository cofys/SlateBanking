import crypto from "crypto";
import { db } from "../db/index.js";
import { usedPaymentTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";

export function hashPaymentToken(token: string): string {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

/** Persist a used checkout token. Returns false if it was already consumed. */
export async function consumePaymentToken(opts: {
  token: string;
  merchantId?: string | null;
  discordId?: string | null;
  amountCents?: number | null;
}): Promise<boolean> {
  const tokenHash = hashPaymentToken(opts.token);
  const existing = await db.select().from(usedPaymentTokens).where(eq(usedPaymentTokens.tokenHash, tokenHash)).get();
  if (existing) return false;
  try {
    await db.insert(usedPaymentTokens).values({
      tokenHash,
      merchantId: opts.merchantId || null,
      discordId: opts.discordId || null,
      amountCents: opts.amountCents ?? null,
      usedAt: new Date(),
    });
    return true;
  } catch {
    return false;
  }
}
