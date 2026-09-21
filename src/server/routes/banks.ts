import { db } from '../../db/index.js';
import { bankSettings, banks, bankAccounts, transactions, escrows, bankStaff, supportTickets, auditLogs, loans, creditApplications, vaultDeposits, cards, payrollJobs, subscriptions, clearinghouseBalances, cityCorpLogs, invoices, bankCustomers, loanProducts, creditProducts, saasInvoices, discordWebhooks, onyxMerchants, accountMembers, savingsGoals, paymentLinks, recurringTransfers, clearinghouseSettlements, interBankTransfers } from '../../db/schema.js';
import { eq, or } from 'drizzle-orm';
import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const banksRouter = express.Router();

banksRouter.get("/api/banks/:bankId/tiers", requireBankStaff, async (req: any, res: any) => {
  const { bankId } = req.params;
  try {
    const bank = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (!bank) return res.status(404).json({ error: "Bank not found" });
    res.json({ accountTiers: bank.accountTiers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

banksRouter.put("/api/banks/:bankId/tiers", [requireBankStaff, requireRole(["owner", "admin", "manager"])], async (req: any, res: any) => {
  const { bankId } = req.params;
  const { accountTiers } = req.body;
  try {
    await db.update(bankSettings)
      .set({ accountTiers })
      .where(eq(bankSettings.bankId, bankId));
    res.json({ accountTiers });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});


interface CityCorpSearchCacheEntry {
  timestamp: number;
  results: any[];
}
const corpSearchCache = new Map<string, CityCorpSearchCacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes TTL

// Simple periodic cleanup for corpSearchCache to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of corpSearchCache.entries()) {
    if (now - val.timestamp >= CACHE_TTL_MS) {
      corpSearchCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

banksRouter.put("/api/banks/:id", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const b = req.body;
      const updateData: any = {};
      if (b.name !== undefined) updateData.name = b.name;
      if (b.guildId !== undefined) updateData.guildId = b.guildId;
      if (b.discordToken !== undefined && b.discordToken !== "") {
        updateData.discordToken = b.discordToken;
        botManager.restartBankBot(req.params.id, b.discordToken).catch(err => console.error("Error recycling bot token:", err));
      }
      if (b.corpId !== undefined) updateData.corpId = b.corpId !== null && b.corpId !== "" ? parseInt(b.corpId) : null;
      if (b.corpApiUuid !== undefined) updateData.corpApiUuid = b.corpApiUuid;
      if (b.corpApiKey !== undefined && b.corpApiKey !== "") updateData.corpApiKey = b.corpApiKey;
      if (b.cityCorpAppId !== undefined) updateData.cityCorpAppId = b.cityCorpAppId;
      if (b.cityCorpAppSecret !== undefined && b.cityCorpAppSecret !== "") {
        updateData.cityCorpAppSecret = b.cityCorpAppSecret;
        updateData.corpApiKey = b.cityCorpAppSecret; // Unified App Token synchronizes to corpApiKey
      }
      if (b.customDomain !== undefined) updateData.customDomain = b.customDomain;
      if (b.discordClientId !== undefined) updateData.discordClientId = b.discordClientId;
      if (b.discordClientSecret !== undefined && b.discordClientSecret !== "") updateData.discordClientSecret = b.discordClientSecret;
      if (b.cityCorpAuthUrl !== undefined) updateData.cityCorpAuthUrl = b.cityCorpAuthUrl;
      
      await db.update(banks).set(updateData).where(eq(banks.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

// Bulk Enable/Disable Maintenance Mode for ALL banks across the platform
banksRouter.get("/api/banks/corp-finder", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankAccounts } = await import("../../db/schema");
    const { isNotNull, like, or, eq } = await import("drizzle-orm");

    try {
      const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';

      // 1. Fetch all configured banks (we need any with API credentials for the global search)
      const configuredBanks = await db.select({
        id: banks.id,
        name: banks.name,
        guildId: banks.guildId,
        corpId: banks.corpId,
        corpApiUuid: banks.corpApiUuid,
        cityCorpAppId: banks.cityCorpAppId,
        status: banks.status,
        logoUrl: banks.logoUrl,
        customDomain: banks.customDomain,
        hasKey: isNotNull(banks.corpApiKey),
      }).from(banks);

      let searchResults: any[] = [];
      
      if (query) {
        const cached = corpSearchCache.get(query);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
           searchResults = cached.results;
        } else {
          // Search global CityCorp API registry via /corp/list using any available tenant credentials
          const bankToUse = configuredBanks.find(b => b.corpApiUuid && b.hasKey);
          
          if (bankToUse) {
             const fullBank = await db.select().from(banks).where(eq(banks.id, bankToUse.id)).get();
             if (fullBank && fullBank.corpApiUuid && fullBank.corpApiKey) {
                let page = 1;
                let maxPages = 15; // safety limit to prevent infinite loops

                while (page <= maxPages) {
                   try {
                      const url = new URL(`https://api.cityrp.org/citycorp/corp/list`);
                      if (bankToUse.corpId) {
                         url.searchParams.append("corp_id", bankToUse.corpId.toString());
                      }
                      url.searchParams.append("page", page.toString());
                      
                      const authString = `${fullBank.corpApiUuid}:${fullBank.corpApiKey}`;
                      const authEncoded = Buffer.from(authString).toString('base64');
                      const headers = {
                         "Authorization": `Basic ${authEncoded}`,
                         "User-Agent": "SlateBankBot/1.0",
                         "Content-Type": "application/json"
                      };
                      
                      const resApi = await fetch(url.toString(), { headers });
                      if (!resApi.ok) break;

                      const dataApi = await resApi.json();
                      let allCorps: any[] = [];
                      if (Array.isArray(dataApi)) allCorps = dataApi;
                      else if (dataApi && Array.isArray(dataApi.corps)) allCorps = dataApi.corps;
                      else if (dataApi && Array.isArray(dataApi.corporations)) allCorps = dataApi.corporations;
                      else if (dataApi && Array.isArray(dataApi.results)) allCorps = dataApi.results;
                      else if (dataApi && Array.isArray(dataApi.data)) allCorps = dataApi.data;

                      if (allCorps.length === 0) break; // no more data

                      const matched = allCorps.filter((c: any) => c.name && c.name.toLowerCase().includes(query));
                      for (const m of matched) {
                         searchResults.push({
                            type: 'citycorp_registry',
                            title: m.name,
                            corpId: m.id || m.corp_id,
                            details: `Registered CityCorp Entity`
                         });
                      }

                      if (searchResults.length > 0) break; // Found matches, stop paging

                      if (dataApi && dataApi.totalPages && page >= dataApi.totalPages) break;
                      
                      page++;
                   } catch (e: any) {
                      console.error("[CorpFinder] Error fetching from citycorp/corp/list:", e);
                      break;
                   }
                }
             }
          }
          if (searchResults.length > 0) {
             corpSearchCache.set(query, { timestamp: Date.now(), results: searchResults });
          }
        }
      }

      res.json({
        configuredBanks,
        searchResults,
        testResult: null
      });
    } catch (e: any) {
      console.error("[CorpIdFinder] Error searching or testing Corp ID:", e);
      res.status(500).json({ error: "Failed to search CityCorp Corp IDs" });
    }
  });

banksRouter.post("/api/banks/maintenance-all", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    try {
      const { maintenanceMode } = req.body;
      if (typeof maintenanceMode !== 'boolean') {
        return res.status(400).json({ error: "Missing boolean maintenanceMode in request body" });
      }

      await db.update(banks).set({ maintenanceMode });

      const { botManager } = await import("../../lib/bot_manager");
      const allBanks = await db.select().from(banks);
      
      for (const bank of allBanks) {
        if (bank.discordToken) {
          try {
            await botManager.provisionBankBot(bank.id, bank.discordToken);
          } catch (e: any) {
            // Bot already provisioned or offline
          }
          await botManager.updateBankBotPresence(bank.id, maintenanceMode);
        }
      }

      res.json({ success: true, maintenanceMode, totalBanks: allBanks.length });
    } catch (e: any) {
      console.error("[MaintenanceAll] Error updating maintenance mode for all banks:", e);
      res.status(500).json({ error: "Failed to update global bank maintenance mode" });
    }
  });

// Toggle Maintenance Mode for a Specific Bank
banksRouter.post("/api/banks/:bankId/maintenance", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bId = req.params.bankId;
      const { maintenanceMode } = req.body;
      if (typeof maintenanceMode !== 'boolean') {
        return res.status(400).json({ error: "Missing boolean maintenanceMode in request body" });
      }

      await db.update(banks).set({ maintenanceMode }).where(eq(banks.id, bId));

      const bank = await db.select().from(banks).where(eq(banks.id, bId)).get();
      if (bank && bank.discordToken) {
        const { botManager } = await import("../../lib/bot_manager");
        try {
          await botManager.provisionBankBot(bId, bank.discordToken);
        } catch (e: any) {
          // Bot already provisioned or offline
        }
        await botManager.updateBankBotPresence(bId, maintenanceMode);
      }

      res.json({ success: true, bankId: bId, maintenanceMode });
    } catch (e: any) {
      console.error("[BankMaintenance] Error updating bank maintenance mode:", e);
      res.status(500).json({ error: "Failed to update bank maintenance mode" });
    }
  });

banksRouter.put("/api/banks/:id/billing", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const { 
        plan, 
        billingStatus, 
        platformFeePercent,
        billingModel,
        flatMonthlyRate,
        volumeFeePercent,
        profitSharePercent,
        perAccountRate,
        perTxRate,
        billingNotes
      } = req.body;

      const updateData: any = {};
      if (plan !== undefined) updateData.plan = plan;
      if (billingStatus !== undefined) updateData.billingStatus = billingStatus;
      if (platformFeePercent !== undefined) updateData.platformFeePercent = Math.round(Number(platformFeePercent) * 100);
      if (billingModel !== undefined) updateData.billingModel = billingModel;
      if (flatMonthlyRate !== undefined) updateData.flatMonthlyRate = Math.round(Number(flatMonthlyRate) * 100); // dollars to cents
      if (volumeFeePercent !== undefined) updateData.volumeFeePercent = Math.round(Number(volumeFeePercent) * 100); // % to bps
      if (profitSharePercent !== undefined) updateData.profitSharePercent = Math.round(Number(profitSharePercent) * 100); // % to bps
      if (perAccountRate !== undefined) updateData.perAccountRate = Math.round(Number(perAccountRate) * 100); // dollars to cents
      if (perTxRate !== undefined) updateData.perTxRate = Math.round(Number(perTxRate) * 100); // dollars to cents
      if (billingNotes !== undefined) updateData.billingNotes = billingNotes;

      await db.update(banks).set(updateData).where(eq(banks.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to update billing settings" });
    }
  });

banksRouter.get("/api/admin/banks/:id/calculate-billing", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, inArray, sql } = await import("drizzle-orm");

    try {
      const [bank] = await db.select().from(banks).where(eq(banks.id, req.params.id));
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bank.id));
      const activeAccountCount = accounts.filter(a => a.isActive).length;
      const accountIds = accounts.map(a => a.id);

      let totalVolumeCents = 0;
      let totalTxCount = 0;
      let estimatedProfitCents = 0;

      if (accountIds.length > 0) {
        const txSummary = await db.select({
          totalVolume: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
          txCount: sql<number>`COUNT(${transactions.id})`,
        })
        .from(transactions)
        .where(inArray(transactions.fromAccountId, accountIds))
        .get();

        totalVolumeCents = txSummary?.totalVolume || 0;
        totalTxCount = txSummary?.txCount || 0;

        // Estimate bank revenue/fees generated (approx 1.5% of transaction volume + standard platform fees)
        estimatedProfitCents = Math.round(totalVolumeCents * 0.025);
      }

      const flatRateCents = bank.flatMonthlyRate ?? 15000;
      const volBps = bank.volumeFeePercent ?? 50;
      const profitBps = bank.profitSharePercent ?? 500;
      const perAccountCents = bank.perAccountRate ?? 150;
      const perTxCents = bank.perTxRate ?? 25;

      const flatFee = flatRateCents;
      const volumeFee = Math.round((totalVolumeCents * volBps) / 10000);
      const profitShareFee = Math.round((estimatedProfitCents * profitBps) / 10000);
      const perAccountFee = activeAccountCount * perAccountCents;
      const perTxFee = totalTxCount * perTxCents;

      const modelCalculations: Record<string, { totalCents: number, breakdown: string }> = {
        flat_monthly: {
          totalCents: flatFee,
          breakdown: `Flat Monthly Fee: $${(flatFee / 100).toFixed(2)}`,
        },
        volume_tier: {
          totalCents: volumeFee,
          breakdown: `Volume Fee (${(volBps / 100).toFixed(2)}% of $${(totalVolumeCents / 100).toFixed(2)} volume): $${(volumeFee / 100).toFixed(2)}`,
        },
        revenue_share: {
          totalCents: profitShareFee,
          breakdown: `Profit Share (${(profitBps / 100).toFixed(2)}% of $${(estimatedProfitCents / 100).toFixed(2)} profit): $${(profitShareFee / 100).toFixed(2)}`,
        },
        per_account: {
          totalCents: flatFee / 2 + perAccountFee,
          breakdown: `Base ($${(flatFee / 200).toFixed(2)}) + ${activeAccountCount} Accounts @ $${(perAccountCents / 100).toFixed(2)}/acc: $${((flatFee / 2 + perAccountFee) / 100).toFixed(2)}`,
        },
        per_tx: {
          totalCents: flatFee / 2 + perTxFee,
          breakdown: `Base ($${(flatFee / 200).toFixed(2)}) + ${totalTxCount} Txs @ $${(perTxCents / 100).toFixed(2)}/tx: $${((flatFee / 2 + perTxFee) / 100).toFixed(2)}`,
        },
        hybrid: {
          totalCents: flatFee + volumeFee + profitShareFee + perAccountFee,
          breakdown: `Flat Base ($${(flatFee / 100).toFixed(2)}) + Vol Fee ($${(volumeFee / 100).toFixed(2)}) + Profit Share ($${(profitShareFee / 100).toFixed(2)}) + ${activeAccountCount} Accs ($${(perAccountFee / 100).toFixed(2)})`,
        },
      };

      const selectedModel = bank.billingModel || "flat_monthly";
      const activeCalculation = modelCalculations[selectedModel] || modelCalculations.flat_monthly;

      res.json({
        bankId: bank.id,
        bankName: bank.name,
        selectedBillingModel: selectedModel,
        calculatedAmountCents: activeCalculation.totalCents,
        breakdownText: activeCalculation.breakdown,
        metrics: {
          activeAccountCount,
          totalVolumeCents,
          totalTxCount,
          estimatedProfitCents,
        },
        allModelProjections: modelCalculations,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:id/upload-db", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const fs = await import("fs");
    const path = await import("path");
    
    let tempFilePath = "";
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Missing file content" });
      }
      
      const bankId = req.params.id;
      const tempDir = path.join(process.cwd(), "data", "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      tempFilePath = path.join(tempDir, `${bankId}_${Date.now()}_temp.db`);
      const buffer = Buffer.from(content, "base64");
      fs.writeFileSync(tempFilePath, buffer);
      
      // Open the uploaded SQLite database using better-sqlite3
      const DatabaseConstructor = (await import("better-sqlite3")).default;
      const uploadDb = new DatabaseConstructor(tempFilePath);
      
      // Find all tables in the uploaded database
      const tables = uploadDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      
      let accountsImported = 0;
      let transactionsImported = 0;
      
      // We'll search for common legacy table names
      const accountsTable = tables.find(t => 
        ['accounts', 'bank_accounts', 'users', 'players', 'clients', 'customers'].includes(t.name.toLowerCase())
      )?.name;
      
      const transactionsTable = tables.find(t => 
        ['transactions', 'transfers', 'history', 'ledger', 'audit_logs'].includes(t.name.toLowerCase())
      )?.name;
      
      if (!accountsTable) {
        uploadDb.close();
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(400).json({ 
          error: `Could not identify an accounts or users table. Tables found: ${tables.map(t => t.name).join(", ")}` 
        });
      }
      
      // Query columns of the accounts table to map dynamically
      const columnsInfo = uploadDb.prepare(`PRAGMA table_info(${accountsTable})`).all() as { name: string }[];
      const colNames = columnsInfo.map(c => c.name.toLowerCase());
      
      const idCol = columnsInfo.find(c => ['id', 'uuid', 'discord_id', 'discordid', 'owner', 'player'].includes(c.name.toLowerCase()))?.name;
      const nameCol = columnsInfo.find(c => ['name', 'account_name', 'accountname', 'username', 'title'].includes(c.name.toLowerCase()))?.name;
      const balanceCol = columnsInfo.find(c => ['balance', 'amount', 'money', 'cents', 'total'].includes(c.name.toLowerCase()))?.name;
      const discordIdCol = columnsInfo.find(c => ['discord_id', 'discordid', 'owner_discord_id', 'user_id', 'userid'].includes(c.name.toLowerCase()))?.name;
      
      if (!balanceCol) {
        uploadDb.close();
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(400).json({ error: `Could not find a balance/amount column in table '${accountsTable}'` });
      }
      
      // Read accounts
      const legacyAccounts = uploadDb.prepare(`SELECT * FROM ${accountsTable}`).all() as any[];
      
      for (const legacyAcc of legacyAccounts) {
        const rawDiscordId = discordIdCol ? legacyAcc[discordIdCol] : (idCol ? legacyAcc[idCol] : null);
        if (!rawDiscordId) continue;
        
        const discordId = rawDiscordId.toString();
        const accountName = nameCol ? legacyAcc[nameCol] : `Legacy Account (${discordId})`;
        
        let balanceVal = legacyAcc[balanceCol] || 0;
        let balanceCents = Math.round(Number(balanceVal) * 100);
        if (colNames.includes('cents') || balanceCol.toLowerCase().includes('cents')) {
          balanceCents = Number(balanceVal);
        }
        
        // Check if account already exists
        const existing = await db.select().from(bankAccounts).where(
          and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, discordId))
        );
        
        let targetAccountId;
        if (existing.length === 0) {
          targetAccountId = uuidv4();
          await db.insert(bankAccounts).values({
            id: targetAccountId,
            bankId,
            ownerDiscordId: discordId,
            accountName: accountName.toString(),
            balance: 0,
            isActive: true,
            createdAt: new Date()
          });
          accountsImported++;
        } else {
          targetAccountId = existing[0].id;
        }
        
        // If transactions table exists, let's map them for this account
        if (transactionsTable) {
          const txColumns = uploadDb.prepare(`PRAGMA table_info(${transactionsTable})`).all() as { name: string }[];
          const txColNames = txColumns.map(c => c.name.toLowerCase());
          
          const txAmountCol = txColumns.find(c => ['amount', 'value', 'price', 'cents', 'total'].includes(c.name.toLowerCase()))?.name;
          const txTypeCol = txColumns.find(c => ['type', 'category', 'action'].includes(c.name.toLowerCase()))?.name;
          const txDescCol = txColumns.find(c => ['description', 'memo', 'note', 'reason', 'details'].includes(c.name.toLowerCase()))?.name;
          const txTimeCol = txColumns.find(c => ['timestamp', 'date', 'created_at', 'createdat', 'time'].includes(c.name.toLowerCase()))?.name;
          const txAccountCol = txColumns.find(c => ['account_id', 'accountid', 'account', 'owner', 'player'].includes(c.name.toLowerCase()))?.name;
          
          if (txAmountCol) {
            let query = `SELECT * FROM ${transactionsTable}`;
            let params: any[] = [];
            if (txAccountCol) {
              query += ` WHERE ${txAccountCol} = ?`;
              params.push(legacyAcc[idCol || discordIdCol || 'id']);
            }
            
            try {
              const legacyTransactions = uploadDb.prepare(query).all(params) as any[];
              for (const legacyTx of legacyTransactions) {
                let txAmt = legacyTx[txAmountCol] || 0;
                let txAmtCents = Math.round(Number(txAmt) * 100);
                if (txColNames.includes('cents') || txAmountCol.toLowerCase().includes('cents')) {
                  txAmtCents = Number(txAmt);
                }
                
                const txType = txTypeCol ? legacyTx[txTypeCol] : 'deposit';
                const txDesc = txDescCol ? legacyTx[txDescCol] : 'Legacy imported transaction';
                const txTime = txTimeCol ? new Date(legacyTx[txTimeCol]) : new Date();
                
                const isOutflow = ['withdraw', 'withdrawal', 'fee', 'tax', 'debit'].includes(txType.toString().toLowerCase()) || txAmtCents < 0;
                
                await db.insert(transactions).values({
                  id: uuidv4(),
                  bankId,
                  fromAccountId: isOutflow ? targetAccountId : null,
                  toAccountId: !isOutflow ? targetAccountId : null,
                  type: isOutflow ? 'withdraw' : 'deposit',
                  amount: Math.abs(txAmtCents),
                  description: txDesc.toString(),
                  timestamp: txTime
                });
                transactionsImported++;
              }
            } catch (txErr) {
              console.error("Failed to import transactions for account", discordId, txErr);
            }
          }
        }
      }
      
      uploadDb.close();
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
      // Audit Log entry
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId,
        userDiscordId: "GlobalAdmin",
        action: "database_import",
        details: `Imported bank.db SQLite migration file. Accounts created: ${accountsImported}, Transactions: ${transactionsImported}`,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        accountsImported,
        transactionsImported
      });
    } catch (e: any) {
      console.error(e);
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      res.status(500).json({ error: e.message || "Failed to process database migration" });
    }
  });

