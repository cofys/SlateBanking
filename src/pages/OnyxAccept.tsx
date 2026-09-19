import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import {
  ArrowRight, Check, Copy, CreditCard, KeyRound, Landmark, Loader2,
  LogIn, LogOut, ShieldCheck, Store, Wallet,
} from "lucide-react";

type Shop = {
  id: string;
  name: string;
  slug?: string;
  bankName?: string;
  destinationAccountName?: string;
  apiKeyLast4?: string;
  checkoutPath: string;
  createdAt?: string;
  apiKey?: string;
};

export function OnyxAccept() {
  const { user, login, logout, isLoading } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [lookup, setLookup] = useState<any>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Shop | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [rolled, setRolled] = useState<Record<string, string>>({});

  useEffect(() => { document.title = "Onyx · Accept payments"; }, []);

  const load = async () => {
    if (!user) return;
    const [lu, me] = await Promise.all([
      fetch("/api/citizen/lookup").then((r) => r.json()).catch(() => null),
      fetch("/api/onyx/me").then((r) => r.json()).catch(() => []),
    ]);
    setLookup(lu);
    setShops(Array.isArray(me) ? me : []);
  };

  useEffect(() => { load(); }, [user]);

  const accounts = (lookup?.accounts || []).filter((a: any) => a.isActive !== false && !a.isFrozen);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1400);
    } catch {}
  };

  const checkoutUrl = (path: string) => {
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  };

  const createShop = async () => {
    setError("");
    if (!name.trim()) { setError("Name the shop so customers know who they're paying."); return; }
    if (!accountId) { setError("Pick the account that should receive the money."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/onyx/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), destinationAccountId: accountId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Could not open the shop"); return; }
      setCreated(data);
      setStep(3);
      load();
    } catch {
      setError("Could not open the shop. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const rollKey = async (id: string) => {
    if (!confirm("This replaces the old key. Anything still using it will stop working.")) return;
    const res = await fetch(`/api/onyx/me/${id}/roll-key`, { method: "POST" });
    const data = await res.json();
    if (res.ok && data.apiKey) setRolled((p) => ({ ...p, [id]: data.apiKey }));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--fg-subtle)" }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(900px 420px at 50% -8%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 58%)",
        }}
      />
      <header className="relative z-10 border-b backdrop-blur-xl" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 82%, transparent)" }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center chip-accent">
              <Store size={16} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] font-semibold" style={{ color: "var(--fg-subtle)" }}>Onyx</p>
              <p className="text-sm font-semibold leading-tight">Accept payments</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Link to="/portal" className="px-3 py-1.5 rounded-lg min-h-11 flex items-center" style={{ color: "var(--fg-muted)" }}>Banks</Link>
            {user && <button onClick={logout} className="p-2 min-h-11 min-w-11" style={{ color: "var(--fg-subtle)" }} aria-label="Sign out"><LogOut size={15} /></button>}
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-10 space-y-8 page-enter">
        <section className="surface p-7 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--fg-subtle)" }}>For shops & corps</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2" style={{ letterSpacing: "-0.03em" }}>Get paid from any bank.</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
            Three steps. Name the shop, pick the account that receives money, copy the checkout link. Customers pay from their bank. Onyx moves it.
          </p>
          <div className="grid grid-cols-3 gap-2 mt-7">
            {[
              { n: 1, label: "Sign in" },
              { n: 2, label: "Name & account" },
              { n: 3, label: "Copy link" },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border px-3 py-3 text-center" style={{
                borderColor: step >= s.n ? "color-mix(in oklab, var(--accent) 35%, transparent)" : "var(--border)",
                background: step >= s.n ? "color-mix(in oklab, var(--accent) 10%, transparent)" : "color-mix(in oklab, var(--fg) 3%, transparent)",
              }}>
                <p className="text-lg font-semibold" style={{ color: step >= s.n ? "var(--accent)" : "var(--fg-subtle)" }}>{s.n}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {!user && (
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
            <h2 className="font-bold text-lg">1. Sign in with CityCorp</h2>
            <p className="text-sm text-white/50">Same login as your bank. No extra account.</p>
            <button onClick={() => login(undefined, "citycorp")} className="btn-accent w-full py-3.5 text-sm flex items-center justify-center gap-2 min-h-11">
              <LogIn size={16} /> Continue with CityCorp
            </button>
          </section>
        )}

        {user && step < 3 && (
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
            <h2 className="font-bold text-lg">2. Name the shop and where money lands</h2>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Shop name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Oak Lumber · Front desk"
                className="mt-1.5 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">Receiving account</label>
              {accounts.length === 0 ? (
                <p className="text-sm text-white/45 mt-2">
                  You need a bank account first. Open one in the <Link to="/portal" className="text-emerald-400 underline">customer portal</Link>, then come back.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {accounts.map((a: any) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccountId(a.id)}
                      className={`w-full text-left rounded-2xl border px-4 py-3 flex items-center justify-between ${accountId === a.id ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/10 bg-black/30 hover:border-white/20"}`}
                    >
                      <div>
                        <p className="font-semibold text-sm">{a.accountName}</p>
                        <p className="text-[11px] text-white/40">{a.bankName} · {a.type || "personal"}</p>
                      </div>
                      <p className="font-mono text-sm">{formatMoney(a.balance || 0)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button
              disabled={busy || !accounts.length}
              onClick={createShop}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 font-bold text-sm flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Open shop
            </button>
          </section>
        )}

        {created && step === 3 && (
          <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-6 space-y-5">
            <div className="flex items-center gap-2 text-emerald-300 font-bold">
              <Check size={18} /> Shop is live
            </div>
            <p className="text-sm text-white/60">{created.name} receives into <span className="text-white">{created.destinationAccountName}</span> at {created.bankName}.</p>
            <SecretRow label="Checkout link" value={checkoutUrl(created.checkoutPath)} id="url" copied={copied} onCopy={copy} />
            {created.apiKey && (
              <SecretRow label="API key — copy now, it won't show again" value={created.apiKey} id="key" copied={copied} onCopy={copy} warn />
            )}
            <HowToPay />
            <button onClick={() => { setCreated(null); setName(""); setAccountId(""); setStep(1); }} className="text-sm text-white/50 hover:text-white">Set up another shop</button>
          </section>
        )}

        {user && shops.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">Your shops</h2>
            {shops.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{s.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">{s.bankName} · {s.destinationAccountName} · key …{s.apiKeyLast4}</p>
                  </div>
                  <button onClick={() => rollKey(s.id)} className="text-[11px] text-white/40 hover:text-white">Roll key</button>
                </div>
                <SecretRow label="Checkout" value={checkoutUrl(s.checkoutPath)} id={s.id} copied={copied} onCopy={copy} />
                {rolled[s.id] && <SecretRow label="New API key" value={rolled[s.id]} id={`roll-${s.id}`} copied={copied} onCopy={copy} warn />}
              </div>
            ))}
          </section>
        )}

        <section className="grid sm:grid-cols-3 gap-3">
          {[
            { icon: Wallet, title: "Any bank", body: "A customer at another bank still pays you. Onyx settles it." },
            { icon: Landmark, title: "Your account", body: "Money lands in the bank account you picked. Nothing else." },
            { icon: ShieldCheck, title: "No new money", body: "Onyx only moves balances that already exist in CityCorp." },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <c.icon size={16} className="text-emerald-400 mb-2" />
              <p className="font-semibold text-sm">{c.title}</p>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function SecretRow({ label, value, id, copied, onCopy, warn }: { label: string; value: string; id: string; copied: string | null; onCopy: (v: string, id: string) => void; warn?: boolean }) {
  return (
    <div>
      <p className={`text-[11px] uppercase tracking-wider font-semibold mb-1 ${warn ? "text-amber-300/80" : "text-white/40"}`}>{label}</p>
      <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-xl px-3 py-2">
        <code className="text-xs font-mono text-emerald-300 break-all flex-1">{value}</code>
        <button onClick={() => onCopy(value, id)} className="p-1.5 text-white/40 hover:text-white" aria-label="Copy">
          {copied === id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function HowToPay() {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/30 p-4 space-y-2 text-sm text-white/60">
      <p className="font-semibold text-white flex items-center gap-2"><CreditCard size={14} className="text-emerald-400" /> How customers pay</p>
      <p>1. Send them the checkout link.</p>
      <p>2. They sign in with CityCorp and pick an account.</p>
      <p>3. Money moves. You see it in the bank you chose.</p>
      <p className="text-white/40 text-xs pt-1 flex items-center gap-1"><KeyRound size={12} /> Use the API key only if you are wiring this into a website or Discord bot.</p>
    </div>
  );
}
