import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import { buildCityCorpAuthUrl, fetchCityCorpPlayerInfo } from "../../lib/citycorp_api.js";
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

      const tokenResponse = await fetch("https://api.cityrp.org/auth/token", {
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

      let mcUsername = tokenData.username || tokenData.name || tokenData.player_name || "Citizen";
      try {
        const pInfo = await fetchCityCorpPlayerInfo(minecraftUuid, token);
        if (pInfo.success && pInfo.username) {
          mcUsername = pInfo.username;
          console.log(`Successfully fetched player name from CityCorp: ${mcUsername}`);
        }
      } catch (e) {
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
      const isDefaultDummyVaultTiers = (tiers: any[]): boolean => {
        if (!Array.isArray(tiers) || tiers.length !== 5) return false;
        const dummyDays = [7, 30, 90, 180, 365];
        const dummyRates = [100, 300, 500, 800, 1200];
        return tiers.every((t, i) => Number(t.lockDays) === dummyDays[i] && Number(t.interestRate) === dummyRates[i] && Number(t.penaltyPercent) === 20);
      };

      const rawTiers = (settings && Array.isArray(settings.vaultTiers)) ? settings.vaultTiers : [];
      const cleanTiers = (!settings || settings.enableVaults === false || isDefaultDummyVaultTiers(rawTiers)) ? [] : rawTiers;

      const rawAccountTiers = (settings && Array.isArray(settings.accountTiers)) ? settings.accountTiers : [];
      const cleanAccountTiers = (!settings || settings.enableAccountTiers === false)
        ? []
        : rawAccountTiers.filter((t: any) => !t.isPrivate);

      const publicSettings = settings ? {
        bankId: settings.bankId,
        logoUrl: settings.logoUrl || bank.logoUrl,
        colorScheme: settings.colorScheme,
        requireKyc: settings.requireKyc,
        enableAccountTiers: settings.enableAccountTiers !== false && cleanAccountTiers.length > 0,
        accountTiers: cleanAccountTiers,
        enableLoans: settings.enableLoans,
        enableVaults: settings.enableVaults,
        enableCards: settings.enableCards,
        enablePayroll: settings.enablePayroll,
        enableSubscriptions: settings.enableSubscriptions,
        enableEscrow: settings.enableEscrow,
        enableTreasury: settings.enableTreasury,
        loginBgUrl: settings.loginBgUrl,
        requirePersonalForBusiness: settings.requirePersonalForBusiness,
        vaultTiers: cleanTiers,
        defaultFeePayerMode: settings.defaultFeePayerMode,
        savingsApyPercent: settings.savingsApyPercent,
        tagline: settings.tagline,
        discordShowStats: settings.discordShowStats,
      } : null;

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

      res.json({ ...safeBank, settings: publicSettings });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

portalRouter.get("/api/portal/:bankId/lookup", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { banks, bankAccounts, transactions, invoices, cards, bankSettings, bankCustomers, loans, accountMembers, subscriptions } = await import("../../db/schema");
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
            inArray(bankCustomers.mcUuid, candidateIds)
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
        accountType: bankAccounts.accountType,
        tierId: bankAccounts.tierId,
        balance: bankAccounts.balance,
        isFrozen: bankAccounts.isFrozen,
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
            accountType: bankAccounts.accountType,
            tierId: bankAccounts.tierId,
            balance: bankAccounts.balance,
            isFrozen: bankAccounts.isFrozen,
          })
          .from(bankAccounts)
          .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
          .where(and(eq(bankAccounts.bankId, bankId), inArray(bankAccounts.id, memberAccountIds)));
        }
      } catch (e: any) {}

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
             linkedDiscordId: customer.linkedDiscordId,
          rpName: customer.rpName,
          address: customer.address,
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
        .limit(50);

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
         type: cards.type,
         creditLimit: cards.creditLimit,
         creditUsed: cards.creditUsed,
         productId: cards.productId,
      })
      .from(cards)
      .leftJoin(banks, eq(cards.bankId, banks.id))
      .leftJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
      .where(and(inArray(cards.accountId, accountIds), eq(cards.bankId, bankId)));

      // Get user loans
      const userSubscriptions = await db.select().from(subscriptions).where(and(eq(subscriptions.bankId, bankId), or(inArray(subscriptions.customerAccountId, accountIds), inArray(subscriptions.billerAccountId, accountIds))));
      const userLoans = await db.select()
        .from(loans)
        .where(and(eq(loans.bankId, bankId), or(inArray(loans.discordId, candidateIds), inArray(loans.accountId, accountIds))));

      res.json({
        isStaff,
        accounts: userAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        cards: userCards.map((c: any) => ({
          ...c,
          cardNumber: c.cardNumber ? `•••• ${String(c.cardNumber).slice(-4)}` : null,
        })),
        loans: userLoans.map((l: any) => ({
          ...l,
          amount: l.principalAmount,
          remainingBalance: l.remainingAmount,
        })),
        subscriptions: userSubscriptions,
        customer: customer ? {
          kycStatus: customer.kycStatus,
          mcUsername: customer.mcUsername,
          mcUuid: customer.mcUuid,
          linkedDiscordId: customer.linkedDiscordId,
          rpName: customer.rpName,
          address: customer.address
        } : null
      });
    } catch (e: any) {
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
      if (targetBank?.billingStatus === "suspended" || targetBank?.status === "suspended") {
        return res.status(503).json({ error: "This bank is suspended. Transfers are frozen." });
      }
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
      if (destAccount.bankId !== bankId || sourceAccount.bankId !== bankId) {
        return res.status(400).json({ error: "Invoice payments stay inside this bank. Use Onyx to pay another bank." });
      }

      const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money");
      await executeSameBankBookTransfer({
        sourceAccount,
        destAccount,
        desiredCents: inv.amount,
        mode: "from_payment",
        description: `Invoice Payment: ${inv.description || inv.id}`,
        type: "transfer",
      });

      await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, inv.id));

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });


