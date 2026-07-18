import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, Plus, RefreshCw, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankEscrow() {
  const { bankId } = useParams();
  const [escrows, setEscrows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [buyerAccountId, setBuyerAccountId] = useState("");
  const [sellerAccountId, setSellerAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [escrowsRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/escrows`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const e = await escrowsRes.json();
      const a = await accsRes.json();
      setEscrows(e);
      setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateEscrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerAccountId || !sellerAccountId || !amount || !description) return;

    try {
      const res = await fetch(`/api/banks/${bankId}/escrows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          buyerAccountId,
          sellerAccountId,
          amount: Math.round(parseFloat(amount) * 100), 
          description
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setBuyerAccountId("");
        setSellerAccountId("");
        setAmount("");
        setDescription("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAction = async (escrowId: string, action: 'fund' | 'release' | 'refund') => {
    try {
      const res = await fetch(`/api/banks/${bankId}/escrows/${escrowId}/${action}`, {
        method: "POST"
      });
      if (res.ok) {
        fetchData();
      } else {
        const body = await res.json();
        alert(body.error || `Failed to ${action} escrow.`);
      }
    } catch(e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <ShieldCheck className="text-cyan-400" />
            Escrow Services
          </h1>
          <p className="text-white/60">Secure third-party transaction holding for high value trades</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <Plus size={18} />
          Create Escrow
        </button>
      </div>

      {escrows.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No active escrows</h3>
          <p className="text-white/60 max-w-sm mx-auto mb-6">
            Hold funds securely between two parties until transaction conditions are met.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer mx-auto"
          >
            <Plus size={18} />
            Create First Escrow
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-slate-900 border border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                <th className="p-4 font-medium">Buyer (Funder)</th>
                <th className="p-4 font-medium">Seller (Receiver)</th>
                <th className="p-4 font-medium">Description</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium w-48 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {escrows.map(escrow => (
                <tr key={escrow.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-sm font-medium text-white/90 flex flex-col">
                    <span>{escrow.buyerAccountName}</span>
                    <span className="text-xs text-white/50 font-normal mt-0.5">{escrow.buyerCityCorpId}</span>
                  </td>
                  <td className="p-4 text-sm font-medium text-white/90">
                    <div className="flex flex-col">
                      <span>{escrow.sellerAccountName}</span>
                      <span className="text-xs text-white/50 font-normal mt-0.5">{escrow.sellerCityCorpId}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-white/70">
                    {escrow.description}
                  </td>
                  <td className="p-4 text-sm font-mono text-cyan-400 font-medium">
                    ${(escrow.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-sm">
                    {escrow.status === 'pending' && <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs uppercase tracking-wider">Pending</span>}
                    {escrow.status === 'funded' && <span className="bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded text-xs uppercase tracking-wider">Funded (Locked)</span>}
                    {escrow.status === 'released' && <span className="bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded text-xs uppercase tracking-wider">Released</span>}
                    {escrow.status === 'refunded' && <span className="bg-amber-500/20 text-amber-300 px-2 py-1 rounded text-xs uppercase tracking-wider">Refunded</span>}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    {escrow.status === 'pending' && (
                      <button onClick={() => handleAction(escrow.id, 'fund')} className="text-xs bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/40 px-3 py-1.5 rounded transition-colors whitespace-nowrap">
                        Fund Escrow
                      </button>
                    )}
                    {escrow.status === 'funded' && (
                      <>
                        <button onClick={() => handleAction(escrow.id, 'release')} className="text-xs bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 px-3 py-1.5 rounded transition-colors" title="Release to Seller">
                          <CheckCircle size={16} />
                        </button>
                        <button onClick={() => handleAction(escrow.id, 'refund')} className="text-xs bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 px-3 py-1.5 rounded transition-colors" title="Refund to Buyer">
                          <XCircle size={16} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-semibold text-white">New Escrow Contract</h2>
                <p className="text-sm text-white/60 mt-1">Setup an escrow hold between two accounts</p>
              </div>

              <form onSubmit={handleCreateEscrow} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Buyer (Funder)</label>
                  <select 
                    value={buyerAccountId}
                    onChange={(e) => setBuyerAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  >
                    <option value="">Select funding account...</option>
                    {accounts.map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.ownerDiscordId}) - ${(acc.balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-center -my-2 relative z-10">
                  <div className="bg-slate-800 p-1.5 rounded-full border border-white/10 text-white/50">
                    <ArrowRight size={16} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Seller (Receiver)</label>
                  <select 
                    value={sellerAccountId}
                    onChange={(e) => setSellerAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  >
                    <option value="">Select receiving account...</option>
                    {accounts.filter(a => a.id !== buyerAccountId).map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.ownerDiscordId})</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Description (Terms/Asset)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="e.g. Real Estate Transfer XYZ"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Escrow Amount ($)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!buyerAccountId || !sellerAccountId || !amount}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-600/50 text-white transition-colors"
                  >
                    Draft Escrow
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
