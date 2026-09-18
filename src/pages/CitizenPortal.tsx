import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDownLeft, ArrowUpRight, Building2, ChevronRight, Landmark, Loader2,
  LogIn, LogOut, Send, Sparkles, Wallet, X
} from "lucide-react";

export function CitizenPortal() {
  const { user, login, logout, isLoading, rememberMe, setRememberMe } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"home" | "send" | "apply">("home");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [sendFrom, setSendFrom] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [feeMode, setFeeMode] = useState<"from_payment" | "sender_covers">("from_payment");
  const [quote, setQuote] = useState<any>(null);
  const [quoteErr, setQuoteErr] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [loanBankId, setLoanBankId] = useState("");
  const [loanProducts, setLoanProducts] = useState<any[]>([]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/citizen/lookup");
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { document.title = "Citizen Banking"; }, []);
  useEffect(() => { if (user) load(); }, [user]);

  useEffect(() => {
    if (!sendFrom || !sendTo || !sendAmt || sendFrom === sendTo) { setQuote(null); return; }
    const t = setTimeout(async () => {
      setQuoting(true); setQuoteErr("");
      try {
        const res = await fetch("/api/citizen/transfer/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromAccountId: sendFrom, toAccountId: sendTo, amount: sendAmt, feePayerMode: feeMode }),
        });
        const d = await res.json();
        if (!res.ok) { setQuote(null); setQuoteErr(d.error || "Quote failed"); }
        else setQuote(d.quote);
      } catch { setQuoteErr("Quote failed"); }
      setQuoting(false);
    }, 350);
    return () => clearTimeout(t);
  }, [sendFrom, sendTo, sendAmt, feeMode]);

  useEffect(() => {
    if (loanBankId) {
      fetch(`/api/portal/${loanBankId}/loan-products`).then(r => r.json()).then(d => setLoanProducts(Array.isArray(d) ? d : [])).catch(() => setLoanProducts([]));
    }
  }, [loanBankId]);

  const accounts = data?.accounts || [];
  const banks = data?.banks || [];
  const settings = data?.settings || [];
  const tx = data?.transactions || [];
  const loans = data?.loans || [];
  const invoices = (data?.invoices || []).filter((i: any) => i.status === "pending" || i.status === "overdue");
  const net = accounts.reduce((s: number, a: any) => s + (a.balance || 0), 0);

  const byBank = useMemo(() => {
    const map = new Map<string, { bank: any; settings: any; accounts: any[]; balance: number }>();
    for (const a of accounts) {
      const b = banks.find((x: any) => x.id === a.bankId) || { id: a.bankId, name: a.bankName };
      const s = settings.find((x: any) => x.bankId === a.bankId);
      const cur = map.get(a.bankId) || { bank: b, settings: s, accounts: [], balance: 0 };
      cur.accounts.push(a);
      cur.balance += a.balance || 0;
      map.set(a.bankId, cur);
    }
    // include banks with no accounts so they can still apply
    for (const b of banks) {
      if (!map.has(b.id)) map.set(b.id, { bank: b, settings: settings.find((x: any) => x.bankId === b.id), accounts: [], balance: 0 });
    }
    return [...map.values()];
  }, [accounts, banks, settings]);

  useEffect(() => {
    if (accounts[0] && !sendFrom) setSendFrom(accounts[0].id);
    if (byBank[0] && !loanBankId) setLoanBankId(byBank[0].bank.id);
  }, [accounts.length, byBank.length]);

  if (isLoading) return <div className="min-h-screen bg-[#07070b] text-white/40 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#07070b] text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(900px 400px at 30% -10%, rgba(99,102,241,0.25), transparent 60%)" }} />
        <div className="relative max-w-md mx-auto px-5 py-20 space-y-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center font-black text-2xl shadow-2xl shadow-indigo-500/30">S</div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Your banks, one wallet</h1>
            <p className="text-white/45 text-sm mt-2">Sign in to see balances, send with a live fee quote, and apply for products at any connected bank.</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-3">
            <label className="flex items-center justify-center gap-2 text-xs text-white/40">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember this device
            </label>
            <button onClick={() => login(undefined, "discord")} className="w-full py-3.5 rounded-2xl bg-[#5865F2] font-bold text-sm flex items-center justify-center gap-2">
              <LogIn size={16} /> Continue with Discord
            </button>
            <button onClick={() => login(undefined, "citycorp")} className="w-full py-3.5 rounded-2xl bg-indigo-600 font-bold text-sm">Continue with CityCorp</button>
          </div>
        </div>
      </div>
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/citizen/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId: sendFrom, toAccountId: sendTo, amount: sendAmt, feePayerMode: feeMode }),
      });
      const d = await res.json();
      if (!res.ok) flash(d.error || "Transfer failed");
      else { flash("Sent."); setSendAmt(""); setSendTo(""); setView("home"); load(); }
    } catch { flash("Network error"); }
    setPending(false);
  };

  const applyLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setPending(true);
    try {
      const res = await fetch(`/api/portal/${loanBankId}/request-loan`, {
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
      else { flash(d.autoApprove ? "Approved and funded." : "Application submitted."); setView("home"); load(); }
    } catch { flash("Could not apply"); }
    setPending(false);
  };

  return (
    <div className="min-h-screen bg-[#07070b] text-white">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#07070b]/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div>
            <p className="font-black tracking-tight">Citizen</p>
            <p className="text-[11px] text-white/35">Network wallet</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("send")} className="hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-600">
              <Send size={12} /> Send
            </button>
            <button onClick={logout} className="p-2 text-white/40 hover:text-white"><LogOut size={16} /></button>
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-white/10 flex items-center justify-center text-xs font-bold">
              {user.username?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 pb-24 space-y-6">
        {view === "home" && (
          <>
            <div className="rounded-[28px] p-7 bg-gradient-to-br from-indigo-600/40 to-[#0c0c12] border border-white/10">
              <p className="text-white/50 text-sm">Across {byBank.filter(b => b.accounts.length).length || banks.length} bank{(byBank.length === 1) ? "" : "s"}</p>
              <p className="text-4xl sm:text-5xl font-black tabular-nums mt-2">{formatMoney(net)}</p>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setView("send")} className="px-4 py-2 rounded-xl bg-white text-black text-sm font-bold flex items-center gap-1.5"><Send size={14} /> Send</button>
                <button onClick={() => setView("apply")} className="px-4 py-2 rounded-xl bg-white/10 text-sm font-bold flex items-center gap-1.5"><Sparkles size={14} /> Apply</button>
              </div>
            </div>

            {loans.filter((l: any) => ["delinquent", "defaulted"].includes(l.status)).length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">You have a loan past due. Open the bank to pay.</div>
            )}

            <section className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Banks</h2>
              {loading && <div className="h-24 bg-white/5 rounded-2xl animate-pulse" />}
              {byBank.map((row) => {
                const color = row.bank.brandingColor || "#6366f1";
                return (
                  <Link key={row.bank.id} to={`/portal/${row.bank.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-white/20 transition">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black" style={{ background: color }}>
                        {(row.bank.name || "?").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{row.bank.name}</p>
                        <p className="text-xs text-white/40">{row.settings?.tagline || `${row.accounts.length} account${row.accounts.length === 1 ? "" : "s"}`}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black tabular-nums">{formatMoney(row.balance)}</p>
                        <p className="text-[11px] text-white/35 flex items-center justify-end gap-0.5">Open <ChevronRight size={12} /></p>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {byBank.length === 0 && <p className="text-sm text-white/40">No banks on this network yet.</p>}
            </section>

            {invoices.length > 0 && (
              <section>
                <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Unpaid invoices</h2>
                {invoices.slice(0, 5).map((i: any) => (
                  <div key={i.id} className="flex justify-between text-sm py-2 border-b border-white/5">
                    <span>{i.description || "Invoice"}</span>
                    <span className="font-mono">{formatMoney(i.amount)}</span>
                  </div>
                ))}
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Recent</h2>
              <div className="rounded-2xl border border-white/10 divide-y divide-white/5">
                {tx.slice(0, 8).length === 0 && <p className="p-4 text-sm text-white/40">No activity.</p>}
                {tx.slice(0, 8).map((t: any) => {
                  const inbound = accounts.some((a: any) => a.id === t.toAccountId);
                  return (
                    <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${inbound ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5"}`}>
                        {inbound ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{t.description || t.type}</p>
                        <p className="text-[11px] text-white/35">{t.timestamp ? format(new Date(t.timestamp), "MMM d") : ""}</p>
                      </div>
                      <p className={`font-mono text-sm ${inbound ? "text-emerald-300" : ""}`}>{inbound ? "+" : "−"}{formatMoney(t.amount)}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {view === "send" && (
          <form onSubmit={send} className="max-w-lg space-y-4">
            <h2 className="text-2xl font-black">Send</h2>
            <select value={sendFrom} onChange={(e) => setSendFrom(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm">
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.bankName} · {a.accountName} · {formatMoney(a.balance)}</option>)}
            </select>
            <input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="Destination account ID" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-mono" required />
            <input value={sendAmt} onChange={(e) => setSendAmt(e.target.value)} type="number" step="0.01" min="0.01" placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-2xl font-black" required />
            <div className="flex rounded-2xl bg-white/5 p-1 text-xs font-bold">
              <button type="button" onClick={() => setFeeMode("from_payment")} className={`flex-1 py-2 rounded-xl ${feeMode === "from_payment" ? "bg-white/10" : "text-white/40"}`}>Fees from payment</button>
              <button type="button" onClick={() => setFeeMode("sender_covers")} className={`flex-1 py-2 rounded-xl ${feeMode === "sender_covers" ? "bg-white/10" : "text-white/40"}`}>I cover fees</button>
            </div>
            <div className="rounded-2xl border border-white/10 p-4 text-sm min-h-[88px]">
              {quoting && <p className="text-white/40">Quoting…</p>}
              {quoteErr && <p className="text-rose-300 text-xs">{quoteErr}</p>}
              {quote && (
                <>
                  <div className="flex justify-between"><span className="text-white/40">You send</span><span className="font-mono font-bold">{formatMoney(quote.submittedCents)}</span></div>
                  <div className="flex justify-between"><span className="text-white/40">They receive</span><span className="font-mono font-bold text-emerald-300">{formatMoney(quote.receivedCents)}</span></div>
                  {quote.lines?.map((l: any) => (
                    <div key={l.code} className="flex justify-between text-xs"><span className="text-white/35">{l.label}</span><span className="font-mono">{formatMoney(l.amountCents)}</span></div>
                  ))}
                </>
              )}
            </div>
            <button disabled={pending} className="w-full py-3.5 rounded-2xl bg-indigo-600 font-bold">{pending ? "Sending…" : "Confirm"}</button>
            <button type="button" onClick={() => setView("home")} className="w-full text-xs text-white/40">Back</button>
          </form>
        )}

        {view === "apply" && (
          <div className="max-w-lg space-y-5">
            <h2 className="text-2xl font-black">Apply</h2>
            <p className="text-sm text-white/45">Pick a bank, then apply. Each bank sets its own products and rates.</p>
            <div className="flex flex-wrap gap-2">
              {byBank.map((row) => (
                <button key={row.bank.id} onClick={() => setLoanBankId(row.bank.id)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${loanBankId === row.bank.id ? "bg-indigo-600 border-indigo-500" : "border-white/10 text-white/50"}`}>
                  {row.bank.name}
                </button>
              ))}
            </div>
            {loanBankId && (
              <>
                <Link to={`/portal/${loanBankId}`} className="block rounded-2xl border border-white/10 p-4 text-sm hover:border-white/20">
                  Open {byBank.find(b => b.bank.id === loanBankId)?.bank.name} portal for cards, vaults, and bills →
                </Link>
                <form onSubmit={applyLoan} className="rounded-2xl border border-white/10 p-5 space-y-3">
                  <h3 className="font-bold flex items-center gap-2"><Landmark size={16} /> Loan</h3>
                  <select name="accountId" required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                    {accounts.filter((a: any) => a.bankId === loanBankId).map((a: any) => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                  </select>
                  {loanProducts.length > 0 && (
                    <select name="productId" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                      <option value="">Standard terms</option>
                      {loanProducts.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <input name="amount" type="number" step="0.01" min="10" required placeholder="Amount" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono text-sm" />
                  <select name="termMonths" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="24">24 months</option>
                  </select>
                  <input name="purpose" placeholder="Purpose" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
                  <button disabled={pending} className="text-sm font-bold text-indigo-300">Submit</button>
                </form>
              </>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 border-t border-white/10 bg-[#07070b]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto grid grid-cols-3">
          {[
            { id: "home" as const, label: "Home", icon: Wallet },
            { id: "send" as const, label: "Send", icon: Send },
            { id: "apply" as const, label: "Apply", icon: Sparkles },
          ].map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} className={`py-3 text-[11px] font-bold flex flex-col items-center gap-1 ${view === n.id ? "text-white" : "text-white/35"}`}>
              <n.icon size={18} /> {n.label}
            </button>
          ))}
        </div>
      </nav>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-white text-black text-sm font-bold px-4 py-2 rounded-full z-50">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
