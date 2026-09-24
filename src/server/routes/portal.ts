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
      res.cookie('oauth_nonce', nonce, {
        maxAge: 10 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true
      });
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
      res.clearCookie('oauth_nonce', { secure: true, sameSite: 'none', httpOnly: true });
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
        personalAccountPrefix: settings.personalAccountPrefix ?? "ACC-",
        businessAccountPrefix: settings.businessAccountPrefix ?? "CORP-",
        personalAccountNamingMode: settings.personalAccountNamingMode ?? "custom",
        businessAccountNamingMode: settings.businessAccountNamingMode ?? "business_name",
        tagline: settings.tagline,
        discordShowStats: settings.discordShowStats,
      } : null;

      const isOnline = botManager.isBankBotOnline(bank.id);
      const liveStatus = isOnline ? 'online' : (bank.status === 'online' && botManager.getInstance(bank.id) ? 'online' : (botManager.getInstance(bank.id)?.status || bank.status || 'offline'));

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
        status: liveStatus,
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
    const { banks, bankAccounts, transactions, invoices, cards, bankSettings, bankCustomers, loans, accountMembers, subscriptions, customerNotifications } = await import("../../db/schema");
    const { eq, and, or, desc, inArray, sql, isNull } = await import("drizzle-orm");

    try {
      const bankId = req.params.bankId;
      const candidateIds = await getUserCandidateIdentifiers(req, bankId);
      if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

      const primaryId = candidateIds[0];
      const loweredCandidateIds = Array.from(new Set(candidateIds.map(c => c.toLowerCase()))).filter(Boolean);

      let customer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, bankId),
          or(
            inArray(bankCustomers.discordId, candidateIds),
            inArray(sql`lower(${bankCustomers.discordId})`, loweredCandidateIds),
            inArray(bankCustomers.linkedDiscordId, candidateIds),
            inArray(sql`lower(${bankCustomers.linkedDiscordId})`, loweredCandidateIds),
            inArray(bankCustomers.mcUuid, candidateIds),
            inArray(sql`lower(${bankCustomers.mcUuid})`, loweredCandidateIds),
            inArray(bankCustomers.mcUsername, candidateIds),
            inArray(sql`lower(${bankCustomers.mcUsername})`, loweredCandidateIds),
            inArray(bankCustomers.id, candidateIds)
          )
        )
      ).get();

      if (customer) {
        [customer.id, customer.discordId, customer.linkedDiscordId, customer.mcUuid, customer.mcUsername, customer.rpName].filter(Boolean).forEach(val => {
          if (!candidateIds.includes(val!)) candidateIds.push(val!);
          const low = val!.toLowerCase();
          if (!loweredCandidateIds.includes(low)) loweredCandidateIds.push(low);
        });
      }

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
      .where(
        and(
          eq(bankAccounts.bankId, bankId),
          or(
            inArray(bankAccounts.ownerDiscordId, candidateIds),
            inArray(sql`lower(${bankAccounts.ownerDiscordId})`, loweredCandidateIds)
          ),
          or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
        )
      );

      // 2. Member accounts
      let memberAccounts: any[] = [];
      try {
        const memberships = await db.select().from(accountMembers).where(
          or(
            inArray(accountMembers.discordId, candidateIds),
            inArray(sql`lower(${accountMembers.discordId})`, loweredCandidateIds),
            inArray(accountMembers.mcUsername, candidateIds),
            inArray(sql`lower(${accountMembers.mcUsername})`, loweredCandidateIds),
            inArray(accountMembers.mcUuid, candidateIds),
            inArray(sql`lower(${accountMembers.mcUuid})`, loweredCandidateIds)
          )
        );
        const memberAccountIds = memberships.map(m => m.accountId).filter(Boolean);
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
          .where(
            and(
              eq(bankAccounts.bankId, bankId),
              inArray(bankAccounts.id, memberAccountIds),
              or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
            )
          );
        }
      } catch (e: any) {}

      // Combine accounts without duplicates
      const accountMap = new Map<string, any>();
      ownedAccounts.forEach(a => accountMap.set(a.id, a));
      memberAccounts.forEach(a => { if (!accountMap.has(a.id)) accountMap.set(a.id, a); });

      const userAccounts = Array.from(accountMap.values());
      const accountIds = userAccounts.map(a => a.id);

      let mappedTxs: any[] = [];
      if (accountIds.length > 0) {
        const recentTxs = await db.select()
          .from(transactions)
          .where(
            and(
              eq(transactions.bankId, bankId),
              or(
                inArray(transactions.fromAccountId, accountIds),
                inArray(transactions.toAccountId, accountIds)
              )
            )
          )
          .orderBy(desc(transactions.timestamp))
          .limit(100);

        const referencedAccIds = Array.from(new Set(recentTxs.flatMap(t => [t.fromAccountId, t.toAccountId]).filter(Boolean))) as string[];
        const accRows = referencedAccIds.length > 0 
          ? await db.select({ id: bankAccounts.id, name: bankAccounts.accountName }).from(bankAccounts).where(inArray(bankAccounts.id, referencedAccIds))
          : [];
        const accNameMap = new Map(accRows.map(r => [r.id, r.name]));

        mappedTxs = recentTxs.map(tx => ({
          ...tx,
          fromAccountName: tx.fromAccountId ? (accNameMap.get(tx.fromAccountId) || tx.fromAccountId) : "External Deposit",
          toAccountName: tx.toAccountId ? (accNameMap.get(tx.toAccountId) || tx.toAccountId) : "External Withdrawal",
          toDiscordId: accountIds.includes(tx.toAccountId!) ? primaryId : null
        }));
      }

      // Map pending invoices
      let userInvoices: any[] = [];
      if (accountIds.length > 0) {
        userInvoices = await db.select({
           id: invoices.id,
           amount: invoices.amount,
           description: invoices.description,
           dueDate: invoices.dueDate,
           billerName: banks.name, 
           customerAccountName: bankAccounts.accountName,
           status: invoices.status,
           createdAt: invoices.createdAt
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
      }

      // Get user cards
      let userCards: any[] = [];
      if (accountIds.length > 0) {
        const rawCards = await db.select({
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

        userCards = rawCards.map((c: any) => ({
          ...c,
          cardNumber: c.cardNumber ? `•••• ${String(c.cardNumber).slice(-4)}` : null,
        }));
      }

      // Get user subscriptions with account names
      let userSubscriptions: any[] = [];
      if (accountIds.length > 0) {
        const rawUserSubscriptions = await db.select().from(subscriptions).where(
          and(
            eq(subscriptions.bankId, bankId),
            or(
              inArray(subscriptions.customerAccountId, accountIds),
              inArray(subscriptions.billerAccountId, accountIds)
            )
          )
        ).orderBy(desc(subscriptions.createdAt));

        const allSubAccountIds = Array.from(new Set(rawUserSubscriptions.flatMap(s => [s.billerAccountId, s.customerAccountId])));
        let subAccountsMap = new Map<string, string>();
        if (allSubAccountIds.length > 0) {
          const subAccRows = await db.select({ id: bankAccounts.id, name: bankAccounts.accountName }).from(bankAccounts).where(inArray(bankAccounts.id, allSubAccountIds));
          subAccRows.forEach(r => subAccountsMap.set(r.id, r.name));
        }
        userSubscriptions = rawUserSubscriptions.map((s: any) => ({
          ...s,
          billerAccountName: subAccountsMap.get(s.billerAccountId) || "Biller",
          customerAccountName: subAccountsMap.get(s.customerAccountId) || "Customer",
          isOutgoing: accountIds.includes(s.customerAccountId),
        }));
      }

      // Get user loans
      const loanConditions = [
        inArray(loans.discordId, candidateIds),
        inArray(sql`lower(${loans.discordId})`, loweredCandidateIds)
      ];
      if (accountIds.length > 0) {
        loanConditions.push(inArray(loans.accountId, accountIds));
      }

      const userLoans = await db.select()
        .from(loans)
        .where(and(eq(loans.bankId, bankId), or(...loanConditions)))
        .orderBy(desc(loans.nextPaymentDate));

      const { banks: banksTable } = await import("../../db/schema");
      const { getBankCorpName, getDepositCommand } = await import("../../lib/min_balance_service.js");
      const bankRec = await db.select().from(banksTable).where(eq(banksTable.id, bankId)).get();
      const settingsRec = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      const rawTiers = Array.isArray(settingsRec?.accountTiers) ? settingsRec.accountTiers : [];
      const bankCorpName = getBankCorpName(bankRec, settingsRec);

      const enrichedAccounts = userAccounts.map(a => {
        const tier = rawTiers.find((t: any) => t.id === a.tierId) || rawTiers.find((t: any) => t.isDefault);
        const minBalance = tier?.minBalance ? Number(tier.minBalance) : 0;
        const isBelowMinBalance = minBalance > 0 && (a.balance || 0) < minBalance;
        const deficitCents = isBelowMinBalance ? minBalance - (a.balance || 0) : 0;
        const depositDollars = Math.ceil((deficitCents || minBalance || 10000) / 100);
        const depositCommand = getDepositCommand(bankCorpName, a.accountName, depositDollars);

        return {
          ...a,
          tierName: tier?.name || null,
          minBalance,
          isBelowMinBalance,
          deficitCents,
          depositCommand,
          tierDetails: tier ? {
            name: tier.name,
            minBalance: tier.minBalance,
            monthlyFee: tier.monthlyFee,
            apyPercent: tier.apyPercent,
            creditLimit: tier.creditLimit,
          } : null,
        };
      });

      // Fetch customer notifications safely
      let userNotifications: any[] = [];
      try {
        userNotifications = await db.select()
          .from(customerNotifications)
          .where(
            and(
              eq(customerNotifications.bankId, bankId),
              or(
                inArray(customerNotifications.discordId, candidateIds),
                inArray(sql`lower(${customerNotifications.discordId})`, loweredCandidateIds)
              )
            )
          )
          .orderBy(desc(customerNotifications.createdAt))
          .limit(30);
      } catch (notifErr) {
        console.warn("[portal lookup] Notice querying notifications failed:", notifErr);
      }

      const unreadNotificationCount = userNotifications.filter(n => !n.isRead).length;

      res.json({
        isStaff,
        accounts: enrichedAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        notifications: userNotifications,
        unreadNotificationCount,
        cards: userCards,
        loans: userLoans.map((l: any) => {
          const matchedAcc = userAccounts.find(a => a.id === l.accountId);
          return {
            ...l,
            amount: l.principalAmount,
            remainingBalance: l.remainingAmount,
            accountName: matchedAcc ? matchedAcc.accountName : l.accountId,
          };
        }),
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
      console.error("[portal lookup error]:", e);
      res.status(500).json({ error: e.message || "Internal error" });
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
  const { eq, or, and, desc, inArray, sql } = await import("drizzle-orm");

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
      const loweredCandidateIds = candidateIds.map(c => c.toLowerCase());
      const memberships = await db.select().from(accountMembers).where(
        or(
          inArray(accountMembers.discordId, candidateIds),
          inArray(sql`lower(${accountMembers.discordId})`, loweredCandidateIds),
          inArray(accountMembers.mcUsername, candidateIds),
          inArray(sql`lower(${accountMembers.mcUsername})`, loweredCandidateIds),
          inArray(accountMembers.mcUuid, candidateIds)
        )
      );
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
        .limit(50);

      const referencedAccIds = Array.from(new Set(recentTxs.flatMap(t => [t.fromAccountId, t.toAccountId]).filter(Boolean))) as string[];
      const accRows = referencedAccIds.length > 0 
        ? await db.select({ id: bankAccounts.id, name: bankAccounts.accountName }).from(bankAccounts).where(inArray(bankAccounts.id, referencedAccIds))
        : [];
      const accNameMap = new Map(accRows.map(r => [r.id, r.name]));

      recentTxs = recentTxs.map(tx => ({
        ...tx,
        fromAccountName: tx.fromAccountId ? (accNameMap.get(tx.fromAccountId) || tx.fromAccountId) : "External Deposit",
        toAccountName: tx.toAccountId ? (accNameMap.get(tx.toAccountId) || tx.toAccountId) : "External Withdrawal",
      }));

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

    const { bankId, accountName, accountType, businessTaxId, businessSector, tierId: reqTierId, namingPreference } = req.body;

    if (!bankId) {
      return res.status(400).json({ error: "Bank selection is required." });
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

    // 2.3 Enforce Configurable Account Tier Limits and Mutual Exclusivity
    const userExistingAccounts = await db.select()
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.bankId, bankId),
        inArray(bankAccounts.ownerDiscordId, candidateIds),
        eq(bankAccounts.isActive, true)
      ));

    // A. Specific Tier Limit (Max accounts per citizen/entity of this tier)
    if (selectedTier && typeof selectedTier.maxAccountsPerUser === "number" && selectedTier.maxAccountsPerUser > 0) {
      const currentTierCount = userExistingAccounts.filter(a => a.tierId === selectedTier.id).length;
      if (currentTierCount >= selectedTier.maxAccountsPerUser) {
        return res.status(400).json({
          error: `Account Limit Reached: You may only hold up to ${selectedTier.maxAccountsPerUser} account(s) of the '${selectedTier.name}' tier (you currently have ${currentTierCount}).`
        });
      }
    }

    // B. Mutually Exclusive Tiers ("Only allowing one or the other")
    if (selectedTier) {
      const blockedTierIds = new Set<string>(Array.isArray(selectedTier.mutuallyExclusiveTierIds) ? selectedTier.mutuallyExclusiveTierIds : []);
      for (const existingAcc of userExistingAccounts) {
        if (!existingAcc.tierId) continue;
        const existingTier = rawAccountTiers.find((t: any) => t.id === existingAcc.tierId);
        if (!existingTier) continue;

        // Forward check: selected tier blocks existing tier
        if (blockedTierIds.has(existingTier.id)) {
          return res.status(400).json({
            error: `Policy Restriction: The '${selectedTier.name}' tier cannot be held simultaneously with '${existingTier.name}' (only one or the other is permitted). You already hold account '${existingAcc.accountName}'.`
          });
        }

        // Reverse check: existing tier blocks selected tier
        if (Array.isArray(existingTier.mutuallyExclusiveTierIds) && existingTier.mutuallyExclusiveTierIds.includes(selectedTier.id)) {
          return res.status(400).json({
            error: `Policy Restriction: Your existing tier '${existingTier.name}' prohibits opening a '${selectedTier.name}' account (only one or the other is permitted).`
          });
        }
      }
    }

    // C. Exclusivity Group (e.g. only one tier from "personal_checking_suite")
    if (selectedTier && selectedTier.exclusiveGroup) {
      for (const existingAcc of userExistingAccounts) {
        if (!existingAcc.tierId || existingAcc.tierId === selectedTier.id) continue;
        const existingTier = rawAccountTiers.find((t: any) => t.id === existingAcc.tierId);
        if (existingTier && existingTier.exclusiveGroup && existingTier.exclusiveGroup === selectedTier.exclusiveGroup) {
          return res.status(400).json({
            error: `Category Restriction: You already hold account '${existingAcc.accountName}' under the '${existingTier.name}' tier in group '${selectedTier.exclusiveGroup}'. Only one account from this category is permitted.`
          });
        }
      }
    }

    // D. Global Bank-Wide Limits
    if (!isBusiness && typeof settings?.maxPersonalAccountsPerUser === "number" && settings.maxPersonalAccountsPerUser > 0) {
      const personalCount = userExistingAccounts.filter(a => !a.accountType?.includes("business")).length;
      if (personalCount >= settings.maxPersonalAccountsPerUser) {
        return res.status(400).json({
          error: `Bank Limit Reached: Maximum of ${settings.maxPersonalAccountsPerUser} personal account(s) allowed per client at this bank.`
        });
      }
    }

    if (isBusiness && typeof settings?.maxBusinessAccountsPerUser === "number" && settings.maxBusinessAccountsPerUser > 0) {
      const bizCount = userExistingAccounts.filter(a => a.accountType?.includes("business")).length;
      if (bizCount >= settings.maxBusinessAccountsPerUser) {
        return res.status(400).json({
          error: `Bank Limit Reached: Maximum of ${settings.maxBusinessAccountsPerUser} business account(s) allowed per client at this bank.`
        });
      }
    }

    if (typeof settings?.maxTotalAccountsPerUser === "number" && settings.maxTotalAccountsPerUser > 0) {
      if (userExistingAccounts.length >= settings.maxTotalAccountsPerUser) {
        return res.status(400).json({
          error: `Bank Limit Reached: Maximum of ${settings.maxTotalAccountsPerUser} total account(s) allowed per client at this bank.`
        });
      }
    }

    // 2.5 Resolve Prefixes and Account Naming Standards
    const { users } = await import("../../db/schema");
    const userRow = await db.select().from(users).where(eq(users.discordId, primaryId)).get();
    const discordUsername = userRow?.mcUsername || (req as any).user?.username || (req as any).user?.displayName || "client";

    const configuredPrefix = isBusiness
      ? (selectedTier?.customPrefix !== undefined && selectedTier?.customPrefix !== null && selectedTier?.customPrefix !== "" ? selectedTier.customPrefix : (settings?.businessAccountPrefix || "CORP-"))
      : (selectedTier?.customPrefix !== undefined && selectedTier?.customPrefix !== null && selectedTier?.customPrefix !== "" ? selectedTier.customPrefix : (settings?.personalAccountPrefix || "ACC-"));

    const namingMode = isBusiness
      ? (selectedTier?.namingMode || settings?.businessAccountNamingMode || "business_name")
      : (selectedTier?.namingMode || settings?.personalAccountNamingMode || "custom");

    let finalAccountName = (accountName || "").trim();

    if (!isBusiness) {
      if (namingMode === "discord_username" || namingPreference === "discord") {
        finalAccountName = `${configuredPrefix}${discordUsername}`;
      } else {
        if (!finalAccountName) {
          return res.status(400).json({ error: "Account Name is required." });
        }
        if (!finalAccountName.startsWith(configuredPrefix)) {
          finalAccountName = `${configuredPrefix}${finalAccountName}`;
        }
      }
    } else {
      // Business
      const baseBiz = (finalAccountName || businessTaxId || "").trim();
      if (!baseBiz) {
        return res.status(400).json({ error: "Business / Entity Name is required." });
      }
      if (namingMode === "discord_plus_business") {
        const strippedBiz = baseBiz.startsWith(configuredPrefix) ? baseBiz.slice(configuredPrefix.length) : baseBiz;
        finalAccountName = `${configuredPrefix}${discordUsername}-${strippedBiz}`;
      } else {
        if (!baseBiz.startsWith(configuredPrefix)) {
          finalAccountName = `${configuredPrefix}${baseBiz}`;
        } else {
          finalAccountName = baseBiz;
        }
      }
    }

    // 2.9 In-Game CityCorp Provisioning vs Staff Review
    let existsInGame = false;
    let syncError: string | null = null;
    const { bankCustomers } = await import("../../db/schema");
    const customer = await db.select().from(bankCustomers).where(and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, primaryId))).get();
    const playerUuid = customer?.mcUuid || userRow?.mcUuid;

    if (settings?.autoProvisionInGame) {
      if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
        try {
          const { CityCorpClient } = await import("../../lib/citycorp_api");
          const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
          const createRes = await client.createAccount(finalAccountName);

          if (createRes.success || (createRes.message && createRes.message.includes("already exists"))) {
            existsInGame = true;
            if (playerUuid) {
              try {
                await client.addSubuser(finalAccountName, playerUuid);
              } catch (subErr) {
                console.error("[AccountRegister] Non-fatal subuser add error:", subErr);
              }
            }

            // Sync fee policy to CityCorp
            const wFee = settings.withdrawFeePercent ? (Number(settings.withdrawFeePercent) > 100 ? Number(settings.withdrawFeePercent) / 100 : Number(settings.withdrawFeePercent)) : 0;
            const dFee = settings.depositFeePercent ? (Number(settings.depositFeePercent) > 100 ? Number(settings.depositFeePercent) / 100 : Number(settings.depositFeePercent)) : 0;
            if (wFee > 0) client.setAccountFee(finalAccountName, "WITHDRAW", wFee).catch(() => {});
            if (dFee > 0) client.setAccountFee(finalAccountName, "DEPOSIT", dFee).catch(() => {});
          } else {
            syncError = createRes.message || "Failed to create CityCorp account";
          }
        } catch (ccErr: any) {
          console.error("[AccountRegister] CityCorp auto-provision error:", ccErr);
          syncError = ccErr.message || "CityCorp API error";
        }
      } else {
        syncError = "CityCorp API not configured for this bank";
      }
    } else {
      existsInGame = false;
      syncError = "Pending staff review and in-game provisioning";
    }

    // 3. Create Account
    const cleanPrefixForId = configuredPrefix ? configuredPrefix.replace(/[^a-zA-Z0-9_-]/g, '') : "ACC-";
    const id = `${cleanPrefixForId}${uuidv4().substring(0, 8).toUpperCase()}`;
    await db.insert(bankAccounts).values({
      id,
      bankId,
      ownerDiscordId: primaryId,
      accountName: finalAccountName,
      accountType: type,
      tierId: finalTierId,
      businessTaxId: type === "business" ? (businessTaxId || `CORP-${uuidv4().substring(0, 6).toUpperCase()}`) : null,
      businessSector: type === "business" ? (businessSector || "General Commerce") : null,
      balance: 0,
      isActive: true,
      existsInGame,
      syncError: existsInGame ? null : syncError,
      lastSyncedAt: existsInGame ? new Date() : null,
      createdAt: new Date()
    });

    if (existsInGame) {
      try {
        const { syncSingleAccount } = await import("../sync_jobs");
        const newlyInserted = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id)).get();
        if (newlyInserted) {
          await syncSingleAccount(newlyInserted, bank);
        }
      } catch (syncErr) {
        console.error("[AccountRegister] Post-provision sync error:", syncErr);
      }
    }

    // 3.5. Auto-Provision Credit Card if Tier specifies a Credit Limit
    let provisionedCardInfo: any = null;
    const assignedTier = finalTierId && settings?.accountTiers ? settings.accountTiers.find((t: any) => t.id === finalTierId) : null;
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
        { name: "In-Game Provisioning", value: existsInGame ? "✅ Auto-Provisioned In-Game" : "🛡️ Pending Staff Review", inline: true },
        ...(type === "business" ? [
          { name: "In-Game Corp Name", value: `\`${businessTaxId || accountName.trim()}\``, inline: true },
          { name: "Merchant Terminal ID", value: `\`${merchantInfo?.merchantId}\``, inline: true }
        ] : [])
      ]
    });

    // Minimum Maintenance Balance check and deposit guide trigger
    const { checkAndNotifyAccountMinBalance, getBankCorpName, getDepositCommand } = await import("../../lib/min_balance_service.js");
    const minBalResult = await checkAndNotifyAccountMinBalance(id, { isNewAccount: true });
    const bankCorpName = getBankCorpName(bank, settings);
    const requiredMinCents = assignedTier?.minBalance ? Number(assignedTier.minBalance) : 0;
    const initialDepositDollars = Math.ceil((requiredMinCents || 10000) / 100);
    const depositCommand = getDepositCommand(bankCorpName, accountName, initialDepositDollars);

    const successMessage = existsInGame
      ? (type === "business" ? "Business Account registered and provisioned in CityCorp in-game!" : "Personal Account opened and provisioned in CityCorp in-game!")
      : (settings?.autoProvisionInGame
          ? `Account registered on Slate. In-game provisioning notice: ${syncError || "Pending synchronization"}`
          : "Account registered successfully. Bank staff will review and provision your in-game account shortly.");

    res.json({
      success: true,
      message: successMessage,
      depositInstructions: {
        command: depositCommand,
        bankCorpName,
        accountName,
        minBalanceCents: requiredMinCents,
        recommendedDepositDollars: initialDepositDollars,
        instructions: `Run /c account deposit ${bankCorpName} ${accountName} ${initialDepositDollars} on the Minecraft server to fund your account.`
      },
      account: {
        id,
        bankId,
        accountName,
        accountType: type,
        tierId: assignedTier?.id || null,
        tierName: assignedTier?.name || null,
        minBalance: requiredMinCents,
        depositCommand,
        businessTaxId,
        businessSector,
        merchantInfo,
        existsInGame
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

    const { loanProducts } = await import("../../db/schema");
    if (!productId) {
      return res.status(400).json({ error: "Please select an active loan product to apply." });
    }
    const product = await db.select().from(loanProducts).where(
      and(eq(loanProducts.id, productId), eq(loanProducts.bankId, bankId), eq(loanProducts.isActive, true))
    ).get();
    if (!product) {
      return res.status(400).json({ error: "The selected loan product is not available or has been deactivated by bank staff." });
    }

    const loanAmountCents = Math.round(parseFloat(amount) * 100);
    if (!loanAmountCents || loanAmountCents <= 0) return res.status(400).json({ error: "Invalid loan amount" });

    if (product.minAmount && loanAmountCents < product.minAmount) {
      return res.status(400).json({ error: `Amount cannot be less than this product's minimum of $${(product.minAmount / 100).toFixed(2)}` });
    }
    if (loanAmountCents > product.maxAmount) {
      return res.status(400).json({ error: `Amount exceeds this product's maximum of $${(product.maxAmount / 100).toFixed(2)}` });
    }

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

// -----------------------------------------------------------------------------------------------------
// Business Account Members & Multi-User Operators
// -----------------------------------------------------------------------------------------------------

portalRouter.get("/api/portal/:bankId/accounts/:accountId/members", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { bankAccounts, accountMembers, banks } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");
  const { resolvePlayerIdentity } = await import("../player_resolver.js");

  try {
    const { bankId, accountId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
    if (!account) return res.status(404).json({ error: "Account not found" });

    const isMemberOrOwner = await isUserAccountOwnerOrMember(account, candidateIds);
    if (!isMemberOrOwner) return res.status(403).json({ error: "Unauthorized" });

    const isOwner = candidateIds.some(c => c === account.ownerDiscordId || c.toLowerCase() === (account.ownerDiscordId || "").toLowerCase());

    // Resolve owner's Minecraft identity
    const ownerIdentity = await resolvePlayerIdentity(account.ownerDiscordId);
    const owner = {
      identifier: account.ownerDiscordId,
      mcUsername: ownerIdentity?.mcUsername || account.ownerDiscordId,
      mcUuid: ownerIdentity?.mcUuid || null,
      discordId: ownerIdentity?.discordId || account.ownerDiscordId,
      avatarUrl: ownerIdentity?.avatarUrl || `https://mc-heads.net/avatar/${ownerIdentity?.mcUsername || "MHF_Steve"}/64`,
    };

    const rawMembers = await db.select().from(accountMembers).where(eq(accountMembers.accountId, accountId));

    const members = await Promise.all(rawMembers.map(async (m) => {
      let mcUsername = m.mcUsername;
      let mcUuid = m.mcUuid;
      let avatarUrl = mcUsername ? `https://mc-heads.net/avatar/${mcUsername}/64` : "";

      if (!mcUsername) {
        const resolved = await resolvePlayerIdentity(m.discordId);
        if (resolved) {
          mcUsername = resolved.mcUsername;
          mcUuid = resolved.mcUuid;
          avatarUrl = resolved.avatarUrl;
          db.update(accountMembers)
            .set({ mcUsername: resolved.mcUsername, mcUuid: resolved.mcUuid })
            .where(eq(accountMembers.id, m.id))
            .catch(() => {});
        }
      }

      if (!avatarUrl) {
        avatarUrl = `https://mc-heads.net/avatar/${mcUsername || "MHF_Steve"}/64`;
      }

      return {
        id: m.id,
        accountId: m.accountId,
        discordId: m.discordId,
        mcUsername: mcUsername || m.discordId,
        mcUuid: mcUuid || null,
        role: m.role,
        createdAt: m.createdAt,
        avatarUrl,
      };
    }));

    res.json({
      accountId,
      accountName: account.accountName,
      accountType: account.accountType,
      isOwner,
      ownerDiscordId: account.ownerDiscordId,
      owner,
      members,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to fetch account members" });
  }
});

portalRouter.post("/api/portal/:bankId/accounts/:accountId/members", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { bankAccounts, accountMembers, banks } = await import("../../db/schema.js");
  const { eq, and, or } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");
  const { resolvePlayerIdentity } = await import("../player_resolver.js");

  try {
    const { bankId, accountId } = req.params;
    const { minecraftUsername, username, memberDiscordId, role } = req.body;
    const targetInput = String(minecraftUsername || username || memberDiscordId || "").trim();

    if (!targetInput) {
      return res.status(400).json({ error: "Please enter a Minecraft username." });
    }
    if (!role || !["manager", "viewer"].includes(role)) {
      return res.status(400).json({ error: "Role must be 'manager' or 'viewer'" });
    }

    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
    if (!account) return res.status(404).json({ error: "Account not found" });

    const isOwner = candidateIds.some(c => c === account.ownerDiscordId || c.toLowerCase() === (account.ownerDiscordId || "").toLowerCase());
    if (!isOwner) return res.status(403).json({ error: "Only the account owner can manage operators" });

    // Optional CityCorp Client for bank
    const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    let cityCorpClient: any = undefined;
    if (bank?.corpId && bank?.corpApiUuid && bank?.corpApiKey) {
      try {
        const { CityCorpClient } = await import("../../lib/citycorp_api.js");
        cityCorpClient = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
      } catch (_) {}
    }

    // Resolve player identity
    const resolved = await resolvePlayerIdentity(targetInput, cityCorpClient);
    if (!resolved || !resolved.mcUsername) {
      return res.status(400).json({ error: `Could not find Minecraft player "${targetInput}". Please check the username.` });
    }

    // Check if player is already the owner
    const ownerIdentity = await resolvePlayerIdentity(account.ownerDiscordId, cityCorpClient);
    if (
      (ownerIdentity && ownerIdentity.mcUsername.toLowerCase() === resolved.mcUsername.toLowerCase()) ||
      (ownerIdentity?.mcUuid && resolved.mcUuid && ownerIdentity.mcUuid === resolved.mcUuid) ||
      account.ownerDiscordId.toLowerCase() === resolved.mcUsername.toLowerCase() ||
      account.ownerDiscordId === resolved.discordId
    ) {
      return res.status(400).json({ error: `${resolved.mcUsername} is already the primary owner of this account.` });
    }

    // Check if already a member
    const existing = await db.select().from(accountMembers).where(
      and(
        eq(accountMembers.accountId, accountId),
        or(
          resolved.discordId ? eq(accountMembers.discordId, resolved.discordId) : undefined,
          eq(accountMembers.mcUsername, resolved.mcUsername),
          resolved.mcUuid ? eq(accountMembers.mcUuid, resolved.mcUuid) : undefined
        )
      )
    ).get();

    if (existing) {
      await db.update(accountMembers).set({
        role,
        mcUsername: resolved.mcUsername,
        mcUuid: resolved.mcUuid || existing.mcUuid
      }).where(eq(accountMembers.id, existing.id));

      return res.json({
        success: true,
        memberId: existing.id,
        updated: true,
        mcUsername: resolved.mcUsername,
        role
      });
    }

    const id = uuidv4();
    const effectiveDiscordId = resolved.discordId || (resolved.mcUuid ? `mc_${resolved.mcUuid.replace(/-/g, "")}` : `mc:${resolved.mcUsername.toLowerCase()}`);

    await db.insert(accountMembers).values({
      id,
      accountId,
      discordId: effectiveDiscordId,
      mcUsername: resolved.mcUsername,
      mcUuid: resolved.mcUuid,
      role,
      createdAt: new Date(),
    });

    // Sync subuser into CityCorp if configured
    if (cityCorpClient && resolved.mcUuid) {
      try {
        await cityCorpClient.addSubuser(account.accountName, resolved.mcUuid);
      } catch (err) {
        console.warn("[CityCorp] addSubuser warning:", err);
      }
    }

    res.json({
      success: true,
      memberId: id,
      created: true,
      mcUsername: resolved.mcUsername,
      role
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to add operator" });
  }
});

portalRouter.delete("/api/portal/:bankId/accounts/:accountId/members/:memberId", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { bankAccounts, accountMembers, banks } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { bankId, accountId, memberId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
    if (!account) return res.status(404).json({ error: "Account not found" });

    const isOwner = candidateIds.some(c => c === account.ownerDiscordId || c.toLowerCase() === (account.ownerDiscordId || "").toLowerCase());
    if (!isOwner) return res.status(403).json({ error: "Only the account owner can remove operators" });

    const member = await db.select().from(accountMembers).where(and(eq(accountMembers.id, memberId), eq(accountMembers.accountId, accountId))).get();

    // Remove from CityCorp if configured
    if (member?.mcUuid) {
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (bank?.corpId && bank?.corpApiUuid && bank?.corpApiKey) {
        try {
          const { CityCorpClient } = await import("../../lib/citycorp_api.js");
          const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
          await client.removeSubuser(account.accountName, member.mcUuid);
        } catch (err) {
          console.warn("[CityCorp] removeSubuser warning:", err);
        }
      }
    }

    await db.delete(accountMembers).where(and(eq(accountMembers.id, memberId), eq(accountMembers.accountId, accountId)));
    res.json({ success: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to remove operator" });
  }
});

// -----------------------------------------------------------------------------------------------------
// Customer Subscriptions & Recurring Mandates
// -----------------------------------------------------------------------------------------------------

portalRouter.post("/api/portal/:bankId/subscriptions", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { subscriptions, bankAccounts } = await import("../../db/schema.js");
  const { eq, and, or } = await import("drizzle-orm");

  try {
    const { bankId } = req.params;
    const { customerAccountId, billerQuery, amount, frequency, description } = req.body;
    if (!customerAccountId || !billerQuery || !amount) {
      return res.status(400).json({ error: "Missing required fields (account, payee, amount)" });
    }

    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const myAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, customerAccountId), eq(bankAccounts.bankId, bankId))).get();
    if (!myAccount || !(await isUserAccountOwnerOrMember(myAccount, candidateIds))) {
      return res.status(403).json({ error: "Unauthorized account selection" });
    }

    // Resolve biller account
    let billerAccount = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.bankId, bankId),
        or(
          eq(bankAccounts.id, billerQuery),
          eq(bankAccounts.accountName, billerQuery)
        )
      )
    ).get();

    if (!billerAccount) {
      const allAccs = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
      billerAccount = allAccs.find(a => a.accountName.toLowerCase() === String(billerQuery).trim().toLowerCase()) || undefined;
    }

    if (!billerAccount) {
      return res.status(404).json({ error: `Payee account "${billerQuery}" not found at this bank` });
    }

    if (billerAccount.id === myAccount.id) {
      return res.status(400).json({ error: "Cannot create a subscription mandate to the same account" });
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const freq = frequency === "weekly" ? "weekly" : "monthly";
    const nextRun = new Date();
    if (freq === "weekly") nextRun.setDate(nextRun.getDate() + 7);
    else nextRun.setMonth(nextRun.getMonth() + 1);

    const id = `sub_${Date.now()}_${randomInt(1000, 9999)}`;
    await db.insert(subscriptions).values({
      id,
      bankId,
      billerAccountId: billerAccount.id,
      customerAccountId: myAccount.id,
      amount: amountCents,
      frequency: freq,
      nextRun,
      isActive: true,
      description: description || "Recurring Subscription",
      createdAt: new Date(),
    });

    res.json({ success: true, id, nextRun });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to create subscription" });
  }
});

portalRouter.post("/api/portal/:bankId/subscriptions/:id/toggle", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { subscriptions, bankAccounts } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { bankId, id } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const sub = await db.select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.bankId, bankId))).get();
    if (!sub) return res.status(404).json({ error: "Subscription not found" });

    // Check authorization: caller must own or be member of either customerAccountId or billerAccountId
    const custAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.customerAccountId)).get();
    const billAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.billerAccountId)).get();

    const canManageCust = custAcc && (await isUserAccountOwnerOrMember(custAcc, candidateIds));
    const canManageBill = billAcc && (await isUserAccountOwnerOrMember(billAcc, candidateIds));

    if (!canManageCust && !canManageBill) {
      return res.status(403).json({ error: "Unauthorized to manage this subscription" });
    }

    const nextState = !sub.isActive;
    await db.update(subscriptions).set({ isActive: nextState }).where(eq(subscriptions.id, sub.id));
    res.json({ success: true, isActive: nextState });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to toggle subscription" });
  }
});

