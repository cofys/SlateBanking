import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import { buildCityCorpAuthUrl } from "../../lib/citycorp_api.js";
import { getUserCandidateIdentifiers, isUserAccountOwnerOrMember, isUserStaffOrGlobalAdmin } from "../userResolver.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const portalRouter = express.Router();

async function isUserStaffOrAdmin(req: express.Request, bankId: string): Promise<boolean> {
  const result = await isUserStaffOrGlobalAdmin(req, bankId);
  return result.isStaff;
}

portalRouter.get("/api/portal/:bankId/oauth/url", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bankId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      if (!bank.cityCorpAppId) {
        return res.status(400).json({ error: "CityCorp OAuth is not configured for this bank" });
      }

      let origin = process.env.APP_URL || "http://localhost:3000";
      if (origin.endsWith("/")) origin = origin.slice(0, -1);
      let bankCustomDomain = bank.customDomain ? `https://${bank.customDomain}` : origin;
      const redirectUri = `${bankCustomDomain}/api/portal/${bankId}/oauth/callback`;
      const { v4: uuidv4 } = await import("uuid");
      const nonce = uuidv4();
      res.cookie('oauth_nonce', nonce, { maxAge: 10 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
      const state = encodeURIComponent(JSON.stringify({
        bankId,
        discordId: (req as any).user.discordId,
        nonce
      }));

      const authUrl = buildCityCorpAuthUrl(bank, redirectUri, state);
      res.json({ url: authUrl });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

portalRouter.get("/api/portal/:bankId/oauth/callback", async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankCustomers, auditLogs } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const code = (req.query.client_secret || req.query.code) as string;
      const stateStr = req.query.state as string;

      const expectedNonce = req.cookies?.oauth_nonce;
      res.clearCookie('oauth_nonce');
      if (req.query.error) { return res.status(400).send(`CityCorp OAuth Error: ${req.query.error} - ${req.query.error_description}`); }
    if (!code || !stateStr) {
        return res.status(400).send(`Missing code or state. URL: ${req.originalUrl}`);
      }

      const parsedState = JSON.parse(decodeURIComponent(stateStr));
      if (!parsedState || !expectedNonce || parsedState.nonce !== expectedNonce) {
          return res.status(400).send("Invalid OAuth state / nonce. Please try again.");
      }
      const discordId = parsedState.discordId;

      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank || !bank.cityCorpAppId || !bank.cityCorpAppSecret) {
        return res.status(400).send("Bank CityCorp OAuth credentials are not configured");
      }

      const bodyParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_secret: code,
        app_id: bank.cityCorpAppId,
        token: bank.cityCorpAppSecret
      });

      console.log("Exchanging CityCorp OAuth code for token with body:", bodyParams.toString());
      const tokenResponse = await fetch("https://dashboard.cityrp.org/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString()
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error("CityCorp Token exchange failed:", errText);
        return res.status(400).send(`Failed to exchange token with CityCorp: ${errText}`);
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.token;
      const minecraftUuid = tokenData.minecraft_uuid;

      if (!token || !minecraftUuid) {
        return res.status(400).send("CityCorp returned an invalid token response");
      }

      const authHeader = 'Basic ' + Buffer.from(`${minecraftUuid}:${token}`).toString('base64');
      console.log("Fetching player info from CityCorp...");
      const playerRes = await fetch("https://api.cityrp.org/player", {
        headers: { "Authorization": authHeader, "User-Agent": "SlateBankBot/1.0" }
      });

      let mcUsername = "Citizen";
      if (playerRes.ok) {
        const playerData = await playerRes.json();
        mcUsername = playerData.username || playerData.name || mcUsername;
        console.log(`Successfully fetched player name from CityCorp: ${mcUsername}`);
      } else {
        console.warn(`Could not fetch player name from CityCorp API, falling back to: ${mcUsername}`);
      }

      const existing = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
      ).limit(1);

      if (existing.length > 0) {
        await db.update(bankCustomers).set({
          mcUuid: minecraftUuid,
          mcUsername: mcUsername,
          cityCorpToken: token,
          kycStatus: "approved"
        }).where(and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId)));
      } else {
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId: bankId,
          discordId: discordId,
          kycStatus: "approved",
          mcUuid: minecraftUuid,
          mcUsername: mcUsername,
          cityCorpToken: token,
          notes: "Profile verified via whitelabel CityCorp OAuth Gateway",
          createdAt: new Date()
        });
      }

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bankId,
        userDiscordId: discordId,
        action: "profile_validated",
        details: `Validated whitelabeled CityCorp profile. Linked Minecraft UUID: ${minecraftUuid}, Username: ${mcUsername}`,
        timestamp: new Date()
      });

      res.redirect(`/portal/${bankId}?oauth=success&username=${encodeURIComponent(mcUsername)}`);
    } catch (e: any) {
      console.error("CityCorp OAuth Callback Exception:", e);
      res.status(500).send(`Internal error in CityCorp OAuth Callback: ${e.message}`);
    }
  });

