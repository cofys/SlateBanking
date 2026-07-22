import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, Save, Loader2, Paintbrush, Bell, Shield, Wallet, Settings, Layers, Bot } from "lucide-react";

export function BankSettings() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vaultTiers, setVaultTiers] = useState<any[]>([{"lockDays":7,"interestRate":100,"penaltyPercent":20},{"lockDays":30,"interestRate":300,"penaltyPercent":20},{"lockDays":90,"interestRate":500,"penaltyPercent":20},{"lockDays":180,"interestRate":800,"penaltyPercent":20},{"lockDays":365,"interestRate":1200,"penaltyPercent":20}]);

  useEffect(() => {
    if (bank?.id) {
      setLoading(true);
      fetch(`/api/banks/${bank.id}/settings`)
        .then(r => r.json())
        .then(data => {
          setSettings(data);
          if (data.vaultTiers) setVaultTiers(data.vaultTiers);
          setLoading(false);
        });
    }
  }, [bank]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const newSettings = {
      withdrawFeePercent: parseFloat(formData.get("withdrawFeePercent") as string) || 0,
      depositFeePercent: parseFloat(formData.get("depositFeePercent") as string) || 0,
      transferFeePercent: parseFloat(formData.get("transferFeePercent") as string) || 0,
      savingsApyPercent: Math.round(parseFloat(formData.get("savingsApyPercent") as string) * 100) || 300,
      interBankWireThreshold: Math.floor(parseFloat(formData.get("interBankWireThreshold") as string) * 100) || 5000000,
      colorScheme: formData.get("colorScheme"),
      logoUrl: formData.get("logoUrl"),
      loginBgUrl: formData.get("loginBgUrl"),
      supportEmail: formData.get("supportEmail"),
      discordWebhookUrl: formData.get("discordWebhookUrl"),
      discordVerifiedRoleId: formData.get("discordVerifiedRoleId"),
      discordClientRoleId: formData.get("discordClientRoleId"),
      requireKyc: formData.get("requireKyc") === "on",
      requirePersonalForBusiness: formData.get("requirePersonalForBusiness") === "on",
      enableLoans: formData.get("enableLoans") === "on",
      enableVaults: formData.get("enableVaults") === "on",
      enableCards: formData.get("enableCards") === "on",
      enablePayroll: formData.get("enablePayroll") === "on",
      enableSubscriptions: formData.get("enableSubscriptions") === "on",
      enableEscrow: formData.get("enableEscrow") === "on",
      enableTreasury: formData.get("enableTreasury") === "on",
      vaultTiers: vaultTiers,
      autoApproveLoans: formData.get("autoApproveLoans") === "on",
      autoApproveCreditCards: formData.get("autoApproveCreditCards") === "on",
      maxAutoApproveLoanAmount: parseFloat(formData.get("maxAutoApproveLoanAmount") as string) || 1000000,
      customDomain: formData.get("customDomain"),
      discordClientId: formData.get("discordClientId"),
      discordClientSecret: formData.get("discordClientSecret"),
      cityCorpAppId: formData.get("cityCorpAppId"),
      cityCorpAppSecret: formData.get("cityCorpAppSecret"),
      cityCorpAuthUrl: formData.get("cityCorpAuthUrl")
    };

    fetch(`/api/banks/${bank.id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings)
    }).then(r => r.json())
      .then(d => {
        setSettings(d);
        setSaving(false);
        alert("Settings saved successfully!");
      });
  };

  if (loading) return <div className="text-white/50 animate-pulse">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Configuration Settings</h2>
        <p className="text-white/60 text-sm mt-1">Manage platform behavior, branding, and rules.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Fees & Rates */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Wallet className="text-indigo-400" size={20} />
            Fees & Risk Management
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Deposit Fee (%)</label>
              <input 
                name="depositFeePercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.depositFeePercent || 0} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Withdraw Fee (%)</label>
              <input 
                name="withdrawFeePercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.withdrawFeePercent || 0} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Transfer Fee (%)</label>
              <input 
                name="transferFeePercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.transferFeePercent || 0} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Savings APY Yield (%)</label>
              <input 
                name="savingsApyPercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.savingsApyPercent ? (settings.savingsApyPercent / 100) : 3.0} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide" title="If an incoming Onyx Clearinghouse transfer is greater than this amount, it requires your Bank Staff to manually accept a wire transfer instead of automatically updating balances.">Inbound Wire Threshold ($)</label>
              <input 
                name="interBankWireThreshold" 
                type="number" 
                step="1"
                defaultValue={settings?.interBankWireThreshold ? Math.floor(settings.interBankWireThreshold / 100) : 50000} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
          <p className="text-xs text-white/40 mt-4">Fees are automatically deducted during transactions and deposited into the bank's operational account. Wire Threshold protects against unbacked inter-bank liquidity.</p>
        </div>

        {/* Branding & Visuals */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Paintbrush className="text-pink-400" size={20} />
            Brand Identity
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Brand Color Scheme</label>
              <select 
                name="colorScheme" 
                defaultValue={settings?.colorScheme || "indigo"} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }}
              >
                <option value="indigo">Slate Indigo (Default)</option>
                <option value="emerald">Wealth Emerald</option>
                <option value="rose">Coral Rose</option>
                <option value="amber">Gold Standard</option>
                <option value="zinc">Minimalist Monohrome</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Brand Logo URL</label>
              <input 
                name="logoUrl" 
                type="text" 
                placeholder="https://example.com/logo.png"
                defaultValue={settings?.logoUrl || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Login Background Image URL</label>
              <input 
                name="loginBgUrl" 
                type="text" 
                placeholder="https://images.unsplash.com/photo-1550751827-4bd374c3f58b"
                defaultValue={settings?.loginBgUrl || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
          
          <div className="mt-6">
            <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Custom Domain</label>
            <div className="flex bg-[#1a1a24] border border-white/10 rounded-lg overflow-hidden group focus-within:border-indigo-500 transition-colors">
              <span className="px-4 py-2.5 text-white/40 border-r border-white/10 text-sm flex items-center bg-black/20">https://</span>
              <input 
                name="customDomain" 
                type="text" 
                placeholder="portal.mybank.com"
                defaultValue={settings?.customDomain || ""} 
                className="flex-1 bg-transparent px-4 py-2.5 text-sm text-white focus:outline-none placeholder:text-white/20" 
              />
            </div>
            <p className="text-xs text-white/40 mt-1.5 flex items-center gap-2">Point your CNAME record to <span className="font-mono text-[10px] text-white/60 bg-white/10 px-1 rounded">{window.location.host}</span></p>
          </div>

            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord Client ID</label>
              <input 
                name="discordClientId" 
                type="text" 
                placeholder="For custom domain OAuth overrides"
                defaultValue={settings?.discordClientId || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord Client Secret</label>
              <input 
                name="discordClientSecret" 
                type="password" 
                placeholder="Leave blank to keep unchanged"
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
            </div>

        </div>

        {/* Support & Alerts */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Bell className="text-blue-400" size={20} />
            Alerts & Support
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Support Email / Contact</label>
              <input 
                name="supportEmail" 
                type="text" 
                placeholder="support@mybank.com"
                defaultValue={settings?.supportEmail || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Alerts Discord Webhook URL</label>
              <input 
                name="discordWebhookUrl" 
                type="text" 
                placeholder="https://discord.com/api/webhooks/..."
                defaultValue={settings?.discordWebhookUrl || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
        </div>

        {/* Discord Bot GUI Channels */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Bot className="text-indigo-400" size={20} />
            Interactive Discord Bot Channel GUIs
          </div>
          <p className="text-xs text-white/60 mb-6">
            Spawn fancy button-based interactive interfaces directly in your Discord channels that auto-update live!
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#15151e] p-4 rounded-lg border border-white/5">
              <h4 className="text-sm font-semibold text-white mb-2">Public Citizen GUI Channel</h4>
              <p className="text-xs text-white/50 mb-4">
                The main channel where customers check balance, request loans, and transfer money using buttons.
              </p>
              <div className="flex gap-2">
                <input 
                  id="guiChannelInput"
                  type="text" 
                  placeholder="Discord Channel ID"
                  defaultValue={settings?.guiChannelId || ""} 
                  className="flex-1 bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" 
                />
                <button
                  type="button"
                  onClick={async () => {
                    const chId = (document.getElementById("guiChannelInput") as HTMLInputElement)?.value;
                    if (!chId) return alert("Please enter a Discord Channel ID");
                    try {
                      const res = await fetch(`/api/banks/${bank.id}/spawn-discord-gui`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ channelId: chId, type: "public" })
                      });
                      const data = await res.json();
                      if (res.ok) alert("Public GUI spawned successfully!");
                      else alert(data.error || "Failed to spawn GUI");
                    } catch (e: any) {
                      alert(e.message || "Failed to spawn GUI");
                    }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                >
                  Spawn GUI
                </button>
              </div>
            </div>

            <div className="bg-[#15151e] p-4 rounded-lg border border-white/5">
              <h4 className="text-sm font-semibold text-white mb-2">Staff Only Panel Channel</h4>
              <p className="text-xs text-white/50 mb-4">
                A staff-only channel with buttons for bank tellers to approve loans, inspect users, and manage liquidity.
              </p>
              <div className="flex gap-2">
                <input 
                  id="staffChannelInput"
                  type="text" 
                  placeholder="Discord Channel ID"
                  defaultValue={settings?.staffChannelId || ""} 
                  className="flex-1 bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" 
                />
                <button
                  type="button"
                  onClick={async () => {
                    const chId = (document.getElementById("staffChannelInput") as HTMLInputElement)?.value;
                    if (!chId) return alert("Please enter a Discord Channel ID");
                    try {
                      const res = await fetch(`/api/banks/${bank.id}/spawn-discord-gui`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ channelId: chId, type: "staff" })
                      });
                      const data = await res.json();
                      if (res.ok) alert("Staff Panel spawned successfully!");
                      else alert(data.error || "Failed to spawn Staff Panel");
                    } catch (e: any) {
                      alert(e.message || "Failed to spawn Staff Panel");
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                >
                  Spawn Staff Panel
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/banks/${bank.id}/refresh-discord-gui`, { method: "POST" });
                  if (res.ok) alert("Discord channel embeds refreshed successfully!");
                } catch (e: any) {
                  alert("Failed to refresh: " + e.message);
                }
              }}
              className="bg-white/10 hover:bg-white/20 text-white text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              🔄 Refresh Channel Embeds Live
            </button>
          </div>
        </div>
        
        {/* CityCorp Integrations */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Settings className="text-indigo-400" size={20} />
            Discord Interop & Roles (Optional)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                Verified Customer Role ID
              </label>
              <input 
                name="discordVerifiedRoleId" 
                type="text" 
                placeholder="e.g. 112233445566778899"
                defaultValue={settings?.discordVerifiedRoleId || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">Automatically assigned when a user is KYC approved / verified.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                Active Client Role ID
              </label>
              <input 
                name="discordClientRoleId" 
                type="text" 
                placeholder="e.g. 112233445566778899"
                defaultValue={settings?.discordClientRoleId || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">Assigned when a user successfully opens an account.</p>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                Custom CityCorp OAuth URL (Optional)
              </label>
              <input 
                name="cityCorpAuthUrl" 
                type="text" 
                placeholder="https://dashboard.cityrp.org/authorize?app_id=..."
                defaultValue={settings?.cityCorpAuthUrl || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                If provided, this exact URL will be used for logging in users via CityCorp.
              </p>
            </div>

          </div>
        </div>

        {/* Compliance */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Shield className="text-emerald-400" size={20} />
            Security & KYC
          </div>

          <label className="flex items-center gap-4 cursor-pointer group mb-4">
             <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${settings?.maintenanceMode ? 'bg-amber-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.maintenanceMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
             </div>
             <input type="checkbox" name="maintenanceMode" className="hidden" defaultChecked={settings?.maintenanceMode} onChange={(e) => setSettings({...settings, maintenanceMode: e.target.checked})} />
             <div className="flex flex-col">
               <span className="text-sm group-hover:text-amber-400 transition-colors">Bot Maintenance Mode</span>
               <span className="text-xs text-white/50">Turn off the Discord bot for this bank.</span>
             </div>
          </label>
          <label className="flex items-center gap-4 cursor-pointer group mb-4">
             <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${settings?.requireKyc ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.requireKyc ? 'translate-x-4' : 'translate-x-0'}`}></div>
             </div>
             <input type="checkbox" name="requireKyc" className="hidden" defaultChecked={settings?.requireKyc} onChange={(e) => setSettings({...settings, requireKyc: e.target.checked})} />
             <div className="flex flex-col">
               <span className="text-sm group-hover:text-emerald-400 transition-colors">Require KYC Verification</span>
               <span className="text-xs text-white/50">Requires customer verification before account creation or transactions.</span>
             </div>
          </label>
          <label className="flex items-center gap-4 cursor-pointer group">
             <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${settings?.requirePersonalForBusiness ?? true ? 'bg-indigo-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.requirePersonalForBusiness ?? true ? 'translate-x-4' : 'translate-x-0'}`}></div>
             </div>
             <input type="checkbox" name="requirePersonalForBusiness" className="hidden" defaultChecked={settings?.requirePersonalForBusiness ?? true} onChange={(e) => setSettings({...settings, requirePersonalForBusiness: e.target.checked})} />
             <div className="flex flex-col">
               <span className="text-sm group-hover:text-indigo-400 transition-colors">Require Personal Account Before Business Account</span>
               <span className="text-xs text-white/50">Mandates that citizens must own at least one Personal Checking/Savings account in this bank before registering a Business Account.</span>
             </div>
          </label>
         </div>

        {/* Whitelabel CityCorp Integration */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Layers className="text-amber-400" size={20} />
            Whitelabel CityCorp OAuth Integration
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                CityCorp Application ID
              </label>
              <input 
                name="cityCorpAppId" 
                type="text" 
                placeholder="e.g. 4"
                defaultValue={settings?.cityCorpAppId || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">Your registered application ID on the CityCorp Developer Portal.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                CityCorp App Token (API Key & Secret)
              </label>
              <input 
                name="cityCorpAppSecret" 
                type="password" 
                placeholder="e.g. crp_vance_..."
                defaultValue={settings?.cityCorpAppSecret || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                CityCorp issues a single unified <strong>App Token</strong> (starting with <code className="text-indigo-300">crp_</code>) which functions as both your Bot API Key and your Whitelabel OAuth Secret.
              </p>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                Custom CityCorp OAuth URL (Optional)
              </label>
              <input 
                name="cityCorpAuthUrl" 
                type="text" 
                placeholder="https://dashboard.cityrp.org/authorize?app_id=..."
                defaultValue={settings?.cityCorpAuthUrl || ""} 
                className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                If provided, this exact URL will be used for logging in users via CityCorp.
              </p>
            </div>

          </div>
          
          <div className="mt-8 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
            <h4 className="text-sm font-medium text-indigo-400 mb-2">Required CityCorp OAuth Redirect URI</h4>
            <p className="text-xs text-indigo-300/70 mb-3">
              You must copy the following URL and paste it into the <strong>Redirect URIs</strong> field of your CityCorp application in the Developer Dashboard. Without this exact URL, CityCorp logins will fail with a 404 error.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white/90 overflow-x-auto whitespace-nowrap">
                {`https://${settings?.customDomain || window.location.hostname}/api/auth/citycorp/callback`}
              </code>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(`https://${settings?.customDomain || window.location.hostname}/api/auth/citycorp/callback`);
                  alert("Redirect URI copied to clipboard");
                }}
                className="bg-[#242433] hover:bg-[#2d2d3f] border border-white/10 text-white px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200 leading-relaxed">
            <strong>Configuration Guideline:</strong> Ensure your application's <strong>Redirect URI</strong> in the CityCorp Developer Portal is configured precisely to:<br />
            <code className="text-white bg-black/40 px-1.5 py-0.5 rounded select-all font-mono">
              {window.location.origin}/api/portal/{bank?.id}/oauth/callback
            </code>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Layers className="text-pink-400" size={20} />
            Enabled Modules
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableLoans ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableLoans ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableLoans" className="hidden" defaultChecked={settings?.enableLoans} onChange={(e) => setSettings({...settings, enableLoans: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Loan Center</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableVaults ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableVaults ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableVaults" className="hidden" defaultChecked={settings?.enableVaults} onChange={(e) => setSettings({...settings, enableVaults: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Savings Vaults</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableCards ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableCards ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableCards" className="hidden" defaultChecked={settings?.enableCards} onChange={(e) => setSettings({...settings, enableCards: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Debit/Credit Cards</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enablePayroll ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enablePayroll ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enablePayroll" className="hidden" defaultChecked={settings?.enablePayroll} onChange={(e) => setSettings({...settings, enablePayroll: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Corporate Payroll</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableSubscriptions ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableSubscriptions ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableSubscriptions" className="hidden" defaultChecked={settings?.enableSubscriptions} onChange={(e) => setSettings({...settings, enableSubscriptions: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Subscriptions</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableEscrow ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableEscrow ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableEscrow" className="hidden" defaultChecked={settings?.enableEscrow} onChange={(e) => setSettings({...settings, enableEscrow: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Escrow Services</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableTreasury ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableTreasury ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableTreasury" className="hidden" defaultChecked={settings?.enableTreasury} onChange={(e) => setSettings({...settings, enableTreasury: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Treasury Analytics</span>
            </label>
          </div>

          {(settings?.enableLoans || settings?.enableCards) && (
            <>
              <div className="flex items-center gap-2 text-md font-semibold mb-6 pt-6 border-t border-white/10 text-white/80">
                Loan & Credit Auto-Approval
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-4">
                     <label className="flex items-center gap-4 cursor-pointer group">
                        <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.autoApproveLoans ? 'bg-indigo-500' : 'bg-white/10'}`}>
                           <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.autoApproveLoans ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <input type="checkbox" name="autoApproveLoans" className="hidden" defaultChecked={settings?.autoApproveLoans} onChange={(e) => setSettings({...settings, autoApproveLoans: e.target.checked})} />
                        <span className="text-sm text-white/80 group-hover:text-indigo-400 transition-colors">Auto-Approve Loans</span>
                     </label>
                     <label className="flex items-center gap-4 cursor-pointer group">
                        <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.autoApproveCreditCards ? 'bg-indigo-500' : 'bg-white/10'}`}>
                           <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.autoApproveCreditCards ? 'translate-x-4' : 'translate-x-0'}`}></div>
                        </div>
                        <input type="checkbox" name="autoApproveCreditCards" className="hidden" defaultChecked={settings?.autoApproveCreditCards} onChange={(e) => setSettings({...settings, autoApproveCreditCards: e.target.checked})} />
                        <span className="text-sm text-white/80 group-hover:text-indigo-400 transition-colors">Auto-Approve Credit Cards</span>
                     </label>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Max Auto-Approve Amount (Safe Limit)</label>
                    <input 
                      name="maxAutoApproveLoanAmount" 
                      type="number" 
                      defaultValue={settings?.maxAutoApproveLoanAmount || 1000000} 
                      className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                    />
                    <p className="text-xs text-white/40 mt-1.5">For credit limits, the parameter uses HALF this value.</p>
                  </div>
              </div>
            </>
          )}
        </div>


          <div className="mt-8 bg-[#5865F2]/10 border border-[#5865F2]/20 rounded-xl p-4">
            <h4 className="text-sm font-medium text-[#5865F2] mb-2">Required Discord OAuth Redirect URI</h4>
            <p className="text-xs text-[#5865F2]/70 mb-3">
              If using a Custom Domain with your own Discord Application, you must add this URL to the <strong>Redirects</strong> list in the Discord Developer Portal.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-xs text-white/90 overflow-x-auto whitespace-nowrap">
                  {`https://${settings?.customDomain || window.location.hostname}/api/auth/discord/callback`}
                </code>
              </div>

            </div>
          </div>

        <div className="flex justify-end pt-4 pb-12">
          <button 
            type="submit" 
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
