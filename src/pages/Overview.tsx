import { Activity, Building2, Users, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export function Overview() {
  const [statsData, setStatsData] = useState({
    bankCount: 0,
    userCount: 0,
    onyxProcessedCents: 0,
    totalPlatformVolumeCents: 0,
    timeline: [] as any[],
  });

  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
        const data = await res.json();
        setStatsData(data);
      } catch (e) {
        console.error("Stats fetch error:", e);
      }
    };

    const fetchTransactions = async () => {
      try {
        const res = await fetch("/api/transactions/recent");
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
        const data = await res.json();
        setRecentTransactions(data.slice(0, 10)); // Show top 10
      } catch (e) {
        console.error("Transactions fetch error:", e);
      }
    };

    fetchStats();
    fetchTransactions();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val / 100);
  };

  const formatNumber = (val: number) => {
    return new Intl.NumberFormat('en-US').format(val);
  };

  const stats = [
    { label: "Active Bank Bots", value: formatNumber(statsData.bankCount), icon: Building2, trend: "+1 this week" },
    { label: "Total Platform Volume", value: formatCurrency(statsData.totalPlatformVolumeCents), icon: Activity, trend: "Overall processed" },
    { label: "Onyx Processed", value: formatCurrency(statsData.onyxProcessedCents), icon: ArrowUpRight, trend: "API gateway" },
    { label: "Connected Open Accounts", value: formatNumber(statsData.userCount), icon: Users, trend: "+5 this week" }
  ];

  return (
    <div className="max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
        <p className="text-white/50 mt-1">Monitor the Slate Banking SaaS ecosystem.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                  <Icon size={18} className="text-white/60" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-semibold tracking-tight">{stat.value}</p>
                <p className="text-sm font-medium text-white/50 mt-1">{stat.label}</p>
                <p className="text-xs text-indigo-400 mt-3">{stat.trend}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-xl p-6 h-[400px] flex flex-col">
          <h3 className="font-medium text-sm text-white/80">Platform Volume (30D)</h3>
          <div className="flex-1 mt-6 text-sm">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={statsData.timeline} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.3)" 
                  tickFormatter={(val) => {
                    try { return format(new Date(val), 'MMM d'); } catch { return val; }
                  }}
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.3)" 
                  tickFormatter={(val) => `$${val}`}
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f0f15', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  labelFormatter={(val) => {
                    try { return format(new Date(val), 'MMM d, yyyy'); } catch { return val; }
                  }}
                  formatter={(value: any) => [`$${value}`, 'Volume']}
                />
                <Area type="monotone" dataKey="volume" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 h-[400px] flex flex-col">
          <h3 className="font-medium text-sm text-white/80">Live Ledger Activity</h3>
          <div className="mt-4 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-white/50">No transactions recorded yet.</p>
            ) : (
              recentTransactions.map((tx, i) => (
                <div key={tx.id || i} className="flex justify-between items-center p-3 rounded bg-[#0a0a0c] border border-white/10">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-xs font-mono text-white/80 truncate">
                      {tx.type} • {tx.bankName || 'Unknown Bank'}
                    </p>
                    <p className="text-[11px] text-white/40 truncate">
                      <tspan className="text-white/60">{tx.description || '-'}</tspan>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-mono font-medium ${tx.type === 'deposit' || tx.type === 'onyx_payment' ? 'text-green-400' : 'text-zinc-300'}`}>
                      {tx.type === 'deposit' || tx.type === 'onyx_payment' ? '+' : '-'}{formatCurrency(tx.amount || 0)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
