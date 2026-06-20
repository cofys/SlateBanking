import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Building2, ArrowRightLeft, RefreshCw, AlertCircle, ArrowUpRight, ArrowDownRight, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankClearinghouse() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleBankId, setSettleBankId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");

  useEffect(() => {
    fetchData();
  }, [bankId]);

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

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleBankId || !settleAmount) return;
    
    try {
      const parsedAmount = Math.round(parseFloat(settleAmount) * 100);
      const res = await fetch(`/api/banks/${bankId}/clearinghouse/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toBankId: settleBankId, amount: parsedAmount })
      });
      if (res.ok) {
        setShowSettleModal(false);
        setSettleBankId("");
        setSettleAmount("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin text-white/50" />
      </div>
    );
  }

  const { balance, network, settlements } = data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Building2 className="text-indigo-400" />
            Central Clearinghouse
          </h1>
          <p className="text-white/60">Inter-bank net positions and SWIFT settlements</p>
        </div>
        <button 
          onClick={() => setShowSettleModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <ArrowRightLeft size={18} />
          Record Settlement
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Net Position Card */}
        <div className="lg:col-span-1 border border-white/10 rounded-2xl p-6 bg-slate-900/50 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
          
          <div className="relative z-10">
            <div className="text-sm font-medium text-white/50 mb-2 flex items-center gap-2">
              <Globe size={16} /> Central Reserve Balance
            </div>
            
            <div className={`text-4xl font-mono tracking-tight mb-2 ${balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {balance < 0 ? "-" : "+"}${(Math.abs(balance) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            
            {balance < 0 ? (
              <div className="text-sm text-red-400/80 mt-4 flex items-start gap-2 bg-red-400/10 p-3 rounded-lg border border-red-400/20">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>Your bank owes the network. You must perform an in-game manual transfer to settle your debt with other banks.</p>
              </div>
            ) : balance > 0 ? (
              <div className="text-sm text-emerald-400/80 mt-4 flex items-start gap-2 bg-emerald-400/10 p-3 rounded-lg border border-emerald-400/20">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p>The network owes your bank. Other banks will transfer funds manually in-game to balance this position.</p>
              </div>
            ) : (
              <div className="text-sm text-slate-400 mt-4 flex items-start gap-2 bg-slate-800 p-3 rounded-lg border border-white/10">
                <p>Your network position is perfectly balanced.</p>
              </div>
            )}
          </div>
        </div>

        {/* Network State */}
        <div className="lg:col-span-2 border border-white/10 rounded-2xl bg-slate-900/50 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-white/10 bg-slate-900">
            <h3 className="font-medium text-white">Network Participants</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                  <th className="p-4 font-medium">Bank</th>
                  <th className="p-4 font-medium text-right">Net Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {network.map((n: any) => (
                  <tr key={n.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 text-sm font-medium text-white/90">
                      {n.name}
                      {n.id === bankId && <span className="ml-2 text-[10px] uppercase tracking-wider bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">You</span>}
                    </td>
                    <td className={`p-4 text-sm font-mono text-right ${n.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {n.balance < 0 ? "-" : "+"}${(Math.abs(n.balance) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {data.wires && data.wires.length > 0 && (
      <div className="border border-white/10 rounded-2xl bg-slate-900/50 overflow-hidden mb-8">
        <div className="p-4 border-b border-white/10 bg-slate-900 flex justify-between items-center">
          <h3 className="font-medium text-white">Manual Wire Transfers</h3>
        </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                  <th className="p-4 font-medium w-12"></th>
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Direction</th>
                  <th className="p-4 font-medium">Amount</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.wires.map((w: any) => {
                  const isOutgoing = w.fromBankId === bankId;
                  const partnerBankId = isOutgoing ? w.toBankId : w.fromBankId;
                  const partnerName = network.find((n: any) => n.id === partnerBankId)?.name || 'Unknown Bank';

                  return (
                    <tr key={w.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-center">
                        <div className={`inline-flex p-1.5 rounded-full ${isOutgoing ? 'bg-amber-500/10 text-amber-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                          {isOutgoing ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-white/70">
                        {new Date(w.createdAt).toLocaleString()}
                      </td>
                      <td className="p-4 text-sm font-medium text-white/90">
                        {isOutgoing ? `To ${partnerName}` : `From ${partnerName}`}
                      </td>
                      <td className={`p-4 text-sm font-mono ${isOutgoing ? 'text-amber-400' : 'text-cyan-400'}`}>
                        {isOutgoing ? "-" : "+"}${(w.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-sm">
                        <span className={`px-2 py-1 rounded text-xs uppercase ${w.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : w.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                          {w.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                         {!isOutgoing && w.status === 'pending_wire' && (
                            <div className="flex gap-2 justify-end">
                               <button onClick={async () => {
                                  try {
                                     const res = await fetch(`/api/banks/${bankId}/clearinghouse/wires/${w.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'approve' })});
                                     if(res.ok) fetchData(); else alert("Error");
                                  }catch(e){}
                               }} className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-400 px-3 py-1 rounded text-xs transition-colors">Confirm Receipt</button>
                               <button onClick={async () => {
                                  try {
                                     const res = await fetch(`/api/banks/${bankId}/clearinghouse/wires/${w.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'reject' })});
                                     if(res.ok) fetchData(); else alert("Error");
                                  }catch(e){}
                               }} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 px-3 py-1 rounded text-xs transition-colors">Reject / Refund</button>
                            </div>
                         )}
                         {isOutgoing && w.status === 'pending_wire' && (
                            <span className="text-xs text-white/40">Awaiting Foreign Bank</span>
                         )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
      </div>
      )}

      {/* Settlements Table */}
      <div className="border border-white/10 rounded-2xl bg-slate-900/50 overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-slate-900 flex justify-between items-center">
          <h3 className="font-medium text-white">Recent Settlements & Wires</h3>
        </div>
        {settlements.length === 0 ? (
          <div className="p-8 text-center text-white/50">
            No clearinghouse settlements recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                  <th className="p-4 font-medium w-12"></th>
                  <th className="p-4 font-medium">Date</th>
                  <th className="p-4 font-medium">Direction</th>
                  <th className="p-4 font-medium">Amount</th>
                  <th className="p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {settlements.map((s: any) => {
                  const isOutgoing = s.fromBankId === bankId;
                  const partnerBankId = isOutgoing ? s.toBankId : s.fromBankId;
                  const partnerName = network.find((n: any) => n.id === partnerBankId)?.name || 'Unknown Bank';

                  return (
                    <tr key={s.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 text-center">
                        <div className={`inline-flex p-1.5 rounded-full ${isOutgoing ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                          {isOutgoing ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-white/70">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="p-4 text-sm font-medium text-white/90">
                        {isOutgoing ? `To ${partnerName}` : `From ${partnerName}`}
                      </td>
                      <td className={`p-4 text-sm font-mono ${isOutgoing ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isOutgoing ? "-" : "+"}${(s.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-sm">
                        <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-xs">
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settle Modal */}
      <AnimatePresence>
        {showSettleModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-semibold text-white">Record Settlement</h2>
                <p className="text-sm text-white/60 mt-1">Log an in-game manual transfer to balance the clearinghouse ledger.</p>
              </div>

              <form onSubmit={handleSettle} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Paying To</label>
                  <select 
                    value={settleBankId}
                    onChange={(e) => setSettleBankId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select a bank...</option>
                    {network.filter((n: any) => n.id !== bankId).map((n: any) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Amount ($)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-white/50 font-medium">$</span>
                    </div>
                    <input
                      type="number"
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                      placeholder="e.g. 50000"
                      min="0.01"
                      step="0.01"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSettleModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!settleBankId || !settleAmount}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white transition-colors"
                  >
                    Record Payment
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
