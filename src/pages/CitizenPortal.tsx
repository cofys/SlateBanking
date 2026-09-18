import React, { useState, useEffect } from "react";
import { 
  Search, Wallet, ArrowRight, ShieldCheck, Shield, Clock, CreditCard, Eye, EyeOff, 
  Lock, Unlock, Link2, BookOpen, LogIn, LogOut, TrendingUp, TrendingDown, 
  PieChart as PieChartIcon, Activity, Target, Plus, Send, Copy, Calendar,
  Users, UserPlus, Trash2, X, Building, UserCheck, AlertCircle, Sparkles, Store,
  RefreshCw, DollarSign, Check, FileText, ExternalLink
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";

export function CitizenPortal() {
  const { user, login, logout, isLoading, rememberMe, setRememberMe } = useAuth();
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const myMerchants = userData?.merchants || [];
  const [activeTab, setActiveTab] = useState<"dashboard" | "assets" | "transfer" | "invoices" | "loans" | "analytics" | "vaults" | "merchants" | "subscriptions" | "escrows">("dashboard");
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);
  const [showSyncModal, setShowSyncModal] = useState(false);

  const [syncingBalances, setSyncingBalances] = useState(false);
  const [citizenSyncProgress, setCitizenSyncProgress] = useState<{ total: number; processed: number; current?: string; syncedCount: number; flaggedCount: number } | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState({ rpName: "", address: "" });
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Citizen Portal | Slate Banking";
  }, []);

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
          if (!statusRes.ok) {
             clearInterval(pollInterval);
             setSyncingBalances(false);
             return;
          }
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
            setCitizenSyncProgress(null);
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

  useEffect(() => {
    if (userData && userData.profile !== undefined) {
      if (!userData.profile || !userData.profile.rpName || !userData.profile.address) {
        setShowOnboarding(true);
      } else {
        setShowOnboarding(false);
      }
    }
  }, [userData]);

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onboardingData.rpName || !onboardingData.address) return;
    setOnboardingSubmitting(true);
    try {
      const res = await fetch("/api/citizen/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankId: userData?.banks?.[0]?.id || "global",
          rpName: onboardingData.rpName,
          address: onboardingData.address
        })
      });
      if (res.ok) {
        setShowOnboarding(false);
        handleSearch(); // Refresh data
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update profile.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setOnboardingSubmitting(false);
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
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500/30">
        {/* Subtle Ambient Radial Backdrops */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="bg-[#0e0e15]/95 border border-white/10 p-8 sm:p-10 rounded-2xl max-w-md w-full text-center shadow-2xl relative z-10 backdrop-blur-xl space-y-6">
          <div className="relative mx-auto w-16 h-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20 text-white">
              <ShieldCheck size={32} />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Citizen Financial Gateway</h1>
            <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed font-medium">
              Authenticate your identity to access accounts, transfers, loans, and credit lines across all member banks.
            </p>
          </div>
          
          <div className="space-y-4 pt-1">
            <label className="flex items-center justify-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 select-none transition-colors">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)} 
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 cursor-pointer"
              />
              <span>Remember me on this device</span>
            </label>

            <div className="space-y-2.5">
              <button 
                onClick={() => login(undefined, 'citycorp')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-[0.99] text-base cursor-pointer"
              >
                <LogIn size={20} />
                Login / Signup with CityCorp
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
              Protected by Slate Multi-Tenant Security & Onyx PSP clearing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060609] text-slate-300 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-emerald-600/5 rounded-full blur-[150px] pointer-events-none" />
      

      {showOnboarding && (
        <div className="fixed inset-0 bg-[#060609]/95 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0e0e15] border border-white/10 p-8 rounded-2xl max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
            
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Complete Your Profile</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Welcome to Slate Banking. To open accounts and perform transactions, we need a few legal details for your profile.
              </p>
            </div>

            <form onSubmit={handleOnboardingSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Legal RP Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  className="w-full bg-[#151520] border border-white/5 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
                  value={onboardingData.rpName}
                  onChange={e => setOnboardingData({...onboardingData, rpName: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Home Address</label>
                <input
                  type="text"
                  required
                  placeholder="123 Main St, CityCorp"
                  className="w-full bg-[#151520] border border-white/5 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-indigo-500 transition-colors"
                  value={onboardingData.address}
                  onChange={e => setOnboardingData({...onboardingData, address: e.target.value})}
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={onboardingSubmitting}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl transition-colors shadow-lg shadow-indigo-600/20 text-sm"
                >
                  {onboardingSubmitting ? "Saving Profile..." : "Complete Setup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
        
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
                setShowSyncModal(true);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-full flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20 hover:scale-[1.02]"
            >
              <RefreshCw size={15} className={syncingBalances ? "animate-spin text-white" : "text-white"} />
              Sync Balances
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
                  ...(myMerchants.length > 0 ? [{ id: "merchants", label: "Onyx Storefront", icon: Store }] : []),
                  { id: "subscriptions", label: "Subscriptions", icon: RefreshCw }
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
              {activeTab === "assets" && <AssetsTab data={userData} refresh={handleSearch} visibleCardIds={visibleCardIds} toggleCardVisibility={toggleCardVisibility} formatCardNumber={formatCardNumber} onOpenSyncModal={() => { setSyncMessage(null); setShowSyncModal(true); }} />}
              {activeTab === "transfer" && <TransferTab data={userData} refresh={handleSearch} onyxMerchants={onyxMerchants} />}
              {activeTab === "loans" && <LoansTab data={userData} refresh={handleSearch} />}
              {activeTab === "invoices" && <InvoicesTab data={userData} refresh={handleSearch} />}
              
{activeTab === "merchants" && (
  <div className="space-y-6 animate-in fade-in duration-300">
     <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-xl font-bold text-white flex items-center gap-2">
             <Store className="text-emerald-400" /> Onyx Merchant Storefronts
           </h2>
           <p className="text-white/50 text-sm">Manage API keys and payment links for your business accounts.</p>
        </div>
     </div>

     {myMerchants.map((merchant: any) => {
        const destAcc = userData?.accounts?.find((a: any) => a.id === merchant.destinationAccount);
        return (
          <div key={merchant.id} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
             <div className="flex justify-between items-start">
                <div>
                   <h3 className="text-xl font-bold text-white mb-1">{merchant.name}</h3>
                   <p className="text-sm text-white/50 flex items-center gap-1"><Building size={14}/> ID: {merchant.id}</p>
                </div>
                <div className="text-right">
                   <div className="text-sm font-semibold text-white/50">Destination Account</div>
                   <div className="text-emerald-400 font-medium">{destAcc?.accountName || merchant.destinationAccount}</div>
                </div>
             </div>

             <div className="bg-black/30 rounded-lg p-4 border border-white/5">
                <div className="text-sm text-white/50 mb-2 uppercase tracking-wider font-bold">API Integration Key</div>
                <div className="flex gap-2">
                   <input 
                     type="password" 
                     readOnly 
                     value={merchant.apiKey} 
                     className="bg-black/50 border border-white/10 rounded px-3 py-2 text-white/80 w-full font-mono text-sm"
                     id={`api-key-${merchant.id}`}
                   />
                   <button 
                     onClick={() => {
                        const el = document.getElementById(`api-key-${merchant.id}`) as HTMLInputElement;
                        if(el.type === 'password') el.type = 'text'; else el.type = 'password';
                     }}
                     className="bg-white/10 hover:bg-white/20 p-2 rounded text-white"
                   >
                     <Eye size={18} />
                   </button>
                   <button 
                     onClick={() => {
                        navigator.clipboard.writeText(merchant.apiKey);
                        alert("API Key copied!");
                     }}
                     className="bg-emerald-600 hover:bg-emerald-500 p-2 rounded text-white flex items-center gap-2"
                   >
                     <Copy size={18} /> Copy
                   </button>
                </div>
                <p className="text-xs text-amber-400/80 mt-2 flex items-center gap-1">
                  <AlertCircle size={12} /> Keep this key secret. It grants access to create checkouts on behalf of this merchant.
                </p>
             </div>

             <div className="bg-white/5 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3">Checkout Integration Example</h4>
                <div className="bg-black/50 p-4 rounded border border-white/5 overflow-x-auto text-sm text-white/70 font-mono">
                  {`<!-- Redirect users to this URL to securely approve payments -->
<a href="${window.location.origin}/onyx/checkout?merchantId=${merchant.id}&amount=5000&description=Order%20123&callbackUrl=https://yourwebsite.com/callback">Pay with Onyx</a>`}
                </div>
             </div>
          </div>
        );
     })}
  </div>
)}

              {activeTab === "analytics" && <AnalyticsTab data={userData} />}
              {activeTab === "vaults" && <VaultsTab data={userData} />}
            </div>
          </div>
        ) : null}

        {/* Sync Balances Modal */}
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
                  <h3 className="text-lg font-bold text-white">Account Balance Sync</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Recalculate ledger balances from CityCorp in-game accounts.</p>
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

              <div className="bg-[#0a0a0f] p-4 rounded-xl border border-white/5">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Deposit in-game via <span className="font-mono text-slate-200">/c account deposit</span> or visit a teller. Portal deposits are disabled.
                </p>
              </div>

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
  const totalDebts = data.loans?.filter((l:any) => l.status === "active" || l.status === "delinquent").reduce((sum: number, l: any) => {
    const remaining = l.remainingAmount !== undefined ? l.remainingAmount : (l.amount - (l.amountPaid || 0));
    return sum + (remaining || 0);
  }, 0) || 0;
  const netWorth = totalAssets - totalDebts;

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
  const pieData = data.accounts?.map((a: any) => ({
    name: a.accountName,
    value: a.balance / 100
  })).filter((a:any) => a.value > 0) || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Bento Grid Top Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Net Worth Card - Large */}
        <div className="md:col-span-2 relative bg-gradient-to-br from-[#13131c] to-[#0a0a0f] p-8 rounded-3xl border border-white/5 overflow-hidden shadow-2xl group hover:border-indigo-500/30 transition-all duration-500">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -mr-20 -mt-20 transition-all group-hover:bg-indigo-500/20" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md">
                <Activity className="text-indigo-400" size={24} />
              </div>
              <p className="text-sm text-slate-400 uppercase tracking-widest font-bold">Total Net Worth</p>
            </div>
            <div className="flex items-end gap-4">
              <p className={`text-6xl font-black tracking-tight ${netWorth >= 0 ? 'text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400' : 'text-red-400'}`}>
                {formatMoney(netWorth)}
              </p>
            </div>
          </div>
        </div>

        {/* Assets Card */}
        <div className="bg-[#13131c]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/5 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-500 flex flex-col justify-between">
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-[60px] translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
              <TrendingUp size={20} />
            </div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total Assets</p>
          </div>
          <p className="text-3xl font-black text-white tracking-tight">{formatMoney(totalAssets)}</p>
        </div>

        {/* Debts Card */}
        <div className="bg-[#13131c]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/5 relative overflow-hidden group hover:border-rose-500/30 transition-all duration-500 flex flex-col justify-between">
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-rose-500/10 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/2" />
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400">
              <TrendingDown size={20} />
            </div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total Debts</p>
          </div>
          <p className="text-3xl font-black text-white tracking-tight">{formatMoney(totalDebts)}</p>
        </div>
      </div>

      {/* Bento Grid Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Asset Distribution */}
        <div className="lg:col-span-2 bg-[#13131c]/80 backdrop-blur-xl p-8 rounded-3xl border border-white/5">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <PieChartIcon className="text-indigo-400" size={20}/> Asset Distribution
            </h3>
          </div>
          {pieData.length > 0 ? (
            <div className="h-[280px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                    cornerRadius={8}
                  >
                    {pieData.map((entry:any, index:number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    formatter={(value: any) => `$${value.toFixed(2)}`}
                    contentStyle={{ backgroundColor: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(10px)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '16px', color: '#fff' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
             <div className="h-[280px] flex items-center justify-center text-slate-500">
               <div className="text-center">
                 <PieChartIcon size={48} className="mx-auto mb-4 opacity-20" />
                 <p className="text-sm">No assets available to chart.</p>
               </div>
             </div>
          )}
        </div>

        {/* Savings Goals */}
        <div className="bg-[#13131c]/80 backdrop-blur-xl p-8 rounded-3xl border border-white/5 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Target className="text-emerald-400" size={20}/> Goals
            </h3>
            <button className="text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl transition-colors flex items-center gap-1 font-semibold text-white/80 hover:text-white">
              <Plus size={14}/> New
            </button>
          </div>
          
          {data.savingsGoals?.length > 0 ? (
            <div className="space-y-6 overflow-y-auto pr-2 max-h-[300px] relative z-10 custom-scrollbar">
              {data.savingsGoals.map((goal: any) => {
                const progress = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
                return (
                  <div key={goal.id} className="space-y-3 p-4 rounded-2xl bg-black/40 border border-white/5 hover:border-white/10 transition-colors">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="font-bold text-white text-sm mb-1">{goal.name}</p>
                        <p className="text-[11px] font-medium text-slate-400">{formatMoney(goal.currentAmount)} / {formatMoney(goal.targetAmount)}</p>
                      </div>
                      <div className="bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                         <span className="text-xs font-bold text-emerald-400">{progress}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full relative" style={{ width: `${progress}%` }}>
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/30" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 relative z-10">
              <Target size={48} className="opacity-10 mb-4" />
              <p className="text-sm text-center px-4">You have no active savings goals.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssetsTab({ data, refresh, visibleCardIds, toggleCardVisibility, formatCardNumber, onOpenSyncModal }: any) {
  const [payCardId, setPayCardId] = useState<string | null>(null);
  const [payCardAmount, setPayCardAmount] = useState("");
  const [payCardSourceAcc, setPayCardSourceAcc] = useState("");
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
  const [regSubType, setRegSubType] = useState<"checking" | "savings">("checking");
  const [regTierId, setRegTierId] = useState("");
  const [regTaxId, setRegTaxId] = useState("");
  const [regSector, setRegSector] = useState("General Commerce");
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState<any>(null);

  // Upgrade Modal State
  const [upgradeAccount, setUpgradeAccount] = useState<any>(null);
  const [upgradeTierId, setUpgradeTierId] = useState("");
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  // Set default bank selection if available
  useEffect(() => {
    if (data.banks?.length > 0 && !regBankId) {
      setRegBankId(data.banks[0].id);
    }
  }, [data.banks]);

  const currentSettings = data.settings?.find((s: any) => s.bankId === regBankId);
  const hasCustomTiers = currentSettings?.enableAccountTiers && currentSettings.accountTiers;
  const publicTiers = hasCustomTiers ? currentSettings.accountTiers.filter((t: any) => !t.isPrivate) : [];

  useEffect(() => {
    if (showRegisterModal) {
      if (publicTiers.length > 0 && (!regTierId || !publicTiers.find((t: any) => t.id === regTierId))) {
        setRegTierId(publicTiers[0].id);
        setRegAccountType(publicTiers[0].type);
      } else if (publicTiers.length === 0) {
        setRegTierId("");
      }
    }
  }, [regBankId, showRegisterModal]);

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
          accountType: `${regAccountType}_${regSubType}`,
          tierId: regTierId || undefined,
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

  const handleUpgradeTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeAccount || !upgradeTierId) return;
    setUpgradeSubmitting(true);
    setUpgradeError("");
    try {
       const res = await fetch(`/api/citizen/accounts/${upgradeAccount.id}/upgrade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tierId: upgradeTierId })
       });
       const resData = await res.json();
       if (res.ok) {
          setUpgradeAccount(null);
          refresh();
       } else {
          setUpgradeError(resData.error || "Failed to upgrade account tier.");
       }
    } catch (e: any) {
       console.error(e);
       setUpgradeError("Network error while upgrading account.");
    } finally {
       setUpgradeSubmitting(false);
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
                    
                    {/* Account Type / Tier Badge */}
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                      isBusiness 
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' 
                        : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {isBusiness ? <Building size={10}/> : <Users size={10}/>}
                      {data.settings?.find((s:any) => s.bankId === acc.bankId)?.accountTiers?.find((t:any) => t.id === acc.tierId)?.name || (isBusiness ? "Business" : "Personal")}
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
                  {userRole === 'owner' && data.settings?.find((s:any) => s.bankId === acc.bankId)?.enableAccountTiers && (
                    <button
                      onClick={() => {
                        const bankSettings = data.settings?.find((s:any) => s.bankId === acc.bankId);
                        const accountTiers = bankSettings?.accountTiers || [];
                        const validUpgrades = accountTiers.filter((t:any) => !t.isPrivate && t.type === acc.type && t.id !== acc.tierId);
                        if (validUpgrades.length > 0) {
                          setUpgradeAccount(acc);
                          setUpgradeTierId(validUpgrades[0].id);
                          setUpgradeError("");
                        } else {
                           alert("No other public tiers available for this account type.");
                        }
                      }}
                      className="flex items-center gap-1 text-xs bg-white/5 hover:bg-white/10 text-white px-2.5 py-1.5 rounded-lg transition-colors border border-white/10 font-medium"
                      title="Upgrade Account Tier"
                    >
                      <Sparkles size={13} />
                      Upgrade
                    </button>
                  )}
                  <button
                    onClick={() => onOpenSyncModal?.(acc.id)}
                    className="flex items-center gap-1 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-lg transition-colors border border-indigo-500/20 font-medium"
                    title="Sync in-game balance"
                  >
                    <RefreshCw size={13} />
                    Sync
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
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Account Category / Tier</label>
                {publicTiers.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {publicTiers.map((tier: any) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => {
                          setRegTierId(tier.id);
                          setRegAccountType(tier.type === "business" ? "business" : "personal");
                        }}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                          regTierId === tier.id
                            ? (tier.type === "personal" ? "bg-indigo-600/20 border-indigo-500 text-white" : "bg-purple-600/20 border-purple-500 text-white")
                            : "bg-[#1a1a24] border-white/10 text-slate-400 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {tier.type === "personal" 
                            ? <Users size={18} className={regTierId === tier.id ? "text-indigo-400" : "text-slate-500"} />
                            : <Building size={18} className={regTierId === tier.id ? "text-purple-400" : "text-slate-500"} />}
                          <div>
                            <div className="text-xs font-bold">{tier.name}</div>
                            <div className="text-[10px] text-slate-400 capitalize">{tier.type} Account</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-white/90">
                            {tier.monthlyFee > 0 ? `$${(tier.monthlyFee / 100).toFixed(2)}/mo` : 'No Fee'}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            {tier.apyPercent ? `${(tier.apyPercent / 100).toFixed(2)}% APY` : 'Standard APY'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
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
                )}
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

      {/* Upgrade Account Modal */}
      {upgradeAccount && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setUpgradeAccount(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Change Account Tier</h3>
                <p className="text-xs text-slate-400">{upgradeAccount.accountName}</p>
              </div>
            </div>

            {upgradeError && (
              <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 text-rose-400 mt-0.5" />
                <div>{upgradeError}</div>
              </div>
            )}

            <form onSubmit={handleUpgradeTier} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Select New Tier</label>
                <div className="flex flex-col gap-3">
                  {data.settings?.find((s:any) => s.bankId === upgradeAccount.bankId)?.accountTiers
                    ?.filter((t:any) => !t.isPrivate && t.type === upgradeAccount.type && t.id !== upgradeAccount.tierId)
                    .map((tier: any) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setUpgradeTierId(tier.id)}
                        className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-3 ${
                          upgradeTierId === tier.id
                            ? (tier.type === "personal" ? "bg-indigo-600/20 border-indigo-500 text-white" : "bg-purple-600/20 border-purple-500 text-white")
                            : "bg-[#1a1a24] border-white/10 text-slate-400 hover:text-white"
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold">{tier.name}</div>
                          <div className="text-[10px] text-slate-400 capitalize">{tier.type} Account</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-white/90">
                            {tier.monthlyFee > 0 ? `$${(tier.monthlyFee / 100).toFixed(2)}/mo` : 'No Fee'}
                          </div>
                          <div className="text-[10px] text-emerald-400">
                            {tier.apyPercent ? `${(tier.apyPercent / 100).toFixed(2)}% APY` : 'Standard APY'}
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setUpgradeAccount(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={upgradeSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {upgradeSubmitting ? "Processing..." : "Confirm Upgrade"}
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
                {card.type === 'credit' && !card.isLocked && (card.creditUsed || 0) > 0 && (
                  <button 
                    onClick={() => {
                        setPayCardId(card.id);
                        setPayCardAmount((card.creditUsed / 100).toFixed(2));
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-1 bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    <CreditCard size={12}/> Pay Card
                  </button>
                )}
            </div>
          </div>
        ))}
        {(!data.cards || data.cards.length === 0) && (
          <div className="col-span-full p-8 text-center text-slate-500 bg-white/5 rounded-2xl border border-white/5">
            No cards found.
          </div>
        )}
      </div>

      {/* Pay Credit Card Modal */}
      {payCardId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 max-w-lg w-full space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CreditCard className="text-indigo-400" size={20} /> Pay Credit Card
                </h3>
              </div>
              <button
                onClick={() => setPayCardId(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={async (e) => {
                e.preventDefault();
                const res = await fetch(`/api/citizen/pay-credit-card`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cardId: payCardId, fromAccountId: payCardSourceAcc, amount: payCardAmount })
                });
                if(res.ok) {
                    setPayCardId(null);
                    refresh();
                } else {
                    const data = await res.json();
                    alert(data.error || "Failed to pay credit card");
                }
            }} className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Funding Account</label>
                  <select required value={payCardSourceAcc} onChange={e => setPayCardSourceAcc(e.target.value)} className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="">Select Account</option>
                    {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName} ({formatMoney(acc.balance)})</option>)}
                  </select>
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Amount ($)</label>
                  <input required type="number" step="0.01" min="0.01" value={payCardAmount} onChange={e => setPayCardAmount(e.target.value)} className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
               </div>
               <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-xl transition-colors">Submit Payment</button>
            </form>
          </div>
        </div>
      )}

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
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [feePayerMode, setFeePayerMode] = useState<"from_payment" | "sender_covers">("from_payment");
  const [quote, setQuote] = useState<any>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const parsed = parseFloat(amount);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || !Number.isFinite(parsed) || parsed <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/citizen/transfer/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromAccountId, toAccountId, amount: parsed, feePayerMode }),
        });
        const body = await res.json();
        if (!res.ok) {
          setQuote(null);
          setQuoteError(body.error || "Could not quote fees");
          return;
        }
        setQuote(body.quote);
        setQuoteError(null);
      } catch (e: any) {
        setQuote(null);
        setQuoteError(e.message || "Quote failed");
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [fromAccountId, toAccountId, amount, feePayerMode]);

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
              setSendError(null);
              setSending(true);
              try {
                const fd = new FormData(e.target);
                const res = await fetch('/api/citizen/transfer', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    fromAccountId,
                    toAccountId,
                    amount,
                    description: fd.get("description"),
                    feePayerMode,
                  })
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setSendError(body.error || "Transfer failed");
                  return;
                }
                e.target.reset();
                setFromAccountId("");
                setToAccountId("");
                setAmount("");
                setQuote(null);
                refresh();
              } catch (err: any) {
                setSendError(err.message || "Transfer failed");
              } finally {
                setSending(false);
              }
           }} className="space-y-4">
             <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">From Account</label>
                <select required name="fromAccountId" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="">Select Account</option>
                  {data.accounts?.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName} ({formatMoney(acc.balance)})</option>)}
                  {data.cards?.filter((c:any) => c.type === 'credit' && !c.isLocked).map((c: any) => <option key={c.id} value={c.id}>Credit Card •••• {c.cardNumber.slice(-4)} ({formatMoney((c.creditLimit || 0) - (c.creditUsed || 0))} Avail)</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">To Account (or Address Book)</label>
                <input required name="toAccountId" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white font-mono" placeholder="acc-uuid" list="contacts-list" />
                <datalist id="contacts-list">
                  {data.addressBook?.map((c:any) => <option key={c.id} value={c.contactAccountId}>{c.nickname}</option>)}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Amount ($)</label>
                  <input required name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" min="0.01" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white" placeholder="0.00" />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-400 mb-1">Memo</label>
                   <input required name="description" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white" placeholder="e.g. Dinner" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Who pays fees</label>
                <select value={feePayerMode} onChange={(e) => setFeePayerMode(e.target.value as any)} className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="from_payment">Take fees from the payment (recipient gets less)</option>
                  <option value="sender_covers">I cover the fees (recipient gets the amount above)</option>
                </select>
              </div>
              {quote && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-400"><span>You send</span><span className="text-white font-semibold">{formatMoney(quote.submittedCents)}</span></div>
                  <div className="flex justify-between text-slate-400"><span>They receive</span><span className="text-emerald-400 font-semibold">{formatMoney(quote.receivedCents)}</span></div>
                  <div className="flex justify-between text-slate-400"><span>Total fees</span><span className="text-amber-300">{formatMoney(quote.totalFeeCents)} ({((quote.combinedRate || 0) * 100).toFixed(3)}%)</span></div>
                  {quote.lines?.map((line: any) => (
                    <div key={line.code} className="flex justify-between text-slate-500 pl-2">
                      <span>{line.label}</span>
                      <span>{formatMoney(line.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}
              {quoteError && <div className="text-xs text-red-400">{quoteError}</div>}
              {sendError && <div className="text-xs text-red-400">{sendError}</div>}
              <button disabled={sending} type="submit" className="w-full mt-4 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl transition-colors">
                {sending ? "Sending…" : "Send Payment"}
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
  const [selectedLoanDetails, setSelectedLoanDetails] = useState<any>(null);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [collateralDesc, setCollateralDesc] = useState("");
  const [collateralVal, setCollateralVal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loanProducts, setLoanProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  // Group accounts by bank for loan selection
  const uniqueBanks: { bankId: string; bankName: string }[] = Array.from(new Set(data.accounts?.map((a: any) => a.bankId as string) || [])).map(bId => {
    const acc = data.accounts.find((a: any) => a.bankId === bId);
    return { bankId: bId as string, bankName: (acc?.bankName || "Slate Bank") as string };
  });

  useEffect(() => {
    if (!selectedBankId) { setLoanProducts([]); return; }
    fetch(`/api/citizen/loan-products?bankId=${encodeURIComponent(selectedBankId)}`)
      .then(r => r.json())
      .then(d => setLoanProducts(Array.isArray(d) ? d : []))
      .catch(() => setLoanProducts([]));
  }, [selectedBankId]);

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
          collateralValue: collateralVal,
          productId: selectedProductId || undefined,
        })
      });
      const resData = await res.json();
      if (res.ok) {
        alert(resData.autoApprove ? "Loan auto-approved and principal disbursed!" : resData.awaitingSignature ? "Approved — please sign the contract to receive funds." : "Loan application submitted for bank review.");
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
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${loan.status === 'paid' || loan.status === 'paid_off' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/20' : loan.status === 'defaulted' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/20' : loan.isDelinquent ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'}`}>
                      {loan.isDelinquent ? 'OVERDUE' : loan.status}
                    </span>
                    {loan.isOffSystem && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Off-System
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-slate-500 bg-black/30 px-2 py-1 rounded">#{loan.id.split('-')[0]}</span>
                </div>

                <h3 className="font-bold text-white text-xl mb-1">{formatMoney(totalRemaining)}</h3>
                <p className="text-xs text-slate-400">Original Principal: {formatMoney(totalOriginal)} @ {(loan.interestRate / 100).toFixed(2)}% APR</p>
                {loan.isOffSystem && loan.initialPaidAmount > 0 && (
                  <p className="text-[11px] text-purple-300 mt-0.5">
                    Prior Off-System Payment: {formatMoney(loan.initialPaidAmount)}
                    {loan.offSystemReference ? ` (${loan.offSystemReference})` : ''}
                  </p>
                )}

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
              
              
              {loan.status === "awaiting_signature" && (
                <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg text-amber-200/80 text-xs">
                    Your loan application has been reviewed and requires your signature. Please review the contract terms below.
                  </div>
                  {(loan.contractUrl || loan.contractText) && (
                    <div className="bg-black/20 p-3 rounded-lg border border-white/5 max-h-40 overflow-y-auto text-xs text-white/70 whitespace-pre-wrap">
                      {loan.contractText || <a href={loan.contractUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">View Contract Document</a>}
                    </div>
                  )}
                  <button onClick={async () => {
                    const res = await fetch(`/api/citizen/loans/${loan.id}/sign`, { method: "POST", headers: { "Content-Type": "application/json" } });
                    if (res.ok) {
                      alert("Contract signed successfully! Loan is now active and funds have been deposited.");
                      refresh();
                    } else {
                      const err = await res.json();
                      alert("Error: " + err.error);
                    }
                  }} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                    Sign & Accept Terms
                  </button>
                </div>
              )}
              {loan.status === "pending" && (
                <div className="mt-6 pt-4 border-t border-white/5 text-center text-xs text-slate-500">
                  Your application is currently under review by bank staff.
                </div>
              )}

              { (loan.status === "active" || loan.status === "delinquent" || loan.status === "defaulted") && (
                <div className="mt-6 pt-4 border-t border-white/5">
                  <p className="text-xs text-slate-500 mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Calendar size={12}/> Next Due Date:</span>
                    <span className="font-medium text-slate-300">{loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString() : 'N/A'}</span>
                  </p>
                  <form onSubmit={async (e:any) => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    const dollars = fd.get("amount");
                    const res = await fetch('/api/citizen/pay-loan', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        loanId: loan.id,
                        fromAccountId: fd.get("fromAccountId"),
                        amount: dollars,
                        amountDollars: dollars,
                      })
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      alert(err.error || "Payment failed");
                    }
                    refresh();
                  }} className="flex gap-2">
                    <select required name="fromAccountId" className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-xs text-white">
                      <option value="">Pay from...</option>
                      {data.accounts?.filter((acc: any) => acc.bankId === loan.bankId).map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName}</option>)}
                    </select>
                    <input required name="amount" type="number" step="0.01" min="0.01" placeholder="Amount ($)" className="w-28 bg-black/30 border border-white/10 rounded-lg px-2 py-2 text-xs text-white" />
                    <button type="submit" className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-2 rounded-lg text-xs font-bold transition-colors">Pay Installment</button>
                  </form>
                </div>
              )}
              
              <button 
                onClick={() => setSelectedLoanDetails(loan)}
                className="mt-4 w-full bg-white/5 hover:bg-white/10 text-white/80 py-2 rounded-lg text-xs font-medium transition-colors border border-white/5 flex items-center justify-center gap-2"
              >
                <FileText size={14} /> View Details & Agreement
              </button>
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

              {loanProducts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Loan Product</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="">Standard terms (5.00% APR)</option>
                    {loanProducts.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {Number(p.interestRate).toFixed(1)}% APR, max ${(p.maxAmount / 100).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

      {/* Loan Details Modal */}
      {selectedLoanDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#1a1a24]">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><FileText size={18} className="text-indigo-400" /> Loan Details & Agreement</h3>
                <p className="text-xs text-slate-400 font-mono mt-1">Ref: {selectedLoanDetails.id}</p>
              </div>
              <button onClick={() => setSelectedLoanDetails(null)} className="text-slate-500 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Financials */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/30 border border-white/5 p-4 rounded-xl">
                  <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Original Principal</p>
                  <p className="text-lg font-mono text-white font-bold">{formatMoney(selectedLoanDetails.principalAmount || selectedLoanDetails.amount)}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                  <p className="text-xs text-emerald-400 uppercase tracking-widest mb-1">Remaining Balance</p>
                  <p className="text-lg font-mono text-emerald-300 font-bold">
                    {formatMoney(selectedLoanDetails.remainingAmount !== undefined ? selectedLoanDetails.remainingAmount : (selectedLoanDetails.amount - (selectedLoanDetails.amountPaid || 0)))}
                  </p>
                </div>
              </div>

              {/* General Details */}
              <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-3 text-sm">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Status</span>
                  <span className={`font-bold uppercase ${selectedLoanDetails.isDelinquent ? 'text-amber-400' : selectedLoanDetails.status === 'defaulted' ? 'text-rose-400' : 'text-white'}`}>
                    {selectedLoanDetails.isDelinquent ? 'OVERDUE' : selectedLoanDetails.status}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Interest Rate (APR)</span>
                  <span className="font-mono text-white">{(selectedLoanDetails.interestRate / 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Next Due Date</span>
                  <span className="text-white">
                    {selectedLoanDetails.nextPaymentDate ? new Date(selectedLoanDetails.nextPaymentDate).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">Origination Date</span>
                  <span className="text-white">
                    {selectedLoanDetails.createdAt ? new Date(selectedLoanDetails.createdAt).toLocaleDateString() : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Purpose / Notes</span>
                  <span className="text-white max-w-[250px] text-right truncate" title={selectedLoanDetails.purpose || "N/A"}>
                    {selectedLoanDetails.purpose || "N/A"}
                  </span>
                </div>
              </div>

              {/* Collateral & Risk */}
              {(selectedLoanDetails.collateralDescription || selectedLoanDetails.lateFeeAmount > 0) && (
                <div className="bg-amber-500/10 rounded-xl border border-amber-500/20 p-4 space-y-3 text-sm">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">Collateral & Risk Details</p>
                  
                  {selectedLoanDetails.collateralDescription && (
                    <>
                      <div className="flex justify-between border-b border-amber-500/10 pb-2">
                        <span className="text-amber-200/70">Pledged Collateral</span>
                        <span className="text-amber-100 max-w-[200px] text-right truncate">
                          {selectedLoanDetails.collateralDescription}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-amber-500/10 pb-2">
                        <span className="text-amber-200/70">Collateral Value</span>
                        <span className="font-mono text-amber-100">
                          {selectedLoanDetails.collateralValue ? formatMoney(selectedLoanDetails.collateralValue) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-amber-500/10 pb-2">
                        <span className="text-amber-200/70">Status</span>
                        <span className="text-amber-100 font-bold uppercase text-xs">
                          {selectedLoanDetails.collateralStatus || 'pledged'}
                        </span>
                      </div>
                    </>
                  )}
                  
                  {selectedLoanDetails.lateFeeAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-amber-200/70">Late Fees Accrued</span>
                      <span className="font-mono text-rose-400 font-bold">
                        {formatMoney(selectedLoanDetails.lateFeeAmount || 0)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Off-System Details */}
              {selectedLoanDetails.isOffSystem && (
                <div className="bg-purple-500/10 rounded-xl border border-purple-500/20 p-4 space-y-3 text-sm">
                  <p className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} /> Off-System Agreement Record
                  </p>
                  <div className="flex justify-between border-b border-purple-500/10 pb-2">
                    <span className="text-purple-200/70">Prior Paid Off-System</span>
                    <span className="font-mono text-purple-100 font-bold">
                      {formatMoney(selectedLoanDetails.initialPaidAmount || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-200/70">External Reference</span>
                    <span className="text-purple-100">
                      {selectedLoanDetails.offSystemReference || "None recorded"}
                    </span>
                  </div>
                </div>
              )}

              {/* Contract Term Sheet */}
              {(selectedLoanDetails.contractUrl || selectedLoanDetails.contractText) && (
                <div className="bg-black/30 rounded-xl border border-white/5 p-4 space-y-3">
                   <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} /> Contract Details
                   </p>
                   {selectedLoanDetails.contractText && (
                     <div className="text-xs text-white/70 whitespace-pre-wrap font-mono bg-[#111116] p-3 rounded-lg border border-white/5">
                       {selectedLoanDetails.contractText}
                     </div>
                   )}
                   {selectedLoanDetails.contractUrl && (
                     <a href={selectedLoanDetails.contractUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 font-medium">
                       <ExternalLink size={14} /> Open External Contract Document
                     </a>
                   )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/5 bg-[#1a1a24] flex justify-end">
              <button 
                onClick={() => setSelectedLoanDetails(null)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
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
                        {data.cards?.filter((c:any) => c.type === 'credit' && !c.isLocked).map((c: any) => <option key={c.id} value={c.id}>Credit Card •••• {c.cardNumber.slice(-4)}</option>)}
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


function CitizenSubscriptionsTab({ data, refresh }: any) {
  const [cancelling, setCancelling] = useState(false);
  const mySubs = data?.subscriptions || [];
  
  const handleCancel = async (sub: any) => {
     if (!confirm(`Are you sure you want to cancel the subscription: ${sub.description}?`)) return;
     setCancelling(true);
     try {
       const res = await fetch(`/api/citizen/subscriptions/${sub.id}/cancel`, { method: "POST" });
       if (res.ok) {
          alert("Subscription cancelled successfully.");
          refresh();
       } else {
          const err = await res.json();
          alert(err.error || "Failed to cancel.");
       }
     } catch (e) {
       alert("An error occurred.");
     }
     setCancelling(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <RefreshCw className="text-indigo-400" size={24} /> My Subscriptions
          </h2>
          <p className="text-sm text-white/50">Manage your recurring payments and billings.</p>
        </div>
      </div>
      
      {mySubs.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
           <RefreshCw size={32} className="mx-auto text-white/20 mb-3" />
           <p className="text-white/50">You have no active subscriptions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mySubs.map((sub: any) => {
             const isBiller = data?.accounts?.some((a: any) => a.id === sub.billerAccountId);
             const myAccount = data?.accounts?.find((a: any) => a.id === (isBiller ? sub.billerAccountId : sub.customerAccountId));
             
             return (
               <div key={sub.id} className={`bg-white/5 border ${sub.isActive ? 'border-white/10' : 'border-red-500/20 opacity-60'} rounded-2xl p-6 hover:border-white/20 transition-all`}>
                 <div className="flex justify-between items-start mb-4">
                   <div className="text-sm font-semibold text-white/80 truncate flex-1 pr-2">{sub.description || "Recurring Payment"}</div>
                   <div className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${sub.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                     {sub.isActive ? "Active" : "Cancelled"}
                   </div>
                 </div>
                 
                 <div className="text-4xl font-black text-white mb-6">
                   {formatMoney(sub.amount)}<span className="text-sm font-medium text-white/40">/{sub.frequency === 'weekly' ? 'wk' : 'mo'}</span>
                 </div>
                 
                 <div className="space-y-3 mb-6 bg-black/20 rounded-xl p-4 border border-white/5">
                   <div className="flex justify-between text-xs">
                     <span className="text-white/40">Role</span>
                     <span className={isBiller ? "text-emerald-400 font-medium" : "text-white/80"}>{isBiller ? "Receiving (Biller)" : "Paying (Customer)"}</span>
                   </div>
                   <div className="flex justify-between text-xs">
                     <span className="text-white/40">Linked Account</span>
                     <span className="text-white/80 truncate max-w-[120px]" title={myAccount?.accountName}>{myAccount?.accountName || "Unknown"}</span>
                   </div>
                   <div className="flex justify-between text-xs">
                     <span className="text-white/40">Next Billing</span>
                     <span className="text-white/80">{sub.isActive ? format(new Date(sub.nextRun), "MMM d, yyyy") : "-"}</span>
                   </div>
                 </div>
                 
                 {sub.isActive && (
                   <button 
                     disabled={cancelling}
                     onClick={() => handleCancel(sub)}
                     className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                   >
                     Cancel Subscription
                   </button>
                 )}
               </div>
             )
          })}
        </div>
      )}
    </div>
  );
}

function EscrowsTab({ data }: any) {
  const [escrows, setEscrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEscrows = async () => {
    try {
      const res = await fetch('/api/citizen/escrows');
      if (res.ok) setEscrows(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrows();
  }, []);

  const handleFund = async (escrowId: string) => {
    if (!window.confirm("Are you sure you want to fund this escrow? This will deduct the amount from your account and lock it in escrow.")) return;
    try {
      const res = await fetch(`/api/citizen/escrows/${escrowId}/fund`, { method: 'POST' });
      if (res.ok) {
        alert("Escrow funded successfully!");
        fetchEscrows();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to fund escrow");
      }
    } catch (e: any) {
      alert("Network error funding escrow");
    }
  };

  if (loading) return <div className="p-8 text-center text-white/50 animate-pulse">Loading escrows...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Escrow Contracts</h2>
          <p className="text-sm text-white/50 mt-1">Manage secure transactional holds and releases.</p>
        </div>
      </div>

      <div className="bg-[#0f0f15] border border-white/10 rounded-2xl p-6">
        {escrows.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="mx-auto h-12 w-12 text-white/20 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">No Active Escrows</h3>
            <p className="text-white/50 max-w-sm mx-auto">
              You are not a party to any pending or funded escrow contracts.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {escrows.map((e: any) => {
               // Figure out if I am the buyer or seller
               const isBuyer = data.accounts?.some((a:any) => a.id === e.buyerAccountId);
               return (
                <div key={e.id} className="p-4 bg-[#1a1a24] border border-white/5 rounded-xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${e.status === 'funded' ? 'bg-emerald-500/20 text-emerald-400' : e.status === 'released' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      <Shield size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-white flex items-center gap-2">
                        {e.description || "Escrow Contract"}
                      </h4>
                      <p className="text-xs text-white/50">
                        {e.bankName} • You are the {isBuyer ? <span className="font-bold text-rose-300">Buyer</span> : <span className="font-bold text-emerald-300">Seller</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${e.status === 'funded' ? 'bg-emerald-500/20 text-emerald-400' : e.status === 'released' ? 'bg-indigo-500/20 text-indigo-400' : e.status === 'refunded' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
                           {e.status}
                         </span>
                         {e.contractUrl && (
                           <a href={e.contractUrl} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 text-xs flex items-center gap-1 transition-colors">
                             View Contract
                           </a>
                         )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:items-end gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <p className="font-mono font-bold text-lg text-white">
                      ${(e.amount / 100).toFixed(2)}
                    </p>
                    {e.status === 'pending' && isBuyer && (
                      <button onClick={() => handleFund(e.id)} className="w-full md:w-auto px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-colors">
                        Fund Escrow
                      </button>
                    )}
                    {e.status === 'pending' && !isBuyer && (
                      <span className="text-xs text-amber-400 font-medium">Awaiting Buyer Funding</span>
                    )}
                  </div>
                </div>
               );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
