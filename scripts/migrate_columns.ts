import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "slate_saas.db");
console.log("Migrating database at:", dbPath);
const db = new Database(dbPath);

const statements = [
  "ALTER TABLE banks ADD COLUMN city_corp_app_id TEXT;",
  "ALTER TABLE banks ADD COLUMN city_corp_app_secret TEXT;",
  "ALTER TABLE bank_customers ADD COLUMN mc_uuid TEXT;",
  "ALTER TABLE bank_customers ADD COLUMN mc_username TEXT;",
  "ALTER TABLE bank_customers ADD COLUMN city_corp_token TEXT;"
];

for (const sql of statements) {
  try {
    db.exec(sql);
    console.log(`Successfully executed: ${sql}`);
  } catch (e: any) {
    console.log(`Skipped/Failed execution of: ${sql} - ${e.message}`);
  }
}

db.close();
console.log("Migration script finished.");
