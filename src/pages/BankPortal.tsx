import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { 
  Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, 
  Lock, Unlock, Loader2, Link2, LogIn, LogOut, Sparkles, CheckCircle2, 
  AlertTriangle, ArrowUpRight, ArrowDownRight, Send, DollarSign, Activity,
  FileText, Landmark, UserCheck, Plus, X, Copy, Check, Layers, PieChart,
  ChevronRight, Building2, HelpCircle
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
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  
  // Tab Selection: "transfer" | "onyx" | "invoices" | "loans" | "cards"
  const [activeTab, setActiveTab] = useState<"transfer" | "onyx" | "invoices" | "loans" | "cards">("transfer");
  
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
        if (!d.error) { setBank(d); document.title = `${d.name} | Client Portal`; }
      });
      
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
  const filteredTx = userData?.recentTx?.filter((tx: any) => {
    const term = searchTerm.toLowerCase();
    return (
      (tx.description || "").toLowerCase().includes(term) ||
      (tx.type || "").toLowerCase().includes(term) ||
      (tx.fromAccountId || "").toLowerCase().includes(term) ||
      (tx.toAccountId || "").toLowerCase().includes(term)
    );
  }) || [];

  if (isLoading || !bank) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
        <p className="text-sm text-zinc-400 font-mono">Loading financial gateway...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 mb-24">
      
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
            className="bg-gradient-to-b from-[#111118] to-[#0a0a0d] border border-white/10 rounded-3xl p-8 shadow-2xl text-center space-y-6 relative overflow-hidden"
          >
            <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-xl">
              <Lock size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Identity Authentication Required</h2>
              <p className="text-zinc-400 text-xs mt-2 leading-relaxed px-2">
                Log in to authenticate your account identity and access your accounts, credit lines, cards, and transaction records.
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 py-1 select-none transition-colors">
                <input 
                  type="checkbox" 
                  checked={rememberMe} 
                  onChange={(e) => setRememberMe(e.target.checked)} 
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 cursor-pointer"
                />
                <span>Remember me on this device</span>
              </label>

              {bank.cityCorpAppId ? (
                <button 
                  onClick={() => login(bankId, 'citycorp')}
                  className={`w-full ${theme.bg} hover:brightness-110 text-white text-sm font-bold py-3.5 rounded-xl transition-all shadow-xl flex items-center justify-center gap-2`}
                >
                  <LogIn size={16} /> Authenticate via CityCorp
                </button>
              ) : (
                <div className="text-center text-sm text-zinc-400">
                  <p>Authentication is not currently configured for this bank.</p>
                </div>
              )}
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
        /* Authenticated Client Dashboard */
        <div className="space-y-8">
          
          {/* Identity & Link Status Badge Bar */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-[#0d0d14] via-[#09090e] to-[#0c0c12] border border-white/10 rounded-3xl p-5 md:p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6"
          >
            <div className="flex items-center gap-4 text-center sm:text-left flex-col sm:flex-row">
              {userData?.customer?.mcUuid ? (
                <div className="relative group shrink-0">
                  <img 
                    src={`https://mc-heads.net/avatar/${userData.customer.mcUsername || userData.customer.mcUuid}/64`} 
                    alt="Minecraft Head" 
                    onError={(e: any) => {
                      e.target.onerror = null;
                      e.target.src = `https://minotar.net/helm/${userData.customer.mcUsername || userData.customer.mcUuid}/64.png`;
                    }}
                    className="w-14 h-14 rounded-2xl border border-white/10 shadow-md bg-zinc-950 object-contain p-0.5" 
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-1 -right-1 bg-emerald-500 border border-[#09090e] p-1 rounded-full text-white shadow" title="Verified Customer">
                    <ShieldCheck size={10} />
                  </span>
                </div>
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Link2 size={24} className="animate-pulse" />
                </div>
              )}
              <div className="text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <h3 className="font-bold text-white text-base">
                    {userData?.customer?.mcUsername || user.username || "Citizen"}
                  </h3>
                  <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wide">
                    Verified Customer
                  </span>
                </div>
                <p className="text-zinc-400 text-xs mt-1">
                  {userData?.customer?.mcUsername 
                    ? `Linked to Minecraft player profile ${userData.customer.mcUsername}`
                    : `Authenticate your Minecraft player account for in-game auto-syncing.`}
                </p>
                {userData?.customer?.mcUuid && (
                  <p className="text-[10px] text-zinc-500 font-mono mt-1 select-all">UUID: {userData.customer.mcUuid}</p>
                )}
              </div>
            </div>

            <div className="w-full sm:w-auto text-right flex items-center justify-center sm:justify-end gap-3">
              <button
                onClick={() => setShowOpenAccountModal(true)}
                className={`w-full sm:w-auto ${theme.bg} hover:brightness-110 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2`}
              >
                <Plus size={14} /> Open Account
              </button>
            </div>
          </motion.div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0b0b10] border border-white/10 rounded-2xl p-4 shadow-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Total Net Worth</span>
              <p className="text-xl font-bold font-mono text-emerald-400">{formatMoney(netWorthCents)}</p>
            </div>
            <div className="bg-[#0b0b10] border border-white/10 rounded-2xl p-4 shadow-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Active Accounts</span>
              <p className="text-xl font-bold font-mono text-white">{userData?.accounts?.length || 0}</p>
            </div>
            <div className="bg-[#0b0b10] border border-white/10 rounded-2xl p-4 shadow-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Cards Issued</span>
              <p className="text-xl font-bold font-mono text-indigo-400">{userData?.cards?.length || 0}</p>
            </div>
            <div className="bg-[#0b0b10] border border-white/10 rounded-2xl p-4 shadow-xl">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">Active Loans</span>
              <p className="text-xl font-bold font-mono text-amber-400">{userData?.loans?.length || 0}</p>
            </div>
          </div>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left & Middle Column: Accounts & Tabs */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Accounts Showcase */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-zinc-300 tracking-wider uppercase flex items-center gap-2">
                    <Wallet size={16} className={theme.textAccent} /> My Bank Accounts
                  </h2>
                  <button 
                    onClick={() => setShowOpenAccountModal(true)}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={14} /> New Account
                  </button>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2].map(i => (
                      <div key={i} className="bg-white/5 border border-white/5 rounded-2xl h-36 animate-pulse" />
                    ))}
                  </div>
                ) : userData?.accounts?.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userData.accounts.map((acc: any) => {
                      const isSavings = acc.type?.toLowerCase().includes("savings");
                      const isBusiness = acc.type?.toLowerCase().includes("business");
                      
                      return (
                        <motion.div 
                          key={acc.id}
                          whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.2)" }}
                          className="bg-gradient-to-b from-[#111118] to-[#0a0a0e] border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden group transition-all"
                        >
                          <div className="flex justify-between items-start relative z-10">
                            <div>
                              <h3 className="font-bold text-white text-base tracking-tight truncate max-w-[170px]">{acc.accountName}</h3>
                              <span className={`inline-block mt-1 text-[9px] uppercase font-bold px-2 py-0.5 rounded-full 
                                ${isSavings ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : 
                                 isBusiness ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : 
                                 "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                                }`}
                              >
                                {acc.type} Account
                              </span>
                            </div>
                            <div className="p-2 rounded-xl bg-white/5 text-zinc-400">
                              {isSavings ? <Sparkles size={16} /> : isBusiness ? <Building2 size={16} /> : <CreditCard size={16} />}
                            </div>
                          </div>

                          <div className="mt-4 relative z-10">
                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Available Balance</p>
                            <p className="text-2xl font-black font-mono text-white mt-0.5">
                              {formatMoney(acc.balance)}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-3 relative z-10">
                            <span className="hover:text-zinc-300 transition-colors select-all cursor-pointer font-bold">
                              ID: {acc.id}
                            </span>
                            <span className="text-emerald-400 font-bold">Active</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-[#0b0b0f] border border-white/10 rounded-2xl p-8 text-center space-y-3">
                    <Wallet className="mx-auto text-zinc-600" size={32} />
                    <p className="text-sm font-bold text-white">No Active Accounts</p>
                    <p className="text-xs text-zinc-400">Open a checking or savings account with {bank.name} to start managing your capital.</p>
                    <button 
                      onClick={() => setShowOpenAccountModal(true)}
                      className={`mx-auto ${theme.bg} hover:brightness-110 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg flex items-center gap-2`}
                    >
                      <Plus size={14} /> Open Account Now
                    </button>
                  </div>
                )}
              </div>

              {/* Action Hub Tabs */}
              {userData?.accounts?.length > 0 && (
                <div className="bg-gradient-to-b from-[#111118] to-[#0a0a0d] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                  
                  {/* Hub Tabs Header */}
                  <div className="flex border-b border-white/10 bg-black/40 p-2 gap-1 overflow-x-auto scrollbar-none">
                    <button
                      onClick={() => setActiveTab("transfer")}
                      className={`flex-1 min-w-[120px] py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all
                        ${activeTab === "transfer" 
                          ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/10` 
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      <Send size={14} /> Wire Transfer
                    </button>
                    <button
                      onClick={() => setActiveTab("onyx")}
                      className={`flex-1 min-w-[120px] py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all
                        ${activeTab === "onyx" 
                          ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/10` 
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      <Activity size={14} /> Onyx Pay
                    </button>
                    <button
                      onClick={() => setActiveTab("invoices")}
                      className={`flex-1 min-w-[120px] py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all relative
                        ${activeTab === "invoices" 
                          ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/10` 
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      <FileText size={14} /> Invoices
                      {userData?.pendingInvoices?.length > 0 && (
                        <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab("loans")}
                      className={`flex-1 min-w-[120px] py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all relative
                        ${activeTab === "loans" 
                          ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/10` 
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                        }`}
                    >
                      <Landmark size={14} /> Credit & Loans
                    </button>
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
                                amount: form.amount.value
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
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Transfer Amount ($)</label>
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

              {/* ACCOUNT LEDGER HISTORY */}
              {userData?.recentTx?.length > 0 && (
                <div className="bg-[#0b0b10] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                  
                  {/* Header */}
                  <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Activity className={theme.textAccent} size={20} />
                      <h3 className="font-bold text-white text-base">Real-Time Account Ledger</h3>
                    </div>
                    
                    {/* Live filter input */}
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Search ledger..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-black/40 border border-white/10 rounded-xl py-2 px-3 pl-9 text-xs text-white focus:outline-none focus:border-indigo-500 w-full sm:w-60 font-mono transition-all"
                      />
                      <Search className="absolute left-3 top-2.5 text-zinc-500" size={13} />
                    </div>
                  </div>

                  {/* Transaction List */}
                  <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                    <AnimatePresence>
                      {filteredTx.length > 0 ? (
                        filteredTx.map((tx: any, i: number) => {
                          const isIncoming = tx.toDiscordId === user?.discordId;
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
                                  <p className="text-sm font-semibold text-white truncate max-w-[150px] sm:max-w-[280px]">
                                    {tx.description || tx.type}
                                  </p>
                                  <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                    {format(new Date(tx.timestamp), "MMM d, h:mm a")} • {tx.type}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className={`font-mono text-sm font-black ${isIncoming ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isIncoming ? '+' : '-'}{formatMoney(tx.amount)}
                                </span>
                              </div>
                            </motion.div>
                          );
                        })
                      ) : (
                        <div className="text-center py-12 text-zinc-500 text-xs">
                          No transaction records match search parameters.
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                </div>
              )}

            </div>

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

              {userData?.cards?.length > 0 ? (
                <div className="space-y-6">
                  {userData.cards.map((card: any) => {
                    const isCardLocked = card.isLocked;
                    const isCredit = card.type === 'credit';
                    const isVisible = visibleCardIds[card.id] || false;

                    return (
                      <div key={card.id} className="space-y-3">
                        
                        {/* Card Visual */}
                        <motion.div 
                          whileHover={{ scale: 1.01 }}
                          className={`relative rounded-3xl p-6 shadow-2xl border flex flex-col justify-between aspect-[1.586/1] overflow-hidden transition-all duration-300 select-none
                            ${isCardLocked 
                              ? "bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/5 opacity-60 grayscale" 
                              : isCredit
                                ? `bg-gradient-to-br ${theme.fromGradient} to-black border-white/20`
                                : "bg-gradient-to-br from-[#1b1b26] to-[#0a0a0f] border-white/10"
                            }`}
                        >
                          <div className="absolute right-6 top-6 w-10 h-8 rounded-lg bg-gradient-to-r from-amber-200/20 via-amber-100/30 to-amber-200/10 border border-amber-300/20 flex items-center justify-center">
                            <div className="w-6 h-5 border border-amber-300/10 rounded" />
                          </div>

                          <div className="flex justify-between items-start relative z-10">
                            <div>
                              <div className="text-base font-black italic tracking-wider text-white">
                                SLATE
                              </div>
                              <span className="text-[8px] text-zinc-400 uppercase tracking-widest block">{bank.name}</span>
                            </div>
                            <span className="text-[9px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md bg-white/10 text-white/90">
                              {card.type}
                            </span>
                          </div>

                          <div className="my-4 relative z-10">
                            <div className="font-mono text-lg sm:text-xl tracking-widest text-white font-semibold flex items-center justify-between drop-shadow select-all">
                              {formatCardNumber(card.cardNumber, isVisible)}
                            </div>
                          </div>

                          <div className="flex justify-between items-end relative z-10 mt-auto pt-2 border-t border-white/10">
                            <div className="text-left">
                              <span className="text-[8px] text-zinc-400 uppercase tracking-widest block">Holder Account</span>
                              <span className="text-xs font-bold text-white block truncate max-w-[130px]">{card.accountName || "Checking Account"}</span>
                            </div>
                            <div className="flex gap-3">
                              <div>
                                <span className="text-[8px] text-zinc-400 uppercase tracking-widest block">Exp</span>
                                <span className="font-mono text-xs text-white block">{card.expiryDate}</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-zinc-400 uppercase tracking-widest block">CVV</span>
                                <span className="font-mono text-xs text-white block">
                                  {isVisible ? card.cvv : "•••"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {isCardLocked && (
                            <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5 z-20 backdrop-blur-xs">
                              <Lock className="text-rose-400" size={24} />
                              <span className="text-[10px] tracking-widest uppercase font-bold text-rose-300">Card Frozen</span>
                            </div>
                          )}
                        </motion.div>

                        {/* Card Controls */}
                        <div className="flex gap-2">
                          <button 
                            disabled={lockingCardId === card.id}
                            onClick={async () => {
                              setLockingCardId(card.id);
                              try {
                                const res = await fetch(`/api/portal/${bankId}/cards/${card.id}/lock`, {
                                  method: 'PATCH',
                                  headers: {'Content-Type': 'application/json'},
                                  body: JSON.stringify({ discordId: user?.discordId, isLocked: !isCardLocked })
                                });
                                if (res.ok) handleSearch();
                                else alert("Failed to update card status.");
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setLockingCardId(null);
                              }
                            }}
                            className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all border 
                              ${isCardLocked 
                                ? `${theme.bg} text-white border-transparent` 
                                : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20"
                              }`}
                          >
                            {lockingCardId === card.id ? <Loader2 className="animate-spin" size={13} /> : isCardLocked ? <Unlock size={13} /> : <Lock size={13} />}
                            {lockingCardId === card.id ? "Updating..." : isCardLocked ? "Unfreeze Card" : "Freeze Card"}
                          </button>
                          
                          <button 
                            onClick={() => toggleCardVisibility(card.id)}
                            className="py-2.5 px-4 rounded-xl flex items-center justify-center text-xs font-bold bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 transition-all"
                            title="Toggle Number Visibility"
                          >
                            {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[#0b0b0f] border border-white/10 rounded-2xl p-6 text-center space-y-2">
                  <CreditCard className="mx-auto text-zinc-600" size={28} />
                  <p className="text-xs font-bold text-white">No Connected Cards</p>
                  <p className="text-[11px] text-zinc-400">Request a virtual debit card linked to your account.</p>
                  <button 
                    onClick={() => setShowIssueCardModal(true)}
                    className={`mx-auto ${theme.bg} hover:brightness-110 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all mt-2`}
                  >
                    Issue Card
                  </button>
                </div>
              )}
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
                  <CreditCard size={18} className="text-indigo-400" /> Issue New Card
                </h3>
                <button onClick={() => setShowIssueCardModal(false)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as any;
                setActionPending(true);
                try {
                  const res = await fetch(`/api/portal/${bankId}/issue-card`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                      accountId: form.accountId.value,
                      cardType: form.cardType.value
                    })
                  });
                  const d = await res.json();
                  if (!res.ok) alert(d.error || "Failed to issue card");
                  else {
                    alert("Virtual card issued successfully!");
                    setShowIssueCardModal(false);
                    handleSearch();
                  }
                } catch (err) {
                  alert("Error issuing card.");
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
                  <select name="cardType" className="w-full bg-[#0a0a0f] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="debit">Virtual Debit Card</option>
                    <option value="credit">Personal Credit Card</option>
                  </select>
                </div>

                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setShowIssueCardModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white text-xs font-bold py-3 rounded-xl">Cancel</button>
                  <button type="submit" disabled={actionPending} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                    {actionPending ? <Loader2 className="animate-spin" size={14} /> : "Issue Card"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
  );
}
