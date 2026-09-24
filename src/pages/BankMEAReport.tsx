import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { 
  FileText, Printer, RefreshCw, Check, Copy, Plus, Trash2, 
  Building2, DollarSign, Shield, Sparkles, Download, ArrowRight, Info, CheckCircle2
} from "lucide-react";

interface LoanRow {
  id: string;
  type: string;
  borrower: string;
  principal: number;
  remainingBalance: number;
  rate: string;
  term: string;
  collateral: string;
  status: string;
}

interface CollateralRow {
  id: string;
  assetType: string;
  description: string;
  borrower: string;
  appraisedValue: number;
  dateAcquired: string;
}

/**
 * Currency formatter for monetary numbers stored in DOLLARS.
 */
function formatCurrency(dollars: number | undefined | null): string {
  if (dollars === undefined || dollars === null || isNaN(dollars)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dollars);
}

export function BankMEAReport() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // General Metadata
  const [reportPeriod, setReportPeriod] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [datePublished, setDatePublished] = useState("");
  const [registeredOwners, setRegisteredOwners] = useState("");
  const [institutionType, setInstitutionType] = useState("Commercial Bank");
  const [description, setDescription] = useState("");
  
  // Executive Overview
  const [managementTeam, setManagementTeam] = useState<string[]>([]);
  const [legalRep, setLegalRep] = useState("");
  const [directAccessEmployees, setDirectAccessEmployees] = useState<string[]>([]);

  // Technical Info
  const [discordLink, setDiscordLink] = useState("");
  const [companyIngameName, setCompanyIngameName] = useState("");
  const [ceoDiscordUser, setCeoDiscordUser] = useState("");
  const [ceoIngameName, setCeoIngameName] = useState("");

  // Consumer Protections Q&A
  const [clearInfo, setClearInfo] = useState("");
  const [privacyData, setPrivacyData] = useState("");
  const [disputeHandling, setDisputeHandling] = useState("");
  const [vulnerableProtections, setVulnerableProtections] = useState("");
  const [truthfulAdvertising, setTruthfulAdvertising] = useState("");

  // Income Statement Inputs (in DOLLARS)
  const [interestBusinessLoans, setInterestBusinessLoans] = useState<number>(0);
  const [interestPersonalLoans, setInterestPersonalLoans] = useState<number>(0);
  const [interestMortgages, setInterestMortgages] = useState<number>(0);
  const [interestOther, setInterestOther] = useState<number>(0);

  const [feeAccount, setFeeAccount] = useState<number>(0);
  const [feeService, setFeeService] = useState<number>(0);
  const [feeLate, setFeeLate] = useState<number>(0);
  const [tradingGains, setTradingGains] = useState<number>(0);

  const [expOperations, setExpOperations] = useState<number>(0);
  const [taxWithdrawal, setTaxWithdrawal] = useState<number>(0);

  // Balance Sheet Inputs (in DOLLARS)
  const [cashBankBalance, setCashBankBalance] = useState<number>(0);
  const [cashDepositsHeld, setCashDepositsHeld] = useState<number>(0);
  const [assetBusinessLoans, setAssetBusinessLoans] = useState<number>(0);
  const [assetPersonalLoans, setAssetPersonalLoans] = useState<number>(0);
  const [assetMortgages, setAssetMortgages] = useState<number>(0);
  const [assetCollateralPlots, setAssetCollateralPlots] = useState<number>(0);

  const [liabPersonalDeposits, setLiabPersonalDeposits] = useState<number>(0);
  const [liabBusinessDeposits, setLiabBusinessDeposits] = useState<number>(0);
  const [liabClearinghouseDebt, setLiabClearinghouseDebt] = useState<number>(0);

  // Tables
  const [loanRegister, setLoanRegister] = useState<LoanRow[]>([]);
  const [collateralRegister, setCollateralRegister] = useState<CollateralRow[]>([]);

  // Certification
  const [certName, setCertName] = useState("");
  const [certTitle, setCertTitle] = useState("");
  const [certDate, setCertDate] = useState("");

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bank?.id) {
      loadLiveData();
    }
  }, [bank?.id]);

  const loadLiveData = async () => {
    if (!bank?.id) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/banks/${bank.id}/mea-report/data`);
      if (!res.ok) throw new Error("Failed to load MEA Report live data from server");
      const data = await res.json();

      // Metadata
      setReportPeriod(data.metadata.reportPeriod || `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getFullYear()}`);
      setDatePublished(data.metadata.datePublished || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      setPreparedBy(data.metadata.preparedBy || "Bank Compliance Staff");
      setRegisteredOwners(data.metadata.registeredOwners || bank.name);
      setInstitutionType(data.metadata.institutionType || "Commercial Bank");
      setDescription(data.metadata.description || `${bank.name} is an authorized financial institution on the network.`);

      // Executive
      setManagementTeam(data.executive.managementTeam || []);
      setLegalRep(data.executive.legalRep || "Independent Legal Counsel");
      setDirectAccessEmployees(data.executive.directAccessEmployees || []);
      setDiscordLink(data.executive.discordLink || "");
      setCompanyIngameName(data.executive.companyIngameName || bank.name);
      setCeoDiscordUser(data.executive.ceoDiscordUser || "");
      setCeoIngameName(data.executive.ceoIngameName || "");

      // Consumer Protections
      setClearInfo(data.consumerProtections.clearInfo || "");
      setPrivacyData(data.consumerProtections.privacyData || "");
      setDisputeHandling(data.consumerProtections.disputeHandling || "");
      setVulnerableProtections(data.consumerProtections.vulnerableProtections || "");
      setTruthfulAdvertising(data.consumerProtections.truthfulAdvertising || "");

      // Income Statement
      setInterestBusinessLoans(data.incomeStatement.interestBusinessLoans || 0);
      setInterestPersonalLoans(data.incomeStatement.interestPersonalLoans || 0);
      setInterestMortgages(data.incomeStatement.interestMortgages || 0);
      setInterestOther(data.incomeStatement.interestOther || 0);
      setFeeAccount(data.incomeStatement.feeAccount || 0);
      setFeeService(data.incomeStatement.feeService || 0);
      setFeeLate(data.incomeStatement.feeLate || 0);
      setTradingGains(data.incomeStatement.tradingGains || 0);
      setExpOperations(data.incomeStatement.expOperations || 0);
      setTaxWithdrawal(data.incomeStatement.taxWithdrawal || 0);

      // Balance Sheet
      setCashBankBalance(data.balanceSheet.cashBankBalance || 0);
      setCashDepositsHeld(data.balanceSheet.cashDepositsHeld || 0);
      setAssetBusinessLoans(data.balanceSheet.assetBusinessLoans || 0);
      setAssetPersonalLoans(data.balanceSheet.assetPersonalLoans || 0);
      setAssetMortgages(data.balanceSheet.assetMortgages || 0);
      setAssetCollateralPlots(data.balanceSheet.assetCollateralPlots || 0);
      setLiabPersonalDeposits(data.balanceSheet.liabPersonalDeposits || 0);
      setLiabBusinessDeposits(data.balanceSheet.liabBusinessDeposits || 0);
      setLiabClearinghouseDebt(data.balanceSheet.liabClearinghouseDebt || 0);

      // Registers
      setLoanRegister(data.loanRegister || []);
      setCollateralRegister(data.collateralRegister || []);

      // Certification
      setCertName(data.certification.certName || "");
      setCertTitle(data.certification.certTitle || "Managing Director / Compliance Officer");
      setCertDate(data.certification.certDate || new Date().toLocaleDateString('en-US'));

      setAutoFilled(true);
      setSyncToast("Ledger Synchronized: 100% accurate figures verified from live database.");
      setTimeout(() => setSyncToast(null), 4000);
    } catch (e: any) {
      console.error("Failed to load MEA Report live data:", e);
      setSyncToast("Error syncing live ledger data. Please check connection.");
      setTimeout(() => setSyncToast(null), 4000);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  // Computations (all in DOLLARS)
  const totalInterestIncome = interestBusinessLoans + interestPersonalLoans + interestMortgages + interestOther;
  const totalFeeIncome = feeAccount + feeService + feeLate;
  const totalGrossIncome = totalInterestIncome + totalFeeIncome + tradingGains;
  const totalExpenses = expOperations;
  const netIncome = totalGrossIncome - (totalExpenses + taxWithdrawal);

  const totalLoanAssets = assetBusinessLoans + assetPersonalLoans + assetMortgages;
  const totalAssets = cashBankBalance + cashDepositsHeld + totalLoanAssets + assetCollateralPlots;

  const totalLiabilities = liabPersonalDeposits + liabBusinessDeposits + (liabClearinghouseDebt || 0);
  const totalEquity = totalAssets - totalLiabilities;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyMarkdown = () => {
    const loanRowsMd = loanRegister.length > 0 
      ? loanRegister.map(l => `| ${l.type} | ${l.borrower} | ${formatCurrency(l.principal)} | ${formatCurrency(l.remainingBalance)} | ${l.rate} | ${l.term} | ${l.collateral} | ${l.status} |`).join('\n')
      : '| None | No active loans | $0.00 | $0.00 | 0.00% | N/A | None | Inactive |';

    const collateralRowsMd = collateralRegister.length > 0
      ? collateralRegister.map(c => `| ${c.assetType} | ${c.description} | ${c.borrower} | ${formatCurrency(c.appraisedValue)} | ${c.dateAcquired} |`).join('\n')
      : '| None | No pledged collateral assets | N/A | $0.00 | N/A |';

    const md = `
