import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Plus, Loader2, Search } from "lucide-react";
import { formatMoney } from "../lib/utils";

export function BankTransactions() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [txType, setTxType] = useState('deposit');
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchTransactions = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/transactions`)
      .then(r => r.json())
      .then(data => {
        setTransactions(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (bank?.id) fetchTransactions();
  }, [bank]);

  const handleTx = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      type: txType,
      accountName: formData.get("accountName"),
      toAccountName: formData.get("toAccountName"),
      amount: formData.get("amount"),
      description: formData.get("description"),
    };

    fetch(`/api/banks/${bank.id}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(()=>({}));
        alert(err.error || "Transaction failed");
      } else {
        setShowAdd(false);
        fetchTransactions();
      }
      setSubmitting(false);
    });
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Ledger & History</h2>
          <p className="text-white/60 text-sm mt-1">Global transaction ledger for {bank.name}</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input 
              type="text" 
              placeholder="Search descriptions, IDs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#1a1a24] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors w-full sm:w-56 lg:w-64"
            />
          </div>
          <button
            onClick={() => {
              const headers = ['Type', 'Description', 'Date', 'Amount', 'Transaction ID'];
              const csvContent = "data:text/csv;charset=utf-8," 
                + headers.join(",") + "\n" 
                + transactions.map(tx => {
                  const desc = tx.description ? `"${tx.description.replace(/"/g, '""')}"` : "";
                  return `${tx.type},${desc},${new Date(tx.timestamp).toISOString()},${(tx.amount / 100).toFixed(2)},${tx.id}`;
                }).join("\n");
              const encodedUri = encodeURI(csvContent);
              const link = document.createElement("a");
              link.setAttribute("href", encodedUri);
              link.setAttribute("download", `transactions_${bank.name}_${new Date().toISOString().split('T')[0]}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="flex-1 sm:flex-none justify-center bg-transparent border border-white/20 hover:border-white/40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            Export CSV
          </button>
          <button 
            onClick={() => {
              setLoading(true);
              fetch(`/api/banks/${bank.id}/transactions/sync`, { method: "POST" })
                .then(r => r.json())
                .then(d => {
                  if (d.error) alert(d.error);
                  else if (d.addedTransactions > 0) alert(`Synced ${d.addedTransactions} new transactions.`);
                  else alert("No new transactions found.");
                  fetchTransactions();
                }).catch(e => {
                  console.error(e);
                  setLoading(false);
                });
            }}
            className="flex-1 sm:flex-none justify-center bg-transparent border border-indigo-500/50 hover:bg-indigo-500/10 text-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            Sync CityCorp
          </button>
          <button 
            onClick={() => setShowAdd(true)}
            className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> New Transaction
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-[#0f0f15] border border-white/10 p-6 rounded-xl mb-8">
          <h3 className="text-lg font-medium mb-6">Execute Transaction</h3>
          <form onSubmit={handleTx} className="space-y-4">
            
            <div className="flex flex-col md:flex-row gap-4">
              <label className={`flex-1 p-4 rounded-xl border cursor-pointer transition-colors ${txType === 'deposit' ? 'bg-indigo-500/10 border-indigo-500' : 'bg-transparent border-white/10 opacity-60 hover:bg-white/5'}`}>
                 <input type="radio" name="type" className="hidden" checked={txType === 'deposit'} onChange={() => setTxType('deposit')} />
                 <div className="font-semibold text-indigo-400">Deposit</div>
                 <div className="text-xs mt-1 text-white/50">Add funds</div>
              </label>
              <label className={`flex-1 p-4 rounded-xl border cursor-pointer transition-colors ${txType === 'withdraw' ? 'bg-red-500/10 border-red-500' : 'bg-transparent border-white/10 opacity-60 hover:bg-white/5'}`}>
                 <input type="radio" name="type" className="hidden" checked={txType === 'withdraw'} onChange={() => setTxType('withdraw')} />
                 <div className="font-semibold text-red-400">Withdraw</div>
                 <div className="text-xs mt-1 text-white/50">Remove funds</div>
              </label>
              <label className={`flex-1 p-4 rounded-xl border cursor-pointer transition-colors ${txType === 'transfer' ? 'bg-emerald-500/10 border-emerald-500' : 'bg-transparent border-white/10 opacity-60 hover:bg-white/5'}`}>
                 <input type="radio" name="type" className="hidden" checked={txType === 'transfer'} onChange={() => setTxType('transfer')} />
                 <div className="font-semibold text-emerald-400">Transfer</div>
                 <div className="text-xs mt-1 text-white/50">Move to account</div>
              </label>
            </div>

            <div className="flex flex-col md:flex-row gap-4 pt-4">
              <div className="flex-1 w-full">
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Source Account Name</label>
                <input required name="accountName" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Checking" />
              </div>
              
              {txType === 'transfer' && (
                <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Destination Account Name</label>
                  <input required name="toAccountName" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Savings" />
                </div>
              )}
            </div>
            
            <div className="flex flex-col md:flex-row gap-4">
               <div className="flex-1 w-full">
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Amount ($)</label>
                  <input required name="amount" type="number" step="0.01" min="0.01" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="100.00" />
               </div>
               <div className="flex-[2] w-full">
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Memo / Description</label>
                  <input name="description" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="Optional notes" />
               </div>
            </div>

            <div className="pt-4 flex gap-4">
              <button disabled={submitting} type="submit" className="flex-1 md:flex-none justify-center bg-white hover:bg-gray-200 text-black px-6 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 min-w-[120px]">
                {submitting ? <Loader2 className="animate-spin" size={16} /> : "Submit"}
              </button>
              <button disabled={submitting} type="button" onClick={() => setShowAdd(false)} className="flex-1 md:flex-none justify-center bg-transparent hover:bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden overflow-x-auto">
        {loading ? (
           <div className="p-8 text-center text-white/50">Loading ledger...</div>
        ) : transactions.length === 0 ? (
           <div className="p-8 text-center text-white/50">No transactions recorded yet.</div>
        ) : (
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="text-xs text-white/40 uppercase tracking-widest bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Description</th>
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {transactions.filter(tx => 
                (tx.description || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                tx.id.includes(searchTerm) ||
                tx.type.includes(searchTerm.toLowerCase()) ||
                (tx.fromUsername || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (tx.toUsername || "").toLowerCase().includes(searchTerm.toLowerCase())
              ).map(tx => {
                // Determine display formatting based on exact transaction type
                let Icon = ArrowUpRight;
                let colorClass = "text-indigo-400";
                
                if (tx.type === 'deposit') {
                  Icon = ArrowDownLeft;
                  colorClass = "text-green-400";
                } else if (tx.type === 'onyx_payment') {
                  Icon = ArrowUpRight;
                  colorClass = "text-pink-400";
                }

                const partyLabel = tx.type === 'transfer' && (tx.fromUsername || tx.toUsername)
                  ? `${tx.fromUsername || 'Account'} → ${tx.toUsername || 'Account'}`
                  : (tx.fromUsername || tx.toUsername || null);

                const accountLabel = tx.fromAccountName || tx.toAccountName || null;

                return (
                  <tr key={tx.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`flex items-center gap-2 ${colorClass}`}>
                        <div className="p-1 rounded-full bg-white/5 border border-white/10">
                          <Icon size={14} />
                        </div>
                        <span className="font-medium capitalize">{tx.type.replace('_', ' ')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-white max-w-[320px] truncate font-medium" title={tx.description || '-'}>
                        {tx.description || '-'}
                      </div>
                      <div className="text-xs text-white/50 mt-1 w-full max-w-[320px] truncate">
                        {partyLabel ? (
                          <span className="text-indigo-300 font-medium">
                            {partyLabel} {accountLabel ? <span className="text-white/40">({accountLabel})</span> : ''}
                          </span>
                        ) : (
                          <span className="font-mono text-white/40">Ref: {tx.id.slice(0, 8)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-white/60">
                      {new Date(tx.timestamp).toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right font-mono font-semibold ${colorClass}`}>
                      {tx.type === 'deposit' || tx.type === 'onyx_payment' ? '+' : '-'}{formatMoney(tx.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
