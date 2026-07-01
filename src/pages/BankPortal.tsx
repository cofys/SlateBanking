import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, Lock, Unlock, Loader2, Link2, LogIn, LogOut } from "lucide-react";
import { format } from "date-fns";

export function BankPortal() {
  const { bankId } = useParams();
  const { user, login, logout, isLoading } = useAuth();
  const [bank, setBank] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [visibleCardIds, setVisibleCardIds] = useState<Record<string, boolean>>({});
  const [onyxMerchants, setOnyxMerchants] = useState<any[]>([]);
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth") === "success") {
      setOauthSuccess(params.get("username"));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    fetch(`/api/portal/${bankId}/info`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) setBank(d);
      });
      
    fetch("/api/onyx/merchants")
      .then(r => r.json())
      .then(d => setOnyxMerchants(d || []));
  }, [bankId]);

  useEffect(() => {
    if (user && bank) handleSearch();
  }, [user, bank]);

  const colorCss = bank?.settings?.colorScheme || 'indigo';

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
      const res = await fetch(`/api/portal/${bankId}/lookup`);
      if (res.ok) {
        setUserData(await res.json());
      } else {
        setUserData({ error: "No accounts found for this Discord ID at this bank." });
      }
    } catch (e) {
      console.error(e);
      setUserData({ error: "System error while fetching data." });
    }
    setLoading(false);
  };

  if (isLoading || !bank) return <div className="p-10 text-center text-white/50">Loading bank portal...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 mt-6 mb-20 px-4">
      <div className="text-center space-y-3 mb-12">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center font-bold text-3xl mx-auto shadow-xl shadow-indigo-500/20">
          {bank.name.substring(0, 2).toUpperCase()}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{bank.name} Portal</h1>
        <p className="text-white/50 max-w-lg mx-auto">Access your accounts and manage your finances securely.</p>
      </div>

      {oauthSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 text-emerald-300 text-sm flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <p className="font-semibold text-white">Profile Successfully Verified!</p>
              <p className="text-white/60 text-xs mt-0.5">Your Minecraft profile <strong>{oauthSuccess}</strong> is now linked and validated with {bank.name}.</p>
            </div>
          </div>
          <button onClick={() => setOauthSuccess(null)} className="text-white/40 hover:text-white/80 font-bold px-2 py-1">×</button>
        </div>
      )}

      {!user ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-10 shadow-2xl backdrop-blur-sm max-w-xl mx-auto text-center space-y-6">
          <div>
            <h2 className="text-xl font-medium text-white mb-2">Authentication Required</h2>
            <p className="text-white/50 text-sm">Please securely authenticate with Discord to access your {bank.name} portfolio.</p>
          </div>
          <button 
            onClick={login}
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium py-3 rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 flex items-center justify-center gap-2"
          >
            <LogIn size={18} /> Login with Discord
          </button>
        </div>
      ) : (
        <>
        <div className="flex justify-end mb-4">
           <button onClick={logout} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors bg-white/5 px-4 py-2 rounded-full border border-red-500/20">
             <LogOut size={16} /> Logout
           </button>
        </div>
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
        </>
      )}

      {userData && !userData.error && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className={`text-${colorCss}-400`} size={20} />
            <h2 className="text-xl font-semibold text-white/90">Identity Verified</h2>
          </div>

          {/* Linked Minecraft & CityCorp Profile Panel */}
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
            <div className="flex items-center gap-4">
              {userData.customer?.mcUuid ? (
                <img 
                  src={`https://mc-heads.net/avatar/${userData.customer.mcUuid}/64`} 
                  alt="Minecraft avatar" 
                  className="w-16 h-16 rounded-xl border border-white/10" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Link2 size={28} />
                </div>
              )}
              <div className="text-left">
                <h3 className="font-semibold text-lg text-white">
                  {userData.customer?.mcUsername ? `Linked Minecraft: ${userData.customer.mcUsername}` : "Unlinked Minecraft Profile"}
                </h3>
                <p className="text-sm text-white/50 mt-0.5">
                  {userData.customer?.mcUsername 
                    ? `Your account is whitelabel validated. Welcome, ${userData.customer.mcUsername}!`
                    : `Link your Minecraft character with ${bank.name} to complete whitelabel profile validation.`}
                </p>
                {userData.customer?.mcUuid && (
                  <p className="text-xs text-white/35 font-mono mt-1">UUID: {userData.customer.mcUuid}</p>
                )}
              </div>
            </div>

            <div>
              {userData.customer?.mcUsername ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping"></span>
                  Profile Verified
                </span>
              ) : (
                bank.cityCorpAppId ? (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/portal/${bankId}/oauth/url`);
                        if (res.ok) {
                          const data = await res.json();
                          window.location.href = data.url;
                        } else {
                          const errData = await res.json();
                          alert(errData.error || "Failed to initiate login flow.");
                        }
                      } catch (err) {
                        alert("Error connecting to validation service.");
                      }
                    }}
                    className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold py-2.5 px-5 rounded-lg text-sm transition-all shadow-lg shadow-amber-500/10 cursor-pointer"
                  >
                    Verify with CityCorp
                  </button>
                ) : (
                  <span className="text-xs text-white/40 italic">
                    CityCorp validation not yet configured by staff.
                  </span>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userData.accounts?.map((acc: any) => (
              <div key={acc.id} className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-colors">
                <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg text-white/90">{acc.accountName}</h3>
                      <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">{acc.type} Account</p>
                    </div>
                  </div>
                  <div className="text-2xl font-bold tabular-nums tracking-tight">
                    ${(acc.balance / 100).toFixed(2)}
                  </div>
                </div>
                <div className="bg-[#0a0a0c] px-5 py-3 text-xs text-white/40 flex justify-between items-center font-mono">
                  <span>ID: {acc.id.split('-')[0]}...</span>
                  {acc.routingNumber && <span>RTN: {acc.routingNumber}</span>}
                </div>
              </div>
            ))}
          </div>

          {userData.accounts?.length > 0 && (
            <>
            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm max-w-xl mx-auto">
               <h3 className="font-medium text-lg mb-4 text-white/90 text-center">Execute Transfer</h3>
               <form onSubmit={async (e) => {
                  
                  const form = e.target as any;
                  try {
                    const res = await fetch(`/api/portal/${bankId}/transfer`, {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({
                        discordId: user?.discordId,
                        fromAccountId: form.fromAccountId.value,
                        toAccountId: form.toAccountId.value,
                        amount: form.amount.value
                      })
                    });
                    const d = await res.json();
                    if (!res.ok) alert(d.error || "Failed");
                    else {
                      alert("Transfer successful!");
                      handleSearch(new Event('submit') as unknown as React.FormEvent);
                      form.reset();
                    }
                  } catch (e) {
                      alert("Service error");
                  }
               }} className="space-y-4">
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">From Account</label>
                   <select required name="fromAccountId" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50`}>
                      {userData.accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                           {acc.accountName} (${(acc.balance / 100).toFixed(2)})
                        </option>
                      ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">To Checkings/Savings ID</label>
                   <input required name="toAccountId" type="text" placeholder="Destination Account ID" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50 font-mono text-sm`} />
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Amount ($)</label>
                   <input required name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50`} />
                 </div>
                 <button type="submit" className={`w-full bg-${colorCss}-500/20 text-${colorCss}-400 border border-${colorCss}-500/30 hover:bg-${colorCss}-500/30 py-3 rounded-xl font-medium transition-colors mt-2`}>
                   Submit Transfer
                 </button>
               </form>
            </div>
            
            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm max-w-xl mx-auto">
               <h3 className="font-medium text-lg mb-4 text-white/90 text-center flex items-center justify-center gap-2">
                 <Link2 size={20} className={`text-${colorCss}-400`} /> Onyx Quick Pay
               </h3>
               <form onSubmit={async (e) => {
                  
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
                        userDiscordId: user?.discordId,
                        amountCents: Math.round(parseFloat(fd.get("amount") as string) * 100),
                        description: fd.get("description") || "Onyx Quick Pay from Portal"
                      })
                    });
                    const d = await onyxRes.json();
                    if (!onyxRes.ok) alert(d.error || "Onyx payment failed");
                    else {
                      alert("Onyx payment successful!");
                      handleSearch(new Event('submit') as unknown as React.FormEvent);
                      form.reset();
                    }
                  } catch (e) {
                      alert("Service error");
                  } finally {
                      submitBtn.disabled = false;
                  }
               }} className="space-y-4">
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">From Account</label>
                   <select required name="fromAccountId" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50`}>
                      {userData.accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                           {acc.accountName} (${(acc.balance / 100).toFixed(2)})
                        </option>
                      ))}
                   </select>
                 </div>
                 
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Select Onyx Merchant</label>
                   <select required name="apiKey" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50`}>
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
                     <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Amount ($)</label>
                     <input required name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50`} />
                   </div>
                   <div>
                     <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Description (Opt)</label>
                     <input name="description" type="text" placeholder="e.g. Server Donation" className={`w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-${colorCss}-500/50`} />
                   </div>
                 </div>
                 <button type="submit" className={`w-full bg-${colorCss}-500 hover:bg-${colorCss}-400 text-white shadow-lg shadow-${colorCss}-500/20 py-3 rounded-xl font-medium transition-colors mt-2`}>
                   Pay via Onyx
                 </button>
               </form>
            </div>
            </>
          )}

          {userData.accounts?.length === 0 && (
             <div className="text-center p-12 bg-[#0f0f15] border border-white/10 rounded-xl">
               <Wallet className="mx-auto text-white/20 mb-4" size={48} />
               <h3 className="text-white/80 font-medium">No active accounts</h3>
               <p className="text-white/40 text-sm mt-1">You haven't opened any bank accounts within {bank.name} yet.</p>
             </div>
          )}

          {userData.pendingInvoices?.length > 0 && (
            <div className={`mt-8 bg-${colorCss}-500/5 border border-${colorCss}-500/20 rounded-xl overflow-hidden`}>
               <div className={`px-6 py-5 border-b border-${colorCss}-500/10`}>
                 <h3 className={`font-medium text-${colorCss}-500 flex items-center gap-2`}>
                    Action Required: Pending Invoices
                 </h3>
               </div>
               <div className={`divide-y divide-${colorCss}-500/10`}>
                 {userData.pendingInvoices.map((inv: any) => (
                    <div key={inv.id} className="px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white/90">{inv.description}</p>
                        <p className="text-xs text-white/50 mt-1">
                          Billed to: {inv.customerAccountName}
                        </p>
                        <p className="text-xs mt-1 text-red-400">
                          Due: {format(new Date(inv.dueDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <span className="font-mono text-lg font-medium text-white">
                          ${(inv.amount / 100).toFixed(2)}
                        </span>
                        <button 
                          onClick={async (e) => {
                             const btn = e.currentTarget;
                             btn.disabled = true;
                             try {
                               const res = await fetch(`/api/portal/${bankId}/pay-invoice`, {
                                 method: 'POST',
                                 headers: {'Content-Type': 'application/json'},
                                 body: JSON.stringify({ discordId: user?.discordId, invoiceId: inv.id })
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
                          className={`bg-${colorCss}-500 hover:bg-${colorCss}-400 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 md:flex-none text-center`}
                        >
                          Pay Now
                        </button>
                      </div>
                    </div>
                 ))}
               </div>
            </div>
          )}
          
          {userData.cards?.length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="font-medium text-lg text-white/90">Your Connected Cards</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userData.cards.map((card: any) => (
                  <div key={card.id} className="relative group">
                    <div className={`relative overflow-hidden rounded-xl p-5 shadow-lg border border-white/10 flex flex-col justify-between transition-all aspect-[1.586/1] ${card.isLocked ? 'bg-slate-800 opacity-60 grayscale' : (card.type === 'credit' ? `bg-gradient-to-br from-${colorCss}-900 to-slate-900` : 'bg-gradient-to-br from-slate-800 to-slate-900')}`}>
                      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                      <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-2">
                          <div className="text-xl font-bold italic tracking-wide text-white mix-blend-overlay opacity-90">
                            {bank.name}
                          </div>
                          {card.isLocked && <span className="bg-red-500/20 text-red-300 text-[10px] px-2 py-0.5 rounded-full border border-red-500/30">LOCKED</span>}
                        </div>
                        <div className="text-white/80 font-medium text-xs tracking-widest uppercase">
                          {card.type}
                        </div>
                      </div>
                      
                      <div className="relative z-10 my-4 flex-1 flex flex-col justify-center">
                        <div className="font-mono text-lg tracking-widest text-white/90 font-medium flex items-center justify-between drop-shadow-md">
                          <span>{formatCardNumber(card.cardNumber, visibleCardIds[card.id])}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-end relative z-10 mt-auto">
                        <div>
                          <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">Account</div>
                          <div className="text-sm font-medium text-white/90 tracking-wider truncate max-w-[120px]">
                            {card.accountName}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">Exp</div>
                            <div className="font-mono text-sm text-white/90 tracking-wider">{card.expiryDate}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-white/50 uppercase tracking-widest mb-0.5">CVV</div>
                            <div className="font-mono text-sm text-white/90 tracking-wider">{visibleCardIds[card.id] ? card.cvv : '•••'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-2 flex gap-2">
                      <button 
                        onClick={async (e) => {
                          const btn = e.currentTarget;
                          btn.disabled = true;
                          try {
                            const res = await fetch(`/api/portal/${bankId}/cards/${card.id}/lock`, {
                              method: 'PATCH',
                              headers: {'Content-Type': 'application/json'},
                              body: JSON.stringify({ discordId: user?.discordId, isLocked: !card.isLocked })
                            });
                            if (res.ok) handleSearch(new Event('submit') as unknown as React.FormEvent);
                            else alert("Failed to lock/unlock card");
                          } catch (err) {
                            console.error(err);
                          } finally {
                            btn.disabled = false;
                          }
                        }}
                        className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border ${card.isLocked ? `bg-${colorCss}-600 hover:bg-${colorCss}-700 text-white border-transparent` : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'}`}
                      >
                        {card.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                        {card.isLocked ? "Unlock Card" : "Lock Card"}
                      </button>
                      <button 
                        onClick={() => toggleCardVisibility(card.id)}
                        className="py-1.5 px-3 rounded-lg flex items-center justify-center text-xs font-medium bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors"
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

          {userData.recentTx?.length > 0 && (
            <div className="mt-12 bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
               <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
                 <h3 className={`font-medium text-${colorCss}-400 flex items-center gap-2`}>
                   <Clock size={16} /> Recent Transactions
                 </h3>
               </div>
               <div className="divide-y divide-white/5">
                 {userData.recentTx.map((tx: any, i: number) => {
                   const isIncoming = tx.toDiscordId === user?.discordId;
                   return (
                     <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                       <div className="flex gap-4 items-center">
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                           ${isIncoming ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                           {isIncoming ? '+' : '-'}
                         </div>
                         <div>
                           <div className="font-medium text-white/90">
                              {tx.description || tx.type}
                           </div>
                           <div className="text-xs text-white/40 mt-1">
                             {format(new Date(tx.timestamp), "MMM d, h:mm a")}
                           </div>
                         </div>
                       </div>
                       <div className={`font-mono text-lg font-bold ${isIncoming ? 'text-emerald-400' : 'text-rose-400'}`}>
                         {isIncoming ? '+' : '-'}${(tx.amount / 100).toFixed(2)}
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}

        </div>
      )}

      {userData?.error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center text-sm font-medium">
          {userData.error}
        </div>
      )}
    </div>
  );
}