portalRouter.post("/api/portal/:bankId/transfer/quote", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { fromAccountId, toAccountId, toQuery, amount, feePayerMode } = req.body;
      const bankId = req.params.bankId;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);
      const cents = Math.round(parseFloat(amount) * 100);
      if (!fromAccountId || !(toAccountId || toQuery) || fromAccountId === toAccountId) {
        return res.status(400).json({ error: "Invalid account selection" });
      }
      if (!Number.isFinite(cents) || cents <= 0) return res.status(400).json({ error: "Invalid amount" });
      const sourceAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bankId))).get();
      if (!sourceAccount || !(await isUserAccountOwnerOrMember(sourceAccount, candidateIds))) {
        return res.status(404).json({ error: "Source account not found or unauthorized" });
      }
      const { resolvePayableAccount } = await import("../../lib/account_lookup.js");
      const resolved = await resolvePayableAccount(toAccountId || toQuery, { bankId, excludeId: fromAccountId });
      if (!resolved.account) return res.status(404).json({ error: resolved.error || "Destination account not found" });
      const destAccount = resolved.account;
      if (destAccount.bankId !== bankId) return res.status(400).json({ error: "Transfers stay inside this bank. Use Onyx to pay another bank." });
      const { quoteBookTransfer, parseFeePayerMode, loadSettings } = await import("../../lib/citycorp_money");
      const settings = await loadSettings(bankId);
      const mode = parseFeePayerMode(feePayerMode, (settings?.defaultFeePayerMode as any) || "from_payment");
      const { quote } = await quoteBookTransfer({ sourceAccount, destAccount, desiredCents: cents, mode });
      res.json({ success: true, quote, sameBank: true, destination: { id: destAccount.id, accountName: destAccount.accountName, bankId: destAccount.bankId, bankName: destAccount.bankName }, defaultFeePayerMode: settings?.defaultFeePayerMode || "from_payment" });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Quote failed" });
    }
  });

