const db = require('better-sqlite3')('data/slate_saas.db');
try { db.exec('ALTER TABLE banks ADD COLUMN account_tiers TEXT;'); } catch(e) { console.error(e.message); }
try { db.exec('ALTER TABLE bank_accounts ADD COLUMN tier_id TEXT;'); } catch(e) { console.error(e.message); }
console.log("DB patched");
