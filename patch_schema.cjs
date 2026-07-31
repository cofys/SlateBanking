const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'db', 'schema.ts');
let content = fs.readFileSync(file, 'utf8');

// Add accountTiers to banks
content = content.replace(
  'loginBgUrl: text("login_bg_url"),',
  'loginBgUrl: text("login_bg_url"),\n  accountTiers: text("account_tiers", { mode: "json" }).$type<{ id: string; name: string; description: string; type: string; monthlyFee: number; apyPercent: number | null; transferFeePercent: number | null; depositFeePercent: number | null; withdrawFeePercent: number | null; minBalance: number; isDefault: boolean }[]>(),'
);

// Add tierId to bankAccounts
content = content.replace(
  'accountType: text("account_type").default("personal"), // "personal", "business", "payroll", "system_asset", "system_revenue", "system_expense", "system_liability"',
  'accountType: text("account_type").default("personal"), // "personal", "business", "payroll", "system_asset", "system_revenue", "system_expense", "system_liability"\n  tierId: text("tier_id"),'
);

fs.writeFileSync(file, content);
console.log("Patched successfully");
