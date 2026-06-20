import { Layers, ShieldCheck, CreditCard, Key, Plus, Loader2, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";

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
      const [merchantsRes, banksRes, settlementsRes, settingsRes] = await Promise.all([
        fetch("/api/onyx/merchants"),
        fetch("/api/banks"),
        fetch("/api/onyx/settlements"),
        fetch("/api/onyx/settings")
      ]);
      if (merchantsRes.ok && merchantsRes.headers.get('content-type')?.includes('application/json')) setMerchants(await merchantsRes.json());
      if (banksRes.ok && banksRes.headers.get('content-type')?.includes('application/json')) setBanks(await banksRes.json());
      if (settlementsRes.ok && settlementsRes.headers.get('content-type')?.includes('application/json')) setSettlements(await settlementsRes.json());
      if (settingsRes.ok && settingsRes.headers.get('content-type')?.includes('application/json')) setSettings(await settingsRes.json());
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
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Onyx PSP Settings</h1>
        <p className="text-white/50 mt-1">Configure the standalone Payment Service Provider gateway.</p>
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
                    <td className="py-3 text-right font-medium">${(s.amount / 100).toFixed(2)}</td>
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
