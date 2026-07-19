import * as fs from 'fs';

let code = fs.readFileSync('src/pages/GlobalSettings.tsx', 'utf8');

const oldStr = `import { useState, useEffect } from "react";
import { Settings, Shield, Globe, Bell, Save, Loader2 } from "lucide-react";`;

const newStr = `import { useState, useEffect } from "react";
import { Settings, Shield, Globe, Bell, Save, Loader2, Users, Plus, Trash2 } from "lucide-react";`;

code = code.replace(oldStr, newStr);

const oldStr2 = `  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({`;

const newStr2 = `  const [saving, setSaving] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [newAdminId, setNewAdminId] = useState("");
  const [settings, setSettings] = useState({`;

code = code.replace(oldStr2, newStr2);

const oldStr3 = `  const handleSave = async () => {`;

const newStr3 = `  useEffect(() => {
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
      await fetch(\`/api/global-admins/\${id}\`, { method: "DELETE" });
      fetchAdmins();
    } catch(e) {}
  };

  const handleSave = async () => {`;

code = code.replace(oldStr3, newStr3);

const oldStr4 = `            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Global API Rate Limit (req/min)</label>`;

const newStr4 = `            <div className="space-y-4">
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
                <label className="block text-sm font-medium text-white/70 mb-1">Global API Rate Limit (req/min)</label>`;

code = code.replace(oldStr4, newStr4);

fs.writeFileSync('src/pages/GlobalSettings.tsx', code);
console.log("Replaced UI");
