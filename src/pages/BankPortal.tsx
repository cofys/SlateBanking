import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { 
  Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, 
  Lock, Unlock, Loader2, Link2, LogIn, LogOut, Sparkles, CheckCircle2, 
  AlertTriangle, ArrowUpRight, ArrowDownRight, Send, DollarSign, Activity,
  FileText, Landmark, UserCheck, Plus, X, Copy, Check, Layers, PieChart,
  ChevronRight, Building2, HelpCircle, Download, Filter, RefreshCw,
  SlidersHorizontal, CheckSquare, BarChart2
} from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

interface ThemeConfig {
  primary: string;
  bg: string;
  text: string;
  border: string;
  hoverBg: string;
  glow: string;
  fromGradient: string;
  toGradient: string;
  textAccent: string;
  bgLight: string;
  ring: string;
}

const schemeMap: Record<string, ThemeConfig> = {
  indigo: {
    primary: "indigo-500",
    bg: "bg-indigo-600",
    text: "text-indigo-400",
    border: "border-indigo-500/20",
    hoverBg: "hover:bg-indigo-500",
    glow: "shadow-indigo-500/10",
    fromGradient: "from-indigo-600",
    toGradient: "to-indigo-950",
    textAccent: "text-indigo-400",
    bgLight: "bg-indigo-500/10",
    ring: "focus:ring-indigo-500/40"
  },
  emerald: {
    primary: "emerald-500",
    bg: "bg-emerald-600",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
    hoverBg: "hover:bg-emerald-500",
    glow: "shadow-emerald-500/10",
    fromGradient: "from-emerald-600",
    toGradient: "to-emerald-950",
    textAccent: "text-emerald-400",
    bgLight: "bg-emerald-500/10",
    ring: "focus:ring-emerald-500/40"
  },
  rose: {
    primary: "rose-500",
    bg: "bg-rose-600",
    text: "text-rose-400",
    border: "border-rose-500/20",
    hoverBg: "hover:bg-rose-500",
    glow: "shadow-rose-500/10",
    fromGradient: "from-rose-600",
    toGradient: "to-rose-950",
    textAccent: "text-rose-400",
    bgLight: "bg-rose-500/10",
    ring: "focus:ring-rose-500/40"
  },
  amber: {
    primary: "amber-500",
    bg: "bg-amber-600",
    text: "text-amber-400",
    border: "border-amber-500/20",
    hoverBg: "hover:bg-amber-500",
    glow: "shadow-amber-500/10",
    fromGradient: "from-amber-600",
    toGradient: "to-amber-950",
    textAccent: "text-amber-400",
    bgLight: "bg-amber-500/10",
    ring: "focus:ring-amber-500/40"
  },
  zinc: {
    primary: "zinc-400",
    bg: "bg-zinc-600",
    text: "text-zinc-400",
    border: "border-zinc-500/20",
    hoverBg: "hover:bg-zinc-500",
    glow: "shadow-zinc-500/10",
    fromGradient: "from-zinc-600",
    toGradient: "to-zinc-950",
    textAccent: "text-zinc-400",
    bgLight: "bg-zinc-500/10",
    ring: "focus:ring-zinc-400/40"
  },
};