// -----------------------------------------------------------------------------------------------------
// Split the Bill (Multi-Participant Invoicing)
// -----------------------------------------------------------------------------------------------------

portalRouter.post("/api/portal/:bankId/split-bill", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { invoices, bankAccounts } = await import("../../db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { bankId } = req.params;
    const { fromAccountId, description, splits } = req.body;
    if (!fromAccountId || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ error: "Missing required split details (account, splits)" });
    }

    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const myAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bankId))).get();
    if (!myAccount || !(await isUserAccountOwnerOrMember(myAccount, candidateIds))) {
      return res.status(403).json({ error: "Unauthorized recipient account selection" });
    }

    const allBankAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
    const createdInvoices: any[] = [];
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    for (const split of splits) {
      const targetQuery = (split.target || "").trim();
      const splitAmount = parseFloat(split.amount);
      if (!targetQuery || isNaN(splitAmount) || splitAmount <= 0) continue;

      let targetAccount = allBankAccounts.find(a => 
        a.id === targetQuery || 
        a.accountName.toLowerCase() === targetQuery.toLowerCase()
      );

      if (!targetAccount) {
        return res.status(404).json({ error: `Could not find account "${targetQuery}" at this bank` });
      }

      if (targetAccount.id === myAccount.id) {
        return res.status(400).json({ error: "Cannot send a split bill invoice to yourself" });
      }

      const invId = `inv_${Date.now()}_${randomInt(1000, 9999)}`;
      const amountCents = Math.round(splitAmount * 100);
      const splitDesc = description ? `Split: ${description}` : `Split bill (${myAccount.accountName})`;

      await db.insert(invoices).values({
        id: invId,
        bankId,
        billerAccountId: myAccount.id,
        customerAccountId: targetAccount.id,
        amount: amountCents,
        description: splitDesc,
        dueDate,
        status: "pending",
        createdAt: new Date(),
      });

      createdInvoices.push({
        id: invId,
        targetAccountName: targetAccount.accountName,
        amountCents,
      });
    }

    if (createdInvoices.length === 0) {
      return res.status(400).json({ error: "No valid participants with positive split amounts were provided" });
    }

    res.json({
      success: true,
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to create split bill requests" });
  }
});