portalRouter.post("/api/portal/:bankId/transfer", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, banks } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");

    const bankId = req.params.bankId;
    const { extractIdempotencyKey, checkIdempotency, startIdempotency, completeIdempotency, releaseIdempotency } = await import("../../lib/idempotency.js");
    const idempotencyKey = extractIdempotencyKey(req);
    const scope = `portal_transfer_${bankId}_${(req as any).user?.discordId || "unknown"}`;

    if (idempotencyKey) {
      const check = await checkIdempotency(idempotencyKey, scope);
      if (check.state === "completed") {
        return res.status(check.statusCode || 200).json(check.body);
      }
      if (check.state === "in_progress") {
        return res.status(409).json({ error: "A transfer with this idempotency key is currently processing. Please wait." });
      }
      await startIdempotency(idempotencyKey, scope);
    }

    try {
      const { fromAccountId, toAccountId, toQuery, amount, feePayerMode } = req.body;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);

      const [targetBank] = await db.select().from(banks).where(eq(banks.id, bankId));
      if (targetBank?.maintenanceMode) {
        const isStaff = await isUserStaffOrAdmin(req, bankId);
        if (!isStaff) {
          if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
          return res.status(503).json({ error: "This bank is currently in maintenance mode for system updates & staff testing. Portal transactions are temporarily suspended." });
        }
      }

      if (!fromAccountId || !(toAccountId || toQuery) || fromAccountId === toAccountId) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(400).json({ error: "Invalid account selection" });
      }

      const amnt = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(amnt) || amnt <= 0) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(400).json({ error: "Invalid amount" });
      }

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bankId))
      );

      if (!sourceAccount || !(await isUserAccountOwnerOrMember(sourceAccount, candidateIds))) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(404).json({ error: "Source account not found or unauthorized" });
      }

      if (!sourceAccount.isActive || sourceAccount.isFrozen) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(400).json({ error: "Source account is inactive or frozen" });
      }
      if (sourceAccount.balance < amnt) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(400).json({ error: `Insufficient funds.` });
      }

      const { resolvePayableAccount } = await import("../../lib/account_lookup.js");
      const resolved = await resolvePayableAccount(toAccountId || toQuery, { bankId, excludeId: sourceAccount.id });
      if (!resolved.account) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(404).json({ error: resolved.error || "Destination account not found" });
      }
      const destAccount = resolved.account;
      if (destAccount.bankId !== bankId) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(400).json({ error: "Transfers stay inside this bank. Use Onyx to pay another bank." });
      }
      if (!destAccount.isActive || destAccount.isFrozen) {
        if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
        return res.status(400).json({ error: "Destination account is inactive or frozen" });
      }

      const { executeSameBankBookTransfer, parseFeePayerMode, loadSettings } = await import("../../lib/citycorp_money");
      const settings = await loadSettings(bankId);
      const mode = parseFeePayerMode(feePayerMode, (settings?.defaultFeePayerMode as any) || "from_payment");
      const moved = await executeSameBankBookTransfer({
        sourceAccount,
        destAccount,
        desiredCents: amnt,
        mode,
        description: req.body.description || `Portal transfer to ${destAccount.accountName}`,
        type: "transfer",
      });

      import("../../lib/customer_notify.js").then(({ notifyTransferReceived }) =>
        notifyTransferReceived({
          bankId: destAccount.bankId,
          destOwnerDiscordId: destAccount.ownerDiscordId,
          destAccountName: destAccount.accountName,
          receivedCents: moved.quote.receivedCents,
          fromLabel: sourceAccount.accountName,
        })
      ).catch(() => {});

      const responsePayload = { success: true, quote: moved.quote, txId: moved.txId, destination: { id: destAccount.id, accountName: destAccount.accountName, bankName: destAccount.bankName } };
      if (idempotencyKey) {
        await completeIdempotency(idempotencyKey, scope, 200, responsePayload);
      }
      res.json(responsePayload);
    } catch (e: any) {
      if (idempotencyKey) {
        await releaseIdempotency(idempotencyKey, scope);
      }
      console.error(e);
      if (e?.name === "MoneyRailError") {
        return res.status(400).json({ error: e.message || "Transfer failed" });
      }
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
      import("../../lib/customer_notify.js").then(({ notifyCardLocked }) =>
        notifyCardLocked({
          bankId,
          discordId: account.ownerDiscordId,
          last4: card.cardNumber ? String(card.cardNumber).slice(-4) : undefined,
          locked: !!isLocked,
        })
      ).catch(() => {});
      res.json({ success: true });
    } catch (e: any) {
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
    } catch (e: any) {}

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


    const { users } = await import("../../db/schema");
    const globalUser = await db.select().from(users).where(inArray(users.discordId, candidateIds)).limit(1).get();

    res.json({
      accounts: userAccounts,
      banks: allBanks,
      settings: allSettings,
      recentTx: recentTxs,
      pendingInvoices: userInvoices,
      cards: userCards,
      loans: userLoans.map((l: any) => ({
        ...l,
        amount: l.principalAmount,
        remainingBalance: l.remainingAmount,
      })),
      profile: globalUser ? {
        rpName: globalUser.rpName,
        address: globalUser.address
      } : null
    });

  } catch (e: any) {
    console.error("[CitizenLookupAPI] Error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// Self-Service Account Registration Endpoint with Personal Account Prerequisite check


portalRouter.post("/api/citizen/update-profile", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const { rpName, address } = req.body;
    const { db } = await import("../../db/index.js");
    const { users } = await import("../../db/schema.js");
    const { eq, inArray } = await import("drizzle-orm");
    const candidateIds = await getUserCandidateIdentifiers(req);

    let userRec = await db.select().from(users).where(inArray(users.discordId, candidateIds)).limit(1).get();
    
    if (!userRec) {
      // Create if they don't exist in users table
      const { v4: uuidv4 } = await import("uuid");
      await db.insert(users).values({
        id: uuidv4(),
        discordId: candidateIds[0] || "unknown",
        mcUuid: "unknown",
        mcUsername: "Citizen",
        rpName: rpName,
        address: address,
        createdAt: new Date()
      });
    } else {
      await db.update(users).set({
        rpName: rpName,
        address: address
      }).where(eq(users.id, userRec.id));
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("[ProfileUpdateAPI] Error:", e);
    res.status(500).json({ error: e.message || "Failed to update profile." });
  }
});

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

    // 1. Check Bank
    const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    if (!bank) return res.status(404).json({ error: "Selected bank does not exist." });

    // 2. Check Bank Settings
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    const mustHavePersonal = settings?.requirePersonalForBusiness ?? true;

    const rawAccountTiers = (settings && Array.isArray(settings.accountTiers)) ? settings.accountTiers : [];
    const tiersActive = settings?.enableAccountTiers !== false && rawAccountTiers.length > 0;

    const allowedTypes = ["personal_checking", "personal_savings", "business_checking", "business_savings"];
    let type = allowedTypes.includes(accountType) ? accountType : (accountType === "business" ? "business_checking" : "personal_checking");

    let finalTierId = null;
    let selectedTier: any = null;

    if (tiersActive) {
      if (reqTierId) {
        selectedTier = rawAccountTiers.find((t: any) => t.id === reqTierId && !t.isPrivate);
        if (selectedTier) {
          finalTierId = selectedTier.id;
          if (selectedTier.type === "business") {
            type = "business_checking";
          } else if (selectedTier.type === "personal" && (!accountType || accountType === "personal")) {
            type = selectedTier.name?.toLowerCase().includes("saving") ? "personal_savings" : "personal_checking";
          }
        } else {
          return res.status(400).json({ error: "Invalid or private tier selected." });
        }
      } else {
        const defaultTier = rawAccountTiers.find((t: any) => (t.type === type || (t.type === "personal" && type.startsWith("personal")) || (t.type === "business" && type.startsWith("business"))) && t.isDefault && !t.isPrivate);
        if (defaultTier) {
          finalTierId = defaultTier.id;
          selectedTier = defaultTier;
        } else {
          const fallbackTier = rawAccountTiers.find((t: any) => (t.type === type || (t.type === "personal" && type.startsWith("personal")) || (t.type === "business" && type.startsWith("business"))) && !t.isPrivate);
          if (fallbackTier) {
            finalTierId = fallbackTier.id;
            selectedTier = fallbackTier;
          }
        }
      }
    }

    const isBusiness = type.includes("business");

    if (isBusiness && mustHavePersonal) {
      // Check if user has an active personal account in this bank
      const personalAccs = await db.select()
        .from(bankAccounts)
        .where(and(
          eq(bankAccounts.bankId, bankId),
          inArray(bankAccounts.ownerDiscordId, candidateIds),
          inArray(bankAccounts.accountType, ["personal", "personal_checking", "personal_savings"]),
          eq(bankAccounts.isActive, true)
        ));

      if (personalAccs.length === 0) {
        return res.status(400).json({ 
          error: `Bank Policy Violation: ${bank.name} requires you to open at least one Personal Account before registering a Business Account.` 
        });
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

    // 3.5. Auto-Provision Credit Card if Tier specifies a Credit Limit
    let provisionedCardInfo: any = null;
    if (finalTierId && settings?.accountTiers) {
      const assignedTier = settings.accountTiers.find((t: any) => t.id === finalTierId);
      if (assignedTier && assignedTier.creditLimit && assignedTier.creditLimit > 0) {
        const { cards } = await import("../../db/schema");
        const generateCardNum = () => "4" + Array.from({length: 15}, () => Math.floor(Math.random() * 10)).join("");
        const cardNum = generateCardNum();
        const cvv = Math.floor(100 + Math.random() * 900).toString();
        const expMonth = ("0" + (Math.floor(Math.random() * 12) + 1)).slice(-2);
        const expYear = (new Date().getFullYear() + 3).toString().slice(-2);
        
        const cardId = `crd_${uuidv4().substring(0, 8)}`;
        await db.insert(cards).values({
          id: cardId,
          bankId,
          accountId: id,
          cardNumber: cardNum,
          cvv,
          expiryDate: `${expMonth}/${expYear}`,
          isLocked: false,
          type: "credit",
          creditLimit: assignedTier.creditLimit,
          creditUsed: 0,
          apr: assignedTier.creditApr || 1999,
          createdAt: new Date()
        });
        provisionedCardInfo = { cardId, creditLimit: assignedTier.creditLimit };
      }
    }

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

portalRouter.post("/api/portal/:bankId/request-card", requireAuth, async (req, res) => {
  const { db } = await import("../../db/index.js");
  const { cards, bankAccounts, banks, creditProducts, creditApplications, bankSettings } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");
  const { randomInt } = await import("crypto");

  try {
    const { accountId, cardType, productId } = req.body;
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

    const [targetBank] = await db.select().from(banks).where(eq(banks.id, bankId));
    if (!targetBank) return res.status(404).json({ error: "Bank not found" });

    const [acc] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId)));
    if (!acc || !(await isUserAccountOwnerOrMember(acc, candidateIds))) {
      return res.status(404).json({ error: "Account not found or unauthorized" });
    }

    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (settings?.enableCards === false) return res.status(400).json({ error: "This bank is not issuing cards." });

    let product: any = null;
    if (productId) {
      product = await db.select().from(creditProducts).where(and(eq(creditProducts.id, productId), eq(creditProducts.bankId, bankId), eq(creditProducts.isActive, true))).get();
      if (!product) return res.status(400).json({ error: "That card product is not available." });
    }

    const kind = product?.cardKind || (cardType === "credit" ? "credit" : "debit");
    const issueNow = () => {
      const cardNumber = Array.from({length: 16}, () => randomInt(0, 10)).join("");
      const cvv = Array.from({length: 3}, () => randomInt(0, 10)).join("");
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 4);
      const expiryDate = `${(nextYear.getMonth() + 1).toString().padStart(2, "0")}/${nextYear.getFullYear().toString().slice(-2)}`;
      const creditLimit = product ? Number(product.maxLimit) || 0 : 0;
      const apr = product ? Math.round(Number(product.interestRate) * 100) : 0;
      return {
        id: `crd_${uuidv4().substring(0, 8)}`,
        bankId,
        accountId,
        cardNumber,
        cvv,
        expiryDate,
        type: kind === "debit" ? "debit" : "credit",
        creditLimit,
        creditUsed: 0,
        apr,
        isLocked: false,
        productId: product?.id || null,
        createdAt: new Date(),
        nextPaymentDate: kind === "credit" ? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })() : null,
      };
    };

    let autoApprove = kind === "debit";
    if (settings?.autoApproveCreditCards) autoApprove = true;
    if (settings?.enableAccountTiers && acc.tierId && settings.accountTiers) {
      const tier = (settings.accountTiers as any[]).find((t) => t.id === acc.tierId);
      if (tier?.autoApproveCreditCards) autoApprove = true;
    }
    if (product?.tierId && acc.tierId && product.tierId !== acc.tierId) autoApprove = false;

    if (!autoApprove) {
      const appId = uuidv4();
      await db.insert(creditApplications).values({
        id: appId,
        bankId,
        discordId: candidateIds[0],
        accountId,
        requestedLimit: product ? Number(product.maxLimit) : 0,
        monthlyIncome: 0,
        purpose: product ? `Apply: ${product.name}` : "Card request",
        status: "pending",
        productId: product?.id || null,
        createdAt: new Date(),
      } as any);
      return res.json({ success: true, pending: true, message: "Application submitted. Staff will review." });
    }

    const card = issueNow();
    await db.insert(cards).values(card as any);
    res.json({ success: true, cardId: card.id, issued: true, creditLimit: card.creditLimit });
  } catch (e: any) {
    console.error("Issue card error:", e);
    res.status(500).json({ error: e.message || "Failed to issue card." });
  }
});

