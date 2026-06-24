import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { BankAdminLayout } from "./components/layout/BankAdminLayout";
import { Overview } from "./pages/Overview";
import { BanksList } from "./pages/BanksList";
import { OnyxSettings } from "./pages/OnyxSettings";
import { CityCorpLogs } from "./pages/CityCorpLogs";
import { TransactionsList } from "./pages/TransactionsList";
import { CitizenPortal } from "./pages/CitizenPortal";
import { GlobalSettings } from "./pages/GlobalSettings";
import { BankPortal } from "./pages/BankPortal";
import { BankOverview } from "./pages/BankOverview";
import { BankAccounts } from "./pages/BankAccounts";

import { BankTransactions } from "./pages/BankTransactions";
import { BankSettings } from "./pages/BankSettings";
import { UnderConstruction } from "./pages/UnderConstruction";
import { BankAuditLog } from "./pages/BankAuditLog";
import { BankCustomers } from "./pages/BankCustomers";
import { BankTeam } from "./pages/BankTeam";
import { BankAnalytics } from "./pages/BankAnalytics";
import { BankTools } from "./pages/BankTools";
import { BankDeveloper } from "./pages/BankDeveloper";
import { BankCustomerDetail } from "./pages/BankCustomerDetail";
import { BankAccountDetail } from "./pages/BankAccountDetail";

import { BankCards } from "./pages/BankCards";
import { BankClearinghouse } from "./pages/BankClearinghouse";
import { BankVaults } from "./pages/BankVaults";
import { BankLoans } from "./pages/BankLoans";
import { BankPayroll } from "./pages/BankPayroll";
import { BankSubscriptions } from "./pages/BankSubscriptions";
import { BankEscrow } from "./pages/BankEscrow";
import { BankTreasury } from "./pages/BankTreasury";
import { BankInvoices } from "./pages/BankInvoices";

import { PublicDocs } from "./pages/PublicDocs";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/docs" element={<PublicDocs />} />
        <Route path="/portal" element={<div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto"><CitizenPortal /></div>} />
        <Route path="/portal/:bankId" element={<div className="min-h-screen bg-[#0a0a0c] text-white overflow-y-auto"><BankPortal /></div>} />
        
        {/* Bank Context / Whitelabeled Admin */}
        <Route path="/bank/:bankId" element={<BankAdminLayout />}>
          <Route index element={<BankOverview />} />
          <Route path="analytics" element={<BankAnalytics />} />
          <Route path="customers" element={<BankCustomers />} />
          <Route path="customers/:discordId" element={<BankCustomerDetail />} />
          <Route path="accounts" element={<BankAccounts />} />
          <Route path="accounts/:accountId" element={<BankAccountDetail />} />
          <Route path="transactions" element={<BankTransactions />} />
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
          <Route path="settings" element={<BankSettings />} />
        </Route>

        {/* Global Slate SaaS Admin */}
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="banks" element={<BanksList />} />
          <Route path="transactions" element={<TransactionsList />} />
          <Route path="onyx" element={<OnyxSettings />} />
          <Route path="citycorp" element={<CityCorpLogs />} />
          <Route path="settings" element={<GlobalSettings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