// ==========================================
// PORTAL ESCROW ENDPOINTS FOR CUSTOMERS
// ==========================================

portalRouter.get("/api/portal/:bankId/escrows", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { escrows, bankAccounts, banks } = await import("../../db/schema");
  const { eq, or, and, inArray, desc, sql, isNull } = await import("drizzle-orm");
  const { alias } = await import("drizzle-orm/sqlite-core");

  try {
    const { bankId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    if (candidateIds.length === 0) return res.json({ escrows: [] });
    const loweredCandidateIds = candidateIds.map(c => c.toLowerCase());

    const userAccounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(
      and(
        eq(bankAccounts.bankId, bankId),
        or(
          inArray(bankAccounts.ownerDiscordId, candidateIds),
          inArray(sql`lower(${bankAccounts.ownerDiscordId})`, loweredCandidateIds)
        ),
        or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
      )
    );
    const userAccountIds = userAccounts.map(a => a.id);
    if (userAccountIds.length === 0) return res.json({ escrows: [] });

    const buyerAcc = alias(bankAccounts, "buyer_account");
    const sellerAcc = alias(bankAccounts, "seller_account");

    const list = await db.select({
      id: escrows.id,
      bankId: escrows.bankId,
      amount: escrows.amount,
      status: escrows.status,
      description: escrows.description,
      contractUrl: escrows.contractUrl,
      contractText: escrows.contractText,
      clientSignedAt: escrows.clientSignedAt,
      createdAt: escrows.createdAt,
      buyerAccountId: escrows.buyerAccountId,
      buyerAccountName: buyerAcc.accountName,
      buyerDiscordId: buyerAcc.ownerDiscordId,
      sellerAccountId: escrows.sellerAccountId,
      sellerAccountName: sellerAcc.accountName,
      sellerDiscordId: sellerAcc.ownerDiscordId,
    })
    .from(escrows)
    .innerJoin(buyerAcc, eq(escrows.buyerAccountId, buyerAcc.id))
    .innerJoin(sellerAcc, eq(escrows.sellerAccountId, sellerAcc.id))
    .where(
      and(
        eq(escrows.bankId, bankId),
        or(
          inArray(escrows.buyerAccountId, userAccountIds),
          inArray(escrows.sellerAccountId, userAccountIds)
        )
      )
    )
    .orderBy(desc(escrows.createdAt))
    .all();

    res.json({ escrows: list });
  } catch (e: any) {
    console.error("Error fetching portal escrows:", e);
    res.status(500).json({ error: e.message || "Failed to load escrow agreements" });
  }
});

