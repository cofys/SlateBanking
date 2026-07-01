import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const filesToDelete = [
  "data/slate_saas.db",
  "data/slate_saas.db-shm",
  "data/slate_saas.db-wal",
  "data/slate_saas.db.bak",
  "slate_saas.db"
];

console.log("Removing malformed database files...");
for (const f of filesToDelete) {
  if (fs.existsSync(f)) {
    try {
      fs.unlinkSync(f);
      console.log(`Deleted: ${f}`);
    } catch (e: any) {
      console.log(`Failed to delete ${f}:`, e.message);
    }
  }
}

// Recreate data directory if not exists
if (!fs.existsSync("data")) {
  fs.mkdirSync("data");
}

console.log("Running migrations...");
try {
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit" });
  console.log("Database recreated and migrated successfully!");
} catch (e: any) {
  console.error("Migration command failed:", e.message);
}
