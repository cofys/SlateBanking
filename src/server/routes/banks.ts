import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const banksRouter = express.Router();

interface CityCorpSearchCacheEntry {
  timestamp: number;
  results: any[];
}
const corpSearchCache = new Map<string, CityCorpSearchCacheEntry>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes TTL

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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

// Bulk Enable/Disable Maintenance Mode for ALL banks across the platform
banksRouter.get("/api/banks/corp-finder", requireAuth, async (req: express.Request, res: express.Response) => {
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
                   } catch (e) {
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
          } catch (e) {
            // Bot already provisioned or offline
          }
          await botManager.updateBankBotPresence(bank.id, maintenanceMode);
        }
      }

      res.json({ success: true, maintenanceMode, totalBanks: allBanks.length });
    } catch (e) {
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
        } catch (e) {
          // Bot already provisioned or offline
        }
        await botManager.updateBankBotPresence(bId, maintenanceMode);
      }

      res.json({ success: true, bankId: bId, maintenanceMode });
    } catch (e) {
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
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
            balance: balanceCents,
            isActive: true,
            createdAt: new Date()
          });
          accountsImported++;
        } else {
          targetAccountId = existing[0].id;
          await db.update(bankAccounts).set({ balance: existing[0].balance + balanceCents }).where(eq(bankAccounts.id, targetAccountId));
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
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    try {
      const allBanks = await db.select().from(banks);
      const statuses = botManager.getBankStatuses();
      
      const decodedUser = (req as any).user;
      const isGlobalAdmin = decodedUser && decodedUser.isGlobalAdmin;

      const enrichedBanks = allBanks.map(b => {
        if (isGlobalAdmin) {
          const { discordToken, discordClientSecret, corpApiKey, cityCorpAppSecret, apiKey, webhookSecret, ...safeBank } = b;
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
      
      res.json(newBank);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/invoices", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { invoices } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const data = await db.select().from(invoices).where(eq(invoices.bankId, req.params.bankId)).orderBy(desc(invoices.createdAt));
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/invoices", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { invoices, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { billerAccountId, customerAccountId, amount, description, dueDateDays } = req.body;
      
      const bAcc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, billerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!bAcc) return res.status(400).json({ error: "Biller account not found" });

      const due = new Date();
      due.setDate(due.getDate() + (dueDateDays || 7));

      const newInv = {
         id: uuidv4(),
         bankId: req.params.bankId,
         billerAccountId,
         customerAccountId,
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/customers", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, bankCustomers } = await import("../../db/schema");
    const { eq, sum, count, min } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localCustomers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      
      const customerMap = new Map<string, any>();
      for (const account of dbAccounts) {
        const dId = account.ownerDiscordId;
        if (!customerMap.has(dId)) {
          const profile = localCustomers.find(c => c.discordId === dId);
          customerMap.set(dId, { discordId: dId, mcUsername: profile?.mcUsername || null, kycStatus: profile?.kycStatus || "pending", accountCount: 0, totalBalance: 0, firstJoined: account.createdAt });
        }
        const c = customerMap.get(dId);
        c.accountCount += 1;
        c.totalBalance += account.balance;
        if (new Date(account.createdAt) < new Date(c.firstJoined)) {
           c.firstJoined = account.createdAt;
        }
      }
      
      res.json(Array.from(customerMap.values()));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/team", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankStaff } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const staff = await db.select().from(bankStaff).where(eq(bankStaff.bankId, req.params.bankId));
      res.json(staff);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
        discordId: req.body.discordId,
        role: req.body.role,
        createdAt: new Date(),
      };
      await db.insert(bankStaff).values(newStaff);
      res.json(newStaff);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.delete("/api/banks/:bankId/team/:staffId", [requireBankStaff, requireRole(["owner"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { bankStaff } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.delete(bankStaff).where(and(eq(bankStaff.id, req.params.staffId), eq(bankStaff.bankId, req.params.bankId)));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/customers/:discordId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, bankCustomers } = await import("../../db/schema");
    const { eq, or, inArray, desc, and } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.ownerDiscordId, req.params.discordId))
      );
      
      const accountIds = dbAccounts.map(a => a.id);
      const accountNames = dbAccounts.map(a => a.accountName);

      let txList: any[] = [];
      if (accountIds.length > 0 && accountNames.length > 0) {
        txList = await db.select().from(transactions).where(
          and(
            eq(transactions.bankId, req.params.bankId),
            or(
              inArray(transactions.fromAccountId, accountIds),
              inArray(transactions.toAccountId, accountNames)
            )
          )
        ).orderBy(desc(transactions.timestamp)).limit(50);
      }
      
      const customerRecord = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, req.params.bankId), eq(bankCustomers.discordId, req.params.discordId))
      ).limit(1);
      
      res.json({
        discordId: req.params.discordId,
        accounts: dbAccounts,
        transactions: txList,
        totalBalance: dbAccounts.reduce((sum, a) => sum + a.balance, 0),
        firstJoined: dbAccounts.length ? dbAccounts.reduce((min, a) => new Date(a.createdAt) < min ? new Date(a.createdAt) : min, new Date()) : null,
        notes: customerRecord[0]?.notes || "",
        kycStatus: customerRecord[0]?.kycStatus || "pending"
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/update-owner", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const accId = req.params.accountId;
      const { newDiscordId } = req.body;

      if (!newDiscordId || typeof newDiscordId !== 'string') {
        return res.status(400).json({ error: "Missing or invalid newDiscordId" });
      }
      
      const { bankCustomers } = await import("../../db/schema");
      const { or, like } = await import("drizzle-orm");
      
      // Resolve username or discord ID
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
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.id, accId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: 'account_owner_updated',
        details: `Reassigned account ${accId} to Discord ID ${newDiscordId}`,
        timestamp: new Date()
      });

      res.json({ success: true, newDiscordId });
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
          colorScheme: "indigo",
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
          enableTreasury: true
        } as any;
      }
      res.json({
        ...settings,
        customDomain: bank?.customDomain || "",
        cityCorpAppId: bank?.cityCorpAppId || "",
        hasCityCorpAppSecret: !!bank?.cityCorpAppSecret,
        maintenanceMode: bank?.maintenanceMode || false
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
         await db.update(banks).set({ brandingColor: req.body.brandingColor }).where(eq(banks.id, bId));
      }
      if (req.body.logoUrl !== undefined) {
         await db.update(banks).set({ logoUrl: req.body.logoUrl }).where(eq(banks.id, bId));
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
            } catch (e) {
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
        googleDocsAutoGenerate: req.body.googleDocsAutoGenerate
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

      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/accrue-interest", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, bankSettings, transactions } = await import("../../db/schema");
    const { eq, and, gt } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      const apyBasisPoints = settings?.savingsApyPercent ?? 300; // default 3.00%
      if (apyBasisPoints <= 0) {
        return res.json({ success: true, processedCount: 0, totalInterestPaid: 0, message: "Interest rate set to 0%" });
      }

      // Fetch all non-frozen, active accounts with positive balance
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

      await db.transaction(async (tx) => {
        for (const account of eligibleAccounts) {
          // Daily interest calculation: balance * (apyBasisPoints / 10000) / 365
          const dailyInterest = Math.floor((account.balance * (apyBasisPoints / 10000)) / 365);
          if (dailyInterest > 0) {
            await tx.update(bankAccounts)
              .set({ balance: account.balance + dailyInterest })
              .where(eq(bankAccounts.id, account.id));

            await tx.insert(transactions).values({
              id: uuidv4(),
              bankId,
              toAccountId: account.id,
              amount: dailyInterest,
              type: "interest_payment",
              description: `Savings Interest Accrual (${(apyBasisPoints / 100).toFixed(2)}% APY)`,
              timestamp: new Date(),
              category: "Interest"
            });

            processedCount++;
            totalInterestPaid += dailyInterest;
          }
        }

        await tx.update(bankSettings)
          .set({ lastInterestAccrualAt: new Date() })
          .where(eq(bankSettings.bankId, bankId));
      });

      res.json({
        success: true,
        processedCount,
        totalInterestPaid,
        apyBasisPoints,
        accrualTimestamp: new Date()
      });
    } catch (e) {
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
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

banksRouter.post("/api/banks/:bankId/products", requireGlobalAdmin, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loanProducts, creditProducts } = await import("../../db/schema");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const bankId = req.params.bankId;
      const { type, name, interestRate, maxLimit, termDays, rewardsPercent } = req.body;
      
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
          createdAt: new Date()
        });
      }
      
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