portalRouter.post("/api/portal/:bankId/escrows", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { escrows, bankAccounts, banks } = await import("../../db/schema");
  const { eq, and, or, inArray } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const { bankId } = req.params;
    const { buyerAccountId, sellerIdentifier, amount, description, contractText, autoFund } = req.body;

    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    if (candidateIds.length === 0) return res.status(401).json({ error: "Unauthorized" });

    const buyer = await db.select().from(bankAccounts).where(
      and(eq(bankAccounts.id, buyerAccountId), eq(bankAccounts.bankId, bankId))
    ).get();

    if (!buyer || !(await isUserAccountOwnerOrMember(buyer, candidateIds))) {
      return res.status(403).json({ error: "You can only initiate escrow from an account you own or operate." });
    }

    const cleanSeller = String(sellerIdentifier || "").trim();
    if (!cleanSeller) {
      return res.status(400).json({ error: "Seller counterparty account or handle is required." });
    }

    const { resolveEscrowCounterpartyAccount } = await import("../../lib/account_lookup.js");
    const sellerResult = await resolveEscrowCounterpartyAccount(cleanSeller, { bankId, excludeAccountId: buyer.id });
    if (!sellerResult.account) {
      return res.status(404).json({ error: sellerResult.error || `Could not locate seller counterparty "${cleanSeller}" at this bank.` });
    }
    const seller = sellerResult.account;

    if (seller.id === buyer.id) {
      return res.status(400).json({ error: "Buyer and Seller cannot be the exact same account." });
    }

    const amountCents = Math.round(parseFloat(amount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: "Invalid escrow amount. Must be positive." });
    }

    const escrowId = `esc_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const shouldAutoFund = Boolean(autoFund);

    if (shouldAutoFund && buyer.balance < amountCents) {
      return res.status(400).json({ error: `Insufficient funds to auto-fund escrow. Account balance is $${(buyer.balance / 100).toFixed(2)}.` });
    }

    let initialStatus = "pending";

    if (shouldAutoFund) {
      const { holdInSystemAccount } = await import("../../lib/citycorp_money");
      await holdInSystemAccount({
        fromAccount: buyer,
        amountCents,
        systemAccountName: "ESCROW",
        systemCategory: "escrow",
        description: `Customer Escrow Hold: ${description || escrowId}`,
        type: "escrow",
      });
      initialStatus = "funded";
    }

    await db.insert(escrows).values({
      id: escrowId,
      bankId,
      buyerAccountId: buyer.id,
      sellerAccountId: seller.id,
      amount: amountCents,
      description: description || "Peer-to-Peer Escrow Hold",
      status: initialStatus,
      contractText: contractText || null,
      clientSignedAt: shouldAutoFund ? new Date() : null,
      createdAt: new Date(),
    });

    res.json({
      success: true,
      escrowId,
      status: initialStatus,
      message: shouldAutoFund ? "Escrow created and funds securely locked in bank custody!" : "Escrow agreement drafted. Buyer must fund to lock custody."
    });
  } catch (e: any) {
    console.error("Error creating portal escrow:", e);
    res.status(500).json({ error: e.message || "Failed to create escrow agreement" });
  }
});

portalRouter.post("/api/portal/:bankId/escrows/:escrowId/fund", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { escrows, bankAccounts } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { bankId, escrowId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const escrow = await db.select().from(escrows).where(
      and(eq(escrows.id, escrowId), eq(escrows.bankId, bankId))
    ).get();

    if (!escrow) return res.status(404).json({ error: "Escrow agreement not found" });
    if (escrow.status !== "pending") return res.status(400).json({ error: `Escrow is already ${escrow.status}` });

    const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
    if (!buyer || !(await isUserAccountOwnerOrMember(buyer, candidateIds))) {
      return res.status(403).json({ error: "Only the buyer can fund this escrow agreement." });
    }

    if (buyer.balance < escrow.amount) {
      return res.status(400).json({ error: `Insufficient balance ($${(buyer.balance / 100).toFixed(2)}) to fund $${(escrow.amount / 100).toFixed(2)}.` });
    }

    const { holdInSystemAccount } = await import("../../lib/citycorp_money");
    await holdInSystemAccount({
      fromAccount: buyer,
      amountCents: escrow.amount,
      systemAccountName: "ESCROW",
      systemCategory: "escrow",
      description: `Escrow Funded: ${escrow.description || escrow.id}`,
      type: "escrow",
    });

    await db.update(escrows).set({
      status: "funded",
      clientSignedAt: new Date(),
    }).where(eq(escrows.id, escrow.id));

    res.json({ success: true, status: "funded", message: "Funds locked into secure bank escrow custody." });
  } catch (e: any) {
    console.error("Error funding escrow:", e);
    res.status(500).json({ error: e.message || "Failed to fund escrow agreement" });
  }
});

portalRouter.post("/api/portal/:bankId/escrows/:escrowId/release", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { escrows, bankAccounts } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { bankId, escrowId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const escrow = await db.select().from(escrows).where(
      and(eq(escrows.id, escrowId), eq(escrows.bankId, bankId))
    ).get();

    if (!escrow) return res.status(404).json({ error: "Escrow agreement not found" });
    if (escrow.status !== "funded") return res.status(400).json({ error: `Escrow is not in funded custody (status: ${escrow.status})` });

    const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
    if (!buyer || !(await isUserAccountOwnerOrMember(buyer, candidateIds))) {
      return res.status(403).json({ error: "Only the buyer who locked the funds can authorize immediate release." });
    }

    const seller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.sellerAccountId)).get();
    if (!seller) return res.status(404).json({ error: "Seller destination account not found" });

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

    res.json({ success: true, status: "released", message: "Escrow funds successfully released to seller!" });
  } catch (e: any) {
    console.error("Error releasing escrow:", e);
    res.status(500).json({ error: e.message || "Failed to release escrow" });
  }
});

portalRouter.post("/api/portal/:bankId/escrows/:escrowId/refund", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { escrows, bankAccounts } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");

  try {
    const { bankId, escrowId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const escrow = await db.select().from(escrows).where(
      and(eq(escrows.id, escrowId), eq(escrows.bankId, bankId))
    ).get();

    if (!escrow) return res.status(404).json({ error: "Escrow agreement not found" });
    if (escrow.status !== "funded") return res.status(400).json({ error: `Escrow is not funded (status: ${escrow.status})` });

    const seller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.sellerAccountId)).get();
    if (!seller || !(await isUserAccountOwnerOrMember(seller, candidateIds))) {
      return res.status(403).json({ error: "Only the seller can voluntarily surrender and refund locked escrow funds." });
    }

    const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
    if (!buyer) return res.status(404).json({ error: "Buyer destination account not found" });

    const { releaseFromSystemAccount } = await import("../../lib/citycorp_money");
    await releaseFromSystemAccount({
      toAccount: buyer,
      amountCents: escrow.amount,
      systemAccountName: "ESCROW",
      systemCategory: "escrow",
      description: `Escrow Voluntarily Refunded: ${escrow.description || escrow.id}`,
      type: "escrow",
    });

    await db.update(escrows).set({ status: "refunded" }).where(eq(escrows.id, escrow.id));

    res.json({ success: true, status: "refunded", message: "Escrow funds refunded back to buyer." });
  } catch (e: any) {
    console.error("Error refunding escrow:", e);
    res.status(500).json({ error: e.message || "Failed to refund escrow" });
  }
});

portalRouter.post("/api/portal/:bankId/escrows/:escrowId/cancel", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { escrows, bankAccounts } = await import("../../db/schema");
  const { eq, and, or } = await import("drizzle-orm");

  try {
    const { bankId, escrowId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const escrow = await db.select().from(escrows).where(
      and(eq(escrows.id, escrowId), eq(escrows.bankId, bankId))
    ).get();

    if (!escrow) return res.status(404).json({ error: "Escrow agreement not found" });
    if (escrow.status !== "pending") {
      return res.status(400).json({ error: "Only pending (unfunded) escrow agreements can be cancelled directly. Funded escrows must be released or refunded." });
    }

    const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
    const seller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.sellerAccountId)).get();

    const isBuyerOwner = buyer && (await isUserAccountOwnerOrMember(buyer, candidateIds));
    const isSellerOwner = seller && (await isUserAccountOwnerOrMember(seller, candidateIds));

    if (!isBuyerOwner && !isSellerOwner) {
      return res.status(403).json({ error: "You are not a participant in this escrow agreement." });
    }

    await db.delete(escrows).where(eq(escrows.id, escrow.id));

    res.json({ success: true, message: "Pending escrow agreement was cancelled and deleted." });
  } catch (e: any) {
    console.error("Error cancelling escrow:", e);
    res.status(500).json({ error: e.message || "Failed to cancel escrow" });
  }
});

// ==========================================
// CUSTOMER SUPPORT TICKETS & DISPUTES
// ==========================================

portalRouter.get("/api/portal/:bankId/tickets", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { supportTickets, ticketMessages } = await import("../../db/schema");
  const { eq, and, desc, inArray, or, sql } = await import("drizzle-orm");

  try {
    const { bankId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const loweredCandidateIds = candidateIds.map(c => c.toLowerCase());

    const tickets = await db.select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.bankId, bankId),
          or(
            inArray(supportTickets.discordId, candidateIds),
            inArray(sql`lower(${supportTickets.discordId})`, loweredCandidateIds)
          )
        )
      )
      .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.createdAt));

    // Also fetch message counts or preview for each ticket
    const ticketIds = tickets.map(t => t.id);
    let messages: any[] = [];
    if (ticketIds.length > 0) {
      messages = await db.select()
        .from(ticketMessages)
        .where(inArray(ticketMessages.ticketId, ticketIds))
        .orderBy(ticketMessages.createdAt);
    }

    const ticketsWithMessages = tickets.map(t => ({
      ...t,
      messages: messages.filter(m => m.ticketId === t.id),
      messageCount: messages.filter(m => m.ticketId === t.id).length,
    }));

    res.json(ticketsWithMessages);
  } catch (e: any) {
    console.error("Error fetching customer tickets:", e);
    res.status(500).json({ error: e.message || "Failed to fetch support tickets" });
  }
});

portalRouter.post("/api/portal/:bankId/tickets", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { supportTickets, ticketMessages, bankCustomers } = await import("../../db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const { bankId } = req.params;
    const { subject, description, category, priority, accountId, transactionId, escrowId, initialMessage } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: "Ticket subject is required" });
    }

    const discordId = (req as any).user?.discordId || (req as any).user?.id;
    if (!discordId) return res.status(401).json({ error: "Unauthorized" });

    // Lookup customer MC username
    const customer = await db.select().from(bankCustomers).where(
      and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
    ).get();

    const mcUsername = customer?.mcUsername || (req as any).user?.username || null;
    const ticketId = `tkt_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const now = new Date();

    const newTicket = await db.insert(supportTickets).values({
      id: ticketId,
      bankId,
      discordId,
      mcUsername,
      subject: subject.trim(),
      description: description ? description.trim() : null,
      category: category || "general",
      priority: priority || "medium",
      status: "open",
      accountId: accountId || null,
      transactionId: transactionId || null,
      escrowId: escrowId || null,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    // Create initial message if provided
    const msgText = initialMessage ? initialMessage.trim() : (description ? description.trim() : subject.trim());
    const firstMsg = await db.insert(ticketMessages).values({
      id: uuidv4(),
      ticketId,
      senderDiscordId: discordId,
      senderName: mcUsername || (req as any).user?.username || "Customer",
      senderRole: "customer",
      message: msgText,
      createdAt: now,
    }).returning().get();

    res.json({ ...newTicket, messages: [firstMsg], messageCount: 1 });
  } catch (e: any) {
    console.error("Error creating customer ticket:", e);
    res.status(500).json({ error: e.message || "Failed to create support ticket" });
  }
});

