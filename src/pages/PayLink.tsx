import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, LogIn, Send } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";

export function PayLink() {
  const { linkId } = useParams();
  const { user, login, rememberMe, setRememberMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/citizen/payment-links/${linkId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setLinkData(d);
        setLoading(false);
      });
  }, [linkId]);

  useEffect(() => {
    if (user) {
      fetch('/api/citizen/lookup')
        .then(r => r.json())
        .then(d => {
           if (d.accounts) setAccounts(d.accounts);
        });
    }
  }, [user]);

  if (loading) return (
     <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
     </div>
  );

  if (error || !linkData) return (
     <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
        <div className="bg-[#12121a] border border-red-500/20 p-8 rounded-2xl max-w-md w-full text-center shadow-xl text-red-400">
          <ShieldCheck className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Invalid Payment Link</h2>
          <p className="text-sm">{error || "This payment link does not exist or has expired."}</p>
        </div>
     </div>
  );

  if (!user) return (
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center p-4 relative overflow-hidden selection:bg-indigo-500/30">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="bg-[#0e0e15]/95 border border-white/10 p-8 sm:p-10 rounded-2xl max-w-md w-full text-center shadow-2xl relative z-10 backdrop-blur-xl space-y-6">
          <div className="relative mx-auto w-16 h-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20 text-white">
              <ShieldCheck size={32} />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Payment Authorization</h1>
            <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed font-medium">
              Authenticate your identity to complete payment to <strong className="text-zinc-200">{linkData.accountName}</strong> ({linkData.bankName}).
            </p>
          </div>

          <div className="bg-black/40 border border-white/5 rounded-xl p-4 text-center">
            <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Amount Due</div>
            <div className="text-2xl font-black text-white mt-0.5">{formatMoney(linkData.amount)}</div>
            {linkData.description && (
              <p className="text-xs text-zinc-400 mt-1 italic">"{linkData.description}"</p>
            )}
          </div>
          
          <div className="space-y-4 pt-1">
            <label className="flex items-center justify-center gap-2 cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 select-none transition-colors">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)} 
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900 cursor-pointer"
              />
              <span>Remember me on this device</span>
            </label>

            <div className="space-y-2.5">
              <button 
                onClick={() => login(undefined, 'citycorp')}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30 active:scale-[0.99] text-sm cursor-pointer"
              >
                <LogIn size={18} />
                Continue with CityCorp
              </button>

              <button 
                onClick={() => login(undefined, 'discord')}
                className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2.5 transition-all shadow-lg shadow-[#5865F2]/20 hover:shadow-[#5865F2]/30 active:scale-[0.99] text-sm cursor-pointer"
              >
                <LogIn size={18} />
                Continue with Discord
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
              Secured under Onyx PSP instant settlement protocol.
            </p>
          </div>
        </div>
      </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8 text-slate-300">
        <div className="bg-[#12121a] border border-white/5 p-8 rounded-2xl max-w-md w-full shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-indigo-500"></div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-white tracking-tight">Payment Request</h1>
            <p className="text-slate-400 text-sm mt-2">Paying to <span className="font-bold text-white">{linkData.accountName}</span> ({linkData.bankName})</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6 text-center mb-8">
            <div className="text-sm text-slate-400 mb-1">Requested Amount</div>
            <div className="text-4xl font-black text-emerald-400">{linkData.link.amount > 0 ? formatMoney(linkData.link.amount) : "Open Amount"}</div>
            <div className="text-sm text-slate-400 mt-4 italic">"{linkData.link.description}"</div>
          </div>

          <form onSubmit={async (e:any) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              
              const res = await fetch('/api/citizen/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    fromAccountId: fd.get("fromAccountId"),
                    toAccountId: linkData.link.billerAccountId,
                    amount: linkData.link.amount > 0 ? (linkData.link.amount / 100).toFixed(2) : fd.get("amount"),
                    description: linkData.link.description
                })
              });
              
              if (res.ok) {
                 alert("Payment successful!");
                 window.location.href = "/portal";
              } else {
                 const err = await res.json();
                 alert(err.error || "Payment failed");
              }
           }}>
             {linkData.link.amount === 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-400 mb-1">Amount ($)</label>
                  <input required name="amount" type="number" step="0.01" min="0.01" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-sm text-white" placeholder="0.00" />
                </div>
             )}
             <div className="mb-6">
                <label className="block text-sm font-medium text-slate-400 mb-1">Pay From</label>
                <select required name="fromAccountId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="">Select Account...</option>
                  {accounts.map((acc: any) => <option key={acc.id} value={acc.id}>{acc.accountName} ({formatMoney(acc.balance)})</option>)}
                </select>
             </div>
             
             <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors">
               <Send size={18} /> Send Payment
             </button>
          </form>
        </div>
    </div>
  );
}
