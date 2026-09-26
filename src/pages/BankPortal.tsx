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
  Users, Repeat, Play, Pause, Trash2, Calendar, UserPlus, LifeBuoy, HelpCircle, MessageSquare,
  ShieldAlert, ExternalLink, Bell, BellRing, Info, Terminal, ArrowRight, ChevronDown, CheckCircle
} from "lucide-react";
import { accentForeground, hexOr, withAlpha } from "../lib/theme";
import { BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";

type View = "home" | "send" | "activity" | "borrow" | "cards" | "bills" | "apply" | "escrow" | "support";

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
  const [selectedLoanProductId, setSelectedLoanProductId] = useState<string>("");
  const [cardProducts, setCardProducts] = useState<any[]>([]);
  const [selectedCardProductId, setSelectedCardProductId] = useState<string>("");
  const [bondProducts, setBondProducts] = useState<any[]>([]);
  const [accountTiers, setAccountTiers] = useState<any[]>([]);
  const [selectedTierId, setSelectedTierId] = useState("");
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [accountNameChoice, setAccountNameChoice] = useState("");
  const [namingPref, setNamingPref] = useState<"custom" | "discord">("custom");
  const [merchants, setMerchants] = useState<any[]>([]);
  const [repayingLoan, setRepayingLoan] = useState<any | null>(null);
  const [escrows, setEscrows] = useState<any[]>([]);
  const [escrowFilter, setEscrowFilter] = useState<"all" | "funded" | "pending" | "released" | "refunded">("all");
  const [selectedEscrow, setSelectedEscrow] = useState<any | null>(null);
  const [applyTab, setApplyTab] = useState<"account" | "loan" | "card" | "bond" | "escrow">("account");
  const [escrowActionInProgress, setEscrowActionInProgress] = useState<string | null>(null);
  const [escrowSubmitting, setEscrowSubmitting] = useState(false);
  const [bondSimAmount, setBondSimAmount] = useState<string>("1000");
  const [logoBroken, setLogoBroken] = useState(false);
  const [destMatches, setDestMatches] = useState<any[]>([]);

  useEffect(() => {
    setLogoBroken(false);
  }, [bankId, bank?.logoUrl, bank?.settings?.logoUrl]);
  const [destHint, setDestHint] = useState("");
  const [advanceCard, setAdvanceCard] = useState<any | null>(null);

  // Customer Notifications & Deposit Guidance State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newAccountModalData, setNewAccountModalData] = useState<{
    accountName: string;
    accountId?: string;
    tierName?: string;
    minBalance?: number;
    command: string;
    message?: string;
  } | null>(null);
  const [depositGuideModal, setDepositGuideModal] = useState<{
    accountName: string;
    minBalance: number;
    currentBalance: number;
    deficit: number;
    command: string;
  } | null>(null);

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
  const [newMemberUsername, setNewMemberUsername] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"manager" | "viewer">("manager");
  const [addingMember, setAddingMember] = useState(false);

  // Split Bill State
  const [splitBillModalOpen, setSplitBillModalOpen] = useState(false);
  const [splitFromAccountId, setSplitFromAccountId] = useState("");
  const [splitTotalAmount, setSplitTotalAmount] = useState("");
  const [splitDescription, setSplitDescription] = useState("");
  const [splitParticipants, setSplitParticipants] = useState<string[]>([""]);
  const [splitSubmitting, setSplitSubmitting] = useState(false);

  // Customer Support & Dispute Tickets State
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeTx, setDisputeTx] = useState<any | null>(null);
  const [disputeEscrow, setDisputeEscrow] = useState<any | null>(null);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketCategory, setTicketCategory] = useState("general");
  const [ticketPriority, setTicketPriority] = useState("medium");
  const [ticketAccountId, setTicketAccountId] = useState("");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [replyMessage, setReplyMessage] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);

  const disputeContext = useMemo(() => {
    if (disputeTx) return { type: "transaction" as const, item: disputeTx };
    if (disputeEscrow) return { type: "escrow" as const, item: disputeEscrow };
    return null;
  }, [disputeTx, disputeEscrow]);

  const openNewTicketModal = () => {
    setTicketSubject("");
    setTicketMessage("");
    setTicketCategory("general");
    setTicketPriority("medium");
    setTicketAccountId(accounts[0]?.id || "");
    setNewTicketModalOpen(true);
  };

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

  const markNotificationAsRead = async (notifId: string) => {
    try {
      await fetch(`/api/portal/${bankId}/notifications/${notifId}/read`, { method: "POST" });
      setUserData((prev: any) => {
        if (!prev) return prev;
        const notifs = (prev.notifications || []).map((n: any) => n.id === notifId ? { ...n, isRead: true } : n);
        return {
          ...prev,
          notifications: notifs,
          unreadNotificationCount: notifs.filter((n: any) => !n.isRead).length
        };
      });
    } catch {}
  };

  const markAllNotificationsRead = async () => {
    try {
      await fetch(`/api/portal/${bankId}/notifications/read-all`, { method: "POST" });
      setUserData((prev: any) => {
        if (!prev) return prev;
        const notifs = (prev.notifications || []).map((n: any) => ({ ...n, isRead: true }));
        return {
          ...prev,
          notifications: notifs,
          unreadNotificationCount: 0
        };
      });
      flash("All notifications marked as read");
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

  const loadPortalEscrows = () => {
    if (!bankId) return;
    fetch(`/api/portal/${bankId}/escrows`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.escrows)) {
          setEscrows(d.escrows);
        } else if (Array.isArray(d)) {
          setEscrows(d);
        }
      })
      .catch(() => {});
  };

  const loadPortalTickets = () => {
    if (!bankId) return;
    fetch(`/api/portal/${bankId}/tickets`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setTickets(d);
          if (selectedTicket) {
            const updated = d.find(t => t.id === selectedTicket.id);
            if (updated) setSelectedTicket(updated);
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (bankId) {
      loadPortalEscrows();
      loadPortalTickets();
      fetch(`/api/portal/${bankId}/catalog`)
        .then((r) => r.json())
        .then((d) => {
          const loansList = Array.isArray(d.loans) ? d.loans : [];
          setLoanProducts(loansList);
          if (loansList.length > 0) {
            setSelectedLoanProductId(prev => prev && loansList.some((p: any) => p.id === prev) ? prev : loansList[0].id);
          }
          const cardsList = Array.isArray(d.cards) ? d.cards : [];
          setCardProducts(cardsList);
          if (cardsList.length > 0) {
            setSelectedCardProductId(prev => prev && cardsList.some((p: any) => p.id === prev) ? prev : cardsList[0].id);
          }
          setBondProducts(Array.isArray(d.bonds) ? d.bonds : []);
          if (Array.isArray(d.accountTiers)) {
            setAccountTiers(d.accountTiers.filter((t: any) => !t.isPrivate));
          }
        })
        .catch(() => {});
    }
  }, [view, bankId]);

  // Active polling when in support view or viewing ticket thread
  useEffect(() => {
    if (!bankId || (view !== "support" && !selectedTicket)) return;
    const t = setInterval(loadPortalTickets, 8000);
    return () => clearInterval(t);
  }, [bankId, view, selectedTicket?.id]);

  const closeTicket = async (ticketId: string) => {
    if (!window.confirm("Close and mark this support ticket resolved?")) return;
    try {
      const res = await fetch(`/api/portal/${bankId}/tickets/${ticketId}/close`, { method: "POST" });
      if (res.ok) {
        flash("Support ticket closed.");
        loadPortalTickets();
        if (selectedTicket?.id === ticketId) {
          setSelectedTicket((prev: any) => prev ? { ...prev, status: "closed" } : null);
        }
      }
    } catch {
      flash("Error closing ticket");
    }
  };

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
    const prodId = String(fd.get("productId") || "").trim();
    if (!prodId) {
      flash("Please select an active loan product from the catalog.");
      return;
    }
    const chosenProduct = loanProducts.find((p: any) => p.id === prodId);
    const calculatedTermMonths = chosenProduct?.termDays ? Math.max(1, Math.round(chosenProduct.termDays / 30)) : Number(fd.get("termMonths") || 1);

    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/request-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: fd.get("accountId"),
          amount: fd.get("amount"),
          termMonths: calculatedTermMonths,
          purpose: fd.get("purpose"),
          productId: prodId,
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
      if (!res.ok) {
        flash(d.error || "Could not open account");
      } else {
        flash("🎉 Account opened successfully!");
        form.reset();
        setAccountNameChoice("");
        setSelectedTierId("");
        handleSearch();

        const bankCorp = d.depositInstructions?.bankCorpName || userData?.bankCorpName || bank?.cityCorpOrgName || bank?.settings?.cityCorpOrgName || (bank?.name?.toLowerCase().includes("vance") && bank?.name?.toLowerCase().includes("hamilton") ? "VH" : bank?.name?.replace(/[^a-zA-Z0-9]/g, "")) || "Bank";
        const depCmd = d.depositInstructions?.command || `/c account deposit ${bankCorp} ${accName} 100`;
        const minBal = d.depositInstructions?.minBalanceCents ?? d.account?.minBalance ?? (chosenTier?.minBalance || 0);

        setNewAccountModalData({
          accountName: accName,
          accountId: d.account?.id,
          tierName: d.account?.tierName || chosenTier?.name || "Standard Tier",
          minBalance: minBal,
          command: depCmd,
          message: d.message || "Account registered and ready to fund!",
        });
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

  const createEscrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (escrowSubmitting || actionPending) return;
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    setEscrowSubmitting(true);
    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/escrows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAccountId: fd.get("buyerAccountId"),
          sellerIdentifier: fd.get("sellerIdentifier"),
          amount: fd.get("amount"),
          description: fd.get("description"),
          contractText: fd.get("contractText"),
          autoFund: fd.get("autoFund") === "on" || fd.get("autoFund") === "true",
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Failed to create escrow agreement");
      } else {
        flash(d.message || "Escrow agreement created!");
        form.reset();
        setView("escrow");
        loadPortalEscrows();
        handleSearch();
      }
    } catch {
      flash("Error creating escrow agreement");
    } finally {
      setEscrowSubmitting(false);
      setActionPending(false);
    }
  };

  const fundEscrow = async (escrowId: string) => {
    setEscrowActionInProgress(`${escrowId}_fund`);
    try {
      const res = await fetch(`/api/portal/${bankId}/escrows/${escrowId}/fund`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to fund escrow");
      else {
        flash(d.message || "Funds locked in escrow custody!");
        loadPortalEscrows();
        handleSearch();
      }
    } catch {
      flash("Network error funding escrow");
    }
    setEscrowActionInProgress(null);
  };

  const releaseEscrow = async (escrowId: string) => {
    if (!window.confirm("Authorize release of locked escrow funds to the seller? This action cannot be reversed.")) return;
    setEscrowActionInProgress(`${escrowId}_release`);
    try {
      const res = await fetch(`/api/portal/${bankId}/escrows/${escrowId}/release`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to release escrow");
      else {
        flash(d.message || "Escrow funds successfully released to seller!");
        loadPortalEscrows();
        handleSearch();
      }
    } catch {
      flash("Network error releasing escrow");
    }
    setEscrowActionInProgress(null);
  };

  const refundEscrow = async (escrowId: string) => {
    if (!window.confirm("Voluntarily refund locked escrow funds back to the buyer?")) return;
    setEscrowActionInProgress(`${escrowId}_refund`);
    try {
      const res = await fetch(`/api/portal/${bankId}/escrows/${escrowId}/refund`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to refund escrow");
      else {
        flash(d.message || "Escrow funds refunded back to buyer.");
        loadPortalEscrows();
        handleSearch();
      }
    } catch {
      flash("Network error refunding escrow");
    }
    setEscrowActionInProgress(null);
  };

  const cancelEscrow = async (escrowId: string) => {
    if (!window.confirm("Cancel this pending escrow agreement?")) return;
    setEscrowActionInProgress(`${escrowId}_cancel`);
    try {
      const res = await fetch(`/api/portal/${bankId}/escrows/${escrowId}/cancel`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to cancel escrow");
      else {
        flash("Pending escrow agreement cancelled.");
        loadPortalEscrows();
        handleSearch();
      }
    } catch {
      flash("Network error cancelling escrow");
    }
    setEscrowActionInProgress(null);
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
        if (d.owner) {
          setManagingMembersAcc((prev: any) => ({ ...prev, ownerInfo: d.owner }));
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingMembers(false);
  };

  const addAccountMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingMembersAcc || !newMemberUsername.trim()) return;
    setAddingMember(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/accounts/${managingMembersAcc.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minecraftUsername: newMemberUsername.trim(),
          role: newMemberRole,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Failed to add operator");
      else {
        flash(`Operator "${d.mcUsername || newMemberUsername.trim()}" granted access.`);
        setNewMemberUsername("");
        const refreshed = await fetch(`/api/portal/${bankId}/accounts/${managingMembersAcc.id}/members`).then(r => r.json());
        if (Array.isArray(refreshed.members)) {
          setAccountMembersList(refreshed.members);
          if (refreshed.owner) {
            setManagingMembersAcc((prev: any) => ({ ...prev, ownerInfo: refreshed.owner }));
          }
        }
        handleSearch();
      }
    } catch {
      flash("Error adding operator");
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

  const startDisputeFromTx = (tx: any) => {
    setDisputeTx(tx);
    setDisputeEscrow(null);
    setTicketSubject(`Dispute: Transaction #${tx.id.slice(0, 8)} (${formatMoney(tx.amount)})`);
    setTicketCategory("dispute");
    setTicketPriority("high");
    setTicketAccountId(tx.fromAccountId || (accounts[0]?.id || ""));
    setTicketMessage(`I would like to dispute transaction #${tx.id} for ${formatMoney(tx.amount)} dated ${tx.createdAt ? format(new Date(tx.createdAt), "MMM d, yyyy h:mm a") : "recently"}.\nReason: `);
    setDisputeModalOpen(true);
  };

  const startDisputeFromEscrow = (esc: any) => {
    setDisputeEscrow(esc);
    setDisputeTx(null);
    setTicketSubject(`Escrow Dispute: #${esc.id.slice(0, 8)} - ${esc.description || "Agreement"}`);
    setTicketCategory("dispute");
    setTicketPriority("high");
    setTicketAccountId(esc.buyerAccountId || (accounts[0]?.id || ""));
    setTicketMessage(`I would like to request staff mediation/intervention for Escrow #${esc.id} (${formatMoney(esc.amount)}).\nContract terms or dispute details: `);
    setDisputeModalOpen(true);
  };

  const submitSupportTicket = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formSubject = (form.get("subject") as string) || ticketSubject;
    const formMessage = (form.get("message") as string) || ticketMessage;
    const formCategory = (form.get("category") as string) || ticketCategory || "general";
    const formPriority = (form.get("priority") as string) || ticketPriority || "medium";
    const formTxId = (form.get("transactionId") as string) || disputeTx?.id;
    const formEscrowId = (form.get("escrowId") as string) || disputeEscrow?.id;

    const trimmedSubject = (formSubject || "").trim();
    if (!trimmedSubject) {
      flash("Please provide a ticket subject.");
      return;
    }
    const trimmedMessage = (formMessage || "").trim();

    setTicketSubmitting(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: trimmedSubject,
          description: trimmedMessage,
          initialMessage: trimmedMessage,
          category: formCategory,
          priority: formPriority,
          accountId: ticketAccountId || (accounts[0]?.id || undefined),
          transactionId: formTxId || undefined,
          escrowId: formEscrowId || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Failed to submit ticket");
      } else {
        flash("Support ticket submitted! Bank staff have been notified.");
        setNewTicketModalOpen(false);
        setDisputeModalOpen(false);
        setTicketSubject("");
        setTicketMessage("");
        setTicketCategory("general");
        setTicketPriority("medium");
        setDisputeTx(null);
        setDisputeEscrow(null);
        loadPortalTickets();
        setSelectedTicket(d);
        setView("support");
      }
    } catch {
      flash("Error submitting ticket");
    }
    setTicketSubmitting(false);
  };

  const submitTicketReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;
    setReplySubmitting(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/tickets/${selectedTicket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyMessage.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        flash(d.error || "Failed to send reply");
      } else {
        setReplyMessage("");
        loadPortalTickets();
      }
    } catch {
      flash("Error sending reply");
    }
    setReplySubmitting(false);
  };

  const activeLogo = (settings.logoUrl || bank?.logoUrl || "").trim();

  if (!user) {
    return (
      <div className="min-h-screen relative overflow-hidden" style={shell}>
        <div className="relative z-10 max-w-md mx-auto px-5 py-16 space-y-10 page-enter">
          <div className="text-center space-y-5">
            {(activeLogo && !logoBroken) ? (
              <img
                src={activeLogo}
                alt={bank.name}
                referrerPolicy="no-referrer"
                onError={() => setLogoBroken(true)}
                className="w-20 h-20 rounded-3xl mx-auto object-contain border p-2 shrink-0 shadow-lg"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
              />
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
    ...(settings.enableEscrow !== false ? [{ id: "escrow" as View, label: "Escrow", icon: ShieldCheck }] : []),
    { id: "activity" as View, label: "Activity", icon: Clock },
    { id: "apply" as View, label: "Apply", icon: Sparkles },
  ];

  return (
    <div className="min-h-screen" style={shell}>
      <header className="sticky top-0 z-30" style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 78%, transparent)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {(activeLogo && !logoBroken) ? (
              <img
                src={activeLogo}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain border p-0.5 shrink-0"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
                alt={bank.name}
                referrerPolicy="no-referrer"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-semibold text-sm shrink-0"
                style={{ background: brand, color: brandFg }}
              >
                {bank.name.slice(0, 1)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold truncate text-sm sm:text-base leading-tight">{bank.name}</p>
              <p className="text-[10px] sm:text-[11px] truncate" style={{ color: "var(--fg-subtle)" }}>{settings.tagline || "Online banking"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotificationsOpen(true)}
              className={`relative flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
                notificationsOpen
                  ? "bg-white/15 border-white/30 text-white"
                  : "border-white/10 hover:border-white/20 text-white/70 hover:text-white"
              }`}
              title="Notifications & Deposit Alerts"
            >
              <Bell size={14} className={(userData?.unreadNotificationCount || 0) > 0 ? "text-amber-400 animate-bounce" : ""} />
              <span className="hidden sm:inline">Alerts</span>
              {(userData?.unreadNotificationCount || 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-black leading-none font-mono">
                  {userData.unreadNotificationCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setView("support")}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
                view === "support"
                  ? "bg-white/15 border-white/30 text-white"
                  : "border-white/10 hover:border-white/20 text-white/70 hover:text-white"
              }`}
              title="Customer Support & Disputes"
            >
              <LifeBuoy size={14} className={tickets.some((t: any) => t.status === "open") ? "text-amber-400" : ""} />
              <span className="hidden sm:inline">Support</span>
              {tickets.filter((t: any) => t.status === "open").length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
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
            {/* Minimum Balance Alert Banner */}
            {accounts.some((a: any) => a.isBelowMinBalance) && (
              <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <AlertTriangle size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-amber-200">Minimum Balance Maintenance Required</h4>
                      <p className="text-xs text-amber-200/70">One or more accounts have fallen below their required tier balance.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setNotificationsOpen(true)}
                    className="text-xs font-bold text-amber-300 hover:text-white bg-amber-500/20 hover:bg-amber-500/30 px-3 py-1.5 rounded-lg border border-amber-500/30 transition"
                  >
                    View Notice
                  </button>
                </div>
                <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-xs space-y-1.5 font-mono text-white/90">
                  <span className="text-[10px] text-white/40 block font-sans uppercase font-bold tracking-wider">In-Game Deposit Command:</span>
                  <div className="flex items-center justify-between gap-2 overflow-x-auto">
                    <code className="text-amber-300">
                      {accounts.find((a: any) => a.isBelowMinBalance)?.depositCommand || `/c account deposit ${userData?.bankCorpName || bank?.cityCorpOrgName || bank?.settings?.cityCorpOrgName || (bank?.name?.toLowerCase().includes("vance") && bank?.name?.toLowerCase().includes("hamilton") ? "VH" : bank?.name?.replace(/[^a-zA-Z0-9]/g, "")) || "Bank"} <account> <amount>`}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultCorp = userData?.bankCorpName || bank?.cityCorpOrgName || bank?.settings?.cityCorpOrgName || (bank?.name?.toLowerCase().includes("vance") && bank?.name?.toLowerCase().includes("hamilton") ? "VH" : bank?.name?.replace(/[^a-zA-Z0-9]/g, "")) || "Bank";
                        const targetCmd = accounts.find((a: any) => a.isBelowMinBalance)?.depositCommand || `/c account deposit ${defaultCorp} ${accounts[0]?.accountName} 100`;
                        copy(targetCmd, "banner_dep_cmd");
                      }}
                      className="shrink-0 flex items-center gap-1 font-sans text-[11px] font-bold text-black bg-amber-400 hover:bg-amber-300 px-2.5 py-1 rounded transition"
                    >
                      {copied === "banner_dep_cmd" ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied === "banner_dep_cmd" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
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
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-7">
                {[
                  { id: "send" as View, label: "Send", icon: Send },
                  { id: "bills" as View, label: "Pay", icon: Receipt },
                  { id: "borrow" as View, label: "Loans", icon: Landmark },
                  ...(settings?.enableEscrow !== false ? [{ id: "escrow" as View, label: "Escrow", icon: ShieldCheck }] : []),
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

                      {acc.isBelowMinBalance && (
                        <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            <span className="font-bold text-amber-300 flex items-center gap-1">
                              <AlertTriangle size={12} /> Below Min Balance ({formatMoney(acc.minBalance)})
                            </span>
                            <span className="text-amber-200/70 font-mono">
                              Deficit: {formatMoney(acc.deficitCents || (acc.minBalance - acc.balance))}
                            </span>
                          </div>
                          {acc.depositCommand && (
                            <button
                              type="button"
                              onClick={() => copy(acc.depositCommand, `dep_${acc.id}`)}
                              className="w-full flex items-center justify-center gap-1.5 font-mono text-[10px] font-bold text-black bg-amber-400 hover:bg-amber-300 py-1.5 px-2 rounded-lg transition"
                            >
                              {copied === `dep_${acc.id}` ? <Check size={11} /> : <Terminal size={11} />}
                              <span>{copied === `dep_${acc.id}` ? "Copied Command to Clipboard!" : "Copy Deposit Command"}</span>
                            </button>
                          )}
                        </div>
                      )}

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
              {settings.enableLoans !== false && loanProducts.length > 0 && (
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
                  <p className="text-xs text-white/40 mt-1">
                    {loanProducts.length > 0
                      ? "Explore verified loan products offered by this bank to finance your investments."
                      : "This bank currently has no active loan products published in its catalog."}
                  </p>
                </div>
                {settings.enableLoans !== false && loanProducts.length > 0 && (
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

        {view === "escrow" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-2.5">
                  <ShieldCheck className="text-emerald-400" size={26} /> Trustless Escrow
                </h2>
                <p className="text-sm text-white/50 mt-1">
                  Lock funds securely in neutral bank vault custody until goods, services, or contracts are fulfilled.
                </p>
              </div>
              <button
                onClick={() => { setApplyTab("escrow"); setView("apply"); }}
                className="px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 self-start sm:self-auto shadow-lg transition-transform active:scale-95"
                style={btnBrand}
              >
                <Plus size={15} /> New Escrow Agreement
              </button>
            </div>

            {/* Escrow Stat Cards */}
            {(() => {
              const myAccountIds = accounts.map((a: any) => a.id);
              const userHandle = (user?.discordId || user?.username || "").toLowerCase();
              const fundedEscrows = escrows.filter(e => e.status === "funded");
              const totalLocked = fundedEscrows.reduce((s, e) => s + (e.amount || 0), 0);
              const asBuyerFunded = fundedEscrows.filter(e => 
                myAccountIds.some((id: string) => id?.toLowerCase() === e.buyerAccountId?.toLowerCase()) ||
                (userHandle && e.buyerDiscordId?.toLowerCase() === userHandle)
              );
              const asSellerFunded = fundedEscrows.filter(e => 
                myAccountIds.some((id: string) => id?.toLowerCase() === e.sellerAccountId?.toLowerCase()) ||
                (userHandle && e.sellerDiscordId?.toLowerCase() === userHandle)
              );
              const completedCount = escrows.filter(e => e.status === "released").length;

              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-[11px] text-white/40 uppercase font-semibold">Total in Vault Custody</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-emerald-400 mt-1">{formatMoney(totalLocked)}</p>
                    <p className="text-[11px] text-white/30 mt-1">{fundedEscrows.length} active agreement{fundedEscrows.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-[11px] text-white/40 uppercase font-semibold">Outgoing (As Buyer)</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-indigo-300 mt-1">
                      {formatMoney(asBuyerFunded.reduce((s, e) => s + (e.amount || 0), 0))}
                    </p>
                    <p className="text-[11px] text-white/30 mt-1">{asBuyerFunded.length} awaiting your release</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-[11px] text-white/40 uppercase font-semibold">Incoming (As Seller)</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-amber-300 mt-1">
                      {formatMoney(asSellerFunded.reduce((s, e) => s + (e.amount || 0), 0))}
                    </p>
                    <p className="text-[11px] text-white/30 mt-1">{asSellerFunded.length} locked for fulfillment</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <p className="text-[11px] text-white/40 uppercase font-semibold">Completed Releases</p>
                    <p className="text-xl sm:text-2xl font-black font-mono text-white mt-1">{completedCount}</p>
                    <p className="text-[11px] text-white/30 mt-1">Settled successfully</p>
                  </div>
                </div>
              );
            })()}

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {(["all", "funded", "pending", "released", "refunded"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setEscrowFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-colors border ${
                    escrowFilter === tab
                      ? "bg-white/15 border-white/30 text-white"
                      : "bg-white/5 border-white/5 text-white/50 hover:text-white"
                  }`}
                >
                  {tab === "all" ? "All Escrows" : tab === "funded" ? "🔒 Locked in Custody" : tab === "pending" ? "⏳ Pending Deposit" : tab === "released" ? "✅ Released" : "↩️ Refunded"}
                  <span className="ml-1.5 opacity-60 text-[10px] font-mono">
                    ({tab === "all" ? escrows.length : escrows.filter(e => e.status === tab).length})
                  </span>
                </button>
              ))}
            </div>

            {/* Escrow List */}
            {(() => {
              const myAccountIds = accounts.map((a: any) => a.id);
              const filteredList = escrows.filter(e => escrowFilter === "all" ? true : e.status === escrowFilter);

              if (filteredList.length === 0) {
                return (
                  <div className="rounded-3xl border border-white/10 p-10 bg-white/[0.02] text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
                      <ShieldCheck size={28} />
                    </div>
                    <h3 className="font-bold text-white text-lg">No {escrowFilter !== "all" ? escrowFilter : ""} escrow agreements found</h3>
                    <p className="text-xs text-white/45 max-w-md mx-auto">
                      Use bank escrow to safeguard high-value trades, property sales, or freelance commissions. Funds stay protected in neutral custody until you release them.
                    </p>
                    <button
                      onClick={() => { setApplyTab("escrow"); setView("apply"); }}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold mt-2 shadow"
                      style={btnBrand}
                    >
                      Draft an Escrow Agreement
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredList.map((escrow: any) => {
                    const userHandle = (user?.discordId || user?.username || "").toLowerCase();
                    const linkedHandle = (user?.linkedDiscordId || "").toLowerCase();
                    const buyerHandle = (escrow.buyerDiscordId || "").toLowerCase();
                    const sellerHandle = (escrow.sellerDiscordId || "").toLowerCase();
                    const isBuyer = myAccountIds.some((id: string) => id?.toLowerCase() === escrow.buyerAccountId?.toLowerCase()) ||
                      (userHandle && buyerHandle === userHandle) ||
                      (linkedHandle && buyerHandle === linkedHandle);
                    const isSeller = myAccountIds.some((id: string) => id?.toLowerCase() === escrow.sellerAccountId?.toLowerCase()) ||
                      (userHandle && sellerHandle === userHandle) ||
                      (linkedHandle && sellerHandle === linkedHandle);
                    const isStaffViewer = (userData?.isStaff || user?.isGlobalAdmin) && !isBuyer && !isSeller;
                    const isPendingAction = escrowActionInProgress?.startsWith(escrow.id);

                    return (
                      <div
                        key={escrow.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.035] transition-all p-5 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                              escrow.status === "funded"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : escrow.status === "pending"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : escrow.status === "released"
                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                : "bg-white/10 text-white/60 border border-white/10"
                            }`}>
                              {escrow.status === "funded" && <Lock size={12} />}
                              {escrow.status === "pending" && <Clock size={12} />}
                              {escrow.status === "released" && <Check size={12} />}
                              {escrow.status === "funded" ? "Locked in Custody" : escrow.status === "pending" ? "Pending Deposit" : escrow.status === "released" ? "Released & Settled" : "Refunded"}
                            </span>

                            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide border ${
                              isBuyer 
                                ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300" 
                                : isSeller 
                                ? "bg-purple-500/15 border-purple-500/30 text-purple-300"
                                : "bg-cyan-500/15 border-cyan-500/30 text-cyan-300"
                            }`}>
                              {isBuyer ? "👤 You: Buyer (Depositor)" : isSeller ? "🏷️ You: Seller (Recipient)" : "🏛️ Bank Staff Oversight"}
                            </span>

                            <span className="text-[11px] font-mono text-white/35">
                              #{escrow.id.slice(0, 12)}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-xl sm:text-2xl font-black font-mono text-white">
                              {formatMoney(escrow.amount)}
                            </span>
                          </div>
                        </div>

                        {/* Description & Contract terms */}
                        <div className="rounded-xl bg-white/5 border border-white/5 p-3.5 space-y-2 text-xs">
                          <p className="font-semibold text-white/90">{escrow.description || "Escrow Agreement"}</p>
                          {escrow.contractText && (
                            <p className="text-white/60 font-mono text-[11px] whitespace-pre-wrap border-t border-white/5 pt-2">
                              {escrow.contractText}
                            </p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1 text-white/50 border-t border-white/5">
                            <div>
                              <span className="text-white/35 block">Buyer Account:</span>
                              <strong className="text-white/80">{escrow.buyerAccountName || escrow.buyerAccountId}</strong>
                              {escrow.buyerDiscordId && <span className="text-white/40 block">Discord: @{escrow.buyerDiscordId}</span>}
                            </div>
                            <div>
                              <span className="text-white/35 block">Seller Account:</span>
                              <strong className="text-white/80">{escrow.sellerAccountName || escrow.sellerAccountId}</strong>
                              {escrow.sellerDiscordId && <span className="text-white/40 block">Discord: @{escrow.sellerDiscordId}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Action Toolbar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                          <div className="text-[11px] text-white/40">
                            Created {escrow.createdAt ? format(new Date(escrow.createdAt), "MMM d, yyyy h:mm a") : "Recently"}
                            {escrow.clientSignedAt && <span className="text-emerald-400/80 ml-2">· Funded on {format(new Date(escrow.clientSignedAt), "MMM d, h:mm a")}</span>}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Copy Escrow ID */}
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(escrow.id);
                                flash("Escrow ID copied to clipboard!");
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 flex items-center gap-1.5 transition-colors"
                            >
                              <Copy size={12} /> Copy ID
                            </button>

                            {/* Buyer actions */}
                            {isBuyer && escrow.status === "pending" && (
                              <button
                                disabled={Boolean(isPendingAction)}
                                onClick={() => fundEscrow(escrow.id)}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {escrowActionInProgress === `${escrow.id}_fund` ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                                Fund & Lock Custody
                              </button>
                            )}

                            {isBuyer && escrow.status === "funded" && (
                              <button
                                disabled={Boolean(isPendingAction)}
                                onClick={() => releaseEscrow(escrow.id)}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {escrowActionInProgress === `${escrow.id}_release` ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                                Release Funds to Seller
                              </button>
                            )}

                            {/* Seller voluntary refund */}
                            {isSeller && escrow.status === "funded" && (
                              <button
                                disabled={Boolean(isPendingAction)}
                                onClick={() => refundEscrow(escrow.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              >
                                {escrowActionInProgress === `${escrow.id}_refund` ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownLeft size={13} />}
                                Refund to Buyer
                              </button>
                            )}

                            {/* Cancel pending */}
                            {escrow.status === "pending" && (isBuyer || isSeller) && (
                              <button
                                disabled={Boolean(isPendingAction)}
                                onClick={() => cancelEscrow(escrow.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white/50 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                              >
                                {escrowActionInProgress === `${escrow.id}_cancel` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                Cancel Draft
                              </button>
                            )}

                            {/* Dispute / Mediation Request */}
                            {(escrow.status === "funded" || escrow.status === "pending") && (
                              <button
                                onClick={() => startDisputeFromEscrow(escrow)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 flex items-center gap-1.5 transition-colors"
                                title="Request bank staff mediation or open a dispute"
                              >
                                <ShieldAlert size={12} />
                                <span>Mediation</span>
                              </button>
                            )}

                            {isStaffViewer && (
                              <Link
                                to={`/bank/${bankId}/escrow`}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 flex items-center gap-1.5 transition-colors"
                                title="Manage institutional escrow custody in the Bank Desk"
                              >
                                <ShieldCheck size={13} />
                                <span>Bank Desk</span>
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {view === "apply" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-black">Financial Catalog & Applications</h2>
              <p className="text-sm text-white/50 mt-1">Open deposit accounts, apply for financing, request cards, and draft escrow holds.</p>
            </div>

            {/* Categorized Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 border-b border-white/10 pb-3">
              {[
                { id: "account", label: "Deposit Account", icon: Wallet },
                { id: "loan", label: "Loans & Credit", icon: Landmark },
                { id: "card", label: "Payment Cards", icon: CreditCard },
                { id: "bond", label: "Time Vaults", icon: PiggyBank },
                { id: "escrow", label: "Escrow Hold", icon: ShieldCheck },
              ].map(tab => {
                const Icon = tab.icon;
                const active = applyTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setApplyTab(tab.id as any)}
                    className={`flex items-center gap-2 justify-center py-2.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                      active
                        ? "bg-white/15 border-white/30 text-white shadow-md"
                        : "bg-white/5 border-white/5 text-white/50 hover:text-white hover:bg-white/[0.08]"
                    }`}
                  >
                    <Icon size={15} color={active ? brand : undefined} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB: DEPOSIT ACCOUNT */}
            {applyTab === "account" && (
              (() => {
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

                const effectivePrefix = activeSelectedTier?.customPrefix || (isBiz ? (settings.businessAccountPrefix || "CORP-") : (settings.personalAccountPrefix || "ACC-"));
                const effectiveNamingMode = activeSelectedTier?.namingMode || (isBiz ? (settings.businessAccountNamingMode || "business_name") : (settings.personalAccountNamingMode || "custom"));
                const discordName = user?.username || (user as any)?.global_name || "client";
                const targetAccountName = `${effectivePrefix}${(!isBiz && (effectiveNamingMode === "discord_username" || namingPref === "discord")) ? discordName : (accountNameChoice || (isBiz ? "AcmeCorp" : "main"))}`;
                const bankCorpName = bank?.name?.replace(/\s+/g, '') || "Bank";
                const suggestedDepositCents = activeSelectedTier?.minBalance && activeSelectedTier.minBalance > 0 ? activeSelectedTier.minBalance : 10000;
                const liveCommandPreview = `/c account deposit ${bankCorpName} ${targetAccountName} ${(suggestedDepositCents / 100).toFixed(0)}`;

                return (
                  <form onSubmit={openAccount} className="rounded-3xl border border-white/10 p-6 sm:p-8 space-y-6 bg-white/[0.02]">
                    <div className="flex items-center justify-between border-b border-white/5 pb-5">
                      <div>
                        <h3 className="font-bold text-lg text-white flex items-center gap-2.5">
                          <Wallet size={20} className="text-indigo-400" />
                          <span>Open New Deposit Account</span>
                        </h3>
                        <p className="text-xs text-white/50 mt-1">Select an account tier and configure your deposit destination.</p>
                      </div>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase font-mono font-bold tracking-wider">
                        Instant Setup
                      </span>
                    </div>

                    {availableTiers.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Choose Account Tier</label>
                          <span className="text-xs text-white/40">{availableTiers.length} available option{availableTiers.length === 1 ? "" : "s"}</span>
                        </div>

                        {/* Visual Tier Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          {availableTiers.map((t: any) => {
                            const isSelected = (selectedTierId || (availableTiers.find((x: any) => x.isDefault)?.id || availableTiers[0]?.id)) === t.id;
                            const tHeld = accounts.filter((a: any) => a.tierId === t.id).length;
                            const isCapReached = typeof t.maxAccountsPerUser === "number" && t.maxAccountsPerUser > 0 && tHeld >= t.maxAccountsPerUser;

                            return (
                              <div
                                key={t.id}
                                onClick={() => setSelectedTierId(t.id)}
                                className={`cursor-pointer rounded-2xl p-4.5 border transition-all relative flex flex-col justify-between space-y-3.5 ${
                                  isSelected
                                    ? "bg-gradient-to-b from-indigo-500/15 via-white/[0.04] to-white/[0.02] border-indigo-400/50 shadow-lg shadow-indigo-500/10"
                                    : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                                }`}
                              >
                                <div>
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                          t.type === "business" ? "bg-amber-500/15 text-amber-300 border border-amber-500/30" : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                                        }`}>
                                          {t.type === "business" ? "Business" : "Personal"}
                                        </span>
                                        {t.isDefault && (
                                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">Default</span>
                                        )}
                                      </div>
                                      <h4 className="font-bold text-white text-base mt-2">{t.name}</h4>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                                      isSelected ? "bg-indigo-500 border-indigo-400 text-white" : "border-white/20 bg-white/5 text-transparent"
                                    }`}>
                                      <Check size={12} strokeWidth={3} />
                                    </div>
                                  </div>

                                  {t.description && (
                                    <p className="text-xs text-white/50 mt-1.5 line-clamp-2 leading-relaxed">{t.description}</p>
                                  )}
                                </div>

                                <div className="space-y-2 pt-2 border-t border-white/5 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-white/40 text-[11px]">Interest Yield</span>
                                    <span className="font-bold text-emerald-400">
                                      {t.apyPercent > 0 ? `${(Number(t.apyPercent) / 100).toFixed(2)}% APY` : "0.00%"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-white/40 text-[11px]">Min Required Balance</span>
                                    <span className={`font-mono font-bold ${t.minBalance > 0 ? "text-amber-300" : "text-white/70"}`}>
                                      {t.minBalance > 0 ? formatMoney(t.minBalance) : "$0.00 (None)"}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-white/40 text-[11px]">Monthly Fee</span>
                                    <span className="font-bold text-white/80">
                                      {t.monthlyFee > 0 ? `${formatMoney(t.monthlyFee)}/mo` : "Free"}
                                    </span>
                                  </div>
                                </div>

                                {isCapReached && (
                                  <div className="text-[10px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg text-center">
                                    Holding Limit Reached ({tHeld}/{t.maxAccountsPerUser})
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Minimum Balance Requirement Explanatory Alert */}
                        {activeSelectedTier && activeSelectedTier.minBalance > 0 && (
                          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs">
                            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <span className="font-bold text-amber-200">
                                Minimum Maintenance Balance Required: {formatMoney(activeSelectedTier.minBalance)}
                              </span>
                              <p className="text-amber-200/80 leading-relaxed">
                                Once created, please fund this account in-game using the deposit command to satisfy the tier minimum. You will receive an in-game and portal notification reminder until funded.
                              </p>
                            </div>
                          </div>
                        )}

                        {cannotRegisterReason && (
                          <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
                            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-rose-400" />
                            <div>
                              <strong className="block font-semibold">Tier Policy Restriction</strong>
                              <p className="text-rose-200/90 mt-0.5">{cannotRegisterReason}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-white/50 uppercase tracking-wide mb-1.5">Account Type</label>
                        <select name="accountType" className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                          <option value="personal_checking" className="bg-[#18181c] text-[#f4f4f5]">Personal Checking</option>
                          <option value="personal_savings" className="bg-[#18181c] text-[#f4f4f5]">High-Yield Savings</option>
                          <option value="business_checking" className="bg-[#18181c] text-[#f4f4f5]">Commercial Business Entity</option>
                        </select>
                      </div>
                    )}

                    {/* Hidden tier id input for standard form submission */}
                    <input type="hidden" name="tierId" value={selectedTierId || (availableTiers.find((t: any) => t.isDefault)?.id || availableTiers[0]?.id || "")} />

                    {/* Dynamic Naming & In-Game Command Preview */}
                    <div className="space-y-4 pt-2 border-t border-white/5">
                      {!isBiz && effectiveNamingMode === "choice_or_username" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setNamingPref("custom")}
                            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${namingPref === "custom" ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/5 text-white/50 hover:text-white"}`}
                          >
                            Custom Account Name
                          </button>
                          <button
                            type="button"
                            onClick={() => setNamingPref("discord")}
                            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${namingPref === "discord" ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/5 text-white/50 hover:text-white"}`}
                          >
                            Discord Handle (@{discordName})
                          </button>
                        </div>
                      )}

                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label className="text-xs font-bold text-white/60 uppercase tracking-wider">
                            {isBiz ? "Commercial Business / Entity Name" : "Account Identifier"}
                          </label>
                          <span className="text-[11px] font-mono text-white/40">
                            Resulting In-Game ID: <strong className="text-indigo-300 font-bold">{targetAccountName}</strong>
                          </span>
                        </div>

                        {(!isBiz && (effectiveNamingMode === "discord_username" || namingPref === "discord")) ? (
                          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white font-mono">
                            <span className="text-indigo-400 font-bold">{effectivePrefix}</span>
                            <span>{discordName}</span>
                            <span className="ml-auto text-[11px] text-emerald-400 uppercase font-sans font-bold flex items-center gap-1">
                              <CheckCircle2 size={13} /> Synced Handle
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-400/60 focus-within:ring-1 focus-within:ring-indigo-400/30 transition">
                            <span className="px-4 py-3.5 bg-white/5 text-indigo-300 font-mono text-sm border-r border-white/10 select-none font-bold">
                              {effectivePrefix}
                            </span>
                            <input 
                              name="accountName" 
                              required 
                              value={accountNameChoice}
                              onChange={(e) => setAccountNameChoice(e.target.value)}
                              placeholder={isBiz ? "e.g. AcmeIndustries" : "e.g. savings"} 
                              className="flex-1 bg-transparent px-4 py-3.5 text-sm text-white focus:outline-none placeholder:text-white/20 font-medium" 
                            />
                          </div>
                        )}
                      </div>

                      {/* Live In-Game Deposit Command Preview */}
                      <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-white/50 font-sans">
                          <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-white/60">
                            <Terminal size={13} className="text-emerald-400" /> In-Game Deposit Command Preview
                          </span>
                          <span className="text-[10px] text-white/40">Run in Minecraft chat</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 overflow-x-auto font-mono text-xs">
                          <span className="text-emerald-300 font-semibold truncate select-all">{liveCommandPreview}</span>
                          <button
                            type="button"
                            onClick={() => copy(liveCommandPreview, "preview_cmd")}
                            className="shrink-0 flex items-center gap-1 text-[10px] font-sans font-bold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition"
                          >
                            {copied === "preview_cmd" ? <Check size={11} /> : <Copy size={11} />}
                            <span>{copied === "preview_cmd" ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      disabled={actionPending || Boolean(cannotRegisterReason)}
                      className="w-full py-4 rounded-2xl font-bold text-sm text-white shadow-xl transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={btnBrand}
                    >
                      {actionPending ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Provisioning Account…</span>
                        </>
                      ) : cannotRegisterReason ? (
                        <span>Registration Policy Restricted</span>
                      ) : (
                        <>
                          <span>Open Account & View In-Game Setup</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </form>
                );
              })()
            )}

            {/* TAB: LOANS & CREDIT */}
            {applyTab === "loan" && (
              settings.enableLoans === false ? (
                <div className="rounded-3xl border border-white/10 p-8 bg-white/[0.02] text-center">
                  <p className="text-white/50 text-sm">Loan applications are currently disabled for this institution.</p>
                </div>
              ) : loanProducts.length === 0 ? (
                <div className="rounded-3xl border border-white/10 p-8 bg-white/[0.02] text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                    <Landmark size={24} />
                  </div>
                  <h3 className="font-bold text-white text-base">No Published Loan Products</h3>
                  <p className="text-xs text-white/40 max-w-md mx-auto">
                    This bank has not published active loan products in its catalog yet. Applications will open once products are activated by staff.
                  </p>
                </div>
              ) : (
                <form onSubmit={applyLoan} className="rounded-3xl border border-white/10 p-6 space-y-5 bg-white/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h3 className="font-bold text-base flex items-center gap-2"><Landmark size={18} /> Apply for Financing</h3>
                      <p className="text-xs text-white/45 mt-0.5">Underwritten financing with competitive APR and customizable repayment terms.</p>
                    </div>
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full uppercase font-mono font-bold">
                      Catalog Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Deposit Disbursement Account</label>
                      <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                        {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · ({formatMoney(a.balance)})</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Select Loan Product</label>
                      <select
                        name="productId"
                        required
                        value={selectedLoanProductId || loanProducts[0]?.id || ""}
                        onChange={(e) => setSelectedLoanProductId(e.target.value)}
                        className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                      >
                        {loanProducts.map((p: any) => (
                          <option key={p.id} value={p.id} className="bg-[#18181c] text-[#f4f4f5]">
                            {p.name} — {(Number(p.interestRate) / (Number(p.interestRate) > 100 ? 100 : 1)).toFixed(2)}% APR · max {formatMoney(p.maxAmount)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const curProd = loanProducts.find((p: any) => p.id === (selectedLoanProductId || loanProducts[0]?.id)) || loanProducts[0];
                    if (!curProd) return null;
                    const minDol = curProd.minAmount ? curProd.minAmount / 100 : 10;
                    const maxDol = curProd.maxAmount ? curProd.maxAmount / 100 : 10000;
                    const apr = (Number(curProd.interestRate) / (Number(curProd.interestRate) > 100 ? 100 : 1)).toFixed(2);
                    const termMonths = curProd.termDays ? Math.max(1, Math.round(curProd.termDays / 30)) : 1;

                    return (
                      <>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3 text-xs">
                          <div className="flex items-center justify-between font-bold text-white text-sm">
                            <span>{curProd.name}</span>
                            <span className="text-emerald-400 font-mono">{apr}% Fixed APR</span>
                          </div>
                          {curProd.description && <p className="text-white/65">{curProd.description}</p>}
                          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5 text-[11px]">
                            <div>
                              <span className="text-white/40 block">Term Duration</span>
                              <span className="font-bold text-white">{curProd.termDays || 30} days ({termMonths} mo)</span>
                            </div>
                            <div>
                              <span className="text-white/40 block">Borrow Limit</span>
                              <span className="font-bold text-white">{formatMoney(curProd.minAmount || 1000)} – {formatMoney(curProd.maxAmount)}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block">Category</span>
                              <span className="font-bold text-white capitalize">{curProd.category || "personal"}</span>
                            </div>
                          </div>
                        </div>

                        <input type="hidden" name="termMonths" value={termMonths} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                              Requested Amount (${minDol.toLocaleString()} – ${maxDol.toLocaleString()})
                            </label>
                            <input
                              name="amount"
                              type="number"
                              step="0.01"
                              min={minDol}
                              max={maxDol}
                              required
                              defaultValue={minDol}
                              placeholder={`Amount between $${minDol} and $${maxDol}`}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm font-mono focus:outline-none focus:border-white/30"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Purpose of Financing</label>
                            <input
                              name="purpose"
                              placeholder="e.g. Business expansion, asset acquisition"
                              required
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-white/30"
                            />
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <button
                    disabled={actionPending}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-50"
                    style={btnBrand}
                  >
                    {actionPending ? "Submitting Application…" : "Submit Loan Application"}
                  </button>
                </form>
              )
            )}

            {/* TAB: CARDS */}
            {applyTab === "card" && (
              settings.enableCards === false ? (
                <div className="rounded-3xl border border-white/10 p-8 bg-white/[0.02] text-center">
                  <p className="text-white/50 text-sm">Payment cards are currently disabled for this institution.</p>
                </div>
              ) : (
                <form onSubmit={requestCard} className="rounded-3xl border border-white/10 p-6 space-y-5 bg-white/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h3 className="font-bold text-base flex items-center gap-2"><CreditCard size={18} /> Request Payment Card</h3>
                      <p className="text-xs text-white/45 mt-0.5">Linked directly to your checking account with Onyx contactless payments & cash advances.</p>
                    </div>
                  </div>

                  {/* Card Visual Graphic */}
                  {(() => {
                    const selCardProd = cardProducts.find((p: any) => p.id === selectedCardProductId) || cardProducts[0];
                    const isCredit = selCardProd ? selCardProd.cardKind === "credit" : false;
                    const cardLimit = selCardProd?.maxLimit ? formatMoney(selCardProd.maxLimit) : "$2,500.00";

                    return (
                      <div className="max-w-sm mx-auto rounded-2xl p-5 border relative overflow-hidden shadow-2xl bg-gradient-to-br from-neutral-900 via-neutral-800 to-black border-white/20 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs font-bold tracking-widest text-white/70 uppercase">{bank.name}</p>
                            <p className="text-[10px] text-white/40 uppercase font-mono">{isCredit ? "Onyx Premium Credit" : "Debit Contactless"}</p>
                          </div>
                          <div className="w-8 h-6 rounded-md bg-amber-400/80 border border-amber-300 flex items-center justify-center">
                            <div className="w-5 h-4 border-y border-amber-900/40 grid grid-cols-2 gap-0.5" />
                          </div>
                        </div>

                        <div className="my-6">
                          <p className="text-sm font-mono tracking-widest text-white/80">•••• •••• •••• 4492</p>
                        </div>

                        <div className="flex justify-between items-end text-[11px]">
                          <div>
                            <span className="text-[9px] text-white/40 block uppercase">Cardholder</span>
                            <span className="font-bold font-mono text-white/90">@{user?.username || "CLIENT"}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-white/40 block uppercase">Limit</span>
                            <span className="font-bold text-emerald-400 font-mono">{cardLimit}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Link to Account</label>
                      <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                        {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · {formatMoney(a.balance)}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Card Product Tier</label>
                      {cardProducts.length > 0 ? (
                        <select
                          name="productId"
                          required
                          value={selectedCardProductId || cardProducts[0]?.id || ""}
                          onChange={(e) => setSelectedCardProductId(e.target.value)}
                          className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                        >
                          {cardProducts.map((p: any) => (
                            <option key={p.id} value={p.id} className="bg-[#18181c] text-[#f4f4f5]">
                              {p.name} · {p.cardKind === "debit" ? "Debit" : "Credit"} · Limit {formatMoney(p.maxLimit)} · {Number(p.interestRate).toFixed(2)}% APR
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select name="cardType" className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                          <option value="debit" className="bg-[#18181c] text-[#f4f4f5]">Standard Debit Card</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-white/40">
                    Payment cards include instant freeze/unfreeze controls and support direct cash advances within configured credit limits.
                  </p>

                  <button
                    disabled={actionPending}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-50"
                    style={btnBrand}
                  >
                    {actionPending ? "Processing Card Request…" : "Issue Payment Card"}
                  </button>
                </form>
              )
            )}

            {/* TAB: BONDS / TIME VAULTS */}
            {applyTab === "bond" && (
              settings.enableVaults === false || !Array.isArray(bondProducts) || bondProducts.length === 0 ? (
                <div className="rounded-3xl border border-white/10 p-8 bg-white/[0.02] text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                    <PiggyBank size={24} />
                  </div>
                  <h3 className="font-bold text-white text-base">No Active Time Vaults</h3>
                  <p className="text-xs text-white/40 max-w-md mx-auto">
                    Time deposit bonds are not configured for this bank currently.
                  </p>
                </div>
              ) : (
                <form onSubmit={buyBond} className="rounded-3xl border border-white/10 p-6 space-y-5 bg-white/[0.02]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div>
                      <h3 className="font-bold text-base flex items-center gap-2"><PiggyBank size={18} /> High-Yield Time Vault</h3>
                      <p className="text-xs text-white/45 mt-0.5">Time-locked deposits earning fixed yield upon maturity.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Source Funding Account</label>
                      <select name="accountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                        {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · {formatMoney(a.balance)}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Lock Duration & APY</label>
                      <select name="lockDays" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                        {bondProducts.map((t: any) => (
                          <option key={t.lockDays} value={t.lockDays} className="bg-[#18181c] text-[#f4f4f5]">
                            {t.lockDays} days · {(Number(t.interestRate) / 100).toFixed(2)}% APY ({t.penaltyPercent ?? 20}% early penalty)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Deposit Amount to Lock</label>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      value={bondSimAmount}
                      onChange={(e) => setBondSimAmount(e.target.value)}
                      placeholder="Amount to lock"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm font-mono focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <button
                    disabled={actionPending}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-50"
                    style={btnBrand}
                  >
                    {actionPending ? "Locking Funds in Vault…" : "Purchase Time Vault Bond"}
                  </button>
                </form>
              )
            )}

            {/* TAB: ESCROW AGREEMENT */}
            {applyTab === "escrow" && (
              <form onSubmit={createEscrow} className="rounded-3xl border border-white/10 p-6 space-y-5 bg-white/[0.02]">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div>
                    <h3 className="font-bold text-base flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-400" /> Initiate Escrow Agreement</h3>
                    <p className="text-xs text-white/45 mt-0.5">Safeguard a purchase or deal. Funds will be held securely by the bank until you release them.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Your Buyer Account (Funder)</label>
                    <select name="buyerAccountId" required className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]">
                      {accounts.map((a: any) => <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">{a.accountName} · Available: {formatMoney(a.balance)}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Seller Counterparty (Recipient)</label>
                    <input
                      name="sellerIdentifier"
                      required
                      placeholder="e.g. ACC-steve, steve, @steve, or MC username"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-white/30"
                    />
                    <p className="text-[11px] text-white/40 mt-1">
                      Accepts account names (with or without prefix), Account IDs, Discord tags, or Minecraft player names.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Escrow Hold Amount ($)</label>
                    <input
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="e.g. 500.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm font-mono focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Deal Subject / Title</label>
                    <input
                      name="description"
                      required
                      placeholder="e.g. Purchase of Diamond Fleet #44"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Agreement Terms & Delivery Conditions (Optional)</label>
                  <textarea
                    name="contractText"
                    rows={3}
                    placeholder="Specify delivery milestones, Minecraft coords, Discord trade conditions, or inspection terms…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-white/30 resize-none font-sans"
                  />
                </div>

                <label className="flex items-center gap-3 p-3.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <input type="checkbox" name="autoFund" defaultChecked className="w-4 h-4 rounded text-emerald-500" />
                  <div className="text-xs">
                    <strong className="block text-white/90">Auto-Fund Immediately</strong>
                    <span className="text-white/40">Lock funds into escrow custody right away upon creation.</span>
                  </div>
                </label>

                <button
                  disabled={actionPending || escrowSubmitting}
                  className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-50"
                  style={btnBrand}
                >
                  {escrowSubmitting ? "Locking Funds in Custody…" : actionPending ? "Initiating Escrow Agreement…" : "Create & Lock Escrow Agreement"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* VIEW: SUPPORT & DISPUTES */}
        {view === "support" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/10">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-2.5">
                  <LifeBuoy className="text-amber-400" size={26} /> Customer Support & Disputes
                </h2>
                <p className="text-sm text-white/50 mt-1">
                  Submit inquiry tickets, request mediation on escrow orders, or report fraudulent and accidental transactions.
                </p>
              </div>
              <button
                onClick={openNewTicketModal}
                className="px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 self-start sm:self-auto shadow-lg transition-transform active:scale-95"
                style={btnBrand}
              >
                <Plus size={15} /> New Support Ticket
              </button>
            </div>

            {/* Quick Stat Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[11px] text-white/40 uppercase font-semibold">Total Tickets</p>
                <p className="text-2xl font-black font-mono text-white mt-1">{tickets.length}</p>
                <p className="text-[11px] text-white/30 mt-1">All time inquiries</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[11px] text-white/40 uppercase font-semibold">Awaiting Staff</p>
                <p className="text-2xl font-black font-mono text-amber-400 mt-1">
                  {tickets.filter((t: any) => t.status === "open").length}
                </p>
                <p className="text-[11px] text-white/30 mt-1">Under review</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[11px] text-white/40 uppercase font-semibold">In Progress</p>
                <p className="text-2xl font-black font-mono text-indigo-400 mt-1">
                  {tickets.filter((t: any) => t.status === "in_progress").length}
                </p>
                <p className="text-[11px] text-white/30 mt-1">Active investigations</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-[11px] text-white/40 uppercase font-semibold">Resolved</p>
                <p className="text-2xl font-black font-mono text-emerald-400 mt-1">
                  {tickets.filter((t: any) => t.status === "resolved" || t.status === "closed").length}
                </p>
                <p className="text-[11px] text-white/30 mt-1">Settled & closed</p>
              </div>
            </div>

            {/* Ticket List */}
            {tickets.length === 0 ? (
              <div className="rounded-3xl border border-white/10 p-12 bg-white/[0.02] text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
                  <LifeBuoy size={28} />
                </div>
                <h3 className="font-bold text-white text-lg">No support tickets or disputes on record</h3>
                <p className="text-xs text-white/45 max-w-md mx-auto">
                  Have questions regarding your accounts, cards, or need help with a transaction dispute? Open a support ticket to reach the bank's administrative staff.
                </p>
                <button
                  onClick={openNewTicketModal}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold shadow transition-transform active:scale-95"
                  style={btnBrand}
                >
                  Open Support Ticket
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((t: any) => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-5 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          t.status === "open"
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                            : t.status === "in_progress"
                            ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                            : t.status === "resolved"
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                            : "bg-white/10 border-white/10 text-white/50"
                        }`}>
                          {t.status.replace("_", " ")}
                        </span>

                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                          t.priority === "urgent" || t.priority === "high"
                            ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                            : "bg-white/5 border-white/10 text-white/60"
                        }`}>
                          {t.priority}
                        </span>

                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-white/60 border border-white/5 capitalize">
                          {t.category.replace("_", " ")}
                        </span>

                        <span className="text-[11px] font-mono text-white/30">
                          #{t.id.slice(0, 10)}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-white/95 truncate">{t.subject}</h4>

                      <div className="flex items-center gap-3 text-xs text-white/40 flex-wrap">
                        {t.transactionId && (
                          <span className="flex items-center gap-1 text-rose-400/80 font-mono text-[11px]">
                            <ShieldAlert size={12} /> Tx: {t.transactionId.slice(0, 8)}…
                          </span>
                        )}
                        {t.escrowId && (
                          <span className="flex items-center gap-1 text-emerald-400/80 font-mono text-[11px]">
                            <ShieldCheck size={12} /> Escrow: {t.escrowId.slice(0, 8)}…
                          </span>
                        )}
                        <span>Updated {t.updatedAt ? format(new Date(t.updatedAt), "MMM d, h:mm a") : "Recently"}</span>
                        {t.messages && (
                          <span className="text-white/30">· {t.messages.length} message{t.messages.length === 1 ? "" : "s"}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition"
                      >
                        View Thread →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30" style={{ borderTop: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(16px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-around">
          {nav.map((n) => {
            const Icon = n.icon;
            const on = view === n.id || (n.id === "home" && ["bills", "borrow", "cards"].includes(view) === false && view !== "send" && view !== "activity" && view !== "apply" && view !== "escrow");
            return (
              <button key={n.id} onClick={() => { if (n.id === "send" && view !== "send") setTransferSuccess(null); setView(n.id); }} className="flex-1 py-3 min-h-[52px] text-[11px] font-semibold flex flex-col items-center gap-1" style={{ color: on ? "var(--fg)" : "var(--fg-subtle)" }}>
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
                      <div className="flex items-center gap-3">
                        <img
                          src={managingMembersAcc.ownerInfo?.avatarUrl || `https://mc-heads.net/avatar/${managingMembersAcc.ownerInfo?.mcUsername || "MHF_Steve"}/64`}
                          alt="Owner Head"
                          className="w-8 h-8 rounded-lg border border-amber-500/30 object-cover bg-black/40 shadow-sm"
                          onError={(e: any) => { e.currentTarget.src = "https://mc-heads.net/avatar/MHF_Steve/64"; }}
                        />
                        <div>
                          <p className="text-xs font-semibold text-white/95">
                            {managingMembersAcc.ownerInfo?.mcUsername || managingMembersAcc.ownerDiscordId || "Account Owner"}
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
                        No additional team members added yet. Grant access to trusted operators below.
                      </div>
                    ) : (
                      accountMembersList.map((m: any) => (
                        <div key={m.id} className="p-3.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <img
                              src={m.avatarUrl || `https://mc-heads.net/avatar/${m.mcUsername || "MHF_Steve"}/64`}
                              alt={m.mcUsername}
                              className="w-8 h-8 rounded-lg border border-white/10 object-cover bg-black/40 shadow-sm"
                              onError={(e: any) => { e.currentTarget.src = "https://mc-heads.net/avatar/MHF_Steve/64"; }}
                            />
                            <div>
                              <p className="text-xs font-semibold text-white/95">{m.mcUsername || m.discordId}</p>
                              <p className="text-[10px] text-white/40">
                                {m.role === "manager" ? "Full access • Can dispatch transfers & manage settings" : "Read-only • Can view balance and ledger"}
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
                              className="p-1.5 rounded-lg hover:bg-rose-500/20 text-white/30 hover:text-rose-300 transition"
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
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <UserPlus size={14} /> Add Team Member
                  </p>
                  {newMemberUsername.trim().length >= 2 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/70">
                      <img
                        src={`https://mc-heads.net/avatar/${newMemberUsername.trim()}/24`}
                        alt=""
                        className="w-4 h-4 rounded object-cover"
                        onError={(e: any) => { e.currentTarget.style.display = "none"; }}
                      />
                      <span>{newMemberUsername.trim()}</span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-white/40">
                  Enter their Minecraft username to grant them multi-user access to this business account in the Web Portal and in-game.
                </p>
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={newMemberUsername}
                      onChange={(e) => setNewMemberUsername(e.target.value)}
                      placeholder="Minecraft Username (e.g. Cofys)"
                      className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-xs font-medium text-white placeholder:text-white/20 focus:outline-none focus:border-white/25"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewMemberRole("manager")}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition ${newMemberRole === "manager" ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-[#18181c] border-white/10 text-white/50 hover:text-white"}`}
                    >
                      Manager (Full Access)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMemberRole("viewer")}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold text-center transition ${newMemberRole === "viewer" ? "bg-sky-500/15 border-sky-500/40 text-sky-300" : "bg-[#18181c] border-white/10 text-white/50 hover:text-white"}`}
                    >
                      Viewer (Read-only)
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={addingMember || !newMemberUsername.trim()}
                  className="w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  style={btnBrand}
                >
                  {addingMember ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>Grant Operator Access</span>
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
              <div className="flex gap-2 pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const txToDispute = selectedTx;
                    setSelectedTx(null);
                    startDisputeFromTx(txToDispute);
                  }}
                  className="flex-1 min-w-[120px] py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <ShieldAlert size={14} />
                  <span>Dispute / Help</span>
                </button>
                {!accounts.some((a: any) => a.id === selectedTx.toAccountId) && (
                  <button
                    type="button"
                    onClick={() => {
                      const txToSplit = selectedTx;
                      setSelectedTx(null);
                      startSplitBill(txToSplit);
                    }}
                    className="flex-1 min-w-[110px] py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                  >
                    <Users size={14} />
                    <span>Split Bill</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTx(null)}
                  className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold transition"
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

      {/* New Support Ticket Modal */}
      <AnimatePresence>
        {newTicketModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-300">
                    <LifeBuoy size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Open Support Ticket</h3>
                    <p className="text-xs text-white/40">Reach our banking administrators & support desk</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNewTicketModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={submitSupportTicket} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Subject / Inquiry Title</label>
                  <input
                    name="subject"
                    required
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    placeholder="e.g. Question about card withdrawal fees"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-white/30 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Category</label>
                    <select
                      name="category"
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value)}
                      className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                    >
                      <option value="general">General Help</option>
                      <option value="account">Account Access</option>
                      <option value="card">Card / POS Issue</option>
                      <option value="loan">Financing Inquiry</option>
                      <option value="technical">Technical Bug</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Priority</label>
                    <select
                      name="priority"
                      value={ticketPriority}
                      onChange={(e) => setTicketPriority(e.target.value)}
                      className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Description & Details</label>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Please explain the issue or question in detail. Staff will reply promptly…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-white/30 resize-none font-sans text-white"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={ticketSubmitting}
                    className="flex-1 py-3 rounded-xl font-bold text-xs text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-50"
                    style={btnBrand}
                  >
                    {ticketSubmitting ? "Submitting Ticket…" : "Submit Support Ticket"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTicketModalOpen(false)}
                    className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dispute Transaction / Escrow Modal */}
      <AnimatePresence>
        {disputeModalOpen && disputeContext && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 rounded-2xl bg-rose-500/15 text-rose-300">
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {disputeContext.type === "escrow" ? "Escrow Dispute & Mediation" : "Transaction Dispute Claim"}
                    </h3>
                    <p className="text-xs text-white/40">Initiate formal investigation with bank staff</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setDisputeModalOpen(false); setDisputeTx(null); setDisputeEscrow(null); }}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Dispute Item Summary Card */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 font-medium">Disputed Item:</span>
                  <span className="font-mono text-emerald-400 font-bold text-sm">
                    {formatMoney(disputeContext.item?.amount || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-white/40">Reference:</span>
                  <span className="font-mono text-white/70">
                    {disputeContext.type === "escrow" ? `Escrow #${disputeContext.item?.id?.slice(0, 12)}` : `Tx #${disputeContext.item?.id?.slice(0, 12)}`}
                  </span>
                </div>
                {disputeContext.item?.description && (
                  <p className="text-white/70 text-[11px] border-t border-white/5 pt-1.5">{disputeContext.item.description}</p>
                )}
              </div>

              <form onSubmit={submitSupportTicket} className="space-y-4">
                <input type="hidden" name="category" value={disputeContext.type === "escrow" ? "escrow_dispute" : "dispute"} />
                {disputeContext.type === "transaction" && <input type="hidden" name="transactionId" value={disputeContext.item?.id} />}
                {disputeContext.type === "escrow" && <input type="hidden" name="escrowId" value={disputeContext.item?.id} />}

                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Dispute Reason / Claim Title</label>
                  <input
                    name="subject"
                    required
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-white/30 text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Priority</label>
                  <select
                    name="priority"
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value)}
                    className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#f4f4f5] [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                  >
                    <option value="urgent">Urgent (Immediate bank review requested)</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">Statement of Facts & Evidence</label>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    placeholder="Provide detailed facts regarding what occurred (e.g. non-delivery of items, double-charge, unfulfilled contract conditions, Discord trade proofs)…"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-white/30 resize-none font-sans text-white"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={ticketSubmitting}
                    className="flex-1 py-3 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-500 shadow-lg transition-all disabled:opacity-50"
                  >
                    {ticketSubmitting ? "Submitting Dispute Claim…" : "Open Formal Dispute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDisputeModalOpen(false); setDisputeTx(null); setDisputeEscrow(null); }}
                    className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Selected Ticket Thread Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-xl space-y-4 shadow-2xl max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between shrink-0 border-b border-white/5 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                      selectedTicket.status === "open"
                        ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                        : selectedTicket.status === "in_progress"
                        ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                        : selectedTicket.status === "resolved"
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                        : "bg-white/10 border-white/10 text-white/50"
                    }`}>
                      {selectedTicket.status.replace("_", " ")}
                    </span>
                    <span className="text-[11px] font-mono text-white/30">
                      Ticket #{selectedTicket.id.slice(0, 10)}
                    </span>
                  </div>
                  <h3 className="font-bold text-white text-base leading-snug">{selectedTicket.subject}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTicket.status !== "closed" && (
                    <button
                      type="button"
                      onClick={() => closeTicket(selectedTicket.id)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition"
                    >
                      Close Inquiry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(null)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Linked transaction / escrow badge */}
              {(selectedTicket.transactionId || selectedTicket.escrowId) && (
                <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/70 flex items-center gap-2 shrink-0">
                  {selectedTicket.transactionId && (
                    <span className="font-mono text-[11px] text-rose-300 flex items-center gap-1">
                      <ShieldAlert size={13} /> Linked Transaction: {selectedTicket.transactionId}
                    </span>
                  )}
                  {selectedTicket.escrowId && (
                    <span className="font-mono text-[11px] text-emerald-300 flex items-center gap-1">
                      <ShieldCheck size={13} /> Linked Escrow: {selectedTicket.escrowId}
                    </span>
                  )}
                </div>
              )}

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[160px] max-h-[320px]">
                {Array.isArray(selectedTicket.messages) && selectedTicket.messages.length > 0 ? (
                  selectedTicket.messages.map((m: any) => {
                    const isStaff = m.senderRole === "bank_staff" || m.senderRole === "admin";
                    return (
                      <div
                        key={m.id}
                        className={`p-3.5 rounded-2xl space-y-1.5 text-xs ${
                          isStaff
                            ? "bg-amber-500/10 border border-amber-500/20 text-white ml-4"
                            : "bg-white/5 border border-white/5 text-white/90 mr-4"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <strong className="text-white font-semibold">{m.senderName || "User"}</strong>
                            {isStaff && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[9px] uppercase font-bold">
                                Staff
                              </span>
                            )}
                          </div>
                          <span className="text-white/30 text-[10px]">
                            {m.createdAt ? format(new Date(m.createdAt), "MMM d, h:mm a") : ""}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-white/80 leading-relaxed font-sans">{m.message}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-white/40 italic text-center py-4">No messages recorded in this inquiry yet.</p>
                )}
              </div>

              {/* Reply Input Form */}
              {selectedTicket.status !== "closed" ? (
                <form onSubmit={submitTicketReply} className="shrink-0 space-y-2 pt-2 border-t border-white/5">
                  <div className="flex gap-2">
                    <input
                      name="message"
                      required
                      placeholder="Type a response to the bank staff…"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-white/30 text-white"
                    />
                    <button
                      disabled={replySubmitting}
                      className="px-4 py-2.5 rounded-xl font-bold text-xs text-white shadow transition-all hover:opacity-95 disabled:opacity-50 shrink-0"
                      style={btnBrand}
                    >
                      {replySubmitting ? "Sending…" : "Reply"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center text-xs text-white/40 shrink-0">
                  This support ticket has been closed. You may open a new ticket if further assistance is needed.
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notifications Drawer / Flyout */}
      <AnimatePresence>
        {notificationsOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-[#121218] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-4 shadow-2xl max-h-[85vh] flex flex-col"
            >
              <div className="flex items-center justify-between shrink-0 border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <BellRing size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Account Notifications</h3>
                    <p className="text-[11px] text-white/40">Deposit alerts, balance notices & status messages</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {(userData?.notifications || []).some((n: any) => !n.isRead) && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {(userData?.notifications || []).length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Bell size={28} className="mx-auto text-white/20" />
                    <p className="text-xs text-white/40">You're all caught up! No notifications.</p>
                  </div>
                ) : (
                  (userData?.notifications || []).map((notif: any) => {
                    const isMinBalance = notif.type === "min_balance_deficit" || notif.title?.toLowerCase().includes("minimum balance");
                    const parsedData = notif.data ? (typeof notif.data === "string" ? JSON.parse(notif.data) : notif.data) : null;
                    const depCmd = parsedData?.depositCommand;

                    return (
                      <div
                        key={notif.id}
                        className={`rounded-2xl border p-4 transition space-y-2.5 ${
                          !notif.isRead
                            ? isMinBalance
                              ? "bg-amber-500/[0.08] border-amber-500/30"
                              : "bg-indigo-500/[0.08] border-indigo-500/30"
                            : "bg-white/[0.02] border-white/5 opacity-70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {isMinBalance ? (
                              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                            ) : (
                              <Info size={15} className="text-indigo-400 shrink-0" />
                            )}
                            <h4 className="text-xs font-bold text-white">{notif.title}</h4>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-white/30 font-mono">
                              {notif.createdAt ? format(new Date(notif.createdAt), "MMM d, h:mm a") : ""}
                            </span>
                            {!notif.isRead && (
                              <button
                                onClick={() => markNotificationAsRead(notif.id)}
                                title="Mark as read"
                                className="text-white/40 hover:text-white p-1"
                              >
                                <Check size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed">
                          {notif.message}
                        </p>

                        {depCmd && (
                          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-2 font-mono text-xs">
                            <span className="text-amber-300 truncate select-all">{depCmd}</span>
                            <button
                              onClick={() => copy(depCmd, `notif_${notif.id}`)}
                              className="shrink-0 flex items-center gap-1 text-[10px] font-sans font-bold text-black bg-amber-400 hover:bg-amber-300 px-2 py-1 rounded transition"
                            >
                              {copied === `notif_${notif.id}` ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copied === `notif_${notif.id}` ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-white/5 text-center">
                <button
                  onClick={() => setNotificationsOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Celebratory New Account Deposit Guidance Modal */}
      <AnimatePresence>
        {newAccountModalData && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121218] border border-white/15 rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-5 shadow-2xl text-center relative overflow-hidden"
            >
              {/* Decorative accent */}
              <div
                className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-32 blur-3xl opacity-30 rounded-full"
                style={{ background: brand }}
              />

              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-indigo-500/20 border border-white/10 mx-auto flex items-center justify-center text-emerald-400">
                <Sparkles size={28} />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-mono">
                  Account Created Successfully
                </span>
                <h3 className="text-xl font-black text-white mt-2">Welcome to {bank?.name || "the Bank"}</h3>
                <p className="text-xs text-white/60 max-w-sm mx-auto">
                  Your new <strong className="text-white">{newAccountModalData.tierName}</strong> account (<strong className="text-indigo-300 font-mono">{newAccountModalData.accountName}</strong>) is ready.
                </p>
              </div>

              {/* Deposit Instructions Card */}
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 text-left space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 font-medium">Minimum Required Balance</span>
                  <span className="font-bold text-amber-300 font-mono">
                    {newAccountModalData.minBalance && newAccountModalData.minBalance > 0 ? formatMoney(newAccountModalData.minBalance) : "None"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal size={13} className="text-emerald-400" />
                    <span>How to Deposit In-Game:</span>
                  </span>
                  <p className="text-xs text-white/50">Run the command below directly inside Minecraft chat to deposit funds from your wallet:</p>
                </div>

                <div className="p-3 bg-black/60 border border-white/10 rounded-xl space-y-2">
                  <div className="flex items-center justify-between gap-2 overflow-x-auto font-mono text-xs text-amber-300 font-bold">
                    <span className="truncate select-all">{newAccountModalData.command}</span>
                    <button
                      onClick={() => copy(newAccountModalData.command, "new_acc_dep_cmd")}
                      className="shrink-0 flex items-center gap-1 font-sans text-[11px] font-bold text-black bg-amber-400 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition shadow"
                    >
                      {copied === "new_acc_dep_cmd" ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied === "new_acc_dep_cmd" ? "Copied!" : "Copy Command"}</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-white/40 space-y-1 pt-1 border-t border-white/5">
                  <p>1. Open chat in-game (press <kbd className="bg-white/10 px-1 py-0.5 rounded text-[10px]">T</kbd>).</p>
                  <p>2. Paste and run the command above with the amount you wish to deposit.</p>
                  <p>3. Your live balance will instantly update in this portal and Discord bot!</p>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => {
                    setNewAccountModalData(null);
                    setView("home");
                  }}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white shadow-xl transition-all hover:opacity-95"
                  style={btnBrand}
                >
                  Go to Dashboard
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
