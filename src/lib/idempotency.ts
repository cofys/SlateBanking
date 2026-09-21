import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { idempotencyKeys } from "../db/schema.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface IdempotencyCheckResult {
  state: "new" | "in_progress" | "completed";
  statusCode?: number;
  body?: any;
}

export function extractIdempotencyKey(req: any): string | null {
  const headerKey = req.headers?.["idempotency-key"] || req.headers?.["x-idempotency-key"];
  if (headerKey && typeof headerKey === "string" && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  const bodyKey = req.body?.idempotencyKey || req.body?.idempotency_key;
  if (bodyKey && typeof bodyKey === "string" && bodyKey.trim().length > 0) {
    return bodyKey.trim();
  }
  return null;
}

/**
 * Checks if an idempotency key exists and is valid.
 * Handles cleanup of expired keys transparently.
 */
export async function checkIdempotency(key: string, scope: string): Promise<IdempotencyCheckResult> {
  try {
    const existing = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)))
      .get();

    if (!existing) {
      return { state: "new" };
    }

    const now = Date.now();
    const expiryTime = existing.expiresAt instanceof Date ? existing.expiresAt.getTime() : Number(existing.expiresAt);

    if (expiryTime <= now) {
      // Expired entry; clean it up so a new operation can proceed
      await db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, existing.id));
      return { state: "new" };
    }

    if (existing.status === "completed") {
      let parsedBody: any = null;
      if (existing.responseJson) {
        try {
          parsedBody = JSON.parse(existing.responseJson);
        } catch {
          parsedBody = { success: true };
        }
      }
      return {
        state: "completed",
        statusCode: existing.statusCode || 200,
        body: parsedBody,
      };
    }

    // Still in progress
    return { state: "in_progress" };
  } catch (err) {
    console.error("[idempotency] check failed, proceeding safely:", err);
    return { state: "new" };
  }
}

/**
 * Marks an idempotency key as in-progress.
 */
export async function startIdempotency(key: string, scope: string, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    await db.insert(idempotencyKeys).values({
      id: uuidv4(),
      key,
      scope,
      status: "in_progress",
      statusCode: null,
      responseJson: null,
      createdAt: now,
      expiresAt,
    });
  } catch (err: any) {
    // If unique constraint or race, log and continue
    console.warn("[idempotency] start record conflict/warning:", err?.message);
  }
}

/**
 * Stores the final result of the idempotency-guarded operation.
 */
export async function completeIdempotency(key: string, scope: string, statusCode: number, body: any): Promise<void> {
  try {
    const json = JSON.stringify(body);
    await db
      .update(idempotencyKeys)
      .set({
        status: "completed",
        statusCode,
        responseJson: json,
      })
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)));
  } catch (err) {
    console.error("[idempotency] completion record failed:", err);
  }
}

/**
 * Releases/cleans up an in-progress idempotency key if a non-financial validation failed early.
 */
export async function releaseIdempotency(key: string, scope: string): Promise<void> {
  try {
    await db
      .delete(idempotencyKeys)
      .where(and(eq(idempotencyKeys.key, key), eq(idempotencyKeys.scope, scope)));
  } catch (err) {
    console.error("[idempotency] release failed:", err);
  }
}
