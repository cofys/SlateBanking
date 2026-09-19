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

  const [updatingMaintenance, setUpdatingMaintenance] = useState(false);

  useEffect(() => {
    fetchAdmins();
    fetchGlobalSettings();
  }, []);

  const fetchGlobalSettings = async () => {
    try {
      const res = await fetch("/api/banks");
      if (res.ok) {
        const banks = await res.json();
        const allInMaintenance = banks.length > 0 && banks.every((b: any) => b.maintenanceMode);
        setSettings(s => ({ ...s, maintenanceMode: allInMaintenance }));
      }
    } catch (e) {}
  };

  const handleBulkMaintenance = async (enable: boolean) => {
    setUpdatingMaintenance(true);
    try {
      const res = await fetch("/api/banks/maintenance-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenanceMode: enable })
      });
      if (res.ok) {
        setSettings(s => ({ ...s, maintenanceMode: enable }));
        alert(`Maintenance Mode ${enable ? "ENABLED" : "DISABLED"} for all banks on the network.`);
      } else {
        const d = await res.json();
        alert(`Failed: ${d.error || "Could not update maintenance mode"}`);
      }
    } catch (e) {
      alert("Error updating maintenance mode");
    } finally {
      setUpdatingMaintenance(false);
    }
  };

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
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between py-3 border-y border-white/5 gap-3">
                <div>
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    Network Maintenance Mode
                    {settings.maintenanceMode && <span className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-mono">ALL BANKS IN MAINTENANCE</span>}
                  </h4>
                  <p className="text-xs text-white/50">Enable or disable maintenance mode across all bank web portals and bots simultaneously.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={updatingMaintenance}
                    onClick={() => handleBulkMaintenance(true)}
                    className="px-3 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {updatingMaintenance ? <Loader2 size={12} className="animate-spin" /> : "⚠️ Enable All"}
                  </button>
                  <button
                    type="button"
                    disabled={updatingMaintenance}
                    onClick={() => handleBulkMaintenance(false)}
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    {updatingMaintenance ? <Loader2 size={12} className="animate-spin" /> : "🟢 Disable All"}
                  </button>
                </div>
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
                      className="flex-1 bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500 text-sm"
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
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-500 transition-colors"
                />
                <p className="text-xs text-white/40 mt-1">Applies globally across all public endpoints.</p>
              </div>
            </div>
          </div>

          <SaasBillingManager />
          <BotFleetManagerPanel />
          <GlobalAnnouncementsPanel />
          <GlobalSanctionsPanel />
          <GlobalClearinghousePanel />
          
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
          <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Generate SaaS Invoice</h4>
            <form onSubmit={handleCreateInvoice} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Target Bank</label>
                <select
                  value={formData.bankId}
                  onChange={(e) => handleBankSelect(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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


function BotFleetManagerPanel() {
  const [fleetStatus, setFleetStatus] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFleetStatus();
  }, []);

  const fetchFleetStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bots/status");
      if (res.ok) {
        setFleetStatus(await res.json());
      }
    } catch(e) {}
    setLoading(false);
  };

  return (
    <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Globe className="text-blue-400" size={20} />
          Bot Fleet Management
        </div>
        <button onClick={fetchFleetStatus} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors">
          Refresh Fleet Status
        </button>
      </div>
      
      {loading ? (
        <div className="text-white/50 text-sm animate-pulse">Loading fleet status...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-white/50">
              <tr>
                <th className="px-4 py-2 rounded-tl">Bank ID</th>
                <th className="px-4 py-2">Bot Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {fleetStatus.map((bot, idx) => (
                <tr key={idx} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs">{bot.id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${bot.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {bot.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
              {fleetStatus.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-white/50">No bots provisioned in the fleet yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GlobalAnnouncementsPanel() {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', content: '', type: 'info' });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/global/announcements");
      if (res.ok) {
        setAnnouncements(await res.json());
      }
    } catch(e) {}
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await fetch(`/api/global/announcements/${id}`, { method: "DELETE" });
      fetchAnnouncements();
    } catch(e) {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/global/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ title: '', content: '', type: 'info' });
        fetchAnnouncements();
      } else {
          alert("Failed to create announcement");
      }
    } catch(e) {}
  };

  return (
    <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Bell className="text-yellow-400" size={20} />
          System-Wide Announcements
        </div>
        <button onClick={() => setShowModal(true)} className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1">
          <Plus size={14} /> New Announcement
        </button>
      </div>

      {loading ? (
        <div className="text-white/50 text-sm animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="bg-white/5 border border-white/10 p-4 rounded-lg flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${a.type === 'alert' ? 'bg-red-500/20 text-red-400' : a.type === 'warning' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>{a.type}</span>
                  <h4 className="font-medium text-white">{a.title}</h4>
                </div>
                <p className="text-sm text-white/70 mt-2">{a.content}</p>
                <div className="text-[10px] text-white/40 mt-3">Posted on {new Date(a.createdAt).toLocaleString()}</div>
              </div>
              <button onClick={() => handleDelete(a.id)} className="text-white/40 hover:text-red-400 transition-colors p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {announcements.length === 0 && (
            <div className="text-white/50 text-sm py-4 text-center">No active announcements.</div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Broadcast Announcement</h4>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Title</label>
                <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Type</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="alert">Alert</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Content</label>
                <textarea required rows={4} value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-white/60 hover:text-white">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs rounded-lg font-medium">Broadcast</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalSanctionsPanel() {
  const [sanctions, setSanctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ discordId: '', mcUuid: '', reason: '' });

  useEffect(() => {
    fetchSanctions();
  }, []);

  const fetchSanctions = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/global/sanctions");
      if (res.ok) {
        setSanctions(await res.json());
      }
    } catch(e) {}
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Revoke this sanction?")) return;
    try {
      await fetch(`/api/global/sanctions/${id}`, { method: "DELETE" });
      fetchSanctions();
    } catch(e) {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/global/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ discordId: '', mcUuid: '', reason: '' });
        fetchSanctions();
      } else {
        alert("Failed to issue sanction. Make sure discordId or mcUuid is provided.");
      }
    } catch(e) {}
  };

  return (
    <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Shield className="text-red-400" size={20} />
          Global Sanctions & Bans
        </div>
        <button onClick={() => setShowModal(true)} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1">
          <Plus size={14} /> Issue Sanction
        </button>
      </div>

      {loading ? (
        <div className="text-white/50 text-sm animate-pulse">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-white/50">
              <tr>
                <th className="px-4 py-2 rounded-tl">Discord ID</th>
                <th className="px-4 py-2">MC UUID</th>
                <th className="px-4 py-2">Reason</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2 text-right rounded-tr">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sanctions.map((s) => (
                <tr key={s.id} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs">{s.discordId || 'N/A'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.mcUuid || 'N/A'}</td>
                  <td className="px-4 py-3 text-white/80">{s.reason}</td>
                  <td className="px-4 py-3 text-white/50 text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:underline text-xs">Revoke</button>
                  </td>
                </tr>
              ))}
              {sanctions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-white/50">No global sanctions issued.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 max-w-md w-full space-y-4">
            <h4 className="text-base font-bold text-white">Issue Global Sanction</h4>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Discord ID</label>
                <input type="text" value={formData.discordId} onChange={e => setFormData({...formData, discordId: e.target.value})} className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. 123456789012345678" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Minecraft UUID</label>
                <input type="text" value={formData.mcUuid} onChange={e => setFormData({...formData, mcUuid: e.target.value})} className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. ffffffff-ffff-ffff-ffff-ffffffffffff" />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1">Reason</label>
                <textarea required rows={3} value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full bg-[var(--bg)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"></textarea>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-white/60 hover:text-white">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg font-medium">Issue Sanction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function GlobalClearinghousePanel() {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/global/clearinghouse");
      if (res.ok) {
        setBalances(await res.json());
      }
    } catch(e) {}
    setLoading(false);
  };

  return (
    <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6 mt-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Globe className="text-indigo-400" size={20} />
          Global Clearinghouse Balances
        </div>
        <button onClick={fetchBalances} className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors">
          Refresh Balances
        </button>
      </div>
      
      {loading ? (
        <div className="text-white/50 text-sm animate-pulse">Loading clearinghouse...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-white/50">
              <tr>
                <th className="px-4 py-2 rounded-tl">Bank ID</th>
                <th className="px-4 py-2">Bank Name</th>
                <th className="px-4 py-2 text-right rounded-tr">Onyx Clearinghouse Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {balances.map((b, idx) => (
                <tr key={idx} className="hover:bg-white/5">
                  <td className="px-4 py-3 font-mono text-xs">{b.bankId}</td>
                  <td className="px-4 py-3 text-white/80">{b.bankName || 'Unknown Bank'}</td>
                  <td className={`px-4 py-3 text-right font-mono font-medium ${b.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {b.balance < 0 ? '-' : ''}${(Math.abs(b.balance) / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
              {balances.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-white/50">No clearinghouse balances exist yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
