import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Building2, Activity, Shield, Settings, Menu, X, LogIn, Eye, ShieldAlert, LogOut, ArrowRight, BookOpen } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { AuthScreen, BrandMark, GhostButton, PrimaryButton, ScreenLoader } from "../ui/chrome";
import { motion, AnimatePresence } from "motion/react";

export function DashboardLayout() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, login, logout, isLoading, rememberMe, setRememberMe } = useAuth();

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { name: "Overview", path: "/", icon: Activity },
    { name: "Network Health", path: "/health", icon: Eye },
    { name: "Bank Instances", path: "/banks", icon: Building2 },
    { name: "Oversight", path: "/oversight", icon: ShieldAlert },
    { name: "Global Transactions", path: "/transactions", icon: Activity },
    { name: "Onyx Network", path: "/onyx", icon: Shield },
    { name: "CityCorp", path: "/citycorp", icon: Settings },
    { name: "Security", path: "/security", icon: ShieldAlert },
  ];

  if (isLoading) return <ScreenLoader label="Authenticating" />;

  if (!user || !user.isGlobalAdmin) {
    return (
      <AuthScreen
        mark={<BrandMark letter="S" color="#c5cad3" />}
        title="Slate Control"
        subtitle="Global platform and clearinghouse administration"
        footer={
          <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <Link to="/portal" className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: "var(--fg-muted)" }}>
              Customer portal <ArrowRight size={12} />
            </Link>
          </div>
        }
      >
        {!user ? (
          <div className="space-y-4">
            <label className="flex items-center justify-center gap-2 cursor-pointer text-xs select-none" style={{ color: "var(--fg-muted)" }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              Remember this device
            </label>
            <PrimaryButton onClick={() => login(undefined, "citycorp")}>
              <LogIn size={16} /> Sign in with CityCorp
            </PrimaryButton>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
              Restricted. Only listed global administrators can open clearinghouse controls.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-left">
            <div className="rounded-xl p-4 space-y-2 border" style={{ background: "color-mix(in oklab, var(--danger) 10%, transparent)", borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)" }}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--danger)" }}>
                <ShieldAlert size={14} /> Access denied
              </div>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                This account is not in the global administrators registry.
              </p>
              <div className="flex items-center gap-2.5 mt-2 rounded-lg p-2.5" style={{ background: "color-mix(in oklab, var(--fg) 4%, transparent)" }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "var(--bg-subtle)" }}>
                  {user.username?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">@{user.username}</p>
                  <p className="text-[11px] font-mono truncate" style={{ color: "var(--fg-subtle)" }}>{user.discordId}</p>
                </div>
              </div>
            </div>
            <GhostButton onClick={logout}>
              <LogOut size={15} /> Sign out
            </GhostButton>
          </div>
        )}
      </AuthScreen>
    );
  }

  const current = navItems.find((n) => n.path === location.pathname);

  return (
    <div className="flex h-screen" style={{ background: "var(--bg)", color: "var(--fg)" }}>
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col md:relative md:translate-x-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--bg-elevated)", borderRight: "1px solid var(--border)" }}
      >
        <div className="px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
              S
            </div>
            <div>
              <p className="font-semibold tracking-tight leading-none">Slate</p>
              <p className="text-[10px] uppercase tracking-[0.14em] mt-1" style={{ color: "var(--fg-subtle)" }}>Platform</p>
            </div>
          </div>
          <button className="md:hidden p-2" style={{ color: "var(--fg-subtle)" }} onClick={() => setMobileMenuOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={
                  isActive
                    ? { background: "color-mix(in oklab, var(--fg) 8%, transparent)", color: "var(--fg)", fontWeight: 550 }
                    : { color: "var(--fg-muted)" }
                }
              >
                <Icon size={16} style={{ color: isActive ? "var(--accent)" : "var(--fg-subtle)" }} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t space-y-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold" style={{ background: "var(--bg-subtle)" }}>
                  {user.username[0].toUpperCase()}
                </div>
              )}
              <span className="truncate text-xs max-w-[120px]">@{user.username}</span>
            </div>
            <button onClick={logout} className="p-2" title="Sign out" style={{ color: "var(--fg-subtle)" }}>
              <LogOut size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <Link to="/portal" className="font-medium" style={{ color: "var(--fg-muted)" }}>Customer portal</Link>
            <Link to="/docs" className="font-medium inline-flex items-center gap-1.5" style={{ color: "var(--fg-subtle)" }}>
              <BookOpen size={12} /> Developer API
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 md:h-16 flex items-center justify-between px-4 md:px-8 shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(true)} style={{ color: "var(--fg-muted)" }}>
              <Menu size={18} />
            </button>
            <h2 className="text-sm font-medium truncate">{current?.name || "Dashboard"}</h2>
          </div>
          <Link to="/settings" className="w-9 h-9 rounded-full flex items-center justify-center border" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--fg) 4%, transparent)" }}>
            <Settings size={14} style={{ color: "var(--fg-muted)" }} />
          </Link>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 md:p-8 min-w-0 page-enter" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
