import { useState, useEffect } from "react";
import { Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, Lock, Unlock, Link2, BookOpen, LogIn, LogOut } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";

export function CitizenPortal() {
  const { user, login, logout, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"assets" | "transfer" | "invoices" | "loans" | "apply">("assets");
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/onyx/merchants")
      .then(r => r.json())
      .then(d => setOnyxMerchants(d || []));
  }, []);

  useEffect(() => {
    if (user) {
      handleSearch();
    }
  }, [user]);

  const toggleCardVisibility = (id: string) => {
    setVisibleCardIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatCardNumber = (num: string, visible: boolean) => {
    if (!num) return "";
    const chunks = num.match(/.{1,4}/g) || [];
    if (visible) return chunks.join(" ");
    return `•••• •••• •••• ${chunks[3] || "0000"}`;
  };

  const handleSearch = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/citizen/lookup`);
      if (res.ok) {
        setUserData(await res.json());
      } else {
        setUserData({ error: "No accounts found for this Citizen ID." });
      }
    } catch (e) {
      console.error(e);
      setUserData({ error: "System error while fetching data." });
    }
    setLoading(false);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center text-white/50">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 mt-6 mb-20 px-4">
      <div className="flex justify-end mb-4 gap-4">
         {user && (
           <button onClick={logout} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors bg-white/5 px-4 py-2 rounded-full border border-red-500/20">
             <LogOut size={16} /> Logout
           </button>
         )}
         <a href="/docs" className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors bg-white/5 px-4 py-2 rounded-full border border-white/10">
           <BookOpen size={16} /> API Documentation
         </a>
      </div>
      <div className="text-center space-y-3 mb-12">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-3xl mx-auto shadow-xl shadow-blue-500/20">
          C
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Citizen Gateway</h1>
        <p className="text-white/50 max-w-lg mx-auto">Access your global financial profile across all banks connected to the Slate Network.</p>
      </div>

      {!user ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl backdrop-blur-sm max-w-xl mx-auto text-center space-y-6">
          <div>
            <h2 className="text-xl font-medium text-white mb-2">Authentication Required</h2>
            <p className="text-white/50 text-sm">Please securely authenticate with CityCorp to access your financial portfolio.</p>
          </div>
          <button 
            onClick={() => login(undefined, 'citycorp')}
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 flex items-center justify-center gap-2"
          >
            <LogIn size={18} /> Login with CityCorp
          </button>
        </div>
      ) : (
        <>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl backdrop-blur-sm max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
             {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="w-12 h-12 rounded-full border-2 border-white/10" />
             ) : (
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Search size={20} />
                </div>
             )}
             <div>
               <p className="text-white font-medium">{user.username}</p>
               <p className="text-white/40 text-xs font-mono">{user.discordId}</p>
             </div>
          </div>
          <button 
            onClick={handleSearch}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {userData?.verifiedProfiles?.length > 0 ? (
          <div className="bg-[#0f0f15] border border-white/10 rounded-2xl p-6 max-w-xl mx-auto space-y-4 shadow-xl mt-6 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="text-white font-medium flex items-center gap-2">
              <ShieldCheck className="text-emerald-400" size={18} />
              Whitelabel Verified Bank Profiles
            </h3>
            <p className="text-xs text-white/50">Your active, bank-specific Minecraft profiles verified via whitelabel CityCorp OAuth:</p>
            <div className="space-y-3">
              {userData.verifiedProfiles.map((prof: any) => (
                <div key={prof.bankId} className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    <img 
                      src={`https://mc-heads.net/avatar/${prof.mcUuid}/32`} 
                      alt="Skin avatar" 
                      className="w-8 h-8 rounded border border-white/10" 
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{prof.bankName}</p>
                      <p className="text-xs text-white/40 font-mono">Minecraft Name: {prof.mcUsername}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Verified Profile
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#0f0f15] border border-amber-500/10 rounded-2xl p-5 mt-6 max-w-xl mx-auto flex items-center justify-between shadow-xl text-left">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                 <Link2 size={24} />
               </div>
               <div>
                 <h3 className="font-medium text-white text-sm">Whitelabel Profile Verification</h3>
                 <p className="text-white/50 text-xs mt-1">To verify your Minecraft and CityCorp profile, visit your specific bank's portal page and click "Verify with CityCorp" under Identity Verification.</p>
               </div>
             </div>
          </div>
        )}

      {userData && !userData.error && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">

          {/* Action Hub Navigation */}
          <div className="flex flex-wrap justify-center gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/10 w-fit mx-auto backdrop-blur-md">
            <button
              onClick={() => setActiveTab("assets")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === "assets" ? "bg-white/10 text-white shadow-sm border border-white/10" : "text-zinc-400 hover:text-white hover:bg-white/5"}`}
            >
              <Wallet size={16} /> My Assets
            </button>
            <button
              onClick={() => setActiveTab("transfer")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === "transfer" ? "bg-white/10 text-white shadow-sm border border-white/10" : "text-zinc-400 hover:text-white hover:bg-white/5"}`}
            >
              <ArrowRight size={16} /> Transfer & Pay
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 relative ${activeTab === "invoices" ? "bg-amber-500/20 text-amber-400 shadow-sm border border-amber-500/20" : "text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10"}`}
            >
              <Clock size={16} /> Bills
              {userData.pendingInvoices?.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
            </button>
            <button
              onClick={() => setActiveTab("loans")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 relative ${activeTab === "loans" ? "bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/20" : "text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10"}`}
            >
              <ShieldCheck size={16} /> Loans
              {userData.loans?.some((l: any) => l.status === 'active') && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-400 animate-pulse" />}
            </button>
            <button
              onClick={() => setActiveTab("apply")}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${activeTab === "apply" ? "bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/20" : "text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"}`}
            >
              <CreditCard size={16} /> Apply
            </button>
          </div>

          <div className="bg-[#0a0a0f] border border-white/10 rounded-[2rem] p-6 md:p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            {activeTab === "assets" && (
              <div className="space-y-12 animate-in fade-in duration-300">
                {/* Accounts */}
                <div>
                  <h3 className="text-lg font-bold text-white/90 mb-4 flex items-center gap-2"><Wallet className="text-indigo-400" size={20} /> Verified Network Accounts</h3>
                  {userData.accounts?.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {userData.accounts.map((acc: any) => (
                        <div key={acc.id} className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden hover:border-indigo-500/30 transition-all hover:shadow-lg hover:shadow-indigo-500/10 group">
                          <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                            <div className="flex justify-between items-start mb-4">
                              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold uppercase text-sm border border-indigo-500/20">
                                {acc.bankName.substring(0, 2)}
                              </div>
                              <span 
                                className="text-[10px] font-mono text-white/40 bg-white/5 px-2.5 py-1 rounded-full cursor-pointer hover:bg-white/10 hover:text-white transition-colors truncate max-w-[120px] border border-white/5" 
                                title="Click to copy"
                                onClick={(e) => {
                                  navigator.clipboard.writeText(acc.id);
                                  const el = e.currentTarget;
                                  const orig = el.innerText;
                                  el.innerText = "Copied!";
                                  setTimeout(() => { el.innerText = orig }, 2000);
                                }}
                              >
                                {acc.id}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">{acc.bankName}</p>
                              <p className="text-indigo-400/80 text-xs mt-1 font-medium">{acc.accountName}</p>
                            </div>
                          </div>
                          <div className="p-5 flex items-end justify-between bg-[#0a0a0c]/80 backdrop-blur-sm">
                            <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Available Balance</p>
                            <p className="text-2xl font-mono tracking-tight text-white/90 font-medium">{formatMoney(acc.balance || 0)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-8 bg-black/20 border border-white/5 rounded-2xl border-dashed">
                      <Wallet className="mx-auto text-white/20 mb-3" size={32} />
                      <p className="text-white/60 text-sm">No active accounts found.</p>
                    </div>
                  )}
                </div>

                {/* Cards */}
                {userData.cards?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-white/90 mb-4 flex items-center gap-2"><CreditCard className="text-blue-400" size={20} /> Connected Cards</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {userData.cards.map((card: any) => (
                        <div key={card.id} className="relative group">
                          <div className={`relative overflow-hidden rounded-2xl p-6 shadow-xl border border-white/10 flex flex-col justify-between transition-all aspect-[1.586/1] ${card.isLocked ? 'bg-zinc-800 opacity-60 grayscale' : (card.type === 'credit' ? 'bg-gradient-to-br from-indigo-900 via-purple-900 to-black' : 'bg-gradient-to-br from-slate-800 via-slate-900 to-black')}`}>
                            <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                            
                            {/* Chip */}
                            <div className="absolute top-1/2 left-6 -translate-y-1/2 w-10 h-8 rounded bg-gradient-to-br from-amber-200 to-amber-500 opacity-80 mix-blend-overlay"></div>

                            <div className="flex justify-between items-start relative z-10">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-bold italic tracking-wide text-white drop-shadow-md">
                                  {card.bankName}
                                </div>
                                {card.isLocked && <span className="bg-red-500/20 text-red-300 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30 font-bold uppercase">Locked</span>}
                              </div>
                              <div className="text-white/80 font-bold text-[10px] tracking-widest uppercase bg-black/20 px-2 py-1 rounded-md backdrop-blur-sm border border-white/10">
                                {card.type}
                              </div>
                            </div>
                            
                            <div className="relative z-10 my-4 flex-1 flex flex-col justify-end">
                              <div className="font-mono text-xl tracking-widest text-white font-medium flex items-center justify-between drop-shadow-md">
                                <span>{formatCardNumber(card.cardNumber, visibleCardIds[card.id])}</span>
                              </div>
                            </div>

                            <div className="flex justify-between items-end relative z-10 mt-2">
                              <div>
                                <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5 font-bold">Cardholder</div>
                                <div className="text-sm font-medium text-white/90 tracking-wider truncate max-w-[120px] uppercase">
                                  {user.username}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div>
                                  <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5 font-bold">Exp</div>
                                  <div className="font-mono text-sm text-white/90 tracking-wider">{card.expiryDate}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5 font-bold">CVV</div>
                                  <div className="font-mono text-sm text-white/90 tracking-wider">{visibleCardIds[card.id] ? card.cvv : '•••'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 flex gap-2">
                            <button 
                              onClick={async (e) => {
                                const btn = e.currentTarget;
                                btn.disabled = true;
                                try {
                                  const res = await fetch(`/api/citizen/cards/${card.id}/lock`, {
                                    method: 'PATCH',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({ discordId: user.discordId, isLocked: !card.isLocked })
                                  });
                                  if (res.ok) handleSearch(new Event('submit') as unknown as React.FormEvent);
                                  else alert("Failed to lock/unlock card");
                                } catch (err) {
                                  console.error(err);
                                } finally {
                                  btn.disabled = false;
                                }
                              }}
                              className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all border ${card.isLocked ? 'bg-indigo-500 hover:bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-500/20' : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'}`}
                            >
                              {card.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                              {card.isLocked ? "Unlock Card" : "Lock Card"}
                            </button>
                            <button 
                              onClick={() => toggleCardVisibility(card.id)}
                              className="py-2 px-4 rounded-xl flex items-center justify-center text-xs font-bold bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors"
                              title="Toggle visibility"
                            >
                              {visibleCardIds[card.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transactions */}
                {userData.recentTx?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-white/90 mb-4 flex items-center gap-2"><Clock className="text-indigo-400" size={20} /> Recent Transactions</h3>
                    <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden">
                      <div className="divide-y divide-white/5">
                        {userData.recentTx.map((tx: any, i: number) => {
                          const isIncoming = tx.toCityCorpId === user.discordId;
                          return (
                            <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                              <div className="flex gap-4 items-center">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg border ${isIncoming ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
                                  {isIncoming ? '+' : '-'}
                                </div>
                                <div>
                                  <p className="font-medium text-white/90 text-sm">{tx.description || tx.type}</p>
                                  <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest font-bold">
                                    {tx.bankName} • {format(new Date(tx.timestamp), "MMM d, yyyy h:mm a")}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`font-mono font-medium text-lg ${isIncoming ? 'text-emerald-400' : 'text-white/90'}`}>
                                  {isIncoming ? '+' : '-'}{formatMoney(tx.amount || 0)}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "transfer" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-300">
                {/* Execute Transfer */}
                <div className="bg-black/40 border border-white/10 rounded-3xl p-8 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-5">
                      <ArrowRight size={100} />
                   </div>
                   <h3 className="font-bold text-xl mb-2 text-white/90 relative z-10">Execute Transfer</h3>
                   <p className="text-xs text-white/50 mb-8 font-medium">Send money instantly across the Slate network.</p>
                   
                   <form onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const btn = form.querySelector('button');
                      if (btn) btn.disabled = true;
                      
                      try {
                        const res = await fetch('/api/citizen/transfer', {
                          method: 'POST',
                          headers: {'Content-Type': 'application/json'},
                          body: JSON.stringify({
                            discordId: user.discordId,
                            fromAccountId: form.fromAccountId.value,
                            toAccountId: form.toAccountId.value,
                            amount: form.amount.value
                          })
                        });
                        const d = await res.json();
                        if (!res.ok) alert(d.error || "Transfer failed");
                        else {
                          alert("Transfer executed successfully!");
                          form.reset();
                          handleSearch(new Event('submit') as unknown as React.FormEvent);
                        }
                      } catch (err) {
                        console.error(err);
                      } finally {
                        if (btn) btn.disabled = false;
                      }
                   }} className="space-y-5 relative z-10">
                     <div>
                       <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">From Account</label>
                       <select required name="fromAccountId" className="w-full bg-[#111116] border border-white/10 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 hover:bg-white/5 transition-colors">
                          <option value="">Select an account...</option>
                          {userData.accounts.map((acc: any) => (
                            <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                               {acc.bankName} - {acc.accountName} ({formatMoney(acc.balance)})
                            </option>
                          ))}
                       </select>
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Recipient Account UUID</label>
                       <input required name="toAccountId" type="text" placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000" className="w-full bg-[#111116] border border-white/10 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 font-mono hover:bg-white/5 transition-colors" />
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Amount ($)</label>
                       <input required name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className="w-full bg-[#111116] border border-white/10 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 font-mono hover:bg-white/5 transition-colors" />
                     </div>
                     <button type="submit" className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 mt-4 shadow-xl shadow-white/10">
                       Confirm Transfer
                     </button>
                   </form>
                </div>
                
                {/* Onyx Quick Pay */}
                <div className="bg-gradient-to-br from-indigo-900/40 to-blue-900/20 border border-indigo-500/20 rounded-3xl p-8 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-10">
                      <Link2 size={100} className="text-blue-400" />
                   </div>
                   <h3 className="font-bold text-xl mb-2 text-white/90 relative z-10 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"/> Onyx Quick Pay</h3>
                   <p className="text-xs text-indigo-300/70 mb-8 font-medium">Pay registered merchants and businesses instantly.</p>
                   
                   <form onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                      const fd = new FormData(form);
                      submitBtn.disabled = true;
                      try {
                        const onyxRes = await fetch(`/api/onyx/checkout`, {
                          method: 'POST',
                          headers: {
                             'Content-Type': 'application/json',
                             'x-api-key': fd.get("apiKey") as string
                          },
                          body: JSON.stringify({
                            userCityCorpId: user.discordId,
                            amountCents: Math.round(parseFloat(fd.get("amount") as string) * 100),
                            description: fd.get("description") || "Onyx Quick Pay from Citizen Portal",
                            sourceAccountId: fd.get("fromAccountId")
                          })
                        });
                        const d = await onyxRes.json();
                        if (!onyxRes.ok) alert(d.error || "Onyx payment failed");
                        else {
                          alert("Onyx payment successful!");
                          handleSearch(new Event('submit') as unknown as React.FormEvent);
                          form.reset();
                        }
                      } catch (err) {
                          alert("Service error");
                      } finally {
                          submitBtn.disabled = false;
                      }
                   }} className="space-y-5 relative z-10">
                     <div>
                       <label className="block text-[10px] font-bold text-indigo-300/50 mb-2 uppercase tracking-widest">From Account</label>
                       <select required name="fromAccountId" className="w-full bg-[#111116]/80 border border-indigo-500/20 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 hover:bg-white/5 transition-colors">
                          <option value="">Select an account...</option>
                          {userData.accounts.map((acc: any) => (
                            <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                               {acc.bankName} - {acc.accountName} ({formatMoney(acc.balance)})
                            </option>
                          ))}
                       </select>
                     </div>
                     
                     <div>
                       <label className="block text-[10px] font-bold text-indigo-300/50 mb-2 uppercase tracking-widest">Select Merchant</label>
                       <select required name="apiKey" className="w-full bg-[#111116]/80 border border-indigo-500/20 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 hover:bg-white/5 transition-colors">
                          <option value="">Choose a registered merchant...</option>
                          {onyxMerchants.map((m: any) => (
                            <option key={m.apiKey} value={m.apiKey}>
                               {m.name} ({m.bankName})
                            </option>
                          ))}
                       </select>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4">
                       <div>
                         <label className="block text-[10px] font-bold text-indigo-300/50 mb-2 uppercase tracking-widest">Amount ($)</label>
                         <input required name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className="w-full bg-[#111116]/80 border border-indigo-500/20 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 font-mono hover:bg-white/5 transition-colors" />
                       </div>
                       <div>
                         <label className="block text-[10px] font-bold text-indigo-300/50 mb-2 uppercase tracking-widest">Description</label>
                         <input name="description" type="text" placeholder="e.g. Utility Bill" className="w-full bg-[#111116]/80 border border-indigo-500/20 rounded-xl py-3.5 px-4 text-white text-sm focus:outline-none focus:border-indigo-500/50 hover:bg-white/5 transition-colors" />
                       </div>
                     </div>
                     <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-50 mt-4 shadow-xl shadow-blue-500/20">
                       Pay via Onyx
                     </button>
                   </form>
                </div>
              </div>
            )}

            {activeTab === "invoices" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h3 className="text-lg font-bold text-white/90 mb-2 flex items-center gap-2"><Clock className="text-amber-400" size={20} /> Pending Invoices</h3>
                  <p className="text-xs text-white/50 mb-6 font-medium">Pay outstanding bills from utility providers or merchants.</p>
                </div>
                
                {userData.pendingInvoices?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {userData.pendingInvoices.map((inv: any) => (
                        <div key={inv.id} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-amber-500/10 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-base font-bold text-white/90">{inv.description}</h4>
                              <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2.5 py-0.5 rounded-full border border-amber-500/30 uppercase tracking-wider font-bold">Unpaid</span>
                            </div>
                            <p className="text-sm text-amber-200/60 font-medium">
                              Billed by: {inv.billerName} <span className="text-amber-200/30">•</span> {inv.billerAccountName}
                            </p>
                            <p className="text-xs mt-2 text-amber-400 font-bold tracking-wide">
                              DUE: {format(new Date(inv.dueDate), "MMM d, yyyy")}
                            </p>
                          </div>
                          <div className="flex flex-col md:items-end gap-3 w-full md:w-auto">
                            <span className="font-mono text-2xl font-bold text-white">
                              {formatMoney(inv.amount)}
                            </span>
                            <button 
                              onClick={async (e) => {
                                  const btn = e.currentTarget;
                                  btn.disabled = true;
                                  try {
                                    const res = await fetch('/api/citizen/pay-invoice', {
                                      method: 'POST',
                                      headers: {'Content-Type': 'application/json'},
                                      body: JSON.stringify({ discordId: user.discordId, invoiceId: inv.id })
                                    });
                                    const d = await res.json();
                                    if (!res.ok) alert(d.error || "Failed");
                                    else {
                                      alert("Invoice paid successfully!");
                                      btn.innerText = "Paid";
                                      handleSearch(new Event('submit') as unknown as React.FormEvent);
                                    }
                                  } catch (e) {
                                    console.error(e);
                                    btn.disabled = false;
                                  }
                              }}
                              className="w-full md:w-40 bg-amber-500 hover:bg-amber-400 text-black py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-amber-500/20"
                            >
                              Pay Invoice
                            </button>
                          </div>
                        </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-12 bg-black/20 border border-white/5 rounded-3xl border-dashed">
                    <Clock className="mx-auto text-white/20 mb-4" size={40} />
                    <h3 className="text-white/80 font-bold mb-1">You're all caught up!</h3>
                    <p className="text-white/50 text-sm">No pending invoices or bills require your attention.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "loans" && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div>
                  <h3 className="text-lg font-bold text-white/90 mb-2 flex items-center gap-2"><ShieldCheck className="text-blue-400" size={20} /> Active Loans</h3>
                  <p className="text-xs text-white/50 mb-6 font-medium">Manage and pay your active loans across the network.</p>
                </div>
                
                {userData.loans?.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6">
                    {userData.loans.map((loan: any) => (
                        <div key={loan.id} className="bg-blue-500/5 border border-blue-500/20 rounded-3xl p-6 md:p-8">
                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                            <div>
                              <h4 className="text-lg font-bold text-white/90 flex items-center gap-3">
                                {loan.bankName}
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase tracking-wider font-bold ${loan.status === 'active' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'}`}>
                                  {loan.status}
                                </span>
                              </h4>
                              <p className="text-sm text-blue-200/60 font-medium mt-1">
                                {loan.interestRate}% APR <span className="text-blue-200/30 mx-2">•</span> Next Payment: {format(new Date(loan.nextPaymentDate), "PP")}
                              </p>
                            </div>
                            <div className="text-left md:text-right bg-black/40 px-6 py-3 rounded-2xl border border-white/5 w-full md:w-auto">
                              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold mb-1">Remaining Balance</p>
                              <p className="text-2xl font-mono font-medium text-white">{formatMoney(loan.remainingAmount)}</p>
                            </div>
                          </div>
                          
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-6">
                             <form onSubmit={async (e) => {
                                e.preventDefault();
                                const form = e.target as HTMLFormElement;
                                const btn = form.querySelector('button');
                                const fd = new FormData(form);
                                if(btn) btn.disabled = true;
                                try {
                                   const res = await fetch('/api/citizen/pay-loan', {
                                      method: 'POST',
                                      headers: {'Content-Type': 'application/json'},
                                      body: JSON.stringify({ 
                                          loanId: loan.id, 
                                          fromAccountId: fd.get("fromAccountId"),
                                          amount: Math.round(parseFloat(fd.get("amount") as string) * 100)
                                      })
                                   });
                                   const d = await res.json();
                                   if(!res.ok) alert(d.error || "Failed");
                                   else {
                                      alert("Payment successful!");
                                      form.reset();
                                      handleSearch(new Event('submit') as unknown as React.FormEvent);
                                   }
                                } catch(err) {
                                   console.error(err);
                                } finally {
                                   if(btn) btn.disabled = false;
                                }
                             }} className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1 w-full">
                                   <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">Pay from account</label>
                                   <select required name="fromAccountId" className="w-full bg-[#111116] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 hover:bg-white/5 transition-colors">
                                      <option value="">Select an account...</option>
                                      {userData.accounts.map((acc: any) => (
                                         <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                                            {acc.accountName} ({formatMoney(acc.balance)})
                                         </option>
                                      ))}
                                   </select>
                                </div>
                                <div className="w-full md:w-48">
                                   <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">Amount ($)</label>
                                   <input required name="amount" type="number" step="0.01" min="1.00" max={(loan.remainingAmount / 100).toFixed(2)} defaultValue={(loan.remainingAmount / 100).toFixed(2)} className="w-full bg-[#111116] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500/50 font-mono hover:bg-white/5 transition-colors" />
                                </div>
                                <button type="submit" className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-blue-500/20">
                                   Submit Payment
                                </button>
                             </form>
                          </div>
                        </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-12 bg-black/20 border border-white/5 rounded-3xl border-dashed">
                    <ShieldCheck className="mx-auto text-white/20 mb-4" size={40} />
                    <h3 className="text-white/80 font-bold mb-1">No Active Loans</h3>
                    <p className="text-white/50 text-sm">You do not have any active loans with our banking partners.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "apply" && (
              <div className="animate-in fade-in duration-300">
                <div className="mb-8 text-center max-w-lg mx-auto">
                  <h3 className="text-2xl font-bold text-white/90 mb-2">Financing & Credit</h3>
                  <p className="text-sm text-white/50 font-medium">Request a new loan or line of credit. Applications are instantly routed to bank staff for review, or auto-approved based on criteria.</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Loan Form */}
                  <div className="bg-black/40 border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
                     <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Wallet size={80} className="text-emerald-400" />
                     </div>
                     <h4 className="text-lg font-bold text-white/90 mb-2 relative z-10">New Loan Application</h4>
                     <p className="text-xs text-white/50 mb-6 font-medium relative z-10">Receive a lump sum deposit to fund your next big project.</p>
                     
                     <form onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const fd = new FormData(form);
                        const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                        submitBtn.disabled = true;
                        const act = userData.accounts.find((a: any) => a.id === fd.get("accountId"));
                        
                        try {
                           const res = await fetch("/api/citizen/loans/apply", {
                              method: "POST",
                              headers: {"Content-Type": "application/json"},
                              body: JSON.stringify({
                                 bankId: act.bankId,
                                 discordId: user.discordId,
                                 accountId: act.id,
                                 principalAmount: parseFloat(fd.get("principalAmount") as string) * 100,
                                 purpose: fd.get("purpose")
                              })
                           });
                           const json = await res.json();
                           if (!res.ok) alert(json.error || "Application failed");
                           else {
                              if (json.autoApprove) alert("Loan automatically approved! Funds have been deposited.");
                              else alert("Loan application sent to staff for review.");
                              handleSearch(new Event('submit') as unknown as React.FormEvent);
                              form.reset();
                           }
                        } catch(err) {
                            console.error(err);
                        } finally {
                            submitBtn.disabled = false;
                        }
                     }} className="space-y-4 relative z-10">
                        <div>
                           <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Deposit Account</label>
                           <select name="accountId" required className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 hover:bg-white/5 transition-colors">
                              <option value="">Select Account</option>
                              {userData.accounts.map((a: any) => (
                                 <option key={a.id} value={a.id}>{a.bankName} - {a.accountName}</option>
                              ))}
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Amount ($)</label>
                           <input type="number" name="principalAmount" required min="1" step="0.01" placeholder="0.00" className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 font-mono hover:bg-white/5 transition-colors" />
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Reason / Purpose</label>
                           <input type="text" name="purpose" required placeholder="e.g. Business Expansion" className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 hover:bg-white/5 transition-colors" />
                        </div>
                        <button type="submit" className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition-all shadow-xl shadow-white/10 mt-2">
                           Submit Application
                        </button>
                     </form>
                  </div>

                  {/* Credit Card Form */}
                  <div className="bg-black/40 border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
                     <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CreditCard size={80} className="text-indigo-400" />
                     </div>
                     <h4 className="text-lg font-bold text-white/90 mb-2 relative z-10">New Credit Line</h4>
                     <p className="text-xs text-white/50 mb-6 font-medium relative z-10">Apply for a revolving line of credit attached to a card.</p>
                     
                     <form onSubmit={async (e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const fd = new FormData(form);
                        const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
                        submitBtn.disabled = true;
                        const act = userData.accounts.find((a: any) => a.id === fd.get("accountId"));
                        
                        try {
                           const res = await fetch("/api/citizen/credit/apply", {
                              method: "POST",
                              headers: {"Content-Type": "application/json"},
                              body: JSON.stringify({
                                 bankId: act.bankId,
                                 discordId: user.discordId,
                                 accountId: act.id,
                                 requestedLimit: parseFloat(fd.get("requestedLimit") as string) * 100,
                                 monthlyIncome: parseFloat(fd.get("monthlyIncome") as string) * 100,
                                 purpose: fd.get("purpose")
                              })
                           });
                           const json = await res.json();
                           if (!res.ok) alert(json.error || "Application failed");
                           else {
                              if (json.autoApprove) alert("Credit limit automatically approved! Card issued.");
                              else alert("Credit application sent to staff for review.");
                              handleSearch(new Event('submit') as unknown as React.FormEvent);
                              form.reset();
                           }
                        } catch(err) {
                            console.error(err);
                        } finally {
                            submitBtn.disabled = false;
                        }
                     }} className="space-y-4 relative z-10">
                        <div>
                           <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Backing Account</label>
                           <select name="accountId" required className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 hover:bg-white/5 transition-colors">
                              <option value="">Select Account</option>
                              {userData.accounts.map((a: any) => (
                                 <option key={a.id} value={a.id}>{a.bankName} - {a.accountName}</option>
                              ))}
                           </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Req Limit ($)</label>
                              <input type="number" name="requestedLimit" required min="1" step="0.01" placeholder="0.00" className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 font-mono hover:bg-white/5 transition-colors" />
                           </div>
                           <div>
                              <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Mo Income ($)</label>
                              <input type="number" name="monthlyIncome" required min="0" step="0.01" placeholder="0.00" className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 font-mono hover:bg-white/5 transition-colors" />
                           </div>
                        </div>
                        <div>
                           <label className="block text-[10px] font-bold text-white/40 mb-2 uppercase tracking-widest">Reason</label>
                           <input type="text" name="purpose" required placeholder="e.g. Travel Expenses" className="w-full bg-[#111116] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 hover:bg-white/5 transition-colors" />
                        </div>
                        <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-xl shadow-indigo-500/20 mt-2">
                           Apply for Credit
                        </button>
                     </form>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}{userData?.error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center text-sm font-medium">
          {userData.error}
        </div>
      )}
      </>
      )}
    </div>
  );
}
