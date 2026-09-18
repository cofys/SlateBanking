import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Landmark, Plus, RefreshCw, AlertCircle, Banknote, Calendar, FileText, X, Percent, CheckCircle2, ShieldAlert, ArrowUpRight, DollarSign, ShieldCheck, Zap, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankLoans() {
  const { bankId } = useParams();
  const [loans, setLoans] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingCron, setProcessingCron] = useState(false);
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "active" | "delinquent" | "defaulted" | "paid">("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [isOffSystem, setIsOffSystem] = useState(false);
  const [initialPaidAmount, setInitialPaidAmount] = useState("");
  const [offSystemReference, setOffSystemReference] = useState("");
  const [customRemainingAmount, setCustomRemainingAmount] = useState("");
  const [customNextDueDate, setCustomNextDueDate] = useState("");
  const [discordId, setCityCorpId] = useState("");
  const [principalAmount, setPrincipalAmount] = useState("");
  const [interestRate, setInterestRate] = useState("10.0"); 
  const [depositAccountId, setDepositAccountId] = useState("");
  const [collateralDescription, setCollateralDescription] = useState("");
  const [collateralValue, setCollateralValue] = useState("");

  const [showPayModal, setShowPayModal] = useState(false);
  const [payLoanId, setPayLoanId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState("");

  // Collateral edit states for selected loan
  const [editCollateralStatus, setEditCollateralStatus] = useState("");
  const [editCollateralDesc, setEditCollateralDesc] = useState("");
  const [editCollateralVal, setEditCollateralVal] = useState("");

  useEffect(() => {
    fetchData();
  }, [bankId]);
  
  const [editInterestRate, setEditInterestRate] = useState("");
  const [editPrincipal, setEditPrincipal] = useState("");
  const [editContractUrl, setEditContractUrl] = useState("");
  const [editContractText, setEditContractText] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [isEditingActiveLoan, setIsEditingActiveLoan] = useState(false);

  useEffect(() => {
    if (selectedLoan) {
      setEditCollateralStatus(selectedLoan.collateralStatus || "none");
      setEditCollateralDesc(selectedLoan.collateralDescription || "");
      setEditCollateralVal(selectedLoan.collateralValue ? (selectedLoan.collateralValue / 100).toString() : "");
      setEditInterestRate(selectedLoan.interestRate ? (selectedLoan.interestRate / 100).toString() : "5");
      setEditPrincipal(selectedLoan.principalAmount ? (selectedLoan.principalAmount / 100).toString() : "");
      setEditContractUrl(selectedLoan.contractUrl || "");
      setEditContractText(selectedLoan.contractText || "");
      setEditStatus(selectedLoan.status || "active");
      setIsEditingActiveLoan(false);
    }
  }, [selectedLoan]);

  const fetchData = async () => {
    try {
      const [loansRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/loans`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const l = await loansRes.json();
      const a = await accsRes.json();
      setLoans(Array.isArray(l) ? l : []);
      setAccounts(Array.isArray(a) ? a : []);
      setLoading(false);
    } catch (e: any) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleUpdateLoan = async (statusOverride: any) => {
    try {
      const updates = {
        interestRate: parseFloat(editInterestRate) * 100,
        principalAmount: parseFloat(editPrincipal) * 100,
        collateralStatus: editCollateralStatus,
        collateralDescription: editCollateralDesc,
        collateralValue: parseFloat(editCollateralVal) * 100,
        contractUrl: editContractUrl,
        contractText: editContractText,
      };
      if (statusOverride) {
        (updates as any).status = statusOverride;
      } else if (isEditingActiveLoan) {
        (updates as any).status = editStatus;
      }
      
      const res = await fetch(`/api/banks/${bankId}/loans/${selectedLoan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        alert("Loan updated");
        fetchData();
        if (statusOverride === "active") setSelectedLoan(null);
      } else {
        const err = await res.json();
        alert("Error: " + err.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };


  const handleProcessDueLoans = async () => {
    setProcessingCron(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/loans/process-due`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`Loan Repayments Run Complete!\nProcessed: ${data.result.processed}\nDebited: ${data.result.debited}\nLate Fees Added: ${data.result.lateFees}\nDefaulted: ${data.result.defaulted}`);
        fetchData();
      } else {
        alert("Error processing due loans: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setProcessingCron(false);
    }
  };

  const handleAccrueInterest = async () => {
    setProcessingCron(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/loans/accrue-interest`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`Interest Accrual Run Complete!\nAccrued Loans: ${data.result.accruedLoans}\nTotal Interest Added: $${(data.result.totalInterestAccruedCents / 100).toFixed(2)}`);
        fetchData();
      } else {
        alert("Error accruing interest: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setProcessingCron(false);
    }
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discordId || !principalAmount || !interestRate || !depositAccountId) return;
    
    try {
      const payload: any = { 
        discordId,
        depositAccountId,
        principalAmount: Math.round(parseFloat(principalAmount) * 100), 
        interestRate: Math.round(parseFloat(interestRate) * 100),
        collateralDescription,
        collateralValue,
        isOffSystem
      };

      if (isOffSystem) {
        payload.initialPaidAmount = Math.round(parseFloat(initialPaidAmount || "0") * 100);
        payload.offSystemReference = offSystemReference || null;
        if (customRemainingAmount) {
          payload.remainingAmount = Math.round(parseFloat(customRemainingAmount) * 100);
        }
        if (customNextDueDate) {
          payload.nextPaymentDate = customNextDueDate;
        }
      }

      const res = await fetch(`/api/banks/${bankId}/loans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAddModal(false);
        setIsOffSystem(false);
        setInitialPaidAmount("");
        setOffSystemReference("");
        setCustomRemainingAmount("");
        setCustomNextDueDate("");
        setCityCorpId("");
        setPrincipalAmount("");
        setCollateralDescription("");
        setCollateralValue("");
        fetchData();
      } else {
        const err = await res.json();
        alert("Error creating loan: " + (err.error || "Unknown error"));
      }
    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    }
  };

  const handleUpdateCollateral = async () => {
    if (!selectedLoan) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/loans/${selectedLoan.id}/collateral`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collateralDescription: editCollateralDesc,
          collateralValue: editCollateralVal,
          collateralStatus: editCollateralStatus
        })
      });
      if (res.ok) {
        alert("Collateral updated successfully.");
        fetchData();
        setSelectedLoan(null);
      }
    } catch (e: any) {
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

  const filteredLoans = loans.filter(loan => {
    // Tab filter
    if (filterTab === "pending" && loan.status !== "pending" && loan.status !== "awaiting_signature") return false;
    if (filterTab === "active" && (loan.status !== "active" || loan.isDelinquent)) return false;
    if (filterTab === "delinquent" && !loan.isDelinquent && loan.status !== "defaulted") return false;
    if (filterTab === "defaulted" && loan.status !== "defaulted") return false;
    if (filterTab === "paid" && loan.status !== "paid" && loan.status !== "paid_off") return false;

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchBorrower = loan.discordId?.toLowerCase().includes(q) || loan.mcUsername?.toLowerCase().includes(q);
      const matchId = loan.id?.toLowerCase().includes(q);
      const matchCollateral = loan.collateralDescription?.toLowerCase().includes(q);
      return matchBorrower || matchId || matchCollateral;
    }
    return true;
  });

  const metrics = {
    totalBook: loans.reduce((acc, l) => acc + (l.principalAmount || 0), 0),
    activeOutstanding: loans.filter(l => l.status === "active").reduce((acc, l) => acc + (l.remainingAmount || 0), 0),
    delinquentRisk: loans.filter(l => l.isDelinquent || l.status === "defaulted").reduce((acc, l) => acc + (l.remainingAmount || 0) + (l.lateFeeAmount || 0), 0),
    totalCollateral: loans.filter(l => l.collateralStatus === "pledged" || l.collateralStatus === "seized").reduce((acc, l) => acc + (l.collateralValue || 0), 0),
    pendingCount: loans.filter(l => l.status === "pending" || l.status === "awaiting_signature").length
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Landmark className="text-emerald-400" />
            Loan & Credit Underwriting
          </h1>
          <p className="text-white/60 text-sm">Issue, underwrite, collateralize, and automate debt collection across borrower accounts.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={handleProcessDueLoans}
            disabled={processingCron}
            className="flex items-center gap-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            title="Run automated repayment debits across all active loans"
          >
            <Zap size={16} className="text-indigo-400" />
            Process Due Debits
          </button>
          <button 
            onClick={handleAccrueInterest}
            disabled={processingCron}
            className="flex items-center gap-1.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/30 px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            title="Calculate and add daily interest compounding"
          >
            <Percent size={16} className="text-amber-400" />
            Accrue Interest
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-semibold transition-colors cursor-pointer shadow-lg shadow-emerald-600/20"
          >
            <Plus size={18} />
            Issue New Loan
          </button>
        </div>
      </div>

      {/* Underwriting KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#0b0b12] border border-white/10 p-4 rounded-2xl">
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Total Originated Book</p>
          <p className="text-xl font-black text-white font-mono mt-1">
            ${(metrics.totalBook / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{loans.length} total loans issued</p>
        </div>

        <div className="bg-[#0b0b12] border border-white/10 p-4 rounded-2xl">
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Active Performing Balance</p>
          <p className="text-xl font-black text-emerald-400 font-mono mt-1">
            ${(metrics.activeOutstanding / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-emerald-500/80 mt-0.5">Generating continuous yield</p>
        </div>

        <div className="bg-[#0b0b12] border border-white/10 p-4 rounded-2xl">
          <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Delinquency Exposure</p>
          <p className="text-xl font-black text-rose-400 font-mono mt-1">
            ${(metrics.delinquentRisk / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-rose-500/80 mt-0.5">Overdue & Defaulted</p>
        </div>

        <div className="bg-[#0b0b12] border border-white/10 p-4 rounded-2xl">
          <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Collateral Pledged</p>
          <p className="text-xl font-black text-amber-300 font-mono mt-1">
            ${(metrics.totalCollateral / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-amber-500/80 mt-0.5">Secured asset value</p>
        </div>
      </div>

      {/* Triage Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0b0b12] border border-white/10 p-3 rounded-2xl">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterTab === "all" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            All Loans ({loans.length})
          </button>
          <button
            onClick={() => setFilterTab("pending")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${filterTab === "pending" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-zinc-400 hover:text-white"}`}
          >
            Pending Review {metrics.pendingCount > 0 && <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">{metrics.pendingCount}</span>}
          </button>
          <button
            onClick={() => setFilterTab("active")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterTab === "active" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "text-zinc-400 hover:text-white"}`}
          >
            Active & Performing
          </button>
          <button
            onClick={() => setFilterTab("delinquent")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterTab === "delinquent" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-zinc-400 hover:text-white"}`}
          >
            Overdue / Delinquent
          </button>
          <button
            onClick={() => setFilterTab("defaulted")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterTab === "defaulted" ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" : "text-zinc-400 hover:text-white"}`}
          >
            Defaulted
          </button>
          <button
            onClick={() => setFilterTab("paid")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${filterTab === "paid" ? "bg-slate-700 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            Paid Off
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search borrower or collateral..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-black/40 border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 font-mono w-full sm:w-56"
          />
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl p-12 text-center">
          <Landmark className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No loans recorded</h3>
          <p className="text-white/60 max-w-sm mx-auto mb-6">
            Issue loans to clients. Funds will be deposited directly to their account, and you can automate collections and accrue yield.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-medium transition-colors cursor-pointer mx-auto"
          >
            <Plus size={18} />
            Issue First Loan
          </button>
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl p-12 text-center text-zinc-400">
          <AlertCircle size={36} className="mx-auto mb-2 opacity-30 text-white" />
          <p className="text-sm font-semibold text-white">No loans match the active triage filter.</p>
          <button 
            onClick={() => { setFilterTab("all"); setSearchQuery(""); }}
            className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-[#0b0b12] border border-white/10 rounded-2xl shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-400 bg-[#11111a]">
                <th className="p-4 font-semibold">Borrower</th>
                <th className="p-4 font-semibold">Principal</th>
                <th className="p-4 font-semibold">Remaining Bal</th>
                <th className="p-4 font-semibold">Collateral & Risk</th>
                <th className="p-4 font-semibold">APR</th>
                <th className="p-4 font-semibold">Next Due</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Underwriting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLoans.map(loan => {
                const collateralVal = loan.collateralValue || 0;
                const remaining = loan.remainingAmount || 1;
                const coveragePercent = Math.round((collateralVal / remaining) * 100);

                return (
                <tr 
                  key={loan.id} 
                  className={`hover:bg-white/5 transition-colors cursor-pointer ${loan.isDelinquent ? 'bg-rose-950/20' : ''}`}
                  onClick={() => setSelectedLoan(loan)}
                >
                  <td className="p-4 text-sm font-medium text-white/90">
                    <div className="flex items-center gap-2">
                      {loan.mcUsername ? (
                        <div>
                          <span className="text-white font-bold">{loan.mcUsername}</span>
                          <span className="block text-[10px] text-zinc-500 font-mono">{loan.discordId}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-white/80 font-semibold">{loan.discordId}</span>
                      )}
                      {loan.isOffSystem && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                          Off-System
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-sm font-mono text-white/70">
                    ${(loan.principalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {loan.isOffSystem && loan.initialPaidAmount > 0 && (
                      <span className="block text-[10px] text-purple-400 font-mono">
                        -${(loan.initialPaidAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} paid off-sys
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-sm font-mono text-emerald-400 font-bold">
                    ${(loan.remainingAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {loan.lateFeeAmount > 0 && (
                      <span className="block text-[10px] text-rose-400 font-mono">
                        +${(loan.lateFeeAmount / 100).toFixed(2)} late fee
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-xs">
                    {loan.collateralDescription ? (
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] ${loan.collateralStatus === 'seized' ? 'bg-rose-500/20 text-rose-300' : loan.collateralStatus === 'released' ? 'bg-slate-700 text-slate-300' : 'bg-amber-500/20 text-amber-300'}`}>
                            <ShieldCheck size={11} />
                            {loan.collateralStatus?.toUpperCase()}
                          </span>
                          {coveragePercent > 0 && (
                            <span className={`text-[10px] font-mono font-bold ${coveragePercent >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {coveragePercent}% Cov
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-[11px] truncate max-w-[140px] mt-0.5 font-medium">{loan.collateralDescription}</p>
                      </div>
                    ) : (
                      <span className="text-zinc-500 text-[11px] font-medium bg-zinc-800/60 px-2 py-0.5 rounded-full">Unsecured</span>
                    )}
                  </td>
                  <td className="p-4 text-sm font-mono text-white/80">
                    {(loan.interestRate / 100).toFixed(2)}%
                  </td>
                  <td className="p-4 text-sm text-zinc-400">
                    {loan.status === 'paid' || loan.status === 'paid_off' ? '-' : new Date(loan.nextPaymentDate).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm">
                    {loan.status === 'paid' || loan.status === 'paid_off' ? (
                      <span className="bg-slate-700 text-slate-300 px-2.5 py-1 rounded-full text-xs font-bold">PAID OFF</span>
                    ) : loan.status === 'defaulted' ? (
                      <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-full text-xs uppercase font-bold flex items-center gap-1 w-fit">
                        <AlertTriangle size={12} /> DEFAULTED
                      </span>
                    ) : loan.isDelinquent ? (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-full text-xs uppercase font-bold flex items-center gap-1 w-fit">
                        <AlertCircle size={12} /> OVERDUE ({loan.missedPaymentsCount})
                      </span>
                    ) : loan.status === 'pending' ? (
                      <span className="bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full text-xs uppercase font-bold">PENDING</span>
                    ) : (
                      <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full text-xs uppercase font-bold">{loan.status}</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex gap-2 justify-end items-center">
                      {loan.contractUrl && (
                        <a
                          href={loan.contractUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 font-semibold"
                          title="Open Contract Document"
                        >
                          Contract <ArrowUpRight size={12} />
                        </a>
                      )}
                      {loan.status === 'pending' && (
                         <button
                           title="Approve Loan (Funds will be sent)"
                           onClick={async (e) => {
                               e.stopPropagation();
                               if(!confirm("Approve this loan? Funds will instantly be disbursed.")) return;
                               try {
                                 const res = await fetch(`/api/banks/${bankId}/loans/${loan.id}/status`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ status: "approved" })
                                 });
                                 if(res.ok) fetchData();
                                 else {
                                   const err = await res.json().catch(() => ({}));
                                   alert(err.error || "Error approving loan");
                                 }
                               } catch(e) {}
                           }}
                           className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                         >
                           Approve
                         </button>
                      )}
                      {loan.status !== 'paid' && loan.status !== 'paid_off' && loan.status !== 'pending' && (
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             setPayLoanId(loan.id);
                             setShowPayModal(true);
                           }}
                           className="text-xs bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 border border-indigo-500/30 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                         >
                           Payment
                         </button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
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
              className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-xl font-semibold text-white">
                    {isOffSystem ? "Import Off-System Loan" : "Issue New Loan"}
                  </h2>
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)}
                    className="text-white/40 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
                <p className="text-sm text-white/60">
                  {isOffSystem 
                    ? "Record historical off-system loan and collect remaining balance on-platform" 
                    : "Disburse bank funds & establish automated repayment schedule"}
                </p>

                {/* Mode Selector */}
                <div className="grid grid-cols-2 gap-2 mt-4 bg-slate-950/60 p-1.5 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsOffSystem(false)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      !isOffSystem 
                        ? "bg-emerald-600 text-white shadow-md" 
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <Banknote size={14} /> New Disbursed Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOffSystem(true)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      isOffSystem 
                        ? "bg-purple-600 text-white shadow-md" 
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    <FileText size={14} /> Import Off-System Loan
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateLoan} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {isOffSystem && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3.5 text-xs text-purple-200 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-purple-300">
                      <ShieldAlert size={15} /> Off-System Loan Onboarding
                    </p>
                    <p className="text-purple-300/80 leading-relaxed">
                      This record documents a loan originated outside Slate (e.g. Discord contracts). <strong>No bank reserve funds are disbursed now.</strong> The remaining balance will be serviced on Slate, and all future payments flow directly to your bank corporate fee account.
                    </p>
                  </div>
                )}

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
                  <label className="block text-sm font-medium text-white/80 mb-1.5">
                    {isOffSystem ? "Linked Customer Account (For Repayments)" : "Deposit To Account"}
                  </label>
                  <select 
                    value={depositAccountId}
                    onChange={(e) => setDepositAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">Select account...</option>
                    {accounts.filter(a => a.ownerDiscordId === discordId).length > 0 
                      ? accounts.filter(a => a.ownerDiscordId === discordId).map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName}</option>
                      )) 
                      : accounts.map(acc => (
                         <option key={acc.id} value={acc.id}>{acc.accountName} ({acc.ownerDiscordId})</option>
                      ))
                    }
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1.5">
                      {isOffSystem ? "Original Principal ($)" : "Principal Amount"}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={principalAmount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrincipalAmount(val);
                          if (isOffSystem) {
                            const p = parseFloat(val) || 0;
                            const paid = parseFloat(initialPaidAmount) || 0;
                            setCustomRemainingAmount(Math.max(0, p - paid).toString());
                          }
                        }}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="100000.00"
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

                {isOffSystem && (
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1.5">
                        Prior Paid Off-System ($)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={initialPaidAmount}
                          onChange={(e) => {
                            const paidVal = e.target.value;
                            setInitialPaidAmount(paidVal);
                            const p = parseFloat(principalAmount) || 0;
                            const paid = parseFloat(paidVal) || 0;
                            setCustomRemainingAmount(Math.max(0, p - paid).toString());
                          }}
                          placeholder="10000.00"
                          className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1.5">
                        Remaining Balance Due ($)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/50">$</div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={customRemainingAmount}
                          onChange={(e) => setCustomRemainingAmount(e.target.value)}
                          placeholder="90000.00"
                          className="w-full bg-slate-800 border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isOffSystem && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-white/70 mb-1">Off-System Ref / Contract Note</label>
                      <input
                        type="text"
                        value={offSystemReference}
                        onChange={(e) => setOffSystemReference(e.target.value)}
                        placeholder="e.g. Discord #849 / Paid 10k in Gold"
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white/70 mb-1">Next Payment Due Date</label>
                      <input
                        type="date"
                        value={customNextDueDate}
                        onChange={(e) => setCustomNextDueDate(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-white/10 pt-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Collateral Binding (Optional)</p>
                  <div>
                    <label className="block text-xs text-white/70 mb-1">Collateral Asset Description</label>
                    <input
                      type="text"
                      value={collateralDescription}
                      onChange={(e) => setCollateralDescription(e.target.value)}
                      placeholder="e.g. Real Estate at 104 Ocean Drive, CyberTruck #402"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/70 mb-1">Estimated Collateral Value ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={collateralValue}
                      onChange={(e) => setCollateralValue(e.target.value)}
                      placeholder="e.g. 50000.00"
                      className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-colors ${
                      isOffSystem 
                        ? "bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50" 
                        : "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/50"
                    }`}
                  >
                    {isOffSystem ? "Record Off-System Loan" : "Issue Loan"}
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

      {/* View & Edit Loan Modal */}
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
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    Loan Management
                    {selectedLoan.isDelinquent && (
                      <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-2 py-0.5 rounded font-bold">OVERDUE</span>
                    )}
                  </h2>
                  <p className="text-sm text-white/60 mt-0.5 font-mono">{selectedLoan.id}</p>
                </div>
                <button onClick={() => setSelectedLoan(null)} className="text-white/40 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 grid grid-cols-2 gap-8 max-h-[80vh] overflow-y-auto">

                {isEditingActiveLoan || selectedLoan.status === "pending" || selectedLoan.status === "awaiting_signature" ? (
                  <div className="col-span-2 bg-black/20 p-6 rounded-xl border border-white/5 space-y-6">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-white font-medium">Review & Edit Terms</h3>
                      {isEditingActiveLoan && (
                        <button onClick={() => setIsEditingActiveLoan(false)} className="text-xs text-white/50 hover:text-white">Cancel Edit</button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-white/50 mb-1">Principal Amount ($)</label>
                        <input type="number" value={editPrincipal} onChange={e => setEditPrincipal(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-white/50 mb-1">Interest Rate (%)</label>
                        <input type="number" value={editInterestRate} onChange={e => setEditInterestRate(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white" />
                      </div>
                    </div>
                    {isEditingActiveLoan && (
                      <div>
                        <label className="block text-xs text-white/50 mb-1">Status</label>
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white">
                          <option value="pending">Pending</option>
                          <option value="awaiting_signature">Awaiting Signature</option>
                          <option value="active">Active</option>
                          <option value="delinquent">Delinquent</option>
                          <option value="defaulted">Defaulted</option>
                          <option value="paid">Paid</option>
                          <option value="paid_off">Paid Off</option>
                        </select>
                        <p className="text-[10px] text-amber-500/80 mt-1">Warning: Changing Principal resets the Remaining Balance!</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Contract Document URL (Optional)</label>
                      <input type="text" value={editContractUrl} onChange={e => setEditContractUrl(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white" placeholder="https://docs.google.com/..." />
                    </div>
                    <div>
                      <label className="block text-xs text-white/50 mb-1">Contract Text (Optional)</label>
                      <textarea value={editContractText} onChange={e => setEditContractText(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white min-h-[100px]" placeholder="By signing this, you agree to..." />
                    </div>
                    
                    <div className="flex gap-4 pt-4 border-t border-white/5">
                      {isEditingActiveLoan ? (
                        <button onClick={() => handleUpdateLoan(null)} className="flex-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/30 py-2 rounded-lg font-medium">
                          Save Changes
                        </button>
                      ) : (
                        <>
                          <button onClick={() => handleUpdateLoan("awaiting_signature")} className="flex-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 py-2 rounded-lg font-medium">
                            Request Client Signature
                          </button>
                          <button onClick={() => handleUpdateLoan("active")} className="flex-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 py-2 rounded-lg font-medium">
                            Approve & Fund Immediately
                          </button>
                          <button onClick={() => handleUpdateLoan("rejected")} className="flex-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 py-2 rounded-lg font-medium">
                            Reject Application
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (<>

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
                    <div className="text-white/80 bg-black/20 p-3 rounded-xl border border-white/5 min-h-[60px]">
                      {selectedLoan.purpose || <span className="text-white/30 italic">No notes provided</span>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl">
                      <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign size={14} /> Remaining</p>
                      <p className="font-mono text-emerald-300 text-xl font-medium">${(selectedLoan.remainingAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-slate-800/50 border border-white/5 p-4 rounded-xl">
                      <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Original Principal</p>
                      <p className="font-mono text-white/80 text-xl">${(selectedLoan.principalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  {selectedLoan.isOffSystem && (
                    <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl space-y-2">
                      <div className="flex justify-between items-center text-xs font-semibold text-purple-300">
                        <span className="flex items-center gap-1.5"><FileText size={14} /> Off-System Agreement</span>
                        <span className="bg-purple-500/20 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Manual Record</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div>
                          <span className="text-white/50 block text-[11px]">Prior Paid Off-System</span>
                          <span className="text-purple-200 font-mono font-bold">${((selectedLoan.initialPaidAmount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-[11px]">External Reference</span>
                          <span className="text-white font-medium">{selectedLoan.offSystemReference || "None recorded"}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collateral Binding Box */}
                  <div className="bg-slate-800/40 border border-white/10 p-4 rounded-xl space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <ShieldCheck size={14} /> Collateral Asset
                    </p>
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Description</label>
                      <input
                        type="text"
                        value={editCollateralDesc}
                        onChange={(e) => setEditCollateralDesc(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded px-3 py-1.5 text-sm text-white"
                        placeholder="No collateral bound"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Est. Value ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editCollateralVal}
                          onChange={(e) => setEditCollateralVal(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded px-3 py-1.5 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-white/60 mb-1">Status</label>
                        <select
                          value={editCollateralStatus}
                          onChange={(e) => setEditCollateralStatus(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-sm text-white"
                        >
                          <option value="none">None</option>
                          <option value="pledged">Pledged</option>
                          <option value="seized">Seized (Default)</option>
                          <option value="released">Released</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleUpdateCollateral}
                      className="w-full bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/30 text-xs py-1.5 rounded transition-colors"
                    >
                      Save Collateral Status
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Status</p>
                      <span className={`inline-block px-3 py-1 rounded text-sm uppercase font-semibold tracking-wider ${selectedLoan.status === 'paid' || selectedLoan.status === 'paid_off' ? 'bg-emerald-500/20 text-emerald-400' : selectedLoan.status === 'defaulted' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {selectedLoan.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Interest Rate</p>
                      <p className="text-white text-lg font-medium">{(selectedLoan.interestRate / 100).toFixed(2)}% APR</p>
                    </div>
                  </div>

                  {/* Delinquency & Penalties Box */}
                  <div className="bg-black/20 rounded-xl border border-white/5 p-4 space-y-2">
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-2">Delinquency & Late Fees</p>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/60">Missed Debits:</span>
                      <span className={`font-mono font-bold ${selectedLoan.missedPaymentsCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {selectedLoan.missedPaymentsCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-white/60">Accrued Late Fees:</span>
                      <span className="font-mono text-rose-300">
                        ${((selectedLoan.lateFeeAmount || 0) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Dates & Log</p>
                    <div className="bg-black/20 rounded-xl border border-white/5 p-4 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white/60 text-sm">Origination</span>
                        <span className="text-white text-sm">{new Date(selectedLoan.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-white/60 text-sm">Next Payment Due</span>
                        <span className={`text-sm font-medium ${selectedLoan.isDelinquent ? 'text-rose-400' : 'text-white'}`}>
                          {selectedLoan.status === 'paid' || selectedLoan.status === 'paid_off' ? 'N/A' : new Date(selectedLoan.nextPaymentDate).toLocaleDateString()}
                        </span>
                      </div>
                      {selectedLoan.lastPaymentAttemptAt && (
                        <div className="flex justify-between items-center pt-2 border-t border-white/5 text-xs text-white/40">
                          <span>Last Debit Attempt</span>
                          <span>{new Date(selectedLoan.lastPaymentAttemptAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {selectedLoan.status !== 'paid' && selectedLoan.status !== 'paid_off' && (
                    <button
                      onClick={() => {
                        const id = selectedLoan.id;
                        setSelectedLoan(null);
                        setPayLoanId(id);
                        setShowPayModal(true);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                    >
                      <DollarSign size={18} /> Record Manual Payment
                    </button>
                  )}
                  
                  <button
                    onClick={() => setIsEditingActiveLoan(true)}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText size={16} /> Edit Details Manually
                  </button>
                </div>
              </>
              )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

