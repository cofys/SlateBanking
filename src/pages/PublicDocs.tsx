import { useState } from "react";
import { BookOpen, Terminal, Shield, Zap, Code2, Copy, Check, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export function PublicDocs() {
  const [activeTab, setActiveTab] = useState("overview");
  const [copiedScript, setCopiedScript] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(id);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white font-sans selection:bg-blue-500/30">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
               <BookOpen size={16} className="text-white" />
             </div>
             <span className="font-bold text-lg tracking-tight">Slate Developer API</span>
          </div>
          <div className="flex items-center gap-4">
             <Link to="/portal" className="text-sm font-medium text-white/60 hover:text-white transition-colors">Citizen Portal</Link>
             <Link to="/" className="text-sm font-medium text-white/60 hover:text-white transition-colors">SaaS Gateway</Link>
             <a href="mailto:support@slate.saas" className="text-sm font-medium bg-white/10 hover:bg-white/15 px-4 py-2 rounded-lg transition-colors">Get API Key</a>
          </div>
        </div>
      </nav>

      {/* Main Content Layout */}
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row gap-12 items-start">
         
         {/* Sidebar Navigation */}
         <aside className="w-full md:w-64 flex-shrink-0 space-y-8 sticky top-32">
            <div>
               <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 px-3">Getting Started</h4>
               <nav className="space-y-1">
                  <button onClick={() => setActiveTab('overview')} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${activeTab === 'overview' ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                     Overview {activeTab === 'overview' && <ChevronRight size={14} />}
                  </button>
                  <button onClick={() => setActiveTab('auth')} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${activeTab === 'auth' ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                     Authentication {activeTab === 'auth' && <ChevronRight size={14} />}
                  </button>
               </nav>
            </div>

            <div>
               <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 px-3">Onyx Network</h4>
               <nav className="space-y-1">
                  <button onClick={() => setActiveTab('onyx-payments')} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${activeTab === 'onyx-payments' ? 'bg-indigo-500/10 text-indigo-400 font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                     Checkout API {activeTab === 'onyx-payments' && <ChevronRight size={14} />}
                  </button>
               </nav>
            </div>

            <div>
               <h4 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-4 px-3">Bank API</h4>
               <nav className="space-y-1">
                  <button onClick={() => setActiveTab('bank-accounts')} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${activeTab === 'bank-accounts' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                     Accounts & Balances {activeTab === 'bank-accounts' && <ChevronRight size={14} />}
                  </button>
                  <button onClick={() => setActiveTab('bank-transfers')} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${activeTab === 'bank-transfers' ? 'bg-emerald-500/10 text-emerald-400 font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}>
                     Internal Transfers {activeTab === 'bank-transfers' && <ChevronRight size={14} />}
                  </button>
               </nav>
            </div>
         </aside>

         {/* Documentation Body */}
         <main className="flex-1 min-w-0 pb-32">
            {activeTab === 'overview' && (
               <div className="animate-in fade-in duration-500">
                  <h1 className="text-4xl font-bold tracking-tight mb-4">Welcome to Slate API</h1>
                  <p className="text-lg text-white/60 mb-8 leading-relaxed">
                     Build financial integrations, automate payments across roleplay servers, or integrate full banking infrastructures directly into your Discord bots and Minecraft servers.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                     <div className="bg-[#121216] border border-white/5 rounded-2xl p-6 hover:border-blue-500/30 transition-colors">
                        <Terminal className="text-blue-400 mb-4" size={24} />
                        <h3 className="text-lg font-bold mb-2">Restful Architecture</h3>
                        <p className="text-sm text-white/50 leading-relaxed">Standard HTTP endpoints utilizing JSON payloads and Bearer token / API Key authentication headers.</p>
                     </div>
                     <div className="bg-[#121216] border border-white/5 rounded-2xl p-6 hover:border-indigo-500/30 transition-colors">
                        <Zap className="text-indigo-400 mb-4" size={24} />
                        <h3 className="text-lg font-bold mb-2">Onyx Cross-Routing</h3>
                        <p className="text-sm text-white/50 leading-relaxed">Process checkouts and charge customers regardless of what participating bank they use via the central Onyx Network.</p>
                     </div>
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight mt-12 mb-6 border-b border-white/5 pb-4">Base URL</h2>
                  <div className="bg-black/50 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                     <code className="text-blue-400 font-mono">https://api.slate.saas/api/</code>
                     <button onClick={() => handleCopy('https://api.slate.saas/api/', 'base')} className="text-white/40 hover:text-white transition-colors">
                        {copiedScript === 'base' ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                     </button>
                  </div>
               </div>
            )}

            {activeTab === 'auth' && (
               <div className="animate-in fade-in duration-500">
                  <h1 className="text-4xl font-bold tracking-tight mb-4">Authentication</h1>
                  <p className="text-lg text-white/60 mb-8 leading-relaxed">
                     Slate supports two separate authentication schemes depending on the layer of the platform you are interacting with.
                  </p>

                  <div className="space-y-8">
                     <div className="bg-[#121216] border border-white/5 rounded-2xl p-8">
                        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-6">
                           <Shield className="text-indigo-400" size={24} />
                           <div>
                              <h3 className="text-xl font-bold">Onyx Merchant API Key</h3>
                              <p className="text-sm text-white/50">For cross-bank checkouts & payment processing</p>
                           </div>
                        </div>
                        <p className="text-white/70 text-sm mb-6 leading-relaxed">
                           Used exclusively for the <code className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">/onyx/checkout</code> endpoint. You must pass this key within the <code className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">x-api-key</code> header. You can obtain an Onyx key from the global SaaS administrators.
                        </p>
                        <div className="bg-black/50 border border-white/10 rounded-lg p-4 font-mono text-sm text-white/60">
                           x-api-key: onyx_live_728b9c...
                        </div>
                     </div>

                     <div className="bg-[#121216] border border-white/5 rounded-2xl p-8">
                        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-6">
                           <Code2 className="text-emerald-400" size={24} />
                           <div>
                              <h3 className="text-xl font-bold">Bank Developer Secret Key</h3>
                              <p className="text-sm text-white/50">For internal bank management & specific bank querying</p>
                           </div>
                        </div>
                        <p className="text-white/70 text-sm mb-6 leading-relaxed">
                           Used for managing accounts, credit cards, and isolated databases within a specific tenant bank. You must pass this using the standard <code className="bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">Authorization: Bearer</code> header. Obtain this key from your specific Bank's Admin Dashboard under the Developer tab.
                        </p>
                        <div className="bg-black/50 border border-white/10 rounded-lg p-4 font-mono text-sm text-white/60">
                           Authorization: Bearer sk_live_839f2...
                        </div>
                     </div>
                  </div>
               </div>
            )}

            {activeTab === 'onyx-payments' && (
               <div className="animate-in fade-in duration-500">
                  <div className="flex items-center gap-3 mb-4">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 px-3 py-1 rounded border border-rose-400/20">POST</span>
                     <h1 className="text-3xl font-bold font-mono tracking-tight text-white/90">/onyx/checkout</h1>
                  </div>
                  <p className="text-lg text-white/60 mb-8 leading-relaxed">
                     Charge any user across the entire network by routing funds through the central clearinghouse. This API is stateless and synchronous. It deducts the funds from the user's account and credits the merchant's predefined destination account instantly.
                  </p>

                  <h3 className="text-lg font-bold mb-4 border-b border-white/5 pb-2">Request Body (JSON)</h3>
                  <div className="bg-[#121216] border border-white/10 rounded-xl overflow-hidden mb-8">
                     <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
                           <tr>
                              <th className="px-6 py-4 font-medium">Field</th>
                              <th className="px-6 py-4 font-medium">Type</th>
                              <th className="px-6 py-4 font-medium">Description</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                           <tr>
                              <td className="px-6 py-4 font-mono text-indigo-300">userDiscordId</td>
                              <td className="px-6 py-4 text-white/50">String</td>
                              <td className="px-6 py-4 text-white/80">The Discord ID of the user purchasing the item. The network will pull funds from their default account.</td>
                           </tr>
                           <tr>
                              <td className="px-6 py-4 font-mono text-indigo-300">amountCents</td>
                              <td className="px-6 py-4 text-white/50">Integer</td>
                              <td className="px-6 py-4 text-white/80">The total cost of the transaction in cents (e.g. 500 for $5.00).</td>
                           </tr>
                           <tr>
                              <td className="px-6 py-4 font-mono text-white/60">description</td>
                              <td className="px-6 py-4 text-white/50">String</td>
                              <td className="px-6 py-4 text-white/80"><span className="text-xs border border-white/10 text-white/40 px-1 py-0.5 rounded mr-2">Optional</span> Memo for the transaction log.</td>
                           </tr>
                           <tr>
                              <td className="px-6 py-4 font-mono text-white/60">sourceAccountId</td>
                              <td className="px-6 py-4 text-white/50">String</td>
                              <td className="px-6 py-4 text-white/80"><span className="text-xs border border-white/10 text-white/40 px-1 py-0.5 rounded mr-2">Optional</span> Bypass the discord lookup and charge a specific UUID account directly.</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>

                  <h3 className="text-lg font-bold mb-4 border-b border-white/5 pb-2">Example Usage</h3>
                  <div className="relative mb-12">
                     <div className="absolute top-4 right-4 z-10 flex gap-2">
                        <span className="text-xs font-mono uppercase text-white/40 bg-white/5 px-2 py-1 rounded">cURL</span>
                     </div>
                     <pre className="bg-[#121216] border border-white/10 p-6 rounded-xl overflow-x-auto text-sm font-mono leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST https://api.slate.saas/api/onyx/checkout \
  -H <span className="text-amber-400">"Content-Type: application/json"</span> \
  -H <span className="text-amber-400">"x-api-key: onyx_live_728b9c..."</span> \
  -d <span className="text-amber-400">'{'{'}
  "userDiscordId": "184920391029",
  "amountCents": 1500,
  "description": "Premium VIP Rank Purchase"
{'}'}'</span>
                     </pre>
                  </div>

                  <h3 className="text-lg font-bold mb-4 border-b border-white/5 pb-2">Response</h3>
                  <pre className="bg-[#121216] border border-white/10 p-6 rounded-xl overflow-x-auto text-sm font-mono text-emerald-300 leading-relaxed">
{'{'}
  "success": true,
  "transactionId": "tx_9d8f7a...",
  "status": "APPROVED",
  "clearinghouse": false
{'}'}
                  </pre>
               </div>
            )}

            {activeTab === 'bank-accounts' && (
               <div className="animate-in fade-in duration-500">
                  <div className="flex items-center gap-3 mb-4">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded border border-emerald-400/20">GET</span>
                     <h1 className="text-3xl font-bold font-mono tracking-tight text-white/90">/v1/accounts</h1>
                  </div>
                  <p className="text-lg text-white/60 mb-8 leading-relaxed">
                     Retrieve an array of all bank accounts belonging to your specific bank. Requires Bank Developer API key.
                  </p>

                  <div className="relative mb-12">
                     <pre className="bg-[#121216] border border-white/10 p-6 rounded-xl overflow-x-auto text-sm font-mono leading-relaxed">
<span className="text-emerald-400">curl</span> https://api.slate.saas/api/v1/accounts \
  -H <span className="text-amber-400">"Authorization: Bearer sk_live_..."</span>
                     </pre>
                  </div>

                  <div className="flex items-center gap-3 mb-4 mt-12">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 px-3 py-1 rounded border border-rose-400/20">POST</span>
                     <h1 className="text-3xl font-bold font-mono tracking-tight text-white/90">/v1/accounts</h1>
                  </div>
                  <p className="text-lg text-white/60 mb-8 leading-relaxed">
                     Programmatically open a new account for a Discord user within your bank. Returns the generated account UUID.
                  </p>

                  <div className="relative mb-12">
                     <pre className="bg-[#121216] border border-white/10 p-6 rounded-xl overflow-x-auto text-sm font-mono leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST https://api.slate.saas/api/v1/accounts \
  -H <span className="text-amber-400">"Content-Type: application/json"</span> \
  -H <span className="text-amber-400">"Authorization: Bearer sk_live_..."</span> \
  -d <span className="text-amber-400">'{'{'}
  "discordId": "88402920202",
  "initialDeposit": 100000,
  "type": "checking",
  "accountName": "Business Holdings"
{'}'}'</span>
                     </pre>
                  </div>
               </div>
            )}

            {activeTab === 'bank-transfers' && (
               <div className="animate-in fade-in duration-500">
                  <div className="flex items-center gap-3 mb-4">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 px-3 py-1 rounded border border-rose-400/20">POST</span>
                     <h1 className="text-3xl font-bold font-mono tracking-tight text-white/90">/v1/transfers</h1>
                  </div>
                  <p className="text-lg text-white/60 mb-8 leading-relaxed">
                     Move funds securely between any two accounts within your bank. Bypasses standard overdraft limits if executed via API, allowing custom loan tools.
                  </p>

                  <div className="relative mb-12">
                     <pre className="bg-[#121216] border border-white/10 p-6 rounded-xl overflow-x-auto text-sm font-mono leading-relaxed">
<span className="text-emerald-400">curl</span> -X POST https://api.slate.saas/api/v1/transfers \
  -H <span className="text-amber-400">"Content-Type: application/json"</span> \
  -H <span className="text-amber-400">"Authorization: Bearer sk_live_..."</span> \
  -d <span className="text-amber-400">'{'{'}
  "fromAccountId": "uuid-1234",
  "toAccountId": "uuid-5678",
  "amount": "250.00",
  "description": "Invoice Payout API"
{'}'}'</span>
                     </pre>
                  </div>
               </div>
            )}
         </main>
      </div>
    </div>
  );
}
