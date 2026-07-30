import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { TrendingUp, Users, ArrowRightLeft, DollarSign, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMoney } from "../lib/utils";

export function BankAnalytics() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bank?.id) {
       Promise.all([
         fetch(`/api/banks/${bank.id}/customers`).then(r => r.json()),
         fetch(`/api/banks/${bank.id}/transactions`).then(r => r.json()),
         fetch(`/api/banks/${bank.id}/analytics`).then(r => r.json())
       ]).then(([customers, txRes, analyticsData]) => {
          const totalBalance = customers.reduce((sum: number, c: any) => sum + c.totalBalance, 0);
          const totalAccounts = customers.reduce((sum: number, c: any) => sum + c.accountCount, 0);
          
          setStats({
            totalBalance,
            totalAccounts,
            totalCustomers: customers.length,
            txCount: txRes.recentTx?.length || 0,
            chartData: analyticsData
          });
          setLoading(false);
       });
    }
  }, [bank]);

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading analytics...</div>;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics & Reports</h2>
          <p className="text-white/60 text-sm mt-1">Deep dive into your bank's performance and customer activity.</p>
        </div>

        <Link
          to={`/bank/${bank.id}/mea-report`}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 w-fit"
        >
          <FileText size={16} />
          Generate MEA Monthly Report
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3 text-white/50 mb-2">
            <DollarSign size={16} />
            <h3 className="text-sm font-medium">Assets Under Custody</h3>
          </div>
          <div className="text-2xl font-extrabold text-white tracking-tight font-mono">{formatMoney(stats?.totalBalance || 0)}</div>
        </div>
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3 text-white/50 mb-2">
            <Users size={16} />
            <h3 className="text-sm font-medium">Total Customers</h3>
          </div>
          <div className="text-2xl font-bold text-white">{stats?.totalCustomers}</div>
        </div>
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3 text-white/50 mb-2">
            <TrendingUp size={16} />
            <h3 className="text-sm font-medium">Total Accounts</h3>
          </div>
          <div className="text-2xl font-bold text-white">{stats?.totalAccounts}</div>
        </div>
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-3 text-white/50 mb-2">
            <ArrowRightLeft size={16} />
            <h3 className="text-sm font-medium">Total Transactions</h3>
          </div>
          <div className="text-2xl font-bold text-white">{stats?.txCount}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Cash Flow Chart */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <h3 className="font-semibold text-lg mb-6">14-Day Capital Flow</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.chartData}>
                <defs>
                  <linearGradient id="colorDeposits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorWithdrawals" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1a1a24', borderColor: '#ffffff20', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="deposits" stroke="#34d399" fillOpacity={1} fill="url(#colorDeposits)" name="Deposits" />
                <Area type="monotone" dataKey="withdrawals" stroke="#f87171" fillOpacity={1} fill="url(#colorWithdrawals)" name="Withdrawals" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Growth Chart */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <h3 className="font-semibold text-lg mb-6">14-Day Account Growth</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.chartData}>
                <XAxis dataKey="date" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1a1a24', borderColor: '#ffffff20', borderRadius: '8px' }} />
                <Bar dataKey="newAccounts" fill="#6366f1" radius={[4, 4, 0, 0]} name="New Accounts" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
