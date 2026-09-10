import re

with open('src/server/interestRoutes.ts', 'r') as f:
    text = f.read()

# Add the calculateADB function at the top level
adb_func = """
async function calculateADB(accountId: string, currentBalance: number, periodDays: number, bankId: string): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    
    const txs = await db.select().from(transactions).where(and(
        or(eq(transactions.toAccountId, accountId), eq(transactions.fromAccountId, accountId)),
        eq(transactions.bankId, bankId)
    )).all();
    
    const periodTxs = txs.filter(t => t.timestamp >= cutoff).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    let runningBalance = currentBalance;
    let lastTime = Date.now();
    let totalBalanceMs = 0;
    
    for (const tx of periodTxs) {
        const txTime = tx.timestamp.getTime();
        totalBalanceMs += runningBalance * (lastTime - txTime);
        lastTime = txTime;
        
        if (tx.toAccountId === accountId) {
            runningBalance -= tx.amount;
        }
        if (tx.fromAccountId === accountId) {
            runningBalance += tx.amount;
        }
    }
    
    totalBalanceMs += runningBalance * (lastTime - cutoff.getTime());
    
    const adb = totalBalanceMs / (periodDays * 24 * 60 * 60 * 1000);
    return Math.max(0, Math.floor(adb));
}
"""

if "calculateADB" not in text:
    text = text.replace("export function registerInterestRoutes", adb_func + "\nexport function registerInterestRoutes")

# Update the account age filtering logic
age_logic_old = """      if (settings?.interestRequiresActivityDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - settings.interestRequiresActivityDays);
        eligibleAccounts = eligibleAccounts.filter(a => {
           if (!a.lastSyncedAt) return false;
           return new Date(a.lastSyncedAt) >= cutoff;
        });
      }"""

age_logic_new = """      if (settings?.interestRequiresActivityDays) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - settings.interestRequiresActivityDays);
        eligibleAccounts = eligibleAccounts.filter(a => {
           if (!a.lastSyncedAt) return false;
           return new Date(a.lastSyncedAt) >= cutoff;
        });
      }
      
      if (settings?.interestMinAccountAgeDays) {
        const cutoffAge = new Date();
        cutoffAge.setDate(cutoffAge.getDate() - settings.interestMinAccountAgeDays);
        eligibleAccounts = eligibleAccounts.filter(a => {
           return new Date(a.createdAt) <= cutoffAge;
        });
      }"""

text = text.replace(age_logic_old, age_logic_new)

# Update principal logic
principal_old = """        let principal = account.balance;
        if (settings?.interestMaxAccountBalance && principal > settings.interestMaxAccountBalance) {
          principal = settings.interestMaxAccountBalance;
        }"""

principal_new = """        let periodDays = 30;
        if (settings?.interestPaymentSchedule === "daily") periodDays = 1;
        if (settings?.interestPaymentSchedule === "weekly") periodDays = 7;
        
        let principal = account.balance;
        if (settings?.interestCalculationMethod === "average_daily_balance") {
            principal = await calculateADB(account.id, account.balance, periodDays, bank.id);
        }
        
        if (settings?.interestMaxAccountBalance && principal > settings.interestMaxAccountBalance) {
          principal = settings.interestMaxAccountBalance;
        }"""

text = text.replace(principal_old, principal_new)

with open('src/server/interestRoutes.ts', 'w') as f:
    f.write(text)

print("Updated interest dispersal logic")
