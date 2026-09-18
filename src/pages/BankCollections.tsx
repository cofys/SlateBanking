import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { formatMoney } from "../lib/utils";
import { format } from "date-fns";
import { Loader2, ShieldAlert, Megaphone, RefreshCw, Unlock, Gavel } from "lucide-react";

export function BankCollections() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch(`/api/banks/${bankId}/collections`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [bankId]);

  const act = async (path: string, body?: any) => {
    setBusy(path);
    setMsg("");
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : "{}" });
      const d = await res.json();
      if (!res.ok) setMsg(d.error || "Failed");
      else { setMsg("Done."); load(); }
    } catch { setMsg("Network error"); }
    setBusy("");
  };

  if (loading) return <div className="text-white/40 p-8 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading collections…</div>;
  const loans = data?.loans || [];
  const policy = data?.policy || {};

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2"><ShieldAlert className="text-amber-400" /> Collections</h1>
        <p className="text-white/45 text-sm mt-1">
          Grace {policy.gracePeriodDays ?? 0}d · retry {policy.retryDays ?? 7}d · {policy.missesToDefault ?? 3} misses to default · late fee {formatMoney(policy.lateFeeFlatCents || 0)} + {((policy.lateFeePercent || 0) / 100).toFixed(2)}%
        </p>
      </div>
      {msg && <p className="text-sm text-amber-200">{msg}</p>}
      {loans.length === 0 && <p className="text-white/40">No active, delinquent, or defaulted loans.</p>}
      <div className="space-y-3">
        {loans.map((l: any) => (
          <div key={l.id} className={`rounded-2xl border p-5 ${l.status === "defaulted" ? "border-rose-500/30 bg-rose-500/5" : l.status === "delinquent" || l.isDelinquent ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-[#0d0d14]"}`}>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="font-bold">#{l.id.slice(0, 8)} · {l.status}</p>
                <p className="text-xs text-white/45 mt-1">
                  {l.accountName} · balance {formatMoney(l.accountBalance)} · {l.missedPaymentsCount || 0} missed · {l.daysPastDue}d past due
                </p>
                <p className="text-[11px] text-white/35 font-mono mt-1">{l.discordId}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black tabular-nums">{formatMoney(l.remainingAmount)}</p>
                <p className="text-xs text-white/40">installment {formatMoney(l.installmentCents)}</p>
                {l.nextPaymentDate && <p className="text-[11px] text-white/30">next {format(new Date(l.nextPaymentDate), "MMM d")}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button disabled={!!busy} onClick={() => act(`/api/banks/${bankId}/collections/${l.id}/retry`)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 flex items-center gap-1">
                <RefreshCw size={11} /> Retry collect
              </button>
              <button disabled={!!busy} onClick={() => act(`/api/banks/${bankId}/collections/${l.id}/ping`)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-1">
                <Megaphone size={11} /> Discord ping
              </button>
              {(l.collateralStatus === "pledged" || l.collateralStatus === "seized") && (
                <button disabled={!!busy} onClick={() => act(`/api/banks/${bankId}/collections/${l.id}/seize`)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-700 flex items-center gap-1">
                  <Gavel size={11} /> Seize collateral
                </button>
              )}
              {(l.status === "delinquent" || l.status === "defaulted") && (
                <button disabled={!!busy} onClick={() => act(`/api/banks/${bankId}/collections/${l.id}/cure`)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                  <Unlock size={11} /> Cure
                </button>
              )}
              <Link to={`/bank/${bankId}/loans`} className="text-xs font-bold px-3 py-1.5 text-white/40">Full loan file →</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
