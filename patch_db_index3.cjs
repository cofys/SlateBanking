const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'db', 'index.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'createTableIfNotExists("discord_webhooks", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, events TEXT NOT NULL, created_at INTEGER NOT NULL");',
  `createTableIfNotExists("discord_webhooks", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, events TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("global_audit_logs", "id TEXT PRIMARY KEY NOT NULL, discord_id TEXT, action TEXT NOT NULL, details TEXT, ip_address TEXT, route TEXT, method TEXT, bank_id TEXT, latency_ms INTEGER, timestamp INTEGER NOT NULL");`
);

fs.writeFileSync(file, content);
console.log("Patched src/db/index.ts for global_audit_logs");
