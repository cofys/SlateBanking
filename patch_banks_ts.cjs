const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'server', 'routes', 'banks.ts');
let content = fs.readFileSync(file, 'utf8');

content = "import { db } from '../../db/index.js';\nimport { bankSettings, banks, bankAccounts, transactions, escrows, bankStaff, supportTickets, auditLogs, loans, creditApplications, vaultDeposits, cards, payrollJobs, subscriptions, clearinghouseBalances, cityCorpLogs, invoices, bankCustomers, loanProducts, creditProducts, saasInvoices, discordWebhooks, onyxMerchants, accountMembers, savingsGoals, paymentLinks, recurringTransfers, clearinghouseSettlements, interBankTransfers } from '../../db/schema.js';\nimport { eq, or } from 'drizzle-orm';\n" + content;

fs.writeFileSync(file, content);
console.log("Patched banks.ts");
