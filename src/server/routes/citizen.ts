import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const citizenRouter = express.Router();


citizenRouter.get("/api/citizen/lookup", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { banks, bankAccounts, transactions, invoices, cards, loans, bankSettings, accountMembers } = await import("../../db/schema.js");
    const { eq, or, inArray, desc } = await import("drizzle-orm");

    try {
      const discordId = (req as any).user.discordId;

      // 1. Direct owned accounts
      const ownedAccounts = await db.select({
        id: bankAccounts.id,
        bankId: bankAccounts.bankId,
        bankName: banks.name,
        accountName: bankAccounts.accountName,
        type: bankAccounts.accountType,
        balance: bankAccounts.balance,
        isActive: bankAccounts.isActive,
        isFrozen: bankAccounts.isFrozen,
        ownerDiscordId: bankAccounts.ownerDiscordId,
      })
      .from(bankAccounts)
      .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
      .where(eq(bankAccounts.ownerDiscordId, discordId));

      // 2. Member accounts (Joint / Corporate)
      const memberships = await db.select().from(accountMembers).where(eq(accountMembers.discordId, discordId));
      const memberAccountIds = memberships.map(m => m.accountId);

      let memberAccounts: any[] = [];
      if (memberAccountIds.length > 0) {
        memberAccounts = await db.select({
          id: bankAccounts.id,
          bankId: bankAccounts.bankId,
          bankName: banks.name,
          accountName: bankAccounts.accountName,
          type: bankAccounts.accountType,
          balance: bankAccounts.balance,
          isActive: bankAccounts.isActive,
          isFrozen: bankAccounts.isFrozen,
          ownerDiscordId: bankAccounts.ownerDiscordId,
        })
        .from(bankAccounts)
        .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
        .where(inArray(bankAccounts.id, memberAccountIds));
      }

      // Combine accounts
      const allAccountsMap = new Map<string, any>();
      ownedAccounts.forEach(a => {
        allAccountsMap.set(a.id, { ...a, userRole: "owner" });
      });
      memberAccounts.forEach(a => {
        if (!allAccountsMap.has(a.id)) {
          const m = memberships.find(mem => mem.accountId === a.id);
          allAccountsMap.set(a.id, { ...a, userRole: m?.role || "viewer" });
        }
      });

      const userAccounts = Array.from(allAccountsMap.values());

      if (userAccounts.length === 0) {
         return res.json({ accounts: [], transactions: [], invoices: [], cards: [], loans: [], banksConfig: {} });
      }

      const accountIds = userAccounts.map(a => a.id);

      // Fetch members for owned accounts
      const allAccountMembers = await db.select().from(accountMembers).where(inArray(accountMembers.accountId, accountIds));
      userAccounts.forEach(a => {
        a.members = allAccountMembers.filter(m => m.accountId === a.id);
      });

      const recentTxs = await db.select()
        .from(transactions)
        .where(or(
          inArray(transactions.fromAccountId, accountIds),
          inArray(transactions.toAccountId, accountIds)
        ))
        .orderBy(desc(transactions.timestamp))
        .limit(100);

      const userInvoices = await db.select()
        .from(invoices)
        .where(inArray(invoices.customerAccountId, accountIds))
        .orderBy(desc(invoices.createdAt));
        
      const userCards = await db.select()
        .from(cards)
        .where(inArray(cards.accountId, accountIds));
        
      const userLoans = await db.select()
        .from(loans)
        .where(eq(loans.discordId, discordId));

      const uniqueBankIds = [...new Set(userAccounts.map(a => a.bankId))];
      const settings = uniqueBankIds.length > 0 ? await db.select().from(bankSettings).where(inArray(bankSettings.bankId, uniqueBankIds)) : [];
      
      const banksConfig = uniqueBankIds.reduce((acc: any, bId: string) => {
         const set = settings.find(s => s.bankId === bId);
         acc[bId] = {
            vaultTiers: set?.vaultTiers || [{"lockDays":7,"interestRate":100,"penaltyPercent":20},{"lockDays":30,"interestRate":300,"penaltyPercent":20},{"lockDays":90,"interestRate":500,"penaltyPercent":20},{"lockDays":180,"interestRate":800,"penaltyPercent":20},{"lockDays":365,"interestRate":1200,"penaltyPercent":20}]
         };
         return acc;
      }, {});

      res.json({
        banksConfig,
        accounts: userAccounts,
        transactions: recentTxs,
        invoices: userInvoices,
        cards: userCards,
        loans: userLoans
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});


citizenRouter.post("/api/citizen/loans/apply", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { loans, bankSettings, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { bankId, accountId, principalAmount, purpose, collateralDescription, collateralValue } = req.body; const discordId = (req as any).user.discordId;
      if (!bankId || !discordId || !accountId || !principalAmount) return res.status(400).json({ error: "Missing fields" });

      const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      if (!account || account.ownerDiscordId !== discordId || account.bankId !== bankId) {
        return res.status(403).json({ error: "Unauthorized account" });
      }

      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      if (!settings || !settings.enableLoans) return res.status(400).json({ error: "Loans are disabled for this bank" });

      const autoApprove = settings.autoApproveLoans && principalAmount <= (settings.maxAutoApproveLoanAmount || 0);

      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 30); // Need payment in 30 days
      
      const loanId = uuidv4();
      
      let contractUrl: string | null = null;
      if (settings?.enableGoogleDocsContracts) {
        const { banks } = await import("../../db/schema");
        const bankRec = await db.select().from(banks).where(eq(banks.id, bankId)).get();
        const { generateContractUrl } = await import("../../lib/google_docs_contracts");
        contractUrl = generateContractUrl(settings.googleDocsLoanTemplateUrl, {
          bankName: bankRec?.name || "Slate Bank",
          clientDiscordId: discordId,
          contractType: 'loan',
          contractId: loanId,
          amount: principalAmount,
          interestRate: 500,
          purpose
        });
      }

      const colVal = collateralValue ? Math.round(parseFloat(collateralValue) * 100) : null;
      const colStatus = collateralDescription ? "pledged" : "none";

      await db.insert(loans).values({
        id: loanId,
        bankId,
        discordId,
        accountId,
        principalAmount,
        remainingAmount: principalAmount,
        interestRate: 500, // Defaulting to 5% APR
        nextPaymentDate,
        purpose,
        collateralDescription: collateralDescription || null,
        collateralValue: colVal,
        collateralStatus: colStatus,
        status: autoApprove ? "approved" : "pending",
        contractUrl,
        createdAt: new Date(),
      });

      if (autoApprove) {
         // Auto fund
         const ts = new Date();
         await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${principalAmount}` }).where(eq(bankAccounts.id, accountId));
         await db.insert(transactions).values({
            id: uuidv4(),
            bankId,
            fromAccountId: null,
            toAccountId: accountId,
            type: "deposit",
            amount: principalAmount,
            description: `Auto-Approved Loan Disbursement (Principal: $${(principalAmount/100).toFixed(2)})`,
            timestamp: ts
         });
         await db.update(loans).set({ status: "active" }).where(eq(loans.id, loanId));
      }

      const { botManager } = await import("../../lib/bot_manager");
      botManager.sendNotification(bankId, `New Loan Application: \nDiscord ID: ${discordId}\nAmount: $${(principalAmount/100).toFixed(2)}\nPurpose: ${purpose || 'None specified'}\nStatus: ${autoApprove ? 'Auto-Approved' : 'Pending Review'}`);

      res.json({ success: true, autoApprove });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

citizenRouter.post("/api/citizen/credit/apply", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { creditApplications, bankSettings, cards, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
       const { bankId, accountId, requestedLimit, monthlyIncome, purpose } = req.body; const discordId = (req as any).user.discordId;
       if (!bankId || !discordId || !accountId || !requestedLimit || !monthlyIncome) return res.status(400).json({ error: "Missing fields" });

       const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
       if (!account || account.ownerDiscordId !== discordId || account.bankId !== bankId) {
         return res.status(403).json({ error: "Unauthorized account" });
       }

       const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
       if (!settings || !settings.enableCards) return res.status(400).json({ error: "Cards disabled" });

       const autoApprove = settings.autoApproveCreditCards && requestedLimit <= ((settings.maxAutoApproveLoanAmount || 0) / 2); // Credit is riskier, half parameter
       
       const appId = uuidv4();
       
       let contractUrl: string | null = null;
       if (settings?.enableGoogleDocsContracts) {
         const { banks } = await import("../../db/schema");
         const bankRec = await db.select().from(banks).where(eq(banks.id, bankId)).get();
         const { generateContractUrl } = await import("../../lib/google_docs_contracts");
         contractUrl = generateContractUrl(settings.googleDocsCreditTemplateUrl, {
           bankName: bankRec?.name || "Slate Bank",
           clientDiscordId: discordId,
           contractType: 'credit',
           contractId: appId,
           amount: requestedLimit,
           purpose
         });
       }

       await db.insert(creditApplications).values({
           id: appId,
           bankId,
           discordId,
           accountId,
           requestedLimit,
           monthlyIncome,
           purpose,
           status: autoApprove ? "approved" : "pending",
           contractUrl,
           createdAt: new Date(),
       });

       if (autoApprove) {
          // Provision credit card
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
            bankId,
            accountId,
            cardNumber: generateCC(),
            cvv,
            expiryDate: `${(expiry.getMonth()+1).toString().padStart(2, '0')}/${expiry.getFullYear().toString().slice(-2)}`,
            isLocked: false,
            type: "credit",
            creditLimit: requestedLimit,
            creditUsed: 0,
            apr: 1999, // 19.99% APR default
            createdAt: new Date(),
          });
       }

       res.json({ success: true, autoApprove });

    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal Error" });
    }
  });

citizenRouter.get("/api/citizen/cards/:cardId/reveal", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const discordId = (req as any).user.discordId;
      const card = await db.select().from(cards).where(eq(cards.id, req.params.cardId)).get();
      if (!card) return res.status(404).json({ error: "Card not found" });
      
      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, card.accountId), eq(bankAccounts.ownerDiscordId, discordId))).get();
      if (!acc) return res.status(403).json({ error: "Unauthorized" });
      
      res.json({ cardNumber: card.cardNumber, cvv: card.cvv, expiryDate: card.expiryDate });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.patch("/api/citizen/cards/:cardId/lock", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { cards, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { isLocked } = req.body; const discordId = (req as any).user.discordId;
      const [card] = await db.select().from(cards).where(eq(cards.id, req.params.cardId));
      
      if (!card) return res.status(404).json({ error: "Card not found" });

      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, card.accountId));
      if (!account || account.ownerDiscordId !== discordId) {
         return res.status(403).json({ error: "Unauthorized" });
      }

      await db.update(cards).set({ isLocked: !!isLocked }).where(eq(cards.id, req.params.cardId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });


citizenRouter.post("/api/citizen/loans/:loanId/sign", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { loans, bankAccounts, transactions } = await import("../../db/schema.js");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
        const discordId = (req as any).user.discordId;
        const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
        if (!loan || loan.discordId !== discordId) return res.status(404).json({ error: "Loan not found" });
        if (loan.status !== "awaiting_signature") return res.status(400).json({ error: "Loan is not awaiting signature" });

        const ts = new Date();
        await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${loan.principalAmount}` }).where(eq(bankAccounts.id, loan.accountId));
        await db.insert(transactions).values({
            id: uuidv4(),
            bankId: loan.bankId,
            fromAccountId: null,
            toAccountId: loan.accountId,
            type: "deposit",
            amount: loan.principalAmount,
            description: `Loan Disbursement (Principal: ${(loan.principalAmount/100).toFixed(2)})`,
            timestamp: ts
        });
        await db.update(loans).set({ status: "active", clientSignedAt: ts }).where(eq(loans.id, loan.id));
        res.json({ success: true });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
    }
});