export function BankPortal({ overrideBankId }: { overrideBankId?: string }) {
  const params = useParams();
  const bankId = overrideBankId || params.bankId;
  const { user, login, logout, isLoading, rememberMe, setRememberMe } = useAuth();
  const [bank, setBank] = useState<any>(null);
  const [bankNotFound, setBankNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  
  // Tab Selection: "transfer" | "onyx" | "invoices" | "loans" | "cards" | "subscriptions"
  const [activeTab, setActiveTab] = useState<"transfer" | "onyx" | "invoices" | "loans" | "cards" | "subscriptions">("transfer");
  
  // Selected account for filtering & focused actions
  const [selectedAccountId, setSelectedAccountId] = useState<string | "all">("all");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("all");

  // Ledger search & filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [copiedTxId, setCopiedTxId] = useState(false);

  // Modals
  const [showOpenAccountModal, setShowOpenAccountModal] = useState(false);
  const [showApplyLoanModal, setShowApplyLoanModal] = useState(false);
  const [showIssueCardModal, setShowIssueCardModal] = useState(false);
  const [repayingLoan, setRepayingLoan] = useState<any | null>(null);

  // Interactive UI loaders
  const [transferPending, setTransferPending] = useState(false);
  const [onyxPending, setOnyxPending] = useState(false);
  const [invoicePayId, setInvoicePayId] = useState<string | null>(null);
  const [lockingCardId, setLockingCardId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  // Auto-refresh upon OAuth popup messaging
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS') {
        handleSearch();
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'oauth_auth_success') {
        handleSearch();
      }
    };
    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, [bankId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      setOauthSuccess(params.get("username"));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetch(`/api/portal/${bankId}/info`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) { 
          setBank(d); 
          document.title = `${d.name} | Client Portal`; 
        } else {
          setBankNotFound(true);
        }
      })
      .catch(() => setBankNotFound(true));
      
    fetch("/api/onyx/merchants")
      .then(r => r.json())
      .then(d => setOnyxMerchants(d || []));
  }, [bankId]);

  useEffect(() => {
    if (user && bank) handleSearch();
  }, [user, bank]);

  const colorSchemeKey = bank?.settings?.colorScheme || 'indigo';
  const theme = schemeMap[colorSchemeKey] || schemeMap.indigo;

  const toggleCardVisibility = (id: string) => {
    setVisibleCardIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatCardNumber = (num: string, visible: boolean) => {
    if (!num) return "";
    const chunks = num.match(/.{1,4}/g) || [];
    if (visible) return chunks.join(" ");
    return `•••• •••• •••• ${chunks[3] || "0000"}`;
  };


  const handleToggleCard = async (cardId: string, locked: boolean) => {
    try {
      const res = await fetch(`/api/portal/${bankId}/cards/${cardId}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isLocked: locked })
      });
      if (res.ok) {
         handleSearch();
      } else {
         const d = await res.json();
         alert(d.error || "Failed to update card status");
      }
    } catch (e) {
      alert("Network error updating card status");
    }
  };

  const handleSearch = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${bankId}/lookup`);
      if (res.ok) {
        setUserData(await res.json());
      } else {
        setUserData({ error: "No accounts found for this user at this bank." });
      }
    } catch (e) {
      console.error(e);
      setUserData({ error: "System error while fetching data." });
    }
    setLoading(false);
  };

  // Calculate Net Worth across all user accounts in this bank
  const netWorthCents = userData?.accounts?.reduce((sum: number, acc: any) => sum + (acc.balance || 0), 0) || 0;

  // Filter local recent transactions client-side
  const filteredTx = useMemo(() => {
    if (!userData?.recentTx) return [];
    return userData.recentTx.filter((tx: any) => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = !term || (
        (tx.description || "").toLowerCase().includes(term) ||
        (tx.type || "").toLowerCase().includes(term) ||
        (tx.fromAccountId || "").toLowerCase().includes(term) ||
        (tx.toAccountId || "").toLowerCase().includes(term) ||
        (tx.id || "").toLowerCase().includes(term)
      );

      const matchesAccount = selectedAccountId === "all" || 
        tx.fromAccountId === selectedAccountId || 
        tx.toAccountId === selectedAccountId;

      const matchesType = txTypeFilter === "all" || tx.type === txTypeFilter;

      return matchesSearch && matchesAccount && matchesType;
    });
  }, [userData?.recentTx, searchTerm, selectedAccountId, txTypeFilter]);

  // Export transaction ledger to CSV
  const exportLedgerCSV = () => {
    if (!filteredTx || filteredTx.length === 0) {
      alert("No transaction records to export.");
      return;
    }
    const headers = ["Transaction ID", "Date", "Type", "From Account", "To Account", "Amount ($)", "Memo / Description"];
    const rows = filteredTx.map((tx: any) => [
      `"${tx.id || ''}"`,
      `"${format(new Date(tx.timestamp), "yyyy-MM-dd HH:mm:ss")}"`,
      `"${tx.type || 'transfer'}"`,
      `"${tx.fromAccountId || 'External'}"`,
      `"${tx.toAccountId || 'External'}"`,
      `"${(tx.amount / 100).toFixed(2)}"`,
      `"${(tx.description || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e: string[]) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `slate_ledger_${bankId}_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (bankNotFound || !bankId) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center gap-4 text-white">
        <AlertTriangle className="text-red-500" size={48} />
        <h2 className="text-xl font-bold">Bank Not Found</h2>
        <p className="text-white/50">The requested financial gateway could not be located.</p>
      </div>
    );
  }

  if (isLoading || !bank) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-sm text-zinc-400 font-mono">Loading financial gateway...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060609] text-slate-300 font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className={`absolute top-0 left-1/4 w-[500px] h-[500px] ${theme.bgLight} rounded-full blur-[120px] pointer-events-none opacity-50`} />
      <div className={`absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[150px] pointer-events-none opacity-50`} />
      
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 mb-24 relative z-10">
      
      {/* Top Bank Header Banner */}
      <div className="bg-gradient-to-r from-[#0d0d14] via-[#0b0b10] to-[#0e0e16] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-5 text-center md:text-left relative z-10">
          {bank.settings?.logoUrl ? (
            <img 
              src={bank.settings.logoUrl} 
              alt="Logo" 
              className="w-16 h-16 rounded-2xl border border-white/10 shadow-xl object-contain bg-[#0c0c12] p-1" 
              referrerPolicy="no-referrer"
            />
          ) : (
          <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${theme.fromGradient} to-black flex items-center justify-center font-bold text-2xl text-white shadow-xl ${theme.glow}`}>
              {bank.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <h1 className="text-2xl font-black tracking-tight text-white">{bank.name}</h1>
              <span className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${theme.bgLight} ${theme.textAccent} border ${theme.border}`}>
                Client Portal
              </span>
            </div>
            <p className="text-zinc-400 text-xs mt-1 flex items-center gap-2 justify-center md:justify-start font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Secure 256-Bit Encrypted TLS Connection
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          {(userData?.isStaff || user?.isGlobalAdmin) && (
            <Link 
              to={`/bank/${bankId}`} 
              className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-bold text-indigo-300 transition-all shadow-lg"
            >
              <ShieldCheck size={16} /> Staff Admin Portal
            </Link>
          )}

          {user && (
            <div className="flex items-center gap-3 bg-[#12121c] border border-white/10 rounded-2xl p-2 px-4 shadow-xl">
              <div className="flex items-center gap-3">
                {user.avatarUrl && !avatarError ? (
                  <img 
                    src={user.avatarUrl} 
                    alt="Avatar" 
                    onError={() => setAvatarError(true)}
                    className="w-9 h-9 rounded-xl border border-white/10 object-cover bg-zinc-900" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                <div className={`w-9 h-9 rounded-xl ${theme.bgLight} ${theme.textAccent} flex items-center justify-center text-xs font-bold border ${theme.border}`}>
                    {user.username.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="text-left">
                  <p className="text-xs font-bold text-white tracking-wide">{user.username}</p>
                  <p className="text-[10px] text-zinc-400 font-mono">{user.discordId}</p>
                </div>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <button 
                onClick={logout} 
                className="text-zinc-400 hover:text-rose-400 transition-colors p-2 rounded-xl hover:bg-rose-500/10"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Maintenance Alert */}
      {bank?.maintenanceMode && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`border rounded-2xl p-4 text-sm flex items-center gap-3 shadow-lg ${
            userData?.isStaff 
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200' 
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          <AlertTriangle className={userData?.isStaff ? "text-indigo-400 shrink-0" : "text-amber-400 shrink-0"} size={20} />
          <div>
            <p className="font-semibold flex items-center gap-2">
              {userData?.isStaff ? "⚙️ Bank Maintenance Active (Staff Testing Mode)" : "⚠️ Scheduled Bank Maintenance Active"}
            </p>
            <p className="text-xs opacity-90 mt-0.5">
              {userData?.isStaff ? (
                <>System undergoing updates. Staff privileges allow testing override across the portal.</>
                ) : (
                  <>Transfers and bot commands are temporarily paused for maintenance.</>
              )}
            </p>
          </div>
        </motion.div>
      )}

      {/* Verification Notification */}
      {oauthSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 text-emerald-300 text-sm flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-400 shrink-0" size={24} />
            <div>
              <p className="font-bold text-white">Profile Validated & Synchronized!</p>
              <p className="text-white/70 text-xs mt-0.5">Linked Minecraft identity <strong>{oauthSuccess}</strong> with {bank.name}.</p>
            </div>
          </div>
          <button onClick={() => setOauthSuccess(null)} className="text-white/40 hover:text-white font-bold px-2 py-1 text-lg">×</button>
        </motion.div>
      )}

      {/* Login Card for Unauthenticated Visitors */}
      {!user ? (
        <div className="max-w-md mx-auto py-12">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#0e0e15]/95 border border-white/10 rounded-2xl p-8 sm:p-9 shadow-2xl text-center space-y-6 relative overflow-hidden backdrop-blur-xl"
          >
            <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10">
              <Lock size={26} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Identity Authentication Required</h2>
              <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed">
                Log in to authenticate your citizen profile and access accounts, debit cards, loans, and transaction history with {bank.name}.
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
                {bank.cityCorpAppId && (
                  <button 
                    onClick={() => login(bankId, 'citycorp')}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer"
                  >
                    <LogIn size={18} /> Continue with CityCorp
                  </button>
                )}

                <button 
                  onClick={() => login(bankId, 'discord')}
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold py-3 rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 hover:shadow-[#5865F2]/30 active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <LogIn size={18} /> Continue with Discord
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Secure banking access encrypted under Onyx clearing protocols.
              </p>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
              <span>Bank Staff Member?</span>
              <Link to={`/bank/${bankId}`} className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1.5 transition-colors">
                <ShieldCheck size={14} /> Staff Admin Portal &rarr;
              </Link>
            </div>
          </motion.div>
        </div>
        ) : (
          <div className="space-y-8">
            {/* Authenticated Client Dashboard */}
          
          {/* Clean Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#0a0a0f] border border-white/5 rounded-2xl p-6 shadow-xl">
               <div className="flex items-center gap-4">
                 {userData?.customer?.mcUuid ? (
                   <div className="relative group shrink-0">
                     <img 
                        src={`https://mc-heads.net/avatar/${userData.customer.mcUsername || userData.customer.mcUuid}/64`} 
                        alt="MC Head" 
                        className="w-14 h-14 rounded-xl border border-white/10 shadow-lg bg-black object-contain"
                        onError={(e: any) => {
                          e.target.onerror = null;
                          e.target.src = `https://minotar.net/helm/${userData.customer.mcUsername || userData.customer.mcUuid}/64.png`;
                        }}
                     />
                   </div>
                 ) : (
                   <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0">
                     <UserCheck size={24} />
                   </div>
                 )}
                 <div>
                   <div className="flex items-center gap-2">
                     <h2 className="font-bold text-white text-xl">{userData?.customer?.mcUsername || user.username || "Citizen"}</h2>
                     <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md ${theme.bgLight} ${theme.textAccent}`}>Verified</span>
                   </div>
                   <p className="text-sm text-zinc-400 mt-1">Total Net Worth: <span className="font-mono text-white">{formatMoney(netWorthCents)}</span></p>
                 </div>
               </div>
               
               <div className="grid grid-cols-3 md:flex md:items-center gap-4 md:gap-8 w-full md:w-auto border-t border-white/10 md:border-t-0 pt-4 md:pt-0">
                  <div className="text-center md:text-right">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Accounts</span>
                     <span className="font-mono font-bold text-lg text-white">{userData?.accounts?.length || 0}</span>
                  </div>
                  <div className="text-center md:text-right">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Cards</span>
                     <span className="font-mono font-bold text-lg text-white">{userData?.cards?.length || 0}</span>
                  </div>
                  <div className="text-center md:text-right">
                     <span className="text-[10px] text-zinc-500 uppercase tracking-widest block mb-1">Loans</span>
                     <span className="font-mono font-bold text-lg text-white">{userData?.loans?.length || 0}</span>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* LEFT COLUMN */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* Accounts Showcase */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h2 className="text-sm font-bold text-zinc-300 tracking-wider uppercase flex items-center gap-2">
                      <Wallet size={16} className={theme.textAccent} /> My Accounts
                    </h2>
                    <button 
                      onClick={() => setShowOpenAccountModal(true)}
                      className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Plus size={14} /> New Account
                    </button>
                  </div>

                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2].map(i => (
                        <div key={i} className="bg-white/5 border border-white/5 rounded-xl h-24 animate-pulse" />
                      ))}
                    </div>
                  ) : userData?.accounts?.length > 0 ? (
                    <div className="space-y-3">
                      {userData.accounts.map((acc: any) => {
                        const isSelected = selectedAccountId === acc.id;
                        return (
                          <motion.div 
                            key={acc.id}
                            onClick={() => setSelectedAccountId(isSelected ? "all" : acc.id)}
                            whileHover={{ x: 4 }}
                            className={`p-4 rounded-xl cursor-pointer transition-all border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                              isSelected 
                                ? `bg-white/10 border-white/20 shadow-lg ${theme.glow}`
                                : "bg-[#0b0b0f] border-white/5 hover:border-white/10 hover:bg-white/[0.02]"
                            }`}
                          >
                            <div className="flex items-center gap-4">
                               <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? theme.bg : 'bg-white/5'}`}>
                                  <Wallet size={18} className={isSelected ? 'text-white' : 'text-zinc-400'} />
                               </div>
                               <div>
                                  <div className="flex items-center gap-2">
                                     <h3 className="font-bold text-white text-base">{acc.accountName}</h3>
                                     {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                  </div>
                                  <p className="text-xs text-zinc-500 font-mono mt-0.5">ID: {acc.id.slice(0, 10)} • {acc.type.toUpperCase()}</p>
                               </div>
                            </div>
                            <div className="sm:text-right">
                               <p className="font-mono text-xl font-bold text-white">{formatMoney(acc.balance)}</p>
                               <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Available Balance</p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-[#0b0b0f] border border-white/5 rounded-xl p-8 text-center space-y-3">
                      <Wallet className="mx-auto text-zinc-600" size={32} />
                      <p className="text-sm font-bold text-white">No Active Accounts</p>
                      <button 
                        onClick={() => setShowOpenAccountModal(true)}
                        className={`mx-auto ${theme.bg} hover:brightness-110 text-white text-xs font-bold py-2 px-4 rounded-lg transition-all shadow-lg flex items-center gap-2`}
                      >
                        <Plus size={14} /> Open Account Now
                      </button>
                    </div>
                  )}
                </div>

                {/* ACCOUNT LEDGER HISTORY */}
{/* ACCOUNT LEDGER HISTORY */}
              {userData?.recentTx?.length > 0 && (
                <div className="bg-[#0b0b10] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                  
                  {/* Header & Controls */}
                  <div className="p-6 border-b border-white/10 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Activity className={theme.textAccent} size={20} />
                        <div>
                          <h3 className="font-bold text-white text-base">Real-Time Account Ledger</h3>
                          <p className="text-[11px] text-zinc-400">
                            {selectedAccountId === "all" ? "Showing activity across all accounts" : `Filtered to account ${selectedAccountId}`}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Live filter input */}
                        <div className="relative flex-1 sm:flex-initial">
                          <input 
                            type="text" 
                            placeholder="Search memo, ID..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-black/40 border border-white/10 rounded-xl py-2 px-3 pl-9 text-xs text-white focus:outline-none focus:border-indigo-500 w-full sm:w-48 font-mono transition-all"
                          />
                          <Search className="absolute left-3 top-2.5 text-zinc-500" size={13} />
                        </div>

                        {/* Export CSV Button */}
                        <button
                          onClick={exportLedgerCSV}
                          title="Export Filtered Ledger to CSV"
                          className="bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 rounded-xl p-2 px-3 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
                        >
                          <Download size={14} />
                          <span className="hidden sm:inline">Export CSV</span>
                        </button>
                      </div>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 flex items-center gap-1 shrink-0">
                        <Filter size={11} /> Filter:
                      </span>
                      {["all", "transfer", "deposit", "withdraw", "payment", "loan"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTxTypeFilter(t)}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-lg capitalize transition-all shrink-0 ${
                            txTypeFilter === t
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                              : "bg-white/5 text-zinc-400 hover:text-zinc-200 border border-transparent"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                      {(selectedAccountId !== "all" || txTypeFilter !== "all" || searchTerm) && (
                        <button
                          onClick={() => {
                            setSelectedAccountId("all");
                            setTxTypeFilter("all");
                            setSearchTerm("");
                          }}
                          className="text-[10px] text-rose-400 hover:text-rose-300 underline ml-auto shrink-0"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Transaction List */}
                  <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                    <AnimatePresence>
                      {filteredTx.length > 0 ? (
                        filteredTx.map((tx: any, i: number) => {
                          const isIncoming = tx.toDiscordId === user?.discordId || (selectedAccountId !== "all" && tx.toAccountId === selectedAccountId);
                          return (
                            <motion.div 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              key={tx.id || i} 
                              onClick={() => setSelectedTx(tx)}
                              className="p-4 px-6 flex items-center justify-between hover:bg-white/[0.02] cursor-pointer transition-colors"
                            >
                              <div className="flex gap-4 items-center">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0
                                  ${isIncoming ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                  {isIncoming ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                                </div>
                                <div className="text-left">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-white truncate max-w-[150px] sm:max-w-[260px]">
                                      {tx.description || tx.type}
                                    </p>
                                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/5">
                                      {tx.type}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                    {format(new Date(tx.timestamp), "MMM d, h:mm a")} • {tx.fromAccountId ? `From: ${tx.fromAccountId.slice(0, 10)}` : 'System Deposit'}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className={`font-mono text-sm font-black ${isIncoming ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isIncoming ? '+' : '-'}{formatMoney(tx.amount)}
                                </span>
                                <span className="block text-[9px] text-zinc-600 font-mono mt-0.5">Click for receipt</span>
                              </div>
                            </motion.div>
                          );
                        })
                        ) : (
                          <div className="text-center py-12 text-zinc-500 text-xs space-y-1">
                          <p>No transaction records match active parameters.</p>
                          {(selectedAccountId !== "all" || txTypeFilter !== "all" || searchTerm) && (
                            <button
                              onClick={() => {
                                setSelectedAccountId("all");
                                setTxTypeFilter("all");
                                setSearchTerm("");
                              }}
                              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                            >
                              Reset active filters
                            </button>
                          )}
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                </div>
              )}

            </div>

            {/* RIGHT COLUMN */}
              <div className="space-y-8 lg:col-span-1">
              {/* Action Hub Tabs */}
              {userData?.accounts?.length > 0 && (
                <div className="bg-[#0b0b0f] border border-white/5 rounded-2xl overflow-hidden shadow-lg">
                  
                  {/* Elevated Glass Tabs */}
                  <div className="flex flex-wrap border-b border-white/10 bg-black/40 p-3 gap-2">
                    {[
                      { id: "transfer", label: "Wire Transfer", icon: Send },
                      { id: "onyx", label: "Onyx Pay", icon: Activity },
                      { id: "invoices", label: "Invoices", icon: FileText, hasAlert: userData?.pendingInvoices?.length > 0 },
                      { id: "loans", label: "Credit & Loans", icon: Landmark },
                      { id: "subscriptions", label: "Subscriptions", icon: RefreshCw }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all relative
                          ${activeTab === tab.id 
                            ? `${theme.bg} text-white shadow-md ring-1 ring-white/20` 
                            : `text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5`
                          }`}
                      >
                        <tab.icon size={16} className={activeTab === tab.id ? 'text-white' : theme.textAccent} />
                        {tab.label}
                        {tab.hasAlert && (
                           <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-pulse border-2 border-black" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Hub Body */}
                  <div className="p-6">
                    
                    {/* WIRE TRANSFER TAB */}
                    {activeTab === "transfer" && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-bold text-white text-base">Wire Capital Transfer</h3>
                          <p className="text-zinc-400 text-xs mt-0.5">Instant transfer of funds between internal accounts or to another citizen account.</p>
                        </div>

                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as any;
                          setTransferPending(true);
                          try {
                            const res = await fetch(`/api/portal/${bankId}/transfer`, {
                              method: 'POST',
                              headers: {'Content-Type': 'application/json'},
                              body: JSON.stringify({
                                discordId: user?.discordId,
                                fromAccountId: form.fromAccountId.value,
                                toAccountId: form.toAccountId.value,
                                amount: form.amount.value,
                                description: form.description?.value || undefined
                              })
                            });
                            const d = await res.json();
                            if (!res.ok) alert(d.error || "Failed");
                            else {
                              alert("Transfer authorized and executed successfully!");
                              handleSearch();
                              form.reset();
                            }
                          } catch (e) {
                            alert("Error executing transfer.");
                          } finally {
                            setTransferPending(false);
                          }
                        }} className="space-y-4 pt-2">
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">From Account</label>
                              <select 
                                required 
                                name="fromAccountId" 
                                defaultValue={selectedAccountId !== "all" ? selectedAccountId : userData.accounts[0]?.id}
                                className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                              >
                                {userData.accounts.map((acc: any) => (
                                  <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                                    {acc.accountName} ({formatMoney(acc.balance)})
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Destination Account ID</label>
                              <div className="relative">
                                <input 
                                  required 
                                  name="toAccountId" 
                                  type="text" 
                                  placeholder="e.g. acc_12345" 
                                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono" 
                                />
                                <Wallet className="absolute left-3.5 top-3.5 text-zinc-500" size={14} />
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Transfer Amount ($)</label>
                              <div className="flex gap-1.5">
                                {[10, 50, 100, 500].map((amt) => (
                                  <button
                                    key={amt}
                                    type="button"
                                    onClick={(e) => {
                                      const input = (e.currentTarget.form as any)?.amount;
                                      if (input) input.value = amt.toFixed(2);
                                    }}
                                    className="text-[10px] bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white px-2 py-0.5 rounded border border-white/5 font-mono"
                                  >
                                    ${amt}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="relative">
                              <input 
                                required 
                                name="amount" 
                                type="number" 
                                step="0.01" 
                                min="0.01" 
                                placeholder="0.00" 
                                className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono" 
                              />
                              <DollarSign className="absolute left-3.5 top-3.5 text-zinc-500" size={14} />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Transfer Memo / Reference (Optional)</label>
                            <input 
                              name="description" 
                              type="text" 
                              placeholder="e.g. Rent payment, vehicle purchase, split bill" 
                              className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all" 
                            />
                          </div>

                          <button 
                            type="submit" 
                            disabled={transferPending}
                            className={`w-full ${theme.bg} hover:brightness-110 text-white py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 mt-2 shadow-lg`}
                          >
                            {transferPending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                            {transferPending ? "Processing..." : "Authorize Capital Wire"}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* ONYX QUICK PAY TAB */}
                    {activeTab === "onyx" && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-bold text-white text-base">Onyx Quick Pay Gateway</h3>
                          <p className="text-zinc-400 text-xs mt-0.5">Direct merchant checkout to whitelisted Slate Onyx storefronts.</p>
                        </div>

                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const fd = new FormData(form);
                          setOnyxPending(true);
                          try {
                            const onyxRes = await fetch(`/api/onyx/checkout`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'x-api-key': fd.get("apiKey") as string
                              },
                              body: JSON.stringify({
                                userCityCorpId: user?.discordId,
                                amountCents: Math.round(parseFloat(fd.get("amount") as string) * 100),
                                description: fd.get("description") || "Onyx Portal Purchase"
                              })
                            });
                            const d = await onyxRes.json();
                            if (!onyxRes.ok) alert(d.error || "Onyx payment failed");
                            else {
                              alert("Onyx payment processed successfully!");
                              handleSearch();
                              form.reset();
                            }
                          } catch (e) {
                            alert("Error processing Onyx payment.");
                          } finally {
                            setOnyxPending(false);
                          }
                        }} className="space-y-4 pt-2">
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Paying Account</label>
                              <select 
                                required 
                                name="fromAccountId" 
                                className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                              >
                                {userData.accounts.map((acc: any) => (
                                  <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                                    {acc.accountName} ({formatMoney(acc.balance)})
                                  </option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Target Onyx Merchant</label>
                              <select 
                                required 
                                name="apiKey" 
                                className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                              >
                                <option value="">Select merchant...</option>
                                {onyxMerchants.map((m: any) => (
                                  <option key={m.apiKey} value={m.apiKey}>
                                    {m.name} ({m.bankName})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Amount ($)</label>
                              <div className="relative">
                                <input 
                                  required 
                                  name="amount" 
                                  type="number" 
                                  step="0.01" 
                                  min="0.01" 
                                  placeholder="0.00" 
                                  className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono" 
                                />
                                <DollarSign className="absolute left-3.5 top-3.5 text-zinc-500" size={14} />
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Reference Memo</label>
                              <input 
                                name="description" 
                                type="text" 
                                placeholder="Store Purchase / Donation" 
                                className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all" 
                              />
                            </div>
                          </div>

                          <button 
                            type="submit" 
                            disabled={onyxPending}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-bold transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"
                          >
                            {onyxPending ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />}
                            {onyxPending ? "Authorizing Onyx Clearinghouse..." : "Authorize Onyx Payment"}
                          </button>
                        </form>
                      </div>
                    )}

                    {/* INVOICES TAB */}
                    {activeTab === "invoices" && (
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-bold text-white text-base">Unsettled Invoices & Bill Pay</h3>
                          <p className="text-zinc-400 text-xs mt-0.5">Pay outstanding biller charges directly from your account.</p>
                        </div>

                        {userData?.pendingInvoices?.length > 0 ? (
                          <div className="divide-y divide-white/10 space-y-4 pt-2">
                            {userData.pendingInvoices.map((inv: any) => (
                              <div key={inv.id} className="pt-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-white">{inv.description}</p>
                                    <span className="text-[9px] uppercase font-bold bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                                      Pending
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-400">
                                    Account: <span className="font-mono text-white/90">{inv.customerAccountName}</span> • Biller: {inv.billerName}
                                  </p>
                                  <p className="text-[10px] text-rose-400 flex items-center gap-1">
                                    <Clock size={10} /> Due by {format(new Date(inv.dueDate), "PP")}
                                  </p>
                                </div>
                                
                                <div className="flex items-center gap-4 justify-between sm:justify-end">
                                  <span className="font-mono text-base font-bold text-white">
                                    {formatMoney(inv.amount)}
                                  </span>
                                  <button
                                    disabled={invoicePayId !== null}
                                    onClick={async () => {
                                      setInvoicePayId(inv.id);
                                      try {
                                        const res = await fetch(`/api/portal/${bankId}/pay-invoice`, {
                                          method: 'POST',
                                          headers: {'Content-Type': 'application/json'},
                                          body: JSON.stringify({ discordId: user?.discordId, invoiceId: inv.id })
                                        });
                                        const d = await res.json();
                                        if (!res.ok) alert(d.error || "Failed to pay invoice");
                                        else {
                                          alert("Invoice settled successfully!");
                                          handleSearch();
                                        }
                                      } catch (e) {
                                        console.error(e);
                                      } finally {
                                        setInvoicePayId(null);
                                      }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                                  >
                                    {invoicePayId === inv.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                                    {invoicePayId === inv.id ? "Settling..." : "Pay Invoice"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          ) : (
                            <div className="text-center py-8">
                              <CheckCircle2 className="mx-auto text-emerald-400/80 mb-2" size={32} />
                            <p className="text-sm font-bold text-white">Accounts Fully Current</p>
                            <p className="text-xs text-zinc-400 mt-1">There are no outstanding invoices or pending bills associated with your accounts.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* LOANS TAB */}
                    
{activeTab === "subscriptions" && (
  <SubscriptionsTab data={userData} refresh={handleSearch} theme={theme} />
)}

                    {activeTab === "loans" && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-bold text-white text-base">Credit Lines & Active Loans</h3>
                            <p className="text-zinc-400 text-xs mt-0.5">Manage existing loans, make repayments, or apply for new credit lines.</p>
                          </div>
                          <button 
                            onClick={() => setShowApplyLoanModal(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow"
                          >
                            <Landmark size={14} /> Apply for Loan
                          </button>
                        </div>

                        {(!userData?.loans || userData.loans.length === 0) ? (
                          <div className="text-center py-8 border border-white/5 bg-white/[0.01] rounded-2xl space-y-2">
                            <Landmark size={32} className="mx-auto text-zinc-600" />
                            <p className="text-white text-sm font-bold">No Active Loans</p>
                            <p className="text-zinc-400 text-xs">Apply for a low-interest bank loan to finance property, vehicles, or business ventures.</p>
                            <button 
                              onClick={() => setShowApplyLoanModal(true)}
                              className="mx-auto bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 px-4 rounded-xl transition-all mt-2"
                            >
                              Apply for Loan
                            </button>
                          </div>
                          ) : (
                            <div className="space-y-3 pt-2">
                            {userData.loans.map((loan: any) => (
                              <div key={loan.id} className="bg-[#0a0a0f] border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-white font-bold text-sm">Loan #{loan.id.slice(0, 8)}</h4>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                      loan.status === 'paid_off' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                      'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                    }`}>
                                      {loan.status === 'paid_off' ? 'Paid Off' : 'Active Loan'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-zinc-400">{loan.purpose || 'Personal financing line'}</p>
                                  <div className="flex gap-4 text-xs font-mono text-zinc-500 pt-1">
                                    <span>Principal: {formatMoney(loan.amount)}</span>
                                    <span>APR: {((loan.interestRate || 550) / 100).toFixed(2)}%</span>
                                    <span>Term: {loan.termMonths || 12} Mos</span>
                                  </div>
                                </div>
                                
                                <div className="text-right flex items-center justify-between md:flex-col md:items-end gap-2">
                                  <div>
                                    <span className="text-[9px] uppercase text-zinc-500 font-bold block">Remaining Principal</span>
                                    <span className="text-lg font-black font-mono text-emerald-400">
                                      {formatMoney(loan.remainingBalance)}
                                    </span>
                                  </div>

                                  {loan.status !== 'paid_off' && loan.remainingBalance > 0 && (
                                    <button 
                                      onClick={() => setRepayingLoan(loan)}
                                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                                    >
                                      Make Repayment
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}

              
              {/* Right Column: Cards Management */}
              <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-300 tracking-wider uppercase flex items-center gap-2">
                  <CreditCard size={16} className={theme.textAccent} /> Cards Facility
                </h2>
                <button 
                  onClick={() => setShowIssueCardModal(true)}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                >
                  <Plus size={14} /> Request Card
                </button>
              </div>

              {userData?.cards?.length > 0 && (
                <div className="space-y-6">
                  {userData.cards.map((card: any) => {
                    const isCardLocked = card.status === 'frozen';
                    const isCredit = card.type === 'credit';
                    const isVisible = visibleCardIds[card.id] || false;

                    return (
                      <div key={card.id} className={`p-5 rounded-2xl border transition-all ${isCardLocked ? 'bg-zinc-900 border-white/5 opacity-75' : 'bg-[#0b0b0f] border-white/10 hover:bg-white/5'}`}>
                        <div className="flex justify-between items-center mb-4">
                           <div className="flex items-center gap-2">
                             <CreditCard size={18} className={isCardLocked ? "text-zinc-500" : (isCredit ? "text-amber-400" : "text-white")} />
                             <span className="font-bold text-white text-sm">{card.accountName || "Checking"}</span>
                           </div>
                           <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${isCredit ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-white/10 text-white/80'} border`}>
                              {card.type}
                           </span>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="font-mono text-lg tracking-widest text-white select-all">
                              {formatCardNumber(card.cardNumber, isVisible)}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-end text-xs text-zinc-400">
                             <div>
                               <span className="block text-[9px] uppercase tracking-widest mb-0.5">Exp</span>
                               <span className="font-mono text-white">{card.expiryDate}</span>
                             </div>
                             <div>
                               <span className="block text-[9px] uppercase tracking-widest mb-0.5">CVV</span>
                               <span className="font-mono text-white">{isVisible ? card.cvv : "•••"}</span>
                             </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/10 flex gap-2">
                          <button
                            onClick={() => handleToggleCard(card.id, !isCardLocked)}
                            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all border ${
                              isCardLocked 
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20' 
                                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20'
                            }`}
                          >
                            {isCardLocked ? <Unlock size={14} /> : <Lock size={14} />}
                            {isCardLocked ? "Unfreeze" : "Freeze"}
                          </button>
                          
                          <button
                            onClick={() => toggleCardVisibility(card.id)}
                            className="py-2 px-3 rounded-lg flex items-center justify-center text-xs font-bold bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 transition-all"
                            title="Toggle Number Visibility"
                          >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
      
{/* OPEN ACCOUNT MODAL */}
      <AnimatePresence>
        {showOpenAccountModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus size={18} className="text-indigo-400" /> Open New Account
                </h3>
                <button onClick={() => setShowOpenAccountModal(false)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as any;
                setActionPending(true);
                try {
                  const res = await fetch(`/api/banks/${bankId}/accounts/register`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      discordId: user?.discordId,
                      accountName: form.accountName.value,
                      type: form.type.value,
                      businessTaxId: form.businessTaxId?.value,
                      businessSector: form.businessSector?.value
                    })
                  });
                  const d = await res.json();
                  if (!res.ok) alert(d.error || "Failed to open account");
                  else {
                    alert("Account opened successfully!");
                    setShowOpenAccountModal(false);
                    handleSearch();
                  }
                } catch (err) {
                  alert("Error processing account registration.");
                } finally {
                  setActionPending(false);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Account Title / Name</label>
                  <input required name="accountName" placeholder="e.g. Primary Checking / High-Yield Savings" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Account Category</label>
                  <select name="type" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="checking">Checking Account</option>
                    <option value="savings">High-Yield Savings</option>
                    <option value="business">Business / Corporation Account</option>
                  </select>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setShowOpenAccountModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-3 rounded-xl">Cancel</button>
                  <button type="submit" disabled={actionPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                    {actionPending ? <Loader2 className="animate-spin" size={14} /> : "Open Account"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ISSUE CARD MODAL */}
      <AnimatePresence>
        {showIssueCardModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard size={18} className="text-indigo-400" /> Request New Card
                </h3>
                <button onClick={() => setShowIssueCardModal(false)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target;
                setActionPending(true);
                try {
                  const res = await fetch(`/api/portal/${bankId}/request-card`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      accountId: form.accountId.value,
                      cardType: form.cardType.value
                    })
                  });
                  const d = await res.json();
                  if (!res.ok) alert(d.error || "Card request failed");
                  else {
                    alert("Card issued successfully!");
                    setShowIssueCardModal(false);
                    handleSearch();
                  }
                } catch (err) {
                  alert("Error requesting card.");
                } finally {
                  setActionPending(false);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Linked Account</label>
                  <select name="accountId" required className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    {userData?.accounts?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Card Type</label>
                  <select name="cardType" required className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="debit">Debit Card</option>
                    <option value="credit">Credit Card</option>
                  </select>
                  <p className="text-xs text-white/50 mt-2">
                    Debit cards are instantly linked to your account balance. Credit cards may require manual approval depending on bank policy.
                  </p>
                </div>

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={actionPending}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
                  >
                    {actionPending ? <Loader2 className="animate-spin" size={14} /> : "Submit Request"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* APPLY LOAN MODAL */}
      <AnimatePresence>
        {showApplyLoanModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Landmark size={18} className="text-indigo-400" /> Loan Application
                </h3>
                <button onClick={() => setShowApplyLoanModal(false)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as any;
                setActionPending(true);
                try {
                  const res = await fetch(`/api/portal/${bankId}/request-loan`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      accountId: form.accountId.value,
                      amount: form.amount.value,
                      termMonths: form.termMonths.value,
                      purpose: form.purpose.value
                    })
                  });
                  const d = await res.json();
                  if (!res.ok) alert(d.error || "Loan request failed");
                  else {
                    alert("Loan approved and funds credited directly to your account!");
                    setShowApplyLoanModal(false);
                    handleSearch();
                  }
                } catch (err) {
                  alert("Error submitting loan application.");
                } finally {
                  setActionPending(false);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Destination Deposit Account</label>
                  <select name="accountId" required className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    {userData?.accounts?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.id})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Loan Amount ($)</label>
                  <input required name="amount" type="number" step="0.01" min="10" placeholder="e.g. 5000" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Term Duration</label>
                  <select name="termMonths" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="6">6 Months (5.5% APR)</option>
                    <option value="12">12 Months (5.5% APR)</option>
                    <option value="24">24 Months (5.5% APR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Purpose / Note</label>
                  <input name="purpose" placeholder="e.g. Business Expansion / Real Estate Purchase" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" />
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setShowApplyLoanModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-3 rounded-xl">Cancel</button>
                  <button type="submit" disabled={actionPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                    {actionPending ? <Loader2 className="animate-spin" size={14} /> : "Submit Application"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ISSUE CARD MODAL REMOVED */}

      {/* REPAY LOAN MODAL */}
      <AnimatePresence>
        {repayingLoan && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSign size={18} className="text-emerald-400" /> Loan Repayment #{repayingLoan.id.slice(0, 8)}
                </h3>
                <button onClick={() => setRepayingLoan(null)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="bg-[#0a0a0f] p-3 rounded-xl border border-white/5 text-xs space-y-1">
                <p className="text-zinc-400">Remaining Principal: <strong className="text-emerald-400 font-mono">{formatMoney(repayingLoan.remainingBalance)}</strong></p>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as any;
                setActionPending(true);
                try {
                  const res = await fetch(`/api/portal/${bankId}/repay-loan`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      loanId: repayingLoan.id,
                      accountId: form.accountId.value,
                      amount: form.amount.value
                    })
                  });
                  const d = await res.json();
                  if (!res.ok) alert(d.error || "Repayment failed");
                  else {
                    alert("Repayment processed successfully!");
                    setRepayingLoan(null);
                    handleSearch();
                  }
                } catch (err) {
                  alert("Error processing repayment.");
                } finally {
                  setActionPending(false);
                }
              }} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Source Payment Account</label>
                  <select name="accountId" required className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    {userData?.accounts?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.accountName} ({formatMoney(acc.balance)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1">Repayment Amount ($)</label>
                  <input required name="amount" type="number" step="0.01" min="0.01" defaultValue={(repayingLoan.remainingBalance / 100).toFixed(2)} className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" />
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setRepayingLoan(null)} className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-3 rounded-xl">Cancel</button>
                  <button type="submit" disabled={actionPending} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                    {actionPending ? <Loader2 className="animate-spin" size={14} /> : "Authorize Repayment"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TRANSACTION RECEIPT MODAL */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111118] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5"
            >
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText size={18} className="text-indigo-400" /> Transaction Receipt
                </h3>
                <button onClick={() => setSelectedTx(null)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="bg-[#0a0a0f] p-4 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Transaction ID</span>
                    <span className="text-white font-bold select-all">{selectedTx.id}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Timestamp</span>
                    <span className="text-white">{format(new Date(selectedTx.timestamp), "PPpp")}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Transaction Type</span>
                    <span className="text-indigo-400 font-bold uppercase">{selectedTx.type}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">From Account</span>
                    <span className="text-zinc-300 truncate max-w-[180px]">{selectedTx.fromAccountId || "External Deposit"}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-zinc-500">To Account</span>
                    <span className="text-zinc-300 truncate max-w-[180px]">{selectedTx.toAccountId || "External Withdrawal"}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-zinc-400 font-bold">Total Amount</span>
                    <span className="text-xl font-black text-emerald-400">{formatMoney(selectedTx.amount)}</span>
                  </div>
                </div>

                {selectedTx.description && (
                  <div className="p-3 bg-white/5 rounded-xl text-zinc-300">
                    <span className="text-[10px] text-zinc-500 block uppercase mb-0.5">Memo / Description</span>
                    {selectedTx.description}
                  </div>
                )}
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`Transaction Receipt\nID: ${selectedTx.id}\nAmount: ${formatMoney(selectedTx.amount)}\nDate: ${selectedTx.timestamp}`);
                    setCopiedTxId(true);
                    setTimeout(() => setCopiedTxId(false), 2000);
                  }} 
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                >
                  {copiedTxId ? <Check size={14} /> : <Copy size={14} />}
                  {copiedTxId ? "Receipt Copied!" : "Copy Receipt Details"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
    </div>
  );
}


function SubscriptionsTab({ data, refresh, theme }: any) {
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
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <RefreshCw className={theme.textAccent} size={20} /> My Subscriptions
        </h3>
      </div>
      
      {mySubs.length === 0 ? (
        <div className="bg-black/20 border border-white/5 rounded-2xl p-12 text-center">
           <RefreshCw size={32} className="mx-auto text-white/20 mb-3" />
           <p className="text-white/50">You have no active subscriptions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mySubs.map((sub: any) => {
             const isBiller = data?.accounts?.some((a: any) => a.id === sub.billerAccountId);
             return (
               <div key={sub.id} className={`bg-[#13131c] border ${sub.isActive ? 'border-white/10' : 'border-red-500/20 opacity-60'} rounded-xl p-5 hover:border-white/20 transition-all`}>
                 <div className="flex justify-between items-start mb-3">
                   <div className="text-sm font-semibold text-white/70 truncate flex-1 pr-2">{sub.description || "Recurring Payment"}</div>
                   <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${sub.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                     {sub.isActive ? "Active" : "Cancelled"}
                   </div>
                 </div>
                 
                 <div className="text-3xl font-black text-white mb-4">
                   {formatMoney(sub.amount)}<span className="text-sm font-medium text-white/40">/{sub.frequency === 'weekly' ? 'wk' : 'mo'}</span>
                 </div>
                 
                 <div className="space-y-2 mb-5">
                   <div className="flex justify-between text-xs">
                     <span className="text-white/40">Role</span>
                     <span className={isBiller ? "text-emerald-400 font-medium" : "text-white/80"}>{isBiller ? "Receiving (Biller)" : "Paying (Customer)"}</span>
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
                     className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
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
