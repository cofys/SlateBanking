import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Building2,
  AlertTriangle,
  Save,
  Loader2,
  Paintbrush,
  Bell,
  Shield,
  Wallet,
  Settings,
  Layers,
  Bot,
  Search,
  Landmark,
  Percent,
  Copy,
  Check,
  User,
  Gamepad2,
  Zap,
  Database,
  Lock,
  Key,
  Download,
  Send,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  FileText,
  HelpCircle,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Info,
  RefreshCw,
  ChevronDown
} from "lucide-react";
import { SchemeSwatches } from "../components/ui/chrome";
import { SCHEME_HEX, accentForeground, type ColorSchemeId } from "../lib/theme";

type SettingsTab =
  | "brand"
  | "fees"
  | "accounts"
  | "modules"
  | "lending"
  | "treasury"
  | "discord"
  | "integrations"
  | "security";

interface TabDefinition {
  id: SettingsTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: any;
  color: string;
  keywords: string[];
}

const TABS: TabDefinition[] = [
  {
    id: "brand",
    label: "Brand & Identity",
    shortLabel: "Branding",
    description: "Theme palette, custom accent, logos, custom domain, and SEO metadata",
    icon: Paintbrush,
    color: "text-purple-400",
    keywords: ["brand", "logo", "color", "scheme", "domain", "theme", "seo", "tagline", "meta", "og", "image", "background"]
  },
  {
    id: "fees",
    label: "Fees & Tariffs",
    shortLabel: "Fees",
    description: "Transaction levies, civic tax, APY yields, and interbank wire caps",
    icon: Wallet,
    color: "text-indigo-400",
    keywords: ["fee", "rate", "deposit", "withdraw", "transfer", "tax", "government", "civic", "savings", "apy", "wire", "threshold"]
  },
  {
    id: "accounts",
    label: "Account Rules & Limits",
    shortLabel: "Accounts",
    description: "Account prefixes, Discord naming policy, and citizen holding caps",
    icon: User,
    color: "text-blue-400",
    keywords: ["account", "prefix", "naming", "discord", "limit", "cap", "holding", "personal", "business", "corp"]
  },
  {
    id: "modules",
    label: "Feature Modules",
    shortLabel: "Modules",
    description: "Modular bank features, bond terms ladder, and auto-approval gates",
    icon: Layers,
    color: "text-pink-400",
    keywords: ["module", "loan", "bond", "vault", "card", "payroll", "subscription", "escrow", "treasury", "tier", "auto-approve"]
  },
  {
    id: "lending",
    label: "Lending Policy",
    shortLabel: "Lending",
    description: "Origination defaults, interest accrual, late fees, grace periods, and defaults",
    icon: Landmark,
    color: "text-emerald-400",
    keywords: ["loan", "apr", "term", "interest", "compounding", "accrual", "late", "grace", "retry", "default", "signature", "debit"]
  },
  {
    id: "treasury",
    label: "Treasury & Settlement",
    shortLabel: "Treasury",
    description: "Internal ledger pools, Onyx interbank float, and low-balance alarms",
    icon: Building2,
    color: "text-amber-400",
    keywords: ["treasury", "pool", "loan pool", "fee pool", "interest pool", "settlement", "float", "onyx", "clearinghouse", "floor", "warn"]
  },
  {
    id: "discord",
    label: "Discord Terminal",
    shortLabel: "Discord",
    description: "Channel GUI panels, presence, welcome text, embed style, and role bindings",
    icon: Bot,
    color: "text-indigo-400",
    keywords: ["discord", "bot", "gui", "lobby", "staff", "channel", "role", "verified", "client", "welcome", "footer", "activity", "stats"]
  },
  {
    id: "integrations",
    label: "CityCorp & Contracts",
    shortLabel: "Integrations",
    description: "In-game provisioning, CityCorp OAuth, and Google Docs contracts",
    icon: Zap,
    color: "text-cyan-400",
    keywords: ["citycorp", "game", "in-game", "provision", "minecraft", "uuid", "oauth", "token", "google docs", "contract", "template", "drive"]
  },
  {
    id: "security",
    label: "Security & Backups",
    shortLabel: "Security",
    description: "KYC verification, maintenance mode, and automated daily AES-256 backups",
    icon: Shield,
    color: "text-emerald-400",
    keywords: ["security", "kyc", "maintenance", "backup", "crypto", "encryption", "passphrase", "aes", "snapshot", "archive", "download"]
  }
];

