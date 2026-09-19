import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDownLeft, ArrowUpRight, Building2, Check, ChevronRight, Copy, CreditCard,
  FileText, Landmark, Loader2, Lock, LogIn, LogOut, Plus, Send, ShieldCheck,
  Sparkles, Unlock, Wallet, X, AlertTriangle, PiggyBank, Receipt, Clock, Link2
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
  const { user, login, linkDiscord, logout, isLoading, rememberMe, setRememberMe } = useAuth();

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
        })
        .catch(() => {});
    }
  }, [view, bankId]);

  const accounts = userData?.accounts || [];
  const netWorth = accounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);
  const loans = userData?.loans || [];
  const activeLoans = loans.filter((l: any) => ["active", "delinquent", "defaulted", "pending", "awaiting_signature"].includes(l.status));
  const invoices = (userData?.pendingInvoices || []).filter((i: any) => i.status !== "paid");
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
        flash("Sent.");
        setSendAmt("");
        setSendTo("");
        setSendMemo("");
        setQuote(null);
        setView("home");
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
    setActionPending(true);
    try {
      const res = await fetch("/api/citizen/accounts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankId, accountName: fd.get("accountName"), accountType: fd.get("accountType") || "personal" }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Could not open account");
      else {
        flash("Account opened.");
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
                  <button key={a.id} onClick={() => setView(a.id)} className="flex flex-col items-center gap-2 py-3 rounded-2xl border text-xs font-semibold" style={{ background: "color-mix(in oklab, var(--fg) 5%, transparent)", borderColor: "var(--border)" }}>
                    <a.icon size={16} />
                    {a.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {!user.linkedDiscordId && (
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
                          <p className="text-[11px] uppercase tracking-wider text-white/40">{acc.accountType || "personal"}</p>
                          <p className="font-bold mt-0.5">{acc.accountName}</p>
                        </div>
                        {acc.isFrozen && <span className="text-[10px] font-bold text-rose-300 bg-rose-500/15 px-2 py-0.5 rounded-full">Frozen</span>}
                      </div>
                      <p className="text-2xl font-black tabular-nums mt-4">{formatMoney(acc.balance)}</p>
                      <button onClick={() => copy(acc.id, acc.id)} className="mt-3 text-[11px] font-mono text-white/30 hover:text-white flex items-center gap-1">
                        {copied === acc.id ? <Check size={11} /> : <Copy size={11} />}
                        {acc.id.slice(0, 14)}…
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold tracking-wide uppercase text-white/50">Recent</h2>
                <button onClick={() => setView("activity")} className="text-xs font-bold text-white/50 hover:text-white">See all</button>
              </div>
              <div className="rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                {tx.slice(0, 6).length === 0 && <p className="p-5 text-sm text-white/40">No activity yet.</p>}
                {tx.slice(0, 6).map((t: any) => {
                  const inbound = accounts.some((a: any) => a.id === t.toAccountId);
                  return (
                    <div key={t.id} className="px-4 py-3.5 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${inbound ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/60"}`}>
                        {inbound ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{t.description || t.type}</p>
                        <p className="text-[11px] text-white/35">{t.timestamp ? format(new Date(t.timestamp), "MMM d · h:mm a") : ""}</p>
                      </div>
                      <p className={`font-mono text-sm font-bold ${inbound ? "text-emerald-300" : "text-white"}`}>
                        {inbound ? "+" : "−"}{formatMoney(t.amountReceived ?? t.amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {view === "send" && (
          <form onSubmit={sendNow} className="max-w-lg space-y-5">
            <h2 className="text-2xl font-black">Send money</h2>
            <label className="block text-xs font-bold text-white/40 uppercase">From</label>
            <select value={sendFrom} onChange={(e) => setSendFrom(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm">
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName} · {formatMoney(a.balance)}</option>)}
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
                    <div key={l.code} className="flex justify-between text-xs"><span className="text-white/35">{l.label}</span><span className="font-mono text-white/60">{formatMoney(l.amountCents)}</span></div>
                  ))}
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
            <h2 className="text-2xl font-black">Activity</h2>
            <div className="rounded-2xl border border-white/10 divide-y divide-white/5">
              {tx.length === 0 && <p className="p-6 text-white/40 text-sm">Nothing here yet.</p>}
              {tx.map((t: any) => {
                const inbound = accounts.some((a: any) => a.id === t.toAccountId);
                return (
                  <div key={t.id} className="px-4 py-3.5 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${inbound ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5"}`}>
                      {inbound ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{t.description || t.type}</p>
                      <p className="text-[11px] text-white/35">{t.timestamp ? format(new Date(t.timestamp), "MMM d, yyyy · h:mm a") : ""}</p>
                    </div>
                    <p className={`font-mono text-sm font-bold ${inbound ? "text-emerald-300" : ""}`}>{inbound ? "+" : "−"}{formatMoney(t.amountReceived ?? t.amount)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "borrow" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">Loans</h2>
              {settings.enableLoans !== false && (
                <button onClick={() => setView("apply")} className="text-xs font-bold px-3 py-2 rounded-xl" style={btnBrand}>Apply</button>
              )}
            </div>
            {activeLoans.length === 0 && <p className="text-white/40 text-sm">No loans. Apply any time from the Apply tab.</p>}
            {activeLoans.map((l: any) => (
              <div key={l.id} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <div className="flex justify-between">
                  <p className="font-bold">#{l.id.slice(0, 8)}</p>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">{l.status}</span>
                </div>
                <p className="text-2xl font-black tabular-nums">{formatMoney(l.remainingAmount ?? l.remainingBalance)}</p>
                <p className="text-xs text-white/40">of {formatMoney(l.principalAmount || l.amount)} · {(l.interestRate / 100).toFixed(2)}% APR</p>
                {["active", "delinquent", "defaulted"].includes(l.status) && (
                  <button onClick={() => setRepayingLoan(l)} className="text-sm font-bold" style={{ color: brand }}>Pay installment</button>
                )}
              </div>
            ))}
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
            <h2 className="text-2xl font-black">Pay</h2>
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Invoices</h3>
              {invoices.length === 0 && <p className="text-sm text-white/40">No unpaid invoices.</p>}
              {invoices.map((inv: any) => (
                <div key={inv.id} className="rounded-2xl border border-white/10 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-sm">{inv.description || "Invoice"}</p>
                    <p className="text-xs text-white/40">{formatMoney(inv.amount)}</p>
                  </div>
                  <select className="bg-white/5 border border-white/10 rounded-xl text-xs px-2 py-2" onChange={(e) => { if (e.target.value) payInvoice(inv.id, e.target.value); }}>
                    <option value="">Pay from…</option>
                    {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {merchants.length > 0 && (
              <form onSubmit={payMerchant} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Pay a merchant</h3>
                <select name="sourceAccountId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                </select>
                <select name="merchantId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  <option value="">Merchant…</option>
                  {merchants.map((m: any) => <option key={m.id} value={m.id}>{m.name}{m.bankName ? ` · ${m.bankName}` : ""}</option>)}
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

            <form onSubmit={openAccount} className="rounded-2xl border border-white/10 p-5 space-y-3">
              <h3 className="font-bold flex items-center gap-2"><Wallet size={16} /> Open an account</h3>
              <input name="accountName" required placeholder="Account name" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
              <select name="accountType" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                <option value="personal_checking">Personal checking</option>
                <option value="personal_savings">Savings</option>
                <option value="business_checking">Business</option>
              </select>
              <button disabled={actionPending} className="text-sm font-bold" style={{ color: brand }}>Open</button>
            </form>

            {settings.enableLoans !== false && (
              <form onSubmit={applyLoan} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="font-bold flex items-center gap-2"><Landmark size={16} /> Apply for a loan</h3>
                <select name="accountId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                </select>
                {loanProducts.length > 0 && (
                  <select name="productId" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                    <option value="">Standard terms</option>
                    {loanProducts.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name} — {(Number(p.interestRate) / (Number(p.interestRate) > 100 ? 100 : 1)).toFixed(2)}% · max {formatMoney(p.maxAmount)}</option>
                    ))}
                  </select>
                )}
                <input name="amount" type="number" step="0.01" min="10" required placeholder="Amount" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono" />
                <select name="termMonths" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                  <option value="24">24 months</option>
                </select>
                <input name="purpose" placeholder="Purpose" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
                <button disabled={actionPending} className="text-sm font-bold" style={{ color: brand }}>Submit application</button>
              </form>
            )}

            {settings.enableCards !== false && (
              <form onSubmit={requestCard} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="font-bold flex items-center gap-2"><CreditCard size={16} /> Request a card</h3>
                <select name="accountId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                </select>
                {cardProducts.length > 0 ? (
                  <select name="productId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                    {cardProducts.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.cardKind === "debit" ? "debit" : "credit"} · limit {formatMoney(p.maxLimit)} · {Number(p.interestRate).toFixed(2)}% APR
                        {p.tierId ? " · optional tier" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select name="cardType" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                    <option value="debit">Debit</option>
                  </select>
                )}
                <p className="text-[11px] text-white/35">Credit cards have a set limit for Onyx and cash advances. Tiers are optional — not required to apply.</p>
                <button disabled={actionPending} className="text-sm font-bold" style={{ color: brand }}>Request card</button>
              </form>
            )}

            {settings.enableVaults !== false && bondProducts.length > 0 && (
              <form onSubmit={buyBond} className="rounded-2xl border border-white/10 p-5 space-y-3">
                <h3 className="font-bold flex items-center gap-2"><PiggyBank size={16} /> Buy a bond</h3>
                <p className="text-xs text-white/40">Time-locked deposits. You earn the advertised yield if you hold to maturity.</p>
                <select name="accountId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName} · {formatMoney(a.balance)}</option>)}
                </select>
                <select name="lockDays" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                  {bondProducts.map((t: any) => (
                    <option key={t.lockDays} value={t.lockDays}>{t.lockDays} days · {(Number(t.interestRate) / 100).toFixed(2)}% · {t.penaltyPercent ?? 20}% early penalty</option>
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
              <button key={n.id} onClick={() => setView(n.id)} className="py-3 min-h-[52px] text-[11px] font-semibold flex flex-col items-center gap-1" style={{ color: on ? "var(--fg)" : "var(--fg-subtle)" }}>
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
              <select name="accountId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName} · {formatMoney(a.balance)}</option>)}
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
