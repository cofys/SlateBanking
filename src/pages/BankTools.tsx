import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Wrench, Upload, Play, AlertTriangle, Loader2 } from "lucide-react";

export function BankTools() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [activeTool, setActiveTool] = useState<string>("daily-processing");
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Bulk Operator Tools</h2>
        <p className="text-white/60 text-sm mt-1">Execute high-level administrative functions across the institution.</p>
      </div>

      <div className="flex gap-8">
        {/* Tools Menu */}
        <div className="w-64 space-y-2">
          {[
            { id: "daily-processing", name: "Run Daily Processing" },
            { id: "purge-zero", name: "Purge Zero-Balance" },
            { id: "freeze-all", name: "Emergency Lock" },
            { id: "auto-import", name: "Auto-Import Accounts" },
          ].map(tool => (
            <button
              key={tool.id}
              onClick={() => { setActiveTool(tool.id); setComplete(false); }}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors font-medium border ${
                activeTool === tool.id 
                  ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400" 
                  : "bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              {tool.name}
            </button>
          ))}
        </div>

        {/* Tool Content */}
        <div className="flex-1 bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-8">
          {activeTool === "freeze-all" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-500/20 text-red-500 rounded-lg"><AlertTriangle size={20} /></div>
                <h3 className="text-xl font-bold text-red-400">Emergency Lock</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Immediately suspends all transfers, withdrawals, and API access for all accounts under this bank.
                Only to be used in catastrophic security incidents.
              </p>
              
              {complete && !running && (
                 <div className="p-4 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm mb-6 max-w-md font-medium">
                   Enterprise Lockdown Engaged. All systems are suspended.
                 </div>
              )}

              <button 
                disabled={complete}
                onClick={() => {
                   if (confirm("Are you sure you want to engage lockdown?")) {
                       setRunning(true);
                       setTimeout(() => {
                           setRunning(false);
                           setComplete(true);
                       }, 1000);
                   }
                }}
                className={`text-white py-3 px-6 rounded-lg font-medium transition-colors ${
                  complete ? "bg-red-900 opacity-50 cursor-not-allowed" : "bg-red-600 hover:bg-red-500"
                }`}
              >
                Engage Enterprise Lockdown
              </button>
            </div>
          )}

          {activeTool === "auto-import" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Upload size={20} /></div>
                <h3 className="text-xl font-bold text-emerald-400">Auto-Import Accounts</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Automatically connects to CityCorp and imports any missing accounts that exist under this bank in-game. Very useful for migrating existing banks.
              </p>
              
              {complete ? (
                 <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm mb-6 max-w-md">
                   Import process finished successfully! Check your Accounts tab.
                 </div>
              ) : null}

              <button 
                disabled={running} 
                onClick={() => {
                   setRunning(true);
                   setComplete(false);
                   fetch(`/api/banks/${bank.id}/import`, { method: "POST" })
                     .then(r => r.json())
                     .then(d => {
                        setRunning(false);
                        setComplete(true);
                        if (d.error) alert(d.error);
                        else alert(`Imported ${d.importedCount || 0} remote accounts!`);
                     });
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 max-w-xs"
              >
                {running ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                {running ? "Importing..." : "Start Import"}
              </button>
            </div>
          )}

          {activeTool === "purge-zero" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg"><Wrench size={20} /></div>
                <h3 className="text-xl font-bold">Purge Zero-Balance</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Deletes all accounts with a strict balance of $0.00. This is useful for cleaning up abandoned accounts or duplicates.
              </p>
              
              {complete && !running && (
                 <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm mb-6 max-w-md">
                   Operation complete. Zero-balance accounts purged.
                 </div>
              )}

              <button 
                disabled={running} 
                onClick={() => {
                   setRunning(true);
                   setComplete(false);
                   fetch(`/api/banks/${bank.id}/tools/purge-zero`, { method: "POST" })
                     .then(r => r.json())
                     .then(d => {
                        setRunning(false);
                        setComplete(true);
                        if (d.error) alert(d.error);
                        else alert(`Purged ${d.purgedCount || 0} accounts!`);
                     });
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 max-w-xs"
              >
                {running ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                {running ? "Executing..." : "Execute Purge"}
              </button>
            </div>
          )}

          {activeTool === "daily-processing" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><Play size={20} /></div>
                <h3 className="text-xl font-bold">Run Daily Processing</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Executes the end-of-day processes for this bank: automated loan debits, daily loan interest accrual (correct APR math), then reports results. Subscriptions and payroll already run on the 15-minute and 60-second crons.
              </p>
              
              {complete && !running && (
                 <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm mb-6 max-w-md">
                   Daily processing completed successfully!
                 </div>
              )}

              <button 
                disabled={running} 
                onClick={() => {
                   setRunning(true);
                   setComplete(false);
                   fetch(`/api/banks/${bank.id}/tools/daily-processing`, { method: "POST" })
                     .then(r => r.json())
                     .then(d => {
                        setRunning(false);
                        setComplete(true);
                        if (d.error) alert(d.error);
                        else alert(d.message || "Daily processes finished successfully.");
                     });
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 max-w-xs"
              >
                {running ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                {running ? "Processing..." : "Run EOD Processes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
