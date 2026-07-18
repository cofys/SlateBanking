import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Landmark, Plus, RefreshCw, AlertCircle, Banknote, Calendar, FileText, X, Percent, CheckCircle2, ShieldAlert, ArrowUpRight, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankLoans() {
  const { bankId } = useParams();
  const [loans, setLoans] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [discordId, setCityCorpId] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestRate, setInterestRate] = useState("10.0"); 
  const [depositAccountId, setDepositAccountId] = useState("");

  const [showPayModal, setShowPayModal] = useState(false);
  const [payLoanId, setPayLoanId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState("");

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [loansRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/loans`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const l = await loansRes.json();
      const a = await accsRes.json();
      setLoans(l);
      setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discordId || !principalAmount || !interestRate || !depositAccountId) return;
    
    try {
      const res = await fetch(`/api/banks/${bankId}/loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          discordId,
          depositAccountId,
          principalAmount: Math.round(parseFloat(principalAmount) * 100), 
          interestRate: Math.round(parseFloat(interestRate) * 100) 
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setCityCorpId("");
        setPrincipalAmount("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payLoanId || !payAmount || !payAccountId) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/loans/${payLoanId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          accountId: payAccountId,
          amount: Math.round(parseFloat(payAmount) * 100)
        })
      });
      if (res.ok) {
        setShowPayModal(false);
        setPayAmount("");
        fetchData();
      } else {
        alert("Payment failed. Check account balance.");
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
            <Landmark className="text-emerald-400" />
            Loan Center
          </h1>
          <p className="text-white/60">Issue and manage loans & credit lines</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <Plus size={18} />
          Issue New Loan
        </button>
      </div>

      {loans.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <Landmark className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No active loans</h3>
          <p className="text-white/60 max-w-sm mx-auto mb-6">
            Issue loans to clients. Funds will be deposited directly to their account, and you can automate collections.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer mx-auto"
          >
            <Plus size={18} />
            Issue First Loan
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-slate-900 border border-white/10 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/50">
                <th className="p-4 font-medium">Borrower</th>
                <th className="p-4 font-medium">Original Principal</th>
                <th className="p-4 font-medium">Remaining Bal</th>
                <th className="p-4 font-medium">APR</th>
                <th className="p-4 font-medium">Next Payment</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loans.map(loan => (
                <tr 
                  key={loan.id} 
                  className="hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => setSelectedLoan(loan)}
                >
                  <td className="p-4 text-sm font-medium text-white/90">
                    {loan.mcUsername ? (
                      <span className="flex items-center gap-2">
                        {loan.mcUsername}
                        <span className="text-[10px] text-white/40 font-mono">({loan.discordId})</span>
                      </span>
                    ) : (
                      <span className="font-mono text-white/70">{loan.discordId}</span>
                    )}
                  </td>
                  <td className="p-4 text-sm font-mono text-white/70">
                    ${(loan.principalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-sm font-mono text-emerald-400 font-medium">
                    ${(loan.remainingAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-sm text-white/70">
                    {(loan.interestRate / 100).toFixed(2)}%
                  </td>
                  <td className="p-4 text-sm text-white/70">
                    {loan.status === 'paid' ? '-' : new Date(loan.nextPaymentDate).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm">
                    {loan.status === 'paid' ? (
                      <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs">PAID</span>
                    ) : loan.status === 'pending' ? (
                      <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs uppercase">PENDING</span>
                    ) : (
                      <span className="bg-amber-500/20 text-amber-300 px-2 py-1 rounded text-xs uppercase">{loan.status}</span>
                    )}
                  </td>
                  <td className="p-4 text-right flex gap-2 justify-end">
                    {loan.status === 'pending' && (
                       <button
                         title="Approve Loan (Funds will be sent)"
                         onClick={async () => {
                             if(!confirm("Approve this loan? Funds will instantly be disbursed.")) return;
                             try {
                               const res = await fetch(`/api/banks/${bankId}/loans/${loan.id}/status`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "approved" })
                               });
                               if(res.ok) fetchData(); else alert("Error");
                             } catch(e) {}
                         }}
                         className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 px-3 py-1.5 rounded transition-colors"
                       >
                         Approve
                       </button>
                    )}
                    {loan.status !== 'paid' && loan.status !== 'pending' && (
                       <button
                         onClick={() => {
                           setPayLoanId(loan.id);
                           setShowPayModal(true);
                         }}
                         className="text-xs bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 px-3 py-1.5 rounded transition-colors"
                       >
                         Make Payment
                       </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Loan Modal */}
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
                <h2 className="text-xl font-semibold text-white">Issue Loan</h2>
                <p className="text-sm text-white/60 mt-1">Disburse funds & establish a payment plan</p>
              </div>

              <form onSubmit={handleCreateLoan} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Borrower Discord ID</label>
                  <input
                    type="text"
                    value={discordId}
                    onChange={(e) => setCityCorpId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. 129031023901"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Deposit To Account</label>
                  <select 
                    value={depositAccountId}
                    onChange={(e) => setDepositAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">Select receiving account...</option>
                    {accounts.filter(a => a.ownerDiscordId === discordId).length > 0 
                      ? accounts.filter(a => a.ownerDiscordId === discordId).map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName}</option>
                      )) 
                      : accounts.map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.ownerDiscordId})</option>
                      ))
                    }
                  </select>
                  <p className="text-xs text-white/40 mt-1">Principal will be funded into this account automatically.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">Principal Amount</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={principalAmount}
                        onChange={(e) => setPrincipalAmount(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">APR (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
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
                    disabled={!discordId || !principalAmount || !depositAccountId}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50 text-white transition-colors"
                  >
                    Issue Loan
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Pay Loan Modal */}
        {showPayModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-semibold text-white">Record Payment</h2>
                <p className="text-sm text-white/60 mt-1">Deduct funds from a connected account</p>
              </div>

              <form onSubmit={handlePayLoan} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Paying From Account</label>
                  <select 
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select funding account...</option>
                    {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.accountName} - ${(acc.balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Payment Amount</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPayModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-slate-800 hover:bg-slate-700 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!payAccountId || !payAmount}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white transition-colors"
                  >
                    Process Payment
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Loan Modal */}
      <AnimatePresence>
        {selectedLoan && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/50">
                <div>
                  <h2 className="text-xl font-semibold text-white">Loan Details</h2>
                  <p className="text-sm text-white/60 mt-1 font-mono">{selectedLoan.id}</p>
                </div>
                <button onClick={() => setSelectedLoan(null)} className="text-white/40 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 grid grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Borrower Identity</p>
                    <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                      <p className="text-white text-lg font-medium">{selectedLoan.mcUsername || "Unverified Citizen"}</p>
                      <p className="font-mono text-white/50 text-xs mt-1">Discord ID: {selectedLoan.discordId}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Purpose / Notes</p>
                    <div className="text-white/80 bg-black/20 p-3 rounded-xl border border-white/5 min-h-[80px]">
                      {selectedLoan.purpose || <span className="text-white/30 italic">No notes provided</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                      <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign size={14} /> Remaining</p>
                      <p className="font-mono text-emerald-300 text-xl font-medium">${(selectedLoan.remainingAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-slate-800/50 border border-white/5 p-4 rounded-xl">
                      <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Original</p>
                      <p className="font-mono text-white/80 text-xl">${(selectedLoan.principalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Status</p>
                      <span className={`inline-block px-3 py-1 rounded text-sm uppercase font-semibold tracking-wider ${selectedLoan.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : selectedLoan.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {selectedLoan.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Interest Rate</p>
                      <p className="text-white text-lg font-medium">{(selectedLoan.interestRate / 100).toFixed(2)}% APR</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Important Dates</p>
                    <div className="bg-black/20 rounded-xl border border-white/5 p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white/60 text-sm">Origination Date</span>
                        <span className="text-white text-sm">{new Date(selectedLoan.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-white/5">
                        <span className="text-white/60 text-sm">Next Payment Due</span>
                        <span className="text-white text-sm font-medium {selectedLoan.status !== 'paid' && 'text-rose-400'}">
                          {selectedLoan.status === 'paid' ? 'N/A' : new Date(selectedLoan.nextPaymentDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {selectedLoan.status === 'active' && (
                    <button
                      onClick={() => {
                        setSelectedLoan(null);
                        setPayLoanId(selectedLoan.id);
                        setShowPayModal(true);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                    >
                      <DollarSign size={18} /> Record Manual Payment
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
