import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import { getUserCandidateIdentifiers, isUserAccountOwnerOrMember } from "../userResolver.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const citizenRouter = express.Router();


citizenRouter.get("/api/citizen/lookup", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { banks, bankAccounts, transactions, invoices, cards, loans, bankSettings, accountMembers, onyxMerchants, subscriptions } = await import("../../db/schema.js");
    const { eq, or, inArray, desc } = await import("drizzle-orm");

    try {
      const candidateIds = await getUserCandidateIdentifiers(req);
      if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

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
      .where(inArray(bankAccounts.ownerDiscordId, candidateIds));

      // 2. Member accounts (Joint / Corporate)
      const memberships = await db.select().from(accountMembers).where(inArray(accountMembers.discordId, candidateIds));
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

      const allBanks = await db.select({
        id: banks.id,
        name: banks.name,
        logoUrl: banks.logoUrl,
        brandingColor: banks.brandingColor,
      }).from(banks);
      const rawSettings = await db.select().from(bankSettings);
      const publicizeSettings = (rows: any[]) => rows.map((s: any) => ({
        bankId: s.bankId,
        logoUrl: s.logoUrl,
        colorScheme: s.colorScheme,
        requireKyc: s.requireKyc,
        enableAccountTiers: s.enableAccountTiers,
        accountTiers: s.accountTiers,
        enableLoans: s.enableLoans,
        enableVaults: s.enableVaults,
        enableCards: s.enableCards,
        enablePayroll: s.enablePayroll,
        enableSubscriptions: s.enableSubscriptions,
        enableEscrow: s.enableEscrow,
        enableTreasury: s.enableTreasury,
        loginBgUrl: s.loginBgUrl,
        requirePersonalForBusiness: s.requirePersonalForBusiness,
        vaultTiers: s.vaultTiers,
        defaultFeePayerMode: s.defaultFeePayerMode,
        savingsApyPercent: s.savingsApyPercent,
      }));
      const allSettings = publicizeSettings(rawSettings);

      if (userAccounts.length === 0) {
         return res.json({ accounts: [], transactions: [], invoices: [], cards: [], loans: [], subscriptions: [], merchants: [], banksConfig: {}, banks: allBanks, settings: allSettings });
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
        
      const userSubscriptions = await db.select().from(subscriptions).where(or(inArray(subscriptions.customerAccountId, accountIds), inArray(subscriptions.billerAccountId, accountIds)));
      const userLoans = await db.select()
        .from(loans)
        .where(or(
          inArray(loans.discordId, candidateIds),
          inArray(loans.accountId, accountIds)
        ));

      
      const userMerchants = await db.select()
        .from(onyxMerchants)
        .where(inArray(onyxMerchants.destinationAccount, accountIds));

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
        banks: allBanks,
        settings: allSettings,
        banksConfig,
        accounts: userAccounts,
        transactions: recentTxs,
        invoices: userInvoices,
        cards: userCards.map((c: any) => ({
          ...c,
          cardNumber: c.cardNumber ? `•••• ${String(c.cardNumber).slice(-4)}` : null,
          cvv: undefined,
        })),
        loans: userLoans,
        subscriptions: userSubscriptions,
        merchants: userMerchants
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
});


citizenRouter.post("/api/citizen/accounts/:id/upgrade", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index.js");
    const { bankAccounts, bankSettings } = await import("../../db/schema.js");
    const { eq, and, inArray } = await import("drizzle-orm");
    const { getUserCandidateIdentifiers } = await import("../userResolver.js");

    try {
        const candidateIds = await getUserCandidateIdentifiers(req);
        if (candidateIds.length === 0) return res.status(400).json({ error: "Missing identity" });

        const { tierId } = req.body;
        if (!tierId) return res.status(400).json({ error: "Missing tierId" });

        const account = await db.select().from(bankAccounts).where(
          and(
            eq(bankAccounts.id, req.params.id),
            inArray(bankAccounts.ownerDiscordId, candidateIds)
          )
        ).get();

        if (!account) return res.status(404).json({ error: "Account not found or unauthorized." });

        const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, account.bankId)).get();
        if (!settings?.enableAccountTiers || !settings.accountTiers) {
            return res.status(400).json({ error: "Tiers are not enabled for this bank." });
        }

        const selectedTier = settings.accountTiers.find((t: any) => t.id === tierId && !t.isPrivate && t.type === account.accountType);
        if (!selectedTier) {
            return res.status(400).json({ error: "Invalid tier selection." });
        }

        await db.update(bankAccounts).set({ tierId }).where(eq(bankAccounts.id, account.id));

        // Auto-provision or update credit card if the new tier includes one
        if (selectedTier.creditLimit && selectedTier.creditLimit > 0) {
            const { cards } = await import("../../db/schema.js");
            const existingCard = await db.select().from(cards).where(eq(cards.accountId, account.id)).get();
            if (existingCard) {
                // Update existing card limit and APR
                await db.update(cards).set({
                    creditLimit: selectedTier.creditLimit,
                    apr: selectedTier.creditApr || 1999
                }).where(eq(cards.id, existingCard.id));
            } else {
                const { v4: uuidv4 } = await import("uuid");
                const generateCardNum = () => "4" + Array.from({length: 15}, () => Math.floor(Math.random() * 10)).join("");
                const cardNum = generateCardNum();
                const cvv = Math.floor(100 + Math.random() * 900).toString();
                const expMonth = ("0" + (Math.floor(Math.random() * 12) + 1)).slice(-2);
                const expYear = (new Date().getFullYear() + 3).toString().slice(-2);
                const cardId = `crd_${uuidv4().substring(0, 8)}`;
                await db.insert(cards).values({
                    id: cardId,
                    bankId: account.bankId,
                    accountId: account.id,
                    cardNumber: cardNum,
                    cvv,
                    expiryDate: `${expMonth}/${expYear}`,
                    isLocked: false,
                    type: "credit",
                    creditLimit: selectedTier.creditLimit,
                    creditUsed: 0,
                    apr: selectedTier.creditApr || 1999,
                    nextPaymentDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })(),
                    createdAt: new Date()
                });
            }
        }

        res.json({ success: true });
    } catch (e: any) {
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

      let autoApprove = false;
      if (settings.enableAccountTiers && account.tierId && settings.accountTiers) {
         const tier = (settings.accountTiers as any[]).find(t => t.id === account.tierId);
         if (tier && tier.autoApproveLoans && principalAmount <= (tier.maxAutoApproveLoanAmount || 0)) {
            autoApprove = true;
         }
      } else if (!settings.enableAccountTiers) {
         autoApprove = !!settings.autoApproveLoans && principalAmount <= (settings.maxAutoApproveLoanAmount || 0);
      }

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
        status: "pending",
        contractUrl,
        createdAt: new Date(),
      });

      if (autoApprove) {
         const { disburseLoan } = await import("../loan_processor.js");
         const insertedLoan = await db.select().from(loans).where(eq(loans.id, loanId)).get();
         if (insertedLoan) {
            try {
              await disburseLoan(insertedLoan);
              await db.update(loans).set({ status: "active" }).where(eq(loans.id, loanId));
            } catch (err: any) {
              const { botManager } = await import("../../lib/bot_manager");
              botManager.sendNotification(bankId, `New Loan Application: \nDiscord ID: ${discordId}\nAmount: $${(principalAmount/100).toFixed(2)}\nPurpose: ${purpose || 'None specified'}\nStatus: Pending (auto-disburse failed: ${err.message || "CityCorp error"})`);
              return res.status(400).json({ error: err.message || "Loan disbursement failed. Application left pending for staff review.", autoApprove: false, pending: true });
            }
         }
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

       let autoApprove = false;
       if (settings.enableAccountTiers && account.tierId && settings.accountTiers) {
          const tier = (settings.accountTiers as any[]).find(t => t.id === account.tierId);
          if (tier && tier.autoApproveCreditCards && requestedLimit <= (tier.maxAutoApproveLoanAmount || 0)) {
             autoApprove = true;
          }
       } else if (!settings.enableAccountTiers) {
          autoApprove = !!settings.autoApproveCreditCards && requestedLimit <= ((settings.maxAutoApproveLoanAmount || 0) / 2); // Credit is riskier, half parameter
       }
       
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
            nextPaymentDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })(),
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

        const { disburseLoan } = await import("../loan_processor.js");
        await disburseLoan(loan);

        await db.update(loans).set({ status: "active", clientSignedAt: new Date() }).where(eq(loans.id, loan.id));
        res.json({ success: true });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
    }
});


