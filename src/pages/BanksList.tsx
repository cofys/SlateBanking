import { Plus, Server, CheckCircle, XCircle, Loader2, Database, Settings as SettingsIcon, ArrowUpRight, Search, Building2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

interface BankInstance {
  id: string;
  name: string;
  guildId: string;
  customDomain: string | null;
  status: string;
  createdAt: string;
  corpId?: number;
  corpApiUuid?: string;
  corpApiKey?: string;
  cityCorpAppId?: string;
  cityCorpAppSecret?: string;
  discordClientId?: string;
  discordClientSecret?: string;
  discordToken?: string;
  plan?: string;
  billingStatus?: string;
  billingModel?: string;
  flatMonthlyRate?: number;
  volumeFeePercent?: number;
  profitSharePercent?: number;
  perAccountRate?: number;
  perTxRate?: number;
  billingNotes?: string;
  platformFeePercent?: number;
  cityCorpAuthUrl?: string;
  maintenanceMode?: boolean;
  hasDiscordToken?: boolean;
  hasDiscordClientSecret?: boolean;
  hasCityCorpAppSecret?: boolean;
  hasApiKey?: boolean;
  hasWebhookSecret?: boolean;
}

export function BanksList() {
  const [banks, setBanks] = useState<BankInstance[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState<string | null>(null);

  // Database Migration & Billing States
  const [isUploadingDb, setIsUploadingDb] = useState(false);
  const [selectedBankForBilling, setSelectedBankForBilling] = useState<BankInstance | null>(null);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingPlan, setBillingPlan] = useState("standard");
  const [billingStatus, setBillingStatus] = useState("active");
  const [billingFee, setBillingFee] = useState("2.00");
  const [billingModel, setBillingModel] = useState("flat_monthly");
  const [flatRate, setFlatRate] = useState("150.00");
  const [volumePercent, setVolumePercent] = useState("0.50");
  const [profitPercent, setProfitPercent] = useState("5.00");
  const [perAccountFee, setPerAccountFee] = useState("1.50");
  const [perTxFee, setPerTxFee] = useState("0.25");
  const [billingNotes, setBillingNotes] = useState("");
  const [calcBilling, setCalcBilling] = useState<any>(null);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openBilling = async (bank: BankInstance) => {
    setSelectedBankForBilling(bank);
    setBillingPlan(bank.plan || "standard");
    setBillingStatus(bank.billingStatus || "active");
    setBillingFee(bank.platformFeePercent !== undefined ? (bank.platformFeePercent / 100).toFixed(2) : "2.00");
    setBillingModel(bank.billingModel || "flat_monthly");
    setFlatRate(bank.flatMonthlyRate !== undefined ? (bank.flatMonthlyRate / 100).toFixed(2) : "150.00");
    setVolumePercent(bank.volumeFeePercent !== undefined ? (bank.volumeFeePercent / 100).toFixed(2) : "0.50");
    setProfitPercent(bank.profitSharePercent !== undefined ? (bank.profitSharePercent / 100).toFixed(2) : "5.00");
    setPerAccountFee(bank.perAccountRate !== undefined ? (bank.perAccountRate / 100).toFixed(2) : "1.50");
    setPerTxFee(bank.perTxRate !== undefined ? (bank.perTxRate / 100).toFixed(2) : "0.25");
    setBillingNotes(bank.billingNotes || "");
    setShowBillingModal(true);

    setLoadingCalc(true);
    try {
      const res = await fetch(`/api/admin/banks/${bank.id}/calculate-billing`);
      if (res.ok) {
        setCalcBilling(await res.json());
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoadingCalc(false);
    }
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankForBilling) return;
    setSavingBilling(true);
    try {
      const res = await fetch(`/api/banks/${selectedBankForBilling.id}/billing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: billingPlan,
          billingStatus: billingStatus,
          platformFeePercent: parseFloat(billingFee) || 2.0,
          billingModel: billingModel,
          flatMonthlyRate: parseFloat(flatRate) || 0,
          volumeFeePercent: parseFloat(volumePercent) || 0,
          profitSharePercent: parseFloat(profitPercent) || 0,
          perAccountRate: parseFloat(perAccountFee) || 0,
          perTxRate: parseFloat(perTxFee) || 0,
          billingNotes: billingNotes,
        })
      });
      if (res.ok) {
        setShowBillingModal(false);
        fetchBanks();
      } else {
        const data = await res.json();
        alert("Error saving billing: " + (data.error || "Failed"));
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setSavingBilling(false);
  };

  const handleUploadDb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBank) return;

    setIsUploadingDb(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch(`/api/banks/${selectedBank.id}/upload-db`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content: base64 })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          alert(`Migration Successful!\n\nImported ${data.accountsImported} accounts and ${data.transactionsImported} transactions into ${selectedBank.name}.`);
          fetchBanks();
        } else {
          alert("Error: " + (data.error || "Failed to process database file"));
        }
      } catch (err: any) {
        console.error(err);
        alert("Upload failed: " + err.message);
      } finally {
        setIsUploadingDb(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Form State
  const [name, setName] = useState("");
  const [guildId, setGuildId] = useState("");
  const [discordToken, setDiscordToken] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [discordClientId, setDiscordClientId] = useState("");
  const [discordClientSecret, setDiscordClientSecret] = useState("");
  const [corpId, setCorpId] = useState("");
  const [corpApiUuid, setCorpApiUuid] = useState("");
  const [corpApiKey, setCorpApiKey] = useState("");
  const [cityCorpAppId, setCityCorpAppId] = useState("");
  const [cityCorpAppSecret, setCityCorpAppSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Editing Existing Bank Config State
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editName, setEditName] = useState("");
  const [editGuildId, setEditGuildId] = useState("");
  const [editDiscordToken, setEditDiscordToken] = useState("");
  const [editCorpId, setEditCorpId] = useState("");
  const [editCorpApiUuid, setEditCorpApiUuid] = useState("");
  const [editCityCorpAppId, setEditCityCorpAppId] = useState("");
  const [editCityCorpAppSecret, setEditCityCorpAppSecret] = useState("");
  const [editCityCorpAuthUrl, setEditCityCorpAuthUrl] = useState("");
  const [editCustomDomain, setEditCustomDomain] = useState("");
  const [editDiscordClientId, setEditDiscordClientId] = useState("");
  const [editDiscordClientSecret, setEditDiscordClientSecret] = useState("");

  const activeSelectedBank = banks.find(b => b.id === showManageModal);

  useEffect(() => {
    if (activeSelectedBank) {
      setEditName(activeSelectedBank.name || "");
      setEditGuildId(activeSelectedBank.guildId || "");
      setEditDiscordToken("");
      setEditCorpId(activeSelectedBank.corpId ? activeSelectedBank.corpId.toString() : "");
      setEditCorpApiUuid(activeSelectedBank.corpApiUuid || "");
      setEditCityCorpAppId(activeSelectedBank.cityCorpAppId || "");
      setEditCityCorpAppSecret(activeSelectedBank.cityCorpAppSecret || "");
      setEditCityCorpAuthUrl(activeSelectedBank.cityCorpAuthUrl || "");
      setEditCustomDomain(activeSelectedBank.customDomain || "");
      setEditDiscordClientId(activeSelectedBank.discordClientId || "");
      setEditDiscordClientSecret(""); // Don't pre-fill secrets
      setIsEditingConfig(false);
    }
  }, [showManageModal, activeSelectedBank]);

  const handleToggleBankMaintenance = async (bankId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/banks/${bankId}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenanceMode: !currentStatus })
      });
      if (res.ok) {
        fetchBanks();
      } else {
        const d = await res.json();
        alert(`Failed: ${d.error || "Could not update bank maintenance mode"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error updating maintenance mode");
    }
  };

  const handleToggleAllMaintenance = async (enable: boolean) => {
    const actionText = enable ? "ENABLE" : "DISABLE";
    if (!confirm(`Are you sure you want to ${actionText} maintenance mode for ALL banks on the network?`)) return;

    try {
      const res = await fetch("/api/banks/maintenance-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenanceMode: enable })
      });
      if (res.ok) {
        fetchBanks();
      } else {
        const d = await res.json();
        alert(`Failed: ${d.error || "Could not update network maintenance mode"}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error updating network maintenance mode");
    }
  };

  const fetchBanks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/banks");
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setBanks(data);
      }
    } catch (e) {
      console.error("BanksList fetch error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, guildId, discordToken, discordClientId, discordClientSecret, customDomain,
          corpId: Number(corpId), corpApiUuid, corpApiKey,
          cityCorpAppId, cityCorpAppSecret
        })
      });
      if (res.ok) {
        setShowAddModal(false);
        setName("");
        setGuildId("");
        setDiscordToken("");
        setCustomDomain("");
        setDiscordClientId("");
        setDiscordClientSecret("");
        setCorpId("");
        setCorpApiUuid("");
        setCorpApiKey("");
        setCityCorpAppId("");
        setCityCorpAppSecret("");
        fetchBanks();
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to provision bank: ${errorData.error || res.statusText || "Server error"}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error provisioning bank: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBot = async (bankId: string, currentStatus: string) => {
    const action = currentStatus === 'online' ? 'stop' : 'start';
    try {
      await fetch(`/api/banks/${bankId}/bot-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      fetchBanks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBank = async (bankId: string) => {
    if (!confirm("Are you sure you want to delete this bank? This cannot be undone.")) return;
    try {
      await fetch(`/api/banks/${bankId}`, { method: "DELETE" });
      setShowManageModal(null);
      fetchBanks();
    } catch (e) {
      console.error(e);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const selectedBank = banks.find(b => b.id === showManageModal);
  const filteredBanks = banks.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.guildId.includes(searchTerm) || 
    b.status.includes(searchTerm)
  );

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank Instances</h1>
          <p className="text-white/50 mt-1">Manage active Discord bot instances and network maintenance modes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleToggleAllMaintenance(true)}
            className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer"
            title="Enable maintenance mode on all banks"
          >
            ⚠️ Enable Maintenance (All)
          </button>
          <button 
            onClick={() => handleToggleAllMaintenance(false)}
            className="flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer"
            title="Disable maintenance mode on all banks"
          >
            🟢 Disable Maintenance (All)
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors cursor-pointer"
          >
            <Plus size={16} />
            Provision New Bank
          </button>
        </div>

        {showBillingModal && selectedBank && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-[#0f0f15] border border-white/10 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in duration-200">
              <div className="bg-[#0a0a0c] border-b border-white/10 px-6 py-4 flex justify-between items-center">
                <h3 className="font-semibold text-white">SaaS Configuration: {selectedBank.name}</h3>
                <button 
                  onClick={() => setShowBillingModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors text-white"
                >
                  <XCircle size={16} />
                </button>
              </div>
              <form onSubmit={handleSaveBilling} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">
                    Subscription Plan
                  </label>
                  <select
                    value={billingPlan}
                    onChange={e => setBillingPlan(e.target.value)}
                    className="w-full bg-[#16161d] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="starter">Starter Plan ($9.99/mo)</option>
                    <option value="standard">Standard Plan ($19.99/mo)</option>
                    <option value="enterprise">Enterprise Plan ($49.99/mo)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">
                    Billing Status
                  </label>
                  <select
                    value={billingStatus}
                    onChange={e => setBillingStatus(e.target.value)}
                    className="w-full bg-[#16161d] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="active">Active</option>
                    <option value="trialing">Trialing</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">
                    Platform Transaction Fee (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={billingFee}
                    onChange={e => setBillingFee(e.target.value)}
                    className="w-full bg-[#16161d] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="2.00"
                    required
                  />
                  <span className="text-[10px] text-white/30 mt-1 block">Charges standard transaction routing fees for transfer activities.</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    type="submit" 
                    disabled={savingBilling}
                    className="flex-1 bg-white hover:bg-white/90 text-black text-sm py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {savingBilling ? <Loader2 size={16} className="animate-spin" /> : "Save Configuration"}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setShowBillingModal(false)}
                    className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 text-white text-sm py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="border border-white/10 rounded-xl overflow-hidden bg-white/5">
        <div className="p-4 border-b border-white/10">
          <input 
            type="text" 
            placeholder="Search banks by name, guild ID, status..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md bg-[#16161d] border border-white/10 rounded-md py-2 px-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0a0a0c] border-b border-white/10 text-white/50">
            <tr>
              <th className="px-6 py-4 font-medium">Bank ID</th>
              <th className="px-6 py-4 font-medium">Bank Name</th>
              <th className="px-6 py-4 font-medium">Domain</th>
              <th className="px-6 py-4 font-medium">Guild ID</th>
              <th className="px-6 py-4 font-medium">Provisioned On</th>
              <th className="px-6 py-4 font-medium">Bot Status</th>
              <th className="px-6 py-4 font-medium">Maintenance</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-white/50">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                </td>
              </tr>
            ) : filteredBanks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-white/50">
                  No bank instances found.
                </td>
              </tr>
            ) : (
              filteredBanks.map((bank) => (
                <tr key={bank.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4 font-mono text-white/50 text-xs">
                     <span 
                        className="cursor-pointer hover:text-white transition-colors" 
                        title={`Click to copy: ${bank.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(bank.id);
                          alert('Copied Bank ID');
                        }}
                     >
                       {bank.id.split('-')[0]}...
                     </span>
                  </td>
                  <td className="px-6 py-4 font-medium">{bank.name}</td>
                  <td className="px-6 py-4 text-white/70">{bank.customDomain || '—'}</td>
                  <td className="px-6 py-4 font-mono text-white/50">
                     <span 
                        className="cursor-pointer hover:text-white transition-colors" 
                        title={`Click to copy: ${bank.guildId}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(bank.guildId);
                          alert('Copied Guild ID');
                        }}
                     >
                       {bank.guildId}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-white/70">{new Date(bank.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2" title="Status of the bank's active Discord Bot connection.">
                      {bank.status === 'online' ? (
                        <><CheckCircle size={14} className="text-emerald-500" /> <span className="text-emerald-500">Online</span></>
                      ) : (
                        <><XCircle size={14} className="text-red-500" /> <span className="text-red-500 capitalize">{bank.status}</span></>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleBankMaintenance(bank.id, !!bank.maintenanceMode)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                        bank.maintenanceMode 
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-sm shadow-amber-500/10' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                      }`}
                      title={bank.maintenanceMode ? "Click to disable maintenance mode and resume operations" : "Click to enable maintenance mode"}
                    >
                      {bank.maintenanceMode ? '⚠️ Maintenance On' : '🟢 Active'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setShowManageModal(bank.id)}
                      className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6 max-w-md w-full max-h-full overflow-y-auto">
            <h2 className="text-xl font-semibold mb-1">Provision New Bank</h2>
            <p className="text-sm text-white/50 mb-6">Enter details to deploy a new Slate banking instance.</p>
            
            <form onSubmit={handleAddBank} className="space-y-4">
              <div>
                <label className="block text-xs text-white/70 mb-1">Bank Name</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maze Bank"
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />

                <p className="text-xs text-amber-400/80 mt-1 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>Remember to also add this domain to your Coolify application's "Domains" field so the reverse proxy can route it here!</span>
                </p>

              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Discord Server (Guild) ID</label>
                <input 
                  required
                  value={guildId}
                  onChange={(e) => setGuildId(e.target.value)}
                  placeholder="e.g. 129845729188"
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Discord Bot Token</label>
                <input 
                  required
                  type="password"
                  value={discordToken}
                  onChange={(e) => setDiscordToken(e.target.value)}
                  placeholder="Paste bot token here..."
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/70 mb-1">Discord Client ID</label>
                  <input value={discordClientId} onChange={(e) => setDiscordClientId(e.target.value)} placeholder="e.g. 129845729188" className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Discord Client Secret</label>
                  <input type="password" value={discordClientSecret} onChange={(e) => setDiscordClientSecret(e.target.value)} className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Custom Domain (Optional)</label>
                <input 
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="e.g. maze.slate.finance"
                  className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-white/5 space-y-4">
                <h3 className="text-sm font-medium text-white/90">CityCorp Integration</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-white/70 mb-1">Corporation ID</label>
                    <input 
                      required
                      type="number"
                      value={corpId}
                      onChange={(e) => setCorpId(e.target.value)}
                      placeholder="e.g. 1"
                      className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/70 mb-1">Application ID (OAuth)</label>
                    <input 
                      required
                      value={cityCorpAppId}
                      onChange={(e) => setCityCorpAppId(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/70 mb-1">Bot Auth UUID (Minecraft UUID)</label>
                  <input 
                    required
                    value={corpApiUuid}
                    onChange={(e) => setCorpApiUuid(e.target.value)}
                    placeholder="Minecraft UUID"
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/70 mb-1">CityCorp App Token (API Key & Secret)</label>
                  <input 
                    required
                    type="password"
                    value={cityCorpAppSecret}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCityCorpAppSecret(val);
                      setCorpApiKey(val);
                    }}
                    placeholder="e.g. crp_vance_..."
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                  />
                  <p className="text-[10px] text-white/40 mt-1">
                    CityCorp issues a single unified <strong>App Token</strong> (starting with <code className="text-indigo-300">crp_</code>). This functions as both your Bot API Key for general ledger sync and your Whitelabel OAuth Secret.
                  </p>
                </div>
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
                  className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? "Deploying..." : "Provision Instance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showManageModal && selectedBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="bg-[#0a0a0c] border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
              <div>
                <h2 
                  className="text-xl font-semibold cursor-pointer hover:text-indigo-400 transition-colors inline-block"
                  onClick={() => {
                    const newName = prompt("New Bank Name:", selectedBank.name);
                    if (newName) {
                      fetch(`/api/banks/${selectedBank.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                          name: newName, 
                          discordToken: '', 
                          corpId: selectedBank.corpId, 
                          corpApiUuid: '',
                          corpApiKey: '' 
                        })
                      }).then(() => fetchBanks());
                    }
                  }}
                  title="Click to edit name"
                >
                  {selectedBank.name}
                </h2>
                <div className="text-xs text-white/50 flex items-center gap-2 mt-1">
                  ID: <span className="font-mono">{selectedBank.id}</span>
                </div>
              </div>
              <button 
                onClick={() => setShowManageModal(null)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <XCircle size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
               <div className="flex justify-end -mt-2 mb-2">
                  <Link 
                    to={`/bank/${selectedBank.id}`} 
                    className="flex items-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                  >
                    Login to Whitelabeled Operator Dashboard <ArrowUpRight size={16} />
                  </Link>
               </div>
               
               <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 bg-white/5 rounded-lg border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-white/70">
                        <SettingsIcon size={16} className="text-indigo-400" />
                        <span className="text-sm font-medium">Bank Configuration</span>
                      </div>
                      {!isEditingConfig ? (
                        <button 
                          onClick={() => setIsEditingConfig(true)}
                          className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded transition-colors font-medium"
                        >
                          Modify Settings / Credentials
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setIsEditingConfig(false)}
                            className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded transition-colors font-medium"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => {
                              const body: any = {
                                name: editName,
                                guildId: editGuildId,
                                corpId: editCorpId ? parseInt(editCorpId) : null,
                                corpApiUuid: editCorpApiUuid,
                                customDomain: editCustomDomain,
                                discordClientId: editDiscordClientId,
                                discordClientSecret: editDiscordClientSecret,
                                cityCorpAppId: editCityCorpAppId,
                                cityCorpAuthUrl: editCityCorpAuthUrl,
                              };

                              if (editDiscordToken) {
                                body.discordToken = editDiscordToken;
                              }
                              if (editCityCorpAppSecret) {
                                body.cityCorpAppSecret = editCityCorpAppSecret;
                                body.corpApiKey = editCityCorpAppSecret;
                              }

                              fetch(`/api/banks/${selectedBank.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(body)
                              })
                              .then(r => r.json())
                              .then(() => {
                                setIsEditingConfig(false);
                                fetchBanks();
                                alert("Configuration saved successfully!");
                              });
                            }}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded transition-colors font-medium"
                          >
                            Save Config
                          </button>
                        </div>
                      )}
                    </div>

                    {!isEditingConfig ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-white/50 block text-xs">Bank Name</span>
                          <span className="text-white/90">{selectedBank.name}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Guild ID</span>
                          <span className="font-mono text-white/90">{selectedBank.guildId}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Custom Domain</span>
                          <span className="text-white/90">{selectedBank.customDomain || 'Not configured'}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Corporation ID (CityCorp)</span>
                          <span className="font-mono text-white/90">{selectedBank.corpId || 'Not configured'}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Bot Auth UUID (CityCorp)</span>
                          <span className="font-mono text-white/90 truncate block max-w-[200px]" title={selectedBank.corpApiUuid}>{selectedBank.corpApiUuid || 'Not configured'}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Application ID (CityCorp)</span>
                          <span className="font-mono text-white/90">{selectedBank.cityCorpAppId || 'Not configured'}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">App Token / Bot API Key</span>
                          <span className="font-mono text-white/90">
                            {selectedBank.hasCityCorpAppSecret || selectedBank.corpApiKey ? '••••••••' : 'Not configured'}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Discord Bot Token</span>
                          <span className="font-mono text-white/90">
                            {selectedBank.hasDiscordToken ? '••••••••' : 'Not configured'}
                          </span>
                        </div>

                        <div>
                          <span className="text-white/50 block text-xs">Discord Client ID</span>
                          <span className="font-mono text-white/90">{selectedBank.discordClientId || 'Not configured'}</span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Discord Client Secret</span>
                          <span className="font-mono text-white/90">
                            {selectedBank.hasDiscordClientSecret ? '••••••••' : 'Not configured'}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/50 block text-xs">Custom CityCorp OAuth URL</span>
                          <span className="font-mono text-white/90 text-[10px] break-all">
                            {selectedBank.cityCorpAuthUrl || 'Not configured'}
                          </span>
                        </div>


                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Bank Name</label>
                            <input 
                              type="text" 
                              value={editName} 
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Guild ID</label>
                            <input 
                              type="text" 
                              value={editGuildId} 
                              onChange={(e) => setEditGuildId(e.target.value)}
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Custom Domain</label>
                            <input 
                              type="text" 
                              value={editCustomDomain} 
                              onChange={(e) => setEditCustomDomain(e.target.value)}
                              placeholder="e.g. bank.yourdomain.com"
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Corporation ID (CityCorp)</label>
                            <input 
                              type="text" 
                              value={editCorpId} 
                              onChange={(e) => setEditCorpId(e.target.value)}
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Bot Auth UUID (Minecraft)</label>
                            <input 
                              type="text" 
                              value={editCorpApiUuid} 
                              onChange={(e) => setEditCorpApiUuid(e.target.value)}
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Application ID (CityCorp)</label>
                            <input 
                              type="text" 
                              value={editCityCorpAppId} 
                              onChange={(e) => setEditCityCorpAppId(e.target.value)}
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">App Token / Bot API Key</label>
                            <input 
                              type="password" 
                              value={editCityCorpAppSecret} 
                              onChange={(e) => setEditCityCorpAppSecret(e.target.value)}
                              placeholder="Leave blank to keep current token"
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/40" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Discord Bot Token</label>
                            <input 
                              type="password" 
                              value={editDiscordToken} 
                              onChange={(e) => setEditDiscordToken(e.target.value)}
                              placeholder="Leave blank to keep current token"
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/40" 
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Discord Client ID</label>
                            <input 
                              type="text" 
                              value={editDiscordClientId} 
                              onChange={(e) => setEditDiscordClientId(e.target.value)}
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" 
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">Discord Client Secret</label>
                            <input 
                              type="password" 
                              value={editDiscordClientSecret} 
                              onChange={(e) => setEditDiscordClientSecret(e.target.value)}
                              placeholder="Leave blank to keep unchanged"
                              className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/40" 
                            />
                          </div>

                        </div>
                      </div>
                    )}
                  </div>

                 <div className="bg-white/5 rounded-lg border border-white/5 p-4 flex flex-col justify-between">
                   <div className="flex items-center gap-2 text-white/70 mb-2">
                     <Database size={16} className="text-indigo-400" />
                     <span className="text-sm font-medium">Database Migration</span>
                   </div>
                   <p className="text-xs text-white/40 mb-4">Upload a legacy v1 SQLite database to merge its contents into this bank instance.</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingDb}
                      className={`block bg-[#20202e] hover:bg-[#2c2c3e] text-[#a5b4fc] transition-colors w-full font-medium text-xs py-2.5 rounded border border-[#4f46e5]/20 text-center cursor-pointer ${isUploadingDb ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      {isUploadingDb ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 size={12} className="animate-spin" /> Migrating...
                        </span>
                      ) : (
                        "Upload bank.db"
                      )}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".db,.sqlite,application/x-sqlite3" onChange={handleUploadDb} className="hidden" disabled={isUploadingDb} />
                 </div>

                 <div className="bg-white/5 rounded-lg border border-white/5 p-4 flex flex-col justify-between">
                   <div className="flex items-center gap-2 text-white/70 mb-2">
                     <SettingsIcon size={16} className="text-indigo-400" />
                     <span className="text-sm font-medium">SaaS Configuration</span>
                   </div>
                   <p className="text-xs text-white/40 mb-4">Manage this client's billing status, subscription plan, and platform fees.</p>
                   <button 
                     onClick={() => openBilling(selectedBank)}
                     className="bg-white/10 hover:bg-white/20 transition-colors w-full font-medium text-xs py-2 rounded border border-white/10"
                   >
                     Open Billing Settings
                   </button>
                 </div>
               </div>

               <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                 <h3 className="text-red-400 font-medium text-sm mb-1">Danger Zone</h3>
                 <p className="text-xs text-red-400/70 mb-3">Permanent operations that will disrupt service for this client.</p>
                 <div className="flex gap-2">
                   <button 
                     onClick={() => handleToggleBot(selectedBank.id, selectedBank.status)}
                     className="bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs py-1.5 px-3 rounded font-medium transition-colors"
                   >
                     {selectedBank.status === 'online' ? 'Stop Bot Instance' : 'Start Bot Instance'}
                   </button>
                   <button 
                     onClick={() => handleDeleteBank(selectedBank.id)}
                     className="bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs py-1.5 px-3 rounded font-medium transition-colors"
                   >
                     Delete Instance & Data
                   </button>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

     {showBillingModal && selectedBankForBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f0f15] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">{selectedBankForBilling.name}</h2>
                  <span className="bg-indigo-500/20 text-indigo-300 text-xs font-mono font-bold px-2 py-0.5 rounded border border-indigo-500/30">
                    SaaS Pricing & Billing Config
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-1">Configure custom billing models, fee tiers, and price rates for this specific tenant bank.</p>
              </div>
              <button 
                onClick={() => setShowBillingModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBilling} className="space-y-6">
              {/* Plan & Status Tiers */}
              <div className="grid grid-cols-3 gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1 uppercase tracking-wider">Subscription Tier</label>
                  <select
                    value={billingPlan}
                    onChange={(e) => setBillingPlan(e.target.value)}
                    className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="starter">Starter Plan</option>
                    <option value="standard">Standard Plan</option>
                    <option value="enterprise">Enterprise Tier</option>
                    <option value="custom">Custom Contract</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1 uppercase tracking-wider">Account Billing Status</label>
                  <select
                    value={billingStatus}
                    onChange={(e) => setBillingStatus(e.target.value)}
                    className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="active">Active (Good Standing)</option>
                    <option value="trialing">Trialing (Free Trial)</option>
                    <option value="overdue">Overdue Payment</option>
                    <option value="suspended">Suspended Access</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1 uppercase tracking-wider">Transfer Fee (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={billingFee}
                    onChange={(e) => setBillingFee(e.target.value)}
                    className="w-full bg-[#12121a] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    placeholder="2.00"
                  />
                </div>
              </div>

              {/* Billing Models Picker */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider">
                  Select SaaS Billing Model
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'flat_monthly', label: 'Flat Monthly Fee', desc: 'Fixed monthly subscription rate' },
                    { id: 'volume_tier', label: 'Volume Fee %', desc: '% of total transaction volume' },
                    { id: 'revenue_share', label: 'Profit Share %', desc: '% share of bank earnings' },
                    { id: 'per_account', label: 'Per-Account Rate', desc: 'Price per active bank user' },
                    { id: 'per_tx', label: 'Per-Transaction Fee', desc: 'Price per settled transfer' },
                    { id: 'hybrid', label: 'Hybrid Custom', desc: 'Combination of flat + % + user rates' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setBillingModel(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        billingModel === m.id
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-lg'
                          : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold text-xs">{m.label}</div>
                      <div className="text-[10px] text-white/40 mt-1">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Specific Pricing Controls */}
              <div className="bg-[#12121a] p-4 rounded-xl border border-white/10 space-y-4">
                <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                  <SettingsIcon size={14} /> Pricing & Rate Parameters
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">Flat Monthly Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={flatRate}
                      onChange={(e) => setFlatRate(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">Volume Fee Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={volumePercent}
                      onChange={(e) => setVolumePercent(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">Profit Share Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={profitPercent}
                      onChange={(e) => setProfitPercent(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">Per Active Account ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={perAccountFee}
                      onChange={(e) => setPerAccountFee(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/60 mb-1">Per Transaction Fee ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={perTxFee}
                      onChange={(e) => setPerTxFee(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-white/60 mb-1">Contract / Billing Notes</label>
                  <input
                    type="text"
                    value={billingNotes}
                    onChange={(e) => setBillingNotes(e.target.value)}
                    placeholder="e.g. Special 20% partner discount applied or custom terms"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                  />
                </div>
              </div>

              {/* Live Billing Projection Box */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    {loadingCalc ? <Loader2 size={12} className="animate-spin" /> : "⚡"} Live Projected Monthly Invoice
                  </span>
                  <span className="text-xl font-mono font-black text-white">
                    ${calcBilling?.allModelProjections?.[billingModel] ? (calcBilling.allModelProjections[billingModel].totalCents / 100).toFixed(2) : "0.00"}
                  </span>
                </div>
                {calcBilling?.allModelProjections?.[billingModel] && (
                  <p className="text-xs text-emerald-300/80 font-mono bg-black/30 p-2 rounded border border-emerald-500/10">
                    {calcBilling.allModelProjections[billingModel].breakdown}
                  </p>
                )}
                {calcBilling?.metrics && (
                  <div className="text-[10px] text-white/50 flex gap-3 pt-1">
                    <span>Active Accounts: {calcBilling.metrics.activeAccountCount}</span>
                    <span>30D Volume: ${(calcBilling.metrics.totalVolumeCents / 100).toFixed(2)}</span>
                    <span>30D Transactions: {calcBilling.metrics.totalTxCount}</span>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBillingModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBilling}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  {savingBilling && <Loader2 size={12} className="animate-spin" />}
                  Save SaaS Billing Config
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
