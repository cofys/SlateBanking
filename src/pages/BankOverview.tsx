import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, RefreshCw, Server, ExternalLink, Users, Wallet, Activity, ShieldAlert, Landmark, FileText, Plus, ShieldCheck } from "lucide-react";
import { formatMoney, formatNumber } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { PageIntro, StatCard } from "../components/ui/chrome";

export function BankOverview() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const [staffRole, setStaffRole] = useState<string | null>(null);

  useEffect(() => {
    if (bank?.id) {
       fetch(`/api/banks/${bank.id}/team`)
         .then(res => res.ok ? res.json() : [])
         .then(data => {
            const me = (Array.isArray(data) ? data : []).find((s: any) => s.discordId === user?.discordId);
            if (me) setStaffRole(me.role);
         })
         .catch(() => {});

       Promise.all([
          fetch(`/api/banks/${bank.id}/customers`).then(r => r.ok ? r.json() : []).catch(() => []),
          fetch(`/api/banks/${bank.id}/loans`).then(r => r.ok ? r.json() : []).catch(() => []),
          fetch(`/api/banks/${bank.id}/compliance/frozen`).then(r => r.ok ? r.json() : []).catch(() => [])
       ]).then(([customers, loansData, frozenData]) => {
          const custArray = Array.isArray(customers) ? customers : [];
          const loansArray = Array.isArray(loansData) ? loansData : [];
          const frozenArray = Array.isArray(frozenData) ? frozenData : [];
          
          const totalBalance = custArray.reduce((sum: number, c: any) => sum + c.totalBalance, 0);
          const totalAccounts = custArray.reduce((sum: number, c: any) => sum + c.accountCount, 0);
          
          const pendingLoans = loansArray.filter(l => l.status === "pending").length;
          const delinquentLoans = loansArray.filter(l => l.isDelinquent || l.status === "defaulted").length;

          setStats({
            totalBalance,
            totalAccounts,
            pendingLoans,
            delinquentLoans,
            frozenCount: frozenArray.length,
            topCustomers: custArray.sort((a: any, b: any) => b.totalBalance - a.totalBalance).slice(0, 5)
          });
          setLoading(false);
       });
    }
  }, [bank, user]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3" style={{ color: "var(--fg-subtle)" }}>
      <RefreshCw className="animate-spin" size={22} />
      <p className="text-xs uppercase tracking-wide">Synchronizing desk</p>
    </div>
  );

  const atRisk = (stats?.delinquentLoans > 0 || stats?.frozenCount > 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 page-enter pb-12">
      <PageIntro
        kicker={staffRole || "Operations"}
        title={bank.name}
        description={`Welcome back, ${user?.username}. Same-bank ledger, queues, and client books.`}
        actions={
          <>
            <Link
              to={`/bank/${bank.id}/tools`}
              className="min-h-11 px-4 py-2.5 text-sm font-semibold border flex items-center gap-2"
              style={{ borderColor: "var(--border)", borderRadius: "var(--radius-md)", background: "color-mix(in oklab, var(--fg) 5%, transparent)" }}
            >
              Bank settings
            </Link>
            <a
              href={bank.customDomain ? `https://${bank.customDomain}` : `/portal/${bank.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn-accent min-h-11 px-5 py-2.5 text-sm flex items-center gap-2"
            >
              Client portal <ExternalLink size={14} />
            </a>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total liquidity"
          value={formatMoney(stats?.totalBalance || 0)}
          hint="Client deposits"
          icon={<Wallet size={16} />}
          delay={0}
        />
        <StatCard
          label="Active accounts"
          value={formatNumber(stats?.totalAccounts || 0)}
          hint="Portfolios managed"
          icon={<Users size={16} />}
          delay={0.05}
        />
        <Link to={`/bank/${bank.id}/loans`} className="block">
          <StatCard
            label="Loan pipeline"
            value={String(stats?.pendingLoans || 0)}
            hint="Review applications"
            icon={<Landmark size={16} />}
            delay={0.1}
          />
        </Link>
        <Link to={`/bank/${bank.id}/compliance`} className="block">
          <StatCard
            label="Risk & compliance"
            value={`${stats?.delinquentLoans || 0} / ${stats?.frozenCount || 0}`}
            hint={atRisk ? "Bad debt / frozen" : "Books are clean"}
            icon={atRisk ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
            delay={0.15}
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="surface overflow-hidden">
            <div className="p-5 border-b" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
              <h3 className="text-sm font-semibold uppercase tracking-wider">Quick actions</h3>
            </div>
            <div className="p-3 grid grid-cols-1 gap-1">
              <Link to={`/bank/${bank.id}/accounts`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group min-h-11">
                <div className="w-8 h-8 rounded-lg chip-accent flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold">New account</p>
                  <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>Provision for a client</p>
                </div>
              </Link>
              <Link to={`/bank/${bank.id}/transactions`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group min-h-11">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in oklab, var(--ok) 12%, transparent)", color: "var(--ok)" }}>
                  <ArrowUpRight size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Record transfer</p>
                  <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>Manual ledger entry</p>
                </div>
              </Link>
              <Link to={`/bank/${bank.id}/loans`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group min-h-11">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)", color: "var(--warn)" }}>
                  <FileText size={16} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Underwrite loan</p>
                  <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>Issue credit line</p>
                </div>
              </Link>
            </div>
          </div>

          <div className="surface p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider mb-5 flex items-center gap-2">
              <Server size={16} style={{ color: "var(--accent)" }} /> Infrastructure
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                  <Activity size={14} /> Discord gateway
                </div>
                {bank.status === "online" ? (
                  <span className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 12%, transparent)" }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--ok)" }} /> Online
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ color: "var(--danger)", background: "color-mix(in oklab, var(--danger) 12%, transparent)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--danger)" }} /> Offline
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
                  <Server size={14} /> Core ledger
                </div>
                <span className="flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 12%, transparent)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--ok)" }} /> Active
                </span>
              </div>
              <div className="pt-3 border-t mt-2" style={{ borderColor: "var(--border)" }}>
                <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--fg-subtle)" }}>Instance {bank.id}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 surface overflow-hidden flex flex-col">
          <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: "var(--border)", background: "var(--bg-subtle)" }}>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider">Top portfolios</h3>
              <p className="text-[11px] font-medium mt-0.5" style={{ color: "var(--fg-subtle)" }}>Highest value books under management</p>
            </div>
            <Link to={`/bank/${bank.id}/customers`} className="text-xs font-semibold flex items-center gap-1 min-h-11" style={{ color: "var(--accent)" }}>
              Directory <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y flex-1" style={{ borderColor: "var(--border)" }}>
            {stats?.topCustomers?.length > 0 ? (
              stats.topCustomers.map((customer: any, idx: number) => (
                <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg font-mono flex items-center justify-center text-xs font-semibold border" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)", color: "var(--fg-muted)" }}>
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        {customer.mcUsername || customer.discordId}
                      </p>
                      <p className="text-[11px] font-medium" style={{ color: "var(--fg-subtle)" }}>
                        {customer.accountCount} {customer.accountCount === 1 ? "account" : "accounts"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right font-semibold font-mono text-base tracking-tight num" style={{ color: "var(--ok)" }}>
                    {formatMoney(customer.totalBalance)}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-16 flex flex-col items-center justify-center text-center">
                <Users size={32} className="mb-3" style={{ color: "var(--fg-subtle)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>No customer profiles yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