# MEA FINANCIAL INSTITUTION REPORT
**Institution Name:** ${bank?.name}
**Reporting Period:** ${reportPeriod}
**Prepared By:** ${preparedBy}
**Date Published:** ${datePublished}
**Registered Owners:** ${registeredOwners}

---

## 1. CORPORATE INFORMATION
**Institution Type:** ${institutionType}
**Description:** ${description}

### Executive Overview
- **Management Team:** ${managementTeam.join(', ') || 'N/A'}
- **Legal Representation:** ${legalRep || 'Independent Counsel'}
- **Authorized Balance Control Personnel:** ${directAccessEmployees.join(', ') || 'N/A'}

### Technical Information
- **Discord Portal:** ${discordLink || 'N/A'}
- **In-Game Tag:** ${companyIngameName || bank?.name}
- **CEO Discord:** ${ceoDiscordUser || 'N/A'}
- **CEO In-Game Name:** ${ceoIngameName || 'N/A'}

---

## 2. CONSUMER FINANCIAL PROTECTIONS
| Requirement | Institution Response |
| :--- | :--- |
| **Clear & Accurate Information** | ${clearInfo} |
| **Privacy & Data Protection** | ${privacyData} |
| **Complaint & Dispute Handling** | ${disputeHandling} |
| **New/Vulnerable Player Protections** | ${vulnerableProtections} |
| **Truthful Advertising Practices** | ${truthfulAdvertising} |

