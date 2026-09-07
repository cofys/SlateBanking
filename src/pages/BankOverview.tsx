import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, RefreshCw, Server, ExternalLink, Users, Wallet, Activity, AlertTriangle, ShieldAlert, Landmark, FileText, Plus, ShieldCheck } from "lucide-react";
import { formatMoney, formatNumber } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { motion } from "motion/react";

export function BankOverview() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const [staffRole, setStaffRole] = useState<string | null>(null);

  useEffect(() => {
    if (bank?.id) {
       // Check user role
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
    <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
      <RefreshCw className="animate-spin" size={24} />
      <p>Synchronizing dashboard...</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              {bank.name} Dashboard
            </span>
            {staffRole && (
               <span className="text-[10px] uppercase tracking-widest font-bold bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full border border-indigo-500/30">
                 {staffRole}
               </span>
            )}
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Welcome back, {user?.username}. Manage your institutional operations securely on Slate.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Link
            to={`/bank/${bank.id}/tools`}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-sm"
          >
            Bank Settings
          </Link>
          <a 
            href={bank.customDomain ? `https://${bank.customDomain}` : `/portal/${bank.id}`}
            target="_blank"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            Client Portal <ExternalLink size={15} />
          </a>
        </div>
      </header>
      
      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liquidity */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-colors shadow-xl"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors pointer-events-none" />
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total Liquidity</h3>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Wallet size={16} />
              </div>
            </div>
            <div>
              <div className="text-2xl lg:text-3xl font-black tracking-tight text-white font-mono">{formatMoney(stats?.totalBalance || 0)}</div>
              <p className="text-[11px] text-zinc-500 mt-1 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Client Deposits
              </p>
            </div>
          </div>
        </motion.div>

        {/* Active Accounts */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-indigo-500/30 transition-colors shadow-xl"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none" />
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Active Accounts</h3>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Users size={16} />
              </div>
            </div>
            <div>
              <div className="text-2xl lg:text-3xl font-black tracking-tight text-white font-sans">{formatNumber(stats?.totalAccounts || 0)}</div>
              <p className="text-[11px] text-zinc-500 mt-1 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Portfolios Managed
              </p>
            </div>
          </div>
        </motion.div>

        {/* Loan Underwriting Pipeline */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-blue-500/30 transition-colors shadow-xl flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Loan Pipeline</h3>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Landmark size={16} />
            </div>
          </div>
          <div>
            <div className="flex items-end gap-3">
              <div className="text-2xl lg:text-3xl font-black tracking-tight text-white">{stats?.pendingLoans || 0}</div>
              <span className="text-sm font-medium text-zinc-500 mb-1">Pending</span>
            </div>
            <Link to={`/bank/${bank.id}/loans`} className="text-[11px] text-blue-400 hover:text-blue-300 mt-1.5 font-bold flex items-center gap-1 inline-flex transition-colors">
              Review Applications <ArrowRight size={10} />
            </Link>
          </div>
        </motion.div>

        {/* Risk & Compliance Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className={`bg-gradient-to-br from-[#0b0b12] to-[#11111a] border ${
            (stats?.delinquentLoans > 0 || stats?.frozenCount > 0) ? 'border-amber-500/30' : 'border-white/10'
          } rounded-2xl p-5 relative overflow-hidden group shadow-xl flex flex-col justify-between`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Risk & Compliance</h3>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              (stats?.delinquentLoans > 0 || stats?.frozenCount > 0) ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
            }`}>
              {(stats?.delinquentLoans > 0 || stats?.frozenCount > 0) ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xl font-black tracking-tight text-white">{stats?.delinquentLoans || 0}</div>
                <span className="text-[10px] font-bold text-amber-500/80 uppercase">Bad Debt</span>
              </div>
              <div className="w-px h-8 bg-white/10"></div>
              <div>
                <div className="text-xl font-black tracking-tight text-white">{stats?.frozenCount || 0}</div>
                <span className="text-[10px] font-bold text-rose-500/80 uppercase">Frozen</span>
              </div>
            </div>
            <Link to={`/bank/${bank.id}/compliance`} className="text-[11px] text-zinc-400 hover:text-white mt-2 font-bold flex items-center gap-1 inline-flex transition-colors">
              Open Compliance Center <ArrowRight size={10} />
            </Link>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Actions & System Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Quick Actions Panel */}
          <div className="bg-[#0b0b12] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/5 bg-[#11111a]">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Quick Actions</h3>
            </div>
            <div className="p-3 grid grid-cols-1 gap-2">
              <Link to={`/bank/${bank.id}/accounts`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">New Account</p>
                  <p className="text-[11px] text-zinc-500 font-medium">Provision for a client</p>
                </div>
              </Link>
              <Link to={`/bank/${bank.id}/transactions`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ArrowUpRight size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Record Transfer</p>
                  <p className="text-[11px] text-zinc-500 font-medium">Manual ledger entry</p>
                </div>
              </Link>
              <Link to={`/bank/${bank.id}/loans`} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Underwrite Loan</p>
                  <p className="text-[11px] text-zinc-500 font-medium">Issue credit line</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Infrastructure Health */}
          <div className="bg-[#0b0b12] border border-white/10 rounded-2xl overflow-hidden p-6 relative">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-5 flex items-center gap-2 text-white">
              <Server size={16} className="text-indigo-400" /> Infrastructure
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-zinc-400 font-medium">
                  <Activity size={14} /> Discord Gateway
                </div>
                {bank.status === 'online' ? (
                  <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> ONLINE
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-xs font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg">
                    <span className="w-1.5 h-1.5 bg-rose-400 rounded-full"></span> OFFLINE
                  </span>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-zinc-400 font-medium">
                  <Server size={14} /> Core Ledger
                </div>
                <span className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> ACTIVE
                </span>
              </div>

              <div className="pt-3 border-t border-white/5 mt-2">
                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">Instance ID: {bank.id}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right Column: Top Customers Portfolio List */}
        <div className="lg:col-span-2 bg-[#0b0b12] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-[#11111a] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Top Portfolios</h3>
                  <p className="text-zinc-500 text-[11px] font-medium mt-0.5">Highest value individual profiles under management</p>
                </div>
                <Link to={`/bank/${bank.id}/customers`} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1">
                  View All Directory <ArrowRight size={12} />
                </Link>
            </div>
            <div className="divide-y divide-white/5 flex-1">
                {stats?.topCustomers?.length > 0 ? (
                  stats.topCustomers.map((customer: any, idx: number) => (
                      <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 font-mono flex items-center justify-center font-black text-xs border border-white/5">
                                  {idx + 1}
                              </div>
                              <div>
                                  <p className="font-bold text-white text-sm">
                                    {customer.mcUsername || customer.discordId}
                                  </p>
                                  <p className="text-[11px] text-zinc-500 font-medium">
                                    {customer.accountCount} {customer.accountCount === 1 ? 'account' : 'accounts'}
                                    {customer.mcUsername && <span className="font-mono text-zinc-600 ml-1">({customer.discordId})</span>}
                                  </p>
                              </div>
                          </div>
                          <div className="text-right font-black text-emerald-400 font-mono text-base tracking-tight">
                              {formatMoney(customer.totalBalance)}
                          </div>
                      </div>
                  ))
                ) : (
                  <div className="p-16 flex flex-col items-center justify-center text-center">
                    <Users size={32} className="text-white/10 mb-3" />
                    <p className="text-white/40 text-sm font-medium">No customer profiles established.</p>
                  </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

