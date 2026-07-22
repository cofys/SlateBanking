import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Search, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink, 
  Sparkles, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp,
  Check,
  ShieldCheck,
  Layers,
  Copy
} from "lucide-react";

interface ConfiguredBank {
  id: string;
  name: string;
  guildId: string;
  corpId: number;
  corpApiUuid: string | null;
  cityCorpAppId: string | null;
  status: string | null;
  logoUrl: string | null;
  customDomain: string | null;
  hasKey: boolean;
}

interface TestResult {
  valid: boolean;
  corpId: number;
  totalAccounts?: number;
  accountsSample?: string[];
  latencyMs: number;
  message: string;
  bankName?: string | null;
}

interface CorpIdFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCorpId?: (corpId: number, bankDetails?: { corpApiUuid?: string; cityCorpAppId?: string; bankName?: string }) => void;
  initialQuery?: string;
}

export function CorpIdFinderModal({ isOpen, onClose, onSelectCorpId, initialQuery = "" }: CorpIdFinderModalProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [testCorpIdInput, setTestCorpIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configuredBanks, setConfiguredBanks] = useState<ConfiguredBank[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchCorpData(searchQuery);
    }
  }, [isOpen]);

  const fetchCorpData = async (queryStr = "", testIdStr = "") => {
    setLoading(true);
    try {
      const url = new URL("/api/banks/corp-finder", window.location.origin);
      if (queryStr) url.searchParams.append("query", queryStr);
      if (testIdStr) url.searchParams.append("testCorpId", testIdStr);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setConfiguredBanks(data.configuredBanks || []);
        setSearchResults(data.searchResults || []);
        if (data.testResult) {
          setTestResult(data.testResult);
        }
      }
    } catch (e) {
      console.error("Error fetching Corp ID finder data:", e);
    } finally {
      setLoading(false);
      setTesting(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCorpData(searchQuery, testCorpIdInput);
  };

  const handleInspectCorpId = () => {
    if (!testCorpIdInput || isNaN(Number(testCorpIdInput))) return;
    setTesting(true);
    fetchCorpData(searchQuery, testCorpIdInput);
  };

  const handleCopy = (id: number) => {
    navigator.clipboard.writeText(id.toString());
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelect = (bank: ConfiguredBank) => {
    if (onSelectCorpId) {
      onSelectCorpId(bank.corpId, {
        corpApiUuid: bank.corpApiUuid || undefined,
        cityCorpAppId: bank.cityCorpAppId || undefined,
        bankName: bank.name
      });
    }
    onClose();
  };

  if (!isOpen) return null;

  const filteredBanks = configuredBanks.filter(b => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      b.corpId.toString().includes(q) ||
      (b.cityCorpAppId && b.cityCorpAppId.toLowerCase().includes(q)) ||
      (b.guildId && b.guildId.includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0e0e13] border border-white/10 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Building2 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Corporation ID Finder</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full flex items-center gap-1">
                  <Sparkles size={10} /> CityCorp Gateway
                </span>
              </div>
              <p className="text-xs text-white/50">Look up, test, and auto-fill CityCorp Corporation IDs across Slate SaaS.</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          
          {/* Search & Test Controls */}
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-3 text-white/40" size={18} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Bank Name, Corporation ID #, or Application ID..."
                className="w-full pl-10 pr-24 py-2.5 bg-[#16161f] border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-2 top-1.5 px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : "Search"}
              </button>
            </div>
          </form>

          {/* Quick Inspector Box */}
          <div className="bg-[#14141d] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-400" /> Live CityCorp ID Verifier & Inspector
              </span>
              <span className="text-[11px] text-white/40">Ping api.cityrp.org directly</span>
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="number"
                value={testCorpIdInput}
                onChange={(e) => setTestCorpIdInput(e.target.value)}
                placeholder="Enter Corp ID # to inspect (e.g. 42)"
                className="flex-1 px-3 py-2 bg-[#0a0a0d] border border-white/10 rounded-lg text-xs text-white placeholder-white/30 font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                disabled={testing || !testCorpIdInput}
                onClick={handleInspectCorpId}
                className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {testing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={13} />}
                Verify Corp ID
              </button>
            </div>

            {testResult && (
              <div className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                testResult.valid 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" 
                  : "bg-amber-500/10 border-amber-500/30 text-amber-200"
              }`}>
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    {testResult.valid ? <CheckCircle2 size={15} className="text-emerald-400" /> : <AlertCircle size={15} className="text-amber-400" />}
                    Corporation ID #{testResult.corpId} Status
                  </span>
                  <span className="font-mono text-[10px] opacity-70">{testResult.latencyMs}ms latency</span>
                </div>
                <p className="opacity-90">{testResult.message}</p>
                {testResult.accountsSample && testResult.accountsSample.length > 0 && (
                  <div className="pt-1 border-t border-white/10 flex flex-wrap gap-1 items-center text-[11px]">
                    <span className="opacity-70 font-medium">Sample Accounts:</span>
                    {testResult.accountsSample.map((acc, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-black/30 border border-white/10 rounded font-mono text-[10px]">
                        {acc}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Network Bank List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-indigo-400" /> Provisioned Network Corporations ({filteredBanks.length})
              </h3>
              <span className="text-[11px] text-white/40">Click any Corp ID to apply</span>
            </div>

            {loading && configuredBanks.length === 0 ? (
              <div className="py-12 text-center text-white/40 text-xs">
                <Loader2 size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
                Scanning CityCorp network registry...
              </div>
            ) : filteredBanks.length === 0 ? (
              <div className="p-8 text-center bg-[#14141d] border border-white/5 rounded-xl text-white/40 text-xs space-y-2">
                <Building2 size={24} className="mx-auto text-white/20" />
                <p>No configured banks found matching your search query.</p>
                <p className="text-[11px] text-white/30">You can use the Corp ID Inspector above to test candidate numeric IDs directly.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredBanks.map((bank) => (
                  <div 
                    key={bank.id} 
                    className="p-3.5 bg-[#14141d] hover:bg-[#1a1a26] border border-white/10 hover:border-indigo-500/40 rounded-xl transition-all space-y-2.5 group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sm text-white group-hover:text-indigo-300 transition-colors">
                          {bank.name}
                        </div>
                        <div className="text-[11px] text-white/50 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>Guild: {bank.guildId}</span>
                          {bank.cityCorpAppId && <span>• App ID #{bank.cityCorpAppId}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(bank.corpId)}
                          className="p-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-md text-xs transition-colors"
                          title="Copy Corp ID"
                        >
                          {copiedId === bank.corpId ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-white/50">Corp ID:</span>
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded font-mono font-bold">
                          #{bank.corpId}
                        </span>
                      </div>

                      {onSelectCorpId && (
                        <button
                          type="button"
                          onClick={() => handleSelect(bank)}
                          className="px-2.5 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Check size={12} /> Apply Corp ID
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Guide / How to Find Corp ID */}
          <div className="border border-white/10 rounded-xl overflow-hidden bg-[#12121a]">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="w-full px-4 py-3 text-left flex items-center justify-between text-xs font-medium text-white/80 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <HelpCircle size={15} className="text-indigo-400" /> Where do I locate my CityCorp Corporation ID?
              </span>
              {showGuide ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showGuide && (
              <div className="p-4 border-t border-white/10 text-xs text-white/70 space-y-3 bg-[#0a0a0e]">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  <div>
                    <strong className="text-white">CityCorp Developer Portal:</strong> Log in to <a href="https://dashboard.cityrp.org" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-0.5">dashboard.cityrp.org <ExternalLink size={10} /></a> and navigate to your registered Corporation profile. Your numeric Corporation ID is listed under API Settings.
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  <div>
                    <strong className="text-white">In-Game Minecraft Command:</strong> Execute <code className="px-1 py-0.5 bg-black/40 text-emerald-300 rounded font-mono text-[11px]">/corp info</code> or <code className="px-1 py-0.5 bg-black/40 text-emerald-300 rounded font-mono text-[11px]">/corp status</code> on the CityRP Minecraft server.
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                  <div>
                    <strong className="text-white">Discord Bot Integration Webhook:</strong> When your bank Discord bot was first invited, CityCorp sends a welcome embed containing your <code className="px-1 py-0.5 bg-black/40 text-amber-300 rounded font-mono text-[11px]">corp_id</code> parameter.
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#121218] border-t border-white/10 flex items-center justify-between text-xs text-white/50">
          <span>Need help connecting? Contact Slate Network Engineers in Discord.</span>
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors cursor-pointer font-medium"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
