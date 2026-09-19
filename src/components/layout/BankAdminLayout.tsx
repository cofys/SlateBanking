import { useEffect, useState } from "react";
import { useParams, Routes, Route, Link, Outlet, useLocation } from "react-router-dom";
import { Activity, LayoutDashboard, Settings, LogOut, ArrowRightLeft, Users, UserSquare, BarChart3, Shield, ShieldCheck, Wrench, Code2, Users2, Landmark, Lock, CreditCard, Briefcase, Repeat, Building2, Menu, X, LogIn, FileText, Percent, Layers, Inbox, UserRound, ShieldAlert } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { ErrorBoundary } from "../ErrorBoundary";

export function BankAdminLayout() {
  const { bankId } = useParams();
  const [bank, setBank] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const location = useLocation();
  const { user, login, logout, isLoading, rememberMe, setRememberMe } = useAuth();

  useEffect(() => {
    if (!bankId) return;

    // Fetch public bank info (works for authenticated and unauthenticated visitors)
    fetch(`/api/portal/${bankId}/info`)
      .then(r => r.json())
      .then(b => {
        if (!b.error) {
          setBank(b);
          document.title = `${b.name} | Staff Portal`;
        }
      })
      .catch(err => console.error("Error loading bank info:", err));

    // Fetch settings for branding & permission check if user is logged in
    if (user) {
      fetch(`/api/banks/${bankId}/settings`)
        .then(async r => {
          if (r.status === 401 || r.status === 403) {
            setAccessDenied(true);
            return null;
          }
          return r.json();
        })
        .then(s => {
          if (s && !s.error) {
            setSettings(s);
            setAccessDenied(false);
          } else if (s && s.error) {
            setAccessDenied(true);
          }
        })
        .catch(() => {
          setAccessDenied(true);
        });
    } else {
      setAccessDenied(false);
    }
  }, [bankId, user]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (isLoading || !bank) return <div className="p-8 text-white h-screen bg-[#0a0a0c]">Loading...</div>;

  const hasCityCorp = Boolean(bank.cityCorpAppId || bank.cityCorpAuthUrl);

  if (!user || accessDenied) {
    return (
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center p-4 text-white relative overflow-hidden selection:bg-indigo-500/30">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full border border-white/10 bg-[#0e0e15]/95 backdrop-blur-xl rounded-2xl p-8 text-center space-y-6 shadow-2xl relative z-10">
          <div className="relative mx-auto w-16 h-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-2xl shadow-xl shadow-indigo-500/20">
              {bank.name.charAt(0)}
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-[#0e0e15] border border-white/10 flex items-center justify-center text-indigo-400">
              <Shield size={12} />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{bank.name} Staff Portal</h1>
            <p className="text-zinc-400 mt-1.5 text-xs font-medium">Internal Bank Management & Operations</p>
          </div>

          {!user ? (
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
                  onClick={() => login(bankId, 'discord')}
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-[#5865F2]/20 hover:shadow-[#5865F2]/30 active:scale-[0.99] cursor-pointer"
                >
                  <LogIn size={18} />
                  Sign In with Discord
                </button>

                {hasCityCorp && (
                  <button
                    onClick={() => login(bankId, 'citycorp')}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 active:scale-[0.99] cursor-pointer"
                  >
                    <LogIn size={18} />
                    Sign In with CityCorp
                  </button>
                )}
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                Authenticate with the Discord account registered in this bank's staff team list.
              </p>
            </div>
          ) : (
            <div className="space-y-5 pt-1 text-left">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <ShieldCheck size={16} /> Access Denied
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Your signed-in profile is not registered as an authorized staff member for <strong>{bank.name}</strong>.
                </p>
                <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 flex items-center gap-2.5 mt-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-xs shrink-0">
                    {user.username?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">@{user.username}</p>
                    <p className="text-[11px] font-mono text-zinc-500 truncate">{user.discordId}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-rose-400 shrink-0">
                    Unauthorized
                  </span>
                </div>
                <p className="text-zinc-400 text-[11px] pt-1 border-t border-rose-500/10">
                  Contact the bank administrator to add your Discord ID to the Staff Team list.
                </p>
              </div>
              
              <button
                onClick={logout}
                className="w-full bg-white/10 hover:bg-white/15 text-white py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-white/10 cursor-pointer"
              >
                <LogOut size={15} />
                Sign Out & Switch Account
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
             <Link to={`/portal/${bankId}`} className="text-indigo-400 hover:text-indigo-300 font-medium">
               &larr; Client Banking Portal
             </Link>
             <Link to="/portal" className="text-zinc-400 hover:text-white font-medium">
               Citizen Gateway &rarr;
             </Link>
          </div>
        </div>
      </div>
    );
  }


  // Determine dynamic colors from settings
  const themeColors: Record<string, { bg: string, text: string, textActive: string }> = {
    indigo: { bg: "from-blue-500 to-indigo-600", text: "text-indigo-400", textActive: "text-white" },
    emerald: { bg: "from-emerald-400 to-teal-600", text: "text-emerald-400", textActive: "text-white" },
    rose: { bg: "from-rose-400 to-red-600", text: "text-rose-400", textActive: "text-white" },
    amber: { bg: "from-amber-400 to-orange-600", text: "text-amber-400", textActive: "text-white" },
    zinc: { bg: "from-zinc-500 to-zinc-700", text: "text-zinc-400", textActive: "text-white" },
  };
  const activeColor = settings?.colorScheme ? (themeColors[settings.colorScheme] || themeColors.indigo) : themeColors.indigo;

  const linkGroups = [
    {
      title: "Core",
      links: [
        { name: "Dashboard", path: `/bank/${bankId}`, icon: LayoutDashboard },
        { name: "Needs attention", path: `/bank/${bankId}/queue`, icon: Inbox },
        { name: "Teller", path: `/bank/${bankId}/teller`, icon: UserRound },
        { name: "Collections", path: `/bank/${bankId}/collections`, icon: ShieldAlert },
        { name: "Analytics", path: `/bank/${bankId}/analytics`, icon: BarChart3 },
      ]
    },
    {
      title: "Ledger & CRM",
      links: [
        { name: "Customers", path: `/bank/${bankId}/customers`, icon: UserSquare },
        { name: "Accounts", path: `/bank/${bankId}/accounts`, icon: Users },
        { name: "Invoices", path: `/bank/${bankId}/invoices`, icon: ArrowRightLeft },
        { name: "Transactions", path: `/bank/${bankId}/transactions`, icon: ArrowRightLeft },
      ]
    },
    {
      title: "Products & Services",
      links: [
        settings?.enableLoans !== false && { name: "Loans", path: `/bank/${bankId}/loans`, icon: Landmark },
        settings?.enableVaults !== false && { name: "Bonds", path: `/bank/${bankId}/vaults`, icon: Lock },
        settings?.enableCards !== false && { name: "Cards", path: `/bank/${bankId}/cards`, icon: CreditCard },
        settings?.enablePayroll !== false && { name: "Payroll", path: `/bank/${bankId}/payroll`, icon: Briefcase },
        settings?.enableSubscriptions !== false && { name: "Subscriptions", path: `/bank/${bankId}/subscriptions`, icon: Repeat },
        settings?.enableEscrow !== false && { name: "Escrow", path: `/bank/${bankId}/escrow`, icon: ShieldCheck },
        settings?.enableTreasury !== false && { name: "Treasury", path: `/bank/${bankId}/treasury`, icon: BarChart3 },
        settings?.enableAccountTiers !== false && { name: "Account Tiers", path: `/bank/${bankId}/tiers`, icon: Layers },
      ].filter(Boolean) as { name: string, path: string, icon: any }[]
    },
    {
      title: "Operations",
      links: [
        { name: "Compliance", path: `/bank/${bankId}/compliance`, icon: ShieldCheck },
        { name: "Interest Engine", path: `/bank/${bankId}/interest`, icon: Percent },
        { name: "MEA Monthly Report", path: `/bank/${bankId}/mea-report`, icon: FileText },
        { name: "Clearinghouse", path: `/bank/${bankId}/clearinghouse`, icon: Building2 },
        { name: "Audit Log", path: `/bank/${bankId}/audit`, icon: ShieldCheck },
        { name: "Bulk Tools", path: `/bank/${bankId}/tools`, icon: Wrench },
        { name: "Developer API", path: `/bank/${bankId}/developer`, icon: Code2 },
      ]
    },
    {
      title: "Configuration",
      links: [
        { name: "Staff & Team", path: `/bank/${bankId}/team`, icon: Users2 },
        { name: "Financial Products", path: `/bank/${bankId}/products`, icon: Briefcase },
        { name: "Settings", path: `/bank/${bankId}/settings`, icon: Settings },
      ]
    }
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-white font-sans">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[#0d0d12] flex flex-col overflow-y-auto transform transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Logo" className="w-8 h-8 rounded object-cover" />
            ) : (
              <div className={`w-8 h-8 rounded bg-gradient-to-br ${activeColor.bg} flex items-center justify-center font-bold text-lg shrink-0`}>
                {bank.name.charAt(0)}
              </div>
            )}
            <span className="font-semibold tracking-tight truncate pr-2">{bank.name}</span>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <p className="px-6 text-[10px] text-white/40 mt-1 uppercase tracking-wider font-semibold -mt-4 mb-2">Operator Portal</p>

        <nav className="flex-1 px-4 space-y-6 mt-2 mb-6">
          {linkGroups.filter((g) => g.links.length > 0).map((group) => (
            <div key={group.title}>
               <h4 className="px-3 text-xs font-semibold text-white/30 uppercase tracking-wider mb-2">{group.title}</h4>
               <div className="space-y-1">
                 {group.links.map((link) => {
                   const isActive = location.pathname === link.path;
                   const Icon = link.icon;
                   return (
                     <Link
                       key={link.path}
                       to={link.path}
                       className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                         isActive 
                           ? "bg-white/10 text-white font-medium" 
                           : "text-white/60 hover:text-white hover:bg-white/5"
                       }`}
                     >
                       <Icon size={16} className={isActive ? activeColor.text : ""} />
                       {link.name}
                     </Link>
                   );
                 })}
               </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 sticky bottom-0 bg-[#0d0d12]">
          <Link to="/banks" className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors">
            <LogOut size={14} />
            Back to Global Admin
          </Link>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        <header className="h-14 md:h-16 border-b border-white/10 flex items-center px-4 md:px-8 bg-[#0a0a0c] sticky top-0 z-30 shrink-0">
          <button className="md:hidden mr-4 text-white/60 hover:text-white" onClick={() => setMobileMenuOpen(true)}>
            <Menu size={20} />
          </button>
          <h2 className="text-sm font-medium text-white/80 truncate">
            {linkGroups.flatMap(g => g.links).find((l) => l.path === location.pathname)?.name || "Dashboard"}
          </h2>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <ErrorBoundary><Outlet context={{ bank }} /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