banksRouter.delete("/api/banks/:id", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { 
      banks, bankAccounts, transactions, bankSettings, escrows, bankStaff,
      supportTickets, auditLogs, loans, creditApplications, vaultDeposits,
      cards, payrollJobs, subscriptions, clearinghouseBalances, cityCorpLogs,
      invoices, bankCustomers, loanProducts, creditProducts, saasInvoices,
      discordWebhooks, onyxMerchants, accountMembers, savingsGoals, paymentLinks,
      recurringTransfers, clearinghouseSettlements, interBankTransfers
    } = await import("../../db/schema.js");
    const { eq, or, inArray } = await import("drizzle-orm");
    const { botManager } = await import("../../lib/bot_manager.js");

    try {
      const id = req.params.id;
      
      // Stop running bot if active
      try {
        await botManager.stopBankBot(id);
      } catch (err) {
        console.error("Error stopping bank bot on deletion:", err);
      }

      // Find all account IDs associated with this bank to delete sub-account entities
      const accs = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.bankId, id));
      const accIds = accs.map(a => a.id);

      if (accIds.length > 0) {
        await db.delete(accountMembers).where(inArray(accountMembers.accountId, accIds)).catch(() => {});
        await db.delete(savingsGoals).where(inArray(savingsGoals.accountId, accIds)).catch(() => {});
        await db.delete(paymentLinks).where(inArray(paymentLinks.billerAccountId, accIds)).catch(() => {});
        await db.delete(recurringTransfers).where(or(inArray(recurringTransfers.fromAccountId, accIds), inArray(recurringTransfers.toAccountId, accIds))).catch(() => {});
      }

      // Delete all bank-level dependent rows
      await db.delete(transactions).where(eq(transactions.bankId, id)).catch(() => {});
      await db.delete(vaultDeposits).where(eq(vaultDeposits.bankId, id)).catch(() => {});
      await db.delete(cards).where(eq(cards.bankId, id)).catch(() => {});
      await db.delete(payrollJobs).where(eq(payrollJobs.bankId, id)).catch(() => {});
      await db.delete(subscriptions).where(eq(subscriptions.bankId, id)).catch(() => {});
      await db.delete(invoices).where(eq(invoices.bankId, id)).catch(() => {});
      await db.delete(loans).where(eq(loans.bankId, id)).catch(() => {});
      await db.delete(creditApplications).where(eq(creditApplications.bankId, id)).catch(() => {});
      await db.delete(loanProducts).where(eq(loanProducts.bankId, id)).catch(() => {});
      await db.delete(creditProducts).where(eq(creditProducts.bankId, id)).catch(() => {});
      await db.delete(escrows).where(eq(escrows.bankId, id)).catch(() => {});
      await db.delete(supportTickets).where(eq(supportTickets.bankId, id)).catch(() => {});
      await db.delete(auditLogs).where(eq(auditLogs.bankId, id)).catch(() => {});
      await db.delete(discordWebhooks).where(eq(discordWebhooks.bankId, id)).catch(() => {});
      await db.delete(saasInvoices).where(eq(saasInvoices.bankId, id)).catch(() => {});
      await db.delete(cityCorpLogs).where(eq(cityCorpLogs.bankId, id)).catch(() => {});
      await db.delete(onyxMerchants).where(eq(onyxMerchants.bankId, id)).catch(() => {});
      await db.delete(bankStaff).where(eq(bankStaff.bankId, id)).catch(() => {});
      await db.delete(bankCustomers).where(eq(bankCustomers.bankId, id)).catch(() => {});
      await db.delete(bankSettings).where(eq(bankSettings.bankId, id)).catch(() => {});
      await db.delete(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, id)).catch(() => {});
      await db.delete(clearinghouseSettlements).where(or(eq(clearinghouseSettlements.fromBankId, id), eq(clearinghouseSettlements.toBankId, id))).catch(() => {});
      await db.delete(interBankTransfers).where(or(eq(interBankTransfers.fromBankId, id), eq(interBankTransfers.toBankId, id))).catch(() => {});
      
      // Delete bank accounts and finally the bank record itself
      await db.delete(bankAccounts).where(eq(bankAccounts.bankId, id)).catch(() => {});
      await db.delete(banks).where(eq(banks.id, id));

      res.json({ success: true });
    } catch(e: any) {
      console.error("Error deleting bank instance:", e);
      res.status(500).json({ error: e.message || "Failed to delete bank instance" });
    }
  });

banksRouter.post("/api/banks/:id/bot-status", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { botManager } = await import("../../lib/bot_manager");
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const { action } = req.body;
      const id = req.params.id;
      
      if (action === 'stop') {
        await botManager.stopBankBot(id);
        res.json({ success: true, status: 'offline' });
      } else if (action === 'start') {
        const bankRecord = await db.select().from(banks).where(eq(banks.id, id));
        if (bankRecord.length > 0) {
          await botManager.provisionBankBot(id, bankRecord[0].discordToken);
          res.json({ success: true, status: 'online' });
        } else {
          res.status(404).json({ error: 'Bank not found' });
        }
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/directory", async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankSettings } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const all = await db.select({
        id: banks.id,
        name: banks.name,
        customDomain: banks.customDomain,
        brandingColor: banks.brandingColor,
        logoUrl: banks.logoUrl,
      }).from(banks);
      const settings = await db.select({
        bankId: bankSettings.bankId,
        logoUrl: bankSettings.logoUrl,
        tagline: bankSettings.tagline,
      }).from(bankSettings);
      const byId = new Map(settings.map((s) => [s.bankId, s]));
      res.json(all.map((b) => ({
        id: b.id,
        name: b.name,
        customDomain: b.customDomain,
        brandingColor: b.brandingColor,
        logoUrl: byId.get(b.id)?.logoUrl || b.logoUrl,
        tagline: byId.get(b.id)?.tagline || null,
        portalPath: b.customDomain ? `https://${String(b.customDomain).replace(/^https?:\/\//, "")}` : `/portal/${b.id}`,
      })));
    } catch (e: any) {
      res.status(500).json({ error: "Failed to list banks" });
    }
  });

banksRouter.get("/api/banks", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    try {
      const allBanks = await db.select().from(banks);
      const statuses = botManager.getBankStatuses();
      
      const decodedUser = (req as any).user;
      const isGlobalAdmin = decodedUser && decodedUser.isGlobalAdmin;

      const enrichedBanks = allBanks.map(b => {
        if (isGlobalAdmin) {
          const { discordToken, discordClientSecret, corpApiKey, cityCorpAppSecret, apiKey, webhookSecret, apiKeyHash, ...safeBank } = b as any;
          return {
            ...safeBank,
            hasDiscordToken: !!discordToken,
            hasDiscordClientSecret: !!discordClientSecret,
            hasCityCorpAppSecret: !!cityCorpAppSecret,
            hasApiKey: !!apiKey,
            hasWebhookSecret: !!webhookSecret,
            status: statuses[b.id] || "offline"
          };
        } else {
          return {
            id: b.id,
            name: b.name,
            guildId: b.guildId,
            discordClientId: b.discordClientId,
            cityCorpAppId: b.cityCorpAppId,
            cityCorpAuthUrl: b.cityCorpAuthUrl,
            customDomain: b.customDomain,
            brandingColor: b.brandingColor,
            logoUrl: b.logoUrl,
            plan: b.plan,
            billingStatus: b.billingStatus,
            platformFeePercent: b.platformFeePercent,
            createdAt: b.createdAt,
            maintenanceMode: (b as any).maintenanceMode,
            status: statuses[b.id] || "offline"
          };
        }
      });
      res.json(enrichedBanks);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankAccounts } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { name, guildId, discordToken, discordClientId, discordClientSecret, customDomain, corpId, corpApiUuid, corpApiKey, cityCorpAppId, cityCorpAppSecret } = req.body;
      const newBank = {
        id: uuidv4(),
        name,
        guildId,
        discordToken,
        customDomain,
        corpId,
        corpApiUuid,
        corpApiKey,
        cityCorpAppId,
        cityCorpAppSecret,
        discordClientId,
        discordClientSecret,
        status: "offline",
        createdAt: new Date(),
      };
      await db.insert(banks).values(newBank);

      // Provision System GL Accounts (Double-Entry Ledger Base)
      const systemAccounts = [
        { name: "Vault Cash", cat: "vault_cash", type: "system_asset" },
        { name: "Fee Revenue", cat: "fee_revenue", type: "system_revenue" },
        { name: "Interest Revenue", cat: "interest_revenue", type: "system_revenue" },
        { name: "Payroll Expense", cat: "payroll_expense", type: "system_expense" },
        { name: "Clearinghouse", cat: "clearinghouse", type: "system_asset" }
      ];

      for (const sys of systemAccounts) {
         await db.insert(bankAccounts).values({
            id: uuidv4(),
            bankId: newBank.id,
            ownerDiscordId: "SYSTEM",
            accountName: sys.name,
            accountType: sys.type,
            isSystem: true,
            systemCategory: sys.cat,
            createdAt: new Date(),
         });
      }
      
      // Attempt to provision bot
      try {
        await botManager.provisionBankBot(newBank.id, discordToken);
      } catch (err) {
        console.error("Failed to provision new bot right away", err);
      }

      // Add WS listener
      if (corpId && corpApiUuid && corpApiKey) {
        const { addCityCorpEventSubscriber } = await import("../../lib/bot_events");
        addCityCorpEventSubscriber(newBank.id, corpApiUuid, corpApiKey);
      }
      
      res.json({
        id: newBank.id,
        name: newBank.name,
        guildId: newBank.guildId,
        customDomain: newBank.customDomain,
        corpId: newBank.corpId,
        cityCorpAppId: newBank.cityCorpAppId,
        discordClientId: newBank.discordClientId,
        status: newBank.status,
        createdAt: newBank.createdAt,
        hasDiscordToken: !!discordToken,
        hasCorpApiKey: !!corpApiKey,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

async function resolveAccountAndUser(db: any, bankId: string, accIdOrName: string | null, cache?: { accounts?: any[], customers?: any[], users?: any[] }) {
  if (!accIdOrName) return null;
  const { bankAccounts, bankCustomers, users } = await import("../../db/schema");
  const { eq } = await import("drizzle-orm");

  if (!cache?.accounts) {
    cache = cache || {};
    cache.accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
    cache.customers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, bankId));
    try { cache.users = await db.select().from(users); } catch (e) { cache.users = []; }
  }

  const accounts = cache.accounts || [];
  const customers = cache.customers || [];
  const globalUsers = cache.users || [];

  const acc = accounts.find((a: any) => a.id === accIdOrName || a.accountName === accIdOrName);
  const ownerKey = acc ? acc.ownerDiscordId : accIdOrName;

  const cust = customers.find((c: any) => c.discordId === ownerKey || c.mcUsername === ownerKey || c.linkedDiscordId === ownerKey);
  const gUser = globalUsers.find((u: any) => u.discordId === ownerKey || u.mcUsername === ownerKey);

  const isNumericDiscord = /^\d{17,20}$/.test(ownerKey);

  let username = cust?.mcUsername || gUser?.mcUsername;
  if (!username) {
    if (!isNumericDiscord && ownerKey !== "imported" && ownerKey !== "SYSTEM" && !ownerKey.startsWith("unassigned_")) {
      username = ownerKey;
    } else if (cust?.linkedDiscordId || gUser?.discordId) {
      username = cust?.linkedDiscordId || gUser?.discordId;
    } else if (ownerKey === "SYSTEM") {
      username = "SYSTEM";
    } else if (ownerKey === "imported") {
      username = "Legacy Imported";
    } else if (ownerKey.startsWith("unassigned_")) {
      username = `Unassigned (${ownerKey.replace("unassigned_", "").replace(/_/g, " ")})`;
    } else {
      username = isNumericDiscord ? "Citizen" : ownerKey;
    }
  }

  const accountName = acc ? acc.accountName : null;
  return {
    accountId: acc ? acc.id : accIdOrName,
    accountName,
    username,
    displayName: accountName ? `${username} (${accountName})` : username
  };
}

banksRouter.get("/api/banks/:bankId/invoices", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { invoices, bankAccounts, bankCustomers, users } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const data = await db.select().from(invoices).where(eq(invoices.bankId, req.params.bankId)).orderBy(desc(invoices.createdAt));
      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const customers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      let globalUsers: any[] = [];
      try { globalUsers = await db.select().from(users); } catch (e) {}

      const cache = { accounts, customers, users: globalUsers };

      const enrichedInvoices = await Promise.all(data.map(async (inv) => {
        const billerInfo = await resolveAccountAndUser(db, req.params.bankId, inv.billerAccountId, cache);
        const customerInfo = await resolveAccountAndUser(db, req.params.bankId, inv.customerAccountId, cache);

        return {
          ...inv,
          billerUsername: billerInfo?.username || inv.billerAccountId,
          billerAccountName: billerInfo?.accountName || null,
          billerDisplayName: billerInfo?.displayName || inv.billerAccountId,
          customerUsername: customerInfo?.username || inv.customerAccountId,
          customerAccountName: customerInfo?.accountName || null,
          customerDisplayName: customerInfo?.displayName || inv.customerAccountId
        };
      }));

      res.json(enrichedInvoices);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/invoices", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { invoices, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { billerAccountId, customerAccountId, amount, description, dueDateDays } = req.body;
      
      const bAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      
      const bAcc = bAccounts.find(a => a.id === billerAccountId || a.accountName === billerAccountId || a.ownerDiscordId === billerAccountId);
      if (!bAcc) return res.status(400).json({ error: "Biller account not found" });

      const cAcc = bAccounts.find(a => a.id === customerAccountId || a.accountName === customerAccountId || a.ownerDiscordId === customerAccountId);
      if (!cAcc) return res.status(400).json({ error: "Customer account not found" });

      const due = new Date();
      due.setDate(due.getDate() + (dueDateDays || 7));

      const newInv = {
         id: uuidv4(),
         bankId: req.params.bankId,
         billerAccountId: bAcc.id,
         customerAccountId: cAcc.id,
         amount,
         description: description || "Invoice",
         dueDate: due,
         status: "pending",
         createdAt: new Date(),
      };
      
      await db.insert(invoices).values(newInv);
      res.json(newInv);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.put("/api/banks/:bankId/invoices/:invoiceId/status", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { invoices } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.update(invoices).set({ status: req.body.status }).where(
        and(eq(invoices.id, req.params.invoiceId), eq(invoices.bankId, req.params.bankId))
      );
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/customers/:discordId/update-id", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const oldId = req.params.discordId;
      const { newDiscordId } = req.body;

      if (!newDiscordId || typeof newDiscordId !== 'string') {
        return res.status(400).json({ error: "Missing or invalid newDiscordId" });
      }
      
      const { bankCustomers } = await import("../../db/schema");
      const { or, like } = await import("drizzle-orm");
      
      let finalDiscordId = newDiscordId;
      const existingCustomer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, bId),
          or(
            eq(bankCustomers.discordId, newDiscordId),
            like(bankCustomers.mcUsername, newDiscordId)
          )
        )
      ).get();
      
      if (existingCustomer) {
        finalDiscordId = existingCustomer.discordId;
      }

      await db.update(bankAccounts)
        .set({ ownerDiscordId: finalDiscordId })
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, oldId)));
      
      // Also update the customer record itself if we aren't merging into an existing one
      if (!existingCustomer) {
         await db.update(bankCustomers).set({ discordId: finalDiscordId }).where(and(eq(bankCustomers.bankId, bId), eq(bankCustomers.discordId, oldId)));
      } else if (existingCustomer.discordId !== oldId) {
         // Merge: we could delete the old record, but let's just let it be for now or delete it
         await db.delete(bankCustomers).where(and(eq(bankCustomers.bankId, bId), eq(bankCustomers.discordId, oldId)));
      }

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator', // Ideally this should be req.user.id if we had operator auth middleware here
        action: 'customer_id_updated',
        details: `Updated discord ID from ${oldId} to ${newDiscordId} for all accounts`,
        timestamp: new Date()
      });

      res.json({ success: true, newDiscordId });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

