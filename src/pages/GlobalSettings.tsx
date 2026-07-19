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
