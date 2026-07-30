import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Plus, Trash2, Search, Wallet, User, Eye, ArrowRight, RefreshCw, DollarSign, X } from "lucide-react";
import { formatMoney } from "../lib/utils";

export function BankAccounts() {
  const { bank } = useOutletContext<{ bank: any }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Balance adjustment modal state
  const [adjustingAcc, setAdjustingAcc] = useState<any | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("1000");
  const [adjustMode, setAdjustMode] = useState<"deposit" | "set" | "withdraw">("deposit");
  const [adjustingSubmitting, setAdjustingSubmitting] = useState(false);

  const fetchAccounts = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/accounts`)
      .then(r => r.json())
      .then(data => {
        setAccounts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleSyncAll = async (autoSeed = true) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/banks/${bank.id}/transactions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoSeed })
      });
      const data = await res.json();
      if (res.ok) {
        fetchAccounts();
      } else {
        alert(data.error || "Failed to sync balances");
      }
    } catch (err) {
      console.error(err);
      alert("Error triggering balance sync");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (bank?.id) fetchAccounts();
  }, [bank]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      accountName: formData.get("accountName"),
      ownerDiscordId: formData.get("ownerDiscordId"),
      minecraftUsername: formData.get("minecraftUsername"),
      initialBalanceCents: Math.round(parseFloat(formData.get("initialBalance") as string) * 100) || 0
    };

    fetch(`/api/banks/${bank.id}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(async (res) => {
      setSubmitting(false);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to create account");
        return;
      }
      setShowAdd(false);
      fetchAccounts();
    });
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingAcc || !adjustAmount || Number(adjustAmount) < 0) return;
    setAdjustingSubmitting(true);
    try {
      const amountCents = Math.round(Number(adjustAmount) * 100);
      const res = await fetch(`/api/banks/${bank.id}/accounts/${adjustingAcc.id}/adjust-balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          mode: adjustMode,
          description: `Staff Manual Adjustment (${adjustMode})`
        })
      });
      if (res.ok) {
        setAdjustingAcc(null);
        fetchAccounts();
      } else {
        const err = await res.json();
        alert(`Failed to adjust balance: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert("Network error adjusting balance");
    } finally {
      setAdjustingSubmitting(false);
    }
  };

  const handleDelete = (accountId: string) => {
    if (confirm("Are you sure you want to delete this account?")) {
      fetch(`/api/banks/${bank.id}/accounts/${accountId}`, { method: "DELETE" })
        .then(() => fetchAccounts());
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customer Accounts</h2>
          <p className="text-white/60 text-sm mt-1">Manage active banking accounts for {bank.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input 
              type="text" 
              placeholder="Search accounts..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#1a1a24] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors w-full sm:w-64"
            />
          </div>

          <button 
            onClick={() => handleSyncAll(true)}
            disabled={syncing}
            className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 hover:border-indigo-500/50"
            title="Recalculate balances from transactions & seed zero-balance accounts"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin text-indigo-400" : "text-indigo-400"} />
            {syncing ? "Syncing..." : "Sync Balances"}
          </button>

          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 hover:scale-[1.02] shadow-lg shadow-indigo-600/10"
          >
            <Plus size={16} /> Open Account
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-[#0f0f15] border border-white/10 p-6 rounded-xl mb-8 flex flex-col items-start gap-4 shadow-xl">
          <h3 className="text-lg font-medium text-white/90">Provision New Account</h3>
          <form onSubmit={handleAdd} className="w-full flex gap-4 md:items-end flex-col md:flex-row">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Account Name</label>
              <input name="accountName" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" placeholder="e.g. Checking" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Owner Username / Discord ID</label>
              <input name="ownerDiscordId" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" placeholder="123456789" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">MC Username</label>
              <input name="minecraftUsername" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" placeholder="Notch" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Initial Balance ($)</label>
              <input name="initialBalance" type="number" step="0.01" defaultValue="0.00" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
              <button disabled={submitting} type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {submitting ? "Processing..." : "Create"}
              </button>
              <button disabled={submitting} type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 text-white/80 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {adjustingAcc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button onClick={() => setAdjustingAcc(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 text-indigo-400">
              <DollarSign size={24} />
              <div>
                <h3 className="text-lg font-bold text-white">Adjust Account Balance</h3>
                <p className="text-xs text-slate-400">{adjustingAcc.accountName} ({adjustingAcc.id})</p>
              </div>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Adjustment Mode</label>
                <div className="grid grid-cols-3 gap-2 bg-[#0a0a0f] p-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setAdjustMode("deposit")}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${adjustMode === "deposit" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    Deposit (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustMode("set")}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${adjustMode === "set" ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    Set Exact (=)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustMode("withdraw")}
                    className={`py-2 text-xs font-bold rounded-lg transition-all ${adjustMode === "withdraw" ? "bg-rose-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    Withdraw (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {adjustMode === "deposit" ? "Deposit Amount ($)" : adjustMode === "withdraw" ? "Withdrawal Amount ($)" : "New Total Balance ($)"}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full bg-[#1a1a24] border border-white/15 rounded-xl pl-8 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={adjustingSubmitting}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  {adjustingSubmitting ? "Updating..." : "Confirm Adjustment"}
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustingAcc(null)}
                  className="px-4 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl border border-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden overflow-x-auto shadow-2xl">
        {loading ? (
           <div className="p-8 text-center text-white/50">Loading accounts...</div>
        ) : accounts.length === 0 ? (
           <div className="p-8 text-center text-white/50">No accounts found. Provision one to get started.</div>
        ) : (
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="text-xs text-white/40 uppercase tracking-widest bg-white/[0.02] border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-semibold">Account Name</th>
                <th className="px-6 py-4 font-semibold">Owner Username / Discord ID</th>
                <th className="px-6 py-4 font-semibold text-right">Balance</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#09090d]">
              {accounts.filter(acc => 
                acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                acc.ownerDiscordId.includes(searchTerm) ||
                acc.id.includes(searchTerm)
              ).map(acc => (
                <tr key={acc.id} onClick={() => navigate(`/bank/${bank.id}/accounts/${acc.id}`)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/5 text-indigo-400 flex items-center justify-center border border-indigo-500/10">
                        <Wallet size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-white/95 group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                          {acc.accountName}
                          <ArrowRight size={12} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-indigo-400" />
                        </div>
                        <div className="text-xs text-white/30 font-mono mt-0.5">{acc.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <User size={13} className="text-white/30" />
                      <span className="font-mono text-white/70 text-xs">{acc.ownerDiscordId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-emerald-400 font-mono text-base">
                    {formatMoney(acc.balance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => { setAdjustingAcc(acc); setAdjustAmount("1000"); }}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 p-2 rounded transition-colors"
                        title="Top-Up / Adjust Balance"
                      >
                        <DollarSign size={16} />
                      </button>
                      <button 
                        onClick={() => navigate(`/bank/${bank.id}/accounts/${acc.id}`)}
                        className="text-white/60 hover:text-white hover:bg-white/5 p-2 rounded transition-colors"
                        title="View detail"
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(acc.id)}
                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 p-2 rounded transition-colors"
                        title="Delete account"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