citizenRouter.post("/api/citizen/pay-loan", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, loans } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { loanId, fromAccountId, amount } = req.body;
      if (!loanId || !fromAccountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const parsedAmount = typeof amount === "number" ? Math.round(amount) : Math.round(parseFloat(amount));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      const fromAcc = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, (req as any).user.discordId))
      );
      if (!fromAcc.length) return res.status(404).json({ error: "Account not found or unauthorized" });

      if (fromAcc[0].balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });

      const theLoan = await db.select().from(loans).where(eq(loans.id, loanId));
      if (!theLoan.length || theLoan[0].status !== 'active') return res.status(400).json({ error: "Invalid loan" });

      // Deduct funds
      await db.update(bankAccounts).set({ balance: fromAcc[0].balance - parsedAmount }).where(eq(bankAccounts.id, fromAccountId));
      
      const newRemaining = Math.max(0, theLoan[0].remainingAmount - parsedAmount);

      await db.update(loans).set({ 
        remainingAmount: newRemaining,
        status: newRemaining <= 0 ? 'paid' : 'active'
      }).where(eq(loans.id, loanId));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: theLoan[0].bankId,
        fromAccountId: fromAccountId,
        toAccountId: null,
        amount: parsedAmount,
        type: 'transfer',
        description: `Manual Loan Payment`,
        timestamp: new Date()
      });

      res.json({ success: true, remaining: newRemaining });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

