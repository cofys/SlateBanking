import React, { useState, useEffect } from "react";
import { 
  Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, 
  Lock, Unlock, Link2, BookOpen, LogIn, LogOut, TrendingUp, TrendingDown, 
  PieChart as PieChartIcon, Activity, Target, Plus, Send, Copy, Calendar,
  Users, UserPlus, Trash2, X, Building, UserCheck, AlertCircle, Sparkles, Store,
  RefreshCw, DollarSign, Check
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

export function CitizenPortal() {
  const { user, login, logout, isLoading, checkSession, rememberMe, setRememberMe } = useAuth();
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "assets" | "transfer" | "invoices" | "loans" | "analytics" | "vaults">("dashboard");
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);
  const [showManualLinkModal, setShowManualLinkModal] = useState(false);
  const [manualDiscordId, setManualDiscordId] = useState("");
  const [submittingLink, setSubmittingLink] = useState(false);

  // Sync & Deposit modal state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncingBalances, setSyncingBalances] = useState(false);
  const [citizenSyncProgress, setCitizenSyncProgress] = useState<{ total: number; processed: number; current?: string; syncedCount: number; flaggedCount: number } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [depositAccountId, setDepositAccountId] = useState("");
  const [depositAmount, setDepositAmount] = useState("1000");
  const [depositReason, setDepositReason] = useState("Initial Account Funding");
  const [depositing, setDepositing] = useState(false);

  const handleManualLinkSubmit = async () => {
    if (!manualDiscordId.trim()) return;
    setSubmittingLink(true);
    try {
      const res = await fetch('/api/citizen/link-discord-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordIdToLink: manualDiscordId })
      });
      if (res.ok) {
        setShowManualLinkModal(false);
        setManualDiscordId("");
        await checkSession();
        handleSearch();
      } else {
        const err = await res.json();
        alert(`Failed to link Discord ID: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error linking Discord ID.");
    } finally {
      setSubmittingLink(false);
    }
  };

  useEffect(() => {
    fetch("/api/onyx/merchants")
      .then(r => r.json())
      .then(d => setOnyxMerchants(d || []));
  }, []);

  useEffect(() => {
    if (user) {
      handleSearch();
    }
  }, [user]);

  const toggleCardVisibility = (id: string) => {
    setVisibleCardIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatCardNumber = (num: string, visible: boolean) => {
    if (!num) return "";
    const chunks = num.match(/.{1,4}/g) || [];
    if (visible) return chunks.join(" ");
    return `•••• •••• •••• ${chunks[3] || "0000"}`;
  };

  const handleSyncBalances = async () => {
    setSyncingBalances(true);
    setSyncMessage(null);
    setCitizenSyncProgress(null);
    try {
      const res = await fetch("/api/citizen/sync-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error || "Failed to start balance sync job");
        setSyncingBalances(false);
        return;
      }

      if (data.totalAccounts === 0) {
        setSyncMessage("No accounts found to sync.");
        setSyncingBalances(false);
        return;
      }

      const jobId = data.jobId;
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/citizen/sync-job/${jobId}`);
          if (!statusRes.ok) return;
          const jobData = await statusRes.json();

          setCitizenSyncProgress({
            total: jobData.total,
            processed: jobData.processed,
            current: jobData.currentAccountName,
            syncedCount: jobData.syncedCount,
            flaggedCount: jobData.flaggedCount
          });

          if (jobData.status === 'completed' || jobData.status === 'failed') {
            clearInterval(pollInterval);
            setSyncingBalances(false);
            handleSearch();

            if (jobData.status === 'completed') {
              const msg = `Sync completed! ${jobData.syncedCount} account(s) verified. ${jobData.flaggedCount > 0 ? `⚠️ ${jobData.flaggedCount} account(s) not found in-game.` : ''}`;
              setSyncMessage(msg);
            } else {
              setSyncMessage("Sync failed: " + (jobData.error || "Unknown error"));
            }
          }
        } catch (pollErr) {
          console.error("Poll error:", pollErr);
        }
      }, 500);

    } catch (err) {
      console.error(err);
      setSyncMessage("Error starting balance sync");
      setSyncingBalances(false);
    }
  };

  const handleDepositFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAccountId || !depositAmount || Number(depositAmount) <= 0) return;
    setDepositing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/citizen/deposit-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: depositAccountId,
          amountDollars: depositAmount,
          description: depositReason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(`Deposited $${Number(depositAmount).toFixed(2)} successfully!`);
        handleSearch();
        setTimeout(() => setShowSyncModal(false), 1200);
      } else {
        setSyncMessage(data.error || "Failed to deposit funds");
      }
    } catch (err) {
      console.error(err);
      setSyncMessage("Error depositing funds");
    } finally {
      setDepositing(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/citizen/lookup`);
      if (res.ok) {
        setUserData(await res.json());
      } else {
        setUserData({ error: "No accounts found for this Discord ID." });
      }
    } catch (e) {
      console.error(e);
      setUserData({ error: "System error while fetching data." });
    }
    setLoading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
        <div className="bg-[#12121a] border border-white/5 p-12 rounded-2xl max-w-md w-full text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
          <ShieldCheck className="w-16 h-16 text-indigo-400 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(99,102,241,0.3)]" />
          <h1 className="text-3xl font-black text-white tracking-tight mb-3">Citizen Portal</h1>
          <p className="text-slate-400 text-sm mb-6">Secure access to your unified financial identity. Authenticate via CityCorp to view your accounts across all institutions.</p>
          
          <label className="flex items-center justify-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-200 mb-6 select-none transition-colors">
            <input 
              type="checkbox" 
              checked={rememberMe} 
              onChange={(e) => setRememberMe(e.target.checked)} 
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
            />
            <span>Remember me on this device</span>
          </label>

          <button 
            onClick={() => login(undefined, 'citycorp')}
            className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors"
          >
            <LogIn size={20} />
            Authenticate via CityCorp
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-300 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-6">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
              Citizen Portal
            </h1>
            <p className="text-sm text-slate-400 mt-1">Welcome back, {user.username}. Securely manage your finances.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setSyncMessage(null);
                if (userData?.accounts && userData.accounts.length > 0) {
                  setDepositAccountId(userData.accounts[0].id);
                }
                setShowSyncModal(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-full flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 hover:scale-[1.02]"
            >
              <RefreshCw size={15} className={syncingBalances ? "animate-spin text-white" : "text-white"} />
              Sync / Top-Up Balances
            </button>

            <div className="flex items-center gap-4 bg-[#12121a] p-2 pr-4 rounded-full border border-white/5 shadow-inner">
              <img src={user?.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full border-2 border-indigo-500/30" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white leading-none">{user.username}</span>
                <span className="text-xs text-slate-500 font-mono mt-1">{user.discordId}</span>
              </div>
              <button onClick={logout} className="ml-4 text-slate-500 hover:text-red-400 transition-colors p-2 rounded-full hover:bg-red-500/10" title="Log Out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Discord Account Linking Banner */}
        {(user.discordId?.startsWith("mc_") || !user.discordId || user.discordId.includes("_")) && (
          <div className="mb-8 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-indigo-500/5">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400 shrink-0">
                <Link2 size={24} />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm flex items-center gap-2">
                  Link Your Discord Account
                  <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider">Unlinked</span>
                </h4>
                <p className="text-slate-400 text-xs mt-1">
                  Connect your Discord ID (@Username) to receive real-time bank bot notifications, approve transfers, and unify your Onyx & Slate profile.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <button
                onClick={() => login(undefined, 'discord', 'link')}
                className="w-full sm:w-auto bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#5865F2]/20"
              >
                <LogIn size={15} />
                Link via Discord OAuth
              </button>
              <button
                onClick={() => setShowManualLinkModal(true)}
                className="w-full sm:w-auto bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition-all"
              >
                Manual ID
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : userData?.error ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
            {userData.error}
          </div>
        ) : userData ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-3">
              <nav className="flex flex-col gap-2 sticky top-8">
                {[
                  { id: "dashboard", label: "Dashboard", icon: Activity },
                  { id: "assets", label: "Accounts & Cards", icon: Wallet },
                  { id: "transfer", label: "Move Money", icon: Send },
                  { id: "loans", label: "Loans & Credit", icon: TrendingDown },
                  { id: "invoices", label: "Invoices & Links", icon: Link2 },
                  { id: "analytics", label: "Analytics", icon: PieChartIcon },
                  { id: "vaults", label: "Savings Vaults", icon: Lock },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                      activeTab === tab.id 
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.05)]' 
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <tab.icon size={18} className={activeTab === tab.id ? 'text-indigo-400' : 'text-slate-500'} />
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9 space-y-8">
              {activeTab === "dashboard" && <DashboardTab data={userData} refresh={handleSearch} />}
              {activeTab === "assets" && <AssetsTab data={userData} refresh={handleSearch} visibleCardIds={visibleCardIds} toggleCardVisibility={toggleCardVisibility} formatCardNumber={formatCardNumber} onOpenSyncModal={(accId?: string) => { if (accId) setDepositAccountId(accId); setSyncMessage(null); setShowSyncModal(true); }} />}
              {activeTab === "transfer" && <TransferTab data={userData} refresh={handleSearch} onyxMerchants={onyxMerchants} />}
              {activeTab === "loans" && <LoansTab data={userData} refresh={handleSearch} />}
              {activeTab === "invoices" && <InvoicesTab data={userData} refresh={handleSearch} />}
              {activeTab === "analytics" && <AnalyticsTab data={userData} />}
              {activeTab === "vaults" && <VaultsTab data={userData} />}
            </div>
          </div>
        ) : null}

        {/* Manual Discord Link Modal */}
        {showManualLinkModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
              <button onClick={() => setShowManualLinkModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
                <X size={18} />
              </button>
              <div className="flex items-center gap-3 text-indigo-400">
                <Link2 size={24} />
                <h3 className="text-lg font-bold text-white">Manual Discord Link</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter your numeric Discord User ID or handle to link your profile. This unifies your accounts across all Slate banks and enables automated Discord bot notifications.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Discord ID or Handle</label>
                <input
                  type="text"
                  value={manualDiscordId}
                  onChange={(e) => setManualDiscordId(e.target.value)}
                  placeholder="e.g. 123456789012345678 or @john_doe"
                  className="w-full bg-[#0a0a0f] border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button
                  onClick={() => setShowManualLinkModal(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualLinkSubmit}
                  disabled={submittingLink || !manualDiscordId.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
                >
                  {submittingLink ? "Linking..." : "Link Profile"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync & Top-Up Balances Modal */}
        {showSyncModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative animate-in zoom-in-95 duration-200">
              <button onClick={() => setShowSyncModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
                <X size={18} />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <RefreshCw size={24} className={syncingBalances ? "animate-spin" : ""} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Account Balance Sync & Deposit</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Recalculate ledger balances or add starting funds to your accounts.</p>
                </div>
              </div>

              {citizenSyncProgress && (
                <div className="bg-[#12121e] border border-indigo-500/30 p-3 rounded-xl shadow-lg">
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin text-indigo-400" />
                      Checking CityCorp Accounts ({citizenSyncProgress.processed}/{citizenSyncProgress.total})
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {Math.round((citizenSyncProgress.processed / citizenSyncProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-1">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${(citizenSyncProgress.processed / citizenSyncProgress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {citizenSyncProgress.current ? `Account: "${citizenSyncProgress.current}"` : "Finalizing..."}
                  </p>
                </div>
              )}

              {syncMessage && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  syncMessage.includes("error") || syncMessage.includes("Failed") || syncMessage.includes("⚠️")
                    ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" 
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                }`}>
                  <AlertCircle size={15} />
                  {syncMessage}
                </div>
              )}

              {/* Mode 1: Instant Auto-Sync & Ledger Recalculation */}
              <div className="bg-[#0a0a0f] p-4 rounded-xl border border-white/5 space-y-3">
                <div>
                  <h4 className="text-white font-bold text-sm flex items-center gap-2">
                    Auto-Sync All Accounts
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Checks each linked account against the CityCorp API in-game, recalculating ledger totals and verifying remote balances.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncBalances}
                  disabled={syncingBalances}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={syncingBalances ? "animate-spin" : ""} />
                  {syncingBalances ? "Syncing Accounts..." : "Run In-Game Balance Sync"}
                </button>
              </div>

              {/* Mode 2: Manual Account Top-Up / Deposit */}
              <form onSubmit={handleDepositFunds} className="bg-[#0a0a0f] p-4 rounded-xl border border-white/5 space-y-3">
                <h4 className="text-white font-bold text-sm flex items-center gap-2">
                  <DollarSign size={16} className="text-emerald-400" />
                  Manual Account Top-Up / Deposit
                </h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Target Account</label>
                    <select
                      value={depositAccountId}
                      onChange={(e) => setDepositAccountId(e.target.value)}
                      className="w-full bg-[#12121a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {userData?.accounts?.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName} ({formatMoney(acc.balance)}) - {acc.id}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Deposit Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="w-full bg-[#12121a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Quick Presets</label>
                      <div className="flex gap-1">
                        {["500", "1000", "5000"].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setDepositAmount(amt)}
                            className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                              depositAmount === amt ? "bg-emerald-600 text-white border-emerald-500" : "bg-white/5 text-slate-400 border-white/10 hover:text-white"
                            }`}
                          >
                            +${amt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Reason / Description</label>
                    <input
                      type="text"
                      value={depositReason}
                      onChange={(e) => setDepositReason(e.target.value)}
                      className="w-full bg-[#12121a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      placeholder="e.g. Initial Account Funding"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={depositing || !depositAccountId}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  <DollarSign size={14} />
                  {depositing ? "Processing Deposit..." : `Deposit $${Number(depositAmount || 0).toFixed(2)} Now`}
                </button>
              </form>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl border border-white/10 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function DashboardTab({ data, refresh }: { data: any, refresh: () => void }) {
  const totalAssets = data.accounts?.reduce((sum: number, a: any) => sum + a.balance, 0) || 0;
  const totalDebts = data.loans?.filter((l:any) => l.status === "active").reduce((sum: number, l: any) => sum + (l.amount - (l.amountPaid || 0)), 0) || 0;
  const netWorth = totalAssets - totalDebts;

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
  const pieData = data.accounts?.map((a: any) => ({
    name: a.accountName,
    value: a.balance / 100
  })).filter((a:any) => a.value > 0) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10"><Activity size={64} /></div>
          <p className="text-sm text-slate-500 font-medium mb-1">Total Net Worth</p>
          <p className={`text-3xl font-black ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatMoney(netWorth)}
          </p>
        </div>
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5 relative overflow-hidden">
          <p className="text-sm text-slate-500 font-medium mb-1">Total Assets</p>
          <p className="text-3xl font-black text-indigo-400">{formatMoney(totalAssets)}</p>
        </div>
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5 relative overflow-hidden">
          <p className="text-sm text-slate-500 font-medium mb-1">Total Debts</p>
          <p className="text-3xl font-black text-rose-400">{formatMoney(totalDebts)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
          <h3 className="text-lg font-bold text-white mb-6">Asset Distribution</h3>
          {pieData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry:any, index:number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: any) => `$${value.toFixed(2)}`}
                    contentStyle={{ backgroundColor: '#0a0a0f', borderColor: 'rgba(255,255,255,0.1)' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
             <div className="h-[250px] flex items-center justify-center text-slate-500">No assets available</div>
          )}
        </div>

        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Target className="text-emerald-400" size={20}/> Savings Goals</h3>
            <button className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"><Plus size={14}/> New</button>
          </div>
          
          {data.savingsGoals?.length > 0 ? (
            <div className="space-y-6 overflow-y-auto pr-2 max-h-[250px]">
              {data.savingsGoals.map((goal: any) => {
                const progress = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
                return (
                  <div key={goal.id} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="font-bold text-white text-sm">{goal.name}</p>
                        <p className="text-xs text-slate-500">{formatMoney(goal.currentAmount)} of {formatMoney(goal.targetAmount)}</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-400">{progress}%</span>
                    </div>
                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Target size={32} className="opacity-20 mb-3" />
              <p className="text-sm">No active savings goals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetsTab({ data, refresh, visibleCardIds, toggleCardVisibility, formatCardNumber, onOpenSyncModal }: any) {
  const [activeAccountForMembers, setActiveAccountForMembers] = useState<any>(null);
  const [newMemberDiscordId, setNewMemberDiscordId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("manager");
  const [memberError, setMemberError] = useState("");

  // Personal vs Business Account Filter & Switcher
  const [accountFilter, setAccountFilter] = useState<"all" | "personal" | "business">("all");
  
  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regBankId, setRegBankId] = useState("");
  const [regAccountName, setRegAccountName] = useState("");
  const [regAccountType, setRegAccountType] = useState<"personal" | "business">("personal");
  const [regTaxId, setRegTaxId] = useState("");
  const [regSector, setRegSector] = useState("General Commerce");
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState<any>(null);

  // Set default bank selection if available
  useEffect(() => {
    if (data.banks?.length > 0 && !regBankId) {
      setRegBankId(data.banks[0].id);
    }
  }, [data.banks]);

  const handleRegisterAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regBankId || !regAccountName.trim()) {
      setRegError("Please select a bank and enter an account name.");
      return;
    }
    setRegError("");
    setRegSubmitting(true);
    setRegSuccess(null);

    try {
      const res = await fetch("/api/citizen/accounts/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: regBankId,
          accountName: regAccountName.trim(),
          accountType: regAccountType,
          businessTaxId: regTaxId.trim() || undefined,
          businessSector: regSector.trim() || undefined
        })
      });

      const resData = await res.json();
      if (res.ok) {
        setRegSuccess(resData);
        refresh();
        setTimeout(() => {
          setShowRegisterModal(false);
          setRegSuccess(null);
          setRegAccountName("");
          setRegTaxId("");
        }, 2500);
      } else {
        setRegError(resData.error || "Failed to register account.");
      }
    } catch (err: any) {
      console.error(err);
      setRegError("Network error while registering account.");
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberDiscordId.trim() || !activeAccountForMembers) return;
    setMemberError("");
    try {
      const res = await fetch(`/api/citizen/accounts/${activeAccountForMembers.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberDiscordId: newMemberDiscordId.trim(), role: newMemberRole }),
      });
      const resData = await res.json();
      if (res.ok) {
        setNewMemberDiscordId("");
        refresh();
        setActiveAccountForMembers(null);
      } else {
        setMemberError(resData.error || "Failed to add member");
      }
    } catch(err) {
      console.error(err);
      setMemberError("Network error adding member");
    }
  };

  const handleRemoveMember = async (accountId: string, memberId: string) => {
    try {
      const res = await fetch(`/api/citizen/accounts/${accountId}/members/${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        refresh();
        setActiveAccountForMembers(null);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const personalCount = data.accounts?.filter((a: any) => a.type === "personal" || !a.type).length || 0;
  const businessCount = data.accounts?.filter((a: any) => a.type === "business").length || 0;

  const filteredAccounts = data.accounts?.filter((acc: any) => {
    if (accountFilter === "personal") return acc.type === "personal" || !acc.type;
    if (accountFilter === "business") return acc.type === "business";
    return true;
  }) || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Account Switcher Header & Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#12121a] p-4 rounded-2xl border border-white/5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wallet className="text-indigo-400"/> Bank Accounts
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Switch between personal checking and registered business entity accounts.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Switcher Filter Pills */}
          <div className="bg-[#0a0a0f] p-1 rounded-xl border border-white/10 flex items-center gap-1">
            <button
              onClick={() => setAccountFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                accountFilter === "all" ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({data.accounts?.length || 0})
            </button>
            <button
              onClick={() => setAccountFilter("personal")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                accountFilter === "personal" ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users size={13} />
              Personal ({personalCount})
            </button>
            <button
              onClick={() => setAccountFilter("business")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                accountFilter === "business" ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building size={13} />
              Business ({businessCount})
            </button>
          </div>

          {/* Open / Register Account Button */}
          <button
            onClick={() => { setRegError(""); setShowRegisterModal(true); }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2 whitespace-nowrap ml-auto"
          >
            <Plus size={16} />
            Register Account
          </button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAccounts.map((acc: any) => {
          const userRole = acc.userRole || "owner";
          const isBusiness = acc.type === "business";

          return (
            <div key={acc.id} className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
              isBusiness 
                ? 'bg-gradient-to-br from-[#161224] to-[#12121a] border-purple-500/20 hover:border-purple-500/40 shadow-lg shadow-purple-950/20' 
                : 'bg-[#12121a] border-white/5 hover:border-indigo-500/30'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white text-lg">{acc.accountName}</h3>
                    
                    {/* Account Type Badge */}
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                      isBusiness 
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {isBusiness ? <Building size={10}/> : <Users size={10}/>}
                      {isBusiness ? "Business" : "Personal"}
                    </span>

                    {/* Member Role Badge */}
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                      userRole === 'owner' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                      userRole === 'manager' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                      'bg-slate-500/20 text-slate-300 border-slate-500/30'
                    }`}>
                      {userRole}
                    </span>

                    {/* In-game existence warning badge */}
                    {acc.existsInGame === false && (
                      <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-500/40 flex items-center gap-1 tracking-wider" title={acc.syncError || "Account was not found on CityCorp in-game"}>
                        ⚠️ Not Found In-Game
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-slate-400 mt-0.5">{acc.bankName}</p>

                  {/* Business Metadata */}
                  {isBusiness && (
                    <div className="mt-2 text-xs text-purple-300/80 space-y-0.5 font-mono bg-purple-950/30 p-2 rounded-lg border border-purple-500/20">
                      <div><span className="text-slate-400 font-sans">In-Game Corp:</span> {acc.businessTaxId || "Registered Entity"}</div>
                      <div><span className="text-slate-400 font-sans">Sector:</span> {acc.businessSector || "Commerce"}</div>
                    </div>
                  )}
                </div>

                <span className="font-mono text-xs text-slate-500 bg-black/40 px-2.5 py-1 rounded-lg border border-white/5">{acc.id}</span>
              </div>

              <div className="flex justify-between items-end pt-3 border-t border-white/5">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">Available Balance</div>
                  <p className={`text-2xl font-black ${isBusiness ? 'text-purple-300' : 'text-indigo-300'}`}>
                    {formatMoney(acc.balance)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onOpenSyncModal?.(acc.id)}
                    className="flex items-center gap-1 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 px-2.5 py-1.5 rounded-lg transition-colors border border-emerald-500/20 font-medium"
                    title="Top-Up or Sync Balance"
                  >
                    <DollarSign size={13} />
                    Top-Up
                  </button>
                  {isBusiness && (
                    <span className="text-[11px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-1 rounded-lg flex items-center gap-1 font-medium">
                      <Store size={12} /> Onyx Ready
                    </span>
                  )}
                  {(userRole === "owner" || userRole === "manager") && (
                    <button
                      onClick={() => { setActiveAccountForMembers(acc); setMemberError(""); }}
                      className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-3 py-1.5 rounded-lg transition-colors border border-white/10"
                    >
                      <Users size={14} className="text-indigo-400" />
                      <span>Joint ({acc.members?.length || 0})</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredAccounts.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-400 bg-white/5 rounded-2xl border border-white/5 space-y-3">
            <Building size={32} className="mx-auto text-slate-600" />
            <p className="font-semibold text-white">No {accountFilter !== "all" ? accountFilter : ""} bank accounts found.</p>
            <p className="text-xs text-slate-500">Register a personal checking account or a business entity account to get started.</p>
            <button
              onClick={() => { setRegError(""); setShowRegisterModal(true); }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 mt-2"
            >
              <Plus size={14} /> Open New Account
            </button>
          </div>
        )}
      </div>

      {/* Account Registration Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowRegisterModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Building size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Register Bank Account</h3>
                <p className="text-xs text-slate-400">Open a Personal Checking or Business Entity Account</p>
              </div>
            </div>

            {regError && (
              <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <p className="font-semibold text-rose-200 mb-0.5">Registration Policy Restriction</p>
                  <p>{regError}</p>
                </div>
              </div>
            )}

            {regSuccess && (
              <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs flex items-center gap-3">
                <UserCheck size={20} className="shrink-0 text-emerald-400" />
                <div>
                  <p className="font-bold text-white">{regSuccess.message}</p>
                  <p className="text-emerald-400 font-mono mt-0.5">Account ID: {regSuccess.account?.id}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleRegisterAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Target Banking Institution</label>
                <select
                  value={regBankId}
                  onChange={(e) => setRegBankId(e.target.value)}
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                >
                  {data.banks?.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Account Category / Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRegAccountType("personal")}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                      regAccountType === "personal"
                        ? "bg-indigo-600/20 border-indigo-500 text-white"
                        : "bg-[#1a1a24] border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Users size={18} className={regAccountType === "personal" ? "text-indigo-400" : "text-slate-500"} />
                    <div>
                      <div className="text-xs font-bold">Personal Account</div>
                      <div className="text-[10px] text-slate-400">Individual Checking</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegAccountType("business")}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
                      regAccountType === "business"
                        ? "bg-purple-600/20 border-purple-500 text-white"
                        : "bg-[#1a1a24] border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    <Building size={18} className={regAccountType === "business" ? "text-purple-400" : "text-slate-500"} />
                    <div>
                      <div className="text-xs font-bold">Business Entity</div>
                      <div className="text-[10px] text-slate-400">LLC / Corp / Merchant</div>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                  {regAccountType === "business" ? "Business Name / Trading Name" : "Account Display Name"}
                </label>
                <input
                  type="text"
                  placeholder={regAccountType === "business" ? "e.g. Apex Dynamics LLC" : "e.g. Primary Personal Checking"}
                  value={regAccountName}
                  onChange={(e) => setRegAccountName(e.target.value)}
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  required
                />
              </div>

              {regAccountType === "business" && (
                <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                    <Sparkles size={14} /> Business Registration Details
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">In-Game Corp Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Apex Enterprises"
                      value={regTaxId}
                      onChange={(e) => setRegTaxId(e.target.value)}
                      className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Business Industry / Sector</label>
                    <input
                      type="text"
                      placeholder="e.g. Technology, Retail, Manufacturing"
                      value={regSector}
                      onChange={(e) => setRegSector(e.target.value)}
                      className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <p className="text-[10px] text-purple-300/60">
                    Registering a business account automatically generates an Onyx Merchant Storefront ID for processing payments via quotes and custom checkout buttons.
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={regSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {regSubmitting ? "Registering..." : "Submit Registration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold text-white flex items-center gap-2 mt-12"><CreditCard className="text-indigo-400"/> Virtual Cards</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.cards?.map((card: any) => (
          <div key={card.id} className="relative group">
            <div className={`relative overflow-hidden rounded-2xl p-6 shadow-xl border border-white/10 flex flex-col justify-between transition-all aspect-[1.586/1] ${card.isLocked ? 'bg-zinc-800 opacity-60 grayscale' : (card.type === 'credit' ? 'bg-gradient-to-br from-indigo-900 via-purple-900 to-black' : 'bg-gradient-to-br from-slate-800 via-slate-900 to-black')}`}>
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
              
              <div className="absolute top-1/2 left-6 -translate-y-1/2 w-10 h-8 rounded bg-gradient-to-br from-amber-200 to-amber-500 opacity-80 mix-blend-overlay"></div>

              <div className="flex justify-between items-start relative z-10">
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold italic tracking-wide text-white drop-shadow-md">
                    {card.bankName}
                  </div>
                  {card.isLocked && <span className="bg-red-500/20 text-red-300 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30 font-bold uppercase">Locked</span>}
                </div>
                <div className="text-white/80 font-bold text-[10px] tracking-widest uppercase bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10">
                  {card.type}
                </div>
              </div>
              
              <div className="relative z-10 my-4 flex-1 flex flex-col justify-end">
                <div className="font-mono text-xl tracking-widest text-white font-medium flex items-center justify-between drop-shadow-md">
                  <span>{formatCardNumber(card.cardNumber, visibleCardIds[card.id])}</span>
                  <button 
                    onClick={() => toggleCardVisibility(card.id)}
                    className="text-white/50 hover:text-white transition-colors"
                  >
                    {visibleCardIds[card.id] ? <EyeOff size={16}/> : <Eye size={16}/>}
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-end relative z-10 mt-2">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5 font-bold">Exp</div>
                    <div className="font-mono text-sm text-white/90 tracking-wider">{card.expiryDate}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5 font-bold">CVV</div>
                    <div className="font-mono text-sm text-white/90 tracking-wider">{visibleCardIds[card.id] ? card.cvv : '•••'}</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Hover Actions */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-hover:bottom-2 transition-all z-20 flex gap-2">
                <button 
                  onClick={async () => {
                    await fetch(`/api/citizen/cards/${card.id}/lock`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ isLocked: !card.isLocked })
                    });
                    refresh();
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 ${card.isLocked ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-red-500 text-white hover:bg-red-600'}`}
                >
                  {card.isLocked ? <><Unlock size={12}/> Unfreeze</> : <><Lock size={12}/> Freeze</>}
                </button>
            </div>
          </div>
        ))}
        {(!data.cards || data.cards.length === 0) && (
          <div className="col-span-full p-8 text-center text-slate-500 bg-white/5 rounded-2xl border border-white/5">
            No cards found.
          </div>
        )}
      </div>

      {/* Joint Account Members Modal */}
      {activeAccountForMembers && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="text-indigo-400" size={20} /> Joint Account Members
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{activeAccountForMembers.accountName} ({activeAccountForMembers.id.split('-')[0]})</p>
              </div>
              <button
                onClick={() => setActiveAccountForMembers(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Existing Members */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Current Members</h4>
              {(!activeAccountForMembers.members || activeAccountForMembers.members.length === 0) ? (
                <div className="text-xs text-slate-500 py-3 text-center border border-dashed border-white/10 rounded-xl">
                  No additional joint members added.
                </div>
              ) : (
                <div className="space-y-2">
                  {activeAccountForMembers.members.map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-xs">
                      <div className="font-mono text-white/90">
                        {m.discordId}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="capitalize bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold">
                          {m.role}
                        </span>
                        {activeAccountForMembers.userRole === 'owner' && (
                          <button
                            onClick={() => handleRemoveMember(activeAccountForMembers.id, m.id)}
                            className="text-red-400 hover:text-red-300 p-1"
                            title="Remove Member"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Member Form */}
            <form onSubmit={handleAddMember} className="space-y-3 pt-2 border-t border-white/10">
              <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus size={14} /> Grant Joint Access
              </h4>

              {memberError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
                  {memberError}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Discord User ID"
                  value={newMemberDiscordId}
                  onChange={(e) => setNewMemberDiscordId(e.target.value)}
                  className="col-span-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
                <select
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="manager">Manager (Transfers)</option>
                  <option value="viewer">Viewer Only</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAccountForMembers(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TransferTab({ data, refresh, onyxMerchants }: any) {
  const [addressBookForm, setAddressBookForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState(false);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Address Book */}
      <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><BookOpen className="text-indigo-400" size={20}/> Address Book</h3>
          <button onClick={() => setAddressBookForm(!addressBookForm)} className="text-xs bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"><Plus size={14}/> Add Contact</button>
        </div>
        {addressBookForm && (
          <form className="mb-6 bg-black/20 p-4 rounded-xl border border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end" onSubmit={async (e:any) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            await fetch('/api/citizen/address-book', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(Object.fromEntries(fd))
            });
            setAddressBookForm(false);
            refresh();
          }}>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nickname</label>
              <input required name="nickname" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="e.g., John Doe" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Account ID</label>
              <input required name="contactAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono" placeholder="acc-1234..." />
            </div>
            <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg text-sm h-[38px]">Save Contact</button>
          </form>
        )}
        <div className="flex flex-wrap gap-3">
          {data.addressBook?.map((contact: any) => (
            <div key={contact.id} className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-colors">
              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                {contact.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">{contact.nickname}</span>
                <span className="text-[10px] text-slate-500 font-mono">{contact.contactAccountId.split('-')[0]}</span>
              </div>
            </div>
          ))}
          {(!data.addressBook || data.addressBook.length === 0) && <div className="text-sm text-slate-500">No saved contacts.</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Simple Transfer */}
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
           <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Send className="text-indigo-400" size={20}/> Send Payment</h3>
           <form onSubmit={async (e:any) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              await fetch('/api/citizen/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(fd))
              });
              e.target.reset();
              refresh();
           }} className="space-y-4">
             <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">From Account</label>
                <select required name="fromAccountId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="">Select Account</option>
                  {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName} ({formatMoney(acc.balance)})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">To Account (or Address Book)</label>
                <input required name="toAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white font-mono" placeholder="acc-uuid" list="contacts-list" />
                <datalist id="contacts-list">
                  {data.addressBook?.map((c:any) => <option key={c.id} value={c.contactAccountId}>{c.nickname}</option>)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Amount ($)</label>
                  <input required name="amount" type="number" step="0.01" min="0.01" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white" placeholder="0.00" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-400 mb-1">Memo</label>
                   <input required name="description" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white" placeholder="e.g. Dinner" />
                </div>
              </div>
              <button type="submit" className="w-full mt-4 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2.5 px-4 rounded-xl transition-colors">
                Send Payment
              </button>
           </form>
        </div>

        {/* Recurring Payments */}
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Clock className="text-indigo-400" size={20}/> Recurring Payments</h3>
            <button onClick={() => setRecurringForm(!recurringForm)} className="text-xs bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"><Plus size={14}/> New</button>
          </div>

          {recurringForm && (
            <form className="mb-6 bg-black/20 p-4 rounded-xl border border-white/5 space-y-3" onSubmit={async (e:any) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              await fetch('/api/citizen/recurring-transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(fd))
              });
              setRecurringForm(false);
              refresh();
            }}>
               <div className="grid grid-cols-2 gap-3">
                 <select required name="fromAccountId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
                    <option value="">From Account</option>
                    {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
                  </select>
                  <input required name="toAccountId" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono" placeholder="To Account ID" />
               </div>
               <div className="grid grid-cols-3 gap-3">
                  <input required name="amount" type="number" step="0.01" min="0.01" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white" placeholder="Amount" />
                  <select required name="frequency" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <input required name="description" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white" placeholder="Memo" />
               </div>
               <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-1.5 px-4 rounded-lg text-sm">Schedule Payment</button>
            </form>
          )}

          <div className="space-y-3 flex-1 overflow-y-auto pr-2">
             {data.recurringTransfers?.map((rt: any) => (
                <div key={rt.id} className="bg-white/5 border border-white/10 p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-white flex items-center gap-2">
                       {rt.description} <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full uppercase">{rt.frequency}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Next: {format(new Date(rt.nextRunAt), 'MMM d')} • {rt.isActive ? 'Active' : 'Paused'}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{formatMoney(rt.amount)}</div>
                    <button onClick={async () => {
                      await fetch(`/api/citizen/recurring-transfers/${rt.id}`, { method: 'DELETE' });
                      refresh();
                    }} className="text-xs text-red-400 hover:text-red-300 mt-1">Cancel</button>
                  </div>
                </div>
             ))}
             {(!data.recurringTransfers || data.recurringTransfers.length === 0) && (
                <div className="text-sm text-slate-500 text-center py-6">No recurring payments.</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoansTab({ data, refresh }: any) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [collateralDesc, setCollateralDesc] = useState("");
  const [collateralVal, setCollateralVal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Group accounts by bank for loan selection
  const uniqueBanks: { bankId: string; bankName: string }[] = Array.from(new Set(data.accounts?.map((a: any) => a.bankId as string) || [])).map(bId => {
    const acc = data.accounts.find((a: any) => a.bankId === bId);
    return { bankId: bId as string, bankName: (acc?.bankName || "Slate Bank") as string };
  });

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankId || !selectedAccountId || !principalAmount) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/citizen/loans/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: selectedBankId,
          accountId: selectedAccountId,
          principalAmount: Math.round(parseFloat(principalAmount) * 100),
          purpose,
          collateralDescription: collateralDesc,
          collateralValue: collateralVal
        })
      });
      const resData = await res.json();
      if (res.ok) {
        alert(resData.autoApprove ? "Loan auto-approved and principal disbursed!" : "Loan application submitted for bank review.");
        setShowApplyModal(false);
        setPrincipalAmount("");
        setPurpose("");
        setCollateralDesc("");
        setCollateralVal("");
        refresh();
      } else {
        alert("Error applying for loan: " + resData.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><TrendingDown className="text-indigo-400"/> Loan Management</h2>
          <p className="text-xs text-slate-400 mt-0.5">Track your active liabilities, collateral pledges, and repayment schedules</p>
        </div>
        <button
          onClick={() => setShowApplyModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20"
        >
          <Plus size={16} /> Apply for Loan
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.loans?.map((loan: any) => {
          const totalRemaining = loan.remainingAmount !== undefined ? loan.remainingAmount : (loan.amount - (loan.amountPaid || 0));
          const totalOriginal = loan.principalAmount || loan.amount;
          const progress = Math.min(100, Math.round(((totalOriginal - totalRemaining) / totalOriginal) * 100));

          return (
            <div key={loan.id} className={`bg-[#12121a] p-6 rounded-2xl border flex flex-col justify-between ${loan.isDelinquent ? 'border-rose-500/40 bg-rose-950/10' : 'border-white/5'}`}>
              <div>
                <div className="flex justify-between items-start mb-4">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${loan.status === 'paid' || loan.status === 'paid_off' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/20' : loan.status === 'defaulted' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/20' : loan.isDelinquent ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'}`}>
                    {loan.isDelinquent ? 'OVERDUE' : loan.status}
                  </span>
                  <span className="font-mono text-xs text-slate-500 bg-black/30 px-2 py-1 rounded">#{loan.id.split('-')[0]}</span>
                </div>

                <h3 className="font-bold text-white text-xl mb-1">{formatMoney(totalRemaining)}</h3>
                <p className="text-xs text-slate-400">Original Principal: {formatMoney(totalOriginal)} @ {(loan.interestRate / 100).toFixed(2)}% APR</p>

                {/* Collateral Badge */}
                {loan.collateralDescription && (
                  <div className="mt-3 bg-black/30 border border-white/5 p-2.5 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between items-center text-[11px] text-amber-400 font-medium">
                      <span>Pledged Collateral</span>
                      <span className="uppercase bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px]">{loan.collateralStatus || 'pledged'}</span>
                    </div>
                    <p className="text-slate-300 font-medium truncate">{loan.collateralDescription}</p>
                    {loan.collateralValue > 0 && (
                      <p className="text-slate-500 text-[10px]">Est. Value: {formatMoney(loan.collateralValue)}</p>
                    )}
                  </div>
                )}

                {/* Delinquency Warning */}
                {loan.isDelinquent && (
                  <div className="mt-3 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-xs text-rose-300">
                    <p className="font-bold flex items-center gap-1"><AlertCircle size={14}/> Repayment Overdue!</p>
                    <p className="text-[11px] text-rose-200/80 mt-0.5">Missed payments: {loan.missedPaymentsCount || 1}. Late fee added: {formatMoney(loan.lateFeeAmount || 0)}.</p>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs">
                     <span className="text-slate-400">Principal Repaid: {formatMoney(totalOriginal - totalRemaining)}</span>
                     <span className="text-white font-medium">{Math.max(0, progress)}%</span>
                  </div>
                  <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.max(0, progress)}%` }}></div>
                  </div>
                </div>
              </div>
              
              {loan.status === "active" && (
                <div className="mt-6 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500 mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Calendar size={12}/> Next Due Date:</span>
                    <span className="font-medium text-slate-300">{loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : 'N/A'}</span>
                  </p>
                  <form onSubmit={async (e:any) => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    await fetch('/api/citizen/pay-loan', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...Object.fromEntries(fd), loanId: loan.id })
                    });
                    refresh();
                  }} className="flex gap-2">
                    <select required name="fromAccountId" className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-xs text-white">
                      <option value="">Pay from...</option>
                      {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
                    </select>
                    <button type="submit" className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-2 rounded-lg text-xs font-bold transition-colors">Pay Installment</button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
        {(!data.loans || data.loans.length === 0) && (
          <div className="col-span-full p-12 text-center text-slate-500 bg-white/5 rounded-2xl border border-white/5">
            No active loans or outstanding credit lines.
          </div>
        )}
      </div>

      {/* Apply Loan Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Apply for a Loan</h3>
              <button onClick={() => setShowApplyModal(false)} className="text-slate-500 hover:text-white"><X size={20}/></button>
            </div>

            <form onSubmit={handleApply} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Select Bank</label>
                <select
                  required
                  value={selectedBankId}
                  onChange={(e) => {
                    setSelectedBankId(e.target.value);
                    const firstAcc = data.accounts?.find((a: any) => a.bankId === e.target.value);
                    if (firstAcc) setSelectedAccountId(firstAcc.id);
                  }}
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">Choose bank...</option>
                  {uniqueBanks.map(b => (
                    <option key={b.bankId} value={b.bankId}>{b.bankName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Receiving Account</label>
                <select
                  required
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">Choose account...</option>
                  {data.accounts?.filter((a: any) => !selectedBankId || a.bankId === selectedBankId).map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.accountName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Requested Loan Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={principalAmount}
                  onChange={(e) => setPrincipalAmount(e.target.value)}
                  placeholder="e.g. 5000.00"
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Purpose / Note</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Commercial expansion, equipment purchase"
                  className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="border-t border-white/10 pt-3 space-y-3">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Collateral Asset Security (Optional)</p>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Asset Description</label>
                  <input
                    type="text"
                    value={collateralDesc}
                    onChange={(e) => setCollateralDesc(e.target.value)}
                    placeholder="e.g. Real estate, vehicle, vault items"
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Estimated Asset Value ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={collateralVal}
                    onChange={(e) => setCollateralVal(e.target.value)}
                    placeholder="e.g. 15000.00"
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg text-sm transition-colors mt-2"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicesTab({ data, refresh }: any) {
  const [showLinkMaker, setShowLinkMaker] = useState(false);
  
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Received Invoices */}
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
           <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><BookOpen className="text-indigo-400" size={20}/> Received Invoices</h3>
           <div className="space-y-4">
             {data.invoices?.filter((inv:any) => inv.status !== 'paid').map((inv: any) => (
                <div key={inv.id} className="bg-white/5 border border-white/10 p-4 rounded-xl">
                   <div className="flex justify-between items-start mb-4">
                     <div>
                       <div className="font-bold text-white text-lg">{formatMoney(inv.amount)}</div>
                       <div className="text-sm text-slate-400">{inv.description || "No description"}</div>
                     </div>
                     <span className="text-xs bg-rose-500/20 text-rose-300 px-2 py-1 rounded border border-rose-500/20 uppercase font-bold">Unpaid</span>
                   </div>
                   <form onSubmit={async (e:any) => {
                      e.preventDefault();
                      const fd = new FormData(e.target);
                      await fetch('/api/citizen/pay-invoice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...Object.fromEntries(fd), invoiceId: inv.id })
                      });
                      refresh();
                   }} className="flex gap-2">
                      <select required name="fromAccountId" className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                        <option value="">Pay from account...</option>
                        {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
                      </select>
                      <button type="submit" className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors">Pay</button>
                   </form>
                </div>
             ))}
             {(!data.invoices || data.invoices.filter((inv:any) => inv.status !== 'paid').length === 0) && (
               <div className="text-sm text-slate-500 text-center py-8">No pending invoices.</div>
             )}
           </div>
        </div>

        {/* Payment Links */}
        <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
           <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-white flex items-center gap-2"><Link2 className="text-indigo-400" size={20}/> Payment Links</h3>
             <button onClick={() => setShowLinkMaker(!showLinkMaker)} className="text-xs bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"><Plus size={14}/> Create Link</button>
           </div>
           
           {showLinkMaker && (
             <form className="mb-6 bg-black/20 p-4 rounded-xl border border-white/5 space-y-4" onSubmit={async (e:any) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                await fetch('/api/citizen/payment-links', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(Object.fromEntries(fd))
                });
                setShowLinkMaker(false);
                refresh();
             }}>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Receive to Account</label>
                  <select required name="billerAccountId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                    {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Amount ($) <span className="opacity-50">(Optional)</span></label>
                    <input name="amount" type="number" step="0.01" min="0" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="Leave empty for any amount" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Memo</label>
                    <input required name="description" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" placeholder="e.g. Freelance work" />
                  </div>
                </div>
                <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg text-sm">Generate Link</button>
             </form>
           )}

           <div className="space-y-3">
              {data.paymentLinks?.map((link: any) => (
                <div key={link.id} className="bg-white/5 border border-white/10 p-4 rounded-xl flex items-center justify-between">
                   <div>
                     <div className="font-bold text-sm text-white">{link.description}</div>
                     <div className="text-xs text-slate-400 mt-1">{link.amount > 0 ? formatMoney(link.amount) : 'Open Amount'}</div>
                   </div>
                   <button 
                     onClick={() => {
                        const url = `${window.location.origin}/pay/${link.id}`;
                        navigator.clipboard.writeText(url);
                        alert("Link copied to clipboard!");
                     }}
                     className="bg-black/30 hover:bg-white/10 border border-white/10 p-2 rounded-lg transition-colors text-slate-400 hover:text-white"
                     title="Copy link"
                   >
                     <Copy size={16} />
                   </button>
                </div>
              ))}
              {(!data.paymentLinks || data.paymentLinks.length === 0) && (
                <div className="text-sm text-slate-500 text-center py-8">No payment links created.</div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab({ data }: any) {
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [catInput, setCatInput] = useState("");

  const txs = data.transactions || [];
  
  // Compute categorized spending
  const categoryMap: Record<string, number> = {};
  txs.forEach((tx:any) => {
    // Only count outflows
    const isOutflow = data.accounts?.some((a:any) => a.id === tx.fromAccountId);
    if (isOutflow) {
      const cat = tx.category || "Uncategorized";
      categoryMap[cat] = (categoryMap[cat] || 0) + tx.amount;
    }
  });

  const pieData = Object.keys(categoryMap).map(k => ({ name: k, value: categoryMap[k] / 100 })).sort((a,b) => b.value - a.value);
  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#14b8a6', '#8b5cf6', '#ef4444', '#64748b'];

  // Compute daily cash flow trend for recent transactions
  const dailyFlowMap: Record<string, { income: number; expense: number }> = {};
  txs.forEach((tx: any) => {
    const dayStr = format(new Date(tx.timestamp), 'MMM d');
    if (!dailyFlowMap[dayStr]) {
      dailyFlowMap[dayStr] = { income: 0, expense: 0 };
    }
    const isOutflow = data.accounts?.some((a: any) => a.id === tx.fromAccountId);
    if (isOutflow) {
      dailyFlowMap[dayStr].expense += tx.amount / 100;
    } else {
      dailyFlowMap[dayStr].income += tx.amount / 100;
    }
  });

  const cashFlowTrend = Object.keys(dailyFlowMap).slice(-7).map(day => ({
    day,
    Income: dailyFlowMap[day].income,
    Expense: dailyFlowMap[day].expense,
  }));

  const handleUpdateCategory = async (txId: string) => {
     await fetch(`/api/citizen/transactions/${txId}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: catInput || "Uncategorized" })
     });
     setSelectedTx(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Cash Flow Trend Chart */}
      <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Activity className="text-emerald-400" size={20} /> 7-Day Cash Flow Breakdown
        </h3>
        {cashFlowTrend.length > 0 ? (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashFlowTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262636" />
                <XAxis dataKey="day" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <RechartsTooltip formatter={(val: any) => `$${Number(val).toFixed(2)}`} contentStyle={{ backgroundColor: '#0a0a0f', borderColor: 'rgba(255,255,255,0.1)' }} />
                <Legend />
                <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-slate-500 text-xs">
            No transaction trend data available yet.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5">
           <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><PieChartIcon className="text-indigo-400" size={20}/> Spending by Category</h3>
           {pieData.length > 0 ? (
             <div className="h-[300px]">
               <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: any) => `$${value.toFixed(2)}`} contentStyle={{ backgroundColor: '#0a0a0f', borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Legend />
                  </PieChart>
               </ResponsiveContainer>
             </div>
           ) : (
             <div className="h-[300px] flex items-center justify-center text-slate-500">No spending data available.</div>
           )}
         </div>

         <div className="bg-[#12121a] p-6 rounded-2xl border border-white/5 flex flex-col">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2"><Clock className="text-indigo-400" size={20}/> Recent Transactions</h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 max-h-[400px]">
              {txs.slice(0,20).map((tx:any) => {
                const isOutflow = data.accounts?.some((a:any) => a.id === tx.fromAccountId);
                const isSelected = selectedTx?.id === tx.id;
                
                return (
                  <div key={tx.id} className="bg-white/5 border border-white/10 p-3 rounded-xl">
                    <div className="flex justify-between items-center cursor-pointer" onClick={() => {
                        setSelectedTx(isSelected ? null : tx);
                        setCatInput(tx.category || "");
                    }}>
                      <div>
                        <div className="font-medium text-sm text-white">{tx.description || "Transfer"}</div>
                        <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                           {format(new Date(tx.timestamp), 'MMM d, h:mm a')}
                           <span className="bg-black/30 px-2 py-0.5 rounded">{tx.category || "Uncategorized"}</span>
                        </div>
                      </div>
                      <div className={`font-bold ${isOutflow ? 'text-white' : 'text-emerald-400'}`}>
                         {isOutflow ? '-' : '+'}{formatMoney(tx.amount)}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-white/10 flex gap-2">
                        <input 
                           type="text" 
                           value={catInput} 
                           onChange={e => setCatInput(e.target.value)}
                           placeholder="Category (e.g. Food, Rent)"
                           className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white"
                        />
                        <button onClick={() => handleUpdateCategory(tx.id)} className="bg-indigo-500/20 text-indigo-400 px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-500/30">Save</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {txs.length === 0 && <div className="text-sm text-slate-500 text-center py-8">No transactions.</div>}
            </div>
         </div>
      </div>
    </div>
  );
}



function VaultsTab({ data }: any) {
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState(false);
  
  const [formAccountId, setFormAccountId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formLockDays, setFormLockDays] = useState(30);
  const [submitError, setSubmitError] = useState("");

  const accounts = data.accounts || [];

  const fetchVaults = async () => {
     setLoading(true);
     try {
       const res = await fetch('/api/citizen/vaults');
       if (res.ok) setVaults(await res.json());
     } catch(e) {}
     setLoading(false);
  };

  useEffect(() => {
     fetchVaults();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError("");
      try {
         const res = await fetch('/api/citizen/vaults', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               accountId: formAccountId,
               amount: Math.round(parseFloat(formAmount) * 100),
               lockDays: formLockDays
            })
         });
         const result = await res.json();
         if (!res.ok) throw new Error(result.error || "Failed to create vault");
         setCreateMode(false);
         setFormAmount("");
         fetchVaults();
      } catch(err: any) {
         setSubmitError(err.message);
      }
  };

  const handleWithdraw = async (id: string) => {
      if (!window.confirm("Are you sure you want to withdraw from this vault? Early withdrawals incur a penalty based on your bank's policy.")) return;
      try {
         const res = await fetch(`/api/citizen/vaults/${id}/withdraw`, { method: 'POST' });
         if (res.ok) fetchVaults();
         else alert("Withdrawal failed");
      } catch(e) {
         alert("Withdrawal failed");
      }
  };

  if (loading) return <div className="p-8 text-center text-white/50 animate-pulse">Loading vaults...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Savings Vaults</h2>
          <p className="text-white/60 text-sm mt-1">Lock funds to earn high-yield interest.</p>
        </div>
        {!createMode && (
          <button onClick={() => setCreateMode(true)} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl transition-colors text-sm font-medium">
            <Plus size={16} /> Open Vault
          </button>
        )}
      </div>

      {createMode && (
         <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5"><Lock size={120} /></div>
            <h3 className="text-lg font-bold text-white mb-4">Open a New Vault</h3>
            {submitError && <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-lg">{submitError}</div>}
            <form onSubmit={handleCreate} className="space-y-4 relative z-10 max-w-md">
               <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Source Account</label>
                  <select required value={formAccountId} onChange={e => {
                      setFormAccountId(e.target.value);
                      const bankId = accounts.find((a: any) => a.id === e.target.value)?.bankId;
                      const tiers = data.banksConfig?.[bankId]?.vaultTiers;
                      if (tiers && tiers.length > 0) setFormLockDays(tiers[0].lockDays);
                    }} className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                    <option value="">Select Account</option>
                    {accounts.filter((a:any)=>a.status==='active').map((a:any) => (
                      <option key={a.id} value={a.id}>{a.accountName} - {formatMoney(a.balance)}</option>
                    ))}
                  </select>
               </div>
               <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Amount</label>
                  <input required type="number" step="0.01" min="1" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500" />
               </div>
               <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Lock Period & Interest</label>
                  <select required value={formLockDays} onChange={e => setFormLockDays(parseInt(e.target.value))} className="w-full bg-[#1a1a24] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500">
                    {(() => {
                        const selectedAcc = accounts.find((a: any) => a.id === formAccountId);
                        const bankId = selectedAcc?.bankId;
                        const tiers = data.banksConfig?.[bankId]?.vaultTiers || [];
                        if (tiers.length === 0) return <option value="">No Vaults Available for this Bank</option>;
                        return tiers.map((t: any) => (
                           <option key={t.lockDays} value={t.lockDays}>{t.lockDays} Days - {(t.interestRate/100).toFixed(2)}% Interest ({t.penaltyPercent}% Early Penalty)</option>
                        ));
                    })()}
                  </select>
               </div>
               <div className="flex gap-4 pt-2">
                 <button type="submit" className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 rounded-xl transition-colors">Lock Funds</button>
                 <button type="button" onClick={() => setCreateMode(false)} className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium">Cancel</button>
               </div>
            </form>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vaults.length === 0 && !createMode ? (
          <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-2xl">
            <Lock className="mx-auto text-white/20 mb-3" size={32} />
            <p className="text-white/50">You don't have any active savings vaults.</p>
          </div>
        ) : (
          vaults.map((v: any) => {
            const isEarly = new Date() < new Date(v.lockedUntil);
            return (
              <div key={v.id} className="bg-[#12121a] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Lock size={16} className={v.status === 'locked' ? (isEarly ? "text-amber-400" : "text-emerald-400") : "text-white/30"} />
                      <span className="text-sm font-medium text-white/60">
                         {v.status === 'locked' ? (isEarly ? "Locked Vault" : "Matured Vault") : (v.status === 'released' ? 'Completed' : 'Early Withdrawal')}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-white tracking-tight">{formatMoney(v.amount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/40 mb-1">Interest Rate</div>
                    <div className="text-sm font-medium text-emerald-400">{(v.interestRate/100).toFixed(1)}% Yield</div>
                  </div>
                </div>
                
                <div className="space-y-3 mb-6 relative z-10">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Linked Account</span>
                    <span className="text-white font-medium">{v.accountName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">{isEarly ? "Unlocks On" : "Unlocked On"}</span>
                    <span className="text-white font-medium">{format(new Date(v.lockedUntil), "MMM d, yyyy")}</span>
                  </div>
                  {v.status === 'locked' && (
                     <div className="w-full bg-white/5 rounded-full h-1.5 mt-2">
                       <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, 100 - (new Date(v.lockedUntil).getTime() - Date.now()) / (30 * 24 * 60 * 60 * 1000) * 100))}%`}}></div>
                     </div>
                  )}
                </div>

                {v.status === 'locked' && (
                  <button 
                    onClick={() => handleWithdraw(v.id)}
                    className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${isEarly ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}
                  >
                    {isEarly ? "Early Withdraw (20% Penalty)" : "Claim Principal & Interest"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
