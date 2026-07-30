import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { CreditCard, Plus, Lock, Unlock, RefreshCw, AlertCircle, Eye, EyeOff, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function BankCards() {
  const { bankId } = useParams();
  const [cards, setCards] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCardAccountId, setNewCardAccountId] = useState("");
  const [newCardType, setNewCardType] = useState("debit");
  
  const [visibleNumber, setVisibleNumber] = useState<Record<string, boolean>>({});

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
      setCards(cardsData);
      setAccounts(accountsData);
      setApps(appsData);
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
        body: JSON.stringify({ accountId: newCardAccountId, type: newCardType })
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
            <CreditCard className="text-indigo-400" />
            Card Management
          </h1>
          <p className="text-white/60">Manage virtual credit and debit cards for your accounts</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <Plus size={18} />
          Issue New Card
        </button>
      </div>

      {apps && apps.length > 0 && (
        <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden mb-8">
          <div className="p-4 border-b border-white/10 bg-slate-800/50 flex items-center justify-between">
            <h3 className="font-medium text-white/90">Pending Credit Applications</h3>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50 bg-slate-800/30">
                <th className="p-4 font-medium">Citizen</th>
                <th className="p-4 font-medium">Request Limit</th>
                <th className="p-4 font-medium">Income</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {apps.map((app: any) => (
                <tr key={app.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 text-sm font-medium text-white/90 font-mono">{app.resolvedName || app.discordId}</td>
                  <td className="p-4 text-sm text-indigo-400 font-medium">${(app.requestedLimit/100).toLocaleString()}</td>
                  <td className="p-4 text-sm text-emerald-400 font-medium">${(app.monthlyIncome/100).toLocaleString()}</td>
                  <td className="p-4 text-sm">
                     <span className={`px-2 py-1 rounded text-xs uppercase ${app.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : app.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>{app.status}</span>
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
                         }} className="text-xs bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 px-3 py-1.5 rounded transition-colors">Approve</button>
                         <button onClick={async () => {
                            try {
                               const res = await fetch(`/api/banks/${bankId}/credit-applications/${app.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "rejected" })
                               });
                               if(res.ok) fetchData(); else alert("Error");
                            } catch(e) {}
                         }} className="text-xs bg-red-600/20 text-red-400 hover:bg-red-600/40 px-3 py-1.5 rounded transition-colors">Reject</button>
                       </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No active cards</h3>
          <p className="text-white/60 max-w-sm mx-auto mb-6">
            Issue virtual debit or credit cards to allow accounts to spend funds securely.
          </p>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer mx-auto"
          >
            <Plus size={18} />
            Issue First Card
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map(card => (
            <div key={card.id} className="relative group">
              {/* Card Face */}
              <div className={`relative overflow-hidden rounded-2xl p-6 aspect-[1.586/1] shadow-xl border border-white/10 flex flex-col justify-between transition-all ${card.isLocked ? 'bg-slate-800 opacity-70 grayscale' : (card.type === 'credit' ? 'bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900' : 'bg-gradient-to-br from-slate-800 to-slate-900')}`}>
                
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                
                {/* Header */}
                <div className="flex justify-between items-start relative z-10">
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-black italic tracking-wider text-white mix-blend-overlay opacity-80">
                      SLATE
                    </div>
                    {card.isLocked && <span className="bg-red-500/20 text-red-300 text-xs px-2 py-0.5 rounded-full backdrop-blur-sm border border-red-500/30">LOCKED</span>}
                  </div>
                  <div className="text-white/80 font-medium text-sm tracking-widest uppercase">
                    {card.type}
                  </div>
                </div>

                {/* Chip & NFC */}
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

                {/* Card Number */}
                <div className="relative z-10 pb-2">
                  <div className="font-mono text-xl tracking-widest text-white/90 font-medium flex items-center justify-between drop-shadow-md">
                    <span>{formatCardNumber(card.cardNumber, visibleNumber[card.id])}</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-end relative z-10">
                  <div>
                    <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">Cardholder</div>
                    <div className="text-sm font-medium text-white/90 tracking-wider truncate max-w-[150px]" title={card.accountName}>
                      {card.resolvedOwnerName || card.accountName}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">Valid Thru</div>
                      <div className="font-mono text-sm text-white/90 tracking-wider">{card.expiryDate}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">CVV</div>
                      <div className="font-mono text-sm text-white/90 tracking-wider">{visibleNumber[card.id] ? card.cvv : '•••'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-3 flex gap-2">
                <button 
                  onClick={() => toggleCardLock(card.id, card.isLocked)}
                  className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors border ${card.isLocked ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                >
                  {card.isLocked ? <Unlock size={16} /> : <Lock size={16} />}
                  {card.isLocked ? "Unlock" : "Lock Card"}
                </button>
                <button 
                  onClick={() => toggleVisibility(card.id)}
                  className="py-2 px-4 rounded-lg flex items-center justify-center text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  title="Toggle details visibility"
                >
                  {visibleNumber[card.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button 
                  onClick={() => deleteCard(card.id)}
                  className="py-2 px-4 rounded-lg flex items-center justify-center text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
                  title="Delete Card"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Card Modal */}
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
                <h2 className="text-xl font-semibold text-white">Issue New Card</h2>
                <p className="text-sm text-white/60 mt-1">Generate a new virtual card for an account</p>
              </div>

              <form onSubmit={handleCreateCard} className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Link to Account</label>
                  <select 
                    value={newCardAccountId}
                    onChange={(e) => setNewCardAccountId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Select an account...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName} - ${(acc.balance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1.5">Card Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewCardType("debit")}
                      className={`py-3 px-4 rounded-lg flex flex-col items-center justify-center gap-2 border transition-all ${newCardType === 'debit' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-white/5 text-slate-400 hover:bg-slate-800/80'}`}
                    >
                      <CreditCard size={20} />
                      <span className="text-sm font-medium">Debit Card</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCardType("credit")}
                      disabled
                      className={`py-3 px-4 rounded-lg flex flex-col items-center justify-center gap-2 border transition-all opacity-50 cursor-not-allowed ${newCardType === 'credit' ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-white/5 text-slate-400'}`}
                    >
                      <CreditCard size={20} />
                      <span className="text-sm font-medium">Credit Card</span>
                      <span className="text-[10px] text-white/30 absolute bottom-1">Coming Soon</span>
                    </button>
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
                    disabled={!newCardAccountId}
                    className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white transition-colors"
                  >
                    Generate Card
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
