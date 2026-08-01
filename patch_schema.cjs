const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'db', 'schema.ts');
let content = fs.readFileSync(file, 'utf8');

content += `\nexport const globalAuditLogs = sqliteTable("global_audit_logs", {
  id: text("id").primaryKey(),
  discordId: text("discord_id"), 
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  route: text("route"),
  method: text("method"),
  bankId: text("bank_id"),
  latencyMs: integer("latency_ms"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});\n`;

fs.writeFileSync(file, content);
console.log("Patched src/db/schema.ts");
