import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Inbox, Loader2, RefreshCw } from "lucide-react";

export function BankQueue() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = () => {
    fetch(`/api/banks/${bankId}/queue`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [bankId]);

  const run = async (item: any) => {
    if (!item.action) return;
    setBusy(item.id);
    try {
      const res = await fetch(item.action.path, {
        method: item.action.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: item.action.body ? JSON.stringify(item.action.body) : "{}",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) alert(d.error || "Failed");
      await load();
    } finally { setBusy(""); }
  };

  if (loading) return <div className="text-white/40 flex items-center gap-2 p-8"><Loader2 className="animate-spin" size={16} /> Loading desk…</div>;

  const items = data?.items || [];
  const c = data?.counts || {};

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2"><Inbox className="text-indigo-400" /> Needs attention</h1>
          <p className="text-white/45 text-sm mt-1">Pending loans, failed collections, settlement cash, frozen accounts — one queue.</p>
        </div>
        <button onClick={load} className="text-xs font-bold px-3 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white flex items-center gap-1">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Pending loans", c.pendingLoans],
          ["Collections", c.delinquentLoans],
          ["Settlements", c.settlements],
          ["Frozen", c.frozen],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl border border-white/10 p-4 bg-[#0d0d14]">
            <p className="text-[11px] uppercase tracking-wider text-white/40">{l}</p>
            <p className="text-2xl font-black">{v || 0}</p>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center text-emerald-200">
          <CheckCircle2 className="mx-auto mb-2" /> Nothing in the queue.
        </div>
      )}

      <div className="space-y-2">
        {items.map((item: any) => (
          <div key={item.id} className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
            item.severity === "critical" ? "border-rose-500/30 bg-rose-500/5" :
            item.severity === "warning" ? "border-amber-500/20 bg-amber-500/5" :
            "border-white/10 bg-[#0d0d14]"
          }`}>
            <div className="min-w-0">
              <p className="font-bold text-sm flex items-center gap-2">
                {item.severity !== "info" && <AlertTriangle size={14} className={item.severity === "critical" ? "text-rose-400" : "text-amber-400"} />}
                {item.title}
              </p>
              <p className="text-xs text-white/45 mt-0.5">{item.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              {item.href && <Link to={item.href} className="text-xs font-bold text-white/50 hover:text-white">Open</Link>}
              {item.action && (
                <button disabled={busy === item.id} onClick={() => run(item)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">
                  {busy === item.id ? "…" : item.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
