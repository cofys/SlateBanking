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
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

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

  const createIndexIfNotExists = (indexName: string, tableName: string, columns: string) => {
    try {
      sqlite.prepare(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns})`).run();
    } catch (err) {
      console.error(`[DB Auto-Migrate Error] Failed to ensure index ${indexName}:`, err);
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
  checkAndAddColumn("loans", "contract_text", "TEXT");
  checkAndAddColumn("loans", "client_signed_at", "INTEGER");
  createTableIfNotExists("credit_applications", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, account_id TEXT NOT NULL, requested_limit INTEGER NOT NULL, monthly_income INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("vault_deposits", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, account_id TEXT NOT NULL, amount INTEGER NOT NULL, locked_until INTEGER NOT NULL, interest_rate INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("cards", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, account_id TEXT NOT NULL, card_number TEXT NOT NULL UNIQUE, cvv TEXT NOT NULL, expiry_date TEXT NOT NULL, type TEXT NOT NULL, created_at INTEGER NOT NULL");
  checkAndAddColumn("cards", "is_locked", "INTEGER DEFAULT 0");
  checkAndAddColumn("cards", "credit_limit", "INTEGER DEFAULT 0");
  checkAndAddColumn("cards", "credit_used", "INTEGER DEFAULT 0");
  checkAndAddColumn("cards", "apr", "INTEGER DEFAULT 0");
  checkAndAddColumn("cards", "minimum_payment", "INTEGER DEFAULT 0");
  checkAndAddColumn("cards", "next_payment_date", "INTEGER");
  createTableIfNotExists("payroll_jobs", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, employer_account_id TEXT NOT NULL, employee_account_id TEXT NOT NULL, amount INTEGER NOT NULL, frequency TEXT NOT NULL, next_run INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("subscriptions", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, biller_account_id TEXT NOT NULL, customer_account_id TEXT NOT NULL, amount INTEGER NOT NULL, frequency TEXT NOT NULL, next_run INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("clearinghouse_balances", "bank_id TEXT PRIMARY KEY NOT NULL, balance INTEGER DEFAULT 0 NOT NULL");
  checkAndAddColumn("clearinghouse_balances", "last_settled", "INTEGER");
  checkAndAddColumn("clearinghouse_balances", "settlement_cash_cents", "INTEGER DEFAULT 0");
  checkAndAddColumn("clearinghouse_balances", "slate_advance_cents", "INTEGER DEFAULT 0");
  checkAndAddColumn("clearinghouse_balances", "last_drift_alert_at", "INTEGER");
  createTableIfNotExists("clearinghouse_settlements", "id TEXT PRIMARY KEY NOT NULL, from_bank_id TEXT NOT NULL, to_bank_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  checkAndAddColumn("clearinghouse_settlements", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("clearinghouse_settlements", "run_id", "TEXT");
  checkAndAddColumn("clearinghouse_settlements", "note", "TEXT");
  checkAndAddColumn("clearinghouse_settlements", "released_at", "INTEGER");
  checkAndAddColumn("clearinghouse_settlements", "confirmed_at", "INTEGER");
  checkAndAddColumn("clearinghouse_settlements", "released_by", "TEXT");
  checkAndAddColumn("clearinghouse_settlements", "confirmed_by", "TEXT");
  createTableIfNotExists("inter_bank_transfers", "id TEXT PRIMARY KEY NOT NULL, from_bank_id TEXT NOT NULL, to_bank_id TEXT NOT NULL, from_account_id TEXT NOT NULL, to_account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("onyx_settings", "id TEXT PRIMARY KEY NOT NULL");
  createTableIfNotExists("city_corp_logs", "id TEXT PRIMARY KEY NOT NULL, endpoint TEXT NOT NULL, latency_ms INTEGER NOT NULL, status INTEGER NOT NULL, success INTEGER NOT NULL, timestamp INTEGER NOT NULL");
  createTableIfNotExists("invoices", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, biller_account_id TEXT NOT NULL, customer_account_id TEXT NOT NULL, amount INTEGER NOT NULL, due_date INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("bank_customers", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, discord_id TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("loan_products", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, interest_rate INTEGER NOT NULL, max_amount INTEGER NOT NULL, term_days INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("credit_products", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, interest_rate INTEGER NOT NULL, max_limit INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("global_admins", "id TEXT PRIMARY KEY NOT NULL, discord_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL");
  checkAndAddColumn("global_admins", "added_by", "TEXT");
  createTableIfNotExists("address_book", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, contact_account_id TEXT NOT NULL, nickname TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("recurring_transfers", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, from_account_id TEXT NOT NULL, to_account_id TEXT NOT NULL, amount INTEGER NOT NULL, frequency TEXT NOT NULL, next_run_at INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("savings_goals", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, account_id TEXT NOT NULL, name TEXT NOT NULL, target_amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("payment_links", "id TEXT PRIMARY KEY NOT NULL, owner_discord_id TEXT NOT NULL, biller_account_id TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("account_members", "id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, discord_id TEXT NOT NULL, role TEXT DEFAULT 'viewer' NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("saas_invoices", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, amount INTEGER NOT NULL, period TEXT NOT NULL, due_date INTEGER NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("onyx_merchant_products", "id TEXT PRIMARY KEY NOT NULL, merchant_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("onyx_quotes", "id TEXT PRIMARY KEY NOT NULL, merchant_id TEXT NOT NULL, created_by_discord_id TEXT NOT NULL, amount INTEGER NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("discord_webhooks", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, events TEXT NOT NULL, created_at INTEGER NOT NULL");
  createTableIfNotExists("global_audit_logs", "id TEXT PRIMARY KEY NOT NULL, discord_id TEXT, action TEXT NOT NULL, details TEXT, ip_address TEXT, route TEXT, method TEXT, bank_id TEXT, latency_ms INTEGER, timestamp INTEGER NOT NULL");

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
  checkAndAddColumn("banks", "suspended_reason", "TEXT");
  checkAndAddColumn("banks", "suspended_at", "INTEGER");
  checkAndAddColumn("banks", "api_key_hash", "TEXT");
  checkAndAddColumn("banks", "api_key_last4", "TEXT");
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
  checkAndAddColumn("bank_accounts", "custom_apy_percent", "INTEGER");
  checkAndAddColumn("bank_accounts", "exists_in_game", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_accounts", "last_synced_at", "INTEGER");
  checkAndAddColumn("bank_accounts", "sync_error", "TEXT");
  checkAndAddColumn("bank_accounts", "tier_id", "TEXT");

  // Bank Customers table
  checkAndAddColumn("bank_customers", "kyc_status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("bank_customers", "mc_uuid", "TEXT");
  checkAndAddColumn("bank_customers", "mc_username", "TEXT");
  checkAndAddColumn("bank_customers", "linked_discord_id", "TEXT");
  checkAndAddColumn("bank_customers", "city_corp_token", "TEXT");
  checkAndAddColumn("bank_customers", "notes", "TEXT");
  checkAndAddColumn("bank_customers", "first_joined", "INTEGER");
  checkAndAddColumn("bank_customers", "rp_name", "TEXT");
  checkAndAddColumn("bank_customers", "address", "TEXT");

  // Users table
  checkAndAddColumn("users", "rp_name", "TEXT");
  checkAndAddColumn("users", "address", "TEXT");

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
  checkAndAddColumn("bank_settings", "loan_pool_account", "TEXT");
  checkAndAddColumn("bank_settings", "fee_collection_account", "TEXT");
  checkAndAddColumn("bank_settings", "interest_pool_account", "TEXT");
  checkAndAddColumn("bank_settings", "savings_apy_percent", "INTEGER DEFAULT 300");
  checkAndAddColumn("bank_settings", "require_personal_for_business", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "last_interest_accrual_at", "INTEGER");
  checkAndAddColumn("bank_settings", "enable_google_docs_contracts", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "google_docs_loan_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_credit_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_escrow_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_folder_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_auto_generate", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "enable_account_tiers", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "account_tiers", "TEXT");
  checkAndAddColumn("bank_settings", "interest_payment_schedule", "TEXT DEFAULT 'manual'");
  checkAndAddColumn("bank_settings", "interest_next_payment_at", "INTEGER");
  checkAndAddColumn("bank_settings", "interest_target_accounts", "TEXT DEFAULT 'savings_only'");
  checkAndAddColumn("bank_settings", "interest_min_balance", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "interest_max_account_balance", "INTEGER");
  checkAndAddColumn("bank_settings", "interest_requires_activity_days", "INTEGER");
  checkAndAddColumn("bank_settings", "interest_min_account_age_days", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "interest_calculation_method", "TEXT DEFAULT 'current_balance'");
  checkAndAddColumn("bank_settings", "interest_eligible_account_types", "TEXT");
  checkAndAddColumn("bank_settings", "default_corp_account", "TEXT");
  checkAndAddColumn("bank_settings", "settlement_account", "TEXT");
  checkAndAddColumn("bank_settings", "settlement_floor_cents", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "settlement_warn_cents", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "slate_advance_cents", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "default_fee_payer_mode", "TEXT DEFAULT 'from_payment'");
  checkAndAddColumn("bank_settings", "default_loan_apr", "INTEGER DEFAULT 500");
  checkAndAddColumn("bank_settings", "default_loan_term_months", "INTEGER DEFAULT 12");
  checkAndAddColumn("bank_settings", "max_loan_amount_cents", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "loan_payment_period_days", "INTEGER DEFAULT 30");
  checkAndAddColumn("bank_settings", "loan_auto_debit_enabled", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "loan_late_fee_flat_cents", "INTEGER DEFAULT 2500");
  checkAndAddColumn("bank_settings", "loan_late_fee_percent", "INTEGER DEFAULT 500");
  checkAndAddColumn("bank_settings", "loan_misses_to_default", "INTEGER DEFAULT 3");
  checkAndAddColumn("bank_settings", "loan_grace_period_days", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "loan_retry_days", "INTEGER DEFAULT 7");
  checkAndAddColumn("bank_settings", "loan_accrue_interest", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "loan_interest_accrual", "TEXT DEFAULT 'daily'");
  checkAndAddColumn("bank_settings", "loan_accrue_on_defaulted", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "loan_compound_late_fees", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "loan_min_installment_cents", "INTEGER DEFAULT 100");
  checkAndAddColumn("bank_settings", "loan_require_signature", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "loan_allow_citizen_apply", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "loan_cure_default_on_pay", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "loan_days_in_year", "INTEGER DEFAULT 365");
  checkAndAddColumn("bank_settings", "interest_days_in_year", "INTEGER DEFAULT 365");
  checkAndAddColumn("bank_settings", "tagline", "TEXT");
  checkAndAddColumn("bank_settings", "discord_welcome", "TEXT");
  checkAndAddColumn("bank_settings", "discord_footer", "TEXT");
  checkAndAddColumn("bank_settings", "discord_bot_activity", "TEXT");
  checkAndAddColumn("bank_settings", "discord_show_stats", "INTEGER DEFAULT 1");
  checkAndAddColumn("bank_settings", "discord_notify_customers", "INTEGER DEFAULT 1");

  // Transactions table
  checkAndAddColumn("transactions", "from_account_id", "TEXT");
  checkAndAddColumn("transactions", "to_account_id", "TEXT");
  checkAndAddColumn("transactions", "description", "TEXT");
  checkAndAddColumn("transactions", "is_flagged", "INTEGER DEFAULT 0");
  checkAndAddColumn("transactions", "category", "TEXT");
  checkAndAddColumn("transactions", "fee_type", "TEXT");
  checkAndAddColumn("transactions", "amount_submitted", "INTEGER");
  checkAndAddColumn("transactions", "amount_received", "INTEGER");
  checkAndAddColumn("transactions", "fee_payer_mode", "TEXT");
  checkAndAddColumn("transactions", "fee_breakdown", "TEXT");

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
  checkAndAddColumn("loans", "initial_paid_amount", "INTEGER DEFAULT 0");
  checkAndAddColumn("loans", "is_off_system", "INTEGER DEFAULT 0");
  checkAndAddColumn("loans", "off_system_reference", "TEXT");
  checkAndAddColumn("loans", "product_id", "TEXT");
  checkAndAddColumn("loans", "term_months", "INTEGER DEFAULT 12");
  checkAndAddColumn("loans", "last_due_reminder_at", "INTEGER");

  // Escrows table
  checkAndAddColumn("escrows", "description", "TEXT");
  checkAndAddColumn("escrows", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("escrows", "contract_url", "TEXT");

  // Credit Applications table
  checkAndAddColumn("credit_applications", "purpose", "TEXT");
  checkAndAddColumn("credit_applications", "status", "TEXT DEFAULT 'pending'");
  checkAndAddColumn("credit_applications", "contract_url", "TEXT");

  
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
  checkAndAddColumn("onyx_merchants", "api_key_hash", "TEXT");
  checkAndAddColumn("onyx_merchants", "api_key_last4", "TEXT");

  createTableIfNotExists("platform_alerts", "id TEXT PRIMARY KEY NOT NULL, bank_id TEXT, severity TEXT NOT NULL DEFAULT 'warning', code TEXT NOT NULL, message TEXT NOT NULL, is_open INTEGER DEFAULT 1, created_at INTEGER NOT NULL, resolved_at INTEGER, resolved_by TEXT");
  createTableIfNotExists("used_payment_tokens", "token_hash TEXT PRIMARY KEY NOT NULL, merchant_id TEXT, discord_id TEXT, amount_cents INTEGER, used_at INTEGER NOT NULL");

  // Onyx Settings table
  checkAndAddColumn("onyx_settings", "b2b_api_fee_percent", "INTEGER DEFAULT 200");
  checkAndAddColumn("onyx_settings", "clearinghouse_enabled", "INTEGER DEFAULT 1");
  checkAndAddColumn("onyx_settings", "global_bot_maintenance", "INTEGER DEFAULT 0");
  checkAndAddColumn("onyx_settings", "bot_token", "TEXT");
  checkAndAddColumn("onyx_settings", "gui_channel_id", "TEXT");
  checkAndAddColumn("onyx_settings", "gui_message_id", "TEXT");
  checkAndAddColumn("onyx_settings", "settlement_schedule", "TEXT DEFAULT 'weekly'");
  checkAndAddColumn("onyx_settings", "last_net_settlement_at", "INTEGER");
  checkAndAddColumn("onyx_settings", "settlement_min_cents", "INTEGER DEFAULT 10000");

  // Ensure high-performance indexes exist
  createIndexIfNotExists("idx_bank_accounts_bank_id", "bank_accounts", "bank_id");
  createIndexIfNotExists("idx_bank_accounts_owner_discord_id", "bank_accounts", "owner_discord_id");
  createIndexIfNotExists("idx_transactions_bank_id", "transactions", "bank_id");
  createIndexIfNotExists("idx_transactions_from_acc", "transactions", "from_account_id");
  createIndexIfNotExists("idx_transactions_to_acc", "transactions", "to_account_id");
  createIndexIfNotExists("idx_transactions_ts", "transactions", "timestamp");
  createIndexIfNotExists("idx_bank_customers_bank_id", "bank_customers", "bank_id");
  createIndexIfNotExists("idx_bank_customers_discord_id", "bank_customers", "discord_id");
  createIndexIfNotExists("idx_bank_customers_mc_uuid", "bank_customers", "mc_uuid");
  createIndexIfNotExists("idx_account_members_account_id", "account_members", "account_id");
  createIndexIfNotExists("idx_account_members_discord_id", "account_members", "discord_id");
  createIndexIfNotExists("idx_invoices_bank_id", "invoices", "bank_id");
  createIndexIfNotExists("idx_invoices_customer_acc", "invoices", "customer_account_id");
  createIndexIfNotExists("idx_invoices_biller_acc", "invoices", "biller_account_id");
  createIndexIfNotExists("idx_cards_bank_id", "cards", "bank_id");
  createIndexIfNotExists("idx_cards_account_id", "cards", "account_id");
  createIndexIfNotExists("idx_vault_deposits_bank_id", "vault_deposits", "bank_id");
  createIndexIfNotExists("idx_vault_deposits_account_id", "vault_deposits", "account_id");
  createIndexIfNotExists("idx_payroll_bank_id", "payroll_jobs", "bank_id");
  createIndexIfNotExists("idx_payroll_employer_acc", "payroll_jobs", "employer_account_id");
  createIndexIfNotExists("idx_subs_bank_id", "subscriptions", "bank_id");
  createIndexIfNotExists("idx_subs_customer_acc", "subscriptions", "customer_account_id");
  createIndexIfNotExists("idx_global_audit_ts", "global_audit_logs", "timestamp");
  createIndexIfNotExists("idx_global_audit_bank_id", "global_audit_logs", "bank_id");
  createIndexIfNotExists("idx_global_admins_discord_id", "global_admins", "discord_id");
  createIndexIfNotExists("idx_address_book_owner", "address_book", "owner_discord_id");
  createIndexIfNotExists("idx_recurring_transfers_owner", "recurring_transfers", "owner_discord_id");
  createIndexIfNotExists("idx_savings_goals_owner", "savings_goals", "owner_discord_id");
  createIndexIfNotExists("idx_payment_links_owner", "payment_links", "owner_discord_id");
  createIndexIfNotExists("idx_interbank_from_bank", "inter_bank_transfers", "from_bank_id");
  createIndexIfNotExists("idx_interbank_to_bank", "inter_bank_transfers", "to_bank_id");
  createIndexIfNotExists("idx_platform_alerts_bank_id", "platform_alerts", "bank_id");
  createIndexIfNotExists("idx_platform_alerts_open", "platform_alerts", "is_open");
  createIndexIfNotExists("idx_used_payment_tokens_merchant", "used_payment_tokens", "merchant_id");
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
    // migrate(db, { migrationsFolder });
  }
} catch (err) {
  console.error("Migration error on startup:", err);
}
