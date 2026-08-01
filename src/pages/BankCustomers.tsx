import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { User, Users, Search, ShieldCheck, ShieldAlert, Shield, CheckCircle, XCircle } from "lucide-react";
import { safeFormatDate } from "../lib/utils";

export function BankCustomers() {
  const { bank } = useOutletContext<{ bank: any }>();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [kycFilter, setKycFilter] = useState("all");
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (bank?.id) {
      fetch(`/api/banks/${bank.id}/settings`).then(r => r.json()).then(data => setSettings(data));
    }
  }, [bank]);

  const fetchCustomers = () => {
    if (bank?.id) {
      setLoading(true);
      fetch(`/api/banks/${bank.id}/customers`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) { setCustomers(data); } else { setCustomers([]); console.error(data); }
          setLoading(false);
        });
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [bank]);

  const handleUpdateKyc = async (discordId: string, status: string) => {
      try {
          const res = await fetch(`/api/banks/${bank.id}/customers/${discordId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kycStatus: status })
          });
          if (res.ok) {
              fetchCustomers();
          }
      } catch(e) {}
  };

  const handleExportCSV = () => {
     const headers = ['Discord ID', 'Accounts Held', 'Total Balance', 'Joined Date', 'KYC Status'];
     const csvContent = "data:text/csv;charset=utf-8," 
       + headers.join(",") + "\n"
       + customers.map(c => {
         return `${c.discordId},${c.accountCount},${(c.totalBalance / 100).toFixed(2)},${c.firstJoined ? new Date(c.firstJoined).toISOString() : ""},${c.kycStatus || 'pending'}`;
       }).join("\n");
     const encodedUri = encodeURI(csvContent);
     const link = document.createElement("a");
     link.setAttribute("href", encodedUri);
     link.setAttribute("download", `customers_${bank.name}_${new Date().toISOString().split('T')[0]}.csv`);
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading customers...</div>;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="text-indigo-400" /> Customers Directory</h2>
          <p className="text-white/60 text-sm mt-1">Manage accounts and perform KYC reviews.</p>
        </div>
        <button onClick={handleExportCSV} className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          Export CSV
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
            <input
              type="text"
              placeholder="Search by Discord ID or Username..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-[#12121a] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          {settings?.requireKyc && (
          <select
             value={kycFilter}
             onChange={e => setKycFilter(e.target.value)}
             className="bg-[#12121a] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
          >
             <option value="all">All KYC Statuses</option>
             <option value="pending">Pending Review</option>
             <option value="approved">Approved</option>
             <option value="rejected">Rejected</option>
          </select>
          )}
      </div>

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
        {customers.length === 0 ? (
          <div className="p-8 text-center text-white/50">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-[#1a1a24] text-white/50 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-medium">Customer (Discord ID)</th>
                  {settings?.requireKyc && <th className="px-6 py-4 font-medium">KYC Status</th>}
                  <th className="px-6 py-4 font-medium">Accounts Held</th>
                  <th className="px-6 py-4 font-medium">Total Balance</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {customers.filter((c: any) => {
                  if (!c) return false;
                  const searchLower = searchTerm.toLowerCase();
                  const discordIdStr = String(c.discordId || "");
                  const mcUsernameStr = String(c.mcUsername || "");
                  const displayName = discordIdStr === "imported" 
                    ? "Legacy Imported Accounts"
                    : discordIdStr.startsWith("unassigned_")
                      ? `Unassigned (${discordIdStr.replace("unassigned_", "").replace(/_/g, " ")})`
                      : (mcUsernameStr ? `${mcUsernameStr} (${discordIdStr})` : (discordIdStr || "Unknown"));
                  
                  const matchesSearch = displayName.toLowerCase().includes(searchLower) || discordIdStr.toLowerCase().includes(searchLower);
                  const matchesKyc = kycFilter === "all" || (c.kycStatus || 'pending') === kycFilter;
                  return matchesSearch && matchesKyc;
                }).map((c: any) => {
                  const status = c.kycStatus || 'pending';
                  const discordIdStr = String(c.discordId || "");
                  const isUnassigned = discordIdStr.startsWith("unassigned_") || discordIdStr === "imported";
                  return (
                    <tr key={discordIdStr} className="hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => !isUnassigned && navigate(`/bank/${bank.id}/customers/${discordIdStr}`)}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                            <User size={14} className="text-white/50" />
                          </div>
                          <div>
                             {discordIdStr === "imported" ? (
                               <div className="font-medium text-white/60">Legacy Imported Accounts</div>
                             ) : discordIdStr.startsWith("unassigned_") ? (
                               <div className="font-medium text-white/50">Unassigned <span className="text-xs">({discordIdStr.replace("unassigned_", "").replace(/_/g, " ")})</span></div>
                             ) : (
                               <>
                                 <div className="font-medium text-white">{c.mcUsername || "Citizen"}</div>
                                 <div className="text-xs text-white/40 font-mono mt-0.5">{discordIdStr}</div>
                               </>
                             )}
                          </div>
                        </div>
                      </td>
                      {settings?.requireKyc && (
                      <td className="px-6 py-4">
                         {!isUnassigned && (
                           <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                              status === 'rejected' ? 'bg-red-500/10 text-red-400' :
                              'bg-amber-500/10 text-amber-400'
                           }`}>
                              {status === 'approved' && <CheckCircle size={12}/>}
                              {status === 'rejected' && <XCircle size={12}/>}
                              {status === 'pending' && <ShieldAlert size={12}/>}
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                           </div>
                         )}
                      </td>
                      )}
                      <td className="px-6 py-4 text-white/70">{c.accountCount || 0}</td>
                      <td className="px-6 py-4 font-mono font-medium text-emerald-400">
                        {((c.totalBalance || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </td>
                      <td className="px-6 py-4 text-white/50 text-xs">
                         {safeFormatDate(c.firstJoined, "MMM d, yyyy", "-")}
                      </td>
                      <td className="px-6 py-4 text-right">
                         {!isUnassigned && (
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                               {settings?.requireKyc && status !== 'approved' && (
                                  <button onClick={() => handleUpdateKyc(c.discordId, 'approved')} className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors" title="Approve KYC"><CheckCircle size={14}/></button>
                               )}
                               {settings?.requireKyc && status !== 'rejected' && (
                                  <button onClick={() => handleUpdateKyc(c.discordId, 'rejected')} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Reject KYC"><XCircle size={14}/></button>
                               )}
                            </div>
                         )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