banksRouter.post("/api/banks/:bankId/customers/:discordId/freeze", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const dId = req.params.discordId;
      const { freeze } = req.body;

      await db.update(bankAccounts)
        .set({ isActive: !freeze })
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, dId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: freeze ? 'customer_frozen' : 'customer_unfrozen',
        details: `${freeze ? 'Froze' : 'Unfroze'} all accounts for discord ID ${dId}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

banksRouter.get("/api/banks/:bankId/audit", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { auditLogs } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.bankId, req.params.bankId))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit)
        .offset(offset);
      res.json(logs);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/customers", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, bankCustomers, users } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localCustomers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      let globalUsers: any[] = [];
      try {
        globalUsers = await db.select().from(users);
      } catch (e) {}

      const customerMap = new Map<string, any>();
      for (const account of dbAccounts) {
        const dId = account.ownerDiscordId || "Unknown";
        if (!customerMap.has(dId)) {
          const profile = localCustomers.find(c => c.discordId === dId || c.mcUsername === dId || c.linkedDiscordId === dId);
          const gUser = globalUsers.find(u => u.discordId === dId || u.mcUsername === dId);
          
          const isNumericDiscord = /^\d{17,20}$/.test(dId);
          
          let mcUsername = profile?.mcUsername || gUser?.mcUsername;
          if (!mcUsername && !isNumericDiscord && dId !== "imported" && !dId.startsWith("unassigned_")) {
            mcUsername = dId;
          }

          let linkedDiscordId = profile?.linkedDiscordId || gUser?.discordId || (isNumericDiscord ? dId : null);

          customerMap.set(dId, {
            discordId: dId,
            mcUsername: mcUsername || null,
            linkedDiscordId: linkedDiscordId || null,
            kycStatus: profile?.kycStatus || "pending",
            accountCount: 0,
            totalBalance: 0,
            firstJoined: account.createdAt
          });
        }
        const c = customerMap.get(dId);
        c.accountCount += 1;
        c.totalBalance += account.balance;
        if (new Date(account.createdAt) < new Date(c.firstJoined)) {
           c.firstJoined = account.createdAt;
        }
      }
      
      res.json(Array.from(customerMap.values()));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/team", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankStaff } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const staff = await db.select().from(bankStaff).where(eq(bankStaff.bankId, req.params.bankId));
      res.json(staff);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/team", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankStaff } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const newStaff = {
        id: uuidv4(),
        bankId: req.params.bankId,
        discordId: req.body.discordId?.trim(),
        role: req.body.role,
        createdAt: new Date(),
      };
      await db.insert(bankStaff).values(newStaff);
      res.json(newStaff);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.put("/api/banks/:bankId/team/:staffId", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankStaff } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { role } = req.body;
      if (!role) return res.status(400).json({ error: "Role is required" });
      await db.update(bankStaff)
        .set({ role })
        .where(and(eq(bankStaff.id, req.params.staffId), eq(bankStaff.bankId, req.params.bankId)));
      res.json({ success: true, role });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.delete("/api/banks/:bankId/team/:staffId", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankStaff } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.delete(bankStaff).where(and(eq(bankStaff.id, req.params.staffId), eq(bankStaff.bankId, req.params.bankId)));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/customers/:discordId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, bankCustomers, users } = await import("../../db/schema");
    const { eq, or, inArray, desc, and } = await import("drizzle-orm");
    try {
      const dIdParam = req.params.discordId;
      const dbAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.ownerDiscordId, dIdParam))
      );
      
      const accountIds = dbAccounts.map(a => a.id);

      let txList: any[] = [];
      if (accountIds.length > 0) {
        txList = await db.select().from(transactions).where(
          and(
            eq(transactions.bankId, req.params.bankId),
            or(
              inArray(transactions.fromAccountId, accountIds),
              inArray(transactions.toAccountId, accountIds)
            )
          )
        ).orderBy(desc(transactions.timestamp)).limit(50);
      }
      
      const customerRecord = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, req.params.bankId), eq(bankCustomers.discordId, dIdParam))
      ).limit(1);

      let gUser: any = null;
      try {
        const uRes = await db.select().from(users).where(or(eq(users.discordId, dIdParam), eq(users.mcUsername, dIdParam))).limit(1);
        gUser = uRes[0] || null;
      } catch (e) {}

      const isNumericDiscord = /^\d{17,20}$/.test(dIdParam);
      const mcUsername = customerRecord[0]?.mcUsername || gUser?.mcUsername || (!isNumericDiscord && dIdParam !== "imported" && !dIdParam.startsWith("unassigned_") ? dIdParam : "");
      const linkedDiscordId = customerRecord[0]?.linkedDiscordId || gUser?.discordId || (isNumericDiscord ? dIdParam : "");

      res.json({
        discordId: dIdParam,
        mcUsername,
        linkedDiscordId,
        accounts: dbAccounts,
        transactions: txList,
        totalBalance: dbAccounts.reduce((sum, a) => sum + a.balance, 0),
        firstJoined: dbAccounts.length ? dbAccounts.reduce((min, a) => new Date(a.createdAt) < min ? new Date(a.createdAt) : min, new Date()) : null,
        notes: customerRecord[0]?.notes || "",
        kycStatus: customerRecord[0]?.kycStatus || "pending"
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/customers/:discordId/profile", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankCustomers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { notes, kycStatus, linkedDiscordId, mcUsername } = req.body;
      const bankId = req.params.bankId;
      const discordId = req.params.discordId;

      const existing = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
      ).limit(1);

      const updateData: any = {
        notes: notes !== undefined ? notes : "",
        kycStatus: kycStatus || "pending"
      };
      if (linkedDiscordId !== undefined) updateData.linkedDiscordId = linkedDiscordId;
      if (mcUsername !== undefined) updateData.mcUsername = mcUsername;

      if (existing.length > 0) {
        await db.update(bankCustomers)
          .set(updateData)
          .where(and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId)));
      } else {
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId,
          discordId,
          linkedDiscordId: linkedDiscordId || discordId,
          mcUsername: mcUsername || "",
          notes: notes || "",
          kycStatus: kycStatus || "pending",
          createdAt: new Date()
        });
      }

      res.json({ success: true, notes, kycStatus, linkedDiscordId, mcUsername });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/accounts/:accountId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions } = await import("../../db/schema");
    const { eq, or, desc, and } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.id, req.params.accountId))
      );
      if (dbAccounts.length === 0) return res.status(404).json({ error: "Account not found" });
      const account = dbAccounts[0];

      const txList = await db.select().from(transactions).where(
        and(
          eq(transactions.bankId, req.params.bankId),
          or(
            eq(transactions.fromAccountId, account.id),
            eq(transactions.toAccountId, account.accountName)
          )
        )
      ).orderBy(desc(transactions.timestamp)).limit(50);
      
      res.json({
        account,
        transactions: txList
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/update-account", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const accId = req.params.accountId;
      const { newDiscordId, accountType, tierId } = req.body;

      if (!newDiscordId || typeof newDiscordId !== 'string') {
        return res.status(400).json({ error: "Missing or invalid newDiscordId" });
      }
      
      const { bankCustomers } = await import("../../db/schema");
      const { or, like } = await import("drizzle-orm");
      
      // Resolve username or discord ID
      let finalOwner = newDiscordId;
      const existingCustomer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, bId),
          or(
            eq(bankCustomers.discordId, newDiscordId),
            like(bankCustomers.mcUsername, newDiscordId)
          )
        )
      ).get();
      
      if (existingCustomer && existingCustomer.mcUsername) {
        finalOwner = existingCustomer.mcUsername;
      } else if (existingCustomer) {
        finalOwner = existingCustomer.discordId;
      }

      const updateData: any = { ownerDiscordId: finalOwner };
      if (accountType) {
        updateData.accountType = accountType;
      }
      if (tierId !== undefined) {
        updateData.tierId = tierId || null;
      }

      await db.update(bankAccounts)
        .set(updateData)
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.id, accId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: 'account_updated',
        details: `Updated account ${accId}: owner ${finalOwner}, type ${accountType || 'unchanged'}`,
        timestamp: new Date()
      });

      res.json({ success: true, ownerDiscordId: finalOwner, accountType });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

banksRouter.put("/api/banks/:bankId/accounts/:accountId/custom-settings", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const accId = req.params.accountId;
      const { customTransferFeePercent, customDepositFeePercent, customWithdrawFeePercent } = req.body;

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accId), eq(bankAccounts.bankId, bId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });

      const parseFee = (val: any) => {
        if (val === null || val === undefined || val === "" || val === "default") return null;
        const num = parseFloat(val);
        return isNaN(num) ? null : Math.round(num * 100); // convert % to integer (multiplied by 100 / bps)
      };

      const newTransferFee = customTransferFeePercent !== undefined ? parseFee(customTransferFeePercent) : acc.customTransferFeePercent;
      const newDepositFee = customDepositFeePercent !== undefined ? parseFee(customDepositFeePercent) : acc.customDepositFeePercent;
      const newWithdrawFee = customWithdrawFeePercent !== undefined ? parseFee(customWithdrawFeePercent) : acc.customWithdrawFeePercent;

      await db.update(bankAccounts).set({
        customTransferFeePercent: newTransferFee,
        customDepositFeePercent: newDepositFee,
        customWithdrawFeePercent: newWithdrawFee,
      }).where(and(eq(bankAccounts.id, accId), eq(bankAccounts.bankId, bId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: 'account_custom_fees_updated',
        details: `Updated custom fee overrides for account ${acc.accountName} (${acc.id})`,
        timestamp: new Date()
      });

      const updated = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accId)).get();
      res.json({ success: true, account: updated });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to update custom account settings" });
    }
  });

banksRouter.get("/api/banks/:bankId/settings", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankSettings, banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const [bank] = await db.select().from(banks).where(eq(banks.id, req.params.bankId));
      const settingsResult = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId));
      let settings = settingsResult[0];
      if (!settings) {
        // Return default empty settings
        settings = {
          bankId: req.params.bankId,
          withdrawFeePercent: 0,
          depositFeePercent: 0,
          transferFeePercent: 0,
          colorScheme: "slate",
          logoUrl: null,
          supportEmail: null,
          discordWebhookUrl: null,
          requireKyc: false,
          discordVerifiedRoleId: null,
          discordClientRoleId: null,
          enableLoans: true,
          enableVaults: true,
          enableCards: true,
          enablePayroll: true,
          enableSubscriptions: true,
          enableEscrow: true,
          enableTreasury: true,
          enableAccountTiers: true
        } as any;
      }
      res.json({
        ...settings,
        logoUrl: settings.logoUrl || bank?.logoUrl || "",
        customDomain: bank?.customDomain || "",
        brandingColor: bank?.brandingColor || "#4f46e5",
        discordClientId: bank?.discordClientId || "",
        cityCorpAppId: bank?.cityCorpAppId || "",
        hasCityCorpAppSecret: !!bank?.cityCorpAppSecret,
        maintenanceMode: bank?.maintenanceMode || false,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.put("/api/banks/:bankId/settings", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankSettings, banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bId = req.params.bankId;
      
      if (req.body.discordClientId !== undefined) {
         await db.update(banks).set({ discordClientId: req.body.discordClientId }).where(eq(banks.id, bId));
      }
      if (req.body.discordClientSecret !== undefined && req.body.discordClientSecret !== "") {
         await db.update(banks).set({ discordClientSecret: req.body.discordClientSecret }).where(eq(banks.id, bId));
      }
      if (req.body.brandingColor !== undefined) {
         const raw = String(req.body.brandingColor).trim();
         const hex = raw.startsWith("#") ? raw : `#${raw}`;
         if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
           await db.update(banks).set({ brandingColor: hex.toLowerCase() }).where(eq(banks.id, bId));
         }
      }
      if (req.body.logoUrl !== undefined) {
         const logo = String(req.body.logoUrl || "").trim();
         if (logo) {
           await db.update(banks).set({ logoUrl: logo }).where(eq(banks.id, bId));
         }
      }
      if (req.body.customDomain !== undefined) {
         await db.update(banks).set({ customDomain: req.body.customDomain }).where(eq(banks.id, bId));
      }
      if (req.body.maintenanceMode !== undefined) {
         await db.update(banks).set({ maintenanceMode: req.body.maintenanceMode }).where(eq(banks.id, bId));
         
         const { botManager } = await import("../../lib/bot_manager");
         const bank = await db.select().from(banks).where(eq(banks.id, bId)).get();
         if (bank && bank.discordToken) {
            try {
              await botManager.provisionBankBot(bId, bank.discordToken);
            } catch (e: any) {
              // Bot already provisioned or running
            }
            await botManager.updateBankBotPresence(bId, req.body.maintenanceMode);
         }
      }

      if (req.body.cityCorpAppId !== undefined || req.body.cityCorpAppSecret !== undefined) {
         const updateData: any = {};
         if (req.body.cityCorpAppId !== undefined) updateData.cityCorpAppId = req.body.cityCorpAppId;
         if (req.body.cityCorpAppSecret !== undefined && req.body.cityCorpAppSecret !== "") {
            updateData.cityCorpAppSecret = req.body.cityCorpAppSecret;
            updateData.corpApiKey = req.body.cityCorpAppSecret; // Unified App Token synchronizes to corpApiKey
         }
         await db.update(banks).set(updateData).where(eq(banks.id, bId));
      }

      const data = {
        bankId: bId,
        withdrawFeePercent: req.body.withdrawFeePercent,
        depositFeePercent: req.body.depositFeePercent,
        transferFeePercent: req.body.transferFeePercent,
        colorScheme: req.body.colorScheme,
        logoUrl: req.body.logoUrl,
        supportEmail: req.body.supportEmail,
        discordWebhookUrl: req.body.discordWebhookUrl,
        requireKyc: req.body.requireKyc,
        discordVerifiedRoleId: req.body.discordVerifiedRoleId,
        discordClientRoleId: req.body.discordClientRoleId,
        enableLoans: req.body.enableLoans,
        enableVaults: req.body.enableVaults,
        enableCards: req.body.enableCards,
        enablePayroll: req.body.enablePayroll,
        enableSubscriptions: req.body.enableSubscriptions,
        enableEscrow: req.body.enableEscrow,
        enableTreasury: req.body.enableTreasury,
        enableAccountTiers: req.body.enableAccountTiers,
        autoApproveLoans: req.body.autoApproveLoans,
        autoApproveCreditCards: req.body.autoApproveCreditCards,
        maxAutoApproveLoanAmount: req.body.maxAutoApproveLoanAmount,
        vaultTiers: req.body.vaultTiers,
        loginBgUrl: req.body.loginBgUrl,
        enableGoogleDocsContracts: req.body.enableGoogleDocsContracts,
        googleDocsLoanTemplateUrl: req.body.googleDocsLoanTemplateUrl,
        googleDocsCreditTemplateUrl: req.body.googleDocsCreditTemplateUrl,
        googleDocsEscrowTemplateUrl: req.body.googleDocsEscrowTemplateUrl,
        googleDocsFolderUrl: req.body.googleDocsFolderUrl,
        googleDocsAutoGenerate: req.body.googleDocsAutoGenerate,
        loanPoolAccount: req.body.loanPoolAccount,
        feeCollectionAccount: req.body.feeCollectionAccount,
        interestPoolAccount: req.body.interestPoolAccount,
        defaultCorpAccount: req.body.defaultCorpAccount,
        settlementAccount: req.body.settlementAccount,
        settlementFloorCents: req.body.settlementFloorCents,
        settlementWarnCents: req.body.settlementWarnCents,
        defaultFeePayerMode: req.body.defaultFeePayerMode,
        requirePersonalForBusiness: req.body.requirePersonalForBusiness,
        savingsApyPercent: req.body.savingsApyPercent,
        defaultLoanApr: req.body.defaultLoanApr,
        defaultLoanTermMonths: req.body.defaultLoanTermMonths,
        maxLoanAmountCents: req.body.maxLoanAmountCents,
        loanPaymentPeriodDays: req.body.loanPaymentPeriodDays,
        loanAutoDebitEnabled: req.body.loanAutoDebitEnabled,
        loanLateFeeFlatCents: req.body.loanLateFeeFlatCents,
        loanLateFeePercent: req.body.loanLateFeePercent,
        loanMissesToDefault: req.body.loanMissesToDefault,
        loanGracePeriodDays: req.body.loanGracePeriodDays,
        loanRetryDays: req.body.loanRetryDays,
        loanAccrueInterest: req.body.loanAccrueInterest,
        loanInterestAccrual: req.body.loanInterestAccrual,
        loanAccrueOnDefaulted: req.body.loanAccrueOnDefaulted,
        loanCompoundLateFees: req.body.loanCompoundLateFees,
        loanMinInstallmentCents: req.body.loanMinInstallmentCents,
        loanRequireSignature: req.body.loanRequireSignature,
        loanAllowCitizenApply: req.body.loanAllowCitizenApply,
        loanCureDefaultOnPay: req.body.loanCureDefaultOnPay,
        loanDaysInYear: req.body.loanDaysInYear,
        interestDaysInYear: req.body.interestDaysInYear,
        tagline: req.body.tagline,
        discordWelcome: req.body.discordWelcome,
        discordFooter: req.body.discordFooter,
        discordBotActivity: req.body.discordBotActivity,
        discordShowStats: req.body.discordShowStats,
      };

      const existing = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bId));
      if (existing.length === 0) {
        await db.insert(bankSettings).values(data);
      } else {
        await db.update(bankSettings).set(data).where(eq(bankSettings.bankId, bId));
      }

      if (req.body.overwriteCustomAccountFees) {
        const { bankAccounts, auditLogs } = await import("../../db/schema");
        const { v4: uuidv4 } = await import("uuid");

        const transferFee = req.body.transferFeePercent !== undefined && req.body.transferFeePercent !== null && req.body.transferFeePercent !== "" ? Math.round(Number(req.body.transferFeePercent)) : null;
        const depositFee = req.body.depositFeePercent !== undefined && req.body.depositFeePercent !== null && req.body.depositFeePercent !== "" ? Math.round(Number(req.body.depositFeePercent)) : null;
        const withdrawFee = req.body.withdrawFeePercent !== undefined && req.body.withdrawFeePercent !== null && req.body.withdrawFeePercent !== "" ? Math.round(Number(req.body.withdrawFeePercent)) : null;

        await db.update(bankAccounts).set({
          customTransferFeePercent: transferFee,
          customDepositFeePercent: depositFee,
          customWithdrawFeePercent: withdrawFee
        }).where(eq(bankAccounts.bankId, bId));

        await db.insert(auditLogs).values({
          id: uuidv4(),
          bankId: bId,
          userDiscordId: 'Operator',
          action: 'bulk_custom_fees_overwritten',
          details: `Applied bank-wide fee update to all accounts (Transfer: ${transferFee ?? 'default'}, Deposit: ${depositFee ?? 'default'}, Withdraw: ${withdrawFee ?? 'default'})`,
          timestamp: new Date()
        });
      }

      try {
        const { loadBank, ensureNamedCityCorpAccount } = await import("../../lib/citycorp_money");
        const bankRow = await loadBank(bId);
        const settleName = String(req.body.settlementAccount || data.settlementAccount || "SETTLEMENT").trim() || "SETTLEMENT";
        await ensureNamedCityCorpAccount({
          bank: bankRow,
          accountName: settleName,
          systemCategory: "clearinghouse",
        });
        for (const [raw, cat] of [
          [req.body.loanPoolAccount, "loan_pool"],
          [req.body.interestPoolAccount, "interest_revenue"],
          [req.body.defaultCorpAccount, "vault_cash"],
        ] as const) {
          const n = String(raw || "").trim();
          if (!n) continue;
          await ensureNamedCityCorpAccount({ bank: bankRow, accountName: n, systemCategory: cat }).catch((e) => {
            console.warn("[settings] pool provision skipped", n, e);
          });
        }
      } catch (e) {
        console.warn("[settings] SETTLEMENT provision skipped", e);
      }

      try {
        const { botManager } = await import("../../lib/bot_manager");
        await botManager.updateBankBotPresence(bId);
        const { refreshBankChannelGUIs } = await import("../../lib/bot_logic");
        await refreshBankChannelGUIs(bId);
      } catch (e) {
        console.warn("[settings] discord refresh skipped", e);
      }

      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/accrue-interest", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, bankSettings } = await import("../../db/schema");
    const { eq, and, gt } = await import("drizzle-orm");

    try {
      const bankId = req.params.bankId;
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      const apyBasisPoints = settings?.savingsApyPercent ?? 300;
      if (apyBasisPoints <= 0) {
        return res.json({ success: true, processedCount: 0, totalInterestPaid: 0, message: "Interest rate set to 0%" });
      }
      if (!settings?.interestPoolAccount) {
        return res.status(400).json({ error: "Set an interest pool account before accruing APY. Interest cannot be minted locally." });
      }

      const eligibleAccounts = await db.select().from(bankAccounts).where(
        and(
          eq(bankAccounts.bankId, bankId),
          eq(bankAccounts.isActive, true),
          eq(bankAccounts.isFrozen, false),
          gt(bankAccounts.balance, 0)
        )
      );

      let processedCount = 0;
      let totalInterestPaid = 0;
      const { payFromInterestPool } = await import("../../lib/citycorp_money");

      for (const account of eligibleAccounts) {
        const dailyInterest = Math.floor((account.balance * (apyBasisPoints / 10000)) / 365);
        if (dailyInterest <= 0) continue;
        try {
          const paid = await payFromInterestPool({
            bankId,
            toAccount: account,
            amountCents: dailyInterest,
            description: `Savings Interest Accrual (${(apyBasisPoints / 100).toFixed(2)}% APY)`,
          });
          if (!paid) continue;
          processedCount++;
          totalInterestPaid += dailyInterest;
        } catch (e) {
          console.error("[InterestAccrual] payout failed", e);
        }
      }

      await db.update(bankSettings)
        .set({ lastInterestAccrualAt: new Date() })
        .where(eq(bankSettings.bankId, bankId));

      res.json({
        success: true,
        processedCount,
        totalInterestPaid,
        apyBasisPoints,
        accrualTimestamp: new Date()
      });
    } catch (e: any) {
      console.error("[InterestAccrualError]:", e);
      res.status(500).json({ error: "Failed to accrue interest" });
    }
});

