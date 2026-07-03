import { useState, useEffect } from "react";
import { Search, Wallet, ArrowRight, ShieldCheck, Clock, CreditCard, Eye, EyeOff, Lock, Unlock, Link2, BookOpen, LogIn, LogOut } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";

export function CitizenPortal() {
  const { user, login, logout, isLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
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
        setUserData({ error: "No accounts found for this Discord ID." });
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
            <p className="text-white/50 text-sm">Please securely authenticate with Discord to access your financial portfolio.</p>
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

          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck className="text-emerald-400" size={20} />
            <h2 className="text-lg font-medium text-white/90">Verified Network Assets</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {userData.accounts?.map((acc: any) => (
              <div key={acc.id} className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden hover:border-blue-500/30 transition-colors">
                <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-8 h-8 rounded bg-blue-500/20 flex flex-shrink-0 items-center justify-center text-blue-400 font-bold uppercase text-xs">
                      {acc.bankName.substring(0, 2)}
                    </div>
                                          <span 
                        className="text-[10px] font-mono text-white/30 bg-white/5 px-2 py-1 rounded-full flex items-center gap-1 max-w-[120px] cursor-pointer hover:bg-white/10 transition-colors" 
                        title={`Click to copy: ${acc.id}`}
                        onClick={() => {
                          navigator.clipboard.writeText(acc.id);
                          const el = document.getElementById(`copy-${acc.id}`);
                          if (el) {
                             el.innerText = "Copied!";
                             setTimeout(() => { if (el) el.innerText = acc.id }, 2000);
                          }
                        }}
                      >
                        <span id={`copy-${acc.id}`} className="truncate">{acc.id}</span>
                      </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">{acc.bankName}</p>
                    <p className="text-indigo-300 text-xs mt-0.5">{acc.accountName}</p>
                  </div>
                </div>
                <div className="p-5 flex items-end justify-between bg-[#0a0a0c]">
                  <p className="text-xs text-white/40 font-medium">Balance</p>
                  <p className="text-2xl font-mono tracking-tight text-white/90">
                    {formatMoney(acc.balance || 0)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {userData.accounts?.length > 0 && (
            <>
            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm max-w-xl mx-auto">
               <h3 className="font-medium text-lg mb-4 text-white/90 text-center">Execute Transfer</h3>
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
                      // Refresh the user data
                      handleSearch(new Event('submit') as unknown as React.FormEvent);
                    }
                  } catch (err) {
                    console.error(err);
                  } finally {
                    if (btn) btn.disabled = false;
                  }
               }} className="space-y-4">
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">From Account</label>
                   <select required name="fromAccountId" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50">
                      {userData.accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                           {acc.bankName} - {acc.accountName} ({formatMoney(acc.balance)})
                        </option>
                      ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Recipient Account ID</label>
                   <input required name="toAccountId" type="text" placeholder="UUID of destination account" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50 font-mono text-sm" />
                 </div>
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Amount ($)</label>
                   <input required name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50" />
                 </div>
                 <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition-all disabled:opacity-50 mt-2">
                   Send Money
                 </button>
               </form>
            </div>
            
            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm max-w-xl mx-auto">
               <h3 className="font-medium text-lg mb-4 text-white/90 text-center flex items-center justify-center gap-2">
                 <Link2 size={20} className="text-blue-400" /> Onyx Quick Pay
               </h3>
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
                        userDiscordId: user.discordId,
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
               }} className="space-y-4">
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">From Account</label>
                   <select required name="fromAccountId" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50">
                      {userData.accounts.map((acc: any) => (
                        <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                           {acc.bankName} - {acc.accountName} ({formatMoney(acc.balance)})
                        </option>
                      ))}
                   </select>
                 </div>
                 
                 <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Select Onyx Merchant</label>
                   <select required name="apiKey" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50">
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
                     <input required name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50" />
                   </div>
                   <div>
                     <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Description (Opt)</label>
                     <input name="description" type="text" placeholder="e.g. Server Donation" className="w-full bg-[#0a0a0c] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500/50" />
                   </div>
                 </div>
                 <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 py-3 rounded-xl font-medium transition-all mt-2 disabled:opacity-50">
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
               <p className="text-white/40 text-sm mt-1">You haven't opened any bank accounts within the Slate network yet.</p>
             </div>
          )}

          {userData.pendingInvoices?.length > 0 && (
            <div className="mt-8 bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
               <div className="px-6 py-5 border-b border-amber-500/10">
                 <h3 className="font-medium text-amber-500 flex items-center gap-2">
                    Action Required: Pending Invoices
                 </h3>
               </div>
               <div className="divide-y divide-amber-500/10">
                 {userData.pendingInvoices.map((inv: any) => (
                    <div key={inv.id} className="px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white/90">{inv.description}</p>
                        <p className="text-xs text-white/50 mt-1">
                          Billed by: {inv.billerName} ({inv.billerAccountName})
                        </p>
                        <p className="text-xs mt-1 text-red-400">
                          Due: {format(new Date(inv.dueDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 w-full md:w-auto">
                        <span className="font-mono text-lg font-bold text-white">
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
                          className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 md:flex-none text-center"
                        >
                          Pay Now
                        </button>
                      </div>
                    </div>
                 ))}
               </div>
            </div>
          )}
          
          {userData.loans?.length > 0 && (
            <div className="mt-8 bg-blue-500/5 border border-blue-500/20 rounded-xl overflow-hidden">
               <div className="px-6 py-5 border-b border-blue-500/10">
                 <h3 className="font-medium text-blue-400 flex items-center gap-2">
                    <Wallet size={16} /> Active Loans
                 </h3>
               </div>
               <div className="divide-y divide-blue-500/10 p-6 space-y-6">
                 {userData.loans.map((loan: any) => (
                    <div key={loan.id} className="bg-[#0a0a0c] border border-white/5 rounded-xl p-5">
                       <div className="flex justify-between items-start mb-4">
                         <div>
                           <div className="text-white/80 font-medium">Loan from {loan.bankName}</div>
                           <div className="text-xs text-white/50">{loan.interestRate}% Interest Rate • Next Payment: {format(new Date(loan.nextPaymentDate), "PP")}</div>
                         </div>
                         <div className="text-right">
                           <div className="text-xl font-mono font-semibold text-white/90">{formatMoney(loan.remainingAmount)}</div>
                           <div className="text-xs text-white/40 uppercase tracking-widest mt-1">Remaining Balance</div>
                         </div>
                       </div>
                       
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
                       }} className="flex gap-4 items-end pt-4 border-t border-white/5">
                          <div className="flex-1">
                             <label className="block text-xs text-white/50 uppercase tracking-widest mb-2">Pay from account</label>
                             <select required name="fromAccountId" className="w-full bg-[#121216] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none">
                                {userData.accounts.map((acc: any) => (
                                   <option key={acc.id} value={acc.id} disabled={acc.balance <= 0}>
                                      {acc.accountName} ({formatMoney(acc.balance)})
                                   </option>
                                ))}
                             </select>
                          </div>
                          <div>
                             <label className="block text-xs text-white/50 uppercase tracking-widest mb-2">Amount to Pay ($)</label>
                             <input required name="amount" type="number" step="0.01" min="1.00" max={(loan.remainingAmount / 100).toFixed(2)} defaultValue={(loan.remainingAmount / 100).toFixed(2)} className="w-32 bg-[#121216] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none font-mono" />
                          </div>
                          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-6 rounded-lg text-sm transition-colors h-[42px]">
                             Make Payment
                          </button>
                       </form>
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
                    <div className={`relative overflow-hidden rounded-xl p-5 shadow-lg border border-white/10 flex flex-col justify-between transition-all aspect-[1.586/1] ${card.isLocked ? 'bg-slate-800 opacity-60 grayscale' : (card.type === 'credit' ? 'bg-gradient-to-br from-indigo-900 to-purple-900' : 'bg-gradient-to-br from-slate-800 to-slate-900')}`}>
                      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                      <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-2">
                          <div className="text-xl font-bold italic tracking-wide text-white mix-blend-overlay opacity-90">
                            {card.bankName}
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
                        className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium transition-colors border ${card.isLocked ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent' : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/10'}`}
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
                 <h3 className="font-medium text-white/90 flex items-center gap-2">
                   <Clock size={16} className="text-blue-400" /> Recent Transactions
                 </h3>
               </div>
               <div className="divide-y divide-white/5">
                 {userData.recentTx.map((tx: any, i: number) => {
                   const isIncoming = tx.toDiscordId === user.discordId;
                   return (
                     <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                       <div className="flex gap-4 items-center">
                         <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                           ${isIncoming ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}
                         >
                           {isIncoming ? '+' : '-'}
                         </div>
                         <div>
                           <p className="font-medium text-white/90 text-sm">{tx.description || tx.type}</p>
                           <p className="text-xs text-white/40 mt-0.5">
                             {tx.bankName} • {format(new Date(tx.timestamp), "MMM d, yyyy h:mm a")}
                           </p>
                         </div>
                       </div>
                       <div className="text-right">
                         <p className={`font-mono font-medium ${isIncoming ? 'text-emerald-400' : 'text-white/80'}`}>
                           {isIncoming ? '+' : '-'}{formatMoney(tx.amount || 0)}
                         </p>
                       </div>
                     </div>
                   );
                 })}
               </div>
            </div>
          )}
           {/* Loan Application Block */}
           <div className="mt-12 bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden p-6 lg:p-8">
              <h3 className="font-medium text-lg text-white/90 mb-6 flex items-center gap-2">
                 <Wallet size={18} className="text-white/80" /> Apply for Credit or Loan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {/* Loan Form */}
                 <div className="space-y-4">
                    <h4 className="text-sm font-medium text-white/70 uppercase tracking-wider">New Loan Application</h4>
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
                    }} className="space-y-3">
                       <select name="accountId" required className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" style={{WebkitAppearance:"none"}}>
                          <option value="">Select Deposit Account</option>
                          {userData.accounts.map((a: any) => (
                             <option key={a.id} value={a.id}>{a.bankName} - {a.accountName}</option>
                          ))}
                       </select>
                       <input type="number" name="principalAmount" required min="1" step="0.01" placeholder="Loan Amount ($)" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                       <input type="text" name="purpose" required placeholder="Reason for Loan" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                       <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors">Submit Loan App</button>
                    </form>
                 </div>

                 {/* Credit Card Form */}
                 <div className="space-y-4">
                    <h4 className="text-sm font-medium text-white/70 uppercase tracking-wider">New Credit Line</h4>
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
                    }} className="space-y-3">
                       <select name="accountId" required className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" style={{WebkitAppearance:"none"}}>
                          <option value="">Select Backing Account</option>
                          {userData.accounts.map((a: any) => (
                             <option key={a.id} value={a.id}>{a.bankName} - {a.accountName}</option>
                          ))}
                       </select>
                       <div className="flex gap-3">
                         <input type="number" name="requestedLimit" required min="1" step="0.01" placeholder="Limit ($)" className="w-1/2 bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                         <input type="number" name="monthlyIncome" required min="0" step="0.01" placeholder="Income ($)" className="w-1/2 bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                       </div>
                       <input type="text" name="purpose" required placeholder="Reason for line of credit" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50" />
                       <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors">Apply for Credit</button>
                    </form>
                 </div>
              </div>
           </div>
        </div>
      )}

      {userData?.error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center text-sm font-medium">
          {userData.error}
        </div>
      )}
      </>
      )}
    </div>
  );
}