citizenRouter.post("/api/citizen/pay-invoice", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, invoices } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { invoiceId } = req.body; const discordId = (req as any).user.discordId;

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!inv || inv.status !== 'pending') return res.status(404).json({ error: "Invoice not found or already paid" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, inv.customerAccountId), eq(bankAccounts.ownerDiscordId, discordId))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found or unauthorized to pay this invoice" });
      if (sourceAccount.balance < inv.amount) return res.status(400).json({ error: `Insufficient funds. Balance: $${(sourceAccount.balance/100).toFixed(2)}, Due: $${(inv.amount/100).toFixed(2)}` });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, inv.billerAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination biller account not found" });

      // Execute payment
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

citizenRouter.post("/api/citizen/onyx-token", requireAuth, async (req: express.Request, res: express.Response) => {
    try {
      const { amount } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
      
      const jwt = require('jsonwebtoken');
      const discordId = (req as any).user.discordId;
      const paymentToken = jwt.sign({ discordId, amount: parsedAmount }, process.env.JWT_SECRET, { expiresIn: '15m' });
      
      res.json({ paymentToken });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

citizenRouter.post("/api/citizen/address-book", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { addressBook, bankAccounts } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { contactAccountId, nickname } = req.body;
      const discordId = (req as any).user.discordId;
      if (!contactAccountId || !nickname) return res.status(400).json({ error: "Missing required fields" });
      
      const acc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, contactAccountId)).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });

      await db.insert(addressBook).values({
        id: uuidv4(),
        ownerDiscordId: discordId,
        contactAccountId,
        nickname,
        createdAt: new Date(),
      });
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.delete("/api/citizen/address-book/:id", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { addressBook } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const discordId = (req as any).user.discordId;
      await db.delete(addressBook).where(and(eq(addressBook.id, req.params.id), eq(addressBook.ownerDiscordId, discordId)));
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.post("/api/citizen/recurring-transfers", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { recurringTransfers, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { fromAccountId, toAccountId, amount, frequency, description } = req.body;
      const discordId = (req as any).user.discordId;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
      
      const source = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, discordId))).get();
      if (!source) return res.status(403).json({ error: "Source account not found or unauthorized" });
      
      let nextRun = new Date();
      if (frequency === "daily") nextRun.setDate(nextRun.getDate() + 1);
      else if (frequency === "weekly") nextRun.setDate(nextRun.getDate() + 7);
      else if (frequency === "biweekly") nextRun.setDate(nextRun.getDate() + 14);
      else if (frequency === "monthly") nextRun.setMonth(nextRun.getMonth() + 1);
      else return res.status(400).json({ error: "Invalid frequency" });

      await db.insert(recurringTransfers).values({
        id: uuidv4(),
        ownerDiscordId: discordId,
        fromAccountId,
        toAccountId,
        amount: parsedAmount,
        frequency,
        nextRunAt: nextRun,
        description: description || "",
        createdAt: new Date(),
      });
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.delete("/api/citizen/recurring-transfers/:id", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { recurringTransfers } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const discordId = (req as any).user.discordId;
      await db.delete(recurringTransfers).where(and(eq(recurringTransfers.id, req.params.id), eq(recurringTransfers.ownerDiscordId, discordId)));
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.post("/api/citizen/savings-goals", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { savingsGoals, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { accountId, name, targetAmount, deadline } = req.body;
      const discordId = (req as any).user.discordId;
      const parsedAmount = Math.round(parseFloat(targetAmount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid target amount" });
      
      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.ownerDiscordId, discordId))).get();
      if (!acc) return res.status(403).json({ error: "Account not found or unauthorized" });

      await db.insert(savingsGoals).values({
        id: uuidv4(),
        ownerDiscordId: discordId,
        accountId,
        name,
        targetAmount: parsedAmount,
        deadline: deadline ? new Date(deadline) : null,
        createdAt: new Date(),
      });
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.delete("/api/citizen/savings-goals/:id", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { savingsGoals } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const discordId = (req as any).user.discordId;
      await db.delete(savingsGoals).where(and(eq(savingsGoals.id, req.params.id), eq(savingsGoals.ownerDiscordId, discordId)));
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.post("/api/citizen/payment-links", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { paymentLinks, bankAccounts } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { billerAccountId, amount, description } = req.body;
      const discordId = (req as any).user.discordId;
      const parsedAmount = amount ? Math.round(parseFloat(amount) * 100) : 0;
      
      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, billerAccountId), eq(bankAccounts.ownerDiscordId, discordId))).get();
      if (!acc) return res.status(403).json({ error: "Account not found or unauthorized" });

      const linkId = uuidv4();
      await db.insert(paymentLinks).values({
        id: linkId,
        ownerDiscordId: discordId,
        billerAccountId,
        amount: parsedAmount,
        description: description || "",
        createdAt: new Date(),
      });
      res.json({ success: true, linkId });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.put("/api/citizen/transactions/:id/category", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { transactions, bankAccounts } = await import("../../db/schema");
    const { eq, and, or } = await import("drizzle-orm");
    try {
      const { category } = req.body;
      const discordId = (req as any).user.discordId;
      
      const tx = await db.select().from(transactions).where(eq(transactions.id, req.params.id)).get();
      if (!tx) return res.status(404).json({ error: "Not found" });
      
      const accs = await db.select().from(bankAccounts).where(eq(bankAccounts.ownerDiscordId, discordId));
      const myAccIds = accs.map(a => a.id);
      
      if (!myAccIds.includes(tx.fromAccountId as string) && !myAccIds.includes(tx.toAccountId as string)) {
         return res.status(403).json({ error: "Unauthorized" });
      }
      
      await db.update(transactions).set({ category }).where(eq(transactions.id, req.params.id));
      res.json({ success: true });
    } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.get("/api/citizen/payment-links/:id", async (req: express.Request, res: express.Response) => {
     const { db } = await import("../../db/index");
     const { paymentLinks, bankAccounts, banks } = await import("../../db/schema");
     const { eq } = await import("drizzle-orm");
     try {
       const link = await db.select().from(paymentLinks).where(eq(paymentLinks.id, req.params.id)).get();
       if (!link || !link.isActive) return res.status(404).json({ error: "Link not found or inactive" });
       
       const acc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, link.billerAccountId)).get();
       const bnk = acc ? await db.select().from(banks).where(eq(banks.id, acc.bankId)).get() : null;
       
       res.json({ link, accountName: acc?.accountName || "Unknown", bankName: bnk?.name || "Unknown" });
     } catch(e) { console.error("Caught error:", e); res.status(500).json({ error: "Internal error" }); }
  });