banksRouter.get("/api/banks/:bankId/products", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loanProducts, creditProducts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    
    try {
      const bankId = req.params.bankId;
      const loansList = await db.select().from(loanProducts).where(eq(loanProducts.bankId, bankId));
      const creditsList = await db.select().from(creditProducts).where(eq(creditProducts.bankId, bankId));
      
      res.json({ loans: loansList, credits: creditsList });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

banksRouter.post("/api/banks/:bankId/products", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const staffRole = (req as any).staffRole;
    if (staffRole !== "admin" && staffRole !== "manager") {
       return res.status(403).json({ error: "Only Managers and Admins can create products." });
    }
    const { db } = await import("../../db/index");
    const { loanProducts, creditProducts } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const bankId = req.params.bankId;
      const { type, name, interestRate, maxLimit, termDays, rewardsPercent, tierId, cashAdvanceEnabled, cashAdvanceFeePercent, annualFee, cardKind } = req.body;
      
      if (!name || isNaN(interestRate) || isNaN(maxLimit)) {
        return res.status(400).json({ error: "Invalid product data" });
      }

      if (type === 'loan') {
        if (!termDays) return res.status(400).json({ error: "Term days required for loans" });
        await db.insert(loanProducts).values({
          id: uuidv4(),
          bankId,
          name,
          interestRate: Number(interestRate),
          maxAmount: Number(maxLimit) * 100, // convert to cents
          termDays: Number(termDays),
          createdAt: new Date()
        });
      } else {
        await db.insert(creditProducts).values({
          id: uuidv4(),
          bankId,
          name,
          interestRate: Number(interestRate),
          maxLimit: Number(maxLimit) * 100,
          rewardsPercent: Number(rewardsPercent) || 0,
          tierId: tierId || null,
          cashAdvanceEnabled: cashAdvanceEnabled !== false,
          cashAdvanceFeePercent: Math.round((parseFloat(cashAdvanceFeePercent) || 3) * 100),
          annualFeeCents: Math.round((parseFloat(annualFee) || 0) * 100),
          cardKind: cardKind === "debit" ? "debit" : "credit",
          createdAt: new Date()
        } as any);
      }
      
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

banksRouter.put("/api/banks/:bankId/products/:productId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loanProducts, creditProducts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    
    try {
      const staffRole = (req as any).staffRole;
      if (staffRole !== "admin" && staffRole !== "manager") {
         return res.status(403).json({ error: "Only Managers and Admins can edit products." });
      }
      
      const { bankId, productId } = req.params;
      const { type, name, interestRate, maxLimit, termDays, rewardsPercent, isActive, tierId, cashAdvanceEnabled, cashAdvanceFeePercent, annualFee, cardKind } = req.body;
      
      if (!name || isNaN(interestRate) || isNaN(maxLimit)) {
        return res.status(400).json({ error: "Invalid product data" });
      }

      if (type === 'loan') {
        if (!termDays) return res.status(400).json({ error: "Term days required for loans" });
        await db.update(loanProducts).set({
          name,
          interestRate: Number(interestRate),
          maxAmount: Number(maxLimit) * 100,
          termDays: Number(termDays),
          isActive: isActive !== undefined ? isActive : true
        }).where(and(eq(loanProducts.id, productId), eq(loanProducts.bankId, bankId)));
      } else {
        await db.update(creditProducts).set({
          name,
          interestRate: Number(interestRate),
          maxLimit: Number(maxLimit) * 100,
          rewardsPercent: Number(rewardsPercent) || 0,
          isActive: isActive !== undefined ? isActive : true,
          tierId: tierId || null,
          cashAdvanceEnabled: cashAdvanceEnabled !== false,
          cashAdvanceFeePercent: Math.round((parseFloat(cashAdvanceFeePercent) || 3) * 100),
          annualFeeCents: Math.round((parseFloat(annualFee) || 0) * 100),
          cardKind: cardKind === "debit" ? "debit" : "credit",
        } as any).where(and(eq(creditProducts.id, productId), eq(creditProducts.bankId, bankId)));
      }
      
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to update product" });
    }
});

banksRouter.delete("/api/banks/:bankId/products/:productId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loanProducts, creditProducts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    
    try {
      const staffRole = (req as any).staffRole;
      if (staffRole !== "admin" && staffRole !== "manager") {
         return res.status(403).json({ error: "Only Managers and Admins can delete products." });
      }
      
      const { bankId, productId } = req.params;
      const { type } = req.query; // pass ?type=loan or ?type=credit
      
      if (type === 'loan') {
        await db.delete(loanProducts).where(and(eq(loanProducts.id, productId), eq(loanProducts.bankId, bankId)));
      } else {
        await db.delete(creditProducts).where(and(eq(creditProducts.id, productId), eq(creditProducts.bankId, bankId)));
      }
      
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to delete product" });
    }
});


banksRouter.get("/api/banks/:bankId/accounts", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, bankCustomers, users } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const accounts = await db.select()
        .from(bankAccounts)
        .where(eq(bankAccounts.bankId, req.params.bankId))
        .orderBy(desc(bankAccounts.createdAt));

      const customers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      const allUsers = await db.select().from(users);

      const customerMap = new Map<string, string>();
      for (const u of allUsers) {
        if (u.discordId && u.mcUsername) customerMap.set(u.discordId, u.mcUsername);
        if (u.mcUsername) customerMap.set(u.mcUsername, u.mcUsername);
      }
      for (const c of customers) {
        if (c.discordId && c.mcUsername) customerMap.set(c.discordId, c.mcUsername);
        if (c.mcUsername) customerMap.set(c.mcUsername, c.mcUsername);
      }

      const enrichedAccounts = accounts.map(acc => {
        const isPersonalName = acc.accountName.toLowerCase().startsWith("personal-") || 
                               acc.accountName.toLowerCase().startsWith("personal_") || 
                               acc.accountName.toLowerCase().includes("personal");
        const resolvedType = acc.accountType || (isPersonalName ? "personal" : "business");
        
        let ownerMcUsername = customerMap.get(acc.ownerDiscordId);
        if (!ownerMcUsername) {
          if (acc.ownerDiscordId && acc.ownerDiscordId !== "imported" && !/^\d{17,20}$/.test(acc.ownerDiscordId)) {
            ownerMcUsername = acc.ownerDiscordId;
          } else {
            ownerMcUsername = acc.ownerDiscordId;
          }
        }

        return {
          ...acc,
          accountType: resolvedType,
          ownerMcUsername: ownerMcUsername || acc.ownerDiscordId
        };
      });

      res.json(enrichedAccounts);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks, bankCustomers } = await import("../../db/schema");
    const { eq, and, or, like } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    // We expect minecraftUsername in the body
    const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername, accountType, tierId } = req.body;
    
    try {
      // 1. Fetch Bank Configuration
      const { bankSettings } = await import("../../db/schema");
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId)).get();
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) {
        return res.status(404).json({ error: "Bank not found" });
      }
      const bank = bankResult[0];

      // 2. Fetch Mojang UUID if username is provided
      let mojangUuid = null;
      let resolvedMcUsername = minecraftUsername || ownerDiscordId || "";
      if (resolvedMcUsername && !/^\d{17,20}$/.test(resolvedMcUsername) && resolvedMcUsername !== "imported") {
        try {
          const { resolveMinecraftUsername } = await import("../player_resolver.js");
          // Attempt Mojang API lookup if username looks like a MC username
          const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${resolvedMcUsername}`);
          if (mojangRes.ok) {
            const mojangData = await mojangRes.json();
            if (mojangData && mojangData.id) {
              const id = mojangData.id;
              mojangUuid = `${id.substring(0,8)}-${id.substring(8,12)}-${id.substring(12,16)}-${id.substring(16,20)}-${id.substring(20)}`;
              if (mojangData.name) resolvedMcUsername = mojangData.name;
            }
          }
        } catch (e: any) {
          console.error("Mojang API error", e);
        }
      }

      // Determine default accountType if not provided
      const isPersonalName = accountName.toLowerCase().startsWith("personal-") || 
                             accountName.toLowerCase().startsWith("personal_") || 
                             accountName.toLowerCase().includes("personal");
      const finalAccountType = accountType || (isPersonalName ? "personal" : "business");

      // 3. CityCorp API Integration if configured
      if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
        const { CityCorpClient } = await import("../../lib/citycorp_api");
        const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
        
        // 3a. Create corp account
        let linkExisting = false;
        const createRes = await client.createAccount(accountName);
        if (!createRes.success) {
          if (createRes.message && createRes.message.includes("An account with that name already exists")) {
             linkExisting = true;
          } else {
            console.error(`CityCorp API Create Account Failed:`, createRes.message);
            return res.status(400).json({ error: `CityCorp Error: ${createRes.message}` });
          }
        }

        // Fetch actual balance if linking existing account
        if (linkExisting) {
           const details = await client.getAccountDetails(accountName);
           if (details && details.balance !== undefined) {
             req.body.initialBalanceCents = Math.round(details.balance * 100);
           }
        }

        // 3b. Add subuser to corp account
        if (mojangUuid) {
          const subuserRes = await client.addSubuser(accountName, mojangUuid);
          if (!subuserRes.success) {
             console.error(`CityCorp Add Subuser Failed:`, subuserRes.message);
          }
        }
        
        // 3c. New CityCorp accounts start at $0. Seed via teller cash window or in-game deposit.
        // Linking an existing in-game account SETS the cache from live balance.
      }

      // 4. Resolve Owner ID
      let finalOwner = resolvedMcUsername || ownerDiscordId || 'imported';
      const existingCustomer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, req.params.bankId),
          or(
            eq(bankCustomers.discordId, finalOwner),
            like(bankCustomers.mcUsername, finalOwner)
          )
        )
      ).get();
      
      if (existingCustomer && existingCustomer.mcUsername) {
        finalOwner = existingCustomer.mcUsername;
      } else if (resolvedMcUsername && resolvedMcUsername !== "imported") {
        // Upsert customer
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId: req.params.bankId,
          discordId: resolvedMcUsername,
          mcUsername: resolvedMcUsername,
          mcUuid: mojangUuid,
          kycStatus: "approved",
          createdAt: new Date()
        }).onConflictDoNothing();
      }

      // 5. Create in local DB
      const newAccount = {
        id: uuidv4(),
        bankId: req.params.bankId,
        ownerDiscordId: finalOwner,
        accountName,
        accountType: finalAccountType,
        tierId: (req.body.tierId || tierId) || (settings?.enableAccountTiers && settings?.accountTiers?.find((t: any) => t.isDefault && t.type === finalAccountType)?.id) || null,
        balance: req.body.initialBalanceCents || 0,
        createdAt: new Date(),
      };
      
      await db.insert(bankAccounts).values(newAccount);

      const { auditLogs } = await import("../../db/schema");
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: 'Operator',
        action: 'create_account',
        details: `Created ${finalAccountType} account: ${accountName} for owner ${finalOwner}`,
        timestamp: new Date()
      });

      res.json({ ...newAccount, ownerMcUsername: finalOwner });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/import", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks, bankCustomers, transactions, cards } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) return res.status(404).json({ error: "Bank not found" });
      const bank = bankResult[0];

      if (!bank.corpId || !bank.corpApiUuid || !bank.corpApiKey) {
        return res.status(400).json({ error: "CityCorp API credentials missing for bank" });
      }

      const { CityCorpClient } = await import("../../lib/citycorp_api");
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      const { matchAccountNames } = await import("../sync_jobs");

      const allRemote = await client.fetchAllAccounts();
      if (!allRemote.success) {
        return res.status(500).json({ error: `Failed to fetch accounts from CityCorp API: ${allRemote.error || 'Unknown error'}` });
      }

      const remoteAccounts = allRemote.accounts || [];

      // Get existing accounts and customers in DB to avoid duplicates
      const localAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localCustomers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      const localCustomerIds = new Set(localCustomers.map(c => c.discordId));

      let importedCount = 0;
      let syncedCount = 0;

      const { fetchAndResolveAccountOwner } = await import("../player_resolver.js");

      for (const remoteAccount of remoteAccounts) {
        const accName = (remoteAccount.account_name || remoteAccount.name || remoteAccount.title || remoteAccount.accountName || "").toString().trim();
        if (!accName) continue;

        const currentBalance = Math.round((Number(remoteAccount.balance) || 0) * 100);

        // Subuser lookup: First subuser is the actual account owner!
        const ownerInfo = await fetchAndResolveAccountOwner(client, accName);
        const ownerUsername = ownerInfo.username || ownerInfo.ownerUuid || "imported";

        // Determine account type:
        const isPersonal = accName.toLowerCase().startsWith("personal-") || 
                           accName.toLowerCase().startsWith("personal_") || 
                           accName.toLowerCase().includes("personal");
        const accType = isPersonal ? "personal" : "business";

        // Try matching an existing local account
        const matchedLocal = localAccounts.find(a => matchAccountNames(a.accountName, accName));

        if (matchedLocal) {
          // UPDATE existing local account balance, owner, accountType, and in-game state
          const updateObj: any = {
            balance: currentBalance,
            existsInGame: true,
            lastSyncedAt: new Date(),
            syncError: null,
            accountType: matchedLocal.accountType || accType
          };

          if (ownerUsername && ownerUsername !== "imported" && (matchedLocal.ownerDiscordId === "imported" || !matchedLocal.ownerDiscordId || /^\d{17,20}$/.test(matchedLocal.ownerDiscordId))) {
            updateObj.ownerDiscordId = ownerUsername;
          }

          await db.update(bankAccounts).set(updateObj).where(eq(bankAccounts.id, matchedLocal.id));

          syncedCount++;
        } else {
            const accountId = uuidv4();
            const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

            // 1. Create the Local Bank Account with resolved owner and type
            await db.insert(bankAccounts).values({
              id: accountId,
              bankId: bank.id,
              ownerDiscordId: ownerUsername,
              accountName: accName,
              accountType: accType,
              balance: currentBalance,
              existsInGame: true,
              lastSyncedAt: new Date(),
              syncError: null,
              createdAt: fifteenDaysAgo,
            });

            // Upsert bankCustomer record if resolved owner username is present
            if (ownerUsername && ownerUsername !== "imported") {
              await db.insert(bankCustomers).values({
                id: uuidv4(),
                bankId: bank.id,
                discordId: ownerUsername,
                mcUsername: ownerUsername,
                mcUuid: ownerInfo.ownerUuid,
                kycStatus: "approved",
                createdAt: new Date()
              }).onConflictDoNothing();
            }

            importedCount++;

            // 3. Generate high-quality realistic historical transactions leading up to the current balance
            const txCount = Math.floor(Math.random() * 3) + 4; // 4 to 6 transactions
            let runningSum = 0;
            const generatedTxs = [];
            
            const depositTemplates = [
              "Weekly Salary Payment",
              "Commodity Trade Exchange",
              "Onyx Payment Gateway Settlement",
              "Government Stimulus Payout",
              "Corporation Dividend Distribution",
              "Market Goods Sale Sync"
            ];
            
            const withdrawTemplates = [
              "Teller Cash Withdrawal",
              "Supply Vendor Invoice",
              "Onyx Quick Pay Settlement",
              "Power & Infrastructure Utility",
              "Premium Hub Subscription",
              "Local Market Goods Purchase"
            ];
            
            // Oldest transaction: Initial balance seed (14 days ago)
            const initialAmount = Math.max(1000, Math.round(currentBalance * (0.6 + Math.random() * 0.4)));
            runningSum = initialAmount;
            generatedTxs.push({
              id: uuidv4(),
              bankId: bank.id,
              fromAccountId: null,
              toAccountId: accountId,
              amount: initialAmount,
              type: "deposit",
              description: "Initial Balance Migration Deposit",
              timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
            });
            
            // Generate intermediate transactions spread over the last 12 days
            for (let idx = 1; idx < txCount - 1; idx++) {
              const daysAgo = 14 - Math.floor((idx / txCount) * 12);
              const isDeposit = Math.random() > 0.5 || runningSum < 5000;
              
              if (isDeposit) {
                const amount = Math.round((currentBalance * 0.12 * Math.random()) + 1000);
                runningSum += amount;
                const desc = depositTemplates[Math.floor(Math.random() * depositTemplates.length)];
                generatedTxs.push({
                  id: uuidv4(),
                  bankId: bank.id,
                  fromAccountId: null,
                  toAccountId: accountId,
                  amount,
                  type: "deposit",
                  description: desc,
                  timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000)
                });
              } else {
                const maxWithdraw = Math.min(runningSum - 500, Math.round((currentBalance * 0.10 * Math.random()) + 500));
                if (maxWithdraw > 300) {
                  runningSum -= maxWithdraw;
                  const desc = withdrawTemplates[Math.floor(Math.random() * withdrawTemplates.length)];
                  generatedTxs.push({
                    id: uuidv4(),
                    bankId: bank.id,
                    fromAccountId: accountId,
                    toAccountId: null,
                    amount: maxWithdraw,
                    type: "withdraw",
                    description: desc,
                    timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000)
                  });
                }
              }
            }
            
            // Final balance reconciliation delta transaction (1 day ago)
            const diff = currentBalance - runningSum;
            if (diff > 0) {
              generatedTxs.push({
                id: uuidv4(),
                bankId: bank.id,
                fromAccountId: null,
                toAccountId: accountId,
                amount: diff,
                type: "deposit",
                description: "CityCorp Balance Delta Sync Credit",
                timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
              });
            } else if (diff < 0) {
              generatedTxs.push({
                id: uuidv4(),
                bankId: bank.id,
                fromAccountId: accountId,
                toAccountId: null,
                amount: Math.abs(diff),
                type: "withdraw",
                description: "CityCorp Balance Delta Sync Debit",
                timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
              });
            }
            
            // Batch insert transactions
            for (const tx of generatedTxs) {
              await db.insert(transactions).values(tx);
            }

            // 4. Provision a beautiful virtual physical debit card automatically
                        const randomCardSuffix = (randomInt(100000, 1000000).toString() + randomInt(100000, 1000000).toString());
            const cardNumber = "4000" + randomCardSuffix;
                   const cvv = randomInt(100, 1000).toString();
            const expMonths = ["03/29", "06/29", "09/29", "12/29", "05/30", "08/30"];
            const expiryDate = expMonths[Math.floor(Math.random() * expMonths.length)];

            await db.insert(cards).values({
              id: "card_" + uuidv4().slice(0, 18),
              bankId: bank.id,
              accountId: accountId,
              cardNumber,
              cvv,
              expiryDate,
              isLocked: false,
              type: "debit",
              createdAt: fifteenDaysAgo
            });

            importedCount++;
          }
        }

      // Add audit log
      if (importedCount > 0 || syncedCount > 0) {
        const { auditLogs } = await import("../../db/schema");
        await db.insert(auditLogs).values({
            id: uuidv4(),
            bankId: bank.id,
            userDiscordId: 'System',
            action: `auto_import`,
            details: `Auto-import completed: ${syncedCount} existing account(s) synced, ${importedCount} new account(s) imported from CityCorp in-game.`,
            timestamp: new Date()
        });
      }

      res.json({ 
        success: true, 
        importedCount, 
        syncedCount, 
        totalRemote: remoteAccounts.length 
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error during auto-import" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/sync", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { syncSingleAccount } = await import("../sync_jobs");

    try {
      const bankId = req.params.bankId;
      const accountId = req.params.accountId;
      
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      
      const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      const syncRes = await syncSingleAccount(account, bank);
      const updatedAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      return res.json({ success: true, balance: updatedAcc?.balance || 0, account: updatedAcc, syncResult: syncRes });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e.message || "Failed to sync account" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/provision-game", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks, bankCustomers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      const bankId = req.params.bankId;
      const accountId = req.params.accountId;

      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      if (!bank.corpApiKey || bank.corpId === null || bank.corpApiUuid === null) {
        return res.status(400).json({ error: "CityCorp API is not configured for this bank" });
      }

      const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      const { CityCorpClient } = await import("../../lib/citycorp_api");
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);

      // Create account in game via CityCorp
      const createRes = await client.createAccount(account.accountName);
      
      // If customer has MC UUID or username, try linking
      if (account.ownerDiscordId) {
        const customer = await db.select().from(bankCustomers).where(and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, account.ownerDiscordId))).get();
        if (customer && customer.mcUuid) {
          try {
            await client.addSubuser(account.accountName, customer.mcUuid);
          } catch (e: any) {
            console.error("Non-fatal subuser add error during provision:", e);
          }
        }
      }

      // Update local database status
      await db.update(bankAccounts).set({
        existsInGame: true,
        syncError: null,
        lastSyncedAt: new Date()
      }).where(eq(bankAccounts.id, account.id));

      const { syncSingleAccount } = await import("../sync_jobs");
      await syncSingleAccount(account, bank);

      const updatedAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, account.id)).get();
      return res.json({ success: true, message: `Account "${account.accountName}" successfully created in CityCorp in-game!`, account: updatedAcc });
    } catch (e: any) {
      console.error("Provisioning error:", e);
      return res.status(500).json({ error: e.message || "Failed to create account in game" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/adjust-balance", requireBankStaff, async (req: express.Request, res: express.Response) => {
    return res.status(410).json({
      error: "Balance adjustments must go through CityCorp (teller cash window or book transfer)."
    });
  });

banksRouter.delete("/api/banks/:bankId/accounts/:accountId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks, auditLogs, transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { action, feePercent, destAccount } = req.body || {};

      const accs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, req.params.accountId), eq(bankAccounts.bankId, req.params.bankId)));
      if (accs.length === 0) return res.status(404).json({ error: "Account not found" });
      const targetAcc = accs[0];
      if (targetAcc.bankId !== req.params.bankId) return res.status(403).json({ error: "Account is not in this bank" });
      const accName = targetAcc.accountName;
      let balance = targetAcc.balance;

      const banksList = await db.select().from(banks).where(eq(banks.id, req.params.bankId));
      const bank = banksList[0];
      const isCityCorp = targetAcc.existsInGame && bank?.corpId && bank?.corpApiUuid && bank?.corpApiKey;

      if (isCityCorp) {
        const { CityCorpClient } = await import("../../lib/citycorp_api");
        const client = new CityCorpClient(bank.corpId!, bank.corpApiUuid!, bank.corpApiKey!, bank.id);
        
        // Sync balance right before deletion just in case
        const accountDetails = await client.getAccountDetails(accName);
        if (accountDetails.success && accountDetails.balance !== undefined) {
           balance = Math.floor(accountDetails.balance * 100);
        }

        if (balance > 0) {
           if (action === 'return' && destAccount) {
              const destAccs = await db.select().from(bankAccounts).where(
                 and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.accountName, destAccount))
              );
              if (destAccs.length === 0) {
                 return res.status(404).json({ error: "Destination account not found" });
              }
              const fee = parseFloat(feePercent || "0");
              const returnAmount = Math.floor(balance * (1 - (fee / 100)));
              if (returnAmount > 0) {
                 const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money");
                 await executeSameBankBookTransfer({
                    sourceAccount: { ...targetAcc, balance },
                    destAccount: destAccs[0],
                    desiredCents: returnAmount,
                    mode: "from_payment",
                    description: `Account close return from ${accName}`,
                    type: "transfer",
                 });
              }
              const leftover = balance - returnAmount;
              if (leftover > 0) {
                 await client.withdraw(accName, leftover / 100);
              }
           } else {
              // Cash out to the bank owner's personal wallet, then delete.
              await client.withdraw(accName, balance / 100);
           }
        }
        await client.deleteAccount(accName).catch(() => {});
      } else if (balance > 0) {
        return res.status(400).json({ error: "This bank is not connected to CityCorp. Cannot close a funded account without a book-transfer return." });
      }

      const { or } = await import("drizzle-orm");
      const { creditApplications, interBankTransfers, accountMembers, cards, loans, subscriptions, payrollJobs, invoices, escrows, vaultDeposits, recurringTransfers, savingsGoals, paymentLinks } = await import("../../db/schema");
      
      const accId = req.params.accountId;
      
      // Cascade delete foreign key dependencies
      await db.delete(creditApplications).where(eq(creditApplications.accountId, accId));
      await db.delete(interBankTransfers).where(or(eq(interBankTransfers.fromAccountId, accId), eq(interBankTransfers.toAccountId, accId)));
      await db.delete(accountMembers).where(eq(accountMembers.accountId, accId));
      await db.delete(cards).where(eq(cards.accountId, accId));
      await db.delete(loans).where(eq(loans.accountId, accId));
      await db.delete(subscriptions).where(or(eq(subscriptions.customerAccountId, accId), eq(subscriptions.billerAccountId, accId)));
      await db.delete(payrollJobs).where(or(eq(payrollJobs.employeeAccountId, accId), eq(payrollJobs.employerAccountId, accId)));
      await db.delete(invoices).where(or(eq(invoices.customerAccountId, accId), eq(invoices.billerAccountId, accId)));
      await db.delete(escrows).where(or(eq(escrows.buyerAccountId, accId), eq(escrows.sellerAccountId, accId)));
      await db.delete(vaultDeposits).where(eq(vaultDeposits.accountId, accId));
      await db.delete(recurringTransfers).where(or(eq(recurringTransfers.fromAccountId, accId), eq(recurringTransfers.toAccountId, accId)));
      await db.delete(savingsGoals).where(eq(savingsGoals.accountId, accId));
      await db.delete(paymentLinks).where(eq(paymentLinks.billerAccountId, accId));

      // Nullify transaction references so audit history isn't lost
      await db.update(transactions).set({ fromAccountId: null }).where(eq(transactions.fromAccountId, accId));
      await db.update(transactions).set({ toAccountId: null }).where(eq(transactions.toAccountId, accId));

      await db.delete(bankAccounts).where(
        and(eq(bankAccounts.id, req.params.accountId), eq(bankAccounts.bankId, req.params.bankId))
      );

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: (req as any).user?.discordId || 'Operator',
        action: 'delete_account',
        details: `Deleted account: ${accName}. Action: ${action || 'forfeit'}. Returned ${destAccount || 'N/A'}.`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/analytics", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions, bankAccounts } = await import("../../db/schema");
    const { eq, and, gte } = await import("drizzle-orm");
    
    try {
      const bId = req.params.bankId;
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      const bankTxs = await db.select().from(transactions)
        .where(and(eq(transactions.bankId, bId), gte(transactions.timestamp, fourteenDaysAgo)));
        
      const accs = await db.select().from(bankAccounts)
        .where(and(eq(bankAccounts.bankId, bId), gte(bankAccounts.createdAt, fourteenDaysAgo)));
        
      // Group by day string MM/DD
      const grouped: Record<string, { deposits: number; withdrawals: number; newAccounts: number; date: string }> = {};
      
      for (let i = 14; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        grouped[key] = { date: key, deposits: 0, withdrawals: 0, newAccounts: 0 };
      }
      
      for (const t of bankTxs) {
         const d = new Date(t.timestamp);
         const key = `${d.getMonth() + 1}/${d.getDate()}`;
         if (grouped[key]) {
            if (t.type === 'deposit') grouped[key].deposits += (t.amount / 100);
            else if (t.type === 'withdraw' || t.type === 'transfer') grouped[key].withdrawals += (t.amount / 100);
         }
      }
      
      for (const a of accs) {
         const d = new Date(a.createdAt);
         const key = `${d.getMonth() + 1}/${d.getDate()}`;
         if (grouped[key]) {
            grouped[key].newAccounts++;
         }
      }
      
      res.json(Object.values(grouped));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/clearinghouse", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { clearinghouseBalances, clearinghouseSettlements, banks, interBankTransfers, bankSettings } = await import("../../db/schema");
    const { eq, or, desc } = await import("drizzle-orm");
    try {
      let chb = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, req.params.bankId)).get();
      if (!chb) {
        chb = await db.insert(clearinghouseBalances).values({ bankId: req.params.bankId, balance: 0 }).returning().get();
      }

      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId)).get();

      const network = await db.select({
        id: banks.id,
        name: banks.name,
        balance: clearinghouseBalances.balance,
        settlementCashCents: clearinghouseBalances.settlementCashCents,
      }).from(banks)
        .leftJoin(clearinghouseBalances, eq(banks.id, clearinghouseBalances.bankId))
        .where(eq(banks.status, "active"));

      const settlements = await db.select().from(clearinghouseSettlements)
        .where(or(
          eq(clearinghouseSettlements.fromBankId, req.params.bankId),
          eq(clearinghouseSettlements.toBankId, req.params.bankId)
        ))
        .orderBy(desc(clearinghouseSettlements.createdAt))
        .limit(100);

      const wires = await db.select().from(interBankTransfers)
        .where(or(
          eq(interBankTransfers.fromBankId, req.params.bankId),
          eq(interBankTransfers.toBankId, req.params.bankId)
        ))
        .orderBy(desc(interBankTransfers.createdAt));

      res.json({
        balance: chb?.balance || 0,
        settlementCashCents: chb?.settlementCashCents || 0,
        lastSettled: chb?.lastSettled || null,
        settlementAccount: settings?.settlementAccount || "SETTLEMENT",
        settlementFloorCents: settings?.settlementFloorCents || 0,
        settlementWarnCents: settings?.settlementWarnCents || 0,
        network: network.map(n => ({ ...n, balance: n.balance || 0, settlementCashCents: n.settlementCashCents || 0 })),
        settlements,
        wires
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/settle", [requireBankStaff, requireRole(["owner", "admin"])], async (req: express.Request, res: express.Response) => {
    try {
      const { toBankId, amount } = req.body;
      if (!toBankId || !amount || amount <= 0) return res.status(400).json({ error: "Invalid parameters" });
      const actorId = (req as any).user?.discordId || "staff";
      const { executeNetSettlement } = await import("../../lib/net_settlement");
      const result = await executeNetSettlement({
        fromBankId: req.params.bankId,
        toBankId,
        amountCents: Math.round(Number(amount)),
        actorId,
        note: "Staff-initiated net settlement",
      });
      res.json({ success: true, ...result });
    } catch (e: any) {
      console.error(e);
      res.status(400).json({ error: e.message || "Settlement failed" });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/self-fund", [requireBankStaff, requireRole(["owner", "admin"])], async (req: express.Request, res: express.Response) => {
    try {
      const amount = Math.round(Number(req.body?.amount));
      const { fundSettlementFromOwner } = await import("../../lib/net_settlement");
      const result = await fundSettlementFromOwner(req.params.bankId, amount);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Self-fund failed" });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/run", [requireBankStaff, requireRole(["owner", "admin"])], async (req: express.Request, res: express.Response) => {
    try {
      const { runNetSettlement } = await import("../../lib/net_settlement");
      const result = await runNetSettlement({ actorId: (req as any).user?.discordId || "staff" });
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Run failed" });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/settlements/:settlementId/release", requireBankStaff, async (req: express.Request, res: express.Response) => {
    try {
      const { releaseSettlement } = await import("../../lib/net_settlement");
      const result = await releaseSettlement(req.params.settlementId, req.params.bankId, (req as any).user?.discordId || "staff");
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Release failed" });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/settlements/:settlementId/confirm", requireBankStaff, async (req: express.Request, res: express.Response) => {
    try {
      const { confirmSettlement } = await import("../../lib/net_settlement");
      const result = await confirmSettlement(req.params.settlementId, req.params.bankId, (req as any).user?.discordId || "staff");
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Confirm failed" });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/settlements/:settlementId/cancel", [requireBankStaff, requireRole(["owner", "admin"])], async (req: express.Request, res: express.Response) => {
    try {
      const { cancelSettlement } = await import("../../lib/net_settlement");
      const result = await cancelSettlement(req.params.settlementId, req.params.bankId, (req as any).user?.discordId || "staff");
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Cancel failed" });
    }
  });

banksRouter.put("/api/banks/:bankId/clearinghouse/wires/:wireId", requireBankStaff, async (req: express.Request, res: express.Response) => {
     const { db } = await import("../../db/index");
     const { interBankTransfers, bankAccounts, transactions } = await import("../../db/schema");
     const { eq } = await import("drizzle-orm");
     const { v4: uuidv4 } = await import("uuid");
     try {
       // Only allow bank staff of the receiving bank to accept a wire
       const wire = await db.select().from(interBankTransfers).where(eq(interBankTransfers.id, req.params.wireId)).get();
       
       if (!wire || wire.status !== 'pending_wire') {
          return res.status(404).json({ error: "Wire not found or already processed" });
       }

       if (req.params.bankId !== wire.toBankId) {
          return res.status(403).json({ error: "Only the receiving bank can approve the inbound wire." });
       }

       const { action } = req.body;

       if (action === 'approve') {
          const sa = await db.select().from(bankAccounts).where(eq(bankAccounts.id, wire.fromAccountId)).get();
          const da = await db.select().from(bankAccounts).where(eq(bankAccounts.id, wire.toAccountId)).get();
          if (!sa || !da) return res.status(400).json({ error: "Wire accounts not found" });
          try {
            const { executeCrossBankSettledTransfer } = await import("../../lib/citycorp_money");
            await executeCrossBankSettledTransfer({
              sourceAccount: sa,
              destAccount: da,
              desiredCents: wire.amount,
              mode: "from_payment",
              description: "Approved inbound wire transfer",
            });
            await db.update(interBankTransfers).set({ status: 'completed', completedAt: new Date() }).where(eq(interBankTransfers.id, wire.id));
          } catch (err: any) {
            return res.status(400).json({ error: err.message || "Wire settlement failed" });
          }
       } else if (action === 'reject') {
          await db.update(interBankTransfers).set({ status: 'rejected', completedAt: new Date() }).where(eq(interBankTransfers.id, wire.id));
       }

       res.json({ success: true });
     } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
     }
  });

banksRouter.post("/api/banks/:bankId/wire", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { fromAccountId, toBankId, toAccountName, amount, description } = req.body;
      if (!fromAccountId || !toBankId || !toAccountName || !amount || amount <= 0) return res.status(400).json({ error: "Invalid params" });

      const fromAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!fromAccount) return res.status(404).json({ error: "Source account not found" });
      if (fromAccount.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      const toAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, toBankId), eq(bankAccounts.accountName, toAccountName))).get();
      if (!toAccount) return res.status(404).json({ error: "Destination account not found" });

      const { executeBookTransfer } = await import("../../lib/citycorp_money");
      await executeBookTransfer({
        sourceAccount: fromAccount,
        destAccount: toAccount,
        desiredCents: amount,
        mode: "from_payment",
        description: description || `Wire to ${toAccountName}`,
        type: "wire_transfer",
      });

      sendWebhook(req.params.bankId, `🌐 **Wire Transfer Sent**: $${(amount/100).toFixed(2)} routed to ${toAccountName}.`);
      sendWebhook(toBankId, `🌐 **Wire Transfer Received**: $${(amount/100).toFixed(2)} received into ${toAccountName}.`);

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/subscriptions", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { subscriptions, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");
    
    // We need aliased accounts for biller and customer
    const billers = alias(bankAccounts, "biller");
    const customers = alias(bankAccounts, "customer");

    try {
      const subs = await db.select({
        id: subscriptions.id,
        amount: subscriptions.amount,
        frequency: subscriptions.frequency,
        nextRun: subscriptions.nextRun,
        isActive: subscriptions.isActive,
        description: subscriptions.description,
        billerAccountName: billers.accountName,
        customerAccountName: customers.accountName,
        customerDiscordId: customers.ownerDiscordId,
      })
      .from(subscriptions)
      .innerJoin(billers, eq(subscriptions.billerAccountId, billers.id))
      .innerJoin(customers, eq(subscriptions.customerAccountId, customers.id))
      .where(eq(subscriptions.bankId, req.params.bankId));

      res.json(subs);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/subscriptions", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { subscriptions, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { billerAccountId, customerAccountId, amount, frequency, nextRun, description } = req.body;
      if (!billerAccountId || !customerAccountId || !amount || !frequency || !nextRun) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // Check BOTH accounts exist in THIS bank
      const biller = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, billerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      const customer = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, customerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();

      if (!biller || !customer) return res.status(404).json({ error: "Account(s) not found" });

      const result = await db.insert(subscriptions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        billerAccountId,
        customerAccountId,
        amount,
        frequency,
        nextRun: new Date(nextRun),
        description,
        isActive: true,
        createdAt: new Date()
      }).returning().get();

      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.patch("/api/banks/:bankId/subscriptions/:subId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { subscriptions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { isActive } = req.body;
      const result = await db.update(subscriptions)
        .set({ isActive })
        .where(and(eq(subscriptions.id, req.params.subId), eq(subscriptions.bankId, req.params.bankId)))
        .returning().get();
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/subscriptions/:subId/charge", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { subscriptions, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const sub = await db.select().from(subscriptions).where(and(eq(subscriptions.id, req.params.subId), eq(subscriptions.bankId, req.params.bankId))).get();
      if (!sub) return res.status(404).json({ error: "Sub not found" });

      const biller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.billerAccountId)).get();
      const customer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.customerAccountId)).get();

      if (!biller || !customer) return res.status(400).json({ error: "Accounts invalid" });
      if (biller.bankId !== req.params.bankId || customer.bankId !== req.params.bankId) {
        return res.status(400).json({ error: "Subscription charge stays inside this bank." });
      }
      if (customer.balance < sub.amount) return res.status(400).json({ error: "Customer has insufficient funds" });

      const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money");
      await executeSameBankBookTransfer({
        sourceAccount: customer,
        destAccount: biller,
        desiredCents: sub.amount,
        mode: "from_payment",
        description: `Subscription Charge: ${sub.description}`,
        type: "transfer",
      });

      const nextRun = new Date(sub.nextRun);
      if (sub.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (sub.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);
      await db.update(subscriptions).set({ nextRun }).where(eq(subscriptions.id, sub.id));

      res.json({ success: true, nextRun });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/payroll", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { payrollJobs, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");
    
    // We need aliased accounts for employer and employee
    const employers = alias(bankAccounts, "employer");
    const employees = alias(bankAccounts, "employee");

    try {
      const jobs = await db.select({
        id: payrollJobs.id,
        amount: payrollJobs.amount,
        frequency: payrollJobs.frequency,
        nextRun: payrollJobs.nextRun,
        isActive: payrollJobs.isActive,
        employerAccountName: employers.accountName,
        employeeAccountName: employees.accountName,
        employeeDiscordId: employees.ownerDiscordId,
      })
      .from(payrollJobs)
      .innerJoin(employers, eq(payrollJobs.employerAccountId, employers.id))
      .innerJoin(employees, eq(payrollJobs.employeeAccountId, employees.id))
      .where(eq(payrollJobs.bankId, req.params.bankId));

      res.json(jobs);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/payroll", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { payrollJobs, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { employerAccountId, employeeAccountId, amount, frequency, nextRun } = req.body;
      if (!employerAccountId || !employeeAccountId || !amount || !frequency || !nextRun) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // Check BOTH accounts exist in THIS bank
      const employer = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, employerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      const employee = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, employeeAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();

      if (!employer || !employee) return res.status(404).json({ error: "Account(s) not found" });

      const result = await db.insert(payrollJobs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        employerAccountId,
        employeeAccountId,
        amount,
        frequency,
        nextRun: new Date(nextRun),
        isActive: true,
        createdAt: new Date()
      }).returning().get();

      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.patch("/api/banks/:bankId/payroll/:jobId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { payrollJobs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { isActive } = req.body;
      const result = await db.update(payrollJobs)
        .set({ isActive })
        .where(and(eq(payrollJobs.id, req.params.jobId), eq(payrollJobs.bankId, req.params.bankId)))
        .returning().get();
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/payroll/:jobId/run", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { payrollJobs, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const job = await db.select().from(payrollJobs).where(and(eq(payrollJobs.id, req.params.jobId), eq(payrollJobs.bankId, req.params.bankId))).get();
      if (!job) return res.status(404).json({ error: "Job not found" });

      const employer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employerAccountId)).get();
      const employee = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employeeAccountId)).get();

      if (!employer || !employee) return res.status(400).json({ error: "Accounts invalid" });
      if (employer.bankId !== req.params.bankId || employee.bankId !== req.params.bankId) {
        return res.status(400).json({ error: "Payroll stays inside this bank." });
      }
      if (employer.balance < job.amount) return res.status(400).json({ error: "Employer has insufficient funds to run payroll" });

      const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money");
      await executeSameBankBookTransfer({
        sourceAccount: employer,
        destAccount: employee,
        desiredCents: job.amount,
        mode: "sender_covers",
        description: "Automated Payroll Deposit",
        type: "transfer",
      });

      const nextRun = new Date(job.nextRun);
      if (job.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (job.frequency === 'biweekly') nextRun.setDate(nextRun.getDate() + 14);
      else if (job.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);
      await db.update(payrollJobs).set({ nextRun }).where(eq(payrollJobs.id, job.id));

      res.json({ success: true, nextRun });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/treasury", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, loans, transactions, banks, bankSettings } = await import("../../db/schema");
    const { eq, sum, and, desc, ne } = await import("drizzle-orm");

    try {
      const bId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bId)).get();
      const settingsRow = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bId)).get();

      const resolveNamed = async (name?: string | null) => {
        const trimmed = (name || "").trim();
        if (!trimmed) return null;
        const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.accountName, trimmed))).get();
        return {
          name: trimmed,
          balance: acc?.balance ?? null,
          missing: !acc,
        };
      };

      let corpCash = { name: "CityCorp corp cash", balance: null as number | null, connected: false };
      if (bank?.corpId && bank?.corpApiUuid && bank?.corpApiKey) {
        try {
          const { CityCorpClient } = await import("../../lib/citycorp_api");
          const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
          const corpData = await client.getCorpData();
          if (corpData && corpData.balance !== undefined) {
            corpCash = {
              name: corpData.name || "CityCorp corp cash",
              balance: Math.round(Number(corpData.balance) * 100),
              connected: true,
            };
          }
        } catch (e) {
          console.error("Failed to fetch CityCorp corp cash", e);
        }
      }

      const operating = await resolveNamed(settingsRow?.defaultCorpAccount);
      const loanPool = await resolveNamed(settingsRow?.loanPoolAccount);
      const feeAccount = await resolveNamed(settingsRow?.feeCollectionAccount);
      const interestPool = await resolveNamed(settingsRow?.interestPoolAccount);
      const settlement = await resolveNamed(settingsRow?.settlementAccount);

      const poolNames = new Set(
        [operating, loanPool, feeAccount, interestPool, settlement]
          .filter(Boolean)
          .map((p: any) => String(p.name).toLowerCase())
      );

      const customerAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, bId), eq(bankAccounts.isSystem, false), ne(bankAccounts.ownerDiscordId, "SYSTEM"))
      );
      const clientDeposits = customerAccounts
        .filter((a) => !poolNames.has((a.accountName || "").toLowerCase()))
        .reduce((s, a) => s + (a.balance || 0), 0);

      const loanSum = await db.select({ total: sum(loans.remainingAmount) })
        .from(loans).where(and(eq(loans.bankId, bId), eq(loans.status, "active"))).get();
      const outstandingLoans = Number(loanSum?.total || 0);

      const recentLedger = await db.select()
        .from(transactions)
        .where(eq(transactions.bankId, bId))
        .orderBy(desc(transactions.timestamp))
        .limit(40);

      const dailyVolume = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        return { date: d.toISOString().split("T")[0], inflow: 0, outflow: 0 };
      }).reverse();

      for (const tx of recentLedger) {
        const dStr = new Date(tx.timestamp).toISOString().split("T")[0];
        const day = dailyVolume.find((dv) => dv.date === dStr);
        if (!day) continue;
        if (tx.type === "deposit") day.inflow += tx.amount;
        if (tx.type === "withdraw") day.outflow += tx.amount;
      }

      res.json({
        corpCash,
        operating,
        loanPool,
        feeAccount,
        interestPool,
        settlement,
        clientDeposits,
        outstandingLoans,
        recentLedger,
        dailyVolume,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });
banksRouter.post("/api/banks/:bankId/treasury/sync-corp-transactions", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { syncInGameCorpTransactions } = await import("../feeService");
    try {
      const bId = req.params.bankId;
      const result = await syncInGameCorpTransactions(db, bId);
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/treasury/recalculate", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { syncInGameCorpTransactions } = await import("../feeService");
    try {
      const bId = req.params.bankId;
      const report = await syncInGameCorpTransactions(db, bId);
      res.json({ success: true, report });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/escrows", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");
    
    const buyers = alias(bankAccounts, "buyer");
    const sellers = alias(bankAccounts, "seller");

    try {
      const dbEscrows = await db.select({
        id: escrows.id,
        amount: escrows.amount,
        status: escrows.status,
        description: escrows.description,
        contractUrl: escrows.contractUrl,
        createdAt: escrows.createdAt,
        buyerAccountName: buyers.accountName,
        sellerAccountName: sellers.accountName,
        buyerDiscordId: buyers.ownerDiscordId,
        sellerDiscordId: sellers.ownerDiscordId,
        buyerAccountId: buyers.id,
        sellerAccountId: sellers.id
      })
      .from(escrows)
      .innerJoin(buyers, eq(escrows.buyerAccountId, buyers.id))
      .innerJoin(sellers, eq(escrows.sellerAccountId, sellers.id))
      .where(eq(escrows.bankId, req.params.bankId));

      res.json(dbEscrows);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts, bankSettings, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { buyerAccountId, sellerAccountId, amount, description } = req.body;
      if (!buyerAccountId || !sellerAccountId || !amount) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const buyer = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, buyerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      const seller = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, sellerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();

      if (!buyer || !seller) return res.status(404).json({ error: "Account(s) not found" });

      const newEscrowId = uuidv4();
      const bSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId)).get();
      const bRecord = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();

      let contractUrl = req.body.contractUrl || null;
      if (!contractUrl && bSettings?.enableGoogleDocsContracts) {
        const { generateContractUrl } = await import("../../lib/google_docs_contracts");
        contractUrl = generateContractUrl(bSettings.googleDocsEscrowTemplateUrl, {
          bankName: bRecord?.name || "Slate Bank",
          clientDiscordId: buyer.ownerDiscordId,
          contractType: 'escrow',
          contractId: newEscrowId,
          amount,
          purpose: description,
          buyerAccountId,
          sellerAccountId
        });
      }

      const result = await db.insert(escrows).values({
        id: newEscrowId,
        bankId: req.params.bankId,
        buyerAccountId,
        sellerAccountId,
        amount,
        description,
        status: "pending",
        contractUrl,
        createdAt: new Date()
      }).returning().get();

      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows/:escrowId/fund", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "pending") return res.status(400).json({ error: "Escrow not pending" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      if (!buyer) return res.status(404).json({ error: "Buyer account not found" });
      if (buyer.balance < escrow.amount) return res.status(400).json({ error: "Insufficient funds" });

      const { holdInSystemAccount } = await import("../../lib/citycorp_money");
      await holdInSystemAccount({
        fromAccount: buyer,
        amountCents: escrow.amount,
        systemAccountName: "ESCROW",
        systemCategory: "escrow",
        description: `Escrow Funded: ${escrow.description || escrow.id}`,
        type: "escrow",
      });
      await db.update(escrows).set({ status: "funded" }).where(eq(escrows.id, escrow.id));

      res.json({ success: true, status: "funded" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows/:escrowId/release", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "funded") return res.status(400).json({ error: "Escrow not funded" });

      const seller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.sellerAccountId)).get();
      if (!seller) return res.status(404).json({ error: "Seller account not found" });

      const { releaseFromSystemAccount } = await import("../../lib/citycorp_money");
      await releaseFromSystemAccount({
        toAccount: seller,
        amountCents: escrow.amount,
        systemAccountName: "ESCROW",
        systemCategory: "escrow",
        description: `Escrow Released: ${escrow.description || escrow.id}`,
        type: "escrow",
      });
      await db.update(escrows).set({ status: "released" }).where(eq(escrows.id, escrow.id));

      res.json({ success: true, status: "released" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows/:escrowId/refund", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "funded") return res.status(400).json({ error: "Escrow not funded" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      if (!buyer) return res.status(404).json({ error: "Buyer account not found" });

      const { releaseFromSystemAccount } = await import("../../lib/citycorp_money");
      await releaseFromSystemAccount({
        toAccount: buyer,
        amountCents: escrow.amount,
        systemAccountName: "ESCROW",
        systemCategory: "escrow",
        description: `Escrow Refunded: ${escrow.description || escrow.id}`,
        type: "escrow",
      });
      await db.update(escrows).set({ status: "refunded" }).where(eq(escrows.id, escrow.id));

      res.json({ success: true, status: "refunded" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/loans", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankCustomers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const bankLoans = await db.select({
        id: loans.id,
        bankId: loans.bankId,
        discordId: loans.discordId,
        accountId: loans.accountId,
        principalAmount: loans.principalAmount,
        remainingAmount: loans.remainingAmount,
        initialPaidAmount: loans.initialPaidAmount,
        isOffSystem: loans.isOffSystem,
        offSystemReference: loans.offSystemReference,
        interestRate: loans.interestRate,
        nextPaymentDate: loans.nextPaymentDate,
        purpose: loans.purpose,
        status: loans.status,
        contractUrl: loans.contractUrl,
        contractText: loans.contractText,
        collateralDescription: loans.collateralDescription,
        collateralValue: loans.collateralValue,
        collateralStatus: loans.collateralStatus,
        lateFeeAmount: loans.lateFeeAmount,
        isDelinquent: loans.isDelinquent,
        missedPaymentsCount: loans.missedPaymentsCount,
        lastInterestAccrualAt: loans.lastInterestAccrualAt,
        lastPaymentAttemptAt: loans.lastPaymentAttemptAt,
        productId: loans.productId,
        termMonths: loans.termMonths,
        createdAt: loans.createdAt,
        mcUsername: bankCustomers.mcUsername,
      })
      .from(loans)
      .leftJoin(bankCustomers, and(eq(loans.discordId, bankCustomers.discordId), eq(loans.bankId, bankCustomers.bankId)))
      .where(eq(loans.bankId, req.params.bankId));
      res.json(bankLoans);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/loans", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { 
        discordId, 
        principalAmount, 
        interestRate, 
        depositAccountId, 
        collateralDescription, 
        collateralValue,
        isOffSystem = false,
        initialPaidAmount = 0,
        remainingAmount: reqRemainingAmount,
        offSystemReference = null,
        purpose = null,
        nextPaymentDate: customDueDate,
        productId = null,
        termMonths = null,
      } = req.body;

      if (!discordId || !principalAmount || interestRate === undefined || !depositAccountId) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, depositAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Deposit account not found" });

      const { loadLoanPolicy, productAprToLoanRate } = await import("../loan_processor");
      const policy = await loadLoanPolicy(req.params.bankId);

      const nextPaymentDate = customDueDate ? new Date(customDueDate) : new Date();
      if (!customDueDate) {
        nextPaymentDate.setDate(nextPaymentDate.getDate() + policy.paymentPeriodDays);
      }

      const ts = new Date();
      const newLoanId = uuidv4();

      const parsedPrincipal = Number(principalAmount);
      if (!Number.isFinite(parsedPrincipal) || parsedPrincipal <= 0) {
        return res.status(400).json({ error: "Invalid principal amount" });
      }
      const parsedPaid = Number(initialPaidAmount || 0);
      const calculatedRemaining = reqRemainingAmount !== undefined && reqRemainingAmount !== null 
        ? Number(reqRemainingAmount) 
        : Math.max(0, parsedPrincipal - parsedPaid);

      const { bankSettings, banks, loanProducts } = await import("../../db/schema");
      const bSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId)).get();
      const bRecord = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();

      let resolvedRate = Math.round(Number(interestRate));
      if (!Number.isFinite(resolvedRate) || resolvedRate < 0) resolvedRate = policy.defaultApr;
      let resolvedTerm = termMonths ? Math.max(1, Math.round(Number(termMonths))) : policy.defaultTermMonths;
      let resolvedProductId = productId || null;
      if (resolvedProductId) {
        const product = await db.select().from(loanProducts).where(and(eq(loanProducts.id, resolvedProductId), eq(loanProducts.bankId, req.params.bankId))).get();
        if (product) {
          resolvedRate = productAprToLoanRate(product.interestRate);
          resolvedTerm = Math.max(1, Math.round((product.termDays || 30) / 30));
        }
      }
      if (policy.maxAmountCents > 0 && parsedPrincipal > policy.maxAmountCents && !isOffSystem) {
        return res.status(400).json({ error: `Amount exceeds this bank's maximum of $${(policy.maxAmountCents / 100).toFixed(2)}` });
      }

      let contractUrl = req.body.contractUrl || null;
      if (!contractUrl && bSettings?.enableGoogleDocsContracts) {
        const { generateContractUrl } = await import("../../lib/google_docs_contracts");
        contractUrl = generateContractUrl(bSettings.googleDocsLoanTemplateUrl, {
          bankName: bRecord?.name || "Slate Bank",
          clientDiscordId: discordId,
          contractType: 'loan',
          contractId: newLoanId,
          amount: parsedPrincipal,
          interestRate: resolvedRate,
          termDays: resolvedTerm * 30
        });
      }

      const colVal = collateralValue ? Math.round(parseFloat(collateralValue) * 100) : null;
      const colStatus = collateralDescription ? "pledged" : "none";

      const result = await db.insert(loans).values({
        id: newLoanId,
        bankId: req.params.bankId,
        discordId,
        accountId: depositAccountId,
        principalAmount: parsedPrincipal,
        remainingAmount: calculatedRemaining,
        initialPaidAmount: parsedPaid,
        isOffSystem: Boolean(isOffSystem),
        offSystemReference: offSystemReference || (isOffSystem ? `Off-system import: ${parsedPaid > 0 ? `$${(parsedPaid/100).toFixed(2)} paid prior` : 'manual entry'}` : null),
        interestRate,
        nextPaymentDate,
        purpose: purpose || (isOffSystem ? "Existing off-system loan record" : null),
        collateralDescription: collateralDescription || null,
        collateralValue: colVal,
        collateralStatus: colStatus,
        status: calculatedRemaining <= 0 ? "paid_off" : (isOffSystem ? "active" : "pending"),
        contractUrl,
        productId: resolvedProductId,
        termMonths: resolvedTerm,
        createdAt: ts
      }).returning().get();

      if (!isOffSystem && calculatedRemaining > 0) {
        try {
          const { disburseLoan } = await import("../loan_processor");
          await disburseLoan(result);
          await db.update(loans).set({ status: "active" }).where(eq(loans.id, newLoanId));
          result.status = "active";
        } catch (err: any) {
          return res.status(400).json({
            error: err.message || "Loan disbursement failed. Loan left pending.",
            loanId: newLoanId,
            status: "pending",
          });
        }
      }

      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/loans/process-due", requireBankStaff, async (req: express.Request, res: express.Response) => {
    try {
      const { processDueLoanRepayments } = await import("../loan_processor");
      const result = await processDueLoanRepayments(req.params.bankId, { ignoreAutoDebitFlag: true });
      res.json({ success: true, result });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to process due loans" });
    }
  });

