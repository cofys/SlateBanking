import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Building2, Activity, Shield, Settings, Menu, X, LogIn, Eye, ShieldAlert, LogOut, ArrowRight, UserCheck } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";

export function DashboardLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, login, logout, isLoading, checkSession, rememberMe, setRememberMe } = useAuth();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: "Overview", path: "/", icon: Activity },
    { name: "Network Health", path: "/health", icon: Eye },
    { name: "Bank Instances", path: "/banks", icon: Building2 },
    { name: "Oversight", path: "/oversight", icon: ShieldAlert },
    { name: "Global Transactions", path: "/transactions", icon: Activity },
    { name: "Onyx Network (PSP)", path: "/onyx", icon: Shield },
    { name: "CityCorp Network", path: "/citycorp", icon: Settings },
    { name: "Security Suite", path: "/security", icon: ShieldAlert },
  ];

  if (isLoading) {
    return <div className="h-screen bg-[#0a0a0c] flex items-center justify-center text-white/50">Loading...</div>;
  }

  if (!user || !user.isGlobalAdmin) {
    return (
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500/30">
        {/* Subtle Ambient Radial Backdrops */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-purple-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full border border-white/10 bg-[#0e0e15]/95 backdrop-blur-xl rounded-2xl p-8 text-center space-y-6 shadow-2xl relative z-10">
          {/* Logo Mark */}
          <div className="relative mx-auto w-16 h-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-indigo-500/25">
              S
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-[#0e0e15] border border-white/10 flex items-center justify-center text-indigo-400">
              <Shield size={12} />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Slate Control Center</h1>
            <p className="text-zinc-400 mt-1.5 text-xs font-medium">
              Global Platform & Clearinghouse Administration
            </p>
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
                  onClick={() => login(undefined, 'discord')}
                  className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-[#5865F2]/20 hover:shadow-[#5865F2]/30 active:scale-[0.99] cursor-pointer"
                >
                  <LogIn size={18} />
                  Sign In with Discord
                </button>

                <button
                  onClick={() => login(undefined, 'citycorp')}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-[0.99] cursor-pointer"
                >
                  <LogIn size={18} />
                  Sign In with CityCorp
                </button>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
                Restricted access. Only registered global administrators may access clearinghouse controls.
              </p>
            </div>
          ) : (
            <div className="space-y-5 pt-1 text-left">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                  <ShieldAlert size={16} />
                  Access Denied
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Your signed-in account is not listed in the global administrators registry.
                </p>
                <div className="bg-black/30 border border-white/5 rounded-lg p-2.5 flex items-center gap-2.5 mt-2">
                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-xs shrink-0">
                    {user.username?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">@{user.username}</p>
                    <p className="text-[11px] font-mono text-zinc-500 truncate">{user.discordId}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0">
                    Non-Admin
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={logout}
                  className="w-full bg-white/10 hover:bg-white/15 text-white py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-white/10 cursor-pointer"
                >
                  <LogOut size={15} />
                  Sign Out & Switch Account
                </button>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-white/10 flex items-center justify-center">
            <Link 
              to="/portal" 
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 transition-colors"
            >
              Return to Citizen Gateway <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-white">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 border-r border-white/10 bg-[#0d0d12] flex flex-col transform transition-transform duration-200 ease-in-out
        md:relative md:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">
              S
            </div>
            <span className="font-semibold text-lg tracking-tight">Slate</span>
          </div>
          <button className="md:hidden text-white/50 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <p className="px-6 text-xs text-white/50 uppercase tracking-wider font-semibold -mt-4 mb-4">SaaS Platform</p>

        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-white/10 text-white font-medium"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={18} className={isActive ? "text-indigo-400" : ""} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-white/40 flex flex-col gap-4">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                {user.avatarUrl ? (
                   <img src={user.avatarUrl} alt="Avatar" className="w-6 h-6 rounded-full bg-white/10" />
                ) : (
                   <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs text-white font-bold">{user.username[0].toUpperCase()}</div>
                )}
                <span className="truncate max-w-[120px]">@{user.username}</span>
             </div>
             <button onClick={logout} className="hover:text-white transition-colors" title="Logout">
                <LogIn size={14} className="rotate-180" />
             </button>
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/portal" className="text-indigo-400 hover:text-indigo-300 font-medium">Citizen Gateway &rarr;</Link>
            <Link to="/docs" className="text-emerald-400 hover:text-emerald-300 font-medium text-sm">Developer API &rarr;</Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden relative w-full min-w-0">
        <header className="h-14 md:h-16 border-b border-white/10 flex items-center justify-between px-4 md:px-8 bg-[#0a0a0c] sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-white/60 hover:text-white" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-medium text-white/80 truncate">
              {navItems.find((n) => n.path === location.pathname)?.name || "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/settings" className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <Settings size={14} className="text-white/60" />
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 md:p-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