citizenRouter.post("/api/citizen/accounts/:accountId/members", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { bankAccounts, accountMembers } = await import("../../db/schema.js");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const discordId = (req as any).user.discordId;

    try {
      const { memberDiscordId, role } = req.body;
      const { accountId } = req.params;

      if (!memberDiscordId || !role) return res.status(400).json({ error: "Missing memberDiscordId or role" });
      if (!["manager", "viewer"].includes(role)) return res.status(400).json({ error: "Role must be manager or viewer" });

      const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      // Check if user is owner or manager
      if (account.ownerDiscordId !== discordId) {
        const membership = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.discordId, discordId))).get();
        if (!membership || membership.role !== "manager") {
          return res.status(403).json({ error: "Unauthorized to add members" });
        }
      }

      // Check if already a member
      const existing = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.discordId, memberDiscordId))).get();
      if (existing) {
        await db.update(accountMembers).set({ role }).where(eq(accountMembers.id, existing.id));
        return res.json({ success: true, memberId: existing.id, updated: true });
      }

      const id = uuidv4();
      await db.insert(accountMembers).values({
        id,
        accountId,
        discordId: memberDiscordId,
        role,
        createdAt: new Date(),
      });

      res.json({ success: true, memberId: id });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});

citizenRouter.delete("/api/citizen/accounts/:accountId/members/:memberId", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { bankAccounts, accountMembers } = await import("../../db/schema.js");
    const { eq, and } = await import("drizzle-orm");
    const discordId = (req as any).user.discordId;

    try {
      const { accountId, memberId } = req.params;
      const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      if (account.ownerDiscordId !== discordId) {
        return res.status(403).json({ error: "Only account owner can remove members" });
      }

      await db.delete(accountMembers).where(and(eq(accountMembers.id, memberId), eq(accountMembers.accountId, accountId)));
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});