banksRouter.get("/api/banks/:bankId/accounts", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const accounts = await db.select()
        .from(bankAccounts)
        .where(eq(bankAccounts.bankId, req.params.bankId))
        .orderBy(desc(bankAccounts.createdAt));
      res.json(accounts);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    // We expect minecraftUsername in the body
    const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername } = req.body;
    
    try {
      // 1. Fetch Bank Configuration
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) {
        return res.status(404).json({ error: "Bank not found" });
      }
      const bank = bankResult[0];

      // 2. Fetch Mojang UUID if username is provided
      let mojangUuid = null;
      if (minecraftUsername) {
        try {
          const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${minecraftUsername}`);
          if (mojangRes.ok) {
            const mojangData = await mojangRes.json();
            if (mojangData && mojangData.id) {
              // Add dashes to UUID (CityCorp usually requires dashed UUIDs, but we'll format it just in case)
              const id = mojangData.id;
              mojangUuid = `${id.substring(0,8)}-${id.substring(8,12)}-${id.substring(12,16)}-${id.substring(16,20)}-${id.substring(20)}`;
            }
          } else {
             console.warn(`Mojang API returned ${mojangRes.status} for ${minecraftUsername}`);
             // If we strict-fail on invalid MC username:
             return res.status(400).json({ error: "Invalid Minecraft username" });
          }
        } catch (e) {
          console.error("Mojang API error", e);
        }
      }

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
            // depending on policy, fail or continue. Let's return error to user.
            return res.status(400).json({ error: `CityCorp Error: ${createRes.message}` });
          }
        }

        // Fetch actual balance if linking existing account
        if (linkExisting) {
           const details = await client.getAccountDetails(accountName);
           if (details && details.balance !== undefined) {
             // Overwrite initialBalanceCents with the actual balance from the remote
             // Assuming details.balance is in float dollars
             req.body.initialBalanceCents = Math.round(details.balance * 100);
           }
        }

        // 3b. Add subuser to corp account
        if (mojangUuid) {
          const subuserRes = await client.addSubuser(accountName, mojangUuid);
          if (!subuserRes.success) {
             console.error(`CityCorp Add Subuser Failed:`, subuserRes.message);
             // Inform but don't hard crash the whole creation
          }
        }
        
        // 3c. Initial Deposit (if any and not linking existing)
        if (!linkExisting && initialBalanceCents && initialBalanceCents > 0) {
            const depositRes = await client.deposit(accountName, initialBalanceCents / 100);
            if (!depositRes.success) {
               console.error(`CityCorp Initial Deposit Failed:`, depositRes.message);
            }
        }
      } else {
         console.warn("CityCorp API credentials missing for bank, skipping external creation");
      }

      // 4. Resolve Discord ID if username provided
      const { bankCustomers } = await import("../../db/schema");
      const { or, like, and } = await import("drizzle-orm");
      let finalDiscordId = ownerDiscordId || 'imported';
      
      if (ownerDiscordId) {
          const existingCustomer = await db.select().from(bankCustomers).where(
            and(
              eq(bankCustomers.bankId, req.params.bankId),
              or(
                eq(bankCustomers.discordId, ownerDiscordId),
                like(bankCustomers.mcUsername, ownerDiscordId)
              )
            )
          ).get();
          
          if (existingCustomer) {
            finalDiscordId = existingCustomer.discordId;
          }
      }

      // 5. Create in local DB
      const newAccount = {
        id: uuidv4(),
        bankId: req.params.bankId,
        ownerDiscordId: finalDiscordId,
        accountName,
        balance: req.body.initialBalanceCents || initialBalanceCents || 0,
        createdAt: new Date(),
      };
      
      await db.insert(bankAccounts).values(newAccount);

      const { auditLogs } = await import("../../db/schema");
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: 'Operator',
        action: 'create_account',
        details: `Created account: ${accountName}`,
        timestamp: new Date()
      });

      res.json(newAccount);
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
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);

      // Get existing accounts and customers in DB to avoid duplicates
      const localAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localAccountNames = new Set(localAccounts.map(a => a.accountName));

      const localCustomers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      const localCustomerIds = new Set(localCustomers.map(c => c.discordId));

      let importedCount = 0;
      let currentPage = 1;
      let totalPages = 1;
      
      do {
        const listData = await client.listAccounts(currentPage);
        if (!listData || !listData.accounts) break;
        
        for (const remoteAccount of listData.accounts) {
          if (!localAccountNames.has(remoteAccount.name)) {
            // Check for a 17-20 digit Discord ID in the name (e.g. Player (123456789012345678))
            const discordMatch = remoteAccount.name.match(/\b\d{17,20}\b/);
            const inferredOwner = discordMatch 
              ? discordMatch[0] 
              : `unassigned_${remoteAccount.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

            const accountId = uuidv4();
            const currentBalance = Math.round(remoteAccount.balance * 100) || 0;
            const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

            // 1. Create the Local Bank Account
            await db.insert(bankAccounts).values({
              id: accountId,
              bankId: bank.id,
              ownerDiscordId: inferredOwner,
              accountName: remoteAccount.name,
              balance: currentBalance,
              createdAt: fifteenDaysAgo,
            });

            // 2. Ensure customer profile exists if matched with a real Discord ID
            if (discordMatch && !localCustomerIds.has(inferredOwner)) {
              let mcUsernameCandidate = remoteAccount.name;
              mcUsernameCandidate = mcUsernameCandidate.replace(/\(\d{17,20}\)/g, "").trim();
              mcUsernameCandidate = mcUsernameCandidate.replace(/_(checking|savings|vault|business|payroll|personal)$/i, "").trim();
              mcUsernameCandidate = mcUsernameCandidate.replace(/[\(\)\[\]]/g, "").trim();

              await db.insert(bankCustomers).values({
                id: uuidv4(),
                bankId: bank.id,
                discordId: inferredOwner,
                kycStatus: "approved",
                mcUsername: mcUsernameCandidate || null,
                notes: "Auto-created customer profile during CityCorp remote account import.",
                createdAt: fifteenDaysAgo
              });
              localCustomerIds.add(inferredOwner);
            }

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

            localAccountNames.add(remoteAccount.name);
            importedCount++;
          }
        }
        
        totalPages = listData.totalPages || 1;
        currentPage++;
      } while (currentPage <= totalPages);

      // Add audit log
      if (importedCount > 0) {
        const { auditLogs } = await import("../../db/schema");
        await db.insert(auditLogs).values({
            id: uuidv4(),
            bankId: bank.id,
            userDiscordId: 'System',
            action: `auto_import`,
            details: `Imported ${importedCount} existing remote accounts with high-fidelity transaction histories and cards`,
            timestamp: new Date()
        });
      }

      res.json({ success: true, importedCount });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/sync", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, banks } = await import("../../db/schema");
    const { eq, and, or } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const accountId = req.params.accountId;
      
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      
      const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      let syncedRemote = false;
      let remoteBalance: number | null = null;
      let addedRemoteTxCount = 0;

      // 1. CityCorp Sync if configured - Pull account details & ALL remote transactions
      if (bank.corpApiKey && bank.corpId !== null && bank.corpApiUuid !== null) {
        try {
          const { CityCorpClient } = await import("../../lib/citycorp_api");
          const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
          const accountDetails = await client.getAccountDetails(account.accountName);
          if (accountDetails && accountDetails.account) {
            remoteBalance = Math.round(Number(accountDetails.account.balance) * 100);
            syncedRemote = true;
          }

          const remoteTxs = await client.getAllAccountTransactions(account.accountName);
          if (remoteTxs && Array.isArray(remoteTxs) && remoteTxs.length > 0) {
            const existingTxs = await db.select().from(transactions).where(
              and(
                eq(transactions.bankId, bankId), 
                or(eq(transactions.toAccountId, account.id), eq(transactions.fromAccountId, account.id))
              )
            );
            const existingTxIds = new Set(existingTxs.map(t => t.id));
            const existingTxKeys = new Set(existingTxs.map(t => `${t.type}_${t.amount}_${t.description}`));

            for (const tx of remoteTxs) {
              let txAmount = tx.amount || tx.value || 0;
              if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
              
              const isOutflow = tx.type === 'withdraw' || tx.type === 'transfer_out' || txAmount < 0;
              const amountCents = Math.abs(Math.round(Number(txAmount) * 100));
              const desc = tx.description || tx.memo || "Synced transaction";
              const txTypeKey = `${isOutflow ? 'withdraw' : 'deposit'}_${amountCents}_${desc}`;

              if (!existingTxIds.has(tx.id) && !existingTxKeys.has(txTypeKey)) {
                await db.insert(transactions).values({
                  id: tx.id || uuidv4(),
                  bankId: bankId,
                  fromAccountId: isOutflow ? account.id : null,
                  toAccountId: !isOutflow ? account.id : null,
                  type: isOutflow ? 'withdraw' : 'deposit',
                  amount: amountCents,
                  description: desc,
                  timestamp: new Date(tx.timestamp || tx.date || tx.created_at || Date.now())
                });
                addedRemoteTxCount++;
                existingTxKeys.add(txTypeKey);
              }
            }
          }
        } catch (err) {
          console.error("CityCorp sync error:", err);
        }
      }

      // 2. Local Ledger Double Verification from all transactions
      let accTxs = await db.select().from(transactions).where(
        or(eq(transactions.toAccountId, accountId), eq(transactions.fromAccountId, accountId))
      );

      // Clean up duplicate "Initial Account Funding / Ledger Sync" entries from past bug
      const dupSyncTxs = accTxs.filter(t => 
        t.description && (
          t.description.includes("Initial Account Funding") || 
          t.description.includes("Initial Account Deposit") ||
          t.description.includes("Ledger Sync")
        )
      );

      if (dupSyncTxs.length > 1) {
        dupSyncTxs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const duplicates = dupSyncTxs.slice(1);
        const { inArray } = await import("drizzle-orm");
        const dupIds = duplicates.map(d => d.id);
        if (dupIds.length > 0) {
          await db.delete(transactions).where(inArray(transactions.id, dupIds));
          accTxs = await db.select().from(transactions).where(
            or(eq(transactions.toAccountId, accountId), eq(transactions.fromAccountId, accountId))
          );
        }
      }

      let netBalance = 0;
      for (const tx of accTxs) {
        if (tx.toAccountId === accountId) netBalance += tx.amount;
        if (tx.fromAccountId === accountId) netBalance -= tx.amount;
      }

      const finalBalance = (syncedRemote && remoteBalance !== null) ? remoteBalance : netBalance;
      await db.update(bankAccounts).set({ balance: finalBalance }).where(eq(bankAccounts.id, account.id));

      if (accTxs.length === 0 && finalBalance > 0) {
        // Record single baseline transaction for existing positive balance
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: bankId,
          toAccountId: account.id,
          fromAccountId: null,
          type: 'deposit',
          amount: finalBalance,
          description: 'Opening Account Balance',
          timestamp: new Date(account.createdAt || Date.now())
        });
      }

      const updatedAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      return res.json({ success: true, balance: updatedAcc?.balance || 0, account: updatedAcc });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e.message || "Failed to sync account" });
    }
  });