portalRouter.post("/api/portal/:bankId/tickets/:ticketId/messages", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { supportTickets, ticketMessages, bankCustomers } = await import("../../db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");
  const { v4: uuidv4 } = await import("uuid");

  try {
    const { bankId, ticketId } = req.params;
    const { message, attachmentUrl } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message content cannot be empty" });
    }

    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const ticket = await db.select().from(supportTickets).where(
      and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.bankId, bankId),
        inArray(supportTickets.discordId, candidateIds)
      )
    ).get();

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }

    if (ticket.status === "closed") {
      // Reopen ticket if customer replies
      await db.update(supportTickets).set({
        status: "in_progress",
        updatedAt: new Date(),
      }).where(eq(supportTickets.id, ticketId));
    } else {
      await db.update(supportTickets).set({
        updatedAt: new Date(),
      }).where(eq(supportTickets.id, ticketId));
    }

    const discordId = (req as any).user?.discordId || (req as any).user?.id;
    const customer = await db.select().from(bankCustomers).where(
      and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
    ).get();

    const senderName = customer?.mcUsername || (req as any).user?.username || "Customer";
    const now = new Date();

    const newMsg = await db.insert(ticketMessages).values({
      id: uuidv4(),
      ticketId,
      senderDiscordId: discordId,
      senderName,
      senderRole: "customer",
      message: message.trim(),
      attachmentUrl: attachmentUrl || null,
      createdAt: now,
    }).returning().get();

    res.json(newMsg);
  } catch (e: any) {
    console.error("Error posting ticket message:", e);
    res.status(500).json({ error: e.message || "Failed to post message" });
  }
});

