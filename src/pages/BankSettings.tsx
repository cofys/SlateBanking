import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Building2, AlertTriangle, Save, Loader2, Paintbrush, Bell, Shield, Wallet, Settings, Layers, Bot, Search, Landmark, Percent, Copy, Check, User } from "lucide-react";
import { SchemeSwatches } from "../components/ui/chrome";
import { SCHEME_HEX, accentForeground, type ColorSchemeId } from "../lib/theme";

export function BankSettings() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vaultTiers, setVaultTiers] = useState<any[]>([]);
  const [schemeId, setSchemeId] = useState<ColorSchemeId>("slate");
  const [brandHex, setBrandHex] = useState("#8b95a5");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [personalPrefix, setPersonalPrefix] = useState("ACC-");
  const [businessPrefix, setBusinessPrefix] = useState("CORP-");
  const [personalNamingMode, setPersonalNamingMode] = useState("custom");
  const [businessNamingMode, setBusinessNamingMode] = useState("business_name");
  const [maxPersonalAccounts, setMaxPersonalAccounts] = useState<string>("");
  const [maxBusinessAccounts, setMaxBusinessAccounts] = useState<string>("");
  const [maxTotalAccounts, setMaxTotalAccounts] = useState<string>("");

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const isDefaultDummyVaultTiers = (tiers: any[]): boolean => {
    if (!Array.isArray(tiers) || tiers.length !== 5) return false;
    const dummyDays = [7, 30, 90, 180, 365];
    const dummyRates = [100, 300, 500, 800, 1200];
    return tiers.every((t, i) => Number(t.lockDays) === dummyDays[i] && Number(t.interestRate) === dummyRates[i] && Number(t.penaltyPercent) === 20);
  };

  useEffect(() => {
    if (bank?.id) {
      setLoading(true);
      fetch(`/api/banks/${bank.id}/settings`)
        .then(r => r.json())
        .then(data => {
          setSettings(data);
          if (Array.isArray(data.vaultTiers) && !isDefaultDummyVaultTiers(data.vaultTiers)) {
            setVaultTiers(data.vaultTiers);
          } else {
            setVaultTiers([]);
          }
          setSchemeId((data.colorScheme as ColorSchemeId) || "slate");
          setBrandHex(data.brandingColor || SCHEME_HEX[data.colorScheme] || "#8b95a5");
          setPersonalPrefix(data.personalAccountPrefix ?? "ACC-");
          setBusinessPrefix(data.businessAccountPrefix ?? "CORP-");
          setPersonalNamingMode(data.personalAccountNamingMode ?? "custom");
          setBusinessNamingMode(data.businessAccountNamingMode ?? "business_name");
          setMaxPersonalAccounts(data.maxPersonalAccountsPerUser != null ? String(data.maxPersonalAccountsPerUser) : "");
          setMaxBusinessAccounts(data.maxBusinessAccountsPerUser != null ? String(data.maxBusinessAccountsPerUser) : "");
          setMaxTotalAccounts(data.maxTotalAccountsPerUser != null ? String(data.maxTotalAccountsPerUser) : "");
          setLoading(false);
        });
    }
  }, [bank]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const newSettings = {
      personalAccountPrefix: (formData.get("personalAccountPrefix") as string) || "ACC-",
      businessAccountPrefix: (formData.get("businessAccountPrefix") as string) || "CORP-",
      personalAccountNamingMode: (formData.get("personalAccountNamingMode") as string) || "custom",
      businessAccountNamingMode: (formData.get("businessAccountNamingMode") as string) || "business_name",
      maxPersonalAccountsPerUser: formData.get("maxPersonalAccountsPerUser") && !isNaN(parseInt(formData.get("maxPersonalAccountsPerUser") as string, 10)) ? parseInt(formData.get("maxPersonalAccountsPerUser") as string, 10) : null,
      maxBusinessAccountsPerUser: formData.get("maxBusinessAccountsPerUser") && !isNaN(parseInt(formData.get("maxBusinessAccountsPerUser") as string, 10)) ? parseInt(formData.get("maxBusinessAccountsPerUser") as string, 10) : null,
      maxTotalAccountsPerUser: formData.get("maxTotalAccountsPerUser") && !isNaN(parseInt(formData.get("maxTotalAccountsPerUser") as string, 10)) ? parseInt(formData.get("maxTotalAccountsPerUser") as string, 10) : null,
      withdrawFeePercent: parseFloat(formData.get("withdrawFeePercent") as string) || 0,
      depositFeePercent: parseFloat(formData.get("depositFeePercent") as string) || 0,
      transferFeePercent: parseFloat(formData.get("transferFeePercent") as string) || 0,
      governmentFeePercent: formData.get("governmentFeePercent") !== null && !isNaN(parseFloat(formData.get("governmentFeePercent") as string))
        ? parseFloat(formData.get("governmentFeePercent") as string)
        : 0.25,
      overwriteCustomAccountFees: formData.get("overwriteCustomAccountFees") === "on",
      savingsApyPercent: Math.round(parseFloat(formData.get("savingsApyPercent") as string) * 100) || 300,
      interBankWireThreshold: Math.floor(parseFloat(formData.get("interBankWireThreshold") as string) * 100) || 5000000,
      colorScheme: formData.get("colorScheme"),
      brandingColor: formData.get("brandingColor"),
      tagline: formData.get("tagline"),
      logoUrl: formData.get("logoUrl"),
      loginBgUrl: formData.get("loginBgUrl"),
      supportEmail: formData.get("supportEmail"),
      discordWebhookUrl: formData.get("discordWebhookUrl"),
      discordVerifiedRoleId: formData.get("discordVerifiedRoleId"),
      discordClientRoleId: formData.get("discordClientRoleId"),
      requireKyc: formData.get("requireKyc") === "on",
      requirePersonalForBusiness: formData.get("requirePersonalForBusiness") === "on",
      enableLoans: !!settings?.enableLoans,
      enableVaults: !!settings?.enableVaults,
      enableCards: !!settings?.enableCards,
      enablePayroll: !!settings?.enablePayroll,
      enableSubscriptions: !!settings?.enableSubscriptions,
      enableEscrow: !!settings?.enableEscrow,
      enableTreasury: !!settings?.enableTreasury,
      enableAccountTiers: !!settings?.enableAccountTiers,
      enableGoogleDocsContracts: formData.get("enableGoogleDocsContracts") === "on",
      googleDocsLoanTemplateUrl: formData.get("googleDocsLoanTemplateUrl"),
      googleDocsCreditTemplateUrl: formData.get("googleDocsCreditTemplateUrl"),
      googleDocsEscrowTemplateUrl: formData.get("googleDocsEscrowTemplateUrl"),
      googleDocsFolderUrl: formData.get("googleDocsFolderUrl"),
      googleDocsAutoGenerate: formData.get("googleDocsAutoGenerate") === "on",
      vaultTiers: vaultTiers,
      autoApproveLoans: formData.get("autoApproveLoans") === "on",
      autoApproveCreditCards: formData.get("autoApproveCreditCards") === "on",
      maxAutoApproveLoanAmount: Math.round((parseFloat(formData.get("maxAutoApproveLoanAmount") as string) || 10000) * 100),
      customDomain: formData.get("customDomain"),
      discordClientId: formData.get("discordClientId"),
      discordClientSecret: formData.get("discordClientSecret"),
      cityCorpAppId: formData.get("cityCorpAppId"),
      cityCorpAppSecret: formData.get("cityCorpAppSecret"),
      cityCorpAuthUrl: formData.get("cityCorpAuthUrl"),
      defaultCorpAccount: formData.get("defaultCorpAccount"),
      loanPoolAccount: formData.get("loanPoolAccount"),
      feeCollectionAccount: formData.get("feeCollectionAccount"),
      interestPoolAccount: formData.get("interestPoolAccount"),
      settlementAccount: formData.get("settlementAccount") || "SETTLEMENT",
      settlementFloorCents: Math.round((parseFloat(formData.get("settlementFloor") as string) || 0) * 100),
      settlementWarnCents: Math.round((parseFloat(formData.get("settlementWarn") as string) || 0) * 100),
      defaultFeePayerMode: formData.get("defaultFeePayerMode") || "from_payment",
      defaultLoanApr: Math.round((parseFloat(formData.get("defaultLoanApr") as string) || 5) * 100),
      defaultLoanTermMonths: parseInt(formData.get("defaultLoanTermMonths") as string, 10) || 12,
      maxLoanAmountCents: Math.round((parseFloat(formData.get("maxLoanAmount") as string) || 0) * 100),
      loanPaymentPeriodDays: parseInt(formData.get("loanPaymentPeriodDays") as string, 10) || 30,
      loanAutoDebitEnabled: formData.get("loanAutoDebitEnabled") === "on",
      loanLateFeeFlatCents: Math.round((parseFloat(formData.get("loanLateFeeFlat") as string) || 25) * 100),
      loanLateFeePercent: Math.round((parseFloat(formData.get("loanLateFeePercent") as string) || 5) * 100),
      loanMissesToDefault: parseInt(formData.get("loanMissesToDefault") as string, 10) || 3,
      loanGracePeriodDays: parseInt(formData.get("loanGracePeriodDays") as string, 10) || 0,
      loanRetryDays: parseInt(formData.get("loanRetryDays") as string, 10) || 7,
      loanAccrueInterest: formData.get("loanAccrueInterest") === "on",
      loanInterestAccrual: formData.get("loanInterestAccrual") || "daily",
      loanAccrueOnDefaulted: formData.get("loanAccrueOnDefaulted") === "on",
      loanCompoundLateFees: formData.get("loanCompoundLateFees") === "on",
      loanMinInstallmentCents: Math.round((parseFloat(formData.get("loanMinInstallment") as string) || 1) * 100),
      loanRequireSignature: formData.get("loanRequireSignature") === "on",
      loanAllowCitizenApply: formData.get("loanAllowCitizenApply") === "on",
      loanCureDefaultOnPay: formData.get("loanCureDefaultOnPay") === "on",
      loanDaysInYear: parseInt(formData.get("loanDaysInYear") as string, 10) === 360 ? 360 : 365,
      discordWelcome: formData.get("discordWelcome"),
      discordFooter: formData.get("discordFooter"),
      discordBotActivity: formData.get("discordBotActivity"),
      discordShowStats: formData.get("discordShowStats") === "on",
      discordShowDeposits: formData.get("discordShowDeposits") === "on",
      discordShowAccounts: formData.get("discordShowAccounts") === "on",
      discordGuiStyle: (formData.get("discordGuiStyle") as string) || "executive",
      metaTitle: formData.get("metaTitle"),
      metaDescription: formData.get("metaDescription"),
      metaOgImage: formData.get("metaOgImage"),
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Configuration Settings</h2>
          <p className="text-white/60 text-sm mt-1">Manage platform behavior, branding, and rules.</p>
        </div>
        <button 
          type="button" 
          onClick={() => {
            const link = document.createElement("a");
            link.href = `/api/banks/${bank.id}/snapshot`;
            link.target = "_blank";
            link.download = `snapshot_${bank.name}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          className="bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <Settings size={16} />
          Download Data Snapshot
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Fees & Rates */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Wallet className="text-indigo-400" size={20} />
            Fees & Risk Management
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Deposit Fee (%)</label>
              <input 
                name="depositFeePercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.depositFeePercent ? (Number(settings.depositFeePercent) > 100 ? Number(settings.depositFeePercent) / 100 : Number(settings.depositFeePercent)) : 0} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Withdraw Fee (%)</label>
              <input 
                name="withdrawFeePercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.withdrawFeePercent ? (Number(settings.withdrawFeePercent) > 100 ? Number(settings.withdrawFeePercent) / 100 : Number(settings.withdrawFeePercent)) : 0} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Transfer Fee (%)</label>
              <input 
                name="transferFeePercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.transferFeePercent ? (Number(settings.transferFeePercent) > 100 ? Number(settings.transferFeePercent) / 100 : Number(settings.transferFeePercent)) : 0} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-white/50 uppercase tracking-wide">Government Fee (%)</label>
                <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono border border-amber-500/20">Civic Fee</span>
              </div>
              <input 
                name="governmentFeePercent" 
                type="number" 
                step="0.01"
                min="0"
                defaultValue={settings?.governmentFeePercent != null ? (Number(settings.governmentFeePercent) >= 20 ? Number(settings.governmentFeePercent) / 100 : Number(settings.governmentFeePercent)) : 0.25} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
              <p className="text-[11px] text-white/40 mt-1">Separate civic levy applied & shown on all quotes</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Savings APY Yield (%)</label>
              <input 
                name="savingsApyPercent" 
                type="number" 
                step="0.01"
                defaultValue={settings?.savingsApyPercent ? (settings.savingsApyPercent / 100) : 3.0} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide" title="If an incoming Onyx Clearinghouse transfer is greater than this amount, it requires your Bank Staff to manually accept a wire transfer instead of automatically updating balances.">Inbound Wire Threshold ($)</label>
              <input 
                name="interBankWireThreshold" 
                type="number" 
                step="1"
                defaultValue={settings?.interBankWireThreshold ? Math.floor(settings.interBankWireThreshold / 100) : 50000} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-3">
            <input 
              type="checkbox" 
              id="overwriteCustomAccountFees"
              name="overwriteCustomAccountFees"
              className="w-4 h-4 rounded bg-[var(--bg-subtle)] border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="overwriteCustomAccountFees" className="text-xs sm:text-sm text-white/80 font-medium cursor-pointer">
              Apply these fee rates to accounts with custom fee overrides (overwrite existing custom account fees)
            </label>
          </div>
          <p className="text-xs text-white/40 mt-3">Fees are automatically deducted during transactions. Leave unchecked to preserve custom fee overrides set on individual customer accounts.</p>
        </div>

        {/* Account Identifier & Prefix Rules */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Wallet style={{ color: "var(--accent)" }} size={20} />
            Account Identifiers & Naming Conventions
          </div>
          <p className="text-xs text-white/60 mb-6">
            Customize how account numbers and display names are automatically structured when citizens open personal and corporate accounts.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Accounts */}
            <div className="bg-black/20 border border-white/5 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <User size={16} className="text-indigo-400" /> Personal Accounts
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  Preview: {personalPrefix || "ACC-"}{personalNamingMode === "discord_username" ? "DiscordUser" : "my-savings"}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                  Account Prefix
                </label>
                <input
                  name="personalAccountPrefix"
                  type="text"
                  value={personalPrefix}
                  onChange={(e) => setPersonalPrefix(e.target.value)}
                  placeholder="ACC-"
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-white/40 mt-1">Default prefix attached to personal accounts (e.g. ACC-, SLATE-, USR-)</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                  Naming Policy
                </label>
                <select
                  name="personalAccountNamingMode"
                  value={personalNamingMode}
                  onChange={(e) => setPersonalNamingMode(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="custom">Customer Chooses Name ({personalPrefix}custom_name)</option>
                  <option value="discord_username">Automatic Discord Username ({personalPrefix}username)</option>
                  <option value="choice_or_username">Allow Citizen Choice (Custom or Username)</option>
                </select>
                <p className="text-[11px] text-white/40 mt-1">
                  Controls whether client picks their own account tag or if it locks to their authenticated Discord username.
                </p>
              </div>
            </div>

            {/* Business Accounts */}
            <div className="bg-black/20 border border-white/5 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 size={16} className="text-emerald-400" /> Business / Corporate Accounts
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  Preview: {businessPrefix || "CORP-"}{businessNamingMode === "discord_plus_business" ? "DiscordUser-AcmeCorp" : "AcmeCorp"}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                  Business Prefix
                </label>
                <input
                  name="businessAccountPrefix"
                  type="text"
                  value={businessPrefix}
                  onChange={(e) => setBusinessPrefix(e.target.value)}
                  placeholder="CORP-"
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-white/40 mt-1">Default prefix attached to corporate accounts (e.g. CORP-, BIZ-, ENT-)</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                  Business Naming Policy
                </label>
                <select
                  name="businessAccountNamingMode"
                  value={businessNamingMode}
                  onChange={(e) => setBusinessNamingMode(e.target.value)}
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="business_name">Registered Business Entity Name ({businessPrefix}Company)</option>
                  <option value="discord_plus_business">Discord Owner + Business Name ({businessPrefix}Owner-Company)</option>
                </select>
                <p className="text-[11px] text-white/40 mt-1">
                  Select how enterprise accounts format their institutional entity name.
                </p>
              </div>

              {/* Citizen Account Holding Limits (Bank-Wide) */}
              <div className="md:col-span-2 pt-4 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="text-amber-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Citizen Account Holding Caps</span>
                  </div>
                  <span className="text-[11px] text-white/40">Global ceiling across all account tiers (blank or 0 = unlimited)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1">Max Personal Accounts</label>
                    <input
                      name="maxPersonalAccountsPerUser"
                      type="number"
                      min="1"
                      value={maxPersonalAccounts}
                      onChange={(e) => setMaxPersonalAccounts(e.target.value)}
                      placeholder="Unlimited (e.g. 2)"
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Max personal accounts a citizen can register.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1">Max Business Accounts</label>
                    <input
                      name="maxBusinessAccountsPerUser"
                      type="number"
                      min="1"
                      value={maxBusinessAccounts}
                      onChange={(e) => setMaxBusinessAccounts(e.target.value)}
                      placeholder="Unlimited (e.g. 5)"
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Max business accounts a customer can hold.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1">Max Total Combined</label>
                    <input
                      name="maxTotalAccountsPerUser"
                      type="number"
                      min="1"
                      value={maxTotalAccounts}
                      onChange={(e) => setMaxTotalAccounts(e.target.value)}
                      placeholder="Unlimited (e.g. 6)"
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Absolute ceiling of active accounts per client.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Branding & Visuals */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Paintbrush style={{ color: "var(--accent)" }} size={20} />
            Brand Identity
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-white/50 mb-3 uppercase tracking-wide">Color scheme</label>
              <SchemeSwatches
                value={schemeId}
                onChange={(id, hex) => {
                  setSchemeId(id);
                  setBrandHex(hex);
                }}
              />
              <p className="text-xs text-white/40 mt-3">Applies to staff chrome, the client portal, Discord embeds, and action buttons.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Custom accent</label>
              <div className="flex items-center gap-3 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2">
                <input
                  name="brandingColor"
                  type="color"
                  value={brandHex}
                  onChange={(e) => setBrandHex(e.target.value)}
                  className="h-8 w-10 rounded border-0 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={brandHex}
                  onChange={(e) => {
                    const hex = e.target.value;
                    if (/^#[0-9a-fA-F]{0,6}$/.test(hex)) setBrandHex(hex);
                  }}
                  placeholder="#8b95a5"
                  className="flex-1 bg-transparent text-sm text-white font-mono focus:outline-none"
                />
              </div>
              <p className="text-xs text-white/40 mt-1.5">Optional override. Picking a scheme above fills this for you.</p>
              <div
                className="mt-3 h-11 rounded-lg flex items-center justify-center text-xs font-semibold tracking-wide"
                style={{ background: brandHex, color: accentForeground(brandHex) }}
              >
                Live preview
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Tagline</label>
              <input
                name="tagline"
                type="text"
                maxLength={120}
                placeholder="The bank of the city."
                defaultValue={settings?.tagline || ""}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <p className="text-xs text-white/40 mt-1.5">Shown on the citizen portal header and Discord panels.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Brand Logo URL</label>
              <input 
                name="logoUrl" 
                type="text" 
                placeholder="https://example.com/logo.png"
                defaultValue={settings?.logoUrl || bank?.logoUrl || ""} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
              {(settings?.logoUrl || bank?.logoUrl) && (
                <img src={settings?.logoUrl || bank?.logoUrl} alt="logo preview" referrerPolicy="no-referrer" className="mt-2 h-12 w-12 rounded-lg object-contain bg-black/40 border border-white/10" />
              )}
              <p className="text-xs text-white/40 mt-1.5">HTTPS image URL. Saving an empty field will not wipe a logo already on the bank.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Login Background Image URL</label>
              <input 
                name="loginBgUrl" 
                type="text" 
                placeholder="https://images.unsplash.com/photo-1550751827-4bd374c3f58b"
                defaultValue={settings?.loginBgUrl || ""} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
          
          <div className="mt-6 border-t border-white/10 pt-6">
            <h4 className="text-sm font-semibold text-white mb-1">Search & Social Embed Metadata</h4>
            <p className="text-xs text-white/50 mb-4">Customize how your bank displays when shared on Discord, Twitter, Google, and client portals.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Meta Title</label>
                <input 
                  name="metaTitle" 
                  type="text" 
                  placeholder={`${bank?.name || "Bank"} | Private Institutional Banking`}
                  defaultValue={settings?.metaTitle || ""} 
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Social Banner Image URL</label>
                <input 
                  name="metaOgImage" 
                  type="text" 
                  placeholder="https://example.com/banner.png"
                  defaultValue={settings?.metaOgImage || ""} 
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Meta Description</label>
                <textarea 
                  name="metaDescription" 
                  rows={2}
                  placeholder={`Institutional banking, real-time clearinghouse fund settlement, and asset management for ${bank?.name || "your bank"}.`}
                  defaultValue={settings?.metaDescription || ""} 
                  className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                />
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Custom Domain</label>
            <div className="flex bg-[var(--bg-subtle)] border border-white/10 rounded-lg overflow-hidden group focus-within:border-indigo-500 transition-colors">
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
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord app ID (bot linking only)</label>
              <input 
                name="discordClientId" 
                type="text" 
                placeholder="Not a login method — used so customers can attach Discord to an existing CityCorp session"
                defaultValue={settings?.discordClientId || ""} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Discord app secret (bot linking only)</label>
              <input 
                name="discordClientSecret" 
                type="password" 
                placeholder="Leave blank to keep unchanged"
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
            </div>

            <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* CityCorp Login Callback */}
              <div className="bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
                      CityCorp Sign-In Callback
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                      Primary Login
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
                    Add to your <strong>CityCorp Developer Dashboard</strong> under Redirect URIs. All customers and staff authenticate through CityCorp.
                  </p>
                </div>
                <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-white/10 flex items-center justify-between gap-2">
                  <code className="text-xs select-all break-all font-mono" style={{ color: "var(--ok)" }}>
                    {`https://${settings?.customDomain?.trim() || window.location.host}/api/auth/citycorp/callback`}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`https://${settings?.customDomain?.trim() || window.location.host}/api/auth/citycorp/callback`, 'citycorp')}
                    className="shrink-0 p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedField === 'citycorp' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Discord Bot Linking Callback */}
              <div className="bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--fg-muted)" }}>
                      Discord Bot Linking Callback
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                      Bot & Slash Commands
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--fg-subtle)" }}>
                    Add to <strong>Discord Developer Portal &rarr; OAuth2 &rarr; Redirects</strong>. Used when logged-in customers connect Discord to enable bot commands.
                  </p>
                </div>
                <div className="bg-[var(--bg)] p-2.5 rounded-lg border border-white/10 flex items-center justify-between gap-2">
                  <code className="text-xs select-all break-all font-mono text-indigo-300">
                    {`https://${settings?.customDomain?.trim() || window.location.host}/api/auth/discord/callback`}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`https://${settings?.customDomain?.trim() || window.location.host}/api/auth/discord/callback`, 'discord')}
                    className="shrink-0 p-1.5 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                    title="Copy to clipboard"
                  >
                    {copiedField === 'discord' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

        </div>

        {/* Support & Alerts */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Alerts Discord Webhook URL</label>
              <input 
                name="discordWebhookUrl" 
                type="text" 
                placeholder="https://discord.com/api/webhooks/..."
                defaultValue={settings?.discordWebhookUrl || ""} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
              />
            </div>
          </div>
        </div>

        {/* Discord Bot GUI Channels */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Bot className="text-indigo-400" size={20} />
            Discord
          </div>
          <p className="text-xs text-white/60 mb-6">
            Customers only need <code className="text-white/80 bg-white/10 px-1 rounded">/bank</code>. Channel panels live in Discord and refresh on their own — spawn them here, not with extra slash commands.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Welcome copy</label>
              <textarea
                name="discordWelcome"
                rows={3}
                maxLength={500}
                placeholder="Welcome to the bank. Open your dashboard, send a transfer, or visit the web portal."
                defaultValue={settings?.discordWelcome || ""}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors resize-y min-h-[80px]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Embed footer</label>
              <input
                name="discordFooter"
                type="text"
                maxLength={80}
                placeholder={`${bank?.name || "Your bank"} • Powered by - Slate Banking Platform`}
                defaultValue={settings?.discordFooter || ""}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Bot status text</label>
              <input
                name="discordBotActivity"
                type="text"
                maxLength={80}
                placeholder={`/bank · ${bank?.name || "Bank"}`}
                defaultValue={settings?.discordBotActivity || ""}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <p className="text-xs text-white/40 mt-1.5">What the bot shows as its Discord presence when the bank is open.</p>
            </div>
          </div>
          <div className="mb-6 bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-4">
            <label className="block text-xs font-semibold text-white/70 mb-2 uppercase tracking-wide">Discord Terminal Visual Style</label>
            <p className="text-xs text-white/50 mb-3">Choose the aesthetic and embed layout for your bank's public and staff Discord panels.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'executive', name: 'Executive', desc: 'Institutional boxes, high-contrast typography, formal clearinghouse styling.' },
                { id: 'cyber', name: 'Cyber Telemetry', desc: 'ANSI colored terminal console blocks, live fiscal telemetry, tech aesthetics.' },
                { id: 'minimal', name: 'Minimalist', desc: 'Sleek bullet rows, compact metrics, distilled essential banking data.' }
              ].map(st => {
                const currentStyle = settings?.discordGuiStyle || 'executive';
                const isSelected = currentStyle === st.id;
                return (
                  <label 
                    key={st.id} 
                    className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-500/10 text-white shadow-sm' 
                        : 'border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="discordGuiStyle" 
                      value={st.id} 
                      checked={isSelected}
                      onChange={() => setSettings({ ...settings, discordGuiStyle: st.id })}
                      className="hidden" 
                    />
                    <span className="text-xs font-bold text-white flex items-center justify-between">
                      {st.name}
                      {isSelected && <span className="text-indigo-400 text-[10px] font-mono">SELECTED</span>}
                    </span>
                    <span className="text-[11px] text-white/50 mt-1 leading-snug">{st.desc}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Master & Granular Stat Toggles */}
          <div className="mb-6 space-y-4 bg-[var(--bg-subtle)] border border-white/10 rounded-xl p-4">
            <label className="flex items-center gap-4 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.discordShowStats !== false ? 'bg-indigo-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.discordShowStats !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input
                type="checkbox"
                name="discordShowStats"
                className="hidden"
                checked={settings?.discordShowStats !== false}
                onChange={(e) => setSettings({ ...settings, discordShowStats: e.target.checked })}
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">Display Live Financial Statistics</span>
                <span className="text-xs text-white/50">Master switch for displaying public metrics on your Discord lobby terminal.</span>
              </div>
            </label>

            {settings?.discordShowStats !== false && (
              <div className="pl-14 pt-2 border-t border-white/5 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="discordShowDeposits"
                    checked={settings?.discordShowDeposits !== false}
                    onChange={(e) => setSettings({ ...settings, discordShowDeposits: e.target.checked })}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-white group-hover:text-indigo-300 transition-colors">Show Total Custodial Deposits</span>
                    <span className="text-[11px] text-white/40">Displays total money deposited across all non-system bank accounts.</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    name="discordShowAccounts"
                    checked={settings?.discordShowAccounts !== false}
                    onChange={(e) => setSettings({ ...settings, discordShowAccounts: e.target.checked })}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-white group-hover:text-indigo-300 transition-colors">Show Total Active Member Ledgers</span>
                    <span className="text-[11px] text-white/40">Displays the count of registered active member bank accounts.</span>
                  </div>
                </label>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#15151e] p-4 rounded-lg border border-white/5">
              <h4 className="text-sm font-semibold text-white mb-2">Public lobby</h4>
              <p className="text-xs text-white/50 mb-4">
                Auto-updating panel in a customer channel. Dashboard, transfer, rates, and the web portal — no extra slash commands.
              </p>
              <div className="flex gap-2">
                <input 
                  id="guiChannelInput"
                  type="text" 
                  placeholder="Discord Channel ID"
                  defaultValue={settings?.guiChannelId || ""} 
                  className="flex-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" 
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
              <h4 className="text-sm font-semibold text-white mb-2">Staff desk</h4>
              <p className="text-xs text-white/50 mb-4">
                Auto-updating teller panel: vault, loan queue, customer lookup, and cash window.
              </p>
              <div className="flex gap-2">
                <input 
                  id="staffChannelInput"
                  type="text" 
                  placeholder="Discord Channel ID"
                  defaultValue={settings?.staffChannelId || ""} 
                  className="flex-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" 
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
              🔄 Refresh panels now
            </button>
          </div>
        </div>
        
        {/* CityCorp Integrations */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                If provided, this exact URL will be used for logging in users via CityCorp.
              </p>
            </div>

          </div>
        </div>

        {/* Compliance */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
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
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
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
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                If provided, this exact URL will be used for logging in users via CityCorp.
              </p>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide flex items-center gap-2">
                Default Corp Account Name (CityCorp Plugin)
              </label>
              <input 
                name="defaultCorpAccount" 
                type="text" 
                placeholder="e.g. Main"
                defaultValue={settings?.defaultCorpAccount || ""} 
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-white/20" 
              />
              <p className="text-xs text-white/40 mt-1.5">
                The bank's default named operating subaccount. Used as the loan disbursement source when Loan Pool is empty. This is not corp treasury.
              </p>
            </div>

          </div>
          
          <div className="mt-8 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4">
            <h4 className="text-sm font-medium text-indigo-400 mb-2">Required CityCorp OAuth Redirect URI</h4>
            <p className="text-xs text-indigo-300/70 mb-3">
              You must copy the following URL and paste it into the <strong>Redirect URIs</strong> field of your CityCorp application in the Developer Dashboard. Without this exact URL, CityCorp logins will fail with a 404 error.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white/90 overflow-x-auto whitespace-nowrap">
                {(() => {
                  const hostDomain = (settings?.customDomain || window.location.hostname).replace(/^https?:\/\//, '');
                  return `https://${hostDomain}/api/auth/citycorp/callback`;
                })()}
              </code>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  const hostDomain = (settings?.customDomain || window.location.hostname).replace(/^https?:\/\//, '');
                  navigator.clipboard.writeText(`https://${hostDomain}/api/auth/citycorp/callback`);
                  alert("Redirect URI copied to clipboard");
                }}
                className="bg-[#242433] hover:bg-[#2d2d3f] border border-white/10 text-white px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200 leading-relaxed">
            <strong>Configuration Guideline:</strong> Add the redirect URI above (<code className="text-white bg-black/40 px-1.5 py-0.5 rounded select-all font-mono">https://{settings?.customDomain?.trim() || window.location.host}/api/auth/citycorp/callback</code>) to your CityCorp application in the Developer Dashboard.
          </div>
        </div>

        {/* Google Docs Contract Integration */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Settings className="text-emerald-400" size={20} />
              Google Docs Contract Automation
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-xs text-white/60">Enable Contracts</span>
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableGoogleDocsContracts ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableGoogleDocsContracts ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input 
                type="checkbox" 
                name="enableGoogleDocsContracts" 
                className="hidden" 
                defaultChecked={settings?.enableGoogleDocsContracts} 
                onChange={(e) => setSettings({...settings, enableGoogleDocsContracts: e.target.checked})} 
              />
            </label>
          </div>

          <p className="text-xs text-white/60 mb-6 leading-relaxed">
            Attach official Google Docs loan agreements, credit contracts, and escrow terms to financial origination workflows. Banks are not required to use this, but when enabled, staff and borrowers can access contract links directly.
          </p>

          {settings?.enableGoogleDocsContracts && (
            <div className="space-y-6 pt-4 border-t border-white/10 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Loan Contract Template URL</label>
                  <input 
                    name="googleDocsLoanTemplateUrl" 
                    type="url" 
                    placeholder="https://docs.google.com/document/d/YOUR_DOC_ID/edit"
                    defaultValue={settings?.googleDocsLoanTemplateUrl || ""} 
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-white/20" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Credit Line Contract Template URL</label>
                  <input 
                    name="googleDocsCreditTemplateUrl" 
                    type="url" 
                    placeholder="https://docs.google.com/document/d/YOUR_CREDIT_DOC_ID/edit"
                    defaultValue={settings?.googleDocsCreditTemplateUrl || ""} 
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-white/20" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Escrow Contract Template URL</label>
                  <input 
                    name="googleDocsEscrowTemplateUrl" 
                    type="url" 
                    placeholder="https://docs.google.com/document/d/YOUR_ESCROW_DOC_ID/edit"
                    defaultValue={settings?.googleDocsEscrowTemplateUrl || ""} 
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-white/20" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Shared Contracts Drive Folder URL</label>
                  <input 
                    name="googleDocsFolderUrl" 
                    type="url" 
                    placeholder="https://drive.google.com/drive/folders/YOUR_FOLDER_ID"
                    defaultValue={settings?.googleDocsFolderUrl || ""} 
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-white/20" 
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 bg-[var(--bg-subtle)] p-4 rounded-xl border border-white/5">
                <div>
                  <div className="text-sm font-medium text-white/90">Auto-Generate Contract Links</div>
                  <div className="text-xs text-white/50">Automatically inject contract links into loan, credit, and escrow originations.</div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.googleDocsAutoGenerate ? 'bg-emerald-500' : 'bg-white/10'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.googleDocsAutoGenerate ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </div>
                  <input 
                    type="checkbox" 
                    name="googleDocsAutoGenerate" 
                    className="hidden" 
                    defaultChecked={settings?.googleDocsAutoGenerate} 
                    onChange={(e) => setSettings({...settings, googleDocsAutoGenerate: e.target.checked})} 
                  />
                </label>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300">
                <strong>Supported Dynamic Contract Tags:</strong> <code>{"{BANK_NAME}"}</code>, <code>{"{CLIENT_DISCORD}"}</code>, <code>{"{AMOUNT}"}</code>, <code>{"{INTEREST_RATE}"}</code>, <code>{"{CONTRACT_ID}"}</code>, <code>{"{DATE}"}</code>.
              </div>
            </div>
          )}
        </div>

        {/* Feature Toggles */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Layers className="text-pink-400" size={20} />
            Enabled Modules
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableLoans ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableLoans ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableLoans" className="hidden" checked={!!settings?.enableLoans} onChange={(e) => setSettings({...settings, enableLoans: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Loan Center</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableVaults ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableVaults ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableVaults" className="hidden" checked={!!settings?.enableVaults} onChange={(e) => setSettings({...settings, enableVaults: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Bonds</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableCards ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableCards ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableCards" className="hidden" checked={!!settings?.enableCards} onChange={(e) => setSettings({...settings, enableCards: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Debit/Credit Cards</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enablePayroll ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enablePayroll ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enablePayroll" className="hidden" checked={!!settings?.enablePayroll} onChange={(e) => setSettings({...settings, enablePayroll: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Corporate Payroll</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableSubscriptions ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableSubscriptions ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableSubscriptions" className="hidden" checked={!!settings?.enableSubscriptions} onChange={(e) => setSettings({...settings, enableSubscriptions: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Subscriptions</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableEscrow ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableEscrow ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableEscrow" className="hidden" checked={!!settings?.enableEscrow} onChange={(e) => setSettings({...settings, enableEscrow: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Escrow Services</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableTreasury ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableTreasury ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableTreasury" className="hidden" checked={!!settings?.enableTreasury} onChange={(e) => setSettings({...settings, enableTreasury: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Treasury Analytics</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer group">
               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableAccountTiers ? 'bg-pink-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableAccountTiers ? 'translate-x-4' : 'translate-x-0'}`}></div>
               </div>
               <input type="checkbox" name="enableAccountTiers" className="hidden" checked={!!settings?.enableAccountTiers} onChange={(e) => setSettings({...settings, enableAccountTiers: e.target.checked})} />
               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Custom Account Tiers</span>
            </label>
          </div>

          {settings?.enableVaults !== false && (
            <div className="pt-6 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-md font-semibold text-white/80">Bond terms ({vaultTiers.length} active)</p>
                  <p className="text-xs text-white/40 mt-1">Shown on customer portal Apply tab. Lock days, yield in basis points (500 = 5.00%), early-exit penalty %.</p>
                </div>
                <div className="flex items-center gap-2">
                  {vaultTiers.length > 0 && (
                    <button type="button" onClick={() => setVaultTiers([])} className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 transition-colors">Clear all</button>
                  )}
                  <button type="button" onClick={() => setVaultTiers([...vaultTiers, { lockDays: 30, interestRate: 300, penaltyPercent: 20 }])} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors">Add term</button>
                </div>
              </div>
              {vaultTiers.length === 0 ? (
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/40 text-center">
                  No bond terms configured. The customer portal will not offer any bonds until terms are added here.
                </div>
              ) : (
                <div className="space-y-2">
                  {vaultTiers.map((t, i) => (
                    <div key={i} className="grid grid-cols-3 sm:grid-cols-4 gap-2 items-end">
                      <label className="text-[11px] text-white/40">Days
                        <input type="number" value={t.lockDays} onChange={(e) => { const n = [...vaultTiers]; n[i] = { ...n[i], lockDays: parseInt(e.target.value) || 0 }; setVaultTiers(n); }} className="w-full mt-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-[11px] text-white/40">Yield (bps)
                        <input type="number" value={t.interestRate} onChange={(e) => { const n = [...vaultTiers]; n[i] = { ...n[i], interestRate: parseInt(e.target.value) || 0 }; setVaultTiers(n); }} className="w-full mt-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-[11px] text-white/40">Early penalty %
                        <input type="number" value={t.penaltyPercent} onChange={(e) => { const n = [...vaultTiers]; n[i] = { ...n[i], penaltyPercent: parseInt(e.target.value) || 0 }; setVaultTiers(n); }} className="w-full mt-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2 py-1.5 text-sm" />
                      </label>
                      <button type="button" onClick={() => setVaultTiers(vaultTiers.filter((_, j) => j !== i))} className="text-xs text-rose-300 hover:text-rose-200 py-1.5 font-medium transition-colors">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!settings?.enableAccountTiers && (settings?.enableLoans || settings?.enableCards) && (
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
                      step="0.01"
                      defaultValue={settings?.maxAutoApproveLoanAmount ? settings.maxAutoApproveLoanAmount / 100 : 10000} 
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" 
                    />
                    <p className="text-xs text-white/40 mt-1.5">Dollar cap for instant auto-approval. Credit-card auto-approve uses half this value.</p>
                  </div>
              </div>
            </>
          )}
        </div>

        {/* Lending Policy */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Landmark className="text-emerald-400" size={20} />
            Lending Policy
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            Controls origination defaults, loan interest compounding, auto-debit, late fees, and default. Product-specific APR and term still win when a borrower picks a loan product. Depositor yield (savings APY) is configured on the Interest page.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanAllowCitizenApply !== false ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanAllowCitizenApply !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanAllowCitizenApply" className="hidden" defaultChecked={settings?.loanAllowCitizenApply !== false} onChange={(e) => setSettings({...settings, loanAllowCitizenApply: e.target.checked})} />
              <span className="text-sm text-white/80">Citizen applications</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanAutoDebitEnabled !== false ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanAutoDebitEnabled !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanAutoDebitEnabled" className="hidden" defaultChecked={settings?.loanAutoDebitEnabled !== false} onChange={(e) => setSettings({...settings, loanAutoDebitEnabled: e.target.checked})} />
              <span className="text-sm text-white/80">Auto-debit installments</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanAccrueInterest !== false ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanAccrueInterest !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanAccrueInterest" className="hidden" defaultChecked={settings?.loanAccrueInterest !== false} onChange={(e) => setSettings({...settings, loanAccrueInterest: e.target.checked})} />
              <span className="text-sm text-white/80">Accrue loan interest</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanRequireSignature ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanRequireSignature ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanRequireSignature" className="hidden" defaultChecked={!!settings?.loanRequireSignature} onChange={(e) => setSettings({...settings, loanRequireSignature: e.target.checked})} />
              <span className="text-sm text-white/80">Require signature before funding</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanCompoundLateFees !== false ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanCompoundLateFees !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanCompoundLateFees" className="hidden" defaultChecked={settings?.loanCompoundLateFees !== false} onChange={(e) => setSettings({...settings, loanCompoundLateFees: e.target.checked})} />
              <span className="text-sm text-white/80">Compound late fees into balance</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanAccrueOnDefaulted !== false ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanAccrueOnDefaulted !== false ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanAccrueOnDefaulted" className="hidden" defaultChecked={settings?.loanAccrueOnDefaulted !== false} onChange={(e) => setSettings({...settings, loanAccrueOnDefaulted: e.target.checked})} />
              <span className="text-sm text-white/80">Accrue interest after default</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.loanCureDefaultOnPay ? 'bg-emerald-500' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.loanCureDefaultOnPay ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
              <input type="checkbox" name="loanCureDefaultOnPay" className="hidden" defaultChecked={!!settings?.loanCureDefaultOnPay} onChange={(e) => setSettings({...settings, loanCureDefaultOnPay: e.target.checked})} />
              <span className="text-sm text-white/80">Cure default when late fees clear</span>
            </label>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">Origination defaults</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Default APR (%)</label>
              <div className="relative">
                <input name="defaultLoanApr" type="number" step="0.01" min="0" defaultValue={((settings?.defaultLoanApr ?? 500) / 100).toFixed(2)} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                <Percent className="absolute right-3 top-2.5 text-white/30" size={14} />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">Used when no loan product is selected.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Default term (months)</label>
              <input name="defaultLoanTermMonths" type="number" min="1" step="1" defaultValue={settings?.defaultLoanTermMonths || 12} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Global max loan ($)</label>
              <input name="maxLoanAmount" type="number" step="0.01" min="0" defaultValue={((settings?.maxLoanAmountCents || 0) / 100) || ""} placeholder="No cap" className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <p className="text-[10px] text-zinc-500 mt-1">0 or blank = no global cap (product max still applies).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Min installment ($)</label>
              <input name="loanMinInstallment" type="number" step="0.01" min="0.01" defaultValue={((settings?.loanMinInstallmentCents ?? 100) / 100).toFixed(2)} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">Interest on loans</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Accrual cadence</label>
              <select name="loanInterestAccrual" defaultValue={settings?.loanInterestAccrual || "daily"} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="daily">Daily compounding</option>
                <option value="monthly">Monthly compounding</option>
                <option value="none">Do not accrue (principal only)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Days in year</label>
              <select name="loanDaysInYear" defaultValue={settings?.loanDaysInYear === 360 ? "360" : "365"} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="365">365 (actual)</option>
                <option value="360">360 (bank year)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Payment period (days)</label>
              <input name="loanPaymentPeriodDays" type="number" min="1" step="1" defaultValue={settings?.loanPaymentPeriodDays || 30} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <p className="text-[10px] text-zinc-500 mt-1">Days between installments (7 weekly, 14 biweekly, 30 monthly).</p>
            </div>
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-3">Collections & default</p>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Late fee floor ($)</label>
              <input name="loanLateFeeFlat" type="number" step="0.01" min="0" defaultValue={((settings?.loanLateFeeFlatCents ?? 2500) / 100).toFixed(2)} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Late fee (% of installment)</label>
              <input name="loanLateFeePercent" type="number" step="0.01" min="0" defaultValue={((settings?.loanLateFeePercent ?? 500) / 100).toFixed(2)} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
              <p className="text-[10px] text-zinc-500 mt-1">Charged as max(floor, % of installment).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Grace period (days)</label>
              <input name="loanGracePeriodDays" type="number" min="0" step="1" defaultValue={settings?.loanGracePeriodDays || 0} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Retry after miss (days)</label>
              <input name="loanRetryDays" type="number" min="1" step="1" defaultValue={settings?.loanRetryDays || 7} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Misses until default</label>
              <input name="loanMissesToDefault" type="number" min="1" step="1" defaultValue={settings?.loanMissesToDefault || 3} className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
        </div>

          
        {/* Treasury Routing */}
        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Building2 className="text-emerald-400" size={20} />
            Institutional Treasury Pools
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            Loan <strong>disbursement</strong> needs a named Loan Pool subaccount (or Default Corp Account). CityCorp cannot push corp treasury into a named account. Loan <strong>repayments</strong> go to the pool if set, otherwise Default Corp Account, otherwise corp treasury.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Loan Pool Account (Optional)</label>
              <input 
                name="loanPoolAccount" 
                defaultValue={settings?.loanPoolAccount || ""} 
                placeholder="e.g. loan_reserve"
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
              />
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Required to fund new loans. Disbursements are a CityCorp book transfer from this subaccount. Leave empty to fall back to Default Corp Account (still a named subaccount, not treasury).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Fee Collection Account (Optional)</label>
              <input 
                name="feeCollectionAccount" 
                defaultValue={settings?.feeCollectionAccount || ""} 
                placeholder="e.g. fee_revenue"
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
              />
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Account where general platform fees, wire fees, and transaction charges are deposited.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Interest Pool Account (Optional)</label>
              <input 
                name="interestPoolAccount" 
                defaultValue={settings?.interestPoolAccount || ""} 
                placeholder="e.g. interest_reserve"
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" 
              />
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Account where system interest payments to users are withdrawn from.</p>
            </div>
          </div>
        </div>

        <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 text-lg font-semibold mb-6">
            <Building2 className="text-amber-400" size={20} />
            Interbank Settlement Float
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            Cross-bank Onyx payments never use corp-to-corp (2% API tax). They book customer → your SETTLEMENT, then the receiving bank's SETTLEMENT → their customer. Keep this subaccount at 0% CityCorp fees and funded; VH self-funds for beta. Owner theft of this float cannot be blocked — a RESERVE_BREACH alarm fires for RP/court.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Settlement Account Name</label>
              <input
                name="settlementAccount"
                defaultValue={settings?.settlementAccount || "SETTLEMENT"}
                placeholder="SETTLEMENT"
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Created in CityCorp on save with 0% withdraw/deposit fees.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Default Fee Payer</label>
              <select
                name="defaultFeePayerMode"
                defaultValue={settings?.defaultFeePayerMode || "from_payment"}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="from_payment">Fees from payment (recipient gets less)</option>
                <option value="sender_covers">Sender covers fees (recipient gets the quoted amount)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Payout Floor ($)</label>
              <input
                name="settlementFloor"
                type="number"
                step="0.01"
                min="0"
                defaultValue={((settings?.settlementFloorCents || 0) / 100).toFixed(2)}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Refuse inbound Onyx payouts that would leave settlement cash below this amount.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Low-Balance Warn ($)</label>
              <input
                name="settlementWarn"
                type="number"
                step="0.01"
                min="0"
                defaultValue={((settings?.settlementWarnCents || 0) / 100).toFixed(2)}
                className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">Discord alert when live SETTLEMENT cash drops under this threshold.</p>
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
