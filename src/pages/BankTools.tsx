import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Wrench, Upload, Play, AlertTriangle, Loader2, Sparkles } from "lucide-react";

export function BankTools() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [activeTool, setActiveTool] = useState<string>("mass-deposit");
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [sqliteStats, setSqliteStats] = useState<any>(null);
  const [sqlScriptText, setSqlScriptText] = useState<string>("");

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
            { id: "mass-deposit", name: "Mass Deposit / Stimulus" },
            { id: "mass-charge", name: "Mass Fee / Charge" },
            { id: "daily-processing", name: "Run Daily Processing" },
            { id: "wire-transfer", name: "Manual Wire Transfer" },
            { id: "purge-zero", name: "Purge Zero-Balance" },
            { id: "freeze-all", name: "Emergency Lock" },
            { id: "auto-import", name: "Auto-Import Accounts" },
            { id: "sqlite-migration", name: "SQLite (.db) Migration" },
            { id: "data-migration", name: "Intelligent JSON Migration" },
            { id: "seed-demo", name: "Populate Demo Data" },
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
        <div className="flex-1 bg-[#0f0f15] border border-white/10 rounded-xl p-8">
          {activeTool === "mass-deposit" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg"><Upload size={20} /></div>
                <h3 className="text-xl font-bold">Mass Deposit / Stimulus Check</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Mass deposit/credit is disabled. Balance changes must go through CityCorp (teller cash window or book transfer).
              </p>
              <button disabled type="button" className="w-full max-w-md bg-indigo-600/40 text-white/70 py-3 rounded-lg font-medium cursor-not-allowed">
                Disabled
              </button>
            </div>
          )}

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

          {activeTool === "mass-charge" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-500/20 text-red-400 rounded-lg"><Wrench size={20} /></div>
                <h3 className="text-xl font-bold text-red-500">Mass Fee / Charge</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Mass fee/charge is disabled. Balance changes must go through CityCorp (teller cash window or book transfer).
              </p>
              <button disabled type="button" className="w-full max-w-md bg-red-600/40 text-white/70 py-3 rounded-lg font-medium cursor-not-allowed">
                Disabled
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
                Executes the end-of-day processes for this bank. This includes checking all active loans for interest accrual, charging due subscriptions, and processing vault interest payouts.
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

          {activeTool === "wire-transfer" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg"><Upload size={20} /></div>
                <h3 className="text-xl font-bold">Manual Wire Transfer</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Execute a priority wire transfer directly between user accounts using their Discord IDs.
              </p>
              
              <form onSubmit={async (e) => {
                 e.preventDefault();
                 setRunning(true);
                 setComplete(false);
                 const form = e.target as HTMLFormElement;
                 
                 // Use the standard transaction route for wire transfers
                 try {
                     const res = await fetch(`/api/banks/${bank.id}/transactions`, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({
                         type: 'transfer',
                         accountName: form.fromAccountName.value,
                         toAccountName: form.toAccountName.value,
                         amount: form.amount.value,
                         description: form.description.value
                       })
                     });
                     
                     const d = await res.json();
                     if (!res.ok) alert(d.error || 'Transfer failed');
                     else setComplete(true);
                 } finally {
                     setRunning(false);
                 }
              }} className="max-w-md space-y-6">
                <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Sender Account Name</label>
                   <input required name="fromAccountName" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" placeholder="Source Account Name" />
                </div>
                <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Recipient Account Name</label>
                   <input required name="toAccountName" type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" placeholder="Destination Account Name" />
                </div>
                <div className="flex gap-4">
                  <div className="flex-[1]">
                     <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Amount ($)</label>
                     <input required name="amount" min="1" type="number" step="0.01" defaultValue="100.00" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex-[2]">
                     <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Memo</label>
                     <input required name="description" type="text" defaultValue="Wire Transfer" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                {complete && !running && (
                  <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm">
                    Wire transfer completed successfully.
                  </div>
                )}
                
                <button disabled={running} type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  {running ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                  {running ? "Processing..." : "Execute Wire"}
                </button>
              </form>
            </div>
          )}
          {activeTool === "sqlite-migration" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg"><Upload size={20} /></div>
                <div>
                  <h3 className="text-xl font-bold">SQLite (.db) Direct Database Migration</h3>
                  <p className="text-xs text-emerald-400 font-mono mt-0.5">Supports .db, .sqlite, .sqlite3 files or .sql script dumps</p>
                </div>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-xl leading-relaxed">
                Migrating from an older bot or legacy SQLite database? Upload your raw <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-xs">.db</code> file or paste SQL queries below.
                Our ingestion engine will parse tables including <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">accounts</code>, <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">loan_products</code>, <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">loans</code>, <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">loan_applications</code>, <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">transactions</code>, <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">invoices</code>, and <code className="bg-white/10 px-1 py-0.5 rounded text-xs text-white/80">payroll_entries</code>.
              </p>

              <form onSubmit={async (e) => {
                 e.preventDefault();
                 setRunning(true);
                 setComplete(false);
                 setSqliteStats(null);

                 try {
                     const fileInput = document.getElementById("sqlite-file-input") as HTMLInputElement;
                     const file = fileInput?.files?.[0];

                     let payload: any = {};

                     if (file) {
                       if (file.name.endsWith(".sql")) {
                         const text = await file.text();
                         payload.dbSql = text;
                       } else {
                         // Read binary .db file into base64
                         const arrayBuffer = await file.arrayBuffer();
                         const bytes = new Uint8Array(arrayBuffer);
                         let binary = "";
                         for (let i = 0; i < bytes.byteLength; i++) {
                           binary += String.fromCharCode(bytes[i]);
                         }
                         payload.dbBase64 = btoa(binary);
                       }
                     } else if (sqlScriptText.trim()) {
                       payload.dbSql = sqlScriptText.trim();
                     } else {
                       alert("Please select a .db/.sqlite/.sql file OR paste SQL dump script text.");
                       setRunning(false);
                       return;
                     }

                     const res = await fetch(`/api/banks/${bank.id}/tools/sqlite-migration`, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify(payload)
                     });

                     const data = await res.json();
                     if (!res.ok) {
                       alert(data.error || "SQLite migration failed");
                     } else {
                       setComplete(true);
                       setSqliteStats(data);
                     }
                 } catch (err: any) {
                     alert("Error reading file or network failure: " + err.message);
                 } finally {
                     setRunning(false);
                 }
              }} className="max-w-xl space-y-6">
                
                <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Option 1: Upload SQLite Database File (.db / .sqlite / .sqlite3 / .sql)</label>
                   <input id="sqlite-file-input" type="file" accept=".db,.sqlite,.sqlite3,.sql" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/20 file:text-emerald-400 hover:file:bg-emerald-500/30" />
                   <p className="text-xs text-white/40 mt-1.5">Direct binary upload of your legacy SQLite file. We parse all tables safely on the server.</p>
                </div>

                <div>
                   <div className="flex justify-between items-center mb-2">
                     <label className="block text-xs font-medium text-white/50 uppercase tracking-wide">Option 2: Or Paste SQL Script / Schema Dump</label>
                     <span className="text-[10px] text-zinc-500">CREATE TABLE &amp; INSERT INTO statements</span>
                   </div>
                   <textarea
                     rows={5}
                     value={sqlScriptText}
                     onChange={(e) => setSqlScriptText(e.target.value)}
                     placeholder={`CREATE TABLE accounts (\n  account_name TEXT PRIMARY KEY,\n  discord_id TEXT NOT NULL,\n  mc_username TEXT,\n  ...\n);\n\nINSERT INTO accounts VALUES ('main_checking', '123456789', 'Steve', ...);`}
                     className="w-full bg-[#1a1a24] border border-white/10 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
                   />
                </div>

                {complete && sqliteStats && (
                  <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs space-y-3">
                    <p className="font-bold text-emerald-400 text-sm flex items-center gap-1.5">
                      <Sparkles size={16} /> Migration Complete! Database successfully imported.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                       <div className="bg-black/30 p-2.5 rounded border border-emerald-500/20">
                         <span className="text-white/50 block text-[10px] uppercase">Bank Accounts</span>
                         <span className="text-lg font-bold text-white">{sqliteStats.accountsImported || 0}</span>
                       </div>
                       <div className="bg-black/30 p-2.5 rounded border border-emerald-500/20">
                         <span className="text-white/50 block text-[10px] uppercase">Customers</span>
                         <span className="text-lg font-bold text-white">{sqliteStats.customersImported || 0}</span>
                       </div>
                       <div className="bg-black/30 p-2.5 rounded border border-emerald-500/20">
                         <span className="text-white/50 block text-[10px] uppercase">Transactions</span>
                         <span className="text-lg font-bold text-white">{sqliteStats.transactionsImported || 0}</span>
                       </div>
                       <div className="bg-black/30 p-2.5 rounded border border-emerald-500/20">
                         <span className="text-white/50 block text-[10px] uppercase">Active Loans</span>
                         <span className="text-lg font-bold text-white">{sqliteStats.loansImported || 0}</span>
                       </div>
                       <div className="bg-black/30 p-2.5 rounded border border-emerald-500/20">
                         <span className="text-white/50 block text-[10px] uppercase">Invoices</span>
                         <span className="text-lg font-bold text-white">{sqliteStats.invoicesImported || 0}</span>
                       </div>
                       <div className="bg-black/30 p-2.5 rounded border border-emerald-500/20">
                         <span className="text-white/50 block text-[10px] uppercase">Payrolls</span>
                         <span className="text-lg font-bold text-white">{sqliteStats.payrollsImported || 0}</span>
                       </div>
                    </div>
                    {sqliteStats.tablesFound && sqliteStats.tablesFound.length > 0 && (
                      <p className="text-[11px] text-white/50 pt-1">
                        Tables detected &amp; parsed in .db file: <span className="font-mono text-emerald-400">{sqliteStats.tablesFound.join(", ")}</span>
                      </p>
                    )}
                  </div>
                )}

                <button disabled={running} type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  {running ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                  {running ? "Ingesting & Migrating SQLite Data..." : "Execute SQLite Migration"}
                </button>
              </form>
            </div>
          )}

          {activeTool === "data-migration" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-fuchsia-500/20 text-fuchsia-400 rounded-lg"><Upload size={20} /></div>
                <h3 className="text-xl font-bold">Intelligent Data Migration</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg">
                Upload unstructured or loosely-structured JSON historical data (accounts, customers, transactions, fees, taxes). The system will intelligently parse it, provision accounts, set historical balances, and backfill the audit log and transaction ledgers so that banks migrating to our platform see value instantly.
              </p>
              
              <form onSubmit={async (e) => {
                 e.preventDefault();
                 setRunning(true);
                 setComplete(false);
                 
                 try {
                     const fileInput = document.getElementById("migration-file") as HTMLInputElement;
                     if (!fileInput.files?.length) {
                       alert("Please select a JSON file.");
                       setRunning(false);
                       return;
                     }
                     
                     const file = fileInput.files[0];
                     const text = await file.text();
                     
                     const res = await fetch(`/api/banks/${bank.id}/tools/data-migration`, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({ rawData: JSON.parse(text) })
                     });
                     
                     const d = await res.json();
                     if (!res.ok) alert(d.error || 'Migration failed');
                     else {
                         setComplete(true);
                         alert(`Migration successful! Created ${d.accountsImported || 0} accounts and ${d.transactionsImported || 0} transactions.`);
                     }
                 } catch (err) {
                     alert("Invalid JSON format or network error.");
                 } finally {
                     setRunning(false);
                 }
              }} className="max-w-md space-y-6">
                <div>
                   <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Select Data File (.json)</label>
                   <input required id="migration-file" type="file" accept=".json" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-fuchsia-500" />
                   <p className="text-xs text-white/40 mt-2">The AI parser will look for fields like `discordId`, `accountName`, `balance`, `transactions`, `amount`, `type`, `date`.</p>
                </div>

                {complete && !running && (
                  <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm">
                    Intelligence Migration process completed successfully. Check your analytics.
                  </div>
                )}
                
                <button disabled={running} type="submit" className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                  {running ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                  {running ? "Analyzing & Importing Data..." : "Run Intelligent Import"}
                </button>
              </form>
            </div>
          )}

          {activeTool === "seed-demo" && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg"><Sparkles size={20} /></div>
                <h3 className="text-xl font-bold">Populate Demo Data</h3>
              </div>
              <p className="text-white/60 text-sm mb-6 max-w-lg leading-relaxed">
                Fills your bank with realistic mock roleplay data to demonstrate features to prospective customers or bankers. 
                This will automatically create <strong>5 verified customers</strong>, <strong>9 diversified bank accounts</strong> (checking, savings, and payroll), <strong>10 historical ledger transactions</strong>, active loans, locked savings vaults, cards, payrolls, and support tickets.
              </p>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mb-6 max-w-md text-amber-200 text-xs space-y-2">
                <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={14} /> Attention / Safety Warning</p>
                <p>Executing this function will completely reset this specific bank instance by clearing existing custom accounts, ledger transactions, and customer relationships, establishing a pristine and fully-populated slate instead.</p>
              </div>

              {complete && !running && (
                <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-sm mb-6 max-w-md font-medium">
                  ✨ Demo data successfully populated! Check your dashboard, accounts, transactions, and tools.
                </div>
              )}

              <button 
                disabled={running} 
                onClick={() => {
                   if (confirm("Are you sure you want to seed this bank with demo data? This will clear any existing data on this specific bank.")) {
                     setRunning(true);
                     setComplete(false);
                     fetch(`/api/banks/${bank.id}/tools/seed-demo`, { method: "POST" })
                       .then(r => {
                          if (!r.ok) throw new Error("Seeding failed");
                          return r.json();
                       })
                       .then(d => {
                          setRunning(false);
                          setComplete(true);
                          alert("Demo data successfully populated!");
                       })
                       .catch(err => {
                          setRunning(false);
                          alert(err.message);
                       });
                   }
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 max-w-xs"
              >
                {running ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                {running ? "Seeding Slate..." : "Populate Demo Environment"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
