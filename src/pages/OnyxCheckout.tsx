import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, ArrowRight, CreditCard, Wallet, Lock, Building, DollarSign } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { formatMoney } from "../lib/utils";

export function OnyxCheckout() {
  const [searchParams] = useSearchParams();
  const merchantId = searchParams.get("merchantId");
  const amount = searchParams.get("amount");
  const description = searchParams.get("description") || "Onyx Network Purchase";
  const callbackUrl = searchParams.get("callbackUrl");

  const { user } = useAuth();
  const [merchant, setMerchant] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState("");
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    document.title = "Onyx Secure Checkout";
    if (!merchantId || !amount) {
      setError("Invalid checkout link. Missing merchant ID or amount.");
      setLoading(false);
      return;
    }

    fetch(`/api/onyx/merchant/${merchantId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setMerchant(d);
        setLoading(false);
      });
  }, [merchantId, amount]);

  useEffect(() => {
    if (user) {
      fetch('/api/citizen/lookup')
        .then(r => r.json())
        .then(d => {
          if (d.accounts) setAccounts(d.accounts);
          if (d.cards) setCards(d.cards.filter((c: any) => !c.isLocked));
        });
    }
  }, [user]);

  const handleApprove = async () => {
    if (!selectedSource) {
      alert("Please select a funding source.");
      return;
    }
    
    setApproving(true);
    try {
      const res = await fetch("/api/citizen/onyx-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount as string) / 100 })
      });
      const data = await res.json();
      
      if (data.error) {
        alert(data.error);
        setApproving(false);
        return;
      }
      
      if (callbackUrl) {
        const url = new URL(callbackUrl);
        url.searchParams.set("token", data.paymentToken);
        url.searchParams.set("sourceAccountId", selectedSource);
        window.location.href = url.toString();
      } else {
        alert("Payment Approved! Please close this window and return to the merchant.");
      }
    } catch (e) {
      alert("An error occurred during approval.");
      setApproving(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
         <div className="max-w-md w-full bg-[#151522] border border-white/10 rounded-2xl p-8 text-center">
            <ShieldCheck className="mx-auto text-indigo-400 mb-4" size={48} />
            <h2 className="text-2xl font-bold text-white mb-2">Login Required</h2>
            <p className="text-white/60 mb-6">Please log in to your Onyx / Slate account to approve this transaction.</p>
            <a href="/" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium transition-colors">
               Go to Login <ArrowRight size={18} />
            </a>
         </div>
      </div>
    );
  }

  if (loading) return (
     <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
     </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-8">
       <div className="max-w-md w-full bg-[#151522] border border-red-500/20 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
             <Lock className="text-red-400" size={32} />
          </div>
          <h2 className="text-xl font-bold text-white">Checkout Error</h2>
          <p className="text-red-400/80 text-sm">{error}</p>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Background FX */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl relative z-10 shadow-2xl">
        <div className="p-8 border-b border-white/5 bg-black/20 text-center">
           <div className="w-16 h-16 bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
             <Building className="text-indigo-400" size={28} />
           </div>
           <h1 className="text-xl font-bold text-white mb-1">{merchant?.name || "Merchant"}</h1>
           <p className="text-xs text-white/50 flex items-center justify-center gap-1">
              <ShieldCheck size={12} className="text-emerald-400" /> Secure Onyx Network Checkout
           </p>
        </div>
        
        <div className="p-8 space-y-6">
           <div className="text-center">
              <div className="text-sm text-white/50 mb-1 uppercase tracking-wider font-semibold">Total Amount</div>
              <div className="text-4xl font-black text-white tracking-tight">{formatMoney(parseInt(amount as string))}</div>
              <div className="text-sm text-white/60 mt-3 p-3 bg-white/5 rounded-xl border border-white/5 inline-block">
                {description}
              </div>
           </div>

           <div className="space-y-3">
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider pl-1">Funding Source</label>
              <select 
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white appearance-none focus:outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
              >
                <option value="" disabled>Select an account or card...</option>
                
                {accounts.length > 0 && <optgroup label="Bank Accounts">
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id} disabled={a.balance < parseInt(amount as string)}>
                      {a.accountName} - {formatMoney(a.balance)} {a.balance < parseInt(amount as string) ? "(Insufficient)" : ""}
                    </option>
                  ))}
                </optgroup>}

                {cards.length > 0 && <optgroup label="Credit Cards">
                  {cards.map((c: any) => {
                    const available = (c.creditLimit || 0) - (c.creditUsed || 0);
                    return (
                      <option key={c.id} value={c.id} disabled={available < parseInt(amount as string)}>
                        Credit Card (..{c.cardNumber.slice(-4)}) - Avail: {formatMoney(available)}
                      </option>
                    )
                  })}
                </optgroup>}
              </select>
           </div>

           <button 
             disabled={!selectedSource || approving}
             onClick={handleApprove}
             className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-indigo-500/20"
           >
             {approving ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <><Lock size={18} /> Approve Payment</>}
           </button>
           
           <p className="text-[10px] text-white/40 text-center px-4 leading-relaxed">
             By approving this payment, you authorize {merchant?.name || "this merchant"} to charge the selected funding source via the Onyx PSP network.
           </p>
        </div>
      </div>
    </div>
  );
}