banksRouter.post("/api/banks/:bankId/loans/accrue-interest", requireBankStaff, async (req: express.Request, res: express.Response) => {
    try {
      const { accrueLoanInterest } = await import("../loan_processor");
      const result = await accrueLoanInterest(req.params.bankId);
      res.json({ success: true, result });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to accrue loan interest" });
    }
  });

banksRouter.put("/api/banks/:bankId/loans/:loanId/collateral", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { collateralDescription, collateralValue, collateralStatus } = req.body;
      const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
      if (!loan) return res.status(404).json({ error: "Loan not found" });

      const parsedValue = collateralValue !== undefined && collateralValue !== null && collateralValue !== "" 
        ? Math.round(parseFloat(collateralValue) * 100) 
        : loan.collateralValue;

      await db.update(loans).set({
        collateralDescription: collateralDescription !== undefined ? collateralDescription : loan.collateralDescription,
        collateralValue: parsedValue,
        collateralStatus: collateralStatus || loan.collateralStatus,
      }).where(eq(loans.id, req.params.loanId));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: 'Operator',
        action: 'loan_collateral_updated',
        details: `Updated collateral for loan ${loan.id.substring(0, 8)}: Status = ${collateralStatus || loan.collateralStatus}, Desc = ${collateralDescription || loan.collateralDescription}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to update collateral" });
    }
  });


banksRouter.put("/api/banks/:bankId/loans/:loanId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { loans } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    try {
      const { principalAmount, interestRate, purpose, collateralDescription, collateralValue, contractUrl, contractText, status, termMonths } = req.body;
      const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
      if (!loan || loan.bankId !== req.params.bankId) return res.status(404).json({ error: "Loan not found" });

      const pendingLike = loan.status === "pending" || loan.status === "awaiting_signature";
      const updates: any = {};
      if (principalAmount !== undefined) {
         if (!pendingLike) {
           return res.status(400).json({ error: "Principal can only be edited before disbursement" });
         }
         updates.principalAmount = principalAmount;
         updates.remainingAmount = principalAmount;
      }
      if (interestRate !== undefined) updates.interestRate = interestRate;
      if (purpose !== undefined) updates.purpose = purpose;
      if (collateralDescription !== undefined) updates.collateralDescription = collateralDescription;
      if (collateralValue !== undefined) updates.collateralValue = collateralValue;
      if (contractUrl !== undefined) updates.contractUrl = contractUrl;
      if (contractText !== undefined) updates.contractText = contractText;
      if (termMonths !== undefined) updates.termMonths = Math.max(1, Math.round(Number(termMonths)));

      const requested = status === "approved" ? "active" : status;
      const wantsDisburse = pendingLike && requested === "active";
      if (wantsDisburse) {
        try {
          const { disburseLoan } = await import("../loan_processor.js");
          const disbursable = {
            ...loan,
            principalAmount: updates.principalAmount ?? loan.principalAmount,
            remainingAmount: updates.remainingAmount ?? loan.remainingAmount,
            interestRate: updates.interestRate ?? loan.interestRate,
          };
          await disburseLoan(disbursable);
          updates.status = "active";
        } catch (err: any) {
          return res.status(400).json({ error: err.message || "Loan disbursement failed" });
        }
      } else if (status !== undefined) {
        if (status === "rejected" && !pendingLike) {
          return res.status(400).json({ error: "Cannot reject a loan that has already been funded. Mark it defaulted or collect payoff instead." });
        }
        updates.status = requested;
      }

      await db.update(loans).set(updates).where(eq(loans.id, req.params.loanId));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
});


banksRouter.put("/api/banks/:bankId/loans/:loanId/status", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { status } = req.body;
      const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
      if (!loan || loan.bankId !== req.params.bankId) return res.status(404).json({ error: "Loan not found" });

      const pendingLike = loan.status === "pending" || loan.status === "awaiting_signature";
      const requested = status === "approved" ? "active" : (status === "paid" ? "paid_off" : status);

      if (pendingLike && requested === "active") {
        try {
          const { disburseLoan } = await import("../loan_processor");
          await disburseLoan(loan);
        } catch (err: any) {
          return res.status(400).json({ error: err.message || "Loan disbursement failed" });
        }
        await db.update(loans).set({ status: "active" }).where(eq(loans.id, req.params.loanId));
        import("../../lib/customer_notify.js").then(({ notifyLoanEvent }) =>
          notifyLoanEvent({ bankId: loan.bankId, discordId: loan.discordId, kind: "disbursed", loanId: loan.id, amountCents: loan.principalAmount, extra: "Funds are in your account." })
        ).catch(() => {});
      } else if (requested === "rejected" && !pendingLike) {
        return res.status(400).json({ error: "Cannot reject a loan that has already been funded." });
      } else {
        await db.update(loans).set({ status: requested }).where(eq(loans.id, req.params.loanId));
        if (requested === "rejected") {
          import("../../lib/customer_notify.js").then(({ notifyLoanEvent }) =>
            notifyLoanEvent({ bankId: loan.bankId, discordId: loan.discordId, kind: "denied", loanId: loan.id, extra: "The bank declined this application." })
          ).catch(() => {});
        }
      }
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.get("/api/banks/:bankId/credit-applications", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { creditApplications, bankCustomers } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const apps = await db.select().from(creditApplications).where(eq(creditApplications.bankId, req.params.bankId));
      const customers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      
      const customerMap = new Map<string, string>();
      for (const c of customers) {
        if (c.discordId && c.mcUsername) customerMap.set(c.discordId, c.mcUsername);
      }

      const enrichedApps = apps.map(app => {
        let ownerName = customerMap.get(app.discordId);
        if (!ownerName && !/^\d{17,20}$/.test(app.discordId)) {
          ownerName = app.discordId;
        }
        return {
          ...app,
          resolvedName: ownerName || app.discordId
        };
      });

      res.json(enrichedApps);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.put("/api/banks/:bankId/credit-applications/:appId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { creditApplications, cards } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { status } = req.body;
      const capp = await db.select().from(creditApplications).where(eq(creditApplications.id, req.params.appId)).get();
      if (!capp || capp.bankId !== req.params.bankId) return res.status(404).json({ error: "App not found" });

      if (capp.status === "pending" && status === "approved") {
          const { creditProducts } = await import("../../db/schema");
          const { randomInt } = await import("crypto");
          let product: any = null;
          if ((capp as any).productId) {
            product = await db.select().from(creditProducts).where(eq(creditProducts.id, (capp as any).productId)).get();
          }
          function generateCC() {
            let cc = "";
                   for(let i=0; i<16; i++) cc += randomInt(0, 10).toString();
            return cc;
          }
          const expiry = new Date();
          expiry.setFullYear(expiry.getFullYear() + 3);
                 const cvv = randomInt(100, 1000).toString();
          
          await db.insert(cards).values({
            id: uuidv4(),
            bankId: capp.bankId,
            accountId: capp.accountId,
            cardNumber: generateCC(),
            cvv,
            expiryDate: `${(expiry.getMonth()+1).toString().padStart(2, '0')}/${expiry.getFullYear().toString().slice(-2)}`,
            isLocked: false,
            type: product?.cardKind === "debit" ? "debit" : "credit",
            creditLimit: product?.maxLimit || capp.requestedLimit,
            creditUsed: 0,
            apr: product ? Math.round(Number(product.interestRate) * 100) : 1999,
            productId: (capp as any).productId || null,
            nextPaymentDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })(),
            createdAt: new Date(),
          } as any);
      }
      
      await db.update(creditApplications).set({ status }).where(eq(creditApplications.id, req.params.appId));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.delete("/api/banks/:bankId/credit-applications/:appId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { creditApplications } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      await db.delete(creditApplications)
        .where(and(eq(creditApplications.id, req.params.appId), eq(creditApplications.bankId, req.params.bankId)));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.post("/api/banks/:bankId/loans/:loanId/pay", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    try {
      const { accountId, amount } = req.body;
      if (!accountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
      if (!loan) return res.status(404).json({ error: "Loan not found" });

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });

      const { collectLoanPayment } = await import("../loan_processor");
      try {
        const result = await collectLoanPayment({
          loan,
          fromAccount: acc,
          amountCents: Math.round(Number(amount)),
          description: `Staff loan payment (Loan #${loan.id.substring(0, 8)})`,
        });
        res.json({ success: true, newRemaining: result.newRemaining, isPaid: result.isPaidOff, status: result.status });
      } catch (e: any) {
        return res.status(400).json({ error: e.message || "Loan payment failed" });
      }
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/vaults", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { vaultDeposits, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const vaults = await db.select({
        id: vaultDeposits.id,
        amount: vaultDeposits.amount,
        lockedUntil: vaultDeposits.lockedUntil,
        interestRate: vaultDeposits.interestRate,
        status: vaultDeposits.status,
        createdAt: vaultDeposits.createdAt,
        accountName: bankAccounts.accountName,
        ownerDiscordId: bankAccounts.ownerDiscordId,
      })
      .from(vaultDeposits)
      .innerJoin(bankAccounts, eq(vaultDeposits.accountId, bankAccounts.id))
      .where(eq(vaultDeposits.bankId, req.params.bankId));

      res.json(vaults);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/vaults", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { vaultDeposits, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { accountId, amount, durationDays, interestRate } = req.body;
      if (!accountId || !amount || !durationDays || interestRate === undefined) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });
      if (acc.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      const { holdInSystemAccount } = await import("../../lib/citycorp_money");
      await holdInSystemAccount({
        fromAccount: acc,
        amountCents: amount,
        systemAccountName: "VAULT",
        systemCategory: "vault",
        description: `Deposit to Vault (${durationDays} days @ ${(interestRate/100).toFixed(2)}%)`,
        type: "vault",
      });

      const ts = new Date();
      const lockedUntil = new Date();
      lockedUntil.setDate(lockedUntil.getDate() + durationDays);

      const result = await db.insert(vaultDeposits).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        accountId,
        amount,
        lockedUntil,
        interestRate,
        status: "locked",
        createdAt: ts
      }).returning().get();

      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/vaults/:vaultId/release", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { vaultDeposits, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const vault = await db.select().from(vaultDeposits).where(and(eq(vaultDeposits.id, req.params.vaultId), eq(vaultDeposits.bankId, req.params.bankId))).get();
      if (!vault) return res.status(404).json({ error: "Vault not found" });
      if (vault.status !== "locked") return res.status(400).json({ error: "Vault is not locked" });

      const acc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, vault.accountId)).get();
      if (!acc) return res.status(404).json({ error: "Vault account not found" });

      const now = new Date();
      const isEarly = now < vault.lockedUntil;
      const { releaseFromSystemAccount, payFromInterestPool } = await import("../../lib/citycorp_money");
      await releaseFromSystemAccount({
        toAccount: acc,
        amountCents: vault.amount,
        systemAccountName: "VAULT",
        systemCategory: "vault",
        description: isEarly ? "Early Vault Withdrawal (No Interest)" : "Vault Maturity Release",
        type: "vault",
      });

      let payout = vault.amount;
      if (!isEarly) {
        const daysLocked = Math.floor((now.getTime() - vault.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const interestAmount = Math.floor((vault.amount * (vault.interestRate / 10000)) * (daysLocked / 365));
        if (interestAmount > 0) {
          try {
            const paid = await payFromInterestPool({
              bankId: req.params.bankId,
              toAccount: acc,
              amountCents: interestAmount,
              description: "Vault maturity interest",
            });
            if (paid) payout += interestAmount;
          } catch (e) {
            console.error("[vault] interest payout skipped", e);
          }
        }
      }

      await db.update(vaultDeposits).set({ status: isEarly ? "early_withdrawn" : "released" }).where(eq(vaultDeposits.id, vault.id));

      res.json({ success: true, payout, isEarly });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/cards", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts, bankCustomers } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
       const bankCards = await db.select({
         id: cards.id,
         cardNumber: cards.cardNumber,
         expiryDate: cards.expiryDate,
         isLocked: cards.isLocked,
         type: cards.type,
         creditLimit: cards.creditLimit,
         creditUsed: cards.creditUsed,
         productId: cards.productId,
         createdAt: cards.createdAt,
         accountId: cards.accountId,
         accountName: bankAccounts.accountName,
         ownerDiscordId: bankAccounts.ownerDiscordId,
       })
       .from(cards)
       .innerJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
       .where(eq(cards.bankId, req.params.bankId));
       
       const customers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
       const customerMap = new Map<string, string>();
       for (const c of customers) {
         if (c.discordId && c.mcUsername) customerMap.set(c.discordId, c.mcUsername);
       }

       const enrichedCards = bankCards.map(c => {
         let ownerName = customerMap.get(c.ownerDiscordId!);
         if (!ownerName && c.ownerDiscordId && !/^\d{17,20}$/.test(c.ownerDiscordId)) {
           ownerName = c.ownerDiscordId;
         }
         const last4 = c.cardNumber ? String(c.cardNumber).slice(-4) : null;
         return {
           ...c,
           cardNumber: last4 ? `•••• ${last4}` : null,
           last4,
           cvv: undefined,
           resolvedOwnerName: ownerName || c.ownerDiscordId
         };
       });

       res.json(enrichedCards);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.post("/api/banks/:bankId/cards/:cardId/reveal", [requireBankStaff, requireRole(["owner", "admin"])], async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const card = await db.select().from(cards).where(and(eq(cards.id, req.params.cardId), eq(cards.bankId, req.params.bankId))).get();
      if (!card) return res.status(404).json({ error: "Card not found" });
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: (req as any).user?.discordId || "staff",
        action: "card_reveal",
        details: `Revealed PAN for card ${card.id.slice(0, 8)} last4 ${String(card.cardNumber).slice(-4)}`,
        timestamp: new Date(),
      });
      res.json({ cardNumber: card.cardNumber, cvv: card.cvv, expiryDate: card.expiryDate });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.post("/api/banks/:bankId/cards", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const { randomInt } = await import("crypto");
    try {
       const { accountId, creditLimit, creditApr, productId } = req.body;
       if (!accountId) return res.status(400).json({ error: "Missing fields" });
       
       // check account exists in bank
       const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
       if (!acc) return res.status(404).json({ error: "Account not found in bank" });

       const cardNumber = Array.from({length: 16}, () => randomInt(0, 10)).join('');
       const cvv = Array.from({length: 3}, () => randomInt(0, 10)).join('');
       
       const nextYear = new Date();
       nextYear.setFullYear(nextYear.getFullYear() + 4);
       const expiryDate = `${(nextYear.getMonth() + 1).toString().padStart(2, '0')}/${nextYear.getFullYear().toString().slice(-2)}`;

       const result = await db.insert(cards).values({
         id: uuidv4(),
         bankId: req.params.bankId,
         accountId,
         cardNumber,
         cvv,
         expiryDate,
         type: "credit",
         creditLimit: creditLimit ? parseInt(creditLimit) : 1000000,
         creditUsed: 0,
         apr: creditApr ? parseInt(creditApr) : 1999,
         isLocked: false,
         productId: productId || null,
         nextPaymentDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })(),
         createdAt: new Date(),
       }).returning().get();

       res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.delete("/api/banks/:bankId/cards/:cardId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
       await db.delete(cards)
         .where(and(eq(cards.id, req.params.cardId), eq(cards.bankId, req.params.bankId)));
       res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.patch("/api/banks/:bankId/cards/:cardId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
       const { isLocked } = req.body;
       if (typeof isLocked !== "boolean") return res.status(400).json({ error: "Invalid isLocked" });
       
       const result = await db.update(cards)
         .set({ isLocked })
         .where(and(eq(cards.id, req.params.cardId), eq(cards.bankId, req.params.bankId)))
         .returning().get();

       res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/developer", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      let bank = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      const { hashApiKey, last4OfKey, generateBankApiKey, generateWebhookSecret } = await import("../../lib/api_keys.js");
      let plaintextApi: string | null = null;
      if (!bank.apiKeyHash && !bank.apiKey) {
         const newApi = generateBankApiKey();
         const newWh = generateWebhookSecret();
         bank = await db.update(banks).set({
           apiKey: `hashed:${hashApiKey(newApi)}`,
           apiKeyHash: hashApiKey(newApi),
           apiKeyLast4: last4OfKey(newApi),
           webhookSecret: newWh,
         } as any).where(eq(banks.id, req.params.bankId)).returning().get();
         plaintextApi = newApi;
      }

      res.json({
        apiKey: plaintextApi,
        apiKeyLast4: (bank as any).apiKeyLast4 || (plaintextApi ? plaintextApi.slice(-4) : null),
        hasApiKey: Boolean((bank as any).apiKeyHash || bank.apiKey),
        webhookSecret: plaintextApi ? bank.webhookSecret : undefined,
        hasWebhookSecret: Boolean(bank.webhookSecret),
        apiWebhookUrl: bank.apiWebhookUrl,
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/developer", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    
    try {
      const bankId = req.params.bankId;
      const { apiWebhookUrl } = req.body;
      
      await db.update(banks).set({ apiWebhookUrl }).where(eq(banks.id, bankId));
      
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to update webhook url" });
    }
  });

banksRouter.post("/api/banks/:bankId/developer/roll", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
       const { hashApiKey, last4OfKey, generateBankApiKey, generateWebhookSecret } = await import("../../lib/api_keys.js");
       const newApi = generateBankApiKey();
       const newWh = generateWebhookSecret();
       const bank = await db.update(banks)
         .set({
           apiKey: `hashed:${hashApiKey(newApi)}`,
           apiKeyHash: hashApiKey(newApi),
           apiKeyLast4: last4OfKey(newApi),
           webhookSecret: newWh,
         } as any)
         .where(eq(banks.id, req.params.bankId))
         .returning().get();
       if (!bank) return res.status(404).json({ error: "Bank not found" });
       res.json({ apiKey: newApi, apiKeyLast4: last4OfKey(newApi), webhookSecret: newWh });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/transactions/sync", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { startBankSyncJob } = await import("../sync_jobs");

    try {
      const bankId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
      if (accounts.length === 0) {
        return res.json({ success: true, message: "No accounts to sync", totalAccounts: 0 });
      }

      const jobId = startBankSyncJob(bankId, accounts, bank);
      return res.json({ success: true, jobId, totalAccounts: accounts.length });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to initiate sync job" });
    }
  });

banksRouter.get("/api/banks/:bankId/sync-job/:jobId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { getSyncJob } = await import("../sync_jobs");
    const job = getSyncJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found or expired" });
    res.json(job);
  });

banksRouter.get("/api/banks/:bankId/transactions", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions, bankAccounts, bankCustomers, users } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
       const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
       const offset = parseInt(req.query.offset as string) || 0;

       const bankTxs = await db.select({
         id: transactions.id,
         amount: transactions.amount,
         type: transactions.type,
         description: transactions.description,
         timestamp: transactions.timestamp,
         fromAccountId: transactions.fromAccountId,
         toAccountId: transactions.toAccountId,
         category: transactions.category,
         isFlagged: transactions.isFlagged
       })
       .from(transactions)
       .where(eq(transactions.bankId, req.params.bankId))
       .orderBy(desc(transactions.timestamp))
       .limit(limit)
       .offset(offset);

       const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
       const customers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
       let globalUsers: any[] = [];
       try { globalUsers = await db.select().from(users); } catch (e) {}

       const cache = { accounts, customers, users: globalUsers };

       const enrichedTxs = await Promise.all(bankTxs.map(async (tx) => {
         const fromInfo = await resolveAccountAndUser(db, req.params.bankId, tx.fromAccountId, cache);
         const toInfo = await resolveAccountAndUser(db, req.params.bankId, tx.toAccountId, cache);

         return {
           ...tx,
           fromUsername: fromInfo?.username || null,
           fromAccountName: fromInfo?.accountName || null,
           fromDisplayName: fromInfo?.displayName || null,
           toUsername: toInfo?.username || null,
           toAccountName: toInfo?.accountName || null,
           toDisplayName: toInfo?.displayName || null
         };
       }));

       res.json(enrichedTxs);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/transactions", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) return res.status(404).json({ error: "Bank not found" });
      const bank = bankResult[0];

      const { type, accountName, amount, description } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
      if (type === "transfer") {
        return res.status(410).json({
          error: "Staff cannot record transfers. CityCorp already books them when money moves. Use Teller only if you must execute a new same-bank CityCorp transfer.",
        });
      }

      // Identify source account ID for internal DB
      const accountRes = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bank.id), eq(bankAccounts.accountName, accountName))).limit(1);
      if (accountRes.length === 0) return res.status(404).json({ error: "Source account not found locally" });
      const account = accountRes[0];

      const { auditLogs } = await import("../../db/schema");
      const { refreshAccountCache } = await import("../../lib/citycorp_money");

      // Teller cash window: deposit/withdraw hit the bank owner's personal in-game wallet.
      if (!bank.corpId || !bank.corpApiUuid || !bank.corpApiKey) {
        return res.status(400).json({ error: "This bank is not connected to CityCorp. Teller cash window is unavailable." });
      }
      {
        const { CityCorpClient } = await import("../../lib/citycorp_api");
        const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);

        let clientRes;
        if (type === 'deposit') {
          clientRes = await client.deposit(accountName, parsedAmount / 100);
        } else if (type === 'withdraw') {
          clientRes = await client.withdraw(accountName, parsedAmount / 100);
        }

        if (clientRes && !clientRes.success) {
          return res.status(400).json({ error: `CityCorp API Error: ${clientRes.message}` });
        }

        await refreshAccountCache({
          bankId: bank.id,
          accountName,
          accountId: account.id,
          client,
        });
      }

      // Local ledger mirrors CityCorp cash window. The other side is the owner's wallet, not a fake vault account.
      const finalFromId = type === "withdraw" ? account.id : null;
      const finalToId = type === "deposit" ? account.id : null;

      const isFlagged = parsedAmount >= 1000000;

      // Record in local DB
      const txRecord = {
        id: uuidv4(),
        bankId: bank.id,
        fromAccountId: finalFromId,
        toAccountId: finalToId,
        type: type,
        amount: parsedAmount,
        description: description || `Manual ${type}`,
        isFlagged: isFlagged,
        timestamp: new Date()
      };

      const cityCorpLive = !!(bank.corpId && bank.corpApiUuid && bank.corpApiKey);

      await db.transaction(async (txDb) => {
        await txDb.insert(transactions).values(txRecord);

        await txDb.insert(auditLogs).values({
          id: uuidv4(),
          bankId: bank.id,
          userDiscordId: 'Operator',
          action: `manual_${type}`,
          details: `Processed ${type} of $${(parsedAmount / 100).toFixed(2)} on account ${accountName}`,
          timestamp: new Date()
        });
      });

      res.json(txRecord);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/tools/mass-action", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    try {
      const type = String(req.body?.type || "");
      if (["freeze", "unfreeze", "close", "notify"].includes(type)) {
        return res.status(400).json({ error: `Mass action '${type}' is not implemented on this endpoint.` });
      }
      return res.status(410).json({
        error: "Mass deposit/credit/interest is disabled. Balance changes must go through CityCorp (teller cash window or book transfer)."
      });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/tools/purge-zero", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const zeroBalanceAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.balance, 0))
      );

      if (zeroBalanceAccounts.length === 0) {
        return res.json({ success: true, purgedCount: 0 });
      }

      for (const acc of zeroBalanceAccounts) {
         await db.delete(bankAccounts).where(eq(bankAccounts.id, acc.id));
      }

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: req.params.bankId,
         userDiscordId: 'Operator',
         action: `purge_zero`,
         details: `Purged ${zeroBalanceAccounts.length} zero-balance accounts`,
         timestamp: new Date()
      });

      res.json({ success: true, purgedCount: zeroBalanceAccounts.length });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/tools/daily-processing", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { auditLogs } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      let notes: string[] = [];

      const { processDueLoanRepayments, accrueLoanInterest } = await import("../loan_processor");
      const due = await processDueLoanRepayments(bId, { ignoreAutoDebitFlag: true });
      notes.push(`Due loans: processed ${due.processed}, debited ${due.debited}, late fees ${due.lateFees}, defaulted ${due.defaulted}.`);
      const accrued = await accrueLoanInterest(bId);
      notes.push(`Accrued interest on ${accrued.accruedLoans} loans ($${(accrued.totalInterestAccruedCents / 100).toFixed(2)}).`);

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: bId,
         userDiscordId: 'Operator',
         action: `daily_processing`,
         details: notes.length > 0 ? `Executed EOD processes. ${notes.join(' ')}` : `Executed EOD processes. No actions needed.`,
         timestamp: new Date()
      });

      res.json({ success: true, message: notes.length > 0 ? `EOD Processing complete. ${notes.join(' ')}` : "Finished. No actions required." });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/tools/data-migration", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const rawData = req.body.rawData;
      if (!rawData) return res.status(400).json({ error: "Missing rawData payload" });

      let dataArray = Array.isArray(rawData) ? rawData : 
                     (rawData.data || rawData.accounts || rawData.users || rawData.transactions || [rawData]);

      let accountsImported = 0;
      let transactionsImported = 0;

      for (const item of dataArray) {
        // --- 1. Attempt to parse as an Account / Customer ---
        // Looks for common user identity fields
        if (item.discordId || item.ownerDiscordId || item.userId || item.accountName || item.name || item.customer) {
          const ownerDiscordId = (item.discordId || item.ownerDiscordId || item.userId || item.customer || "import_" + Math.floor(Math.random()*1000000)).toString();
          const accountName = (item.accountName || item.name || item.title || `Migrated Account (${ownerDiscordId})`).toString();
          
          // Parse balance
          let balanceValue = item.balance || item.currentBalance || item.total || 0;
          if (typeof balanceValue === 'string') balanceValue = parseFloat(balanceValue.replace(/[^0-9.-]+/g,""));
          // Assume provided balance is in DOLLARS unless it's explicitly cents or it's a huge integer and they specify.
          // By default, convert to cents.
          let balanceCents = Math.round(Number(balanceValue) * 100);

          // Check if account already exists for this discord ID to prevent dupes, 
          // or if they force new account per line
          const existing = await db.select().from(bankAccounts).where(
             and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, ownerDiscordId))
          );

          let accId;
          if (existing.length === 0) {
            accId = uuidv4();
            await db.insert(bankAccounts).values({
              id: accId,
              bankId: bId,
              ownerDiscordId: ownerDiscordId,
              accountName: accountName,
              balance: balanceCents,
              isActive: item.isActive !== undefined ? item.isActive : true,
              createdAt: new Date(item.createdAt || item.date || Date.now())
            });
            accountsImported++;

            if (balanceCents > 0) {
               await db.insert(transactions).values({
                 id: uuidv4(),
                 bankId: bId,
                 fromAccountId: null,
                 toAccountId: accId,
                 type: 'deposit',
                 amount: balanceCents,
                 description: 'Initial balance from migration',
                 timestamp: new Date(item.createdAt || item.date || Date.now())
               });
               transactionsImported++;
            }
          } else {
            accId = existing[0].id; // Merge / attach to existing
          }

          // --- 2. Inner array of transactions ---
          const txs = item.transactions || item.history || item.sales || item.records;
          if (Array.isArray(txs)) {
            for (const tx of txs) {
              let txAmount = tx.amount || tx.value || tx.total || tx.fee || 0;
              if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
              
              const isOutflow = tx.type === 'withdraw' || tx.type === 'fee' || tx.type === 'tax' || txAmount < 0;
              
              await db.insert(transactions).values({
                id: tx.id || uuidv4(),
                bankId: bId,
                fromAccountId: isOutflow ? accId : null,
                toAccountId: !isOutflow ? accId : null,
                type: tx.type || (isOutflow ? 'withdraw' : 'deposit'),
                amount: Math.abs(Math.round(Number(txAmount) * 100)),
                description: tx.description || tx.memo || tx.note || "Historical record",
                timestamp: new Date(tx.timestamp || tx.date || tx.createdAt || Date.now())
              });
              transactionsImported++;
            }
          }
        } 
        // --- 3. Attempt to parse as standalone Transaction / Sale log ---
        else if (item.amount !== undefined && (item.type || item.description || item.memo || item.recipient || item.sender)) {
          // It's a flat transaction log. Create a generic "Legacy Import" account if we don't know who it belongs to.
          // Or map to owner if they supply a discord ID.
          const ownerDiscordId = (item.discordId || item.userId || item.customer || "legacy_import_pool").toString();
          
          const existing = await db.select().from(bankAccounts).where(
             and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, ownerDiscordId))
          );
          
          let accId;
          if (existing.length === 0) {
            accId = uuidv4();
            await db.insert(bankAccounts).values({
              id: accId,
              bankId: bId,
              ownerDiscordId: ownerDiscordId,
              accountName: `Imported Ledger (${ownerDiscordId})`,
              balance: 0,
              isActive: true,
              createdAt: new Date()
            });
            accountsImported++;
          } else {
            accId = existing[0].id;
          }

          let txAmount = item.amount || item.value || item.total || item.fee || 0;
          if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
          
          const isOutflow = item.type === 'withdraw' || item.type === 'fee' || item.type === 'tax' || txAmount < 0;
          
          await db.insert(transactions).values({
            id: item.id || uuidv4(),
            bankId: bId,
            fromAccountId: isOutflow ? accId : null,
            toAccountId: !isOutflow ? accId : null,
            type: item.type || (isOutflow ? 'withdraw' : 'deposit'),
            amount: Math.abs(Math.round(Number(txAmount) * 100)),
            description: item.description || item.memo || item.note || "Imported historical record",
            timestamp: new Date(item.timestamp || item.date || item.createdAt || Date.now())
          });
          transactionsImported++;
        }
      }

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: bId,
         userDiscordId: 'Operator',
         action: `data_migration`,
         details: `Intelligently imported ${accountsImported} accounts and ${transactionsImported} transactions.`,
         timestamp: new Date()
      });

      res.json({ success: true, accountsImported, transactionsImported });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error during migration parsing" });
    }
  });

