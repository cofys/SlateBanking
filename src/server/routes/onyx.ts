import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const onyxRouter = express.Router();

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
        const initial = { id: "global", b2bApiFeePercent: 200, clearinghouseEnabled: true, globalBotMaintenance: false, botToken: null, guiChannelId: null, guiMessageId: null };
        await db.insert(onyxSettings).values(initial);
        settings = initial;
      }
      res.json(settings);
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
      const { b2bApiFeePercent, clearinghouseEnabled, globalBotMaintenance, botToken, guiChannelId, guiMessageId } = req.body;
      const data = { 
        id: "global", 
        b2bApiFeePercent, 
        clearinghouseEnabled, 
        globalBotMaintenance,
        ...(botToken !== undefined && { botToken }),
        ...(guiChannelId !== undefined && { guiChannelId }),
        ...(guiMessageId !== undefined && { guiMessageId })
      };
      const exists = await db.select().from(onyxSettings).get();
      const { eq } = await import("drizzle-orm");
      if (exists) await db.update(onyxSettings).set(data).where(eq(onyxSettings.id, "global"));
      else await db.insert(onyxSettings).values(data as any);
      
      const { botManager } = await import("../../lib/bot_manager");
      if (globalBotMaintenance) {
         // Stop all running bots
         const statuses = botManager.getBankStatuses();
         for (const bId of Object.keys(statuses)) {
             await botManager.stopBankBot(bId);
         }
         await botManager.stopOnyxBot();
      } else {
         // Restart bank bots
         const { banks } = await import("../../db/schema");
         const { eq } = await import("drizzle-orm");
         const allBanks = await db.select().from(banks).where(eq(banks.maintenanceMode, false));
         for (const bank of allBanks) {
             if (bank.discordToken) {
                try { await botManager.provisionBankBot(bank.id, bank.discordToken); } catch(e) { console.error("Caught error:", e); }
             }
         }
      }
      
      res.json(data);
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
      res.status(500).json({ error: e.message || "Failed to toggle bot" });
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
      res.status(500).json({ error: err.message || "Failed to spawn Onyx GUI" });
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
      res.status(500).json({ error: err.message });
    }
});