banksRouter.post("/api/banks/:bankId/accounts/:accountId/adjust-balance", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { bankId, accountId } = req.params;
      const { amountCents, newBalanceCents, mode, description } = req.body;

      const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      let finalBalance = account.balance;
      let delta = 0;

      if (mode === "set" || newBalanceCents !== undefined) {
        const target = Math.max(0, Math.round(Number(newBalanceCents ?? amountCents)));
        delta = target - account.balance;
        finalBalance = target;
      } else if (mode === "deposit") {
        const dep = Math.max(0, Math.round(Number(amountCents)));
        delta = dep;
        finalBalance = account.balance + dep;
      } else if (mode === "withdraw") {
        const wdr = Math.max(0, Math.round(Number(amountCents)));
        delta = -wdr;
        finalBalance = Math.max(0, account.balance - wdr);
      }

      if (delta !== 0) {
        await db.update(bankAccounts).set({ balance: finalBalance }).where(eq(bankAccounts.id, accountId));
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId,
          fromAccountId: delta < 0 ? accountId : null,
          toAccountId: delta > 0 ? accountId : null,
          type: delta > 0 ? 'deposit' : 'withdraw',
          amount: Math.abs(delta),
          description: description || `Manual Balance Adjustment (${delta > 0 ? '+' : ''}$${(delta/100).toFixed(2)})`,
          timestamp: new Date()
        });
      }

      return res.json({ success: true, newBalance: finalBalance, accountId });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: e.message || "Failed to adjust balance" });
    }
  });

