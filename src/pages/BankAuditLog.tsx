import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { ShieldCheck, Calendar, User, Search, Filter } from "lucide-react";
import { format } from "date-fns";

export function BankAuditLog() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    if (bank?.id) {
      fetch(`/api/banks/${bank.id}/audit`)
        .then(r => r.json())
        .then(data => {
          setLogs(Array.isArray(data) ? data : []);
          setLoading(false);
        });
    }
  }, [bank]);

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading audit logs...</div>;

  const actionsList = Array.from(new Set(logs.map(l => l.action).filter(Boolean)));

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.userDiscordId || log.userCityCorpId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === "all" || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Audit Trail</h2>
          <p className="text-white/60 text-sm mt-1">Track and inspect all staff and teller administrative activities.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-3 text-white/40" />
          <input
            type="text"
            placeholder="Search by User Discord ID, Action, or Details..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--bg-elevated)] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        
        <div className="flex items-center gap-2 bg-[var(--bg-elevated)] border border-white/10 rounded-xl px-3 py-2">
          <Filter size={16} className="text-white/40" />
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-transparent text-sm text-white focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-[var(--bg-elevated)]">All Actions ({logs.length})</option>
            {actionsList.map(a => (
              <option key={a} value={a} className="bg-[var(--bg-elevated)]">{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-white/40 flex flex-col items-center justify-center">
            <ShieldCheck size={48} className="mb-4 opacity-20" />
            <p className="font-medium text-white/60">No matching audit logs found.</p>
            <p className="text-xs text-white/40 mt-1">Try adjusting your search terms or action filters.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--bg-subtle)] text-white/50 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">User (Discord ID)</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLogs.map((log: any) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-white/70">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-white/30" />
                      {log.timestamp ? format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss") : "-"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-white font-mono text-xs">
                    <div className="flex items-center gap-2">
                       <User size={14} className="text-indigo-400 opacity-70" />
                       {log.userDiscordId || log.userCityCorpId || "System"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-md text-xs font-medium">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/70 max-w-md truncate">
                    {log.details || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
