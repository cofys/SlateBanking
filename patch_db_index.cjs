const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'db', 'index.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'checkAndAddColumn("bank_settings", "google_docs_auto_generate", "INTEGER DEFAULT 0");',
  'checkAndAddColumn("bank_settings", "google_docs_auto_generate", "INTEGER DEFAULT 0");\n  checkAndAddColumn("bank_settings", "enable_account_tiers", "INTEGER DEFAULT 0");\n  checkAndAddColumn("bank_settings", "account_tiers", "TEXT");'
);

// Also check for bank accounts tier_id
content = content.replace(
  'checkAndAddColumn("bank_accounts", "sync_error", "TEXT");',
  'checkAndAddColumn("bank_accounts", "sync_error", "TEXT");\n  checkAndAddColumn("bank_accounts", "tier_id", "TEXT");'
);

fs.writeFileSync(file, content);
console.log("Patched src/db/index.ts");