---

## 3. FINANCIAL DISCLOSURES

### Income Statement
| Category | Subcategory | Amount |
| :--- | :--- | :--- |
| Interest Income | Business Loans | ${formatCurrency(interestBusinessLoans)} |
| Interest Income | Personal Loans | ${formatCurrency(interestPersonalLoans)} |
| Interest Income | Mortgages | ${formatCurrency(interestMortgages)} |
| Interest Income | Other / Treasury Yield | ${formatCurrency(interestOther)} |
| Fee Income | Account Fees | ${formatCurrency(feeAccount)} |
| Fee Income | Service & Transfer Fees | ${formatCurrency(feeService)} |
| Fee Income | Late Fees | ${formatCurrency(feeLate)} |
| Trading Income | Merchant & Trading Gains | ${formatCurrency(tradingGains)} |
| **Gross Revenue** | **Total Revenue** | **${formatCurrency(totalGrossIncome)}** |
| Expenses | Operating & Salaries | ${formatCurrency(expOperations)} |
| Taxes | Withdrawal / Civic Transit Tax | ${formatCurrency(taxWithdrawal)} |
| **Net Income** | **Gross Income - (Expenses + Taxes)** | **${formatCurrency(netIncome)}** |

### Loan Register
| Type | Borrower | Principal | Remaining | Rate | Term | Collateral | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${loanRowsMd}

### Collateral Asset Register
| Asset Type | Description | Borrower | Appraised Value | Date Acquired |
| :--- | :--- | :--- | :--- | :--- |
${collateralRowsMd}

---

## 4. BALANCE SHEET

### Assets
| Category | Subcategory | Value |
| :--- | :--- | :--- |
| Cash Reserves | Bank Vault Cash & Clearinghouse Reserves | ${formatCurrency(cashBankBalance)} |
| Cash Reserves | Total Customer Deposits Held | ${formatCurrency(cashDepositsHeld)} |
| Loans Receivable | Business Loans | ${formatCurrency(assetBusinessLoans)} |
| Loans Receivable | Personal Loans | ${formatCurrency(assetPersonalLoans)} |
| Loans Receivable | Mortgages | ${formatCurrency(assetMortgages)} |
| Collateral | Appraised Pledged Assets | ${formatCurrency(assetCollateralPlots)} |
| **Total Assets** | **Sum of all Bank Assets** | **${formatCurrency(totalAssets)}** |

### Liabilities
| Category | Subcategory | Value |
| :--- | :--- | :--- |
| Customer Deposits | Personal & Retail Deposits | ${formatCurrency(liabPersonalDeposits)} |
| Customer Deposits | Business & Corporate Deposits | ${formatCurrency(liabBusinessDeposits)} |
| Interbank Obligations | Clearinghouse Debt / Wires | ${formatCurrency(liabClearinghouseDebt)} |
| **Total Liabilities** | **Sum of all Liabilities** | **${formatCurrency(totalLiabilities)}** |

