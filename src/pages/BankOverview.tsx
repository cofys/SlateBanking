import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, RefreshCw, Server, ExternalLink, Users, Wallet, Activity, AlertTriangle } from "lucide-react";
import { formatMoney, formatNumber } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { motion } from "motion/react";

export function BankOverview() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (bank?.id) {
       // Check if user is admin/owner
       fetch(`/api/banks/${bank.id}/team`)
         .then(res => {
            if (res.ok) setIsAdmin(true);
         })
         .catch(() => {});

       Promise.all([
          fetch(`/api/banks/${bank.id}/customers`).then(r => r.json()),
       ]).then(([customers]) => {
          const totalBalance = customers.reduce((sum: number, c: any) => sum + c.totalBalance, 0);
          const totalAccounts = customers.reduce((sum: number, c: any) => sum + c.accountCount, 0);
          
          setStats({
            totalBalance,
            totalAccounts,
            topCustomers: customers.sort((a: any, b: any) => b.totalBalance - a.totalBalance).slice(0, 5)
          });
          setLoading(false);
       });
    }
  }, [bank]);

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading overview...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 text-white bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Welcome to {bank.name}</h1>
          <p className="text-white/60 text-sm">Manage your bank's operations securely on the Slate platform.</p>
        </div>
        <a 
          href={bank.customDomain ? `https://${bank.customDomain}` : `/portal/${bank.id}`}
          target="_blank"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 self-start sm:self-auto shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 hover:scale-[1.02]"
        >
          View Client Portal <ExternalLink size={16} />
        </a >
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Liquidity */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-[#11111a] border border-emerald-500/10 rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500/20 transition-all duration-300"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all duration-300 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Total Liquidity</h3>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Wallet size={16} />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-emerald-400 font-sans">{formatMoney(stats?.totalBalance || 0)}</div>
            <p className="text-[11px] text-white/40 mt-2 flex items-center gap-1">
              <span className="text-emerald-400">●</span> Across all active accounts
            </p>
          </div>
        </motion.div>

        {/* Active Accounts */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="bg-[#11111a] border border-indigo-500/10 rounded-2xl p-6 relative overflow-hidden group hover:border-indigo-500/20 transition-all duration-300"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-all duration-300 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Active Accounts</h3>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Users size={16} />
              </div>
            </div>
            <div className="text-3xl font-bold tracking-tight text-indigo-400 font-sans">{formatNumber(stats?.totalAccounts || 0)}</div>
            <p className="text-[11px] text-white/40 mt-2 flex items-center gap-1">
              <span className="text-indigo-400">●</span> Connected to active portfolios
            </p>
          </div>
        </motion.div>

        {/* Bot Status */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-[#11111a] border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-white/10 transition-all duration-300"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/2 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Bot Status</h3>
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/60">
                <Activity size={16} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5 mt-1.5">
              {bank.status === 'online' ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20 animate-pulse"></span> 
                  <span className="text-emerald-400">Online</span>
                </>
              ) : (
                <>
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-500 ring-4 ring-rose-500/20"></span> 
                  <span className="text-rose-400">Offline</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-3.5">
              CityCorp Webhook and Gateway integration
            </p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden p-6 relative">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-white/90">
              <Server size={18} className="text-indigo-400" /> Instance Information
            </h3>
            <div className="space-y-4">
                <div className="flex flex-col gap-1 text-sm bg-white/2 p-3 rounded-lg border border-white/5">
                    <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">Bank API ID</span>
                    <span className="font-mono text-white/90 select-all">{bank.id}</span>
                </div>
                <div className="flex flex-col gap-1 text-sm bg-white/2 p-3 rounded-lg border border-white/5">
                    <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">Node Status</span>
                    <span className="font-mono text-emerald-400 flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span>
                      Connected to Slate Mainnet
                    </span>
                </div>
            </div>
        </div>
        
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/5 bg-white/[0.01]">
                <h3 className="text-lg font-medium text-white/90">Top Customers</h3>
                <p className="text-white/40 text-xs mt-0.5">Highest value portfolios across your bank</p>
            </div>
            <div className="divide-y divide-white/5 flex-1 bg-[#09090d]">
                {stats?.topCustomers?.length > 0 ? (
                  stats.topCustomers.map((customer: any, idx: number) => (
                      <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 font-mono flex items-center justify-center font-bold text-sm border border-indigo-500/20">
                                  {idx + 1}
                              </div>
                              <div>
                                  <p className="font-semibold text-white/95 text-sm">{customer.discordId}</p>
                                  <p className="text-xs text-white/40 font-medium">{customer.accountCount} {customer.accountCount === 1 ? 'account' : 'accounts'}</p>
                              </div>
                          </div>
                          <div className="text-right font-semibold text-emerald-400 font-mono">
                              {formatMoney(customer.totalBalance)}
                          </div>
                      </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-white/30 text-sm">No customers recorded yet.</div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

