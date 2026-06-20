import { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Plus, Trash2, Search } from "lucide-react";

export function BankAccounts() {
  const { bank } = useOutletContext<{ bank: any }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAccounts = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/accounts`)
      .then(r => r.json())
      .then(data => {
        setAccounts(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (bank?.id) fetchAccounts();
  }, [bank]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.target as HTMLFormElement);
    const data = {
      accountName: formData.get("accountName"),
      ownerDiscordId: formData.get("ownerDiscordId"),
      minecraftUsername: formData.get("minecraftUsername"),
      initialBalanceCents: Math.round(parseFloat(formData.get("initialBalance") as string) * 100) || 0
    };

    fetch(`/api/banks/${bank.id}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(async (res) => {
      setSubmitting(false);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to create account");
        return;
      }
      setShowAdd(false);
      fetchAccounts();
    });
  };

  const handleDelete = (accountId: string) => {
    if (confirm("Are you sure you want to delete this account?")) {
      fetch(`/api/banks/${bank.id}/accounts/${accountId}`, { method: "DELETE" })
        .then(() => fetchAccounts());
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customer Accounts</h2>
          <p className="text-white/60 text-sm mt-1">Manage active banking accounts for {bank.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} />
            <input 
              type="text" 
              placeholder="Search accounts..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#1a1a24] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors w-64"
            />
          </div>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> Open Account
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-[#0f0f15] border border-white/10 p-6 rounded-xl mb-8 flex flex-col items-start gap-4">
          <h3 className="text-lg font-medium">Provision New Account</h3>
          <form onSubmit={handleAdd} className="w-full flex gap-4 md:items-end flex-col md:flex-row">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Account Name</label>
              <input name="accountName" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Checking" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Owner Discord ID</label>
              <input name="ownerDiscordId" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="123456789" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">MC Username</label>
              <input name="minecraftUsername" required type="text" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="Notch" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Initial Balance ($)</label>
              <input name="initialBalance" type="number" step="0.01" defaultValue="0.00" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
            </div>
            <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
              <button disabled={submitting} type="submit" className="flex-1 bg-white/10 hover:bg-white/20 whitespace-nowrap px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                {submitting ? "Processing..." : "Create"}
              </button>
              <button disabled={submitting} type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#0f0f15] border border-white/10 rounded-xl overflow-hidden overflow-x-auto">
        {loading ? (
           <div className="p-8 text-center text-white/50">Loading accounts...</div>
        ) : accounts.length === 0 ? (
           <div className="p-8 text-center text-white/50">No accounts found. Provision one to get started.</div>
        ) : (
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="text-xs text-white/40 uppercase tracking-widest bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 font-medium">Account Name</th>
                <th className="px-6 py-4 font-medium">Owner Discord ID</th>
                <th className="px-6 py-4 font-medium text-right">Balance</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {accounts.filter(acc => 
                acc.accountName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                acc.ownerDiscordId.includes(searchTerm) ||
                acc.id.includes(searchTerm)
              ).map(acc => (
                <tr key={acc.id} onClick={() => navigate(`/bank/${bank.id}/accounts/${acc.id}`)} className="hover:bg-white/5 transition-colors cursor-pointer group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-white group-hover:text-indigo-300 transition-colors">{acc.accountName}</div>
                    <div className="text-xs text-white/40 font-mono mt-1">{acc.id.split('-')[0]}...</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-white/60">
                    {acc.ownerDiscordId}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                    ${(acc.balance / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(acc.id); }}
                      className="text-red-400 hover:bg-red-400/20 p-2 rounded transition-colors"
                      title="Delete account"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
