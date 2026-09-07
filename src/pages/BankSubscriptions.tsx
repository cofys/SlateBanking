import { useState, useEffect, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { 
  Repeat, Plus, Play, Pause, FastForward, RefreshCw, 
  Search, Copy, Check, Calendar, ArrowRight, Wallet, 
  Clock, CheckCircle, AlertCircle, Loader2, DollarSign, XCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function BankSubscriptions() {
  const params = useParams();
  const outletCtx = useOutletContext<{ bank?: any }>();
  const bank = outletCtx?.bank || {};
  const bankId = params.bankId || bank.id;

  const [subs, setSubs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [chargingId, setChargingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Search and filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "paused" | "weekly" | "monthly">("all");

  // Form State
  const [billerAccountId, setBillerAccountId] = useState("");
  const [customerAccountId, setCustomerAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bankId) {
      fetchData();
    }
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [subsRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/subscriptions`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const s = await subsRes.json();
      const a = await accsRes.json();
      if (Array.isArray(s)) setSubs(s);
      if (Array.isArray(a)) setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billerAccountId || !customerAccountId || !amount || !description) return;
    
    setSubmitting(true);
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);

    try {
      const res = await fetch(`/api/banks/${bankId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          billerAccountId,
          customerAccountId,
          amount: Math.round(parseFloat(amount) * 100), 
          frequency,
          description,
          nextRun: nextRun.toISOString()
        })
      });
      setSubmitting(false);

      if (res.ok) {
        setShowAddModal(false);
        setCustomerAccountId("");
        setAmount("");
        setDescription("");
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create subscription mandate");
      }
    } catch (e) {
      console.error(e);
      setSubmitting(false);
      alert("Error setting up recurring mandate");
    }
  };

  const toggleStatus = async (subId: string, currentStatus: boolean) => {
    setTogglingId(subId);
    try {
      setSubs(subs.map(s => s.id === subId ? { ...s, isActive: !currentStatus } : s));
      await fetch(`/api/banks/${bankId}/subscriptions/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus })
      });
    } catch(e) {
      console.error(e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleChargeNow = async (subId: string) => {
    if (!confirm("Execute an immediate billing cycle charge for this subscription mandate?")) return;
    setChargingId(subId);
    try {
      const res = await fetch(`/api/banks/${bankId}/subscriptions/${subId}/charge`, {
        method: "POST"
      });
      if (res.ok) {
        await fetchData();
      } else {
        const body = await res.json();
        alert(body.error || "Failed to charge. Ensure debtor account has sufficient available funds.");
      }
    } catch(e) {
      console.error(e);
      alert("Network error executing subscription charge");
    } finally {
      setChargingId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // KPIs
  const activeSubs = useMemo(() => subs.filter(s => s.isActive), [subs]);
  const pausedSubs = useMemo(() => subs.filter(s => !s.isActive), [subs]);

  // Normalized Monthly Recurring Revenue
  const totalMrrCents = useMemo(() => {
    return activeSubs.reduce((acc, sub) => {
      const amt = sub.amount || 0;
      if (sub.frequency === "weekly") return acc + Math.round(amt * 4.333);
      if (sub.frequency === "biweekly") return acc + Math.round(amt * 2.166);
      return acc + amt; // monthly default
    }, 0);
  }, [activeSubs]);

  const avgMandateCents = useMemo(() => {
    if (activeSubs.length === 0) return 0;
    const total = activeSubs.reduce((acc, s) => acc + (s.amount || 0), 0);
    return Math.round(total / activeSubs.length);
  }, [activeSubs]);

  // Filtered List
  const filteredSubs = useMemo(() => {
    return subs.filter(sub => {
      if (filterTab === "active" && !sub.isActive) return false;
      if (filterTab === "paused" && sub.isActive) return false;
      if (filterTab === "weekly" && sub.frequency !== "weekly") return false;
      if (filterTab === "monthly" && sub.frequency !== "monthly") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const descMatch = (sub.description || "").toLowerCase().includes(q);
      const billerMatch = (sub.billerAccountName || "").toLowerCase().includes(q);
      const custMatch = (sub.customerAccountName || sub.customerCityCorpId || "").toLowerCase().includes(q);
      const idMatch = (sub.id || "").toLowerCase().includes(q);
      return descMatch || billerMatch || custMatch || idMatch;
    });
  }, [subs, filterTab, searchQuery]);

  const getNextChargeCountdown = (nextRunStr?: string) => {
    if (!nextRunStr) return "Schedule Pending";
    const nextRun = new Date(nextRunStr);
    const now = new Date();
    const diffHours = Math.round((nextRun.getTime() - now.getTime()) / (1000 * 60 * 60));
    const diffDays = Math.ceil((nextRun.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffHours <= 0) return "Ready to Run";
    if (diffDays === 1) return "Runs Tomorrow";
    if (diffDays < 7) return `Runs in ${diffDays} days`;
    return format(nextRun, "MMM d, yyyy");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin text-purple-400" size={28} />
        <p className="text-sm font-medium">Synchronizing recurring billing mandates...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <Repeat className="text-purple-400" size={32} />
            Subscriptions & Direct Debits
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Manage automated recurring billing schedules, direct debit mandates, and merchant payout cadences.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} /> New Subscription
          </button>
        </div>
      </header>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <DollarSign size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Active MRR</span>
          </div>
          <p className="text-2xl font-black text-white font-mono">{formatMoney(totalMrrCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Monthly recurring revenue run-rate</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Play size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Active Mandates</span>
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">{activeSubs.length}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Active recurring billing schemes</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Pause size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Paused Mandates</span>
          </div>
          <p className="text-2xl font-black text-amber-300 font-mono">{pausedSubs.length}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Temporarily suspended direct debits</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Repeat size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Avg Mandate Size</span>
          </div>
          <p className="text-2xl font-black text-indigo-300 font-mono">{formatMoney(avgMandateCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Per billing interval average</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[#0b0b12] border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "all"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            All ({subs.length})
          </button>
          <button
            onClick={() => setFilterTab("active")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "active"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Active ({activeSubs.length})
          </button>
          <button
            onClick={() => setFilterTab("paused")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "paused"
                ? "bg-amber-500 text-black font-black shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Paused ({pausedSubs.length})
          </button>
          <button
            onClick={() => setFilterTab("weekly")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "weekly"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setFilterTab("monthly")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "monthly"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Monthly
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            placeholder="Search service, biller, or payer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#11111a] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors font-medium"
          />
        </div>
      </div>

      {/* Subscriptions Table */}
      {filteredSubs.length === 0 ? (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Repeat className="text-white/20" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Recurring Subscriptions Found</h3>
          <p className="text-zinc-500 max-w-sm mb-6 font-medium text-sm">
            {searchQuery || filterTab !== "all" 
              ? "No subscription mandates match your active query filters." 
              : "Setup automated recurring direct debit schemes for merchant billing, rent, or ongoing services."}
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Create First Subscription
          </button>
        </div>
      ) : (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400 bg-white/[0.02]">
                  <th className="p-4 font-bold">Mandate & Service</th>
                  <th className="p-4 font-bold">Biller (Receiver)</th>
                  <th className="p-4 font-bold">Debtor (Payer)</th>
                  <th className="p-4 font-bold">Cadence & Amount</th>
                  <th className="p-4 font-bold">Status / Next Cycle</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSubs.map(sub => (
                  <tr key={sub.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                          sub.isActive 
                            ? "bg-purple-500/10 border-purple-500/20 text-purple-400" 
                            : "bg-zinc-800/50 border-white/5 text-zinc-500"
                        }`}>
                          <Repeat size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm group-hover:text-purple-300 transition-colors">
                            {sub.description}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-xs text-zinc-500">#{sub.id.slice(0, 8)}</span>
                            <button
                              onClick={() => copyToClipboard(sub.id)}
                              className="text-zinc-600 hover:text-purple-400 transition-colors p-0.5"
                              title="Copy Mandate ID"
                            >
                              {copiedId === sub.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-sm text-white">{sub.billerAccountName || "Merchant Ledger"}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                        <Wallet size={12} className="text-zinc-600" />
                        {sub.billerAccountId?.slice(0, 12)}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-sm text-white">{sub.customerAccountName || "Client Account"}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                        <Wallet size={12} className="text-zinc-600" />
                        {sub.customerAccountId?.slice(0, 12)}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-mono font-bold text-base text-emerald-400">
                        {formatMoney(sub.amount)}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-zinc-300">
                          {sub.frequency}
                        </span>
                      </div>
                    </td>

                    <td className="p-4">
                      {sub.isActive ? (
                        <div className="space-y-1">
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <Play size={10} /> Active
                          </span>
                          <div className="text-xs text-zinc-400 flex items-center gap-1 font-medium">
                            <Clock size={11} className="text-zinc-500" />
                            {getNextChargeCountdown(sub.nextRun)}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <Pause size={10} /> Paused
                          </span>
                          <div className="text-xs text-zinc-500">Debits Suspended</div>
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {sub.isActive && (
                          <button
                            onClick={() => handleChargeNow(sub.id)}
                            disabled={chargingId === sub.id}
                            className="bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Execute Immediate Billing Cycle"
                          >
                            {chargingId === sub.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <FastForward size={13} />
                            )}
                            Force Charge
                          </button>
                        )}

                        <button
                          onClick={() => toggleStatus(sub.id, sub.isActive)}
                          disabled={togglingId === sub.id}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 cursor-pointer ${
                            sub.isActive
                              ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                          }`}
                          title={sub.isActive ? "Pause Billing Mandate" : "Resume Billing Mandate"}
                        >
                          {sub.isActive ? <Pause size={13} /> : <Play size={13} />}
                          {sub.isActive ? "Pause" : "Resume"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Subscription Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0b0b12] border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 bg-[#11111a] flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <Repeat className="text-purple-400" size={20} />
                    New Recurring Subscription
                  </h2>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Configure an automated direct debit schedule between accounts.</p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateSub} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Biller Account (Credited)
                    </label>
                    <select
                      required
                      value={billerAccountId}
                      onChange={(e) => setBillerAccountId(e.target.value)}
                      className="w-full bg-[#11111a] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors font-medium"
                    >
                      <option value="">Select receiving biller...</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName || acc.name} ({acc.ownerDiscordId || acc.ownerMcUsername || "Account"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Customer Account (Debited)
                    </label>
                    <select
                      required
                      value={customerAccountId}
                      onChange={(e) => setCustomerAccountId(e.target.value)}
                      className="w-full bg-[#11111a] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors font-medium"
                    >
                      <option value="">Select paying debtor...</option>
                      {accounts.filter(a => a.id !== billerAccountId).map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName || acc.name} - {formatMoney(acc.balance)} ({acc.ownerDiscordId || "Client"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Recurring Charge ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-[#11111a] border border-white/10 rounded-xl py-3 pl-8 pr-4 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Billing Interval
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {["weekly", "biweekly", "monthly"].map(freq => (
                        <button
                          key={freq}
                          type="button"
                          onClick={() => setFrequency(freq)}
                          className={`py-2.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                            frequency === freq
                              ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                              : "bg-[#11111a] border border-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {freq === "biweekly" ? "Bi-Weekly" : freq}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Service / Retainer Description
                  </label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Commercial Lease Suite 4A, Fleet Insurance Mandate"
                    className="w-full bg-[#11111a] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors font-medium"
                  />
                </div>

                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex gap-3 items-center">
                  <Calendar className="text-purple-400 shrink-0" size={18} />
                  <p className="text-xs text-purple-200/80 font-medium">
                    The direct debit will commence on tomorrow's schedule and execute automatically every {frequency} cycle as long as the mandate remains active.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2.5 text-sm font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2 cursor-pointer"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Establish Mandate</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
