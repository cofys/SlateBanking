import { useState, useEffect, useMemo } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { 
  ShieldCheck, Plus, RefreshCw, CheckCircle, XCircle, 
  ArrowRight, ArrowUpRight, Search, Copy, Check, Lock, 
  Unlock, RotateCcw, DollarSign, Wallet, FileText, 
  AlertCircle, Loader2, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function BankEscrow() {
  const params = useParams();
  const outletCtx = useOutletContext<{ bank?: any }>();
  const bank = outletCtx?.bank || {};
  const bankId = params.bankId || bank.id;

  const [escrows, setEscrows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "pending" | "funded" | "released" | "refunded">("all");

  // Form State
  const [buyerAccountId, setBuyerAccountId] = useState("");
  const [sellerAccountId, setSellerAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [contractUrl, setContractUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bankId) {
      fetchData();
    }
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [escrowsRes, accsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/escrows`),
        fetch(`/api/banks/${bankId}/accounts`)
      ]);
      const e = await escrowsRes.json().catch(() => []);
      const a = await accsRes.json().catch(() => []);
      if (Array.isArray(e)) setEscrows(e);
      else if (e && Array.isArray((e as any).escrows)) setEscrows((e as any).escrows);
      if (Array.isArray(a)) setAccounts(a);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleCreateEscrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyerAccountId || !sellerAccountId || !amount || !description) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/escrows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          buyerAccountId,
          sellerAccountId,
          amount: Math.round(parseFloat(amount) * 100), 
          description,
          contractUrl: contractUrl || undefined
        })
      });
      setSubmitting(false);

      if (res.ok) {
        setShowAddModal(false);
        setBuyerAccountId("");
        setSellerAccountId("");
        setAmount("");
        setDescription("");
        setContractUrl("");
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to draft escrow agreement");
      }
    } catch (e) {
      console.error(e);
      setSubmitting(false);
      alert("Error creating escrow hold");
    }
  };

  const handleAction = async (escrowId: string, action: 'fund' | 'release' | 'refund') => {
    const actionLabel = action === 'fund' 
      ? 'lock funds from the buyer account into escrow custody'
      : action === 'release' 
        ? 'release locked escrow funds to the seller account'
        : 'refund locked escrow funds back to the buyer account';

    if (!confirm(`Are you sure you want to ${actionLabel}?`)) return;

    setActionInProgress(`${escrowId}_${action}`);
    try {
      const res = await fetch(`/api/banks/${bankId}/escrows/${escrowId}/${action}`, {
        method: "POST"
      });
      if (res.ok) {
        await fetchData();
      } else {
        const body = await res.json();
        alert(body.error || `Failed to ${action} escrow.`);
      }
    } catch(e) {
      console.error(e);
      alert("Network error executing escrow transaction");
    } finally {
      setActionInProgress(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // KPIs
  const fundedEscrows = useMemo(() => escrows.filter(e => e.status === "funded"), [escrows]);
  const activeCustodyCents = useMemo(() => fundedEscrows.reduce((s, e) => s + (e.amount || 0), 0), [fundedEscrows]);

  const pendingEscrows = useMemo(() => escrows.filter(e => e.status === "pending"), [escrows]);
  const activeContractsCount = fundedEscrows.length + pendingEscrows.length;

  const releasedEscrows = useMemo(() => escrows.filter(e => e.status === "released"), [escrows]);
  const releasedVolumeCents = useMemo(() => releasedEscrows.reduce((s, e) => s + (e.amount || 0), 0), [releasedEscrows]);

  const refundedEscrows = useMemo(() => escrows.filter(e => e.status === "refunded"), [escrows]);
  const refundedVolumeCents = useMemo(() => refundedEscrows.reduce((s, e) => s + (e.amount || 0), 0), [refundedEscrows]);

  // Filtered list
  const filteredEscrows = useMemo(() => {
    return escrows.filter(e => {
      if (filterTab === "pending" && e.status !== "pending") return false;
      if (filterTab === "funded" && e.status !== "funded") return false;
      if (filterTab === "released" && e.status !== "released") return false;
      if (filterTab === "refunded" && e.status !== "refunded") return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const descMatch = (e.description || "").toLowerCase().includes(q);
      const buyerMatch = (e.buyerAccountName || e.buyerDiscordId || "").toLowerCase().includes(q);
      const sellerMatch = (e.sellerAccountName || e.sellerDiscordId || "").toLowerCase().includes(q);
      const idMatch = (e.id || "").toLowerCase().includes(q);
      return descMatch || buyerMatch || sellerMatch || idMatch;
    });
  }, [escrows, filterTab, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin text-cyan-400" size={28} />
        <p className="text-sm font-medium">Synchronizing escrow custody ledgers...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <ShieldCheck className="text-cyan-400" size={32} />
            Institutional Escrow Custody
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Secure third-party transaction holding for high-value acquisitions, property deals, and bilateral trades.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-cyan-600/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} /> Create Escrow
          </button>
        </div>
      </header>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Lock size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">In Custody (Locked)</span>
          </div>
          <p className="text-2xl font-black text-cyan-300 font-mono">{formatMoney(activeCustodyCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{fundedEscrows.length} funded active deposits</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <ShieldCheck size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Active Contracts</span>
          </div>
          <p className="text-2xl font-black text-white font-mono">{activeContractsCount}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">Under active bilateral custody</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Settled Volume</span>
          </div>
          <p className="text-2xl font-black text-emerald-400 font-mono">{formatMoney(releasedVolumeCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{releasedEscrows.length} successfully closed deals</span>
        </div>

        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <RotateCcw size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Refunded Volume</span>
          </div>
          <p className="text-2xl font-black text-amber-300 font-mono">{formatMoney(refundedVolumeCents)}</p>
          <span className="text-[11px] text-zinc-500 mt-1 block font-medium">{refundedEscrows.length} aborted trades returned</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterTab("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "all"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            All ({escrows.length})
          </button>
          <button
            onClick={() => setFilterTab("pending")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "pending"
                ? "bg-slate-700 text-white shadow-lg"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Pending Deposit ({pendingEscrows.length})
          </button>
          <button
            onClick={() => setFilterTab("funded")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "funded"
                ? "bg-cyan-500 text-black font-black shadow-lg shadow-cyan-500/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Funded ({fundedEscrows.length})
          </button>
          <button
            onClick={() => setFilterTab("released")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "released"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Settled ({releasedEscrows.length})
          </button>
          <button
            onClick={() => setFilterTab("refunded")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              filterTab === "refunded"
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/20"
                : "text-zinc-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Refunded ({refundedEscrows.length})
          </button>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            placeholder="Search asset terms, buyer, or seller..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors font-medium"
          />
        </div>
      </div>

      {/* Escrow Holds Table */}
      {filteredEscrows.length === 0 ? (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <ShieldCheck className="text-white/20" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Escrow Contracts Found</h3>
          <p className="text-zinc-500 max-w-sm mb-6 font-medium text-sm">
            {searchQuery || filterTab !== "all" 
              ? "No contracts matched your current search terms or filter selection." 
              : "Establish trustless escrow holds between buyers and sellers until transaction criteria are verified."}
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} /> Create First Escrow Hold
          </button>
        </div>
      ) : (
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-400 bg-white/[0.02]">
                  <th className="p-4 font-bold">Contract & Asset</th>
                  <th className="p-4 font-bold">Buyer (Funder)</th>
                  <th className="p-4 font-bold">Seller (Beneficiary)</th>
                  <th className="p-4 font-bold">Hold Value</th>
                  <th className="p-4 font-bold">Lifecycle State</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredEscrows.map(escrow => (
                  <tr key={escrow.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                          escrow.status === 'funded' 
                            ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                            : escrow.status === 'released' 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : escrow.status === 'refunded'
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                : "bg-zinc-800/50 border-white/10 text-zinc-400"
                        }`}>
                          <ShieldCheck size={18} />
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm group-hover:text-cyan-300 transition-colors">
                            {escrow.description}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-xs text-zinc-500">#{escrow.id.slice(0, 8)}</span>
                            <button
                              onClick={() => copyToClipboard(escrow.id)}
                              className="text-zinc-600 hover:text-cyan-400 transition-colors p-0.5"
                              title="Copy Escrow ID"
                            >
                              {copiedId === escrow.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                            {escrow.contractUrl && (
                              <a
                                href={escrow.contractUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                                title="Open Google Docs Legal Agreement"
                              >
                                Agreement <ArrowUpRight size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-sm text-white">{escrow.buyerAccountName || "Buyer Ledger"}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                        <Wallet size={12} className="text-zinc-600" />
                        {escrow.buyerDiscordId || escrow.buyerAccountId?.slice(0, 10)}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-bold text-sm text-white">{escrow.sellerAccountName || "Seller Ledger"}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                        <Wallet size={12} className="text-zinc-600" />
                        {escrow.sellerDiscordId || escrow.sellerAccountId?.slice(0, 10)}
                      </div>
                    </td>

                    <td className="p-4">
                      <div className="font-mono font-bold text-base text-cyan-400">
                        {formatMoney(escrow.amount)}
                      </div>
                      <div className="text-xs text-zinc-500 font-medium mt-0.5">
                        {escrow.createdAt ? format(new Date(escrow.createdAt), "MMM d, yyyy") : "Active Hold"}
                      </div>
                    </td>

                    <td className="p-4">
                      {escrow.status === 'pending' && (
                        <span className="bg-slate-700/50 text-slate-300 border border-white/10 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <Clock size={11} /> Pending Deposit
                        </span>
                      )}
                      {escrow.status === 'funded' && (
                        <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <Lock size={11} /> Locked In Custody
                        </span>
                      )}
                      {escrow.status === 'released' && (
                        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <CheckCircle size={11} /> Released / Settled
                        </span>
                      )}
                      {escrow.status === 'refunded' && (
                        <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <RotateCcw size={11} /> Refunded to Buyer
                        </span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {escrow.status === 'pending' && (
                          <button 
                            onClick={() => handleAction(escrow.id, 'fund')} 
                            disabled={actionInProgress === `${escrow.id}_fund`}
                            className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Deposit and lock funds from buyer"
                          >
                            {actionInProgress === `${escrow.id}_fund` ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
                            Fund Escrow
                          </button>
                        )}
                        {escrow.status === 'funded' && (
                          <>
                            <button 
                              onClick={() => handleAction(escrow.id, 'release')} 
                              disabled={actionInProgress === `${escrow.id}_release`}
                              className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Release locked funds to seller"
                            >
                              {actionInProgress === `${escrow.id}_release` ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                              Release to Seller
                            </button>
                            <button 
                              onClick={() => handleAction(escrow.id, 'refund')} 
                              disabled={actionInProgress === `${escrow.id}_refund`}
                              className="text-xs bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              title="Cancel trade and refund buyer"
                            >
                              {actionInProgress === `${escrow.id}_refund` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                              Refund Buyer
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Escrow Modal */}
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
                    <ShieldCheck className="text-cyan-400" size={20} />
                    Establish Escrow Hold
                  </h2>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Setup trustless third-party custody between two accounts.</p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateEscrow} className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Buyer Account (Funder)
                    </label>
                    <select
                      required
                      value={buyerAccountId}
                      onChange={(e) => setBuyerAccountId(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors font-medium"
                    >
                      <option value="">Select funding buyer...</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName || acc.name} - {formatMoney(acc.balance)} ({acc.ownerDiscordId || "Buyer"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Seller Account (Beneficiary)
                    </label>
                    <select
                      required
                      value={sellerAccountId}
                      onChange={(e) => setSellerAccountId(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors font-medium"
                    >
                      <option value="">Select receiving seller...</option>
                      {accounts.filter(a => a.id !== buyerAccountId).map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.accountName || acc.name} ({acc.ownerDiscordId || "Seller"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Escrow Amount ($)
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl py-3 pl-8 pr-4 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                      Contract Agreement Document (Optional)
                    </label>
                    <input
                      type="url"
                      value={contractUrl}
                      onChange={(e) => setContractUrl(e.target.value)}
                      placeholder="https://docs.google.com/document/..."
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Description (Asset / Terms / Verification Criteria)
                  </label>
                  <input
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Commercial Real Estate Deed Plot #409, Enterprise Fleet Transfer"
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors font-medium"
                  />
                </div>

                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 flex gap-3 items-center">
                  <Lock className="text-cyan-400 shrink-0" size={18} />
                  <p className="text-xs text-cyan-200/80 font-medium">
                    Once drafted, click "Fund Escrow" to draw and lock funds from the buyer. The funds cannot be withdrawn by either party until authorized staff release or refund the escrow.
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
                    className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-cyan-600/20 flex items-center gap-2 cursor-pointer"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Draft Escrow Hold</>}
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
