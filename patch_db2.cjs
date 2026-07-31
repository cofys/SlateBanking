const db = require('better-sqlite3')('data/slate_saas.db');
try { db.exec('ALTER TABLE banks ADD COLUMN enable_account_tiers INTEGER DEFAULT 0;'); } catch(e) { console.error(e.message); }
console.log("DB patched");