portalRouter.get("/api/portal/:bankId/info", async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankSettings } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bank = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bank.id)).get();
      
      const safeBank = {
        id: bank.id,
        name: bank.name,
        guildId: bank.guildId,
        discordClientId: bank.discordClientId,
        corpId: bank.corpId,
        cityCorpAppId: bank.cityCorpAppId,
        cityCorpAuthUrl: bank.cityCorpAuthUrl,
        customDomain: bank.customDomain,
        brandingColor: bank.brandingColor,
        logoUrl: bank.logoUrl,
        status: bank.status,
        plan: bank.plan,
        billingStatus: bank.billingStatus,
        platformFeePercent: bank.platformFeePercent,
        createdAt: bank.createdAt,
        maintenanceMode: (bank as any).maintenanceMode,
      };

      res.json({ ...safeBank, settings });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error", stack: e.stack });
    }
  });

portalRouter.get("/api/portal/:bankId/lookup", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankAccounts, transactions, invoices, cards, bankSettings, bankCustomers, loans, accountMembers } = await import("../../db/schema");
    const { eq, and, or, desc, inArray } = await import("drizzle-orm");

    try {
      const bankId = req.params.bankId;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);
      if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

      const primaryId = candidateIds[0];

      let customer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, bankId),
          or(
            inArray(bankCustomers.discordId, candidateIds),
            inArray(bankCustomers.linkedDiscordId, candidateIds),
            inArray(bankCustomers.mcUsername, candidateIds)
          )
        )
      ).get();

      const decodedUser = (req as any).user;
      const isStaff = await isUserStaffOrAdmin(req, bankId);

      // 1. Owned accounts
      const ownedAccounts = await db.select({
        id: bankAccounts.id,
        bankId: bankAccounts.bankId,
        bankName: banks.name,
        accountName: bankAccounts.accountName,
        type: bankAccounts.accountType,
        balance: bankAccounts.balance
      })
      .from(bankAccounts)
      .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
      .where(and(eq(bankAccounts.bankId, bankId), inArray(bankAccounts.ownerDiscordId, candidateIds)));

      // 2. Member accounts
      let memberAccounts: any[] = [];
      try {
        const memberships = await db.select().from(accountMembers).where(inArray(accountMembers.discordId, candidateIds));
        const memberAccountIds = memberships.map(m => m.accountId);
        if (memberAccountIds.length > 0) {
          memberAccounts = await db.select({
            id: bankAccounts.id,
            bankId: bankAccounts.bankId,
            bankName: banks.name,
            accountName: bankAccounts.accountName,
            type: bankAccounts.accountType,
            balance: bankAccounts.balance
          })
          .from(bankAccounts)
          .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
          .where(and(eq(bankAccounts.bankId, bankId), inArray(bankAccounts.id, memberAccountIds)));
        }
      } catch (e) {}

      // Combine accounts without duplicates
      const accountMap = new Map<string, any>();
      ownedAccounts.forEach(a => accountMap.set(a.id, a));
      memberAccounts.forEach(a => { if (!accountMap.has(a.id)) accountMap.set(a.id, a); });

      const userAccounts = Array.from(accountMap.values());

      if (userAccounts.length === 0) {
         return res.json({ 
           isStaff,
           accounts: [], 
           recentTx: [], 
           pendingInvoices: [], 
           cards: [], 
           loans: [], 
           customer: customer ? {
             kycStatus: customer.kycStatus,
             mcUsername: customer.mcUsername,
             mcUuid: customer.mcUuid,
             linkedDiscordId: customer.linkedDiscordId
           } : null 
         });
      }

      const accountIds = userAccounts.map(a => a.id);

      const recentTxs = await db.select()
        .from(transactions)
        .where(or(
          inArray(transactions.fromAccountId, accountIds),
          inArray(transactions.toAccountId, accountIds)
        ))
        .orderBy(desc(transactions.timestamp))
        .limit(10);

      const mappedTxs = recentTxs.map(tx => ({
        ...tx,
        toDiscordId: accountIds.includes(tx.toAccountId!) ? primaryId : null
      }));

      // Map pending invoices
      const userInvoices = await db.select({
         id: invoices.id,
         amount: invoices.amount,
         description: invoices.description,
         dueDate: invoices.dueDate,
         billerName: banks.name, 
         customerAccountName: bankAccounts.accountName
      })
      .from(invoices)
      .leftJoin(banks, eq(invoices.bankId, banks.id))
      .leftJoin(bankAccounts, eq(invoices.customerAccountId, bankAccounts.id))
      .where(
         and(
            inArray(invoices.customerAccountId, accountIds),
            eq(invoices.status, "pending"),
            eq(invoices.bankId, bankId)
         )
      )
      .orderBy(desc(invoices.createdAt));

      // Get user cards
      const userCards = await db.select({
         id: cards.id,
         bankId: cards.bankId,
         bankName: banks.name,
         accountId: cards.accountId,
         accountName: bankAccounts.accountName,
         cardNumber: cards.cardNumber,
         expiryDate: cards.expiryDate,
         isLocked: cards.isLocked,
         type: cards.type
      })
      .from(cards)
      .leftJoin(banks, eq(cards.bankId, banks.id))
      .leftJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
      .where(and(inArray(cards.accountId, accountIds), eq(cards.bankId, bankId)));

      // Get user loans
      const userLoans = await db.select()
        .from(loans)
        .where(and(eq(loans.bankId, bankId), or(inArray(loans.discordId, candidateIds), inArray(loans.accountId, accountIds))));

      res.json({
        isStaff,
        accounts: userAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        cards: userCards,
        loans: userLoans,
        customer: customer ? {
          kycStatus: customer.kycStatus,
          mcUsername: customer.mcUsername,
          mcUuid: customer.mcUuid,
          linkedDiscordId: customer.linkedDiscordId
        } : null
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

portalRouter.post("/api/portal/:bankId/pay-invoice", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, invoices, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { invoiceId } = req.body;
      const bankId = req.params.bankId;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);

      const [targetBank] = await db.select().from(banks).where(eq(banks.id, bankId));
      if (targetBank?.maintenanceMode) {
        const isStaff = await isUserStaffOrAdmin(req, bankId);
        if (!isStaff) {
          return res.status(503).json({ error: "This bank is currently in maintenance mode for system updates & staff testing. Portal transactions are temporarily suspended." });
        }
      }

      const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.bankId, bankId)));
      if (!inv || inv.status !== 'pending') return res.status(404).json({ error: "Invoice not found or already paid" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, inv.customerAccountId));
      if (!sourceAccount || !(await isUserAccountOwnerOrMember(sourceAccount, candidateIds))) {
        return res.status(404).json({ error: "Source account not found or unauthorized to pay this invoice" });
      }

      if (sourceAccount.balance < inv.amount) return res.status(400).json({ error: `Insufficient funds. Balance: $${(sourceAccount.balance/100).toFixed(2)}, Due: $${(inv.amount/100).toFixed(2)}` });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, inv.billerAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination biller account not found" });

      await db.update(bankAccounts).set({ balance: sourceAccount.balance - inv.amount }).where(eq(bankAccounts.id, sourceAccount.id));
      await db.update(bankAccounts).set({ balance: destAccount.balance + inv.amount }).where(eq(bankAccounts.id, destAccount.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: sourceAccount.bankId,
        fromAccountId: sourceAccount.id,
        toAccountId: destAccount.id,
        type: "transfer",
        amount: inv.amount,
        description: `Invoice Payment: ${inv.description || inv.id}`,
        timestamp: new Date()
      });

      await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, inv.id));

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

