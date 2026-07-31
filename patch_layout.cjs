const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'components', 'layout', 'BankAdminLayout.tsx');
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('import { Layers,')) {
    content = content.replace('import { Landmark,', 'import { Landmark, Layers,');
}

content = content.replace(
  'settings?.enableTreasury !== false && { name: "Treasury", path: `/bank/${bankId}/treasury`, icon: BarChart3 },',
  'settings?.enableTreasury !== false && { name: "Treasury", path: `/bank/${bankId}/treasury`, icon: BarChart3 },\n        settings?.enableAccountTiers !== false && { name: "Account Tiers", path: `/bank/${bankId}/tiers`, icon: Layers },'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
