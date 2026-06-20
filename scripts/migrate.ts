import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../src/db/index";

async function main() {
  console.log("Migrating database...");
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migration complete!");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
