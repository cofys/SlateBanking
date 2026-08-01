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