portalRouter.post("/api/portal/:bankId/transfer", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { fromAccountId, toAccountId, amount } = req.body;
      const bankId = req.params.bankId;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);

      const [targetBank] = await db.select().from(banks).where(eq(banks.id, bankId));
      if (targetBank?.maintenanceMode) {
        const isStaff = await isUserStaffOrAdmin(req, bankId);
        if (!isStaff) {
          return res.status(503).json({ error: "This bank is currently in maintenance mode for system updates & staff testing. Portal transactions are temporarily suspended." });
        }
      }

      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        return res.status(400).json({ error: "Invalid account selection" });
      }

      const amnt = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(amnt) || amnt <= 0) return res.status(400).json({ error: "Invalid amount" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bankId))
      );

      if (!sourceAccount || !(await isUserAccountOwnerOrMember(sourceAccount, candidateIds))) {
        return res.status(404).json({ error: "Source account not found or unauthorized" });
      }

      if (!sourceAccount.isActive || sourceAccount.isFrozen) return res.status(400).json({ error: "Source account is inactive or frozen" });
      if (sourceAccount.balance < amnt) return res.status(400).json({ error: `Insufficient funds.` });

      const [destAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, toAccountId), eq(bankAccounts.bankId, bankId))
      );
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });
      if (!destAccount.isActive || destAccount.isFrozen) return res.status(400).json({ error: "Destination account is inactive or frozen" });

      const { sql, gte } = await import("drizzle-orm");
      await db.transaction(async (tx) => {
        // Atomic deduction with balance check constraint
        const deductResult = await tx.update(bankAccounts)
          .set({ balance: sql`${bankAccounts.balance} - ${amnt}` })
          .where(and(
            eq(bankAccounts.id, sourceAccount.id),
            gte(bankAccounts.balance, amnt),
            eq(bankAccounts.isActive, true),
            eq(bankAccounts.isFrozen, false)
          ));

        await tx.update(bankAccounts)
          .set({ balance: sql`${bankAccounts.balance} + ${amnt}` })
          .where(and(
            eq(bankAccounts.id, destAccount.id),
            eq(bankAccounts.isActive, true),
            eq(bankAccounts.isFrozen, false)
          ));

        await tx.insert(transactions).values({
          id: uuidv4(),
          bankId: sourceAccount.bankId,
          fromAccountId: sourceAccount.id,
          toAccountId: destAccount.id,
          type: "transfer",
          amount: amnt,
          description: `Citizen Portal Transfer to ${toAccountId.substring(0, 8)}`,
          timestamp: new Date()
        });
      });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

