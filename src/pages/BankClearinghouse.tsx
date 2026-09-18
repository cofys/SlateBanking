import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Building2, ArrowRightLeft, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight, Globe, Landmark } from "lucide-react";

function money(cents: number) {
  const n = Number(cents) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function BankClearinghouse() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleBankId, setSettleBankId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [showFundModal, setShowFundModal] = useState(false);
  const [fundAmount, setFundAmount] = useState("");

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/banks/${bankId}/clearinghouse`);
      const body = await res.json();
      setData(body);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [bankId]);

  const api = async (path: string, body?: any) => {
    setError("");
    setBusy(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Request failed");
      await fetchData();
      return json;
    } catch (e: any) {
      setError(e.message || "Failed");
      throw e;
    } finally {
      setBusy("");
    }
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleBankId || !settleAmount) return;
    try {
      const parsedAmount = Math.round(parseFloat(settleAmount) * 100);
      const result = await api(`/api/banks/${bankId}/clearinghouse/settle`, { toBankId: settleBankId, amount: parsedAmount });
      setShowSettleModal(false);
      setSettleBankId("");
      setSettleAmount("");
      if (result?.mode === "owner_wallet") {
        setError(result.message || "Book transfer unavailable. Release from SETTLEMENT, pay in-game, then the other bank confirms.");
      }
    } catch (e) {}
  };

  const handleFund = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedAmount = Math.round(parseFloat(fundAmount) * 100);
      await api(`/api/banks/${bankId}/clearinghouse/self-fund`, { amount: parsedAmount });
      setShowFundModal(false);
      setFundAmount("");
    } catch (e) {}
  };

  if (loading || !data) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin text-white/50" />
      </div>
    );
  }

  const { balance, network, settlements, settlementCashCents, settlementFloorCents, settlementWarnCents, settlementAccount, lastSettled } = data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Building2 className="text-indigo-400" />
            Central Clearinghouse
          </h1>
          <p className="text-white/60">Onyx float, net IOUs, and in-game settlement. Paper “record paid” is gone — cash has to move.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFundModal(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium">
            <Landmark size={18} /> Fund SETTLEMENT
          </button>
          <button onClick={() => api(`/api/banks/${bankId}/clearinghouse/run`)} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium" disabled={!!busy}>
            <RefreshCw size={18} className={busy.includes("/run") ? "animate-spin" : ""} /> Run nets
          </button>
          <button onClick={() => setShowSettleModal(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium">
            <ArrowRightLeft size={18} /> Initiate settlement
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm p-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-white/10 rounded-2xl p-6 bg-slate-900/50">
          <div className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
            <Globe size={16} /> Net position vs network
          </div>
          <div className={`text-4xl font-mono tracking-tight mb-2 ${balance < 0 ? "text-red-400" : "text-emerald-400"}`}>
            {balance < 0 ? "" : "+"}{money(balance)}
          </div>
          {balance < 0 ? (
            <p className="text-sm text-red-400/80 mt-4 bg-red-400/10 p-3 rounded-lg border border-red-400/20 flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> You owe the network. Initiate settlement (release from SETTLEMENT → pay the other owner in-game).
            </p>
          ) : balance > 0 ? (
            <p className="text-sm text-emerald-400/80 mt-4 bg-emerald-400/10 p-3 rounded-lg border border-emerald-400/20 flex gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> The network owes you. When you receive in-game payment, Confirm to deposit into SETTLEMENT.
            </p>
          ) : (
            <p className="text-sm text-slate-400 mt-4">Position is balanced.</p>
          )}
        </div>

        <div className="lg:col-span-2 border border-white/10 rounded-2xl p-6 bg-slate-900/50 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40">Live SETTLEMENT cash ({settlementAccount})</div>
            <div className={`text-2xl font-mono mt-1 ${(settlementCashCents || 0) < (settlementWarnCents || 0) ? "text-amber-400" : "text-white"}`}>{money(settlementCashCents || 0)}</div>
            <p className="text-xs text-white/40 mt-2">Floor {money(settlementFloorCents || 0)} · Warn {money(settlementWarnCents || 0)}</p>
            {lastSettled && <p className="text-xs text-white/40 mt-1">Last settled {new Date(lastSettled).toLocaleString()}</p>}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-white/40 mb-2">How cash moves</div>
            <ol className="text-xs text-white/60 space-y-1 list-decimal pl-4">
              <li>Try SETTLEMENT → their SETTLEMENT (usually blocked across corps).</li>
              <li>Debtor: Release (withdraw to owner wallet).</li>
              <li>Pay the other bank owner in-game.</li>
              <li>Creditor: Confirm (deposit into their SETTLEMENT). IOU closes.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="border border-white/10 rounded-2xl bg-slate-900/50 overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-slate-900"><h3 className="font-medium text-white">Network</h3></div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
              <th className="p-4">Bank</th>
              <th className="p-4 text-right">Net IOU</th>
              <th className="p-4 text-right">SETTLEMENT cash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {network.map((n: any) => (
              <tr key={n.id} className="hover:bg-white/5">
                <td className="p-4 text-sm text-white/90">
                  {n.name}
                  {n.id === bankId && <span className="ml-2 text-[10px] uppercase bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">You</span>}
                </td>
                <td className={`p-4 text-sm font-mono text-right ${n.balance < 0 ? "text-red-400" : "text-emerald-400"}`}>{money(n.balance)}</td>
                <td className="p-4 text-sm font-mono text-right text-white/70">{money(n.settlementCashCents || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-white/10 rounded-2xl bg-slate-900/50 overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-slate-900"><h3 className="font-medium text-white">Settlement instructions</h3></div>
        {(!settlements || settlements.length === 0) ? (
          <div className="p-8 text-center text-white/50">No settlement instructions yet.</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                <th className="p-4"></th>
                <th className="p-4">Date</th>
                <th className="p-4">Counterparty</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {settlements.map((s: any) => {
                const isOutgoing = s.fromBankId === bankId;
                const partner = network.find((n: any) => n.id === (isOutgoing ? s.toBankId : s.fromBankId))?.name || "Unknown";
                return (
                  <tr key={s.id}>
                    <td className="p-4">
                      <div className={`inline-flex p-1.5 rounded-full ${isOutgoing ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        {isOutgoing ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-white/70">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="p-4 text-sm text-white/90">{isOutgoing ? `To ${partner}` : `From ${partner}`}</td>
                    <td className="p-4 text-sm font-mono">{money(s.amount)}</td>
                    <td className="p-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs uppercase ${
                        s.status === "paid" ? "bg-emerald-500/20 text-emerald-300" :
                        s.status === "released" ? "bg-cyan-500/20 text-cyan-300" :
                        s.status === "cancelled" ? "bg-white/10 text-white/50" :
                        "bg-amber-500/20 text-amber-300"
                      }`}>{s.status}</span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {isOutgoing && s.status === "pending" && (
                        <button onClick={() => api(`/api/banks/${bankId}/clearinghouse/settlements/${s.id}/release`)} className="text-xs bg-amber-500/20 text-amber-300 px-3 py-1 rounded">Release from SETTLEMENT</button>
                      )}
                      {!isOutgoing && (s.status === "pending" || s.status === "released") && (
                        <button onClick={() => api(`/api/banks/${bankId}/clearinghouse/settlements/${s.id}/confirm`)} className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded">Confirm receipt</button>
                      )}
                      {s.status !== "paid" && s.status !== "cancelled" && (
                        <button onClick={() => api(`/api/banks/${bankId}/clearinghouse/settlements/${s.id}/cancel`)} className="text-xs bg-white/10 text-white/60 px-3 py-1 rounded">Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showSettleModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSettle} className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Initiate settlement</h2>
            <p className="text-sm text-white/60">Tries a SETTLEMENT book transfer first. If CityCorp refuses (cross-corp), you get a pending instruction to release + pay in-game.</p>
            <select value={settleBankId} onChange={(e) => setSettleBankId(e.target.value)} className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white" required>
              <option value="">Paying to…</option>
              {network.filter((n: any) => n.id !== bankId).map((n: any) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <input type="number" min="0.01" step="0.01" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} placeholder="Amount" className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white" required />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowSettleModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-white">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white">Start</button>
            </div>
          </form>
        </div>
      )}

      {showFundModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleFund} className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Fund SETTLEMENT</h2>
            <p className="text-sm text-white/60">Deposits from the bank owner’s personal in-game wallet into {settlementAccount}. This is how VH self-funds float.</p>
            <input type="number" min="0.01" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="Amount" className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white" required />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowFundModal(false)} className="flex-1 py-2.5 rounded-lg bg-slate-800 text-white">Cancel</button>
              <button type="submit" className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white">Deposit</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
