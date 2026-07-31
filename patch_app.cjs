const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { BankSettings } from "./pages/BankSettings";',
  'import { BankSettings } from "./pages/BankSettings";\nimport { BankTiers } from "./pages/BankTiers";'
);

content = content.replace(
  '<Route path="treasury" element={<BankTreasury />} />',
  '<Route path="treasury" element={<BankTreasury />} />\n            <Route path="tiers" element={<BankTiers />} />'
);

content = content.replace(
  '<Route path="treasury" element={<BankTreasury />} />',
  '<Route path="treasury" element={<BankTreasury />} />\n          <Route path="tiers" element={<BankTiers />} />'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
