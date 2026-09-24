import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { 
  LifeBuoy, MessageSquare, AlertCircle, ShieldAlert, CheckCircle2, 
  Clock, Send, RefreshCw, Filter, User, Search, ChevronRight,
  Sparkles, ArrowLeft, Paperclip, Check, AlertTriangle, FileText,
  CreditCard, ShieldCheck, Landmark, Tag
} from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";
import { PageIntro } from "../components/ui/chrome";

export function BankTickets() {
  const { bankId } = useParams();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [ticketContext, setTicketContext] = useState<any>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [staffNotes, setStaffNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [resolvingAction, setResolvingAction] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolveModalOpen, setResolveModalOpen] = useState(false);

  const fetchTickets = () => {
    if (!bankId) return;
    fetch(`/api/banks/${bankId}/tickets`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setTickets(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 10000);
    return () => clearInterval(interval);
  }, [bankId]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  useEffect(() => {
    if (selectedTicket) {
      setStaffNotes(selectedTicket.staffNotes || "");
    }
  }, [selectedTicketId]);

  // Fetch rich context when ticket is selected
  useEffect(() => {
    if (!bankId || !selectedTicketId) {
      setTicketContext(null);
      return;
    }
    setLoadingContext(true);
    fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}/context`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setTicketContext(data);
        setLoadingContext(false);
      })
      .catch(() => setLoadingContext(false));
  }, [bankId, selectedTicketId]);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankId || !selectedTicketId || !replyMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyMessage }),
      });
      if (res.ok) {
        setReplyMessage("");
        fetchTickets();
      }
    } finally {
      setIsSending(false);
    }
  };

  const updateStatus = async (newStatus: string) => {
    if (!bankId || !selectedTicketId) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchTickets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updatePriority = async (newPriority: string) => {
    if (!bankId || !selectedTicketId) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (res.ok) {
        fetchTickets();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveNotes = async () => {
    if (!bankId || !selectedTicketId || isSavingNotes) return;
    setIsSavingNotes(true);
    try {
      const res = await fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffNotes }),
      });
      if (res.ok) {
        fetchTickets();
      }
    } finally {
      setIsSavingNotes(false);
    }
  };

  const executeDisputeResolution = async (action: string) => {
    if (!bankId || !selectedTicketId) return;
    setResolvingAction(action);
    try {
      const res = await fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}/resolve-dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, resolutionNotes }),
      });
      if (res.ok) {
        setResolveModalOpen(false);
        setResolutionNotes("");
        fetchTickets();
        // Refresh context
        const ctxRes = await fetch(`/api/banks/${bankId}/tickets/${selectedTicketId}/context`);
        if (ctxRes.ok) setTicketContext(await ctxRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setResolvingAction(null);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSubject = t.subject?.toLowerCase().includes(q);
      const matchClient = (t.mcUsername || t.discordId || "").toLowerCase().includes(q);
      const matchId = t.id?.toLowerCase().includes(q);
      return matchSubject || matchClient || matchId;
    }
    return true;
  });

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case "transaction_dispute": return <AlertTriangle size={14} className="text-amber-400" />;
      case "card_issue": return <CreditCard size={14} className="text-purple-400" />;
      case "escrow_dispute": return <ShieldCheck size={14} className="text-emerald-400" />;
      case "loan_inquiry": return <Landmark size={14} className="text-blue-400" />;
      case "security_alert": return <ShieldAlert size={14} className="text-rose-400" />;
      default: return <LifeBuoy size={14} className="text-indigo-400" />;
    }
  };

  const priorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">Urgent</span>;
      case "high":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">High</span>;
      case "low":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/5 text-white/50 border border-white/10">Low</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30">Medium</span>;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Open</span>;
      case "in_progress":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">In Progress</span>;
      case "resolved":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30">Resolved</span>;
      case "closed":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-white/40 border border-white/10">Closed</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white/10 text-white/60">{status}</span>;
    }
  };

  const openCount = tickets.filter(t => t.status === "open").length;
  const inProgressCount = tickets.filter(t => t.status === "in_progress").length;
  const disputeCount = tickets.filter(t => t.category?.includes("dispute") && t.status !== "closed").length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 page-enter pb-12">
      <PageIntro
        kicker="Support & Disputes"
        title="Customer Support Desk"
        description="Review incoming customer inquiries, investigate transaction disputes, and communicate with account holders."
        actions={
          <button
            onClick={fetchTickets}
            className="min-h-11 px-4 py-2.5 text-xs font-bold border border-white/10 rounded-xl flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white transition"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/40">Open Tickets</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{openCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/40">In Progress</p>
          <p className="text-2xl font-black text-indigo-400 mt-1">{inProgressCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/40">Active Disputes</p>
          <p className="text-2xl font-black text-amber-400 mt-1">{disputeCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0d0d14] p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/40">Total Lifetime</p>
          <p className="text-2xl font-black text-white mt-1">{tickets.length}</p>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Ticket List */}
        <div className="lg:col-span-5 space-y-3">
          {/* Filter Toolbar */}
          <div className="p-3 bg-[#12121a] border border-white/10 rounded-2xl space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-white/30" size={14} />
              <input
                type="text"
                placeholder="Search by client, ID, or subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#181822] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex gap-2 text-xs">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="flex-1 bg-[#181822] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-1 bg-[#181822] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="all">All Categories</option>
                <option value="transaction_dispute">Disputes</option>
                <option value="card_issue">Cards</option>
                <option value="escrow_dispute">Escrow</option>
                <option value="loan_inquiry">Loans</option>
                <option value="security_alert">Security</option>
                <option value="general">General</option>
              </select>
            </div>
          </div>

          {/* Ticket Scroll List */}
          <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
            {loading ? (
              <div className="text-center p-8 text-white/40 text-xs flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin" /> Loading support queue...
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center p-8 border border-white/5 rounded-2xl bg-white/[0.01] text-xs text-white/40">
                No tickets found matching current filters.
              </div>
            ) : (
              filteredTickets.map(t => {
                const isSelected = t.id === selectedTicketId;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`p-4 rounded-2xl border transition cursor-pointer text-left ${
                      isSelected
                        ? "bg-white/[0.08] border-indigo-500/50 shadow-lg"
                        : "bg-[#12121a] border-white/10 hover:border-white/20 hover:bg-[#161622]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {categoryIcon(t.category)}
                        <span className="text-xs font-bold text-white truncate max-w-[200px]">
                          {t.subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {priorityBadge(t.priority)}
                        {statusBadge(t.status)}
                      </div>
                    </div>

                    <p className="text-xs text-white/60 line-clamp-2 mt-1.5 font-sans">
                      {t.description || (t.messages && t.messages[0]?.message) || "No description provided."}
                    </p>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5 text-[11px] text-white/40 font-mono">
                      <div className="flex items-center gap-1.5">
                        <User size={12} />
                        <span className="text-white/70">{t.mcUsername || t.discordId}</span>
                      </div>
                      <span>{t.createdAt ? format(new Date(t.createdAt), "MMM d, h:mm a") : ""}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Ticket Conversation & Controls */}
        <div className="lg:col-span-7">
          {selectedTicket ? (
            <div className="bg-[#12121a] border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl">
              {/* Ticket Top Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                      Ticket #{selectedTicket.id.slice(-8)}
                    </span>
                    {priorityBadge(selectedTicket.priority)}
                    {statusBadge(selectedTicket.status)}
                  </div>
                  <h2 className="text-xl font-black text-white mt-1">{selectedTicket.subject}</h2>
                  <p className="text-xs text-white/50 mt-0.5 flex items-center gap-2">
                    <span>Client: <strong className="text-white">{selectedTicket.mcUsername || selectedTicket.discordId}</strong></span>
                    <span>·</span>
                    <span>Opened: {selectedTicket.createdAt ? format(new Date(selectedTicket.createdAt), "MMMM d, yyyy h:mm a") : ""}</span>
                  </p>
                </div>

                {/* Status Toggles */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => updateStatus(e.target.value)}
                    className="bg-[#181822] border border-white/15 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>

                  <select
                    value={selectedTicket.priority}
                    onChange={(e) => updatePriority(e.target.value)}
                    className="bg-[#181822] border border-white/15 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              {/* Context Links Banner & Dispute Resolution Card */}
              {(selectedTicket.transactionId || selectedTicket.accountId || selectedTicket.escrowId || ticketContext) && (
                <div className="rounded-2xl p-4 bg-indigo-500/10 border border-indigo-500/20 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-300 uppercase tracking-wider text-[11px]">
                      <FileText size={13} /> Linked Banking Context & Evidence
                    </div>
                    {/* Action buttons for disputes */}
                    {selectedTicket.status !== "closed" && selectedTicket.status !== "resolved" && (
                      <button
                        onClick={() => setResolveModalOpen(true)}
                        className="px-3 py-1 rounded-xl font-bold text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow"
                      >
                        <ShieldAlert size={12} /> Resolve / Mediate Dispute
                      </button>
                    )}
                  </div>

                  {loadingContext ? (
                    <div className="text-white/40 italic text-center py-2">Loading context records…</div>
                  ) : (
                    <div className="space-y-3">
                      {/* Linked Transaction Card */}
                      {ticketContext?.linkedTx && (
                        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-rose-300 flex items-center gap-1">
                              <AlertTriangle size={13} /> Disputed Double-Entry Transaction
                            </span>
                            <span className="font-mono text-emerald-400 font-bold text-sm">
                              {formatMoney(ticketContext.linkedTx.amount)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-white/70 pt-1 border-t border-white/5">
                            <div>
                              <span className="text-white/40 block text-[10px]">From Account:</span>
                              <span className="font-semibold text-white truncate block">{ticketContext.linkedTx.fromAccountName || ticketContext.linkedTx.fromAccountId}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[10px]">To Account:</span>
                              <span className="font-semibold text-white truncate block">{ticketContext.linkedTx.toAccountName || ticketContext.linkedTx.toAccountId}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[10px]">Settled:</span>
                              <span>{ticketContext.linkedTx.createdAt ? format(new Date(ticketContext.linkedTx.createdAt), "MMM d, h:mm a") : "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[10px]">Type / Fee:</span>
                              <span className="uppercase">{ticketContext.linkedTx.type} ({formatMoney(ticketContext.linkedTx.fee || 0)} fee)</span>
                            </div>
                          </div>
                          {ticketContext.linkedTx.description && (
                            <p className="text-white/60 text-[11px] italic bg-white/5 p-2 rounded-lg">
                              Memo: "{ticketContext.linkedTx.description}"
                            </p>
                          )}
                        </div>
                      )}

                      {/* Linked Escrow Card */}
                      {ticketContext?.linkedEscrow && (
                        <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-emerald-300 flex items-center gap-1">
                              <ShieldCheck size={13} /> Disputed Escrow Custody Agreement
                            </span>
                            <span className="font-mono text-emerald-400 font-bold text-sm">
                              {formatMoney(ticketContext.linkedEscrow.amount)}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-white/70 pt-1 border-t border-white/5">
                            <div>
                              <span className="text-white/40 block text-[10px]">Buyer (Payer):</span>
                              <span className="font-semibold text-white truncate block">{ticketContext.linkedEscrow.buyerAccountName || ticketContext.linkedEscrow.buyerAccountId}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[10px]">Seller (Recipient):</span>
                              <span className="font-semibold text-white truncate block">{ticketContext.linkedEscrow.sellerAccountName || ticketContext.linkedEscrow.sellerAccountId}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[10px]">Escrow Status:</span>
                              <span className="uppercase font-bold text-amber-300">{ticketContext.linkedEscrow.status}</span>
                            </div>
                            <div>
                              <span className="text-white/40 block text-[10px]">Locked At:</span>
                              <span>{ticketContext.linkedEscrow.createdAt ? format(new Date(ticketContext.linkedEscrow.createdAt), "MMM d, h:mm a") : "N/A"}</span>
                            </div>
                          </div>
                          {ticketContext.linkedEscrow.description && (
                            <p className="text-white/80 text-[11px] font-medium">
                              Deal Subject: {ticketContext.linkedEscrow.description}
                            </p>
                          )}
                          {ticketContext.linkedEscrow.contractText && (
                            <p className="text-white/50 text-[10px] italic bg-white/5 p-2 rounded-lg">
                              Terms: {ticketContext.linkedEscrow.contractText}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Internal Staff Notes */}
              <div className="p-4 rounded-2xl bg-[#161622] border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-amber-300/80 flex items-center gap-1.5">
                    <Sparkles size={12} /> Internal Staff Notes (Visible to bank operators only)
                  </label>
                  <button
                    onClick={saveNotes}
                    disabled={isSavingNotes}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition flex items-center gap-1"
                  >
                    {isSavingNotes ? "Saving..." : "Save Note"}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="Record investigation notes, Discord handle verifications, or refund approvals..."
                  className="w-full bg-[#101018] border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-500/40 resize-none font-sans"
                />
              </div>

              {/* Message Thread */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white/40">Communication Thread</h3>
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {(selectedTicket.messages || []).map((msg: any) => {
                    const isStaff = msg.senderRole === "staff";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isStaff ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-white/40">
                          <span className="font-semibold text-white/70">
                            {msg.senderName} {isStaff ? "(Bank Staff)" : ""}
                          </span>
                          <span>·</span>
                          <span>{msg.createdAt ? format(new Date(msg.createdAt), "MMM d, h:mm a") : ""}</span>
                        </div>
                        <div
                          className={`rounded-2xl p-4 max-w-[85%] text-xs leading-relaxed ${
                            isStaff
                              ? "bg-indigo-600 text-white rounded-tr-sm"
                              : "bg-[#1c1c28] border border-white/10 text-white/90 rounded-tl-sm"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reply Form */}
              <form onSubmit={sendReply} className="pt-2 border-t border-white/10 space-y-3">
                <textarea
                  rows={3}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type an official bank response to this client..."
                  className="w-full bg-[#181822] border border-white/10 rounded-2xl p-3.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-white/40">
                    Client will see this reply in their Portal dashboard.
                  </span>
                  <button
                    type="submit"
                    disabled={isSending || !replyMessage.trim()}
                    className="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                    Send Response
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-[#12121a] border border-white/10 rounded-3xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-white/40">
                <MessageSquare size={24} />
              </div>
              <h3 className="font-bold text-white text-base">Select a Support Ticket</h3>
              <p className="text-xs text-white/40 max-w-sm mx-auto">
                Choose an inquiry from the queue on the left to review dispute details, inspect transaction logs, and respond to the customer.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dispute Mediation & Resolution Modal */}
      {resolveModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#12121a] border border-white/10 rounded-3xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ShieldAlert className="text-amber-400" size={18} />
                <h3 className="font-black text-white text-base">Mediate & Resolve Dispute</h3>
              </div>
              <button
                onClick={() => setResolveModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-white/60">
              Select an administrative settlement action for ticket <strong className="text-white font-mono">#{selectedTicket.id.slice(-8)}</strong>:
            </p>

            <div className="space-y-2.5">
              {/* If disputed transaction */}
              {selectedTicket.transactionId && ticketContext?.linkedTx && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300">Transaction Reversal Refund</span>
                    <span className="font-mono font-bold text-emerald-400 text-xs">
                      {formatMoney(ticketContext.linkedTx.amount)}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60">
                    Atomically pulls {formatMoney(ticketContext.linkedTx.amount)} from receiver ({ticketContext.linkedTx.toAccountName}) and credits back to the sender ({ticketContext.linkedTx.fromAccountName}).
                  </p>
                  <button
                    onClick={() => executeDisputeResolution("reverse_transaction")}
                    disabled={resolvingAction !== null}
                    className="w-full py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {resolvingAction === "reverse_transaction" ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    Approve & Reverse Transaction
                  </button>
                </div>
              )}

              {/* If disputed escrow */}
              {selectedTicket.escrowId && ticketContext?.linkedEscrow && (
                <div className="space-y-2">
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300">Refund Escrow to Buyer</span>
                      <span className="font-mono font-bold text-emerald-400 text-xs">
                        {formatMoney(ticketContext.linkedEscrow.amount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60">
                      Returns custody funds back to buyer ({ticketContext.linkedEscrow.buyerAccountName}) and marks escrow as refunded.
                    </p>
                    <button
                      onClick={() => executeDisputeResolution("refund_escrow")}
                      disabled={resolvingAction !== null}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {resolvingAction === "refund_escrow" ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                      Refund Buyer
                    </button>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-300">Release Escrow to Seller</span>
                      <span className="font-mono font-bold text-emerald-400 text-xs">
                        {formatMoney(ticketContext.linkedEscrow.amount)}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60">
                      Releases locked custody funds to seller ({ticketContext.linkedEscrow.sellerAccountName}) and marks escrow as completed.
                    </p>
                    <button
                      onClick={() => executeDisputeResolution("release_escrow")}
                      disabled={resolvingAction !== null}
                      className="w-full py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {resolvingAction === "release_escrow" ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                      Release to Seller
                    </button>
                  </div>
                </div>
              )}

              {/* Dismiss / Close with Notes */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <span className="text-xs font-bold text-white">General Resolution / Dismiss Claim</span>
                <p className="text-[11px] text-white/50">
                  Close this dispute or general inquiry without automated ledger reversal.
                </p>
                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter formal determination details for the client..."
                    className="w-full bg-[#181822] border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-white/30 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => executeDisputeResolution("dismiss")}
                      disabled={resolvingAction !== null}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition flex items-center justify-center gap-1.5"
                    >
                      Dismiss Claim
                    </button>
                    <button
                      onClick={() => executeDisputeResolution("resolved_manually")}
                      disabled={resolvingAction !== null}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition flex items-center justify-center gap-1.5"
                    >
                      Mark Resolved
                    </button>
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
