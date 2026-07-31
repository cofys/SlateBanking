const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'pages', 'BankSettings.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'enableTreasury: formData.get("enableTreasury") === "on",',
  'enableTreasury: formData.get("enableTreasury") === "on",\n      enableAccountTiers: formData.get("enableAccountTiers") === "on",'
);

content = content.replace(
  'Treasury Analytics</span>\n            </label>',
  'Treasury Analytics</span>\n            </label>\n            <label className="flex items-center gap-4 cursor-pointer group">\n               <div className={`w-10 h-6 shrink-0 rounded-full flex items-center p-1 transition-colors ${settings?.enableAccountTiers ? \'bg-pink-500\' : \'bg-white/10\'}`}>\n                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings?.enableAccountTiers ? \'translate-x-4\' : \'translate-x-0\'}`}></div>\n               </div>\n               <input type="checkbox" name="enableAccountTiers" className="hidden" defaultChecked={settings?.enableAccountTiers} onChange={(e) => setSettings({...settings, enableAccountTiers: e.target.checked})} />\n               <span className="text-sm text-white/80 group-hover:text-pink-400 transition-colors">Custom Account Tiers</span>\n            </label>'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
