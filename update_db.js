const fs = require('fs');

let content = fs.readFileSync('src/db/index.ts', 'utf8');

const additionalColumns = `
  // Missing columns for other tables
  checkAndAddColumn("payroll_jobs", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("subscriptions", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("subscriptions", "description", "TEXT");
  checkAndAddColumn("invoices", "description", "TEXT");
  checkAndAddColumn("invoices", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("loan_products", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("credit_products", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("recurring_transfers", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("recurring_transfers", "description", "TEXT");
  checkAndAddColumn("payment_links", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("payment_links", "description", "TEXT");
  checkAndAddColumn("onyx_merchant_products", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("onyx_merchant_products", "description", "TEXT");
  checkAndAddColumn("onyx_quotes", "description", "TEXT");
  checkAndAddColumn("discord_webhooks", "is_active", "INTEGER DEFAULT 1");
`;

content = content.replace('// Onyx Settings table', additionalColumns + '\n  // Onyx Settings table');

fs.writeFileSync('src/db/index.ts', content);
