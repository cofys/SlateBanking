import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw, Layers, ShieldCheck, Scale, AreaChart as AreaChartIcon } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, Cell } from 'recharts';
import { formatMoney } from "../lib/utils";
import { motion } from "motion/react";

export function BankTreasury() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/banks/${bankId}/treasury`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin" size={24} />
        <p>Synchronizing with Central Treasury...</p>
      </div>
    );
  }

  if (!data) return null;

  // Enhance data visualization calculations
  const totalAssets = data.totalLoans + (data.estimatedRevenue * 2); // Mocking reserve assets for display
  const totalLiabilities = data.totalDeposits;
  const equity = totalAssets - totalLiabilities;
  const targetReserveRatio = 0.15; // 15% target
  const currentReserveRatio = data.reserveRatio;
  
  const isHealthy = currentReserveRatio >= targetReserveRatio;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <BarChart3 className="text-indigo-400" size={32} />
            Institutional Treasury
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Balance sheet monitoring, liquidity analytics, and P&L metrics.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20">
            <RefreshCw size={15} /> Recalculate Ledger
          </button>
        </div>
      </header>

      {/* Hero Treasury Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-[#0b0b12] border border-white/10 rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Scale size={14} /> Live Balance Sheet Overview
          </h2>
          
          <div className="grid grid-cols-2 gap-8 relative z-10">
            <div>
              <p className="text-sm font-semibold text-emerald-400 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                Total Assets
              </p>
              <p className="text-3xl lg:text-4xl font-black text-white font-mono tracking-tight mb-4">
                {formatMoney(totalAssets)}
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Cash Reserves</span>
                  <span className="text-white font-mono">{formatMoney(totalAssets * 0.4)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Loan Book (Principal)</span>
                  <span className="text-white font-mono">{formatMoney(data.totalLoans)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Securities & Investments</span>
                  <span className="text-white font-mono">{formatMoney(totalAssets * 0.1)}</span>
                </div>
              </div>
            </div>
            
            <div className="border-l border-white/5 pl-8">
              <p className="text-sm font-semibold text-amber-400 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
                Total Liabilities
              </p>
              <p className="text-3xl lg:text-4xl font-black text-white font-mono tracking-tight mb-4">
                {formatMoney(totalLiabilities)}
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Customer Deposits</span>
                  <span className="text-white font-mono">{formatMoney(data.totalDeposits * 0.8)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Savings Vaults</span>
                  <span className="text-white font-mono">{formatMoney(data.totalDeposits * 0.2)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Onyx Settlements Payable</span>
                  <span className="text-white font-mono">{formatMoney(0)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center relative z-10">
            <div>
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Shareholder Equity</p>
              <p className={`text-xl font-black font-mono mt-1 ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {equity >= 0 ? '+' : ''}{formatMoney(equity)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Reserve Status</p>
              <p className="text-xs font-semibold text-zinc-300 mt-1 flex items-center justify-end gap-2">
                Target: 15% | Actual: 
                <span className={`px-2 py-0.5 rounded text-[11px] font-black ${isHealthy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {(currentReserveRatio * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Operational Revenue Card */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-b from-[#0b0b12] to-[#07070a] border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-2xl flex flex-col justify-between"
        >
          <div>
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Activity size={14} /> Operational P&L
            </h2>
            <div className="mb-6">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Gross Revenue (MTD)</p>
              <p className="text-3xl font-black text-white font-mono">{formatMoney(data.estimatedRevenue)}</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-indigo-400">Fee Income</span>
                  <span className="text-white font-mono">{formatMoney(data.estimatedRevenue * 0.4)}</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full w-[40%] rounded-full"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-blue-400">Interest Earned</span>
                  <span className="text-white font-mono">{formatMoney(data.estimatedRevenue * 0.55)}</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full w-[55%] rounded-full"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-emerald-400">Treasury Yield</span>
                  <span className="text-white font-mono">{formatMoney(data.estimatedRevenue * 0.05)}</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[5%] rounded-full"></div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-white/5">
             <div className="bg-white/5 rounded-lg p-3 flex items-start gap-3">
               <ShieldCheck className="text-indigo-400 shrink-0" size={16} />
               <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                 Revenue is recognized on a cash basis. Accrued interest on defaulted loans is held in suspense pending collateral seizure.
               </p>
             </div>
          </div>
        </motion.div>
      </div>

      {/* Transaction Volume Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[#0b0b12] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
          <AreaChartIcon size={16} className="text-indigo-400" /> Capital Flow (7-Day Volume)
        </h3>
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.dailyVolume}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="#ffffff40" 
                fontSize={12} 
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth()+1}/${d.getDate()}`;
                }}
                dy={10}
              />
              <YAxis 
                stroke="#ffffff40" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `$${(val/100).toLocaleString(undefined, {notation: 'compact'})}`}
                dx={-10}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f0f15', border: '1px solid #ffffff10', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                itemStyle={{ fontSize: '13px', fontWeight: 600 }}
                formatter={(value: any) => [formatMoney(value as number), '']}
                labelStyle={{ color: '#ffffff80', marginBottom: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 500 }} 
                iconType="circle"
              />
              <Area type="monotone" dataKey="inflow" name="Inflows (Deposits & Payments)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorInflow)" />
              <Area type="monotone" dataKey="outflow" name="Outflows (Withdrawals & Loans)" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorOutflow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
