import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Code2, Key, Server, Copy, Check, Eye, EyeOff, Loader2 } from "lucide-react";

export function BankDeveloper() {
  const { bank } = useOutletContext<{ bank: any }>();
  
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [webhookSecretVisible, setWebhookSecretVisible] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchKeys = async () => {
    try {
      const res = await fetch(`/api/banks/${bank.id}/developer`);
      const data = await res.json();
      setApiKey(data.apiKey);
        setWebhookSecret(data.webhookSecret);
        setWebhookUrl(data.apiWebhookUrl || "");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bank?.id) fetchKeys();
  }, [bank]);

  const rollKeys = async () => {
    if (confirm("Are you sure? This will invalidate your existing keys and break current integrations immediately.")) {
       setLoading(true);
       try {
         const res = await fetch(`/api/banks/${bank.id}/developer/roll`, { method: "POST" });
         const data = await res.json();
         setApiKey(data.apiKey);
         setWebhookSecret(data.webhookSecret);
         alert("Secret keys have been rolled successfully.");
       } catch (e) {
         console.error(e);
       } finally {
         setLoading(false);
       }
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading && !apiKey) return <div className="p-8 text-center text-white/50 animate-pulse">Loading developer settings...</div>;

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Developer API</h2>
        <p className="text-white/60 text-sm mt-1">Integrate {bank?.name || 'your bank'} directly into other services and stores.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* API Keys Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Key className="text-indigo-400" size={24} />
              <h3 className="text-xl font-bold">API Credentials</h3>
            </div>
            <p className="text-white/60 text-sm mb-8">
              Use these keys to authenticate API requests. Keep your secret keys safe and do not share them publicly.
            </p>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Live Secret Key</label>
                <div className="flex bg-[#1a1a24] border border-white/10 rounded-lg overflow-hidden">
                  <div className="flex-1 px-4 py-3 font-mono text-sm flex items-center">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin text-white/50" /> : (apiKeyVisible ? apiKey : "sk_live_" + "•".repeat(32))}
                  </div>
                  <button disabled={loading} onClick={() => setApiKeyVisible(!apiKeyVisible)} className="px-4 text-white/50 hover:text-white border-l border-white/10 transition-colors">
                    {apiKeyVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button disabled={loading} onClick={() => handleCopy(apiKey, 'apiKey')} className="px-4 text-white/50 hover:text-white border-l border-white/10 transition-colors flex items-center gap-2">
                    {copiedKey === 'apiKey' ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Webhook Secret</label>
                <div className="flex bg-[#1a1a24] border border-white/10 rounded-lg overflow-hidden">
                  <div className="flex-1 px-4 py-3 font-mono text-sm flex items-center">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin text-white/50" /> : (webhookSecretVisible ? webhookSecret : "whsec_" + "•".repeat(32))}
                  </div>
                  <button disabled={loading} onClick={() => setWebhookSecretVisible(!webhookSecretVisible)} className="px-4 text-white/50 hover:text-white border-l border-white/10 transition-colors">
                    {webhookSecretVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button disabled={loading} onClick={() => handleCopy(webhookSecret, 'whsec')} className="px-4 text-white/50 hover:text-white border-l border-white/10 transition-colors flex items-center gap-2">
                    {copiedKey === 'whsec' ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                  </button>
                </div>
                <p className="text-xs text-white/40 mt-2">Used to verify that webhooks were sent by us.</p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              <button disabled={loading} onClick={rollKeys} className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                Roll Secret Keys
              </button>
            </div>
          </div>

          <div className="bg-[#0f0f15] border border-white/10 rounded-xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Server className="text-emerald-400" size={24} />
              <h3 className="text-xl font-bold">Webhooks</h3>
            </div>
            
            
            <div className="bg-[#1a1a24] border border-white/10 rounded-lg p-6">
              <h4 className="text-sm font-bold mb-4">Webhook Endpoint URL</h4>
              <div className="flex gap-2 mb-4">
                <input 
                  type="url" 
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="https://api.yourdomain.com/webhooks/slate"
                />
                <button 
                  onClick={async () => {
                     try {
                        const res = await fetch(`/api/banks/${bank.id}/developer`, {
                           method: "POST",
                           headers: { "Content-Type": "application/json" },
                           body: JSON.stringify({ apiWebhookUrl: webhookUrl })
                        });
                        if (res.ok) alert("Webhook URL saved successfully.");
                        else alert("Failed to save webhook URL.");
                     } catch(e) {
                        alert("Error saving webhook URL.");
                     }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Save URL
                </button>
              </div>
              <p className="text-white/50 text-xs leading-relaxed">
                We will send POST requests to this URL for all events occurring in your bank, such as new accounts, transactions, or card issuing. Ensure you verify the signature using your Webhook Secret.
              </p>
            </div>

          </div>
        </div>

        {/* Documentation Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-[#1a1a24] border border-white/10 rounded-xl p-6 sticky top-6">
            <div className="flex items-center gap-3 mb-4">
              <Code2 className="text-indigo-400" size={20} />
              <h3 className="text-lg font-bold">API Documentation</h3>
            </div>
            <p className="text-white/60 text-sm mb-6">
              Interact with your bank programmatically. All requests must include the <code className="bg-white/10 px-1 rounded">Authorization: Bearer sk_live_...</code> header.
            </p>

            <div className="space-y-4">
              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">GET</span>
                    <span className="text-sm font-mono">/v1/accounts</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">List all bank accounts in this bank.</p>
                  <div className="bg-black/50 p-3 rounded-lg font-mono text-xs overflow-x-auto text-white/50">
                    <span className="text-emerald-400">curl</span> https://api.slate.saas/api/v1/accounts \<br/>
                    &nbsp;&nbsp;-H <span className="text-amber-400">"Authorization: Bearer sk_live_..."</span>
                  </div>
                </div>
              </details>

              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">GET</span>
                    <span className="text-sm font-mono w-full break-all">/v1/accounts/:id</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">Retrieve a single account by ID.</p>
                </div>
              </details>
              
              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">POST</span>
                    <span className="text-sm font-mono">/v1/accounts</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">Open a new account for a Discord user.</p>
                  <div className="bg-black/50 p-3 rounded-lg font-mono text-xs overflow-x-auto text-white/50">
                    <span className="text-emerald-400">curl</span> -X POST https://api.slate.saas/api/v1/accounts \<br/>
                    &nbsp;&nbsp;-H <span className="text-amber-400">"Content-Type: application/json"</span> \<br/>
                    &nbsp;&nbsp;-d <span className="text-amber-400">'&#123;"discordId": "123", "initialDeposit": 500, "type": "checking", "accountName": "Expenses"&#125;'</span>
                  </div>
                </div>
              </details>

              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">POST</span>
                    <span className="text-sm font-mono">/v1/transfers</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">Execute a transfer between any two accounts.</p>
                  <div className="bg-black/50 p-3 rounded-lg font-mono text-xs overflow-x-auto text-white/50">
                    <span className="text-emerald-400">curl</span> -X POST https://api.slate.saas/api/v1/transfers \<br/>
                    &nbsp;&nbsp;-H <span className="text-amber-400">"Content-Type: application/json"</span> \<br/>
                    &nbsp;&nbsp;-d <span className="text-amber-400">'&#123;"fromAccountId": "...", "toAccountId": "...", "amount": "50.00", "description": "Payment"&#125;'</span>
                  </div>
                </div>
              </details>

              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">GET</span>
                    <span className="text-sm font-mono">/v1/transactions</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">List recent transactions for the bank.</p>
                  <div className="bg-black/50 p-3 rounded-lg font-mono text-xs overflow-x-auto text-white/50">
                    <span className="text-emerald-400">curl</span> https://api.slate.saas/api/v1/transactions \<br/>
                    &nbsp;&nbsp;-H <span className="text-amber-400">"Authorization: Bearer sk_live_..."</span>
                  </div>
                </div>
              </details>

              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-400/20">GET</span>
                    <span className="text-sm font-mono">/v1/cards</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">List all credit and debit cards issued by the bank.</p>
                </div>
              </details>
              
              <details className="group bg-black/20 border border-white/10 rounded-lg open:shadow-lg open:bg-black/30 transition-all">
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-medium">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded border border-rose-400/20">POST</span>
                    <span className="text-sm font-mono">/v1/cards</span>
                  </div>
                </summary>
                <div className="px-4 pb-4 text-sm text-white/70">
                  <p className="mb-3 border-t border-white/5 pt-3">Issue a new card for an existing account.</p>
                  <div className="bg-black/50 p-3 rounded-lg font-mono text-xs overflow-x-auto text-white/50">
                    <span className="text-emerald-400">curl</span> -X POST https://api.slate.saas/api/v1/cards \<br/>
                    &nbsp;&nbsp;-H <span className="text-amber-400">"Content-Type: application/json"</span> \<br/>
                    &nbsp;&nbsp;-d <span className="text-amber-400">'&#123;"accountId": "...", "type": "debit"&#125;'</span>
                  </div>
                </div>
              </details>

              <a href="/docs" target="_blank" className="mt-6 block text-center w-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 font-medium py-3 rounded-xl transition-all text-sm">
                View Full Documentation &rarr;
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
