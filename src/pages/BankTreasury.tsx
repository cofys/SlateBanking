import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { 
  BarChart3, 
  Activity, 
  RefreshCw, 
  ShieldCheck, 
  Scale, 
  AreaChart as AreaChartIcon,
  PieChart as PieChartIcon,
  CheckCircle2,
  Building2,
  Coins,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Tag,
  Clock
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";

export function BankTreasury() {
  const { bankId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<any>(null);
  const [selectedFeeFilter, setSelectedFeeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  const handleSyncTransactions = async () => {
    setSyncing(true);
    setSyncReport(null);
    try {
      const res = await fetch(`/api/banks/${bankId}/treasury/sync-corp-transactions`, {
        method: "POST"
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setSyncReport(result);
        await fetchData();
      } else {
        alert("Failed to sync in-game corp transactions: " + (result.error || "Unknown error"));
      }
    } catch (e: any) {
      alert("Error syncing in-game transactions: " + e.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin text-indigo-400" size={28} />
        <p className="text-sm font-medium">Synchronizing with Bank Corporate Ledger & CityCorp Plugin...</p>
      </div>
    );
  }

  if (!data) return null;

  const totalAssets = data.totalAssets || 0;
  const totalLiabilities = data.totalLiabilities || 0;
  const equity = data.equity || (totalAssets - totalLiabilities);
  const targetReserveRatio = data.targetReserveRatio || 0.15;
  const currentReserveRatio = data.reserveRatio || 0;
  const isHealthy = currentReserveRatio >= targetReserveRatio;

  // Filter recent in-game transactions
  const recentTransactions = data.recentTransactions || [];
  const filteredTransactions = recentTransactions.filter((tx: any) => {
    const matchesFilter = selectedFeeFilter === "all" || tx.feeType === selectedFeeFilter;
    const desc = (tx.description || "").toLowerCase();
    const memo = (tx.memo || "").toLowerCase();
    const cat = (tx.category || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = !query || desc.includes(query) || memo.includes(query) || cat.includes(query);
    return matchesFilter && matchesSearch;
  });

  const getFeeBadgeColor = (feeType: string) => {
    switch (feeType) {
      case "transfer_fee":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
      case "deposit_fee":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "withdraw_fee":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "late_fee":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
      case "origination_fee":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "loan_payment":
        return "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
      case "wire_fee":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "service_fee":
        return "bg-teal-500/10 text-teal-400 border-teal-500/20";
      case "tax":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "onyx_fee":
        return "bg-violet-500/10 text-violet-400 border-violet-500/20";
      default:
        return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <BarChart3 className="text-indigo-400" size={32} />
            Institutional Treasury & Fee Register
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Automated in-game fee accounting from the CityCorp plugin corporate account, live balance sheet, and reserve monitoring.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button 
            onClick={handleSyncTransactions}
            disabled={syncing}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing CityCorp Plugin..." : "Sync In-Game Corp Transactions"}
          </button>
        </div>
      </header>

      {/* Sync Alert Banner if executed */}
      <AnimatePresence>
        {syncReport && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-emerald-300">CityCorp Corporate Transactions Synced</h3>
                <p className="text-xs text-zinc-300 mt-0.5">
                  Scanned <strong>{syncReport.scannedCount || 0}</strong> in-game transactions ({syncReport.newTransactionsCount || 0} new records categorized into fee classifications). Current in-game corporate balance: <strong>{formatMoney(syncReport.corpBalance || 0)}</strong>.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setSyncReport(null)}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Corporate Account Card & Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[var(--bg-elevated)] border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
              <Building2 size={16} /> Bank Default Corp Account
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase flex items-center gap-1">
              CityCorp Plugin
            </span>
          </div>
          <p className="text-sm text-zinc-400 font-medium mb-1">
            {data.bankCorpAccount?.name || "Main (Corporate Account)"}
          </p>
          <p className="text-3xl font-black text-white font-mono tracking-tight">
            {formatMoney(data.bankCorpAccount?.balance || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-3 flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-indigo-400" />
            All fees flow into this in-game corp account and are parsed by fee type.
          </p>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-emerald-500/20 rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
              <Coins size={16} /> Total Cash Reserves
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${isHealthy ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
              {(currentReserveRatio * 100).toFixed(1)}% Ratio
            </span>
          </div>
          <p className="text-sm text-zinc-400 font-medium mb-1">Corporate GL & Vault Reserves</p>
          <p className="text-3xl font-black text-white font-mono tracking-tight">
            {formatMoney(data.cashReserves || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-3 flex items-center gap-1.5">
            Target Reserve: 15.0% | Status: <span className={isHealthy ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>{isHealthy ? "Compliant" : "Under Target"}</span>
          </p>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <Activity size={16} /> Net Operational Yield
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
              Gross P&L
            </span>
          </div>
          <p className="text-sm text-zinc-400 font-medium mb-1">Total Fees + Interest Earned</p>
          <p className="text-3xl font-black text-emerald-400 font-mono tracking-tight">
            +{formatMoney(data.grossRevenue || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 mt-3 flex items-center justify-between">
            <span>Fees: {formatMoney(data.totalFeesCollected || 0)}</span>
            <span>Interest: {formatMoney(data.totalInterestCollected || 0)}</span>
          </p>
        </div>
      </div>

      {/* Hero Balance Sheet Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Scale size={14} className="text-indigo-400" /> Verified Balance Sheet Overview
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
            {/* Assets */}
            <div>
              <p className="text-sm font-semibold text-emerald-400 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                Total Assets
              </p>
              <p className="text-3xl lg:text-4xl font-black text-white font-mono tracking-tight mb-4">
                {formatMoney(totalAssets)}
              </p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Total Cash Reserves</span>
                  <span className="text-white font-mono font-bold">{formatMoney(data.cashReserves || 0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium pl-3 border-l border-white/10">
                  <span className="text-zinc-500">• In-Game Corp Account Balance</span>
                  <span className="text-zinc-300 font-mono">{formatMoney(data.feeRevenueReserves || 0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium pl-3 border-l border-white/10">
                  <span className="text-zinc-500">• Vault Physical Cash</span>
                  <span className="text-zinc-300 font-mono">{formatMoney(data.vaultCash || 0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Loan Book (Outstanding Principal)</span>
                  <span className="text-white font-mono font-bold">{formatMoney(data.totalLoans || 0)}</span>
                </div>
              </div>
            </div>
            
            {/* Liabilities */}
            <div className="border-t md:border-t-0 md:border-l border-white/5 pt-6 md:pt-0 md:pl-8">
              <p className="text-sm font-semibold text-amber-400 mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
                Total Liabilities
              </p>
              <p className="text-3xl lg:text-4xl font-black text-white font-mono tracking-tight mb-4">
                {formatMoney(totalLiabilities)}
              </p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Customer Checking/Savings</span>
                  <span className="text-white font-mono font-bold">{formatMoney(data.customerDeposits || 0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Customer Locked Savings Vaults</span>
                  <span className="text-white font-mono font-bold">{formatMoney(data.vaultDeposits || 0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-zinc-400">Settlements Payable</span>
                  <span className="text-white font-mono">{formatMoney(0)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 relative z-10">
            <div>
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Shareholder Equity</p>
              <p className={`text-2xl font-black font-mono mt-0.5 ${equity >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {equity >= 0 ? '+' : ''}{formatMoney(equity)}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Reserve Status</p>
              <p className="text-xs font-semibold text-zinc-300 mt-1 flex items-center sm:justify-end gap-2">
                Target: 15.0% | Actual: 
                <span className={`px-2 py-0.5 rounded text-[11px] font-black ${isHealthy ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                  {(currentReserveRatio * 100).toFixed(1)}%
                </span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Operational P&L */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-b from-[#0b0b12] to-[#07070a] border border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-2xl flex flex-col justify-between"
        >
          <div>
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Activity size={14} className="text-indigo-400" /> Operational P&L
            </h2>
            <div className="mb-6">
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Gross Revenue (Total)</p>
              <p className="text-3xl font-black text-white font-mono">{formatMoney(data.grossRevenue || 0)}</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-indigo-400">In-Game Fee Income</span>
                  <span className="text-white font-mono">{formatMoney(data.totalFeesCollected || 0)}</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${data.grossRevenue > 0 ? Math.min(100, Math.round((data.totalFeesCollected / data.grossRevenue) * 100)) : 0}%` 
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-blue-400">Interest Earned</span>
                  <span className="text-white font-mono">{formatMoney(data.totalInterestCollected || 0)}</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${data.grossRevenue > 0 ? Math.min(100, Math.round((data.totalInterestCollected / data.grossRevenue) * 100)) : 0}%` 
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold mb-1">
                  <span className="text-amber-400">Operating Expenses</span>
                  <span className="text-white font-mono">{formatMoney(data.totalExpenses || 0)}</span>
                </div>
                <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${data.grossRevenue > 0 ? Math.min(100, Math.round((data.totalExpenses / data.grossRevenue) * 100)) : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-white/5">
             <div className="bg-white/5 rounded-xl p-3 flex items-start gap-3">
               <ShieldCheck className="text-indigo-400 shrink-0 mt-0.5" size={16} />
               <p className="text-[11px] text-zinc-400 font-medium leading-relaxed">
                 Fees are parsed from in-game corporate transactions and verified against the CityCorp plugin.
               </p>
             </div>
          </div>
        </motion.div>
      </div>

      {/* Granular Fee Register by Type */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <PieChartIcon size={18} className="text-indigo-400" /> Granular Fee Register by Type
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              All platform fees deposited into the bank's corporate account, categorized by fee classification.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-400">Total Verified Fees ({data.totalFeeCount || 0} Transactions)</span>
            <p className="text-2xl font-black text-indigo-400 font-mono">
              {formatMoney(data.totalFeesCollected || 0)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.feeBreakdown?.map((item: any) => (
            <div 
              key={item.type}
              onClick={() => setSelectedFeeFilter(selectedFeeFilter === item.type ? "all" : item.type)}
              className={`bg-[var(--bg-subtle)] border rounded-xl p-4 flex flex-col justify-between transition-all cursor-pointer ${selectedFeeFilter === item.type ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500' : 'border-white/5 hover:border-indigo-500/30'}`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-zinc-300">{item.label}</span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">
                    {item.count} txs
                  </span>
                </div>
                <p className="text-xl font-mono font-black text-white">
                  {formatMoney(item.amount)}
                </p>
              </div>

              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                  <span>Share of fees</span>
                  <span className="text-indigo-400 font-bold">{item.percentOfTotal.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, item.percentOfTotal)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* In-Game Corporate Transactions Ledger */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Building2 size={18} className="text-indigo-400" /> In-Game Corporate Transaction History
            </h3>
            <p className="text-xs text-zinc-400 mt-1">
              Live corporate transactions pulled from the CityCorp plugin endpoint and categorized into fee records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
              <input 
                type="text" 
                placeholder="Search memo or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-subtle)] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 w-52"
              />
            </div>

            {/* Filter */}
            <select
              value={selectedFeeFilter}
              onChange={(e) => setSelectedFeeFilter(e.target.value)}
              className="bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Fee Types</option>
              <option value="transfer_fee">Transfer Fees</option>
              <option value="deposit_fee">Deposit Fees</option>
              <option value="withdraw_fee">Withdrawal Fees</option>
              <option value="late_fee">Loan Late Fees</option>
              <option value="origination_fee">Origination Fees</option>
              <option value="loan_payment">Loan Payments</option>
              <option value="wire_fee">Wire / Inter-Bank Fees</option>
              <option value="service_fee">Service Fees</option>
              <option value="tax">Taxes</option>
              <option value="onyx_fee">Onyx Merchant Fees</option>
              <option value="other_fee">Other Corp Inflows</option>
            </select>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-zinc-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Date / Time</th>
                <th className="py-3 px-4">Transaction / Memo</th>
                <th className="py-3 px-4">Fee Classification</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No corporate transactions found matching your filter. Click "Sync In-Game Corp Transactions" to fetch the latest records.
                  </td>
                </tr>
              ) : (
                filteredTransactions.slice(0, 50).map((tx: any, idx: number) => (
                  <tr key={tx.id || idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-zinc-400 font-mono whitespace-nowrap">
                      {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "Recent"}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-white">{tx.description || tx.memo || "Corporate Transaction"}</p>
                      {tx.memo && tx.memo !== tx.description && (
                        <p className="text-[11px] text-zinc-500 mt-0.5">{tx.memo}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getFeeBadgeColor(tx.feeType)}`}>
                        {tx.feeType ? tx.feeType.replace(/_/g, " ").toUpperCase() : "FEE"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                      {tx.category || "Corporate GL"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                      +{formatMoney(tx.amount || 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Capital Flow Chart */}
      <motion.div 
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2">
          <AreaChartIcon size={16} className="text-indigo-400" /> Capital Flow (7-Day Volume)
        </h3>
        <div className="h-[340px] w-full">
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
              <Area type="monotone" dataKey="inflow" name="Inflows (Deposits & Payments)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorInflow)" />
              <Area type="monotone" dataKey="outflow" name="Outflows (Withdrawals & Loans)" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorOutflow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  );
}
