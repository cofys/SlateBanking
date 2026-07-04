import { db } from "./src/db/index";
import { bankAccounts, transactions } from "./src/db/schema";
import { eq, or, isNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

async function run() {
  const allAccounts = await db.select().from(bankAccounts);
  let fixedCount = 0;
  
  for (const acc of allAccounts) {
    if (acc.balance > 0) {
      // Check if it has any deposit transactions
      const txs = await db.select().from(transactions).where(eq(transactions.toAccountId, acc.id));
      const withdrawals = await db.select().from(transactions).where(eq(transactions.fromAccountId, acc.id));
      
      if (txs.length === 0 && withdrawals.length === 0) {
        console.log(`Fixing account ${acc.id} (${acc.accountName}) - adding initial balance tx of ${acc.balance}`);
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: acc.bankId,
          fromAccountId: null,
          toAccountId: acc.id,
          type: 'deposit',
          amount: acc.balance,
          description: 'Initial balance from migration',
          timestamp: acc.createdAt || new Date()
        });
        fixedCount++;
      }
    }
  }
  
  console.log(`Fixed ${fixedCount} accounts by adding initial balance transactions.`);
}

run().catch(console.error).then(() => process.exit(0));
