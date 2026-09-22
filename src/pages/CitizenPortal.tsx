import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { Building2, ChevronRight, LogOut, Wallet, X, Bot, Link2, CheckCircle2 } from "lucide-react";
import { AuthScreen, BrandMark, PrimaryButton, ScreenLoader } from "../components/ui/chrome";
import { hexOr, withAlpha } from "../lib/theme";
import { motion } from "motion/react";

export function CitizenPortal() {
  const { user, login, linkDiscord, logout, isLoading, rememberMe, setRememberMe, authError, clearAuthError } = useAuth();
  const [mine, setMine] = useState<any>(null);
  const [directory, setDirectory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBotPicker, setShowBotPicker] = useState(false);

  useEffect(() => {
    document.title = "Customer Portal";
  }, []);

  useEffect(() => {
    fetch("/api/banks/directory")
      .then((r) => r.json())
      .then((d) => setDirectory(Array.isArray(d) ? d : []))
      .catch(() => setDirectory([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch("/api/citizen/lookup")
      .then((r) => r.json())
      .then((d) => setMine(d))
      .catch(() => setMine(null))
      .finally(() => setLoading(false));
  }, [user]);

  const accounts = mine?.accounts || [];
  const byBank = useMemo(() => {
    const map = new Map<string, { bank: any; accounts: any[]; balance: number }>();
    for (const a of accounts) {
      const dir = directory.find((x: any) => x.id === a.bankId);
      const cur = map.get(a.bankId) || {
        bank: dir || { id: a.bankId, name: a.bankName, brandingColor: "#8b95a5" },
        accounts: [],
        balance: 0,
      };
      cur.accounts.push(a);
      cur.balance += a.balance || 0;
      map.set(a.bankId, cur);
    }
    return [...map.values()];
  }, [accounts, directory]);

  const otherBanks = directory.filter((b) => !byBank.some((row) => row.bank.id === b.id));

  const handleConnectDiscord = (bankId?: string) => {
    if (bankId) {
      setShowBotPicker(false);
      linkDiscord(bankId);
      return;
    }
    if (byBank.length === 1) {
      linkDiscord(byBank[0].bank.id);
    } else if (byBank.length === 0 && directory.length === 1) {
      linkDiscord(directory[0].id);
    } else if (byBank.length > 1 || directory.length > 1) {
      setShowBotPicker(true);
    } else {
      linkDiscord();
    }
  };

  if (isLoading) return <ScreenLoader />;

  if (!user) {
    return (
      <AuthScreen
        mark={<BrandMark letter="S" color="#c5cad3" />}
        title="Customer portal"
        subtitle="Sign in, pick your bank, and manage that account. Transfers stay inside one bank."
      >
        <div className="space-y-4">
          <label className="flex items-center justify-center gap-2 cursor-pointer text-xs select-none" style={{ color: "var(--fg-muted)" }}>
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded" />
            Remember this device
          </label>
          <PrimaryButton onClick={() => login(undefined, "citycorp")}>Continue with CityCorp</PrimaryButton>
        </div>
      </AuthScreen>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <header className="sticky top-0 z-20" style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 82%, transparent)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div>
            <p className="font-semibold tracking-tight">Customer portal</p>
            <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>Pick a bank to open its portal</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={logout} className="p-2.5 rounded-lg" aria-label="Sign out" style={{ color: "var(--fg-subtle)" }}>
              <LogOut size={16} />
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold border" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              {user.username?.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-10 page-enter">
        {authError && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 flex items-center justify-between">
            <span>{authError}</span>
            <button onClick={clearAuthError} className="text-rose-400 hover:text-white"><X size={16} /></button>
          </div>
        )}
        <section className="p-7 border" style={{ borderRadius: "var(--radius-xl)", borderColor: "var(--border)", background: "linear-gradient(165deg, color-mix(in oklab, var(--accent) 18%, transparent), var(--bg-elevated) 58%)" }}>
          <p className="text-sm flex items-center gap-2" style={{ color: "var(--fg-muted)" }}>
            <Wallet size={14} /> {user.username}
          </p>
          <h1 className="text-3xl font-semibold mt-2 tracking-tight" style={{ letterSpacing: "-0.03em" }}>Your banks</h1>
          <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--fg-muted)" }}>
            Each bank has its own customer portal. Send money inside that bank. Pay another bank with Onyx.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-6">
            {user.linkedDiscordId ? (
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-medium text-emerald-300">
                <CheckCircle2 size={15} />
                <span>Discord bot linked ({user.linkedDiscordId})</span>
              </div>
            ) : (
              <button onClick={() => handleConnectDiscord()} className="text-sm font-semibold px-4 py-2.5 rounded-xl border flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
                <Bot size={15} /> Connect Discord bot
              </button>
            )}
            <Link to="/accept" className="text-sm font-semibold px-4 py-2.5 rounded-xl border" style={{ borderColor: "var(--border)", color: "var(--fg)" }}>
              Accept payments
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--fg-subtle)" }}>Accounts you hold</h2>
          {loading && <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--bg-subtle)" }} />}
          {!loading && byBank.length === 0 && (
            <p className="text-sm" style={{ color: "var(--fg-subtle)" }}>No accounts yet. Open a bank below to apply.</p>
          )}
          {byBank.map((row, i) => {
            const color = hexOr(row.bank.brandingColor);
            return (
              <motion.div key={row.bank.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.35 }}>
                <Link
                  to={`/portal/${row.bank.id}`}
                  className="block p-5 border hover:border-[var(--border-strong)] transition-colors"
                  style={{ borderRadius: "var(--radius-lg)", borderColor: "var(--border)", background: "color-mix(in oklab, var(--fg) 3%, transparent)" }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center font-semibold" style={{ background: withAlpha(color, 0.2), color }}>
                      {(row.bank.name || "?").slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{row.bank.name}</p>
                      <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>{row.accounts.length} account{row.accounts.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums num">{formatMoney(row.balance)}</p>
                      <p className="text-[11px] flex items-center justify-end gap-0.5" style={{ color: "var(--fg-subtle)" }}>
                        Open <ChevronRight size={12} />
                      </p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </section>

        {otherBanks.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--fg-subtle)" }}>Other banks</h2>
            {otherBanks.map((b) => (
              <Link
                key={b.id}
                to={`/portal/${b.id}`}
                className="block p-4 border hover:border-[var(--border-strong)] transition-colors"
                style={{ borderRadius: "var(--radius-lg)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-subtle)", color: "var(--fg-muted)" }}>
                    <Building2 size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{b.name}</p>
                    <p className="text-xs truncate" style={{ color: "var(--fg-subtle)" }}>{b.tagline || "Open customer portal"}</p>
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--fg-subtle)" }} />
                </div>
              </Link>
            ))}
          </section>
        )}
        {showBotPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
              className="w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-5"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Bot size={18} /> Connect Bank Discord Bot
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
                    Choose which bank's bot you want to link your Discord account with:
                  </p>
                </div>
                <button
                  onClick={() => setShowBotPicker(false)}
                  className="p-1.5 rounded-lg border hover:bg-[var(--bg-subtle)] transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(byBank.length > 0 ? byBank.map((b) => b.bank) : directory).map((b) => {
                  const color = hexOr(b.brandingColor);
                  return (
                    <button
                      key={b.id}
                      onClick={() => handleConnectDiscord(b.id)}
                      className="w-full p-3.5 rounded-xl border text-left flex items-center gap-3 transition-colors hover:border-[var(--border-strong)]"
                      style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--fg) 2%, transparent)" }}
                    >
                      <div 
                        className="w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0"
                        style={{ background: withAlpha(color, 0.2), color }}
                      >
                        {(b.name || "?").slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{b.name}</p>
                        <p className="text-xs truncate" style={{ color: "var(--fg-subtle)" }}>
                          Link to {b.name}'s Discord Bot
                        </p>
                      </div>
                      <Link2 size={16} style={{ color: "var(--fg-muted)" }} />
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setShowBotPicker(false)}
                  className="text-xs font-semibold px-4 py-2 rounded-xl border"
                  style={{ borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