// Portal Loan Request API
portalRouter.get("/api/portal/:bankId/loan-products", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { loanProducts } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");
  try {
    const products = await db.select().from(loanProducts).where(and(eq(loanProducts.bankId, req.params.bankId), eq(loanProducts.isActive, true)));
    res.json(products);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load loan products" });
  }
});

portalRouter.post("/api/portal/:bankId/request-loan", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { bankAccounts, banks } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { accountId, amount, termMonths, purpose, productId } = req.body;
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

    const { submitLoanApplication } = await import("../loan_processor");
    const result = await submitLoanApplication({
      bankId,
      discordId: candidateIds[0],
      accountId,
      principalAmount: loanAmountCents,
      purpose: purpose || "Personal loan request",
      productId,
      termMonths: parseInt(termMonths) || undefined,
      allowAutoApprove: true,
    });

    import("../../lib/customer_notify.js").then(({ notifyLoanEvent }) =>
      notifyLoanEvent({
        bankId,
        discordId: candidateIds[0],
        kind: result.status === "active" ? "disbursed" : "applied",
        loanId: result.loan.id,
        amountCents: result.loan.principalAmount,
        extra: result.status === "active" ? "Funds are in your account." : "Staff will review your application.",
      })
    ).catch(() => {});

    res.json({
      success: true,
      autoApprove: result.status === "active",
      awaitingSignature: result.awaitingSignature,
      status: result.status,
      loan: {
        id: result.loan.id,
        amount: result.loan.principalAmount,
        status: result.status
      }
    });
  } catch (e: any) {
    console.error("[LoanRequestAPI] Error:", e);
    res.status(400).json({ error: e.message || "Failed to submit loan request" });
  }
});

