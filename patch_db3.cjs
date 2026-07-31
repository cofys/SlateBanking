const db = require('better-sqlite3')('data/slate_saas.db');
try { db.exec('ALTER TABLE bank_settings ADD COLUMN account_tiers TEXT;'); } catch(e) { console.error(e.message); }
try { db.exec('ALTER TABLE bank_settings ADD COLUMN enable_account_tiers INTEGER DEFAULT 0;'); } catch(e) { console.error(e.message); }
console.log("DB patched correctly");
