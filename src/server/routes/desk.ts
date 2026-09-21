import express from "express";
import { eq, and, or, desc, inArray, lte, like, sql } from "drizzle-orm";
import { requireBankStaff, requireRole } from "../middleware.js";
import { parseFeePayerMode } from "../../lib/fee_quote.js";
import { bankBlocksCustomerMoney } from "../../lib/tenant_guard.js";
import { notifyLoanEvent, sendCustomerDm } from "../../lib/customer_notify.js";
import { v4 as uuidv4 } from "uuid";

export const deskRouter = express.Router();

deskRouter.get("/api/banks/:bankId/queue", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { loans, creditApplications, bankAccounts, clearinghouseSettlements, banks, platformAlerts, bankSettings, bankCustomers } = await import("../../db/schema.js");
    const bankId = req.params.bankId;

    const [pendingLoans, delinquentLoans, creditApps, frozen, settlements, alerts, settings, bank] = await Promise.all([
      db.select().from(loans).where(and(eq(loans.bankId, bankId), eq(loans.status, "pending"))),
      db.select().from(loans).where(and(eq(loans.bankId, bankId), inArray(loans.status, ["delinquent", "defaulted"]))),
      db.select().from(creditApplications).where(and(eq(creditApplications.bankId, bankId), eq(creditApplications.status, "pending"))),
      db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.isFrozen, true))),
      db.select().from(clearinghouseSettlements).where(and(
        or(eq(clearinghouseSettlements.fromBankId, bankId), eq(clearinghouseSettlements.toBankId, bankId)),
        inArray(clearinghouseSettlements.status, ["pending", "released"])
      )),
      db.select().from(platformAlerts).where(and(eq(platformAlerts.bankId, bankId), eq(platformAlerts.isOpen, true))).orderBy(desc(platformAlerts.createdAt)).limit(20),
      db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get(),
      db.select().from(banks).where(eq(banks.id, bankId)).get(),
    ]);

    const settleName = (settings?.settlementAccount || "SETTLEMENT").toLowerCase();
    const settleAcc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.accountName, settings?.settlementAccount || "SETTLEMENT"))).get()
      || (await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId))).find((a) => a.accountName?.toLowerCase() === settleName);

    const items: any[] = [];

    for (const l of pendingLoans) {
      items.push({
        id: `loan-${l.id}`,
        kind: "loan_pending",
        severity: "warning",
        title: `Loan application #${l.id.substring(0, 8)}`,
        subtitle: `$${(l.principalAmount / 100).toFixed(2)} · ${l.purpose || "No purpose"}`,
        href: `/bank/${bankId}/loans`,
        action: { method: "PUT", path: `/api/banks/${bankId}/loans/${l.id}/status`, body: { status: "active" }, label: "Approve & fund" },
        meta: l,
      });
    }
    for (const l of delinquentLoans) {
      items.push({
        id: `loan-bad-${l.id}`,
        kind: l.status === "defaulted" ? "loan_defaulted" : "loan_delinquent",
        severity: l.status === "defaulted" ? "critical" : "warning",
        title: `Loan ${l.status} #${l.id.substring(0, 8)}`,
        subtitle: `Remaining $${(l.remainingAmount / 100).toFixed(2)} · ${l.missedPaymentsCount || 0} missed`,
        href: `/bank/${bankId}/collections`,
        meta: l,
      });
    }
    for (const c of creditApps) {
      items.push({
        id: `credit-${c.id}`,
        kind: "credit_pending",
        severity: "info",
        title: `Credit application`,
        subtitle: `Limit $${(c.requestedLimit / 100).toFixed(2)}`,
        href: `/bank/${bankId}/loans`,
        meta: c,
      });
    }
    for (const a of frozen) {
      items.push({
        id: `frozen-${a.id}`,
        kind: "account_frozen",
        severity: "warning",
        title: `Frozen: ${a.accountName}`,
        subtitle: `$${(a.balance / 100).toFixed(2)} · ${a.ownerDiscordId}`,
        href: `/bank/${bankId}/accounts/${a.id}`,
        action: { method: "POST", path: `/api/banks/${bankId}/accounts/${a.id}/freeze`, body: { freeze: false }, label: "Unfreeze" },
        meta: a,
      });
    }
    for (const s of settlements) {
      const weOwe = s.fromBankId === bankId;
      items.push({
        id: `settle-${s.id}`,
        kind: weOwe ? (s.status === "pending" ? "settlement_release" : "settlement_awaiting_them") : (s.status === "released" ? "settlement_confirm" : "settlement_inbound"),
        severity: "warning",
        title: weOwe
          ? (s.status === "pending" ? "Release settlement cash" : "Waiting on other bank to confirm")
          : (s.status === "released" ? "Confirm incoming settlement" : "Inbound settlement pending release"),
        subtitle: `$${(s.amount / 100).toFixed(2)} · ${s.status}`,
        href: `/bank/${bankId}/clearinghouse`,
        action: weOwe && s.status === "pending"
          ? { method: "POST", path: `/api/banks/${bankId}/clearinghouse/settlements/${s.id}/release`, label: "Release" }
          : (!weOwe && s.status === "released"
            ? { method: "POST", path: `/api/banks/${bankId}/clearinghouse/settlements/${s.id}/confirm`, label: "Confirm received" }
            : undefined),
        meta: s,
      });
    }
    for (const al of alerts) {
      items.push({
        id: `alert-${al.id}`,
        kind: al.code,
        severity: al.severity,
        title: al.code.replace(/_/g, " "),
        subtitle: al.message,
        href: `/bank/${bankId}/clearinghouse`,
        meta: al,
      });
    }

    const warn = settings?.settlementWarnCents || 0;
    const settleBal = settleAcc?.balance || 0;
    if (warn > 0 && settleBal < warn) {
      items.push({
        id: "settle-low",
        kind: "settlement_low",
        severity: settleBal <= 0 ? "critical" : "warning",
        title: "SETTLEMENT float is low",
        subtitle: `$${(settleBal / 100).toFixed(2)} under warning $${(warn / 100).toFixed(2)}`,
        href: `/bank/${bankId}/clearinghouse`,
      });
    }

    const rank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));

    res.json({
      generatedAt: new Date().toISOString(),
      counts: {
        pendingLoans: pendingLoans.length,
        delinquentLoans: delinquentLoans.length,
        creditApps: creditApps.length,
        frozen: frozen.length,
        settlements: settlements.length,
        alerts: alerts.length,
        total: items.length,
      },
      suspended: bank?.billingStatus === "suspended" || bank?.status === "suspended",
      items,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Queue failed" });
  }
});

