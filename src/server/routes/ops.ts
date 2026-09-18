import express from "express";
import { eq, and, desc, inArray, or, lte, sql } from "drizzle-orm";
import { requireGlobalAdmin, requireBankStaff } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import { bankIsSuspended } from "../../lib/tenant_guard.js";
import { raisePlatformAlert, resolvePlatformAlert } from "../../lib/platform_alerts.js";
import { v4 as uuidv4 } from "uuid";

export const opsRouter = express.Router();

function dollars(cents: number) {
  return Math.round(Number(cents) || 0);
}

export function computeGoLive(opts: {
  bank: any;
  settings: any;
  settlementAccount?: any;
  loanProductsCount: number;
  botStatus: string;
  listener?: { connected: boolean; failureCount: number } | null;
}) {
  const b = opts.bank;
  const s = opts.settings || {};
  const items = [
    { id: "discord", label: "Discord bot token + online", ok: Boolean(b?.discordToken) && opts.botStatus === "online", hint: "Paste the bot token in Bank Settings and wait for it to come online." },
    { id: "citycorp", label: "CityCorp owner key", ok: Boolean(b?.corpApiUuid && b?.corpApiKey), hint: "Bank owner uuid + crp_ token." },
    { id: "listener", label: "CityCorp live events", ok: Boolean(opts.listener?.connected), hint: "Listener connects once CityCorp credentials are valid." },
    { id: "settlement", label: "SETTLEMENT subaccount", ok: Boolean(s.settlementAccount || opts.settlementAccount), hint: "Create the correspondent SETTLEMENT account at 0% CityCorp fees." },
    { id: "settlement_funded", label: "SETTLEMENT funded", ok: dollars(opts.settlementAccount?.balance) > 0 || dollars(s.settlementFloorCents) === 0, hint: "Self-fund SETTLEMENT in-game, or set a floor of $0 if you will fund later." },
    { id: "loan_pool", label: "Loan pool (if lending on)", ok: s.enableLoans === false || Boolean(s.loanPoolAccount || s.defaultCorpAccount), hint: "Named loan pool or default operating account for disbursements." },
    { id: "interest_pool", label: "Interest pool (if paying APY)", ok: !s.savingsApyPercent || s.interestPaymentSchedule === "manual" || Boolean(s.interestPoolAccount), hint: "Set an interest pool if you auto-pay savings APY." },
    { id: "branding", label: "Brand color or logo", ok: Boolean(b?.brandingColor || b?.logoUrl || s.logoUrl || s.tagline), hint: "Set a hex color, logo, and tagline so the portal looks like your bank." },
    { id: "products", label: "Loan product (if lending on)", ok: s.enableLoans === false || opts.loanProductsCount > 0, hint: "Create at least one loan product for citizen applications." },
    { id: "panels", label: "Discord panels spawned", ok: Boolean(s.guiChannelId || s.staffChannelId), hint: "Spawn public / staff panels from Bank Settings." },
    { id: "not_suspended", label: "Not suspended", ok: !bankIsSuspended(b), hint: "Unsuspend this tenant to go live." },
  ];
  const ready = items.every((i) => i.ok);
  return { ready, items };
}

