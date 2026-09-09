import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Layers, Plus, Trash2, Save, Loader2, AlertCircle } from "lucide-react";

export function BankTiers() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (bank?.id) {
      setLoading(true);
      fetch(`/api/banks/${bank.id}/tiers`)
        .then((r) => r.json())
        .then((data) => {
          setTiers(data.accountTiers || []);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [bank]);

  const addTier = () => {
    setTiers([
      ...tiers,
      {
        id: crypto.randomUUID(),
        name: "New Tier",
        description: "",
        type: "personal",
        monthlyFee: 0,
        apyPercent: null,
        transferFeePercent: null,
        depositFeePercent: null,
        withdrawFeePercent: null,
        minBalance: 0,
        creditLimit: 0,
        creditApr: 1999,
        isDefault: tiers.length === 0, // First tier is default
        isPrivate: false,
      },
    ]);
  };

  const removeTier = (id: string) => {
    setTiers(tiers.filter((t) => t.id !== id));
  };

  const updateTier = (id: string, field: string, value: any) => {
    setTiers(
      tiers.map((t) => {
        if (t.id === id) {
          if (field === "isDefault" && value === true) {
            // Only one default tier allowed per type (or overall). Let's just say overall.
            // Wait, actually, a bank can have a default personal and default business.
            // Let's handle that in the UI or backend later. For now, just set it.
            return { ...t, [field]: value };
          }
          return { ...t, [field]: value };
        }
        if (field === "isDefault" && value === true && t.type === tiers.find(x => x.id === id)?.type) {
           return { ...t, isDefault: false }; // Ensure only one default per type
        }
        return t;
      })
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    fetch(`/api/banks/${bank.id}/tiers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountTiers: tiers }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTiers(data.accountTiers || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="text-pink-400" />
            Account Tiers
          </h1>
          <p className="text-white/60 mt-1">Configure distinct account offerings with custom fees and yields to set your bank apart.</p>
        </div>
        <button
          onClick={addTier}
          className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Add Tier
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {tiers.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-white/20 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Account Tiers</h3>
          <p className="text-white/50 mb-6">Create custom account tiers like "Premium Savings" or "Business Pro".</p>
          <button
            onClick={addTier}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus size={16} /> Create First Tier
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {tiers.map((tier, index) => (
              <div key={tier.id} className="bg-[#0f0f15] border border-white/10 rounded-2xl overflow-hidden relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => removeTier(tier.id)}
                    className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Tier Name</label>
                      <input
                        type="text"
                        value={tier.name}
                        onChange={(e) => updateTier(tier.id, "name", e.target.value)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        required
                        placeholder="e.g., Gold Savings"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Description</label>
                      <input
                        type="text"
                        value={tier.description || ""}
                        onChange={(e) => updateTier(tier.id, "description", e.target.value)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        placeholder="e.g., Earn high yield on your balances"
                      />
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Account Type</label>
                        <select
                          value={tier.type}
                          onChange={(e) => updateTier(tier.id, "type", e.target.value)}
                          className="bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="personal">Personal</option>
                          <option value="business">Business</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-4 mt-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tier.isDefault}
                            onChange={(e) => updateTier(tier.id, "isDefault", e.target.checked)}
                            className="rounded bg-[#1a1a24] border-white/10 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-white/80">Default for {tier.type} accounts</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tier.isPrivate || false}
                            onChange={(e) => updateTier(tier.id, "isPrivate", e.target.checked)}
                            className="rounded bg-[#1a1a24] border-white/10 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-white/80" title="Hidden from customers. Staff must assign manually.">Private (Staff Only)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Monthly Fee ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.monthlyFee ? (tier.monthlyFee / 100) : 0}
                        onChange={(e) => updateTier(tier.id, "monthlyFee", Math.floor(parseFloat(e.target.value || "0") * 100))}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Custom APY (%) (Optional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.apyPercent ? (tier.apyPercent / 100) : ""}
                        onChange={(e) => updateTier(tier.id, "apyPercent", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        placeholder="Uses bank default if empty"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Min Balance to Open ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.minBalance ? (tier.minBalance / 100) : 0}
                        onChange={(e) => updateTier(tier.id, "minBalance", Math.floor(parseFloat(e.target.value || "0") * 100))}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-emerald-400 mb-1">Included Credit Limit ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.creditLimit ? (tier.creditLimit / 100) : 0}
                        onChange={(e) => updateTier(tier.id, "creditLimit", Math.floor(parseFloat(e.target.value || "0") * 100))}
                        className="w-full bg-[#1a1a24] border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        placeholder="0 = No Credit Card"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-emerald-400 mb-1">Credit APR (%)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.creditApr !== undefined && tier.creditApr !== null ? (tier.creditApr / 100) : 19.99}
                        onChange={(e) => updateTier(tier.id, "creditApr", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 1999)}
                        className="w-full bg-[#1a1a24] border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Transfer Fee (%) (Optional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.transferFeePercent !== null ? (tier.transferFeePercent / 100) : ""}
                        onChange={(e) => updateTier(tier.id, "transferFeePercent", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        placeholder="Bank default"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Deposit Fee (%) (Optional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.depositFeePercent !== null ? (tier.depositFeePercent / 100) : ""}
                        onChange={(e) => updateTier(tier.id, "depositFeePercent", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        placeholder="Bank default"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Withdraw Fee (%) (Optional)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tier.withdrawFeePercent !== null ? (tier.withdrawFeePercent / 100) : ""}
                        onChange={(e) => updateTier(tier.id, "withdrawFeePercent", e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                        className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        placeholder="Bank default"
                      />
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 px-6 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Configuration
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
