import re

with open('src/pages/BankInterest.tsx', 'r') as f:
    text = f.read()

# 1. Update the form parsing in handleSave
old_parsing = """    const newSettings = {
      savingsApyPercent: Math.round(parseFloat(formData.get("savingsApyPercent") as string) * 100) || 300,
      interestPaymentSchedule: formData.get("interestPaymentSchedule"),
      interestTargetAccounts: formData.get("interestTargetAccounts"),
      interestMinBalance: Math.floor(parseFloat(formData.get("interestMinBalance") as string) * 100) || 0,
      interestMaxAccountBalance: formData.get("interestMaxAccountBalance") ? Math.floor(parseFloat(formData.get("interestMaxAccountBalance") as string) * 100) : null,
      interestRequiresActivityDays: formData.get("interestRequiresActivityDays") ? parseInt(formData.get("interestRequiresActivityDays") as string, 10) : null,
    };"""

new_parsing = """    const newSettings = {
      savingsApyPercent: Math.round(parseFloat(formData.get("savingsApyPercent") as string) * 100) || 300,
      interestPaymentSchedule: formData.get("interestPaymentSchedule"),
      interestTargetAccounts: formData.get("interestTargetAccounts"),
      interestCalculationMethod: formData.get("interestCalculationMethod"),
      interestMinBalance: Math.floor(parseFloat(formData.get("interestMinBalance") as string) * 100) || 0,
      interestMaxAccountBalance: formData.get("interestMaxAccountBalance") ? Math.floor(parseFloat(formData.get("interestMaxAccountBalance") as string) * 100) : null,
      interestRequiresActivityDays: formData.get("interestRequiresActivityDays") ? parseInt(formData.get("interestRequiresActivityDays") as string, 10) : null,
      interestMinAccountAgeDays: formData.get("interestMinAccountAgeDays") ? parseInt(formData.get("interestMinAccountAgeDays") as string, 10) : null,
    };"""

text = text.replace(old_parsing, new_parsing)

# 2. Add the UI inputs
old_ui = """                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Activity Req (Days)</label>
                  <input
                    name="interestRequiresActivityDays"
                    type="number"
                    min="1"
                    defaultValue={settings?.interestRequiresActivityDays || ""}
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="None"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Require user to have been online in X days.</p>
                </div>"""

new_ui = """                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Activity Req (Days)</label>
                  <input
                    name="interestRequiresActivityDays"
                    type="number"
                    min="1"
                    defaultValue={settings?.interestRequiresActivityDays || ""}
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="None"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Require user to have been online in X days.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Min Account Age (Days)</label>
                  <input
                    name="interestMinAccountAgeDays"
                    type="number"
                    min="1"
                    defaultValue={settings?.interestMinAccountAgeDays || ""}
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    placeholder="None"
                  />
                  <p className="text-[11px] text-white/40 mt-1">Account must be open for X days to qualify.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Calculation Method</label>
                  <select
                    name="interestCalculationMethod"
                    defaultValue={settings?.interestCalculationMethod || "current_balance"}
                    className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="current_balance">Current Balance (Instant)</option>
                    <option value="average_daily_balance">Average Daily Balance</option>
                  </select>
                  <p className="text-[11px] text-white/40 mt-1">How is the principal calculated?</p>
                </div>"""

text = text.replace(old_ui, new_ui)

with open('src/pages/BankInterest.tsx', 'w') as f:
    f.write(text)

print("Updated BankInterest.tsx UI")