opsRouter.get("/api/ops/health", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { banks, bankSettings, bankAccounts, clearinghouseBalances, clearinghouseSettlements, platformAlerts, loanProducts, cityCorpLogs } = await import("../../db/schema.js");
    const { getCityCorpListenerHealth } = await import("../../lib/bot_events.js");

    const allBanks = await db.select().from(banks);
    const allSettings = await db.select().from(bankSettings);
    const balances = await db.select().from(clearinghouseBalances);
    const openSettlements = await db.select().from(clearinghouseSettlements).where(inArray(clearinghouseSettlements.status, ["pending", "released"]));
    const openAlerts = await db.select().from(platformAlerts).where(eq(platformAlerts.isOpen, true)).orderBy(desc(platformAlerts.createdAt)).limit(80);
    const products = await db.select().from(loanProducts);
    const botStatuses = botManager.getBankStatuses();
    const listeners = getCityCorpListenerHealth();

    const recentLogs = await db.select().from(cityCorpLogs).orderBy(desc(cityCorpLogs.timestamp)).limit(200);
    const failLogs = recentLogs.filter((l) => !l.success);

    const settlementAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.systemCategory, "clearinghouse"));

    const tenants = allBanks.map((b) => {
      const s = allSettings.find((x) => x.bankId === b.id);
      const ch = balances.find((x) => x.bankId === b.id);
      const settleName = (s?.settlementAccount || "SETTLEMENT").toLowerCase();
      const settleAcc = settlementAccounts.find((a) => a.bankId === b.id && a.accountName?.toLowerCase() === settleName)
        || settlementAccounts.find((a) => a.bankId === b.id);
      const pendingOut = openSettlements.filter((x) => x.fromBankId === b.id);
      const pendingIn = openSettlements.filter((x) => x.toBankId === b.id);
      const alerts = openAlerts.filter((a) => a.bankId === b.id);
      const golive = computeGoLive({
        bank: b,
        settings: s,
        settlementAccount: settleAcc,
        loanProductsCount: products.filter((p) => p.bankId === b.id && p.isActive).length,
        botStatus: botStatuses[b.id] || "offline",
        listener: listeners[b.id] || null,
      });
      const { discordToken, discordClientSecret, corpApiKey, cityCorpAppSecret, apiKey, webhookSecret, ...safe } = b as any;
      return {
        ...safe,
        hasCityCorp: Boolean(b.corpApiUuid && b.corpApiKey),
        hasDiscord: Boolean(b.discordToken),
        botStatus: botStatuses[b.id] || "offline",
        listener: listeners[b.id] || { connected: false, failureCount: 0 },
        settlementCashCents: settleAcc?.balance ?? ch?.settlementCashCents ?? 0,
        settlementFloorCents: s?.settlementFloorCents || 0,
        settlementWarnCents: s?.settlementWarnCents || 0,
        pendingSettlementsOut: pendingOut.length,
        pendingSettlementsIn: pendingIn.length,
        openAlerts: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
        golive,
        suspended: bankIsSuspended(b),
        maintenanceMode: !!b.maintenanceMode,
      };
    });

    res.json({
      generatedAt: new Date().toISOString(),
      onyxBot: botManager.getOnyxBotStatus(),
      totals: {
        banks: tenants.length,
        onlineBots: tenants.filter((t) => t.botStatus === "online").length,
        liveListeners: tenants.filter((t) => t.listener?.connected).length,
        suspended: tenants.filter((t) => t.suspended).length,
        maintenance: tenants.filter((t) => t.maintenanceMode).length,
        openAlerts: openAlerts.length,
        pendingSettlements: openSettlements.length,
        recentCityCorpFailures: failLogs.length,
      },
      tenants,
      alerts: openAlerts,
      recentCityCorpFailures: failLogs.slice(0, 20),
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Health check failed" });
  }
});

opsRouter.get("/api/ops/banks/:bankId/golive", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { banks, bankSettings, bankAccounts, loanProducts } = await import("../../db/schema.js");
    const { getCityCorpListenerHealth } = await import("../../lib/bot_events.js");
    const bank = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();
    if (!bank) return res.status(404).json({ error: "Bank not found" });
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bank.id)).get();
    const settleName = (settings?.settlementAccount || "SETTLEMENT").toLowerCase();
    const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bank.id));
    const settleAcc = accounts.find((a) => a.accountName?.toLowerCase() === settleName);
    const products = await db.select().from(loanProducts).where(eq(loanProducts.bankId, bank.id));
    const listeners = getCityCorpListenerHealth();
    const golive = computeGoLive({
      bank,
      settings,
      settlementAccount: settleAcc,
      loanProductsCount: products.filter((p) => p.isActive).length,
      botStatus: botManager.getBankStatuses()[bank.id] || "offline",
      listener: listeners[bank.id] || null,
    });
    res.json(golive);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