portalRouter.post("/api/portal/:bankId/tickets/:ticketId/close", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { supportTickets } = await import("../../db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");

  try {
    const { bankId, ticketId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    const ticket = await db.select().from(supportTickets).where(
      and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.bankId, bankId),
        inArray(supportTickets.discordId, candidateIds)
      )
    ).get();

    if (!ticket) return res.status(404).json({ error: "Support ticket not found" });

    const now = new Date();
    await db.update(supportTickets).set({
      status: "closed",
      resolvedAt: now,
      updatedAt: now,
    }).where(eq(supportTickets.id, ticketId));

    res.json({ success: true, status: "closed" });
  } catch (e: any) {
    console.error("Error closing ticket:", e);
    res.status(500).json({ error: e.message || "Failed to close ticket" });
  }
});

// Customer Notifications Endpoints
portalRouter.get("/api/portal/:bankId/notifications", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { customerNotifications } = await import("../../db/schema");
  const { eq, and, inArray, desc, or, sql } = await import("drizzle-orm");

  try {
    const { bankId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);
    const loweredCandidateIds = candidateIds.map(c => c.toLowerCase());

    const notifs = await db.select()
      .from(customerNotifications)
      .where(
        and(
          eq(customerNotifications.bankId, bankId),
          or(
            inArray(customerNotifications.discordId, candidateIds),
            inArray(sql`lower(${customerNotifications.discordId})`, loweredCandidateIds)
          )
        )
      )
      .orderBy(desc(customerNotifications.createdAt))
      .limit(50);

    const unreadCount = notifs.filter(n => !n.isRead).length;

    res.json({ notifications: notifs, unreadCount });
  } catch (e: any) {
    console.error("Error fetching customer notifications:", e);
    res.status(500).json({ error: e.message || "Failed to fetch notifications" });
  }
});

portalRouter.post("/api/portal/:bankId/notifications/:id/read", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { customerNotifications } = await import("../../db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");

  try {
    const { bankId, id } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    await db.update(customerNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(customerNotifications.id, id),
          eq(customerNotifications.bankId, bankId),
          inArray(customerNotifications.discordId, candidateIds)
        )
      );

    res.json({ success: true });
  } catch (e: any) {
    console.error("Error marking notification read:", e);
    res.status(500).json({ error: e.message || "Failed to update notification" });
  }
});

portalRouter.post("/api/portal/:bankId/notifications/read-all", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index");
  const { customerNotifications } = await import("../../db/schema");
  const { eq, and, inArray } = await import("drizzle-orm");

  try {
    const { bankId } = req.params;
    const candidateIds = await getUserCandidateIdentifiers(req, bankId);

    await db.update(customerNotifications)
      .set({ isRead: true })
      .where(
        and(
          eq(customerNotifications.bankId, bankId),
          inArray(customerNotifications.discordId, candidateIds)
        )
      );

    res.json({ success: true });
  } catch (e: any) {
    console.error("Error marking all notifications read:", e);
    res.status(500).json({ error: e.message || "Failed to update notifications" });
  }
});


