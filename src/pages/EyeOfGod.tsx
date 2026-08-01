import { useState, useEffect } from "react";
import { Eye, Clock, User, Activity, Search, Shield, Zap } from "lucide-react";
import { format } from "date-fns";

export function EyeOfGod() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLive, setIsLive] = useState(true);

  const fetchLogs = () => {
    if (!isLive && logs.length > 0) return;
    fetch("/api/global/audit")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setLogs(d);
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
    const int = setInterval(() => {
      if (isLive) fetchLogs();
    }, 2000);
    return () => clearInterval(int);
  }, [isLive]);

  const filtered = logs.filter((l) => {
    const term = searchTerm.toLowerCase();
    return (
      (l.discordId || "").toLowerCase().includes(term) ||
      (l.action || "").toLowerCase().includes(term) ||
      (l.route || "").toLowerCase().includes(term) ||
      (l.bankId || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Eye className="text-indigo-500" />
            Eye of God
          </h1>
          <p className="text-zinc-400 text-sm mt-1">Real-time global platform surveillance and audit log.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input
              type="text"
              placeholder="Search IDs, routes..."
              className="pl-9 pr-4 py-2 bg-[#12121a] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/50 w-64"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isLive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-white/30"}`} />
            {isLive ? "Live Sync Active" : "Paused"}
          </button>
        </div>
      </div>

      <div className="bg-[#0b0b10] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left font-mono">
            <thead className="text-xs text-white/40 uppercase bg-white/[0.02] border-b border-white/10">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp</th>
                <th className="px-4 py-3 font-semibold">Actor (Discord ID)</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Route / Bank</th>
                <th className="px-4 py-3 font-semibold">Latency</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3 text-white/50 whitespace-nowrap">
                    {format(new Date(log.timestamp), "HH:mm:ss.SSS")}
                  </td>
                  <td className="px-4 py-3">
                    {log.discordId ? (
                      <span className="flex items-center gap-2 text-indigo-300">
                        <User size={14} />
                        {log.discordId}
                      </span>
                    ) : (
                      <span className="text-white/20 italic">Anonymous</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${
                      log.action === 'auth' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      log.action === 'transfer' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      'bg-white/5 text-white/70 border-white/10'
                    }`}>
                      {log.action === 'auth' ? <Shield size={12} /> : <Activity size={12} />}
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white/80 truncate max-w-[200px]" title={log.route || ''}>
                      {log.method} {log.route || '-'}
                    </div>
                    {log.bankId && (
                      <div className="text-white/40 text-[10px] mt-0.5 truncate max-w-[200px]" title={log.bankId}>
                        Bank: {log.bankId}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.latencyMs !== null ? (
                      <span className={`flex items-center gap-1 ${log.latencyMs > 500 ? 'text-amber-400' : 'text-white/40'}`}>
                        <Zap size={12} />
                        {log.latencyMs}ms
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white/40 text-xs truncate max-w-[300px] group-hover:whitespace-normal group-hover:break-words group-hover:max-w-[400px] transition-all">
                      {log.details || '-'}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-white/30">
                    No audit logs captured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
