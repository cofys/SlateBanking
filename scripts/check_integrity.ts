import Database from "better-sqlite3";
import fs from "fs";

const paths = [
  "data/slate_saas.db",
  "data/slate_saas.db.bak",
  "slate_saas.db"
];

for (const p of paths) {
  if (fs.existsSync(p)) {
    try {
      const db = new Database(p);
      const res = db.prepare("PRAGMA integrity_check;").get();
      console.log(`Integrity of ${p}:`, res);
      db.close();
    } catch (e: any) {
      console.log(`Failed checking ${p}:`, e.message);
    }
  } else {
    console.log(`${p} does not exist`);
  }
}