portalRouter.patch("/api/portal/:bankId/cards/:cardId/lock", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { isLocked } = req.body;
      const bankId = req.params.bankId;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);

      const [card] = await db.select().from(cards).where(eq(cards.id, req.params.cardId));
      if (!card || card.bankId !== bankId) return res.status(404).json({ error: "Card not found" });

      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, card.accountId));
      if (!account || !(await isUserAccountOwnerOrMember(account, candidateIds))) {
         return res.status(403).json({ error: "Unauthorized" });
      }

      await db.update(cards).set({ isLocked: !!isLocked }).where(eq(cards.id, req.params.cardId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

// Citizen Unified Lookup API across all banks
portalRouter.get("/api/citizen/lookup", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { banks, bankAccounts, transactions, invoices, cards, loans, bankSettings, accountMembers } = await import("../../db/schema");
  const { eq, or, and, desc, inArray } = await import("drizzle-orm");

  try {
    const candidateIds = await getUserCandidateIdentifiers(req);
    if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

    // 1. Owned accounts across all banks
    const ownedAccounts = await db.select({
      id: bankAccounts.id,
      bankId: bankAccounts.bankId,
      bankName: banks.name,
      accountName: bankAccounts.accountName,
      type: bankAccounts.accountType,
      tierId: bankAccounts.tierId,
      balance: bankAccounts.balance,
      businessTaxId: bankAccounts.businessTaxId,
      businessSector: bankAccounts.businessSector,
      isActive: bankAccounts.isActive,
      isFrozen: bankAccounts.isFrozen,
      createdAt: bankAccounts.createdAt
    })
    .from(bankAccounts)
    .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
    .where(inArray(bankAccounts.ownerDiscordId, candidateIds));

    // 2. Member accounts across all banks
    let memberAccounts: any[] = [];
    try {
      const memberships = await db.select().from(accountMembers).where(inArray(accountMembers.discordId, candidateIds));
      const memberAccountIds = memberships.map(m => m.accountId);
      if (memberAccountIds.length > 0) {
        memberAccounts = await db.select({
          id: bankAccounts.id,
          bankId: bankAccounts.bankId,
          bankName: banks.name,
          accountName: bankAccounts.accountName,
          type: bankAccounts.accountType,
          tierId: bankAccounts.tierId,
          balance: bankAccounts.balance,
          businessTaxId: bankAccounts.businessTaxId,
          businessSector: bankAccounts.businessSector,
          isActive: bankAccounts.isActive,
          isFrozen: bankAccounts.isFrozen,
          createdAt: bankAccounts.createdAt
        })
        .from(bankAccounts)
        .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
        .where(inArray(bankAccounts.id, memberAccountIds));
      }
    } catch (e) {}

    // Combine accounts without duplicates
    const accountMap = new Map<string, any>();
    ownedAccounts.forEach(a => accountMap.set(a.id, a));
    memberAccounts.forEach(a => { if (!accountMap.has(a.id)) accountMap.set(a.id, a); });

    const userAccounts = Array.from(accountMap.values());

    const allBanks = await db.select({
      id: banks.id,
      name: banks.name,
      logoUrl: banks.logoUrl,
    }).from(banks);

    const allSettings = await db.select().from(bankSettings);
    const accountIds = userAccounts.map(a => a.id);

    let recentTxs: any[] = [];
    let userCards: any[] = [];
    let userInvoices: any[] = [];
    let userLoans: any[] = [];

    if (accountIds.length > 0) {
      recentTxs = await db.select()
        .from(transactions)
        .where(or(
          inArray(transactions.fromAccountId, accountIds),
          inArray(transactions.toAccountId, accountIds)
        ))
        .orderBy(desc(transactions.timestamp))
        .limit(20);

      userCards = await db.select({
        id: cards.id,
        bankId: cards.bankId,
        bankName: banks.name,
        accountId: cards.accountId,
        accountName: bankAccounts.accountName,
        cardNumber: cards.cardNumber,
        expiryDate: cards.expiryDate,
        isLocked: cards.isLocked,
        type: cards.type
      })
      .from(cards)
      .leftJoin(banks, eq(cards.bankId, banks.id))
      .leftJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
      .where(inArray(cards.accountId, accountIds));

      userInvoices = await db.select({
        id: invoices.id,
        amount: invoices.amount,
        description: invoices.description,
        dueDate: invoices.dueDate,
        billerName: banks.name,
        customerAccountName: bankAccounts.accountName
      })
      .from(invoices)
      .leftJoin(banks, eq(invoices.bankId, banks.id))
      .leftJoin(bankAccounts, eq(invoices.customerAccountId, bankAccounts.id))
      .where(and(inArray(invoices.customerAccountId, accountIds), eq(invoices.status, "pending")))
      .orderBy(desc(invoices.createdAt));
    }

    userLoans = await db.select()
      .from(loans)
      .where(or(
        inArray(loans.discordId, candidateIds),
        ...(accountIds.length > 0 ? [inArray(loans.accountId, accountIds)] : [])
      ));

    res.json({
      accounts: userAccounts,
      banks: allBanks,
      settings: allSettings,
      recentTx: recentTxs,
      pendingInvoices: userInvoices,
      cards: userCards,
      loans: userLoans
    });
  } catch (e: any) {
    console.error("[CitizenLookupAPI] Error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Self-Service Account Registration Endpoint with Personal Account Prerequisite check
portalRouter.post("/api/citizen/accounts/register", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { bankAccounts, bankSettings, banks, onyxMerchants } = await import("../../db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");
  const { dispatchDiscordWebhook } = await import("../../lib/webhook_dispatcher");

  try {
    const candidateIds = await getUserCandidateIdentifiers(req, req.body.bankId);
    if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });
    const primaryId = candidateIds[0];

    const { bankId, accountName, accountType, businessTaxId, businessSector, tierId: reqTierId } = req.body;

    if (!bankId || !accountName) {
      return res.status(400).json({ error: "Bank selection and Account Name are required." });
    }

    const type = accountType === "business" ? "business" : "personal";

    // 1. Check Bank
    const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    if (!bank) return res.status(404).json({ error: "Selected bank does not exist." });

    // 2. Check Bank Settings for requirePersonalForBusiness requirement
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    const mustHavePersonal = settings?.requirePersonalForBusiness ?? true;

    if (type === "business" && mustHavePersonal) {
      // Check if user has an active personal account in this bank
      const personalAccs = await db.select()
        .from(bankAccounts)
        .where(and(
          eq(bankAccounts.bankId, bankId),
          inArray(bankAccounts.ownerDiscordId, candidateIds),
          eq(bankAccounts.accountType, "personal"),
          eq(bankAccounts.isActive, true)
        ));

      if (personalAccs.length === 0) {
        return res.status(400).json({ 
          error: `Bank Policy Violation: ${bank.name} requires you to open at least one Personal Account before registering a Business Account.` 
        });
      }
    }

    let finalTierId = null;
    if (settings?.enableAccountTiers && settings?.accountTiers) {
      if (reqTierId) {
        const selectedTier = settings.accountTiers.find((t: any) => t.id === reqTierId && !t.isPrivate);
        if (selectedTier) {
          finalTierId = selectedTier.id;
        } else {
          return res.status(400).json({ error: "Invalid or private tier selected." });
        }
      } else {
        const defaultTier = settings.accountTiers.find((t: any) => t.type === type && t.isDefault && !t.isPrivate);
        if (defaultTier) {
          finalTierId = defaultTier.id;
        } else {
           // Fallback to first non-private tier of the type
           const fallbackTier = settings.accountTiers.find((t: any) => t.type === type && !t.isPrivate);
           if (fallbackTier) finalTierId = fallbackTier.id;
        }
      }
    }

    // 3. Create Account
    const id = `ACC-${uuidv4().substring(0, 8).toUpperCase()}`;
    await db.insert(bankAccounts).values({
      id,
      bankId,
      ownerDiscordId: primaryId,
      accountName: accountName.trim(),
      accountType: type,
      tierId: finalTierId,
      businessTaxId: type === "business" ? (businessTaxId || `CORP-${uuidv4().substring(0, 6).toUpperCase()}`) : null,
      businessSector: type === "business" ? (businessSector || "General Commerce") : null,
      balance: 0,
      isActive: true,
      createdAt: new Date()
    });

    // 4. Business Account Special Integration: Auto-provision Onyx Merchant Storefront
    let merchantInfo: any = null;
    if (type === "business") {
      const merchantId = `mch_${uuidv4().substring(0, 8)}`;
      const apiKey = `onyx_live_${crypto.randomBytes(16).toString("hex")}`;
      
      await db.insert(onyxMerchants).values({
        id: merchantId,
        name: accountName.trim(),
        apiKey,
        bankId,
        destinationAccount: id,
        createdAt: new Date()
      });

      merchantInfo = { merchantId, apiKey };
    }

    // Dispatch Webhook Notification
    await dispatchDiscordWebhook(bankId, "account_created", {
      title: type === "business" ? "🏢 New Business Account Registered!" : "👤 New Personal Account Opened!",
      description: `A new ${type} account **${accountName}** (\`${id}\`) was opened in ${bank.name}.`,
      color: type === "business" ? 0x8b5cf6 : 0x10b981,
      fields: [
        { name: "Account ID", value: `\`${id}\``, inline: true },
        { name: "Account Type", value: type.toUpperCase(), inline: true },
        { name: "Owner Discord ID", value: `<@${primaryId}>`, inline: true },
        ...(type === "business" ? [
          { name: "In-Game Corp Name", value: `\`${businessTaxId || accountName.trim()}\``, inline: true },
          { name: "Merchant Terminal ID", value: `\`${merchantInfo?.merchantId}\``, inline: true }
        ] : [])
      ]
    });

    res.json({
      success: true,
      message: type === "business" ? "Business Account registered with Onyx Merchant Terminal integration!" : "Personal Account opened successfully.",
      account: {
        id,
        bankId,
        accountName,
        accountType: type,
        businessTaxId,
        businessSector,
        merchantInfo
      }
    });

  } catch (e: any) {
    console.error("[AccountRegisterAPI] Error:", e);
    res.status(500).json({ error: e.message || "Failed to register account." });
  }
});

// Portal Loan Request API
portalRouter.post("/api/portal/:bankId/request-loan", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { loans, bankAccounts, banks } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const { accountId, amount, termMonths, purpose } = req.body;
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

    const [targetBank] = await db.select().from(banks).where(eq(banks.id, bankId));
    if (!targetBank) return res.status(404).json({ error: "Bank not found" });

    const [acc] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId)));
    if (!acc || !(await isUserAccountOwnerOrMember(acc, candidateIds))) {
      return res.status(404).json({ error: "Destination deposit account not found or unauthorized" });
    }

    const loanAmountCents = Math.round(parseFloat(amount) * 100);
    if (!loanAmountCents || loanAmountCents <= 0) return res.status(400).json({ error: "Invalid loan amount" });

    const term = parseInt(termMonths) || 12;
    const interestRate = 550; // 5.50% default

    const loanId = `loan_${uuidv4().substring(0, 8)}`;
    const nextPaymentDate = new Date();
    nextPaymentDate.setDate(nextPaymentDate.getDate() + 30);

    await db.insert(loans).values({
      id: loanId,
      bankId,
      discordId: candidateIds[0],
      accountId,
      principalAmount: loanAmountCents,
      remainingAmount: loanAmountCents,
      interestRate,
      nextPaymentDate,
      purpose: purpose || "Personal loan request",
      status: "active", // Approved & active
      createdAt: new Date()
    });

    // Credit account balance immediately upon approval
    await db.update(bankAccounts).set({ balance: acc.balance + loanAmountCents }).where(eq(bankAccounts.id, acc.id));

    res.json({
      success: true,
      loan: {
        id: loanId,
        amount: loanAmountCents,
        status: "active"
      }
    });
  } catch (e: any) {
    console.error("[LoanRequestAPI] Error:", e);
    res.status(500).json({ error: e.message || "Failed to submit loan request" });
  }
});