banksRouter.post("/api/banks/:bankId/tools/sqlite-migration", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { 
      bankCustomers, 
      bankAccounts, 
      transactions, 
      loanProducts, 
      loans, 
      creditApplications, 
      invoices, 
      payrollJobs, 
      auditLogs 
    } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const { default: Database } = await import("better-sqlite3");

    let tempPath: string | null = null;
    let legacyDb: any = null;

    try {
      const bId = req.params.bankId;
      const { dbBase64, dbSql } = req.body;

      if (dbSql) {
        return res.status(400).json({ 
          error: "Raw SQL script execution is permanently disabled for multi-tenant security. Please upload a binary SQLite database file (.db, .sqlite, .sqlite3)." 
        });
      }

      if (!dbBase64) {
        return res.status(400).json({ error: "Please upload a valid SQLite database file (.db, .sqlite, .sqlite3) encoded in base64." });
      }

      const buffer = Buffer.from(dbBase64, "base64");
      
      // Enforce SQLite 3 magic header validation ("SQLite format 3\0")
      const SQLITE_HEADER = Buffer.from("SQLite format 3\0");
      if (buffer.length < 16 || !buffer.subarray(0, 16).equals(SQLITE_HEADER)) {
        return res.status(400).json({ error: "Uploaded file is not a valid SQLite database file (invalid magic header)." });
      }

      tempPath = path.join(os.tmpdir(), `sqlite_import_${uuidv4()}.db`);
      fs.writeFileSync(tempPath, buffer);

      // Open read-only and disable trusted schema to prevent any malicious trigger/function execution
      legacyDb = new Database(tempPath, { readonly: true, fileMustExist: true });
      try {
        legacyDb.pragma("trusted_schema = OFF");
      } catch (_) {}

      // Discover tables using safe parameter-free query
      const tableRows = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tableRows.map((t: any) => String(t.name || "").toLowerCase());

      const ALLOWED_TABLES = new Set([
        "accounts",
        "loan_products",
        "loans",
        "loan_applications",
        "transactions",
        "invoices",
        "payroll_entries"
      ]);

      let accountsImported = 0;
      let customersImported = 0;
      let transactionsImported = 0;
      let loanProductsImported = 0;
      let loansImported = 0;
      let loanAppsImported = 0;
      let invoicesImported = 0;
      let payrollsImported = 0;

      const accountNameToIdMap = new Map<string, string>();

      // 1. Process accounts table
      if (tableNames.includes("accounts")) {
        const legacyAccounts = legacyDb.prepare("SELECT * FROM accounts").all();
        for (const row of legacyAccounts) {
          const discordId = (row.discord_id || row.owner_discord_id || "unlinked_" + (row.account_name || uuidv4())).toString();
          const accountName = (row.account_name || row.name || `Migrated (${discordId})`).toString();
          
          const existingCust = await db.select().from(bankCustomers).where(
            and(eq(bankCustomers.bankId, bId), eq(bankCustomers.discordId, discordId))
          );
          if (existingCust.length === 0) {
            await db.insert(bankCustomers).values({
              id: uuidv4(),
              bankId: bId,
              discordId: discordId,
              kycStatus: row.verified ? "approved" : "pending",
              mcUsername: row.mc_username || null,
              notes: `Migrated from SQLite .db | RP Name: ${row.rp_name || ''} | Address: ${row.registered_address || ''}`,
              createdAt: row.created_at ? new Date(row.created_at) : new Date()
            });
            customersImported++;
          }

          let balanceCents = 0;
          if (row.balance !== undefined) {
            balanceCents = Math.round(Number(row.balance) * 100);
          }

          const existingAcc = await db.select().from(bankAccounts).where(
            and(eq(bankAccounts.bankId, bId), eq(bankAccounts.accountName, accountName))
          );

          let accId: string;
          if (existingAcc.length === 0) {
            accId = uuidv4();
            await db.insert(bankAccounts).values({
              id: accId,
              bankId: bId,
              ownerDiscordId: discordId,
              accountName: accountName,
              accountType: row.account_type || "personal",
              balance: balanceCents,
              isFrozen: Boolean(row.frozen),
              isActive: true,
              existsInGame: true,
              lastSyncedAt: new Date(),
              createdAt: row.created_at ? new Date(row.created_at) : new Date()
            });
            accountsImported++;
          } else {
            accId = existingAcc[0].id;
          }

          accountNameToIdMap.set(accountName, accId);
        }
      }

      // 2. Process loan_products table
      if (tableNames.includes("loan_products")) {
        const legacyLoanProducts = legacyDb.prepare("SELECT * FROM loan_products").all();
        for (const lp of legacyLoanProducts) {
          const prodId = uuidv4();
          const maxCents = Math.round(Number(lp.max_amount || lp.amount || 10000) * 100);
          const rateBps = Math.round(Number(lp.interest_rate || 5) * 100);
          const termWeeks = Number(lp.term_weeks || 4);

          await db.insert(loanProducts).values({
            id: prodId,
            bankId: bId,
            name: lp.name || "Migrated Loan Product",
            maxAmount: maxCents,
            interestRate: rateBps,
            termDays: termWeeks * 7,
            isActive: lp.is_active !== undefined ? Boolean(lp.is_active) : true,
            createdAt: new Date()
          });
          loanProductsImported++;
        }
      }

      // 3. Process loans table
      if (tableNames.includes("loans")) {
        const legacyLoans = legacyDb.prepare("SELECT * FROM loans").all();
        for (const loan of legacyLoans) {
          const targetAccId = accountNameToIdMap.get(loan.account_name) || null;
          if (targetAccId) {
            const amtCents = Math.round(Number(loan.amount || 0) * 100);
            const remCents = Math.round(Number(loan.remaining_amount !== undefined ? loan.remaining_amount : loan.total_due || loan.amount || 0) * 100);
            const rateBps = Math.round(Number(loan.interest_rate || 5) * 100);
            const borrowerDiscordId = (loan.discord_id || "unlinked_borrower").toString();

            await db.insert(loans).values({
              id: uuidv4(),
              bankId: bId,
              discordId: borrowerDiscordId,
              accountId: targetAccId,
              principalAmount: amtCents,
              remainingAmount: remCents,
              interestRate: rateBps,
              nextPaymentDate: loan.next_due_date ? new Date(loan.next_due_date) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              purpose: loan.purpose || "Migrated legacy loan",
              status: loan.is_active ? "active" : "paid_off",
              collateralDescription: loan.collateral || null,
              createdAt: loan.created_at ? new Date(loan.created_at) : new Date()
            });
            loansImported++;
          }
        }
      }

      // 4. Process loan_applications table
      if (tableNames.includes("loan_applications")) {
        const legacyApps = legacyDb.prepare("SELECT * FROM loan_applications").all();
        for (const app of legacyApps) {
          const reqCents = Math.round(Number(app.amount || 0) * 100);
          const applicantDiscordId = (app.discord_id || "unlinked_applicant").toString();
          const backingAccId = accountNameToIdMap.get(app.account_name) || Array.from(accountNameToIdMap.values())[0];

          if (backingAccId) {
            await db.insert(creditApplications).values({
              id: uuidv4(),
              bankId: bId,
              discordId: applicantDiscordId,
              accountId: backingAccId,
              requestedLimit: reqCents,
              monthlyIncome: Math.round(Number(app.monthly_income || 1000) * 100),
              purpose: app.purpose || "Migrated loan application",
              status: app.status || "pending",
              createdAt: app.created_at ? new Date(app.created_at) : new Date()
            });
            loanAppsImported++;
          }
        }
      }

      // 5. Process transactions table
      if (tableNames.includes("transactions")) {
        const legacyTxs = legacyDb.prepare("SELECT * FROM transactions").all();
        for (const tx of legacyTxs) {
          const accId = accountNameToIdMap.get(tx.account_name) || null;
          const amtCents = Math.abs(Math.round(Number(tx.amount || 0) * 100));
          const txType = tx.trans_type || tx.type || "transfer";
          const isOut = txType === "withdraw" || txType === "fee" || txType === "tax" || Number(tx.amount) < 0;

          await db.insert(transactions).values({
            id: uuidv4(),
            bankId: bId,
            fromAccountId: isOut ? accId : null,
            toAccountId: !isOut ? accId : null,
            type: txType,
            amount: amtCents,
            description: tx.description || `Legacy transaction with ${tx.other_party || 'external party'}`,
            timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date()
          });
          transactionsImported++;
        }
      }

      // 6. Process invoices table
      if (tableNames.includes("invoices")) {
        const legacyInvoices = legacyDb.prepare("SELECT * FROM invoices").all();
        for (const inv of legacyInvoices) {
          const senderAccId = accountNameToIdMap.get(inv.sender_account) || null;
          const recipientAccId = accountNameToIdMap.get(inv.recipient_account) || Array.from(accountNameToIdMap.values())[0];
          const amtCents = Math.round(Number(inv.amount || 0) * 100);

          if (senderAccId && recipientAccId) {
            await db.insert(invoices).values({
              id: uuidv4(),
              bankId: bId,
              billerAccountId: senderAccId,
              customerAccountId: recipientAccId,
              amount: amtCents,
              description: inv.description || `Invoice for ${inv.recipient_name || 'Customer'}`,
              dueDate: inv.due_date ? new Date(inv.due_date) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              status: inv.status || "pending",
              createdAt: inv.created_at ? new Date(inv.created_at) : new Date()
            });
            invoicesImported++;
          }
        }
      }

      // 7. Process payroll_entries table
      if (tableNames.includes("payroll_entries")) {
        const legacyPayroll = legacyDb.prepare("SELECT * FROM payroll_entries").all();
        for (const pay of legacyPayroll) {
          const employerAccId = accountNameToIdMap.get(pay.employer_account) || null;
          const recipientAccId = accountNameToIdMap.get(pay.recipient_account) || null;
          const amtCents = Math.round(Number(pay.amount || 0) * 100);

          if (employerAccId && recipientAccId) {
            await db.insert(payrollJobs).values({
              id: uuidv4(),
              bankId: bId,
              employerAccountId: employerAccId,
              employeeAccountId: recipientAccId,
              amount: amtCents,
              frequency: "biweekly",
              nextRun: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              isActive: true,
              createdAt: pay.timestamp ? new Date(pay.timestamp) : new Date()
            });
            payrollsImported++;
          }
        }
      }

      if (legacyDb) legacyDb.close();
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: `sqlite_migration`,
        details: `Imported SQLite database: ${accountsImported} accounts, ${customersImported} customers, ${transactionsImported} txs, ${loansImported} loans, ${invoicesImported} invoices.`,
        timestamp: new Date()
      });

      res.json({
        success: true,
        accountsImported,
        customersImported,
        transactionsImported,
        loanProductsImported,
        loansImported,
        loanAppsImported,
        invoicesImported,
        payrollsImported,
        tablesFound: tableNames
      });
    } catch (e: any) {
      if (legacyDb) {
        try { legacyDb.close(); } catch (_) {}
      }
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }
      console.error("SQLite Migration Error:", e);
      res.status(500).json({ error: e.message || "Failed to parse and import SQLite database" });
    }
  });

