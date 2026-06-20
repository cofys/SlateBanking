import { useState, useEffect } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, RefreshCw, Server, ExternalLink } from "lucide-react";

export function BankOverview() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bank?.id) {
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to {bank.name}</h1>
          <p className="text-white/60">Manage your bank's operations securely.</p>
        </div>
        <Link 
          to={`/portal/${bank.id}`}
          target="_blank"
          className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 self-start sm:self-auto border border-white/10 shadow-sm"
        >
          View Client Portal <ExternalLink size={16} />
        </Link>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest mb-1">Total Liquidity</h3>
            <div className="text-4xl font-light tracking-tighter mb-4">${(stats?.totalBalance / 100 || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest mb-1">Active Accounts</h3>
            <div className="text-4xl font-light tracking-tighter mb-4">{stats?.totalAccounts || 0}</div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest mb-1">Bot Status</h3>
            <div className="text-2xl font-light tracking-tighter mb-4 flex items-center gap-2 mt-2">
              {bank.status === 'online' ? (
                <><span className="w-3 h-3 rounded-full bg-green-500 border-2 border-[#111] animate-pulse"></span> Online</>
              ) : (
                 <><span className="w-3 h-3 rounded-full bg-red-500 border-2 border-[#111]"></span> Offline</>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Server size={18} className="text-white/40" /> Instance Information</h3>
            <ul className="space-y-4">
                <li className="flex flex-col gap-1 text-sm">
                    <span className="text-white/40">Bank API ID</span>
                    <span className="font-mono">{bank.id}</span>
                </li>
                <li className="flex flex-col gap-1 text-sm">
                    <span className="text-white/40">Node Status</span>
                    <span className="font-mono text-green-400">Connected to Slate Mainnet</span>
                </li>
            </ul>
        </div>
        
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-white/5">
                <h3 className="text-lg font-medium mb-1">Top Customers</h3>
                <p className="text-white/40 text-xs">Highest value portfolios across your bank</p>
            </div>
            <div className="divide-y divide-white/5">
                {stats?.topCustomers?.map((customer: any, idx: number) => (
                    <div key={idx} className="px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-sm">
                                {idx + 1}
                            </div>
                            <div>
                                <p className="font-medium">{customer.discordId}</p>
                                <p className="text-xs text-white/40">{customer.accountCount} accounts</p>
                            </div>
                        </div>
                        <div className="text-right font-medium text-emerald-400">
                            ${(customer.totalBalance / 100).toFixed(2)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}
