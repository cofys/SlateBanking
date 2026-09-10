import { useState, useEffect } from "react";
import { ShieldAlert, Shield, ShieldBan, Loader2, Plus, Search, Trash2, ShieldCheck, Clock, ShieldX, X } from "lucide-react";

export function GlobalSecurity() {
  const [logs, setLogs] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banIp, setBanIp] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banning, setBanning] = useState(false);

  useEffect(() => {
    fetchSecurityData();
  }, []);

  const fetchSecurityData = async () => {
    try {
      setLoading(true);
      const [logsRes, bansRes] = await Promise.all([
        fetch("/api/global/security/logs"),
        fetch("/api/global/security/bans")
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (bansRes.ok) setBans(await bansRes.json());
    } catch (e) {
      console.error("Failed to fetch security data");
    } finally {
      setLoading(false);
    }
  };

  const handleBanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banIp || !banReason) return;
    setBanning(true);
    try {
      const res = await fetch("/api/global/security/bans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipAddress: banIp, reason: banReason })
      });
      if (res.ok) {
        setShowBanModal(false);
        setBanIp("");
        setBanReason("");
        fetchSecurityData();
      } else {
        alert("Failed to ban IP");
      }
    } catch (e) {
      alert("Error processing ban");
    } finally {
      setBanning(false);
    }
  };

  const handleUnban = async (ip: string) => {
    if (!confirm(`Are you sure you want to unban IP: ${ip}?`)) return;
    try {
      const res = await fetch(`/api/global/security/bans/${ip}`, { method: "DELETE" });
      if (res.ok) {
        fetchSecurityData();
      }
    } catch (e) {
      alert("Failed to unban");
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="animate-spin text-indigo-500" size={32} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="text-red-500" /> Advanced Security Suite
          </h1>
          <p className="text-zinc-400 mt-1">Monitor active attacks, audit sensitive logins, and manage IP firewall rules.</p>
        </div>
        <button 
          onClick={() => setShowBanModal(true)}
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <ShieldBan size={18} /> Ban Malicious IP
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ban List */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-white/10 flex items-center gap-2 bg-black/20">
            <ShieldX className="text-red-400" size={18} />
            <h2 className="font-semibold text-white">Active IP Bans</h2>
          </div>
          <div className="p-4 flex-1 overflow-y-auto">
            {bans.length === 0 ? (
              <div className="text-center text-zinc-500 py-10">No active IP bans.</div>
            ) : (
              <div className="space-y-3">
                {bans.map(b => (
                  <div key={b.ipAddress} className="bg-red-950/20 border border-red-500/20 p-4 rounded-xl flex justify-between items-center group">
                    <div>
                      <div className="font-mono text-red-400 font-semibold">{b.ipAddress}</div>
                      <div className="text-xs text-zinc-400 mt-1">Reason: {b.reason}</div>
                      <div className="text-[10px] text-zinc-500 mt-1">Banned by {b.bannedBy} on {new Date(b.bannedAt).toLocaleString()}</div>
                    </div>
                    <button 
                      onClick={() => handleUnban(b.ipAddress)}
                      className="text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      title="Unban IP"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Audit Logs */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden flex flex-col h-[500px]">
          <div className="p-4 border-b border-white/10 flex items-center gap-2 bg-black/20">
            <Clock className="text-indigo-400" size={18} />
            <h2 className="font-semibold text-white">Live Security Stream</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/20 text-zinc-400 sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="p-3 font-medium">Time</th>
                  <th className="p-3 font-medium">Action</th>
                  <th className="p-3 font-medium">IP Address</th>
                  <th className="p-3 font-medium">Identity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 text-zinc-500 text-xs whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {log.status === 'success' ? <ShieldCheck size={14} className="text-emerald-500" /> : <ShieldAlert size={14} className="text-red-500" />}
                        <span className="text-zinc-300 font-medium capitalize">{log.action.replace('_', ' ')}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 max-w-[200px] truncate" title={log.details}>{log.details}</div>
                    </td>
                    <td className="p-3 font-mono text-xs text-indigo-400">{log.ipAddress}</td>
                    <td className="p-3 text-zinc-400 text-xs">{log.discordId || 'Unknown'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showBanModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f0f15] border border-red-500/30 p-6 rounded-2xl w-full max-w-md shadow-2xl shadow-red-500/10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-red-500 flex items-center gap-2">
                <ShieldBan size={20} /> Ban IP Address
              </h3>
              <button onClick={() => setShowBanModal(false)} className="text-zinc-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleBanSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">IP Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.1"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500 font-mono"
                  value={banIp}
                  onChange={e => setBanIp(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Reason for ban</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Brute force login attempts"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                  value={banReason}
                  onChange={e => setBanReason(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={banning}
                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition-colors mt-2"
              >
                {banning ? "Processing..." : "Enforce Ban"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
