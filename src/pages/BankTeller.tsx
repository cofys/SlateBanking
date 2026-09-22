import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatMoney } from "../lib/utils";
import { Loader2, Search, Send, User } from "lucide-react";

export function BankTeller() {
  const { bankId } = useParams();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [feeMode, setFeeMode] = useState<"from_payment" | "sender_covers">("from_payment");
  const [quote, setQuote] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/banks/${bankId}/accounts`).then(r => r.json()).then(d => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
  }, [bankId]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    setMsg("");
    try {
      const res = await fetch(`/api/banks/${bankId}/teller/search?q=${encodeURIComponent(q.trim())}`);
      const d = await res.json();
      setResult(d);
      if (d.accounts?.[0]) setToId(d.accounts[0].id);
    } catch { setMsg("Search failed"); }
    setSearching(false);
  };

  useEffect(() => {
    if (!fromId || !toId || !amount) { setQuote(null); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/banks/${bankId}/teller/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId: fromId, toAccountId: toId, amount, feePayerMode: feeMode }),
      });
      const d = await res.json();
      setQuote(res.ok ? d.quote : null);
      if (!res.ok) setMsg(d.error || "");
    }, 300);
    return () => clearTimeout(t);
  }, [fromId, toId, amount, feeMode, bankId]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setMsg("");
    try {
      const res = await fetch(`/api/banks/${bankId}/teller/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId: fromId, toAccountId: toId, amount, feePayerMode: feeMode, description: "Teller counter transfer" }),
      });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "Failed");
      else {
        setMsg(`Posted. They receive ${formatMoney(d.quote?.receivedCents)}.`);
        setAmount("");
        search();
      }
    } catch { setMsg("Network error"); }
    setPending(false);
  };

  return (
    <div className="max-w-5xl grid lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-black text-white flex items-center gap-2"><User className="text-indigo-400" /> Teller</h1>
        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-3.5 text-white/30" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Discord, Minecraft, RP name, account…" className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
          </div>
          <button className="px-4 rounded-xl bg-indigo-600 font-bold text-sm">{searching ? <Loader2 className="animate-spin" size={14} /> : "Find"}</button>
        </form>

        {result && (
          <div className="space-y-3">
            {(result.customers || []).map((c: any) => (
              <div key={c.id} className="rounded-2xl border border-white/10 p-4">
                <p className="font-bold">{c.rpName || c.mcUsername || c.discordId}</p>
                <p className="text-xs text-white/40 font-mono">{c.discordId} {c.mcUsername ? `· ${c.mcUsername}` : ""}</p>
                <Link to={`/bank/${bankId}/customers/${c.discordId}`} className="text-xs text-indigo-300 font-bold">Customer file →</Link>
              </div>
            ))}
            {(result.accounts || []).map((a: any) => (
              <button key={a.id} onClick={() => setToId(a.id)} className={`w-full text-left rounded-2xl border p-4 ${toId === a.id ? "border-indigo-500 bg-indigo-500/10" : "border-white/10"}`}>
                <div className="flex justify-between">
                  <p className="font-bold">{a.accountName}</p>
                  <p className="font-mono">{formatMoney(a.balance)}</p>
                </div>
                <p className="text-[11px] text-white/35 font-mono">{a.id} {a.isFrozen ? "· FROZEN" : ""}</p>
              </button>
            ))}
            {(result.loans || []).length > 0 && (
              <div className="text-xs text-white/50">
                Loans: {result.loans.map((l: any) => `#${l.id.slice(0, 8)} ${l.status} ${formatMoney(l.remainingAmount)}`).join(" · ")}
                {" "}<Link to={`/bank/${bankId}/collections`} className="text-indigo-300">Collections →</Link>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={send} className="rounded-2xl border border-white/10 bg-[#0d0d14] p-6 space-y-4 h-fit">
        <h2 className="font-bold flex items-center gap-2"><Send size={16} /> Counter transfer</h2>
        <p className="text-xs text-white/40">Quote city tax + bank fee before you post. Pick fees-from-payment or sender-covers.</p>
        <label className="text-[11px] uppercase tracking-wider text-white/40">From (vault / operating / customer)</label>
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
          <option value="">Select source…</option>
          {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.accountName} · {formatMoney(a.balance)}</option>)}
        </select>
        <label className="text-[11px] uppercase tracking-wider text-white/40">To</label>
        <select value={toId} onChange={(e) => setToId(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm">
          <option value="">Select destination…</option>
          {(result?.accounts?.length ? result.accounts : accounts).map((a: any) => <option key={a.id} value={a.id}>{a.accountName} · {formatMoney(a.balance)}</option>)}
        </select>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" min="0.01" placeholder="Amount" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 font-mono" required />
        <div className="flex rounded-xl bg-white/5 p-1 text-xs font-bold">
          <button type="button" onClick={() => setFeeMode("from_payment")} className={`flex-1 py-2 rounded-lg ${feeMode === "from_payment" ? "bg-white/10" : "text-white/40"}`}>From payment</button>
          <button type="button" onClick={() => setFeeMode("sender_covers")} className={`flex-1 py-2 rounded-lg ${feeMode === "sender_covers" ? "bg-white/10" : "text-white/40"}`}>Sender covers</button>
        </div>
        {quote && (
          <div className="text-sm space-y-1 border border-white/10 rounded-xl p-3">
            <div className="flex justify-between"><span className="text-white/40">Submitted</span><span className="font-mono">{formatMoney(quote.submittedCents)}</span></div>
            <div className="flex justify-between"><span className="text-white/40">Received</span><span className="font-mono text-emerald-300">{formatMoney(quote.receivedCents)}</span></div>
            {quote.lines?.map((l: any) => (
              <div key={l.code} className="flex justify-between text-xs"><span className="text-white/35">{l.label} ({Number((l.rate * 100).toFixed(2))}%)</span><span className="font-mono">{formatMoney(l.amountCents)}</span></div>
            ))}
            {quote.lines && quote.lines.length > 1 && (
              <div className="flex justify-between text-xs pt-1 border-t border-white/5 font-medium"><span className="text-white/50">Total Fees</span><span className="font-mono text-amber-300/80">{formatMoney(quote.totalFeeCents)}</span></div>
            )}
          </div>
        )}
        {msg && <p className="text-xs text-amber-200">{msg}</p>}
        <button disabled={pending} className="w-full py-3 rounded-xl bg-indigo-600 font-bold text-sm">{pending ? "Posting…" : "Post transfer"}</button>
      </form>
    </div>
  );
}