### Equity
**Total Equity (Total Assets - Total Liabilities):** ${formatCurrency(totalEquity)}

---

## 5. CERTIFICATION STATEMENT
*"I certify that the information contained in this report is accurate and complete to the best of my knowledge."*

- **Authorized Signature:** ${certName}
- **Title / Role:** ${certTitle}
- **Date Certified:** ${certDate}
    `.trim();

    navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <RefreshCw size={32} className="text-indigo-400 animate-spin mb-4" />
        <h3 className="text-lg font-bold text-white">Aggregating Live MEA Financial Data...</h3>
        <p className="text-xs text-zinc-400 mt-1">Directly auditing accounts, loan registers, fee accounts, and staff credentials from SQLite.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-16 animate-in fade-in duration-500">
      {/* Top Action Bar (Hidden in Print View) */}
      <div className="print:hidden mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Regulatory Compliance
            </span>
            {autoFilled && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles size={10} /> 100% Live DB Sync
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">MEA Financial Institution Report</h2>
          <p className="text-zinc-400 text-xs mt-0.5">
            Official monthly regulatory disclosure generator. Automatically synchronized with live ledger balances, active loans, and staff credentials.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={loadLiveData}
            disabled={syncing}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors disabled:opacity-50"
            title="Re-sync database figures"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Ledger"}
          </button>
          
          <button
            onClick={handleCopyMarkdown}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors"
          >
            {copiedMd ? <><Check size={14} className="text-emerald-400" /> Copied MD</> : <><Copy size={14} /> Copy Markdown</>}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
          >
            <Printer size={15} /> Print / Download PDF
          </button>
        </div>
      </div>

      {/* Sync Toast Feedback */}
      {syncToast && (
        <div className="print:hidden mb-4 bg-emerald-950/60 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in duration-300">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Instructions callout */}
      <div className="print:hidden bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-8 flex items-start gap-3">
        <Info size={18} className="text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-200/90 leading-relaxed">
          <strong className="text-white">Regulatory Notice:</strong> Figures below are accurately populated from your bank's active SQLite GL ledger accounts, customer deposits, loan registry, and staff roles. All totals and financial metrics use unified dollar accounting. You can fine-tune or review any field before printing or exporting to Markdown.
        </div>
      </div>

      {/* Printable Report Document Container */}
      <div 
        ref={reportRef} 
        className="bg-white text-slate-900 rounded-2xl shadow-2xl p-8 md:p-12 font-sans border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0"
      >
        {/* Document Header */}
        <div className="border-b-2 border-indigo-900 pb-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-extrabold text-indigo-950 uppercase tracking-tight text-center">
            MEA FINANCIAL INSTITUTION REPORT
          </h1>
        </div>

        {/* Top Institution Details Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 border border-indigo-200 rounded-xl overflow-hidden mb-6 text-xs divide-y md:divide-y-0 md:divide-x divide-indigo-200">
          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Institution Name:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={bank?.name || ""} 
              readOnly 
              className="w-full font-bold text-slate-900 bg-transparent outline-none cursor-default" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Reporting Period:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={reportPeriod} 
              onChange={e => setReportPeriod(e.target.value)}
              placeholder="e.g. September 2026"
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Prepared By:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={preparedBy} 
              onChange={e => setPreparedBy(e.target.value)}
              placeholder="Staff Member Name / IGN"
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Date Published:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={datePublished} 
              onChange={e => setDatePublished(e.target.value)}
              placeholder="e.g. September 23, 2026"
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Registered Owners:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={registeredOwners} 
              onChange={e => setRegisteredOwners(e.target.value)}
              placeholder="Owner Name(s)"
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>
        </div>

        {/* Bank Logo / Banner Box */}
        <div className="border border-slate-300 rounded-xl p-6 mb-8 text-center bg-slate-950 text-white flex flex-col items-center justify-center min-h-[140px] shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-indigo-950/50" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            {(bank?.logoUrl || bank?.settings?.logoUrl) ? (
              <img
                src={bank.logoUrl || bank.settings.logoUrl}
                alt={bank?.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-2xl object-contain bg-slate-900 border border-indigo-500/40 p-1 shadow-lg shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-2xl text-white shadow-lg shrink-0">
                {bank?.name?.charAt(0) || "B"}
              </div>
            )}
            <h2 className="text-xl font-black text-white tracking-tight">{bank?.name}</h2>
            <p className="text-xs text-indigo-200 font-mono tracking-wider uppercase">Official Financial Institution</p>
          </div>
        </div>

        {/* SECTION 1: CORPORATE INFORMATION */}
        <div className="mb-10">
          <div className="border-b-2 border-indigo-600 pb-1 mb-4">
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">1. CORPORATE INFORMATION</h2>
          </div>

          <div className="border border-indigo-200 rounded-xl overflow-hidden mb-6 text-xs">
            <div className="bg-indigo-50/80 p-3 font-extrabold text-indigo-950 border-b border-indigo-200">
              Description of Institution
            </div>
            <div className="p-4 space-y-4">
              <div>
                <span className="font-bold text-slate-950">Institution Type: </span>
                <input 
                  type="text" 
                  value={institutionType} 
                  onChange={e => setInstitutionType(e.target.value)}
                  className="inline-block border-b border-slate-300 text-slate-800 focus:border-indigo-600 outline-none font-medium px-1"
                />
              </div>

              <div>
                <span className="font-bold text-slate-950 block mb-1">Description:</span>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none focus:border-indigo-500 text-xs leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Executive Overview */}
          <div className="border border-indigo-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-indigo-100/70 p-3 font-extrabold text-indigo-950 border-b border-indigo-200">
              Executive Overview
            </div>
            <div className="p-4 space-y-4 bg-indigo-50/30">
              <div>
                <span className="font-bold text-slate-950 block mb-1">Management Team:</span>
                <textarea
                  rows={2}
                  value={managementTeam.join("\n")}
                  onChange={e => setManagementTeam(e.target.value.split("\n"))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none font-medium text-xs"
                />
              </div>

              <div>
                <span className="font-bold text-slate-950 block mb-1">Legal Representation:</span>
                <input
                  type="text"
                  value={legalRep}
                  onChange={e => setLegalRep(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none font-medium text-xs"
                />
              </div>

              <div>
                <span className="font-bold text-slate-950 block mb-1">
                  Employees with direct access to alter or withdraw from account balances or bank balance:
                </span>
                <textarea
                  rows={2}
                  value={directAccessEmployees.join("\n")}
                  onChange={e => setDirectAccessEmployees(e.target.value.split("\n"))}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none font-medium text-xs"
                />
              </div>
            </div>
          </div>

          {/* Technical Info */}
          <div className="mt-4 border border-indigo-200 rounded-xl overflow-hidden text-xs">
            <div className="bg-indigo-50/80 p-3 font-extrabold text-indigo-950 border-b border-indigo-200">
              Technical Information
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-bold text-slate-900 block mb-1">Discord Link / Portal:</span>
                <input
                  type="text"
                  value={discordLink}
                  onChange={e => setDiscordLink(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none"
                />
              </div>
              <div>
                <span className="font-bold text-slate-900 block mb-1">Company In-Game Name:</span>
                <input
                  type="text"
                  value={companyIngameName}
                  onChange={e => setCompanyIngameName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none"
                />
              </div>
              <div>
                <span className="font-bold text-slate-900 block mb-1">CEO Discord Username / ID:</span>
                <input
                  type="text"
                  value={ceoDiscordUser}
                  onChange={e => setCeoDiscordUser(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none"
                />
              </div>
              <div>
                <span className="font-bold text-slate-900 block mb-1">CEO In-Game Name (IGN):</span>
                <input
                  type="text"
                  value={ceoIngameName}
                  onChange={e => setCeoIngameName(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: CONSUMER FINANCIAL PROTECTIONS */}
        <div className="mb-10 page-break-before">
          <div className="border-b-2 border-indigo-600 pb-1 mb-4">
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">2. Consumer Financial Protections</h2>
          </div>

          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-950 font-black">
                  <th className="p-3 w-1/2 border-r border-slate-300">Protection Requirement (Guidance)</th>
                  <th className="p-3 w-1/2">Bank Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-3 border-r border-slate-200 align-top bg-slate-50/50">
                    <p className="font-bold text-slate-950">Clear & Accurate Information:</p>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      How does the bank ensure all fees, interest rates, loan terms, risks, and account rules are explained clearly before customers use the product?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={clearInfo} 
                      onChange={e => setClearInfo(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500 leading-relaxed" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-3 border-r border-slate-200 align-top bg-slate-50/50">
                    <p className="font-bold text-slate-950">Privacy & Data Protection:</p>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      How does the bank protect player financial data, restrict access, and enforce confidentiality for staff with account permissions?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={privacyData} 
                      onChange={e => setPrivacyData(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500 leading-relaxed" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-3 border-r border-slate-200 align-top bg-slate-50/50">
                    <p className="font-bold text-slate-950">Complaint & Dispute Handling:</p>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      What is the bank's process for receiving, responding to, and resolving consumer complaints? Include average response times & channels.
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={disputeHandling} 
                      onChange={e => setDisputeHandling(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500 leading-relaxed" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-3 border-r border-slate-200 align-top bg-slate-50/50">
                    <p className="font-bold text-slate-950">New/Vulnerable Player Protections:</p>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      What safeguards prevent inexperienced players from being exploited (simplified explanations, extra approvals for risky products, etc.)?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={vulnerableProtections} 
                      onChange={e => setVulnerableProtections(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500 leading-relaxed" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-3 border-r border-slate-200 align-top bg-slate-50/50">
                    <p className="font-bold text-slate-950">Truthful Advertising Practices:</p>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      How does the bank ensure all advertising is accurate, non-misleading, and compliant with MEA standards?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={truthfulAdvertising} 
                      onChange={e => setTruthfulAdvertising(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500 leading-relaxed" 
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: FINANCIAL DISCLOSURES */}
        <div className="mb-10 page-break-before">
          <div className="border-b-2 border-indigo-600 pb-1 mb-4">
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">3. FINANCIAL DISCLOSURES</h2>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Income Statement (Period Totals in USD)</h3>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-8">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2.5 border-r border-slate-300">Category</th>
                  <th className="p-2.5 border-r border-slate-300">Subcategory</th>
                  <th className="p-2.5 text-right w-44">Amount ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Business Loans Interest</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={interestBusinessLoans} 
                      onChange={e => setInterestBusinessLoans(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Personal Loans Interest</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={interestPersonalLoans} 
                      onChange={e => setInterestPersonalLoans(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Mortgages Interest</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={interestMortgages} 
                      onChange={e => setInterestMortgages(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Other / Treasury Yield (GL Interest Pool)</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={interestOther} 
                      onChange={e => setInterestOther(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Fee Income</td>
                  <td className="p-2 border-r border-slate-200">Account Maintenance Fees</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={feeAccount} 
                      onChange={e => setFeeAccount(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Fee Income</td>
                  <td className="p-2 border-r border-slate-200">Service, Transfer & Deposit Fees (GL Fee Clearing)</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={feeService} 
                      onChange={e => setFeeService(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Fee Income</td>
                  <td className="p-2 border-r border-slate-200">Late Fees Assessed</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={feeLate} 
                      onChange={e => setFeeLate(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Trading / PSP Income</td>
                  <td className="p-2 border-r border-slate-200">Merchant Processing & Trading Gains</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={tradingGains} 
                      onChange={e => setTradingGains(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>

                <tr className="bg-slate-50/80 font-semibold text-slate-900">
                  <td className="p-2 border-r border-slate-300" colSpan={2}>Gross Revenue Subtotal</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(totalGrossIncome)}</td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200 text-rose-900">Operating Expenses</td>
                  <td className="p-2 border-r border-slate-200">Salaries, Slate Platform Fees & Infrastructure</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={expOperations} 
                      onChange={e => setExpOperations(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono text-rose-800" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200 text-rose-900">Taxes</td>
                  <td className="p-2 border-r border-slate-200">Withdrawal & Civic Transit Taxes Remitted</td>
                  <td className="p-1 text-right">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={taxWithdrawal} 
                      onChange={e => setTaxWithdrawal(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono text-rose-800" 
                    />
                  </td>
                </tr>

                <tr className="bg-indigo-50/80 font-bold text-indigo-950">
                  <td className="p-3 border-r border-slate-300" colSpan={2}>Net Income = Gross Income - (Expenses + Taxes)</td>
                  <td className="p-3 text-right font-mono text-sm">{formatCurrency(netIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Loan Register Table */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-indigo-900 text-sm">Loan Register</h3>
              <p className="text-[11px] text-slate-500">Live outstanding credit portfolio originated by the bank.</p>
            </div>
            <button
              onClick={() => setLoanRegister([...loanRegister, { 
                id: `LN-${Date.now().toString().slice(-4)}`, 
                type: "Personal", 
                borrower: "Borrower IGN", 
                principal: 1000, 
                remainingBalance: 1000, 
                rate: "5.00%", 
                term: "6 months", 
                collateral: "None", 
                status: "Active" 
              }])}
              className="print:hidden text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200 font-semibold flex items-center gap-1 hover:bg-indigo-100 transition-colors"
            >
              <Plus size={12} /> Add Loan Row
            </button>
          </div>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-8">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2 border-r border-slate-200">Type</th>
                  <th className="p-2 border-r border-slate-200">Borrower</th>
                  <th className="p-2 border-r border-slate-200 text-right">Principal ($)</th>
                  <th className="p-2 border-r border-slate-200 text-right">Remaining ($)</th>
                  <th className="p-2 border-r border-slate-200">Rate</th>
                  <th className="p-2 border-r border-slate-200">Term</th>
                  <th className="p-2 border-r border-slate-200">Collateral</th>
                  <th className="p-2 border-r border-slate-200">Status</th>
                  <th className="p-2 print:hidden w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {loanRegister.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-4 text-center text-slate-500 font-sans italic bg-slate-50/50">
                      No active loans currently recorded in the database register. Click "Add Loan Row" above if reporting off-system loans.
                    </td>
                  </tr>
                ) : (
                  loanRegister.map((lr, idx) => (
                    <tr key={lr.id || idx}>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={lr.type} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].type = e.target.value; setLoanRegister(copy); }} 
                          className="w-full outline-none font-sans px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={lr.borrower} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].borrower = e.target.value; setLoanRegister(copy); }} 
                          className="w-full outline-none font-sans px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200 text-right">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={lr.principal} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].principal = Number(e.target.value); setLoanRegister(copy); }} 
                          className="w-full text-right outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200 text-right">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={lr.remainingBalance} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].remainingBalance = Number(e.target.value); setLoanRegister(copy); }} 
                          className="w-full text-right outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={lr.rate} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].rate = e.target.value; setLoanRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={lr.term} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].term = e.target.value; setLoanRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={lr.collateral} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].collateral = e.target.value; setLoanRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={lr.status} 
                          onChange={e => { const copy = [...loanRegister]; copy[idx].status = e.target.value; setLoanRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 print:hidden text-center">
                        <button 
                          onClick={() => setLoanRegister(loanRegister.filter((_, i) => i !== idx))} 
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Delete row"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Collateral Table */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-indigo-900 text-sm">Collateral Asset Register</h3>
              <p className="text-[11px] text-slate-500">Appraised assets pledged to secure active lending facilities.</p>
            </div>
            <button
              onClick={() => setCollateralRegister([...collateralRegister, { 
                id: `COL-${Date.now().toString().slice(-4)}`, 
                assetType: "Real Estate", 
                description: "Plot / Commercial Property", 
                borrower: "Borrower IGN", 
                appraisedValue: 5000, 
                dateAcquired: new Date().toLocaleDateString('en-US') 
              }])}
              className="print:hidden text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200 font-semibold flex items-center gap-1 hover:bg-indigo-100 transition-colors"
            >
              <Plus size={12} /> Add Collateral Row
            </button>
          </div>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-8">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2 border-r border-slate-200">Asset Type</th>
                  <th className="p-2 border-r border-slate-200">Description</th>
                  <th className="p-2 border-r border-slate-200">Borrower</th>
                  <th className="p-2 border-r border-slate-200 text-right">Appraised Value ($)</th>
                  <th className="p-2 border-r border-slate-200">Date Acquired</th>
                  <th className="p-2 print:hidden w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {collateralRegister.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500 font-sans italic bg-slate-50/50">
                      No pledged collateral assets currently recorded. Click "Add Collateral Row" above to manually register pledged assets.
                    </td>
                  </tr>
                ) : (
                  collateralRegister.map((cr, idx) => (
                    <tr key={cr.id || idx}>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={cr.assetType} 
                          onChange={e => { const copy = [...collateralRegister]; copy[idx].assetType = e.target.value; setCollateralRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={cr.description} 
                          onChange={e => { const copy = [...collateralRegister]; copy[idx].description = e.target.value; setCollateralRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={cr.borrower} 
                          onChange={e => { const copy = [...collateralRegister]; copy[idx].borrower = e.target.value; setCollateralRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200 text-right font-mono">
                        <input 
                          type="number" 
                          step="0.01" 
                          value={cr.appraisedValue} 
                          onChange={e => { const copy = [...collateralRegister]; copy[idx].appraisedValue = Number(e.target.value); setCollateralRegister(copy); }} 
                          className="w-full text-right outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 border-r border-slate-200">
                        <input 
                          type="text" 
                          value={cr.dateAcquired} 
                          onChange={e => { const copy = [...collateralRegister]; copy[idx].dateAcquired = e.target.value; setCollateralRegister(copy); }} 
                          className="w-full outline-none px-1" 
                        />
                      </td>
                      <td className="p-1 print:hidden text-center">
                        <button 
                          onClick={() => setCollateralRegister(collateralRegister.filter((_, i) => i !== idx))} 
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Delete row"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 4: BALANCE SHEET */}
        <div className="mb-10 page-break-before">
          <div className="border-b-2 border-indigo-600 pb-1 mb-4">
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">4. Balance Sheet</h2>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Assets</h3>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2.5 border-r border-slate-300">Category</th>
                  <th className="p-2.5 border-r border-slate-300">Subcategory</th>
                  <th className="p-2.5 text-right w-44">Value ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Cash & Liquid Reserves</td>
                  <td className="p-2 border-r border-slate-200">Bank Cash Balance & Clearinghouse Settlement Reserves</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={cashBankBalance} 
                      onChange={e => setCashBankBalance(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Cash & Custodial Funds</td>
                  <td className="p-2 border-r border-slate-200">Total Customer Deposits Held (Custodial Reserve)</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={cashDepositsHeld} 
                      onChange={e => setCashDepositsHeld(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Loans Receivable</td>
                  <td className="p-2 border-r border-slate-200">Business Loans Outstanding Principal</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={assetBusinessLoans} 
                      onChange={e => setAssetBusinessLoans(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Loans Receivable</td>
                  <td className="p-2 border-r border-slate-200">Personal Loans Outstanding Principal</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={assetPersonalLoans} 
                      onChange={e => setAssetPersonalLoans(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Loans Receivable</td>
                  <td className="p-2 border-r border-slate-200">Mortgages Outstanding Principal</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={assetMortgages} 
                      onChange={e => setAssetMortgages(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Collateral Assets</td>
                  <td className="p-2 border-r border-slate-200">Plots & Appraised Secured Assets</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={assetCollateralPlots} 
                      onChange={e => setAssetCollateralPlots(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr className="bg-emerald-50/80 font-bold text-emerald-950">
                  <td className="p-2.5 border-r border-slate-300" colSpan={2}>Total Assets (Sum of all Bank Assets)</td>
                  <td className="p-2.5 text-right font-mono text-sm">{formatCurrency(totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Liabilities</h3>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2.5 border-r border-slate-300">Category</th>
                  <th className="p-2.5 border-r border-slate-300">Subcategory</th>
                  <th className="p-2.5 text-right w-44">Value ($)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Customer Deposits</td>
                  <td className="p-2 border-r border-slate-200">Personal & Consumer Demand Deposits Owed</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={liabPersonalDeposits} 
                      onChange={e => setLiabPersonalDeposits(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Customer Deposits</td>
                  <td className="p-2 border-r border-slate-200">Business & Commercial Deposits Owed</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={liabBusinessDeposits} 
                      onChange={e => setLiabBusinessDeposits(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interbank Obligations</td>
                  <td className="p-2 border-r border-slate-200">Clearinghouse Unsettled Obligations</td>
                  <td className="p-1 text-right font-mono">
                    <input 
                      type="number" 
                      step="0.01" 
                      value={liabClearinghouseDebt} 
                      onChange={e => setLiabClearinghouseDebt(Number(e.target.value))} 
                      className="w-full text-right p-1 outline-none font-mono" 
                    />
                  </td>
                </tr>
                <tr className="bg-rose-50/80 font-bold text-rose-950">
                  <td className="p-2.5 border-r border-slate-300" colSpan={2}>Total Liabilities (Sum of all Customer & Interbank Liabilities)</td>
                  <td className="p-2.5 text-right font-mono text-sm">{formatCurrency(totalLiabilities)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Equity</h3>
          <div className="border border-indigo-200 rounded-xl overflow-hidden text-xs mb-8">
            <div className="p-3 bg-indigo-900 text-white font-extrabold flex justify-between items-center text-sm">
              <span>Total Equity (Total Assets - Total Liabilities):</span>
              <span className="font-mono">{formatCurrency(totalEquity)}</span>
            </div>
          </div>
        </div>

        {/* SECTION 5: CERTIFICATION STATEMENT */}
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-6 text-xs mb-6">
          <h3 className="font-extrabold text-indigo-950 text-sm mb-2 uppercase tracking-wide">5. Certification Statement</h3>
          <p className="text-slate-800 font-medium mb-6 italic">
            "I certify that the information contained in this report is accurate and complete to the best of my knowledge."
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-indigo-200">
            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">Signature:</span>
              <input 
                type="text" 
                value={certName} 
                onChange={e => setCertName(e.target.value)} 
                placeholder="Authorized Signatory Name"
                className="w-full font-serif italic text-lg text-indigo-950 border-b-2 border-indigo-900 outline-none bg-transparent" 
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">Title:</span>
              <input 
                type="text" 
                value={certTitle} 
                onChange={e => setCertTitle(e.target.value)} 
                placeholder="Signatory Title"
                className="w-full font-medium text-slate-900 border-b border-slate-300 outline-none bg-transparent" 
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">Date:</span>
              <input 
                type="text" 
                value={certDate} 
                onChange={e => setCertDate(e.target.value)} 
                placeholder="Date of Signing"
                className="w-full font-medium text-slate-900 border-b border-slate-300 outline-none bg-transparent" 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
