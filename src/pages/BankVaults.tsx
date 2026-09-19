import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Lock, Plus, Unlock, RefreshCw, Clock, Wallet, ShieldCheck, ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney } from "../lib/utils";

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
      setVaults(Array.isArray(v) ? v : []);
      setAccounts(Array.isArray(a) ? a : []);
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
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin" size={24} />
        <p>Synchronizing vault storage...</p>
      </div>
    );
  }

  const activeVaults = vaults.filter(v => v.status === 'locked');
  const totalLockedUSD = activeVaults.reduce((sum, v) => sum + v.amount, 0) / 100;
  const projectedInterestUSD = activeVaults.reduce((sum, v) => {
    const principal = v.amount / 100;
    const rate = v.interestRate / 10000;
    const days = Math.round((new Date(v.lockedUntil).getTime() - new Date(v.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return sum + (principal * rate * (days / 365));
  }, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <Lock className="text-amber-400" size={32} />
            Savings Bonds
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Time-locked bonds. Customers buy them from Apply if you offer terms.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-amber-600/20"
          >
            <Plus size={16} /> Issue Bond
          </button>
        </div>
      </header>

      {/* KPI Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Lock size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Active Bonds</span>
          </div>
          <p className="text-3xl font-black text-white">{activeVaults.length}</p>
        </div>
        
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ShieldCheck size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Total Assets Locked</span>
          </div>
          <p className="text-3xl font-black text-white font-mono">{formatMoney(totalLockedUSD * 100)}</p>
        </div>
        
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ArrowUpRight size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Projected Yield</span>
          </div>
          <p className="text-3xl font-black text-white font-mono">+{formatMoney(projectedInterestUSD * 100)}</p>
        </div>
      </div>

      {vaults.length === 0 ? (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Lock className="text-white/20" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Active Bonds</h3>
          <p className="text-zinc-500 max-w-sm mb-6 font-medium">
            Offer bond terms in Bank Settings. Customers can buy them from Apply, or you can issue one here.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-white/10 hover:bg-white/15 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Open First Vault
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
          {vaults.map(vault => {
             const createdAt = new Date(vault.createdAt);
             const lockedUntil = new Date(vault.lockedUntil);
             const now = new Date();
             const isLocked = vault.status === "locked";
             const isReady = isLocked && now >= lockedUntil;
             
             // Time calculations
             const totalDurationMs = lockedUntil.getTime() - createdAt.getTime();
             const elapsedMs = now.getTime() - createdAt.getTime();
             const totalDays = Math.max(1, Math.round(totalDurationMs / (1000 * 60 * 60 * 24)));
             const daysElapsed = Math.min(totalDays, Math.max(0, Math.round(elapsedMs / (1000 * 60 * 60 * 24))));
             const progressPercent = totalDurationMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalDurationMs) * 100)) : 100;

             // Financial projections
             const principalUSD = vault.amount / 100;
             const rateFraction = vault.interestRate / 10000;
             
             const accruedInterestUSD = (principalUSD * rateFraction) * (daysElapsed / 365);
             const maturityInterestUSD = (principalUSD * rateFraction) * (totalDays / 365);
             
             return (
               <motion.div 
                 key={vault.id}
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 exit={{ opacity: 0, scale: 0.9 }}
                 className="relative group bg-[var(--bg-elevated)] border border-white/10 hover:border-amber-500/30 rounded-2xl p-6 overflow-hidden flex flex-col justify-between shadow-xl transition-all duration-300"
               >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/[0.02] rounded-full blur-2xl pointer-events-none group-hover:bg-amber-500/[0.05] transition-colors" />
                 
                 <div className="flex justify-between items-start mb-6 relative z-10">
                   <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                       <Lock size={18} className="group-hover:rotate-12 transition-transform" />
                     </div>
                     <div>
                       <span className="text-[10px] font-black tracking-widest text-amber-500 uppercase block mb-0.5">Series CD-{new Date(vault.createdAt).getFullYear()}</span>
                       <span className="text-white font-bold text-sm">Term Deposit</span>
                     </div>
                   </div>
                   <div>
                     {vault.status === "locked" ? (
                       <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest shadow-sm ${isReady ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/10 text-amber-400"}`}>
                         {isReady ? "Mature" : "Accruing"}
                       </span>
                     ) : (
                       <span className="px-2.5 py-1 rounded-md text-[10px] font-black bg-zinc-800 text-zinc-400 uppercase tracking-widest">
                         {vault.status.replace("_", " ")}
                       </span>
                     )}
                   </div>
                 </div>

                 <div className="relative z-10 mb-6 bg-[var(--bg-subtle)] border border-white/5 rounded-xl p-5 shadow-inner">
                   <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Principal Value</div>
                   <div className="text-3xl font-black font-mono text-white tracking-tight flex items-baseline">
                     {formatMoney(vault.amount)}
                   </div>
                   
                   {isLocked && (
                     <div className="mt-5 space-y-2">
                       <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                         <span>Maturity Progress</span>
                         <span className="text-amber-400">{progressPercent.toFixed(0)}%</span>
                       </div>
                       <div className="w-full bg-[var(--bg-elevated)] border border-white/5 h-2 rounded-full overflow-hidden shadow-inner">
                         <div 
                           className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-500 relative"
                           style={{ width: `${progressPercent}%` }}
                         >
                           <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                         </div>
                       </div>
                       <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                         <span>Day {daysElapsed} of {totalDays}</span>
                         <span>{lockedUntil.toLocaleDateString()}</span>
                       </div>
                     </div>
                   )}
                 </div>

                 <div className="space-y-3 relative z-10 text-xs border-t border-white/5 pt-4 mb-5">
                   <div className="flex items-center justify-between">
                     <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5"><Clock size={12}/> Yield Rate</span>
                     <span className="font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded text-[11px]">{(vault.interestRate / 100).toFixed(2)}% APR</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5"><ArrowUpRight size={12}/> Accrued (Est)</span>
                     <span className="font-mono font-bold text-emerald-400">+{formatMoney(accruedInterestUSD * 100)}</span>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-zinc-500 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5"><Wallet size={12}/> Target Account</span>
                     <span className="font-mono font-bold text-white/80 truncate max-w-[120px]">{vault.accountName || "Corporate Account"}</span>
                   </div>
                 </div>
                 
                 <div className="relative z-10 mt-auto">
                   {isLocked ? (
                     <button 
                       onClick={() => handleRelease(vault.id)}
                       className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest flex justify-center items-center gap-2 transition-colors ${
                         isReady 
                           ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20" 
                           : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                       }`}
                     >
                       <Unlock size={14} />
                       {isReady ? "Release Funds" : "Early Withdrawal"}
                     </button>
                   ) : (
                     <button disabled className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest bg-zinc-800 text-zinc-500 flex justify-center items-center gap-2 cursor-not-allowed">
                       <ShieldCheck size={14} /> Settled
                     </button>
                   )}
                 </div>
               </motion.div>
             );
          })}
          </AnimatePresence>
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 bg-[var(--bg-subtle)]">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Lock size={20} className="text-amber-400" />
                  Open Term Deposit
                </h3>
                <p className="text-xs font-medium text-zinc-500 mt-1">Lock funds in a high-yield certificate of deposit.</p>
              </div>
              <form onSubmit={handleCreateVault} className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Funding Account</label>
                  <select
                    required
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors appearance-none font-medium"
                  >
                    <option value="">Select source account...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName || acc.name} - {formatMoney(acc.balance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Principal Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-3 pl-8 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Term (Days)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={durationDays}
                      onChange={(e) => setDurationDays(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Yield (APR %)</label>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono"
                    />
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                  <ShieldCheck className="text-amber-400 shrink-0" size={16} />
                  <p className="text-[10px] text-amber-200/80 font-medium leading-relaxed">
                    Early withdrawals before the maturity date will forfeit all accrued interest. The principal will be returned to the funding account immediately.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-amber-600/20"
                  >
                    Lock Funds
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
