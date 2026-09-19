import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CreditCard, Plus, Lock, Unlock, RefreshCw, AlertCircle, Eye, EyeOff, Trash2, Search, Wallet, ShieldAlert, CreditCard as CardIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatMoney } from "../lib/utils";

export function BankCards() {
  const { bankId } = useParams();
  const [cards, setCards] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCardAccountId, setNewCardAccountId] = useState("");
  const [newCardType, setNewCardType] = useState("credit");
  const [newCardLimit, setNewCardLimit] = useState("10000");
  const [newCardApr, setNewCardApr] = useState("19.99");
  
  const [visibleNumber, setVisibleNumber] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const fetchData = async () => {
    try {
      const [cardsRes, accountsRes, appsRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/cards`),
        fetch(`/api/banks/${bankId}/accounts`),
        fetch(`/api/banks/${bankId}/credit-applications`)
      ]);
      const cardsData = await cardsRes.json();
      const accountsData = await accountsRes.json();
      const appsData = await appsRes.json();
      setCards(Array.isArray(cardsData) ? cardsData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      setApps(Array.isArray(appsData) ? appsData : []);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const toggleCardLock = async (cardId: string, currentStatus: boolean) => {
    try {
      setCards(cards.map(c => c.id === cardId ? { ...c, isLocked: !currentStatus } : c));
      await fetch(`/api/banks/${bankId}/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: !currentStatus })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteCard = async (cardId: string) => {
    if (!confirm("Are you sure you want to permanently delete this card? This action cannot be undone.")) return;
    try {
      const res = await fetch(`/api/banks/${bankId}/cards/${cardId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardAccountId) return;
    
    try {
      const res = await fetch(`/api/banks/${bankId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: newCardAccountId,
          creditLimit: Math.round(parseFloat(newCardLimit || "0") * 100),
          creditApr: Math.round(parseFloat(newCardApr || "0") * 100),
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewCardAccountId("");
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleVisibility = (id: string) => {
    setVisibleNumber(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatCardNumber = (num: string, visible: boolean) => {
    if (!num) return "";
    const chunks = num.match(/.{1,4}/g) || [];
    if (visible) return chunks.join(" ");
    return `•••• •••• •••• ${chunks[3] || "0000"}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-white/50 space-y-4">
        <RefreshCw className="animate-spin" size={24} />
        <p>Synchronizing card network...</p>
      </div>
    );
  }

  const activeCards = cards.filter(c => !c.isLocked).length;
  const frozenCards = cards.filter(c => c.isLocked).length;
  const filteredCards = cards.filter(c => 
    c.cardNumber?.includes(searchQuery) || 
    c.accountName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.resolvedOwnerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white flex items-center gap-3">
            <CreditCard className="text-indigo-400" size={32} />
            Card Services
          </h1>
          <p className="text-white/60 text-sm font-medium">
            Issue and manage physical/virtual debit and credit cards
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} /> Issue Card
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <CreditCard size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Total Issued</span>
          </div>
          <p className="text-3xl font-black text-white">{cards.length}</p>
        </div>
        
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Unlock size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Active & Ready</span>
          </div>
          <p className="text-3xl font-black text-white">{activeCards}</p>
        </div>
        
        <div className="bg-gradient-to-br from-[#0b0b12] to-[#11111a] border border-white/10 rounded-2xl p-5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <Lock size={16} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">Frozen Cards</span>
          </div>
          <p className="text-3xl font-black text-white">{frozenCards}</p>
        </div>
      </div>

      {apps && apps.length > 0 && (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/5 bg-[#11111a] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-400" /> Pending Credit Applications
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500 bg-white/[0.02]">
                  <th className="p-4 font-bold">Applicant</th>
                  <th className="p-4 font-bold">Request Limit</th>
                  <th className="p-4 font-bold">Stated Income</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {apps.map((app: any) => (
                  <tr key={app.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <p className="text-sm font-bold text-white">{app.resolvedName || app.discordId}</p>
                    </td>
                    <td className="p-4 text-sm font-black text-white font-mono">{formatMoney(app.requestedLimit)}</td>
                    <td className="p-4 text-sm font-black text-emerald-400 font-mono">{formatMoney(app.monthlyIncome)}</td>
                    <td className="p-4">
                       <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${app.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : app.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
                         {app.status}
                       </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      {app.status === 'pending' && (
                         <>
                           <button onClick={async () => {
                              try {
                                 const res = await fetch(`/api/banks/${bankId}/credit-applications/${app.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ status: "approved" })
                                 });
                                 if(res.ok) fetchData(); else alert("Error");
                              } catch(e) {}
                           }} className="text-[11px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-3 py-1.5 rounded-lg transition-colors">Approve</button>
                           <button onClick={async () => {
                              try {
                                 const res = await fetch(`/api/banks/${bankId}/credit-applications/${app.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ status: "rejected" })
                                 });
                                 if(res.ok) fetchData(); else alert("Error");
                              } catch(e) {}
                           }} className="text-[11px] font-bold uppercase tracking-widest bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 px-3 py-1.5 rounded-lg transition-colors">Reject</button>
                         </>
                      )}
                      {app.status !== 'pending' && (
                        <button onClick={async () => {
                           try {
                              const res = await fetch(`/api/banks/${bankId}/credit-applications/${app.id}`, {
                                 method: "DELETE"
                              });
                              if(res.ok) fetchData(); else alert("Error");
                           } catch(e) {}
                        }} className="text-[11px] font-bold uppercase tracking-widest bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 px-3 py-1.5 rounded-lg transition-colors">Archive</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Roster & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-white/10 pb-4">
        <h2 className="text-lg font-bold text-white">Active Registry</h2>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
          <input
            type="text"
            placeholder="Search by card number or account..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0b0b12] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="bg-[#0b0b12] border border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <CardIcon className="text-white/20" size={32} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Cards Issued</h3>
          <p className="text-zinc-500 max-w-sm mb-6 font-medium">
            Issue virtual debit or credit cards to allow accounts to spend funds securely across the network.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-white/10 hover:bg-white/15 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
          >
            <Plus size={16} /> Issue First Card
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredCards.map(card => {
               const isCredit = card.type === "credit";
               
               return (
                 <motion.div 
                   key={card.id}
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   className="group"
                 >
                   {/* Visual Card Object */}
                   <div className={`relative rounded-2xl p-6 shadow-2xl overflow-hidden aspect-[1.586/1] flex flex-col justify-between transition-transform duration-500 group-hover:-translate-y-2 ${
                     card.isLocked 
                       ? 'bg-slate-800 border border-slate-700 opacity-80 grayscale-[0.5]' 
                       : isCredit
                         ? 'bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 border border-white/10'
                         : 'bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10'
                   }`}>
                     <div className="absolute top-0 right-0 w-48 h-48 bg-white/[0.03] rounded-full blur-3xl pointer-events-none" />
                     <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                     
                     <div className="flex justify-between items-start relative z-10">
                       <div className="flex items-center gap-2">
                         <div className="text-xl font-black italic tracking-wider text-white mix-blend-overlay opacity-80">
                           SLATE
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {card.isLocked && (
                           <span className="bg-red-500/20 text-red-300 text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded shadow-lg backdrop-blur-sm border border-red-500/30 flex items-center gap-1">
                             <Lock size={10} /> FROZEN
                           </span>
                         )}
                         <span className={`text-[10px] font-black uppercase tracking-widest ${isCredit ? 'text-amber-500' : 'text-indigo-300'}`}>
                           {isCredit ? 'CREDIT' : 'DEBIT'}
                         </span>
                       </div>
                     </div>

                     <div className="flex items-center gap-3 relative z-10 my-2">
                       <div className="w-10 h-8 rounded-md bg-gradient-to-br from-yellow-200 to-yellow-500 border border-yellow-600/50 shadow-inner flex flex-col justify-around px-1 overflow-hidden">
                         <div className="h-px bg-black/20 w-full"></div>
                         <div className="h-px bg-black/20 w-full"></div>
                         <div className="h-px bg-black/20 w-full"></div>
                       </div>
                       <svg className="w-6 h-6 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <path d="M4 2v20l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2V2l-2 2-2-2-2 2-2-2-2 2-2-2Z" />
                       </svg>
                     </div>

                     <div className="relative z-10 mt-auto">
                       <div className="flex items-center justify-between mb-4">
                         <div className="font-mono text-xl sm:text-2xl font-semibold tracking-widest text-white/90 drop-shadow-md">
                           {formatCardNumber(card.cardNumber, visibleNumber[card.id])}
                         </div>
                         <button 
                           onClick={() => toggleVisibility(card.id)}
                           className="text-white/40 hover:text-white transition-colors p-2"
                         >
                           {visibleNumber[card.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                         </button>
                       </div>
                       
                       <div className="flex justify-between items-end">
                         <div>
                           <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Cardholder</div>
                           <div className="text-sm font-semibold text-white tracking-wide truncate max-w-[150px]">
                             {card.resolvedOwnerName || card.accountName || "Corporate Account"}
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">Valid Thru</div>
                           <div className="text-sm font-mono font-semibold text-white tracking-widest">
                             {card.expiryDate || `${card.expiryMonth?.toString().padStart(2, '0')}/${card.expiryYear?.toString().slice(-2)}`}
                           </div>
                           {isCredit && (
                             <div className="text-[10px] font-mono text-white/60 mt-1">
                               {formatMoney(card.creditUsed || 0)} / {formatMoney(card.creditLimit || 0)}
                             </div>
                           )}
                         </div>
                         <div className="text-right">
                           <div className="text-[9px] font-bold text-white/50 uppercase tracking-widest mb-1">CVC</div>
                           <div className="text-sm font-mono font-semibold text-white tracking-widest">
                             {visibleNumber[card.id] ? card.cvv : '•••'}
                           </div>
                         </div>
                       </div>
                     </div>
                   </div>

                   {/* Management Controls */}
                   <div className="mt-4 bg-[#0b0b12] border border-white/5 rounded-xl p-3 flex items-center justify-between shadow-lg">
                     <div className="flex gap-2 w-full">
                       <button
                         onClick={() => toggleCardLock(card.id, card.isLocked)}
                         className={`flex-1 flex justify-center items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                           card.isLocked 
                             ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                             : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                         }`}
                       >
                         {card.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                         {card.isLocked ? "Unfreeze" : "Freeze"}
                       </button>
                       <button
                         onClick={() => deleteCard(card.id)}
                         className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                         title="Terminate Card"
                       >
                         <Trash2 size={14} />
                       </button>
                     </div>
                   </div>
                 </motion.div>
               );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0b0b12] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 bg-[#11111a]">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Plus size={20} className="text-indigo-400" />
                  Issue New Card
                </h3>
                <p className="text-xs font-medium text-zinc-500 mt-1">Bind a new virtual card to an existing account.</p>
              </div>
              <form onSubmit={handleCreateCard} className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Target Account</label>
                  <select
                    required
                    value={newCardAccountId}
                    onChange={(e) => setNewCardAccountId(e.target.value)}
                    className="w-full bg-[#11111a] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none font-medium"
                  >
                    <option value="">Select an account...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.accountName || acc.name} ({acc.id.substring(0, 8)})</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Credit Limit ($)</label>
                    <input type="number" step="0.01" min="0" required value={newCardLimit} onChange={e => setNewCardLimit(e.target.value)} className="w-full bg-[#11111a] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">APR (%)</label>
                    <input type="number" step="0.01" min="0" required value={newCardApr} onChange={e => setNewCardApr(e.target.value)} className="w-full bg-[#11111a] border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors font-medium" />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-sm font-bold text-zinc-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20"
                  >
                    Provision Card
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