citizenRouter.post("/api/citizen/transfer", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, bankSettings, interBankTransfers, clearinghouseBalances, addressBook, recurringTransfers, savingsGoals, paymentLinks, cards, loans } = await import("../../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { fromAccountId, toAccountId, amount } = req.body; const discordId = (req as any).user.discordId;
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        return res.status(400).json({ error: "Invalid account selection" });
      }

      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, fromAccountId));
      if (!sourceAccount) return res.status(404).json({ error: "Source account not found" });

      if (sourceAccount.ownerDiscordId !== discordId) {
        const { accountMembers } = await import("../../db/schema.js");
        const membership = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, fromAccountId), eq(accountMembers.discordId, discordId))).get();
        if (!membership || membership.role !== "manager") {
          return res.status(403).json({ error: "Unauthorized to transfer from this account" });
        }
      }
      if (!sourceAccount.isActive || sourceAccount.isFrozen) return res.status(400).json({ error: "Source account is inactive or frozen" });
      if (sourceAccount.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, toAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });
      if (!destAccount.isActive || destAccount.isFrozen) return res.status(400).json({ error: "Destination account is inactive or frozen" });

      const fromBank = sourceAccount.bankId;
      const toBank = destAccount.bankId;

      // Determine transfer fee rate (using custom account fee override if defined, else bank default)
      let transferFeeBps = sourceAccount.customTransferFeePercent;
      if (transferFeeBps === null || transferFeeBps === undefined) {
        const fromSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, fromBank)).get();
        transferFeeBps = fromSettings?.transferFeePercent ?? 0;
      }

      const feeCents = transferFeeBps > 0 ? Math.round((parsedAmount * transferFeeBps) / 10000) : 0;
      const totalRequired = parsedAmount + feeCents;

      if (sourceAccount.balance < totalRequired) {
        return res.status(400).json({ error: `Insufficient funds. Transfer requires $${(parsedAmount/100).toFixed(2)} plus $${(feeCents/100).toFixed(2)} transfer fee.` });
      }

      if (fromBank === toBank) {
        // Execute internal transfer atomically
        await db.update(bankAccounts).set({ balance: sourceAccount.balance - totalRequired }).where(eq(bankAccounts.id, sourceAccount.id));
        await db.update(bankAccounts).set({ balance: destAccount.balance + parsedAmount }).where(eq(bankAccounts.id, destAccount.id));

        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: sourceAccount.bankId,
          fromAccountId: sourceAccount.id,
          toAccountId: destAccount.id,
          type: "transfer",
          amount: parsedAmount,
          description: feeCents > 0 ? `Transfer to ${destAccount.accountName} (Fee: $${(feeCents/100).toFixed(2)})` : `Transfer to ${destAccount.accountName}`,
          timestamp: new Date()
        });

        if (feeCents > 0) {
          await db.insert(transactions).values({
            id: uuidv4(),
            bankId: sourceAccount.bankId,
            fromAccountId: sourceAccount.id,
            toAccountId: null,
            type: "transfer",
            amount: feeCents,
            description: `Transfer Fee (${(transferFeeBps/100).toFixed(2)}%)`,
            timestamp: new Date(),
            category: "Fees"
          });
        }

        const { botManager } = await import("../../lib/bot_manager");
        botManager.sendNotification(sourceAccount.bankId, `💸 **Citizen Transfer**: <@${discordId}> transferred $${(parsedAmount/100).toFixed(2)} from **${sourceAccount.accountName}** to **${destAccount.accountName}**${feeCents > 0 ? ` (Fee: $${(feeCents/100).toFixed(2)})` : ''}.`);
      } else {
         // Inter-bank transfer logic
         const tSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, toBank)).get();
         const wireThresh = tSettings?.interBankWireThreshold || 5000000;

         if (parsedAmount >= wireThresh) {
            // Require direct wire transfer
            await db.update(bankAccounts).set({ balance: sourceAccount.balance - parsedAmount }).where(eq(bankAccounts.id, sourceAccount.id));
            
            // Generate inter bank transfer record
            const transId = uuidv4();
            await db.insert(interBankTransfers).values({
               id: transId,
               fromBankId: fromBank,
               toBankId: toBank,
               fromAccountId: sourceAccount.id,
               toAccountId: destAccount.id,
               amount: parsedAmount,
               status: "pending_wire",
               createdAt: new Date()
            });

            await db.insert(transactions).values({
               id: uuidv4(),
               bankId: fromBank,
               fromAccountId: sourceAccount.id,
               toAccountId: null,
               type: "transfer",
               amount: parsedAmount,
               description: `Pending Wire: Transfer to foreign bank account`,
               timestamp: new Date()
            });
            
            const { botManager } = await import("../../lib/bot_manager");
            botManager.sendNotification(fromBank, `🏦 **Pending Outbound Wire**: <@${discordId}> initiated a $${(parsedAmount/100).toFixed(2)} wire transfer to a foreign bank. Please use in-game commands to securely wire this sum to the receiving bank's corp, then approve the wire in SaaS.`);
            botManager.sendNotification(toBank, `🏦 **Pending Inbound Wire**: Expect an inbound wire transfer of $${(parsedAmount/100).toFixed(2)}. Once received in game, approve the transfer to deposit into the customer's account.`);

         } else {
            // Under threshold - process through Onyx Clearinghouse
            await db.update(bankAccounts).set({ balance: sourceAccount.balance - parsedAmount }).where(eq(bankAccounts.id, sourceAccount.id));
            await db.update(bankAccounts).set({ balance: destAccount.balance + parsedAmount }).where(eq(bankAccounts.id, destAccount.id));

            await db.insert(transactions).values({
              id: uuidv4(),
              bankId: fromBank,
              fromAccountId: sourceAccount.id,
              toAccountId: null,
              type: "transfer",
              amount: parsedAmount,
              description: `Onyx Transfer to foreign bank`,
              timestamp: new Date()
            });

            await db.insert(transactions).values({
              id: uuidv4(),
              bankId: toBank,
              fromAccountId: null,
              toAccountId: destAccount.id,
              type: "deposit",
              amount: parsedAmount,
              description: `Onyx Transfer from external bank`,
              timestamp: new Date()
            });

            // Update clearinghouse balances
            const fBalance = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, fromBank)).get();
            if(!fBalance) await db.insert(clearinghouseBalances).values({ bankId: fromBank, balance: -parsedAmount });
            else await db.update(clearinghouseBalances).set({ balance: fBalance.balance - parsedAmount }).where(eq(clearinghouseBalances.bankId, fromBank));

            const tBalance = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, toBank)).get();
            if(!tBalance) await db.insert(clearinghouseBalances).values({ bankId: toBank, balance: parsedAmount });
            else await db.update(clearinghouseBalances).set({ balance: tBalance.balance + parsedAmount }).where(eq(clearinghouseBalances.bankId, toBank));

            const { botManager } = await import("../../lib/bot_manager");
            botManager.sendNotification(fromBank, `💸 **Onyx Transfer Out**: <@${discordId}> transferred $${(parsedAmount/100).toFixed(2)} to a foreign bank account.`);
            botManager.sendNotification(toBank, `💸 **Onyx Transfer In**: Received $${(parsedAmount/100).toFixed(2)} via clearinghouse.`);
         }
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });


citizenRouter.get("/api/citizen/vaults", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { vaultDeposits, bankAccounts } = await import("../../db/schema.js");
    const { eq, inArray } = await import("drizzle-orm");
    const discordId = (req as any).user.discordId;

    try {
        const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.ownerDiscordId, discordId));
        if (accounts.length === 0) return res.json([]);
        
        const accountIds = accounts.map(a => a.id);
        const vaults = await db.select().from(vaultDeposits).where(inArray(vaultDeposits.accountId, accountIds)).all();
        
        // attach account names
        const enriched = vaults.map(v => {
            const acc = accounts.find(a => a.id === v.accountId);
            return { ...v, accountName: acc?.accountName || 'Unknown' };
        });
        
        res.json(enriched);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal error" });
    }
});

citizenRouter.post("/api/citizen/vaults", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { vaultDeposits, bankAccounts, transactions, bankSettings } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    const { accountId, amount, lockDays } = req.body;
    const discordId = (req as any).user.discordId;
    
    try {
        const parsedAmount = parseInt(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
        
        const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
        if (!account) return res.status(404).json({ error: "Account not found" });
        if (account.ownerDiscordId !== discordId) return res.status(403).json({ error: "Unauthorized" });
        if (!account.isActive || account.isFrozen) return res.status(400).json({ error: "Account is inactive or frozen" });
        if (account.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });
        
        const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, account.bankId)).get();
        const tiers = settings?.vaultTiers || [{"lockDays":7,"interestRate":100,"penaltyPercent":20},{"lockDays":30,"interestRate":300,"penaltyPercent":20},{"lockDays":90,"interestRate":500,"penaltyPercent":20},{"lockDays":180,"interestRate":800,"penaltyPercent":20},{"lockDays":365,"interestRate":1200,"penaltyPercent":20}];
        
        const selectedTier = tiers.find((t: any) => t.lockDays === lockDays);
        if (!selectedTier) return res.status(400).json({ error: "Invalid lock period" });
        
        const interestRate = selectedTier.interestRate;
        const penaltyPercent = selectedTier.penaltyPercent || 20;
        
        const lockedUntil = new Date();
        lockedUntil.setDate(lockedUntil.getDate() + lockDays);
        
        await db.update(bankAccounts).set({ balance: account.balance - parsedAmount }).where(eq(bankAccounts.id, account.id));
        
        await db.insert(transactions).values({
            id: uuidv4(),
            bankId: account.bankId,
            fromAccountId: account.id,
            toAccountId: null,
            amount: parsedAmount,
            type: 'deposit',
            description: `Vault Deposit (${lockDays} Days)`,
            timestamp: new Date()
        });
        
        const vault = {
            id: uuidv4(),
            bankId: account.bankId,
            accountId: account.id,
            amount: parsedAmount,
            lockedUntil,
            interestRate,
            status: 'locked',
            createdAt: new Date()
        };
        
        await db.insert(vaultDeposits).values(vault);
        
        res.json({ success: true, vault });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal error" });
    }
});

