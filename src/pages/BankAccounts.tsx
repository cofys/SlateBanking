import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Plus, Trash2, Search, Wallet, User, Eye, ArrowRight, RefreshCw, DollarSign, X, DownloadCloud } from "lucide-react";
import { formatMoney } from "../lib/utils";

export function BankAccounts() {
  const { bank } = useOutletContext<{ bank: any }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ total: number; processed: number; current?: string; syncedCount: number; flaggedCount: number } | null>(null);
  const [syncResultMsg, setSyncResultMsg] = useState<string | null>(null);
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

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncResultMsg(null);
    setSyncProgress(null);

    try {
      const res = await fetch(`/api/banks/${bank.id}/transactions/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to initiate sync job");
        setSyncing(false);
        return;
      }

      if (data.totalAccounts === 0) {
        setSyncResultMsg("No accounts found to sync.");
        setSyncing(false);
        return;
      }

      const jobId = data.jobId;
      // Poll progress every 500ms
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/banks/${bank.id}/sync-job/${jobId}`);
          if (!statusRes.ok) {
             clearInterval(pollInterval);
             setSyncing(false);
             return;
          }
          const jobData = await statusRes.json();

          setSyncProgress({
            total: jobData.total,
            processed: jobData.processed,
            current: jobData.currentAccountName,
            syncedCount: jobData.syncedCount,
            flaggedCount: jobData.flaggedCount
          });

          if (jobData.status === 'completed' || jobData.status === 'failed') {
            clearInterval(pollInterval);
            setSyncing(false);
            fetchAccounts();
            setSyncProgress(null);

            if (jobData.status === 'completed') {
              const msg = `Sync complete! Verified ${jobData.syncedCount} in-game account(s). ${jobData.flaggedCount > 0 ? `⚠️ ${jobData.flaggedCount} account(s) not found in-game.` : ''}`;
              setSyncResultMsg(msg);
            } else {
              setSyncResultMsg("Sync failed: " + (jobData.error || "Unknown error"));
            }
          }
        } catch (pollErr) {
          console.error("Poll error:", pollErr);
        }
      }, 500);

    } catch (err) {
      console.error(err);
      alert("Error triggering balance sync");
      setSyncing(false);
    }
  };

  const handleAutoImport = async () => {
    if (!confirm("Import and sync all existing CityCorp corporate accounts from in-game into Slate SaaS?")) return;
    setImporting(true);
    setSyncResultMsg(null);
    try {
      const res = await fetch(`/api/banks/${bank.id}/import`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        let msg = `Auto-import complete: `;
        if (data.syncedCount) msg += `Synced ${data.syncedCount} existing account(s). `;
        if (data.importedCount) msg += `Imported ${data.importedCount} new account(s). `;
        if (!data.syncedCount && !data.importedCount) msg += `Found ${data.totalRemote || 0} account(s) in-game on CityCorp (all up to date).`;
        setSyncResultMsg(msg);
        fetchAccounts();
      } else {
        alert(data.error || "Failed to auto-import remote accounts");
      }
    } catch (err) {
      console.error(err);
      alert("Network error auto-importing remote accounts");
    } finally {
      setImporting(false);
    }
  };

  const handleProvisionGame = async (accountId: string, accountName: string) => {
    if (!confirm(`Are you sure you want to create the corporate account "${accountName}" on CityCorp in-game?`)) return;

    try {
      const res = await fetch(`/api/banks/${bank.id}/accounts/${accountId}/provision-game`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Account successfully created in game!");
        fetchAccounts();
      } else {
        alert(data.error || "Failed to create account in game");
      }
    } catch (err) {
      console.error(err);
      alert("Network error provisioning account in game");
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
      initialBalanceCents: Math.round(parseFloat(formData.get("initialBalance") as string) * 100) || 0,
      tierId: formData.get("tierId") || null
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
              className="bg-[var(--bg-subtle)] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors w-full sm:w-64"
            />
          </div>

          <button 
            onClick={handleSyncAll}
            disabled={syncing || importing}
            className="bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 hover:border-indigo-500/50 disabled:opacity-50"
            title="Check each account against CityCorp API in-game"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin text-indigo-400" : "text-indigo-400"} />
            {syncing ? "Syncing Accounts..." : "Sync Balances"}
          </button>

          <button 
            onClick={handleAutoImport}
            disabled={importing || syncing}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 hover:border-emerald-500 disabled:opacity-50"
            title="Auto-import all in-game corporate accounts from CityCorp"
          >
            <DownloadCloud size={15} className={importing ? "animate-bounce text-emerald-400" : "text-emerald-400"} />
            {importing ? "Importing..." : "Auto-Import In-Game Accounts"}
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
        <div className="bg-[var(--bg-elevated)] border border-white/10 p-6 rounded-xl mb-8 flex flex-col items-start gap-4 shadow-xl">
          <h3 className="text-lg font-medium text-white/90">Provision New Account</h3>
          <form onSubmit={handleAdd} className="w-full flex gap-4 md:items-end flex-col md:flex-row">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Account Name</label>
              <input name="accountName" required type="text" className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" placeholder="e.g. Checking" />
            </div>
            {bank.settings?.enableAccountTiers && (
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Account Tier</label>
                <select name="tierId" className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors">
                  <option value="">(No Tier / Default)</option>
                  {(bank.settings?.accountTiers || []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Owner Username / Discord ID</label>
              <input name="ownerDiscordId" required type="text" className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" placeholder="123456789" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">MC Username</label>
              <input name="minecraftUsername" required type="text" className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" placeholder="Notch" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Initial Balance ($)</label>
              <input name="initialBalance" type="number" step="0.01" defaultValue="0.00" className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
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

      {/* Adjust Balance Modal — local mint disabled */}
      {adjustingAcc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button onClick={() => setAdjustingAcc(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
              <X size={18} />
            </button>
            <div className="flex items-center gap-3 text-indigo-400">
              <DollarSign size={24} />
              <h3 className="text-lg font-bold text-white">Adjust Account Balance</h3>
            </div>
            <p className="text-sm text-slate-400">
              Balance adjustments must go through CityCorp (teller cash window or book transfer).
            </p>
            <button
              type="button"
              onClick={() => setAdjustingAcc(null)}
              className="w-full bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold py-2.5 rounded-xl border border-white/10 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sync Progress Banner */}
      {syncProgress && (
        <div className="bg-[#12121e] border border-indigo-500/30 p-4 rounded-xl mb-6 shadow-xl animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin text-indigo-400" />
              <span className="text-sm font-semibold text-indigo-200">
                Syncing CityCorp In-Game Balances... ({syncProgress.processed}/{syncProgress.total})
              </span>
            </div>
            <span className="text-xs font-mono text-indigo-300">
              {Math.round((syncProgress.processed / syncProgress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mb-2">
            <div 
              className="bg-indigo-500 h-full transition-all duration-300" 
              style={{ width: `${(syncProgress.processed / syncProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 font-mono">
            {syncProgress.current ? `Checking account: "${syncProgress.current}"` : "Finalizing sync..."}
          </p>
        </div>
      )}

      {syncResultMsg && (
        <div className={`p-4 rounded-xl mb-6 text-sm font-medium border flex items-center justify-between animate-in fade-in ${syncResultMsg.includes("⚠️") ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"}`}>
          <span>{syncResultMsg}</span>
          <button onClick={() => setSyncResultMsg(null)} className="text-white/40 hover:text-white text-xs ml-4">Dismiss</button>
        </div>
      )}

      <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl overflow-hidden overflow-x-auto shadow-2xl">
        {loading ? (
           <div className="p-8 text-center text-white/50">Loading accounts...</div>
        ) : accounts.length === 0 ? (
           <div className="p-8 text-center text-white/50">No accounts found. Provision one to get started.</div>
        ) : (
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="text-xs text-white/40 uppercase tracking-widest bg-white/[0.02] border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-semibold">Account Name</th>
                {bank.settings?.enableAccountTiers && <th className="px-6 py-4 font-semibold">Tier</th>}
                <th className="px-6 py-4 font-semibold">Owner Username / Discord ID</th>
                <th className="px-6 py-4 font-semibold text-right">Balance</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#09090d]">
              {accounts.filter(acc => {
                if (!acc) return false;
                const accName = String(acc.accountName || "");
                const ownerId = String(acc.ownerDiscordId || "");
                const mcUser = String(acc.ownerMcUsername || "");
                const accId = String(acc.id || "");
                const s = searchTerm.toLowerCase();
                return accName.toLowerCase().includes(s) ||
                       ownerId.toLowerCase().includes(s) ||
                       mcUser.toLowerCase().includes(s) ||
                       accId.toLowerCase().includes(s);
              }).map(acc => (
                <tr key={acc.id} onClick={() => navigate(`/bank/${bank.id}/accounts/${acc.id}`)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/5 text-indigo-400 flex items-center justify-center border border-indigo-500/10">
                        <Wallet size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-white/95 group-hover:text-indigo-400 transition-colors flex items-center gap-1.5 flex-wrap">
                          {acc.accountName}
                          <ArrowRight size={12} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-indigo-400" />
                          {acc.existsInGame === false && (
                            <span className="px-2 py-0.5 text-[10px] uppercase font-extrabold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 tracking-wider">
                              ⚠️ Not Found In-Game
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/30 font-mono mt-0.5">{acc.id} • {acc.accountType || "personal"}</div>
                      </div>
                    </div>
                  </td>
                  {bank.settings?.enableAccountTiers && (
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-white/70 font-mono">
                      {acc.tierId || "Default"}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <User size={13} className="text-white/30" />
                      <span className="font-mono text-white/70 text-xs">{acc.ownerMcUsername || acc.ownerDiscordId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-emerald-400 font-mono text-base">
                    {formatMoney(acc.balance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {acc.existsInGame === false && (
                        <button
                          onClick={() => handleProvisionGame(acc.id, acc.accountName)}
                          className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs px-2.5 py-1.5 rounded-lg transition-all font-semibold flex items-center gap-1 hover:scale-105"
                          title="Create this account on CityCorp in-game"
                        >
                          + Provision in Game
                        </button>
                      )}
                      <button 
                        disabled
                        className="text-emerald-400/40 p-2 rounded cursor-not-allowed"
                        title="Balance adjustments must go through CityCorp (teller cash window or book transfer)."
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
