import { db } from './src/db/index';
import { banks } from './src/db/schema';
async function test() {
  const result = await db.select().from(banks).limit(1);
  console.log(result);
}
test();