banksRouter.delete("/api/banks/:bankId/accounts/:accountId", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const accs = await db.select().from(bankAccounts).where(eq(bankAccounts.id, req.params.accountId));
      const accName = accs.length > 0 ? accs[0].accountName : "unknown";

      await db.delete(bankAccounts).where(
        and(eq(bankAccounts.id, req.params.accountId), eq(bankAccounts.bankId, req.params.bankId))
      );

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: 'Operator',
        action: 'delete_account',
        details: `Deleted account: ${accName}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/clearinghouse", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { clearinghouseBalances, clearinghouseSettlements, banks, interBankTransfers } = await import("../../db/schema");
    const { eq, or, desc } = await import("drizzle-orm");
    try {
      // Ensure balance record exists
      let chb = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, req.params.bankId)).get();
      if (!chb) {
        chb = await db.insert(clearinghouseBalances).values({ bankId: req.params.bankId, balance: 0 }).returning().get();
      }

      const network = await db.select({
        id: banks.id,
        name: banks.name,
        balance: clearinghouseBalances.balance
      }).from(banks)
        .leftJoin(clearinghouseBalances, eq(banks.id, clearinghouseBalances.bankId))
        .where(eq(banks.status, "active"));

      const settlements = await db.select({
        id: clearinghouseSettlements.id,
        amount: clearinghouseSettlements.amount,
        status: clearinghouseSettlements.status,
        createdAt: clearinghouseSettlements.createdAt,
        fromBankId: clearinghouseSettlements.fromBankId,
        toBankId: clearinghouseSettlements.toBankId,
      }).from(clearinghouseSettlements)
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
        network: network.map(n => ({ ...n, balance: n.balance || 0 })),
        settlements,
        wires
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/clearinghouse/settle", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { clearinghouseBalances, clearinghouseSettlements } = await import("../../db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { toBankId, amount } = req.body;
      if (!toBankId || !amount || amount <= 0) return res.status(400).json({ error: "Invalid parameters" });

      // Create settlement record
      await db.insert(clearinghouseSettlements).values({
        id: uuidv4(),
        fromBankId: req.params.bankId,
        toBankId,
        amount,
        status: "paid",
        createdAt: new Date()
      });

      // From Bank is paying To Bank, so From Bank's debt decreases (balance increases), To Bank's debt increases (balance decreases)
      // Actually, if I send you 50k in cash, you now owe the network 50k more, and I owe 50k less.
      // So From Bank balance += amount
      // To Bank balance -= amount
      
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${req.params.bankId}, ${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance + ${amount}, last_settled = CURRENT_TIMESTAMP
      `);
      
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${toBankId}, -${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance - ${amount}, last_settled = CURRENT_TIMESTAMP
      `);

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
          // Deposit money to destination account
          const da = await db.select().from(bankAccounts).where(eq(bankAccounts.id, wire.toAccountId)).get();
          if (da) {
             await db.update(bankAccounts).set({ balance: da.balance + wire.amount }).where(eq(bankAccounts.id, da.id));
             
             await db.insert(transactions).values({
               id: uuidv4(),
               bankId: wire.toBankId,
               fromAccountId: null,
               toAccountId: da.id,
               type: "deposit",
               amount: wire.amount,
               description: `Approved Inbound Wire Transfer`,
               timestamp: new Date()
             });
          }
          await db.update(interBankTransfers).set({ status: 'completed', completedAt: new Date() }).where(eq(interBankTransfers.id, wire.id));
       } else if (action === 'reject') {
          // Refund source account
          const sa = await db.select().from(bankAccounts).where(eq(bankAccounts.id, wire.fromAccountId)).get();
          if (sa) {
             await db.update(bankAccounts).set({ balance: sa.balance + wire.amount }).where(eq(bankAccounts.id, sa.id));

             await db.insert(transactions).values({
               id: uuidv4(),
               bankId: wire.fromBankId,
               fromAccountId: null,
               toAccountId: sa.id,
               type: "deposit",
               amount: wire.amount,
               description: `Refund: Rejected Outbound Wire`,
               timestamp: new Date()
             });
          }
          await db.update(interBankTransfers).set({ status: 'rejected', completedAt: new Date() }).where(eq(interBankTransfers.id, wire.id));
       }

       res.json({ success: true });
     } catch(e) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
     }
  });

banksRouter.post("/api/banks/:bankId/wire", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, clearinghouseBalances } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { fromAccountId, toBankId, toAccountName, amount, description } = req.body;
      if (!fromAccountId || !toBankId || !toAccountName || !amount || amount <= 0) return res.status(400).json({ error: "Invalid params" });

      const fromAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!fromAccount) return res.status(404).json({ error: "Source account not found" });
      if (fromAccount.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      // 1. Deduct from sender
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${amount}` }).where(eq(bankAccounts.id, fromAccountId));
      
      // 2. Add to recipient (if we can find by name + bank ID)
      // In a real network, toAccountName might just be text, but we can try to resolve it.
      let actualToAccountId = toAccountName; // fallback to string
      const toAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, toBankId), eq(bankAccounts.accountName, toAccountName))).get();
      if (toAccount) {
         actualToAccountId = toAccount.id;
         await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${amount}` }).where(eq(bankAccounts.id, toAccount.id));
      }

      // 3. Update clearinghouse balances 
      // From Bank sends money to To Bank. So From Bank owes To Bank.
      // From Bank network balance -= amount
      // To Bank network balance += amount
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${req.params.bankId}, -${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance - ${amount}, last_settled = CURRENT_TIMESTAMP
      `);
      
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${toBankId}, ${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance + ${amount}, last_settled = CURRENT_TIMESTAMP
      `);

      // 4. Record transactions
      const ts = new Date();
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId,
        toAccountId: `ext_${toBankId}`,
        type: "wire_transfer",
        amount,
        description: description || `Wire to ${toAccountName}`,
        timestamp: ts
      });

      if (toAccount) {
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: toBankId,
          fromAccountId: `ext_${req.params.bankId}`,
          toAccountId: toAccount.id,
          type: "wire_transfer",
          amount,
          description: description || `Wire from ${fromAccount.accountName}`,
          timestamp: ts
        });
      }

      sendWebhook(req.params.bankId, `🌐 **Wire Transfer Sent**: $${(amount/100).toFixed(2)} routed to ${toAccountName}.`);
      sendWebhook(toBankId, `🌐 **Wire Transfer Received**: $${(amount/100).toFixed(2)} received into ${toAccountName}.`);

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/subscriptions/:subId/charge", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { subscriptions, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const sub = await db.select().from(subscriptions).where(and(eq(subscriptions.id, req.params.subId), eq(subscriptions.bankId, req.params.bankId))).get();
      if (!sub) return res.status(404).json({ error: "Sub not found" });

      const biller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.billerAccountId)).get();
      const customer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.customerAccountId)).get();

      if (!biller || !customer) return res.status(400).json({ error: "Accounts invalid" });
      if (customer.balance < sub.amount) return res.status(400).json({ error: "Customer has insufficient funds" });

      // Deduct customer
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${sub.amount}` }).where(eq(bankAccounts.id, customer.id));
      
      // Add biller
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${sub.amount}` }).where(eq(bankAccounts.id, biller.id));

      const ts = new Date();
      // Record transaction
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: customer.id,
        toAccountId: biller.id,
        type: "transfer",
        amount: sub.amount,
        description: `Subscription Charge: ${sub.description}`,
        timestamp: ts
      });

      // Advance next run date
      const nextRun = new Date(sub.nextRun);
      if (sub.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (sub.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

      await db.update(subscriptions).set({ nextRun }).where(eq(subscriptions.id, sub.id));

      res.json({ success: true, nextRun });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/payroll/:jobId/run", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { payrollJobs, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const job = await db.select().from(payrollJobs).where(and(eq(payrollJobs.id, req.params.jobId), eq(payrollJobs.bankId, req.params.bankId))).get();
      if (!job) return res.status(404).json({ error: "Job not found" });

      const employer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employerAccountId)).get();
      const employee = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employeeAccountId)).get();

      if (!employer || !employee) return res.status(400).json({ error: "Accounts invalid" });
      if (employer.balance < job.amount) return res.status(400).json({ error: "Employer has insufficient funds to run payroll" });

      // Deduct employer
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${job.amount}` }).where(eq(bankAccounts.id, employer.id));
      
      // Add employee
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${job.amount}` }).where(eq(bankAccounts.id, employee.id));

      const ts = new Date();
      // Record transaction
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: employer.id,
        toAccountId: employee.id,
        type: "transfer",
        amount: job.amount,
        description: `Automated Payroll Deposit`,
        timestamp: ts
      });

      // Advance next run date
      const nextRun = new Date(job.nextRun);
      if (job.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (job.frequency === 'biweekly') nextRun.setDate(nextRun.getDate() + 14);
      else if (job.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

      await db.update(payrollJobs).set({ nextRun }).where(eq(payrollJobs.id, job.id));

      res.json({ success: true, nextRun });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/treasury", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, vaultDeposits, loans, transactions } = await import("../../db/schema");
    const { eq, sum, and, desc, sql } = await import("drizzle-orm");

    try {
      const bId = req.params.bankId;

      // 1. Total Liabilities (Customer Deposits)
      // Base account deposits
      const accountSum = await db.select({ total: sum(bankAccounts.balance) })
        .from(bankAccounts).where(eq(bankAccounts.bankId, bId)).get();
      const totalAccountBalances = Number(accountSum?.total || 0);

      // Vault deposits
      const vaultSum = await db.select({ total: sum(vaultDeposits.amount) })
        .from(vaultDeposits).where(eq(vaultDeposits.bankId, bId)).get();
      const totalVaultBalances = Number(vaultSum?.total || 0);

      const totalDeposits = totalAccountBalances + totalVaultBalances;

      // 2. Total Assets (Active Loans outstanding)
      const loanSum = await db.select({ total: sum(loans.remainingAmount) })
        .from(loans).where(and(eq(loans.bankId, bId), eq(loans.status, "active"))).get();
      const totalLoans = Number(loanSum?.total || 0);

      // 3. P&L / Revenue (sum of fees collected, interest collected)
      // Usually represented by withdraw/transfer fees where toAccountId is null and type="fee"
      // or "interest"
      const revenueSum = await db.select({ total: sum(transactions.amount) })
        .from(transactions).where(
          and(
            eq(transactions.bankId, bId),
            sql`(${transactions.type} = 'fee' OR ${transactions.type} = 'interest_payment' OR ${transactions.type} = 'loan_payment')`,
            sql`${transactions.toAccountId} IS NULL`
          )
        ).get();
      const rawRevenue = Number(revenueSum?.total || 0);

      // Daily balances over last 7 days? Here we can just send the recent transactions to build a chart
      const recentTxs = await db.select()
        .from(transactions)
        .where(eq(transactions.bankId, bId))
        .orderBy(desc(transactions.timestamp))
        .limit(100);

      const dailyVolume = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0,0,0,0);
        return {
          date: d.toISOString().split('T')[0],
          inflow: 0,
          outflow: 0,
        };
      }).reverse();

      for (const tx of recentTxs) {
        const dStr = new Date(tx.timestamp).toISOString().split('T')[0];
        const day = dailyVolume.find(dv => dv.date === dStr);
        if (day) {
          if (tx.type === 'deposit') day.inflow += tx.amount;
          if (tx.type === 'withdraw' || tx.type === 'transfer') day.outflow += tx.amount;
        }
      }

      res.json({
        totalDeposits,
        totalLoans,
        estimatedRevenue: rawRevenue,
        dailyVolume,
        reserveRatio: totalDeposits > 0 ? (totalDeposits - totalLoans) / totalDeposits : 1, 
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows/:escrowId/fund", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "pending") return res.status(400).json({ error: "Escrow not pending" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      if (!buyer) return res.status(404).json({ error: "Buyer account not found" });
      if (buyer.balance < escrow.amount) return res.status(400).json({ error: "Insufficient funds" });

      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${escrow.amount}` }).where(eq(bankAccounts.id, buyer.id));
      await db.update(escrows).set({ status: "funded" }).where(eq(escrows.id, escrow.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: buyer.id,
        toAccountId: null,
        type: "withdraw",
        amount: escrow.amount,
        description: `Escrow Funded: ${escrow.description || escrow.id}`,
        timestamp: new Date()
      });

      res.json({ success: true, status: "funded" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows/:escrowId/release", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "funded") return res.status(400).json({ error: "Escrow not funded" });

      const seller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.sellerAccountId)).get();
      
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${escrow.amount}` }).where(eq(bankAccounts.id, seller!.id));
      await db.update(escrows).set({ status: "released" }).where(eq(escrows.id, escrow.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: seller!.id,
        type: "deposit",
        amount: escrow.amount,
        description: `Escrow Released: ${escrow.description || escrow.id}`,
        timestamp: new Date()
      });

      res.json({ success: true, status: "released" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/escrows/:escrowId/refund", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "funded") return res.status(400).json({ error: "Escrow not funded" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${escrow.amount}` }).where(eq(bankAccounts.id, buyer!.id));
      await db.update(escrows).set({ status: "refunded" }).where(eq(escrows.id, escrow.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: buyer!.id,
        type: "deposit",
        amount: escrow.amount,
        description: `Escrow Refunded: ${escrow.description || escrow.id}`,
        timestamp: new Date()
      });

      res.json({ success: true, status: "refunded" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
        interestRate: loans.interestRate,
        nextPaymentDate: loans.nextPaymentDate,
        purpose: loans.purpose,
        status: loans.status,
        contractUrl: loans.contractUrl,
        collateralDescription: loans.collateralDescription,
        collateralValue: loans.collateralValue,
        collateralStatus: loans.collateralStatus,
        lateFeeAmount: loans.lateFeeAmount,
        isDelinquent: loans.isDelinquent,
        missedPaymentsCount: loans.missedPaymentsCount,
        lastInterestAccrualAt: loans.lastInterestAccrualAt,
        lastPaymentAttemptAt: loans.lastPaymentAttemptAt,
        createdAt: loans.createdAt,
        mcUsername: bankCustomers.mcUsername,
      })
      .from(loans)
      .leftJoin(bankCustomers, and(eq(loans.discordId, bankCustomers.discordId), eq(loans.bankId, bankCustomers.bankId)))
      .where(eq(loans.bankId, req.params.bankId));
      res.json(bankLoans);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/loans", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { discordId, principalAmount, interestRate, depositAccountId, collateralDescription, collateralValue } = req.body;
      if (!discordId || !principalAmount || interestRate === undefined || !depositAccountId) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // Find the account to deposit the loan into
      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, depositAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Deposit account not found" });

      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 30); // First payment in 30 days

      const ts = new Date();

      // Give money
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${principalAmount}` }).where(eq(bankAccounts.id, depositAccountId));

      // Record transaction
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: depositAccountId,
        type: "deposit",
        amount: principalAmount,
        description: `Loan Disbursement (Principal: $${(principalAmount/100).toFixed(2)})`,
        timestamp: ts
      });

      // Create loan
      const newLoanId = uuidv4();
      const { bankSettings, banks } = await import("../../db/schema");
      const bSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId)).get();
      const bRecord = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();

      let contractUrl = req.body.contractUrl || null;
      if (!contractUrl && bSettings?.enableGoogleDocsContracts) {
        const { generateContractUrl } = await import("../../lib/google_docs_contracts");
        contractUrl = generateContractUrl(bSettings.googleDocsLoanTemplateUrl, {
          bankName: bRecord?.name || "Slate Bank",
          clientDiscordId: discordId,
          contractType: 'loan',
          contractId: newLoanId,
          amount: principalAmount,
          interestRate,
          termDays: 30
        });
      }

      const colVal = collateralValue ? Math.round(parseFloat(collateralValue) * 100) : null;
      const colStatus = collateralDescription ? "pledged" : "none";

      const result = await db.insert(loans).values({
        id: newLoanId,
        bankId: req.params.bankId,
        discordId,
        accountId: depositAccountId,
        principalAmount,
        remainingAmount: principalAmount,
        interestRate,
        nextPaymentDate,
        purpose: req.body.purpose || null,
        collateralDescription: collateralDescription || null,
        collateralValue: colVal,
        collateralStatus: colStatus,
        status: "active",
        contractUrl,
        createdAt: ts
      }).returning().get();

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/loans/process-due", requireBankStaff, async (req: express.Request, res: express.Response) => {
    try {
      const { processDueLoanRepayments } = await import("../loan_processor");
      const result = await processDueLoanRepayments(req.params.bankId);
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

banksRouter.put("/api/banks/:bankId/loans/:loanId/status", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { status } = req.body;
      const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
      if (!loan || loan.bankId !== req.params.bankId) return res.status(404).json({ error: "Loan not found" });

      if (loan.status === "pending" && status === "approved") {
        const ts = new Date();
        await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${loan.principalAmount}` }).where(eq(bankAccounts.id, loan.accountId));
        await db.insert(transactions).values({
            id: uuidv4(),
            bankId: loan.bankId,
            fromAccountId: null,
            toAccountId: loan.accountId,
            type: "deposit",
            amount: loan.principalAmount,
            description: `Loan Disbursement (Principal: $${(loan.principalAmount/100).toFixed(2)})`,
            timestamp: ts
        });
        await db.update(loans).set({ status: "active" }).where(eq(loans.id, req.params.loanId));
      } else {
        await db.update(loans).set({ status }).where(eq(loans.id, req.params.loanId));
      }
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.get("/api/banks/:bankId/credit-applications", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { creditApplications } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const apps = await db.select().from(creditApplications).where(eq(creditApplications.bankId, req.params.bankId));
      res.json(apps);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
            type: "credit",
            creditLimit: capp.requestedLimit,
            creditUsed: 0,
            apr: 1999, // default
            createdAt: new Date(),
          });
      }
      
      await db.update(creditApplications).set({ status }).where(eq(creditApplications.id, req.params.appId));
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

