const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'db', 'index.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'checkAndAddColumn("bank_settings", "account_tiers", "TEXT");',
  `checkAndAddColumn("bank_settings", "account_tiers", "TEXT");
  checkAndAddColumn("bank_settings", "interest_payment_schedule", "TEXT DEFAULT 'manual'");
  checkAndAddColumn("bank_settings", "interest_next_payment_at", "INTEGER");
  checkAndAddColumn("bank_settings", "interest_target_accounts", "TEXT DEFAULT 'savings_only'");
  checkAndAddColumn("bank_settings", "interest_min_balance", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "interest_max_account_balance", "INTEGER");
  checkAndAddColumn("bank_settings", "interest_requires_activity_days", "INTEGER");`
);

fs.writeFileSync(file, content);
console.log("Patched src/db/index.ts");
