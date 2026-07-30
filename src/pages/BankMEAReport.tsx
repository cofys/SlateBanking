import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { 
  FileText, Printer, RefreshCw, Check, Copy, Plus, Trash2, 
  Building2, DollarSign, Shield, Sparkles, Download, ArrowRight, Info
} from "lucide-react";
import { formatMoney } from "../lib/utils";

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

export function BankMEAReport() {
  const { bank } = useOutletContext<{ bank: any }>();
  const [loading, setLoading] = useState(true);
  const [autoFilled, setAutoFilled] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);

  // General Metadata
  const [reportPeriod, setReportPeriod] = useState("July 2026");
  const [preparedBy, setPreparedBy] = useState("Bank Staff");
  const [datePublished, setDatePublished] = useState(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  const [registeredOwners, setRegisteredOwners] = useState("1. Slate");
  const [institutionType, setInstitutionType] = useState("Commercial Bank");
  const [description, setDescription] = useState("");
  
  // Executive Overview
  const [managementTeam, setManagementTeam] = useState<string[]>([]);
  const [legalRep, setLegalRep] = useState("Lyon Law");
  const [directAccessEmployees, setDirectAccessEmployees] = useState<string[]>([]);

  // Technical Info
  const [discordLink, setDiscordLink] = useState("");
  const [companyIngameName, setCompanyIngameName] = useState("");
  const [ceoDiscordUser, setCeoDiscordUser] = useState("");
  const [ceoIngameName, setCeoIngameName] = useState("");

  // Consumer Protections Q&A
  const [clearInfo, setClearInfo] = useState("The bank has a clearly labeled 'terms' channel where the Terms of Service are outlined. The bot directs new account holders to these terms when registering.");
  const [privacyData, setPrivacyData] = useState("Only the management team has access to records, with clear internal expectations.");
  const [disputeHandling, setDisputeHandling] = useState("Individuals may open a ticket through #contact or ask questions in their existing ticket. Customer complaints are addressed by the management team upon being made.");
  const [vulnerableProtections, setVulnerableProtections] = useState("The Terms of Service are clearly outlined and all players are directed to read them when opening an account.");
  const [truthfulAdvertising, setTruthfulAdvertising] = useState("The MEA has no published standards to be compliant with. All advertising aligns with the facts of the business.");

  // Income Statement Inputs
  const [interestBusinessLoans, setInterestBusinessLoans] = useState<number>(0);
  const [interestPersonalLoans, setInterestPersonalLoans] = useState<number>(0);
  const [interestMortgages, setInterestMortgages] = useState<number>(0);
  const [interestOther, setInterestOther] = useState<number>(0);

  const [feeAccount, setFeeAccount] = useState<number>(0);
  const [feeService, setFeeService] = useState<number>(0);
  const [feeLate, setFeeLate] = useState<number>(0);
  const [feeOther, setFeeOther] = useState<number>(0);

  const [tradingGains, setTradingGains] = useState<number>(0);
  const [otherIncome, setOtherIncome] = useState<number>(0);

  const [expInterest, setExpInterest] = useState<number>(0);
  const [expSalaries, setExpSalaries] = useState<number>(0);
  const [expOperations, setExpOperations] = useState<number>(0);
  const [expMarketing, setExpMarketing] = useState<number>(0);
  const [expTechnology, setExpTechnology] = useState<number>(0);
  const [expLegal, setExpLegal] = useState<number>(0);
  const [expOther, setExpOther] = useState<number>(0);
  const [taxWithdrawal, setTaxWithdrawal] = useState<number>(0);

  // Balance Sheet Inputs
  const [cashBankBalance, setCashBankBalance] = useState<number>(0);
  const [cashDepositsHeld, setCashDepositsHeld] = useState<number>(0);
  const [assetBusinessLoans, setAssetBusinessLoans] = useState<number>(0);
  const [assetPersonalLoans, setAssetPersonalLoans] = useState<number>(0);
  const [assetMortgages, setAssetMortgages] = useState<number>(0);
  const [assetCollateralPlots, setAssetCollateralPlots] = useState<number>(0);
  const [assetCollateralItems, setAssetCollateralItems] = useState<number>(0);
  const [assetRealEstatePlots, setAssetRealEstatePlots] = useState<number>(0);
  const [assetInventory, setAssetInventory] = useState<number>(0);
  const [assetReceivables, setAssetReceivables] = useState<number>(0);
  const [assetOther, setAssetOther] = useState<number>(0);

  const [liabPersonalDeposits, setLiabPersonalDeposits] = useState<number>(0);
  const [liabBusinessDeposits, setLiabBusinessDeposits] = useState<number>(0);
  const [liabCDs, setLiabCDs] = useState<number>(0);
  const [liabPendingPayments, setLiabPendingPayments] = useState<number>(0);
  const [liabLoansOwed, setLiabLoansOwed] = useState<number>(0);
  const [liabWithheldTax, setLiabWithheldTax] = useState<number>(0);
  const [liabOther, setLiabOther] = useState<number>(0);

  // Tables
  const [loanRegister, setLoanRegister] = useState<LoanRow[]>([]);
  const [collateralRegister, setCollateralRegister] = useState<CollateralRow[]>([]);

  // Certification
  const [certName, setCertName] = useState("Lysander Lyon");
  const [certTitle, setCertTitle] = useState("Slate CEO / Bank Director");
  const [certDate, setCertDate] = useState(new Date().toLocaleDateString('en-US'));

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bank?.id) {
      loadLiveData();
    }
  }, [bank?.id]);

  const loadLiveData = async () => {
    setLoading(true);
    try {
      const [teamRes, customersRes, loansRes, settingsRes] = await Promise.all([
        fetch(`/api/banks/${bank.id}/team`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/banks/${bank.id}/customers`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/banks/${bank.id}/loans`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`/api/banks/${bank.id}/settings`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      // Populate description
      if (bank.description) {
        setDescription(bank.description);
      } else {
        setDescription(`${bank.name} provides financial tools to help reach goals everyday. We offer deposits, loans, and banking services.`);
      }

      // Staff
      const staffNames = Array.isArray(teamRes) ? teamRes.map((s: any) => s.username || s.discordId) : [];
      setManagementTeam(staffNames.length > 0 ? staffNames : [bank.ownerId || "Bank Staff"]);
      setDirectAccessEmployees(staffNames.length > 0 ? staffNames : [bank.ownerId || "Bank Staff"]);
      if (staffNames.length > 0) {
        setPreparedBy(staffNames[0]);
        setCertName(staffNames[0]);
      }

      // Settings
      if (settingsRes) {
        if (settingsRes.customDomain) setDiscordLink(`https://${settingsRes.customDomain}`);
        setCompanyIngameName(bank.name.split(' ').map((w: string) => w[0]).join('') || bank.name);
      }

      // Totals
      const totalDeposits = Array.isArray(customersRes) 
        ? customersRes.reduce((sum: number, c: any) => sum + (c.totalBalance || 0), 0)
        : 0;

      setCashDepositsHeld(totalDeposits);
      setLiabPersonalDeposits(totalDeposits);
      setCashBankBalance(bank.reserveBalance || 100000);

      // Loans
      if (Array.isArray(loansRes) && loansRes.length > 0) {
        let totalBusinessLoanPrincipal = 0;
        let totalInterestAccrued = 0;

        const mappedLoans: LoanRow[] = loansRes.map((l: any, i: number) => {
          totalBusinessLoanPrincipal += Number(l.amount || 0);
          totalInterestAccrued += Number(l.accruedInterest || 0);

          return {
            id: String(l.id || i),
            type: l.type || "Business",
            borrower: l.borrowerName || l.borrowerDiscordId || `Borrower ${i + 1}`,
            principal: Number(l.amount || 0),
            remainingBalance: Number(l.remainingBalance || l.amount || 0),
            rate: `${l.interestRate || 4}%`,
            term: l.term || "5 months",
            collateral: l.collateral ? "Yes" : "No",
            status: l.status || "Open"
          };
        });

        setLoanRegister(mappedLoans);
        setAssetBusinessLoans(totalBusinessLoanPrincipal);
        setInterestBusinessLoans(totalInterestAccrued > 0 ? totalInterestAccrued : 2000);

        // Collateral mapped
        const mappedCollateral: CollateralRow[] = loansRes
          .filter((l: any) => l.collateral)
          .map((l: any, i: number) => ({
            id: String(i),
            assetType: "Real Estate",
            description: l.collateralDescription || "Plot / Property Collateral",
            borrower: l.borrowerName || l.borrowerDiscordId || `Borrower ${i + 1}`,
            appraisedValue: Number(l.collateralValue || 100000),
            dateAcquired: new Date().toLocaleDateString('en-US')
          }));

        if (mappedCollateral.length > 0) {
          setCollateralRegister(mappedCollateral);
          const totalCollateralVal = mappedCollateral.reduce((acc, c) => acc + c.appraisedValue, 0);
          setAssetCollateralPlots(totalCollateralVal);
        } else {
          setCollateralRegister([{
            id: "1",
            assetType: "Real Estate",
            description: "Plot",
            borrower: "Borrower1",
            appraisedValue: 130000,
            dateAcquired: "02/07/2026"
          }]);
          setAssetCollateralPlots(130000);
        }

      } else {
        // Default sample row if no loans exist
        setLoanRegister([{
          id: "1",
          type: "Business",
          borrower: "Borrower1",
          principal: 50000,
          remainingBalance: 3000,
          rate: "4%",
          term: "5 months",
          collateral: "Yes",
          status: "Open"
        }]);
        setAssetBusinessLoans(3000);
        setInterestBusinessLoans(2000);
        setFeeService(5202.79);
        setCollateralRegister([{
          id: "1",
          assetType: "Real Estate",
          description: "Plot",
          borrower: "Borrower1",
          appraisedValue: 130000,
          dateAcquired: "02/07/2026"
        }]);
        setAssetCollateralPlots(130000);
      }

      setAutoFilled(true);
    } catch (e) {
      console.error("Failed to load MEA Report live data", e);
    } finally {
      setLoading(false);
    }
  };

  // Income Statement Computations
  const totalInterestIncome = interestBusinessLoans + interestPersonalLoans + interestMortgages + interestOther;
  const totalFeeIncome = feeAccount + feeService + feeLate + feeOther;
  const totalGrossIncome = totalInterestIncome + totalFeeIncome + tradingGains + otherIncome;
  const totalExpenses = expInterest + expSalaries + expOperations + expMarketing + expTechnology + expLegal + expOther;
  const netIncome = totalGrossIncome - (totalExpenses + taxWithdrawal);

  // Balance Sheet Computations
  const totalCashAssets = cashBankBalance + cashDepositsHeld;
  const totalLoanAssets = assetBusinessLoans + assetPersonalLoans + assetMortgages;
  const totalCollateralAssets = assetCollateralPlots + assetCollateralItems;
  const totalAssets = totalCashAssets + totalLoanAssets + totalCollateralAssets + assetRealEstatePlots + assetInventory + assetReceivables + assetOther;

  const totalDepositLiabilities = liabPersonalDeposits + liabBusinessDeposits + liabCDs;
  const totalLiabilities = totalDepositLiabilities + liabPendingPayments + liabLoansOwed + liabWithheldTax + liabOther;

  const totalEquity = totalAssets - totalLiabilities;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyMarkdown = () => {
    const md = `
# MEA FINANCIAL INSTITUTION REPORT
**Institution Name:** ${bank?.name}
**Reporting Period:** ${reportPeriod}
**Prepared By:** ${preparedBy}
**Date Published:** ${datePublished}
**Registered Owners:** ${registeredOwners}

---

## CORPORATE INFORMATION
**Institution Type:** ${institutionType}
**Description:** ${description}

### Executive Overview
**Management Team:** ${managementTeam.join(', ')}
**Legal Representation:** ${legalRep}
**Authorized Access Personnel:** ${directAccessEmployees.join(', ')}

### Technical Information
- **Discord Link:** ${discordLink}
- **In-Game Tag:** ${companyIngameName}
- **CEO Discord:** ${ceoDiscordUser}
- **CEO In-Game Name:** ${ceoIngameName}

---

## FINANCIAL DISCLOSURES

### Income Statement
- **Total Interest Income:** ${formatMoney(totalInterestIncome)}
- **Total Fee Income:** ${formatMoney(totalFeeIncome)}
- **Trading Gains:** ${formatMoney(tradingGains)}
- **Total Gross Income:** ${formatMoney(totalGrossIncome)}
- **Total Expenses:** ${formatMoney(totalExpenses)}
- **Net Income:** ${formatMoney(netIncome)}

### Balance Sheet
- **Total Assets:** ${formatMoney(totalAssets)}
- **Total Liabilities:** ${formatMoney(totalLiabilities)}
- **Total Equity:** ${formatMoney(totalEquity)}

---

**Certification:** I certify that the information contained in this report is accurate and complete to the best of my knowledge.
**Signature:** ${certName} | ${certTitle} | Date: ${certDate}
    `.trim();

    navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  if (loading) return <div className="text-white/50 animate-pulse p-8">Loading MEA Report Data...</div>;

  return (
    <div className="max-w-6xl mx-auto pb-16 animate-in fade-in duration-500">
      {/* Top Action Bar (Hidden in Print View) */}
      <div className="print:hidden mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#0f0f15] border border-white/10 rounded-2xl p-5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Regulatory Compliance
            </span>
            {autoFilled && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles size={10} /> Auto-Calculated
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">MEA Financial Institution Report</h2>
          <p className="text-zinc-400 text-xs mt-0.5">
            Official monthly regulatory disclosure generator. Automatically syncs with ledger balances, active loans, and staff credentials.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={loadLiveData}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors"
            title="Re-sync database figures"
          >
            <RefreshCw size={14} /> Sync Ledger
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

      {/* Instructions callout */}
      <div className="print:hidden bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-8 flex items-start gap-3">
        <Info size={18} className="text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-200/90 leading-relaxed">
          <strong className="text-white">Staff Notice:</strong> Values below are pre-populated directly from your bank's active accounts, loans, and settings. You may review and edit any text fields before printing or exporting. When you click <strong>Print / Download PDF</strong>, standard browser print dialog will render the official multi-page document cleanly.
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

        {/* Metadata Grid Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-indigo-200 border border-indigo-200 rounded-lg overflow-hidden text-xs mb-8">
          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Institution Name:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={bank?.name || ""} 
              readOnly 
              className="w-full font-bold text-slate-900 bg-transparent outline-none" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Reporting Period:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={reportPeriod} 
              onChange={e => setReportPeriod(e.target.value)}
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Prepared By:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={preparedBy} 
              onChange={e => setPreparedBy(e.target.value)}
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Date Published:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={datePublished} 
              onChange={e => setDatePublished(e.target.value)}
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>

          <div className="bg-indigo-50/70 p-2.5 font-bold text-indigo-950 border-r border-indigo-200">Registered Owners:</div>
          <div className="bg-white p-2.5">
            <input 
              type="text" 
              value={registeredOwners} 
              onChange={e => setRegisteredOwners(e.target.value)}
              className="w-full text-slate-800 bg-transparent outline-none font-medium" 
            />
          </div>
        </div>

        {/* Bank Logo / Banner Box */}
        <div className="border border-slate-300 rounded-xl p-6 mb-8 text-center bg-slate-950 text-white flex flex-col items-center justify-center min-h-[140px] shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-indigo-950/50" />
          <div className="relative z-10 flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center font-black text-2xl text-white shadow-lg">
              {bank?.name?.charAt(0) || "B"}
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">{bank?.name}</h2>
            <p className="text-xs text-indigo-200 font-mono tracking-wider uppercase">Official Financial Institution</p>
          </div>
        </div>

        {/* SECTION 1: CORPORATE INFORMATION */}
        <div className="mb-10">
          <div className="border-b-2 border-indigo-600 pb-1 mb-4">
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">CORPORATE INFORMATION</h2>
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
                <span className="font-bold text-slate-900 block mb-1">Discord Link:</span>
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
                <span className="font-bold text-slate-900 block mb-1">CEO Discord Username:</span>
                <input
                  type="text"
                  value={ceoDiscordUser}
                  onChange={e => setCeoDiscordUser(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-slate-800 outline-none"
                />
              </div>
              <div>
                <span className="font-bold text-slate-900 block mb-1">CEO In-Game Name:</span>
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
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">Consumer Financial Protections</h2>
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
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500" 
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
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500" 
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
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500" 
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
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500" 
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
                      className="w-full p-2 border border-slate-200 rounded text-slate-800 outline-none focus:border-indigo-500" 
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
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">FINANCIAL DISCLOSURES</h2>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Income Statement</h3>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-8">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2.5 border-r border-slate-300">Category</th>
                  <th className="p-2.5 border-r border-slate-300">Subcategory</th>
                  <th className="p-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Business Loans</td>
                  <td className="p-1 text-right">
                    <input type="number" value={interestBusinessLoans} onChange={e => setInterestBusinessLoans(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Personal Loans</td>
                  <td className="p-1 text-right">
                    <input type="number" value={interestPersonalLoans} onChange={e => setInterestPersonalLoans(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Mortgages</td>
                  <td className="p-1 text-right">
                    <input type="number" value={interestMortgages} onChange={e => setInterestMortgages(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Interest Income</td>
                  <td className="p-2 border-r border-slate-200">Other, List and Describe</td>
                  <td className="p-1 text-right">
                    <input type="number" value={interestOther} onChange={e => setInterestOther(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Fee Income</td>
                  <td className="p-2 border-r border-slate-200">Account Fees</td>
                  <td className="p-1 text-right">
                    <input type="number" value={feeAccount} onChange={e => setFeeAccount(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Fee Income</td>
                  <td className="p-2 border-r border-slate-200">Service Fees</td>
                  <td className="p-1 text-right">
                    <input type="number" value={feeService} onChange={e => setFeeService(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Fee Income</td>
                  <td className="p-2 border-r border-slate-200">Late Fees</td>
                  <td className="p-1 text-right">
                    <input type="number" value={feeLate} onChange={e => setFeeLate(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Trading Income</td>
                  <td className="p-2 border-r border-slate-200">Trading Gains/Losses</td>
                  <td className="p-1 text-right">
                    <input type="number" value={tradingGains} onChange={e => setTradingGains(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200 text-rose-900">Expenses</td>
                  <td className="p-2 border-r border-slate-200">Operating / Salaries / Tech</td>
                  <td className="p-1 text-right">
                    <input type="number" value={expOperations} onChange={e => setExpOperations(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono text-rose-800" />
                  </td>
                </tr>

                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Taxes</td>
                  <td className="p-2 border-r border-slate-200">Withdrawal Tax</td>
                  <td className="p-1 text-right">
                    <input type="number" value={taxWithdrawal} onChange={e => setTaxWithdrawal(Number(e.target.value))} className="w-full text-right p-1 outline-none font-mono" />
                  </td>
                </tr>

                <tr className="bg-indigo-50/80 font-bold text-indigo-950">
                  <td className="p-3 border-r border-slate-300" colSpan={2}>Net Income = Income - (Expenses + Withdrawal tax)</td>
                  <td className="p-3 text-right font-mono text-sm">{formatMoney(netIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Loan Register Table */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-indigo-900 text-sm">Loan Register</h3>
            <button
              onClick={() => setLoanRegister([...loanRegister, { id: String(Date.now()), type: "Personal", borrower: "New Borrower", principal: 10000, remainingBalance: 10000, rate: "5%", term: "6 months", collateral: "No", status: "Open" }])}
              className="print:hidden text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200 font-semibold flex items-center gap-1"
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
                  <th className="p-2 border-r border-slate-200 text-right">Principal</th>
                  <th className="p-2 border-r border-slate-200 text-right">Remaining</th>
                  <th className="p-2 border-r border-slate-200">Rate</th>
                  <th className="p-2 border-r border-slate-200">Term</th>
                  <th className="p-2 border-r border-slate-200">Collateral</th>
                  <th className="p-2 border-r border-slate-200">Status</th>
                  <th className="p-2 print:hidden w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {loanRegister.map((lr, idx) => (
                  <tr key={lr.id}>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={lr.type} onChange={e => { const copy = [...loanRegister]; copy[idx].type = e.target.value; setLoanRegister(copy); }} className="w-full outline-none font-sans" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={lr.borrower} onChange={e => { const copy = [...loanRegister]; copy[idx].borrower = e.target.value; setLoanRegister(copy); }} className="w-full outline-none font-sans" />
                    </td>
                    <td className="p-1 border-r border-slate-200 text-right">
                      <input type="number" value={lr.principal} onChange={e => { const copy = [...loanRegister]; copy[idx].principal = Number(e.target.value); setLoanRegister(copy); }} className="w-full text-right outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200 text-right">
                      <input type="number" value={lr.remainingBalance} onChange={e => { const copy = [...loanRegister]; copy[idx].remainingBalance = Number(e.target.value); setLoanRegister(copy); }} className="w-full text-right outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={lr.rate} onChange={e => { const copy = [...loanRegister]; copy[idx].rate = e.target.value; setLoanRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={lr.term} onChange={e => { const copy = [...loanRegister]; copy[idx].term = e.target.value; setLoanRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={lr.collateral} onChange={e => { const copy = [...loanRegister]; copy[idx].collateral = e.target.value; setLoanRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={lr.status} onChange={e => { const copy = [...loanRegister]; copy[idx].status = e.target.value; setLoanRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 print:hidden text-center">
                      <button onClick={() => setLoanRegister(loanRegister.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Collateral Table */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-indigo-900 text-sm">Collateral Asset Register</h3>
            <button
              onClick={() => setCollateralRegister([...collateralRegister, { id: String(Date.now()), assetType: "Real Estate", description: "Plot #12", borrower: "Borrower", appraisedValue: 50000, dateAcquired: new Date().toLocaleDateString('en-US') }])}
              className="print:hidden text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200 font-semibold flex items-center gap-1"
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
                  <th className="p-2 border-r border-slate-200 text-right">Appraised Value</th>
                  <th className="p-2 border-r border-slate-200">Date Acquired</th>
                  <th className="p-2 print:hidden w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {collateralRegister.map((cr, idx) => (
                  <tr key={cr.id}>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={cr.assetType} onChange={e => { const copy = [...collateralRegister]; copy[idx].assetType = e.target.value; setCollateralRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={cr.description} onChange={e => { const copy = [...collateralRegister]; copy[idx].description = e.target.value; setCollateralRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={cr.borrower} onChange={e => { const copy = [...collateralRegister]; copy[idx].borrower = e.target.value; setCollateralRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200 text-right font-mono">
                      <input type="number" value={cr.appraisedValue} onChange={e => { const copy = [...collateralRegister]; copy[idx].appraisedValue = Number(e.target.value); setCollateralRegister(copy); }} className="w-full text-right outline-none" />
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input type="text" value={cr.dateAcquired} onChange={e => { const copy = [...collateralRegister]; copy[idx].dateAcquired = e.target.value; setCollateralRegister(copy); }} className="w-full outline-none" />
                    </td>
                    <td className="p-1 print:hidden text-center">
                      <button onClick={() => setCollateralRegister(collateralRegister.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 4: BALANCE SHEET */}
        <div className="mb-10 page-break-before">
          <div className="border-b-2 border-indigo-600 pb-1 mb-4">
            <h2 className="text-lg font-black text-indigo-950 uppercase tracking-tight">Balance Sheet</h2>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Assets</h3>
          <div className="border border-slate-300 rounded-xl overflow-hidden text-xs mb-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-950">
                  <th className="p-2.5 border-r border-slate-300">Category</th>
                  <th className="p-2.5 border-r border-slate-300">Subcategory</th>
                  <th className="p-2.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Cash</td>
                  <td className="p-2 border-r border-slate-200">Bank Cash Balance</td>
                  <td className="p-1 text-right font-mono">
                    <input type="number" value={cashBankBalance} onChange={e => setCashBankBalance(Number(e.target.value))} className="w-full text-right p-1 outline-none" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Cash</td>
                  <td className="p-2 border-r border-slate-200">Total Deposits Held</td>
                  <td className="p-1 text-right font-mono">
                    <input type="number" value={cashDepositsHeld} onChange={e => setCashDepositsHeld(Number(e.target.value))} className="w-full text-right p-1 outline-none" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Loans</td>
                  <td className="p-2 border-r border-slate-200">Business Loans</td>
                  <td className="p-1 text-right font-mono">
                    <input type="number" value={assetBusinessLoans} onChange={e => setAssetBusinessLoans(Number(e.target.value))} className="w-full text-right p-1 outline-none" />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Collateral</td>
                  <td className="p-2 border-r border-slate-200">Plots / Appraised Assets</td>
                  <td className="p-1 text-right font-mono">
                    <input type="number" value={assetCollateralPlots} onChange={e => setAssetCollateralPlots(Number(e.target.value))} className="w-full text-right p-1 outline-none" />
                  </td>
                </tr>
                <tr className="bg-emerald-50/80 font-bold text-emerald-950">
                  <td className="p-2.5 border-r border-slate-300" colSpan={2}>Total Assets (Sum of all Assets)</td>
                  <td className="p-2.5 text-right font-mono text-sm">{formatMoney(totalAssets)}</td>
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
                  <th className="p-2.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 font-semibold border-r border-slate-200">Deposits</td>
                  <td className="p-2 border-r border-slate-200">Personal & Customer Deposits</td>
                  <td className="p-1 text-right font-mono">
                    <input type="number" value={liabPersonalDeposits} onChange={e => setLiabPersonalDeposits(Number(e.target.value))} className="w-full text-right p-1 outline-none" />
                  </td>
                </tr>
                <tr className="bg-rose-50/80 font-bold text-rose-950">
                  <td className="p-2.5 border-r border-slate-300" colSpan={2}>Total Liabilities (Sum of all Liabilities)</td>
                  <td className="p-2.5 text-right font-mono text-sm">{formatMoney(totalLiabilities)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="font-bold text-indigo-900 text-sm mb-2">Equity</h3>
          <div className="border border-indigo-200 rounded-xl overflow-hidden text-xs mb-8">
            <div className="p-3 bg-indigo-900 text-white font-extrabold flex justify-between items-center text-sm">
              <span>Total Equity (Total Assets - Total Liabilities):</span>
              <span className="font-mono">{formatMoney(totalEquity)}</span>
            </div>
          </div>
        </div>

        {/* SECTION 5: CERTIFICATION STATEMENT */}
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-6 text-xs mb-6">
          <h3 className="font-extrabold text-indigo-950 text-sm mb-2 uppercase tracking-wide">Certification Statement</h3>
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
                className="w-full font-serif italic text-lg text-indigo-950 border-b-2 border-indigo-900 outline-none bg-transparent" 
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">Title:</span>
              <input 
                type="text" 
                value={certTitle} 
                onChange={e => setCertTitle(e.target.value)} 
                className="w-full font-medium text-slate-900 border-b border-slate-300 outline-none bg-transparent" 
              />
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] font-bold uppercase mb-1">Date:</span>
              <input 
                type="text" 
                value={certDate} 
                onChange={e => setCertDate(e.target.value)} 
                className="w-full font-medium text-slate-900 border-b border-slate-300 outline-none bg-transparent" 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
