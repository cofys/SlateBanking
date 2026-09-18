import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const v1Router = express.Router();

v1Router.get("/api/v1/accounts", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bank.id));
       res.json({ data: accounts });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

v1Router.post("/api/v1/accounts", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const bank = (req as any).bank;

    try {
       const { discordId, initialDeposit, type, accountName } = req.body;
       if (!discordId) return res.status(400).json({ error: "missing discordId" });

       if (initialDeposit !== undefined && initialDeposit !== null && String(initialDeposit).trim() !== "") {
         return res.status(400).json({ error: "Funds must be deposited via CityCorp / teller / transfer." });
       }

       const id = uuidv4();
       const finalName = accountName || `${type === 'savings' ? 'Savings' : 'Checking'} Account`;

       if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
         const { CityCorpClient } = await import("../../lib/citycorp_api");
         const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
         const created = await client.createAccount(finalName);
         if (created && created.success === false && !String(created.message || created.error || "").toLowerCase().includes("already")) {
           return res.status(400).json({ error: created.message || created.error || "CityCorp create failed" });
         }
       }
       
       await db.insert(bankAccounts).values({
         id,
         bankId: bank.id,
         ownerDiscordId: discordId,
         accountType: type || "checking",
         balance: 0,
         accountName: finalName,
         isActive: true,
         createdAt: new Date()
       });

       const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id));
       res.json({ data: acc });

    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

v1Router.get("/api/v1/accounts/:accountId", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts } = await import("../../db/schema");
    const { and, eq } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const [account] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, req.params.accountId), eq(bankAccounts.bankId, bank.id)));
       if (!account) return res.status(404).json({ error: "Account not found" });
       res.json({ data: account });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

v1Router.post("/api/v1/transfers", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
      const { fromAccountId, toAccountId, amount, description } = req.body;
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        return res.status(400).json({ error: "Invalid account selection" });
      }

      const amnt = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(amnt) || amnt <= 0) return res.status(400).json({ error: "Invalid amount" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bank.id))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found" });
      if (!sourceAccount.isActive || sourceAccount.isFrozen) return res.status(400).json({ error: "Source account is inactive or frozen" });
      if (sourceAccount.balance < amnt) return res.status(400).json({ error: `Insufficient funds.` });

      const [destAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, toAccountId), eq(bankAccounts.bankId, bank.id))
      );
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });
      if (!destAccount.isActive || destAccount.isFrozen) return res.status(400).json({ error: "Destination account is inactive or frozen" });

      const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money");
      const moved = await executeSameBankBookTransfer({
        sourceAccount,
        destAccount,
        desiredCents: amnt,
        mode: "from_payment",
        description: description || `API Transfer to ${toAccountId.substring(0, 8)}`,
        type: "transfer",
      });

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, moved.txId));
      res.json({ data: tx });
    } catch (e: any) {
      console.error(e);
      if (e?.name === "MoneyRailError") {
        return res.status(400).json({ error: e.message || "Transfer failed" });
      }
      res.status(500).json({ error: "Internal error" });
    }
  });

v1Router.get("/api/v1/transactions", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions } = await import("../../db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const txs = await db.select().from(transactions).where(eq(transactions.bankId, bank.id)).orderBy(desc(transactions.timestamp)).limit(50);
       res.json({ data: txs });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

v1Router.get("/api/v1/cards", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bank.id));
       if (accounts.length === 0) return res.json({ data: [] });

       const accountIds = accounts.map(a => a.id);
       const bankCards = await db.select().from(cards).where(inArray(cards.accountId, accountIds));
       const safeCards = bankCards.map(c => {
           const { cvv, ...safeCard } = c;
           return safeCard;
       });
       res.json({ data: safeCards });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

v1Router.post("/api/v1/cards", authenticateApiRequest, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const bank = (req as any).bank;

    try {
       const { accountId, type } = req.body;
       const [account] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bank.id)));
       if (!account) return res.status(404).json({ error: "Account not found or does not belong to this bank" });

       let cardNumber = "";
              for(let i=0; i<16; i++) cardNumber += randomInt(0, 10).toString();
              const cvv = randomInt(100, 1000).toString();
       const expiryDate = `${new Date().getMonth() + 1}/${new Date().getFullYear() + 3 - 2000}`;

       const cardId = uuidv4();
       await db.insert(cards).values({
         id: cardId,
         bankId: bank.id,
         accountId,
         type: type === 'credit' ? 'credit' : 'debit',
         cardNumber,
         cvv,
         expiryDate,
         isLocked: false,
         createdAt: new Date()
       });

       const [newCard] = await db.select().from(cards).where(eq(cards.id, cardId));
       res.json({ data: newCard });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });
