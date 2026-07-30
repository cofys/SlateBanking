import { db } from "./src/db/index.js";
import { banks, bankStaff } from "./src/db/schema.js";

async function check() {
  const allBanks = await db.select().from(banks).all();
  console.log("Banks:", allBanks);
  const staff = await db.select().from(bankStaff).all();
  console.log("Staff:", staff);
}
check();