// Portal Loan Repayment API
portalRouter.post("/api/portal/:bankId/repay-loan", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { loans, bankAccounts } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { loanId, accountId, amount } = req.body;
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const [loan] = await db.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.bankId, bankId)));
    if (!loan) return res.status(404).json({ error: "Loan record not found" });

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ error: "Invalid amount" });

    const [acc] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId)));
    if (!acc) return res.status(400).json({ error: "Linked account not found" });
    
    const isAuthorized = await isUserAccountOwnerOrMember(acc, candidateIds);
    if (!isAuthorized) return res.status(403).json({ error: "Unauthorized" });

    const { collectLoanPayment } = await import("../loan_processor");
    const result = await collectLoanPayment({
      loan,
      fromAccount: acc,
      amountCents,
      description: `Loan Repayment (${loanId})`,
    });

    res.json({ success: true, remainingAmount: result.newRemaining, status: result.status });
  } catch (e: any) {
    console.error("[LoanRepayAPI] Error:", e);
    return res.status(400).json({ error: e.message || "Loan repayment failed" });
  }
});

portalRouter.get("/api/portal/:bankId/payees", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const q = String(req.query.q || "");
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const { db } = await import("../../db/index.js");
    const { bankAccounts } = await import("../../db/schema.js");
    const { eq, and, inArray } = await import("drizzle-orm");
    const mine = candidateIds.length
      ? await db.select({ id: bankAccounts.id }).from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), inArray(bankAccounts.ownerDiscordId, candidateIds)))
      : [];
    const { suggestPayees } = await import("../../lib/account_lookup.js");
    const matches = await suggestPayees({ bankId, ownerAccountIds: mine.map((a) => a.id), q, limit: 8 });
    res.json(matches);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Lookup failed" });
  }
});