citizenRouter.post("/api/citizen/vaults/:id/withdraw", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { vaultDeposits, bankAccounts, transactions, bankSettings } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const discordId = (req as any).user.discordId;
    
    try {
        const vault = await db.select().from(vaultDeposits).where(eq(vaultDeposits.id, req.params.id)).get();
        if (!vault) return res.status(404).json({ error: "Vault not found" });
        if (vault.status !== 'locked') return res.status(400).json({ error: "Vault is already withdrawn" });
        
        const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, vault.accountId)).get();
        if (!account || account.ownerDiscordId !== discordId) return res.status(403).json({ error: "Unauthorized" });
        
        const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, vault.bankId)).get();
        const tiers = settings?.vaultTiers || [{"lockDays":7,"interestRate":100,"penaltyPercent":20},{"lockDays":30,"interestRate":300,"penaltyPercent":20},{"lockDays":90,"interestRate":500,"penaltyPercent":20},{"lockDays":180,"interestRate":800,"penaltyPercent":20},{"lockDays":365,"interestRate":1200,"penaltyPercent":20}];
        
        // Find the penalty from the tier, if the lock period matches
        // For early withdrawals, we need the penalty
        // Let's estimate original lock days based on lockedUntil - createdAt
        const diffTime = Math.abs(new Date(vault.lockedUntil).getTime() - new Date(vault.createdAt).getTime());
        const estimatedDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const matchingTier = tiers.find((t: any) => Math.abs(t.lockDays - estimatedDays) <= 1);
        const penaltyPercent = matchingTier?.penaltyPercent ?? 20;

        const now = new Date();
        const isEarly = now < new Date(vault.lockedUntil);
        
        let returnAmount = vault.amount;
        let status = 'released';
        let description = 'Vault Maturity Withdrawal';
        
        if (isEarly) {
            // Early withdrawal penalty
            const penalty = Math.floor(vault.amount * (penaltyPercent / 100));
            returnAmount = vault.amount - penalty;
            status = 'early_withdrawn';
            description = `Early Vault Withdrawal (${penaltyPercent}% Penalty)`;
        } else {
            // Add interest
            const interest = Math.floor(vault.amount * (vault.interestRate / 10000));
            returnAmount += interest;
            description = `Vault Maturity Withdrawal (+${(interest/100).toFixed(2)} Interest)`;
        }
        
        await db.update(vaultDeposits).set({ status }).where(eq(vaultDeposits.id, vault.id));
        await db.update(bankAccounts).set({ balance: account.balance + returnAmount }).where(eq(bankAccounts.id, account.id));
        
        await db.insert(transactions).values({
            id: uuidv4(),
            bankId: vault.bankId,
            fromAccountId: null,
            toAccountId: account.id,
            amount: returnAmount,
            type: 'deposit',
            description,
            timestamp: new Date()
        });
        
        res.json({ success: true, returnAmount, status });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal error" });
    }
});

