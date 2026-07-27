import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "slate_saas.db");
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');

export const db = drizzle(sqlite, { schema });

// Ensure schema tables and columns added in code exist on SQLite database
function ensureDatabaseSchemaSynced() {
  const createTableIfNotExists = (tableName: string, sql: string) => {
    try {
      sqlite.prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (${sql})`).run();
    } catch (err) {
      console.error(`[DB Auto-Migrate Error] Failed to ensure table ${tableName}:`, err);
    }
  };

  const checkAndAddColumn = (tableName: string, columnName: string, columnDef: string) => {
    try {
      const tableInfo = sqlite.pragma(`table_info(${tableName})`) as any[];
      const exists = tableInfo.some((col: any) => col.name === columnName);
      if (!exists) {
        sqlite.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`).run();
        console.log(`[DB Auto-Migrate] Added missing column '${columnName}' to '${tableName}'`);
      }
    } catch (err) {
      console.error(`[DB Auto-Migrate Error] Failed to check/add ${columnName} to ${tableName}:`, err);
    }
  };

  // Create tables if missing
  createTableIfNotExists("users", "id TEXT PRIMARY KEY NOT NULL, discord_id TEXT NOT NULL UNIQUE, mc_uuid TEXT NOT NULL, mc_username TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("banks", "id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, guild_id TEXT NOT NULL, discord_token TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("bank_accounts", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, owner_discord_id TEXT NOT NULL, account_name TEXT NOT NULL, balance INTEGER DEFAULT 0 NOT NULL, credit_limit INTEGER DEFAULT 0 NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("transactions", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, amount INTEGER NOT NULL, type TEXT NOT NULL, timestamp INTEGER NOT NULL");
  createTableIfNotExists("onyx_merchants", "id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, api_key TEXT NOT NULL UNIQUE, bank_id TEXT NOT NULL, destination_account TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("bank_settings", "bank_id TEXT PRIMARY KEY NOT NULL");
  createTableIfNotExists("escrows", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, buyer_account_id TEXT NOT NULL, seller_account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("bank_staff", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("support_tickets", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, subject TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("audit_logs", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, user_discord_id TEXT NOT NULL, action TEXT NOT NULL, timestamp INTEGER NOT NULL");
  createTableIfNotExists("loans", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, account_id TEXT NOT NULL, principal_amount INTEGER NOT NULL, remaining_amount INTEGER NOT NULL, interest_rate INTEGER NOT NULL, next_payment_date INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("credit_applications", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, account_id TEXT NOT NULL, requested_limit INTEGER NOT NULL, monthly_income INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("vault_deposits", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, account_id TEXT NOT NULL, amount INTEGER NOT NULL, locked_until INTEGER NOT NULL, interest_rate INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("cards", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, account_id TEXT NOT NULL, card_number TEXT NOT NULL UNIQUE, cvv TEXT NOT NULL, expiry_date TEXT NOT NULL, type TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("payroll_jobs", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, employer_account_id TEXT NOT NULL, employee_account_id TEXT NOT NULL, amount INTEGER NOT NULL, frequency TEXT NOT NULL, next_run INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("subscriptions", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, biller_account_id TEXT NOT NULL, customer_account_id TEXT NOT NULL, amount INTEGER NOT NULL, frequency TEXT NOT NULL, next_run INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("clearinghouse_balances", "bank_id TEXT PRIMARY KEY NOT NULL, balance INTEGER DEFAULT 0 NOT NULL");
  createTableIfNotExists("clearinghouse_settlements", "id TEXT PRIMARY KEY NOT NULL, from_bank_id TEXT NOT NULL, to_bank_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("inter_bank_transfers", "id TEXT PRIMARY KEY NOT NULL, from_bank_id TEXT NOT NULL, to_bank_id TEXT NOT NULL, from_account_id TEXT NOT NULL, to_account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("onyx_settings", "id TEXT PRIMARY KEY NOT NULL");
  createTableIfNotExists("city_corp_logs", "id TEXT PRIMARY KEY NOT NULL, endpoint TEXT NOT NULL, latency_ms INTEGER NOT NULL, status INTEGER NOT NULL, success INTEGER NOT NULL, timestamp INTEGER NOT NULL");
  createTableIfNotExists("invoices", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, biller_account_id TEXT NOT NULL, customer_account_id TEXT NOT NULL, amount INTEGER NOT NULL, due_date INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("bank_customers", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("loan_products", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, interest_rate INTEGER NOT NULL, max_amount INTEGER NOT NULL, term_days INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("credit_products", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, interest_rate INTEGER NOT NULL, max_limit INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("global_admins", "id TEXT PRIMARY KEY NOT NULL, discord_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL");
  createTableIfNotExists("address_book", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, contact_account_id TEXT NOT NULL, nickname TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("recurring_transfers", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, from_account_id TEXT NOT NULL, to_account_id TEXT NOT NULL, amount INTEGER NOT NULL, frequency TEXT NOT NULL, next_run_at INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("savings_goals", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, account_id TEXT NOT NULL, name TEXT NOT NULL, target_amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("payment_links", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, biller_account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("account_members", "id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, discord_id TEXT NOT NULL, role TEXT DEFAULT 'viewer' NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("saas_invoices", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, amount INTEGER NOT NULL, period TEXT NOT NULL, due_date INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("onyx_merchant_products", "id TEXT PRIMARY KEY NOT NULL, merchant_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("onyx_quotes", "id TEXT PRIMARY KEY NOT NULL, merchant_id TEXT NOT NULL, created_by_discord_id TEXT NOT NULL, amount INTEGER NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("discord_webhooks", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, events TEXT NOT NULL, created_at INTEGER NOT NULL");

  // Check and add missing columns to banks
  checkAndAddColumn("banks", "discord_client_id", "TEXT");
  checkAndAddColumn("banks", "discord_client_secret", "TEXT");
  checkAndAddColumn("banks", "corp_id", "INTEGER");
  checkAndAddColumn("banks", "corp_api_uuid", "TEXT");
  checkAndAddColumn("banks", "corp_api_key", "TEXT");
  checkAndAddColumn("banks", "city_corp_app_id", "TEXT");
  checkAndAddColumn("banks", "city_corp_app_secret", "TEXT");
  checkAndAddColumn("banks", "city_corp_auth_url", "TEXT");
  checkAndAddColumn("banks", "custom_domain", "TEXT");
  checkAndAddColumn("banks", "branding_color", "TEXT DEFAULT '#4f46e5'");
  checkAndAddColumn("banks", "logo_url", "TEXT");
  checkAndAddColumn("banks", "api_key", "TEXT");
  checkAndAddColumn("banks", "webhook_secret", "TEXT");
  checkAndAddColumn("banks", "api_webhook_url", "TEXT");
  checkAndAddColumn("banks", "status", "TEXT DEFAULT 'offline'");
  checkAndAddColumn("banks", "plan", "TEXT DEFAULT 'standard'");
  checkAndAddColumn("banks", "billing_status", "TEXT DEFAULT 'active'");
  checkAndAddColumn("banks", "billing_model", "TEXT DEFAULT 'flat_monthly'");
  checkAndAddColumn("banks", "flat_monthly_rate", "INTEGER DEFAULT 15000");
  checkAndAddColumn("banks", "volume_fee_percent", "INTEGER DEFAULT 50");
  checkAndAddColumn("banks", "profit_share_percent", "INTEGER DEFAULT 500");
  checkAndAddColumn("banks", "per_account_rate", "INTEGER DEFAULT 150");
  checkAndAddColumn("banks", "per_tx_rate", "INTEGER DEFAULT 25");
  checkAndAddColumn("banks", "billing_notes", "TEXT");
  checkAndAddColumn("banks", "platform_fee_percent", "INTEGER DEFAULT 200");
  checkAndAddColumn("banks", "maintenance_mode", "INTEGER DEFAULT 0");

  // Bank Accounts table
  checkAndAddColumn("bank_accounts", "account_type", "TEXT DEFAULT 'personal'");
  checkAndAddColumn("bank_accounts", "business_tax_id", "TEXT");
  checkAndAddColumn("bank_accounts", "business_sector", "TEXT");
  checkAndAddColumn("bank_accounts", "is_active", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_accounts", "is_frozen", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_accounts", "is_system", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_accounts", "system_category", "TEXT");
  checkAndAddColumn("bank_accounts", "custom_transfer_fee_percent", "INTEGER");
  checkAndAddColumn("bank_accounts", "custom_deposit_fee_percent", "INTEGER");
  checkAndAddColumn("bank_accounts", "custom_withdraw_fee_percent", "INTEGER");

  // Bank Customers table
  checkAndAddColumn("bank_customers", "kyc_status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("bank_customers", "mc_uuid", "TEXT");
  checkAndAddColumn("bank_customers", "mc_username", "TEXT");
  checkAndAddColumn("bank_customers", "linked_discord_id", "TEXT");
  checkAndAddColumn("bank_customers", "city_corp_token", "TEXT");
  checkAndAddColumn("bank_customers", "notes", "TEXT");

  // Bank Settings table
  checkAndAddColumn("bank_settings", "withdraw_fee_percent", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "deposit_fee_percent", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "transfer_fee_percent", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "inter_bank_wire_threshold", "INTEGER DEFAULT 5000000");
  checkAndAddColumn("bank_settings", "color_scheme", "TEXT DEFAULT 'indigo'");
  checkAndAddColumn("bank_settings", "logo_url", "TEXT");
  checkAndAddColumn("bank_settings", "support_email", "TEXT");
  checkAndAddColumn("bank_settings", "discord_webhook_url", "TEXT");
  checkAndAddColumn("bank_settings", "require_kyc", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "discord_verified_role_id", "TEXT");
  checkAndAddColumn("bank_settings", "discord_client_role_id", "TEXT");
  checkAndAddColumn("bank_settings", "enable_loans", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "enable_vaults", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "enable_cards", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "enable_payroll", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "enable_subscriptions", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "enable_escrow", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "enable_treasury", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "gui_channel_id", "TEXT");
  checkAndAddColumn("bank_settings", "gui_message_id", "TEXT");
  checkAndAddColumn("bank_settings", "staff_channel_id", "TEXT");
  checkAndAddColumn("bank_settings", "staff_message_id", "TEXT");
  checkAndAddColumn("bank_settings", "auto_approve_loans", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "auto_approve_credit_cards", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "max_auto_approve_loan_amount", "INTEGER DEFAULT 1000000");
  checkAndAddColumn("bank_settings", "vault_tiers", "TEXT");
  checkAndAddColumn("bank_settings", "login_bg_url", "TEXT");
  checkAndAddColumn("bank_settings", "savings_apy_percent", "INTEGER DEFAULT 300");
  checkAndAddColumn("bank_settings", "require_personal_for_business", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "last_interest_accrual_at", "INTEGER");
  checkAndAddColumn("bank_settings", "enable_google_docs_contracts", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "google_docs_loan_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_credit_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_escrow_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_folder_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_auto_generate", "INTEGER DEFAULT 0");

  // Transactions table
  checkAndAddColumn("transactions", "from_account_id", "TEXT");
  checkAndAddColumn("transactions", "to_account_id", "TEXT");
  checkAndAddColumn("transactions", "description", "TEXT");
  checkAndAddColumn("transactions", "is_flagged", "INTEGER DEFAULT 0");
  checkAndAddColumn("transactions", "category", "TEXT");

  // Loans table
  checkAndAddColumn("loans", "purpose", "TEXT");
  checkAndAddColumn("loans", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("loans", "contract_url", "TEXT");
  checkAndAddColumn("loans", "collateral_description", "TEXT");
  checkAndAddColumn("loans", "collateral_value", "INTEGER");
  checkAndAddColumn("loans", "collateral_status", "TEXT DEFAULT 'none'");
  checkAndAddColumn("loans", "late_fee_amount", "INTEGER DEFAULT 0");
  checkAndAddColumn("loans", "is_delinquent", "INTEGER DEFAULT 0");
  checkAndAddColumn("loans", "missed_payments_count", "INTEGER DEFAULT 0");
  checkAndAddColumn("loans", "last_interest_accrual_at", "INTEGER");
  checkAndAddColumn("loans", "last_payment_attempt_at", "INTEGER");

  // Escrows table
  checkAndAddColumn("escrows", "description", "TEXT");
  checkAndAddColumn("escrows", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("escrows", "contract_url", "TEXT");

  // Credit Applications table
  checkAndAddColumn("credit_applications", "purpose", "TEXT");
  checkAndAddColumn("credit_applications", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("credit_applications", "contract_url", "TEXT");

  // Onyx Settings table
  checkAndAddColumn("onyx_settings", "b2b_api_fee_percent", "INTEGER DEFAULT 200");
  checkAndAddColumn("onyx_settings", "clearinghouse_enabled", "INTEGER DEFAULT 1");
  checkAndAddColumn("onyx_settings", "global_bot_maintenance", "INTEGER DEFAULT 0");
  checkAndAddColumn("onyx_settings", "bot_token", "TEXT");
  checkAndAddColumn("onyx_settings", "gui_channel_id", "TEXT");
  checkAndAddColumn("onyx_settings", "gui_message_id", "TEXT");
}

try {
  ensureDatabaseSchemaSynced();
} catch (e) {
  console.error("Schema sync error:", e);
}

// Automatically apply migrations if missing
try {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }
} catch (err) {
  console.error("Migration error on startup:", err);
}
