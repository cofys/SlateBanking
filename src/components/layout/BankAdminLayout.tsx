import { useEffect, useState } from "react";
import { useParams, Routes, Route, Link, Outlet, useLocation } from "react-router-dom";
import { Activity, LayoutDashboard, Settings, LogOut, ArrowRightLeft, Users, UserSquare, BarChart3, ShieldCheck, Wrench, Code2, Users2, Landmark, Lock, CreditCard, Briefcase, Repeat, Building2, Menu, X, LogIn } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";

export function BankAdminLayout() {
  const { bankId } = useParams();
  const [bank, setBank] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const location = useLocation();
  const { user, login, isLoading } = useAuth();

  useEffect(() => {
    fetch(`/api/banks`)
      .then(r => r.json())
      .then(banks => {
        const b = banks.find((bx: any) => bx.id === bankId);
        setBank(b);
      });
      
    // Fetch settings for branding
    fetch(`/api/banks/${bankId}/settings`)
       .then(async r => {
          if (r.status === 401 || r.status === 403) {
             setAccessDenied(true);
             return null;
          }
          return r.json()
       })
       .then(s => {
          if (s) setSettings(s);
       })
       .catch(() => {});
  }, [bankId]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (isLoading || !bank) return <div className="p-8 text-white h-screen bg-[#0a0a0c]">Loading...</div>;

  if (!user || accessDenied) {
    return (
      <div className="h-screen bg-[#0a0a0c] flex items-center justify-center p-4 text-white">
        <div className="max-w-md w-full border border-white/10 bg-[#0d0d12] rounded-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-3xl mx-auto shadow-lg shadow-indigo-500/20">
            {bank.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{bank.name} Portal</h1>
            <p className="text-white/50 mt-2 text-sm">Staff Authentication Required</p>
          </div>

          {!user ? (
            <button
              onClick={login}
              className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#5865F2]/20"
            >
              <LogIn size={18} />
              Login with Discord
            </button>
          ) : (
            <div className="text-red-400 text-sm mt-4 bg-red-400/10 p-4 rounded-md border border-red-400/20">
              Access denied: Your Discord account (@{user.username}) does not have staff privileges for {bank.name}.
            </div>
          )}

          <div className="pt-6 border-t border-white/10">
             <Link to="/portal" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">Return to Citizen Gateway &rarr;</Link>
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
        settings?.enableVaults !== false && { name: "Vaults", path: `/bank/${bankId}/vaults`, icon: Lock },
        settings?.enableCards !== false && { name: "Cards", path: `/bank/${bankId}/cards`, icon: CreditCard },
        settings?.enablePayroll !== false && { name: "Payroll", path: `/bank/${bankId}/payroll`, icon: Briefcase },
        settings?.enableSubscriptions !== false && { name: "Subscriptions", path: `/bank/${bankId}/subscriptions`, icon: Repeat },
        settings?.enableEscrow !== false && { name: "Escrow", path: `/bank/${bankId}/escrow`, icon: ShieldCheck },
        settings?.enableTreasury !== false && { name: "Treasury", path: `/bank/${bankId}/treasury`, icon: BarChart3 },
      ].filter(Boolean) as { name: string, path: string, icon: any }[]
    },
    {
      title: "Operations",
      links: [
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
          <Outlet context={{ bank }} />
        </main>
      </div>
    </div>
  );
}
