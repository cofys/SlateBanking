import * as fs from 'fs';

let code = fs.readFileSync('src/App.tsx', 'utf8');

const oldRouting = `  if (customBankId) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto"><BankPortal overrideBankId={customBankId} /></div>} />
        </Routes>
      </BrowserRouter>
    );
  }`;

const newRouting = `  if (customBankId) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/bank/:bankId" element={<BankAdminLayout />}>
            <Route index element={<BankOverview />} />
            <Route path="analytics" element={<BankAnalytics />} />
            <Route path="customers" element={<BankCustomers />} />
            <Route path="customers/:discordId" element={<BankCustomerDetail />} />
            <Route path="accounts" element={<BankAccounts />} />
            <Route path="accounts/:accountId" element={<BankAccountDetail />} />
            <Route path="transactions" element={<BankTransactions />} />
            <Route path="compliance" element={<BankCompliance />} />
            <Route path="loans" element={<BankLoans />} />
            <Route path="vaults" element={<BankVaults />} />
            <Route path="cards" element={<BankCards />} />
            <Route path="payroll" element={<BankPayroll />} />
            <Route path="subscriptions" element={<BankSubscriptions />} />
            <Route path="escrow" element={<BankEscrow />} />
            <Route path="treasury" element={<BankTreasury />} />
            <Route path="invoices" element={<BankInvoices />} />
            <Route path="clearinghouse" element={<BankClearinghouse />} />
            <Route path="audit" element={<BankAuditLog />} />
            <Route path="tools" element={<BankTools />} />
            <Route path="developer" element={<BankDeveloper />} />
            <Route path="team" element={<BankTeam />} />
            <Route path="products" element={<BankProducts />} />
            <Route path="settings" element={<BankSettings />} />
          </Route>
          <Route path="/*" element={<div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto"><BankPortal overrideBankId={customBankId} /></div>} />
        </Routes>
      </BrowserRouter>
    );
  }`;

code = code.replace(oldRouting, newRouting);
fs.writeFileSync('src/App.tsx', code);
console.log("Replaced app routing");
