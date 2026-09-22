import { useState, useEffect, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { 
  FileText, Plus, CheckCircle, XCircle, ArrowRight, Loader2, 
  Search, Copy, Check, Clock, AlertTriangle, Printer, 
  Building2, User, DollarSign, Wallet, RefreshCw, Filter, ArrowUpRight
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney } from "../lib/utils";

export function BankInvoices() {
  const params = useParams();
  const outletCtx = useOutletContext<{ bank?: any }>();
  const bank = outletCtx?.bank || {};
  const bankId = params.bankId || bank.id;

  const [invoices, setInvoices] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<any | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid" | "overdue" | "cancelled">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [billerAccountId, setBillerAccountId] = useState("");
  const [customerAccountId, setCustomerAccountId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dueDateDays, setDueDateDays] = useState("7");
  const [description, setDescription] = useState("");

  const fetchInvoices = async () => {
    if (!bankId) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/invoices`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setInvoices(data);
      }
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    if (!bankId) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/accounts`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setAccounts(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (bankId) {
      setLoading(true);
      fetchInvoices();
      fetchAccounts();
    }
  }, [bankId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billerAccountId || !customerAccountId || !amountInput || !description) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billerAccountId,
          customerAccountId,
          amount: Math.round(parseFloat(amountInput) * 100),
          description,
          dueDateDays: parseInt(dueDateDays, 10) || 7
        })
      });

      setSubmitting(false);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create invoice");
        return;
      }

      setShowAdd(false);
      setBillerAccountId("");
      setCustomerAccountId("");
      setAmountInput("");
      setDescription("");
      fetchInvoices();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
      alert("Error issuing invoice");
    }
  };

  const handleUpdateStatus = async (invoiceId: string, newStatus: string) => {
    const confirmMsg = newStatus === "cancelled" 
      ? "Are you sure you want to cancel this invoice?"
      : `Reconcile and mark invoice ${invoiceId.slice(0, 8)} as ${newStatus}?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/banks/${bankId}/invoices/${invoiceId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: newStatus } : inv));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // KPI calculations
  const now = new Date();
  const totalInvoicedCents = useMemo(() => invoices.reduce((s, inv) => s + (inv.amount || 0), 0), [invoices]);
  
  const pendingInvoices = useMemo(() => invoices.filter(inv => inv.status === "pending"), [invoices]);
  const pendingAmountCents = useMemo(() => pendingInvoices.reduce((s, inv) => s + (inv.amount || 0), 0), [pendingInvoices]);

  const paidInvoices = useMemo(() => invoices.filter(inv => inv.status === "paid"), [invoices]);
  const paidAmountCents = useMemo(() => paidInvoices.reduce((s, inv) => s + (inv.amount || 0), 0), [paidInvoices]);

  const overdueInvoices = useMemo(() => invoices.filter(inv => inv.status === "pending" && new Date(inv.dueDate) < now), [invoices]);
  const overdueAmountCents = useMemo(() => overdueInvoices.reduce((s, inv) => s + (inv.amount || 0), 0), [overdueInvoices]);

  const cancelledCount = useMemo(() => invoices.filter(inv => inv.status === "cancelled").length, [invoices]);

  // Filtered List
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const isOverdue = inv.status === "pending" && new Date(inv.dueDate) < now;
      
      if (statusFilter === "pending" && inv.status !== "pending") return false;
      if (statusFilter === "paid" && inv.status !== "paid") return false;
      if (statusFilter === "cancelled" && inv.status !== "cancelled") return false;
      if (statusFilter === "overdue" && !isOverdue) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const idMatch = inv.id?.toLowerCase().includes(q);
      const descMatch = inv.description?.toLowerCase().includes(q);
      const billerMatch = (inv.billerUsername || inv.billerAccountId || "").toLowerCase().includes(q);
      const customerMatch = (inv.customerUsername || inv.customerAccountId || "").toLowerCase().includes(q);
      return idMatch || descMatch || billerMatch || customerMatch;
    });
  }, [invoices, statusFilter, searchQuery]);

  const getDaysRemainingText = (dueDateStr: string, status: string) => {
    if (status === "paid") return "Settled";
    if (status === "cancelled") return "Voided";
    
    const due = new Date(dueDateStr);
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `Overdue by ${Math.abs(diffDays)}d`;
    } else if (diffDays === 0) {
      return "Due Today";
    } else {
      return `Due in ${diffDays}d`;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin text-indigo-400" size={28} />
        <p className="text-sm font-medium">Synchronizing institutional billing ledger...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <FileText className="text-indigo-400" size={32} />
            Invoicing & Payment Demands
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Issue, monitor, and reconcile receivable claims and formal billing requests across client accounts.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <Plus size={16} /> Issue Invoice
          </button>
        </div>
      </header>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <FileText size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Total Invoiced</span>
          </div>
          <p className="text-2xl font-black text-white font-mono">{formatMoney(totalInvoicedCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{invoices.length} total issued claims</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Clock size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Receivables (Pending)</span>
          </div>
          <p className="text-2xl font-black text-amber-300 font-mono">{formatMoney(pendingAmountCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{pendingInvoices.length} claims awaiting settlement</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Collected & Settled</span>
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">{formatMoney(paidAmountCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{paidInvoices.length} settled payments</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <AlertTriangle size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Delinquent / Overdue</span>
          </div>
          <p className="text-2xl font-black text-rose-400 font-mono">{formatMoney(overdueAmountCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{overdueInvoices.length} claims past due date</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === "all"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            All ({invoices.length})
          </button>
          <button
            onClick={() => setStatusFilter("pending")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === "pending"
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Pending ({pendingInvoices.length})
          </button>
          <button
            onClick={() => setStatusFilter("paid")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === "paid"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Paid ({paidInvoices.length})
          </button>
          <button
            onClick={() => setStatusFilter("overdue")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === "overdue"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Overdue ({overdueInvoices.length})
          </button>
          <button
            onClick={() => setStatusFilter("cancelled")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              statusFilter === "cancelled"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Cancelled ({cancelledCount})
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            placeholder="Search invoice ID, client, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors font-medium"
          />
        </div>
      </div>

      {/* Invoices List / Table */}
      {filteredInvoices.length === 0 ? (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <FileText className="text-white/20" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Matching Invoices Found</h3>
          <p className="text-zinc-500 max-w-sm mb-6 font-medium text-sm">
            {searchQuery || statusFilter !== "all" 
              ? "No billing records matched your query or filter criteria." 
              : "No payment claims have been drafted or issued in this bank yet."}
          </p>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Issue First Invoice
          </button>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400 bg-white/[0.02]">
                  <th className="p-4 font-bold">Invoice Details</th>
                  <th className="p-4 font-bold">Biller (Payee)</th>
                  <th className="p-4 font-bold">Customer (Debtor)</th>
                  <th className="p-4 font-bold">Amount & Schedule</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredInvoices.map(inv => {
                  const isOverdue = inv.status === "pending" && new Date(inv.dueDate) < now;
                  const isPaid = inv.status === "paid";
                  const isCancelled = inv.status === "cancelled";

                  return (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                            <FileText size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                              {inv.description}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-xs text-zinc-500">#{inv.id.slice(0, 8)}</span>
                              <button
                                onClick={() => copyToClipboard(inv.id)}
                                className="text-zinc-600 hover:text-indigo-400 transition-colors p-0.5"
                                title="Copy Full Invoice UUID"
                              >
                                {copiedId === inv.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-sm text-white">{inv.billerUsername || "Internal Bank"}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                          <Wallet size={12} className="text-zinc-600" />
                          {inv.billerAccountName ? `${inv.billerAccountName}` : inv.billerAccountId?.slice(0, 10)}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-sm text-white">{inv.customerUsername || "Registered Client"}</div>
                        <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                          <Wallet size={12} className="text-zinc-600" />
                          {inv.customerAccountName ? `${inv.customerAccountName}` : inv.customerAccountId?.slice(0, 10)}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="font-mono font-bold text-base text-white">
                          {formatMoney(inv.amount)}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-zinc-500 font-medium">
                            {format(new Date(inv.dueDate), "MMM d, yyyy")}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isPaid 
                              ? "bg-emerald-500/10 text-emerald-400" 
                              : isOverdue 
                                ? "bg-rose-500/20 text-rose-300 font-black" 
                                : "bg-white/5 text-zinc-400"
                          }`}>
                            {getDaysRemainingText(inv.dueDate, inv.status)}
                          </span>
                        </div>
                      </td>

                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 ${
                          isPaid 
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                            : isCancelled 
                              ? "bg-zinc-800 text-zinc-400 border border-white/5" 
                              : isOverdue 
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" 
                                : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}>
                          {isPaid ? <CheckCircle size={12} /> : isCancelled ? <XCircle size={12} /> : isOverdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
                          {isOverdue ? "OVERDUE" : inv.status}
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedInvoiceForPrint(inv)}
                            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                            title="Generate Official PDF Document"
                          >
                            <Printer size={13} /> PDF
                          </button>

                          {inv.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(inv.id, "paid")}
                                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                title="Mark Paid Manually"
                              >
                                Mark Paid
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(inv.id, "cancelled")}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                title="Void / Cancel Invoice"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Invoice Modal */}
      <AnimatePresence>
        {showAdd && (
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
                    <Plus className="text-indigo-400" size={20} />
                    Issue Institutional Invoice
                  </h2>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Draft an enforceable payment demand between accounts.</p>
                </div>
                <button
                  onClick={() => setShowAdd(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Biller Account (Receives Funds)
                    </label>
                    <select
                      required
                      value={billerAccountId}
                      onChange={(e) => setBillerAccountId(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors font-medium"
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
                      Customer Account (Pays Funds)
                    </label>
                    <select
                      required
                      value={customerAccountId}
                      onChange={(e) => setCustomerAccountId(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors font-medium"
                    >
                      <option value="">Select paying customer...</option>
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
                      Amount Due ($)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold">$</span>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-3 pl-8 pr-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Payment Terms (Days)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[3, 7, 14, 30].map(days => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setDueDateDays(days.toString())}
                          className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                            dueDateDays === days.toString()
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                              : "bg-[var(--bg-subtle)] border border-white/10 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Service Description / Notes
                  </label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Corporate Retainer Q3, Server Infrastructure Leasing"
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors font-medium"
                  />
                </div>

                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex gap-3 items-center">
                  <Clock className="text-indigo-400 shrink-0" size={18} />
                  <p className="text-xs text-indigo-200/80 font-medium">
                    The debtor account holder can view, verify, and settle this invoice in their citizen banking gateway via atomic ledger clearance.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    className="px-4 py-2.5 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Dispatch Invoice</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Printable Invoice PDF Document Modal */}
      {selectedInvoiceForPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 overflow-y-auto print:absolute print:inset-0 print:bg-white print:p-0">
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #printable-invoice, #printable-invoice * {
                visibility: visible;
              }
              #printable-invoice {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
              }
            }
          `}} />
          <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:border-0 print:shadow-none print:w-full print:bg-white print:rounded-none">
            {/* Header controls (hidden on print) */}
            <div className="bg-[var(--bg)] border-b border-white/10 px-6 py-4 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-indigo-400" size={18} />
                <span className="font-bold text-white text-sm">Official Invoice Document (PDF Preview)</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                >
                  <Printer size={14} /> Print / Save PDF
                </button>
                <button 
                  type="button"
                  onClick={() => setSelectedInvoiceForPrint(null)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white cursor-pointer"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div id="printable-invoice" className="p-12 overflow-y-auto bg-white text-slate-900 font-sans print:p-0 print:overflow-visible flex-1 flex flex-col justify-between">
              <div>
                {/* Official Invoice Letterhead */}
                <div className="flex justify-between items-start border-b-2 border-indigo-900 pb-8 mb-8">
                  <div>
                    <h1 className="text-3xl font-black tracking-tight text-indigo-950 uppercase">{bank.name || "Slate Financial"}</h1>
                    <p className="text-xs font-mono text-indigo-800 tracking-wider mt-1">Onyx Clearinghouse Member No. #{(bank.id || "00000000").substring(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-slate-500 mt-4 leading-normal">
                      100 Financial Plaza, Suite 400<br />
                      Global Digital Clearing, ONYX-900<br />
                      support@{(bank.name || "slate").toLowerCase().replace(/\s+/g, '')}.com
                    </p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-3xl font-black text-indigo-950 uppercase tracking-wider">INVOICE</h2>
                    <p className="text-xs font-mono text-slate-500 mt-1">Ref: {selectedInvoiceForPrint.id}</p>
                    <div className="mt-4 inline-block">
                      <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase tracking-wider ${
                        selectedInvoiceForPrint.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        selectedInvoiceForPrint.status === 'cancelled' ? 'bg-zinc-100 text-zinc-800 border border-zinc-300' :
                        (new Date(selectedInvoiceForPrint.dueDate) < new Date() && selectedInvoiceForPrint.status === 'pending') ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                        'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {selectedInvoiceForPrint.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Billing Parties */}
                <div className="grid grid-cols-2 gap-8 mb-10 text-sm">
                  <div>
                    <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-2 font-bold">Biller (Receiving Payee)</h3>
                    <p className="font-bold text-slate-900 text-base">{selectedInvoiceForPrint.billerUsername || bank.name || "Institutional Account"}</p>
                    <p className="font-mono text-xs text-slate-500 mt-1">
                      Account: {selectedInvoiceForPrint.billerAccountName ? `${selectedInvoiceForPrint.billerAccountName} (${selectedInvoiceForPrint.billerAccountId})` : selectedInvoiceForPrint.billerAccountId}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-2 font-bold">Customer (Billed Debtor)</h3>
                    <p className="font-bold text-slate-900 text-base">{selectedInvoiceForPrint.customerUsername || "Registered Client"}</p>
                    <p className="font-mono text-xs text-slate-500 mt-1">
                      Account: {selectedInvoiceForPrint.customerAccountName ? `${selectedInvoiceForPrint.customerAccountName} (${selectedInvoiceForPrint.customerAccountId})` : selectedInvoiceForPrint.customerAccountId}
                    </p>
                  </div>
                </div>

                {/* Dates Block */}
                <div className="grid grid-cols-3 gap-4 mb-10 bg-slate-50 border border-slate-100 rounded-xl p-4 text-xs">
                  <div>
                    <span className="text-slate-400 block uppercase font-mono tracking-wider font-bold">Date Issued</span>
                    <span className="font-bold text-slate-800">{format(new Date(), "MMMM d, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono tracking-wider font-bold">Payment Due Date</span>
                    <span className="font-bold text-slate-800">{format(new Date(selectedInvoiceForPrint.dueDate), "MMMM d, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono tracking-wider font-bold">Terms</span>
                    <span className="font-bold text-slate-800">Net Due Upon Demand</span>
                  </div>
                </div>

                {/* Itemized Line Items */}
                <div className="mb-10">
                  <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-3 font-bold">Itemized Services</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-slate-500 uppercase font-mono tracking-wider">
                        <th className="py-2.5 font-bold">Description</th>
                        <th className="py-2.5 font-bold text-right">Qty</th>
                        <th className="py-2.5 font-bold text-right">Unit Rate</th>
                        <th className="py-2.5 font-bold text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-4">
                          <span className="font-bold text-slate-900 text-sm">{selectedInvoiceForPrint.description}</span>
                          <span className="block text-[10px] text-slate-400 mt-1">Standard digital billing ledger transaction entry registered on Slate clearinghouse.</span>
                        </td>
                        <td className="py-4 text-right font-mono text-slate-700">1</td>
                        <td className="py-4 text-right font-mono text-slate-700">{formatMoney(selectedInvoiceForPrint.amount)}</td>
                        <td className="py-4 text-right font-mono font-bold text-slate-900">{formatMoney(selectedInvoiceForPrint.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Calculation breakdown */}
                <div className="flex justify-end text-sm">
                  <div className="w-80 space-y-2 border-t border-slate-200 pt-4">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal:</span>
                      <span className="font-mono font-medium">{formatMoney(selectedInvoiceForPrint.amount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Clearinghouse Processing Fee (0.00%):</span>
                      <span className="font-mono font-medium">$0.00</span>
                    </div>
                    <div className="flex justify-between border-t-2 border-indigo-900 pt-2 text-indigo-950 font-black text-lg">
                      <span>Total Due (USD):</span>
                      <span className="font-mono">{formatMoney(selectedInvoiceForPrint.amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal disclosure and Stamp */}
              <div className="border-t border-slate-200 pt-8 mt-12 flex justify-between items-end text-[10px] text-slate-400 leading-normal">
                <div>
                  <p className="font-bold text-slate-500 uppercase tracking-wide mb-1">Slate Banking Platform Global Clearing System Invoice</p>
                  <p className="max-w-xl">
                    This invoice was generated electronically via the secure Onyx Global Clearing and settlement network. Authorized agents can trace transaction reference hashes using internal audit trails. Settlement must occur directly from registered bank balances.
                  </p>
                </div>
                <div className="text-right">
                  <div className="border border-indigo-900/20 rounded-xl px-5 py-3 inline-block bg-indigo-50/20 text-indigo-950 font-serif italic text-center text-xs tracking-wider border-dashed">
                    Slate Authorized<br />
                    <span className="font-sans text-[8px] font-mono uppercase text-indigo-800 not-italic tracking-widest font-black">SECURE INVOICE</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
