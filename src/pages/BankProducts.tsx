import { useState, useEffect, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Package, Plus, Percent, Clock, DollarSign, Loader2, CreditCard,
  Shield, TrendingUp, Users, ArrowUpRight, Copy, Check, Eye, Edit3,
  Trash2, Sliders, Sparkles, Layers, Lock, RefreshCw, X, ChevronRight,
  BarChart3, Calculator, CheckCircle2, ChevronDown, Award, ArrowDownLeft,
  Briefcase, Landmark, ShieldCheck, Zap, Info, Filter, Search
} from "lucide-react";
import { formatMoney, formatNumber, safeFormatDate } from "../lib/utils";

type ProductType = "loan" | "credit" | "vault";

export function BankProducts() {
  const { bank } = useOutletContext<{ bank: any }>();
  
  // Data state
  const [loans, setLoans] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [vaults, setVaults] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<"all" | ProductType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Drawers
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [formType, setFormType] = useState<ProductType>("loan");
  const [activeTab, setActiveTab] = useState<"basics" | "financial" | "fees" | "perks" | "underwriting">("basics");
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Detail Drawer
  const [detailProduct, setDetailProduct] = useState<{ product: any; type: ProductType } | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Simulator Drawer
  const [showSimulator, setShowSimulator] = useState(false);
  const [simProduct, setSimProduct] = useState<any>(null);
  const [simAmount, setSimAmount] = useState<number>(5000);
  const [simTermMonths, setSimTermMonths] = useState<number>(12);

  // Toast / Flash Notification
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const flash = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Form interactive state (for perks builder and live card preview)
  const [formPerks, setFormPerks] = useState<string[]>([]);
  const [newPerkInput, setNewPerkInput] = useState("");
  const [liveCardDesign, setLiveCardDesign] = useState("obsidian_vip");
  const [liveCardKind, setLiveCardKind] = useState("credit");
  const [liveProductName, setLiveProductName] = useState("");
  const [liveRewards, setLiveRewards] = useState(1.5);
  const [liveApr, setLiveApr] = useState(12.5);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const fetchProducts = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch(`/api/banks/${bank.id}/products`);
      const data = await res.json();
      if (res.ok) {
        setLoans(data.loans || []);
        setCredits(data.credits || []);
        setVaults(data.vaults || []);
        setSummaryStats(data.summaryStats || null);
      }
    } catch (err) {
      console.error(err);
      flash("Failed to load products portfolio");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (bank?.id) fetchProducts();
  }, [bank.id]);

  // Fetch deep details when detail drawer opens
  useEffect(() => {
    if (!detailProduct) {
      setDetailData(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/banks/${bank.id}/products/${detailProduct.product.id}/details?type=${detailProduct.type}`)
      .then(r => r.json())
      .then(d => {
        setDetailData(d);
        setLoadingDetail(false);
      })
      .catch(() => {
        setLoadingDetail(false);
      });
  }, [detailProduct, bank.id]);

  // Open Edit Modal
  const openEditModal = (product: any, type: ProductType) => {
    setEditingProduct(product);
    setFormType(type);
    setModalMode("edit");
    setActiveTab("basics");
    setLiveProductName(product.name || "");
    setLiveApr(product.interestRate || 10);
    setLiveRewards(product.rewardsPercent || 0);
    setLiveCardDesign(product.cardDesign || "obsidian_vip");
    setLiveCardKind(product.cardKind || "credit");
    
    let parsedPerks: string[] = [];
    try {
      if (product.perksJson) {
        parsedPerks = JSON.parse(product.perksJson);
      }
    } catch {}
    setFormPerks(Array.isArray(parsedPerks) ? parsedPerks : []);
    setShowModal(true);
  };

  // Open Create Modal
  const openCreateModal = (type: ProductType = "loan") => {
    setEditingProduct(null);
    setFormType(type);
    setModalMode("create");
    setActiveTab("basics");
    setLiveProductName(type === "loan" ? "Prime Commercial Loan" : type === "vault" ? "High-Yield Term CD" : "Onyx Platinum Rewards");
    setLiveApr(type === "loan" ? 7.5 : type === "vault" ? 4.5 : 14.9);
    setLiveRewards(type === "credit" ? 2.0 : 0);
    setLiveCardDesign("obsidian_vip");
    setLiveCardKind("credit");
    setFormPerks(type === "credit" ? ["2.0% Cashback on All Purchases", "Zero Foreign FX Transaction Fees", "24/7 Concierge Banking Support"] : []);
    setShowModal(true);
  };

  // Duplicate Product
  const handleDuplicate = async (product: any, type: ProductType) => {
    try {
      const res = await fetch(`/api/banks/${bank.id}/products/${product.id}/duplicate?type=${type}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        flash(`Duplicated "${product.name}" successfully.`);
        fetchProducts();
      } else {
        flash(data.error || "Failed to duplicate product");
      }
    } catch {
      flash("Error duplicating product");
    }
  };

  // Delete Product
  const handleDelete = async (product: any, type: ProductType) => {
    if (!confirm(`Are you sure you want to permanently delete "${product.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/banks/${bank.id}/products/${product.id}?type=${type}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        flash(`Deleted "${product.name}".`);
        if (detailProduct?.product.id === product.id) setDetailProduct(null);
        fetchProducts();
      } else {
        flash(data.error || "Failed to delete product");
      }
    } catch {
      flash("Error deleting product");
    }
  };

  // Toggle Active State
  const handleToggleActive = async (product: any, type: ProductType) => {
    const nextState = !product.isActive;
    try {
      const res = await fetch(`/api/banks/${bank.id}/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: product.name,
          interestRate: product.interestRate,
          isActive: nextState,
          termDays: product.termDays || 30,
        }),
      });
      if (res.ok) {
        flash(`Product "${product.name}" is now ${nextState ? "Active" : "Disabled"}.`);
        fetchProducts();
      } else {
        flash("Failed to update product status");
      }
    } catch {
      flash("Error updating status");
    }
  };

  // Handle Form Submit
  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);

    const payload: any = {
      type: formType,
      name: String(fd.get("name") || "").trim(),
      description: String(fd.get("description") || "").trim(),
      interestRate: Number(fd.get("interestRate")),
      isActive: fd.get("isActive") === "on",
    };

    if (formType === "loan") {
      payload.category = String(fd.get("category") || "personal");
      payload.minAmount = Number(fd.get("minAmount") || 100);
      payload.maxLimit = Number(fd.get("maxLimit") || 5000);
      payload.termDays = Number(fd.get("termDays") || 30);
      payload.originationFeePercent = Number(fd.get("originationFeePercent") || 0);
      payload.lateFeePercent = Number(fd.get("lateFeePercent") || 5);
      payload.gracePeriodDays = Number(fd.get("gracePeriodDays") || 3);
      payload.repaymentFrequency = String(fd.get("repaymentFrequency") || "monthly");
      payload.collateralRequired = fd.get("collateralRequired") === "on";
      payload.minCreditScore = Number(fd.get("minCreditScore") || 0);
      payload.autoApproveMaxAmount = Number(fd.get("autoApproveMaxAmount") || 0);
    } else if (formType === "vault") {
      payload.lockupDays = Number(fd.get("lockupDays") || 90);
      payload.minDeposit = Number(fd.get("minDeposit") || 500);
      payload.maxDeposit = fd.get("maxDeposit") ? Number(fd.get("maxDeposit")) : null;
      payload.earlyWithdrawalPenaltyPercent = Number(fd.get("earlyWithdrawalPenaltyPercent") || 2);
      payload.compoundFrequency = String(fd.get("compoundFrequency") || "monthly");
      payload.tierId = String(fd.get("tierId") || "").trim() || null;
    } else {
      // Credit Card
      payload.maxLimit = Number(fd.get("maxLimit") || 10000);
      payload.rewardsPercent = Number(fd.get("rewardsPercent") || 0);
      payload.cardKind = String(fd.get("cardKind") || "credit");
      payload.cardDesign = liveCardDesign;
      payload.annualFee = Number(fd.get("annualFee") || 0);
      payload.cashAdvanceEnabled = fd.get("cashAdvanceEnabled") === "on";
      payload.cashAdvanceFeePercent = Number(fd.get("cashAdvanceFeePercent") || 3);
      payload.minPaymentPercent = Number(fd.get("minPaymentPercent") || 5);
      payload.latePaymentFeeCents = Number(fd.get("latePaymentFee") || 25);
      payload.gracePeriodDays = Number(fd.get("gracePeriodDays") || 21);
      payload.foreignTxFeePercent = Number(fd.get("foreignTxFeePercent") || 0);
      payload.welcomeBonusCents = Number(fd.get("welcomeBonus") || 0);
      payload.minCreditScore = Number(fd.get("minCreditScore") || 0);
      payload.tierId = String(fd.get("tierId") || "").trim() || null;
      payload.perksJson = JSON.stringify(formPerks);
    }

    const url = modalMode === "edit"
      ? `/api/banks/${bank.id}/products/${editingProduct.id}`
      : `/api/banks/${bank.id}/products`;
    const method = modalMode === "edit" ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSubmitting(false);

      if (res.ok) {
        flash(modalMode === "edit" ? "Product updated successfully." : "New product created and live in catalog.");
        setShowModal(false);
        fetchProducts();
      } else {
        flash(data.error || "Failed to save product");
      }
    } catch {
      setSubmitting(false);
      flash("Network error saving product");
    }
  };

  // Filtered lists
  const filteredLoans = useMemo(() => {
    return loans.filter(p => {
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [loans, statusFilter, searchQuery]);

  const filteredCredits = useMemo(() => {
    return credits.filter(p => {
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.cardDesign?.toLowerCase().includes(q) || p.tierId?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [credits, statusFilter, searchQuery]);

  const filteredVaults = useMemo(() => {
    return vaults.filter(p => {
      if (statusFilter === "active" && !p.isActive) return false;
      if (statusFilter === "inactive" && p.isActive) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [vaults, statusFilter, searchQuery]);

  // Card Theme Helpers
  const getCardDesignStyle = (design: string) => {
    switch (design) {
      case "gold_prestige":
        return {
          bg: "bg-gradient-to-br from-amber-950 via-[#1c1305] to-black border-amber-500/40 text-amber-200",
          accent: "text-amber-300",
          badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        };
      case "emerald_corp":
        return {
          bg: "bg-gradient-to-br from-emerald-950 via-[#041a12] to-black border-emerald-500/40 text-emerald-200",
          accent: "text-emerald-300",
          badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        };
      case "sapphire_rewards":
        return {
          bg: "bg-gradient-to-br from-blue-950 via-[#07132a] to-black border-blue-500/40 text-blue-200",
          accent: "text-blue-300",
          badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        };
      case "velvet_crimson":
        return {
          bg: "bg-gradient-to-br from-rose-950 via-[#21060d] to-black border-rose-500/40 text-rose-200",
          accent: "text-rose-300",
          badge: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        };
      case "cyber_neon":
        return {
          bg: "bg-gradient-to-br from-purple-950 via-[#081a24] to-black border-cyan-500/40 text-cyan-200",
          accent: "text-cyan-300",
          badge: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
        };
      case "classic_dark":
        return {
          bg: "bg-gradient-to-br from-slate-900 via-neutral-900 to-black border-white/20 text-slate-200",
          accent: "text-white",
          badge: "bg-white/10 text-white border-white/20",
        };
      case "obsidian_vip":
      default:
        return {
          bg: "bg-gradient-to-br from-neutral-900 via-[#0d0d10] to-black border-white/25 text-neutral-200",
          accent: "text-white",
          badge: "bg-white/15 text-white border-white/25",
        };
    }
  };

  if (loading) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3">
        <Loader2 className="animate-spin text-white/40" size={36} />
        <p className="text-xs font-mono text-white/40 tracking-wider uppercase">Loading Product Catalogs & Portfolio Telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-7 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#16161f] border border-white/20 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm text-white animate-in slide-in-from-bottom-5">
          <Info size={16} className="text-indigo-400 shrink-0" />
          <span>{toastMsg}</span>
          <button onClick={() => setToastMsg(null)} className="text-white/40 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Top Header & Executive Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-white">Product Catalog & Underwriting</h1>
            <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono">
              {bank?.name || "Bank Staff"}
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1">
            Configure lending parameters, credit cards, tier perks, fee schedules, and term vault products.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => fetchProducts(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/5 text-xs text-white/70 hover:text-white transition flex items-center gap-1.5"
            title="Refresh live portfolio metrics"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setSimProduct(loans[0] || credits[0] || null);
              setShowSimulator(true);
            }}
            className="px-3.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 text-xs font-medium text-white transition flex items-center gap-1.5"
          >
            <Calculator size={14} className="text-indigo-400" />
            <span>Product Calculator</span>
          </button>

          <div className="relative group">
            <button
              onClick={() => openCreateModal("loan")}
              className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs transition flex items-center gap-1.5 hover:bg-white/90 shadow-sm"
            >
              <Plus size={15} />
              <span>Create Product</span>
            </button>
          </div>
        </div>
      </div>

      {/* Executive Portfolio Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
          <div className="flex items-center justify-between text-white/40 mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider">Active Catalog</span>
            <Package size={14} className="text-indigo-400" />
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-white">
            {summaryStats?.totalActiveProducts || 0}
            <span className="text-xs font-normal text-white/40 ml-1.5 font-sans">
              / {summaryStats?.totalProductsCount || 0} Total
            </span>
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            {loans.length} Loans · {credits.length} Cards · {vaults.length} Vaults
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
          <div className="flex items-center justify-between text-white/40 mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider">Loan Portfolio</span>
            <TrendingUp size={14} className="text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">
            {formatMoney(summaryStats?.totalLoanPortfolioCents || 0)}
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            {summaryStats?.totalActiveBorrowersCount || 0} Active Borrowers
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
          <div className="flex items-center justify-between text-white/40 mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider">Credit Extended</span>
            <CreditCard size={14} className="text-blue-400" />
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-blue-400">
            {formatMoney(summaryStats?.totalCreditLimitExtendedCents || 0)}
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            {formatMoney(summaryStats?.totalCreditDrawnCents || 0)} Drawn ({summaryStats?.totalCreditLimitExtendedCents ? Math.round((summaryStats.totalCreditDrawnCents / summaryStats.totalCreditLimitExtendedCents) * 100) : 0}% Utilized)
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition">
          <div className="flex items-center justify-between text-white/40 mb-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider">Vault Deposits</span>
            <Lock size={14} className="text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono tabular-nums text-amber-400">
            {formatMoney(summaryStats?.totalVaultDepositsCents || 0)}
          </div>
          <p className="text-[11px] text-white/40 mt-1">
            Locked Term Savings Capital
          </p>
        </div>
      </div>

      {/* Filter Controls & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 bg-white/[0.02] border border-white/5 rounded-xl">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
              selectedCategory === "all"
                ? "bg-white/10 text-white font-semibold"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            All Products ({loans.length + credits.length + vaults.length})
          </button>
          <button
            onClick={() => setSelectedCategory("loan")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              selectedCategory === "loan"
                ? "bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <DollarSign size={13} className="text-emerald-400" />
            Loans ({loans.length})
          </button>
          <button
            onClick={() => setSelectedCategory("credit")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              selectedCategory === "credit"
                ? "bg-blue-500/15 text-blue-300 font-semibold border border-blue-500/30"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <CreditCard size={13} className="text-blue-400" />
            Credit Cards ({credits.length})
          </button>
          <button
            onClick={() => setSelectedCategory("vault")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              selectedCategory === "vault"
                ? "bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30"
                : "text-white/50 hover:text-white hover:bg-white/5"
            }`}
          >
            <Lock size={13} className="text-amber-400" />
            Vaults & CDs ({vaults.length})
          </button>
        </div>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-[#121218] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/25"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-[#121218] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/25"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Disabled Only</option>
          </select>
        </div>
      </div>

      {/* LOAN PRODUCTS SECTION */}
      {(selectedCategory === "all" || selectedCategory === "loan") && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Commercial & Consumer Loan Products</h2>
              <span className="text-xs text-white/40">({filteredLoans.length})</span>
            </div>
            <button
              onClick={() => openCreateModal("loan")}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition"
            >
              <Plus size={13} /> Add Loan Product
            </button>
          </div>

          {filteredLoans.length === 0 ? (
            <div className="p-8 rounded-xl border border-white/5 bg-white/[0.01] text-center space-y-2">
              <p className="text-xs text-white/40">No loan products found matching your filters.</p>
              <button
                onClick={() => openCreateModal("loan")}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium hover:bg-emerald-500/30 transition"
              >
                Create First Loan Product
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredLoans.map((p) => {
                const s = p.stats || {};
                return (
                  <div
                    key={p.id}
                    className="p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-2.5">
                      {/* Top Row: Name & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition">
                              {p.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-0.5">
                            <span className="capitalize">{p.category || "Personal"}</span>
                            <span>·</span>
                            <span>{p.termDays} Days</span>
                            {p.repaymentFrequency && (
                              <>
                                <span>·</span>
                                <span className="capitalize">{p.repaymentFrequency}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleActive(p, "loan")}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition ${
                            p.isActive
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          {p.isActive ? "ACTIVE" : "DISABLED"}
                        </button>
                      </div>

                      {/* Tagline / Description */}
                      {p.description && (
                        <p className="text-xs text-white/60 line-clamp-2">
                          {p.description}
                        </p>
                      )}

                      {/* Core Pricing Metadata */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Interest Rate</p>
                          <p className="text-xs font-bold font-mono text-emerald-400 tabular-nums">
                            {p.interestRate}% APR
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Max Principal</p>
                          <p className="text-xs font-bold font-mono text-white tabular-nums">
                            {formatMoney(p.maxAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Orig. Fee</p>
                          <p className="text-xs font-bold font-mono text-white/80 tabular-nums">
                            {(p.originationFeePercent || 0) / 100}%
                          </p>
                        </div>
                      </div>

                      {/* Underwriting Flags */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-white/50">
                        {p.collateralRequired ? (
                          <span className="text-amber-300 flex items-center gap-1">
                            <Shield size={11} /> Collateral Required
                          </span>
                        ) : (
                          <span className="text-white/40">Unsecured</span>
                        )}
                        <span>·</span>
                        <span>Min {formatMoney(p.minAmount || 10000)}</span>
                        {p.minCreditScore > 0 && (
                          <>
                            <span>·</span>
                            <span>Req Score: {p.minCreditScore}+</span>
                          </>
                        )}
                      </div>

                      {/* Live Portfolio Telemetry */}
                      <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/40">Active Lending</span>
                          <span className="font-mono tabular-nums font-semibold text-white">
                            {formatMoney(s.activeOutstandingBalanceCents || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-white/40">
                          <span>{s.activeLoansCount || 0} active loans ({s.distinctBorrowers || 0} borrowers)</span>
                          <span>{s.repaymentRatePercent || 100}% Paid</span>
                        </div>
                        {s.defaultedLoansCount > 0 && (
                          <div className="text-[10px] text-rose-400 font-mono">
                            ⚠ {s.defaultedLoansCount} Delinquent / Defaulted Loans
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-2 flex items-center justify-between border-t border-white/5">
                      <button
                        onClick={() => setDetailProduct({ product: p, type: "loan" })}
                        className="text-xs text-white/70 hover:text-white font-medium flex items-center gap-1 transition"
                      >
                        <Eye size={12} />
                        <span>View Details & Accounts</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDuplicate(p, "loan")}
                          title="Duplicate Product"
                          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => openEditModal(p, "loan")}
                          title="Edit Product"
                          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(p, "loan")}
                          title="Delete Product"
                          className="p-1.5 rounded-md hover:bg-rose-500/20 text-white/30 hover:text-rose-400 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREDIT & DEBIT CARD PRODUCTS SECTION */}
      {(selectedCategory === "all" || selectedCategory === "credit") && (
        <div className="space-y-3.5 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Credit & Debit Card Offerings</h2>
              <span className="text-xs text-white/40">({filteredCredits.length})</span>
            </div>
            <button
              onClick={() => openCreateModal("credit")}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition"
            >
              <Plus size={13} /> Add Card Product
            </button>
          </div>

          {filteredCredits.length === 0 ? (
            <div className="p-8 rounded-xl border border-white/5 bg-white/[0.01] text-center space-y-2">
              <p className="text-xs text-white/40">No credit card products found matching your filters.</p>
              <button
                onClick={() => openCreateModal("credit")}
                className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-medium hover:bg-blue-500/30 transition"
              >
                Create First Card Product
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCredits.map((p) => {
                const s = p.stats || {};
                const design = getCardDesignStyle(p.cardDesign || "obsidian_vip");
                let perksList: string[] = [];
                try {
                  if (p.perksJson) perksList = JSON.parse(p.perksJson);
                } catch {}

                return (
                  <div
                    key={p.id}
                    className="p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-3">
                      {/* Realistic Visual Card Preview */}
                      <div className={`p-4 rounded-xl border shadow-lg relative overflow-hidden ${design.bg}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-mono tracking-widest uppercase opacity-70">
                              {bank?.name || "ONYX NETWORK"}
                            </span>
                            <h4 className="text-sm font-bold text-white tracking-wide mt-0.5">
                              {p.name}
                            </h4>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${design.badge}`}>
                            {p.cardKind === "debit" ? "DEBIT" : "CREDIT"}
                          </span>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-4 rounded bg-amber-400/80 border border-amber-300/40 shadow-inner flex items-center justify-center">
                              <div className="w-3 h-2 border-r border-b border-black/30"></div>
                            </div>
                            <span className="text-[11px] font-mono tracking-wider opacity-80">•••• 8824</span>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] opacity-60 uppercase font-mono">Limit</p>
                            <p className="text-xs font-mono font-bold text-white tabular-nums">
                              {formatMoney(p.maxLimit)}
                            </p>
                          </div>
                        </div>

                        {p.rewardsPercent > 0 && (
                          <div className="mt-2 text-[10px] font-semibold text-amber-300 flex items-center gap-1">
                            <Sparkles size={11} /> {p.rewardsPercent}% Cashback Rewards
                          </div>
                        )}
                      </div>

                      {/* Tagline / Description */}
                      {p.description && (
                        <p className="text-xs text-white/60 line-clamp-2">
                          {p.description}
                        </p>
                      )}

                      {/* Financial Pricing Metadata */}
                      <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-black/30 border border-white/5 text-center">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">APR</p>
                          <p className="text-xs font-bold font-mono text-blue-400 tabular-nums">
                            {p.interestRate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Annual Fee</p>
                          <p className="text-xs font-bold font-mono text-white tabular-nums">
                            {formatMoney(p.annualFeeCents || 0)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Grace Period</p>
                          <p className="text-xs font-bold font-mono text-white/80 tabular-nums">
                            {p.gracePeriodDays || 21}d
                          </p>
                        </div>
                      </div>

                      {/* Perks preview */}
                      {Array.isArray(perksList) && perksList.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-white/40 uppercase font-mono">Included Benefits</p>
                          <div className="space-y-0.5">
                            {perksList.slice(0, 2).map((perk, i) => (
                              <div key={i} className="text-xs text-white/70 flex items-center gap-1.5 truncate">
                                <Check size={11} className="text-emerald-400 shrink-0" />
                                <span className="truncate">{perk}</span>
                              </div>
                            ))}
                            {perksList.length > 2 && (
                              <p className="text-[10px] text-white/40">+{perksList.length - 2} more benefits</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Live Portfolio Telemetry */}
                      <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/40">Issued Cards</span>
                          <span className="font-mono tabular-nums font-semibold text-white">
                            {s.activeCardsCount || 0} active
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-white/40">
                          <span>Limit Extended: {formatMoney(s.totalLimitCents || 0)}</span>
                          <span className="font-mono">{s.utilizationPercent || 0}% Utilized</span>
                        </div>
                        {s.pendingApplicationsCount > 0 && (
                          <div className="text-[11px] text-amber-300 font-medium">
                            ★ {s.pendingApplicationsCount} Pending Applications Awaiting Review
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="pt-2 flex items-center justify-between border-t border-white/5">
                      <button
                        onClick={() => setDetailProduct({ product: p, type: "credit" })}
                        className="text-xs text-white/70 hover:text-white font-medium flex items-center gap-1 transition"
                      >
                        <Eye size={12} />
                        <span>View Cardholders & Stats</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleActive(p, "credit")}
                          title="Toggle Active"
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition ${
                            p.isActive
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                              : "bg-white/5 text-white/40 border-white/10"
                          }`}
                        >
                          {p.isActive ? "ACTIVE" : "DISABLED"}
                        </button>
                        <button
                          onClick={() => handleDuplicate(p, "credit")}
                          title="Duplicate Product"
                          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => openEditModal(p, "credit")}
                          title="Edit Product"
                          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(p, "credit")}
                          title="Delete Product"
                          className="p-1.5 rounded-md hover:bg-rose-500/20 text-white/30 hover:text-rose-400 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* HIGH-YIELD VAULT & CD PRODUCTS SECTION */}
      {(selectedCategory === "all" || selectedCategory === "vault") && (
        <div className="space-y-3.5 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-white">High-Yield Vault & Term Deposit Products</h2>
              <span className="text-xs text-white/40">({filteredVaults.length})</span>
            </div>
            <button
              onClick={() => openCreateModal("vault")}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition"
            >
              <Plus size={13} /> Add Vault Product
            </button>
          </div>

          {filteredVaults.length === 0 ? (
            <div className="p-8 rounded-xl border border-white/5 bg-white/[0.01] text-center space-y-2">
              <p className="text-xs text-white/40">No vault deposit products created yet.</p>
              <button
                onClick={() => openCreateModal("vault")}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30 transition"
              >
                Create First Vault Product
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredVaults.map((p) => {
                const s = p.stats || {};
                return (
                  <div
                    key={p.id}
                    className="p-5 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition flex flex-col justify-between space-y-4 group"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white group-hover:text-amber-300 transition">
                            {p.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mt-0.5">
                            <span>{p.lockupDays} Days Lockup</span>
                            <span>·</span>
                            <span className="capitalize">{p.compoundFrequency || "Monthly"} Compounding</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleToggleActive(p, "vault")}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition ${
                            p.isActive
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                              : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          {p.isActive ? "ACTIVE" : "DISABLED"}
                        </button>
                      </div>

                      {p.description && (
                        <p className="text-xs text-white/60 line-clamp-2">
                          {p.description}
                        </p>
                      )}

                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-black/30 border border-white/5 text-center">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">APY Yield</p>
                          <p className="text-xs font-bold font-mono text-amber-400 tabular-nums">
                            {(p.interestRate || 0) / 100}% APY
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Min Deposit</p>
                          <p className="text-xs font-bold font-mono text-white tabular-nums">
                            {formatMoney(p.minDeposit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-mono">Early Break</p>
                          <p className="text-xs font-bold font-mono text-rose-400 tabular-nums">
                            {(p.earlyWithdrawalPenaltyPercent || 200) / 100}%
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Total Locked</span>
                          <span className="font-mono font-semibold text-white">
                            {formatMoney(s.totalLockedCents || 0)}
                          </span>
                        </div>
                        <div className="text-[11px] text-white/40">
                          {s.activeDepositsCount || 0} active lockups ({s.maturedDepositsCount || 0} matured)
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-white/5">
                      <button
                        onClick={() => setDetailProduct({ product: p, type: "vault" })}
                        className="text-xs text-white/70 hover:text-white font-medium flex items-center gap-1 transition"
                      >
                        <Eye size={12} />
                        <span>View Details</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDuplicate(p, "vault")}
                          title="Duplicate Product"
                          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition"
                        >
                          <Copy size={13} />
                        </button>
                        <button
                          onClick={() => openEditModal(p, "vault")}
                          title="Edit Product"
                          className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(p, "vault")}
                          title="Delete Product"
                          className="p-1.5 rounded-md hover:bg-rose-500/20 text-white/30 hover:text-rose-400 transition"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRODUCT CREATION & EDITING MODAL                                          */}
      {/* ========================================================================= */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <form
            onSubmit={handleFormSubmit}
            className="bg-[#111118] border border-white/15 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 my-8 flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {modalMode === "edit" ? `Edit Product: ${editingProduct?.name}` : `Create New ${formType === "loan" ? "Loan" : formType === "vault" ? "Term Vault" : "Card"} Product`}
                </h3>
                <p className="text-xs text-white/40">
                  Configure interest rates, fees, underwriting guidelines, and visual branding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-white/40 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Product Type Selector (Only on create) */}
            {modalMode === "create" && (
              <div className="p-4 border-b border-white/5 bg-black/20">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormType("loan");
                      setLiveProductName("Prime Commercial Loan");
                      setLiveApr(7.5);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition border flex items-center justify-center gap-1.5 ${
                      formType === "loan"
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                        : "bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5"
                    }`}
                  >
                    <DollarSign size={14} /> Term Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormType("credit");
                      setLiveProductName("Onyx Platinum Rewards");
                      setLiveApr(14.9);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition border flex items-center justify-center gap-1.5 ${
                      formType === "credit"
                        ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                        : "bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5"
                    }`}
                  >
                    <CreditCard size={14} /> Credit & Debit Card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormType("vault");
                      setLiveProductName("High-Yield Term CD");
                      setLiveApr(4.5);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition border flex items-center justify-center gap-1.5 ${
                      formType === "vault"
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                        : "bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/5"
                    }`}
                  >
                    <Lock size={14} /> High-Yield Vault
                  </button>
                </div>
              </div>
            )}

            {/* Modal Tab Navigation */}
            <div className="px-5 border-b border-white/10 bg-white/[0.01] flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab("basics")}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === "basics"
                    ? "border-white text-white font-semibold"
                    : "border-transparent text-white/40 hover:text-white/80"
                }`}
              >
                1. Basic Info & Branding
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("financial")}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === "financial"
                    ? "border-white text-white font-semibold"
                    : "border-transparent text-white/40 hover:text-white/80"
                }`}
              >
                2. Rates & Limits
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("fees")}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === "fees"
                    ? "border-white text-white font-semibold"
                    : "border-transparent text-white/40 hover:text-white/80"
                }`}
              >
                3. Fees & Surcharges
              </button>
              {formType === "credit" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("perks")}
                  className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                    activeTab === "perks"
                      ? "border-white text-white font-semibold"
                      : "border-transparent text-white/40 hover:text-white/80"
                  }`}
                >
                  4. Card Perks & Rewards
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("underwriting")}
                className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                  activeTab === "underwriting"
                    ? "border-white text-white font-semibold"
                    : "border-transparent text-white/40 hover:text-white/80"
                }`}
              >
                {formType === "credit" ? "5. Underwriting Rules" : "4. Underwriting Rules"}
              </button>
            </div>

            {/* Modal Body / Tab Content */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {/* TAB 1: BASICS */}
              {activeTab === "basics" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">Product Title *</label>
                    <input
                      required
                      name="name"
                      type="text"
                      defaultValue={editingProduct?.name || liveProductName}
                      onChange={(e) => setLiveProductName(e.target.value)}
                      placeholder="e.g. Onyx Commercial Credit Line"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1">Marketing Tagline / Description</label>
                    <textarea
                      name="description"
                      rows={2}
                      defaultValue={editingProduct?.description || ""}
                      placeholder="e.g. Tier-1 business financing designed for corporate growth with competitive revolving terms."
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                    />
                  </div>

                  {formType === "loan" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Lending Category</label>
                        <select
                          name="category"
                          defaultValue={editingProduct?.category || "personal"}
                          className="w-full bg-[#16161f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="personal">Personal Loan</option>
                          <option value="business">Commercial & Business Loan</option>
                          <option value="mortgage">Mortgage & Real Estate</option>
                          <option value="micro">Micro-Advance / Payday</option>
                          <option value="auto">Vehicle & Equipment Financing</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Repayment Schedule</label>
                        <select
                          name="repaymentFrequency"
                          defaultValue={editingProduct?.repaymentFrequency || "monthly"}
                          className="w-full bg-[#16161f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="monthly">Monthly Installments</option>
                          <option value="biweekly">Bi-weekly Installments</option>
                          <option value="weekly">Weekly Installments</option>
                          <option value="daily">Daily Installments</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {formType === "credit" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Card Classification</label>
                          <select
                            name="cardKind"
                            value={liveCardKind}
                            onChange={(e) => setLiveCardKind(e.target.value)}
                            className="w-full bg-[#16161f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                          >
                            <option value="credit">Revolving Credit Card</option>
                            <option value="debit">Direct Debit Card</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Visual Card Skin Theme</label>
                          <select
                            name="cardDesign"
                            value={liveCardDesign}
                            onChange={(e) => setLiveCardDesign(e.target.value)}
                            className="w-full bg-[#16161f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                          >
                            <option value="obsidian_vip">Obsidian VIP (Black / Platinum)</option>
                            <option value="gold_prestige">Gold Prestige (Brushed Amber)</option>
                            <option value="emerald_corp">Emerald Commercial (Deep Green)</option>
                            <option value="sapphire_rewards">Sapphire Rewards (Cobalt Blue)</option>
                            <option value="velvet_crimson">Velvet Crimson (Deep Rose)</option>
                            <option value="cyber_neon">Cyberpunk Neon (Cyan / Purple)</option>
                            <option value="classic_dark">Classic Slate</option>
                          </select>
                        </div>
                      </div>

                      {/* Interactive Card Live Preview */}
                      <div>
                        <p className="text-[11px] font-medium text-white/40 uppercase mb-2">Live Visual Card Preview</p>
                        <div className={`p-4 rounded-xl border max-w-sm shadow-xl ${getCardDesignStyle(liveCardDesign).bg}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[9px] font-mono tracking-widest opacity-60 uppercase">{bank?.name || "ONYX BANK"}</p>
                              <p className="text-xs font-bold text-white mt-0.5">{liveProductName || "Card Name"}</p>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/15 border border-white/20">
                              {liveCardKind.toUpperCase()}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-[11px] font-mono opacity-70">•••• 5821</span>
                            <span className="text-xs font-mono font-bold text-white tabular-nums">{liveApr}% APR</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {formType === "vault" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Compounding Cadence</label>
                        <select
                          name="compoundFrequency"
                          defaultValue={editingProduct?.compoundFrequency || "monthly"}
                          className="w-full bg-[#16161f] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                        >
                          <option value="monthly">Monthly Compounding</option>
                          <option value="daily">Daily Compounding</option>
                          <option value="maturity">Paid at Maturity Only</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Lockup Term Duration (Days)</label>
                        <input
                          type="number"
                          required
                          name="lockupDays"
                          defaultValue={editingProduct?.lockupDays || 90}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2.5 text-xs text-white/90 cursor-pointer">
                      <input
                        type="checkbox"
                        name="isActive"
                        defaultChecked={editingProduct ? !!editingProduct.isActive : true}
                        className="rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-0"
                      />
                      <span>Active & Available in Customer Application Portals</span>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 2: RATES & LIMITS */}
              {activeTab === "financial" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        {formType === "vault" ? "Annual Percentage Yield (APY %)" : "Annual Percentage Rate (APR %)"} *
                      </label>
                      <input
                        required
                        name="interestRate"
                        type="number"
                        step="0.01"
                        defaultValue={editingProduct ? (formType === "vault" ? (editingProduct.interestRate / 100) : editingProduct.interestRate) : liveApr}
                        onChange={(e) => setLiveApr(Number(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        placeholder="7.5"
                      />
                      <p className="text-[11px] text-white/40 mt-1">Stated annual rate applied or accrued.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">
                        {formType === "loan" ? "Maximum Loan Amount ($)" : formType === "vault" ? "Minimum Deposit ($)" : "Maximum Credit Limit ($)"} *
                      </label>
                      <input
                        required
                        name={formType === "vault" ? "minDeposit" : "maxLimit"}
                        type="number"
                        step="1"
                        defaultValue={
                          editingProduct
                            ? formType === "vault"
                              ? editingProduct.minDeposit / 100
                              : (editingProduct.maxAmount || editingProduct.maxLimit) / 100
                            : 5000
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        placeholder="10000"
                      />
                    </div>
                  </div>

                  {formType === "loan" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Minimum Loan Amount ($)</label>
                        <input
                          name="minAmount"
                          type="number"
                          defaultValue={editingProduct ? (editingProduct.minAmount || 10000) / 100 : 100}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Default Term Duration (Days) *</label>
                        <input
                          required
                          name="termDays"
                          type="number"
                          defaultValue={editingProduct?.termDays || 30}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                  )}

                  {formType === "credit" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Rewards / Cashback Rate (%)</label>
                        <input
                          name="rewardsPercent"
                          type="number"
                          step="0.1"
                          defaultValue={editingProduct?.rewardsPercent || 1.5}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Minimum Monthly Payment (%)</label>
                        <input
                          name="minPaymentPercent"
                          type="number"
                          step="0.5"
                          defaultValue={editingProduct ? (editingProduct.minPaymentPercent || 500) / 100 : 5.0}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                  )}

                  {formType === "vault" && (
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Optional Max Deposit Cap ($)</label>
                      <input
                        name="maxDeposit"
                        type="number"
                        defaultValue={editingProduct?.maxDeposit ? editingProduct.maxDeposit / 100 : ""}
                        placeholder="Leave blank for no deposit ceiling"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: FEES & SURCHARGES */}
              {activeTab === "fees" && (
                <div className="space-y-4">
                  {formType === "loan" && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Origination Fee (%)</label>
                        <input
                          name="originationFeePercent"
                          type="number"
                          step="0.1"
                          defaultValue={editingProduct ? (editingProduct.originationFeePercent || 0) / 100 : 1.0}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                        <p className="text-[10px] text-white/40 mt-1">Deducted at disbursement</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Late Payment Fee (%)</label>
                        <input
                          name="lateFeePercent"
                          type="number"
                          step="0.1"
                          defaultValue={editingProduct ? (editingProduct.lateFeePercent || 500) / 100 : 5.0}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Grace Period (Days)</label>
                        <input
                          name="gracePeriodDays"
                          type="number"
                          defaultValue={editingProduct?.gracePeriodDays || 3}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                  )}

                  {formType === "credit" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Annual Fee ($)</label>
                          <input
                            name="annualFee"
                            type="number"
                            step="1"
                            defaultValue={editingProduct ? (editingProduct.annualFeeCents || 0) / 100 : 0}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Late Fee ($)</label>
                          <input
                            name="latePaymentFee"
                            type="number"
                            step="1"
                            defaultValue={editingProduct ? (editingProduct.latePaymentFeeCents || 2500) / 100 : 25}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Grace Period (Days)</label>
                          <input
                            name="gracePeriodDays"
                            type="number"
                            defaultValue={editingProduct?.gracePeriodDays || 21}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Cash Advance Fee (%)</label>
                          <input
                            name="cashAdvanceFeePercent"
                            type="number"
                            step="0.1"
                            defaultValue={editingProduct ? (editingProduct.cashAdvanceFeePercent || 300) / 100 : 3.0}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-white/70 mb-1">Foreign FX Fee (%)</label>
                          <input
                            name="foreignTxFeePercent"
                            type="number"
                            step="0.1"
                            defaultValue={editingProduct ? (editingProduct.foreignTxFeePercent || 0) / 100 : 0}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-white/80 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          name="cashAdvanceEnabled"
                          defaultChecked={editingProduct?.cashAdvanceEnabled !== false}
                          className="rounded border-white/20 bg-black/40 text-blue-500 focus:ring-0"
                        />
                        <span>Permit Cash Advances / ATM Withdrawals on this card</span>
                      </label>
                    </div>
                  )}

                  {formType === "vault" && (
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Early Break Penalty (%)</label>
                      <input
                        name="earlyWithdrawalPenaltyPercent"
                        type="number"
                        step="0.1"
                        defaultValue={editingProduct ? (editingProduct.earlyWithdrawalPenaltyPercent || 200) / 100 : 2.0}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                      />
                      <p className="text-[11px] text-white/40 mt-1">
                        Penalty charged against principal balance if broken prior to maturity.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CARD PERKS (FOR CREDIT) */}
              {activeTab === "perks" && formType === "credit" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Welcome Bonus ($)</label>
                      <input
                        name="welcomeBonus"
                        type="number"
                        step="1"
                        defaultValue={editingProduct ? (editingProduct.welcomeBonusCents || 0) / 100 : 0}
                        placeholder="e.g. 50"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                      />
                      <p className="text-[10px] text-white/40 mt-1">One-time spend credit awarded to new cardholders</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">Cardholder Perks & Benefits List</label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newPerkInput}
                          onChange={(e) => setNewPerkInput(e.target.value)}
                          placeholder="e.g. Complimentary Travel Insurance & Airport Lounge Access"
                          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (newPerkInput.trim()) {
                                setFormPerks([...formPerks, newPerkInput.trim()]);
                                setNewPerkInput("");
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newPerkInput.trim()) {
                              setFormPerks([...formPerks, newPerkInput.trim()]);
                              setNewPerkInput("");
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-white font-medium transition"
                        >
                          Add Perk
                        </button>
                      </div>

                      {formPerks.length === 0 ? (
                        <p className="text-xs text-white/30 italic p-2">No perks added yet. Add promotional bullet points above.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto p-1">
                          {formPerks.map((perk, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs text-white/90">
                              <div className="flex items-center gap-2">
                                <Sparkles size={13} className="text-amber-300" />
                                <span>{perk}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFormPerks(formPerks.filter((_, i) => i !== idx))}
                                className="text-white/30 hover:text-rose-400 p-1"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: UNDERWRITING & QUALIFICATION */}
              {activeTab === "underwriting" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Minimum Credit Score</label>
                      <input
                        name="minCreditScore"
                        type="number"
                        defaultValue={editingProduct?.minCreditScore || 0}
                        placeholder="0 = No score threshold"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Citizens below this rating are auto-flagged for review</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/70 mb-1">Account Tier Gating (Optional)</label>
                      <input
                        name="tierId"
                        type="text"
                        defaultValue={editingProduct?.tierId || ""}
                        placeholder="e.g. VIP, Platinum, Commercial"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Leave blank to make available to all customer tiers</p>
                    </div>
                  </div>

                  {formType === "loan" && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-white/70 mb-1">Auto-Approval Max Limit ($)</label>
                        <input
                          name="autoApproveMaxAmount"
                          type="number"
                          defaultValue={editingProduct ? (editingProduct.autoApproveMaxAmount || 0) / 100 : 0}
                          placeholder="0 = All loans require manual review"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-white/30"
                        />
                      </div>

                      <div className="flex items-center pt-5">
                        <label className="flex items-center gap-2.5 text-xs text-white/90 cursor-pointer">
                          <input
                            type="checkbox"
                            name="collateralRequired"
                            defaultChecked={!!editingProduct?.collateralRequired}
                            className="rounded border-white/20 bg-black/40 text-amber-500 focus:ring-0"
                          />
                          <span>Mandatory Physical / Account Collateral</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white transition"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs transition hover:bg-white/90 shadow-sm flex items-center gap-1.5"
                >
                  {submitting && <Loader2 size={13} className="animate-spin" />}
                  <span>{modalMode === "edit" ? "Save Product Changes" : "Create & Launch Product"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRODUCT DETAILS & ACCOUNTS DRAWER                                         */}
      {/* ========================================================================= */}
      {detailProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-end z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#0f0f15] border-l border-white/10 h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 border-b border-white/10 flex items-start justify-between bg-white/[0.02]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 font-mono text-white/70 uppercase">
                    {detailProduct.type}
                  </span>
                  <h3 className="text-lg font-bold text-white">
                    {detailProduct.product.name}
                  </h3>
                </div>
                <p className="text-xs text-white/50 mt-1">
                  Product ID: <span className="font-mono">{detailProduct.product.id}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const p = detailProduct.product;
                    const t = detailProduct.type;
                    setDetailProduct(null);
                    openEditModal(p, t);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium flex items-center gap-1.5 transition"
                >
                  <Edit3 size={13} /> Edit
                </button>
                <button
                  onClick={() => setDetailProduct(null)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {loadingDetail ? (
                <div className="p-10 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="animate-spin text-white/40" size={24} />
                  <p className="text-xs text-white/40">Loading customer ledger telemetry...</p>
                </div>
              ) : (
                <>
                  {/* Quick Stat Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase font-mono">Interest / APY</p>
                      <p className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
                        {detailProduct.type === "vault" ? (detailProduct.product.interestRate / 100) : detailProduct.product.interestRate}%
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase font-mono">
                        {detailProduct.type === "vault" ? "Min Deposit" : "Limit / Max"}
                      </p>
                      <p className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
                        {formatMoney(detailProduct.product.maxAmount || detailProduct.product.maxLimit || detailProduct.product.minDeposit)}
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <p className="text-[10px] text-white/40 uppercase font-mono">Status</p>
                      <p className={`text-xs font-bold font-mono uppercase mt-1 ${detailProduct.product.isActive ? "text-emerald-400" : "text-white/40"}`}>
                        {detailProduct.product.isActive ? "Active" : "Disabled"}
                      </p>
                    </div>
                  </div>

                  {/* Customer Accounts / Cards Utilizing this Product */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        {detailProduct.type === "credit" ? "Active Cardholders" : detailProduct.type === "vault" ? "Locked Deposit Accounts" : "Active Borrowers & Loans"}
                      </h4>
                      <span className="text-xs text-white/40">
                        {detailData?.recentAccounts?.length || 0} Records
                      </span>
                    </div>

                    {(!detailData?.recentAccounts || detailData.recentAccounts.length === 0) ? (
                      <div className="p-6 rounded-xl border border-white/5 bg-white/[0.01] text-center">
                        <p className="text-xs text-white/40">No active accounts or cards currently holding this product.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {detailData.recentAccounts.map((acc: any) => (
                          <div
                            key={acc.id}
                            className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition flex items-center justify-between"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-white">
                                  {acc.accountName || acc.accountId}
                                </p>
                                <button
                                  onClick={() => copyToClipboard(acc.accountId || acc.id, acc.id)}
                                  className="text-white/30 hover:text-white"
                                  title="Copy Account ID"
                                >
                                  {copiedId === acc.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                </button>
                              </div>
                              <p className="text-[11px] text-white/40">
                                Owner: <span className="font-mono">{acc.ownerDiscordId || "Unknown"}</span> · Joined {safeFormatDate(acc.createdAt)}
                              </p>
                            </div>

                            <div className="text-right">
                              {acc.remainingBalance !== undefined ? (
                                <>
                                  <p className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                                    {formatMoney(acc.remainingBalance)}
                                  </p>
                                  <p className="text-[10px] text-white/40 uppercase">Remaining</p>
                                </>
                              ) : acc.creditUsed !== undefined ? (
                                <>
                                  <p className="text-xs font-mono font-bold text-blue-400 tabular-nums">
                                    {formatMoney(acc.creditUsed)} / {formatMoney(acc.creditLimit)}
                                  </p>
                                  <p className="text-[10px] text-white/40 uppercase">Drawn Limit</p>
                                </>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Credit Applications (If Credit Product) */}
                  {detailProduct.type === "credit" && detailData?.recentApplications?.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Recent Applications
                      </h4>
                      <div className="space-y-2">
                        {detailData.recentApplications.map((app: any) => (
                          <div
                            key={app.id}
                            className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-semibold text-white font-mono">{app.discordId}</p>
                              <p className="text-[11px] text-white/40">
                                Requested {formatMoney(app.requestedLimit)} · Income: {formatMoney(app.monthlyIncome)}/mo
                              </p>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                              app.status === "approved"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : app.status === "rejected"
                                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                            }`}>
                              {app.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INTERACTIVE PRODUCT SIMULATOR & QUOTE CALCULATOR                           */}
      {/* ========================================================================= */}
      {showSimulator && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111118] border border-white/15 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Calculator size={18} className="text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Financial Product Simulator</h3>
              </div>
              <button onClick={() => setShowSimulator(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Product Selector */}
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">Select Product to Simulate</label>
                <select
                  value={simProduct?.id || ""}
                  onChange={(e) => {
                    const allP = [...loans, ...credits, ...vaults];
                    const found = allP.find(x => x.id === e.target.value);
                    if (found) setSimProduct(found);
                  }}
                  className="w-full bg-[#16161f] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                >
                  <optgroup label="Loan Products">
                    {loans.map(l => <option key={l.id} value={l.id}>{l.name} ({l.interestRate}% APR)</option>)}
                  </optgroup>
                  <optgroup label="Credit Cards">
                    {credits.map(c => <option key={c.id} value={c.id}>{c.name} ({c.interestRate}% APR)</option>)}
                  </optgroup>
                </select>
              </div>

              {simProduct && (
                <>
                  {/* Amount Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-white/70">Principal / Borrow Amount:</span>
                      <span className="font-mono font-bold text-white text-sm">{formatMoney(simAmount * 100)}</span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={Math.max(10000, ((simProduct.maxAmount || simProduct.maxLimit || 1000000) / 100))}
                      step={100}
                      value={simAmount}
                      onChange={(e) => setSimAmount(Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Calculated Breakdown Matrix */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/40">Interest Rate:</span>
                      <span className="font-mono text-white">{simProduct.interestRate}% APR</span>
                    </div>

                    {simProduct.termDays && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Loan Tenor:</span>
                        <span className="font-mono text-white">{simProduct.termDays} Days</span>
                      </div>
                    )}

                    {simProduct.originationFeePercent > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">Origination Fee ({simProduct.originationFeePercent / 100}%):</span>
                        <span className="font-mono text-amber-400">
                          {formatMoney(simAmount * (simProduct.originationFeePercent / 100))}
                        </span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-sm font-semibold">
                      <span className="text-white">Estimated Finance Charge:</span>
                      <span className="font-mono text-emerald-400 tabular-nums">
                        {formatMoney(Math.round((simAmount * 100) * (simProduct.interestRate / 100) * ((simProduct.termDays || 365) / 365)))}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 border-t border-white/10 bg-white/[0.02] text-right">
              <button
                onClick={() => setShowSimulator(false)}
                className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-white/90 transition"
              >
                Close Calculator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
