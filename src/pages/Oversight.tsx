import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Clock, Loader2, Radio, Search, Shield, Wifi, WifiOff } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function Oversight() {
  const [health, setHealth] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [tx, setTx] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"feed" | "money" | "alerts">("feed");

  const load = () => {
    Promise.all([
      fetch("/api/ops/health").then((r) => r.json()).catch(() => null),
      fetch("/api/global/audit").then((r) => r.json()).catch(() => []),
      fetch("/api/transactions/recent").then((r) => r.json()).catch(() => []),
    ]).then(([h, a, t]) => {
      setHealth(h);
      setAudit(Array.isArray(a) ? a : []);
      setTx(Array.isArray(t) ? t : (t?.transactions || []));
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const i = setInterval(() => { if (live) load(); }, 4000);
    return () => clearInterval(i);
  }, [live]);

  const term = q.toLowerCase();
  const feed = useMemo(() => {
    const items: { id: string; at: number; kind: string; title: string; detail: string; tone: string }[] = [];
    for (const l of audit) {
      items.push({
        id: "a-" + l.id,
        at: new Date(l.timestamp).getTime(),
        kind: l.action || "audit",
        title: `${l.method || ""} ${l.route || l.action || "event"}`.trim(),
        detail: [l.discordId, l.bankId, l.details].filter(Boolean).join(" · "),
        tone: l.action === "auth" ? "rose" : "zinc",
      });
    }
    for (const t of tx) {
      items.push({
        id: "t-" + t.id,
        at: new Date(t.timestamp || t.createdAt).getTime(),
        kind: t.type || "transfer",
        title: `${t.type || "transfer"} ${formatMoney(t.amount)}`,
        detail: [t.description, t.bankName, t.fromAccountName, t.toAccountName].filter(Boolean).join(" · "),
        tone: "emerald",
      });
    }
    for (const a of health?.alerts || []) {
      items.push({
        id: "al-" + a.id,
        at: new Date(a.createdAt).getTime(),
        kind: a.code || "alert",
        title: a.message || a.code,
        detail: a.bankId || "",
        tone: a.severity === "critical" ? "rose" : "amber",
      });
    }
    return items
      .filter((i) => !term || `${i.title} ${i.detail} ${i.kind}`.toLowerCase().includes(term))
      .sort((a, b) => b.at - a.at)
      .slice(0, 120);
  }, [audit, tx, health, term]);

  if (loading) {
    return <div className="text-white/40 flex items-center gap-2 p-8"><Loader2 className="animate-spin" size={16} /> Loading oversight…</div>;
  }

  const tot = health?.totals || {};

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Radio className="text-indigo-400" /> Oversight
          </h1>
          <p className="text-white/45 text-sm mt-1">Live money, tenant health, and staff actions — platform operators only.</p>
        </div>
        <button onClick={() => setLive(!live)} className={`self-start text-xs font-bold px-3 py-2 rounded-xl border ${live ? "border-emerald-500/30 text-emerald-300" : "border-white/10 text-white/50"}`}>
          {live ? "Live" : "Paused"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Bots", value: `${tot.onlineBots || 0}/${tot.banks || 0}`, icon: tot.onlineBots ? Wifi : WifiOff },
          { label: "Listeners", value: `${tot.liveListeners || 0}/${tot.banks || 0}`, icon: Activity },
          { label: "Open alerts", value: tot.openAlerts || 0, icon: AlertTriangle },
          { label: "Pending settle", value: tot.pendingSettlements || 0, icon: Shield },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/40 flex items-center gap-1.5"><k.icon size={12} /> {k.label}</p>
            <p className="text-2xl font-black mt-1 tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {(health?.tenants || []).some((t: any) => !t.golive?.ready || t.suspended) && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-200">Needs a look</p>
          {(health.tenants || []).filter((t: any) => t.suspended || !t.golive?.ready).map((t: any) => (
            <div key={t.id} className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="font-semibold">{t.name}</span>
              <span className="text-white/45 text-xs">
                {t.suspended ? "suspended" : (t.golive?.items || []).filter((i: any) => !i.ok).map((i: any) => i.label).join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["feed", "money", "alerts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${tab === t ? "bg-white/10 border-white/20" : "border-white/10 text-white/40"}`}>{t}</button>
        ))}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-3 top-2.5 text-white/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actors, routes, amounts…" className="w-full bg-white/5 border border-white/10 rounded-full pl-8 pr-3 py-2 text-xs" />
        </div>
      </div>

      <div className="space-y-2">
        {(tab === "alerts" ? feed.filter((i) => i.tone === "rose" || i.tone === "amber") : tab === "money" ? feed.filter((i) => i.kind.includes("transfer") || i.kind.includes("loan") || i.kind.includes("deposit") || i.kind.includes("withdraw") || i.kind.includes("onyx")) : feed)
          .slice(0, 80)
          .map((i) => (
            <div key={i.id} className={`rounded-2xl border p-3.5 ${
              i.tone === "rose" ? "border-rose-500/20 bg-rose-500/5" :
              i.tone === "amber" ? "border-amber-500/20 bg-amber-500/5" :
              i.tone === "emerald" ? "border-white/10 bg-[#0d0d14]" :
              "border-white/10 bg-[#0d0d14]"
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{i.title}</p>
                  <p className="text-[11px] text-white/40 truncate mt-0.5">{i.detail || i.kind}</p>
                </div>
                <span className="text-[11px] text-white/35 whitespace-nowrap flex items-center gap-1">
                  <Clock size={10} /> {i.at ? format(new Date(i.at), "HH:mm:ss") : ""}
                </span>
              </div>
            </div>
          ))}
        {feed.length === 0 && <p className="text-white/35 text-sm p-6 text-center">Nothing captured yet.</p>}
      </div>
    </div>
  );
}
