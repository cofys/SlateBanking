import { db } from "./src/db/index.js";
import { banks } from "./src/db/schema.js";

async function check() {
  const allBanks = await db.select().from(banks).all();
  console.log("Banks:", allBanks);
}
check();