citizenRouter.post("/api/citizen/pay-credit-card", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, cards } = await import("../../db/schema");
    const { eq, and, sql, gte } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { cardId, fromAccountId, amount } = req.body;
      const discordId = (req as any).user.discordId;

      if (!cardId || !fromAccountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      // Verify from account ownership
      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, discordId))
      );
      if (!sourceAccount) return res.status(404).json({ error: "Source account not found or unauthorized" });
      if (sourceAccount.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });

      // Verify card
      const [theCard] = await db.select().from(cards).where(eq(cards.id, cardId));
      if (!theCard || theCard.type !== "credit") return res.status(400).json({ error: "Invalid credit card" });

      if ((theCard.creditUsed || 0) <= 0) {
          return res.status(400).json({ error: "Credit card has no outstanding balance." });
      }

      // Ensure we don't overpay
      const actualPayment = Math.min(parsedAmount, (theCard.creditUsed || 0));

      const { collectToPoolOrTreasury } = await import("../../lib/citycorp_money");
      try {
        await collectToPoolOrTreasury({
          bankId: theCard.bankId,
          fromAccount: sourceAccount,
          amountCents: actualPayment,
          description: `Credit Card Payment (Card ending in ${theCard.cardNumber.slice(-4)})`,
          type: "credit_payment",
        });
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Credit card payment failed" });
      }

      await db.update(cards)
        .set({ creditUsed: sql`${cards.creditUsed} - ${actualPayment}` })
        .where(eq(cards.id, cardId));

      res.json({ success: true, actualPayment });
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
      const { loanId, fromAccountId, amount, amountDollars } = req.body;
      if (!loanId || !fromAccountId || (amount == null && (amountDollars == null || amountDollars === ""))) {
        return res.status(400).json({ error: "Missing fields" });
      }

      let parsedAmount: number;
      if (amountDollars != null && amountDollars !== "") {
        parsedAmount = Math.round(parseFloat(String(amountDollars)) * 100);
      } else {
        const raw = amount;
        const n = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isFinite(n) || n <= 0) {
          return res.status(400).json({ error: "Invalid payment amount" });
        }
        const hasDecimal =
          (typeof raw === "number" && !Number.isInteger(raw)) ||
          (typeof raw === "string" && String(raw).includes("."));
        parsedAmount = hasDecimal ? Math.round(n * 100) : Math.round(n);
      }
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      const fromAcc = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, (req as any).user.discordId))
      );
      if (!fromAcc.length) return res.status(404).json({ error: "Account not found or unauthorized" });

      const [sourceAccount] = fromAcc;
      const [theLoan] = await db.select().from(loans).where(eq(loans.id, loanId));
      if (!theLoan || (theLoan.status !== 'active' && theLoan.status !== 'delinquent')) return res.status(400).json({ error: "Invalid loan" });

      parsedAmount = Math.min(parsedAmount, theLoan.remainingAmount);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Loan has no remaining balance" });
      if (sourceAccount.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });

      let newRemaining = 0;
      const { gte, sql } = await import("drizzle-orm");
      const { collectToPoolOrTreasury } = await import("../../lib/citycorp_money");
      try {
        await collectToPoolOrTreasury({
          bankId: theLoan.bankId,
          fromAccount: sourceAccount,
          amountCents: parsedAmount,
          description: `Loan payment (Loan #${theLoan.id.slice(0, 8)})`,
          type: "loan_payment",
        });
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "Loan payment failed" });
      }

      await db.transaction(async (tx) => {
        newRemaining = Math.max(0, theLoan.remainingAmount - parsedAmount);
        const isPaidOff = newRemaining <= 0;

        // Check for late fee settlement
        const currentLateFee = theLoan.lateFeeAmount || 0;
        const lateFeeSettled = Math.min(parsedAmount, currentLateFee);
        const newLateFeeAmount = Math.max(0, currentLateFee - lateFeeSettled);

        if (lateFeeSettled > 0) {
          await tx.insert(transactions).values({
            id: uuidv4(),
            bankId: theLoan.bankId,
            fromAccountId: fromAccountId,
            toAccountId: null,
            type: "fee",
            feeType: "late_fee",
            amount: lateFeeSettled,
            description: `Loan Late Fee Settlement (Loan #${theLoan.id.slice(0, 8)})`,
            category: "Fee Income",
            timestamp: new Date()
          });
        }

        // Push next payment date if partially paid
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 30);

        await tx.update(loans).set({ 
          remainingAmount: newRemaining,
          lateFeeAmount: newLateFeeAmount,
          isDelinquent: newLateFeeAmount > 0,
          missedPaymentsCount: newLateFeeAmount > 0 ? theLoan.missedPaymentsCount : 0,
          status: isPaidOff ? 'paid_off' : 'active',
          nextPaymentDate: isPaidOff ? theLoan.nextPaymentDate : nextDate
        }).where(eq(loans.id, loanId));
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
    const { eq, and, sql, gte } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { invoiceId, fromAccountId } = req.body; const discordId = (req as any).user.discordId;

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!inv || inv.status !== 'pending') return res.status(404).json({ error: "Invoice not found or already paid" });

      let sourceAccount;
      let sourceCard = null;

      if (fromAccountId && fromAccountId.startsWith("crd_")) {
          const { cards } = await import("../../db/schema");
          const [sc] = await db.select().from(cards).where(eq(cards.id, fromAccountId));
          if (!sc) return res.status(404).json({ error: "Source card not found" });
          if (sc.isLocked) return res.status(400).json({ error: "Card is locked" });
          sourceCard = sc;
          
          const [sa] = await db.select().from(bankAccounts).where(
            and(eq(bankAccounts.id, sc.accountId), eq(bankAccounts.ownerDiscordId, discordId))
          );
          if (!sa) return res.status(404).json({ error: "Linked source account not found or unauthorized" });
          sourceAccount = sa;
      } else {
          const accId = fromAccountId || inv.customerAccountId;
          const [sa] = await db.select().from(bankAccounts).where(
            and(eq(bankAccounts.id, accId), eq(bankAccounts.ownerDiscordId, discordId))
          );
          if (!sa) return res.status(404).json({ error: "Source account not found or unauthorized to pay this invoice" });
          sourceAccount = sa;
      }

      if (!sourceAccount.isActive || sourceAccount.isFrozen) return res.status(400).json({ error: "Source account is inactive or frozen" });

      if (sourceCard) {
          if ((sourceCard.creditUsed || 0) + inv.amount > (sourceCard.creditLimit || 0)) {
              return res.status(400).json({ error: "Exceeds credit limit" });
          }
      } else {
          if (sourceAccount.balance < inv.amount) return res.status(400).json({ error: `Insufficient funds. Balance: ${(sourceAccount.balance/100).toFixed(2)}, Due: ${(inv.amount/100).toFixed(2)}` });
      }

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, inv.billerAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination biller account not found" });

      if (sourceCard) {
          try {
            const { disburseFromPoolOrOperating } = await import("../../lib/citycorp_money");
            await disburseFromPoolOrOperating({
              bankId: sourceCard.bankId || sourceAccount.bankId,
              toAccount: destAccount,
              amountCents: inv.amount,
              description: `Credit card payment of invoice ${inv.id}`,
            });
          } catch (err: any) {
            return res.status(400).json({
              error: err.message || "Credit spend failed. Configure a loan pool or operating subaccount."
            });
          }
          const { cards } = await import("../../db/schema");
          await db.update(cards)
            .set({ creditUsed: sql`${cards.creditUsed} + ${inv.amount}` })
            .where(eq(cards.id, sourceCard.id));
          await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, inv.id));
      } else {
          try {
            const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money");
            await executeSameBankBookTransfer({
              sourceAccount,
              destAccount,
              desiredCents: inv.amount,
              mode: "from_payment",
              description: `Invoice Payment: ${inv.description || inv.id}`,
              type: "transfer",
            });
          } catch (err: any) {
            return res.status(400).json({ error: err.message || "Invoice payment failed" });
          }
          await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, inv.id));
      }

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

