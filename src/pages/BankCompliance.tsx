import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Loader2 } from "lucide-react";

export function BankCompliance() {
  const { bankId } = useParams();
  const [flaggedTransactions, setFlaggedTransactions] = useState<any[]>([]);
  const [frozenAccounts, setFrozenAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [txRes, accRes] = await Promise.all([
        fetch(`/api/banks/${bankId}/compliance/flagged`),
        fetch(`/api/banks/${bankId}/compliance/frozen`)
      ]);
      if (txRes.ok) setFlaggedTransactions(await txRes.json());
      if (accRes.ok) setFrozenAccounts(await accRes.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [bankId]);

  const handleResolveFlag = async (txId: string) => {
    try {
      const res = await fetch(`/api/banks/${bankId}/compliance/flagged/${txId}/resolve`, { method: "POST" });
      if (res.ok) fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnfreeze = async (accId: string) => {
    try {
      const res = await fetch(`/api/banks/${bankId}/compliance/frozen/${accId}/unfreeze`, { method: "POST" });
      if (res.ok) fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center gap-4 border-b border-white/10 pb-6">
        <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Compliance & Fraud Detection</h1>
          <p className="text-white/50 text-sm mt-1">Monitor flagged transactions and frozen accounts across your institution.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} />
              Flagged Transactions (Suspicious Activity)
            </h2>
            <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
              {flaggedTransactions.length === 0 ? (
                <div className="p-8 text-center text-white/50 text-sm">No flagged transactions.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 border-b border-white/10 text-white/50">
                    <tr>
                      <th className="px-6 py-3 font-medium">TxID</th>
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Type</th>
                      <th className="px-6 py-3 font-medium">Amount</th>
                      <th className="px-6 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {flaggedTransactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-white/5">
                        <td className="px-6 py-4 font-mono text-xs text-white/50">{tx.id.split('-')[0]}</td>
                        <td className="px-6 py-4 text-white/80">{new Date(tx.timestamp).toLocaleString()}</td>
                        <td className="px-6 py-4 capitalize text-white/80">{tx.type}</td>
                        <td className="px-6 py-4 font-mono text-amber-400 font-medium">
                           {tx.type === 'deposit' ? '+' : '-'}{(tx.amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                             onClick={() => handleResolveFlag(tx.id)}
                             className="text-indigo-400 hover:text-indigo-300 font-medium text-xs bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Resolve Flag
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <XCircle className="text-red-500" size={18} />
              Frozen Accounts
            </h2>
            <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
              {frozenAccounts.length === 0 ? (
                <div className="p-8 text-center text-white/50 text-sm">No frozen accounts.</div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/5 border-b border-white/10 text-white/50">
                    <tr>
                      <th className="px-6 py-3 font-medium">Account ID</th>
                      <th className="px-6 py-3 font-medium">Account Name</th>
                      <th className="px-6 py-3 font-medium">Balance</th>
                      <th className="px-6 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {frozenAccounts.map(acc => (
                      <tr key={acc.id} className="hover:bg-white/5">
                        <td className="px-6 py-4 font-mono text-xs text-white/50">{acc.id.split('-')[0]}</td>
                        <td className="px-6 py-4 font-medium text-white">{acc.accountName}</td>
                        <td className="px-6 py-4 font-mono text-white/80">
                           {(acc.balance / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                             onClick={() => handleUnfreeze(acc.id)}
                             className="text-emerald-400 hover:text-emerald-300 font-medium text-xs bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-md transition-colors"
                          >
                            Unfreeze Account
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