deskRouter.get("/api/banks/:bankId/teller/search", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { bankCustomers, bankAccounts, loans, transactions, cards } = await import("../../db/schema.js");
    const bankId = req.params.bankId;
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 2) return res.json({ customers: [], accounts: [] });

    const allCust = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, bankId));
    const ql = q.toLowerCase();
    const customers = allCust.filter((c) =>
      (c.discordId || "").toLowerCase().includes(ql) ||
      (c.mcUsername || "").toLowerCase().includes(ql) ||
      (c.mcUuid || "").toLowerCase().includes(ql) ||
      (c.rpName || "").toLowerCase().includes(ql) ||
      (c.linkedDiscordId || "").toLowerCase().includes(ql)
    ).slice(0, 12);

    const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
    const matchedAccounts = accounts.filter((a) =>
      !a.isSystem && (
        a.id.toLowerCase().includes(ql) ||
        (a.accountName || "").toLowerCase().includes(ql) ||
        (a.ownerDiscordId || "").toLowerCase().includes(ql) ||
        customers.some((c) => c.discordId === a.ownerDiscordId)
      )
    ).slice(0, 20);

    const ownerIds = [...new Set([...customers.map((c) => c.discordId), ...matchedAccounts.map((a) => a.ownerDiscordId)])];
    const ownerAccounts = accounts.filter((a) => ownerIds.includes(a.ownerDiscordId) && !a.isSystem);
    const accIds = ownerAccounts.map((a) => a.id);

    const ownerLoans = ownerIds.length
      ? await db.select().from(loans).where(and(eq(loans.bankId, bankId), inArray(loans.discordId, ownerIds)))
      : [];
    const recentTx = accIds.length
      ? await db.select().from(transactions).where(or(inArray(transactions.fromAccountId, accIds), inArray(transactions.toAccountId, accIds))).orderBy(desc(transactions.timestamp)).limit(15)
      : [];

    res.json({
      customers,
      accounts: ownerAccounts.length ? ownerAccounts : matchedAccounts,
      loans: ownerLoans,
      recentTx,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

deskRouter.post("/api/banks/:bankId/teller/quote", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { bankAccounts, banks, bankSettings } = await import("../../db/schema.js");
    const { quoteBookTransfer, loadSettings } = await import("../../lib/citycorp_money.js");
    const bankId = req.params.bankId;
    const { fromAccountId, toAccountId, amount, feePayerMode } = req.body;
    const cents = Math.round(parseFloat(amount) * 100);
    if (!fromAccountId || !toAccountId || !Number.isFinite(cents) || cents <= 0) {
      return res.status(400).json({ error: "Invalid quote request" });
    }
    const source = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bankId))).get();
    const dest = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, toAccountId), eq(bankAccounts.bankId, bankId))).get();
    if (!source || !dest) return res.status(404).json({ error: "Account not found" });
    if (source.bankId !== dest.bankId) return res.status(400).json({ error: "Teller quotes stay inside this bank." });
    const settings = await loadSettings(bankId);
    const mode = parseFeePayerMode(feePayerMode, (settings?.defaultFeePayerMode as any) || "from_payment");
    const { quote } = await quoteBookTransfer({ sourceAccount: source, destAccount: dest, desiredCents: cents, mode });
    res.json({ quote, sameBank: source.bankId === dest.bankId });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Quote failed" });
  }
});

