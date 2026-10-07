import { useState, useEffect, useRef, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { 
  Printer, RefreshCw, Check, Copy, Plus, Trash2, 
  Sparkles, Info, Calendar, FileDown, ShieldCheck, DollarSign, Wallet
} from "lucide-react";
import { exportMEAReportPDF } from "../lib/meaPdfExporter";

interface LoanRow {
  id?: string;
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
  id?: string;
  assetType: string;
  description: string;
  borrower: string;
  appraisedValue: number;
  dateAcquired: string;
}

interface AccountAuditRow {
  id?: string;
  holder: string;
  type: string;
  balance: number;
}

interface InvestmentProductRow {
  name: string;
  type: string;
  totalValue: number;
  investorsCount: number;
  riskLevel: string;
  quarterlyReturn: string;
  notes: string;
}

function formatCurrency(dollars: number | undefined | null) {
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
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const [copiedMd, setCopiedMd] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  // Audit month selection state (defaults to previous month if day <= 15)
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return now.getDate() <= 15 ? lastMonthKey : currentMonthKey;
  });

  const monthOptions = useMemo(() => {
    const options: { key: string; label: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const fullMonthName = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      let label = fullMonthName;
      if (key === lastMonthKey) {
        label = `${fullMonthName} (Last Month - Recommended)`;
      } else if (key === currentMonthKey) {
        label = `${fullMonthName} (Current Month)`;
      }
      options.push({ key, label });
    }
    return options;
  }, [currentMonthKey, lastMonthKey]);

  // General Metadata (Page 1)
  const [reportPeriod, setReportPeriod] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [datePublished, setDatePublished] = useState("");
  const [registeredOwners, setRegisteredOwners] = useState("");
  const [institutionType, setInstitutionType] = useState("Commercial Bank");
  const [description, setDescription] = useState("");
  
  // Executive Overview (Page 1)
  const [managementTeam, setManagementTeam] = useState<string[]>([]);
  const [legalRep, setLegalRep] = useState("");
  const [directAccessEmployees, setDirectAccessEmployees] = useState<string[]>([]);

  // Technical Info (Page 1)
  const [discordLink, setDiscordLink] = useState("");
  const [companyIngameName, setCompanyIngameName] = useState("");
  const [ceoDiscordUser, setCeoDiscordUser] = useState("");
  const [ceoIngameName, setCeoIngameName] = useState("");

  // Consumer Protections Q&A (Page 2)
  const [clearInfo, setClearInfo] = useState("");
  const [privacyData, setPrivacyData] = useState("");
  const [disputeHandling, setDisputeHandling] = useState("");
  const [vulnerableProtections, setVulnerableProtections] = useState("");
  const [truthfulAdvertising, setTruthfulAdvertising] = useState("");

  // Governance & Compliance - Credit Unions Only (Page 2)
  const [cuGovernanceType, setCuGovernanceType] = useState("N/A - Commercial Bank");
  const [cuLeadership, setCuLeadership] = useState("N/A - Commercial Bank");
  const [cuProfitRetention, setCuProfitRetention] = useState("N/A - Commercial Bank");
  const [cuProfitReturned, setCuProfitReturned] = useState("N/A - Commercial Bank");

  // Income Statement Inputs (in DOLLARS) (Page 3)
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

  // Loan Register & Collateral (Page 3)
  const [loanRegister, setLoanRegister] = useState<LoanRow[]>([]);
  const [collateralRegister, setCollateralRegister] = useState<CollateralRow[]>([]);

  // Balance Sheet Inputs (in DOLLARS) - Assets (Page 4)
  const [corpBalance, setCorpBalance] = useState<number>(0);
  const [loanPoolBalance, setLoanPoolBalance] = useState<number>(0);
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

  // Balance Sheet Inputs (in DOLLARS) - Liabilities (Page 4)
  const [liabPersonalDeposits, setLiabPersonalDeposits] = useState<number>(0);
  const [liabBusinessDeposits, setLiabBusinessDeposits] = useState<number>(0);
  const [liabCDs, setLiabCDs] = useState<number>(0);
  const [liabPendingPayments, setLiabPendingPayments] = useState<number>(0);
  const [liabLoansOwed, setLiabLoansOwed] = useState<number>(0);
  const [liabTaxesWithheld, setLiabTaxesWithheld] = useState<number>(0);
  const [liabOther, setLiabOther] = useState<number>(0);

  // Investment Products (Page 4 & 5)
  const [investmentProducts, setInvestmentProducts] = useState<InvestmentProductRow[]>([]);

  // Audit Accounts List (Page 5)
  const [accountsAuditList, setAccountsAuditList] = useState<AccountAuditRow[]>([]);

  // Certification (Page 5)
  const [certName, setCertName] = useState("");
  const [certTitle, setCertTitle] = useState("");
  const [certDate, setCertDate] = useState("");

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bank?.id) {
      loadLiveData(selectedMonth);
    }
  }, [bank?.id]);

  const handleSelectMonth = (newMonth: string) => {
    setSelectedMonth(newMonth);
    loadLiveData(newMonth);
  };

  const handleStepMonth = (delta: number) => {
    const [yStr, mStr] = selectedMonth.split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const targetDate = new Date(y, m - 1 + delta, 1);
    const newKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
    handleSelectMonth(newKey);
  };

  const loadLiveData = async (monthKey?: string) => {
    if (!bank?.id) return;
    setSyncing(true);
    const targetMonth = monthKey || selectedMonth;
    try {
      const res = await fetch(`/api/banks/${bank.id}/mea-report/data?month=${targetMonth}`);
      if (!res.ok) throw new Error("Failed to load MEA Report live data from server");
      const data = await res.json();

      // Metadata (Page 1)
      setReportPeriod(data.metadata.reportPeriod || `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getFullYear()}`);
      setDatePublished(data.metadata.datePublished || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      setPreparedBy(data.metadata.preparedBy || "Bank Compliance Staff");
      setRegisteredOwners(data.metadata.registeredOwners || `1. ${bank.name}`);
      setInstitutionType(data.metadata.institutionType || "Commercial Bank");
      setDescription(data.metadata.description || `${bank.name} provides financial tools to help clients reach their goals everyday. We offer bank deposits, personal and business loans, and various financial services.`);

      // Executive (Page 1)
      setManagementTeam(data.executive.managementTeam || []);
      setLegalRep(data.executive.legalRep || "Independent Legal Counsel");
      setDirectAccessEmployees(data.executive.directAccessEmployees || []);
      setDiscordLink(data.executive.discordLink || "");
      setCompanyIngameName(data.executive.companyIngameName || bank.name);
      setCeoDiscordUser(data.executive.ceoDiscordUser || "");
      setCeoIngameName(data.executive.ceoIngameName || "");

      // Consumer Protections (Page 2)
      setClearInfo(data.consumerProtections?.clearInfo || "");
      setPrivacyData(data.consumerProtections?.privacyData || "");
      setDisputeHandling(data.consumerProtections?.disputeHandling || "");
      setVulnerableProtections(data.consumerProtections?.vulnerableProtections || "");
      setTruthfulAdvertising(data.consumerProtections?.truthfulAdvertising || "");

      // Credit Union
      const isCU = (data.metadata?.institutionType || "").toLowerCase().includes("credit union");
      if (isCU) {
        setCuGovernanceType("President (< $200k deposits)");
        setCuLeadership(data.executive?.ceoIngameName || "President");
        setCuProfitRetention("10% Retained");
        setCuProfitReturned("Distributed as Member Dividend / APY");
      } else {
        setCuGovernanceType("N/A - Commercial Bank");
        setCuLeadership("N/A - Commercial Bank");
        setCuProfitRetention("N/A - Commercial Bank");
        setCuProfitReturned("N/A - Commercial Bank");
      }

      // Income Statement (Page 3)
      setInterestBusinessLoans(data.incomeStatement?.interestBusinessLoans || 0);
      setInterestPersonalLoans(data.incomeStatement?.interestPersonalLoans || 0);
      setInterestMortgages(data.incomeStatement?.interestMortgages || 0);
      setInterestOther(data.incomeStatement?.interestOther || 0);
      setFeeAccount(data.incomeStatement?.feeAccount || 0);
      setFeeService(data.incomeStatement?.feeService || 0);
      setFeeLate(data.incomeStatement?.feeLate || 0);
      setFeeOther(data.incomeStatement?.feeOther || 0);
      setTradingGains(data.incomeStatement?.tradingGains || 0);
      setOtherIncome(data.incomeStatement?.otherIncome || 0);
      setExpInterest(data.incomeStatement?.expInterest || 0);
      setExpSalaries(data.incomeStatement?.expSalaries || 0);
      setExpOperations(data.incomeStatement?.expOperations || 0);
      setExpMarketing(data.incomeStatement?.expMarketing || 0);
      setExpTechnology(data.incomeStatement?.expTechnology || 0);
      setExpLegal(data.incomeStatement?.expLegal || 0);
      setExpOther(data.incomeStatement?.expOther || 0);
      setTaxWithdrawal(data.incomeStatement?.taxWithdrawal || 0);

      // Registers (Page 3)
      setLoanRegister(data.loanRegister || []);
      setCollateralRegister(data.collateralRegister || []);

      // Balance Sheet Assets (Page 4) - Authoritative Bank Cash Balance = Corp Balance + Loan Pool Account Balance
      setCorpBalance(data.balanceSheet?.corpBalance || 0);
      setLoanPoolBalance(data.balanceSheet?.loanPoolBalance || 0);
      setCashBankBalance(data.balanceSheet?.cashBankBalance || 0);
      setCashDepositsHeld(data.balanceSheet?.cashDepositsHeld || 0);
      setAssetBusinessLoans(data.balanceSheet?.assetBusinessLoans || 0);
      setAssetPersonalLoans(data.balanceSheet?.assetPersonalLoans || 0);
      setAssetMortgages(data.balanceSheet?.assetMortgages || 0);
      setAssetCollateralPlots(data.balanceSheet?.assetCollateralPlots || 0);
      setAssetCollateralItems(data.balanceSheet?.assetCollateralItems || 0);
      setAssetRealEstatePlots(data.balanceSheet?.assetRealEstatePlots || 0);
      setAssetInventory(data.balanceSheet?.assetInventory || 0);
      setAssetReceivables(data.balanceSheet?.assetReceivables || 0);
      setAssetOther(data.balanceSheet?.assetOther || 0);

      // Balance Sheet Liabilities (Page 4)
      setLiabPersonalDeposits(data.balanceSheet?.liabPersonalDeposits || 0);
      setLiabBusinessDeposits(data.balanceSheet?.liabBusinessDeposits || 0);
      setLiabCDs(data.balanceSheet?.liabCDs || 0);
      setLiabPendingPayments(data.balanceSheet?.liabPendingPayments || 0);
      setLiabLoansOwed(data.balanceSheet?.liabLoansOwed || 0);
      setLiabTaxesWithheld(data.balanceSheet?.liabTaxesWithheld || 0);
      setLiabOther(data.balanceSheet?.liabOther || 0);

      // Audit Accounts List (Page 5)
      if (data.accountsAuditList) {
        setAccountsAuditList(data.accountsAuditList);
      }

      // Certification (Page 5)
      setCertName(data.certification?.certName || "");
      setCertTitle(data.certification?.certTitle || "Managing Director / Compliance Officer");
      setCertDate(data.certification?.certDate || datePublished);

      setAutoFilled(true);
      setSyncToast(`Ledger Synchronized: ${data.metadata?.reportPeriod || targetMonth} live figures loaded.`);
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

  // Calculations (Exact Government Form Formulae)
  const totalInterestIncome = interestBusinessLoans + interestPersonalLoans + interestMortgages + interestOther;
  const totalFeeIncome = feeAccount + feeService + feeLate + feeOther;
  const totalGrossIncome = totalInterestIncome + totalFeeIncome + tradingGains + otherIncome;
  const totalExpenses = expInterest + expSalaries + expOperations + expMarketing + expTechnology + expLegal + expOther;
  const netIncome = totalGrossIncome - (totalExpenses + taxWithdrawal);

  const totalAssets = cashBankBalance + cashDepositsHeld + assetBusinessLoans + assetPersonalLoans + assetMortgages + assetCollateralPlots + assetCollateralItems + assetRealEstatePlots + assetInventory + assetReceivables + assetOther;

  const totalLiabilities = liabPersonalDeposits + liabBusinessDeposits + liabCDs + liabPendingPayments + liabLoansOwed + liabTaxesWithheld + liabOther;

  const totalEquity = totalAssets - totalLiabilities;

  const handleExportPDF = async () => {
    setExportingPdf(true);
    setPdfProgress("Generating official 5-page PDF report matching MEA template...");

    try {
      const filename = await exportMEAReportPDF({
        bankName: bank?.name || "Commercial Bank",
        reportPeriod: reportPeriod || selectedMonth,
        preparedBy,
        datePublished,
        registeredOwners,
        institutionType,
        description,
        managementTeam,
        legalRep,
        directAccessEmployees,
        discordLink,
        companyIngameName: companyIngameName || bank?.name,
        ceoDiscordUser,
        ceoIngameName,
        consumerProtections: {
          clearInfo,
          privacyData,
          disputeHandling,
          vulnerableProtections,
          truthfulAdvertising,
        },
        creditUnionGovernance: {
          governanceType: cuGovernanceType,
          leadership: cuLeadership,
          profitRetention: cuProfitRetention,
          profitDistribution: cuProfitReturned,
        },
        incomeStatement: {
          interestBusinessLoans,
          interestPersonalLoans,
          interestMortgages,
          interestOther,
          feeAccount,
          feeService,
          feeLate,
          feeOther,
          tradingGains,
          otherIncome,
          expInterest,
          expSalaries,
          expOperations,
          expMarketing,
          expTechnology,
          expLegal,
          expOther,
          taxWithdrawal,
          totalInterestIncome,
          totalFeeIncome,
          totalGrossIncome,
          totalExpenses,
          netIncome,
        },
        loanRegister,
        collateralRegister,
        balanceSheet: {
          cashBankBalance,
          cashDepositsHeld,
          assetBusinessLoans,
          assetPersonalLoans,
          assetMortgages,
          assetCollateralPlots,
          assetCollateralItems,
          assetRealEstatePlots,
          assetInventory,
          assetReceivables,
          assetOther,
          totalAssets,
          liabPersonalDeposits,
          liabBusinessDeposits,
          liabCDs,
          liabPendingPayments,
          liabLoansOwed,
          liabTaxesWithheld,
          liabOther,
          totalLiabilities,
          totalEquity,
        },
        investmentProducts,
        accountsAuditList,
        certification: {
          certName,
          certTitle,
          certDate,
        },
      });

      setSyncToast(`PDF Export Complete: Downloaded full 5-page report (${filename}).`);
      setTimeout(() => setSyncToast(null), 5000);
    } catch (err: any) {
      console.error("PDF generation error:", err);
      setSyncToast(`Failed to export PDF: ${err.message || "Unknown error"}`);
      setTimeout(() => setSyncToast(null), 5000);
    } finally {
      setExportingPdf(false);
      setPdfProgress("");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyMarkdown = () => {
    const loanRowsMd = loanRegister.length > 0 
      ? loanRegister.map(l => `| ${l.type} | ${l.borrower} | ${formatCurrency(l.principal)} | ${formatCurrency(l.remainingBalance)} | ${l.rate} | ${l.term} | ${l.collateral?.toLowerCase().includes("none") ? "No" : "Yes"} | ${l.status} |`).join('\n')
      : '| | | | | | | | |';

    const collateralRowsMd = collateralRegister.length > 0
      ? collateralRegister.map(c => `| ${c.assetType} | ${c.description} | ${c.borrower} | ${c.appraisedValue > 0 ? formatCurrency(c.appraisedValue) : "N/A"} | ${c.dateAcquired} |`).join('\n')
      : '| | | | | |';

    const md = `
# MEA FINANCIAL INSTITUTION REPORT

| Institution Name: | ${bank?.name || ''} |
| Reporting Period: | ${reportPeriod} |
| Prepared By: | ${preparedBy} |
| Date Published: | ${datePublished} |
| Registered Owners: | ${registeredOwners} |

---

## CORPORATE INFORMATION

### Description of Institution
**Institution Type:** [${institutionType}]  
**Description:** ${description}

### Executive Overview
**Management Team:**  
${managementTeam.join('\n') || '[None]'}

**Legal Representation:**  
${legalRep || '[None]'}

**A list of names of employees who have direct access to alter or withdraw from account balances, or the bank’s balance:**  
${directAccessEmployees.join('\n') || '[None]'}

### Technical Information
- **Discord Link or In-Game Location:** ${discordLink || '[Required]'}
- **Company In-Game Name:** ${companyIngameName || '[Required]'}
- **CEO Discord Username:** ${ceoDiscordUser || '[Required]'}
- **CEO In-Game Name:** ${ceoIngameName || '[Required]'}

---

## Consumer Financial Protections

| Protection Requirement (Guidance) | Bank Response |
| :--- | :--- |
| **Clear & Accurate Information:**<br>How does the bank ensure all fees, interest rates, loan terms, risks, and account rules are explained clearly before customers use the product? | ${clearInfo} |
| **Privacy & Data Protection:**<br>How does the bank protect player financial data, restrict access, and enforce confidentiality for staff with account permissions? | ${privacyData} |
| **Complaint & Dispute Handling:**<br>What is the bank’s process for receiving, responding to, and resolving consumer complaints? Include average response times & channels. | ${disputeHandling} |
| **New/Vulnerable Player Protections:**<br>What safeguards prevent inexperienced players from being exploited (simplified explanations, extra approvals for risky products, etc.)? | ${vulnerableProtections} |
| **Truthful Advertising Practices:**<br>How does the bank ensure all advertising is accurate, non-misleading, and compliant with MEA standards? | ${truthfulAdvertising} |

### Governance & Compliance - Credit Unions Only
| Requirement | Status |
| :--- | :--- |
| Required Governance Type (President < $200k deposits / Board ≥ $200k deposits) | ${cuGovernanceType} |
| Current Leadership (President / Board of Directors) | ${cuLeadership} |
| Profit Retention % (Max 10% per month) | ${cuProfitRetention} |
| How Remaining Profits Were Returned/Used for Members | ${cuProfitReturned} |

---

## FINANCIAL DISCLOSURES

### Income Statement
| Category | Subcategory | Amount |
| :--- | :--- | :--- |
| Interest Income | Business Loans | ${interestBusinessLoans ? formatCurrency(interestBusinessLoans) : ''} |
| Interest Income | Personal Loans | ${interestPersonalLoans ? formatCurrency(interestPersonalLoans) : ''} |
| Interest Income | Mortgages | ${interestMortgages ? formatCurrency(interestMortgages) : ''} |
| Interest Income | Other, List and Describe | ${interestOther ? formatCurrency(interestOther) : ''} |
| Fee Income | Account Fees | ${feeAccount ? formatCurrency(feeAccount) : ''} |
| Fee Income | Service Fees | ${feeService ? formatCurrency(feeService) : ''} |
| Fee Income | Late Fees | ${feeLate ? formatCurrency(feeLate) : ''} |
| Fee Income | Other Fees | ${feeOther ? formatCurrency(feeOther) : ''} |
| Trading Income | Trading Gains/Losses | ${tradingGains ? formatCurrency(tradingGains) : ''} |
| Other Income | List and Describe | ${otherIncome ? formatCurrency(otherIncome) : ''} |
| Expenses | Interest Expense | ${expInterest ? formatCurrency(expInterest) : ''} |
| Expenses | Salaries | ${expSalaries ? formatCurrency(expSalaries) : ''} |
| Expenses | Operations | ${expOperations ? formatCurrency(expOperations) : ''} |
| Expenses | Marketing | ${expMarketing ? formatCurrency(expMarketing) : ''} |
| Expenses | Technology | ${expTechnology ? formatCurrency(expTechnology) : ''} |
| Expenses | Legal | ${expLegal ? formatCurrency(expLegal) : ''} |
| Other Expenses | List and Describe | ${expOther ? formatCurrency(expOther) : ''} |
| Taxes | Withdrawal Tax | ${taxWithdrawal ? formatCurrency(taxWithdrawal) : ''} |
| **Net Income** | **Income – (Expenses + Withdrawal tax)** | **${formatCurrency(netIncome)}** |

### Loan Register
| Type | Borrower | Principal | Remaining Balance | Rate | Term | Collateral (Yes or No) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${loanRowsMd}

### Collateral
| Asset Type | Description | Borrower | Appraised Value | Date Acquired |
| :--- | :--- | :--- | :--- | :--- |
${collateralRowsMd}

---

## Balance Sheet

### Assets
| Category | Subcategory | Value |
| :--- | :--- | :--- |
| Cash | Bank Cash Balance | ${cashBankBalance ? formatCurrency(cashBankBalance) : ''} |
| Cash | Total Deposits Held | ${cashDepositsHeld ? formatCurrency(cashDepositsHeld) : ''} |
| Loans | Business Loans | ${assetBusinessLoans ? formatCurrency(assetBusinessLoans) : ''} |
| Loans | Personal Loans | ${assetPersonalLoans ? formatCurrency(assetPersonalLoans) : ''} |
| Loans | Mortgages | ${assetMortgages ? formatCurrency(assetMortgages) : ''} |
| Collateral | Plots | ${assetCollateralPlots ? formatCurrency(assetCollateralPlots) : ''} |
| Collateral | Items / Other | ${assetCollateralItems ? formatCurrency(assetCollateralItems) : ''} |
| Real Estate | Plots | ${assetRealEstatePlots ? formatCurrency(assetRealEstatePlots) : ''} |
| Inventory | Bank-Owned Materials | ${assetInventory ? formatCurrency(assetInventory) : ''} |
| Receivables | Pending Payments | ${assetReceivables ? formatCurrency(assetReceivables) : ''} |
| Other | Misc. List and Describe | ${assetOther ? formatCurrency(assetOther) : ''} |
| **Total** | **Sum of all Assets** | **${formatCurrency(totalAssets)}** |

### Liabilities
| Category | Subcategory | Value |
| :--- | :--- | :--- |
| Deposits | Personal Deposits | ${liabPersonalDeposits ? formatCurrency(liabPersonalDeposits) : ''} |
| Deposits | Business Deposits | ${liabBusinessDeposits ? formatCurrency(liabBusinessDeposits) : ''} |
| Deposits | Certificates of Deposit (CDs) | ${liabCDs ? formatCurrency(liabCDs) : ''} |
| Liabilities | Pending Payments | ${liabPendingPayments ? formatCurrency(liabPendingPayments) : ''} |
| Liabilities | Outstanding Loans the Bank Owes | ${liabLoansOwed ? formatCurrency(liabLoansOwed) : ''} |
| Other | Misc. List and Describe | ${liabOther ? formatCurrency(liabOther) : ''} |
| **Total** | **Sum of all Liabilities** | **${formatCurrency(totalLiabilities)}** |

### Equity
| Total | Total Assets - Total Liabilities | **${formatCurrency(totalEquity)}** |

---

## Certification Statement
I certify that the information contained in this report is accurate and complete to the best of my knowledge.

**Signature:** /s/ ${certName}  
**Name:** ${certName} | **Title:** ${certTitle}  
**Date:** ${certDate}
    `.trim();

    navigator.clipboard.writeText(md);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto pb-24">
      {/* Toast Notification */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1c3d5a] text-white px-5 py-3 rounded-2xl shadow-2xl border border-[#9fc5e8]/40 flex items-center gap-3 animate-fade-in text-sm font-medium">
          <Sparkles className="text-sky-300 animate-spin" size={16} />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Print-specific layout rules */}
      <style>{`
        @media print {
          @page {
            margin: 12mm 14mm;
            size: letter portrait;
          }
          html, body, #root, .flex, .flex-1, main, div {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
          aside, header, nav, .print\\:hidden {
            display: none !important;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
          }
          .print-page {
            page-break-after: always !important;
            break-after: page !important;
          }
          .print-no-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          input, textarea {
            border: none !important;
            background: transparent !important;
            resize: none !important;
            color: #000000 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* Top Action Bar (Hidden in Print View) */}
      <div className="print:hidden mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-5 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              MEA Regulatory Standard
            </span>
            {autoFilled && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles size={10} /> 100% MEA Template Aligned
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">MEA Financial Institution Report</h2>
          <p className="text-zinc-400 text-xs mt-0.5">
            Official 5-page government submission report. Matches the exact MEA template layout, styling, and schedules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => loadLiveData(selectedMonth)}
            disabled={syncing || exportingPdf}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            title="Re-sync database figures for selected month"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Ledger"}
          </button>
          
          <button
            onClick={handleCopyMarkdown}
            disabled={exportingPdf}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {copiedMd ? <><Check size={14} className="text-emerald-400" /> Copied MD</> : <><Copy size={14} /> Copy Markdown</>}
          </button>

          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50 ring-2 ring-indigo-400/40"
            title="Export exact 5-page PDF matching MEA template"
          >
            {exportingPdf ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>{pdfProgress || "Exporting..."}</span>
              </>
            ) : (
              <>
                <FileDown size={14} />
                <span>Save Full PDF (5 Pages)</span>
              </>
            )}
          </button>

          <button
            onClick={handlePrint}
            disabled={exportingPdf}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
            title="Print via browser dialog"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* Month Navigation & Historical Audit Bar */}
      <div className="print:hidden mb-6 bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Calendar size={18} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Regulatory Filing Period</div>
            <div className="text-base font-extrabold text-white flex items-center gap-2">
              <span>{reportPeriod || selectedMonth}</span>
              {selectedMonth === lastMonthKey && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Last Month (Recommended)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="flex items-center rounded-xl bg-white/5 p-1 border border-white/10">
            <button
              onClick={() => handleStepMonth(-1)}
              disabled={syncing || exportingPdf}
              className="px-2.5 py-1 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              ← Prev
            </button>
            <button
              onClick={() => handleSelectMonth(lastMonthKey)}
              disabled={syncing || exportingPdf}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${selectedMonth === lastMonthKey ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-300 hover:text-white hover:bg-white/10"}`}
            >
              Last Month
            </button>
            <button
              onClick={() => handleSelectMonth(currentMonthKey)}
              disabled={syncing || exportingPdf}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${selectedMonth === currentMonthKey ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-300 hover:text-white hover:bg-white/10"}`}
            >
              Current
            </button>
            <button
              onClick={() => handleStepMonth(1)}
              disabled={syncing || exportingPdf}
              className="px-2.5 py-1 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              Next →
            </button>
          </div>

          <select
            value={selectedMonth}
            onChange={(e) => handleSelectMonth(e.target.value)}
            disabled={syncing || exportingPdf}
            className="bg-zinc-900 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-indigo-400 cursor-pointer"
          >
            {monthOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cash Calculation Note */}
      <div className="print:hidden bg-sky-500/10 border border-sky-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Wallet size={18} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs text-sky-200/90 leading-relaxed">
          <strong className="text-white">Authoritative Bank Cash Balance:</strong> Calculated as <span className="underline font-bold">Corp Balance ({formatCurrency(corpBalance)})</span> + <span className="underline font-bold">Loan Pool Account Balance ({formatCurrency(loanPoolBalance)})</span> = <span className="font-bold text-white">{formatCurrency(cashBankBalance)}</span>.
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRINTABLE REPORT DOCUMENT CONTAINER (EXACT 5-PAGE MEA TEMPLATE LAYOUT)     */}
      {/* ========================================================================= */}
      <div 
        ref={reportRef} 
        className="print-container bg-white text-slate-900 shadow-2xl p-8 sm:p-12 font-sans border border-slate-300 print:shadow-none print:border-none print:p-0 print:m-0 print:text-black space-y-12"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        {/* ===================================================================== */}
        {/* PAGE 1: MEA FINANCIAL INSTITUTION REPORT & CORPORATE INFORMATION     */}
        {/* ===================================================================== */}
        <div data-pdf-page="1" className="mea-pdf-page print-page space-y-5">
          {/* Centered Title */}
          <div className="text-center pb-2 border-b border-[#9fc5e8]">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1c3d5a] uppercase">
              MEA FINANCIAL INSTITUTION REPORT
            </h1>
          </div>

          {/* Official Identification Box */}
          <div className="border border-[#9fc5e8] text-xs">
            <table className="w-full text-left border-collapse">
              <tbody>
                <tr className="border-b border-[#9fc5e8]">
                  <td className="p-2 font-bold text-[#1c3d5a] w-1/3 border-r border-[#9fc5e8] bg-[#cfe2f3]/50">Institution Name:</td>
                  <td className="p-2 font-semibold text-slate-900">
                    <input 
                      type="text" 
                      value={bank?.name || ""} 
                      readOnly 
                      className="w-full font-semibold text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
                <tr className="border-b border-[#9fc5e8]">
                  <td className="p-2 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/50">Reporting Period:</td>
                  <td className="p-2 text-slate-900">
                    <input 
                      type="text" 
                      value={reportPeriod} 
                      onChange={e => setReportPeriod(e.target.value)}
                      placeholder="e.g. September, 2026"
                      className="w-full text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
                <tr className="border-b border-[#9fc5e8]">
                  <td className="p-2 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/50">Prepared By:</td>
                  <td className="p-2 text-slate-900">
                    <input 
                      type="text" 
                      value={preparedBy} 
                      onChange={e => setPreparedBy(e.target.value)}
                      placeholder="Staff Member Name"
                      className="w-full text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
                <tr className="border-b border-[#9fc5e8]">
                  <td className="p-2 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/50">Date Published:</td>
                  <td className="p-2 text-slate-900">
                    <input 
                      type="text" 
                      value={datePublished} 
                      onChange={e => setDatePublished(e.target.value)}
                      placeholder="e.g. October 7, 2026"
                      className="w-full text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
                <tr>
                  <td className="p-2 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/50 align-top">Registered Owners:</td>
                  <td className="p-2 text-slate-900">
                    <textarea 
                      rows={4}
                      value={registeredOwners} 
                      onChange={e => setRegisteredOwners(e.target.value)}
                      placeholder="1. Owner Name&#10;2. Co-Owner Name"
                      className="w-full text-slate-900 bg-transparent outline-none resize-none font-mono text-xs leading-relaxed" 
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Logo Frame / Placeholder */}
          <div className="py-2 text-center border-b border-[#9fc5e8]">
            <p className="text-xs italic text-[#3d85c6] font-serif">[Company Logo - Optional]</p>
          </div>

          {/* SECTION: CORPORATE INFORMATION */}
          <div className="space-y-3 pt-1">
            <h2 className="text-sm font-bold text-[#1c3d5a] uppercase tracking-wide">
              CORPORATE INFORMATION
            </h2>

            {/* Outer Border Container matching MEA Template */}
            <div className="border border-[#1c3d5a]/60 text-xs divide-y divide-[#9fc5e8]">
              {/* Description of Institution */}
              <div>
                <div className="bg-[#cfe2f3] p-1.5 px-2.5 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
                  Description of Institution
                </div>
                <div className="p-2.5 space-y-2">
                  <div>
                    <span className="font-bold text-slate-900">Institution Type: </span>
                    <input 
                      type="text" 
                      value={institutionType} 
                      onChange={e => setInstitutionType(e.target.value)}
                      className="inline-block border-b border-slate-300 font-semibold text-slate-900 outline-none px-1"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block mb-0.5">Description: </span>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded text-slate-900 outline-none leading-relaxed text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Executive Overview */}
              <div>
                <div className="bg-[#cfe2f3] p-1.5 px-2.5 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
                  Executive Overview
                </div>
                <div className="p-2.5 space-y-2">
                  <div>
                    <span className="font-bold text-slate-900 block mb-0.5">Management Team:</span>
                    <textarea
                      rows={2}
                      value={managementTeam.join("\n")}
                      onChange={e => setManagementTeam(e.target.value.split("\n"))}
                      className="w-full p-1.5 border border-slate-300 rounded text-slate-900 outline-none text-xs leading-relaxed"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block mb-0.5">Legal Representation:</span>
                    <input
                      type="text"
                      value={legalRep}
                      onChange={e => setLegalRep(e.target.value)}
                      className="w-full p-1.5 border border-slate-300 rounded text-slate-900 outline-none text-xs"
                    />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block mb-0.5">
                      A list of names of employees who have direct access to alter or withdraw from account balances, or the bank’s balance:
                    </span>
                    <textarea
                      rows={2}
                      value={directAccessEmployees.join("\n")}
                      onChange={e => setDirectAccessEmployees(e.target.value.split("\n"))}
                      className="w-full p-1.5 border border-slate-300 rounded text-slate-900 outline-none text-xs leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              {/* Technical Information */}
              <div>
                <div className="bg-[#cfe2f3] p-1.5 px-2.5 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
                  Technical Information
                </div>
                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">Discord Link or In-Game Location:</span>
                    <input
                      type="text"
                      value={discordLink}
                      onChange={e => setDiscordLink(e.target.value)}
                      className="w-full border-b border-slate-300 outline-none text-slate-900 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">Company In-Game Name:</span>
                    <input
                      type="text"
                      value={companyIngameName}
                      onChange={e => setCompanyIngameName(e.target.value)}
                      className="w-full border-b border-slate-300 outline-none text-slate-900 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">CEO Discord Username:</span>
                    <input
                      type="text"
                      value={ceoDiscordUser}
                      onChange={e => setCeoDiscordUser(e.target.value)}
                      className="w-full border-b border-slate-300 outline-none text-slate-900 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">CEO In-Game Name:</span>
                    <input
                      type="text"
                      value={ceoIngameName}
                      onChange={e => setCeoIngameName(e.target.value)}
                      className="w-full border-b border-slate-300 outline-none text-slate-900 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PAGE 2: CONSUMER FINANCIAL PROTECTIONS & CREDIT UNIONS                */}
        {/* ===================================================================== */}
        <div data-pdf-page="2" className="mea-pdf-page print-page space-y-6 pt-6 border-t-2 border-slate-300">
          <div>
            <h2 className="text-xl font-bold text-[#1c3d5a] tracking-tight pb-1 border-b border-[#9fc5e8]">
              Consumer Financial Protections
            </h2>
          </div>

          <div className="border border-[#9fc5e8] text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                  <th className="p-2.5 w-5/12 border-r border-[#9fc5e8]">Protection Requirement (Guidance)</th>
                  <th className="p-2.5 w-7/12">Bank Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9fc5e8]">
                <tr>
                  <td className="p-2.5 border-r border-[#9fc5e8] align-top bg-slate-50/40">
                    <p className="font-bold text-slate-900">Clear & Accurate Information:</p>
                    <p className="text-slate-700 text-[11px] mt-0.5 leading-snug">
                      How does the bank ensure all fees, interest rates, loan terms, risks, and account rules are explained clearly before customers use the product?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={clearInfo} 
                      onChange={e => setClearInfo(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-slate-900 outline-none leading-relaxed text-xs" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2.5 border-r border-[#9fc5e8] align-top bg-slate-50/40">
                    <p className="font-bold text-slate-900">Privacy & Data Protection:</p>
                    <p className="text-slate-700 text-[11px] mt-0.5 leading-snug">
                      How does the bank protect player financial data, restrict access, and enforce confidentiality for staff with account permissions?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={privacyData} 
                      onChange={e => setPrivacyData(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-slate-900 outline-none leading-relaxed text-xs" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2.5 border-r border-[#9fc5e8] align-top bg-slate-50/40">
                    <p className="font-bold text-slate-900">Complaint & Dispute Handling:</p>
                    <p className="text-slate-700 text-[11px] mt-0.5 leading-snug">
                      What is the bank’s process for receiving, responding to, and resolving consumer complaints? Include average response times & channels.
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={disputeHandling} 
                      onChange={e => setDisputeHandling(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-slate-900 outline-none leading-relaxed text-xs" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2.5 border-r border-[#9fc5e8] align-top bg-slate-50/40">
                    <p className="font-bold text-slate-900">New/Vulnerable Player Protections:</p>
                    <p className="text-slate-700 text-[11px] mt-0.5 leading-snug">
                      What safeguards prevent inexperienced players from being exploited (simplified explanations, extra approvals for risky products, etc.)?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={vulnerableProtections} 
                      onChange={e => setVulnerableProtections(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-slate-900 outline-none leading-relaxed text-xs" 
                    />
                  </td>
                </tr>

                <tr>
                  <td className="p-2.5 border-r border-[#9fc5e8] align-top bg-slate-50/40">
                    <p className="font-bold text-slate-900">Truthful Advertising Practices:</p>
                    <p className="text-slate-700 text-[11px] mt-0.5 leading-snug">
                      How does the bank ensure all advertising is accurate, non-misleading, and compliant with MEA standards?
                    </p>
                  </td>
                  <td className="p-2 align-top">
                    <textarea 
                      rows={3} 
                      value={truthfulAdvertising} 
                      onChange={e => setTruthfulAdvertising(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-slate-900 outline-none leading-relaxed text-xs" 
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section: Governance & Compliance - Credit Unions Only */}
          <div className="space-y-2 pt-4">
            <h3 className="text-sm font-bold text-[#1c3d5a]">
              Governance & Compliance - Credit Unions Only
            </h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <tbody className="divide-y divide-[#9fc5e8]">
                  <tr>
                    <td className="p-2.5 font-bold text-[#1c3d5a] w-5/12 border-r border-[#9fc5e8] bg-[#cfe2f3]/40">
                      Required Governance Type (President &lt; $200k deposits / Board ≥ $200k deposits)
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={cuGovernanceType} 
                        onChange={e => setCuGovernanceType(e.target.value)}
                        className="w-full p-1 border border-slate-200 rounded text-slate-900 outline-none text-xs" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/40">
                      Current Leadership (President / Board of Directors)
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={cuLeadership} 
                        onChange={e => setCuLeadership(e.target.value)}
                        className="w-full p-1 border border-slate-200 rounded text-slate-900 outline-none text-xs" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/40">
                      Profit Retention % (Max 10% per month)
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={cuProfitRetention} 
                        onChange={e => setCuProfitRetention(e.target.value)}
                        className="w-full p-1 border border-slate-200 rounded text-slate-900 outline-none text-xs" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-[#1c3d5a] border-r border-[#9fc5e8] bg-[#cfe2f3]/40">
                      How Remaining Profits Were Returned/Used for Members
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={cuProfitReturned} 
                        onChange={e => setCuProfitReturned(e.target.value)}
                        className="w-full p-1 border border-slate-200 rounded text-slate-900 outline-none text-xs" 
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PAGE 3: FINANCIAL DISCLOSURES (INCOME STATEMENT, LOANS, COLLATERAL)  */}
        {/* ===================================================================== */}
        <div data-pdf-page="3" className="mea-pdf-page print-page space-y-6 pt-6 border-t-2 border-slate-300">
          <div>
            <h2 className="text-xl font-bold text-[#1c3d5a] tracking-tight pb-1 border-b border-[#9fc5e8]">
              FINANCIAL DISCLOSURES
            </h2>
          </div>

          {/* Income Statement Table */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Income Statement</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8] w-1/3">Category</th>
                    <th className="p-2 border-r border-[#9fc5e8] w-1/3">Subcategory</th>
                    <th className="p-2 text-right w-1/3">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Interest Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Business Loans</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={interestBusinessLoans || ""} 
                        placeholder="$0.00"
                        onChange={e => setInterestBusinessLoans(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Interest Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Personal Loans</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={interestPersonalLoans || ""} 
                        placeholder="$0.00"
                        onChange={e => setInterestPersonalLoans(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Interest Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Mortgages</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={interestMortgages || ""} 
                        placeholder="$0.00"
                        onChange={e => setInterestMortgages(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Interest Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Other, List and Describe</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={interestOther || ""} 
                        placeholder="$0.00"
                        onChange={e => setInterestOther(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Fee Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Account Fees</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={feeAccount || ""} 
                        placeholder="$0.00"
                        onChange={e => setFeeAccount(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Fee Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Service Fees</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={feeService || ""} 
                        placeholder="$0.00"
                        onChange={e => setFeeService(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono font-bold" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Fee Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Late Fees</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={feeLate || ""} 
                        placeholder="$0.00"
                        onChange={e => setFeeLate(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Fee Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Other Fees</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={feeOther || ""} 
                        placeholder="$0.00"
                        onChange={e => setFeeOther(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Trading Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">Trading Gains/Losses</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={tradingGains || ""} 
                        placeholder="$0.00"
                        onChange={e => setTradingGains(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Other Income</td>
                    <td className="p-2 font-sans border-r border-slate-200">List and Describe</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={otherIncome || ""} 
                        placeholder="$0.00"
                        onChange={e => setOtherIncome(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">Interest Expense</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expInterest || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpInterest(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">Salaries</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expSalaries || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpSalaries(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">Operations</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expOperations || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpOperations(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">Marketing</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expMarketing || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpMarketing(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">Technology</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expTechnology || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpTechnology(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">Legal</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expLegal || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpLegal(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Other Expenses</td>
                    <td className="p-2 font-sans border-r border-slate-200">List and Describe</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={expOther || ""} 
                        placeholder="$0.00"
                        onChange={e => setExpOther(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Taxes</td>
                    <td className="p-2 font-sans border-r border-slate-200">Withdrawal Tax</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={taxWithdrawal || ""} 
                        placeholder="$0.00"
                        onChange={e => setTaxWithdrawal(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr className="bg-[#cfe2f3]/50 font-bold">
                    <td className="p-2 font-sans border-r border-slate-300 text-[#1c3d5a]">Net Income</td>
                    <td className="p-2 font-sans border-r border-slate-300 text-[#1c3d5a]">Income – (Expenses + Withdrawal tax)</td>
                    <td className={`p-2 text-right ${netIncome < 0 ? "text-rose-600" : "text-[#1c3d5a]"}`}>
                      {formatCurrency(netIncome)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Loan Register Table */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Loan Register</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8]">Type</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Borrower</th>
                    <th className="p-2 text-right border-r border-[#9fc5e8]">Principal</th>
                    <th className="p-2 text-right border-r border-[#9fc5e8]">Remaining Balance</th>
                    <th className="p-2 text-center border-r border-[#9fc5e8]">Rate</th>
                    <th className="p-2 text-center border-r border-[#9fc5e8]">Term</th>
                    <th className="p-2 text-center border-r border-[#9fc5e8]">Collateral (Yes or No)</th>
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loanRegister.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-3 text-center text-slate-400 italic">No loans recorded in register</td>
                    </tr>
                  ) : (
                    loanRegister.map((loan, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-semibold border-r border-slate-200">{loan.type}</td>
                        <td className="p-2 border-r border-slate-200">{loan.borrower}</td>
                        <td className="p-2 text-right font-mono border-r border-slate-200">{formatCurrency(loan.principal)}</td>
                        <td className="p-2 text-right font-mono border-r border-slate-200">{formatCurrency(loan.remainingBalance)}</td>
                        <td className="p-2 text-center border-r border-slate-200">{loan.rate}</td>
                        <td className="p-2 text-center border-r border-slate-200">{loan.term}</td>
                        <td className="p-2 text-center border-r border-slate-200">{loan.collateral}</td>
                        <td className="p-2 text-center">{loan.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collateral Table */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Collateral</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8]">Asset Type</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Description</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Borrower</th>
                    <th className="p-2 text-right border-r border-[#9fc5e8]">Appraised Value</th>
                    <th className="p-2 text-center">Date Acquired</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {collateralRegister.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-3 text-center text-slate-400 italic">No pledged collateral recorded</td>
                    </tr>
                  ) : (
                    collateralRegister.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-semibold border-r border-slate-200">{item.assetType}</td>
                        <td className="p-2 border-r border-slate-200">{item.description}</td>
                        <td className="p-2 border-r border-slate-200">{item.borrower}</td>
                        <td className="p-2 text-right font-mono border-r border-slate-200">{formatCurrency(item.appraisedValue)}</td>
                        <td className="p-2 text-center">{item.dateAcquired}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PAGE 4: BALANCE SHEET & INVESTMENT PRODUCTS                          */}
        {/* ===================================================================== */}
        <div data-pdf-page="4" className="mea-pdf-page print-page space-y-6 pt-6 border-t-2 border-slate-300">
          <div>
            <h2 className="text-xl font-bold text-[#1c3d5a] tracking-tight pb-1 border-b border-[#9fc5e8]">
              Balance Sheet
            </h2>
          </div>

          {/* Assets Table */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Assets</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8] w-1/3">Category</th>
                    <th className="p-2 border-r border-[#9fc5e8] w-1/3">Subcategory</th>
                    <th className="p-2 text-right w-1/3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr className="bg-sky-50/30">
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Cash</td>
                    <td className="p-2 font-sans border-r border-slate-200">
                      <div className="font-bold text-[#1c3d5a]">Bank Cash Balance</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        Corp Balance ({formatCurrency(corpBalance)}) + Loan Pool ({formatCurrency(loanPoolBalance)})
                      </div>
                    </td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={cashBankBalance || ""} 
                        placeholder="$0.00"
                        onChange={e => setCashBankBalance(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono font-bold text-[#1c3d5a]" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Cash</td>
                    <td className="p-2 font-sans border-r border-slate-200">Total Deposits Held</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={cashDepositsHeld || ""} 
                        placeholder="$0.00"
                        onChange={e => setCashDepositsHeld(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Loans</td>
                    <td className="p-2 font-sans border-r border-slate-200">Business Loans</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetBusinessLoans || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetBusinessLoans(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Loans</td>
                    <td className="p-2 font-sans border-r border-slate-200">Personal Loans</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetPersonalLoans || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetPersonalLoans(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Loans</td>
                    <td className="p-2 font-sans border-r border-slate-200">Mortgages</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetMortgages || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetMortgages(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Collateral</td>
                    <td className="p-2 font-sans border-r border-slate-200">Plots</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetCollateralPlots || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetCollateralPlots(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Collateral</td>
                    <td className="p-2 font-sans border-r border-slate-200">Items / Other</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetCollateralItems || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetCollateralItems(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Real Estate</td>
                    <td className="p-2 font-sans border-r border-slate-200">Plots</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetRealEstatePlots || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetRealEstatePlots(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Inventory</td>
                    <td className="p-2 font-sans border-r border-slate-200">Bank-Owned Materials</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetInventory || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetInventory(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Receivables</td>
                    <td className="p-2 font-sans border-r border-slate-200">Pending Payments</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetReceivables || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetReceivables(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Other</td>
                    <td className="p-2 font-sans border-r border-slate-200">Misc. List and Describe</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={assetOther || ""} 
                        placeholder="$0.00"
                        onChange={e => setAssetOther(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr className="bg-[#cfe2f3]/50 font-bold">
                    <td className="p-2 font-sans border-r border-slate-300 text-[#1c3d5a]">Total</td>
                    <td className="p-2 font-sans border-r border-slate-300 text-[#1c3d5a]">Sum of all Assets</td>
                    <td className="p-2 text-right text-[#1c3d5a]">
                      {formatCurrency(totalAssets)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Liabilities Table */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Liabilities</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8] w-1/3">Category</th>
                    <th className="p-2 border-r border-[#9fc5e8] w-1/3">Subcategory</th>
                    <th className="p-2 text-right w-1/3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Deposits</td>
                    <td className="p-2 font-sans border-r border-slate-200">Personal Deposits</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabPersonalDeposits || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabPersonalDeposits(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Deposits</td>
                    <td className="p-2 font-sans border-r border-slate-200">Business Deposits</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabBusinessDeposits || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabBusinessDeposits(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Deposits</td>
                    <td className="p-2 font-sans border-r border-slate-200">Certificates of Deposit (CDs)</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabCDs || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabCDs(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Liabilities</td>
                    <td className="p-2 font-sans border-r border-slate-200">Pending Payments</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabPendingPayments || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabPendingPayments(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Liabilities</td>
                    <td className="p-2 font-sans border-r border-slate-200">Outstanding Loans the Bank Owes</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabLoansOwed || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabLoansOwed(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Other</td>
                    <td className="p-2 font-sans border-r border-slate-200">Misc. List and Describe</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabOther || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabOther(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
                      />
                    </td>
                  </tr>
                  <tr className="bg-[#cfe2f3]/50 font-bold">
                    <td className="p-2 font-sans border-r border-slate-300 text-[#1c3d5a]">Total</td>
                    <td className="p-2 font-sans border-r border-slate-300 text-[#1c3d5a]">Sum of all Liabilities</td>
                    <td className="p-2 text-right text-[#1c3d5a]">
                      {formatCurrency(totalLiabilities)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Equity Section */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Equity</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <tbody>
                  <tr className="bg-[#cfe2f3]/50 font-bold text-sm">
                    <td className="p-2.5 font-sans border-r border-[#9fc5e8] text-[#1c3d5a] w-1/3">Total</td>
                    <td className="p-2.5 font-sans border-r border-[#9fc5e8] text-[#1c3d5a] w-1/3">Total Assets - Total Liabilities</td>
                    <td className="p-2.5 text-right text-[#1c3d5a] w-1/3">
                      {formatCurrency(totalEquity)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Investment Products (Page 4 Top rows) */}
          <div className="space-y-2 pt-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Investment Products and Funds Disclosure</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8]">Product / Fund Name</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Type</th>
                    <th className="p-2 text-right border-r border-[#9fc5e8]">Total Value Under Mgmt.</th>
                    <th className="p-2 text-center border-r border-[#9fc5e8]"># of Investors</th>
                    <th className="p-2 text-center border-r border-[#9fc5e8]">Risk Level</th>
                    <th className="p-2 text-center border-r border-[#9fc5e8]">Quarterly Return %</th>
                    <th className="p-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="p-2 border-r border-slate-200 text-slate-400 italic">None</td>
                    <td className="p-2 border-r border-slate-200"></td>
                    <td className="p-2 border-r border-slate-200 text-right font-mono">$0.00</td>
                    <td className="p-2 border-r border-slate-200 text-center">0</td>
                    <td className="p-2 border-r border-slate-200 text-center">-</td>
                    <td className="p-2 border-r border-slate-200 text-center">-</td>
                    <td className="p-2 text-slate-500 text-[11px]">No active public investment funds</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PAGE 5: INVESTMENT CONTINUATION, AUDIT ACCOUNTS & CERTIFICATION      */}
        {/* ===================================================================== */}
        <div data-pdf-page="5" className="mea-pdf-page print-page space-y-6 pt-6 border-t-2 border-slate-300">
          {/* Continuation table of Investment Products at top of Page 5 matching template */}
          <div className="border border-[#9fc5e8] text-xs">
            <table className="w-full text-left border-collapse">
              <tbody className="divide-y divide-slate-200">
                <tr className="h-6">
                  <td className="p-2 border-r border-slate-200 w-1/6"></td>
                  <td className="p-2 border-r border-slate-200 w-1/6"></td>
                  <td className="p-2 border-r border-slate-200 w-1/6"></td>
                  <td className="p-2 border-r border-slate-200 w-1/12"></td>
                  <td className="p-2 border-r border-slate-200 w-1/12"></td>
                  <td className="p-2 border-r border-slate-200 w-1/6"></td>
                  <td className="p-2 w-1/6"></td>
                </tr>
                <tr className="h-6">
                  <td className="p-2 border-r border-slate-200"></td>
                  <td className="p-2 border-r border-slate-200"></td>
                  <td className="p-2 border-r border-slate-200"></td>
                  <td className="p-2 border-r border-slate-200"></td>
                  <td className="p-2 border-r border-slate-200"></td>
                  <td className="p-2 border-r border-slate-200"></td>
                  <td className="p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Accounts List - For Audits Only */}
          <div className="space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Accounts List - For Audits Only</h3>
            <div className="border border-[#9fc5e8] text-xs max-h-[360px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2.5 border-r border-[#9fc5e8] w-1/2">
                      Account Holder<br />
                      <span className="text-[10px] font-normal text-slate-700">
                        (May be pseudoanonymized but all accounts by same person should have same code)
                      </span>
                    </th>
                    <th className="p-2.5 border-r border-[#9fc5e8] w-1/4">Account Type</th>
                    <th className="p-2.5 text-right w-1/4">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {accountsAuditList.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-slate-400 italic font-sans">
                        Audit accounts synced from bank database (client accounts list)
                      </td>
                    </tr>
                  ) : (
                    accountsAuditList.map((acc, idx) => (
                      <tr key={idx}>
                        <td className="p-2 border-r border-slate-200 font-sans font-medium text-slate-900">{acc.holder}</td>
                        <td className="p-2 border-r border-slate-200 font-sans text-slate-700">{acc.type}</td>
                        <td className="p-2 text-right font-mono font-bold text-[#1c3d5a]">{formatCurrency(acc.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Certification Statement Box */}
          <div className="border border-[#1c3d5a]/60 text-xs">
            <div className="bg-[#cfe2f3] p-2 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
              Certification Statement
            </div>
            <div className="p-4 space-y-4">
              <p className="text-slate-800 leading-relaxed font-semibold">
                I certify that the information contained in this report is accurate and complete to the best of my knowledge.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 shrink-0">Signature:</span>
                  <input
                    type="text"
                    value={certName}
                    onChange={e => setCertName(e.target.value)}
                    className="font-serif italic text-base text-[#1c3d5a] outline-none border-b border-slate-300 w-64 bg-transparent"
                    placeholder="Signature Name"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">Name:</span>
                    <input
                      type="text"
                      value={certName}
                      onChange={e => setCertName(e.target.value)}
                      className="border-b border-slate-300 outline-none text-slate-900 w-44"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">Title:</span>
                    <input
                      type="text"
                      value={certTitle}
                      onChange={e => setCertTitle(e.target.value)}
                      className="border-b border-slate-300 outline-none text-slate-900 w-52"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 shrink-0">Date:</span>
                  <input
                    type="text"
                    value={certDate}
                    onChange={e => setCertDate(e.target.value)}
                    className="border-b border-slate-300 outline-none text-slate-900 w-36"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Export & Submission Bar (Hidden in Print View) */}
      <div className="print:hidden mt-8 bg-[var(--bg-elevated)] border border-indigo-500/30 rounded-2xl p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <FileDown className="text-indigo-400" size={18} />
            Official MEA Regulatory PDF Export
          </h4>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Save the complete 5-page report matching 100% the official MEA government filing template with corporate overview, consumer protections, financial disclosures, balance sheet, and audit certification.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          <button
            onClick={handleCopyMarkdown}
            disabled={exportingPdf}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-semibold border border-white/10 transition-colors cursor-pointer disabled:opacity-50"
          >
            {copiedMd ? <><Check size={14} className="text-emerald-400" /> Copied Markdown</> : <><Copy size={14} /> Copy Markdown</>}
          </button>

          <button
            onClick={handleExportPDF}
            disabled={exportingPdf}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50 ring-2 ring-indigo-400/40"
          >
            {exportingPdf ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>{pdfProgress || "Exporting PDF..."}</span>
              </>
            ) : (
              <>
                <FileDown size={16} />
                <span>Save Full PDF (5 Pages)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