citizenRouter.post("/api/citizen/transfer/quote", requireAuth, async (req: express.Request, res: express.Response) => {
    try {
      const { fromAccountId, toAccountId, amount } = req.body;
      const discordId = (req as any).user.discordId;
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        return res.status(400).json({ error: "Invalid account selection" });
      }
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const { db } = await import("../../db/index");
      const { bankAccounts, cards } = await import("../../db/schema");
      const { eq, and } = await import("drizzle-orm");
      const { quoteBookTransfer, parseFeePayerMode, loadSettings } = await import("../../lib/citycorp_money");

      let sourceAccount;
      let sourceCard: any = null;
      if (String(fromAccountId).startsWith("crd_")) {
        sourceCard = await db.select().from(cards).where(eq(cards.id, fromAccountId)).get();
        if (!sourceCard) return res.status(404).json({ error: "Source card not found" });
        sourceAccount = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sourceCard.accountId)).get();
      } else {
        sourceAccount = await db.select().from(bankAccounts).where(eq(bankAccounts.id, fromAccountId)).get();
      }
      if (!sourceAccount) return res.status(404).json({ error: "Source account not found" });
      if (sourceAccount.ownerDiscordId !== discordId) {
        const { accountMembers } = await import("../../db/schema.js");
        const membership = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, sourceAccount.id), eq(accountMembers.discordId, discordId))).get();
        if (!membership || membership.role !== "manager") {
          return res.status(403).json({ error: "Unauthorized to quote this account" });
        }
      }

      const destAccount = await db.select().from(bankAccounts).where(eq(bankAccounts.id, toAccountId)).get();
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });

      const settings = await loadSettings(sourceAccount.bankId);
      const feeMode = parseFeePayerMode(req.body?.feePayerMode || req.body?.feeMode, (settings?.defaultFeePayerMode as any) || "from_payment");
      const { quote } = await quoteBookTransfer({
        sourceAccount,
        destAccount,
        desiredCents: parsedAmount,
        mode: feeMode,
      });

      return res.json({
        success: true,
        quote,
        sameBank: sourceAccount.bankId === destAccount.bankId,
        sourceCard: !!sourceCard,
        defaultFeePayerMode: settings?.defaultFeePayerMode || "from_payment",
      });
    } catch (e: any) {
      console.error(e);
      res.status(400).json({ error: e.message || "Quote failed" });
    }
  });

