import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { platformAlerts } from "../db/schema.js";
import { and, desc, eq } from "drizzle-orm";

export type AlertSeverity = "info" | "warning" | "critical";

export async function raisePlatformAlert(opts: {
  bankId?: string | null;
  severity?: AlertSeverity;
  code: string;
  message: string;
  dedupeMinutes?: number;
}) {
  const now = Date.now();
  const windowMs = (opts.dedupeMinutes ?? 10) * 60 * 1000;
  if (opts.bankId) {
    const recent = await db.select().from(platformAlerts)
      .where(and(eq(platformAlerts.bankId, opts.bankId), eq(platformAlerts.code, opts.code), eq(platformAlerts.isOpen, true)))
      .orderBy(desc(platformAlerts.createdAt))
      .limit(1)
      .get();
    if (recent?.createdAt && now - new Date(recent.createdAt).getTime() < windowMs) {
      return recent;
    }
  }
  const row = {
    id: uuidv4(),
    bankId: opts.bankId || null,
    severity: opts.severity || "warning",
    code: opts.code,
    message: opts.message,
    isOpen: true,
    createdAt: new Date(),
    resolvedAt: null as Date | null,
    resolvedBy: null as string | null,
  };
  await db.insert(platformAlerts).values(row);
  return row;
}

export async function resolvePlatformAlert(id: string, resolvedBy?: string) {
  await db.update(platformAlerts).set({
    isOpen: false,
    resolvedAt: new Date(),
    resolvedBy: resolvedBy || null,
  }).where(eq(platformAlerts.id, id));
}