portalRouter.get("/api/portal/:bankId/catalog", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { loanProducts, creditProducts, bankSettings } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");
  try {
    const bankId = req.params.bankId;
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    const loans = settings?.enableLoans === false ? [] : await db.select().from(loanProducts).where(and(eq(loanProducts.bankId, bankId), eq(loanProducts.isActive, true)));
    const cards = settings?.enableCards === false ? [] : await db.select().from(creditProducts).where(and(eq(creditProducts.bankId, bankId), eq(creditProducts.isActive, true)));
    const isDefaultDummyVaultTiers = (tiers: any[]): boolean => {
      if (!Array.isArray(tiers) || tiers.length !== 5) return false;
      const dummyDays = [7, 30, 90, 180, 365];
      const dummyRates = [100, 300, 500, 800, 1200];
      return tiers.every((t, i) => Number(t.lockDays) === dummyDays[i] && Number(t.interestRate) === dummyRates[i] && Number(t.penaltyPercent) === 20);
    };

    const rawVaultTiers = Array.isArray(settings?.vaultTiers) ? settings.vaultTiers : [];
    const bonds = (settings?.enableVaults === false || isDefaultDummyVaultTiers(rawVaultTiers)) ? [] : rawVaultTiers;
    const rawAccountTiers = Array.isArray(settings?.accountTiers) ? settings.accountTiers : [];
    const accountTiers = (settings?.enableAccountTiers === false) 
      ? [] 
      : rawAccountTiers.filter((t: any) => !t.isPrivate);

    res.json({ 
      loans, 
      cards, 
      bonds, 
      accountTiers,
      enableLoans: settings?.enableLoans !== false, 
      enableCards: settings?.enableCards !== false, 
      enableBonds: settings?.enableVaults !== false && bonds.length > 0,
      enableAccountTiers: settings?.enableAccountTiers !== false && accountTiers.length > 0
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to load catalog" });
  }
});

portalRouter.post("/api/portal/:bankId/bonds", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { vaultDeposits, bankAccounts, bankSettings } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");
  try {
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const { accountId, amount, lockDays } = req.body;
    const parsedAmount = Math.round(parseFloat(amount) * 100);
    const days = parseInt(lockDays, 10);
    if (!accountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !days) {
      return res.status(400).json({ error: "Invalid bond application" });
    }
    const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
    if (!acc || !(await isUserAccountOwnerOrMember(acc, candidateIds))) {
      return res.status(404).json({ error: "Account not found or unauthorized" });
    }
    if (acc.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (settings?.enableVaults === false) return res.status(400).json({ error: "This bank is not offering bonds." });
    const tiers = settings?.vaultTiers || [];
    const tier = (tiers as any[]).find((t) => Number(t.lockDays) === days);
    if (!tier) return res.status(400).json({ error: "That bond term is not offered." });

    const { holdInSystemAccount } = await import("../../lib/citycorp_money.js");
    await holdInSystemAccount({
      fromAccount: acc,
      amountCents: parsedAmount,
      systemAccountName: "VAULT",
      systemCategory: "vault",
      description: `Bond purchase (${days} days @ ${(Number(tier.interestRate) / 100).toFixed(2)}%)`,
      type: "vault",
    });
    const lockedUntil = new Date();
    lockedUntil.setDate(lockedUntil.getDate() + days);
    const bond = {
      id: uuidv4(),
      bankId,
      accountId: acc.id,
      amount: parsedAmount,
      lockedUntil,
      interestRate: Number(tier.interestRate),
      status: "locked",
      createdAt: new Date(),
    };
    await db.insert(vaultDeposits).values(bond);
    res.json({ success: true, bond });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message || "Could not buy bond" });
  }
});