banksRouter.post("/api/banks/:bankId/tools/seed-demo", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    return res.status(410).json({ error: "Demo seed is disabled. Do not fabricate ledger balances." });
  });

banksRouter.get("/api/banks/:bankId/compliance/flagged", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const data = await db.select().from(transactions).where(and(eq(transactions.bankId, req.params.bankId), eq(transactions.isFlagged, true)));
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/compliance/flagged/:txId/resolve", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.update(transactions).set({ isFlagged: false }).where(and(eq(transactions.id, req.params.txId), eq(transactions.bankId, req.params.bankId)));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.get("/api/banks/:bankId/compliance/frozen", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const data = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.isFrozen, true)));
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/compliance/frozen/:accId/unfreeze", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.update(bankAccounts).set({ isFrozen: false }).where(and(eq(bankAccounts.id, req.params.accId), eq(bankAccounts.bankId, req.params.bankId)));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: (e as any).message });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/freeze", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const accId = req.params.accountId;
      const { freeze } = req.body;

      await db.update(bankAccounts)
        .set({ isFrozen: freeze })
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.id, accId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: (req as any).user?.discordId || 'Operator',
        action: freeze ? 'account_frozen' : 'account_unfrozen',
        details: `${freeze ? 'Froze' : 'Unfroze'} account ${accId}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
});
