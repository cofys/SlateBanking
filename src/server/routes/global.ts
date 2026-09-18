import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const globalRouter = express.Router();

globalRouter.get("/api/transactions/recent", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions, banks } = await import("../../db/schema");
    const { desc, eq } = await import("drizzle-orm");

    try {
      const recent = await db.select({
        id: transactions.id,
        amount: transactions.amount,
        type: transactions.type,
        description: transactions.description,
        timestamp: transactions.timestamp,
        bankName: banks.name
      })
      .from(transactions)
      .leftJoin(banks, eq(transactions.bankId, banks.id))
      .orderBy(desc(transactions.timestamp))
      .limit(50);

      res.json(recent);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

globalRouter.get("/api/global-admins", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { globalAdmins } = await import("../../db/schema");
    try {
      const admins = await db.select().from(globalAdmins);
      res.json(admins);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

globalRouter.post("/api/global-admins", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { globalAdmins } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { discordId } = req.body;
      if (!discordId) return res.status(400).json({ error: "Missing discordId" });
      await db.insert(globalAdmins).values({
        id: uuidv4(),
        discordId,
        addedBy: (req as any).user.discordId,
        createdAt: new Date()
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

globalRouter.delete("/api/global-admins/:id", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { globalAdmins } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.delete(globalAdmins).where(eq(globalAdmins.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

globalRouter.get("/api/stats", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankAccounts, transactions } = await import("../../db/schema");
    const { count, sum, eq, gte } = await import("drizzle-orm");

    try {
      const [{ value: bankCount }] = await db.select({ value: count() }).from(banks);
      const [{ value: userCount }] = await db.select({ value: count() }).from(bankAccounts);
      
      const onyxTx = await db.select({ value: sum(transactions.amount) }).from(transactions).where(eq(transactions.type, 'onyx_payment'));
      const totalTx = await db.select({ value: sum(transactions.amount) }).from(transactions);

      // Generate 30 days of timeline
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const recentTx = await db.select()
        .from(transactions)
        .where(gte(transactions.timestamp, thirtyDaysAgo));

      // Group by day
      const dailyData: Record<string, number> = {};
      
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        dailyData[d.toISOString().split('T')[0]] = 0;
      }
      
      recentTx.forEach(tx => {
        const day = new Date(tx.timestamp).toISOString().split('T')[0];
        if (dailyData[day] !== undefined) {
          dailyData[day] += tx.amount / 100;
        }
      });

      const timeline = Object.entries(dailyData).map(([date, volume]) => ({
        date,
        volume
      }));

      res.json({
        bankCount: bankCount || 0,
        userCount: userCount || 0,
        onyxProcessedCents: onyxTx[0]?.value || 0,
        totalPlatformVolumeCents: totalTx[0]?.value || 0,
        timeline,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

globalRouter.get("/api/admin/saas-invoices", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { saasInvoices, banks } = await import("../../db/schema");
    const { desc, eq } = await import("drizzle-orm");

    try {
      const invoicesList = await db.select({
        id: saasInvoices.id,
        bankId: saasInvoices.bankId,
        bankName: banks.name,
        amount: saasInvoices.amount,
        period: saasInvoices.period,
        dueDate: saasInvoices.dueDate,
        status: saasInvoices.status,
        createdAt: saasInvoices.createdAt,
      })
      .from(saasInvoices)
      .leftJoin(banks, eq(saasInvoices.bankId, banks.id))
      .orderBy(desc(saasInvoices.createdAt));

      res.json(invoicesList);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});

globalRouter.post("/api/admin/saas-invoices", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { saasInvoices } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { bankId, amount, period, dueDate } = req.body;
      if (!bankId || !amount || !period || !dueDate) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const parsedAmount = Math.round(parseFloat(amount) * 100);
      const invoiceId = uuidv4();

      await db.insert(saasInvoices).values({
        id: invoiceId,
        bankId,
        amount: parsedAmount,
        period,
        dueDate: new Date(dueDate),
        status: "pending",
        createdAt: new Date(),
      });

      res.json({ success: true, invoiceId });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});

globalRouter.put("/api/admin/saas-invoices/:id", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { saasInvoices } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { status } = req.body;
      if (!["pending", "paid", "overdue", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await db.update(saasInvoices).set({ status }).where(eq(saasInvoices.id, req.params.id));
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});

globalRouter.get("/api/global/audit", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { globalAuditLogs } = await import("../../db/schema.js");
  const { desc } = await import("drizzle-orm");
  try {
    const logs = await db.select().from(globalAuditLogs)
      .orderBy(desc(globalAuditLogs.timestamp))
      .limit(150);
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


// --- Global Announcements ---
globalRouter.get("/api/global/announcements", async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { globalAnnouncements } = await import("../../db/schema.js");
    const { desc, eq } = await import("drizzle-orm");
    try {
        const query = db.select().from(globalAnnouncements).orderBy(desc(globalAnnouncements.createdAt));
        // If not global admin, only show active
        const authModule = await import("../middleware.js");
        
        let isGlobalAdmin = false;
        const token = req.cookies.auth_token;
        if (token) {
            try {
                const jwt = await import('jsonwebtoken');
                const decoded: any = jwt.default.verify(token, authModule.JWT_SECRET);
                (req as any).user = decoded;
                const { checkUserIsGlobalAdmin } = await import("../userResolver.js");
                isGlobalAdmin = await checkUserIsGlobalAdmin(req);
            } catch(e) {}
        }
        
        if (!isGlobalAdmin) {
            const results = await query.where(eq(globalAnnouncements.isActive, true));
            return res.json(results);
        }
        
        const results = await query;
        res.json(results);
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

globalRouter.post("/api/global/announcements", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { globalAnnouncements } = await import("../../db/schema.js");
    const { v4: uuidv4 } = await import("uuid");
    try {
        const { title, content, type, isActive } = req.body;
        await db.insert(globalAnnouncements).values({
            id: uuidv4(),
            title,
            content,
            type: type || 'info',
            isActive: isActive !== undefined ? isActive : true,
            createdBy: (req as any).user.discordId,
            createdAt: new Date(),
        });
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

globalRouter.delete("/api/global/announcements/:id", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { globalAnnouncements } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    try {
        await db.delete(globalAnnouncements).where(eq(globalAnnouncements.id, req.params.id));
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- Global Sanctions ---
globalRouter.get("/api/global/sanctions", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { globalSanctions } = await import("../../db/schema.js");
    const { desc } = await import("drizzle-orm");
    try {
        const results = await db.select().from(globalSanctions).orderBy(desc(globalSanctions.createdAt));
        res.json(results);
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

globalRouter.post("/api/global/sanctions", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { globalSanctions } = await import("../../db/schema.js");
    const { v4: uuidv4 } = await import("uuid");
    try {
        const { discordId, mcUuid, reason } = req.body;
        if (!discordId && !mcUuid) return res.status(400).json({ error: "Provide discordId or mcUuid" });
        await db.insert(globalSanctions).values({
            id: uuidv4(),
            discordId: discordId || null,
            mcUuid: mcUuid || null,
            reason,
            createdBy: (req as any).user.discordId,
            createdAt: new Date(),
        });
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

globalRouter.delete("/api/global/sanctions/:id", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { globalSanctions } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    try {
        await db.delete(globalSanctions).where(eq(globalSanctions.id, req.params.id));
        res.json({ success: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- Global Clearinghouse ---
globalRouter.get("/api/global/clearinghouse", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("../../db/index.js");
    const { clearinghouseBalances, banks } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    try {
        const results = await db.select({
            bankId: clearinghouseBalances.bankId,
            bankName: banks.name,
            balance: clearinghouseBalances.balance,
            settlementCashCents: clearinghouseBalances.settlementCashCents,
            lastSettled: clearinghouseBalances.lastSettled,
        }).from(clearinghouseBalances)
        .leftJoin(banks, eq(clearinghouseBalances.bankId, banks.id));
        res.json(results);
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

globalRouter.post("/api/global/clearinghouse/run", requireGlobalAdmin, async (req, res) => {
    try {
        const { runNetSettlement } = await import("../../lib/net_settlement");
        const result = await runNetSettlement({ actorId: (req as any).user?.discordId || "global" });
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(400).json({ error: e.message || "Run failed" });
    }
});


globalRouter.get("/api/global/security/logs", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { securityAuditLogs } = await import("../../db/schema.js");
    const { desc } = await import("drizzle-orm");
    const logs = await db.select().from(securityAuditLogs).orderBy(desc(securityAuditLogs.timestamp)).limit(200);
    res.json(logs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

globalRouter.get("/api/global/security/bans", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { bannedIps } = await import("../../db/schema.js");
    const { desc } = await import("drizzle-orm");
    const bans = await db.select().from(bannedIps).orderBy(desc(bannedIps.bannedAt));
    res.json(bans);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

globalRouter.post("/api/global/security/bans", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { ipAddress, reason } = req.body;
    if (!ipAddress || !reason) return res.status(400).json({ error: "Missing ipAddress or reason" });
    const { db } = await import("../../db/index.js");
    const { bannedIps, securityAuditLogs } = await import("../../db/schema.js");
    const { v4: uuidv4 } = await import("uuid");

    await db.insert(bannedIps).values({
      ipAddress,
      reason,
      bannedBy: (req as any).user?.username || "GlobalAdmin",
      bannedAt: new Date(),
    });

    await db.insert(securityAuditLogs).values({
      id: uuidv4(),
      ipAddress: ipAddress,
      action: "ip_ban",
      status: "success",
      discordId: (req as any).user?.discordId,
      details: "Banned IP for reason: " + reason,
      timestamp: new Date()
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

globalRouter.delete("/api/global/security/bans/:ip", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { bannedIps, securityAuditLogs } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    await db.delete(bannedIps).where(eq(bannedIps.ipAddress, req.params.ip));

    await db.insert(securityAuditLogs).values({
      id: uuidv4(),
      ipAddress: req.params.ip,
      action: "ip_unban",
      status: "success",
      discordId: (req as any).user?.discordId,
      details: "Unbanned IP",
      timestamp: new Date()
    });

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
