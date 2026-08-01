const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'interestRoutes.ts');
let content = fs.readFileSync(file, 'utf8');

// Replace bank. with settings. for all these properties
const propsToReplace = [
  'savingsApyPercent',
  'interestPaymentSchedule',
  'interestNextPaymentAt',
  'interestTargetAccounts',
  'interestMinBalance',
  'interestMaxAccountBalance',
  'interestRequiresActivityDays',
  'lastInterestAccrualAt'
];

propsToReplace.forEach(prop => {
  content = content.replace(new RegExp(`bank\\.${prop}`, 'g'), `settings?.${prop}`);
  content = content.replace(new RegExp(`bank\\.${prop}`, 'g'), `settings?.${prop}`); // Run twice just in case
});

// Fix object literal assignments in db.update(banks) vs db.update(bankSettings)
content = content.replace(
  'await db.update(banks).set({ savingsApyPercent, interestPaymentSchedule, interestNextPaymentAt, interestTargetAccounts, interestMinBalance, interestMaxAccountBalance, interestRequiresActivityDays }).where(eq(banks.id, bankId));',
  'await db.update(bankSettings).set({ savingsApyPercent, interestPaymentSchedule, interestNextPaymentAt: interestNextPaymentAt ? new Date(interestNextPaymentAt) : null, interestTargetAccounts, interestMinBalance, interestMaxAccountBalance, interestRequiresActivityDays }).where(eq(bankSettings.bankId, bankId));'
);

content = content.replace(
  'await db.update(banks).set({ lastInterestAccrualAt: new Date() }).where(eq(banks.id, bankId));',
  'await db.update(bankSettings).set({ lastInterestAccrualAt: new Date() }).where(eq(bankSettings.bankId, bankId));'
);

fs.writeFileSync(file, content);
console.log("Patched interestRoutes.ts");