export function BankSettings() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("brand");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const mobileNavRef = useRef<HTMLDivElement>(null);
  const contentSectionRef = useRef<HTMLDivElement>(null);

  // Form states
  const [schemeId, setSchemeId] = useState<ColorSchemeId>("slate");
  const [brandHex, setBrandHex] = useState("#8b95a5");
  const [personalPrefix, setPersonalPrefix] = useState("ACC-");
  const [businessPrefix, setBusinessPrefix] = useState("CORP-");
  const [personalNamingMode, setPersonalNamingMode] = useState("custom");
  const [businessNamingMode, setBusinessNamingMode] = useState("business_name");
  const [maxPersonalAccounts, setMaxPersonalAccounts] = useState<string>("");
  const [maxBusinessAccounts, setMaxBusinessAccounts] = useState<string>("");
  const [maxTotalAccounts, setMaxTotalAccounts] = useState<string>("");
  const [vaultTiers, setVaultTiers] = useState<any[]>([]);
  const [cityCorpOrgName, setCityCorpOrgName] = useState<string>("");
  const [fetchingCorp, setFetchingCorp] = useState(false);

  // Backup & Crypto verification state
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [backupStatusMsg, setBackupStatusMsg] = useState<{ text: string; success: boolean } | null>(null);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [testPassphrase, setTestPassphrase] = useState("");
  const [testingPassphrase, setTestingPassphrase] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; success: boolean } | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const handleSelectTab = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    // On mobile, scroll smoothly to the content so it's instantly in view
    if (window.innerWidth < 1024 && contentSectionRef.current) {
      setTimeout(() => {
        contentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  const isDefaultDummyVaultTiers = (tiers: any[]): boolean => {
    if (!Array.isArray(tiers) || tiers.length !== 5) return false;
    const dummyDays = [7, 30, 90, 180, 365];
    const dummyRates = [100, 300, 500, 800, 1200];
    return tiers.every(
      (t, i) =>
        Number(t.lockDays) === dummyDays[i] &&
        Number(t.interestRate) === dummyRates[i] &&
        Number(t.penaltyPercent) === 20
    );
  };

  const loadSettings = useCallback(() => {
    if (!bank?.id) return;
    setLoading(true);
    fetch(`/api/banks/${bank.id}/settings`)
      .then((r) => r.json())
      .then((data) => {
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
        setMaxPersonalAccounts(
          data.maxPersonalAccountsPerUser != null ? String(data.maxPersonalAccountsPerUser) : ""
        );
        setMaxBusinessAccounts(
          data.maxBusinessAccountsPerUser != null ? String(data.maxBusinessAccountsPerUser) : ""
        );
        setMaxTotalAccounts(
          data.maxTotalAccountsPerUser != null ? String(data.maxTotalAccountsPerUser) : ""
        );
        setCityCorpOrgName(data.cityCorpOrgName || "");
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
        setLoading(false);
      });
  }, [bank?.id]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Handle Backup Trigger
  const handleTriggerBackup = async () => {
    if (!bank?.id) return;
    setTriggeringBackup(true);
    setBackupStatusMsg(null);
    try {
      const res = await fetch(`/api/banks/${bank.id}/backup/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: settings?.backupWebhookUrl || undefined
        })
      });
      const data = await res.json();
      if (res.ok) {
        setBackupStatusMsg({
          text: `Backup successfully dispatched! File "${data.result?.fileName}" (${(
            data.result?.fileSizeBytes / 1024
          ).toFixed(1)} KB) posted with AES-256-GCM encryption.`,
          success: true
        });
        setSettings((prev: any) => ({ ...prev, lastDailyBackupAt: new Date().toISOString() }));
      } else {
        setBackupStatusMsg({ text: data.error || "Failed to trigger backup", success: false });
      }
    } catch (e: any) {
      setBackupStatusMsg({ text: e.message || "Network error triggering backup", success: false });
    } finally {
      setTriggeringBackup(false);
    }
  };

  // Handle Passphrase verification
  const handleTestPassphrase = async () => {
    if (!bank?.id || !testPassphrase) return;
    setTestingPassphrase(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/banks/${bank.id}/backup/verify-decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: testPassphrase })
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          text: `Passphrase verified! Decrypted snapshot for ${data.bankName} (${
            data.stats?.accounts || 0
          } accounts, ${data.stats?.customers || 0} customers, ${
            data.stats?.transactions || 0
          } transactions).`,
          success: true
        });
      } else {
        setTestResult({ text: data.error || "Verification failed.", success: false });
      }
    } catch (e: any) {
      setTestResult({ text: e.message || "Network error", success: false });
    } finally {
      setTestingPassphrase(false);
    }
  };

  const fetchCityCorpName = async () => {
    if (!bank?.id) return;
    setFetchingCorp(true);
    try {
      const res = await fetch(`/api/banks/${bank.id}/fetch-citycorp-corp`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.corpName) {
        setCityCorpOrgName(data.corpName);
        setSettings((prev: any) => ({ ...prev, cityCorpOrgName: data.corpName }));
        alert(`Detected CityCorp Corporation: "${data.corpName}"`);
      } else {
        alert(data.error || "Could not retrieve corporation from CityCorp.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to query CityCorp");
    } finally {
      setFetchingCorp(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bank?.id) return;
    setSaving(true);
    setSaveSuccess(false);

    const form = document.getElementById("bank-settings-form") as HTMLFormElement;
    if (!form) return;
    const formData = new FormData(form);

    const newSettings = {
      personalAccountPrefix: (formData.get("personalAccountPrefix") as string) || "ACC-",
      businessAccountPrefix: (formData.get("businessAccountPrefix") as string) || "CORP-",
      personalAccountNamingMode: (formData.get("personalAccountNamingMode") as string) || "custom",
      businessAccountNamingMode:
        (formData.get("businessAccountNamingMode") as string) || "business_name",
      maxPersonalAccountsPerUser:
        formData.get("maxPersonalAccountsPerUser") &&
        !isNaN(parseInt(formData.get("maxPersonalAccountsPerUser") as string, 10))
          ? parseInt(formData.get("maxPersonalAccountsPerUser") as string, 10)
          : null,
      maxBusinessAccountsPerUser:
        formData.get("maxBusinessAccountsPerUser") &&
        !isNaN(parseInt(formData.get("maxBusinessAccountsPerUser") as string, 10))
          ? parseInt(formData.get("maxBusinessAccountsPerUser") as string, 10)
          : null,
      maxTotalAccountsPerUser:
        formData.get("maxTotalAccountsPerUser") &&
        !isNaN(parseInt(formData.get("maxTotalAccountsPerUser") as string, 10))
          ? parseInt(formData.get("maxTotalAccountsPerUser") as string, 10)
          : null,
      withdrawFeePercent: parseFloat(formData.get("withdrawFeePercent") as string) || 0,
      depositFeePercent: parseFloat(formData.get("depositFeePercent") as string) || 0,
      transferFeePercent: parseFloat(formData.get("transferFeePercent") as string) || 0,
      governmentFeePercent:
        formData.get("governmentFeePercent") !== null &&
        !isNaN(parseFloat(formData.get("governmentFeePercent") as string))
          ? parseFloat(formData.get("governmentFeePercent") as string)
          : 0.25,
      overwriteCustomAccountFees: formData.get("overwriteCustomAccountFees") === "on",
      savingsApyPercent:
        Math.round(parseFloat(formData.get("savingsApyPercent") as string) * 100) || 300,
      interBankWireThreshold:
        Math.floor(parseFloat(formData.get("interBankWireThreshold") as string) * 100) || 5000000,
      colorScheme: schemeId,
      brandingColor: brandHex,
      tagline: formData.get("tagline"),
      logoUrl: formData.get("logoUrl"),
      loginBgUrl: formData.get("loginBgUrl"),
      supportEmail: formData.get("supportEmail"),
      discordWebhookUrl: formData.get("discordWebhookUrl"),
      discordVerifiedRoleId: formData.get("discordVerifiedRoleId"),
      discordClientRoleId: formData.get("discordClientRoleId"),
      requireKyc: formData.get("requireKyc") === "on",
      requirePersonalForBusiness: formData.get("requirePersonalForBusiness") === "on",
      maintenanceMode: formData.get("maintenanceMode") === "on",
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
      maxAutoApproveLoanAmount: Math.round(
        (parseFloat(formData.get("maxAutoApproveLoanAmount") as string) || 10000) * 100
      ),
      autoProvisionInGame: !!settings?.autoProvisionInGame,
      dailyBackupEnabled: !!settings?.dailyBackupEnabled,
      backupWebhookUrl: formData.get("backupWebhookUrl")
        ? String(formData.get("backupWebhookUrl")).trim()
        : null,
      backupEncryptionPassphrase: formData.get("backupEncryptionPassphrase")
        ? String(formData.get("backupEncryptionPassphrase")).trim()
        : null,
      customDomain: formData.get("customDomain"),
      discordClientId: formData.get("discordClientId"),
      discordClientSecret: formData.get("discordClientSecret"),
      cityCorpAppId: formData.get("cityCorpAppId"),
      cityCorpAppSecret: formData.get("cityCorpAppSecret"),
      cityCorpAuthUrl: formData.get("cityCorpAuthUrl"),
      cityCorpOrgName: (formData.get("cityCorpOrgName") as string) || cityCorpOrgName || null,
      defaultCorpAccount: formData.get("defaultCorpAccount"),
      loanPoolAccount: formData.get("loanPoolAccount"),
      feeCollectionAccount: formData.get("feeCollectionAccount"),
      interestPoolAccount: formData.get("interestPoolAccount"),
      settlementAccount: formData.get("settlementAccount") || "SETTLEMENT",
      settlementFloorCents: Math.round(
        (parseFloat(formData.get("settlementFloor") as string) || 0) * 100
      ),
      settlementWarnCents: Math.round(
        (parseFloat(formData.get("settlementWarn") as string) || 0) * 100
      ),
      defaultFeePayerMode: formData.get("defaultFeePayerMode") || "from_payment",
      defaultLoanApr: Math.round(
        (parseFloat(formData.get("defaultLoanApr") as string) || 5) * 100
      ),
      defaultLoanTermMonths:
        parseInt(formData.get("defaultLoanTermMonths") as string, 10) || 12,
      maxLoanAmountCents: Math.round(
        (parseFloat(formData.get("maxLoanAmount") as string) || 0) * 100
      ),
      loanPaymentPeriodDays:
        parseInt(formData.get("loanPaymentPeriodDays") as string, 10) || 30,
      loanAutoDebitEnabled: formData.get("loanAutoDebitEnabled") === "on",
      loanLateFeeFlatCents: Math.round(
        (parseFloat(formData.get("loanLateFeeFlat") as string) || 25) * 100
      ),
      loanLateFeePercent: Math.round(
        (parseFloat(formData.get("loanLateFeePercent") as string) || 5) * 100
      ),
      loanMissesToDefault:
        parseInt(formData.get("loanMissesToDefault") as string, 10) || 3,
      loanGracePeriodDays:
        parseInt(formData.get("loanGracePeriodDays") as string, 10) || 0,
      loanRetryDays: parseInt(formData.get("loanRetryDays") as string, 10) || 7,
      loanAccrueInterest: formData.get("loanAccrueInterest") === "on",
      loanInterestAccrual: formData.get("loanInterestAccrual") || "daily",
      loanAccrueOnDefaulted: formData.get("loanAccrueOnDefaulted") === "on",
      loanCompoundLateFees: formData.get("loanCompoundLateFees") === "on",
      loanMinInstallmentCents: Math.round(
        (parseFloat(formData.get("loanMinInstallment") as string) || 1) * 100
      ),
      loanRequireSignature: formData.get("loanRequireSignature") === "on",
      loanAllowCitizenApply: formData.get("loanAllowCitizenApply") === "on",
      loanCureDefaultOnPay: formData.get("loanCureDefaultOnPay") === "on",
      loanDaysInYear:
        parseInt(formData.get("loanDaysInYear") as string, 10) === 360 ? 360 : 365,
      discordWelcome: formData.get("discordWelcome"),
      discordFooter: formData.get("discordFooter"),
      discordBotActivity: formData.get("discordBotActivity"),
      discordShowStats: formData.get("discordShowStats") === "on",
      discordShowDeposits: formData.get("discordShowDeposits") === "on",
      discordShowAccounts: formData.get("discordShowAccounts") === "on",
      discordGuiStyle: (formData.get("discordGuiStyle") as string) || "executive",
      metaTitle: formData.get("metaTitle"),
      metaDescription: formData.get("metaDescription"),
      metaOgImage: formData.get("metaOgImage")
    };

    fetch(`/api/banks/${bank.id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings)
    })
      .then((r) => r.json())
      .then((d) => {
        setSettings(d);
        setSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      })
      .catch((err) => {
        alert("Failed to save settings: " + (err.message || "Unknown error"));
        setSaving(false);
      });
  };

  // Keyboard shortcut for saving (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
        handleSave(fakeEvent);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settings, schemeId, brandHex, vaultTiers, bank?.id]);

  // Filter tabs based on search query
  const matchingTabs = useMemo(() => {
    if (!searchQuery.trim()) return TABS;
    const q = searchQuery.toLowerCase().trim();
    return TABS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  // If search query is active and current tab is not in matches, auto switch to first match
  useEffect(() => {
    if (searchQuery.trim() && matchingTabs.length > 0) {
      if (!matchingTabs.some((t) => t.id === activeTab)) {
        setActiveTab(matchingTabs[0].id);
      }
    }
  }, [searchQuery, matchingTabs, activeTab]);

  const activeTabDef = TABS.find((t) => t.id === activeTab) || TABS[0];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-white/50 space-y-4">
        <Loader2 className="animate-spin text-indigo-400" size={36} />
        <p className="text-sm font-medium tracking-wide">Loading bank configuration...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-300 pb-28 px-2 sm:px-4">
      {/* Header Bar */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
              <Sliders size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2 flex-wrap">
                <span>Bank Settings</span>
                <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
                  {bank?.name || "Tenant"}
                </span>
              </h2>
              <p className="text-white/50 text-xs mt-0.5">
                Organized control center for rates, account numbering, modules, ledger routing, and integrations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => {
              const link = document.createElement("a");
              link.href = `/api/banks/${bank.id}/snapshot`;
              link.target = "_blank";
              link.download = `snapshot_${bank.name}_${new Date().toISOString().split("T")[0]}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="flex-1 sm:flex-initial bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-2"
            title="Download full JSON cryptographic snapshot"
          >
            <Download size={14} />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={(e) => handleSave(e as any)}
            disabled={saving}
            className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold px-4 sm:px-5 py-2 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>{saving ? "Saving..." : "Save"}</span>
          </button>
        </div>
      </div>

      {/* Global Search & Category Filter */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all settings (e.g. fees, prefix, discord, apy, backup, webhook)..."
            className="w-full bg-[var(--bg-elevated)] border border-white/10 rounded-xl pl-10 pr-12 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs bg-white/10 px-2 py-0.5 rounded"
            >
              Clear
            </button>
          )}
        </div>

        {searchQuery && (
          <div className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 rounded-xl shrink-0 w-full sm:w-auto text-center">
            {matchingTabs.length} {matchingTabs.length === 1 ? "category" : "categories"} matched
          </div>
        )}
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="mb-4 sm:mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Bank configuration saved and live services updated successfully.</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400/70">Synced</span>
        </div>
      )}

      {/* MOBILE-ONLY Category Navigation Bar (Sticky, Scrollable Horizontal Pills + Quick Picker) */}
      <div className="lg:hidden mb-4 space-y-2" ref={mobileNavRef}>
        {/* Mobile Quick Dropdown Jump */}
        <div className="flex items-center gap-2 bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-2">
          <span className="text-[11px] font-semibold text-white/50 pl-2 shrink-0">Category:</span>
          <div className="relative flex-1">
            <select
              value={activeTab}
              onChange={(e) => handleSelectTab(e.target.value as SettingsTab)}
              className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus:outline-none appearance-none cursor-pointer pr-8"
            >
              {matchingTabs.map((t) => (
                <option key={t.id} value={t.id} className="bg-[#18181c] text-white">
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
          </div>
        </div>

        {/* Mobile Horizontal Pill Scrollbar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar touch-pan-x">
          {matchingTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-500/50"
                    : "bg-[var(--bg-elevated)] border border-white/10 text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={14} className={isActive ? "text-white" : tab.color} />
                <span>{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Navigation & Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Sidebar (Desktop Only) */}
        <div className="hidden lg:block lg:col-span-4 space-y-1 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-2.5 shadow-lg sticky top-4">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white/40 flex items-center justify-between">
            <span>Settings Categories</span>
            <span className="text-[10px] text-white/30 font-mono">⌘S to save</span>
          </div>

          <div className="space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isMatched = matchingTabs.some((m) => m.id === tab.id);

              if (searchQuery.trim() && !isMatched) {
                return null;
              }

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-start gap-3 group relative cursor-pointer ${
                    isActive
                      ? "bg-indigo-600/15 border border-indigo-500/40 text-white shadow-sm"
                      : "hover:bg-white/5 border border-transparent text-white/70 hover:text-white"
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg shrink-0 mt-0.5 transition-colors ${
                      isActive
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                        : "bg-white/5 text-white/50 group-hover:text-white group-hover:bg-white/10"
                    }`}
                  >
                    <Icon size={16} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${isActive ? "text-white" : "text-white/80"}`}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <ChevronRight size={14} className="text-indigo-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-white/40 truncate mt-0.5 leading-snug">
                      {tab.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Settings Form Container */}
        <div className="lg:col-span-8 w-full" ref={contentSectionRef}>
          <form id="bank-settings-form" onSubmit={handleSave} className="space-y-4 sm:space-y-6">
            {/* Active Tab Banner */}
            <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-md flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl bg-white/5 border border-white/10 shrink-0 ${activeTabDef.color}`}>
                  <activeTabDef.icon size={20} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">{activeTabDef.label}</h3>
                  <p className="text-xs text-white/50">{activeTabDef.description}</p>
                </div>
              </div>
            </div>

            {/* TAB 1: Brand & Identity */}
            <div className={activeTab === "brand" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">
                    Color Scheme Preset
                  </label>
                  <SchemeSwatches
                    value={schemeId}
                    onChange={(id, hex) => {
                      setSchemeId(id);
                      setBrandHex(hex);
                    }}
                  />
                  <p className="text-xs text-white/40 mt-3">
                    Applies to staff management chrome, citizen portals, Discord embeds, and transactional action buttons.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t border-white/5">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Custom Accent Color
                    </label>
                    <div className="flex items-center gap-3 bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2">
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
                        className="flex-1 bg-transparent text-sm text-white font-mono focus:outline-none min-w-0"
                      />
                    </div>
                    <div
                      className="mt-3 h-10 rounded-xl flex items-center justify-center text-xs font-semibold tracking-wide shadow-sm"
                      style={{ background: brandHex, color: accentForeground(brandHex) }}
                    >
                      Theme Preview Badge
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Tagline / Motto
                    </label>
                    <input
                      name="tagline"
                      type="text"
                      maxLength={120}
                      placeholder="The premier financial institution of the city."
                      defaultValue={settings?.tagline || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <p className="text-xs text-white/40 mt-1.5">
                      Prominently displayed in customer portal headers and official Discord embeds.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-4 border-t border-white/5">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Brand Logo URL
                    </label>
                    <input
                      name="logoUrl"
                      type="text"
                      placeholder="https://example.com/logo.png"
                      defaultValue={settings?.logoUrl || bank?.logoUrl || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    {(settings?.logoUrl || bank?.logoUrl) && (
                      <div className="mt-2.5 flex items-center gap-3">
                        <img
                          src={settings?.logoUrl || bank?.logoUrl}
                          alt="logo preview"
                          referrerPolicy="no-referrer"
                          className="h-12 w-12 rounded-xl object-contain bg-black/40 border border-white/10 p-1"
                        />
                        <span className="text-xs text-white/50 font-mono">Active Logo Preview</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Login Background Image URL
                    </label>
                    <input
                      name="loginBgUrl"
                      type="text"
                      placeholder="https://images.unsplash.com/photo-..."
                      defaultValue={settings?.loginBgUrl || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <p className="text-xs text-white/40 mt-1.5">
                      Immersive background backdrop displayed on the citizen login gateway.
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Custom Portal Domain
                    </label>
                    <div className="flex bg-[var(--bg-subtle)] border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500 transition-colors">
                      <span className="px-3 sm:px-4 py-2.5 text-white/40 border-r border-white/10 text-xs flex items-center bg-black/20 font-mono shrink-0">
                        https://
                      </span>
                      <input
                        name="customDomain"
                        type="text"
                        placeholder="portal.mybank.com"
                        defaultValue={settings?.customDomain || ""}
                        className="flex-1 bg-transparent px-3 sm:px-4 py-2.5 text-xs text-white focus:outline-none placeholder:text-white/20 font-mono min-w-0"
                      />
                    </div>
                    <p className="text-xs text-white/40 mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <Info size={13} className="text-indigo-400 shrink-0" />
                      <span>Point your DNS CNAME record to:</span>
                      <code className="text-[11px] text-white/70 bg-white/10 px-1.5 py-0.5 rounded font-mono break-all">
                        {window.location.host}
                      </code>
                    </p>
                  </div>
                </div>

                {/* SEO & Social Metadata */}
                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-purple-400 shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Search & Social Embed Metadata
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Meta Title</label>
                      <input
                        name="metaTitle"
                        type="text"
                        placeholder={`${bank?.name || "Bank"} | Private Institutional Banking`}
                        defaultValue={settings?.metaTitle || ""}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Social Banner Image URL</label>
                      <input
                        name="metaOgImage"
                        type="text"
                        placeholder="https://example.com/banner.png"
                        defaultValue={settings?.metaOgImage || ""}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Meta Description</label>
                      <textarea
                        name="metaDescription"
                        rows={2}
                        placeholder={`Institutional banking, real-time clearinghouse fund settlement, and asset management for ${
                          bank?.name || "your bank"
                        }.`}
                        defaultValue={settings?.metaDescription || ""}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 2: Fees & Tariffs */}
            <div className={activeTab === "fees" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Deposit Fee (%)
                    </label>
                    <input
                      name="depositFeePercent"
                      type="number"
                      step="0.01"
                      defaultValue={
                        settings?.depositFeePercent
                          ? Number(settings.depositFeePercent) > 100
                            ? Number(settings.depositFeePercent) / 100
                            : Number(settings.depositFeePercent)
                          : 0
                      }
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-white/40 mt-1">Deducted on inbound cash deposits</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Withdraw Fee (%)
                    </label>
                    <input
                      name="withdrawFeePercent"
                      type="number"
                      step="0.01"
                      defaultValue={
                        settings?.withdrawFeePercent
                          ? Number(settings.withdrawFeePercent) > 100
                            ? Number(settings.withdrawFeePercent) / 100
                            : Number(settings.withdrawFeePercent)
                          : 0
                      }
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-white/40 mt-1">Deducted on physical cash withdrawals</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Transfer Fee (%)
                    </label>
                    <input
                      name="transferFeePercent"
                      type="number"
                      step="0.01"
                      defaultValue={
                        settings?.transferFeePercent
                          ? Number(settings.transferFeePercent) > 100
                            ? Number(settings.transferFeePercent) / 100
                            : Number(settings.transferFeePercent)
                          : 0
                      }
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-white/40 mt-1">Internal customer-to-customer transfers</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                        Civic / Government Fee (%)
                      </label>
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded font-mono border border-amber-500/20">
                        Civic Levy
                      </span>
                    </div>
                    <input
                      name="governmentFeePercent"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={
                        settings?.governmentFeePercent != null
                          ? Number(settings.governmentFeePercent) >= 20
                            ? Number(settings.governmentFeePercent) / 100
                            : Number(settings.governmentFeePercent)
                          : 0.25
                      }
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-white/40 mt-1">Civic tax itemized on all payment quotes</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Savings APY Yield (%)
                    </label>
                    <input
                      name="savingsApyPercent"
                      type="number"
                      step="0.01"
                      defaultValue={
                        settings?.savingsApyPercent ? settings.savingsApyPercent / 100 : 3.0
                      }
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-white/40 mt-1">Base interest paid to standard savings depositors</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                      Inbound Wire Threshold ($)
                    </label>
                    <input
                      name="interBankWireThreshold"
                      type="number"
                      step="1"
                      defaultValue={
                        settings?.interBankWireThreshold
                          ? Math.floor(settings.interBankWireThreshold / 100)
                          : 50000
                      }
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-white/40 mt-1">Cross-bank wires above this trigger staff review</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 bg-black/20 p-4 rounded-xl space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      id="overwriteCustomAccountFees"
                      name="overwriteCustomAccountFees"
                      className="w-4 h-4 rounded bg-[var(--bg-subtle)] border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-0.5 shrink-0"
                    />
                    <span className="text-xs sm:text-sm text-white/90 font-medium">
                      Apply these base rates to accounts with custom fee overrides (overwrite custom fees)
                    </span>
                  </label>
                  <p className="text-xs text-white/40 pl-7">
                    Leave unchecked to preserve bespoke fee overrides negotiated on VIP customer accounts.
                  </p>
                </div>
              </div>
            </div>

            {/* TAB 3: Account Rules & Limits */}
            <div className={activeTab === "accounts" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {/* Personal */}
                  <div className="bg-black/20 border border-white/5 rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-semibold text-white flex items-center gap-2">
                        <User size={16} className="text-indigo-400" /> Personal Accounts
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 truncate max-w-[160px]">
                        {personalPrefix || "ACC-"}
                        {personalNamingMode === "discord_username" ? "DiscordUser" : "my-savings"}
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                        Naming Policy
                      </label>
                      <select
                        name="personalAccountNamingMode"
                        value={personalNamingMode}
                        onChange={(e) => setPersonalNamingMode(e.target.value)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="custom">Customer Chooses Name ({personalPrefix}custom_name)</option>
                        <option value="discord_username">Automatic Discord Username ({personalPrefix}username)</option>
                        <option value="choice_or_username">Allow Citizen Choice (Custom or Username)</option>
                      </select>
                    </div>
                  </div>

                  {/* Business */}
                  <div className="bg-black/20 border border-white/5 rounded-xl p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm font-semibold text-white flex items-center gap-2">
                        <Building2 size={16} className="text-emerald-400" /> Corporate Accounts
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 truncate max-w-[160px]">
                        {businessPrefix || "CORP-"}
                        {businessNamingMode === "discord_plus_business" ? "Owner-Company" : "AcmeCorp"}
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                        Business Naming Policy
                      </label>
                      <select
                        name="businessAccountNamingMode"
                        value={businessNamingMode}
                        onChange={(e) => setBusinessNamingMode(e.target.value)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="business_name">Registered Entity Name ({businessPrefix}Company)</option>
                        <option value="discord_plus_business">Owner + Company ({businessPrefix}Owner-Company)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Account Limits */}
                <div className="pt-4 border-t border-white/5 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Citizen Account Holding Caps
                      </span>
                    </div>
                    <span className="text-[11px] text-white/40">Blank or 0 = unlimited</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Max Personal Accounts</label>
                      <input
                        name="maxPersonalAccountsPerUser"
                        type="number"
                        min="1"
                        value={maxPersonalAccounts}
                        onChange={(e) => setMaxPersonalAccounts(e.target.value)}
                        placeholder="Unlimited (e.g. 2)"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Max Combined Total</label>
                      <input
                        name="maxTotalAccountsPerUser"
                        type="number"
                        min="1"
                        value={maxTotalAccounts}
                        onChange={(e) => setMaxTotalAccounts(e.target.value)}
                        placeholder="Unlimited (e.g. 6)"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 4: Feature Modules */}
            <div className={activeTab === "modules" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                  {[
                    { key: "enableLoans", label: "Loan Center", icon: Landmark },
                    { key: "enableVaults", label: "Fixed Bonds", icon: Database },
                    { key: "enableCards", label: "Debit & Credit Cards", icon: Wallet },
                    { key: "enablePayroll", label: "Corporate Payroll", icon: Building2 },
                    { key: "enableSubscriptions", label: "Recurring Subscriptions", icon: Zap },
                    { key: "enableEscrow", label: "Escrow Custody", icon: Shield },
                    { key: "enableTreasury", label: "Treasury Analytics", icon: Sliders },
                    { key: "enableAccountTiers", label: "Custom Account Tiers", icon: Layers }
                  ].map((mod) => {
                    const isEnabled = !!settings?.[mod.key];
                    const Icon = mod.icon;
                    return (
                      <label
                        key={mod.key}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isEnabled
                            ? "bg-pink-500/10 border-pink-500/40 text-white"
                            : "bg-white/[0.02] border-white/5 text-white/50 hover:border-white/20"
                        }`}
                      >
                        <div
                          className={`w-9 h-5 shrink-0 rounded-full flex items-center p-0.5 transition-colors ${
                            isEnabled ? "bg-pink-500" : "bg-white/15"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full transition-transform ${
                              isEnabled ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </div>
                        <input
                          type="checkbox"
                          name={mod.key}
                          className="hidden"
                          checked={isEnabled}
                          onChange={(e) => setSettings({ ...settings, [mod.key]: e.target.checked })}
                        />
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon size={14} className={isEnabled ? "text-pink-400" : "text-white/30"} />
                          <span className="text-xs font-semibold truncate">{mod.label}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Bond Terms Ladder */}
                {settings?.enableVaults !== false && (
                  <div className="pt-5 border-t border-white/5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <Database size={15} className="text-indigo-400" />
                          Fixed-Term Bond Ladder ({vaultTiers.length} Active Tiers)
                        </h4>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          Offered to citizens on the portal. Yield configured in basis points (500 = 5.00%).
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {vaultTiers.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setVaultTiers([])}
                            className="text-[11px] text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20"
                          >
                            Clear All
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setVaultTiers([
                              ...vaultTiers,
                              { lockDays: 30, interestRate: 300, penaltyPercent: 20 }
                            ])
                          }
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white"
                        >
                          + Add Bond Term
                        </button>
                      </div>
                    </div>

                    {vaultTiers.length === 0 ? (
                      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-white/40 text-center">
                        No custom bond terms configured.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {vaultTiers.map((t, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 items-end bg-black/20 p-3 rounded-xl border border-white/5"
                          >
                            <label className="text-[11px] text-white/50">
                              Lock Days
                              <input
                                type="number"
                                value={t.lockDays}
                                onChange={(e) => {
                                  const n = [...vaultTiers];
                                  n[i] = { ...n[i], lockDays: parseInt(e.target.value) || 0 };
                                  setVaultTiers(n);
                                }}
                                className="w-full mt-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                              />
                            </label>
                            <label className="text-[11px] text-white/50">
                              Yield (Basis Points)
                              <input
                                type="number"
                                value={t.interestRate}
                                onChange={(e) => {
                                  const n = [...vaultTiers];
                                  n[i] = { ...n[i], interestRate: parseInt(e.target.value) || 0 };
                                  setVaultTiers(n);
                                }}
                                className="w-full mt-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                              />
                            </label>
                            <label className="text-[11px] text-white/50">
                              Early Exit Penalty %
                              <input
                                type="number"
                                value={t.penaltyPercent}
                                onChange={(e) => {
                                  const n = [...vaultTiers];
                                  n[i] = { ...n[i], penaltyPercent: parseInt(e.target.value) || 0 };
                                  setVaultTiers(n);
                                }}
                                className="w-full mt-1 bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setVaultTiers(vaultTiers.filter((_, j) => j !== i))}
                              className="w-full sm:w-auto text-xs text-rose-400 hover:text-rose-300 py-2 font-medium transition-colors bg-rose-500/10 sm:bg-transparent rounded-lg text-center"
                            >
                              Remove Term
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* TAB 5: Lending Policy */}
            <div className={activeTab === "lending" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  {[
                    { key: "loanAllowCitizenApply", label: "Citizen Applications", def: true },
                    { key: "loanAutoDebitEnabled", label: "Auto-Debit Installments", def: true },
                    { key: "loanAccrueInterest", label: "Accrue Loan Interest", def: true },
                    { key: "loanRequireSignature", label: "Require Borrower Signature", def: false },
                    { key: "loanCompoundLateFees", label: "Compound Late Fees", def: true },
                    { key: "loanAccrueOnDefaulted", label: "Accrue Interest After Default", def: true },
                    { key: "loanCureDefaultOnPay", label: "Cure Default Upon Full Catchup", def: false }
                  ].map((sw) => {
                    const isChecked =
                      settings?.[sw.key] !== undefined ? !!settings[sw.key] : sw.def;
                    return (
                      <label
                        key={sw.key}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isChecked
                            ? "bg-emerald-500/10 border-emerald-500/30 text-white"
                            : "bg-white/[0.02] border-white/5 text-white/50"
                        }`}
                      >
                        <div
                          className={`w-9 h-5 shrink-0 rounded-full flex items-center p-0.5 transition-colors ${
                            isChecked ? "bg-emerald-500" : "bg-white/15"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 bg-white rounded-full transition-transform ${
                              isChecked ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </div>
                        <input
                          type="checkbox"
                          name={sw.key}
                          className="hidden"
                          checked={isChecked}
                          onChange={(e) => setSettings({ ...settings, [sw.key]: e.target.checked })}
                        />
                        <span className="text-xs font-semibold">{sw.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-white/5">
                  <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">
                    Origination Baseline Parameters
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Default APR (%)</label>
                      <input
                        name="defaultLoanApr"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={((settings?.defaultLoanApr ?? 500) / 100).toFixed(2)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Default Term (Months)</label>
                      <input
                        name="defaultLoanTermMonths"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={settings?.defaultLoanTermMonths || 12}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Global Max Loan ($)</label>
                      <input
                        name="maxLoanAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={((settings?.maxLoanAmountCents || 0) / 100) || ""}
                        placeholder="No ceiling"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Min Installment ($)</label>
                      <input
                        name="loanMinInstallment"
                        type="number"
                        step="0.01"
                        min="0.01"
                        defaultValue={((settings?.loanMinInstallmentCents ?? 100) / 100).toFixed(2)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider mb-3">
                    Delinquency & Default Schedules
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Late Fee Floor ($)</label>
                      <input
                        name="loanLateFeeFlat"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={((settings?.loanLateFeeFlatCents ?? 2500) / 100).toFixed(2)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Late Fee (%)</label>
                      <input
                        name="loanLateFeePercent"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={((settings?.loanLateFeePercent ?? 500) / 100).toFixed(2)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Grace Period (Days)</label>
                      <input
                        name="loanGracePeriodDays"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue={settings?.loanGracePeriodDays || 0}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Retry Cadence (Days)</label>
                      <input
                        name="loanRetryDays"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={settings?.loanRetryDays || 7}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Misses to Default</label>
                      <input
                        name="loanMissesToDefault"
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={settings?.loanMissesToDefault || 3}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 6: Treasury & Settlement */}
            <div className={activeTab === "treasury" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Building2 size={16} className="text-emerald-400 shrink-0" />
                    <span>Internal Institutional Subaccounts</span>
                  </h4>
                  <p className="text-xs text-white/50 mb-4">
                    Designate named accounts in CityCorp to route loans, fee revenues, and interest payouts.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Loan Pool Account</label>
                      <input
                        name="loanPoolAccount"
                        defaultValue={settings?.loanPoolAccount || ""}
                        placeholder="loan_reserve"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Disbursement source for loans</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Fee Collection Account</label>
                      <input
                        name="feeCollectionAccount"
                        defaultValue={settings?.feeCollectionAccount || ""}
                        placeholder="fee_revenue"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Gathers platform transaction fees</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Interest Pool Account</label>
                      <input
                        name="interestPoolAccount"
                        defaultValue={settings?.interestPoolAccount || ""}
                        placeholder="interest_reserve"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Funds savings APY interest runs</p>
                    </div>
                  </div>
                </div>

                <div className="pt-5 border-t border-white/5">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Zap size={16} className="text-amber-400 shrink-0" />
                    <span>Onyx Interbank Settlement Float</span>
                  </h4>
                  <p className="text-xs text-white/50 mb-4">
                    Cross-bank payments settle through your SETTLEMENT subaccount at 0% internal CityCorp fees.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Settlement Account Name</label>
                      <input
                        name="settlementAccount"
                        defaultValue={settings?.settlementAccount || "SETTLEMENT"}
                        placeholder="SETTLEMENT"
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Default Fee Payer</label>
                      <select
                        name="defaultFeePayerMode"
                        defaultValue={settings?.defaultFeePayerMode || "from_payment"}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="from_payment">Deduct from payment (recipient pays fee)</option>
                        <option value="sender_covers">Sender covers fees (exact amount received)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Settlement Floor ($)</label>
                      <input
                        name="settlementFloor"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={((settings?.settlementFloorCents || 0) / 100).toFixed(2)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Rejects inbound payments if float is below floor</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Low-Balance Warning ($)</label>
                      <input
                        name="settlementWarn"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={((settings?.settlementWarnCents || 0) / 100).toFixed(2)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                      />
                      <p className="text-[10px] text-white/40 mt-1">Triggers Discord alert if float drops below warning</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 7: Discord Terminal */}
            <div className={activeTab === "discord" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Welcome Message
                    </label>
                    <textarea
                      name="discordWelcome"
                      rows={2}
                      maxLength={500}
                      placeholder="Welcome to the bank. Open your dashboard or initiate a transfer."
                      defaultValue={settings?.discordWelcome || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Embed Footer Text
                    </label>
                    <input
                      name="discordFooter"
                      type="text"
                      maxLength={80}
                      placeholder={`${bank?.name || "Your bank"} • Powered by Slate`}
                      defaultValue={settings?.discordFooter || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Bot Status Activity
                    </label>
                    <input
                      name="discordBotActivity"
                      type="text"
                      maxLength={80}
                      placeholder={`/bank · ${bank?.name || "Bank"}`}
                      defaultValue={settings?.discordBotActivity || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* GUI Visual Style */}
                <div className="pt-4 border-t border-white/5 space-y-3">
                  <label className="block text-xs font-bold text-white uppercase tracking-wider">
                    Discord Terminal Theme
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: "executive", name: "Executive", desc: "High-contrast formal clearinghouse styling" },
                      { id: "cyber", name: "Cyber Telemetry", desc: "ANSI console styling with live fiscal blocks" },
                      { id: "minimal", name: "Minimalist", desc: "Compact bullet rows with distilled essentials" }
                    ].map((st) => {
                      const isSelected = (settings?.discordGuiStyle || "executive") === st.id;
                      return (
                        <label
                          key={st.id}
                          className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "border-indigo-500 bg-indigo-500/15 text-white shadow-sm"
                              : "border-white/10 bg-white/[0.02] text-white/70 hover:border-white/20"
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
                            {isSelected && <span className="text-indigo-400 text-[10px] font-mono">ACTIVE</span>}
                          </span>
                          <span className="text-[11px] text-white/50 mt-1">{st.desc}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Role IDs */}
                <div className="pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Verified Customer Role ID
                    </label>
                    <input
                      name="discordVerifiedRoleId"
                      type="text"
                      placeholder="112233445566778899"
                      defaultValue={settings?.discordVerifiedRoleId || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Given to approved KYC users</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Active Client Role ID
                    </label>
                    <input
                      name="discordClientRoleId"
                      type="text"
                      placeholder="112233445566778899"
                      defaultValue={settings?.discordClientRoleId || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Given when user opens an active account</p>
                  </div>
                </div>

                {/* Channel GUI Spawners */}
                <div className="pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                      Public Customer Lobby GUI
                    </h5>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="guiChannelInput"
                        type="text"
                        placeholder="Channel ID"
                        defaultValue={settings?.guiChannelId || ""}
                        className="flex-1 bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
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
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-semibold text-center"
                      >
                        Spawn Lobby
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider">
                      Staff Teller Desk GUI
                    </h5>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        id="staffChannelInput"
                        type="text"
                        placeholder="Channel ID"
                        defaultValue={settings?.staffChannelId || ""}
                        className="flex-1 bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
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
                        className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-xl text-xs font-semibold text-center"
                      >
                        Spawn Staff Desk
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 8: CityCorp & Integrations */}
            <div className={activeTab === "integrations" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                {/* In-Game Provisioning */}
                <div className="bg-black/20 border border-white/5 rounded-xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="text-emerald-400 shrink-0" size={18} />
                      <span className="text-sm font-bold text-white">In-Game Account Auto-Provisioning</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        settings?.autoProvisionInGame
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      }`}
                    >
                      {settings?.autoProvisionInGame ? "⚡ Instant Onboarding" : "🛡️ Staff Review Required"}
                    </span>
                  </div>

                  <label className="flex items-start gap-3 sm:gap-4 cursor-pointer">
                    <div
                      className={`w-11 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors mt-0.5 ${
                        settings?.autoProvisionInGame ? "bg-emerald-500" : "bg-white/15"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          settings?.autoProvisionInGame ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </div>
                    <input
                      type="checkbox"
                      name="autoProvisionInGame"
                      className="hidden"
                      checked={!!settings?.autoProvisionInGame}
                      onChange={(e) =>
                        setSettings({ ...settings, autoProvisionInGame: e.target.checked })
                      }
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">
                        Instantly Provision In-Game CityCorp Accounts on Web Registration
                      </span>
                      <p className="text-[11px] text-white/50">
                        When disabled, new accounts are held in the Staff Desk queue for staff review before in-game creation.
                      </p>
                    </div>
                  </label>
                </div>

                {/* CityCorp Credentials */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      CityCorp Application ID
                    </label>
                    <input
                      name="cityCorpAppId"
                      type="text"
                      placeholder="e.g. 4"
                      defaultValue={settings?.cityCorpAppId || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      CityCorp Unified App Token (Key & Secret)
                    </label>
                    <input
                      name="cityCorpAppSecret"
                      type="password"
                      placeholder="e.g. crp_vance_..."
                      defaultValue={settings?.cityCorpAppSecret || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                        In-Game Corporation Name (CityCorp)
                      </label>
                      <button
                        type="button"
                        onClick={fetchCityCorpName}
                        disabled={fetchingCorp}
                        className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 disabled:opacity-50"
                        title="Query CityCorp API to auto-fill the exact corporation tag"
                      >
                        <RefreshCw size={11} className={fetchingCorp ? "animate-spin" : ""} />
                        <span>{fetchingCorp ? "Detecting…" : "Auto-Detect from API"}</span>
                      </button>
                    </div>
                    <input
                      name="cityCorpOrgName"
                      type="text"
                      placeholder="e.g. VH"
                      value={cityCorpOrgName}
                      onChange={(e) => setCityCorpOrgName(e.target.value)}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">
                      The exact in-game Corporation Name used in Minecraft chat commands (e.g. <code className="text-amber-300">/c account deposit VH &lt;Account&gt; &lt;Amount&gt;</code>).
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Default Corp Subaccount Name
                    </label>
                    <input
                      name="defaultCorpAccount"
                      type="text"
                      placeholder="e.g. Main"
                      defaultValue={settings?.defaultCorpAccount || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-white/40 mt-1">Default sub-account (e.g. Main or Vault) inside this corporation.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/60 mb-1.5 uppercase tracking-wider">
                      Custom CityCorp OAuth URL (Optional)
                    </label>
                    <input
                      name="cityCorpAuthUrl"
                      type="text"
                      placeholder="https://dashboard.cityrp.org/authorize?app_id=..."
                      defaultValue={settings?.cityCorpAuthUrl || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                {/* Redirect Callback URIs Box */}
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                      Required CityCorp OAuth Redirect URI
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `https://${settings?.customDomain?.trim() || window.location.host}/api/auth/citycorp/callback`,
                          "citycorp_cb"
                        )
                      }
                      className="text-xs text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-500/20 px-2.5 py-1 rounded-lg"
                    >
                      {copiedField === "citycorp_cb" ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      {copiedField === "citycorp_cb" ? "Copied" : "Copy URI"}
                    </button>
                  </div>
                  <code className="text-xs text-white font-mono bg-black/40 p-2.5 rounded-xl block break-all select-all border border-white/5">
                    {`https://${settings?.customDomain?.trim() || window.location.host}/api/auth/citycorp/callback`}
                  </code>
                </div>

                {/* Google Docs Automation */}
                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-emerald-400 shrink-0" />
                      <span className="text-sm font-bold text-white">Google Docs Contract Automation</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <div
                        className={`w-9 h-5 shrink-0 rounded-full flex items-center p-0.5 transition-colors ${
                          settings?.enableGoogleDocsContracts ? "bg-emerald-500" : "bg-white/15"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full transition-transform ${
                            settings?.enableGoogleDocsContracts ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </div>
                      <input
                        type="checkbox"
                        name="enableGoogleDocsContracts"
                        className="hidden"
                        checked={!!settings?.enableGoogleDocsContracts}
                        onChange={(e) =>
                          setSettings({ ...settings, enableGoogleDocsContracts: e.target.checked })
                        }
                      />
                      <span className="text-xs text-white/60 font-medium">Enable</span>
                    </label>
                  </div>

                  {settings?.enableGoogleDocsContracts && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in">
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Loan Agreement Template URL</label>
                        <input
                          name="googleDocsLoanTemplateUrl"
                          type="url"
                          placeholder="https://docs.google.com/document/d/..."
                          defaultValue={settings?.googleDocsLoanTemplateUrl || ""}
                          className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Credit Line Agreement Template URL</label>
                        <input
                          name="googleDocsCreditTemplateUrl"
                          type="url"
                          placeholder="https://docs.google.com/document/d/..."
                          defaultValue={settings?.googleDocsCreditTemplateUrl || ""}
                          className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TAB 9: Security & Backups */}
            <div className={activeTab === "security" ? "space-y-4 sm:space-y-6" : "hidden"}>
              <div className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 sm:p-6 space-y-5 shadow-md">
                {/* Security Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  {[
                    { key: "maintenanceMode", label: "Bot Maintenance Mode", desc: "Temporarily disconnects Discord bot", color: "amber" },
                    { key: "requireKyc", label: "Enforce KYC Verification", desc: "Mandates identity before opening ledgers", color: "emerald" },
                    { key: "requirePersonalForBusiness", label: "Personal Before Business", desc: "Citizen must own personal account first", color: "indigo" }
                  ].map((sec) => {
                    const isChecked = !!settings?.[sec.key];
                    return (
                      <label
                        key={sec.key}
                        className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                          isChecked
                            ? "bg-emerald-500/10 border-emerald-500/30 text-white"
                            : "bg-white/[0.02] border-white/5 text-white/70 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{sec.label}</span>
                          <div
                            className={`w-9 h-5 shrink-0 rounded-full flex items-center p-0.5 transition-colors ${
                              isChecked ? "bg-emerald-500" : "bg-white/15"
                            }`}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full transition-transform ${
                                isChecked ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          name={sec.key}
                          className="hidden"
                          checked={isChecked}
                          onChange={(e) => setSettings({ ...settings, [sec.key]: e.target.checked })}
                        />
                        <p className="text-[11px] text-white/40">{sec.desc}</p>
                      </label>
                    );
                  })}
                </div>

                {/* Automated Daily Encrypted Backups */}
                <div className="pt-5 border-t border-white/5 space-y-4 sm:space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Database size={16} className="text-emerald-400 shrink-0" />
                        <span>Automated Daily Encrypted Backups (AES-256-GCM)</span>
                      </h4>
                      <p className="text-xs text-white/50 mt-0.5">
                        Tenant-isolated daily cryptographic exports transmitted to your private Discord webhook.
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        settings?.dailyBackupEnabled
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-white/5 text-white/40"
                      }`}
                    >
                      {settings?.dailyBackupEnabled ? "Active Cron" : "Disabled"}
                    </span>
                  </div>

                  {backupStatusMsg && (
                    <div
                      className={`p-3.5 rounded-xl text-xs font-medium border flex items-center justify-between ${
                        backupStatusMsg.success
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      }`}
                    >
                      <span>{backupStatusMsg.text}</span>
                      <button
                        type="button"
                        onClick={() => setBackupStatusMsg(null)}
                        className="text-white/40 hover:text-white text-xs ml-4"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  <label className="flex items-start gap-3 sm:gap-4 cursor-pointer bg-black/20 p-4 rounded-xl border border-white/5">
                    <div
                      className={`w-11 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors mt-0.5 ${
                        settings?.dailyBackupEnabled ? "bg-emerald-500" : "bg-white/15"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 bg-white rounded-full transition-transform ${
                          settings?.dailyBackupEnabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </div>
                    <input
                      type="checkbox"
                      name="dailyBackupEnabled"
                      className="hidden"
                      checked={!!settings?.dailyBackupEnabled}
                      onChange={(e) =>
                        setSettings({ ...settings, dailyBackupEnabled: e.target.checked })
                      }
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">
                        Enable Automated 24h Encrypted Webhook Snapshots
                      </span>
                      <p className="text-[11px] text-white/50">
                        Exports accounts, customers, ledger history, loans, and credit records into an encrypted{" "}
                        <code className="text-emerald-300 font-mono">.slate.enc</code> file.
                      </p>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide">
                        Backup Discord Webhook URL
                      </label>
                      <input
                        name="backupWebhookUrl"
                        type="text"
                        placeholder="https://discord.com/api/webhooks/..."
                        defaultValue={settings?.backupWebhookUrl || ""}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5 uppercase tracking-wide flex items-center justify-between">
                        <span>Encryption Passphrase</span>
                        <button
                          type="button"
                          onClick={() => setShowPassphrase(!showPassphrase)}
                          className="text-[10px] text-white/40 hover:text-white"
                        >
                          {showPassphrase ? "Hide" : "Reveal"}
                        </button>
                      </label>
                      <input
                        name="backupEncryptionPassphrase"
                        type={showPassphrase ? "text" : "password"}
                        placeholder="Master recovery passphrase"
                        defaultValue={settings?.backupEncryptionPassphrase || ""}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="bg-black/30 p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-white block">Manual Webhook Dispatch</span>
                      <span className="text-[11px] text-white/40">
                        Last Run:{" "}
                        {settings?.lastDailyBackupAt
                          ? new Date(settings.lastDailyBackupAt).toLocaleString()
                          : "Never dispatched"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTriggerBackup}
                        disabled={triggeringBackup}
                        className="flex-1 sm:flex-initial justify-center bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-emerald-900/20"
                      >
                        {triggeringBackup ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        <span>{triggeringBackup ? "Dispatching..." : "Send Webhook"}</span>
                      </button>

                      <a
                        href={`/api/banks/${bank?.id}/backup/download`}
                        download
                        className="flex-1 sm:flex-initial justify-center bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 border border-white/10"
                      >
                        <Download size={13} />
                        <span>Download .enc</span>
                      </a>
                    </div>
                  </div>

                  {/* Decryption Verifier */}
                  <div className="bg-white/[0.01] p-4 rounded-xl border border-white/5 space-y-3">
                    <span className="text-xs font-bold text-white/70 uppercase tracking-wider block">
                      Offline Passphrase Decryption Verifier
                    </span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={testPassphrase}
                        onChange={(e) => setTestPassphrase(e.target.value)}
                        placeholder="Enter passphrase to verify decryption..."
                        className="flex-1 bg-[var(--bg-subtle)] border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleTestPassphrase}
                        disabled={testingPassphrase || !testPassphrase}
                        className="justify-center bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/30 text-xs px-3.5 py-2 rounded-xl font-semibold flex items-center gap-1.5 disabled:opacity-40"
                      >
                        {testingPassphrase ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        <span>Test</span>
                      </button>
                    </div>
                    {testResult && (
                      <div
                        className={`p-3 rounded-xl text-xs border ${
                          testResult.success
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                        }`}
                      >
                        {testResult.text}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Floating Save Action Bar */}
            <div className="sticky bottom-3 sm:bottom-4 z-20 bg-[var(--bg-elevated)]/95 backdrop-blur-md border border-white/15 rounded-2xl p-3 sm:p-4 shadow-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-xs text-white/70 truncate">
                  Editing <strong className="text-white">{activeTabDef.shortLabel}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={loadSettings}
                  disabled={saving}
                  className="px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span className="hidden sm:inline">Reset</span>
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-lg shadow-indigo-600/25 cursor-pointer"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{saving ? "Saving..." : "Save Settings"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
