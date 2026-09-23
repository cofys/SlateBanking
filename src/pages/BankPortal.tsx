import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDownLeft, ArrowUpRight, Building2, Check, ChevronRight, Copy, CreditCard,
  FileText, Landmark, Loader2, Lock, LogIn, LogOut, Plus, Send, ShieldCheck,
  Sparkles, Unlock, Wallet, X, AlertTriangle, PiggyBank, Receipt, Clock, Link2, CheckCircle2,
  Users, Repeat, Play, Pause, Trash2, Calendar, UserPlus
} from "lucide-react";
import { accentForeground, hexOr, withAlpha } from "../lib/theme";
import { BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";

type View = "home" | "send" | "activity" | "borrow" | "cards" | "bills" | "apply";

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function BankPortal({ overrideBankId }: { overrideBankId?: string }) {
  const params = useParams();
  const bankId = overrideBankId || params.bankId;
  const { user, login, linkDiscord, logout, isLoading, rememberMe, setRememberMe, authError, clearAuthError } = useAuth();

  const [bank, setBank] = useState<any>(null);
  const [bankNotFound, setBankNotFound] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("home");
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [loanProducts, setLoanProducts] = useState<any[]>([]);
  const [cardProducts, setCardProducts] = useState<any[]>([]);
  const [bondProducts, setBondProducts] = useState<any[]>([]);
  const [accountTiers, setAccountTiers] = useState<any[]>([]);
  const [selectedTierId, setSelectedTierId] = useState("");
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [accountNameChoice, setAccountNameChoice] = useState("");
  const [namingPref, setNamingPref] = useState<"custom" | "discord">("custom");
  const [merchants, setMerchants] = useState<any[]>([]);
  const [repayingLoan, setRepayingLoan] = useState<any | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const [destMatches, setDestMatches] = useState<any[]>([]);
  const [destHint, setDestHint] = useState("");
  const [advanceCard, setAdvanceCard] = useState<any | null>(null);

  const [sendFrom, setSendFrom] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [sendMemo, setSendMemo] = useState("");
  const [feeMode, setFeeMode] = useState<"from_payment" | "sender_covers">("from_payment");
  const [quote, setQuote] = useState<any>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<{
    txId: string;
    fromAccountName: string;
    toAccountName: string;
    submittedCents: number;
    receivedCents: number;
    totalFeeCents: number;
    lines?: { code: string; label: string; rate: number; amountCents: number }[];
    feeMode: "from_payment" | "sender_covers";
    memo?: string;
    timestamp: string;
  } | null>(null);

  // Subscriptions State
  const [showAddSubModal, setShowAddSubModal] = useState(false);
  const [subFromAccount, setSubFromAccount] = useState("");
  const [subPayee, setSubPayee] = useState("");
  const [subAmount, setSubAmount] = useState("");
  const [subFrequency, setSubFrequency] = useState<"weekly" | "monthly">("monthly");
  const [subDescription, setSubDescription] = useState("");
  const [subTogglingId, setSubTogglingId] = useState<string | null>(null);

  // Business Account Members State
  const [managingMembersAcc, setManagingMembersAcc] = useState<any | null>(null);
  const [accountMembersList, setAccountMembersList] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newMemberDiscordId, setNewMemberDiscordId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"manager" | "viewer">("manager");
  const [addingMember, setAddingMember] = useState(false);

  // Split Bill State
  const [splitBillModalOpen, setSplitBillModalOpen] = useState(false);
  const [splitFromAccountId, setSplitFromAccountId] = useState("");
  const [splitTotalAmount, setSplitTotalAmount] = useState("");
  const [splitDescription, setSplitDescription] = useState("");
  const [splitParticipants, setSplitParticipants] = useState<string[]>([""]);
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  const brand = hexOr(bank?.brandingColor || bank?.settings?.brandingColor);
  const brandFg = accentForeground(brand);
  const settings = bank?.settings || {};

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };
  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const handleSearch = async () => {
    if (!bankId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/lookup`);
      if (res.ok) setUserData(await res.json());
      else setUserData({ error: "No accounts at this bank yet." });
    } catch {
      setUserData({ error: "Could not load your accounts." });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!bankId) return;
    fetch(`/api/portal/${bankId}/info`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setBankNotFound(true);
        else {
          setBank(d);
          if (Array.isArray(d.settings?.accountTiers)) {
            setAccountTiers(d.settings.accountTiers.filter((t: any) => !t.isPrivate));
          }
          document.title = `${d.name} · Banking`;
        }
      })
      .catch(() => setBankNotFound(true));
    fetch("/api/onyx/merchants").then((r) => r.json()).then((d) => setMerchants(Array.isArray(d) ? d : [])).catch(() => {});
  }, [bankId]);

  useEffect(() => {
    if (user && bank) handleSearch();
  }, [user, bank]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("oauth") === "success") {
      setOauthSuccess(q.get("username"));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!sendFrom || !sendTo || !sendAmt || sendFrom === sendTo) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      setQuoting(true);
      setQuoteErr("");
      try {
        const res = await fetch(`/api/portal/${bankId}/transfer/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromAccountId: sendFrom, toAccountId: sendTo, toQuery: sendTo, amount: sendAmt, feePayerMode: feeMode }),
        });
        const d = await res.json();
        if (!res.ok) {
          setQuote(null);
          setQuoteErr(d.error || "Could not quote");
          setDestMatches(d.matches || []);
        } else {
          setQuote(d.quote);
          setDestHint(d.destination ? `${d.destination.accountName}${d.destination.bankName ? " · " + d.destination.bankName : ""}` : "");
          if (d.destination?.id && d.destination.id !== sendTo) setSendTo(d.destination.id);
          setDestMatches([]);
        }
      } catch {
        setQuoteErr("Quote failed");
      }
      setQuoting(false);
    }, 350);
    return () => clearTimeout(t);
  }, [sendFrom, sendTo, sendAmt, feeMode, bankId]);

  useEffect(() => {
    if ((view === "borrow" || view === "apply") && bankId) {
      fetch(`/api/portal/${bankId}/catalog`)
        .then((r) => r.json())
        .then((d) => {
          setLoanProducts(Array.isArray(d.loans) ? d.loans : []);
          setCardProducts(Array.isArray(d.cards) ? d.cards : []);
          setBondProducts(Array.isArray(d.bonds) ? d.bonds : []);
          if (Array.isArray(d.accountTiers)) {
            setAccountTiers(d.accountTiers.filter((t: any) => !t.isPrivate));
          }
        })
        .catch(() => {});
    }
  }, [view, bankId]);

  const accounts = userData?.accounts || [];
  const availableTiers = (
    accountTiers.length > 0 ? accountTiers : (Array.isArray(settings?.accountTiers) ? settings.accountTiers : [])
  ).filter((t: any) => !t.isPrivate);
  const netWorth = accounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  const loans = userData?.loans || [];
  const activeLoans = loans.filter((l: any) => ["active", "delinquent", "defaulted", "pending", "awaiting_signature"].includes(l.status));
  const closedLoans = loans.filter((l: any) => ["paid_off", "rejected", "closed"].includes(l.status));
  const invoices = (userData?.pendingInvoices || []).filter((i: any) => i.status !== "paid");
  const subscriptions = userData?.subscriptions || [];
  const cards = userData?.cards || [];
  const tx = userData?.recentTx || [];
  const defaultFeeMode = (settings.defaultFeePayerMode as any) === "sender_covers" ? "sender_covers" : "from_payment";

  useEffect(() => {
    if (accounts[0] && !sendFrom) setSendFrom(accounts[0].id);
    if (settings.defaultFeePayerMode) setFeeMode(defaultFeeMode);
  }, [accounts.length, settings.defaultFeePayerMode]);

  const suspended = bank?.billingStatus === "suspended" || bank?.status === "suspended";

  if (bankNotFound || !bankId) {
    return (
      <div className="min-h-screen bg-[#07070b] text-white flex flex-col items-center justify-center gap-3">
        <AlertTriangle className="text-rose-400" />
        <p className="font-semibold">Bank not found</p>
      </div>
    );
  }
  if (isLoading || !bank) {
    return <ScreenLoader label="Opening your bank" />;
  }

  const shell = {
    background: `radial-gradient(1000px 480px at 18% -12%, ${withAlpha(brand, 0.16)}, transparent 55%), var(--bg)`,
    ["--accent" as any]: brand,
    ["--accent-fg" as any]: brandFg,
    color: "var(--fg)",
  } as const;

  const btnBrand = {
    background: brand,
    color: brandFg,
    boxShadow: `0 8px 28px ${withAlpha(brand, 0.22)}`,
  };

  const sendNow = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId: sendFrom, toAccountId: sendTo, toQuery: sendTo, amount: sendAmt, feePayerMode: feeMode, description: sendMemo }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Transfer failed");
      else {
        const fromAcc = accounts.find((a: any) => a.id === sendFrom);
        const toName = d.destination?.accountName || destHint || sendTo;
        setTransferSuccess({
          txId: d.txId || `tx_${Date.now()}`,
          fromAccountName: fromAcc?.accountName || "Your account",
          toAccountName: toName,
          submittedCents: d.quote?.submittedCents ?? quote?.submittedCents ?? Math.round(parseFloat(sendAmt) * 100),
          receivedCents: d.quote?.receivedCents ?? quote?.receivedCents ?? Math.round(parseFloat(sendAmt) * 100),
          totalFeeCents: d.quote?.totalFeeCents ?? quote?.totalFeeCents ?? 0,
          lines: d.quote?.lines ?? quote?.lines ?? [],
          feeMode,
          memo: sendMemo || undefined,
          timestamp: new Date().toISOString(),
        });
        setSendAmt("");
        setSendTo("");
        setSendMemo("");
        setDestHint("");
        setDestMatches([]);
        setQuote(null);
        handleSearch();
      }
    } catch {
      flash("Network error");
    }
    setActionPending(false);
  };

  const applyLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/request-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: fd.get("accountId"),
          amount: fd.get("amount"),
          termMonths: fd.get("termMonths"),
          purpose: fd.get("purpose"),
          productId: fd.get("productId") || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Application failed");
      else {
        flash(d.autoApprove ? "Approved — funds are in your account." : d.awaitingSignature ? "Sign the contract to receive funds." : "Application submitted.");
        setView("home");
        handleSearch();
      }
    } catch {
      flash("Could not submit");
    }
    setActionPending(false);
  };

  const openAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const chosenTierId = (fd.get("tierId") as string) || selectedTierId;
    const chosenTier = availableTiers.find((t: any) => t.id === chosenTierId);

    let accountType = fd.get("accountType") as string;
    if (chosenTier) {
      if (chosenTier.type === "business") {
        accountType = "business_checking";
      } else if (chosenTier.name?.toLowerCase().includes("saving")) {
        accountType = "personal_savings";
      } else {
        accountType = "personal_checking";
      }
    } else if (!accountType) {
      accountType = "personal_checking";
    }

    const accName = (fd.get("accountName") as string) || accountNameChoice;

    setActionPending(true);
    try {
      const res = await fetch("/api/citizen/accounts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          bankId, 
          accountName: accName, 
          accountType,
          tierId: chosenTierId || undefined,
          namingPreference: namingPref,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Could not open account");
      else {
        flash("Account opened.");
        form.reset();
        setAccountNameChoice("");
        setSelectedTierId("");
        setView("home");
        handleSearch();
      }
    } catch {
      flash("Could not open account");
    }
    setActionPending(false);
  };

  const requestCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/request-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: fd.get("accountId"), cardType: fd.get("cardType"), productId: fd.get("productId") || undefined }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Card request failed");
      else {
        flash(d.pending ? "Application submitted for review." : d.issued ? "Card issued." : "Card issued.");
        setView("cards");
        handleSearch();
      }
    } catch {
      flash("Card request failed");
    }
    setActionPending(false);
  };

  const buyBond = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/bonds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: fd.get("accountId"), amount: fd.get("amount"), lockDays: fd.get("lockDays") }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Could not buy bond");
      else {
        flash("Bond purchased. Funds are locked until maturity.");
        setView("home");
        handleSearch();
      }
    } catch {
      flash("Could not buy bond");
    }
    setActionPending(false);
  };

  const cashAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceCard) return;
    const fd = new FormData(e.target as HTMLFormElement);
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/cards/${advanceCard.id}/cash-advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: fd.get("amount") }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Advance failed");
      else {
        flash(`Advanced ${formatMoney(d.advancedCents)}${d.feeCents ? ` · fee ${formatMoney(d.feeCents)}` : ""}.`);
        setAdvanceCard(null);
        handleSearch();
      }
    } catch {
      flash("Advance failed");
    }
    setActionPending(false);
  };

  const payLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingLoan) return;
    const fd = new FormData(e.target as HTMLFormElement);
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/repay-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: repayingLoan.id, accountId: fd.get("accountId"), amount: fd.get("amount") }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Payment failed");
      else {
        flash("Payment posted.");
        setRepayingLoan(null);
        handleSearch();
      }
    } catch {
      flash("Payment failed");
    }
    setActionPending(false);
  };

  const toggleCard = async (cardId: string, locked: boolean) => {
    const res = await fetch(`/api/portal/${bankId}/cards/${cardId}/lock`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLocked: locked }),
    });
    if (res.ok) handleSearch();
    else {
      const d = await res.json();
      flash(d.error || "Could not update card");
    }
  };

  const payInvoice = async (invoiceId: string, accountId: string) => {
    const res = await fetch(`/api/portal/${bankId}/pay-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId, accountId }),
    });
    const d = await res.json();
    if (!res.ok) flash(d.error || "Could not pay invoice");
    else {
      flash("Invoice paid.");
      handleSearch();
    }
  };

  const payMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setActionPending(true);
    try {
      const res = await fetch("/api/citizen/pay-merchant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: fd.get("merchantId"),
          sourceAccountId: fd.get("sourceAccountId"),
          amount: fd.get("amount"),
          description: fd.get("description"),
          feePayerMode: feeMode,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Payment failed");
      else {
        flash("Paid.");
        handleSearch();
      }
    } catch {
      flash("Payment failed");
    }
    setActionPending(false);
  };

  const toggleSubscription = async (subId: string) => {
    setSubTogglingId(subId);
    try {
      const res = await fetch(`/api/portal/${bankId}/subscriptions/${subId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to update subscription");
      else {
        flash(d.isActive ? "Subscription activated." : "Subscription paused.");
        handleSearch();
      }
    } catch {
      flash("Error toggling subscription");
    }
    setSubTogglingId(null);
  };

  const createSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subFromAccount || !subPayee || !subAmount) return;
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerAccountId: subFromAccount,
          billerQuery: subPayee,
          amount: subAmount,
          frequency: subFrequency,
          description: subDescription,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to create subscription");
      else {
        flash("Recurring subscription mandate created.");
        setShowAddSubModal(false);
        setSubPayee("");
        setSubAmount("");
        setSubDescription("");
        handleSearch();
      }
    } catch {
      flash("Error creating subscription");
    }
    setActionPending(false);
  };

  const openManageMembers = async (acc: any) => {
    setManagingMembersAcc(acc);
    setLoadingMembers(true);
    setAccountMembersList([]);
    try {
      const res = await fetch(`/api/portal/${bankId}/accounts/${acc.id}/members`);
      const d = await res.json();
      if (res.ok && Array.isArray(d.members)) {
        setAccountMembersList(d.members);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingMembers(false);
  };

  const addAccountMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingMembersAcc || !newMemberDiscordId.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/accounts/${managingMembersAcc.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberDiscordId: newMemberDiscordId.trim(),
          role: newMemberRole,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to add member");
      else {
        flash("Operator added to account.");
        setNewMemberDiscordId("");
        const refreshed = await fetch(`/api/portal/${bankId}/accounts/${managingMembersAcc.id}/members`).then(r => r.json());
        if (Array.isArray(refreshed.members)) setAccountMembersList(refreshed.members);
        handleSearch();
      }
    } catch {
      flash("Error adding member");
    }
    setAddingMember(false);
  };

  const removeAccountMember = async (memberId: string) => {
    if (!managingMembersAcc) return;
    try {
      const res = await fetch(`/api/portal/${bankId}/accounts/${managingMembersAcc.id}/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        flash("Member removed.");
        setAccountMembersList(prev => prev.filter(m => m.id !== memberId));
        handleSearch();
      } else {
        const d = await res.json().catch(() => ({}));
        flash(d.error || "Failed to remove member");
      }
    } catch {
      flash("Error removing member");
    }
  };

  const startSplitBill = (fromTx?: any) => {
    if (accounts.length > 0 && !splitFromAccountId) {
      setSplitFromAccountId(accounts[0].id);
    }
    if (fromTx) {
      const amtDollars = ((fromTx.amountSubmitted ?? fromTx.amount) / 100).toFixed(2);
      setSplitTotalAmount(amtDollars);
      setSplitDescription(fromTx.description || "Expense");
      if (fromTx.fromAccountId) setSplitFromAccountId(fromTx.fromAccountId);
    } else {
      setSplitTotalAmount("");
      setSplitDescription("");
    }
    setSplitParticipants([""]);
    setSplitBillModalOpen(true);
  };

  const handleSendSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(splitTotalAmount);
    if (!splitFromAccountId || isNaN(total) || total <= 0) {
      flash("Please enter a valid total amount and select a receiving account.");
      return;
    }
    const cleanParticipants = splitParticipants.map(p => p.trim()).filter(Boolean);
    if (cleanParticipants.length === 0) {
      flash("Please enter at least one participant to split with.");
      return;
    }

    const perPerson = parseFloat((total / (cleanParticipants.length + 1)).toFixed(2));
    const splits = cleanParticipants.map(target => ({
      target,
      amount: perPerson,
    }));

    setSplitSubmitting(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/split-bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccountId: splitFromAccountId,
          description: splitDescription,
          splits,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to send split requests");
      else {
        flash(`Split requests sent! Created ${d.invoicesCreated} payment request${d.invoicesCreated === 1 ? "" : "s"}.`);
        setSplitBillModalOpen(false);
        handleSearch();
      }
    } catch {
      flash("Error creating split bill");
    }
    setSplitSubmitting(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen relative overflow-hidden" style={shell}>
        <div className="relative z-10 max-w-md mx-auto px-5 py-16 space-y-10 page-enter">
          <div className="text-center space-y-5">
            {((settings.logoUrl || bank.logoUrl) && !logoBroken) ? (
              <img src={settings.logoUrl || bank.logoUrl} alt="" referrerPolicy="no-referrer" onError={() => setLogoBroken(true)} className="w-20 h-20 rounded-3xl mx-auto object-contain border p-2" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }} />
            ) : (
              <BrandMark letter={bank.name} color={brand} size={72} />
            )}
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ letterSpacing: "-0.03em" }}>{bank.name}</h1>
              <p className="text-sm mt-2" style={{ color: "var(--fg-muted)" }}>{settings.tagline || "Private banking for the city."}</p>
            </div>
          </div>
          <div className="border p-6 space-y-4" style={{ borderRadius: "var(--radius-xl)", borderColor: "var(--border)", background: "color-mix(in oklab, var(--fg) 3%, transparent)" }}>
            <label className="flex items-center justify-center gap-2 text-xs" style={{ color: "var(--fg-muted)" }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="rounded" />
              Remember this device
            </label>
            <button onClick={() => login(bankId, "citycorp")} className="w-full py-3.5 rounded-xl font-semibold text-sm" style={btnBrand}>
              Continue with CityCorp
            </button>
          </div>
          <div className="text-center text-xs" style={{ color: "var(--fg-subtle)" }}>
            Staff? <Link to={`/bank/${bankId}`} className="hover:underline" style={{ color: "var(--fg-muted)" }}>Open the desk</Link>
          </div>
        </div>
      </div>
    );
  }

  const displayName = userData?.customer?.rpName || userData?.customer?.mcUsername || user.username;
  const nav = [
    { id: "home" as View, label: "Home", icon: Wallet },
    { id: "send" as View, label: "Send", icon: Send },
    { id: "activity" as View, label: "Activity", icon: Clock },
    { id: "apply" as View, label: "Apply", icon: Sparkles },
  ];

  return (
    <div className="min-h-screen" style={shell}>
      <header className="sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 78%, transparent)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {((settings.logoUrl || bank.logoUrl) && !logoBroken) ? (
              <img src={settings.logoUrl || bank.logoUrl} className="w-9 h-9 rounded-xl object-contain border" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }} alt="" referrerPolicy="no-referrer" onError={() => setLogoBroken(true)} />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-semibold" style={{ background: brand, color: brandFg }}>{bank.name.slice(0, 1)}</div>
            )}
            <div className="min-w-0">
              <p className="font-semibold truncate leading-tight">{bank.name}</p>
              <p className="text-[11px] truncate" style={{ color: "var(--fg-subtle)" }}>{settings.tagline || "Online banking"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(userData?.isStaff || user.isGlobalAdmin) && (
              <Link to={`/bank/${bankId}`} className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border" style={{ borderColor: "var(--border)", color: "var(--fg-muted)" }}>
                <ShieldCheck size={13} /> Desk
              </Link>
            )}
            <button onClick={logout} className="p-2.5 rounded-xl" title="Sign out" style={{ color: "var(--fg-subtle)" }}>
              <LogOut size={16} />
            </button>
            <div className="w-9 h-9 rounded-xl overflow-hidden border flex items-center justify-center text-xs font-semibold" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              {user.avatarUrl && !avatarError ? (
                <img src={user.avatarUrl} alt="" onError={() => setAvatarError(true)} className="w-full h-full object-cover" />
              ) : displayName?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 pb-28 space-y-6">
        {suspended && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">This bank is suspended. Transfers are frozen.</div>
        )}
        {bank.maintenanceMode && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Maintenance — transfers may be paused.</div>
        )}
        {oauthSuccess && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 flex justify-between">
            Linked as {oauthSuccess}
            <button onClick={() => setOauthSuccess(null)}><X size={14} /></button>
          </div>
        )}
        {authError && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-center justify-between">
            <span>{authError}</span>
            <button onClick={clearAuthError} className="text-rose-400 hover:text-white"><X size={16} /></button>
          </div>
        )}

        {view === "home" && (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-[28px] p-7 relative overflow-hidden border"
              style={{ background: `linear-gradient(155deg, ${withAlpha(brand, 0.28)} 0%, var(--bg-elevated) 62%)`, borderColor: "var(--border)" }}
            >
              <p className="text-sm" style={{ color: "var(--fg-muted)" }}>{greet()}, {displayName}</p>
              <p className="text-[11px] uppercase tracking-[0.18em] mt-5" style={{ color: "var(--fg-subtle)" }}>Available</p>
              <p className="text-4xl sm:text-5xl font-semibold tracking-tight mt-1 tabular-nums num" style={{ letterSpacing: "-0.03em" }}>{formatMoney(netWorth)}</p>
              <p className="text-xs mt-2" style={{ color: "var(--fg-subtle)" }}>{accounts.length} account{accounts.length === 1 ? "" : "s"}</p>
              <div className="grid grid-cols-4 gap-2 mt-7">
                {[
                  { id: "send" as View, label: "Send", icon: Send },
                  { id: "bills" as View, label: "Pay", icon: Receipt },
                  { id: "borrow" as View, label: "Loans", icon: Landmark },
                  { id: "apply" as View, label: "Apply", icon: Plus },
                ].map((a) => (
                  <button key={a.id} onClick={() => { if (a.id === "send") setTransferSuccess(null); setView(a.id); }} className="flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-semibold" style={{ background: "color-mix(in oklab, var(--fg) 5%, transparent)", borderColor: "var(--border)" }}>
                    <a.icon size={16} />
                    {a.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {user.linkedDiscordId ? (
              <div
                className="w-full text-left rounded-2xl border p-4 flex items-center justify-between"
                style={{ borderColor: "rgba(34, 197, 94, 0.25)", background: "rgba(34, 197, 94, 0.05)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-emerald-400 bg-emerald-500/10">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-300 flex items-center gap-2">Discord linked for bank bot</p>
                    <p className="text-xs text-emerald-200/60 mt-0.5">Discord ID: {user.linkedDiscordId}. The /bank bot can access your accounts.</p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => linkDiscord(bankId)}
                className="w-full text-left rounded-2xl border p-4 flex items-center justify-between"
                style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--fg) 3%, transparent)" }}
              >
                <div>
                  <p className="text-sm font-semibold flex items-center gap-2"><Link2 size={14} /> Connect Discord for the bank bot</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-subtle)" }}>Optional. Sign-in stays CityCorp. The /bank bot only works after this link.</p>
                </div>
                <ChevronRight size={16} style={{ color: "var(--fg-subtle)" }} />
              </button>
            )}
            {activeLoans.some((l: any) => l.status === "delinquent" || l.isDelinquent) && (
              <button onClick={() => setView("borrow")} className="w-full text-left rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-amber-200">A loan needs attention</p>
                  <p className="text-xs text-amber-200/70 mt-0.5">Open loans to pay or review terms.</p>
                </div>
                <ChevronRight size={16} className="text-amber-300" />
              </button>
            )}
            {invoices.length > 0 && (
              <button onClick={() => setView("bills")} className="w-full text-left rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{invoices.length} unpaid invoice{invoices.length === 1 ? "" : "s"}</p>
                  <p className="text-xs text-white/40 mt-0.5">Pay from your accounts in one tap.</p>
                </div>
                <ChevronRight size={16} className="text-white/30" />
              </button>
            )}

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">Accounts</h2>
                <button onClick={() => setView("apply")} className="text-xs font-bold text-white/50 hover:text-white flex items-center gap-1"><Plus size={12} /> New</button>
              </div>
              {loading ? (
                <div className="h-24 rounded-2xl bg-white/5 animate-pulse" />
              ) : accounts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-white/50">
                  No accounts yet.
                  <button onClick={() => setView("apply")} className="block mx-auto mt-3 text-white font-bold" style={{ color: brand }}>Open one</button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {accounts.map((acc: any) => (
                    <div key={acc.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 transition">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-white/40">
                            {acc.tierId && availableTiers.find((t: any) => t.id === acc.tierId)
                              ? `${availableTiers.find((t: any) => t.id === acc.tierId).name} · ${acc.accountType?.replace('_', ' ') || 'personal'}`
                              : (acc.accountType?.replace('_', ' ') || "personal")}
                          </p>
                          <p className="font-bold mt-0.5">{acc.accountName}</p>
                        </div>
                        {acc.isFrozen && <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full">Frozen</span>}
                      </div>
                      <p className="text-2xl font-black tabular-nums mt-4">{formatMoney(acc.balance)}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <button onClick={() => copy(acc.id, acc.id)} className="text-[11px] font-mono text-white/30 hover:text-white flex items-center gap-1">
                          {copied === acc.id ? <Check size={11} /> : <Copy size={11} />}
                          {acc.id.slice(0, 14)}…
                        </button>
                        {acc.accountType?.includes("business") && (
                          <button
                            type="button"
                            onClick={() => openManageMembers(acc)}
                            className="flex items-center gap-1 text-[11px] font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 transition"
                          >
                            <Users size={12} />
                            <span>Team & Operators</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {activeLoans.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">Active Loans</h2>
                  <button onClick={() => setView("borrow")} className="text-xs font-bold text-white/50 hover:text-white transition-colors">See all</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {activeLoans.slice(0, 4).map((l: any) => {
                    const principal = l.principalAmount || l.amount || 0;
                    const remaining = l.remainingAmount ?? l.remainingBalance ?? 0;
                    const paid = Math.max(0, principal - remaining);
                    const pct = principal > 0 ? Math.min(100, Math.max(0, Math.round((paid / principal) * 100))) : 0;
                    const isDelinquent = l.status === "delinquent" || l.isDelinquent;
                    return (
                      <div
                        key={l.id}
                        onClick={() => setSelectedLoan(l)}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 p-5 cursor-pointer transition-all group space-y-3"
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isDelinquent ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-white/70 group-hover:text-white"
                            }`}>
                              <Landmark size={15} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate text-white group-hover:text-white">
                                {l.purpose ? l.purpose : `Loan #${l.id.slice(0, 8)}`}
                              </p>
                              <p className="text-[10px] font-mono text-white/40">#{l.id.slice(0, 8)} · {(l.interestRate / 100).toFixed(2)}% APR</p>
                            </div>
                          </div>
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                            isDelinquent ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                            l.status === "active" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" :
                            "bg-white/10 text-white/60"
                          }`}>
                            {l.status}
                          </span>
                        </div>
                        <div>
                          <p className="text-2xl font-black tabular-nums">{formatMoney(remaining)}</p>
                          <p className="text-xs text-white/40 mt-0.5">of {formatMoney(principal)}</p>
                        </div>
                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: isDelinquent ? "#f59e0b" : pct === 100 ? "#10b981" : (brand || "#2563eb")
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between pt-0.5 text-[11px] text-white/40">
                          <span>{l.nextPaymentDate ? `Due ${format(new Date(l.nextPaymentDate), "MMM d, yyyy")}` : "Click for details"}</span>
                          <span className="text-white/60 group-hover:text-white flex items-center gap-0.5 transition-colors">
                            Details <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">Recent Activity</h2>
                <button onClick={() => setView("activity")} className="text-xs font-bold text-white/50 hover:text-white transition-colors">See all</button>
              </div>
              <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                {tx.slice(0, 6).length === 0 && <p className="p-5 text-sm text-white/40">No activity yet.</p>}
                {tx.slice(0, 6).map((t: any) => {
                  const inbound = accounts.some((a: any) => a.id === t.toAccountId);
                  return (
                    <div 
                      key={t.id} 
                      onClick={() => setSelectedTx(t)}
                      className="px-4 py-3.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${inbound ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/60 group-hover:text-white"}`}>
                        {inbound ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate text-white group-hover:text-white">{t.description || t.type}</p>
                          {t.memo && (
                            <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded font-mono truncate max-w-[120px] hidden sm:inline-block">
                              "{t.memo}"
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/35">
                          {t.timestamp ? format(new Date(t.timestamp), "MMM d · h:mm a") : ""} · Click for details
                        </p>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <p className={`font-mono text-sm font-bold ${inbound ? "text-emerald-300" : "text-white"}`}>
                          {inbound ? "+" : "−"}{formatMoney(inbound ? (t.amountReceived ?? t.amount) : (t.amountSubmitted ?? t.amount))}
                        </p>
                        <ChevronRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {view === "send" && transferSuccess && (
          <div className="max-w-lg space-y-6">
            <div className="text-center space-y-2 pt-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="text-2xl font-black text-white">Transfer Confirmed</h2>
              <p className="text-xs text-white/50">Your funds have been transferred successfully via CityCorp.</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
              <div className="text-center py-2 border-b border-white/5">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Total Sent</span>
                <div className="text-3xl font-black font-mono text-white mt-1">
                  {formatMoney(transferSuccess.submittedCents)}
                </div>
              </div>

              <div className="flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm">
                <span className="text-emerald-200/80 font-medium">Recipient Receives</span>
                <span className="font-mono font-bold text-emerald-300">
                  {formatMoney(transferSuccess.receivedCents)}
                </span>
              </div>

              <div className="space-y-2.5 text-sm pt-1">
                <div className="flex justify-between">
                  <span className="text-white/40">To</span>
                  <span className="font-semibold text-white">{transferSuccess.toAccountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">From</span>
                  <span className="font-semibold text-white/80">{transferSuccess.fromAccountName}</span>
                </div>
                {transferSuccess.memo && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Memo</span>
                    <span className="text-white/80 italic">"{transferSuccess.memo}"</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Fee Policy</span>
                  <span className="text-white/70 font-medium">
                    {transferSuccess.feeMode === "sender_covers" ? "Sender Covered Fees" : "Fees Deducted from Payment"}
                  </span>
                </div>
              </div>

              {transferSuccess.lines && transferSuccess.lines.length > 0 && (
                <div className="pt-3 border-t border-white/5 space-y-1.5">
                  <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider">Fee Breakdown</span>
                  {transferSuccess.lines.map((l: any) => (
                    <div key={l.code} className="flex justify-between text-xs">
                      <span className="text-white/40">{l.label} ({Number((l.rate * 100).toFixed(2))}%)</span>
                      <span className="font-mono text-white/60">{formatMoney(l.amountCents)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1 border-t border-white/5 font-medium">
                    <span className="text-white/50">Total Fees</span>
                    <span className="font-mono text-amber-300/80">{formatMoney(transferSuccess.totalFeeCents)}</span>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Reference</span>
                  <button
                    type="button"
                    onClick={() => copy(transferSuccess.txId, "conf_tx")}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-white/70 hover:text-white bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 transition-colors"
                  >
                    <span>{transferSuccess.txId.slice(0, 16)}…</span>
                    {copied === "conf_tx" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="flex justify-between text-white/35">
                  <span>Timestamp</span>
                  <span>{format(new Date(transferSuccess.timestamp), "MMM d, yyyy · h:mm a")}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setTransferSuccess(null);
                  setView("home");
                }}
                className="w-full py-3.5 rounded-2xl font-bold text-white shadow-lg transition-opacity hover:opacity-95"
                style={btnBrand}
              >
                Return to Dashboard
              </button>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setTransferSuccess(null);
                  }}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <Send size={14} /> Send Another
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferSuccess(null);
                    setView("activity");
                  }}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <FileText size={14} /> View Activity
                </button>
              </div>
            </div>
          </div>
        )}

        {view === "send" && !transferSuccess && (
          <form onSubmit={sendNow} className="max-w-lg space-y-5">
            <h2 className="text-2xl font-black">Send money</h2>
            <label className="block text-xs font-bold text-white/40 uppercase">From</label>
            <select value={sendFrom} onChange={(e) => setSendFrom(e.target.value)} className="w-full bg-[#18181c] border border-white/10 rounded-2xl px-4 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
              {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · {formatMoney(a.balance)}</option>)}
            </select>
            <label className="block text-xs font-bold text-white/40 uppercase">To</label>
            <input
              value={sendTo}
              onChange={(e) => {
                const v = e.target.value;
                setSendTo(v);
                setDestHint("");
                fetch(`/api/portal/${bankId}/payees?q=${encodeURIComponent(v)}`)
                  .then((r) => r.json())
                  .then((d) => setDestMatches(Array.isArray(d) ? d : []))
                  .catch(() => {});
              }}
              onFocus={() => {
                fetch(`/api/portal/${bankId}/payees`)
                  .then((r) => r.json())
                  .then((d) => setDestMatches(Array.isArray(d) ? d : []))
                  .catch(() => {});
              }}
              placeholder="Exact account name (in-game)"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm"
              required
              autoComplete="off"
            />
            <p className="text-[11px] text-white/35 -mt-3">Suggestions are only people you have already sent money to or received from at this bank. To pay someone new, type their exact account name. Cross-bank payments use Onyx.</p>
            {destHint && <p className="text-xs text-emerald-300 -mt-3">{destHint}</p>}
            {destMatches.length > 0 && (
              <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden -mt-2">
                {destMatches.map((m: any) => (
                  <button type="button" key={m.id} onClick={() => { setSendTo(m.id); setDestHint(`${m.accountName}${m.bankName ? " · " + m.bankName : ""}`); setDestMatches([]); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5">
                    <span className="font-semibold">{m.accountName}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="block text-xs font-bold text-white/40 uppercase">Amount</label>
            <input value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} type="number" step="0.01" min="0.01" placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-2xl font-black tabular-nums" required />
            <div className="flex rounded-2xl bg-white/5 p-1 text-xs font-bold">
              <button type="button" onClick={() => setFeeMode("from_payment")} className={`flex-1 py-2 rounded-xl ${feeMode === "from_payment" ? "bg-white/10 text-white" : "text-white/40"}`}>Fees from payment</button>
              <button type="button" onClick={() => setFeeMode("sender_covers")} className={`flex-1 py-2 rounded-xl ${feeMode === "sender_covers" ? "bg-white/10 text-white" : "text-white/40"}`}>I cover fees</button>
            </div>
            <div className="rounded-2xl border border-white/10 p-4 text-sm space-y-1.5 min-h-[96px]">
              {quoting && <p className="text-white/40 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Quoting…</p>}
              {quoteErr && <p className="text-rose-300 text-xs">{quoteErr}</p>}
              {quote && (
                <>
                  <div className="flex justify-between"><span className="text-white/40">You send</span><span className="font-mono font-bold">{formatMoney(quote.submittedCents)}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">They receive</span><span className="font-mono font-bold text-emerald-300">{formatMoney(quote.receivedCents)}</span></div>
                  {quote.lines?.map((l: any) => (
                    <div key={l.code} className="flex justify-between text-xs"><span className="text-white/35">{l.label} ({Number((l.rate * 100).toFixed(2))}%)</span><span className="font-mono text-white/60">{formatMoney(l.amountCents)}</span></div>
                  ))}
                  {quote.lines && quote.lines.length > 1 && (
                    <div className="flex justify-between text-xs pt-1 border-t border-white/5 font-medium"><span className="text-white/50">Total Fees</span><span className="font-mono text-amber-300/80">{formatMoney(quote.totalFeeCents)}</span></div>
                  )}
                </>
              )}
              {!quoting && !quote && !quoteErr && <p className="text-white/30 text-xs">Enter an amount to see city tax and bank fees before you confirm.</p>}
            </div>
            <input value={sendMemo} onChange={(e) => setSendMemo(e.target.value)} placeholder="Memo (optional)" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm" />
            <button disabled={actionPending || suspended} className="w-full py-3.5 rounded-2xl font-bold text-white disabled:opacity-50" style={btnBrand}>
              {actionPending ? "Sending…" : "Confirm send"}
            </button>
          </form>
        )}

        {view === "activity" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">Activity</h2>
              <span className="text-xs text-white/40">{tx.length} transaction{tx.length === 1 ? "" : "s"}</span>
            </div>
            <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
              {tx.length === 0 && <p className="p-6 text-white/40 text-sm">Nothing here yet.</p>}
              {tx.map((t: any) => {
                const inbound = accounts.some((a: any) => a.id === t.toAccountId);
                return (
                  <div 
                    key={t.id} 
                    onClick={() => setSelectedTx(t)}
                    className="px-4 py-3.5 flex items-center gap-3 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${inbound ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/60 group-hover:text-white"}`}>
                      {inbound ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate text-white group-hover:text-white">{t.description || t.type}</p>
                        {t.memo && (
                          <span className="text-[10px] bg-white/10 text-white/80 px-2 py-0.5 rounded font-mono truncate max-w-[160px]">
                            "{t.memo}"
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/35">
                        {t.timestamp ? format(new Date(t.timestamp), "MMM d, yyyy · h:mm a") : ""} · Click for receipt
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <p className={`font-mono text-sm font-bold ${inbound ? "text-emerald-300" : "text-white"}`}>
                        {inbound ? "+" : "−"}{formatMoney(inbound ? (t.amountReceived ?? t.amount) : (t.amountSubmitted ?? t.amount))}
                      </p>
                      {!inbound && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startSplitBill(t);
                          }}
                          title="Split this bill with friends"
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white text-xs font-semibold flex items-center gap-1 border border-white/10 transition"
                        >
                          <Users size={12} />
                          <span>Split</span>
                        </button>
                      )}
                      <ChevronRight size={14} className="text-white/20 group-hover:text-white/60 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "borrow" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">Loans & Financing</h2>
                <p className="text-xs text-white/40 mt-0.5">Click any loan to view full terms, payment schedule, or submit payments.</p>
              </div>
              {settings.enableLoans !== false && (
                <button onClick={() => setView("apply")} className="text-xs font-bold px-3.5 py-2 rounded-xl" style={btnBrand}>Apply for Loan</button>
              )}
            </div>

            {activeLoans.length === 0 && closedLoans.length === 0 && (
              <div className="rounded-2xl border border-white/10 p-8 text-center space-y-3 bg-white/[0.02]">
                <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                  <Landmark size={24} />
                </div>
                <div>
                  <p className="font-bold text-white">No active or historical loans</p>
                  <p className="text-xs text-white/40 mt-1">Apply any time to finance personal goals or commercial investments.</p>
                </div>
                {settings.enableLoans !== false && (
                  <button onClick={() => setView("apply")} className="text-xs font-bold px-4 py-2 rounded-xl mt-2" style={btnBrand}>
                    Explore Financing
                  </button>
                )}
              </div>
            )}

            {activeLoans.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold tracking-wide uppercase text-white/50">Active Loans ({activeLoans.length})</h3>
                  <span className="text-[11px] text-white/30">Click loan for full breakdown</span>
                </div>
                <div className="space-y-3">
                  {activeLoans.map((l: any) => {
                    const principal = l.principalAmount || l.amount || 0;
                    const remaining = l.remainingAmount ?? l.remainingBalance ?? 0;
                    const paid = Math.max(0, principal - remaining);
                    const pct = principal > 0 ? Math.min(100, Math.max(0, Math.round((paid / principal) * 100))) : 0;
                    const isDelinquent = l.status === "delinquent" || l.isDelinquent;

                    return (
                      <div
                        key={l.id}
                        onClick={() => setSelectedLoan(l)}
                        className="rounded-2xl border border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] p-5 space-y-3.5 cursor-pointer transition-all group shadow-sm"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isDelinquent ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-white/70 group-hover:text-white"
                            }`}>
                              <Landmark size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-base text-white group-hover:text-white truncate">
                                {l.purpose ? l.purpose : `Loan #${l.id.slice(0, 8)}`}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
                                <span className="font-mono">#{l.id.slice(0, 8)}</span>
                                <span>·</span>
                                <span>{(l.interestRate / 100).toFixed(2)}% APR</span>
                                {l.termMonths && (
                                  <>
                                    <span>·</span>
                                    <span>{l.termMonths} Mo</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full ${
                              isDelinquent ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                              l.status === "active" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" :
                              l.status === "defaulted" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" :
                              "bg-white/10 text-white/60"
                            }`}>
                              {l.status?.replace(/_/g, " ")}
                            </span>
                            <ChevronRight size={16} className="text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                          <div>
                            <p className="text-2xl font-black tabular-nums text-white">{formatMoney(remaining)}</p>
                            <p className="text-xs text-white/40 mt-0.5">
                              remaining of {formatMoney(principal)} original principal
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <span className="text-xs font-mono text-white/60">{pct}% repaid</span>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              background: isDelinquent ? "#f59e0b" : pct === 100 ? "#10b981" : (brand || "#2563eb")
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-white/40">
                            {l.nextPaymentDate ? `Next due: ${format(new Date(l.nextPaymentDate), "MMM d, yyyy")}` : "Click to view full terms"}
                          </span>
                          {["active", "delinquent", "defaulted"].includes(l.status) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRepayingLoan(l);
                              }}
                              className="font-bold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs transition border border-white/10"
                              style={{ color: brand }}
                            >
                              Pay installment
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {closedLoans.length > 0 && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold tracking-wide uppercase text-white/40">Loan History ({closedLoans.length})</h3>
                <div className="space-y-2">
                  {closedLoans.map((l: any) => (
                    <div
                      key={l.id}
                      onClick={() => setSelectedLoan(l)}
                      className="rounded-2xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] p-4 flex items-center justify-between cursor-pointer transition group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white">
                          <Landmark size={15} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/80 group-hover:text-white">
                            {l.purpose ? l.purpose : `Loan #${l.id.slice(0, 8)}`}
                          </p>
                          <p className="text-[11px] text-white/40 font-mono">
                            {formatMoney(l.principalAmount || l.amount)} · {l.createdAt ? format(new Date(l.createdAt), "MMM d, yyyy") : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {l.status?.replace(/_/g, " ")}
                        </span>
                        <ChevronRight size={14} className="text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === "cards" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black">Cards</h2>
              {settings.enableCards !== false && <button onClick={() => setView("apply")} className="text-xs font-bold px-3 py-2 rounded-xl border border-white/10">Request</button>}
            </div>
            {cards.length === 0 && <p className="text-white/40 text-sm">No cards yet.</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {cards.map((c: any) => (
                <div key={c.id} className="rounded-2xl p-5 border border-white/10" style={{ background: `linear-gradient(160deg, ${withAlpha(brand, 0.35)}, #0c0c12)` }}>
                  <p className="text-[11px] uppercase tracking-widest text-white/50">{c.type} · {c.accountName || ""}</p>
                  <p className="font-mono text-lg mt-4 tracking-widest">{c.cardNumber ? `•••• ${String(c.cardNumber).slice(-4)}` : "••••"}</p>
                  <p className="text-xs text-white/40 mt-2">Exp {c.expiryDate}</p>
                  {c.type === "credit" && (
                    <div className="mt-3 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-white/40">Limit</span><span className="font-mono">{formatMoney(c.creditLimit)}</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Used</span><span className="font-mono">{formatMoney(c.creditUsed)}</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Available</span><span className="font-mono text-emerald-300">{formatMoney(Math.max(0, (c.creditLimit || 0) - (c.creditUsed || 0)))}</span></div>
                    </div>
                  )}
                  <div className="flex gap-3 mt-4">
                    <button onClick={() => toggleCard(c.id, !c.isLocked)} className="text-xs font-bold flex items-center gap-1">
                      {c.isLocked ? <Unlock size={12} /> : <Lock size={12} />}
                      {c.isLocked ? "Unlock" : "Lock"}
                    </button>
                    {c.type === "credit" && !c.isLocked && (
                      <button type="button" onClick={() => setAdvanceCard(c)} className="text-xs font-bold" style={{ color: brand }}>Cash advance</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "bills" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Pay & Recurring</h2>
                <p className="text-xs text-white/40 mt-0.5">Manage unpaid invoices, recurring subscriptions, and split bills.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startSplitBill()}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white flex items-center gap-1.5 transition"
                >
                  <Users size={14} />
                  <span>Split a Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (accounts.length > 0 && !subFromAccount) setSubFromAccount(accounts[0].id);
                    setShowAddSubModal(true);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                  style={btnBrand}
                >
                  <Repeat size={14} />
                  <span>New Subscription</span>
                </button>
              </div>
            </div>

            {/* Invoices */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                <Receipt size={14} /> Unpaid Invoices ({invoices.length})
              </h3>
              {invoices.length === 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 text-sm text-white/40">
                  No unpaid invoices.
                </div>
              )}
              {invoices.map((inv: any) => (
                <div key={inv.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{inv.description || "Invoice"}</p>
                    <p className="text-xs text-white/40">{formatMoney(inv.amount)} · Due {inv.dueDate ? format(new Date(inv.dueDate), "MMM d") : "Soon"}</p>
                  </div>
                  <select className="bg-[#18181c] border border-white/10 rounded-xl text-xs px-3 py-2 text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]" onChange={(e) => { if (e.target.value) payInvoice(inv.id, e.target.value); }}>
                    <option value="" className="bg-[#18181c] text-[#f4f4f5]">Pay from…</option>
                    {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · {formatMoney(a.balance)}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Subscriptions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                  <Repeat size={14} /> Subscriptions & Recurring Mandates ({subscriptions.length})
                </h3>
              </div>
              {subscriptions.length === 0 ? (
                <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-5 text-center text-sm text-white/40">
                  <p>No active subscriptions.</p>
                  <p className="text-xs text-white/30 mt-1">Set up recurring rent, membership dues, or vendor payments automatically.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {subscriptions.map((sub: any) => (
                    <div key={sub.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{sub.description || "Recurring Mandate"}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${sub.isActive ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-amber-500/15 text-amber-300 border border-amber-500/20"}`}>
                            {sub.isActive ? "Active" : "Paused"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1.5">
                          <span className="text-xl font-bold font-mono tabular-nums">{formatMoney(sub.amount)}</span>
                          <span className="text-xs text-white/40">/ {sub.frequency}</span>
                        </div>
                        <div className="text-xs text-white/40 space-y-0.5 mt-2">
                          <p>From: <span className="text-white/70 font-medium">{sub.customerAccountName || "Your Account"}</span></p>
                          <p>To: <span className="text-white/70 font-medium">{sub.billerAccountName || "Merchant"}</span></p>
                          {sub.nextRun && (
                            <p className="text-[11px] text-white/35 flex items-center gap-1 mt-1">
                              <Calendar size={11} /> Next charge: {format(new Date(sub.nextRun), "MMM d, yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-white/30">
                          {sub.isOutgoing ? "Outgoing Debit" : "Incoming Credit"}
                        </span>
                        <button
                          type="button"
                          disabled={subTogglingId === sub.id}
                          onClick={() => toggleSubscription(sub.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition"
                        >
                          {subTogglingId === sub.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : sub.isActive ? (
                            <>
                              <Pause size={12} />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play size={12} />
                              <span>Resume</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Merchant Payment */}
            {merchants.length > 0 && (
              <form onSubmit={payMerchant} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Pay a merchant</h3>
                <select name="sourceAccountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName}</option>)}
                </select>
                <select name="merchantId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  <option value="" className="bg-[#18181c] text-[#f4f4f5]">Merchant…</option>
                  {merchants.map((m: any) => <option key={m.id} value={m.id} className="bg-[#18181c] text-[#f4f4f5]">{m.name}{m.bankName ? ` · ${m.bankName}` : ""}</option>)}
                </select>
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono" />
                <input name="description" placeholder="Memo" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
                <button disabled={actionPending} className="w-full py-2.5 rounded-xl font-bold text-sm" style={btnBrand}>Pay</button>
              </form>
            )}
          </div>
        )}

        {view === "apply" && (
          <div className="space-y-8">
            <h2 className="text-2xl font-black">Apply</h2>
            <p className="text-sm text-white/45 -mt-6">Everything this bank offers. Nothing is hidden — apply when you need it.</p>

            {(() => {
              const activeSelectedTier = availableTiers.find((t: any) => t.id === (selectedTierId || availableTiers.find((x: any) => x.isDefault)?.id || availableTiers[0]?.id));
              const heldCount = activeSelectedTier ? accounts.filter((a: any) => a.tierId === activeSelectedTier.id).length : 0;
              const tierLimitReached = activeSelectedTier && typeof activeSelectedTier.maxAccountsPerUser === "number" && activeSelectedTier.maxAccountsPerUser > 0 && heldCount >= activeSelectedTier.maxAccountsPerUser;

              const mutuallyExclusiveConflict = activeSelectedTier ? accounts.find((a: any) => {
                if (!a.tierId) return false;
                if (Array.isArray(activeSelectedTier.mutuallyExclusiveTierIds) && activeSelectedTier.mutuallyExclusiveTierIds.includes(a.tierId)) return true;
                const otherTier = availableTiers.find((ot: any) => ot.id === a.tierId);
                if (otherTier && Array.isArray(otherTier.mutuallyExclusiveTierIds) && otherTier.mutuallyExclusiveTierIds.includes(activeSelectedTier.id)) return true;
                return false;
              }) : null;

              const groupConflict = activeSelectedTier && activeSelectedTier.exclusiveGroup ? accounts.find((a: any) => {
                if (!a.tierId || a.tierId === activeSelectedTier.id) return false;
                const otherTier = availableTiers.find((ot: any) => ot.id === a.tierId);
                return otherTier && otherTier.exclusiveGroup && otherTier.exclusiveGroup === activeSelectedTier.exclusiveGroup;
              }) : null;

              const isBiz = activeSelectedTier ? activeSelectedTier.type === "business" : false;
              const personalCount = accounts.filter((a: any) => !a.accountType?.includes("business")).length;
              const bizCount = accounts.filter((a: any) => a.accountType?.includes("business")).length;

              const personalCapReached = !isBiz && typeof settings.maxPersonalAccountsPerUser === "number" && settings.maxPersonalAccountsPerUser > 0 && personalCount >= settings.maxPersonalAccountsPerUser;
              const bizCapReached = isBiz && typeof settings.maxBusinessAccountsPerUser === "number" && settings.maxBusinessAccountsPerUser > 0 && bizCount >= settings.maxBusinessAccountsPerUser;
              const totalCapReached = typeof settings.maxTotalAccountsPerUser === "number" && settings.maxTotalAccountsPerUser > 0 && accounts.length >= settings.maxTotalAccountsPerUser;

              const cannotRegisterReason = tierLimitReached
                ? `Holding Limit Reached: You already hold ${heldCount} of ${activeSelectedTier?.maxAccountsPerUser} allowed account(s) under '${activeSelectedTier?.name}'.`
                : mutuallyExclusiveConflict
                ? `Policy Restriction: You already hold account '${mutuallyExclusiveConflict.accountName}'. '${activeSelectedTier?.name}' is mutually exclusive with this tier (only one or the other may be held).`
                : groupConflict
                ? `Suite Conflict: You already hold account '${groupConflict.accountName}' in the '${activeSelectedTier?.exclusiveGroup}' category suite. Only one tier in this suite is permitted.`
                : personalCapReached
                ? `Bank Limit Reached: Maximum of ${settings.maxPersonalAccountsPerUser} personal account(s) allowed per citizen.`
                : bizCapReached
                ? `Bank Limit Reached: Maximum of ${settings.maxBusinessAccountsPerUser} business account(s) allowed per entity.`
                : totalCapReached
                ? `Bank Limit Reached: Maximum of ${settings.maxTotalAccountsPerUser} total accounts allowed per client.`
                : null;

              return (
                <form onSubmit={openAccount} className="rounded-2xl border border-white/10 p-5 space-y-4 bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-2"><Wallet size={16} /> Open an account</h3>
                    <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">Instant Onboarding</span>
                  </div>

                  {availableTiers.length > 0 ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide">Account Product Tier</label>
                      <select 
                        name="tierId" 
                        value={selectedTierId || (availableTiers.find((t: any) => t.isDefault)?.id || availableTiers[0]?.id || "")}
                        onChange={(e) => setSelectedTierId(e.target.value)}
                        required
                        className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                      >
                        {availableTiers.map((t: any) => {
                          const tHeld = accounts.filter((a: any) => a.tierId === t.id).length;
                          const isCapReached = typeof t.maxAccountsPerUser === "number" && t.maxAccountsPerUser > 0 && tHeld >= t.maxAccountsPerUser;
                          return (
                            <option key={t.id} value={t.id} className="bg-[#18181c] text-[#f4f4f5]">
                              {t.name} ({t.type === "business" ? "Business" : "Personal"})
                              {t.apyPercent ? ` · ${(Number(t.apyPercent) / 100).toFixed(2)}% APY` : ""}
                              {t.monthlyFee ? ` · $${(Number(t.monthlyFee) / 100).toFixed(2)}/mo` : ""}
                              {t.isDefault ? " · Default" : ""}
                              {isCapReached ? ` [Limit Reached: ${tHeld}/${t.maxAccountsPerUser}]` : (tHeld > 0 ? ` (Holding: ${tHeld})` : "")}
                            </option>
                          );
                        })}
                      </select>

                      <div className="space-y-2">
                        {activeSelectedTier && (
                          <div className="text-xs bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-1.5">
                            {activeSelectedTier.description && (
                              <p className="text-white/80">{activeSelectedTier.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/45">
                              <span>Category: <strong className="text-white/80 capitalize">{activeSelectedTier.type}</strong></span>
                              {activeSelectedTier.minBalance > 0 && <span>Min. Deposit: <strong className="text-white/80">{formatMoney(activeSelectedTier.minBalance)}</strong></span>}
                              {activeSelectedTier.monthlyFee > 0 ? (
                                <span>Monthly Fee: <strong className="text-white/80">{formatMoney(activeSelectedTier.monthlyFee)}/mo</strong></span>
                              ) : (
                                <span className="text-emerald-400 font-medium">No Monthly Maintenance Fee</span>
                              )}
                              {activeSelectedTier.apyPercent > 0 && <span>Annual Yield: <strong className="text-emerald-400">{(Number(activeSelectedTier.apyPercent) / 100).toFixed(2)}% APY</strong></span>}
                              {activeSelectedTier.creditLimit > 0 && <span>Includes Credit Line: <strong className="text-indigo-300">{formatMoney(activeSelectedTier.creditLimit)}</strong></span>}
                              {typeof activeSelectedTier.maxAccountsPerUser === "number" && activeSelectedTier.maxAccountsPerUser > 0 && (
                                <span className="text-amber-300">Holding Limit: <strong>{heldCount} / {activeSelectedTier.maxAccountsPerUser}</strong> accounts held</span>
                              )}
                              {activeSelectedTier.exclusiveGroup && (
                                <span className="text-purple-300 font-mono">Suite: {activeSelectedTier.exclusiveGroup}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {cannotRegisterReason && (
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
                            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-400" />
                            <div>
                              <strong className="block font-semibold">Tier Registration Unavailable</strong>
                              <p className="text-rose-200/90 mt-0.5">{cannotRegisterReason}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5">Account Type</label>
                      <select name="accountType" className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                        <option value="personal_checking" className="bg-[#18181c] text-[#f4f4f5]">Personal checking</option>
                        <option value="personal_savings" className="bg-[#18181c] text-[#f4f4f5]">Savings</option>
                        <option value="business_checking" className="bg-[#18181c] text-[#f4f4f5]">Business</option>
                      </select>
                    </div>
                  )}

                  {/* Dynamic Naming & Prefix Controls */}
                  {(() => {
                    const effectivePrefix = activeSelectedTier?.customPrefix || (isBiz ? (settings.businessAccountPrefix || "CORP-") : (settings.personalAccountPrefix || "ACC-"));
                    const effectiveNamingMode = activeSelectedTier?.namingMode || (isBiz ? (settings.businessAccountNamingMode || "business_name") : (settings.personalAccountNamingMode || "custom"));
                    const discordName = user?.username || (user as any)?.global_name || "client";

                    return (
                      <div className="space-y-3 pt-1">
                        {!isBiz && effectiveNamingMode === "choice_or_username" && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setNamingPref("custom")}
                              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${namingPref === "custom" ? "bg-white/10 border-white/30 text-white" : "bg-white/5 border-white/5 text-white/50 hover:text-white"}`}
                            >
                              Custom Name
                            </button>
                            <button
                              type="button"
                              onClick={() => setNamingPref("discord")}
                              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${namingPref === "discord" ? "bg-white/10 border-white/30 text-white" : "bg-white/5 border-white/5 text-white/50 hover:text-white"}`}
                            >
                              Discord Handle (@{discordName})
                            </button>
                          </div>
                        )}

                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-xs font-semibold text-white/50 uppercase tracking-wide">
                              {isBiz ? "Business / Entity Name" : "Account Name / Tag"}
                            </label>
                            <span className="text-[10px] font-mono text-white/40">
                              Result: <strong className="text-white/80">{effectivePrefix}{(!isBiz && (effectiveNamingMode === "discord_username" || namingPref === "discord")) ? discordName : (accountNameChoice || (isBiz ? "AcmeCorp" : "main"))}</strong>
                            </span>
                          </div>

                          {(!isBiz && (effectiveNamingMode === "discord_username" || namingPref === "discord")) ? (
                            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80 font-mono">
                              <span className="text-indigo-400 font-semibold">{effectivePrefix}</span>
                              <span>{discordName}</span>
                              <span className="ml-auto text-[11px] text-white/30 uppercase font-sans">Synced with Discord</span>
                            </div>
                          ) : (
                            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-white/30">
                              <span className="px-3 py-2.5 bg-white/5 text-white/50 font-mono text-sm border-r border-white/10 select-none">
                                {effectivePrefix}
                              </span>
                              <input 
                                name="accountName" 
                                required 
                                value={accountNameChoice}
                                onChange={(e) => setAccountNameChoice(e.target.value)}
                                placeholder={isBiz ? "e.g. Acme Corporation" : "e.g. daily-spending"} 
                                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white focus:outline-none placeholder:text-white/20" 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <button
                    disabled={actionPending || Boolean(cannotRegisterReason)}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-lg transition-opacity hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={btnBrand}
                  >
                    {actionPending ? "Opening Account…" : cannotRegisterReason ? "Account Limit Reached / Restricted" : "Open Account"}
                  </button>
                </form>
              );
            })()}

            {settings.enableLoans !== false && (
              <form onSubmit={applyLoan} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="font-bold flex items-center gap-2"><Landmark size={16} /> Apply for a loan</h3>
                <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName}</option>)}
                </select>
                {loanProducts.length > 0 && (
                  <select name="productId" className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                    <option value="" className="bg-[#18181c] text-[#f4f4f5]">Standard terms</option>
                    {loanProducts.map((p: any) => (
                      <option key={p.id} value={p.id} className="bg-[#18181c] text-[#f4f4f5]">{p.name} — {(Number(p.interestRate) / (Number(p.interestRate) > 100 ? 100 : 1)).toFixed(2)}% · max {formatMoney(p.maxAmount)}</option>
                    ))}
                  </select>
                )}
                <input name="amount" type="number" step="0.01" min="10" required placeholder="Amount" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono" />
                <select name="termMonths" className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  <option value="6" className="bg-[#18181c] text-[#f4f4f5]">6 months</option>
                  <option value="12" className="bg-[#18181c] text-[#f4f4f5]">12 months</option>
                  <option value="24" className="bg-[#18181c] text-[#f4f4f5]">24 months</option>
                </select>
                <input name="purpose" placeholder="Purpose" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
                <button disabled={actionPending} className="text-sm font-bold" style={{ color: brand }}>Submit application</button>
              </form>
            )}

            {settings.enableCards !== false && (
              <form onSubmit={requestCard} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="font-bold flex items-center gap-2"><CreditCard size={16} /> Request a card</h3>
                <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName}</option>)}
                </select>
                {cardProducts.length > 0 ? (
                  <select name="productId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                    {cardProducts.map((p: any) => (
                      <option key={p.id} value={p.id} className="bg-[#18181c] text-[#f4f4f5]">
                        {p.name} · {p.cardKind === "debit" ? "debit" : "credit"} · limit {formatMoney(p.maxLimit)} · {Number(p.interestRate).toFixed(2)}% APR
                        {p.tierId ? " · optional tier" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select name="cardType" className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                    <option value="debit" className="bg-[#18181c] text-[#f4f4f5]">Debit</option>
                  </select>
                )}
                <p className="text-[11px] text-white/35">Credit cards have a set limit for Onyx and cash advances. Tiers are optional — not required to apply.</p>
                <button disabled={actionPending} className="text-sm font-bold" style={{ color: brand }}>Request card</button>
              </form>
            )}

            {settings.enableVaults !== false && Array.isArray(bondProducts) && bondProducts.length > 0 && (
              <form onSubmit={buyBond} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="font-bold flex items-center gap-2"><PiggyBank size={16} /> Buy a bond</h3>
                <p className="text-xs text-white/40">Time-locked deposits. You earn the advertised yield if you hold to maturity.</p>
                <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · {formatMoney(a.balance)}</option>)}
                </select>
                <select name="lockDays" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                  {bondProducts.map((t: any) => (
                    <option key={t.lockDays} value={t.lockDays} className="bg-[#18181c] text-[#f4f4f5]">{t.lockDays} days · {(Number(t.interestRate) / 100).toFixed(2)}% · {t.penaltyPercent ?? 20}% early penalty</option>
                  ))}
                </select>
                <input name="amount" type="number" step="0.01" min="1" required placeholder="Amount to lock" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono" />
                <button disabled={actionPending} className="text-sm font-bold" style={{ color: brand }}>Buy bond</button>
              </form>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <button onClick={() => setView("cards")} className="rounded-2xl border border-white/10 p-5 text-left">
                <CreditCard size={18} className="text-white/50 mb-2" />
                <p className="font-bold">Manage cards</p>
                <p className="text-xs text-white/40 mt-1">Lock, unlock, or take a cash advance.</p>
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30" style={{ borderTop: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(16px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-5xl mx-auto grid grid-cols-4">
          {nav.map((n) => {
            const Icon = n.icon;
            const on = view === n.id || (n.id === "home" && ["bills", "borrow", "cards"].includes(view) === false && view !== "send" && view !== "activity" && view !== "apply");
            return (
              <button key={n.id} onClick={() => { if (n.id === "send" && view !== "send") setTransferSuccess(null); setView(n.id); }} className="py-3 min-h-[52px] text-[11px] font-semibold flex flex-col items-center gap-1" style={{ color: on ? "var(--fg)" : "var(--fg-subtle)" }}>
                <Icon size={18} color={on ? brand : undefined} />
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {repayingLoan && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
            <motion.form initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={payLoan} className="bg-[#111118] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4">
              <div className="flex justify-between">
                <h3 className="font-bold">Pay loan #{repayingLoan.id.slice(0, 8)}</h3>
                <button type="button" onClick={() => setRepayingLoan(null)}><X size={16} /></button>
              </div>
              <p className="text-sm text-white/50">Remaining {formatMoney(repayingLoan.remainingAmount ?? repayingLoan.remainingBalance)}</p>
              <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · {formatMoney(a.balance)}</option>)}
              </select>
              <input name="amount" type="number" step="0.01" min="0.01" required defaultValue={((repayingLoan.remainingAmount ?? 0) / 100).toFixed(2)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono" />
              <button disabled={actionPending} className="w-full py-3 rounded-xl font-bold" style={btnBrand}>Pay</button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {advanceCard && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
            <motion.form initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onSubmit={cashAdvance} className="bg-[#111118] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4">
              <div className="flex justify-between">
                <h3 className="font-bold">Cash advance</h3>
                <button type="button" onClick={() => setAdvanceCard(null)}><X size={16} /></button>
              </div>
              <p className="text-sm text-white/50">Available {formatMoney(Math.max(0, (advanceCard.creditLimit || 0) - (advanceCard.creditUsed || 0)))}. Posted to your linked account. A cash-advance fee may apply.</p>
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="Amount" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono" />
              <button disabled={actionPending} className="w-full py-3 rounded-xl font-bold" style={btnBrand}>Draw</button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Account Members Modal */}
      <AnimatePresence>
        {managingMembersAcc && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70">
                      <Users size={16} />
                    </div>
                    <h3 className="font-bold text-base text-white">Account Operators</h3>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Manage multi-user access for <span className="text-white font-medium">{managingMembersAcc.accountName}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagingMembersAcc(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Members List */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">Active Operators</p>
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-6 text-white/40 gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">Loading team...</span>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 divide-y divide-white/5 bg-white/[0.02] overflow-hidden">
                    {/* Primary Owner Row */}
                    <div className="p-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-center text-xs font-bold font-mono">
                          ★
                        </div>
                        <div>
                          <p className="text-xs font-mono font-medium text-white/90">
                            {managingMembersAcc.ownerDiscordId || "Account Owner"}
                          </p>
                          <p className="text-[10px] text-white/40">Primary Account Creator</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        Owner
                      </span>
                    </div>

                    {/* Member Rows */}
                    {accountMembersList.length === 0 ? (
                      <div className="p-4 text-center text-xs text-white/40">
                        No additional operators added yet. Add trusted members below.
                      </div>
                    ) : (
                      accountMembersList.map((m: any) => (
                        <div key={m.id} className="p-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-white/60 flex items-center justify-center text-xs font-mono">
                              #
                            </div>
                            <div>
                              <p className="text-xs font-mono font-medium text-white/90">{m.discordId}</p>
                              <p className="text-[10px] text-white/40">
                                {m.role === "manager" ? "Can send funds & view balance" : "Read-only view access"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${m.role === "manager" ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" : "bg-sky-500/15 text-sky-300 border border-sky-500/25"}`}>
                              {m.role}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAccountMember(m.id)}
                              title="Remove operator"
                              className="p-1 rounded-lg hover:bg-rose-500/20 text-white/30 hover:text-rose-300 transition"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Add Member Form */}
              <form onSubmit={addAccountMember} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <UserPlus size={14} /> Add Operator
                </p>
                <p className="text-[11px] text-white/40">
                  Enter their Discord ID (snowflake) to grant access to this business account in the Discord bot and Web Portal.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    required
                    value={newMemberDiscordId}
                    onChange={(e) => setNewMemberDiscordId(e.target.value)}
                    placeholder="Discord User ID (e.g. 102938475610293847)"
                    className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-white/20"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewMemberRole("manager")}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition ${newMemberRole === "manager" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-[#18181c] border-white/10 text-white/50"}`}
                    >
                      Manager (Full Access)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMemberRole("viewer")}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition ${newMemberRole === "viewer" ? "bg-sky-500/15 border-sky-500/40 text-sky-300" : "bg-[#18181c] border-white/10 text-white/50"}`}
                    >
                      Viewer (Read-only)
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={addingMember || !newMemberDiscordId.trim()}
                  className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
                  style={btnBrand}
                >
                  {addingMember ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>Grant Access</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Split the Bill Modal */}
      <AnimatePresence>
        {splitBillModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.form
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onSubmit={handleSendSplit}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70">
                      <Users size={16} />
                    </div>
                    <h3 className="font-bold text-base text-white">Split the Bill</h3>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Divide an expense. CityCorp creates payment request invoices for each person.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitBillModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                  Receive Reimbursements Into
                </label>
                <select
                  value={splitFromAccountId}
                  onChange={(e) => setSplitFromAccountId(e.target.value)}
                  required
                  className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                >
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">
                      {a.accountName} · {formatMoney(a.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                    Total Bill Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={splitTotalAmount}
                    onChange={(e) => setSplitTotalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                    Description / Memo
                  </label>
                  <input
                    type="text"
                    required
                    value={splitDescription}
                    onChange={(e) => setSplitDescription(e.target.value)}
                    placeholder="e.g. Dinner, Group Vault"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20"
                  />
                </div>
              </div>

              {/* Participants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                    Split With ({splitParticipants.length} other{splitParticipants.length === 1 ? "" : "s"})
                  </label>
                  <button
                    type="button"
                    onClick={() => setSplitParticipants(prev => [...prev, ""])}
                    className="text-xs font-semibold text-white/60 hover:text-white flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Person
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {splitParticipants.map((part, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        required
                        value={part}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSplitParticipants(prev => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                        }}
                        placeholder="Account name, Discord ID, or handle"
                        className="flex-1 bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 font-mono"
                      />
                      {splitParticipants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSplitParticipants(prev => prev.filter((_, i) => i !== idx))}
                          className="p-2 rounded-lg hover:bg-rose-500/20 text-white/30 hover:text-rose-300 transition"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Split Calculation Breakdown */}
              {splitTotalAmount && parseFloat(splitTotalAmount) > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5 text-xs">
                  <div className="flex justify-between text-white/50">
                    <span>Total bill:</span>
                    <span className="font-mono text-white">{formatMoney(Math.round(parseFloat(splitTotalAmount) * 100))}</span>
                  </div>
                  <div className="flex justify-between text-white/50">
                    <span>Split {splitParticipants.length + 1} ways:</span>
                    <span className="font-mono text-white">
                      {formatMoney(Math.round((parseFloat(splitTotalAmount) / (splitParticipants.length + 1)) * 100))} / person
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-semibold pt-1 border-t border-white/5">
                    <span>Invoices generated:</span>
                    <span>{splitParticipants.length} request{splitParticipants.length === 1 ? "" : "s"}</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={splitSubmitting || !splitTotalAmount || parseFloat(splitTotalAmount) <= 0}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                style={btnBrand}
              >
                {splitSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />}
                <span>Send Split Requests</span>
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* New Subscription Mandate Modal */}
      <AnimatePresence>
        {showAddSubModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.form
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onSubmit={createSubscription}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70">
                      <Repeat size={16} />
                    </div>
                    <h3 className="font-bold text-base text-white">New Subscription Mandate</h3>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Set up an automated recurring payment for rent, dues, or services.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddSubModal(false)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                  Debit From Account
                </label>
                <select
                  value={subFromAccount}
                  onChange={(e) => setSubFromAccount(e.target.value)}
                  required
                  className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                >
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">
                      {a.accountName} · {formatMoney(a.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                  Biller / Recipient Account
                </label>
                <input
                  type="text"
                  required
                  value={subPayee}
                  onChange={(e) => setSubPayee(e.target.value)}
                  placeholder="Biller account name, account ID, or handle"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                    Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={subAmount}
                    onChange={(e) => setSubAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder:text-white/20"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                    Frequency
                  </label>
                  <select
                    value={subFrequency}
                    onChange={(e: any) => setSubFrequency(e.target.value)}
                    className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                  >
                    <option value="weekly" className="bg-[#18181c] text-[#f4f4f5]">Weekly</option>
                    <option value="monthly" className="bg-[#18181c] text-[#f4f4f5]">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1.5">
                  Memo / Purpose
                </label>
                <input
                  type="text"
                  value={subDescription}
                  onChange={(e) => setSubDescription(e.target.value)}
                  placeholder="e.g. Apartment Rent, Security Dues"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20"
                />
              </div>

              <button
                type="submit"
                disabled={actionPending || !subPayee || !subAmount}
                className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                style={btnBrand}
              >
                {actionPending ? <Loader2 size={16} className="animate-spin" /> : <Repeat size={16} />}
                <span>Authorize Recurring Mandate</span>
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Details Modal */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.96 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-5 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2.5 rounded-2xl ${accounts.some((a: any) => a.id === selectedTx.toAccountId) ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/80"}`}>
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-white">Transaction Details</h3>
                    <p className="text-xs text-white/40">
                      {selectedTx.timestamp ? format(new Date(selectedTx.timestamp), "MMMM d, yyyy · h:mm:ss a") : "Recent"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Amount Showcase */}
              {(() => {
                const inbound = accounts.some((a: any) => a.id === selectedTx.toAccountId);
                const displayAmt = inbound ? (selectedTx.amountReceived ?? selectedTx.amount) : (selectedTx.amountSubmitted ?? selectedTx.amount);
                return (
                  <div className="text-center py-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-1">
                    <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                      {inbound ? "Funds Received" : "Funds Transferred"}
                    </span>
                    <div className={`text-3xl font-black font-mono ${inbound ? "text-emerald-300" : "text-white"}`}>
                      {inbound ? "+" : "−"}{formatMoney(displayAmt)}
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 text-[11px] text-white/60 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      Settled & Verified
                    </div>
                  </div>
                );
              })()}

              {/* Memo Highlight */}
              {(selectedTx.memo || selectedTx.description) && (
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                    <FileText size={13} />
                    <span>Memo / Note</span>
                  </div>
                  <p className="text-sm font-medium text-white/90 italic">
                    "{selectedTx.memo || selectedTx.description}"
                  </p>
                </div>
              )}

              {/* Transaction Key Details */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">From</span>
                  <div className="text-right">
                    <span className="font-semibold text-white/90 block">{selectedTx.fromAccountName || selectedTx.fromAccountId || "System"}</span>
                    {selectedTx.fromAccountId && (
                      <span className="font-mono text-[10px] text-white/30">{selectedTx.fromAccountId.slice(0, 16)}…</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">To</span>
                  <div className="text-right">
                    <span className="font-semibold text-white/90 block">{selectedTx.toAccountName || selectedTx.toAccountId || "System"}</span>
                    {selectedTx.toAccountId && (
                      <span className="font-mono text-[10px] text-white/30">{selectedTx.toAccountId.slice(0, 16)}…</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">Transaction Type</span>
                  <span className="font-medium text-white/80 capitalize">{selectedTx.type?.replace(/_/g, " ") || "Transfer"}</span>
                </div>

                {selectedTx.id && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-white/40">Reference ID</span>
                    <button
                      onClick={() => copy(selectedTx.id, `tx-${selectedTx.id}`)}
                      className="font-mono text-[11px] text-white/50 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5 transition"
                    >
                      {copied === `tx-${selectedTx.id}` ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{selectedTx.id.slice(0, 14)}…</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 pt-2">
                {!accounts.some((a: any) => a.id === selectedTx.toAccountId) && (
                  <button
                    type="button"
                    onClick={() => {
                      const txToSplit = selectedTx;
                      setSelectedTx(null);
                      startSplitBill(txToSplit);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Users size={14} />
                    <span>Split Bill</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Loan Details Modal */}
      <AnimatePresence>
        {selectedLoan && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.96 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2.5 rounded-2xl ${
                    selectedLoan.status === "delinquent" || selectedLoan.isDelinquent ? "bg-amber-500/15 text-amber-300" :
                    selectedLoan.status === "active" || selectedLoan.status === "paid_off" ? "bg-emerald-500/15 text-emerald-300" :
                    selectedLoan.status === "defaulted" ? "bg-rose-500/15 text-rose-300" :
                    "bg-blue-500/15 text-blue-300"
                  }`}>
                    <Landmark size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-lg text-white">Loan Details</h3>
                    <p className="text-xs text-white/40">
                      {selectedLoan.createdAt ? format(new Date(selectedLoan.createdAt), "MMMM d, yyyy") : "Loan Record"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLoan(null)}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Amount & Progress Showcase */}
              {(() => {
                const principal = selectedLoan.principalAmount || selectedLoan.amount || 0;
                const remaining = selectedLoan.remainingAmount ?? selectedLoan.remainingBalance ?? 0;
                const paid = Math.max(0, principal - remaining);
                const pct = principal > 0 ? Math.min(100, Math.max(0, Math.round((paid / principal) * 100))) : 0;
                const isDelinquent = selectedLoan.status === "delinquent" || selectedLoan.isDelinquent;

                return (
                  <div className="text-center py-4 px-4 bg-white/[0.03] border border-white/5 rounded-2xl space-y-3">
                    <div>
                      <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
                        Remaining Balance
                      </span>
                      <div className="text-3xl font-black font-mono text-white mt-1">
                        {formatMoney(remaining)}
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">
                        of {formatMoney(principal)} original principal
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5 text-left">
                      <div className="flex justify-between text-[11px] text-white/50">
                        <span>Repayment Progress</span>
                        <span className="font-mono font-bold text-white/80">{pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: isDelinquent ? "#f59e0b" : pct === 100 ? "#10b981" : (brand || "#2563eb")
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-white/40">
                        <span>Paid {formatMoney(paid)}</span>
                        <span>Due {formatMoney(remaining)}</span>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium" style={{
                      backgroundColor: isDelinquent ? "rgba(245, 158, 11, 0.15)" : selectedLoan.status === "active" ? "rgba(16, 185, 129, 0.15)" : selectedLoan.status === "paid_off" ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
                      color: isDelinquent ? "#fcd34d" : selectedLoan.status === "active" || selectedLoan.status === "paid_off" ? "#6ee7b7" : "rgba(255, 255, 255, 0.7)"
                    }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{
                        backgroundColor: isDelinquent ? "#f59e0b" : selectedLoan.status === "active" || selectedLoan.status === "paid_off" ? "#10b981" : "#a1a1aa"
                      }}></span>
                      <span className="capitalize">{selectedLoan.status?.replace(/_/g, " ") || "Active"}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Purpose Highlight */}
              {(selectedLoan.purpose || selectedLoan.offSystemReference) && (
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                    <FileText size={13} />
                    <span>Loan Purpose / Reference</span>
                  </div>
                  <p className="text-sm font-medium text-white/90">
                    {selectedLoan.purpose || selectedLoan.offSystemReference}
                  </p>
                </div>
              )}

              {/* Past Due / Delinquency Notice */}
              {(selectedLoan.status === "delinquent" || selectedLoan.isDelinquent || (selectedLoan.lateFeeAmount && selectedLoan.lateFeeAmount > 0)) && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-amber-200">Payment Past Due</p>
                    <p className="text-amber-200/70">
                      {selectedLoan.lateFeeAmount > 0
                        ? `Late fees accrued: ${formatMoney(selectedLoan.lateFeeAmount)} across ${selectedLoan.missedPaymentsCount || 1} missed cycle(s).`
                        : "Your installment is past due. Please make a payment to bring your account current."}
                    </p>
                  </div>
                </div>
              )}

              {/* Detailed Loan Key Details */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">Interest Rate</span>
                  <span className="font-semibold text-white/90 font-mono">
                    {(selectedLoan.interestRate / 100).toFixed(2)}% APR
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">Next Payment Due</span>
                  <span className="font-medium text-white/90">
                    {selectedLoan.nextPaymentDate
                      ? format(new Date(selectedLoan.nextPaymentDate), "MMMM d, yyyy")
                      : "Schedule closed"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">Term Length</span>
                  <span className="font-medium text-white/90">
                    {selectedLoan.termMonths ? `${selectedLoan.termMonths} Months` : "Standard Term"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-white/5">
                  <span className="text-white/40">Servicing Account</span>
                  <div className="text-right">
                    <span className="font-semibold text-white/90 block">
                      {accounts.find((a: any) => a.id === selectedLoan.accountId)?.accountName || selectedLoan.accountName || "Primary Account"}
                    </span>
                    {selectedLoan.accountId && (
                      <span className="font-mono text-[10px] text-white/30">{selectedLoan.accountId.slice(0, 16)}…</span>
                    )}
                  </div>
                </div>

                {selectedLoan.collateralDescription && (
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Collateral</span>
                    <div className="text-right">
                      <span className="font-semibold text-white/90 block">{selectedLoan.collateralDescription}</span>
                      {selectedLoan.collateralValue > 0 && (
                        <span className="text-[10px] text-white/40 font-mono">Estimated: {formatMoney(selectedLoan.collateralValue)} ({selectedLoan.collateralStatus || "pledged"})</span>
                      )}
                    </div>
                  </div>
                )}

                {selectedLoan.contractUrl && (
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Agreement Document</span>
                    <a
                      href={selectedLoan.contractUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                    >
                      <Link2 size={12} />
                      <span>View Agreement</span>
                    </a>
                  </div>
                )}

                {selectedLoan.id && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-white/40">Loan Reference ID</span>
                    <button
                      type="button"
                      onClick={() => copy(selectedLoan.id, `loan-${selectedLoan.id}`)}
                      className="font-mono text-[11px] text-white/50 hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5 transition"
                    >
                      {copied === `loan-${selectedLoan.id}` ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                      <span>{selectedLoan.id.slice(0, 14)}…</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 pt-2">
                {["active", "delinquent", "defaulted"].includes(selectedLoan.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      const lToRepay = selectedLoan;
                      setSelectedLoan(null);
                      setRepayingLoan(lToRepay);
                    }}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                    style={btnBrand}
                  >
                    <span>Pay Installment</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLoan(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, y: 8 }} className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 text-sm font-semibold px-4 py-2.5 rounded-full shadow-xl" style={{ background: "var(--fg)", color: "var(--bg)" }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
