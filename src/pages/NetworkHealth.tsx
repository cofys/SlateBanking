import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle2, Loader2, Radio, ShieldOff, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { formatMoney } from "../lib/utils";

export function NetworkHealth() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");
  const [suspendId, setSuspendId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/ops/health")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const act = async (path: string, body?: any) => {
    setBusy(path);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : "{}" });
      const d = await res.json();
      if (!res.ok) alert(d.error || "Failed");
      await load();
    } finally { setBusy(""); setSuspendId(null); setReason(""); }
  };

  if (loading) return <div className="text-white/40 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Checking rails…</div>;
  if (!data) return <div className="text-rose-300">Could not load network health.</div>;

  const t = data.totals || {};

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2"><Activity className="text-indigo-400" /> Network health</h1>
        <p className="text-white/45 text-sm mt-1">CityCorp listeners, Discord bots, SETTLEMENT float, open IOUs, and tenant kill switch.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Bots online", value: `${t.onlineBots}/${t.banks}` },
          { label: "Live listeners", value: `${t.liveListeners}/${t.banks}` },
          { label: "Open alerts", value: t.openAlerts },
          { label: "Pending settlements", value: t.pendingSettlements },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{k.label}</p>
            <p className="text-2xl font-black mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {!!data.alerts?.length && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Open alerts</p>
          {data.alerts.slice(0, 12).map((a: any) => (
            <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <span className="font-mono text-[11px] text-white/40 mr-2">{a.code}</span>
                {a.message}
              </div>
              <button disabled={busy !== ""} onClick={() => act(`/api/ops/alerts/${a.id}/resolve`)} className="text-xs text-white/50 hover:text-white shrink-0">Resolve</button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {(data.tenants || []).map((b: any) => {
          const items = b.golive?.items || [];
          const missing = items.filter((i: any) => !i.ok);
          return (
            <div key={b.id} className="rounded-2xl border border-white/10 bg-[#0d0d14] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-black">{(b.name || "?").slice(0, 1)}</div>
                  <div>
                    <Link to={`/bank/${b.id}`} className="font-bold hover:underline">{b.name}</Link>
                    <p className="text-[11px] text-white/40 flex items-center gap-2 mt-0.5">
                      {b.botStatus === "online" ? <span className="text-emerald-400 flex items-center gap-1"><Radio size={10} /> bot</span> : <span className="text-white/30 flex items-center gap-1"><WifiOff size={10} /> bot {b.botStatus}</span>}
                      {b.listener?.connected ? <span className="text-emerald-400 flex items-center gap-1"><Wifi size={10} /> live</span> : <span className="text-white/30 flex items-center gap-1"><WifiOff size={10} /> listener</span>}
                      {b.suspended && <span className="text-rose-400">suspended</span>}
                      {b.maintenanceMode && <span className="text-amber-300">maintenance</span>}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/40">SETTLEMENT</p>
                  <p className="font-mono font-bold">{formatMoney(b.settlementCashCents)}</p>
                </div>
              </div>

              <div className="mt-4 grid sm:grid-cols-2 gap-1.5">
                {items.map((i: any) => (
                  <div key={i.id} className="flex items-start gap-2 text-xs">
                    {i.ok ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />}
                    <span className={i.ok ? "text-white/50" : "text-white"}>{i.label}{!i.ok && i.hint ? <span className="text-white/35"> — {i.hint}</span> : null}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {b.golive?.ready
                  ? <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Go-live ready</span>
                  : <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">{missing.length} checklist items</span>}
                {b.suspended ? (
                  <button disabled={!!busy} onClick={() => act(`/api/admin/banks/${b.id}/unsuspend`)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white flex items-center gap-1">
                    <ShieldCheck size={12} /> Unsuspend
                  </button>
                ) : (
                  <button onClick={() => setSuspendId(b.id)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-600/80 text-white flex items-center gap-1">
                    <ShieldOff size={12} /> Suspend
                  </button>
                )}
                <Link to={`/bank/${b.id}/queue`} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 text-white/70">Staff queue</Link>
              </div>

              {suspendId === b.id && (
                <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act(`/api/admin/banks/${b.id}/suspend`, { reason }); }}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (RP / court / ops)" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" required />
                  <button className="text-xs font-bold px-3 py-2 rounded-lg bg-rose-600">Confirm kill switch</button>
                  <button type="button" onClick={() => setSuspendId(null)} className="text-xs text-white/40">Cancel</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
