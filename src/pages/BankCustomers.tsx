import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { User, Users, Search } from "lucide-react";
import { format } from "date-fns";

export function BankCustomers() {
  const { bank } = useOutletContext<{ bank: any }>();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (bank?.id) {
      fetch(`/api/banks/${bank.id}/customers`)
        .then(r => r.json())
        .then(data => {
          setCustomers(data);
          setLoading(false);
        });
    }
  }, [bank]);

  const handleExportCSV = () => {
     const headers = ['Discord ID', 'Accounts Held', 'Total Balance', 'Joined Date'];
     const csvContent = "data:text/csv;charset=utf-8," 
       + headers.join(",") + "\n"
       + customers.map(c => {
         return `${c.discordId},${c.accountCount},${(c.totalBalance / 100).toFixed(2)},${c.firstJoined ? new Date(c.firstJoined).toISOString() : ""}`;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
          <p className="text-white/60 text-sm mt-1">Overview of all users with active accounts in your bank.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input 
              type="text" 
              placeholder="Search by Discord ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#1a1a24] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors w-full sm:w-64"
            />
          </div>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-transparent border border-white/20 hover:border-white/40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden overflow-x-auto">
        {customers.length === 0 ? (
          <div className="p-8 text-center text-white/40 flex flex-col items-center justify-center">
            <Users size={48} className="mb-4 opacity-20" />
            <p>No customers found.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm min-w-[600px]">
            <thead className="bg-[#1a1a24] text-white/50 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Customer (Discord ID)</th>
                <th className="px-6 py-4 font-medium">Accounts Held</th>
                <th className="px-6 py-4 font-medium">Total Balance</th>
                <th className="px-6 py-4 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {customers.filter((c: any) => {
                const isUnassigned = c.discordId.startsWith("unassigned_") || c.discordId === "imported";
                const searchLower = searchTerm.toLowerCase();
                const displayName = c.discordId === "imported" 
                  ? "Legacy Imported Accounts"
                  : c.discordId.startsWith("unassigned_")
                    ? `Unassigned (${c.discordId.replace("unassigned_", "").replace(/_/g, " ")})`
                    : (c.mcUsername ? `${c.mcUsername} (${c.discordId})` : c.discordId);
                return displayName.toLowerCase().includes(searchLower) || c.discordId.toLowerCase().includes(searchLower);
              }).map((c: any) => {
                const isUnassigned = c.discordId.startsWith("unassigned_") || c.discordId === "imported";
                const displayName = c.discordId === "imported" 
                  ? "Legacy Imported Accounts"
                  : c.discordId.startsWith("unassigned_")
                    ? `Unassigned: ${c.discordId.replace("unassigned_", "").replace(/_/g, " ").replace(/\b\w/g, (l:string)=>l.toUpperCase())}`
                    : (c.mcUsername ? `${c.mcUsername} (${c.discordId})` : c.discordId);
                return (
                  <tr key={c.discordId} className="hover:bg-white/5 transition-colors group cursor-pointer" onClick={() => navigate(`/bank/${bank.id}/customers/${c.discordId}`)}>
                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">
                      <div className="flex items-center gap-3 font-sans">
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                           isUnassigned 
                             ? 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20' 
                             : 'bg-white/10 text-white/80 group-hover:bg-indigo-500/20 group-hover:text-indigo-400'
                         }`}>
                           <User size={14} />
                         </div>
                         <div className="flex flex-col">
                           <span>{displayName}</span>
                           {isUnassigned && (
                             <span className="text-[10px] text-amber-500/80 font-medium">Click profile to assign Discord ID</span>
                           )}
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-white/70">
                      {c.accountCount} account(s)
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-emerald-400 font-medium">
                        ${(c.totalBalance / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/50 whitespace-nowrap text-xs">
                      {c.firstJoined ? format(new Date(c.firstJoined), "MMM d, yyyy") : "-"}
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