deskRouter.post("/api/banks/:bankId/teller/transfer", requireBankStaff, async (req: express.Request, res: express.Response) => {
  const bankId = req.params.bankId;
  const { extractIdempotencyKey, checkIdempotency, startIdempotency, completeIdempotency, releaseIdempotency } = await import("../../lib/idempotency.js");
  const idempotencyKey = extractIdempotencyKey(req);
  const scope = `teller_transfer_${bankId}_${(req as any).user?.discordId || "staff"}`;

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
    const { db } = await import("../../db/index.js");
    const { bankAccounts, banks, auditLogs } = await import("../../db/schema.js");
    const { executeSameBankBookTransfer } = await import("../../lib/citycorp_money.js");
    const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    const block = bankBlocksCustomerMoney(bank);
    if (block.blocked) {
      if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
      return res.status(503).json({ error: block.reason });
    }

    const { fromAccountId, toAccountId, amount, feePayerMode, description } = req.body;
    const cents = Math.round(parseFloat(amount) * 100);
    if (!fromAccountId || !toAccountId || !Number.isFinite(cents) || cents <= 0) {
      if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
      return res.status(400).json({ error: "Invalid transfer" });
    }
    const source = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bankId))).get();
    const dest = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, toAccountId), eq(bankAccounts.bankId, bankId))).get();
    if (!source || !dest) {
      if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
      return res.status(404).json({ error: "Account not found" });
    }

    if (source.bankId !== dest.bankId) {
      if (idempotencyKey) await releaseIdempotency(idempotencyKey, scope);
      return res.status(400).json({ error: "Teller transfers stay inside this bank. Use a wire or Onyx for another bank." });
    }

    const result = await executeSameBankBookTransfer({
      sourceAccount: source,
      destAccount: dest,
      desiredCents: cents,
      mode: feePayerMode,
      description: description || `Teller transfer by ${(req as any).user?.username || "staff"}`,
      type: "transfer",
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      bankId,
      userDiscordId: (req as any).user?.discordId || "staff",
      action: "teller_transfer",
      details: `${source.accountName} → ${dest.accountName} $${(result.quote.submittedCents / 100).toFixed(2)} (received $${(result.quote.receivedCents / 100).toFixed(2)})`,
      timestamp: new Date(),
    });

    import("../../lib/customer_notify.js").then(({ notifyTransferReceived }) =>
      notifyTransferReceived({
        bankId: dest.bankId,
        destOwnerDiscordId: dest.ownerDiscordId,
        destAccountName: dest.accountName,
        receivedCents: result.quote.receivedCents,
        fromLabel: source.accountName,
      })
    ).catch(() => {});

    const responsePayload = { success: true, quote: result.quote, txId: result.txId };
    if (idempotencyKey) {
      await completeIdempotency(idempotencyKey, scope, 200, responsePayload);
    }
    res.json(responsePayload);
  } catch (e: any) {
    if (idempotencyKey) {
      await releaseIdempotency(idempotencyKey, scope);
    }
    console.error(e);
    res.status(500).json({ error: e.message || "Internal error" });
  }
});