opsRouter.get("/api/ops/alerts", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { platformAlerts } = await import("../../db/schema.js");
    const openOnly = String(req.query.open || "1") !== "0";
    const rows = openOnly
      ? await db.select().from(platformAlerts).where(eq(platformAlerts.isOpen, true)).orderBy(desc(platformAlerts.createdAt)).limit(200)
      : await db.select().from(platformAlerts).orderBy(desc(platformAlerts.createdAt)).limit(200);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

opsRouter.post("/api/ops/alerts/:id/resolve", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    await resolvePlatformAlert(req.params.id, (req as any).user?.discordId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

opsRouter.post("/api/admin/banks/:id/suspend", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { banks, auditLogs } = await import("../../db/schema.js");
    const reason = String(req.body?.reason || "Suspended by platform").slice(0, 500);
    const bank = await db.select().from(banks).where(eq(banks.id, req.params.id)).get();
    if (!bank) return res.status(404).json({ error: "Bank not found" });

    await db.update(banks).set({
      billingStatus: "suspended",
      status: "suspended",
      suspendedReason: reason,
      suspendedAt: new Date(),
    }).where(eq(banks.id, bank.id));

    await db.insert(auditLogs).values({
      id: uuidv4(),
      bankId: bank.id,
      userDiscordId: (req as any).user?.discordId || "platform",
      action: "tenant_suspended",
      details: reason,
      timestamp: new Date(),
    });

    await raisePlatformAlert({
      bankId: bank.id,
      severity: "critical",
      code: "TENANT_SUSPENDED",
      message: `${bank.name} suspended: ${reason}`,
      dedupeMinutes: 1,
    });

    try { await botManager.stopBankBot(bank.id); } catch {}
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

opsRouter.post("/api/admin/banks/:id/unsuspend", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { banks, auditLogs } = await import("../../db/schema.js");
    const bank = await db.select().from(banks).where(eq(banks.id, req.params.id)).get();
    if (!bank) return res.status(404).json({ error: "Bank not found" });

    await db.update(banks).set({
      billingStatus: "active",
      status: bank.discordToken ? "online" : "offline",
      suspendedReason: null,
      suspendedAt: null,
    }).where(eq(banks.id, bank.id));

    await db.insert(auditLogs).values({
      id: uuidv4(),
      bankId: bank.id,
      userDiscordId: (req as any).user?.discordId || "platform",
      action: "tenant_unsuspended",
      details: "Tenant unsuspended",
      timestamp: new Date(),
    });

    if (bank.discordToken) {
      try { await botManager.provisionBankBot(bank.id, bank.discordToken); } catch (e) {
        try { await botManager.restartBankBot(bank.id, bank.discordToken); } catch {}
      }
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

opsRouter.get("/api/banks/:bankId/golive", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { banks, bankSettings, bankAccounts, loanProducts } = await import("../../db/schema.js");
    const { getCityCorpListenerHealth } = await import("../../lib/bot_events.js");
    const bankId = req.params.bankId;
    const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    if (!bank) return res.status(404).json({ error: "Bank not found" });
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    const settleName = (settings?.settlementAccount || "SETTLEMENT").toLowerCase();
    const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
    const settleAcc = accounts.find((a) => a.accountName?.toLowerCase() === settleName);
    const products = await db.select().from(loanProducts).where(eq(loanProducts.bankId, bankId));
    const listeners = getCityCorpListenerHealth();
    res.json(computeGoLive({
      bank,
      settings,
      settlementAccount: settleAcc,
      loanProductsCount: products.filter((p) => p.isActive).length,
      botStatus: botManager.getBankStatuses()[bankId] || "offline",
      listener: listeners[bankId] || null,
    }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
