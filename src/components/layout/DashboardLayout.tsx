import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Building2, Activity, Shield, Settings, Menu, X, LogIn } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";

export function DashboardLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, login, logout, isLoading, checkSession, rememberMe, setRememberMe } = useAuth();
  const [loggingIn, setLoggingIn] = useState(false);

  const handleDemoAdminLogin = async () => {
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/demo-admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user?.username || "GlobalOperator", rememberMe })
      });
      if (res.ok) {
        await checkSession();
      } else {
        alert("Failed to initialize Operator session.");
      }
    } catch (e) {
      console.error(e);
      alert("Error logging in as Operator.");
    } finally {
      setLoggingIn(false);
    }
  };

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: "Overview", path: "/", icon: Activity },
    { name: "Bank Instances", path: "/banks", icon: Building2 },
    { name: "Global Transactions", path: "/transactions", icon: Activity },
    { name: "Onyx Network (PSP)", path: "/onyx", icon: Shield },
    { name: "CityCorp Network", path: "/citycorp", icon: Settings },
  ];

  if (isLoading) {
    return <div className="h-screen bg-[#0a0a0c] flex items-center justify-center text-white/50">Loading...</div>;
  }

  if (!user || !user.isGlobalAdmin) {
    return (
      <div className="h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="max-w-md w-full border border-white/10 bg-[#0d0d12] rounded-xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-3xl mx-auto shadow-lg shadow-indigo-500/20 text-white">
            S
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Slate Control Center</h1>
            <p className="text-white/50 mt-2 text-sm">Global Administration Access Restricted</p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center justify-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 py-1 select-none transition-colors">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)} 
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 cursor-pointer"
              />
              <span>Remember me on this device</span>
            </label>

            <button
              onClick={() => login(undefined, 'discord')}
              className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#5865F2]/20 text-sm"
            >
              <LogIn size={18} />
              Login with Discord (Global Admin)
            </button>

            <button
              onClick={() => login(undefined, 'citycorp')}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 text-sm"
            >
              <LogIn size={18} />
              Login with CityCorp
            </button>

            <button
              onClick={handleDemoAdminLogin}
              disabled={loggingIn}
              className="w-full bg-white/5 hover:bg-white/10 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 py-2.5 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-xs"
            >
              <Shield size={14} />
              {loggingIn ? "Authorizing Operator..." : "Operator Quick Access (Elevate Session)"}
            </button>
          </div>
          
          {user && !user.isGlobalAdmin && (
            <p className="text-red-400 text-xs mt-4 bg-red-400/10 p-3 rounded-xl border border-red-400/20 text-left">
              <strong>Access Denied:</strong> Your active profile (<span className="font-mono">@{user.username}</span>) is not listed in the global_admins table. Use Operator Quick Access to elevate your session or log in with a registered Discord account.
            </p>
          )}

          <div className="pt-6 border-t border-white/10">
             <Link to="/portal" className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">Return to Citizen Gateway &rarr;</Link>
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
      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
