import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { 
  Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, 
  Lock, Unlock, Loader2, Link2, LogIn, LogOut, Sparkles, CheckCircle2, 
  AlertTriangle, ArrowUpRight, ArrowDownRight, Send, DollarSign, Activity,
  FileText, Landmark, UserCheck
} from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

// Statically compiled brand color themes to guarantee perfect Tailwind compilation
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
  const { user, login, logout, isLoading } = useAuth();
  const [bank, setBank] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);
  
  // Interactive feature tab selection: "transfer" | "onyx" | "invoices" | "loans"
  const [activeTab, setActiveTab] = useState<"transfer" | "onyx" | "invoices" | "loans">("transfer");
  
  // Ledger search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Interactive UI loaders
  const [transferPending, setTransferPending] = useState(false);
  const [onyxPending, setOnyxPending] = useState(false);
  const [invoicePayId, setInvoicePayId] = useState<string | null>(null);
  const [lockingCardId, setLockingCardId] = useState<string | null>(null);

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
        if (!d.error) setBank(d);
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
        setUserData({ error: "No accounts found for this Citizen ID at this bank." });
      }
    } catch (e) {
      console.error(e);
      setUserData({ error: "System error while fetching data." });
    }
    setLoading(false);
  };

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
        <Loader2 className="animate-spin text-zinc-500" size={32} />
        <p className="text-sm text-zinc-400 font-mono">Loading bank gateway...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 mb-24">
      
      {/* Header Area */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-white/5">
        <div className="flex items-center gap-4 text-center md:text-left">
          {bank.settings?.logoUrl ? (
            <img 
              src={bank.settings.logoUrl} 
              alt="Logo" 
              className="w-14 h-14 rounded-2xl border border-white/10 shadow-lg object-contain bg-[#0c0c12]" 
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${theme.fromGradient} to-black flex items-center justify-center font-bold text-2xl text-white shadow-xl ${theme.glow}`}>
              {bank.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2 justify-center md:justify-start">
              {bank.name}
              <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${theme.bgLight} ${theme.textAccent} border ${theme.border}`}>
                Portal
              </span>
            </h1>
            <p className="text-zinc-400 text-xs mt-0.5">Secure Customer Financial Interface</p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-4 bg-[#0a0a0f] border border-white/5 rounded-2xl p-2 px-4 shadow-xl">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full border border-white/10" />
              ) : (
                <div className={`w-8 h-8 rounded-full ${theme.bgLight} ${theme.textAccent} flex items-center justify-center text-xs font-bold`}>
                  {user.username.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div className="text-left">
                <p className="text-xs font-semibold text-white/90">{user.username}</p>
                <p className="text-[10px] text-zinc-500 font-mono tracking-tight">{user.discordId}</p>
              </div>
            </div>
            <div className="h-6 w-px bg-white/5" />
            <button 
              onClick={logout} 
              className="text-zinc-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Notifications Area */}
      {oauthSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 text-emerald-300 text-sm flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-400 shrink-0" size={24} />
            <div>
              <p className="font-semibold text-white">Profile Verified Successfully!</p>
              <p className="text-white/60 text-xs mt-0.5">Your Minecraft profile <strong>{oauthSuccess}</strong> has been linked and validated with {bank.name}.</p>
            </div>
          </div>
          <button onClick={() => setOauthSuccess(null)} className="text-white/40 hover:text-white/80 font-bold px-2 py-1 text-lg">×</button>
        </motion.div>
      )}

      {/* Login Screen if Unauthenticated */}
      {!user ? (
        <div className="max-w-md mx-auto py-12">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-b from-[#111116] to-[#0a0a0d] border border-white/10 rounded-3xl p-8 shadow-2xl text-center space-y-6"
          >
            <div className="mx-auto w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400">
              <Lock size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Identity Authentication</h2>
              <p className="text-zinc-400 text-xs mt-2 leading-relaxed px-2">
                This secure financial terminal requires OAuth validation. Log in securely to retrieve your verified {bank.name} checking, savings, cards, and invoices.
              </p>
            </div>

            <button 
              onClick={() => login(bankId)}
              className={`w-full ${theme.bgAccent} hover:brightness-110 text-white text-sm font-semibold py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2`}
            >
              <LogIn size={16} /> Authenticate with CityCorp
            </button>
          </motion.div>
        </div>
      ) : (
        /* Authenticated Main Content Dashboard */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT/MID MAIN PANEL: Balance Cards & Tabs */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Identity & Verification Widget */}
            <AnimatePresence mode="wait">
              {userData && !userData.error && (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-[#0d0d14] via-[#09090e] to-[#0c0c12] border border-white/5 rounded-3xl p-5 md:p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-4 text-center sm:text-left flex-col sm:flex-row">
                    {userData.customer?.mcUuid ? (
                      <div className="relative group shrink-0">
                        <img 
                          src={`https://mc-heads.net/avatar/${userData.customer.mcUuid}/64`} 
                          alt="Avatar" 
                          className="w-14 h-14 rounded-2xl border border-white/10 shadow-md group-hover:scale-105 transition-transform bg-zinc-950 object-contain" 
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute -bottom-1.5 -right-1.5 bg-emerald-500 border border-[#09090e] p-1 rounded-full text-white" title="Verified Whitelabel">
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
                          {userData.customer?.mcUsername ? userData.customer.mcUsername : "Unverified Identity"}
                        </h3>
                        {userData.customer?.mcUsername && (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                            Linked
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 text-xs mt-1 leading-relaxed">
                        {userData.customer?.mcUsername 
                          ? `Citizen whitelabel is active. Automatic ledger syncing is online.`
                          : `Complete your whitelabel validation by linking your Minecraft character.`}
                      </p>
                      {userData.customer?.mcUuid && (
                        <p className="text-[10px] text-zinc-600 font-mono mt-1 break-all select-all">UUID: {userData.customer.mcUuid}</p>
                      )}
                    </div>
                  </div>

                  <div className="w-full sm:w-auto text-right">
                    {!userData.customer?.mcUsername && bank.cityCorpAppId && user.discordId && !user.discordId.startsWith("mc_") ? (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/portal/${bankId}/oauth/url`);
                              if (res.ok) {
                                const data = await res.json();
                                window.location.href = data.url;
                              } else {
                                const errData = await res.json();
                                alert(errData.error || "Failed to initiate login flow.");
                              }
                            } catch (err) {
                              alert("Error connecting to validation service.");
                            }
                          }}
                          className={`w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold py-2.5 px-4 rounded-xl transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5`}
                        >
                          <UserCheck size={14} /> Link Minecraft ID
                        </button>
                    ) : user.discordId && user.discordId.startsWith("mc_") && !userData.customer?.linkedDiscordId ? (
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/auth/discord/link`);
                              if (res.ok) {
                                const data = await res.json();
                                const authWindow = window.open(data.url, 'oauth_popup', 'width=600,height=700');
                                if (!authWindow) alert('Please allow popups to connect your Profile.');
                              } else {
                                alert("Failed to initiate linking flow.");
                              }
                            } catch (err) {
                              alert("Error connecting to validation service.");
                            }
                          }}
                          className={`w-full sm:w-auto bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold py-2.5 px-4 rounded-xl transition-all shadow-md shadow-[#5865F2]/20 flex items-center justify-center gap-1.5`}
                        >
                          <UserCheck size={14} /> Link Discord Account
                        </button>
                    ) : userData.customer?.mcUsername ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full border border-emerald-500/20 font-medium">
                        <CheckCircle2 size={12} /> Sync Online
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 italic block">
                        Staff verification required.
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
                  {/* Balances Accounts Section */}
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-zinc-400 tracking-wider uppercase flex items-center gap-2">
                <Wallet size={16} className={`text-${theme.primary}`} /> Connected Accounts
              </h2>
              
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2].map(i => (
                    <div key={i} className="bg-white/5 border border-white/5 rounded-2xl h-36 animate-pulse" />
                  ))}
                </div>
              ) : userData?.accounts?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userData.accounts.map((acc: any) => {
                    const isSavings = acc.type?.toLowerCase().includes("savings") || acc.type?.toLowerCase().includes("vault");
                    const isBusiness = acc.type?.toLowerCase().includes("business");
                    const isPayroll = acc.type?.toLowerCase().includes("payroll");
                    
                    return (
                      <motion.div 
                        key={acc.id}
                        whileHover={{ y: -2, borderColor: "rgba(255,255,255,0.15)" }}
                        className="bg-gradient-to-b from-[#111116] to-[#0a0a0e] border border-white/5 rounded-2xl p-5 flex flex-col justify-between h-40 shadow-xl relative overflow-hidden group transition-all"
                      >
                        {/* Decorative subtle background icon */}
                        <div className="absolute right-2 -bottom-2 opacity-[0.02] text-white pointer-events-none group-hover:scale-110 transition-transform">
                          <Landmark size={120} />
                        </div>

                        <div className="flex justify-between items-start relative z-10">
                          <div>
                            <h3 className="font-bold text-white text-base tracking-tight truncate max-w-[170px]">{acc.accountName}</h3>
                            <span className={`inline-block mt-1 text-[9px] uppercase font-bold px-2 py-0.5 rounded-full 
                              ${isSavings ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : 
                               isBusiness ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : 
                               isPayroll ? "bg-teal-500/10 text-teal-400 border border-teal-500/20" : 
                               "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                              }`}
                            >
                              {acc.type} Account
                            </span>
                          </div>
                          <div className={`p-2 rounded-xl bg-white/5 text-zinc-400`}>
                            {isSavings ? <Sparkles size={16} /> : <CreditCard size={16} />}
                          </div>
                        </div>

                        <div className="mt-4 relative z-10">
                          <p className="text-[10px] text-zinc-500 font-medium">Available Balance</p>
                          <p className="text-2xl font-bold font-mono tracking-tight text-white mt-1">
                            {formatMoney(acc.balance)}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-zinc-500 mt-2 relative z-10">
                          <span className="hover:text-zinc-300 transition-colors select-all cursor-pointer">ID: {acc.id}</span>
                          {acc.routingNumber && <span>RTN: {acc.routingNumber}</span>}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[#0b0b0f] border border-white/5 rounded-2xl p-8 text-center">
                  <Wallet className="mx-auto text-zinc-600 mb-3" size={32} />
                  <p className="text-sm font-semibold text-white">No Active Accounts</p>
                  <p className="text-xs text-zinc-500 mt-1">You haven't opened any bank accounts within {bank.name} yet.</p>
                </div>
              )}
            </div>

            {/* Financial Action Hub (Tabbed Layout) */}
            {userData?.accounts?.length > 0 && (
              <div className="bg-gradient-to-b from-[#111116] to-[#0a0a0d] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                
                {/* Hub Tabs */}
                <div className="flex border-b border-white/5 bg-black/30 p-2 gap-1">
                  <button
                    onClick={() => setActiveTab("transfer")}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200
                      ${activeTab === "transfer" 
                        ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/5` 
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <Send size={14} /> Internal Transfer
                  </button>
                  <button
                    onClick={() => setActiveTab("onyx")}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200
                      ${activeTab === "onyx" 
                        ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/5` 
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <Activity size={14} /> Onyx Quick Pay
                  </button>
                  <button
                    onClick={() => setActiveTab("invoices")}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 relative
                      ${activeTab === "invoices" 
                        ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/5` 
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <FileText size={14} /> Bill Pay
                    {userData.pendingInvoices?.length > 0 && (
                      <span className="absolute top-2 right-4 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("loans")}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-200 relative
                      ${activeTab === "loans" 
                        ? `${theme.bgLight} ${theme.textAccent} shadow-sm border border-white/5` 
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <Landmark size={14} /> My Loans
                    {userData.loans?.some((l: any) => l.status === 'active') && (
                      <span className="absolute top-2 right-4 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    )}
                  </button>
                </div>

                {/* Hub Body */}
                <div className="p-6">
                  
                  {activeTab === "transfer" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-bold text-white text-base">Transfer Capital</h3>
                        <p className="text-zinc-400 text-xs mt-1">Send funds instantaneously between internal accounts.</p>
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
                            alert("Transfer successful!");
                            handleSearch();
                            form.reset();
                          }
                        } catch (e) {
                          alert("Service error during transfer execution.");
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
                              className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all`}
                            >
                              {userData.accounts.map((acc: any) => (
                                <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                                  {acc.accountName} ({formatMoney(acc.balance)})
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">To Checking/Savings ID</label>
                            <div className="relative">
                              <input 
                                required 
                                name="toAccountId" 
                                type="text" 
                                placeholder="acc_..." 
                                className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all font-mono`} 
                              />
                              <Wallet className="absolute left-3.5 top-3.5 text-zinc-500" size={14} />
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Amount (USD)</label>
                          <div className="relative">
                            <input 
                              required 
                              name="amount" 
                              type="number" 
                              step="0.01" 
                              min="0.01" 
                              placeholder="0.00" 
                              className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all font-mono`} 
                            />
                            <DollarSign className="absolute left-3.5 top-3.5 text-zinc-500" size={14} />
                          </div>
                        </div>

                        <button 
                          type="submit" 
                          disabled={transferPending}
                          className={`w-full ${theme.bg} hover:opacity-90 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 mt-2 shadow-lg ${theme.glow}`}
                        >
                          {transferPending ? <Loader2 className="animate-spin" size={16} /> : <Send size={14} />}
                          {transferPending ? "Processing..." : "Authorize Capital Transfer"}
                        </button>
                      </form>
                    </div>
                  )}

                  {activeTab === "onyx" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-bold text-white text-base">Onyx Quick Pay Gateway</h3>
                        <p className="text-zinc-400 text-xs mt-1">Execute secure on-the-spot checkout bills to whitelisted Slate Merchants.</p>
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
                              description: fd.get("description") || "Onyx Quick Pay from Portal"
                            })
                          });
                          const d = await onyxRes.json();
                          if (!onyxRes.ok) alert(d.error || "Onyx payment failed");
                          else {
                            alert("Onyx payment successful!");
                            handleSearch();
                            form.reset();
                          }
                        } catch (e) {
                          alert("Service error executing Onyx Quick Pay.");
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
                              className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all`}
                            >
                              {userData.accounts.map((acc: any) => (
                                <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                                  {acc.accountName} ({formatMoney(acc.balance)})
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Target Slate Merchant</label>
                            <select 
                              required 
                              name="apiKey" 
                              className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all`}
                            >
                              <option value="">Select registered merchant...</option>
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
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Amount (USD)</label>
                            <div className="relative">
                              <input 
                                required 
                                name="amount" 
                                type="number" 
                                step="0.01" 
                                min="0.01" 
                                placeholder="0.00" 
                                className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 pl-10 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all font-mono`} 
                              />
                              <DollarSign className="absolute left-3.5 top-3.5 text-zinc-500" size={14} />
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-[10px] font-bold text-zinc-400 mb-1.5 uppercase tracking-wide">Invoice Memo / Reference</label>
                            <input 
                              name="description" 
                              type="text" 
                              placeholder="e.g. Server Donation / Shop Purchase" 
                              className={`w-full bg-[#0a0a0f] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-${theme.primary} transition-all`} 
                            />
                          </div>
                        </div>

                        <button 
                          type="submit" 
                          disabled={onyxPending}
                          className="w-full bg-[#0f0f15] hover:bg-[#15151e] text-white border border-white/10 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 mt-2 shadow-lg"
                        >
                          {onyxPending ? <Loader2 className="animate-spin" size={16} /> : <Activity size={14} />}
                          {onyxPending ? "Authorizing Onyx Gateway..." : "Authorize Onyx Clearinghouse Pay"}
                        </button>
                      </form>
                    </div>
                  )}

                  {activeTab === "invoices" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-bold text-white text-base">Unsettled Billing & Invoices</h3>
                        <p className="text-zinc-400 text-xs mt-1">Pay pending charges due to utility billers or associated merchants.</p>
                      </div>

                      {userData.pendingInvoices?.length > 0 ? (
                        <div className="divide-y divide-white/5 space-y-4 pt-2">
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
                                  Billed to: <span className="font-mono text-white/80">{inv.customerAccountName}</span> • Issued by: {inv.billerName}
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
                                      if (!res.ok) alert(d.error || "Failed");
                                      else {
                                        alert("Invoice paid successfully!");
                                        handleSearch();
                                      }
                                    } catch (e) {
                                      console.error(e);
                                    } finally {
                                      setInvoicePayId(null);
                                    }
                                  }}
                                  className={`bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5`}
                                >
                                  {invoicePayId === inv.id ? <Loader2 className="animate-spin" size={12} /> : <CheckCircle2 size={12} />}
                                  {invoicePayId === inv.id ? "Settling..." : "Pay Invoice"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <CheckCircle2 className="mx-auto text-emerald-400/80 mb-3" size={28} />
                          <p className="text-sm font-semibold text-white">Account Perfectly Current</p>
                          <p className="text-xs text-zinc-500 mt-1">There are no outstanding invoices or bills linked to your accounts.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "loans" && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-bold text-white text-base">My Loans</h3>
                        <p className="text-zinc-400 text-xs mt-1">View your current active loan balances and pay them off.</p>
                      </div>

                      {(!userData.loans || userData.loans.length === 0) ? (
                        <div className="text-center py-6 border border-white/5 bg-white/[0.01] rounded-2xl">
                          <Landmark size={24} className="mx-auto text-zinc-500 mb-2" />
                          <p className="text-white/60 text-sm">No active or pending loans.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 pt-2 max-h-96 overflow-y-auto">
                          {userData.loans.map((loan: any) => (
                            <div key={loan.id} className="bg-[#0a0a0f] border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-white font-medium text-sm">Loan #{loan.id.slice(0, 8)}</h4>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    loan.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                                    loan.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-indigo-500/20 text-indigo-400'
                                  }`}>
                                    {loan.status}
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">{loan.purpose || 'No description'}</p>
                                <div className="mt-2 flex gap-4 text-xs font-mono text-zinc-500">
                                  <span>Orig: {formatMoney(loan.principalAmount)}</span>
                                  <span>APR: {(loan.interestRate / 100).toFixed(1)}%</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[10px] uppercase text-zinc-500 font-bold mb-1">Remaining Balance</p>
                                <p className="text-xl font-bold font-mono text-emerald-400">
                                  {formatMoney(loan.remainingAmount)}
                                </p>
                                {loan.status !== 'paid' && (
                                  <p className="text-[10px] text-zinc-400 mt-1">
                                    Next Pmt: {new Date(loan.nextPaymentDate).toLocaleDateString()}
                                  </p>
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

            {/* LEDGER/TRANSACTIONS HISTORY */}
            {userData?.recentTx?.length > 0 && (
              <div className="bg-[#0b0b0f] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
                
                {/* Ledger Header */}
                <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Activity className={`text-${theme.primary}`} size={18} />
                    <h3 className="font-bold text-white text-base">Account Ledger History</h3>
                  </div>
                  
                  {/* Ledger live search */}
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Filter ledger transactions..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-black/40 border border-white/10 rounded-xl py-2 px-3 pl-9 text-xs text-white focus:outline-none focus:border-zinc-500 w-full sm:w-60 transition-all font-mono"
                    />
                    <Search className="absolute left-3 top-2.5 text-zinc-500" size={13} />
                  </div>
                </div>

                {/* Ledger List */}
                <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                  <AnimatePresence>
                    {filteredTx.length > 0 ? (
                      filteredTx.map((tx: any, i: number) => {
                        const isIncoming = tx.toCityCorpId === user?.discordId;
                        return (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            key={i} 
                            className="p-5 flex items-center justify-between hover:bg-white/[0.01] transition-colors"
                          >
                            <div className="flex gap-4 items-center">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0
                                ${isIncoming ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                {isIncoming ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-semibold text-white/90 truncate max-w-[150px] sm:max-w-[280px]">
                                  {tx.description || tx.type}
                                </p>
                                <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                  {format(new Date(tx.timestamp), "MMM d, h:mm a")} • {tx.type}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`font-mono text-sm font-bold ${isIncoming ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isIncoming ? '+' : '-'}{formatMoney(tx.amount)}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })
                    ) : (
                      <div className="text-center py-12 text-zinc-500 text-xs">
                        No transactions match your search filter.
                      </div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Realistic Premium Debit/Credit Cards */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-400 tracking-wider uppercase flex items-center gap-2">
                <CreditCard size={16} className={`text-${theme.primary}`} /> Connected Cards
              </h2>
            </div>

            {userData?.cards?.length > 0 ? (
              <div className="space-y-6">
                {userData.cards.map((card: any) => {
                  const isCardLocked = card.isLocked;
                  const isCredit = card.type === 'credit';
                  const isVisible = visibleCardIds[card.id] || false;

                  return (
                    <div key={card.id} className="space-y-3">
                      
                      {/* CARD VISUAL BODY */}
                      <motion.div 
                        whileHover={{ scale: 1.01 }}
                        className={`relative rounded-3xl p-6 shadow-2xl border flex flex-col justify-between aspect-[1.586/1] overflow-hidden transition-all duration-300 select-none
                          ${isCardLocked 
                            ? "bg-gradient-to-br from-zinc-900 to-zinc-950 border-white/5 opacity-60 grayscale" 
                            : isCredit
                              ? `bg-gradient-to-br ${theme.fromGradient} to-black border-white/10`
                              : "bg-gradient-to-br from-[#1b1b22] to-[#0a0a0f] border-white/10"
                          }`}
                      >
                        {/* Realistic Card Chip Overlay */}
                        <div className="absolute right-6 top-6 w-10 h-8 rounded-lg bg-gradient-to-r from-amber-200/20 via-amber-100/30 to-amber-200/10 border border-amber-300/10 flex items-center justify-center">
                          <div className="w-6 h-5 border border-amber-300/5 rounded"></div>
                        </div>

                        {/* Holographic grid visual texture */}
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:250px_250px] mix-blend-overlay opacity-35 pointer-events-none"></div>

                        {/* Card Header */}
                        <div className="flex justify-between items-start relative z-10">
                          <div>
                            <div className="text-base font-black italic tracking-wider text-white flex items-center gap-1">
                              SLATE
                            </div>
                            <span className="text-[8px] text-zinc-400 uppercase tracking-widest mt-0.5 block">{bank.name}</span>
                          </div>
                          <span className={`text-[9px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-md bg-white/5 border border-white/5 text-white/80`}>
                            {card.type}
                          </span>
                        </div>

                        {/* Card Numbers - Centered & beautifully spaced */}
                        <div className="my-4 relative z-10">
                          <div className="font-mono text-lg sm:text-xl tracking-widest text-white/95 font-medium flex items-center justify-between drop-shadow-md select-all">
                            {formatCardNumber(card.cardNumber, isVisible)}
                          </div>
                        </div>

                        {/* Card Footer Details */}
                        <div className="flex justify-between items-end relative z-10 mt-auto pt-2 border-t border-white/5">
                          <div className="text-left">
                            <span className="text-[8px] text-zinc-500 uppercase tracking-widest block mb-0.5">Holder Account</span>
                            <span className="text-xs font-semibold text-white/95 tracking-wide block truncate max-w-[130px]">{card.accountName}</span>
                          </div>
                          <div className="flex gap-4">
                            <div>
                              <span className="text-[8px] text-zinc-500 uppercase tracking-widest block mb-0.5">Exp</span>
                              <span className="font-mono text-xs text-white/90 tracking-wider block">{card.expiryDate}</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-zinc-500 uppercase tracking-widest block mb-0.5">CVV</span>
                              <span className="font-mono text-xs text-white/90 tracking-wider block">
                                {isVisible ? card.cvv : "•••"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Lock Overlay Shield */}
                        {isCardLocked && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1.5 z-20 backdrop-blur-xs">
                            <Lock className="text-rose-400" size={24} />
                            <span className="text-[10px] tracking-widest uppercase font-bold text-rose-300">Locked / Frozen</span>
                          </div>
                        )}
                      </motion.div>

                      {/* CARD QUICK INTERACTS */}
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
                              if (res.ok) {
                                handleSearch();
                              } else {
                                alert("Failed to change card lock status.");
                              }
                            } catch (err) {
                              console.error(err);
                            } finally {
                              setLockingCardId(null);
                            }
                          }}
                          className={`flex-1 py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-all border 
                            ${isCardLocked 
                              ? `${theme.bg} hover:opacity-90 text-white border-transparent` 
                              : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/10"
                            }`}
                        >
                          {lockingCardId === card.id ? <Loader2 className="animate-spin" size={13} /> : isCardLocked ? <Unlock size={13} /> : <Lock size={13} />}
                          {lockingCardId === card.id ? "Processing..." : isCardLocked ? "Unfreeze Card" : "Freeze Card"}
                        </button>
                        
                        <button 
                          onClick={() => toggleCardVisibility(card.id)}
                          className="py-2.5 px-4 rounded-xl flex items-center justify-center text-xs font-semibold bg-white/5 hover:bg-white/10 text-white/80 border border-white/5 transition-all"
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
              <div className="bg-[#0b0b0f] border border-white/5 rounded-2xl p-6 text-center">
                <CreditCard className="mx-auto text-zinc-600 mb-3" size={28} />
                <p className="text-xs font-semibold text-white">No Connected Cards</p>
                <p className="text-[11px] text-zinc-500 mt-1">There are no physical or virtual credit/debit cards linked to this account.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Error Output */}
      {userData?.error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-center text-xs font-medium max-w-md mx-auto">
          {userData.error}
        </div>
      )}

    </div>
  );
}
