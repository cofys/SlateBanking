import { useState, useEffect } from "react";
import { Activity, ServerCrash, CheckCircle2, AlertCircle, Clock, RefreshCw, Search, Building2 } from "lucide-react";
import { format } from "date-fns";
import { CorpIdFinderModal } from "../components/CorpIdFinderModal";

interface CityCorpLog {
  id: string;
  bankName: string | null;
  endpoint: string;
  latencyMs: number;
  status: number;
  success: boolean;
  errorMessage: string | null;
  payload: string | null;
  timestamp: string;
}

export function CityCorpLogs() {
  const [logs, setLogs] = useState<CityCorpLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFinderOpen, setIsFinderOpen] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/onyx/citycorp-logs");
      if (response.ok) {
        setLogs(await response.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: number, success: boolean) => {
    if (success) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    if (status === 0) return "text-red-400 bg-red-400/10 border-red-400/20"; // Network Error
    return "text-orange-400 bg-orange-400/10 border-orange-400/20"; // API Error (400, etc)
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">CityCorp Network Telemetry</h1>
          <p className="text-white/60">Detailed API ping tracker and error logs for CityCorp PSP integration.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsFinderOpen(true)} 
            className="flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer font-medium"
          >
            <Search size={16} />
            Corp ID Finder & Inspector
          </button>
          <button 
            onClick={fetchLogs} 
            disabled={loading}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-sm transition-colors border border-white/5 cursor-pointer"
          >
            <RefreshCw size={16} className={loading ? "animate-spin opacity-50" : ""} />
            Refresh Logs
          </button>
        </div>
      </div>

      <div className="bg-[#121216] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Endpoint</th>
                <th className="px-6 py-4 font-medium">Bank Instance</th>
                <th className="px-6 py-4 font-medium">Latency</th>
                <th className="px-6 py-4 font-medium">Time (UTC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-white/40">
                    <RefreshCw className="animate-spin mx-auto mb-4" size={24} />
                    Fetching network telemetry...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-white/40">
                    <Activity size={24} className="mx-auto mb-4 opacity-50" />
                    No API telemetry recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-mono border ${getStatusColor(log.status, log.success)}`}>
                        {log.success ? <CheckCircle2 size={14} /> : log.status === 0 ? <ServerCrash size={14} /> : <AlertCircle size={14} />}
                        {log.status === 0 ? "TIMEOUT" : log.status}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-white/90">{log.endpoint}</span>
                        {!log.success && log.errorMessage && (
                          <span className="text-xs text-red-400 whitespace-normal break-words max-w-md">
                            {log.errorMessage}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white/60">
                      {log.bankName || "System / Cron"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-white/60">
                        <Clock size={14} />
                        <span className={`${log.latencyMs > 1000 ? "text-orange-400" : ""}`}>{log.latencyMs}ms</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white/50 text-xs">
                      {format(new Date(log.timestamp), "MMM dd, HH:mm:ss")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CorpIdFinderModal 
        isOpen={isFinderOpen}
        onClose={() => setIsFinderOpen(false)}
      />
    </div>
  );
}