onyxRouter.get("/api/onyx/merchants", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { onyxMerchants } = await import("../../db/schema");
    try {
      const merchants = await db.select().from(onyxMerchants);
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
      const apiKey = "onyx_live_" + crypto.randomBytes(24).toString('hex');
      
      const newMerchant = {
        id: uuidv4(),
        name,
        bankId,
        destinationAccount,
        apiKey,
        createdAt: new Date(),
      };
      
      await db.insert(onyxMerchants).values(newMerchant);
      res.json(newMerchant);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

onyxRouter.post("/api/onyx/checkout", async (req: express.Request, res: express.Response) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing x-api-key header" });

    const { db } = await import("../../db/index");
    const { onyxMerchants, bankAccounts, transactions, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      // Authenticate merchant
      const merchants = await db.select().from(onyxMerchants).where(eq(onyxMerchants.apiKey, apiKey));
      if (merchants.length === 0) return res.status(403).json({ error: "Invalid API key" });
      const merchant = merchants[0];

      const { userDiscordId, amountCents, description, sourceAccountId, paymentToken } = req.body;

      if (!paymentToken) {
        return res.status(401).json({ error: "Missing customer paymentToken. Customer must approve this transaction first." });
      }

      if (!userDiscordId || !amountCents || amountCents <= 0) {
        return res.status(400).json({ error: "Invalid payment payload" });
      }

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      try {
          const decoded = jwt.verify(paymentToken, JWT_SECRET);
          if (decoded.discordId !== userDiscordId || decoded.amount !== amountCents) {
             return res.status(403).json({ error: "Payment token does not match requested amount or user." });
          }
      } catch (e) {
          return res.status(403).json({ error: "Invalid or expired payment token." });
      }

      await db.transaction(async (tx: any) => {
        let userAccount;
        if (sourceAccountId) {
           const matches = await tx.select().from(bankAccounts).where(
             and(eq(bankAccounts.id, sourceAccountId), eq(bankAccounts.ownerDiscordId, userDiscordId))
           );
           if (matches.length === 0) throw new Error("Provided source account not found or unauthorized.");
           userAccount = matches[0];
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

        if (userAccount.balance < amountCents) {
          throw new Error(`Insufficient funds. Customer balance is ${(userAccount.balance / 100).toFixed(2)}.`);
        }

        // Prepare CityCorp client
        const { CityCorpClient } = await import("../../lib/citycorp_api");
        const merchantBankRes = await tx.select().from(banks).where(eq(banks.id, merchant.bankId));
        const merchantBank = merchantBankRes[0];
        
        const sourceBankRes = await tx.select().from(banks).where(eq(banks.id, userAccount.bankId));
        const sourceBank = sourceBankRes[0];

        const isSourceBankCityCorp = !!(sourceBank && sourceBank.corpId && sourceBank.corpApiUuid && sourceBank.corpApiKey);
        const isMerchantBankCityCorp = !!(merchantBank && merchantBank.corpId && merchantBank.corpApiUuid && merchantBank.corpApiKey);

        // Calculate Tax
        const { onyxSettings, clearinghouseBalances } = await import("../../db/schema");
        const onyxSet = await tx.select().from(onyxSettings).where(eq(onyxSettings.id, 'global')).get();
        const taxRate = onyxSet?.b2bApiFeePercent || 0; 
        const taxAmount = Math.floor(amountCents * (taxRate / 10000));
        const netAmount = amountCents - taxAmount;

        let destAccountId = null as any;
        const destAccounts = await tx.select().from(bankAccounts).where(
          and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.accountName, merchant.destinationAccount))
        );

        if (destAccounts.length === 0) {
          destAccountId = uuidv4();
          await tx.insert(bankAccounts).values({
            id: destAccountId,
            bankId: merchant.bankId,
            ownerDiscordId: 'merchant_system',
            accountName: merchant.destinationAccount,
            balance: isMerchantBankCityCorp ? 0 : netAmount, 
            createdAt: new Date(),
          });
        } else {
          destAccountId = destAccounts[0].id;
          if (!isMerchantBankCityCorp) {
            await tx.update(bankAccounts)
              .set({ balance: destAccounts[0].balance + netAmount })
              .where(eq(bankAccounts.id, destAccountId));
          }
        }

        // Deduct from Source
        if (isSourceBankCityCorp) {
           const client = new CityCorpClient(sourceBank.corpId!, sourceBank.corpApiUuid!, sourceBank.corpApiKey!);
           const wRes = await client.withdraw(userAccount.accountName, amountCents / 100);
           if (!wRes.success) throw new Error(`Onyx CityCorp Withdrawal Failed: ${wRes.message}`);
        } else {
           await tx.update(bankAccounts)
             .set({ balance: userAccount.balance - amountCents })
             .where(eq(bankAccounts.id, userAccount.id));
        }

        // Add to Destination CityCorp if needed
        if (isMerchantBankCityCorp) {
           const client = new CityCorpClient(merchantBank.corpId!, merchantBank.corpApiUuid!, merchantBank.corpApiKey!);
           const dRes = await client.deposit(merchant.destinationAccount, netAmount / 100);
           if (!dRes.success) {
             // Rollback if destination fails
             if (isSourceBankCityCorp) {
                const sClient = new CityCorpClient(sourceBank.corpId!, sourceBank.corpApiUuid!, sourceBank.corpApiKey!);
                await sClient.deposit(userAccount.accountName, amountCents / 100);
             } else {
                await tx.update(bankAccounts)
                 .set({ balance: userAccount.balance }) // Revert
                 .where(eq(bankAccounts.id, userAccount.id));
             }
             throw new Error(`Onyx CityCorp Deposit Failed: ${dRes.message}`);
           }
        }
        
        // Handle Clearinghouse Balance Difference
        if (sourceBank.id !== merchantBank.id) {
            // Money left Source network and entered Merchant network
            const fBalance = await tx.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, sourceBank.id)).get();
            if(!fBalance) await tx.insert(clearinghouseBalances).values({ bankId: sourceBank.id, balance: -amountCents });
            else await tx.update(clearinghouseBalances).set({ balance: fBalance.balance - amountCents }).where(eq(clearinghouseBalances.bankId, sourceBank.id));

            const tBalance = await tx.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, merchantBank.id)).get();
            if(!tBalance) await tx.insert(clearinghouseBalances).values({ bankId: merchantBank.id, balance: netAmount });
            else await tx.update(clearinghouseBalances).set({ balance: tBalance.balance + netAmount }).where(eq(clearinghouseBalances.bankId, merchantBank.id));
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

        // Create transaction record explicitly so it shows up as an onyx payment in our DB
        await tx.insert(transactions).values({
          id: uuidv4(),
          bankId: merchant.bankId,
          fromAccountId: userAccount.id,
          toAccountId: destAccountId,
          amount: amountCents,
          type: 'onyx_payment',
          description: description || `Onyx Purchase at ${merchant.name}`,
          timestamp: new Date()
        });
      });

      res.json({ success: true, message: "Payment processed successfully." });
    } catch (e: any) {
      console.error(e);
      res.status(400).json({ error: e.message || "Internal error during checkout" });
    }
  });