deskRouter.get("/api/banks/:bankId/collections", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { loans, bankAccounts, bankSettings } = await import("../../db/schema.js");
    const { loadLoanPolicy } = await import("../loan_processor.js");
    const bankId = req.params.bankId;
    const now = Date.now();
    const all = await db.select().from(loans).where(eq(loans.bankId, bankId));
    const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
    const policy = await loadLoanPolicy(bankId);

    const rows = all
      .filter((l) => ["active", "delinquent", "defaulted"].includes(l.status || ""))
      .map((l) => {
        const acc = accounts.find((a) => a.id === l.accountId);
        const due = l.nextPaymentDate ? new Date(l.nextPaymentDate).getTime() : 0;
        const daysPastDue = due ? Math.max(0, Math.floor((now - due) / 86400000)) : 0;
        const installment = Math.max(policy.minInstallmentCents, Math.round((l.principalAmount || 0) / Math.max(1, l.termMonths || 12)));
        return {
          ...l,
          accountName: acc?.accountName,
          accountBalance: acc?.balance || 0,
          accountFrozen: !!acc?.isFrozen,
          daysPastDue,
          installmentCents: installment,
          nextRetryAt: l.lastPaymentAttemptAt,
        };
      })
      .sort((a, b) => {
        const rank = (s: string) => s === "defaulted" ? 0 : s === "delinquent" ? 1 : 2;
        return rank(a.status || "") - rank(b.status || "") || b.daysPastDue - a.daysPastDue;
      });

    res.json({ policy, loans: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

deskRouter.post("/api/banks/:bankId/collections/:loanId/retry", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { loans, bankAccounts } = await import("../../db/schema.js");
    const { collectLoanPayment, loadLoanPolicy, computeInstallment } = await import("../loan_processor.js");
    const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, loan.accountId)).get();
    if (!account) return res.status(404).json({ error: "Account not found" });
    const policy = await loadLoanPolicy(loan.bankId);
    const amount = Math.round(parseFloat(req.body?.amount) * 100) || computeInstallment(loan, policy.minInstallmentCents);
    const result = await collectLoanPayment({
      loan,
      fromAccount: account,
      amountCents: amount,
      description: `Staff collection (Loan #${loan.id.substring(0, 8)})`,
    });
    notifyLoanEvent({
      bankId: loan.bankId,
      discordId: loan.discordId,
      kind: result.isPaidOff ? "paid" : "paid",
      loanId: loan.id,
      amountCents: result.appliedCents,
      extra: result.isPaidOff ? "This loan is paid off." : `Remaining $${(result.newRemaining / 100).toFixed(2)}.`,
    }).catch(() => {});
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ error: e.message || "Collection failed" });
  }
});

deskRouter.post("/api/banks/:bankId/collections/:loanId/ping", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { loans } = await import("../../db/schema.js");
    const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    await notifyLoanEvent({
      bankId: loan.bankId,
      discordId: loan.discordId,
      kind: loan.status === "defaulted" ? "defaulted" : "due",
      loanId: loan.id,
      amountCents: loan.remainingAmount,
      extra: req.body?.message || "Please contact the bank or pay from your portal.",
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

deskRouter.post("/api/banks/:bankId/collections/:loanId/seize", [requireBankStaff, requireRole(["owner", "admin", "manager", "loan_officer", "compliance"])], async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { loans, auditLogs } = await import("../../db/schema.js");
    const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (loan.collateralStatus !== "pledged" && loan.collateralStatus !== "seized") {
      return res.status(400).json({ error: "No pledged collateral to seize" });
    }
    await db.update(loans).set({ collateralStatus: "seized", status: loan.status === "active" ? "defaulted" : loan.status }).where(eq(loans.id, loan.id));
    await db.insert(auditLogs).values({
      id: uuidv4(),
      bankId: loan.bankId,
      userDiscordId: (req as any).user?.discordId || "staff",
      action: "collateral_seized",
      details: `Seized collateral on loan #${loan.id.substring(0, 8)}: ${loan.collateralDescription || "unspecified"}`,
      timestamp: new Date(),
    });
    await notifyLoanEvent({
      bankId: loan.bankId,
      discordId: loan.discordId,
      kind: "defaulted",
      loanId: loan.id,
      extra: "Pledged collateral has been seized.",
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

deskRouter.post("/api/banks/:bankId/collections/:loanId/cure", [requireBankStaff, requireRole(["owner", "admin", "manager", "loan_officer"])], async (req: express.Request, res: express.Response) => {
  try {
    const { db } = await import("../../db/index.js");
    const { loans, auditLogs } = await import("../../db/schema.js");
    const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
    if (!loan) return res.status(404).json({ error: "Loan not found" });
    if (loan.status === "paid_off") return res.status(400).json({ error: "Loan is already paid off" });
    await db.update(loans).set({
      status: "active",
      isDelinquent: false,
      missedPaymentsCount: 0,
      collateralStatus: loan.collateralStatus === "seized" ? "pledged" : loan.collateralStatus,
    }).where(eq(loans.id, loan.id));
    await db.insert(auditLogs).values({
      id: uuidv4(),
      bankId: loan.bankId,
      userDiscordId: (req as any).user?.discordId || "staff",
      action: "loan_cured",
      details: `Cured default/delinquency on loan #${loan.id.substring(0, 8)}`,
      timestamp: new Date(),
    });
    await notifyLoanEvent({
      bankId: loan.bankId,
      discordId: loan.discordId,
      kind: "approved",
      loanId: loan.id,
      extra: "Your loan is in good standing again.",
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
