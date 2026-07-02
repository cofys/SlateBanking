import { Plus, Server, CheckCircle, XCircle, Loader2, Database, Settings as SettingsIcon, ArrowUpRight } from "lucide-react";
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
  plan?: string;
  billingStatus?: string;
  platformFeePercent?: number;
}

export function BanksList() {
  const [banks, setBanks] = useState<BankInstance[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState<string | null>(null);

  // Database Migration & Billing States
  const [isUploadingDb, setIsUploadingDb] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingPlan, setBillingPlan] = useState("standard");
  const [billingStatus, setBillingStatus] = useState("active");
  const [billingFee, setBillingFee] = useState("2.00");
  const [savingBilling, setSavingBilling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openBilling = (bank: BankInstance) => {
    setBillingPlan(bank.plan || "standard");
    setBillingStatus(bank.billingStatus || "active");
    const percent = bank.platformFeePercent !== undefined ? (bank.platformFeePercent / 100).toFixed(2) : "2.00";
    setBillingFee(percent);
    setShowBillingModal(true);
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBank) return;
    setSavingBilling(true);
    try {
      const res = await fetch(`/api/banks/${selectedBank.id}/billing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: billingPlan,
          billingStatus: billingStatus,
          platformFeePercent: parseFloat(billingFee) || 2.0
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
  const [corpId, setCorpId] = useState("");
  const [corpApiUuid, setCorpApiUuid] = useState("");
  const [corpApiKey, setCorpApiKey] = useState("");
  const [cityCorpAppId, setCityCorpAppId] = useState("");
  const [cityCorpAppSecret, setCityCorpAppSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      await fetch("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name, guildId, discordToken, customDomain,
          corpId: Number(corpId), corpApiUuid, corpApiKey,
          cityCorpAppId, cityCorpAppSecret
        })
      });
      setShowAddModal(false);
      setName("");
      setGuildId("");
      setDiscordToken("");
      setCustomDomain("");
      setCorpId("");
      setCorpApiUuid("");
      setCorpApiKey("");
      fetchBanks();
    } catch (e) {
      console.error(e);
    }
    setSubmitting(false);
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
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank Instances</h1>
          <p className="text-white/50 mt-1">Manage active Discord bot instances for client banks.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-medium hover:bg-white/90 transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Provision New Bank
        </button>

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
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-white/50">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                </td>
              </tr>
            ) : filteredBanks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-white/50">
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
                <h3 className="text-sm font-medium text-white/90">CityCorp Bot API Integration</h3>
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
                  <label className="block text-xs text-white/70 mb-1">Bot Auth UUID</label>
                  <input 
                    required
                    value={corpApiUuid}
                    onChange={(e) => setCorpApiUuid(e.target.value)}
                    placeholder="Minecraft UUID"
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Bot API Key</label>
                  <input 
                    required
                    type="password"
                    value={corpApiKey}
                    onChange={(e) => setCorpApiKey(e.target.value)}
                    placeholder="CityCorp API Key"
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 space-y-4">
                <h3 className="text-sm font-medium text-white/90">CityCorp OAuth Integration (Whitelabel)</h3>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Application ID</label>
                  <input 
                    required
                    value={cityCorpAppId}
                    onChange={(e) => setCityCorpAppId(e.target.value)}
                    placeholder="e.g. 4"
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Application Secret</label>
                  <input 
                    required
                    type="password"
                    value={cityCorpAppSecret}
                    onChange={(e) => setCityCorpAppSecret(e.target.value)}
                    placeholder="OAuth Secret"
                    className="w-full bg-[#0a0a0c] border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
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
        <div className="fixed inset-0 z-50 flex flex-col pt-20 items-center bg-black/80 backdrop-blur-sm overflow-y-auto pb-20">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl">
            <div className="bg-[#0a0a0c] border-b border-white/10 px-6 py-4 flex justify-between items-center sticky top-0">
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
                     <button 
                       onClick={() => {
                         // Copy current values to form state to let user edit them
                         const newName = prompt("New Bank Name:", selectedBank.name);
                         if (newName) {
                           fetch(`/api/banks/${selectedBank.id}`, {
                             method: "PUT",
                             headers: { "Content-Type": "application/json" },
                             body: JSON.stringify({ 
                               name: newName, 
                               discordToken: '', // Avoid overwriting without prompt
                               corpId: selectedBank.corpId, 
                               corpApiUuid: '',
                               corpApiKey: '' 
                             })
                           }).then(() => fetchBanks());
                         }
                       }}
                       className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded transition-colors"
                     >
                       Quick Edit Name
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="text-white/50 block text-xs">Guild ID</span>
                       <span className="font-mono text-white/90">{selectedBank.guildId}</span>
                     </div>
                     <div>
                       <span className="text-white/50 block text-xs">Custom Domain</span>
                       <span className="text-white/90">{selectedBank.customDomain || 'Not configured'}</span>
                     </div>
                   </div>
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

    </div>
  );
}
