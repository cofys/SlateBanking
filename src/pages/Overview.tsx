import { Activity, Building2, Users, ArrowUpRight, Search, Loader2, XCircle } from "lucide-react";
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

  // Corp ID Finder State
  const [corpSearchQuery, setCorpSearchQuery] = useState("");
  const [corpSearchResult, setCorpSearchResult] = useState<number | null>(null);
  const [corpSearchLoading, setCorpSearchLoading] = useState(false);
  const [corpSearchError, setCorpSearchError] = useState("");

  const handleCorpSearch = async () => {
    if (!corpSearchQuery.trim()) return;
    setCorpSearchLoading(true);
    setCorpSearchResult(null);
    setCorpSearchError("");
    try {
      const res = await fetch(`/api/banks/corp-finder?query=${encodeURIComponent(corpSearchQuery)}`);
      const data = await res.json();
      if (res.ok && data.results && data.results.length > 0) {
        setCorpSearchResult(data.results[0].corpId);
      } else {
        setCorpSearchError("No matching Corporation found in registry.");
      }
    } catch (e) {
      setCorpSearchError("Failed to search database.");
    } finally {
      setCorpSearchLoading(false);
    }
  };

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

      {/* Global Corp ID Finder */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Search size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="font-medium text-lg">Global Corp ID Finder</h2>
            <p className="text-sm text-white/50">Look up a registered CityCorp Corporation ID.</p>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-end gap-4 max-w-3xl">
          <div className="flex-1 w-full">
            <label className="block text-xs font-medium text-white/70 mb-2 uppercase tracking-wide">
              Corporation Name
            </label>
            <input 
              type="text" 
              value={corpSearchQuery} 
              onChange={(e) => setCorpSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCorpSearch()}
              placeholder="Enter exact or partial corp name..."
              className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" 
            />
          </div>
          <button 
            onClick={handleCorpSearch}
            disabled={corpSearchLoading || !corpSearchQuery.trim()}
            className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-[42px]"
          >
            {corpSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Find ID
          </button>
        </div>

        {corpSearchResult !== null && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between max-w-3xl gap-4">
            <div>
              <p className="text-emerald-400 font-medium text-sm">Corporation Found</p>
              <p className="text-white/70 text-xs mt-1">The Corporation ID for this search is:</p>
            </div>
            <div className="text-3xl font-mono font-bold text-white bg-black/40 px-6 py-2 rounded-lg border border-white/5 text-center">
              {corpSearchResult}
            </div>
          </div>
        )}

        {corpSearchError && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-400 text-sm max-w-3xl">
            <XCircle size={16} />
            {corpSearchError}
          </div>
        )}
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
                  tickFormatter={(val: any) => {
                    try { return format(new Date(val), 'MMM d'); } catch { return String(val); }
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
                  labelFormatter={(val: any) => {
                    try {
                      if (val) {
                        return format(new Date(val), 'MMM d, yyyy');
                      }
                      return '';
                    } catch { return String(val); }
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
