import { useState, useEffect } from "react";
import { useOutletContext, useParams, Link } from "react-router-dom";
import { ArrowLeft, User, Wallet, Activity, ExternalLink, Calendar, ChevronRight } from "lucide-react";
import { format } from "date-fns";

export function BankCustomerDetail() {
  const { bank } = useOutletContext<{ bank: any }>();
  const { discordId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bank?.id && discordId) {
      fetch(`/api/banks/${bank.id}/customers/${discordId}`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to fetch")))
        .then(d => {
          setData(d);
          setLoading(false);
        })
        .catch(e => {
          console.error("fetch customer error", e);
          setData({ error: "Fetch failed" });
          setLoading(false);
        });
    }
  }, [bank, discordId]);

  if (loading) return <div className="p-4 text-white/50 animate-pulse">Loading profile...</div>;
  if (!data || data.error) return <div className="p-4 text-red-400">Error loading customer.</div>;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="mb-8">
        <Link to={`/bank/${bank.id}/customers`} className="text-white/40 hover:text-white transition-colors flex items-center gap-2 text-sm mb-4">
          <ArrowLeft size={16} /> Back to Customers
        </Link>
        <div className="flex justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${data.accounts?.some((a:any)=>!a.isActive) ? 'bg-red-500/20 text-red-500' : 'bg-indigo-500/20 text-indigo-400'}`}>
              <User size={32} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                 <h2 className="text-3xl font-bold tracking-tight">{data.discordId}</h2>
                 {data.accounts?.some((a:any)=>!a.isActive) && (
                   <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Frozen</span>
                 )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-white/50 text-sm">
                <span className="flex items-center gap-1"><Calendar size={14} /> Joined {data.firstJoined ? format(new Date(data.firstJoined), "MMM d, yyyy") : "Unknown"}</span>
                <span className="flex items-center gap-1"><Wallet size={14} /> {data.accounts?.length || 0} Accounts</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            <div className="text-right">
              <div className="text-sm text-white/50 mb-1 uppercase tracking-wider font-semibold">Total Net Worth</div>
              <div className="text-3xl font-light text-emerald-400">
                ${((data.totalBalance || 0) / 100).toFixed(2)}
              </div>
            </div>
            <button
               onClick={async () => {
                 const isFrozen = data.accounts?.some((a:any) => !a.isActive);
                 if (!confirm(`Are you sure you want to ${isFrozen ? 'unfreeze' : 'freeze'} this customer's accounts?`)) return;
                 
                 const res = await fetch(`/api/banks/${bank.id}/customers/${data.discordId}/freeze`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ freeze: !isFrozen })
                 });
                 if (res.ok) {
                    // Update state to reflect changed status
                    setData({
                       ...data,
                       accounts: data.accounts.map((a:any) => ({...a, isActive: !!isFrozen}))
                    });
                 }
               }}
               className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors border ${data.accounts?.some((a:any)=>!a.isActive) ? 'border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10' : 'border-red-500/50 text-red-500 hover:bg-red-500/10'}`}
            >
               {data.accounts?.some((a:any)=>!a.isActive) ? 'Unfreeze Accounts' : 'Freeze Accounts'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col - Accounts */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="text-indigo-400" size={18} />
            Active Accounts
          </h3>
          <div className="space-y-3">
            {data.accounts?.map((acc: any) => (
              <Link 
                key={acc.id} 
                to={`/bank/${bank.id}/accounts/${acc.id}`}
                className="block bg-[#0f0f15] border border-white/10 hover:border-indigo-500/50 rounded-xl p-4 transition-all group"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium text-white group-hover:text-indigo-300 transition-colors">{acc.accountName}</div>
                  <ChevronRight size={16} className="text-white/20 group-hover:text-indigo-400" />
                </div>
                <div className="text-lg text-emerald-400 font-medium">
                  ${(acc.balance / 100).toFixed(2)}
                </div>
                <div className="text-xs text-white/40 mt-3 pt-3 border-t border-white/5 flex justify-between">
                  <span>Created {format(new Date(acc.createdAt), "MMM d, yyyy")}</span>
                  <span>ID: {acc.id.substring(0,6)}..</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Right Col - Activity */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="text-emerald-400" size={18} />
            Recent Activity
          </h3>
          
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
            {data.transactions?.length === 0 ? (
              <div className="p-8 text-center text-white/40">No recent activity.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[#1a1a24] text-white/50 border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4 font-medium">Type</th>
                    <th className="px-6 py-4 font-medium">Amount</th>
                    <th className="px-6 py-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.transactions?.map((tx: any) => {
                    const isDebit = tx.type === 'withdraw' || (tx.type === 'transfer' && tx.toAccountId); // heuristic
                    return (
                      <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="capitalize bg-white/10 text-white/90 px-2 py-1 rounded text-xs">
                            {tx.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={tx.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}>
                            {tx.type === 'deposit' ? '+' : '-'}${(tx.amount / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-white/50 whitespace-nowrap">
                          {format(new Date(tx.timestamp), "MMM d, HH:mm")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
