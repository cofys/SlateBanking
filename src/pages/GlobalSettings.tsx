import { useState, useEffect } from "react";
import { Settings, Shield, Globe, Bell, Save, Loader2, Users, Plus, Trash2 } from "lucide-react";

export function GlobalSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminId, setNewAdminId] = useState("");
  const [settings, setSettings] = useState({
    platformName: "Slate SaaS",
    maintenanceMode: false,
    allowNewBanks: true,
    globalRateLimit: 100,
  });

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const res = await fetch("/api/global-admins");
      if (res.ok) {
        setAdmins(await res.json());
      }
    } catch(e) {}
  };

  const handleAddAdmin = async () => {
    if (!newAdminId) return;
    try {
      const res = await fetch("/api/global-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId: newAdminId })
      });
      if (res.ok) {
        setNewAdminId("");
        fetchAdmins();
      } else {
        const d = await res.json();
        alert(d.error || "Failed");
      }
    } catch(e) {}
  };

  const handleRemoveAdmin = async (id: string) => {
    if (!confirm("Remove this global admin?")) return;
    try {
      await fetch(`/api/global-admins/${id}`, { method: "DELETE" });
      fetchAdmins();
    } catch(e) {}
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save
    setTimeout(() => {
      setSaving(false);
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">Global Settings</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <Globe size={18} className="text-indigo-400" />
              Platform Configuration
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Platform Name</label>
                <input 
                  type="text" 
                  value={settings.platformName}
                  onChange={(e) => setSettings({...settings, platformName: e.target.value})}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              
              <div className="flex items-center justify-between py-2">
                <div>
                  <h4 className="text-sm font-medium text-white">Maintenance Mode</h4>
                  <p className="text-xs text-white/50">Suspend all operations except for global admins</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={settings.maintenanceMode}
                    onChange={(e) => setSettings({...settings, maintenanceMode: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-2">
                <div>
                  <h4 className="text-sm font-medium text-white">Allow New Banks</h4>
                  <p className="text-xs text-white/50">Allow creation of new bank instances</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={settings.allowNewBanks}
                    onChange={(e) => setSettings({...settings, allowNewBanks: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <Shield size={18} className="text-rose-400" />
              Security & Limits
            </h3>
            
            <div className="space-y-4">
              <div className="mb-6">
                <label className="block text-sm font-medium text-white/70 mb-2">Global Administrators</label>
                <div className="space-y-2">
                  {admins.map(admin => (
                    <div key={admin.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-2 px-3">
                      <div className="text-sm text-white font-mono">{admin.discordId}</div>
                      <button onClick={() => handleRemoveAdmin(admin.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <input 
                      value={newAdminId}
                      onChange={e => setNewAdminId(e.target.value)}
                      placeholder="Discord ID..."
                      className="flex-1 bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500 text-sm"
                    />
                    <button 
                      onClick={handleAddAdmin}
                      className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Global API Rate Limit (req/min)</label>
                <input 
                  type="number" 
                  value={settings.globalRateLimit}
                  onChange={(e) => setSettings({...settings, globalRateLimit: parseInt(e.target.value) || 100})}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors"
                />
                <p className="text-xs text-white/40 mt-1">Applies globally across all public endpoints.</p>
              </div>
            </div>
          </div>

          <SaasBillingManager />
          
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Configuration
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h3 className="text-sm font-medium text-white mb-3">System Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Version</span>
                <span className="text-sm text-white">v1.2.4</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Database</span>
                <span className="text-sm text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">CityCorp Bot</span>
                <span className="text-sm text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Environment</span>
                <span className="text-sm text-indigo-400">Production</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaasBillingManager() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [calcDetails, setCalcDetails] = useState<any>(null);
  const [formData, setFormData] = useState({
    bankId: "",
    amount: "150.00",
    period: "Monthly Slate SaaS License - " + new Date().toLocaleString("default", { month: "long", year: "numeric" }),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [invRes, bankRes] = await Promise.all([
        fetch("/api/admin/saas-invoices"),
        fetch("/api/banks"),
      ]);
      if (invRes.ok) setInvoices(await invRes.json());
      if (bankRes.ok) setBanks(await bankRes.json());
      setLoading(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBankSelect = async (bankId: string) => {
    setFormData((prev) => ({ ...prev, bankId }));
    if (!bankId) {
      setCalcDetails(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/banks/${bankId}/calculate-billing`);
      if (res.ok) {
        const data = await res.json();
        setCalcDetails(data);
        const amountStr = (data.calculatedAmountCents / 100).toFixed(2);
        const monthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });
        const modelLabel = data.selectedBillingModel.replace('_', ' ').toUpperCase();
        setFormData((prev) => ({
          ...prev,
          bankId,
          amount: amountStr,
          period: `${monthName} License (${modelLabel})`,
        }));
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bankId) return alert("Please select a bank");
    try {
      const res = await fetch("/api/admin/saas-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowModal(false);
        fetchData();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to create invoice");
      }
    } catch(e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await fetch(`/api/admin/saas-invoices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch(e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <span className="text-emerald-400">$</span> SaaS Platform Billing & Invoices
          </h3>
          <p className="text-xs text-white/50 mt-0.5">Issue monthly recurring license invoices to white-labeled tenant banks.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plus size={14} /> Generate SaaS Invoice
        </button>
      </div>

      {loading ? (
        <div className="text-white/40 text-xs animate-pulse">Loading SaaS invoices...</div>
      ) : invoices.length === 0 ? (
        <div className="text-white/40 text-xs py-4 text-center border border-dashed border-white/10 rounded-lg">
          No SaaS billing invoices generated yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-black/30 text-white/50 border-b border-white/10">
              <tr>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Due Date</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-white">{inv.bankName || inv.bankId}</td>
                  <td className="px-3 py-2 text-white/70">{inv.period}</td>
                  <td className="px-3 py-2 font-mono text-emerald-400">${(inv.amount / 100).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      inv.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      inv.status === 'overdue' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                      'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white/50">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right">
                    {inv.status !== 'paid' && (
                      <button
                        onClick={() => handleStatusChange(inv.id, 'paid')}
                        className="text-emerald-400 hover:underline text-[11px] font-medium"
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121a] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Generate SaaS Invoice</h4>
            <form onSubmit={handleCreateInvoice} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Target Bank</label>
                <select
                  value={formData.bankId}
                  onChange={(e) => handleBankSelect(e.target.value)}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                >
                  <option value="">Select a bank...</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {calcDetails && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between font-bold text-emerald-400">
                    <span>SaaS Model: {calcDetails.selectedBillingModel.toUpperCase()}</span>
                    <span>${(calcDetails.calculatedAmountCents / 100).toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-white/70 font-mono">{calcDetails.breakdownText}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Billing Period / Description</label>
                <input
                  type="text"
                  value={formData.period}
                  onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Amount ($ USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg font-medium"
                >
                  Issue Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
