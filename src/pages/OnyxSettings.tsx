import { Layers, ShieldCheck, CreditCard, Key, Plus, Loader2, ArrowRight, Activity, Building2, Server, CheckCircle2, XCircle, Clock, DollarSign, Globe, Terminal, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { formatMoney } from "../lib/utils";

interface Merchant {
  id: string;
  name: string;
  apiKey: string;
  bankId: string;
  destinationAccount: string;
  createdAt: string;
}

interface BankInfo {
  id: string;
  name: string;
}

interface Settlement {
  id: string;
  amount: number;
  status: string;
  timestamp: string;
  fromBankName: string | null;
  toBankName: string | null;
}

export function OnyxSettings() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [networkAnalytics, setNetworkAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [name, setName] = useState("");
  const [bankId, setBankId] = useState("");
  const [destinationAccount, setDestinationAccount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [merchantsRes, banksRes, settlementsRes, settingsRes, analyticsRes] = await Promise.all([
        fetch("/api/onyx/merchants"),
        fetch("/api/banks"),
        fetch("/api/onyx/settlements"),
        fetch("/api/onyx/settings"),
        fetch("/api/onyx/network-analytics")
      ]);
      if (merchantsRes.ok && merchantsRes.headers.get('content-type')?.includes('application/json')) setMerchants(await merchantsRes.json());
      if (banksRes.ok && banksRes.headers.get('content-type')?.includes('application/json')) setBanks(await banksRes.json());
      if (settlementsRes.ok && settlementsRes.headers.get('content-type')?.includes('application/json')) setSettlements(await settlementsRes.json());
      if (settingsRes.ok && settingsRes.headers.get('content-type')?.includes('application/json')) setSettings(await settingsRes.json());
      if (analyticsRes.ok && analyticsRes.headers.get('content-type')?.includes('application/json')) setNetworkAnalytics(await analyticsRes.json());
    } catch (e) {
      console.error("OnyxSettings fetch error:", e);
    }
    setLoading(false);
  };

  const handleUpdateSettings = async (updates: any) => {
    try {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);
      await fetch("/api/onyx/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings)
      });
    } catch (e) {
       console.error(e);
    }
  };

  const handleCreateMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/onyx/merchants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bankId, destinationAccount })
      });
      setShowAddModal(false);
      setName("");
      setBankId("");
      setDestinationAccount("");
      fetchData();
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-5xl space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Globe className="text-emerald-400" size={26} /> Onyx Network & PSP Ecosystem
        </h1>
        <p className="text-white/50 mt-1">Macro-level network analytics, API usage monitoring, clearinghouse switch, and merchant management.</p>
      </div>

      {/* Network Macro Analytics Dashboard */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider flex items-center gap-2">
          <Activity size={16} className="text-emerald-400" /> Onyx Network KPI Dashboard
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-emerald-500/30 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <DollarSign size={20} />
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Global Network
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {formatMoney(networkAnalytics?.totalTransactionVolumeCents || 0)}
            </div>
            <p className="text-xs text-white/50 mt-1 font-medium">Total Network Volume</p>
            <p className="text-[11px] text-emerald-400/80 mt-2">
              {networkAnalytics?.totalTransactionsCount || 0} total settled transactions
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-indigo-500/30 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Building2 size={20} />
              </div>
              <span className="text-[10px] uppercase font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                Tenant Banks
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {networkAnalytics?.activeBankCount || 0} / {networkAnalytics?.totalBanksCount || 0}
            </div>
            <p className="text-xs text-white/50 mt-1 font-medium">Active Network Banks</p>
            <p className="text-[11px] text-indigo-400/80 mt-2">
              {networkAnalytics?.totalMerchantsCount || 0} registered Onyx merchants
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-amber-500/30 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                <Server size={20} />
              </div>
              <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                CityCorp Gateway
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {networkAnalytics?.apiUsageStats?.totalCalls || 0}
            </div>
            <p className="text-xs text-white/50 mt-1 font-medium">Total API Invocations</p>
            <p className="text-[11px] text-amber-400/80 mt-2 flex items-center gap-1">
              <Clock size={12} /> {networkAnalytics?.apiUsageStats?.avgLatencyMs || 0}ms avg latency
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-purple-500/30 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                <ShieldCheck size={20} />
              </div>
              <span className="text-[10px] uppercase font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                Platform SaaS
              </span>
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {formatMoney(networkAnalytics?.billingSummary?.totalInvoicedCents || 0)}
            </div>
            <p className="text-xs text-white/50 mt-1 font-medium">Total Invoiced License Fees</p>
            <p className="text-[11px] text-purple-400/80 mt-2">
              {formatMoney(networkAnalytics?.billingSummary?.paidInvoicedCents || 0)} collected
            </p>
          </div>
        </div>

        {/* API Usage & Health Details */}
        {networkAnalytics?.apiUsageStats?.endpointBreakdown?.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal size={16} className="text-emerald-400" /> CityCorp Integration API Usage & Performance
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={13} /> {networkAnalytics?.apiUsageStats?.successfulCalls || 0} Success
                </span>
                <span className="text-rose-400 flex items-center gap-1">
                  <XCircle size={13} /> {networkAnalytics?.apiUsageStats?.failedCalls || 0} Errors
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-black/30 text-white/50 border-b border-white/10">
                  <tr>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2">Call Volume</th>
                    <th className="px-3 py-2">Avg Latency</th>
                    <th className="px-3 py-2 text-right">Success Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {networkAnalytics.apiUsageStats.endpointBreakdown.map((ep: any) => (
                    <tr key={ep.endpoint} className="hover:bg-white/5">
                      <td className="px-3 py-2 font-mono text-indigo-300">{ep.endpoint}</td>
                      <td className="px-3 py-2 text-white/80 font-medium">{ep.count} requests</td>
                      <td className="px-3 py-2 text-white/60 font-mono">{ep.avgLatencyMs} ms</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ep.successRate >= 90 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          ep.successRate >= 70 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {ep.successRate}% Success
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Layers size={20} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="font-medium text-lg">Bank Interoperability</h2>
              <p className="text-sm text-white/50">"The Onyx Switch"</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/5">
              <div>
                <p className="text-sm font-medium">Bank Clearinghouse Transfers</p>
                <p className="text-xs text-white/50">Allow users to send instant cross-bank payments dynamically through the clearinghouse.</p>
              </div>
              <label className="flex items-center cursor-pointer">
                <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${settings?.clearinghouseEnabled ? 'bg-indigo-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.clearinghouseEnabled ? 'translate-x-4' : 'translate-x-0'}`}></div>
                </div>
                <input type="checkbox" className="hidden" checked={!!settings?.clearinghouseEnabled} onChange={(e) => handleUpdateSettings({ clearinghouseEnabled: e.target.checked })} />
              </label>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/5">
              <div>
                <p className="text-sm font-medium">B2B API Transaction Fee</p>
                <p className="text-xs text-white/50">The global tax rate placed on automated PSP API sales.</p>
              </div>
              <div className="flex items-center gap-2">
                 <input type="number" step="0.01" className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-right focus:outline-none focus:border-indigo-500" value={settings ? (settings.b2bApiFeePercent / 100).toFixed(2) : 0} onChange={(e) => handleUpdateSettings({ b2bApiFeePercent: Math.round(parseFloat(e.target.value) * 100) })} />
                 <span className="text-sm text-white/50">%</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/5">
              <div>
                <p className="text-sm font-medium">Net settlement cadence</p>
                <p className="text-xs text-white/50">Pairs IOUs and opens SETTLEMENT instructions. Manual = staff-run only.</p>
              </div>
              <select
                className="bg-black/50 border border-white/10 rounded px-2 py-1 text-sm"
                value={settings?.settlementSchedule || "weekly"}
                onChange={(e) => handleUpdateSettings({ settlementSchedule: e.target.value })}
              >
                <option value="manual">Manual</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-white/5 border border-white/5">
              <div>
                <p className="text-sm font-medium">Minimum net ($)</p>
                <p className="text-xs text-white/50">Ignore dust smaller than this when pairing.</p>
              </div>
              <input
                type="number"
                step="1"
                className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-right"
                value={settings ? ((settings.settlementMinCents || 10000) / 100).toFixed(0) : 100}
                onChange={(e) => handleUpdateSettings({ settlementMinCents: Math.round(parseFloat(e.target.value) * 100) })}
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/global/clearinghouse/run", { method: "POST" });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) alert(body.error || "Run failed");
                else fetchData();
              }}
              className="w-full text-sm bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg"
            >
              Run network settlement now
            </button>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <CreditCard size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="font-medium text-lg">Merchants</h2>
                <p className="text-sm text-white/50">API Integrations</p>
              </div>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              <Plus size={14} /> New API Key
            </button>
          </div>
          
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              </div>
            ) : merchants.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-4">No merchants registered yet.</p>
            ) : (
              merchants.map(m => (
                <div key={m.id} className="p-3 bg-[#0a0a0c] border border-white/10 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm text-white/90">{m.name}</p>
                      <p className="text-xs text-white/50">Routes to: {banks.find(b => b.id === m.bankId)?.name || 'Unknown Bank'} — {m.destinationAccount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-[#050508] p-2 rounded border border-white/5 mt-2">
                    <Key size={12} className="text-emerald-500 flex-shrink-0" />
                    <code className="text-xs text-emerald-400/80 font-mono break-all">{m.apiKey.substring(0, 16)}••••••••••••</code>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Onyx Global PSP Discord Bot Control Card */}
      <div className="bg-[#0f0f18] border border-indigo-500/20 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
              💎
            </div>
            <div>
              <h2 className="font-bold text-lg text-white">Onyx PSP Global Discord Bot</h2>
              <p className="text-xs text-white/50">Central clearinghouse bot for cross-bank Discord payments and merchant terminal setup</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-white/60">Bot Status:</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Onyx PSP Bot Operational
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-[#151522] p-4 rounded-lg border border-white/10 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">Onyx Discord Bot Configuration</h4>
            <p className="text-xs text-white/60">Provide the Discord Bot Token for the dedicated Onyx PSP Bot.</p>
            
            <div className="space-y-2">
              <input 
                id="onyxBotTokenInput"
                type="password"
                placeholder="Discord Bot Secret Token"
                defaultValue={settings?.botToken || ""}
                className="w-full bg-[#1a1a2a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const token = (document.getElementById("onyxBotTokenInput") as HTMLInputElement)?.value;
                    if (!token) return alert("Please enter a Discord Bot Token");
                    await handleUpdateSettings({ botToken: token });
                    alert("Onyx Bot Token saved!");
                  }}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-2 rounded-lg transition-colors font-medium"
                >
                  Save Token
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/onyx/toggle-bot", { method: "POST" });
                      const data = await res.json();
                      if (res.ok) alert(data.message);
                      else alert(data.error || "Failed to toggle bot");
                    } catch (e: any) {
                      alert(e.message || "Failed to toggle bot");
                    }
                  }}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded-lg transition-colors font-medium"
                >
                  Start / Toggle Onyx Bot
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#151522] p-4 rounded-lg border border-white/10 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Interactive Onyx PSP Channel Spawner</h4>
            <p className="text-xs text-white/60">Spawn the global interactive Onyx PSP button embed directly in your community Discord server!</p>
            
            <div className="flex gap-2">
              <input 
                id="onyxGuiChannelInput"
                type="text" 
                placeholder="Discord Channel ID"
                defaultValue={settings?.guiChannelId || ""} 
                className="flex-1 bg-[#1a1a2a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500" 
              />
              <button
                type="button"
                onClick={async () => {
                  const chId = (document.getElementById("onyxGuiChannelInput") as HTMLInputElement)?.value;
                  if (!chId) return alert("Please enter a Discord Channel ID");
                  try {
                    const res = await fetch("/api/onyx/spawn-bot-gui", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ channelId: chId })
                    });
                    const data = await res.json();
                    if (res.ok) alert("Onyx PSP Embed spawned successfully!");
                    else alert(data.error || "Failed to spawn embed");
                  } catch (e: any) {
                    alert(e.message || "Failed to spawn embed");
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              >
                Spawn Onyx PSP Embed
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/onyx/refresh-bot-gui", { method: "POST" });
                    if (res.ok) alert("Onyx PSP Channel GUI refreshed!");
                    else alert("Failed to refresh embed");
                  } catch (e: any) {
                    alert("Error: " + e.message);
                  }
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
              >
                🔄 Refresh Onyx Embeds Live
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mt-8">
        <h2 className="font-medium text-lg mb-4">Clearinghouse & Network Settlements</h2>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            </div>
          ) : settlements.length === 0 ? (
            <p className="text-sm text-white/50 py-4 text-center">No settlements processed yet on the Onyx network.</p>
          ) : (
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead className="text-xs text-white/50 uppercase tracking-wider border-b border-white/10">
                <tr>
                  <th className="pb-3 font-medium">Timestamp</th>
                  <th className="pb-3 font-medium">Debtor Bank</th>
                  <th className="pb-3 font-medium"></th>
                  <th className="pb-3 font-medium">Creditor Bank</th>
                  <th className="pb-3 font-medium text-right">Amount</th>
                  <th className="pb-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 text-white/70 whitespace-nowrap">{new Date(s.timestamp).toLocaleString()}</td>
                    <td className="py-3">{s.fromBankName || 'Unknown'}</td>
                    <td className="py-3 text-white/30 px-4"><ArrowRight size={14} /></td>
                    <td className="py-3">{s.toBankName || 'Unknown'}</td>
                    <td className="py-3 text-right font-mono font-semibold text-white">{formatMoney(s.amount)}</td>
                    <td className="py-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs uppercase tracking-wider font-medium ${
                        s.status === 'settled' || s.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold mb-1">Generate Onyx Access</h2>
            <p className="text-sm text-white/50 mb-6">Create a new PSP identity for a merchant integration.</p>
            
            <form onSubmit={handleCreateMerchant} className="space-y-4">
              <div>
                <label className="block text-xs text-white/70 mb-1">Merchant Name</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Premium Dealership"
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Routing Bank</label>
                <select 
                  required
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  <option value="" disabled>Select a participating bank...</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Destination Account Name</label>
                <input 
                  required
                  value={destinationAccount}
                  onChange={(e) => setDestinationAccount(e.target.value)}
                  placeholder="e.g. corp_dealership"
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[10px] text-white/40 mt-1">Funds processed via this key will settle here.</p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-md text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-sm text-white font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