citizenRouter.post("/api/citizen/transfer", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { bankAccounts, transactions, bankSettings, interBankTransfers, clearinghouseBalances, addressBook, recurringTransfers, savingsGoals, paymentLinks, cards, loans } = await import("../../db/schema");
    const { eq, and, gte, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { fromAccountId, toAccountId, amount } = req.body; const discordId = (req as any).user.discordId;
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        return res.status(400).json({ error: "Invalid account selection" });
      }

      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      let sourceAccount;
      let sourceCard: any = null;

      if (fromAccountId.startsWith("crd_")) {
          sourceCard = await db.select().from(cards).where(eq(cards.id, fromAccountId)).get();
          if (!sourceCard) return res.status(404).json({ error: "Source card not found" });
          if (sourceCard.isLocked) return res.status(400).json({ error: "Card is locked" });
          
          sourceAccount = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sourceCard.accountId)).get();
      } else {
          sourceAccount = await db.select().from(bankAccounts).where(eq(bankAccounts.id, fromAccountId)).get();
      }

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found" });

      if (sourceAccount.ownerDiscordId !== discordId) {
        const { accountMembers } = await import("../../db/schema.js");
        const membership = await db.select().from(accountMembers).where(and(eq(accountMembers.accountId, sourceAccount.id), eq(accountMembers.discordId, discordId))).get();
        if (!membership || membership.role !== "manager") {
          return res.status(403).json({ error: "Unauthorized to transfer from this account" });
        }
      }
      
      if (!sourceAccount.isActive || sourceAccount.isFrozen) return res.status(400).json({ error: "Source account is inactive or frozen" });
      
      if (sourceCard) {
          if ((sourceCard.creditUsed || 0) + parsedAmount > (sourceCard.creditLimit || 0)) {
              return res.status(400).json({ error: "Exceeds credit limit" });
          }
      } else {
          if (sourceAccount.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });
      }

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, toAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });
      if (!destAccount.isActive || destAccount.isFrozen) return res.status(400).json({ error: "Destination account is inactive or frozen" });

      const fromBank = sourceAccount.bankId;
      const toBank = destAccount.bankId;

      const { sql, gte } = await import("drizzle-orm");
      const {
        executeSameBankBookTransfer,
        executeCrossBankSettledTransfer,
        parseFeePayerMode,
        loadSettings,
        disburseFromPoolOrOperating,
      } = await import("../../lib/citycorp_money");
      const sourceSettings = await loadSettings(sourceAccount.bankId);
      const feeMode = parseFeePayerMode(
        req.body?.feePayerMode || req.body?.feeMode,
        (sourceSettings?.defaultFeePayerMode as any) || "from_payment"
      );

      let resultQuote: any = null;

      if (fromBank === toBank) {
        if (sourceCard) {
          try {
            await disburseFromPoolOrOperating({
              bankId: sourceAccount.bankId,
              toAccount: destAccount,
              amountCents: parsedAmount,
              description: `Credit transfer to ${destAccount.accountName}`,
            });
            resultQuote = { receivedCents: parsedAmount, submittedCents: parsedAmount };
            await db.update(cards)
              .set({ creditUsed: sql`${cards.creditUsed} + ${parsedAmount}` })
              .where(eq(cards.id, sourceCard.id));
          } catch (err: any) {
            return res.status(400).json({
              error: err.message || "Credit spend failed. Configure a loan pool or operating subaccount."
            });
          }
        } else {
          try {
            const moved = await executeSameBankBookTransfer({
              sourceAccount,
              destAccount,
              desiredCents: parsedAmount,
              mode: feeMode,
              description: `Transfer to ${destAccount.accountName}`,
            });
            resultQuote = moved.quote;
          } catch (err: any) {
            return res.status(400).json({ error: err.message || "Transfer failed" });
          }
        }

        const { botManager } = await import("../../lib/bot_manager");
        botManager.sendNotification(sourceAccount.bankId, `💸 **Citizen Transfer**: <@${discordId}> transferred ${(parsedAmount/100).toFixed(2)} from **${sourceAccount.accountName}** to **${destAccount.accountName}**.`);
      } else {
         if (sourceCard) {
            return res.status(400).json({ error: "Credit cards cannot be used for inter-bank Onyx transfers." });
         }
         try {
            const moved = await executeCrossBankSettledTransfer({
              sourceAccount,
              destAccount,
              desiredCents: parsedAmount,
              mode: feeMode,
              description: `Onyx transfer to ${destAccount.accountName}`,
            });
            resultQuote = moved.quote;
         } catch (err: any) {
            return res.status(400).json({ error: err.message || "Inter-bank transfer failed" });
         }

         const { botManager } = await import("../../lib/bot_manager");
         botManager.sendNotification(fromBank, `💸 **Onyx Transfer Out**: <@${discordId}> transferred ${(parsedAmount/100).toFixed(2)} to a foreign bank account.`);
         botManager.sendNotification(toBank, `💸 **Onyx Transfer In**: Received ${(parsedAmount/100).toFixed(2)} via clearinghouse.`);
      }

      res.json({ success: true, quote: resultQuote });
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
    const { eq, and, sql, gte } = await import("drizzle-orm");
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
        
        const vaultId = uuidv4();
        const vault = {
            id: vaultId,
            bankId: account.bankId,
            accountId: account.id,
            amount: parsedAmount,
            lockedUntil,
            interestRate,
            status: 'locked',
            createdAt: new Date()
        };

        const { holdInSystemAccount } = await import("../../lib/citycorp_money");
        await holdInSystemAccount({
          fromAccount: account,
          amountCents: parsedAmount,
          systemAccountName: "VAULT",
          systemCategory: "vault",
          description: `Vault Deposit (${lockDays} Days)`,
          type: "vault",
        });
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
    const { eq, and, sql } = await import("drizzle-orm");
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
        let interest = 0;
        
        if (isEarly) {
            const penalty = Math.floor(vault.amount * (penaltyPercent / 100));
            returnAmount = vault.amount - penalty;
            status = 'early_withdrawn';
            description = `Early Vault Withdrawal (${penaltyPercent}% Penalty)`;
        } else {
            interest = Math.floor(vault.amount * (vault.interestRate / 10000));
            description = `Vault Maturity Withdrawal`;
        }

        const { releaseFromSystemAccount, payFromInterestPool } = await import("../../lib/citycorp_money");
        await releaseFromSystemAccount({
          toAccount: account,
          amountCents: returnAmount,
          systemAccountName: "VAULT",
          systemCategory: "vault",
          description,
          type: "vault",
        });
        if (!isEarly && interest > 0) {
          try {
            const paid = await payFromInterestPool({
              bankId: vault.bankId,
              toAccount: account,
              amountCents: interest,
              description: `Vault maturity interest (+${(interest/100).toFixed(2)})`,
            });
            if (paid) returnAmount += interest;
          } catch (e) {
            console.error("[citizen vault] interest skipped", e);
          }
        }
        await db.update(vaultDeposits).set({ status }).where(and(eq(vaultDeposits.id, vault.id), eq(vaultDeposits.status, 'locked')));
        
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
    return res.status(410).json({
      error: "Deposits happen in-game via /c account deposit or by visiting a teller. Direct portal deposits are disabled."
    });
});

