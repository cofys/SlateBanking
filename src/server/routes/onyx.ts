import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const onyxRouter = express.Router();


onyxRouter.get("/api/onyx/merchant/:id", async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { onyxMerchants, banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
        const merchants = await db.select({
            id: onyxMerchants.id,
            name: onyxMerchants.name,
            bankName: banks.name
        })
        .from(onyxMerchants)
        .leftJoin(banks, eq(onyxMerchants.bankId, banks.id))
        .where(eq(onyxMerchants.id, req.params.id));
        
        if (merchants.length === 0) return res.status(404).json({ error: "Merchant not found" });
        res.json(merchants[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal error" });
    }
});


onyxRouter.get("/api/onyx/network-analytics", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { banks, transactions, cityCorpLogs, onyxMerchants, saasInvoices } = await import("../../db/schema.js");
    const { sql } = await import("drizzle-orm");

    try {
      const allBanks = await db.select().from(banks);
      const activeBankCount = allBanks.filter(b => !b.maintenanceMode).length;
      const totalBanksCount = allBanks.length;

      const allMerchants = await db.select().from(onyxMerchants);
      const totalMerchantsCount = allMerchants.length;

      const txSummary = await db.select({
        totalVolume: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        totalCount: sql<number>`COUNT(${transactions.id})`,
      }).from(transactions).get();

      const onyxTxSummary = await db.select({
        onyxVolume: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
        onyxCount: sql<number>`COUNT(${transactions.id})`,
      }).from(transactions).where(sql`${transactions.type} LIKE 'onyx_%'`).get();

      const logs = await db.select().from(cityCorpLogs);
      const totalCalls = logs.length;
      const successfulCalls = logs.filter(l => l.success).length;
      const failedCalls = logs.filter(l => !l.success).length;
      const avgLatencyMs = totalCalls > 0 ? Math.round(logs.reduce((acc, l) => acc + (l.latencyMs || 0), 0) / totalCalls) : 0;

      const endpointMap: Record<string, { count: number, totalLatency: number, successCount: number }> = {};
      logs.forEach(l => {
        const ep = l.endpoint || 'Unknown';
        if (!endpointMap[ep]) {
          endpointMap[ep] = { count: 0, totalLatency: 0, successCount: 0 };
        }
        endpointMap[ep].count += 1;
        endpointMap[ep].totalLatency += (l.latencyMs || 0);
        if (l.success) endpointMap[ep].successCount += 1;
      });

      const endpointBreakdown = Object.keys(endpointMap).map(ep => ({
        endpoint: ep,
        count: endpointMap[ep].count,
        avgLatencyMs: Math.round(endpointMap[ep].totalLatency / endpointMap[ep].count),
        successRate: Math.round((endpointMap[ep].successCount / endpointMap[ep].count) * 100),
      })).sort((a, b) => b.count - a.count);

      const invoices = await db.select().from(saasInvoices);
      const totalInvoicedCents = invoices.reduce((acc, i) => acc + (i.amount || 0), 0);
      const paidInvoicedCents = invoices.filter(i => i.status === 'paid').reduce((acc, i) => acc + (i.amount || 0), 0);
      const pendingInvoicedCents = invoices.filter(i => i.status === 'pending').reduce((acc, i) => acc + (i.amount || 0), 0);

      res.json({
        totalTransactionVolumeCents: txSummary?.totalVolume || 0,
        totalTransactionsCount: txSummary?.totalCount || 0,
        onyxVolumeCents: onyxTxSummary?.onyxVolume || 0,
        onyxTransactionsCount: onyxTxSummary?.onyxCount || 0,
        activeBankCount,
        totalBanksCount,
        totalMerchantsCount,
        apiUsageStats: {
          totalCalls,
          successfulCalls,
          failedCalls,
          avgLatencyMs,
          endpointBreakdown,
        },
        billingSummary: {
          totalInvoicesCount: invoices.length,
          totalInvoicedCents,
          paidInvoicedCents,
          pendingInvoicedCents,
        }
      });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
});

onyxRouter.get("/api/onyx/citycorp-logs", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cityCorpLogs, banks } = await import("../../db/schema");
    const { desc, eq } = await import("drizzle-orm");

    try {
      const logs = await db.select({
        id: cityCorpLogs.id,
        bankName: banks.name,
        endpoint: cityCorpLogs.endpoint,
        latencyMs: cityCorpLogs.latencyMs,
        status: cityCorpLogs.status,
        success: cityCorpLogs.success,
        errorMessage: cityCorpLogs.errorMessage,
        payload: cityCorpLogs.payload,
        timestamp: cityCorpLogs.timestamp
      })
      .from(cityCorpLogs)
      .leftJoin(banks, eq(cityCorpLogs.bankId, banks.id))
      .orderBy(desc(cityCorpLogs.timestamp))
      .limit(100);

      res.json(logs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

onyxRouter.get("/api/onyx/settings", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { onyxSettings } = await import("../../db/schema");
    try {
      let settings = await db.select().from(onyxSettings).get();
      if (!settings) {
        const initial = { id: "global", b2bApiFeePercent: 200, clearinghouseEnabled: true, globalBotMaintenance: false, botToken: null, guiChannelId: null, guiMessageId: null, settlementSchedule: "weekly", lastNetSettlementAt: null, settlementMinCents: 10000 };
        await db.insert(onyxSettings).values(initial);
        settings = initial;
      }
      const { botToken, ...safeSettings } = settings as any;
      res.json({ ...safeSettings, hasBotToken: !!botToken });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

onyxRouter.get("/api/onyx/bot-status", requireGlobalAdmin, (req: express.Request, res: express.Response) => {
    res.json({ status: botManager.getOnyxBotStatus() });
});

onyxRouter.put("/api/onyx/settings", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { onyxSettings } = await import("../../db/schema");
    try {
      const { b2bApiFeePercent, clearinghouseEnabled, globalBotMaintenance, botToken, guiChannelId, guiMessageId, settlementSchedule, settlementMinCents } = req.body;
      const data = { 
        id: "global", 
        b2bApiFeePercent, 
        clearinghouseEnabled, 
        globalBotMaintenance,
        ...(botToken !== undefined && { botToken }),
        ...(guiChannelId !== undefined && { guiChannelId }),
        ...(guiMessageId !== undefined && { guiMessageId }),
        ...(settlementSchedule !== undefined && { settlementSchedule }),
        ...(settlementMinCents !== undefined && { settlementMinCents }),
      };
      const exists = await db.select().from(onyxSettings).get();
      const { eq } = await import("drizzle-orm");
      if (exists) await db.update(onyxSettings).set(data).where(eq(onyxSettings.id, "global"));
      else await db.insert(onyxSettings).values(data as any);
      
      const { botManager } = await import("../../lib/bot_manager");
      const { banks } = await import("../../db/schema");
      const allBanks = await db.select().from(banks);
      for (const bank of allBanks) {
        if (bank.discordToken) {
          try {
            await botManager.provisionBankBot(bank.id, bank.discordToken);
          } catch (e) {
            // Already running
          }
          await botManager.updateBankBotPresence(bank.id, !!globalBotMaintenance || !!bank.maintenanceMode);
        }
      }
      
      const { botToken: _bt, ...safe } = data as any;
      res.json({ ...safe, hasBotToken: !!(botToken || exists?.botToken) });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

onyxRouter.post("/api/onyx/toggle-bot", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    try {
      const { db } = await import("../../db/index");
      const { onyxSettings } = await import("../../db/schema");
      const { eq } = await import("drizzle-orm");

      const settings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, "global")).get();
      if (!settings || !settings.botToken) {
        return res.status(400).json({ error: "No Onyx Bot Token provided. Please enter a valid Discord Bot Token first." });
      }

      const currentStatus = botManager.getOnyxBotStatus();
      if (currentStatus === 'online') {
        await botManager.stopOnyxBot();
        return res.json({ success: true, status: 'offline', message: "Onyx PSP Bot stopped." });
      } else {
        await botManager.startOnyxBot(settings.botToken);
        return res.json({ success: true, status: 'online', message: "Onyx PSP Bot starting..." });
      }
    } catch (e: any) {
      console.error("Failed to toggle Onyx bot:", e);
      res.status(500).json({ error: "Failed to toggle bot" });
    }
});

onyxRouter.post("/api/onyx/spawn-bot-gui", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    try {
      const { channelId } = req.body;
      if (!channelId) return res.status(400).json({ error: "channelId is required" });

      const onyxClient = botManager.getOnyxClient();
      if (!onyxClient || botManager.getOnyxBotStatus() !== 'online') {
        return res.status(400).json({ error: "Onyx PSP Bot is not running. Please start the Onyx Bot first." });
      }

      const { buildOnyxGlobalEmbedAndComponents } = await import("../../lib/onyx_bot_logic");
      const channel = await onyxClient.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        return res.status(400).json({ error: "Target channel not found or bot lacks permission to send messages." });
      }

      const data = await buildOnyxGlobalEmbedAndComponents();
      const msg = await (channel as any).send(data);

      const { db } = await import("../../db/index");
      const { onyxSettings } = await import("../../db/schema");
      const { eq } = await import("drizzle-orm");

      await db.update(onyxSettings).set({ guiChannelId: channelId, guiMessageId: msg.id }).where(eq(onyxSettings.id, "global"));

      res.json({ success: true, message: `Successfully spawned Onyx PSP Global Embed in channel ${channelId}` });
    } catch (err: any) {
      console.error("Failed to spawn Onyx GUI:", err);
      res.status(500).json({ error: "Failed to spawn Onyx GUI" });
    }
});

onyxRouter.post("/api/onyx/refresh-bot-gui", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    try {
      const onyxClient = botManager.getOnyxClient();
      if (!onyxClient) return res.status(400).json({ error: "Onyx Bot is not currently online." });

      const { refreshOnyxChannelGUI } = await import("../../lib/onyx_bot_logic");
      await refreshOnyxChannelGUI(onyxClient);
      res.json({ success: true, message: "Onyx PSP Channel GUI refreshed." });
    } catch (err: any) {
      console.error("Failed to refresh Onyx GUI:", err);
      res.status(500).json({ error: "Internal error" });
    }
});

onyxRouter.get("/api/onyx/merchants", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { onyxMerchants, banks, bankStaff, bankAccounts } = await import("../../db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    try {
      const user = (req as any).user;
      const requestedBankId = typeof req.query.bankId === "string" ? req.query.bankId : undefined;

      let allowedBankIds: string[] | null = null;
      if (!user?.isGlobalAdmin) {
        const { getUserCandidateIdentifiers } = await import("../userResolver.js");
        const candidateIds = await getUserCandidateIdentifiers(req);
        const ids = new Set<string>();
        if (candidateIds.length > 0) {
          const staffRows = await db.select({ bankId: bankStaff.bankId }).from(bankStaff).where(inArray(bankStaff.discordId, candidateIds));
          const accRows = await db.select({ bankId: bankAccounts.bankId }).from(bankAccounts).where(inArray(bankAccounts.ownerDiscordId, candidateIds));
          staffRows.forEach((r) => ids.add(r.bankId));
          accRows.forEach((r) => ids.add(r.bankId));
        }
        allowedBankIds = Array.from(ids);
      }

      if (requestedBankId) {
        if (allowedBankIds !== null && !allowedBankIds.includes(requestedBankId)) {
          return res.json([]);
        }
        allowedBankIds = [requestedBankId];
      }

      const selectShape = {
          id: onyxMerchants.id,
          name: onyxMerchants.name,
          bankId: onyxMerchants.bankId,
          destinationAccount: onyxMerchants.destinationAccount,
          createdAt: onyxMerchants.createdAt,
          bankName: banks.name
      };
      const base = db
        .select(selectShape)
        .from(onyxMerchants)
        .leftJoin(banks, eq(onyxMerchants.bankId, banks.id));
      const merchants = allowedBankIds === null
        ? await base
        : allowedBankIds.length === 0
          ? []
          : await base.where(inArray(onyxMerchants.bankId, allowedBankIds));
      res.json(merchants);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

onyxRouter.get("/api/onyx/settlements", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { clearinghouseSettlements, banks } = await import("../../db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");

    try {
      const fromBanks = alias(banks, "from_bnk");
      const toBanks = alias(banks, "to_bnk");
      const settlements = await db.select({
        id: clearinghouseSettlements.id,
        amount: clearinghouseSettlements.amount,
        status: clearinghouseSettlements.status,
        timestamp: clearinghouseSettlements.createdAt,
        fromBankName: fromBanks.name,
        toBankName: toBanks.name,
      })
      .from(clearinghouseSettlements)
      .leftJoin(fromBanks, eq(clearinghouseSettlements.fromBankId, fromBanks.id))
      .leftJoin(toBanks, eq(clearinghouseSettlements.toBankId, toBanks.id))
      .orderBy(desc(clearinghouseSettlements.createdAt))
      .limit(50);
      
      res.json(settlements);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

onyxRouter.post("/api/onyx/merchants", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { onyxMerchants } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");
    const crypto = await import("crypto");
    
    try {
      const { name, bankId, destinationAccount } = req.body;
      const { hashApiKey, last4OfKey, generateMerchantApiKey } = await import("../../lib/api_keys.js");
      const apiKey = generateMerchantApiKey();
      
      const newMerchant = {
        id: uuidv4(),
        name,
        bankId,
        destinationAccount,
        apiKey: `hashed:${hashApiKey(apiKey)}`,
        apiKeyHash: hashApiKey(apiKey),
        apiKeyLast4: last4OfKey(apiKey),
        createdAt: new Date(),
      };
      
      await db.insert(onyxMerchants).values(newMerchant);
      res.json({ ...newMerchant, apiKey });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

onyxRouter.post("/api/onyx/checkout", async (req: express.Request, res: express.Response) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing x-api-key header" });

    const { db } = await import("../../db/index");
    const { onyxMerchants, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { verifyPresentedKey, hashApiKey, last4OfKey } = await import("../../lib/api_keys.js");
      const { consumePaymentToken } = await import("../../lib/payment_tokens.js");
      const { bankIsSuspended } = await import("../../lib/tenant_guard.js");
      const { banks } = await import("../../db/schema");
      const allMerchants = await db.select().from(onyxMerchants);
      const merchant = allMerchants.find((m) => verifyPresentedKey({
        presented: apiKey,
        storedHash: (m as any).apiKeyHash,
        storedEncrypted: m.apiKey,
      }).ok);
      if (!merchant) return res.status(403).json({ error: "Invalid API key" });
      const verified = verifyPresentedKey({
        presented: apiKey,
        storedHash: (merchant as any).apiKeyHash,
        storedEncrypted: merchant.apiKey,
      });
      if (verified.needsBackfill) {
        await db.update(onyxMerchants).set({
          apiKeyHash: hashApiKey(apiKey),
          apiKeyLast4: last4OfKey(apiKey),
        } as any).where(eq(onyxMerchants.id, merchant.id));
      }

      const merchantBank = await db.select().from(banks).where(eq(banks.id, merchant.bankId)).get();
      if (bankIsSuspended(merchantBank)) {
        return res.status(403).json({ error: "Receiving bank is suspended." });
      }

      const { userDiscordId, amountCents, description, sourceAccountId, paymentToken } = req.body;

      if (!paymentToken) {
        return res.status(401).json({ error: "Missing customer paymentToken. Customer must approve this transaction first." });
      }

      if (!userDiscordId || !amountCents || amountCents <= 0) {
        return res.status(400).json({ error: "Invalid payment payload" });
      }

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      let decoded: any;
      try {
          decoded = jwt.verify(paymentToken, JWT_SECRET, { algorithms: ["HS256"] });
          if (decoded.discordId !== userDiscordId || decoded.amount !== amountCents) {
             return res.status(403).json({ error: "Payment token does not match requested amount or user." });
          }
          if (decoded.merchantId && decoded.merchantId !== merchant.id) {
             return res.status(403).json({ error: "Payment token is bound to a different merchant." });
          }
      } catch (e) {
          return res.status(403).json({ error: "Invalid or expired payment token." });
      }

      const consumed = await consumePaymentToken({
        token: paymentToken,
        merchantId: merchant.id,
        discordId: userDiscordId,
        amountCents,
      });
      if (!consumed) {
        return res.status(403).json({ error: "Payment token already used" });
      }

      let userAccount: any = null;
      let sourceCard: any = null;
      let destAccountId: string | null = null;
      let netAmount = 0;

      await db.transaction(async (tx: any) => {
        if (sourceAccountId) {
           if (sourceAccountId.startsWith("crd_")) {
             const { cards } = await import("../../db/schema");
             const matches = await tx.select().from(cards).where(eq(cards.id, sourceAccountId));
             if (matches.length === 0) throw new Error("Provided source card not found.");
             sourceCard = matches[0];
             if (sourceCard.isLocked) throw new Error("Source card is locked.");
             
             const accMatches = await tx.select().from(bankAccounts).where(
               and(eq(bankAccounts.id, sourceCard.accountId), eq(bankAccounts.ownerDiscordId, userDiscordId))
             );
             if (accMatches.length === 0) throw new Error("Linked account not found or unauthorized.");
             userAccount = accMatches[0];
           } else {
             const matches = await tx.select().from(bankAccounts).where(
               and(eq(bankAccounts.id, sourceAccountId), eq(bankAccounts.ownerDiscordId, userDiscordId))
             );
             if (matches.length === 0) throw new Error("Provided source account not found or unauthorized.");
             userAccount = matches[0];
           }
        } else {
           // Fallback to finding an account in the routing bank
           const userAccounts = await tx.select().from(bankAccounts).where(
             and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.ownerDiscordId, userDiscordId))
           );
   
           if (userAccounts.length === 0) {
             throw new Error("Customer has no bank accounts in the routing bank.");
           }
           userAccount = userAccounts[0]; 
        }

        if (sourceCard) {
            if ((sourceCard.creditUsed || 0) + amountCents > (sourceCard.creditLimit || 0)) {
                throw new Error("Insufficient credit limit.");
            }
        } else if (userAccount.balance < amountCents) {
          throw new Error(`Insufficient funds. Customer balance is ${(userAccount.balance / 100).toFixed(2)}.`);
        }

        // Calculate Tax
        const { onyxSettings } = await import("../../db/schema");
        const onyxSet = await tx.select().from(onyxSettings).where(eq(onyxSettings.id, 'global')).get();
        const taxRate = onyxSet?.b2bApiFeePercent || 0; 
        const taxAmount = Math.floor(amountCents * (taxRate / 10000));
        netAmount = amountCents - taxAmount;

        const destById = await tx.select().from(bankAccounts).where(
          and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.id, merchant.destinationAccount))
        );
        const destAccounts = destById.length > 0 ? destById : await tx.select().from(bankAccounts).where(
          and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.accountName, merchant.destinationAccount))
        );

        if (destAccounts.length === 0) {
          destAccountId = uuidv4();
          await tx.insert(bankAccounts).values({
            id: destAccountId,
            bankId: merchant.bankId,
            ownerDiscordId: 'merchant_system',
            accountName: merchant.destinationAccount,
            balance: 0,
            createdAt: new Date(),
          });
        } else {
          destAccountId = destAccounts[0].id;
        }

        if (sourceCard) {
            const { resolveLoanFundingAccount, settlementAccountName, loadSettings } = await import("../../lib/citycorp_money");
            const funding = await resolveLoanFundingAccount(merchant.bankId);
            let hasPool = funding.kind !== "treasury" && !!funding.name;
            if (!hasPool) {
              const settings = await loadSettings(merchant.bankId);
              const settleName = settlementAccountName(settings);
              const settleAcc = await tx.select().from(bankAccounts).where(
                and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.accountName, settleName))
              ).get();
              if (!settleAcc) {
                throw new Error("Credit checkout requires a loan pool, operating, or settlement account. No pool configured.");
              }
            }

            const { cards } = await import("../../db/schema");
            await tx.update(cards)
              .set({ creditUsed: (sourceCard.creditUsed || 0) + amountCents })
              .where(eq(cards.id, sourceCard.id));
        } else {
          // CityCorp book transfer happens after this sqlite tx to avoid holding the lock on HTTP.
        }

        if (taxAmount > 0) {
            await tx.insert(transactions).values({
               id: uuidv4(),
               bankId: merchant.bankId,
               fromAccountId: null,
               toAccountId: null,
               type: 'onyx_tax',
               amount: taxAmount,
               description: `Onyx PSP API Processor Fee`,
               timestamp: new Date()
            });
        }
      });

      if (sourceCard) {
        const { resolveLoanFundingAccount, disburseFromPoolOrOperating, executeSameBankBookTransfer, settlementAccountName, loadSettings } = await import("../../lib/citycorp_money");
        const liveDest = destAccountId
          ? await db.select().from(bankAccounts).where(eq(bankAccounts.id, destAccountId)).get()
          : null;
        if (!liveDest) {
          return res.status(400).json({ error: "Could not load destination account for credit settlement." });
        }
        try {
          const funding = await resolveLoanFundingAccount(merchant.bankId);
          if (funding.kind !== "treasury" && funding.name) {
            await disburseFromPoolOrOperating({
              bankId: merchant.bankId,
              toAccount: liveDest,
              amountCents: netAmount,
              description: description || `Onyx Purchase at ${merchant.name}`,
            });
          } else {
            const settings = await loadSettings(merchant.bankId);
            const settleName = settlementAccountName(settings);
            const settleAcc = await db.select().from(bankAccounts).where(
              and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.accountName, settleName))
            ).get();
            if (!settleAcc) {
              return res.status(400).json({ error: "Credit checkout requires a loan pool, operating, or settlement account. No pool configured." });
            }
            await executeSameBankBookTransfer({
              sourceAccount: settleAcc,
              destAccount: liveDest,
              desiredCents: netAmount,
              mode: "sender_covers",
              description: description || `Onyx Purchase at ${merchant.name}`,
              type: "onyx_payment",
            });
          }
        } catch (err: any) {
          try {
            const { cards } = await import("../../db/schema");
            await db.update(cards)
              .set({ creditUsed: sourceCard.creditUsed || 0 })
              .where(eq(cards.id, sourceCard.id));
          } catch (rollbackErr) {
            console.error("Failed to roll back creditUsed after CityCorp credit settlement failure", rollbackErr);
          }
          return res.status(400).json({ error: err.message || "Onyx credit CityCorp settlement failed" });
        }
      } else {
        const { executeSameBankBookTransfer, executeCrossBankSettledTransfer } = await import("../../lib/citycorp_money");
        const liveSource = await db.select().from(bankAccounts).where(eq(bankAccounts.id, userAccount.id)).get();
        const liveDest = destAccountId
          ? await db.select().from(bankAccounts).where(eq(bankAccounts.id, destAccountId)).get()
          : await db.select().from(bankAccounts).where(
              and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.accountName, merchant.destinationAccount))
            ).get();
        if (!liveSource || !liveDest) {
          return res.status(400).json({ error: "Could not load accounts for CityCorp settlement." });
        }
        try {
          if (liveSource.bankId === liveDest.bankId) {
            await executeSameBankBookTransfer({
              sourceAccount: liveSource,
              destAccount: liveDest,
              desiredCents: amountCents,
              mode: "sender_covers",
              description: description || `Onyx Purchase at ${merchant.name}`,
              type: "onyx_payment",
            });
          } else {
            await executeCrossBankSettledTransfer({
              sourceAccount: liveSource,
              destAccount: liveDest,
              desiredCents: amountCents,
              mode: "sender_covers",
              description: description || `Onyx Purchase at ${merchant.name}`,
            });
          }
        } catch (err: any) {
          return res.status(400).json({ error: err.message || "Onyx CityCorp settlement failed" });
        }
      }

      res.json({ success: true, message: "Payment processed successfully." });
    } catch (e: any) {
      console.error(e);
      res.status(400).json({ error: e.message || "Internal error during checkout" });
    }
  });