// Portal Loan Repayment API
portalRouter.post("/api/portal/:bankId/repay-loan", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { loans, bankAccounts, transactions } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const { loanId, accountId, amount } = req.body;
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const [loan] = await db.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.bankId, bankId)));
    if (!loan) return res.status(404).json({ error: "Loan record not found" });

    const [sourceAcc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId));
    if (!sourceAcc || !(await isUserAccountOwnerOrMember(sourceAcc, candidateIds))) {
      return res.status(404).json({ error: "Payment account not found or unauthorized" });
    }

    const repayCents = Math.round(parseFloat(amount) * 100);
    if (!repayCents || repayCents <= 0) return res.status(400).json({ error: "Invalid repayment amount" });
    if (sourceAcc.balance < repayCents) return res.status(400).json({ error: "Insufficient account balance for repayment" });

    const newRemaining = Math.max(0, loan.remainingAmount - repayCents);
    const newStatus = newRemaining === 0 ? "paid_off" : loan.status;

    await db.update(bankAccounts).set({ balance: sourceAcc.balance - repayCents }).where(eq(bankAccounts.id, sourceAcc.id));
    await db.update(loans).set({ remainingAmount: newRemaining, status: newStatus }).where(eq(loans.id, loan.id));

    await db.insert(transactions).values({
      id: uuidv4(),
      bankId,
      fromAccountId: sourceAcc.id,
      toAccountId: null,
      amount: repayCents,
      type: "transfer",
      description: `Loan Repayment (${loanId})`,
      timestamp: new Date()
    });

    res.json({ success: true, remainingAmount: newRemaining, status: newStatus });
  } catch (e: any) {
    console.error("[LoanRepayAPI] Error:", e);
    res.status(500).json({ error: e.message || "Failed to process loan repayment" });
  }
});

