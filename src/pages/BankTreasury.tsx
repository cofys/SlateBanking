import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

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
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin text-white/50" />
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (val: number) => `$${(val / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="text-emerald-400" />
            Treasury & P&L
          </h1>
          <p className="text-white/60">Bank liquidity, assets, and operational revenue analytics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <div className="bg-slate-800 p-2 rounded-lg">
              <DollarSign size={18} className="text-white" />
            </div>
            <span className="text-sm font-medium uppercase tracking-wider text-xs">Total Deposits (Liabilities)</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(data.totalDeposits)}</p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
              <TrendingUp size={18} />
            </div>
            <span className="text-sm font-medium uppercase tracking-wider text-xs">Active Loans (Assets)</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(data.totalLoans)}</p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <div className="bg-amber-500/20 p-2 rounded-lg text-amber-400">
              <Activity size={18} />
            </div>
            <span className="text-sm font-medium uppercase tracking-wider text-xs">Estimated Revenue (P&L)</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(data.estimatedRevenue)}</p>
        </div>

        <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 text-white/60 mb-2">
            <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400">
              <BarChart3 size={18} />
            </div>
            <span className="text-sm font-medium uppercase tracking-wider text-xs">Reserve Ratio</span>
          </div>
          <p className="text-2xl font-bold text-white">{(data.reserveRatio * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-medium text-white mb-6">7-Day Transaction Volume</h3>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.dailyVolume}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
              <XAxis 
                dataKey="date" 
                stroke="#ffffff50" 
                fontSize={12} 
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth()+1}/${d.getDate()}`;
                }}
              />
              <YAxis 
                stroke="#ffffff50" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `$${(val/100).toLocaleString(undefined, {notation: 'compact'})}`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f0f15', border: '1px solid #ffffff10', borderRadius: '8px' }}
                itemStyle={{ fontSize: '14px' }}
                formatter={(value: any) => [formatCurrency(value as number), '']}
                labelStyle={{ color: '#ffffff80', marginBottom: '4px' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="inflow" name="Inflows (Deposits)" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="outflow" name="Outflows (Withdrawals/Transfers)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
