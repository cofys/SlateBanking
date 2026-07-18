import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Briefcase, Plus, Play, Pause, FastForward, RefreshCw, HandCoins } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankPayroll() {
  const { bankId } = useParams();
  const [jobs, setJobs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [employerAccountId, setEmployerAccountId] = useState("");
  const [employeeAccountId, setEmployeeAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("weekly");

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [jobsRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/payroll`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const j = await jobsRes.json();
      const a = await accsRes.json();
      setJobs(j);
      setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employerAccountId || !employeeAccountId || !amount) return;
    
    // Set next run date to tomorrow as a default
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
      if (res.ok) {
        setShowAddModal(false);
        setEmployeeAccountId("");
        setAmount("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStatus = async (jobId: string, currentStatus: boolean) => {
    try {
      setJobs(jobs.map(j => j.id === jobId ? { ...j, isActive: !currentStatus } : j));
      await fetch(`/api/banks/${bankId}/payroll/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus })
      });
    } catch(e) {
      console.error(e);
    }
  }

  const handleRunNow = async (jobId: string) => {
    try {
      const res = await fetch(`/api/banks/${bankId}/payroll/${jobId}/run`, {
        method: "POST"
      });
      if (res.ok) {
        fetchData();
      } else {
        const body = await res.json();
        alert(body.error || "Failed to run payroll. Ensure employer account has funds.");
      }
    } catch(e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="animate-spin text-white/50" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Briefcase className="text-blue-400" />
            Corporate Payroll
          </h1>
          <p className="text-white/60">Automate recurring salary payments for businesses</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <Plus size={18} />
          Setup Schedule
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No payroll schedules active</h3>
          <p className="text-white/60 max-w-sm mx-auto mb-6">
            Configure automated salary payments between employer and employee accounts.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer mx-auto"
          >
            <Plus size={18} />
            Create First Schedule
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-slate-900 border border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                <th className="p-4 font-medium">Employer</th>
                <th className="p-4 font-medium">Employee</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Frequency</th>
                <th className="p-4 font-medium">Status / Next Run</th>
                <th className="p-4 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-sm font-medium text-white/90">
                    {job.employerAccountName}
                  </td>
                  <td className="p-4 text-sm font-medium text-white/90 flex flex-col">
                    <span>{job.employeeAccountName}</span>
                    <span className="text-xs text-white/50 font-normal mt-0.5">{job.employeeCityCorpId}</span>
                  </td>
                  <td className="p-4 text-sm font-mono text-emerald-400 font-medium">
                    ${(job.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-sm text-white/70 capitalize">
                    {job.frequency}
                  </td>
                  <td className="p-4 text-sm">
                    {job.isActive ? (
                      <div className="flex flex-col">
                        <span className="text-emerald-400 font-medium text-xs mb-0.5 flex items-center gap-1"><Play size={12}/> ACTIVE</span>
                        <span className="text-white/50 text-xs">Run: {new Date(job.nextRun).toLocaleDateString()}</span>
                      </div>
                    ) : (
                       <span className="text-amber-400 font-medium text-xs mb-0.5 flex items-center gap-1"><Pause size={12}/> PAUSED</span>
                    )}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleStatus(job.id, job.isActive)}
                      className="text-white/50 hover:text-white p-1.5 rounded transition-colors"
                      title={job.isActive ? "Pause Schedule" : "Resume Schedule"}
                    >
                      {job.isActive ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    {job.isActive && (
                      <button
                        onClick={() => handleRunNow(job.id)}
                        className="text-indigo-400 hover:text-indigo-300 p-1.5 rounded transition-colors"
                        title="Force Run Now (Advances Schedule)"
                      >
                       <FastForward size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-semibold text-white">New Payroll Schedule</h2>
                <p className="text-sm text-white/60 mt-1">Automated transfers from Employer to Employee</p>
              </div>

              <form onSubmit={handleCreateJob} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Employer Account (Payer)</label>
                  <select 
                    value={employerAccountId}
                    onChange={(e) => setEmployerAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select funding account...</option>
                    {accounts.map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName} - ${(acc.balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({acc.ownerDiscordId})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Employee Account (Receiver)</label>
                  <select 
                    value={employeeAccountId}
                    onChange={(e) => setEmployeeAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select receiving account...</option>
                    {accounts.filter(a => a.id !== employerAccountId).map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.ownerDiscordId})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Amount ($)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Frequency</label>
                    <select 
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Bi-weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!employerAccountId || !employeeAccountId || !amount}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white transition-colors"
                  >
                    Start Schedule
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
