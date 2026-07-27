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

// Ensure schema columns added in code exist on SQLite database
function ensureDatabaseSchemaSynced() {
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

  // Loans table
  checkAndAddColumn("loans", "purpose", "TEXT");
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
  checkAndAddColumn("escrows", "contract_url", "TEXT");

  // Credit Applications table
  checkAndAddColumn("credit_applications", "contract_url", "TEXT");

  // Bank Settings table
  checkAndAddColumn("bank_settings", "enable_google_docs_contracts", "INTEGER DEFAULT 0");
  checkAndAddColumn("bank_settings", "google_docs_loan_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_credit_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_escrow_template_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_folder_url", "TEXT");
  checkAndAddColumn("bank_settings", "google_docs_auto_generate", "INTEGER DEFAULT 0");

  // Bank Accounts table
  checkAndAddColumn("bank_accounts", "custom_transfer_fee_percent", "INTEGER");
  checkAndAddColumn("bank_accounts", "custom_deposit_fee_percent", "INTEGER");
  checkAndAddColumn("bank_accounts", "custom_withdraw_fee_percent", "INTEGER");
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