citizenRouter.post("/api/citizen/sync-balances", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, accountMembers } = await import("../../db/schema.js");
    const { eq, inArray } = await import("drizzle-orm");
    const { startCitizenSyncJob } = await import("../sync_jobs");
    const discordId = (req as any).user.discordId;

    try {
      // 1. Get owned accounts
      const ownedAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.ownerDiscordId, discordId));
      
      // 2. Get member accounts
      const memberships = await db.select().from(accountMembers).where(eq(accountMembers.discordId, discordId));
      const memberAccountIds = memberships.map(m => m.accountId);
      let memberAccounts: any[] = [];
      if (memberAccountIds.length > 0) {
        memberAccounts = await db.select().from(bankAccounts).where(inArray(bankAccounts.id, memberAccountIds));
      }

      const allAccounts = [...ownedAccounts];
      memberAccounts.forEach(m => {
        if (!allAccounts.some(a => a.id === m.id)) allAccounts.push(m);
      });

      if (allAccounts.length === 0) {
        return res.json({ success: true, message: "No accounts found to sync", totalAccounts: 0 });
      }

      const jobId = startCitizenSyncJob(discordId, allAccounts);
      return res.json({ success: true, jobId, totalAccounts: allAccounts.length });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to start citizen balance sync job" });
    }
});

citizenRouter.get("/api/citizen/sync-job/:jobId", requireAuth, async (req: express.Request, res: express.Response) => {
    const { getSyncJob } = await import("../sync_jobs");
    const job = getSyncJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found or expired" });
    res.json(job);
});

citizenRouter.post("/api/citizen/deposit-funds", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions } = await import("../../db/schema.js");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const discordId = (req as any).user.discordId;

    try {
      const { accountId, amountDollars, description } = req.body;
      if (!accountId || !amountDollars || Number(amountDollars) <= 0) {
        return res.status(400).json({ error: "Valid account ID and positive deposit amount required" });
      }

      const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      if (account.ownerDiscordId !== discordId) {
        const { accountMembers } = await import("../../db/schema.js");
        const membership = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, accountId), eq(accountMembers.discordId, discordId))).get();
        if (!membership || (membership.role !== "owner" && membership.role !== "manager")) {
          return res.status(403).json({ error: "Unauthorized to deposit into this account" });
        }
      }

      const depositCents = Math.round(Number(amountDollars) * 100);
      const newBalance = account.balance + depositCents;

      await db.update(bankAccounts).set({ balance: newBalance }).where(eq(bankAccounts.id, account.id));
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: account.bankId,
        toAccountId: account.id,
        fromAccountId: null,
        type: 'deposit',
        amount: depositCents,
        description: description || `Manual Deposit / Account Funding (+$${Number(amountDollars).toFixed(2)})`,
        timestamp: new Date()
      });

      res.json({ success: true, newBalance, depositedCents: depositCents, message: `Successfully deposited $${Number(amountDollars).toFixed(2)}` });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to deposit funds" });
    }
});
