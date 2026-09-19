import { useState, useEffect, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { 
  Briefcase, Plus, Play, Pause, FastForward, RefreshCw, 
  Search, Copy, Check, Users, DollarSign, Wallet, 
  Clock, CheckCircle, AlertTriangle, Loader2, ArrowRight, XCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function BankPayroll() {
  const params = useParams();
  const outletCtx = useOutletContext<{ bank?: any }>();
  const bank = outletCtx?.bank || {};
  const bankId = params.bankId || bank.id;

  const [jobs, setJobs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "paused" | "weekly" | "biweekly" | "monthly">("all");

  // Form State
  const [employerAccountId, setEmployerAccountId] = useState("");
  const [employeeAccountId, setEmployeeAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bankId) {
      fetchData();
    }
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [jobsRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/payroll`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const j = await jobsRes.json();
      const a = await accsRes.json();
      if (Array.isArray(j)) setJobs(j);
      if (Array.isArray(a)) setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employerAccountId || !employeeAccountId || !amount) return;
    
    setSubmitting(true);
    const nextRun = new Date();
    nextRun.setDate(nextRun.getDate() + 1);

    try {
      const res = await fetch(`/api/banks/${bankId}/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          employerAccountId,
          employeeAccountId,
          amount: Math.round(parseFloat(amount) * 100), 
          frequency,
          nextRun: nextRun.toISOString()
        })
      });
      setSubmitting(false);

      if (res.ok) {
        setShowAddModal(false);
        setEmployeeAccountId("");
        setAmount("");
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create payroll position schedule");
      }
    } catch (e) {
      console.error(e);
      setSubmitting(false);
      alert("Error creating payroll schedule");
    }
  };

  const toggleStatus = async (jobId: string, currentStatus: boolean) => {
    setTogglingJobId(jobId);
    try {
      setJobs(jobs.map(j => j.id === jobId ? { ...j, isActive: !currentStatus } : j));
      await fetch(`/api/banks/${bankId}/payroll/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus })
      });
    } catch(e) {
      console.error(e);
    } finally {
      setTogglingJobId(null);
    }
  };

  const handleRunNow = async (jobId: string) => {
    if (!confirm("Disburse salary immediately for this employee position?")) return;
    setRunningJobId(jobId);
    try {
      const res = await fetch(`/api/banks/${bankId}/payroll/${jobId}/run`, {
        method: "POST"
      });
      if (res.ok) {
        await fetchData();
      } else {
        const body = await res.json();
        alert(body.error || "Failed to run payroll. Ensure employer account has sufficient liquid balance.");
      }
    } catch(e) {
      console.error(e);
      alert("Network error processing salary disbursement");
    } finally {
      setRunningJobId(null);
    }
  };

  const handleBatchRunAll = async () => {
    const active = jobs.filter(j => j.isActive);
    if (active.length === 0) {
      alert("No active payroll schedules to execute.");
      return;
    }

    if (!confirm(`Execute immediate batch salary payout for ${active.length} active employee positions?`)) return;

    setBatchRunning(true);
    let successCount = 0;
    let failCount = 0;

    for (const job of active) {
      try {
        const res = await fetch(`/api/banks/${bankId}/payroll/${job.id}/run`, { method: "POST" });
        if (res.ok) successCount++;
        else failCount++;
      } catch (e) {
        failCount++;
      }
    }

    await fetchData();
    setBatchRunning(false);
    alert(`Batch payroll execution complete!\n✓ ${successCount} successful disbursements\n${failCount > 0 ? `✗ ${failCount} failed (check employer balance)` : ""}`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // KPIs
  const activeJobs = useMemo(() => jobs.filter(j => j.isActive), [jobs]);
  const pausedJobs = useMemo(() => jobs.filter(j => !j.isActive), [jobs]);

  const totalMonthlyPayrollCents = useMemo(() => {
    return activeJobs.reduce((acc, job) => {
      const amt = job.amount || 0;
      if (job.frequency === "weekly") return acc + Math.round(amt * 4.333);
      if (job.frequency === "biweekly") return acc + Math.round(amt * 2.166);
      return acc + amt; // monthly default
    }, 0);
  }, [activeJobs]);

  const avgSalaryCents = useMemo(() => {
    if (activeJobs.length === 0) return 0;
    const total = activeJobs.reduce((acc, j) => acc + (j.amount || 0), 0);
    return Math.round(total / activeJobs.length);
  }, [activeJobs]);

  // Filtered List
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      if (filterTab === "active" && !job.isActive) return false;
      if (filterTab === "paused" && job.isActive) return false;
      if (filterTab === "weekly" && job.frequency !== "weekly") return false;
      if (filterTab === "biweekly" && job.frequency !== "biweekly") return false;
      if (filterTab === "monthly" && job.frequency !== "monthly") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const empMatch = (job.employerAccountName || "").toLowerCase().includes(q);
      const employeeMatch = (job.employeeAccountName || job.employeeCityCorpId || "").toLowerCase().includes(q);
      const idMatch = (job.id || "").toLowerCase().includes(q);
      return empMatch || employeeMatch || idMatch;
    });
  }, [jobs, filterTab, searchQuery]);

  const getNextPayoutCountdown = (nextRunStr?: string) => {
    if (!nextRunStr) return "Schedule Pending";
    const nextRun = new Date(nextRunStr);
    const now = new Date();
    const diffDays = Math.ceil((nextRun.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Ready for Payout";
    if (diffDays === 1) return "Payout Tomorrow";
    if (diffDays < 7) return `Payout in ${diffDays} days`;
    return format(nextRun, "MMM d, yyyy");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin text-blue-400" size={28} />
        <p className="text-sm font-medium">Synchronizing corporate payroll registers...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <Briefcase className="text-blue-400" size={32} />
            Corporate Payroll Schedules
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Automate recurring staff compensation schedules, corporate salary disbursements, and employer clearing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          {activeJobs.length > 0 && (
            <button
              onClick={handleBatchRunAll}
              disabled={batchRunning}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 cursor-pointer"
              title="Disburse salaries immediately for all active positions"
            >
              {batchRunning ? <Loader2 size={16} className="animate-spin" /> : <FastForward size={16} />}
              Run All Active ({activeJobs.length})
            </button>
          )}

          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} /> Setup Schedule
          </button>
        </div>
      </header>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <DollarSign size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Monthly Payroll Burden</span>
          </div>
          <p className="text-2xl font-black text-white font-mono">{formatMoney(totalMonthlyPayrollCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Aggregated monthly compensation liability</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Users size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Active Payees</span>
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">{activeJobs.length}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Enrolled salaried employees</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Pause size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Paused Schedules</span>
          </div>
          <p className="text-2xl font-black text-amber-300 font-mono">{pausedJobs.length}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Temporarily suspended contracts</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Briefcase size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Average Salary</span>
          </div>
          <p className="text-2xl font-black text-indigo-300 font-mono">{formatMoney(avgSalaryCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Per disbursement period</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "all"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            All ({jobs.length})
          </button>
          <button
            onClick={() => setFilterTab("active")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "active"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Active ({activeJobs.length})
          </button>
          <button
            onClick={() => setFilterTab("paused")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "paused"
                ? "bg-amber-500 text-black font-black shadow-lg shadow-amber-500/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Paused ({pausedJobs.length})
          </button>
          <button
            onClick={() => setFilterTab("weekly")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "weekly"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setFilterTab("biweekly")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "biweekly"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Bi-Weekly
          </button>
          <button
            onClick={() => setFilterTab("monthly")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "monthly"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
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
            placeholder="Search employee, employer, or position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 transition-colors font-medium"
          />
        </div>
      </div>

      {/* Payroll Jobs Table */}
      {filteredJobs.length === 0 ? (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Briefcase className="text-white/20" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Payroll Schedules Found</h3>
          <p className="text-zinc-500 max-w-sm mb-6 font-medium text-sm">
            {searchQuery || filterTab !== "all" 
              ? "No salary contracts match your current search query or active filter." 
              : "Configure automated recurring salary dispatches between corporate accounts and employee ledgers."}
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Setup First Schedule
          </button>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400 bg-white/[0.02]">
                  <th className="p-4 font-bold">Position & Schedule ID</th>
                  <th className="p-4 font-bold">Employer (Corporate Source)</th>
                  <th className="p-4 font-bold">Employee (Beneficiary)</th>
                  <th className="p-4 font-bold">Salary & Cadence</th>
                  <th className="p-4 font-bold">Status / Next Run</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredJobs.map(job => (
                  <tr key={job.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                          job.isActive 
                            ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
                            : "bg-zinc-800/50 border-white/5 text-zinc-500"
                        }`}>
                          <Briefcase size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm group-hover:text-blue-300 transition-colors">
                            Staff Salary Disbursement
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-xs text-zinc-500">#{job.id.slice(0, 8)}</span>
                            <button
                              onClick={() => copyToClipboard(job.id)}
                              className="text-zinc-600 hover:text-blue-400 transition-colors p-0.5"
                              title="Copy Job ID"
                            >
                              {copiedId === job.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-sm text-white">{job.employerAccountName || "Corporate Account"}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                        <Wallet size={12} className="text-zinc-600" />
                        {job.employerAccountId?.slice(0, 12)}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-sm text-white">{job.employeeAccountName || "Employee Account"}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                        <Wallet size={12} className="text-zinc-600" />
                        {job.employeeAccountId?.slice(0, 12)}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-mono font-bold text-base text-emerald-400">
                        {formatMoney(job.amount)}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-zinc-300">
                          {job.frequency === "biweekly" ? "Bi-Weekly" : job.frequency}
                        </span>
                      </div>
                    </td>

                    <td className="p-4">
                      {job.isActive ? (
                        <div className="space-y-1">
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <Play size={10} /> Active
                          </span>
                          <div className="text-xs text-zinc-400 flex items-center gap-1 font-medium">
                            <Clock size={11} className="text-zinc-500" />
                            {getNextPayoutCountdown(job.nextRun)}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <Pause size={10} /> Paused
                          </span>
                          <div className="text-xs text-zinc-500">Disbursements Suspended</div>
                        </div>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.isActive && (
                          <button
                            onClick={() => handleRunNow(job.id)}
                            disabled={runningJobId === job.id}
                            className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Disburse salary immediately"
                          >
                            {runningJobId === job.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <FastForward size={13} />
                            )}
                            Force Payout
                          </button>
                        )}

                        <button
                          onClick={() => toggleStatus(job.id, job.isActive)}
                          disabled={togglingJobId === job.id}
                          className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1 cursor-pointer ${
                            job.isActive
                              ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20"
                          }`}
                          title={job.isActive ? "Pause Payroll Schedule" : "Resume Payroll Schedule"}
                        >
                          {job.isActive ? <Pause size={13} /> : <Play size={13} />}
                          {job.isActive ? "Pause" : "Resume"}
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

      {/* Add Payroll Schedule Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 bg-[var(--bg-subtle)] flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    <Briefcase className="text-blue-400" size={20} />
                    Setup Payroll Schedule
                  </h2>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Establish an automated salary disbursement agreement.</p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateJob} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Employer Account (Debited)
                    </label>
                    <select
                      required
                      value={employerAccountId}
                      onChange={(e) => setEmployerAccountId(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors font-medium"
                    >
                      <option value="">Select corporate payer...</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName || acc.name} - {formatMoney(acc.balance)} ({acc.ownerDiscordId || "Corporate"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Employee Account (Credited)
                    </label>
                    <select
                      required
                      value={employeeAccountId}
                      onChange={(e) => setEmployeeAccountId(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors font-medium"
                    >
                      <option value="">Select employee destination...</option>
                      {accounts.filter(a => a.id !== employerAccountId).map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName || acc.name} ({acc.ownerDiscordId || "Staff"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Salary Per Cycle ($)
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-3 pl-8 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Disbursement Cadence
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "weekly", label: "Weekly" },
                        { id: "biweekly", label: "Bi-Weekly" },
                        { id: "monthly", label: "Monthly" }
                      ].map(freq => (
                        <button
                          key={freq.id}
                          type="button"
                          onClick={() => setFrequency(freq.id)}
                          className={`py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            frequency === freq.id
                              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                              : "bg-[var(--bg-subtle)] border border-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {freq.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3 items-center">
                  <CheckCircle className="text-blue-400 shrink-0" size={18} />
                  <p className="text-xs text-blue-200/80 font-medium">
                    The salary cycle will run automatically based on internal cron triggers. If the employer has insufficient funds at runtime, the payout will be held and logged.
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
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Activate Schedule</>}
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
