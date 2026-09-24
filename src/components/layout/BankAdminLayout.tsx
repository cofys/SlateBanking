import { useEffect, useState } from "react";
import { useParams, Link, Outlet, useLocation } from "react-router-dom";
import { Activity, LayoutDashboard, Settings, LogOut, ArrowRightLeft, Users, UserSquare, BarChart3, Shield, ShieldCheck, Wrench, Code2, Users2, Landmark, Lock, CreditCard, Briefcase, Repeat, Building2, Menu, X, LogIn, FileText, Percent, Layers, Inbox, UserRound, ShieldAlert, ArrowLeft, LifeBuoy } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { ErrorBoundary } from "../ErrorBoundary";
import { AuthScreen, BrandMark, GhostButton, PrimaryButton, ScreenLoader } from "../ui/chrome";
import { accentFor, accentForeground, schemeMeta } from "../../lib/theme";
import { motion, AnimatePresence } from "motion/react";

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
    fetch(`/api/portal/${bankId}/info`)
      .then((r) => r.json())
      .then((b) => {
        if (!b.error) {
          setBank(b);
          document.title = `${b.name} | Staff`;
        }
      })
      .catch(() => {});

    if (user) {
      fetch(`/api/banks/${bankId}/settings`)
        .then(async (r) => {
          if (r.status === 401 || r.status === 403) {
            setAccessDenied(true);
            return null;
          }
          return r.json();
        })
        .then((s) => {
          if (s && !s.error) {
            setSettings(s);
            setAccessDenied(false);
          } else if (s && s.error) {
            setAccessDenied(true);
          }
        })
        .catch(() => setAccessDenied(true));
    } else {
      setAccessDenied(false);
    }
  }, [bankId, user]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (isLoading || !bank) return <ScreenLoader label="Opening staff desk" />;

  const accent = accentFor({
    brandingColor: settings?.brandingColor || bank.brandingColor,
    colorScheme: settings?.colorScheme,
  });
  const accentFg = accentForeground(accent);

  if (!user || accessDenied) {
    return (
      <AuthScreen
        mark={<BrandMark letter={bank.name} color={accent} />}
        title={`${bank.name} staff`}
        subtitle="Internal operations desk"
        footer={
          <Link to={`/portal/${bankId}`} className="text-xs font-medium inline-flex items-center gap-1.5" style={{ color: "var(--fg-muted)" }}>
            <ArrowLeft size={12} /> Customer portal
          </Link>
        }
      >
        {!user ? (
          <div className="space-y-4">
            <label className="flex items-center justify-center gap-2 cursor-pointer text-xs select-none" style={{ color: "var(--fg-muted)" }}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="w-4 h-4 rounded" />
              Remember this device
            </label>
            <PrimaryButton color={accent} onClick={() => login(bankId, "citycorp")}>
              <LogIn size={16} /> Sign in with CityCorp
            </PrimaryButton>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
              Staff access is granted to players listed on this bank's team.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-left">
            <div className="rounded-xl p-4 space-y-2 border" style={{ background: "color-mix(in oklab, var(--danger) 10%, transparent)", borderColor: "color-mix(in oklab, var(--danger) 25%, transparent)" }}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--danger)" }}>
                <ShieldCheck size={14} /> Access denied
              </div>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                You are not on the staff team for {bank.name}.
              </p>
            </div>
            <GhostButton onClick={logout}>
              <LogOut size={15} /> Sign out
            </GhostButton>
          </div>
        )}
      </AuthScreen>
    );
  }

  const scheme = schemeMeta(settings?.colorScheme);

  const linkGroups = [
    {
      title: "Core",
      links: [
        { name: "Dashboard", path: `/bank/${bankId}`, icon: LayoutDashboard },
        { name: "Needs attention", path: `/bank/${bankId}/queue`, icon: Inbox },
        { name: "Support Desk", path: `/bank/${bankId}/tickets`, icon: LifeBuoy },
        { name: "Teller", path: `/bank/${bankId}/teller`, icon: UserRound },
        { name: "Collections", path: `/bank/${bankId}/collections`, icon: ShieldAlert },
        { name: "Analytics", path: `/bank/${bankId}/analytics`, icon: BarChart3 },
      ],
    },
    {
      title: "Ledger",
      links: [
        { name: "Customers", path: `/bank/${bankId}/customers`, icon: UserSquare },
        { name: "Accounts", path: `/bank/${bankId}/accounts`, icon: Users },
        { name: "Invoices", path: `/bank/${bankId}/invoices`, icon: ArrowRightLeft },
        { name: "Transactions", path: `/bank/${bankId}/transactions`, icon: ArrowRightLeft },
      ],
    },
    {
      title: "Products",
      links: [
        settings?.enableLoans !== false && { name: "Loans", path: `/bank/${bankId}/loans`, icon: Landmark },
        settings?.enableVaults !== false && { name: "Bonds", path: `/bank/${bankId}/vaults`, icon: Lock },
        settings?.enableCards !== false && { name: "Cards", path: `/bank/${bankId}/cards`, icon: CreditCard },
        settings?.enablePayroll !== false && { name: "Payroll", path: `/bank/${bankId}/payroll`, icon: Briefcase },
        settings?.enableSubscriptions !== false && { name: "Subscriptions", path: `/bank/${bankId}/subscriptions`, icon: Repeat },
        settings?.enableEscrow !== false && { name: "Escrow", path: `/bank/${bankId}/escrow`, icon: ShieldCheck },
        settings?.enableTreasury !== false && { name: "Treasury", path: `/bank/${bankId}/treasury`, icon: BarChart3 },
        settings?.enableAccountTiers !== false && { name: "Account Tiers", path: `/bank/${bankId}/tiers`, icon: Layers },
      ].filter(Boolean) as { name: string; path: string; icon: any }[],
    },
    {
      title: "Operations",
      links: [
        { name: "Compliance", path: `/bank/${bankId}/compliance`, icon: ShieldCheck },
        { name: "Interest", path: `/bank/${bankId}/interest`, icon: Percent },
        { name: "MEA Report", path: `/bank/${bankId}/mea-report`, icon: FileText },
        { name: "Clearinghouse", path: `/bank/${bankId}/clearinghouse`, icon: Building2 },
        { name: "Audit Log", path: `/bank/${bankId}/audit`, icon: Shield },
        { name: "Bulk Tools", path: `/bank/${bankId}/tools`, icon: Wrench },
        { name: "Developer API", path: `/bank/${bankId}/developer`, icon: Code2 },
      ],
    },
    {
      title: "Configuration",
      links: [
        { name: "Staff & Team", path: `/bank/${bankId}/team`, icon: Users2 },
        { name: "Products", path: `/bank/${bankId}/products`, icon: Briefcase },
        { name: "Settings", path: `/bank/${bankId}/settings`, icon: Settings },
      ],
    },
  ];

  const pageName = linkGroups.flatMap((g) => g.links).find((l) => l.path === location.pathname)?.name || "Dashboard";

  const activeLogo = (settings?.logoUrl || bank?.logoUrl || "").trim();

  return (
    <div
      className="flex h-screen font-sans"
      style={{
        background: "var(--bg)",
        color: "var(--fg)",
        ["--accent" as any]: accent,
        ["--accent-fg" as any]: accentFg,
      }}
    >
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
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col overflow-y-auto md:relative md:translate-x-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{ background: "var(--bg-elevated)", borderRight: "1px solid var(--border)" }}
      >
        <div className="px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeLogo ? (
              <img src={activeLogo} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-lg object-contain border p-0.5 shrink-0" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }} />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold shrink-0" style={{ background: accent, color: accentFg }}>
                {bank.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold tracking-tight truncate leading-tight">{bank.name}</p>
              <p className="text-[10px] uppercase tracking-[0.12em] truncate" style={{ color: "var(--fg-subtle)" }}>
                {scheme.label} · Staff
              </p>
            </div>
          </div>
          <button className="md:hidden p-2 shrink-0" onClick={() => setMobileMenuOpen(false)} style={{ color: "var(--fg-subtle)" }}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-5 mb-4">
          {linkGroups.filter((g) => g.links.length > 0).map((group) => (
            <div key={group.title}>
              <h4 className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--fg-subtle)" }}>
                {group.title}
              </h4>
              <div className="space-y-0.5">
                {group.links.map((link) => {
                  const isActive = location.pathname === link.path;
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors"
                      style={
                        isActive
                          ? { background: "color-mix(in oklab, var(--accent) 16%, transparent)", color: "var(--fg)", fontWeight: 550 }
                          : { color: "var(--fg-muted)" }
                      }
                    >
                      <Icon size={15} style={{ color: isActive ? accent : "var(--fg-subtle)" }} />
                      {link.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t sticky bottom-0" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <Link to="/banks" className="flex items-center gap-2 text-xs px-2 py-2 rounded-lg" style={{ color: "var(--fg-subtle)" }}>
            <LogOut size={13} /> Platform home
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 md:h-16 flex items-center justify-between px-4 md:px-8 shrink-0" style={{ borderBottom: "1px solid var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <button className="md:hidden p-1.5 -ml-1 text-slate-400 hover:text-white shrink-0" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="md:hidden flex items-center gap-2 min-w-0">
              {activeLogo ? (
                <img src={activeLogo} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-lg object-contain border p-0.5 shrink-0" style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }} />
              ) : (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center font-semibold text-xs shrink-0" style={{ background: accent, color: accentFg }}>
                  {bank.name.charAt(0)}
                </div>
              )}
              <span className="font-semibold text-xs truncate max-w-[130px]">{bank.name}</span>
            </div>
            <h2 className="hidden md:block text-sm font-medium truncate">{pageName}</h2>
          </div>
          <div className="md:hidden">
            <h2 className="text-xs font-semibold text-white/70 truncate">{pageName}</h2>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 page-enter" key={location.pathname}>
          <ErrorBoundary>
            <Outlet context={{ bank: { ...bank, settings, brandingColor: accent } }} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