citizenRouter.post("/api/citizen/subscriptions/:id/cancel", requireAuth, async (req: express.Request, res: express.Response) => {
  const { db } = await import("../../db/index.js");
  const { subscriptions, bankAccounts } = await import("../../db/schema.js");
  const { eq, and, inArray, or } = await import("drizzle-orm");
  const { getUserCandidateIdentifiers } = await import("../userResolver.js");

  try {
    const candidateIds = await getUserCandidateIdentifiers(req);
    const sub = await db.select().from(subscriptions).where(eq(subscriptions.id, req.params.id)).get();
    if (!sub) return res.status(404).json({ error: "Subscription not found" });

    // Check if user owns either the biller account or the customer account
    const accounts = await db.select().from(bankAccounts).where(inArray(bankAccounts.ownerDiscordId, candidateIds));
    const accountIds = accounts.map(a => a.id);
    
    if (!accountIds.includes(sub.customerAccountId) && !accountIds.includes(sub.billerAccountId)) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    await db.update(subscriptions).set({ isActive: false }).where(eq(subscriptions.id, sub.id));
    res.json({ success: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
});

// -----------------------------------------------------------------------------------------------------
// Escrows (Citizen View)
// -----------------------------------------------------------------------------------------------------

citizenRouter.get("/api/citizen/escrows", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts, banks } = await import("../../db/schema");
    const { eq, or, and, inArray } = await import("drizzle-orm");

    try {
      const discordId = (req as any).user.discordId;

      const myAccounts = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.ownerDiscordId, discordId));
      const myAccountIds = myAccounts.map(a => a.id);

      if (myAccountIds.length === 0) return res.json([]);

      const myEscrows = await db.select({
        id: escrows.id,
        bankId: escrows.bankId,
        bankName: banks.name,
        buyerAccountId: escrows.buyerAccountId,
        sellerAccountId: escrows.sellerAccountId,
        amount: escrows.amount,
        status: escrows.status,
        description: escrows.description,
        contractUrl: escrows.contractUrl,
        createdAt: escrows.createdAt
      })
      .from(escrows)
      .innerJoin(banks, eq(escrows.bankId, banks.id))
      .where(or(
        inArray(escrows.buyerAccountId, myAccountIds),
        inArray(escrows.sellerAccountId, myAccountIds)
      ))
      .all();

      res.json(myEscrows);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
});

citizenRouter.post("/api/citizen/escrows/:escrowId/fund", requireAuth, async (req: express.Request, res: express.Response) => {
    const { db } = await import("../../db/index");
    const { escrows, bankAccounts, transactions } = await import("../../db/schema");
    const { eq, and, sql, gte } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const discordId = (req as any).user.discordId;
      const escrowId = req.params.escrowId;

      const escrow = await db.select().from(escrows).where(eq(escrows.id, escrowId)).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "pending") return res.status(400).json({ error: "Escrow not pending" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      if (!buyer || buyer.ownerDiscordId !== discordId) {
        return res.status(403).json({ error: "Only the buyer can fund this escrow." });
      }

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

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
});