banksRouter.post("/api/banks/:bankId/loans/:loanId/pay", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { accountId, amount } = req.body;
      if (!accountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
      if (!loan) return res.status(404).json({ error: "Loan not found" });
      if (loan.status === "paid") return res.status(400).json({ error: "Loan already paid off" });

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });
      if (acc.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      const newRemaining = Math.max(0, loan.remainingAmount - amount);
      const isPaid = newRemaining === 0;

      // Deduct from account
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${amount}` }).where(eq(bankAccounts.id, accountId));

      // Record transaction
      const ts = new Date();
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: accountId,
        toAccountId: null,
        type: "withdraw",
        amount,
        description: `Loan Payment${isPaid ? ' (Final}' : ''}`,
        timestamp: ts
      });

      // Update loan
      await db.update(loans).set({ 
        remainingAmount: newRemaining,
        status: isPaid ? "paid" : "active",
        nextPaymentDate: isPaid ? loan.nextPaymentDate : sql`datetime(${loan.nextPaymentDate.toISOString()}, '+30 days')` // simplified, push back next payment by 30 days
      }).where(eq(loans.id, loan.id));

      res.json({ success: true, newRemaining, isPaid });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/vaults", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { vaultDeposits, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { accountId, amount, durationDays, interestRate } = req.body;
      if (!accountId || !amount || !durationDays || interestRate === undefined) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });
      if (acc.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      // Deduct from account
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${amount}` }).where(eq(bankAccounts.id, accountId));

      // Record transaction
      const ts = new Date();
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: accountId,
        toAccountId: null,
        type: "withdraw",
        amount,
        description: `Deposit to Vault (${durationDays} days @ ${(interestRate/100).toFixed(2)}%)`,
        timestamp: ts
      });

      // Create Vault
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/vaults/:vaultId/release", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { vaultDeposits, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const vault = await db.select().from(vaultDeposits).where(and(eq(vaultDeposits.id, req.params.vaultId), eq(vaultDeposits.bankId, req.params.bankId))).get();
      if (!vault) return res.status(404).json({ error: "Vault not found" });
      if (vault.status !== "locked") return res.status(400).json({ error: "Vault is not locked" });

      const now = new Date();
      const isEarly = now < vault.lockedUntil;
      
      let payout = vault.amount;
      if (!isEarly) {
        // Calculate interest (simple interest for now)
        const daysLocked = Math.floor((now.getTime() - vault.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const interestAmount = Math.floor((vault.amount * (vault.interestRate / 10000)) * (daysLocked / 365));
        payout += interestAmount;
      } else {
        // Early withdrawal penalty? Let's just give back principal for now.
      }

      await db.update(vaultDeposits).set({ status: isEarly ? "early_withdrawn" : "released" }).where(eq(vaultDeposits.id, vault.id));
      
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${payout}` }).where(eq(bankAccounts.id, vault.accountId));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: vault.accountId,
        type: "deposit",
        amount: payout,
        description: isEarly ? "Early Vault Withdrawal (No Interest)" : "Vault Maturity Release",
        timestamp: now
      });

      res.json({ success: true, payout, isEarly });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/cards", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
       const bankCards = await db.select({
         id: cards.id,
         cardNumber: cards.cardNumber,
         expiryDate: cards.expiryDate,
         isLocked: cards.isLocked,
         type: cards.type,
         createdAt: cards.createdAt,
         accountId: cards.accountId,
         accountName: bankAccounts.accountName,
         ownerDiscordId: bankAccounts.ownerDiscordId,
       })
       .from(cards)
       .innerJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
       .where(eq(cards.bankId, req.params.bankId));
       
       res.json(bankCards);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/cards", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
       const { accountId, type } = req.body;
       if (!accountId || !type) return res.status(400).json({ error: "Missing fields" });
       
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
         type,
         isLocked: false,
         createdAt: new Date(),
       }).returning().get();

       res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/developer", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      let bank = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      if (!bank.apiKey || !bank.webhookSecret) {
         const newApi = "sk_live_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
         const newWh = "whsec_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
         bank = await db.update(banks).set({ apiKey: newApi, webhookSecret: newWh }).where(eq(banks.id, req.params.bankId)).returning().get();
      }

      res.json({ apiKey: bank.apiKey, webhookSecret: bank.webhookSecret });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update webhook url" });
    }
  });

banksRouter.post("/api/banks/:bankId/developer/roll", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
       const newApi = "sk_live_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
       const newWh = "whsec_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
       const bank = await db.update(banks)
         .set({ apiKey: newApi, webhookSecret: newWh })
         .where(eq(banks.id, req.params.bankId))
         .returning().get();
       if (!bank) return res.status(404).json({ error: "Bank not found" });
       res.json({ apiKey: bank.apiKey, webhookSecret: bank.webhookSecret });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/transactions/sync", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, banks } = await import("../../db/schema");
    const { eq, and, or, inArray } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
      let totalAdded = 0;
      let accountsUpdated = 0;

      // 1. If CityCorp configured, attempt external sync
      if (bank.corpApiKey && bank.corpId !== null && bank.corpApiUuid !== null) {
        try {
          const { CityCorpClient } = await import("../../lib/citycorp_api");
          const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);

          for (const account of accounts) {
             const accountDetails = await client.getAccountDetails(account.accountName);
             if (accountDetails && accountDetails.account) {
                const remoteBalance = Math.round(Number(accountDetails.account.balance) * 100);
                if (account.balance !== remoteBalance) {
                   await db.update(bankAccounts).set({ balance: remoteBalance }).where(eq(bankAccounts.id, account.id));
                   accountsUpdated++;
                }
             }

             const remoteTxs = await client.getAllAccountTransactions(account.accountName);
             if (remoteTxs && Array.isArray(remoteTxs) && remoteTxs.length > 0) {
                const existingTxs = await db.select().from(transactions).where(
                   and(
                     eq(transactions.bankId, bankId), 
                     or(eq(transactions.toAccountId, account.id), eq(transactions.fromAccountId, account.id))
                   )
                );
                const existingTxIds = new Set(existingTxs.map(t => t.id));
                const existingTxKeys = new Set(existingTxs.map(t => `${t.type}_${t.amount}_${t.description}`));
                
                for (const tx of remoteTxs) {
                   let txAmount = tx.amount || tx.value || 0;
                   if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
                   
                   const isOutflow = tx.type === 'withdraw' || tx.type === 'transfer_out' || txAmount < 0;
                   const amountCents = Math.abs(Math.round(Number(txAmount) * 100));
                   const desc = tx.description || tx.memo || "Synced transaction";
                   const txTypeKey = `${isOutflow ? 'withdraw' : 'deposit'}_${amountCents}_${desc}`;
                   
                   if (!existingTxIds.has(tx.id) && !existingTxKeys.has(txTypeKey)) {
                      await db.insert(transactions).values({
                         id: tx.id || uuidv4(),
                         bankId: bankId,
                         fromAccountId: isOutflow ? account.id : null,
                         toAccountId: !isOutflow ? account.id : null,
                         type: isOutflow ? 'withdraw' : 'deposit',
                         amount: amountCents,
                         description: desc,
                         timestamp: new Date(tx.timestamp || tx.date || tx.created_at || Date.now())
                      });
                      totalAdded++;
                      existingTxKeys.add(txTypeKey);
                   }
                }
             }
          }
        } catch (e) {
          console.error("CityCorp sync error in batch:", e);
        }
      }

      // 2. Local Ledger Recalculation for accounts
      for (const account of accounts) {
         let accTxs = await db.select().from(transactions).where(
           or(eq(transactions.toAccountId, account.id), eq(transactions.fromAccountId, account.id))
         );

         // Clean up duplicate "Initial Account Deposit / Ledger Sync" entries from past bug
         const dupSyncTxs = accTxs.filter(t => 
           t.description && (
             t.description.includes("Initial Account Funding") || 
             t.description.includes("Initial Account Deposit") ||
             t.description.includes("Ledger Sync")
           )
         );

         if (dupSyncTxs.length > 1) {
           dupSyncTxs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
           const duplicates = dupSyncTxs.slice(1);
           const dupIds = duplicates.map(d => d.id);
           if (dupIds.length > 0) {
             await db.delete(transactions).where(inArray(transactions.id, dupIds));
             accTxs = await db.select().from(transactions).where(
               or(eq(transactions.toAccountId, account.id), eq(transactions.fromAccountId, account.id))
             );
           }
         }

         if (accTxs.length > 0) {
           let net = 0;
           for (const t of accTxs) {
             if (t.toAccountId === account.id) net += t.amount;
             if (t.fromAccountId === account.id) net -= t.amount;
           }
           if (account.balance !== net) {
             await db.update(bankAccounts).set({ balance: net }).where(eq(bankAccounts.id, account.id));
             accountsUpdated++;
           }
         } else if (account.balance > 0) {
           await db.insert(transactions).values({
             id: uuidv4(),
             bankId: bankId,
             toAccountId: account.id,
             fromAccountId: null,
             type: 'deposit',
             amount: account.balance,
             description: 'Opening Account Balance',
             timestamp: new Date(account.createdAt || Date.now())
           });
         }
      }

      res.json({ success: true, addedTransactions: totalAdded, accountsUpdated, totalAccounts: accounts.length });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to sync transactions" });
    }
  });

banksRouter.get("/api/banks/:bankId/transactions", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions } = await import("../../db/schema");
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
       res.json(bankTxs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
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

      const { type, accountName, amount, description, toAccountName } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      // Find the Vault Cash system account for this bank
      const sysAccountRes = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bank.id), eq(bankAccounts.systemCategory, 'vault_cash'))).limit(1);
      const vaultCashAccount = sysAccountRes.length > 0 ? sysAccountRes[0] : null;

      // Identify source account ID for internal DB
      const accountRes = await db.select().from(bankAccounts).where(eq(bankAccounts.accountName, accountName)).limit(1);
      if (accountRes.length === 0) return res.status(404).json({ error: "Source account not found locally" });
      const account = accountRes[0];

      let toAccountRes: any[] = [];
      if (type === 'transfer' && toAccountName) {
        toAccountRes = await db.select().from(bankAccounts).where(eq(bankAccounts.accountName, toAccountName)).limit(1);
        if (toAccountRes.length === 0) return res.status(404).json({ error: "Destination account not found locally" });
      }

      // Execute on CityCorp if configured
      if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
        const { CityCorpClient } = await import("../../lib/citycorp_api");
        const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
        
        let clientRes;
        if (type === 'deposit') {
          clientRes = await client.deposit(accountName, parsedAmount / 100);
        } else if (type === 'withdraw') {
          clientRes = await client.withdraw(accountName, parsedAmount / 100);
        } else if (type === 'transfer') {
          // Withdraw from source, deposit to target via CityCorp logic internally
          if (!toAccountName) return res.status(400).json({ error: "Missing destination account" });
          // Note: Real API doesn't have an atomic transfer endpoint yet, so we emulate it.
          const wRes = await client.withdraw(accountName, parsedAmount / 100);
          if (!wRes.success) return res.status(400).json({ error: `Withdraw failed: ${wRes.message}` });
          
          clientRes = await client.deposit(toAccountName, parsedAmount / 100);
          if (!clientRes.success) {
            // Rollback the withdrawal on failure
            await client.deposit(accountName, parsedAmount / 100);
            return res.status(400).json({ error: `Deposit to target failed: ${clientRes.message}` });
          }
        }
        
        if (clientRes && !clientRes.success) {
          return res.status(400).json({ error: `CityCorp API Error: ${clientRes.message}` });
        }
      }

      // Enforce Double Entry Ledger Rules
      let finalFromId = null;
      let finalToId = null;

      if (type === 'deposit') {
         finalFromId = vaultCashAccount ? vaultCashAccount.id : null;
         finalToId = account.id;
      } else if (type === 'withdraw') {
         finalFromId = account.id;
         finalToId = vaultCashAccount ? vaultCashAccount.id : null;
      } else if (type === 'transfer') {
         finalFromId = account.id;
         finalToId = toAccountRes[0].id;
      }

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

      const { auditLogs } = await import("../../db/schema");

      await db.transaction(async (txDb) => {
        await txDb.insert(transactions).values(txRecord);

        // Adjust balances in local DB (Double Entry)
        if (finalFromId) {
           const fromAccRes = await txDb.select().from(bankAccounts).where(eq(bankAccounts.id, finalFromId)).limit(1);
           if (fromAccRes.length > 0) {
              await txDb.update(bankAccounts).set({ balance: fromAccRes[0].balance - parsedAmount }).where(eq(bankAccounts.id, finalFromId));
           }
        }
        if (finalToId) {
           const toAccRes = await txDb.select().from(bankAccounts).where(eq(bankAccounts.id, finalToId)).limit(1);
           if (toAccRes.length > 0) {
              await txDb.update(bankAccounts).set({ balance: toAccRes[0].balance + parsedAmount }).where(eq(bankAccounts.id, finalToId));
           }
        }

        // Add audit log
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
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, auditLogs } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { type, amount, description } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
      
      const isDeposit = type === 'deposit';

      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      if (accounts.length === 0) return res.status(400).json({ error: "No accounts found" });

      // We do this locally instead of hammering the CityCorp API. 
      for (const account of accounts) {
         await db.update(bankAccounts)
           .set({ balance: isDeposit ? account.balance + parsedAmount : Math.max(0, account.balance - parsedAmount) })
           .where(eq(bankAccounts.id, account.id));
         
         await db.insert(transactions).values({
           id: uuidv4(),
           bankId: req.params.bankId,
           fromAccountId: account.id,
           toAccountId: null,
           type: isDeposit ? 'deposit' : 'withdraw',
           amount: isDeposit ? parsedAmount : Math.min(account.balance, parsedAmount),
           description: description || `Mass ${type}`,
           timestamp: new Date()
         });
      }

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: req.params.bankId,
         userDiscordId: 'Operator',
         action: `mass_${type}`,
         details: `Applied mass ${type} of $${(parsedAmount/100).toFixed(2)} to ${accounts.length} accounts`,
         timestamp: new Date()
      });

      res.json({ success: true, affectedCount: accounts.length });
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
    const { bankAccounts, auditLogs, loans, subscriptions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      let notes = [];

      // 1. Process Loans (accrue interest)
      const openLoans = await db.select().from(loans).where(and(eq(loans.bankId, bId), eq(loans.status, 'active')));
      let loansAccrued = 0;
      for (const loan of openLoans) {
        if (loan.interestRate && loan.principalAmount) {
          const dailyInterest = Math.round((loan.principalAmount * (loan.interestRate / 100)) / 365);
          if (dailyInterest > 0) {
            await db.update(loans)
              .set({ remainingAmount: loan.remainingAmount + dailyInterest })
              .where(eq(loans.id, loan.id));
            loansAccrued++;
          }
        }
      }
      if (loansAccrued > 0) notes.push(`Accrued interest on ${loansAccrued} loans.`);

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

      if (!dbBase64 && !dbSql) {
        return res.status(400).json({ error: "Please upload a valid SQLite .db file or provide a SQL dump script." });
      }

      tempPath = path.join(os.tmpdir(), `sqlite_import_${uuidv4()}.db`);

      if (dbBase64) {
        const buffer = Buffer.from(dbBase64, "base64");
        fs.writeFileSync(tempPath, buffer);
        legacyDb = new Database(tempPath, { readonly: true });
      } else if (dbSql) {
        legacyDb = new Database(tempPath);
        legacyDb.exec(dbSql);
      }

      const tableRows = legacyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tableRows.map((t: any) => t.name.toLowerCase());

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
    const { db } = await import("../../db/index");
    const { 
      bankCustomers, 
      bankAccounts, 
      transactions, 
      loans, 
      escrows, 
      vaultDeposits, 
      cards, 
      payrollJobs, 
      subscriptions, 
      invoices, 
      supportTickets, 
      auditLogs 
    } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;

      // 1. Purge all existing data for this bank to make it a perfect reset
      await db.delete(transactions).where(eq(transactions.bankId, bId));
      await db.delete(vaultDeposits).where(eq(vaultDeposits.bankId, bId));
      await db.delete(cards).where(eq(cards.bankId, bId));
      await db.delete(payrollJobs).where(eq(payrollJobs.bankId, bId));
      await db.delete(subscriptions).where(eq(subscriptions.bankId, bId));
      await db.delete(invoices).where(eq(invoices.bankId, bId));
      await db.delete(loans).where(eq(loans.bankId, bId));
      await db.delete(escrows).where(eq(escrows.bankId, bId));
      await db.delete(supportTickets).where(eq(supportTickets.bankId, bId));
      await db.delete(bankAccounts).where(eq(bankAccounts.bankId, bId));
      await db.delete(bankCustomers).where(eq(bankCustomers.bankId, bId));
      await db.delete(auditLogs).where(eq(auditLogs.bankId, bId));

      // 2. Define Demo Customers
      const demoUsers = [
        { discordId: "1048576", mcUsername: "vance_charles", mcUuid: "e2920fca-31d0-4fdf-9730-805fc48f574d", notes: "Whitelabel tester & active roleplayer" },
        { discordId: "2097152", mcUsername: "clara_mendez", mcUuid: "e502cfa1-77df-482f-897b-607ef89dc74f", notes: "Real-estate developer Clara's Holdings" },
        { discordId: "3145728", mcUsername: "marcus_oak", mcUuid: "fa925c7e-85a9-4675-9273-df27d530f9a2", notes: "CEO of Oak Lumber Corp" },
        { discordId: "4194304", mcUsername: "sarah_connor", mcUuid: "858a74e5-9e67-4d92-80f0-c515a8053678", notes: "Tactical defense consultant" },
        { discordId: "5242880", mcUsername: "john_doe", mcUuid: "fc530ef2-5b96-4a4b-9705-5cae60eb1dfa", notes: "High net-worth asset investor" },
      ];

      for (const u of demoUsers) {
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId: bId,
          discordId: u.discordId,
          kycStatus: "approved",
          mcUuid: u.mcUuid,
          mcUsername: u.mcUsername,
          notes: u.notes,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        });
      }

      // 3. Define and Insert Bank Accounts
      const accountsToCreate = [
        { id: "acc_vance_checking", ownerDiscordId: "1048576", accountName: "Main Checking", accountType: "personal", balance: 1425000 },
        { id: "acc_vance_savings", ownerDiscordId: "1048576", accountName: "High-Yield Vault", accountType: "personal", balance: 7500000 },
        { id: "acc_vance_escrow", ownerDiscordId: "1048576", accountName: "Onyx Escrow Buffer", accountType: "business", balance: 500000 },
        
        { id: "acc_clara_checking", ownerDiscordId: "2097152", accountName: "Standard Checking", accountType: "personal", balance: 234050 },
        { id: "acc_clara_savings", ownerDiscordId: "2097152", accountName: "Emerald Savings", accountType: "personal", balance: 1280000 },
        
        { id: "acc_marcus_checking", ownerDiscordId: "3145728", accountName: "Oak Lumber Corp", accountType: "business", balance: 18500000 },
        { id: "acc_marcus_payroll", ownerDiscordId: "3145728", accountName: "Payroll Clearing", accountType: "payroll", balance: 4500000 },
        
        { id: "acc_sarah_checking", ownerDiscordId: "4194304", accountName: "Tactical Checking", accountType: "personal", balance: 85025 },
        
        { id: "acc_john_savings", ownerDiscordId: "5242880", accountName: "Savings Portfolio", accountType: "personal", balance: 15000000 }
      ];

      for (const acc of accountsToCreate) {
        await db.insert(bankAccounts).values({
          id: acc.id,
          bankId: bId,
          ownerDiscordId: acc.ownerDiscordId,
          accountName: acc.accountName,
          accountType: acc.accountType,
          balance: acc.balance,
          isActive: true,
          createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
        });
      }

      // 4. Seeding historical Transactions
      const demoTransactions = [
        { from: "acc_vance_checking", to: "acc_clara_checking", amount: 125000, type: "transfer", desc: "Contractor design services", daysAgo: 20 },
        { from: null, to: "acc_marcus_checking", amount: 2500000, type: "deposit", desc: "Wholesale Lumber Invoice #884", daysAgo: 18 },
        { from: "acc_sarah_checking", to: null, amount: 50000, type: "withdraw", desc: "Counter Cash Withdrawal", daysAgo: 15 },
        { from: "acc_vance_checking", to: "acc_marcus_checking", amount: 1500, type: "transfer", desc: "Weekly Planters Subscription Charge", daysAgo: 12 },
        { from: null, to: "acc_marcus_checking", amount: 350000, type: "onyx_payment", desc: "B2B Payment Gateway Settlement", daysAgo: 10 },
        { from: null, to: "acc_john_savings", amount: 15000000, type: "deposit", desc: "Initial Portfolio Capital Injection", daysAgo: 9 },
        { from: "acc_marcus_payroll", to: "acc_vance_checking", amount: 240000, type: "transfer", desc: "Biweekly Salary - Vance Charles", daysAgo: 5 },
        { from: "acc_vance_checking", to: "acc_marcus_checking", amount: 5000, type: "transfer", desc: "Store order purchase", daysAgo: 3 },
        { from: null, to: "acc_vance_checking", amount: 200000, type: "deposit", desc: "Gold ingot sales to game trade", daysAgo: 2 },
        { from: "acc_clara_checking", to: null, amount: 20000, type: "withdraw", desc: "Cash withdrawal for local vendor", daysAgo: 1 }
      ];

      for (const tx of demoTransactions) {
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: bId,
          fromAccountId: tx.from,
          toAccountId: tx.to,
          amount: tx.amount,
          type: tx.type,
          description: tx.desc,
          timestamp: new Date(Date.now() - tx.daysAgo * 24 * 60 * 60 * 1000)
        });
      }

      // 5. Seeding Loans (active & pending)
      await db.insert(loans).values({
        id: "loan_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "1048576",
        accountId: "acc_vance_checking",
        principalAmount: 1500000,
        remainingAmount: 1245000,
        interestRate: 550, // 5.5%
        nextPaymentDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        purpose: "Vehicle Acquisition - Obsidian Rover SUV",
        status: "active",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      });

      await db.insert(loans).values({
        id: "loan_clara_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "2097152",
        accountId: "acc_clara_checking",
        principalAmount: 500000,
        remainingAmount: 500000,
        interestRate: 800, // 8.0%
        nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        purpose: "Office Upgrade & High-speed Terminal",
        status: "pending",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      });

      // 6. Seeding vault deposits (locked savings)
      await db.insert(vaultDeposits).values({
        id: "vault_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        accountId: "acc_vance_savings",
        amount: 2000000,
        lockedUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        interestRate: 450, // 4.5%
        status: "locked",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      });

      // 7. Seeding cards (debit and credit)
      await db.insert(cards).values({
        id: "card_vance_debit_" + uuidv4().slice(0, 8),
        bankId: bId,
        accountId: "acc_vance_checking",
        cardNumber: "4000123456789010",
        cvv: "382",
        expiryDate: "12/30",
        isLocked: false,
        type: "debit",
        createdAt: new Date()
      });

      await db.insert(cards).values({
        id: "card_clara_credit_" + uuidv4().slice(0, 8),
        bankId: bId,
        accountId: "acc_clara_checking",
        cardNumber: "4111222233334444",
        cvv: "901",
        expiryDate: "08/29",
        isLocked: false,
        type: "credit",
        creditLimit: 500000,
        creditUsed: 124050,
        apr: 1800, // 18%
        minimumPayment: 5000,
        nextPaymentDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      });

      // 8. Seeding payroll jobs
      await db.insert(payrollJobs).values({
        id: "payroll_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        employerAccountId: "acc_marcus_checking",
        employeeAccountId: "acc_vance_checking",
        amount: 240000,
        frequency: "biweekly",
        nextRun: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date()
      });

      // 9. Seeding subscriptions
      await db.insert(subscriptions).values({
        id: "sub_vance_marcus_" + uuidv4().slice(0, 8),
        bankId: bId,
        billerAccountId: "acc_marcus_checking",
        customerAccountId: "acc_vance_checking",
        amount: 4999,
        frequency: "monthly",
        nextRun: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        isActive: true,
        description: "Oak Lumber VIP Club Host Tier 2",
        createdAt: new Date()
      });

      // 10. Seeding invoices
      await db.insert(invoices).values({
        id: "invoice_marcus_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        billerAccountId: "acc_marcus_checking",
        customerAccountId: "acc_vance_checking",
        amount: 150000,
        description: "Lumber Supply Delivery for Estate",
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        status: "paid",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      });

      await db.insert(invoices).values({
        id: "invoice_marcus_clara_" + uuidv4().slice(0, 8),
        bankId: bId,
        billerAccountId: "acc_marcus_checking",
        customerAccountId: "acc_clara_checking",
        amount: 45000,
        description: "Consulting and Site Surveys",
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        status: "pending",
        createdAt: new Date()
      });

      // 11. Seeding support tickets
      await db.insert(supportTickets).values({
        id: "ticket_marcus_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "3145728",
        subject: "Requesting credit limit expansion for lumber corp operations",
        status: "open",
        createdAt: new Date()
      });

      await db.insert(supportTickets).values({
        id: "ticket_clara_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "2097152",
        subject: "Question about credit card apr compounding schedule",
        status: "open",
        createdAt: new Date()
      });

      // 12. Seeding audit logs
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: `seed_demo`,
        details: `Populated full suite of realistic demo roleplay data (5 customers, 9 accounts, 10 transactions, active loans, cards, payroll, subscriptions, and support tickets)`,
        timestamp: new Date()
      });

      res.json({ success: true, message: "Pristine demo data successfully populated." });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error seeding demo data" });
    }
  });

banksRouter.get("/api/banks/:bankId/compliance/flagged", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const data = await db.select().from(transactions).where(and(eq(transactions.bankId, req.params.bankId), eq(transactions.isFlagged, true)));
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/compliance/flagged/:txId/resolve", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.update(transactions).set({ isFlagged: false }).where(eq(transactions.id, req.params.txId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.get("/api/banks/:bankId/compliance/frozen", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const data = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.isFrozen, true)));
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

banksRouter.post("/api/banks/:bankId/compliance/frozen/:accId/unfreeze", requireBankStaff, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.update(bankAccounts).set({ isFrozen: false }).where(eq(bankAccounts.id, req.params.accId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });
