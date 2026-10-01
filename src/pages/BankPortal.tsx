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
  ShieldAlert, ExternalLink, Bell, BellRing, Info, Terminal, ArrowRight, ChevronDown, CheckCircle,
  Layers, Zap, Key, Store, Globe, RefreshCw, ShoppingBag, Filter, QrCode,
  Sliders, DollarSign, Shield, ArrowUpDown, Activity, Ban, Tag, ArrowLeftRight, Percent, Bot
} from "lucide-react";
import { accentForeground, hexOr, withAlpha } from "../lib/theme";
import { BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";
import { formatLoanRate, getEquivalentApr, calculateLoanBreakdown, convertTermToDays } from "../lib/loan_utils";

type View = "home" | "send" | "activity" | "borrow" | "cards" | "bills" | "apply" | "escrow" | "support" | "onyx";

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
  // Interactive Loan Application Customization States
  const [loanAmount, setLoanAmount] = useState<number>(1000);
  const [loanDepositAmount, setLoanDepositAmount] = useState<number>(0);
  const [loanTermDuration, setLoanTermDuration] = useState<number>(12);
  const [loanTermUnit, setLoanTermUnit] = useState<"months" | "weeks" | "days">("months");
  const [loanRepaymentFreq, setLoanRepaymentFreq] = useState<"monthly" | "biweekly" | "weekly">("monthly");
  const [loanPledgeCollateral, setLoanPledgeCollateral] = useState<boolean>(false);
  const [loanCollateralType, setLoanCollateralType] = useState<string>("property");
  const [loanCollateralDesc, setLoanCollateralDesc] = useState<string>("");
  const [loanCollateralVal, setLoanCollateralVal] = useState<string>("");
  const [loanPurposeCategory, setLoanPurposeCategory] = useState<string>("business");
  const [loanPurposeDetails, setLoanPurposeDetails] = useState<string>("");
  const [loanDisbursementAccountId, setLoanDisbursementAccountId] = useState<string>("");
  const [cardProducts, setCardProducts] = useState<any[]>([]);
  const [selectedCardProductId, setSelectedCardProductId] = useState<string>("");
  const [bondProducts, setBondProducts] = useState<any[]>([]);
  const [accountTiers, setAccountTiers] = useState<any[]>([]);
  const [selectedTierId, setSelectedTierId] = useState("");
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [accountNameChoice, setAccountNameChoice] = useState("");
  const [namingPref, setNamingPref] = useState<"custom" | "mc" | "discord">("mc");
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

  // Account Focus & Header Switcher State
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  // Onyx Hub State
  const [onyxSubTab, setOnyxSubTab] = useState<"overview" | "merchants" | "subscriptions" | "paylinks">("overview");
  const [onyxStats, setOnyxStats] = useState<any>(null);
  const [myMerchants, setMyMerchants] = useState<any[]>([]);
  const [loadingOnyx, setLoadingOnyx] = useState(false);
  const [registerMerchantOpen, setRegisterMerchantOpen] = useState(false);
  const [newMerchantName, setNewMerchantName] = useState("");
  const [newMerchantAccountId, setNewMerchantAccountId] = useState("");
  const [registeringMerchant, setRegisteringMerchant] = useState(false);
  const [newMerchantSuccess, setNewMerchantSuccess] = useState<any | null>(null);
  const [managingProductsMerchant, setManagingProductsMerchant] = useState<any | null>(null);
  const [merchantProductsList, setMerchantProductsList] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductPriceType, setNewProductPriceType] = useState<"fixed" | "custom_customer">("fixed");
  const [newProductDesc, setNewProductDesc] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [managingWebhookMerchant, setManagingWebhookMerchant] = useState<any | null>(null);
  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [quickPayLinkMerchantId, setQuickPayLinkMerchantId] = useState("");
  const [quickPayLinkAmount, setQuickPayLinkAmount] = useState("");
  const [quickPayLinkMemo, setQuickPayLinkMemo] = useState("");
  const [rolledKeyModal, setRolledKeyModal] = useState<{ merchantName: string; apiKey: string } | null>(null);
  const [botInviteModalOpen, setBotInviteModalOpen] = useState(false);

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

  const loadOnyxData = async () => {
    setLoadingOnyx(true);
    try {
      const [statsRes, meRes] = await Promise.all([
        fetch("/api/onyx/public-stats"),
        fetch("/api/onyx/me"),
      ]);
      if (statsRes.ok) {
        const stats = await statsRes.json();
        setOnyxStats(stats);
      }
      if (meRes.ok) {
        const me = await meRes.json();
        setMyMerchants(Array.isArray(me) ? me : []);
      }
    } catch (err) {
      console.error("Failed to load Onyx data", err);
    }
    setLoadingOnyx(false);
  };

  useEffect(() => {
    if (view === "onyx") {
      loadOnyxData();
    }
  }, [view]);

  useEffect(() => {
    if (user && bank) {
      handleSearch();
      loadOnyxData();
    }
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
    accountTiers.length > 0 ? accountTiers : []
  ).filter((t: any) => !t.isPrivate);

  const availableCatalogTabs = useMemo(() => {
    const tabs: { id: "account" | "loan" | "card" | "bond" | "escrow"; label: string; icon: any; count?: number }[] = [];
    if (availableTiers.length > 0) {
      tabs.push({ id: "account", label: "Deposit Account", icon: Wallet, count: availableTiers.length });
    }
    if (settings?.enableLoans !== false && loanProducts.length > 0) {
      tabs.push({ id: "loan", label: "Loans & Credit", icon: Landmark, count: loanProducts.length });
    }
    if (settings?.enableCards !== false && cardProducts.length > 0) {
      tabs.push({ id: "card", label: "Payment Cards", icon: CreditCard, count: cardProducts.length });
    }
    if (settings?.enableVaults !== false && bondProducts.length > 0) {
      tabs.push({ id: "bond", label: "Time Vaults", icon: PiggyBank, count: bondProducts.length });
    }
    if (settings?.enableEscrow === true) {
      tabs.push({ id: "escrow", label: "Escrow Hold", icon: ShieldCheck });
    }
    return tabs;
  }, [availableTiers.length, settings?.enableLoans, loanProducts.length, settings?.enableCards, cardProducts.length, settings?.enableVaults, bondProducts.length, settings?.enableEscrow]);

  useEffect(() => {
    if (availableCatalogTabs.length > 0) {
      if (!availableCatalogTabs.some(t => t.id === applyTab)) {
        setApplyTab(availableCatalogTabs[0].id);
      }
    }
  }, [availableCatalogTabs, applyTab]);

  useEffect(() => {
    if (loanProducts && loanProducts.length > 0) {
      const activeP = loanProducts.find((p: any) => p.id === selectedLoanProductId) || loanProducts[0];
      if (activeP) {
        if (!selectedLoanProductId) {
          setSelectedLoanProductId(activeP.id);
        }
        const minDol = activeP.minAmount ? activeP.minAmount / 100 : 100;
        const maxDol = activeP.maxAmount ? activeP.maxAmount / 100 : 10000;
        setLoanAmount((prev) => {
          if (!prev || prev < minDol) return minDol;
          if (prev > maxDol) return maxDol;
          return prev;
        });
        if (activeP.termDays) {
          if (activeP.termDays <= 28 && activeP.termDays % 7 === 0) {
            setLoanTermUnit("weeks");
            setLoanTermDuration(activeP.termDays / 7);
            setLoanRepaymentFreq("weekly");
          } else if (activeP.termDays % 30 === 0) {
            setLoanTermUnit("months");
            setLoanTermDuration(Math.max(1, Math.round(activeP.termDays / 30)));
            setLoanRepaymentFreq("monthly");
          } else {
            setLoanTermUnit("days");
            setLoanTermDuration(activeP.termDays);
          }
        }
        if (activeP.collateralRequired) {
          setLoanPledgeCollateral(true);
        }
      }
    }
  }, [selectedLoanProductId, loanProducts]);
  const netWorth = accounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  const activeAccount = selectedAccountId !== "all" ? accounts.find((a: any) => a.id === selectedAccountId) : null;
  const loans = userData?.loans || [];
  const activeLoans = loans.filter((l: any) => ["active", "delinquent", "defaulted", "pending", "awaiting_signature"].includes(l.status));
  const closedLoans = loans.filter((l: any) => ["paid_off", "rejected", "closed"].includes(l.status));
  const invoices = (userData?.pendingInvoices || []).filter((i: any) => i.status !== "paid");
  const subscriptions = userData?.subscriptions || [];
  const cards = userData?.cards || [];
  const tx = userData?.recentTx || [];

  // Account-filtered slices for granular inspection
  const displayedTx = useMemo(() => {
    if (selectedAccountId === "all") return tx;
    return tx.filter((t: any) => t.fromAccountId === selectedAccountId || t.toAccountId === selectedAccountId);
  }, [tx, selectedAccountId]);

  const displayedActiveLoans = useMemo(() => {
    if (selectedAccountId === "all") return activeLoans;
    return activeLoans.filter((l: any) => l.accountId === selectedAccountId);
  }, [activeLoans, selectedAccountId]);

  const displayedInvoices = useMemo(() => {
    if (selectedAccountId === "all") return invoices;
    return invoices.filter((i: any) => i.customerAccountId === selectedAccountId || i.billerAccountId === selectedAccountId);
  }, [invoices, selectedAccountId]);

  const displayedCards = useMemo(() => {
    if (selectedAccountId === "all") return cards;
    return cards.filter((c: any) => c.accountId === selectedAccountId);
  }, [cards, selectedAccountId]);

  const displayedSubscriptions = useMemo(() => {
    if (selectedAccountId === "all") return subscriptions;
    return subscriptions.filter((s: any) => s.customerAccountId === selectedAccountId || s.billerAccountId === selectedAccountId);
  }, [subscriptions, selectedAccountId]);

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
    const prodId = selectedLoanProductId || loanProducts[0]?.id;
    if (!prodId) {
      flash("Please select an active loan product from the catalog.");
      return;
    }
    const chosenProduct = loanProducts.find((p: any) => p.id === prodId) || loanProducts[0];
    const targetAccountId = loanDisbursementAccountId || accounts[0]?.id;
    if (!targetAccountId) {
      flash("Please select a deposit account for disbursement.");
      return;
    }

    const minDol = chosenProduct?.minAmount ? chosenProduct.minAmount / 100 : 10;
    const maxDol = chosenProduct?.maxAmount ? chosenProduct.maxAmount / 100 : 50000;
    if (loanAmount < minDol) {
      flash(`Loan amount cannot be less than $${minDol.toLocaleString()}`);
      return;
    }
    if (loanAmount > maxDol) {
      flash(`Loan amount cannot exceed $${maxDol.toLocaleString()}`);
      return;
    }
    if (loanDepositAmount >= loanAmount) {
      flash("Upfront deposit cannot equal or exceed the total loan amount.");
      return;
    }

    if (chosenProduct?.collateralRequired && (!loanCollateralDesc || !loanCollateralDesc.trim())) {
      flash("This loan product requires collateral asset description.");
      return;
    }

    const calculatedMonths = loanTermUnit === "weeks" 
      ? Math.max(1, Math.round((loanTermDuration * 7) / 30))
      : loanTermUnit === "days"
      ? Math.max(1, Math.round(loanTermDuration / 30))
      : Math.max(1, loanTermDuration);

    const compiledPurpose = [
      loanPurposeCategory ? `[${loanPurposeCategory.toUpperCase()}]` : "",
      loanPurposeDetails.trim() || "Financing application"
    ].filter(Boolean).join(" ");

    setActionPending(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/request-loan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: targetAccountId,
          amount: loanAmount,
          depositAmount: loanDepositAmount > 0 ? loanDepositAmount : 0,
          termDuration: loanTermDuration,
          termUnit: loanTermUnit,
          termMonths: calculatedMonths,
          purpose: compiledPurpose,
          productId: prodId,
          collateralDescription: loanPledgeCollateral ? loanCollateralDesc.trim() : undefined,
          collateralValue: loanPledgeCollateral && loanCollateralVal ? parseFloat(loanCollateralVal) : undefined,
          collateralType: loanPledgeCollateral ? loanCollateralType : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Application failed");
      else {
        flash(d.autoApprove ? "Approved — funds are in your account." : d.awaitingSignature ? "Sign the contract to receive funds." : "Application submitted for review.");
        setView("home");
        handleSearch();
      }
    } catch {
      flash("Could not submit loan application");
    }
    setActionPending(false);
  };

  const openAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const chosenTierId = (fd.get("tierId") as string) || selectedTierId;
    const chosenTier = availableTiers.find((t: any) => t.id === chosenTierId);

    if (chosenTier && typeof chosenTier.maxAccountsPerUser === "number" && chosenTier.maxAccountsPerUser > 0) {
      const held = accounts.filter((a: any) => a.tierId === chosenTier.id).length;
      if (held >= chosenTier.maxAccountsPerUser) {
        flash(`Holding limit reached: You already have ${held} account(s) of tier '${chosenTier.name}' (limit: ${chosenTier.maxAccountsPerUser}).`);
        return;
      }
    }

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

  const handleRegisterMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMerchantName.trim() || !newMerchantAccountId) {
      flash("Please provide a shop name and select a settlement bank account.");
      return;
    }
    setRegisteringMerchant(true);
    try {
      const res = await fetch("/api/onyx/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMerchantName.trim(),
          destinationAccountId: newMerchantAccountId,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        flash(`Storefront "${d.name}" registered with Onyx PSP!`);
        setNewMerchantSuccess(d);
        setNewMerchantName("");
        setRegisterMerchantOpen(false);
        loadOnyxData();
      } else {
        flash(d.error || "Failed to register merchant");
      }
    } catch {
      flash("Error registering storefront");
    }
    setRegisteringMerchant(false);
  };

  const handleRollMerchantKey = async (merchantId: string) => {
    if (!confirm("Are you sure you want to roll this API key? Existing integrations will stop working until updated with the new key.")) return;
    try {
      const res = await fetch(`/api/onyx/me/${merchantId}/roll-key`, { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setRolledKeyModal({ merchantName: "Store", apiKey: d.apiKey });
        flash("New API key generated successfully.");
        loadOnyxData();
      } else {
        flash(d.error || "Failed to roll API key");
      }
    } catch {
      flash("Error rolling API key");
    }
  };

  const openManageProducts = async (merchant: any) => {
    setManagingProductsMerchant(merchant);
    setLoadingProducts(true);
    setMerchantProductsList([]);
    try {
      const res = await fetch(`/api/onyx/me/${merchant.id}/products`);
      if (res.ok) {
        setMerchantProductsList(await res.json());
      }
    } catch {}
    setLoadingProducts(false);
  };

  const handleAddMerchantProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingProductsMerchant || !newProductName.trim()) return;
    setAddingProduct(true);
    try {
      const res = await fetch(`/api/onyx/me/${managingProductsMerchant.id}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProductName.trim(),
          priceType: newProductPriceType,
          price: newProductPrice,
          description: newProductDesc.trim(),
        }),
      });
      const d = await res.json();
      if (res.ok) {
        flash(`Product "${d.name}" published!`);
        setNewProductName("");
        setNewProductPrice("");
        setNewProductDesc("");
        const refreshed = await fetch(`/api/onyx/me/${managingProductsMerchant.id}/products`).then(r => r.json());
        if (Array.isArray(refreshed)) setMerchantProductsList(refreshed);
        loadOnyxData();
      } else {
        flash(d.error || "Failed to add product");
      }
    } catch {
      flash("Error adding product");
    }
    setAddingProduct(false);
  };

  const handleDeleteMerchantProduct = async (productId: string) => {
    if (!managingProductsMerchant) return;
    try {
      const res = await fetch(`/api/onyx/me/${managingProductsMerchant.id}/products/${productId}`, { method: "DELETE" });
      if (res.ok) {
        flash("Product deleted.");
        setMerchantProductsList(prev => prev.filter(p => p.id !== productId));
        loadOnyxData();
      } else {
        flash("Failed to delete product");
      }
    } catch {
      flash("Error deleting product");
    }
  };

  const openWebhookSetup = (merchant: any) => {
    setManagingWebhookMerchant(merchant);
    setWebhookUrlInput(merchant.webhookUrlMasked || "");
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingWebhookMerchant) return;
    setSavingWebhook(true);
    try {
      const res = await fetch(`/api/onyx/me/${managingWebhookMerchant.id}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrlInput.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        flash(d.message || "Discord webhook saved!");
        setManagingWebhookMerchant(null);
        loadOnyxData();
      } else {
        flash(d.error || "Failed to update webhook");
      }
    } catch {
      flash("Error saving webhook");
    }
    setSavingWebhook(false);
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
    { id: "onyx" as View, label: "Onyx", icon: Zap },
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

          {/* Center: Account Switcher Picker */}
          {accounts.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountPickerOpen(!accountPickerOpen)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition max-w-[150px] sm:max-w-[260px] truncate"
                style={{
                  borderColor: selectedAccountId !== "all" ? withAlpha(brand, 0.5) : "var(--border)",
                  background: selectedAccountId !== "all" ? withAlpha(brand, 0.12) : "color-mix(in oklab, var(--fg) 4%, transparent)",
                  color: selectedAccountId !== "all" ? "#fff" : "var(--fg-muted)"
                }}
                title="Switch active account"
              >
                {selectedAccountId !== "all" && activeAccount?.accountType?.includes("business") ? (
                  <Building2 size={13} className="text-amber-400 shrink-0" />
                ) : selectedAccountId !== "all" ? (
                  <Wallet size={13} className="shrink-0" style={{ color: brand }} />
                ) : (
                  <Layers size={13} className="text-white/60 shrink-0" />
                )}
                <span className="truncate">
                  {selectedAccountId === "all" ? "All Accounts" : activeAccount?.accountName || "Account"}
                </span>
                <span className="hidden md:inline font-mono opacity-80 text-[11px] tabular-nums">
                  {formatMoney(selectedAccountId === "all" ? netWorth : activeAccount?.balance || 0)}
                </span>
                <ChevronDown size={12} className={`transition-transform shrink-0 ${accountPickerOpen ? "rotate-180" : ""}`} />
              </button>

              {accountPickerOpen && (
                <>
                  <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" onClick={() => setAccountPickerOpen(false)} />
                  <div
                    className="fixed inset-x-3 top-16 sm:inset-auto sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:top-full sm:mt-2 w-auto sm:w-[360px] max-w-[400px] mx-auto rounded-3xl border border-white/15 shadow-2xl p-3.5 z-50 space-y-1.5 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] overflow-y-auto"
                    style={{ background: "rgba(18, 18, 26, 0.98)" }}
                  >
                    <div className="px-2 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/40">
                      <span>Select Account</span>
                      <span>{accounts.length} total</span>
                    </div>

                    {/* All Accounts Option */}
                    <button
                      type="button"
                      onClick={() => { setSelectedAccountId("all"); setAccountPickerOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-2xl flex items-center justify-between text-xs transition ${
                        selectedAccountId === "all" ? "bg-white/10 text-white font-bold" : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/70 shrink-0">
                          <Layers size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold leading-tight truncate">All Accounts</p>
                          <p className="text-[10px] text-white/40">Consolidated overview</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-bold tabular-nums">{formatMoney(netWorth)}</p>
                        {selectedAccountId === "all" && <Check size={12} className="text-emerald-400 ml-auto" />}
                      </div>
                    </button>

                    <div className="my-1 border-t border-white/5" />

                    {/* Individual Account Options */}
                    <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5">
                      {accounts.map((acc: any) => {
                        const isCorp = acc.accountType?.includes("business") || acc.accountType?.includes("corp");
                        const isSelected = selectedAccountId === acc.id;
                        return (
                          <div
                            key={acc.id}
                            className={`group rounded-2xl p-2.5 flex items-center justify-between transition ${
                              isSelected ? "bg-white/10 text-white font-bold" : "text-white/70 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => { setSelectedAccountId(acc.id); setAccountPickerOpen(false); }}
                              className="flex-1 min-w-0 text-left flex items-center gap-2.5 mr-2"
                            >
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                isCorp ? "bg-amber-500/15 text-amber-300 border border-amber-500/25" : "bg-white/5 text-white/70"
                              }`}>
                                {isCorp ? <Building2 size={14} /> : <Wallet size={14} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="truncate text-xs font-semibold">{acc.accountName}</span>
                                  {isCorp && (
                                    <span className="shrink-0 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                      Corp
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-white/40 truncate block">
                                  {acc.id.slice(0, 10)}… · {acc.accountType?.replace('_', ' ') || 'personal'}
                                </span>
                              </div>
                            </button>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-xs font-bold tabular-nums">
                                {formatMoney(acc.balance)}
                              </span>
                              {isCorp && (
                                <button
                                  type="button"
                                  title="Manage Operators & Team"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAccountPickerOpen(false);
                                    openManageMembers(acc);
                                  }}
                                  className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition"
                                >
                                  <Users size={13} />
                                </button>
                              )}
                              {isSelected && <Check size={13} className="text-emerald-400" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

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
            <div
              className="rounded-[32px] p-6 sm:p-8 relative overflow-hidden border shadow-2xl"
              style={{
                background: `linear-gradient(145deg, ${withAlpha(brand, 0.22)} 0%, rgba(18, 18, 28, 0.96) 50%, var(--bg-elevated) 100%)`,
                borderColor: withAlpha(brand, 0.35)
              }}
            >
              {/* Greeting & Top Status Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <p className="text-xs sm:text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                    {greet()}, <strong className="text-white font-semibold tracking-tight">{displayName}</strong>
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView("onyx")}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 transition-colors shadow-sm cursor-pointer"
                  >
                    <Zap size={12} className="text-amber-400 fill-amber-400" />
                    <span>Onyx PSP Network</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </button>
                  <span className="text-[10px] sm:text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full border bg-white/5 text-white/70" style={{ borderColor: "var(--border)" }}>
                    {accounts.length} Account{accounts.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {/* Balance Readout & Liquidity Summary */}
              <div className="mt-5 sm:mt-7 relative z-10">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-bold text-white/50">
                  <span>Available Liquidity</span>
                  {selectedAccountId !== "all" && activeAccount ? (
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-white font-mono text-[10px] flex items-center gap-1">
                      <Wallet size={10} style={{ color: brand }} />
                      <span>{activeAccount.accountName}</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-white/10 text-emerald-300 font-mono text-[10px]">
                      Consolidated Portfolio
                    </span>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mt-1.5">
                  <p className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight tabular-nums text-white" style={{ letterSpacing: "-0.035em" }}>
                    {formatMoney(selectedAccountId === "all" ? netWorth : activeAccount?.balance || 0)}
                  </p>
                  
                  {/* Quick in-hero micro telemetry */}
                  <div className="flex items-center gap-3 text-xs font-mono text-white/50">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-emerald-400" /> CityCorp Verified
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <Activity size={13} className="text-indigo-400" /> Real-Time Settlement
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Action Navigation Grid Featuring Onyx PSP */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3 mt-7 sm:mt-8 relative z-10">
                {[
                  { id: "send" as View, label: "Send & Pay", icon: Send, color: "text-indigo-400 group-hover:text-indigo-300", bg: "group-hover:bg-indigo-500/15" },
                  { id: "bills" as View, label: "Invoices", icon: Receipt, color: "text-blue-400 group-hover:text-blue-300", bg: "group-hover:bg-blue-500/15" },
                  { id: "borrow" as View, label: "Financing", icon: Landmark, color: "text-emerald-400 group-hover:text-emerald-300", bg: "group-hover:bg-emerald-500/15" },
                  { id: "onyx" as View, label: "Onyx PSP", icon: Zap, color: "text-amber-400 group-hover:text-amber-300", bg: "group-hover:bg-amber-500/15", badge: "PSP" },
                  ...(settings?.enableEscrow !== false ? [{ id: "escrow" as View, label: "Escrow", icon: ShieldCheck, color: "text-teal-400 group-hover:text-teal-300", bg: "group-hover:bg-teal-500/15" }] : []),
                  { id: "apply" as View, label: "Open / Apply", icon: Plus, color: "text-pink-400 group-hover:text-pink-300", bg: "group-hover:bg-pink-500/15" },
                ].map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      if (a.id === "send") setTransferSuccess(null);
                      setView(a.id);
                    }}
                    className={`group relative flex flex-col items-center justify-center gap-2 py-3.5 px-2 rounded-2xl border transition-all duration-150 cursor-pointer ${
                      view === a.id
                        ? "bg-white/20 border-white/50 text-white shadow-lg"
                        : "bg-black/40 hover:bg-white/10 text-white/80 hover:text-white border-white/10 hover:border-white/25 active:scale-95"
                    }`}
                  >
                    {a.badge && (
                      <span className="absolute -top-2 -right-1.5 text-[9px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-400 text-black shadow-sm uppercase tracking-wider">
                        {a.badge}
                      </span>
                    )}
                    <div className={`p-2.5 rounded-xl bg-white/5 transition-colors duration-150 ${a.bg} ${a.color}`}>
                      <a.icon size={19} className={a.id === "onyx" ? "fill-current" : ""} />
                    </div>
                    <span className="text-xs font-semibold tracking-tight text-center">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>

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

            {/* Focused Account Details Bar */}
            {selectedAccountId !== "all" && activeAccount && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[24px] border p-5 space-y-3.5 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(brand, 0.2)} 0%, rgba(18, 18, 26, 0.9) 100%)`,
                  borderColor: withAlpha(brand, 0.45)
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      activeAccount.accountType?.includes("business") ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-white/10 text-white"
                    }`}>
                      {activeAccount.accountType?.includes("business") ? <Building2 size={22} /> : <Wallet size={22} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Viewing Account Specifics</span>
                        {activeAccount.accountType?.includes("business") && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Corporate Account
                          </span>
                        )}
                        {activeAccount.tierId && (
                          <span className="text-[10px] font-mono text-white/60">
                            {availableTiers.find((t: any) => t.id === activeAccount.tierId)?.name || activeAccount.tierId}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black text-white">{activeAccount.accountName}</h3>
                      <p className="text-xs font-mono text-white/40 flex items-center gap-1.5 mt-0.5">
                        <span>{activeAccount.id}</span>
                        <button
                          type="button"
                          onClick={() => copy(activeAccount.id, "active_acc_id")}
                          className="hover:text-white transition"
                          title="Copy account ID"
                        >
                          {copied === "active_acc_id" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        </button>
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-center">
                    <span className="text-[11px] uppercase tracking-wider text-white/40 sm:hidden">Available Balance</span>
                    <div className="text-3xl font-black tabular-nums text-white">
                      {formatMoney(activeAccount.balance)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setSendFrom(activeAccount.id);
                      setTransferSuccess(null);
                      setView("send");
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-white transition shadow-sm"
                    style={btnBrand}
                  >
                    <Send size={13} />
                    <span>Send from Here</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openManageMembers(activeAccount)}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white transition"
                  >
                    <Users size={13} className="text-amber-400" />
                    <span>Manage Operators & Team</span>
                  </button>

                  {activeAccount.depositCommand && (
                    <button
                      type="button"
                      onClick={() => copy(activeAccount.depositCommand, "focused_dep_cmd")}
                      className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition"
                    >
                      {copied === "focused_dep_cmd" ? <Check size={12} className="text-emerald-400" /> : <Terminal size={12} />}
                      <span>{copied === "focused_dep_cmd" ? "Copied Command!" : "Copy Deposit Command"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedAccountId("all")}
                    className="ml-auto flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white px-2.5 py-1 rounded-lg hover:bg-white/5 transition"
                  >
                    <X size={13} />
                    <span>View All Accounts</span>
                  </button>
                </div>
              </motion.div>
            )}

            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">Accounts</h2>
                  <span className="text-[11px] text-white/40">· Click an account to isolate transactions & details</span>
                </div>
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
                  {accounts.map((acc: any) => {
                    const isSelected = selectedAccountId === acc.id;
                    const isCorp = acc.accountType?.includes("business") || acc.accountType?.includes("corp");
                    return (
                      <div
                        key={acc.id}
                        onClick={() => setSelectedAccountId(isSelected ? "all" : acc.id)}
                        className={`rounded-2xl border p-5 cursor-pointer transition-all group relative ${
                          isSelected
                            ? "bg-white/[0.07] border-white/40 ring-1 ring-white/30 shadow-lg"
                            : "bg-white/[0.03] border-white/10 hover:border-white/25 hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] uppercase tracking-wider text-white/40 truncate">
                                {acc.tierId && availableTiers.find((t: any) => t.id === acc.tierId)
                                  ? `${availableTiers.find((t: any) => t.id === acc.tierId).name} · ${acc.accountType?.replace('_', ' ') || 'personal'}`
                                  : (acc.accountType?.replace('_', ' ') || "personal")}
                              </p>
                              {isCorp && (
                                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 shrink-0">
                                  Corp
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-base mt-0.5 text-white truncate">{acc.accountName}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSelected && (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Check size={10} /> Active Filter
                              </span>
                            )}
                            {acc.isFrozen && <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full">Frozen</span>}
                          </div>
                        </div>

                        <p className="text-2xl font-black tabular-nums mt-4 text-white">{formatMoney(acc.balance)}</p>

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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copy(acc.depositCommand, `dep_${acc.id}`);
                                }}
                                className="w-full flex items-center justify-center gap-1.5 font-mono text-[10px] font-bold text-black bg-amber-400 hover:bg-amber-300 py-1.5 px-2 rounded-lg transition"
                              >
                                {copied === `dep_${acc.id}` ? <Check size={11} /> : <Terminal size={11} />}
                                <span>{copied === `dep_${acc.id}` ? "Copied Command to Clipboard!" : "Copy Deposit Command"}</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(acc.id, acc.id);
                            }}
                            className="text-[11px] font-mono text-white/30 hover:text-white flex items-center gap-1 transition"
                            title="Copy full account ID"
                          >
                            {copied === acc.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            {acc.id.slice(0, 12)}…
                          </button>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSendFrom(acc.id);
                                setTransferSuccess(null);
                                setView("send");
                              }}
                              className="flex items-center gap-1 text-[11px] font-semibold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-lg border border-white/10 transition"
                              title="Send transfer from this account"
                            >
                              <Send size={11} />
                              <span className="hidden sm:inline">Send</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openManageMembers(acc);
                              }}
                              className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition ${
                                isCorp
                                  ? "text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30"
                                  : "text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border-white/10"
                              }`}
                              title="Manage authorized team operators"
                            >
                              <Users size={11} />
                              <span>{isCorp ? "Corp Team" : "Operators"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {displayedActiveLoans.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">
                      {selectedAccountId !== "all" && activeAccount ? `Active Loans · ${activeAccount.accountName}` : "Active Loans"}
                    </h2>
                    {selectedAccountId !== "all" && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                        Filtered
                      </span>
                    )}
                  </div>
                  <button onClick={() => setView("borrow")} className="text-xs font-bold text-white/50 hover:text-white transition-colors">See all</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {displayedActiveLoans.slice(0, 4).map((l: any) => {
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
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">
                    {selectedAccountId !== "all" && activeAccount ? `Recent Activity · ${activeAccount.accountName}` : "Recent Activity"}
                  </h2>
                  {selectedAccountId !== "all" && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/70 flex items-center gap-1">
                      <span>Filtered</span>
                      <button type="button" onClick={() => setSelectedAccountId("all")} className="hover:text-white">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                </div>
                <button onClick={() => setView("activity")} className="text-xs font-bold text-white/50 hover:text-white transition-colors">See all</button>
              </div>
              <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                {displayedTx.slice(0, 6).length === 0 && (
                  <div className="p-6 text-center text-sm text-white/40 space-y-2">
                    <p>No activity recorded {selectedAccountId !== "all" ? `for ${activeAccount?.accountName}` : "yet"}.</p>
                    {selectedAccountId !== "all" && (
                      <button
                        type="button"
                        onClick={() => setSelectedAccountId("all")}
                        className="text-xs font-semibold text-white/70 hover:text-white underline"
                      >
                        View all accounts activity
                      </button>
                    )}
                  </div>
                )}
                {displayedTx.slice(0, 6).map((t: any) => {
                  const inbound = selectedAccountId !== "all"
                    ? t.toAccountId === selectedAccountId
                    : accounts.some((a: any) => a.id === t.toAccountId);
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

        {/* VIEW: SEND & TRANSFER */}
        {view === "send" && transferSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-xl mx-auto space-y-6"
          >
            {/* Header Status */}
            <div className="text-center space-y-2 pt-2">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
                <CheckCircle2 size={36} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono inline-block">
                Settlement Cleared · CityCorp Verified
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Transfer Confirmed</h2>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                Funds have settled instantly into the recipient account with zero hold time.
              </p>
            </div>

            {/* Official Digital Ledger Receipt Card */}
            <div className="rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-6 sm:p-7 space-y-5 shadow-2xl relative overflow-hidden backdrop-blur-md">
              {/* Watermark brand gradient */}
              <div
                className="absolute -top-24 -right-24 w-60 h-60 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ background: brand }}
              />

              {/* Amount Display */}
              <div className="text-center py-3 border-b border-white/10">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Amount Transferred</span>
                <div className="text-3xl sm:text-4xl font-black font-mono text-white mt-1 tracking-tight">
                  {formatMoney(transferSuccess.submittedCents)}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-mono font-bold text-emerald-300">
                  <ArrowDownLeft size={13} className="text-emerald-400" />
                  <span>Recipient Receives: {formatMoney(transferSuccess.receivedCents)}</span>
                </div>
              </div>

              {/* Transfer Flow Diagram */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-black/40 border border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                    <Wallet size={11} className="text-indigo-400" /> From
                  </span>
                  <p className="font-bold text-sm text-white truncate">{transferSuccess.fromAccountName}</p>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center justify-end gap-1">
                    <Building2 size={11} className="text-amber-400" /> To
                  </span>
                  <p className="font-bold text-sm text-white truncate">{transferSuccess.toAccountName}</p>
                </div>
              </div>

              {/* Meta details */}
              <div className="space-y-2.5 text-xs text-white/70">
                {transferSuccess.memo && (
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-white/40 flex items-center gap-1">
                      <FileText size={12} /> Memo
                    </span>
                    <span className="font-medium text-white italic">"{transferSuccess.memo}"</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-white/40 flex items-center gap-1">
                    <Percent size={12} /> Fee Policy
                  </span>
                  <span className="text-white/90 font-medium">
                    {transferSuccess.feeMode === "sender_covers" ? "Sender Covered Fees (0% deducted)" : "Deducted from Payment"}
                  </span>
                </div>
              </div>

              {/* Itemized Fee Breakdown */}
              {transferSuccess.lines && transferSuccess.lines.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider block">Settlement Breakdown</span>
                  {transferSuccess.lines.map((l: any) => (
                    <div key={l.code} className="flex justify-between text-xs">
                      <span className="text-white/50">{l.label} ({Number((l.rate * 100).toFixed(2))}%)</span>
                      <span className="font-mono text-white/80">{formatMoney(l.amountCents)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs pt-1.5 border-t border-white/5 font-bold">
                    <span className="text-amber-300/80">Total Transaction Fees</span>
                    <span className="font-mono text-amber-300">{formatMoney(transferSuccess.totalFeeCents)}</span>
                  </div>
                </div>
              )}

              {/* Audit Reference */}
              <div className="pt-3 border-t border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 font-mono">Ledger Ref:</span>
                  <button
                    type="button"
                    onClick={() => copy(transferSuccess.txId, "conf_tx")}
                    className="flex items-center gap-1.5 font-mono text-[11px] text-white/80 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 transition"
                  >
                    <span>{transferSuccess.txId}</span>
                    {copied === "conf_tx" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="flex justify-between text-white/40 text-[11px]">
                  <span>Settled Timestamp</span>
                  <span>{format(new Date(transferSuccess.timestamp), "MMM d, yyyy · h:mm:ss a")}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setTransferSuccess(null);
                  setView("home");
                }}
                className="w-full py-3.5 rounded-2xl font-bold text-sm text-white shadow-xl transition-all hover:opacity-95 cursor-pointer"
                style={btnBrand}
              >
                Return to Dashboard
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setTransferSuccess(null);
                  }}
                  className="py-3 rounded-2xl font-semibold text-xs sm:text-sm bg-white/5 border border-white/10 text-white/90 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Send size={14} />
                  <span>Send Another</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransferSuccess(null);
                    setView("activity");
                  }}
                  className="py-3 rounded-2xl font-semibold text-xs sm:text-sm bg-white/5 border border-white/10 text-white/90 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <FileText size={14} />
                  <span>View Activity</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === "send" && !transferSuccess && (
          <div className="space-y-6">
            {/* Header banner */}
            <div className="rounded-[28px] p-6 sm:p-7 relative overflow-hidden border border-white/10 bg-gradient-to-r from-indigo-950/40 via-[#101018] to-purple-950/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                      <Zap size={11} className="fill-indigo-300" />
                      <span>CityCorp Instant Clearing</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Zero Hold Time</span>
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Send & Wire Funds
                  </h2>
                  <p className="text-xs sm:text-sm text-white/60 max-w-xl">
                    Instant peer-to-peer and corporate transfers settled in real time via CityCorp & Onyx PSP clearinghouse.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (accounts[0]) setSplitFromAccountId(accounts[0].id);
                      setSplitBillModalOpen(true);
                    }}
                    className="flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition shadow-sm"
                  >
                    <Users size={14} />
                    <span>Split a Bill</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Split Layout: Composer on Left, Real-Time Ledger on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
              {/* LEFT COLUMN: The Transfer Composer */}
              <div className="lg:col-span-7 space-y-6">
                <form onSubmit={sendNow} className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-7 space-y-6 shadow-xl backdrop-blur-sm">
                  {/* 1. Source Account Card */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                        <Wallet size={13} className="text-indigo-400" />
                        <span>1. Select Source Account</span>
                      </label>
                      {(() => {
                        const srcAcc = accounts.find((a: any) => a.id === (sendFrom || accounts[0]?.id));
                        return srcAcc ? (
                          <span className="text-xs font-mono text-white/50">
                            Available: <strong className="text-emerald-400 font-bold">{formatMoney(srcAcc.balance)}</strong>
                          </span>
                        ) : null;
                      })()}
                    </div>

                    <div className="relative">
                      <select
                        value={sendFrom || accounts[0]?.id || ""}
                        onChange={(e) => setSendFrom(e.target.value)}
                        className="w-full bg-[#14141e] border border-white/15 hover:border-white/25 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition appearance-none cursor-pointer"
                      >
                        {accounts.map((a: any) => {
                          const isCorp = a.accountType?.includes("business") || a.accountType?.includes("corp");
                          return (
                            <option key={a.id} value={a.id} className="bg-[#14141e] text-white py-2">
                              {a.accountName} {isCorp ? "[CORP]" : ""} — {formatMoney(a.balance)}
                            </option>
                          );
                        })}
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                    </div>
                  </div>

                  {/* 2. Destination Recipient & Quick Switchers */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                        <Building2 size={13} className="text-amber-400" />
                        <span>2. Recipient Account</span>
                      </label>
                      <span className="text-[10px] text-white/40">Enter account name or tag</span>
                    </div>

                    {/* Self-Account Quick Transfer Shortcuts */}
                    {accounts.length > 1 && (
                      <div className="flex items-center gap-1.5 flex-wrap p-2 rounded-xl bg-black/30 border border-white/5 text-xs">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider flex items-center gap-1">
                          <ArrowLeftRight size={10} className="text-indigo-400" />
                          <span>My Other Accounts:</span>
                        </span>
                        {accounts
                          .filter((a: any) => a.id !== (sendFrom || accounts[0]?.id))
                          .map((a: any) => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => {
                                setSendTo(a.accountName);
                                setDestHint(`Internal Transfer → ${a.accountName}`);
                                setDestMatches([]);
                              }}
                              className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition ${
                                sendTo === a.accountName
                                  ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-200 font-bold"
                                  : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                              }`}
                            >
                              {a.accountName}
                            </button>
                          ))}
                      </div>
                    )}

                    {/* Recipient Input */}
                    <div className="relative">
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
                        placeholder="Search account name (e.g. ACC-Notch or CORP-Acme)"
                        className="w-full bg-[#14141e] border border-white/15 hover:border-white/25 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition font-medium"
                        required
                        autoComplete="off"
                      />
                      {sendTo && (
                        <button
                          type="button"
                          onClick={() => {
                            setSendTo("");
                            setDestHint("");
                            setDestMatches([]);
                          }}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Verified Match Hint Badge */}
                    {destHint && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs"
                      >
                        <span className="text-emerald-300 font-medium flex items-center gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-400" />
                          <span>Verified Counterparty: <strong className="text-white font-mono">{destHint}</strong></span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/20 px-2 py-0.5 rounded">
                          0% Same Bank
                        </span>
                      </motion.div>
                    )}

                    {/* Autocomplete Dropdown List */}
                    {destMatches.length > 0 && (
                      <div className="rounded-2xl border border-white/15 bg-[#12121a] shadow-2xl divide-y divide-white/5 overflow-hidden">
                        <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-white/40 tracking-wider bg-white/[0.02]">
                          Recent Counterparties & Suggestions
                        </div>
                        {destMatches.map((m: any) => (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => {
                              setSendTo(m.accountName || m.id);
                              setDestHint(`${m.accountName}${m.bankName ? " · " + m.bankName : ""}`);
                              setDestMatches([]);
                            }}
                            className="w-full text-left px-4 py-3 text-xs hover:bg-white/10 flex items-center justify-between text-white/90 transition"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-300 font-bold shrink-0">
                                {m.accountName ? m.accountName.slice(0, 2).toUpperCase() : "AC"}
                              </div>
                              <div className="truncate">
                                <span className="font-semibold text-white block truncate">{m.accountName}</span>
                                {m.bankName && <span className="text-[10px] text-white/40 truncate block">{m.bankName}</span>}
                              </div>
                            </div>
                            <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded font-mono">Select</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Transfer Amount & Quick Presets */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                        <DollarSign size={13} className="text-emerald-400" />
                        <span>3. Transfer Amount</span>
                      </label>
                      <span className="text-[11px] text-white/40 font-mono">Instant Settlement</span>
                    </div>

                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl sm:text-3xl font-black text-white/30 font-mono">$</span>
                      <input
                        value={sendAmt}
                        onChange={(e) => setSendAmt(e.target.value)}
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        className="w-full bg-[#14141e] border border-white/15 hover:border-white/25 rounded-2xl pl-11 pr-4 py-3.5 text-2xl sm:text-3xl font-black font-mono text-white focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 transition placeholder:text-white/20 tabular-nums"
                        required
                      />
                    </div>

                    {/* Quick Preset Buttons */}
                    {(() => {
                      const srcAcc = accounts.find((a: any) => a.id === (sendFrom || accounts[0]?.id));
                      const maxBalDol = srcAcc ? srcAcc.balance / 100 : 0;
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-white/40 uppercase tracking-wider mr-1">Presets:</span>
                          {[10, 25, 50, 100, 250, 500].filter(val => maxBalDol === 0 || val <= maxBalDol).map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSendAmt(String(val))}
                              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-xl border transition ${
                                sendAmt === String(val)
                                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm"
                                  : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                              }`}
                            >
                              ${val}
                            </button>
                          ))}
                          {maxBalDol > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => setSendAmt((maxBalDol * 0.5).toFixed(2))}
                                className="text-xs font-mono font-semibold px-2.5 py-1 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition"
                              >
                                50%
                              </button>
                              <button
                                type="button"
                                onClick={() => setSendAmt(maxBalDol.toFixed(2))}
                                className="text-xs font-mono font-semibold px-2.5 py-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition"
                              >
                                Max (${maxBalDol.toFixed(2)})
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 4. Fee Deduction Policy */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                        <Percent size={13} className="text-cyan-400" />
                        <span>4. Fee Deduction Policy</span>
                      </label>
                      <span className="text-[10px] text-white/40">Select payer</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-2xl border border-white/10 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setFeeMode("from_payment")}
                        className={`py-3 px-3 rounded-xl transition flex flex-col items-center justify-center gap-0.5 ${
                          feeMode === "from_payment"
                            ? "bg-white/15 text-white shadow-sm border border-white/20"
                            : "text-white/50 hover:text-white"
                        }`}
                      >
                        <span className="font-bold">Deduct from Payment</span>
                        <span className="text-[10px] text-white/40 font-normal">Receiver pays fees</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeeMode("sender_covers")}
                        className={`py-3 px-3 rounded-xl transition flex flex-col items-center justify-center gap-0.5 ${
                          feeMode === "sender_covers"
                            ? "bg-white/15 text-white shadow-sm border border-white/20"
                            : "text-white/50 hover:text-white"
                        }`}
                      >
                        <span className="font-bold">I Cover All Fees</span>
                        <span className="text-[10px] text-white/40 font-normal">Receiver gets full amount</span>
                      </button>
                    </div>
                  </div>

                  {/* 5. Transfer Memo with Category Presets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={13} className="text-white/50" />
                        <span>5. Transfer Memo (Optional)</span>
                      </label>
                      <span className="text-[10px] text-white/40">Public on ledger</span>
                    </div>

                    <input
                      value={sendMemo}
                      onChange={(e) => setSendMemo(e.target.value)}
                      placeholder="e.g. Invoice #104 payment, goods delivery, or rent"
                      className="w-full bg-[#14141e] border border-white/15 hover:border-white/25 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition font-medium"
                    />

                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {["🛒 Purchase", "🏠 Rent", "💼 Services", "⚡ Repayment", "🎁 Gift"].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setSendMemo(tag)}
                          className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 6. Primary Action Submit Button */}
                  <button
                    type="submit"
                    disabled={actionPending || suspended || !sendAmt || !sendTo}
                    className="w-full py-4 rounded-2xl font-bold text-sm sm:text-base text-white shadow-xl transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99]"
                    style={btnBrand}
                  >
                    {actionPending ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Executing Settlement…</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm & Authorize Transfer</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* RIGHT COLUMN: Real-Time Live Settlement Ledger & Route Preview */}
              <div className="lg:col-span-5 space-y-6">
                {/* Live Settlement Card */}
                <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6 space-y-5 shadow-xl backdrop-blur-sm sticky top-6">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono flex items-center gap-1">
                        <Activity size={12} />
                        <span>Live Ledger Engine</span>
                      </span>
                      <h3 className="font-bold text-base text-white">Settlement Preview</h3>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Ready</span>
                    </span>
                  </div>

                  {/* Visual Route */}
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="space-y-0.5 max-w-[45%]">
                        <span className="text-[10px] font-bold text-white/40 uppercase block">Source</span>
                        <p className="font-bold text-white truncate">
                          {accounts.find((a: any) => a.id === (sendFrom || accounts[0]?.id))?.accountName || "Your Account"}
                        </p>
                      </div>
                      <div className="flex flex-col items-center px-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                          <ArrowRight size={12} />
                        </div>
                        <span className="text-[9px] font-mono text-white/40 mt-1">Instant</span>
                      </div>
                      <div className="space-y-0.5 max-w-[45%] text-right">
                        <span className="text-[10px] font-bold text-white/40 uppercase block">Recipient</span>
                        <p className="font-bold text-indigo-300 truncate">
                          {sendTo || "Enter recipient"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Calculation */}
                  <div className="space-y-3 text-xs">
                    {quoting && (
                      <div className="flex items-center gap-2 py-4 justify-center text-white/50">
                        <Loader2 size={16} className="animate-spin text-indigo-400" />
                        <span>Calculating settlement quote…</span>
                      </div>
                    )}

                    {quoteErr && (
                      <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                        {quoteErr}
                      </div>
                    )}

                    {quote && (
                      <div className="space-y-2.5">
                        <div className="flex justify-between items-center pb-2 border-b border-white/5">
                          <span className="text-white/60">Debited from Sender</span>
                          <span className="font-mono font-black text-white text-base">
                            {formatMoney(quote.submittedCents)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-white/5">
                          <span className="text-white/60">Credited to Recipient</span>
                          <span className="font-mono font-bold text-emerald-400 text-base">
                            {formatMoney(quote.receivedCents)}
                          </span>
                        </div>

                        {quote.lines?.map((l: any) => (
                          <div key={l.code} className="flex justify-between text-[11px] text-white/40">
                            <span>{l.label} ({Number((l.rate * 100).toFixed(2))}%)</span>
                            <span className="font-mono text-white/70">{formatMoney(l.amountCents)}</span>
                          </div>
                        ))}

                        <div className="flex justify-between text-xs pt-2 border-t border-white/10 font-bold">
                          <span className="text-amber-300/90">Total Transaction Fees</span>
                          <span className="font-mono text-amber-300">{formatMoney(quote.totalFeeCents)}</span>
                        </div>
                      </div>
                    )}

                    {!quoting && !quote && !quoteErr && (
                      <div className="text-center py-6 text-white/40 space-y-1">
                        <DollarSign size={24} className="mx-auto text-white/20 mb-2" />
                        <p className="font-medium text-xs text-white/60">Live Breakdown</p>
                        <p className="text-[11px] text-white/40 max-w-xs mx-auto">
                          Enter recipient account and transfer amount to generate dynamic settlement calculations.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Security Guarantees */}
                  <div className="pt-4 border-t border-white/10 space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs text-white/60">
                      <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span>Zero-hold immediate clearing into recipient balance.</span>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs text-white/60">
                      <Lock size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                      <span>Cryptographically signed CityCorp transaction ledger.</span>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs text-white/60">
                      <Landmark size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <span>Free 0% fees on transfers between accounts at the same bank.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "activity" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black text-white">
                  {selectedAccountId !== "all" && activeAccount ? `Activity · ${activeAccount.accountName}` : "Account Activity"}
                </h2>
                <p className="text-xs text-white/40 mt-0.5">
                  {selectedAccountId !== "all" && activeAccount
                    ? `Displaying settled ledger transactions specifically for account ${activeAccount.id.slice(0, 10)}…`
                    : "Real-time ledger audit trail across all your personal and corporate accounts."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50 font-mono">
                  {displayedTx.length} transaction{displayedTx.length === 1 ? "" : "s"}
                </span>
                {selectedAccountId !== "all" && (
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId("all")}
                    className="text-xs font-semibold text-white/70 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Account Filter Segmented Control */}
            {accounts.length > 1 && (
              <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/10 rounded-2xl overflow-x-auto pb-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedAccountId("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 ${
                    selectedAccountId === "all"
                      ? "bg-white/15 text-white border border-white/20 shadow-sm"
                      : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Layers size={13} />
                  <span>All Accounts ({tx.length})</span>
                </button>
                {accounts.map((acc: any) => {
                  const accTxCount = tx.filter((t: any) => t.fromAccountId === acc.id || t.toAccountId === acc.id).length;
                  const isCorp = acc.accountType?.includes("business") || acc.accountType?.includes("corp");
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setSelectedAccountId(isSelected ? "all" : acc.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-white/15 text-white border border-white/20 shadow-sm"
                          : "text-white/50 hover:text-white hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      {isCorp ? <Building2 size={13} className="text-amber-400" /> : <Wallet size={13} />}
                      <span>{acc.accountName}</span>
                      <span className="text-[10px] font-mono opacity-60">({accTxCount})</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Account Summary Strip when filtered */}
            {selectedAccountId !== "all" && activeAccount && (() => {
              const inCents = displayedTx
                .filter((t: any) => t.toAccountId === selectedAccountId)
                .reduce((s: number, t: any) => s + (t.amountReceived ?? t.amount ?? 0), 0);
              const outCents = displayedTx
                .filter((t: any) => t.fromAccountId === selectedAccountId)
                .reduce((s: number, t: any) => s + (t.amountSubmitted ?? t.amount ?? 0), 0);
              return (
                <div className="grid grid-cols-3 gap-2.5 p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Current Balance</span>
                    <span className="text-sm font-bold text-white font-mono mt-0.5 block tabular-nums">{formatMoney(activeAccount.balance)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-emerald-400/80 block">Total Inflow</span>
                    <span className="text-sm font-bold text-emerald-300 font-mono mt-0.5 block tabular-nums">+{formatMoney(inCents)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Total Outflow</span>
                    <span className="text-sm font-bold text-white font-mono mt-0.5 block tabular-nums">−{formatMoney(outCents)}</span>
                  </div>
                </div>
              );
            })()}

            <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
              {displayedTx.length === 0 && (
                <div className="p-8 text-center space-y-2">
                  <p className="text-white/40 text-sm">
                    No transactions recorded {selectedAccountId !== "all" ? `for ${activeAccount?.accountName}` : "yet"}.
                  </p>
                  {selectedAccountId !== "all" && (
                    <button
                      type="button"
                      onClick={() => setSelectedAccountId("all")}
                      className="text-xs text-white/70 hover:text-white underline font-medium"
                    >
                      Show all accounts activity
                    </button>
                  )}
                </div>
              )}
              {displayedTx.map((t: any) => {
                const inbound = selectedAccountId !== "all"
                  ? t.toAccountId === selectedAccountId
                  : accounts.some((a: any) => a.id === t.toAccountId);
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
            {availableCatalogTabs.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
                {availableCatalogTabs.map(tab => {
                  const Icon = tab.icon;
                  const active = applyTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setApplyTab(tab.id as any)}
                      className={`flex items-center gap-2 justify-center py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                        active
                          ? "bg-white/15 border-white/30 text-white shadow-md"
                          : "bg-white/5 border-white/5 text-white/50 hover:text-white hover:bg-white/[0.08]"
                      }`}
                    >
                      <Icon size={15} color={active ? brand : undefined} />
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-3xl border border-white/10 p-12 bg-white/[0.02] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                  <Landmark size={24} />
                </div>
                <h3 className="font-bold text-white text-base">No Financial Offerings Published</h3>
                <p className="text-xs text-white/40 max-w-md mx-auto">
                  This institution has not published any active account tiers, loan products, or financial options in its catalog. If the bank has no options, none are provided to clients.
                </p>
              </div>
            )}

            {/* TAB: DEPOSIT ACCOUNT */}
            {applyTab === "account" && availableCatalogTabs.some(t => t.id === "account") && (
              (() => {
                if (availableTiers.length === 0) {
                  return (
                    <div className="rounded-2xl border border-white/10 p-8 bg-white/[0.02] text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                        <Wallet size={24} />
                      </div>
                      <h4 className="font-bold text-white text-base">No Published Account Options</h4>
                      <p className="text-xs text-white/40 max-w-sm mx-auto">
                        This bank has not configured or published account registration tiers. If the bank has no options, none are provided to clients.
                      </p>
                    </div>
                  );
                }

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

                const cannotRegisterReason = availableTiers.length === 0
                  ? "No account registration options are published by this bank. If the bank has no options, none are provided to clients."
                  : tierLimitReached
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
                const clientMcUsername = userData?.customer?.mcUsername || userData?.mcUsername || user?.mcUsername || (user?.username && !/^\d{17,20}$/.test(user.username) ? user.username : null) || "player";
                const targetAccountName = `${effectivePrefix}${(!isBiz && (effectiveNamingMode === "discord_username" || effectiveNamingMode === "mc_username" || namingPref === "discord" || namingPref === "mc")) ? clientMcUsername : (accountNameChoice || (isBiz ? "AcmeCorp" : clientMcUsername))}`;
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
                            const isSelected = (selectedTierId || (availableTiers.find((x: any) => x.isDefault && (!x.maxAccountsPerUser || accounts.filter((a: any) => a.tierId === x.id).length < x.maxAccountsPerUser))?.id || availableTiers.find((x: any) => !x.maxAccountsPerUser || accounts.filter((a: any) => a.tierId === x.id).length < x.maxAccountsPerUser)?.id || availableTiers[0]?.id)) === t.id;
                            const tHeld = accounts.filter((a: any) => a.tierId === t.id).length;
                            const isCapReached = typeof t.maxAccountsPerUser === "number" && t.maxAccountsPerUser > 0 && tHeld >= t.maxAccountsPerUser;

                            return (
                              <div
                                key={t.id}
                                onClick={() => {
                                  if (!isCapReached) setSelectedTierId(t.id);
                                }}
                                className={`rounded-2xl p-4.5 border transition-all relative flex flex-col justify-between space-y-3.5 ${
                                  isCapReached
                                    ? "bg-rose-500/[0.04] border-rose-500/30 opacity-60 cursor-not-allowed select-none"
                                    : isSelected
                                    ? "cursor-pointer bg-gradient-to-b from-indigo-500/15 via-white/[0.04] to-white/[0.02] border-indigo-400/50 shadow-lg shadow-indigo-500/10"
                                    : "cursor-pointer bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
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
                                      isCapReached
                                        ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                                        : isSelected
                                        ? "bg-indigo-500 border-indigo-400 text-white"
                                        : "border-white/20 bg-white/5 text-transparent"
                                    }`}>
                                      {isCapReached ? <Ban size={11} /> : <Check size={12} strokeWidth={3} />}
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
                                  <div className="text-[10px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-1 rounded-lg text-center flex items-center justify-center gap-1">
                                    <Ban size={11} className="text-rose-400" />
                                    <span>Holding Limit Reached ({tHeld}/{t.maxAccountsPerUser})</span>
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
                      <div className="rounded-2xl border border-white/10 p-6 bg-white/[0.02] text-center space-y-2">
                        <div className="w-10 h-10 rounded-xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                          <Wallet size={20} />
                        </div>
                        <h4 className="font-bold text-white text-sm">No Published Account Options</h4>
                        <p className="text-xs text-white/40 max-w-sm mx-auto">
                          This bank has not configured or published account registration tiers. If the bank has no options, none are provided to clients.
                        </p>
                      </div>
                    )}

                    {/* Hidden tier id input for standard form submission */}
                    <input type="hidden" name="tierId" value={selectedTierId || (availableTiers.find((t: any) => t.isDefault)?.id || availableTiers[0]?.id || "")} />

                    {/* Dynamic Naming & In-Game Command Preview */}
                    <div className="space-y-4 pt-2 border-t border-white/5">
                      {!isBiz && (effectiveNamingMode === "choice_or_username" || effectiveNamingMode === "custom") && (
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
                            onClick={() => setNamingPref("mc")}
                            className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold border transition-colors ${namingPref === "mc" || namingPref === "discord" ? "bg-white/15 border-white/30 text-white" : "bg-white/5 border-white/5 text-white/50 hover:text-white"}`}
                          >
                            Minecraft Username ({clientMcUsername})
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

                        {(!isBiz && (effectiveNamingMode === "discord_username" || effectiveNamingMode === "mc_username" || namingPref === "discord" || namingPref === "mc")) ? (
                          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white font-mono">
                            <span className="text-indigo-400 font-bold">{effectivePrefix}</span>
                            <span>{clientMcUsername}</span>
                            <span className="ml-auto text-[11px] text-emerald-400 uppercase font-sans font-bold flex items-center gap-1">
                              <CheckCircle2 size={13} /> MC Username
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
                              placeholder={isBiz ? "e.g. AcmeIndustries" : clientMcUsername || "e.g. savings"} 
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
                      disabled={actionPending || Boolean(cannotRegisterReason) || availableTiers.length === 0}
                      className="w-full py-4 rounded-2xl font-bold text-sm text-white shadow-xl transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={btnBrand}
                    >
                      {actionPending ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Provisioning Account…</span>
                        </>
                      ) : availableTiers.length === 0 ? (
                        <span>No Account Options Available</span>
                      ) : cannotRegisterReason ? (
                        <span>{cannotRegisterReason}</span>
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
            {applyTab === "loan" && availableCatalogTabs.some(t => t.id === "loan") && (
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
                <form onSubmit={applyLoan} className="rounded-3xl border border-white/10 p-5 sm:p-7 space-y-6 bg-white/[0.02]">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-5">
                    <div>
                      <h3 className="font-bold text-base sm:text-lg flex items-center gap-2 text-white">
                        <Landmark size={20} className="text-emerald-400" /> Apply for Financing
                      </h3>
                      <p className="text-xs text-white/50 mt-1">
                        Tailored lending with variable payback schedules, sliding scales, collateral pledging, and real-time payment breakdown.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-mono font-semibold flex items-center gap-1.5">
                        <CheckCircle2 size={12} /> Interactive Calculator
                      </span>
                    </div>
                  </div>

                  {/* Account & Product Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wider">
                        Disbursement & Repayment Account
                      </label>
                      <select
                        name="accountId"
                        required
                        value={loanDisbursementAccountId || accounts[0]?.id || ""}
                        onChange={(e) => setLoanDisbursementAccountId(e.target.value)}
                        className="w-full bg-[#18181c] border border-white/15 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-indigo-500 transition [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                      >
                        {accounts.map((a: any) => (
                          <option key={a.id} value={a.id} className="bg-[#18181c] text-[#f4f4f5]">
                            {a.accountName} · ({formatMoney(a.balance)} available)
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-white/40 mt-1">Loan proceeds disburse here; future scheduled installments debit from this account.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wider">
                        Financing Product / Catalog Tier
                      </label>
                      <select
                        name="productId"
                        required
                        value={selectedLoanProductId || loanProducts[0]?.id || ""}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setSelectedLoanProductId(pid);
                          const chosen = loanProducts.find((p: any) => p.id === pid);
                          if (chosen) {
                            const pDays = chosen.termDays || (chosen.termDuration && chosen.termUnit ? convertTermToDays(chosen.termDuration, chosen.termUnit, 30) : 30);
                            const maxW = Math.max(1, Math.floor(pDays / 7));
                            const maxM = Math.max(1, Math.floor(pDays / 30));
                            const maxD = pDays;
                            const maxT = loanTermUnit === "weeks" ? maxW : loanTermUnit === "months" ? maxM : maxD;
                            if (loanTermDuration > maxT) {
                              setLoanTermDuration(maxT);
                            }
                            if (chosen.maxAmount && loanAmount > chosen.maxAmount / 100) {
                              setLoanAmount(chosen.maxAmount / 100);
                            }
                          }
                        }}
                        className="w-full bg-[#18181c] border border-white/15 rounded-xl px-3.5 py-3 text-sm text-[#f4f4f5] focus:outline-none focus:border-indigo-500 transition [&>option]:bg-[#18181c] [&>option]:text-[#f4f4f5]"
                      >
                        {loanProducts.map((p: any) => (
                          <option key={p.id} value={p.id} className="bg-[#18181c] text-[#f4f4f5]">
                            {p.name} · {formatLoanRate(p.interestRate, p.interestRateType, true)} · max {formatMoney(p.maxAmount)}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-white/40 mt-1">Select underwriting guidelines and interest accrual rates from the catalog.</p>
                    </div>
                  </div>

                  {(() => {
                    const curProd = loanProducts.find((p: any) => p.id === (selectedLoanProductId || loanProducts[0]?.id)) || loanProducts[0];
                    if (!curProd) return null;
                    const minDol = curProd.minAmount ? curProd.minAmount / 100 : 100;
                    const maxDol = curProd.maxAmount ? curProd.maxAmount / 100 : 10000;
                    const effectiveAmount = Math.max(minDol, Math.min(maxDol, loanAmount || minDol));

                    // Max deposit is up to 50% of loan amount or maxDol / 2
                    const maxDepositDol = Math.floor(effectiveAmount * 0.5);
                    const effectiveDeposit = Math.min(loanDepositAmount, maxDepositDol);
                    const financedPrincipal = Math.max(0, effectiveAmount - effectiveDeposit);

                    // Dynamic real-time calculation based on customized term duration and unit
                    const prodDays = curProd.termDays || (curProd.termDuration && curProd.termUnit ? convertTermToDays(curProd.termDuration, curProd.termUnit, 30) : 30);
                    const maxAllowedWeeks = Math.max(1, Math.floor(prodDays / 7));
                    const maxAllowedMonths = Math.max(1, Math.floor(prodDays / 30));
                    const maxAllowedDays = prodDays;

                    const maxTermForUnit = loanTermUnit === "weeks" ? maxAllowedWeeks : loanTermUnit === "months" ? maxAllowedMonths : maxAllowedDays;
                    const effectiveTermDuration = Math.max(1, Math.min(maxTermForUnit, loanTermDuration || maxTermForUnit));

                    const breakdown = calculateLoanBreakdown({
                      principalCents: financedPrincipal * 100,
                      rate: curProd.interestRate,
                      rateType: curProd.interestRateType || "apr",
                      termDuration: effectiveTermDuration,
                      termUnit: loanTermUnit,
                      repaymentFrequency: loanRepaymentFreq || curProd.repaymentFrequency || (loanTermUnit === "weeks" ? "weekly" : "monthly")
                    });

                    // Term Presets filtered strictly to what the bank configured
                    const rawPresets = loanTermUnit === "months" 
                      ? [1, 2, 3, 6, 12, 18, 24, 36, 48].filter(m => m <= maxAllowedMonths)
                      : loanTermUnit === "weeks"
                      ? [1, 2, 4, 8, 12, 16, 24, 36, 52].filter(w => w <= maxAllowedWeeks)
                      : [7, 14, 30, 60, 90, 180, 365].filter(d => d <= maxAllowedDays);

                    if (!rawPresets.includes(maxTermForUnit) && maxTermForUnit > 0) {
                      rawPresets.push(maxTermForUnit);
                      rawPresets.sort((a, b) => a - b);
                    }
                    const termPresets = rawPresets.length > 0 ? rawPresets : [maxTermForUnit];

                    // Quick presets for amount
                    const step = maxDol - minDol > 10000 ? 500 : maxDol - minDol > 2000 ? 100 : 25;
                    const p25 = Math.round(minDol + (maxDol - minDol) * 0.25);
                    const p50 = Math.round(minDol + (maxDol - minDol) * 0.5);
                    const p75 = Math.round(minDol + (maxDol - minDol) * 0.75);

                    // Estimated payoff date calculation
                    const payoffDate = new Date();
                    payoffDate.setDate(payoffDate.getDate() + breakdown.termDays);
                    const payoffDateFormatted = format(payoffDate, "MMM d, yyyy");

                    // Collateral Coverage Calculation
                    const collateralValNum = parseFloat(loanCollateralVal || "0") || 0;
                    const collateralCoverageRatio = financedPrincipal > 0 ? Math.round((collateralValNum / financedPrincipal) * 100) : 0;

                    return (
                      <div className="space-y-6">
                        {/* Selected Product Overview Banner */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="font-bold text-white text-sm sm:text-base">{curProd.name}</span>
                              <span className="text-white/40 text-xs ml-2 capitalize">({curProd.category || "General"} Financing)</span>
                            </div>
                            <span className="text-emerald-400 font-mono font-bold text-sm bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl self-start sm:self-auto">
                              {formatLoanRate(curProd.interestRate, curProd.interestRateType, false)}
                            </span>
                          </div>
                          {curProd.description && <p className="text-xs text-white/60 leading-relaxed">{curProd.description}</p>}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/5 text-xs">
                            <div>
                              <span className="text-white/40 block text-[11px]">Allowable Limit</span>
                              <span className="font-bold text-white font-mono">{formatMoney(curProd.minAmount || 10000)} – {formatMoney(curProd.maxAmount)}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[11px]">Interest Type</span>
                              <span className="font-bold text-white uppercase font-mono">{curProd.interestRateType || "APR"}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[11px]">Origination Surcharge</span>
                              <span className="font-bold text-white font-mono">{(curProd.originationFeePercent ? curProd.originationFeePercent / 100 : 0).toFixed(1)}%</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[11px]">Collateral Policy</span>
                              <span className={`font-bold ${curProd.collateralRequired ? "text-amber-400" : "text-white/70"}`}>
                                {curProd.collateralRequired ? "Mandatory" : "Optional (Recommended)"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* SECTION 1: BORROWING AMOUNT (DUAL SLIDER + STEPPER) */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                                <DollarSign size={14} className="text-emerald-400" /> Requested Borrowing Amount
                              </label>
                              <p className="text-[11px] text-white/40">Adjust the sliding scale or type your exact loan requirement.</p>
                            </div>
                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              <span className="text-white/40 font-mono text-sm">$</span>
                              <input
                                type="number"
                                min={minDol}
                                max={maxDol}
                                step={1}
                                value={loanAmount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setLoanAmount(isNaN(val) ? minDol : Math.max(minDol, Math.min(maxDol, val)));
                                }}
                                className="bg-[#18181c] border border-white/20 rounded-xl px-3 py-1.5 text-base sm:text-lg font-mono font-bold text-white w-32 sm:w-36 text-right focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>

                          {/* Slider Range Track */}
                          <div className="space-y-2 pt-1">
                            <input
                              type="range"
                              min={minDol}
                              max={maxDol}
                              step={step}
                              value={effectiveAmount}
                              onChange={(e) => setLoanAmount(Number(e.target.value))}
                              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between text-[11px] font-mono text-white/40">
                              <span>${minDol.toLocaleString()}</span>
                              <span>${p25.toLocaleString()}</span>
                              <span>${p50.toLocaleString()}</span>
                              <span>${p75.toLocaleString()}</span>
                              <span>${maxDol.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* Quick Preset Buttons */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[10px] text-white/40 uppercase tracking-wider mr-1">Quick Select:</span>
                            {[
                              { label: "Min", val: minDol },
                              { label: "25%", val: p25 },
                              { label: "50%", val: p50 },
                              { label: "75%", val: p75 },
                              { label: "Max", val: maxDol },
                            ].map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setLoanAmount(preset.val)}
                                className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition ${
                                  loanAmount === preset.val
                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold"
                                    : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10"
                                }`}
                              >
                                {preset.label} (${preset.val.toLocaleString()})
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* SECTION 2: PAYBACK TERM LENGTH & FREQUENCY (SLIDING SCALE) */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                                <Clock size={14} className="text-indigo-400" /> Repayment Term & Payback Duration
                              </label>
                              <p className="text-[11px] text-white/40">Customize how long you need to pay back the loan to fit your budget.</p>
                            </div>

                            {/* Unit Selector Tabs */}
                            <div className="flex items-center p-1 bg-black/40 border border-white/10 rounded-xl self-start sm:self-auto">
                              {(["months", "weeks", "days"] as const).map((unit) => {
                                const unitMax = unit === "weeks" ? maxAllowedWeeks : unit === "months" ? maxAllowedMonths : maxAllowedDays;
                                return (
                                  <button
                                    key={unit}
                                    type="button"
                                    onClick={() => {
                                      setLoanTermUnit(unit);
                                      if (unit === "months") {
                                        setLoanTermDuration(Math.min(maxAllowedMonths, 6));
                                        setLoanRepaymentFreq("monthly");
                                      } else if (unit === "weeks") {
                                        setLoanTermDuration(Math.min(maxAllowedWeeks, 8));
                                        setLoanRepaymentFreq("weekly");
                                      } else {
                                        setLoanTermDuration(Math.min(maxAllowedDays, 60));
                                        setLoanRepaymentFreq("monthly");
                                      }
                                    }}
                                    className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition cursor-pointer ${
                                      loanTermUnit === unit
                                        ? "bg-white/15 text-white font-semibold shadow-sm"
                                        : "text-white/40 hover:text-white"
                                    }`}
                                  >
                                    {unit}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Term Slider */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white/70">
                                Selected Duration: <strong className="text-white font-mono text-sm">{effectiveTermDuration} {loanTermUnit}</strong> ({breakdown.termDays} calendar days)
                              </span>
                              <span className="text-xs font-mono text-indigo-300">
                                Max Allowed: {maxTermForUnit} {loanTermUnit} ({prodDays}d)
                              </span>
                            </div>

                            <input
                              type="range"
                              min={loanTermUnit === "days" ? Math.min(7, maxTermForUnit) : 1}
                              max={maxTermForUnit}
                              step={loanTermUnit === "days" ? 7 : 1}
                              value={effectiveTermDuration}
                              onChange={(e) => setLoanTermDuration(Math.min(maxTermForUnit, Math.max(1, Number(e.target.value))))}
                              className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />

                            {/* Preset Buttons for Term */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              <span className="text-[10px] text-white/40 uppercase tracking-wider mr-1">Allowed Presets:</span>
                              {termPresets.map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => setLoanTermDuration(val)}
                                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition ${
                                    effectiveTermDuration === val
                                      ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 font-semibold"
                                      : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                                  }`}
                                >
                                  {val} {loanTermUnit === "months" ? (val > 1 ? "Months" : "Month") : loanTermUnit === "weeks" ? (val > 1 ? "Wks" : "Wk") : "Days"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* SECTION 3: UPFRONT CASH DEPOSIT / DOWN PAYMENT */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                                <PiggyBank size={14} className="text-cyan-400" /> Upfront Cash Deposit / Down Payment (Optional)
                              </label>
                              <p className="text-[11px] text-white/40">
                                Pledging an upfront cash deposit reduces your financed principal, lowers monthly installments, and demonstrates creditworthiness.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              <span className="text-white/40 font-mono text-sm">$</span>
                              <input
                                type="number"
                                min={0}
                                max={maxDepositDol}
                                step={50}
                                value={loanDepositAmount}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setLoanDepositAmount(Math.max(0, Math.min(maxDepositDol, val)));
                                }}
                                className="bg-[#18181c] border border-white/20 rounded-xl px-3 py-1.5 text-base sm:text-lg font-mono font-bold text-cyan-300 w-28 sm:w-32 text-right focus:outline-none focus:border-cyan-500"
                              />
                            </div>
                          </div>

                          <input
                            type="range"
                            min={0}
                            max={maxDepositDol}
                            step={Math.max(10, Math.round(maxDepositDol / 50))}
                            value={effectiveDeposit}
                            onChange={(e) => setLoanDepositAmount(Number(e.target.value))}
                            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />

                          <div className="flex items-center justify-between text-xs text-white/60 pt-1">
                            <span>Upfront Deposit: <strong className="text-cyan-300 font-mono">${effectiveDeposit.toLocaleString()}</strong></span>
                            <span>Net Disbursed Balance: <strong className="text-white font-mono">${financedPrincipal.toLocaleString()}</strong></span>
                          </div>
                        </div>

                        {/* SECTION 4: REAL-TIME FINANCIAL SUMMARY DASHBOARD */}
                        <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/30 via-black/40 to-emerald-950/20 p-5 space-y-4 shadow-xl">
                          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-white/10 pb-4">
                            <div>
                              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 block">
                                Real-Time Estimated {breakdown.frequencyLabel} Installment
                              </span>
                              <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
                                  {formatMoney(breakdown.installmentCents)}
                                </span>
                                <span className="text-xs text-white/50">/ {breakdown.frequencyLabel.toLowerCase()}</span>
                              </div>
                            </div>

                            <div className="text-left sm:text-right">
                              <span className="text-[11px] text-white/50 block">Anticipated Final Payoff</span>
                              <span className="text-sm font-semibold text-white font-mono">{payoffDateFormatted}</span>
                            </div>
                          </div>

                          {/* Visual Amortization Proportion Bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] text-white/60">
                              <span>Capital Composition</span>
                              <span className="font-mono">
                                Total Obligation: <strong>{formatMoney(breakdown.totalPayoffCents)}</strong>
                              </span>
                            </div>
                            <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden flex">
                              {effectiveDeposit > 0 && (
                                <div
                                  style={{ width: `${Math.round((effectiveDeposit / (effectiveAmount + breakdown.totalInterestCents / 100)) * 100)}%` }}
                                  className="bg-cyan-500 h-full"
                                  title={`Deposit: $${effectiveDeposit}`}
                                />
                              )}
                              <div
                                style={{ width: `${Math.round((financedPrincipal / (effectiveAmount + breakdown.totalInterestCents / 100)) * 100)}%` }}
                                className="bg-white/70 h-full"
                                title={`Financed Principal: $${financedPrincipal}`}
                              />
                              <div
                                style={{ width: `${Math.max(5, Math.round(((breakdown.totalInterestCents / 100) / (effectiveAmount + breakdown.totalInterestCents / 100)) * 100))}%` }}
                                className="bg-emerald-500 h-full"
                                title={`Total Interest: ${formatMoney(breakdown.totalInterestCents)}`}
                              />
                            </div>
                            <div className="flex items-center gap-4 text-[10px] text-white/50 pt-0.5">
                              {effectiveDeposit > 0 && (
                                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-400" /> Deposit: ${effectiveDeposit.toLocaleString()}</span>
                              )}
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/70" /> Financed Principal: ${financedPrincipal.toLocaleString()}</span>
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Interest: {formatMoney(breakdown.totalInterestCents)}</span>
                            </div>
                          </div>

                          {/* Key Breakdown Metrics Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                            <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                              <span className="text-white/40 block text-[10px] uppercase">Financed Principal</span>
                              <span className="font-mono font-bold text-white text-sm">{formatMoney(financedPrincipal * 100)}</span>
                            </div>
                            <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                              <span className="text-white/40 block text-[10px] uppercase">Finance Charge (Interest)</span>
                              <span className="font-mono font-bold text-emerald-400 text-sm">+{formatMoney(breakdown.totalInterestCents)}</span>
                            </div>
                            <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                              <span className="text-white/40 block text-[10px] uppercase">Total Cost of Payoff</span>
                              <span className="font-mono font-bold text-white text-sm">{formatMoney(breakdown.totalPayoffCents)}</span>
                            </div>
                            <div className="bg-black/30 p-2.5 rounded-xl border border-white/5">
                              <span className="text-white/40 block text-[10px] uppercase">Annualized Rate (APR)</span>
                              <span className="font-mono font-bold text-indigo-300 text-sm">≈ {breakdown.equivalentApr.toFixed(1)}% APR</span>
                            </div>
                          </div>
                        </div>

                        {/* SECTION 5: COLLATERAL PLEDGING & SECURITY ASSETS */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wider text-white/90 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={loanPledgeCollateral || Boolean(curProd.collateralRequired)}
                                disabled={Boolean(curProd.collateralRequired)}
                                onChange={(e) => setLoanPledgeCollateral(e.target.checked)}
                                className="rounded border-white/20 bg-black/40 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                              />
                              <span className="flex items-center gap-1.5">
                                <ShieldCheck size={15} className="text-amber-400" />
                                <span>Pledge Physical or Account Collateral</span>
                                {curProd.collateralRequired && (
                                  <span className="text-[10px] text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full lowercase font-mono">
                                    mandatory
                                  </span>
                                )}
                              </span>
                            </label>

                            {loanPledgeCollateral && collateralValNum > 0 && (
                              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                                collateralCoverageRatio >= 100
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                              }`}>
                                {collateralCoverageRatio}% Coverage ({collateralCoverageRatio >= 100 ? "Low Risk" : "Partial"})
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-white/50 -mt-1">
                            Borrowers who pledge assets (vehicles, properties, rare items, or high-value vault holdings) receive higher borrowing caps and priority underwriting approval.
                          </p>

                          {(loanPledgeCollateral || curProd.collateralRequired) && (
                            <div className="space-y-4 pt-2 border-t border-white/5 animate-in fade-in">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-medium text-white/70 mb-1">Collateral Asset Category</label>
                                  <select
                                    value={loanCollateralType}
                                    onChange={(e) => setLoanCollateralType(e.target.value)}
                                    className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                                  >
                                    <option value="property">Real Estate / Land / Property Deed</option>
                                    <option value="vehicle">Motor Vehicle / Fleet / Aircraft</option>
                                    <option value="vault">Precious Commodities / Vault Bullion</option>
                                    <option value="equipment">Commercial Machinery / Industrial Equipment</option>
                                    <option value="inventory">Business Inventory / Stock Holding</option>
                                    <option value="license">Corporate License / Roleplay Enterprise</option>
                                    <option value="other">Other High-Value Secured Asset</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-xs font-medium text-white/70 mb-1">Estimated Asset Market Value ($)</label>
                                  <input
                                    type="number"
                                    min={0}
                                    step={100}
                                    value={loanCollateralVal}
                                    onChange={(e) => setLoanCollateralVal(e.target.value)}
                                    placeholder="e.g. 25000"
                                    className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-white/70 mb-1">
                                  Collateral Item & Location Description {curProd.collateralRequired ? "*" : ""}
                                </label>
                                <textarea
                                  value={loanCollateralDesc}
                                  onChange={(e) => setLoanCollateralDesc(e.target.value)}
                                  required={Boolean(curProd.collateralRequired)}
                                  placeholder="Provide specific details: item serial numbers, coordinates, registration plates, safe box numbers, or title documentation (e.g. 2024 Armored Schafter V12, Plate #VINE-01, parked in Legion Square private garage)."
                                  rows={2}
                                  className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 placeholder:text-white/30"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* SECTION 6: PURPOSE OF FINANCING & USE OF FUNDS */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 space-y-4">
                          <label className="text-xs font-semibold uppercase tracking-wider text-white/80 flex items-center gap-1.5">
                            <FileText size={14} className="text-pink-400" /> Purpose of Financing & Business Case
                          </label>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-white/70 mb-1">Financing Objective</label>
                              <select
                                value={loanPurposeCategory}
                                onChange={(e) => setLoanPurposeCategory(e.target.value)}
                                className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                              >
                                <option value="business">Commercial / Business Expansion</option>
                                <option value="property">Real Estate & Property Purchase</option>
                                <option value="vehicle">Vehicle & Fleet Acquisition</option>
                                <option value="equipment">Tools, Machinery & Equipment</option>
                                <option value="inventory">Wholesale Inventory / Goods</option>
                                <option value="consolidation">Debt & Credit Consolidation</option>
                                <option value="emergency">Personal & Emergency Liquidity</option>
                                <option value="other">Specialized Enterprise Need</option>
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-white/70 mb-1">
                                Specific Funding Need & Repayment Strategy *
                              </label>
                              <input
                                value={loanPurposeDetails}
                                onChange={(e) => setLoanPurposeDetails(e.target.value)}
                                required
                                placeholder="Explain what you need the funds for and how you plan to generate the cashflow for repayment."
                                className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/30"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Submit Action */}
                        <button
                          type="submit"
                          disabled={actionPending}
                          className="w-full py-4 rounded-2xl font-bold text-sm text-white shadow-xl transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                          style={btnBrand}
                        >
                          {actionPending ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Evaluating & Submitting Application…</span>
                            </>
                          ) : (
                            <>
                              <span>Submit Application for ${financedPrincipal.toLocaleString()} ({loanTermDuration} {loanTermUnit})</span>
                              <ArrowRight size={16} />
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </form>
              )
            )}

            {/* TAB: CARDS */}
            {applyTab === "card" && availableCatalogTabs.some(t => t.id === "card") && (
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
                        <div className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3.5 py-3 text-xs text-white/40 italic">
                          No active payment card options offered by this bank.
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-white/40">
                    Payment cards include instant freeze/unfreeze controls and support direct cash advances within configured credit limits.
                  </p>

                  <button
                    disabled={actionPending || cardProducts.length === 0}
                    className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={btnBrand}
                  >
                    {actionPending ? "Processing Card Request…" : cardProducts.length === 0 ? "No Card Products Available" : "Issue Payment Card"}
                  </button>
                </form>
              )
            )}

            {/* TAB: BONDS / TIME VAULTS */}
            {applyTab === "bond" && availableCatalogTabs.some(t => t.id === "bond") && (
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
            {applyTab === "escrow" && availableCatalogTabs.some(t => t.id === "escrow") && (
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

        {/* VIEW: ONYX PAYMENT SERVICE PROVIDER (PSP) & CLEARINGHOUSE */}
        {view === "onyx" && (
          <div className="space-y-6">
            {/* Onyx Hero & Header */}
            <div
              className="rounded-[28px] p-6 sm:p-8 relative overflow-hidden border"
              style={{
                background: "linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(18, 18, 28, 0.95) 75%)",
                borderColor: "rgba(99, 102, 241, 0.35)",
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                      <Zap size={11} className="fill-indigo-300 text-indigo-300" />
                      <span>Onyx Payment Service Provider (PSP)</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Clearinghouse Operational</span>
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    Discord Payments & Central Clearing
                  </h2>
                  <p className="text-xs sm:text-sm text-white/60 max-w-2xl">
                    Accept automated payments on your Corp Discord server with instant settlement into your bank account. Manage direct debit subscriptions and generate instant checkout terminals.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setBotInviteModalOpen(true)}
                    className="flex items-center gap-2 text-xs font-bold px-3.5 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white transition shadow-lg shadow-[#5865F2]/25 active:scale-95 cursor-pointer"
                  >
                    <Bot size={14} />
                    <span>Invite Onyx Bot</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (accounts.length > 0 && !newMerchantAccountId) {
                        const corpAcc = accounts.find((a: any) => a.accountType?.includes("business") || a.accountType?.includes("corp"));
                        setNewMerchantAccountId(corpAcc ? corpAcc.id : accounts[0].id);
                      }
                      setRegisterMerchantOpen(true);
                    }}
                    className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-600/30 active:scale-95 cursor-pointer"
                  >
                    <Store size={14} />
                    <span>Setup Corp Storefront</span>
                  </button>
                  <button
                    type="button"
                    onClick={loadOnyxData}
                    title="Refresh Onyx network telemetry"
                    className="p-2.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 text-white/70 hover:text-white transition cursor-pointer"
                  >
                    <RefreshCw size={14} className={loadingOnyx ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Network KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mt-6 pt-5 border-t border-white/10">
                <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-white/40">Connected Banks</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 tabular-nums">
                    {onyxStats ? `${onyxStats.activeBankCount} / ${onyxStats.totalBanksCount}` : `${bank ? 1 : 0} Online`}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">Real-time inter-bank wire</p>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-white/40">Active Merchants</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 tabular-nums">
                    {onyxStats ? onyxStats.totalMerchantsCount : (myMerchants.length || 0)}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">Discord & web checkouts</p>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-white/40">Onyx Volume</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 tabular-nums">
                    {onyxStats ? formatMoney(onyxStats.onyxVolumeCents || 0) : "$0.00"}
                  </p>
                  <p className="text-[10px] text-white/40 mt-0.5">Cleared PSP transactions</p>
                </div>

                <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-white/40">B2B Clearing Fee</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1 tabular-nums">
                    {onyxStats ? `${(onyxStats.b2bApiFeePercent / 100).toFixed(2)}%` : "2.00%"}
                  </p>
                  <p className="text-[10px] text-emerald-400 mt-0.5">0% same-bank settlement</p>
                </div>
              </div>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/10 rounded-2xl overflow-x-auto">
              {[
                { id: "overview", label: "Overview & Discord Guide", icon: Globe },
                { id: "merchants", label: `My Storefronts (${myMerchants.length})`, icon: Store },
                { id: "subscriptions", label: `Subscriptions (${subscriptions.length})`, icon: Repeat },
                { id: "paylinks", label: "Payment Links & Terminal", icon: QrCode },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = onyxSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOnyxSubTab(tab.id as any)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shrink-0 transition ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm font-bold"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SUBTAB: OVERVIEW & DISCORD SETUP GUIDE */}
            {onyxSubTab === "overview" && (
              <div className="space-y-6">
                {/* Discord Bot Setup & Invite Banner */}
                <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-[#5865F2]/15 via-indigo-950/30 to-purple-950/20 p-5 sm:p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#5865F2]/20 text-indigo-200 border border-[#5865F2]/30 flex items-center gap-1.5">
                          <Bot size={11} className="text-indigo-300" />
                          <span>Official Discord Bot</span>
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Slash Commands Ready</span>
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-white tracking-tight">Add Onyx Bot to Your Discord Server</h3>
                      <p className="text-xs text-white/60 max-w-xl leading-relaxed">
                        Invite the official Onyx Discord Bot to enable 1-click payment buttons, corporate store checkout commands, and automated customer receipt webhooks across your community channels.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setBotInviteModalOpen(true)}
                        className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white transition shadow-lg shadow-[#5865F2]/30 active:scale-95 cursor-pointer"
                      >
                        <Bot size={15} />
                        <span>Invite Bot to Server</span>
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div
                    onClick={() => {
                      if (accounts.length > 0 && !newMerchantAccountId) {
                        const corpAcc = accounts.find((a: any) => a.accountType?.includes("business") || a.accountType?.includes("corp"));
                        setNewMerchantAccountId(corpAcc ? corpAcc.id : accounts[0].id);
                      }
                      setRegisterMerchantOpen(true);
                    }}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-indigo-500/40 p-5 space-y-2.5 transition cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center group-hover:scale-110 transition">
                        <Store size={16} />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 group-hover:bg-indigo-500/20 transition">
                        <span>Launch</span>
                        <ArrowRight size={10} />
                      </span>
                    </div>
                    <h3 className="font-bold text-white text-base group-hover:text-indigo-200 transition">1. Register Storefront</h3>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Link your Corporate Bank Account to an Onyx Merchant ID. Funds paid by players will settle directly into your balance.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <MessageSquare size={16} />
                    </div>
                    <h3 className="font-bold text-white text-base">2. Discord Slash Command</h3>
                    <p className="text-xs text-white/50 leading-relaxed">
                      In your Discord server, use <code className="text-indigo-300 bg-white/5 px-1 py-0.5 rounded">/onyx checkout</code> to spawn 1-click payment buttons for your members.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <BellRing size={16} />
                    </div>
                    <h3 className="font-bold text-white text-base">3. Instant Webhook Alerts</h3>
                    <p className="text-xs text-white/50 leading-relaxed">
                      Paste a Discord channel webhook URL to receive instant payment notifications whenever a client completes a checkout.
                    </p>
                  </div>
                </div>

                {/* Discord Syntax Helper */}
                <div className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Terminal size={14} className="text-indigo-400" />
                      <span>Discord Bot Command Syntax</span>
                    </span>
                    <span className="text-[11px] text-white/40">Use with the official Onyx Discord Bot</span>
                  </div>
                  <div className="p-3 bg-black/60 border border-white/5 rounded-xl font-mono text-xs text-indigo-200 flex items-center justify-between gap-2 overflow-x-auto">
                    <code>
                      /onyx checkout merchant:{myMerchants[0]?.slug || myMerchants[0]?.id || "your-store"} amount:50.00 memo:Rank Upgrade
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(`/onyx checkout merchant:${myMerchants[0]?.slug || myMerchants[0]?.id || "your-store"} amount:50.00 memo:Rank Upgrade`, "copy_cmd_overview")}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-sans font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded transition"
                    >
                      {copied === "copy_cmd_overview" ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied === "copy_cmd_overview" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-white/40">
                    Supports quotes via <code className="text-indigo-300">/onyx quote</code> or web checkout links with payment from any Slate bank.
                  </p>
                </div>
              </div>
            )}

            {/* SUBTAB: MERCHANTS & DISCORD STOREFRONTS */}
            {onyxSubTab === "merchants" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Your Registered Storefronts</h3>
                    <p className="text-xs text-white/40 mt-0.5">Merchants hooked directly to your personal or corporate accounts.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (accounts.length > 0 && !newMerchantAccountId) {
                        const corpAcc = accounts.find((a: any) => a.accountType?.includes("business") || a.accountType?.includes("corp"));
                        setNewMerchantAccountId(corpAcc ? corpAcc.id : accounts[0].id);
                      }
                      setRegisterMerchantOpen(true);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white transition border border-white/10"
                  >
                    <Plus size={13} />
                    <span>New Storefront</span>
                  </button>
                </div>

                {myMerchants.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 p-8 text-center bg-white/[0.02] space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center mx-auto">
                      <Store size={24} />
                    </div>
                    <h4 className="font-bold text-white text-base">No Onyx Storefronts Registered Yet</h4>
                    <p className="text-xs text-white/40 max-w-md mx-auto">
                      Register your Corporate Bank Account as an Onyx checkout terminal to accept payments on Discord or online.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRegisterMerchantOpen(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-lg"
                    >
                      Register First Storefront
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {myMerchants.map((m: any) => (
                      <div key={m.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4 hover:border-white/20 transition">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-lg text-white">{m.name}</h4>
                              <span className="text-[10px] font-mono text-white/40 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
                                {m.id}
                              </span>
                            </div>
                            <p className="text-xs text-white/50 flex items-center gap-2">
                              <span>Settlement Account:</span>
                              <strong className="text-white font-medium flex items-center gap-1">
                                <Building2 size={12} className="text-amber-400" />
                                {m.destinationAccountName || m.destinationAccount}
                              </strong>
                              {m.bankName && <span className="text-white/40">· {m.bankName}</span>}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openManageProducts(m)}
                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition"
                            >
                              <ShoppingBag size={12} />
                              <span>Products ({m.productsCount || 0})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openWebhookSetup(m)}
                              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${
                                m.hasWebhook
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                  : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                              }`}
                            >
                              <Bell size={12} />
                              <span>{m.hasWebhook ? "Webhook Active" : "Setup Webhook"}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRollMerchantKey(m.id)}
                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition"
                              title="Regenerate API Key"
                            >
                              <Key size={12} />
                              <span>Roll Key</span>
                            </button>
                          </div>
                        </div>

                        {/* Discord Command Bar */}
                        <div className="p-3 bg-black/40 border border-white/5 rounded-xl space-y-1.5 text-xs font-mono">
                          <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-white/40 block">Discord Slash Command:</span>
                          <div className="flex items-center justify-between gap-2 overflow-x-auto">
                            <code className="text-indigo-300">
                              /onyx checkout merchant:{m.slug || m.id} amount:25.00
                            </code>
                            <button
                              type="button"
                              onClick={() => copy(`/onyx checkout merchant:${m.slug || m.id} amount:25.00`, `cmd_${m.id}`)}
                              className="shrink-0 flex items-center gap-1 font-sans text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2 py-0.5 rounded transition"
                            >
                              {copied === `cmd_${m.id}` ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copied === `cmd_${m.id}` ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between text-xs text-white/40 pt-1 border-t border-white/5 gap-2">
                          <div className="flex items-center gap-2">
                            <span>API Key:</span>
                            <code className="font-mono text-white/60">••••••••-{m.apiKeyLast4 || "live"}</code>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => copy(`${window.location.origin}/onyx/checkout?merchantId=${m.id}`, `url_${m.id}`)}
                              className="hover:text-white flex items-center gap-1 text-[11px]"
                            >
                              {copied === `url_${m.id}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              <span>Copy Checkout Link</span>
                            </button>
                            <span>·</span>
                            <Link
                              to={`/onyx/checkout?merchantId=${m.id}`}
                              target="_blank"
                              className="text-indigo-400 hover:underline flex items-center gap-1 text-[11px]"
                            >
                              <span>Test Checkout</span>
                              <ExternalLink size={11} />
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB: SUBSCRIPTIONS & DIRECT DEBIT MANDATES */}
            {onyxSubTab === "subscriptions" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">Direct Debit Mandates & Subscriptions</h3>
                    <p className="text-xs text-white/40 mt-0.5">Automated recurring billing debited on weekly or monthly schedules.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (accounts[0]) setSubFromAccount(accounts[0].id);
                      setShowAddSubModal(true);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
                  >
                    <Plus size={13} />
                    <span>New Subscription</span>
                  </button>
                </div>

                {subscriptions.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 p-8 text-center bg-white/[0.02] space-y-2">
                    <p className="text-white/40 text-sm">No active or pending subscriptions found for your accounts.</p>
                    <p className="text-xs text-white/30">Set up recurring direct debit payments for rent, clan dues, or retainers.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 divide-y divide-white/5 bg-white/[0.02] overflow-hidden">
                    {subscriptions.map((s: any) => {
                      const isCustomer = accounts.some((a: any) => a.id === s.customerAccountId);
                      const isBiller = accounts.some((a: any) => a.id === s.billerAccountId);
                      return (
                        <div key={s.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              s.isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-white/5 text-white/40"
                            }`}>
                              <Repeat size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-white">{s.description || "Recurring Payment"}</h4>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.2 rounded-full ${
                                  s.isActive ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25" : "bg-white/10 text-white/40"
                                }`}>
                                  {s.isActive ? "Active" : "Paused"}
                                </span>
                                <span className="text-[10px] font-mono text-white/40 uppercase">
                                  {s.frequency}
                                </span>
                              </div>
                              <p className="text-xs text-white/40 mt-0.5">
                                {isCustomer ? `Paying to ${s.billerAccountName || "Merchant"}` : `Billing from ${s.customerAccountName || "Customer"}`}
                                {s.nextRun && ` · Next run: ${format(new Date(s.nextRun), "MMM d, yyyy")}`}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span className="font-mono text-base font-bold text-white tabular-nums">
                              {formatMoney(s.amount)}
                            </span>
                            <button
                              type="button"
                              disabled={subTogglingId === s.id}
                              onClick={async () => {
                                setSubTogglingId(s.id);
                                try {
                                  const res = await fetch(`/api/portal/${bankId}/subscriptions/${s.id}/toggle`, { method: "POST" });
                                  if (res.ok) {
                                    handleSearch();
                                  } else {
                                    flash("Failed to toggle subscription");
                                  }
                                } catch {
                                  flash("Error updating subscription");
                                }
                                setSubTogglingId(null);
                              }}
                              className={`p-2 rounded-xl text-xs font-semibold border transition ${
                                s.isActive
                                  ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/20"
                                  : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/20"
                              }`}
                              title={s.isActive ? "Pause direct debits" : "Resume recurring billing"}
                            >
                              {s.isActive ? <Pause size={13} /> : <Play size={13} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB: PAYMENT LINKS & TERMINAL GENERATOR */}
            {onyxSubTab === "paylinks" && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <QrCode size={16} className="text-indigo-400" />
                      <span>Generate Instant Onyx Checkout Link</span>
                    </h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      Create shareable payment links that players can click in Discord channels, web embeds, or direct messages.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">
                        Select Storefront
                      </label>
                      <select
                        value={quickPayLinkMerchantId || (myMerchants[0]?.id || "")}
                        onChange={(e) => setQuickPayLinkMerchantId(e.target.value)}
                        className="w-full bg-[#18181c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white [&>option]:bg-[#18181c] [&>option]:text-white"
                      >
                        {myMerchants.map((m: any) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">
                        Amount ($ USD)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Leave blank for customer input"
                        value={quickPayLinkAmount}
                        onChange={(e) => setQuickPayLinkAmount(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">
                        Order Memo / Note
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. VIP Subscription"
                        value={quickPayLinkMemo}
                        onChange={(e) => setQuickPayLinkMemo(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  {(() => {
                    const targetMchId = quickPayLinkMerchantId || myMerchants[0]?.id || "merchant_id";
                    const amtParam = quickPayLinkAmount ? `&amount=${parseFloat(quickPayLinkAmount).toFixed(2)}` : "";
                    const memoParam = quickPayLinkMemo ? `&memo=${encodeURIComponent(quickPayLinkMemo)}` : "";
                    const fullUrl = `${window.location.origin}/onyx/checkout?merchantId=${targetMchId}${amtParam}${memoParam}`;
                    const discordMarkdown = `[💳 Click here to pay ${quickPayLinkAmount ? `$${quickPayLinkAmount}` : "via Onyx"}](<${fullUrl}>)`;

                    return (
                      <div className="space-y-3 pt-2 border-t border-white/5">
                        <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">Direct URL:</span>
                          <div className="flex items-center justify-between gap-2 overflow-x-auto font-mono text-xs text-indigo-300">
                            <span className="truncate">{fullUrl}</span>
                            <button
                              type="button"
                              onClick={() => copy(fullUrl, "copy_full_url")}
                              className="shrink-0 flex items-center gap-1 font-sans text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded transition"
                            >
                              {copied === "copy_full_url" ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copied === "copy_full_url" ? "Copied" : "Copy Link"}</span>
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">Discord Markdown Embed Code:</span>
                          <div className="flex items-center justify-between gap-2 overflow-x-auto font-mono text-xs text-white/70">
                            <span className="truncate">{discordMarkdown}</span>
                            <button
                              type="button"
                              onClick={() => copy(discordMarkdown, "copy_discord_md")}
                              className="shrink-0 flex items-center gap-1 font-sans text-[11px] font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/15 px-2.5 py-1 rounded transition"
                            >
                              {copied === "copy_discord_md" ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copied === "copy_discord_md" ? "Copied" : "Copy Markdown"}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30" style={{ borderTop: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(16px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-around">
          {nav.map((n) => {
            const Icon = n.icon;
            const on = view === n.id;
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

      {/* ONYX: Register Storefront Modal (Touch-friendly & Mobile Responsive) */}
      <AnimatePresence>
        {registerMerchantOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto text-left"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <Store size={16} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                      Onyx Merchant PSP
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Register Storefront</h3>
                  <p className="text-xs text-white/50">
                    Create a merchant terminal to accept 1-click Discord & web payments directly into your account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRegisterMerchantOpen(false)}
                  className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleRegisterMerchant} className="space-y-5">
                {/* Storefront Name */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                    Storefront / Business Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newMerchantName}
                    onChange={(e) => setNewMerchantName(e.target.value)}
                    placeholder="e.g. Acme Corporation, Skyblock Shop, or Apex Armory"
                    className="w-full bg-[#161622] border border-white/15 hover:border-white/25 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition font-medium"
                    autoFocus
                  />
                </div>

                {/* Settlement Account Selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                      Settlement Bank Account *
                    </label>
                    <span className="text-[11px] text-emerald-400 font-mono">0% Same-Bank Fee</span>
                  </div>
                  <div className="relative">
                    <select
                      required
                      value={newMerchantAccountId || (accounts[0]?.id || "")}
                      onChange={(e) => setNewMerchantAccountId(e.target.value)}
                      className="w-full bg-[#161622] border border-white/15 hover:border-white/25 rounded-2xl px-4 py-3.5 text-sm font-semibold text-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition appearance-none cursor-pointer"
                    >
                      {accounts.map((a: any) => {
                        const isCorp = a.accountType?.includes("business") || a.accountType?.includes("corp");
                        return (
                          <option key={a.id} value={a.id} className="bg-[#161622] text-white">
                            {a.accountName} {isCorp ? "[CORP / RECOMMENDED]" : ""} — {formatMoney(a.balance)}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  </div>
                  <p className="text-[11px] text-white/40">
                    All player checkouts will automatically settle directly into this account in real time.
                  </p>
                </div>

                {/* Info Card */}
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1 text-xs">
                  <p className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <Zap size={13} />
                    <span>Instant Discord Integration</span>
                  </p>
                  <p className="text-white/60">
                    Once registered, you'll receive a live API Key and Discord slash command syntax to drop buttons in your server.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setRegisterMerchantOpen(false)}
                    className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs sm:text-sm transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={registeringMerchant || !newMerchantName.trim()}
                    className="flex-[2] py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-indigo-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {registeringMerchant ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Registering Storefront…</span>
                      </>
                    ) : (
                      <>
                        <Store size={16} />
                        <span>Register Storefront</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONYX: New Merchant Success Modal */}
      <AnimatePresence>
        {newMerchantSuccess && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-5 shadow-2xl relative max-h-[92vh] overflow-y-auto text-left"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 size={30} />
              </div>

              <div className="text-center space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full font-mono">
                  Storefront Operational
                </span>
                <h3 className="text-xl font-black text-white mt-1">"{newMerchantSuccess.name}" Created</h3>
                <p className="text-xs text-white/50 max-w-xs mx-auto">
                  Your Onyx merchant terminal is active and ready to process payments.
                </p>
              </div>

              {/* API Key Box */}
              {newMerchantSuccess.apiKey && (
                <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-300 flex items-center gap-1.5">
                      <Key size={13} />
                      <span>Live Merchant API Key (Copy Now)</span>
                    </span>
                    <span className="text-[10px] text-white/40">Only shown once</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-black/60 border border-white/5 rounded-xl font-mono text-xs text-amber-200">
                    <span className="truncate select-all">{newMerchantSuccess.apiKey}</span>
                    <button
                      type="button"
                      onClick={() => copy(newMerchantSuccess.apiKey, "new_mch_key")}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-sans font-bold text-black bg-amber-400 hover:bg-amber-300 px-2.5 py-1 rounded transition"
                    >
                      {copied === "new_mch_key" ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copied === "new_mch_key" ? "Copied" : "Copy Key"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Discord Slash Command Bar */}
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">
                  Discord Slash Command:
                </span>
                <div className="flex items-center justify-between gap-2 p-2.5 bg-black/60 border border-white/5 rounded-xl font-mono text-xs text-indigo-200 overflow-x-auto">
                  <code className="truncate">
                    /onyx checkout merchant:{newMerchantSuccess.slug || newMerchantSuccess.id} amount:25.00
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(`/onyx checkout merchant:${newMerchantSuccess.slug || newMerchantSuccess.id} amount:25.00`, "new_mch_cmd")}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-sans font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded transition"
                  >
                    {copied === "new_mch_cmd" ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied === "new_mch_cmd" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setNewMerchantSuccess(null)}
                  className="w-full py-3.5 rounded-2xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-lg"
                >
                  Done & View Storefronts
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONYX: Manage Products Modal */}
      <AnimatePresence>
        {managingProductsMerchant && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-xl space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto text-left"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <ShoppingBag size={16} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                      Product Catalog
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white">{managingProductsMerchant.name} · Catalog</h3>
                  <p className="text-xs text-white/50">
                    Define predefined products so players can buy specific items via Discord commands or checkout links.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagingProductsMerchant(null)}
                  className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Add Product Form */}
              <form onSubmit={handleAddMerchantProduct} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={13} className="text-indigo-400" />
                  <span>Add New Product to Catalog</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    placeholder="Product Name (e.g. VIP Rank)"
                    className="w-full bg-[#161622] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required={newProductPriceType === "fixed"}
                      disabled={newProductPriceType === "custom_customer"}
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      placeholder={newProductPriceType === "custom_customer" ? "Custom Amount" : "Price ($)"}
                      className="w-full bg-[#161622] border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setNewProductPriceType(prev => prev === "fixed" ? "custom_customer" : "fixed")}
                      className={`px-2.5 py-2.5 rounded-xl text-[10px] font-bold uppercase shrink-0 border transition ${
                        newProductPriceType === "custom_customer"
                          ? "bg-indigo-600 text-white border-indigo-500"
                          : "bg-white/5 text-white/60 border-white/10"
                      }`}
                      title="Allow buyer to enter custom amount (e.g. donation)"
                    >
                      {newProductPriceType === "custom_customer" ? "Variable" : "Fixed"}
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  placeholder="Short Description (optional)"
                  className="w-full bg-[#161622] border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="submit"
                  disabled={addingProduct || !newProductName.trim()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {addingProduct ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  <span>Add Product</span>
                </button>
              </form>

              {/* Products List */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-white/60 uppercase tracking-wider block">
                  Active Products ({merchantProductsList.length})
                </span>
                {loadingProducts ? (
                  <div className="py-8 text-center text-white/40 flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs">Loading product catalog…</span>
                  </div>
                ) : merchantProductsList.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01] text-center text-xs text-white/40">
                    No products added yet. Use the form above to add your first catalog item.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    {merchantProductsList.map((p: any) => (
                      <div key={p.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] transition">
                        <div>
                          <div className="flex items-center gap-2">
                            <h5 className="font-bold text-xs text-white">{p.name}</h5>
                            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded font-bold">
                              {p.priceType === "custom_customer" ? "Custom $" : formatMoney(p.priceCents || p.price)}
                            </span>
                          </div>
                          {p.description && <p className="text-[11px] text-white/40 mt-0.5">{p.description}</p>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteMerchantProduct(p.id)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Delete product"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setManagingProductsMerchant(null)}
                  className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONYX: Webhook Setup Modal */}
      <AnimatePresence>
        {managingWebhookMerchant && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto text-left"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <Bell size={16} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                      Discord Webhook
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white">{managingWebhookMerchant.name} · Alerts</h3>
                  <p className="text-xs text-white/50">
                    Receive instant Discord embed alerts in your staff or logs channel when a customer completes a checkout.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManagingWebhookMerchant(null)}
                  className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveWebhook} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                    Discord Channel Webhook URL
                  </label>
                  <input
                    type="url"
                    value={webhookUrlInput}
                    onChange={(e) => setWebhookUrlInput(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="w-full bg-[#161622] border border-white/15 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 font-mono"
                  />
                  <p className="text-[11px] text-white/40">
                    Leave blank and submit to remove active webhook notifications.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setManagingWebhookMerchant(null)}
                    className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingWebhook}
                    className="flex-[2] py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {savingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    <span>Save Webhook</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONYX: Rolled Key Modal */}
      <AnimatePresence>
        {rolledKeyModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-md space-y-5 shadow-2xl relative text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Key size={24} />
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-lg font-black text-white">New API Key Generated</h3>
                <p className="text-xs text-white/50">
                  Please copy and store this API key securely. It will not be shown again.
                </p>
              </div>

              <div className="p-3 bg-black/60 border border-white/10 rounded-xl space-y-2">
                <div className="flex items-center justify-between gap-2 overflow-x-auto font-mono text-xs text-amber-200">
                  <span className="truncate select-all">{rolledKeyModal.apiKey}</span>
                  <button
                    type="button"
                    onClick={() => copy(rolledKeyModal.apiKey, "rolled_key_copy")}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-sans font-bold text-black bg-amber-400 hover:bg-amber-300 px-2.5 py-1 rounded transition"
                  >
                    {copied === "rolled_key_copy" ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied === "rolled_key_copy" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRolledKeyModal(null)}
                className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SPLIT BILL MODAL */}
      <AnimatePresence>
        {splitBillModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto text-left"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
                      <Users size={16} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                      Split Settlement
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white">Split a Bill</h3>
                  <p className="text-xs text-white/50">
                    Split an expense evenly. Invoices will be dispatched directly to each participant's portal.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitBillModalOpen(false)}
                  className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSendSplit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                    Total Amount to Split ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={splitTotalAmount}
                    onChange={(e) => setSplitTotalAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#161622] border border-white/15 rounded-2xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                    Receiving Account *
                  </label>
                  <select
                    value={splitFromAccountId || accounts[0]?.id || ""}
                    onChange={(e) => setSplitFromAccountId(e.target.value)}
                    className="w-full bg-[#161622] border border-white/15 rounded-2xl px-4 py-3 text-xs font-semibold text-white focus:outline-none focus:border-indigo-400"
                  >
                    {accounts.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} — {formatMoney(a.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                    Description / Bill Purpose
                  </label>
                  <input
                    type="text"
                    value={splitDescription}
                    onChange={(e) => setSplitDescription(e.target.value)}
                    placeholder="e.g. Dinner, Clan Base Rent, Materials Order"
                    className="w-full bg-[#161622] border border-white/15 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                      Participants (Account Names or Discord IDs)
                    </label>
                    <button
                      type="button"
                      onClick={() => setSplitParticipants(prev => [...prev, ""])}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Person
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {splitParticipants.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          required
                          value={p}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSplitParticipants(prev => {
                              const copy = [...prev];
                              copy[idx] = val;
                              return copy;
                            });
                          }}
                          placeholder={`Participant #${idx + 1} account name`}
                          className="flex-1 bg-[#161622] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                        />
                        {splitParticipants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSplitParticipants(prev => prev.filter((_, i) => i !== idx))}
                            className="p-2 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {splitTotalAmount && parseFloat(splitTotalAmount) > 0 && (
                    <p className="text-[11px] text-indigo-300 font-mono mt-1">
                      Each person pays: <strong className="text-white font-bold">{formatMoney(Math.round((parseFloat(splitTotalAmount) / (splitParticipants.filter(Boolean).length + 1)) * 100))}</strong> (including you)
                    </p>
                  )}
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSplitBillModalOpen(false)}
                    className="flex-1 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={splitSubmitting || !splitTotalAmount || parseFloat(splitTotalAmount) <= 0}
                    className="flex-[2] py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {splitSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    <span>Send Split Requests</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ONYX: Bot Invite Modal */}
      <AnimatePresence>
        {botInviteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="bg-[#121218] border border-white/15 rounded-t-[32px] sm:rounded-3xl p-6 sm:p-8 w-full max-w-lg space-y-6 shadow-2xl relative max-h-[92vh] overflow-y-auto text-left"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#5865F2]/20 text-[#5865F2] flex items-center justify-center">
                      <Bot size={18} />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                      Discord Integration
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Invite Onyx Bot</h3>
                  <p className="text-xs text-white/50">
                    Authorize the official Onyx Payment Bot on your Discord server to enable slash commands and checkout buttons.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBotInviteModalOpen(false)}
                  className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Action / Invite Link */}
              {onyxStats?.botInviteUrl ? (
                <div className="space-y-3">
                  <a
                    href={onyxStats.botInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 rounded-2xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold text-sm shadow-xl shadow-[#5865F2]/30 transition flex items-center justify-center gap-2"
                  >
                    <Bot size={18} />
                    <span>Authorize & Add to Server</span>
                    <ExternalLink size={14} />
                  </a>

                  <div className="p-3 bg-black/50 border border-white/10 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block">Direct OAuth Link:</span>
                    <div className="flex items-center justify-between gap-2 font-mono text-xs text-indigo-200 overflow-x-auto">
                      <span className="truncate select-all">{onyxStats.botInviteUrl}</span>
                      <button
                        type="button"
                        onClick={() => copy(onyxStats.botInviteUrl, "bot_invite_url")}
                        className="shrink-0 flex items-center gap-1 font-sans text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1 rounded transition"
                      >
                        {copied === "bot_invite_url" ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copied === "bot_invite_url" ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
                  <p className="font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    <span>Discord Bot Configuration</span>
                  </p>
                  <p className="text-white/70 leading-relaxed">
                    The Onyx bot token or <code className="text-amber-200">DISCORD_CLIENT_ID</code> can be configured in Onyx System Settings by platform administrators.
                  </p>
                </div>
              )}

              {/* Unlocked Commands Feature List */}
              <div className="space-y-2.5 pt-1">
                <span className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                  Features Unlocked in Your Server
                </span>
                <div className="space-y-2 text-xs text-white/70">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-2.5">
                    <Terminal size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white font-mono block">/onyx checkout</strong>
                      <span className="text-white/50 text-[11px]">Spawn interactive 1-click checkout buttons with instant settlement into your bank account.</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-2.5">
                    <Terminal size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white font-mono block">/onyx quote</strong>
                      <span className="text-white/50 text-[11px]">Instant settlement quotes across inter-bank and same-bank accounts.</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-2.5">
                    <BellRing size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-white font-mono block">Channel Webhook Embeds</strong>
                      <span className="text-white/50 text-[11px]">Post instant receipts and transaction audit logs directly in your staff channels.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setBotInviteModalOpen(false)}
                  className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition"
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
