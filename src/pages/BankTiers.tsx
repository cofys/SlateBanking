import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Layers, Plus, Trash2, Save, Loader2, AlertCircle, ShieldAlert, Sliders, Users, Ban } from "lucide-react";

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
        autoApproveLoans: false,
        autoApproveCreditCards: false,
        maxAutoApproveLoanAmount: 1000000,
        isDefault: tiers.length === 0, // First tier is default
        isPrivate: false,
        maxAccountsPerUser: null,
        exclusiveGroup: null,
        mutuallyExclusiveTierIds: [],
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
              <div key={tier.id} className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl overflow-hidden relative group">
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                        placeholder="e.g., Earn high yield on your balances"
                      />
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1">Account Type</label>
                        <select
                          value={tier.type}
                          onChange={(e) => updateTier(tier.id, "type", e.target.value)}
                          className="bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                            className="rounded bg-[var(--bg-subtle)] border-white/10 text-indigo-500 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-white/80">Default for {tier.type} accounts</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tier.isPrivate || false}
                            onChange={(e) => updateTier(tier.id, "isPrivate", e.target.checked)}
                            className="rounded bg-[var(--bg-subtle)] border-white/10 text-indigo-500 focus:ring-indigo-500"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Custom Tier Prefix (Optional)</label>
                      <input
                        type="text"
                        value={tier.customPrefix || ""}
                        onChange={(e) => updateTier(tier.id, "customPrefix", e.target.value)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-indigo-500 focus:outline-none"
                        placeholder="Inherits bank setting (e.g. VIP-)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1">Naming Mode Override (Optional)</label>
                      <select
                        value={tier.namingMode || ""}
                        onChange={(e) => updateTier(tier.id, "namingMode", e.target.value || null)}
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Inherit Bank Setting</option>
                        {tier.type === "business" ? (
                          <>
                            <option value="business_name">Registered Business Entity Name</option>
                            <option value="discord_plus_business">Discord Owner + Business Name</option>
                          </>
                        ) : (
                          <>
                            <option value="custom">Customer Chooses Name</option>
                            <option value="discord_username">Automatic Discord Username</option>
                            <option value="choice_or_username">Allow Citizen Choice</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Tier Holding Limits & Exclusivity (Prevent hoarding & enforce one-or-other policies) */}
                  <div className="lg:col-span-4 bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <ShieldAlert size={16} className="text-amber-400" />
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Account Holding Limits & Exclusivity Rules</h4>
                      </div>
                      <span className="text-[11px] text-white/40">Prevent account hoarding and set mutual exclusivity</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Max Accounts per Citizen */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-white/80">Max Accounts per Citizen</label>
                          <span className="text-[10px] font-mono text-amber-300">
                            {tier.maxAccountsPerUser ? `${tier.maxAccountsPerUser} max` : "Unlimited"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="1"
                            value={tier.maxAccountsPerUser ?? ""}
                            onChange={(e) => updateTier(tier.id, "maxAccountsPerUser", e.target.value ? parseInt(e.target.value, 10) : null)}
                            className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                            placeholder="Unlimited"
                          />
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => updateTier(tier.id, "maxAccountsPerUser", 1)}
                              className={`px-2 py-1 text-xs rounded border transition-colors ${tier.maxAccountsPerUser === 1 ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold" : "bg-white/5 border-white/10 text-white/50 hover:text-white"}`}
                              title="Limit to 1 account per citizen"
                            >
                              1
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTier(tier.id, "maxAccountsPerUser", 2)}
                              className={`px-2 py-1 text-xs rounded border transition-colors ${tier.maxAccountsPerUser === 2 ? "bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold" : "bg-white/5 border-white/10 text-white/50 hover:text-white"}`}
                              title="Limit to 2 accounts per citizen"
                            >
                              2
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTier(tier.id, "maxAccountsPerUser", null)}
                              className={`px-2 py-1 text-xs rounded border transition-colors ${tier.maxAccountsPerUser === null || tier.maxAccountsPerUser === undefined ? "bg-white/20 border-white/40 text-white font-bold" : "bg-white/5 border-white/10 text-white/50 hover:text-white"}`}
                              title="Unlimited accounts"
                            >
                              ∞
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-white/40 mt-1">Maximum accounts of this tier a single client may hold.</p>
                      </div>

                      {/* Exclusivity Suite / Group */}
                      <div>
                        <label className="block text-xs font-medium text-white/80 mb-1">Exclusivity Suite / Group (Optional)</label>
                        <input
                          type="text"
                          value={tier.exclusiveGroup || ""}
                          onChange={(e) => updateTier(tier.id, "exclusiveGroup", e.target.value.trim() || null)}
                          className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                          placeholder="e.g. checking_suite, premium"
                        />
                        <p className="text-[10px] text-white/40 mt-1">Clients can only hold at most 1 tier in the same named suite.</p>
                      </div>

                      {/* Mutually Exclusive Tiers Selector */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-white/80">Mutually Exclusive Tiers</label>
                          <span className="text-[10px] text-rose-300 font-mono">
                            {Array.isArray(tier.mutuallyExclusiveTierIds) && tier.mutuallyExclusiveTierIds.length > 0
                              ? `${tier.mutuallyExclusiveTierIds.length} restricted`
                              : "None"}
                          </span>
                        </div>
                        <div className="bg-[var(--bg-subtle)] border border-white/10 rounded-lg p-1.5 max-h-32 overflow-y-auto space-y-1">
                          {tiers.filter((o) => o.id !== tier.id).length === 0 ? (
                            <span className="text-[10px] text-white/30 italic block py-1">Add another tier first to configure conflict rules.</span>
                          ) : (
                            tiers
                              .filter((o) => o.id !== tier.id)
                              .map((other) => {
                                const currentBlocked = Array.isArray(tier.mutuallyExclusiveTierIds) ? tier.mutuallyExclusiveTierIds : [];
                                const isBlocked = currentBlocked.includes(other.id);
                                return (
                                  <button
                                    key={other.id}
                                    type="button"
                                    onClick={() => {
                                      const next = isBlocked
                                        ? currentBlocked.filter((x: string) => x !== other.id)
                                        : [...currentBlocked, other.id];
                                      updateTier(tier.id, "mutuallyExclusiveTierIds", next);
                                    }}
                                    className={`w-full text-left text-xs px-2 py-1 rounded flex items-center justify-between border transition-all ${
                                      isBlocked
                                        ? "bg-rose-500/15 border-rose-500/40 text-rose-300 font-medium"
                                        : "bg-white/5 border-white/5 text-white/60 hover:text-white hover:bg-white/10"
                                    }`}
                                  >
                                    <span className="truncate">{other.name} ({other.type})</span>
                                    <span className="text-[10px] shrink-0 ml-1">
                                      {isBlocked ? "Exclusive (1 or other)" : "+ Block concurrent"}
                                    </span>
                                  </button>
                                );
                              })
                          )}
                        </div>
                        <p className="text-[10px] text-white/40 mt-1">If set, having one tier prevents opening the other.</p>
                      </div>
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
                        className="w-full bg-[var(--bg-subtle)] border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-emerald-500/30 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
                        className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