portalRouter.post("/api/portal/:bankId/cards/:cardId/cash-advance", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { cards, bankAccounts, creditProducts } = await import("../../db/schema.js");
  const { eq, and, sql } = await import("drizzle-orm");
  try {
    const bankId = req.params.bankId;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const amountCents = Math.round(parseFloat(req.body.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return res.status(400).json({ error: "Invalid amount" });

    const card = await db.select().from(cards).where(and(eq(cards.id, req.params.cardId), eq(cards.bankId, bankId))).get();
    if (!card) return res.status(404).json({ error: "Card not found" });
    if (card.isLocked) return res.status(400).json({ error: "Card is locked" });
    if (card.type !== "credit") return res.status(400).json({ error: "Cash advances are for credit cards." });

    const acc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, card.accountId)).get();
    if (!acc || !(await isUserAccountOwnerOrMember(acc, candidateIds))) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    let product: any = null;
    if ((card as any).productId) {
      product = await db.select().from(creditProducts).where(eq(creditProducts.id, (card as any).productId)).get();
    }
    if (product && product.cashAdvanceEnabled === false) {
      return res.status(400).json({ error: "Cash advances are disabled on this card." });
    }

    const feeBps = product?.cashAdvanceFeePercent ?? 300;
    const fee = Math.floor(amountCents * (feeBps / 10000));
    const charged = amountCents + fee;
    if ((card.creditUsed || 0) + charged > (card.creditLimit || 0)) {
      return res.status(400).json({ error: "Exceeds available credit." });
    }

    const { disburseFromPoolOrOperating } = await import("../../lib/citycorp_money.js");
    await disburseFromPoolOrOperating({
      bankId,
      toAccount: acc,
      amountCents,
      description: `Cash advance · card ${String(card.cardNumber || "").slice(-4)}`,
    });
    await db.update(cards).set({ creditUsed: sql`${cards.creditUsed} + ${charged}` }).where(eq(cards.id, card.id));
    res.json({ success: true, advancedCents: amountCents, feeCents: fee, creditUsed: (card.creditUsed || 0) + charged });
  } catch (e: any) {
    console.error(e);
    res.status(400).json({ error: e.message || "Cash advance failed" });
  }
});
