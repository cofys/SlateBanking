import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { ShieldCheck, Calendar, User } from "lucide-react";
import { format } from "date-fns";

export function BankAuditLog() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (bank?.id) {
      fetch(`/api/banks/${bank.id}/audit`)
        .then(r => r.json())
        .then(data => {
          setLogs(data);
          setLoading(false);
        });
    }
  }, [bank]);

  if (loading) return <div className="text-white/50 animate-pulse p-4">Loading audit logs...</div>;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
        <p className="text-white/60 text-sm mt-1">Track all administrative actions taken in your bank portal.</p>
      </div>

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-white/40 flex flex-col items-center justify-center">
            <ShieldCheck size={48} className="mb-4 opacity-20" />
            <p>No audit logs found for this bank.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1a1a24] text-white/50 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Timestamp</th>
                <th className="px-6 py-4 font-medium">User (Discord ID)</th>
                <th className="px-6 py-4 font-medium">Action</th>
                <th className="px-6 py-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-white/70">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-white/30" />
                      {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-white">
                    <div className="flex items-center gap-2">
                       <User size={14} className="text-white/30" />
                       {log.userDiscordId}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="bg-white/10 text-white/90 px-2 py-1 rounded text-xs">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white/60">
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
