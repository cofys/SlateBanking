const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankAccounts.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '            <div className="flex-1 w-full">\n              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Owner Username / Discord ID</label>',
  '            {bank.settings?.enableAccountTiers && (\n              <div className="flex-1 w-full">\n                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Account Tier</label>\n                <select name="tierId" className="w-full bg-[#1a1a24] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors">\n                  <option value="">(No Tier / Default)</option>\n                  {(bank.settings?.accountTiers || []).map((t: any) => (\n                    <option key={t.id} value={t.id}>{t.name} ({t.type})</option>\n                  ))}\n                </select>\n              </div>\n            )}\n            <div className="flex-1 w-full">\n              <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wide">Owner Username / Discord ID</label>'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
