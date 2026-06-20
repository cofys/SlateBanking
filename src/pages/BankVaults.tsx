import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Lock, Plus, Unlock, RefreshCw, Clock, Wallet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankVaults() {
  const { bankId } = useParams();
  const [vaults, setVaults] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [interestRate, setInterestRate] = useState("5.0"); // Default 5%

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [vaultsRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/vaults`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const v = await vaultsRes.json();
      const a = await accsRes.json();
      setVaults(v);
      setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !amount || !durationDays || !interestRate) return;
    
    try {
      const res = await fetch(`/api/banks/${bankId}/vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          accountId, 
          amount: Math.round(parseFloat(amount) * 100), 
          durationDays: parseInt(durationDays), 
          interestRate: Math.round(parseFloat(interestRate) * 100) 
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setAccountId("");
        setAmount("");
        fetchData();
      } else {
        alert("Failed to create vault. Ensure account has sufficient funds.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRelease = async (vaultId: string) => {
    if (!confirm("Are you sure you want to release this vault? Early withdrawals may forfeit interest.")) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/vaults/${vaultId}/release`, {
        method: "POST"
      });
      if (res.ok) {
        fetchData();
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
            <Lock className="text-amber-400" />
            Savings Vaults
          </h1>
          <p className="text-white/60">Time-locked deposits and staking pools</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <Plus size={18} />
          Create Vault
        </button>
      </div>

      {vaults.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Lock className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No active vaults</h3>
          <p className="text-white/60 max-w-sm mx-auto mb-6">
            Create time-locked savings vaults to lock up funds for a period while earning interest.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer mx-auto"
          >
            <Plus size={18} />
            Create First Vault
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vaults.map(vault => {
             const lockedUntil = new Date(vault.lockedUntil);
             const now = new Date();
             const isLocked = vault.status === "locked";
             const isReady = isLocked && now >= lockedUntil;
             
             return (
              <div key={vault.id} className="relative group bg-slate-900 border border-white/10 rounded-2xl p-6 overflow-hidden flex flex-col justify-between">
                
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                      <Lock size={20} />
                    </div>
                  </div>
                  <div>
                    {vault.status === "locked" ? (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${isReady ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
                        {isReady ? "READY" : "LOCKED"}
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-slate-800 text-slate-400 uppercase">
                        {vault.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative z-10 mb-6">
                  <div className="text-sm text-white/50 mb-1">Locked Amount</div>
                  <div className="text-3xl font-mono text-white tracking-tight">
                    ${(vault.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="space-y-3 relative z-10">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/50 flex items-center gap-1.5"><Wallet size={14}/> Account</span>
                    <span className="text-white/90 font-medium">{vault.accountName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/50 flex items-center gap-1.5"><Clock size={14}/> Unlocks</span>
                    <span className="text-white/90 font-medium">{lockedUntil.toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/50">APR</span>
                    <span className="text-emerald-400 font-medium font-mono">{(vault.interestRate / 100).toFixed(2)}%</span>
                  </div>
                </div>

                {isLocked && (
                  <div className="mt-6 relative z-10">
                    <button 
                      onClick={() => handleRelease(vault.id)}
                      className={`w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors border ${isReady ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                    >
                      <Unlock size={16} />
                      {isReady ? "Claim Vault" : "Force Early Release"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Vault Modal */}
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
                <h2 className="text-xl font-semibold text-white">Create Savings Vault</h2>
                <p className="text-sm text-white/60 mt-1">Lock up funds to earn interest over time</p>
              </div>

              <form onSubmit={handleCreateVault} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Source Account</label>
                  <select 
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  >
                    <option value="">Select an account...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName} - ${(acc.balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Amount to Lock ($)</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g. 5000"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Duration (Days)</label>
                    <input
                      type="number"
                      min="1"
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">APR (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    disabled={!accountId || !amount}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/50 text-white transition-colors"
                  >
                    Create Vault
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
