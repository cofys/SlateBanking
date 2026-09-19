import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { Percent, Save, Play, Loader2, AlertCircle, Calendar, Clock, Banknote, Users } from "lucide-react";
import { safeFormatDate } from "../lib/utils";

export function BankInterest() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ count: number; totalAmount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = () => {
    setLoading(true);
    fetch(`/api/banks/${bank.id}/interest-settings`)
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (bank?.id) fetchSettings();
  }, [bank]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setRunResult(null);
    const formData = new FormData(e.target as HTMLFormElement);
    const newSettings = {
      savingsApyPercent: Math.round(parseFloat(formData.get("savingsApyPercent") as string) * 100) || 300,
      interestPaymentSchedule: formData.get("interestPaymentSchedule"),
      interestTargetAccounts: formData.get("interestTargetAccounts"),
      interestCalculationMethod: formData.get("interestCalculationMethod"),
      interestMinBalance: Math.floor(parseFloat(formData.get("interestMinBalance") as string) * 100) || 0,
      interestMaxAccountBalance: formData.get("interestMaxAccountBalance") ? Math.floor(parseFloat(formData.get("interestMaxAccountBalance") as string) * 100) : null,
      interestRequiresActivityDays: formData.get("interestRequiresActivityDays") ? parseInt(formData.get("interestRequiresActivityDays") as string, 10) : null,
      interestMinAccountAgeDays: formData.get("interestMinAccountAgeDays") ? parseInt(formData.get("interestMinAccountAgeDays") as string, 10) : 0,
      interestDaysInYear: parseInt(formData.get("interestDaysInYear") as string, 10) === 360 ? 360 : 365,
      interestPoolAccount: (formData.get("interestPoolAccount") as string) || null,
    };

    fetch(`/api/banks/${bank.id}/interest-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSettings(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const handleRunNow = () => {
    if (!window.confirm("Are you sure you want to run interest now? This will deposit money into all eligible accounts based on your current settings and APY.")) return;
    
    setRunning(true);
    setError(null);
    setRunResult(null);
    fetch(`/api/banks/${bank.id}/interest-run`, {
      method: "POST",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRunResult(data);
        fetchSettings(); // Refresh last run time
      })
      .catch((err) => setError(err.message))
      .finally(() => setRunning(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        <Loader2 className="animate-spin w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Percent className="text-emerald-400" />
            Interest Engine
          </h1>
          <p className="text-white/60 mt-1">Configure automated yield payouts for your depositors. Loan APR and compounding live under Bank Settings → Lending Policy.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {runResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <p>
            Successfully paid out interest to <strong>{runResult.count} accounts</strong> for a total of{" "}
            <strong>${(runResult.totalAmount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-lg font-medium text-white">Yield Configuration</h2>
              <p className="text-sm text-white/50">Define the global rules for interest accrual.</p>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Base APY Yield (%)</label>
                  <div className="relative">
                    <input
                      name="savingsApyPercent"
                      type="number"
                      step="0.01"
                      defaultValue={settings?.savingsApyPercent ? (settings.savingsApyPercent / 100) : 3.0}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg pl-4 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      required
                    />
                    <Percent className="absolute right-3 top-2.5 text-white/30" size={16} />
                  </div>
                  <p className="text-[11px] text-white/40 mt-1">Annual Percentage Yield (divided evenly across payouts)</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Target Accounts</label>
                  <select
                    name="interestTargetAccounts"
                    defaultValue={settings?.interestTargetAccounts || "savings_only"}
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="savings_only">Savings Accounts Only (Recommended)</option>
                    <option value="personal_only">Personal Accounts Only</option>
                    <option value="business_only">Business Accounts Only</option>
                    <option value="all_accounts">All Accounts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Automation Schedule</label>
                  <select
                    name="interestPaymentSchedule"
                    defaultValue={settings?.interestPaymentSchedule || "manual"}
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="manual">Manual Trigger Only</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <p className="text-[11px] text-white/40 mt-1">When should the system auto-run?</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Balance method</label>
                  <select
                    name="interestCalculationMethod"
                    defaultValue={settings?.interestCalculationMethod || "current_balance"}
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="current_balance">Current balance at payout</option>
                    <option value="average_daily_balance">Average daily balance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Days in year</label>
                  <select
                    name="interestDaysInYear"
                    defaultValue={settings?.interestDaysInYear === 360 ? "360" : "365"}
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="365">365 (actual / 52 weeks)</option>
                    <option value="360">360 (bank year)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Interest pool account</label>
                  <input
                    name="interestPoolAccount"
                    type="text"
                    defaultValue={settings?.interestPoolAccount || ""}
                    placeholder="e.g. interest_reserve"
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Payouts book-transfer from this named subaccount. Empty = skip (never mint).</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Min Balance to Earn ($)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-white/30">$</span>
                    <input
                      name="interestMinBalance"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={settings?.interestMinBalance ? (settings.interestMinBalance / 100) : 0}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Max Balance Cap ($) (Optional)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-white/30">$</span>
                    <input
                      name="interestMaxAccountBalance"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={settings?.interestMaxAccountBalance ? (settings.interestMaxAccountBalance / 100) : ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg pl-8 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="No limit"
                    />
                  </div>
                  <p className="text-[11px] text-white/40 mt-1">Interest will only apply up to this amount.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Require Activity (Optional)</label>
                  <div className="relative">
                    <input
                      name="interestRequiresActivityDays"
                      type="number"
                      min="1"
                      step="1"
                      defaultValue={settings?.interestRequiresActivityDays || ""}
                      className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg pl-4 pr-12 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      placeholder="Any activity"
                    />
                    <span className="absolute right-4 top-2.5 text-white/30 text-sm">days</span>
                  </div>
                  <p className="text-[11px] text-white/40 mt-1">Max days since last sync/login to earn yield.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Min account age (days)</label>
                  <input
                    name="interestMinAccountAgeDays"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={settings?.interestMinAccountAgeDays || 0}
                    className="w-full bg-[var(--bg-subtle)] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Accounts younger than this earn nothing.</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/10 bg-[#15151e] flex justify-end">
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
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-b from-[#151522] to-[#0a0a0f] border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700"></div>
            
            <h3 className="text-white font-medium mb-2 flex items-center gap-2">
              <Play className="text-indigo-400" size={18} />
              Manual Execution
            </h3>
            <p className="text-sm text-white/60 mb-6">
              Run the interest accrual engine immediately based on the saved rules. 
              {settings?.interestPaymentSchedule !== 'manual' && ' This will reset the clock for the next automated payout.'}
            </p>

            <button
              onClick={handleRunNow}
              disabled={running}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Run Interest Now
                </>
              )}
            </button>

            <div className="mt-6 pt-4 border-t border-white/10">
              <div className="flex items-center gap-3 text-sm text-white/50">
                <Calendar size={16} />
                <span>Last Run: {safeFormatDate(settings?.lastInterestAccrualAt, 'MMM d, yyyy h:mm a', 'Never')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