// Portal Card Issue API
portalRouter.post("/api/portal/:bankId/issue-card", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { cards, bankAccounts } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const { accountId, cardType } = req.body;
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const [acc] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId)));
    if (!acc || !(await isUserAccountOwnerOrMember(acc, candidateIds))) {
      return res.status(404).json({ error: "Linked account not found or unauthorized" });
    }

    const generateCardNum = () => "4" + Array.from({length: 15}, () => Math.floor(Math.random() * 10)).join("");
    const cardNum = generateCardNum();
    const cvv = Math.floor(100 + Math.random() * 900).toString();
    const expMonth = ("0" + (Math.floor(Math.random() * 12) + 1)).slice(-2);
    const expYear = (new Date().getFullYear() + 3).toString().slice(-2);
    const expiryDate = `${expMonth}/${expYear}`;

    const cardId = `crd_${uuidv4().substring(0, 8)}`;
    await db.insert(cards).values({
      id: cardId,
      bankId,
      accountId,
      cardNumber: cardNum,
      expiryDate,
      cvv,
      isLocked: false,
      type: cardType || "debit",
      createdAt: new Date()
    });

    res.json({ success: true, card: { id: cardId, cardNumber: cardNum, expiryDate, type: cardType || "debit" } });
  } catch (e: any) {
    console.error("[CardIssueAPI] Error:", e);
    res.status(500).json({ error: e.message || "Failed to issue card" });
  }
});
