import { useState, useEffect } from "react";
import { useOutletContext, useParams, Link } from "react-router-dom";
import { ArrowLeft, Wallet, Activity, CreditCard, Clock, Lock, Trash2, ArrowUpRight, ArrowDownRight, Plus, Minus, Loader2, Pencil, FileText, XCircle } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "../lib/utils";

export function BankAccountDetail() {
  const { bank } = useOutletContext<{ bank: any }>();
  const { accountId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [txMode, setTxMode] = useState<'deposit' | 'withdraw' | 'wire' | null>(null);
  const [txAmount, setTxAmount] = useState('');
  const [wireToBankId, setWireToBankId] = useState('');
  const [wireToAccountName, setWireToAccountName] = useState('');
  const [txSubmitting, setTxSubmitting] = useState(false);
  const [showPrintStatement, setShowPrintStatement] = useState(false);

  // For retrieving networks in wire transfer
  const [networkBanks, setNetworkBanks] = useState<any[]>([]);

  
  const fetchAcc = () => {
    // Fire off a background sync first, but don't block the initial load if it's slow
    fetch(`/api/banks/${bank.id}/accounts/${accountId}/sync`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
         if (d.addedTransactions > 0 || d.syncedBalance) {
            // Re-fetch to get new transactions
            fetch(`/api/banks/${bank.id}/accounts/${accountId}`)
              .then(r => r.json())
              .then(d2 => setData(d2))
              .catch(console.error);
         }
      })
      .catch(console.error);

    fetch(`/api/banks/${bank.id}/accounts/${accountId}`)

      .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to fetch")))
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error("fetchAcc error", e);
        setData({ error: "Fetch failed" });
        setLoading(false);
      });
  };

  useEffect(() => {
    if (bank?.id && accountId) {
      fetchAcc();
      
      // Pre-fetch network banks for wire transfers
      fetch(`/api/banks/${bank.id}/clearinghouse`)
        .then(r => r.json())
        .then(d => {
           if (d.network) setNetworkBanks(d.network);
        }).catch(console.error);
    }
  }, [bank, accountId]);

  const handleTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txMode || !txAmount) return;
    setTxSubmitting(true);
    
    let endpoint = `/api/banks/${bank.id}/transactions`;
    let payload: any = {
      type: txMode,
      accountName: data.account.accountName,
      amount: Math.round(parseFloat(txAmount) * 100), // convert to cents
      description: `Quick ${txMode} from account view`
    };

    if (txMode === 'wire') {
      endpoint = `/api/banks/${bank.id}/wire`;
      payload = {
        fromAccountId: accountId,
        toBankId: wireToBankId,
        toAccountName: wireToAccountName,
        amount: Math.round(parseFloat(txAmount) * 100),
        description: `Wire to ${wireToAccountName}`
      };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    setTxSubmitting(false);
    if (!res.ok) {
       const err = await res.json().catch(()=>({}));
       alert(err.error || "Transaction failed");
    } else {
       setTxMode(null);
       setTxAmount('');
       setWireToBankId('');
       setWireToAccountName('');
       fetchAcc();
    }
  };

  if (loading) return <div className="p-4 text-white/50 animate-pulse">Loading account...</div>;
  if (!data || data.error) return <div className="p-4 text-red-400">Error loading account.</div>;

  const { account, transactions } = data;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      <div className="mb-8">
        <Link to={`/bank/${bank.id}/accounts`} className="text-white/40 hover:text-white transition-colors flex items-center gap-2 text-sm mb-4">
          <ArrowLeft size={16} /> Back to Accounts
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">{account.accountName}</h2>
            <div className="flex items-center gap-6 text-white/50 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Active
              </span>
              <span className="flex items-center gap-1.5"><Clock size={14} /> Opened {format(new Date(account.createdAt), "MMM d, yyyy")}</span>
              <div className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors">
                Owner ID: 
                <Link to={`/bank/${bank.id}/customers/${account.ownerDiscordId}`} className="font-mono hover:underline">
                  {account.ownerDiscordId}
                </Link>
                <button
                  onClick={async () => {
                    const newId = prompt("Enter new Discord ID for this account:", account.ownerDiscordId);
                    if (!newId || newId === account.ownerDiscordId) return;
                    const res = await fetch(`/api/banks/${bank.id}/accounts/${accountId}/update-owner`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ newDiscordId: newId })
                    });
                    if (res.ok) {
                      fetchAcc();
                    } else {
                      const err = await res.json();
                      alert(`Failed to update owner: ${err.error || 'Unknown error'}`);
                    }
                  }}
                  className="text-white/40 hover:text-white transition-colors ml-1"
                  title="Reassign Account Owner"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          </div>
          <div className="text-right">
             <div className="text-xs text-white/40 mb-1 uppercase tracking-widest font-semibold">Available Balance</div>
             <div className="text-4xl font-extrabold text-emerald-400 tracking-tight font-mono">
               {formatMoney(account.balance)}
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Settings/Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <Activity className="text-emerald-400" size={18} />
              Quick Action
            </h3>
            
            {!txMode ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setTxMode('deposit')} className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm transition-colors font-medium">
                    <Plus size={16} /> Deposit
                  </button>
                  <button onClick={() => setTxMode('withdraw')} className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm transition-colors font-medium">
                    <Minus size={16} /> Withdraw
                  </button>
                </div>
                <button onClick={() => setTxMode('wire')} className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm transition-colors font-medium">
                  <ArrowUpRight size={16} /> Wire Transfer (SWIFT)
                </button>
              </div>
            ) : (
              <form onSubmit={handleTx} className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                {txMode === 'wire' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">
                        Destination Bank
                      </label>
                      <select 
                        required
                        value={wireToBankId}
                        onChange={e => setWireToBankId(e.target.value)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 mb-4"
                      >
                        <option value="">Select a bank...</option>
                        {networkBanks.filter(b => b.id !== bank.id).map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">
                        Recipient Account Name
                      </label>
                      <input
                        required
                        value={wireToAccountName}
                        onChange={e => setWireToAccountName(e.target.value)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 mb-4"
                        placeholder="e.g. Main Checking"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">
                    {txMode} Amount
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-white/50">$</div>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={txAmount}
                      onChange={e => setTxAmount(e.target.value)}
                      className="w-full bg-[#1a1a24] border border-white/10 rounded-lg pl-8 pr-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                      placeholder="0.00"
                      autoFocus={txMode !== 'wire'}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                   <button disabled={txSubmitting} type="submit" className="flex-1 bg-white hover:bg-gray-200 text-black py-2 rounded-lg text-sm font-medium transition-colors">
                     {txSubmitting ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Confirm"}
                   </button>
                   <button disabled={txSubmitting} type="button" onClick={() => setTxMode(null)} className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 py-2 rounded-lg text-sm transition-colors">
                     Cancel
                   </button>
                </div>
              </form>
            )}
          </div>

          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <CreditCard className="text-indigo-400" size={18} />
              Account Details
            </h3>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between border-b border-white/5 pb-3">
                <span className="text-white/50">Account ID</span>
                <span className="font-mono text-white/80">{account.id.substring(0,12)}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-3">
                <span className="text-white/50">Platform Status</span>
                <span className="text-emerald-400 font-medium">Good Standing</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-3">
                <span className="text-white/50">Interest Yield</span>
                <span className="text-white/80">0.00% APY</span>
              </div>
            </div>
          </div>

          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
            <h3 className="font-semibold mb-6 flex items-center gap-2">
              <Lock className="text-pink-400" size={18} />
              Security & Admin
            </h3>
            <div className="space-y-3">
              <button onClick={() => alert("This feature is coming soon to the Slate bank portal.")}  className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm transition-colors opacity-50 cursor-not-allowed">
                Freeze Account
              </button>
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to permanently delete this account?")) {
                    fetch(`/api/banks/${bank.id}/accounts/${account.id}`, { method: "DELETE" })
                      .then(() => window.location.href = `/bank/${bank.id}/accounts`);
                  }
                }}
                className="w-full text-left px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm transition-colors text-center font-medium"
              >
                Delete Account
              </button>
            </div>
            <p className="text-xs text-white/30 mt-4 leading-relaxed">
              Administrative actions taken here will be recorded in the global audit log and attributed to your staff session.
            </p>
          </div>
        </div>

        {/* Transactions */}
        <div className="lg:col-span-2">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="text-emerald-400" size={18} />
                Ledger History
              </h3>
              <button 
                type="button"
                onClick={() => setShowPrintStatement(true)}
                className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all border border-indigo-500/20 cursor-pointer"
              >
                <FileText size={14} />
                Export Statement (PDF)
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto min-h-[400px]">
              {transactions?.length === 0 ? (
                <div className="p-12 text-center text-white/40 h-full flex flex-col items-center justify-center">
                   <Activity size={48} className="mb-4 opacity-20" />
                   <p>No transactions found for this account.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {transactions?.map((tx: any) => {
                    const isCredit = tx.type === 'deposit' || (tx.type === 'transfer' && tx.toAccountId === account.accountName);
                    return (
                      <div key={tx.id} className="p-4 hover:bg-white/5 transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isCredit ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {isCredit ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                          </div>
                          <div>
                            <div className="font-medium capitalize">{tx.type}</div>
                            <div className="text-xs text-white/50 mt-1">{tx.description || 'System transaction'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold font-mono ${isCredit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isCredit ? '+' : '-'}{formatMoney(tx.amount)}
                          </div>
                          <div className="text-xs text-white/40 mt-1">
                            {format(new Date(tx.timestamp), "MMM d, yyyy HH:mm")}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPrintStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto print:absolute print:inset-0 print:bg-white print:p-0">
          <style dangerouslySetInnerHTML={{__html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #printable-statement, #printable-statement * {
                visibility: visible;
              }
              #printable-statement {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white !important;
                color: black !important;
              }
            }
          `}} />
          <div className="bg-[#0f0f15] border border-white/10 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] print:max-h-none print:border-0 print:shadow-none print:w-full print:bg-white print:rounded-none">
            {/* Header controls (hidden on print) */}
            <div className="bg-[#0a0a0c] border-b border-white/10 px-6 py-4 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-indigo-400" size={18} />
                <span className="font-semibold text-white">Official Bank Statement (PDF Preview)</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => window.print()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all cursor-pointer"
                >
                  Print / Save PDF
                </button>
                <button 
                  type="button"
                  onClick={() => setShowPrintStatement(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white cursor-pointer"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div id="printable-statement" className="p-12 overflow-y-auto bg-white text-slate-900 font-sans print:p-0 print:overflow-visible flex-1 flex flex-col justify-between">
              <div>
                {/* Official Statement Letterhead */}
                <div className="flex justify-between items-start border-b-2 border-indigo-900 pb-8 mb-8">
                  <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-indigo-950 uppercase">{bank.name}</h1>
                    <p className="text-xs font-mono text-indigo-800 tracking-wider mt-1">Onyx Clearinghouse Member No. #{bank.id.substring(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-slate-500 mt-4 leading-normal">
                      100 Financial Plaza, Suite 400<br />
                      Global Digital Clearing, ONYX-900<br />
                      support@{bank.name.toLowerCase().replace(/\s+/g, '')}.com
                    </p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-indigo-950 uppercase tracking-wide">Account Statement</h2>
                    <p className="text-xs font-mono text-slate-500 mt-1">Date Issued: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-3 text-left inline-block">
                      <span className="text-[10px] font-mono uppercase text-slate-400 block tracking-wider">Statement Period</span>
                      <span className="text-xs font-bold text-slate-800">Inception to Present</span>
                    </div>
                  </div>
                </div>

                {/* Account Owner Info & Balance Summary */}
                <div className="grid grid-cols-2 gap-8 mb-10">
                  <div>
                    <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-2 font-bold">Prepared For</h3>
                    <div className="text-sm">
                      <p className="font-bold text-slate-900">Discord ID: {account.ownerDiscordId}</p>
                      <p className="text-slate-600 mt-1">Account Holder Portal Status: Verified Elite Member</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-mono uppercase text-slate-500 block tracking-wider">Statement Balance</span>
                      <span className="text-2xl font-mono font-bold text-slate-900">{formatMoney(account.balance)}</span>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>Account Type: Commercial Ledger</p>
                      <p className="mt-1">Currency: USD Equivalent</p>
                    </div>
                  </div>
                </div>

                {/* Transaction Ledger Table */}
                <div>
                  <h3 className="text-xs font-mono uppercase text-indigo-900 tracking-wider mb-3 font-bold">Ledger Transactions</h3>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-slate-500 uppercase font-mono tracking-wider">
                        <th className="py-2.5 font-semibold">Date & Time</th>
                        <th className="py-2.5 font-semibold">Description</th>
                        <th className="py-2.5 font-semibold">Type</th>
                        <th className="py-2.5 font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions?.map((tx: any) => {
                        const isCredit = tx.type === 'deposit' || (tx.type === 'transfer' && tx.toAccountId === account.accountName);
                        return (
                          <tr key={tx.id} className="text-slate-700">
                            <td className="py-3 font-mono text-slate-500">
                              {format(new Date(tx.timestamp), "yyyy-MM-dd HH:mm")}
                            </td>
                            <td className="py-3">
                              <span className="font-medium text-slate-900">{tx.description || 'System transfer'}</span>
                              <span className="block text-[10px] text-slate-400 font-mono mt-0.5">{tx.id}</span>
                            </td>
                            <td className="py-3 capitalize text-slate-600">
                              {tx.type}
                            </td>
                            <td className={`py-3 text-right font-mono font-bold ${isCredit ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {isCredit ? '+' : '-'}{formatMoney(tx.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Legal disclosures & Stamp */}
              <div className="border-t border-slate-200 pt-8 mt-12 flex justify-between items-end text-[10px] text-slate-400 leading-normal">
                <div>
                  <p className="font-semibold text-slate-500 uppercase tracking-wide mb-1">Slate SaaS Regulatory Compliance</p>
                  <p className="max-w-xl">
                    This document serves as an official accounting of transactions recorded securely on the Slate distributed SaaS database ledger. Deposits and transfers are cleared in accordance with the Onyx Global Network bylaws. Please report any discrepancies to your bank operator immediately.
                  </p>
                </div>
                <div className="text-right">
                  <div className="border border-indigo-900/20 rounded-full px-4 py-3 inline-block bg-indigo-50/10 text-indigo-950 font-serif italic text-center text-xs tracking-wider border-dashed">
                    Slate Verified<br />
                    <span className="font-sans text-[8px] font-mono uppercase text-indigo-800 not-italic tracking-widest font-bold">SECURE LEDGER</span>
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
