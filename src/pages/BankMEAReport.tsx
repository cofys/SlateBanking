import { useState, useEffect, useRef, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { 
  Printer, RefreshCw, Check, Copy, Plus, Trash2, 
  Sparkles, Info, CheckCircle2, Calendar, Clock, History,
  Download, FileDown
} from "lucide-react";
import { exportMEAReportPDF } from "../lib/meaPdfExporter";

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

function formatNullableCurrency(dollars: number | undefined | null): string {
  if (dollars === undefined || dollars === null || isNaN(dollars) || dollars === 0) return "";
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

  // Audit month selection state (defaults to previous month if day <= 15, e.g. September on Oct 6)
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthName = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthName = lastMonthDate.toLocaleString('en-US', { month: 'short', year: 'numeric' });

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

  // Balance Sheet Inputs (in DOLLARS) - Assets
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

  // Balance Sheet Inputs (in DOLLARS) - Liabilities
  const [liabPersonalDeposits, setLiabPersonalDeposits] = useState<number>(0);
  const [liabBusinessDeposits, setLiabBusinessDeposits] = useState<number>(0);
  const [liabCDs, setLiabCDs] = useState<number>(0);
  const [liabPendingPayments, setLiabPendingPayments] = useState<number>(0);
  const [liabLoansOwed, setLiabLoansOwed] = useState<number>(0);
  const [liabTaxesWithheld, setLiabTaxesWithheld] = useState<number>(0);
  const [liabOther, setLiabOther] = useState<number>(0);

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

      // Metadata
      setReportPeriod(data.metadata.reportPeriod || `${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getFullYear()}`);
      setDatePublished(data.metadata.datePublished || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      setPreparedBy(data.metadata.preparedBy || "Bank Compliance Staff");
      setRegisteredOwners(data.metadata.registeredOwners || `1. ${bank.name}`);
      setInstitutionType(data.metadata.institutionType || "Commercial Bank");
      setDescription(data.metadata.description || `${bank.name} provides financial tools to help clients reach their goals everyday. We offer bank deposits, personal and business loans, and various financial services.`);

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

      // Balance Sheet Assets
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

      // Balance Sheet Liabilities
      setLiabPersonalDeposits(data.balanceSheet?.liabPersonalDeposits || 0);
      setLiabBusinessDeposits(data.balanceSheet?.liabBusinessDeposits || 0);
      setLiabCDs(data.balanceSheet?.liabCDs || 0);
      setLiabPendingPayments(data.balanceSheet?.liabPendingPayments || 0);
      setLiabLoansOwed(data.balanceSheet?.liabLoansOwed || 0);
      setLiabTaxesWithheld(data.balanceSheet?.liabTaxesWithheld || 0);
      setLiabOther(data.balanceSheet?.liabOther || 0);

      // Registers
      setLoanRegister(data.loanRegister || []);
      setCollateralRegister(data.collateralRegister || []);

      // Certification
      setCertName(data.certification?.certName || "");
      setCertTitle(data.certification?.certTitle || "Managing Director / Compliance Officer");
      
      const d = new Date();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      const yrStr = String(d.getFullYear()).slice(-2);
      setCertDate(data.certification?.certDate || `${monthStr}-${dayStr}-${yrStr}`);

      setAutoFilled(true);
      setSyncToast(`Ledger Synchronized: ${data.metadata?.reportPeriod || targetMonth} live financial figures loaded.`);
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
    setPdfProgress("Generating official 5-page PDF report...");

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
      : '| Loan | None | $0.00 | $0.00 | 0% | N/A | No | Closed |';

    const collateralRowsMd = collateralRegister.length > 0
      ? collateralRegister.map(c => `| ${c.assetType} | ${c.description} | ${c.borrower} | ${c.appraisedValue > 0 ? formatCurrency(c.appraisedValue) : "N/A"} | ${c.dateAcquired} |`).join('\n')
      : '| Real Estate | None | N/A | N/A | N/A |';

    const md = `
MEA FINANCIAL INSTITUTION REPORT

| Institution Name: | ${bank?.name || ''} |
| Reporting Period: | ${reportPeriod} |
| Prepared By: | ${preparedBy} |
| Date Published: | ${datePublished} |
| Registered Owners: | ${registeredOwners} |

CORPORATE INFORMATION

Description of Institution
Institution Type: ${institutionType}
Description: ${description}

Executive Overview
Management Team:
${managementTeam.join('\n') || 'None'}

Legal Representation:
${legalRep || 'Independent Counsel'}

A list of names of employees who have direct access to alter or withdraw from account balances, or the bank’s balance:
${directAccessEmployees.join('\n') || 'None'}

Technical Information
Discord Link: ${discordLink || 'N/A'}
Company In-Game Name: ${companyIngameName || bank?.name}
CEO Discord Username: ${ceoDiscordUser || 'N/A'}
CEO In-Game Name: ${ceoIngameName || 'N/A'}

Consumer Financial Protections

| Protection Requirement (Guidance) | Bank Response |
| :--- | :--- |
| **Clear & Accurate Information:**<br>How does the bank ensure all fees, interest rates, loan terms, risks, and account rules are explained clearly before customers use the product? | ${clearInfo} |
| **Privacy & Data Protection:**<br>How does the bank protect player financial data, restrict access, and enforce confidentiality for staff with account permissions? | ${privacyData} |
| **Complaint & Dispute Handling:**<br>What is the bank’s process for receiving, responding to, and resolving consumer complaints? Include average response times & channels. | ${disputeHandling} |
| **New/Vulnerable Player Protections:**<br>What safeguards prevent inexperienced players from being exploited (simplified explanations, extra approvals for risky products, etc.)? | ${vulnerableProtections} |
| **Truthful Advertising Practices:**<br>How does the bank ensure all advertising is accurate, non-misleading, and compliant with MEA standards? | ${truthfulAdvertising} |

FINANCIAL DISCLOSURES

Income Statement
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
| Net Income | Income – (Expenses + Withdrawal tax) | ${formatCurrency(netIncome)} |

Loan Register
| Type | Borrower | Principal | Remaining Balance | Rate | Term | Collateral (Yes or No) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${loanRowsMd}

Collateral
| Asset Type | Description | Borrower | Appraised Value | Date Acquired |
| :--- | :--- | :--- | :--- | :--- |
${collateralRowsMd}

Balance Sheet

Assets
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
| Total | Sum of all Assets | ${formatCurrency(totalAssets)} |

Liabilities
| Category | Subcategory | Value |
| :--- | :--- | :--- |
| Deposits | Personal Deposits | ${liabPersonalDeposits ? formatCurrency(liabPersonalDeposits) : ''} |
| Deposits | Business Deposits | ${liabBusinessDeposits ? formatCurrency(liabBusinessDeposits) : ''} |
| Deposits | Certificates of Deposit (CDs) | ${liabCDs ? formatCurrency(liabCDs) : ''} |
| Liabilities | Pending Payments | ${liabPendingPayments ? formatCurrency(liabPendingPayments) : ''} |
| Liabilities | Outstanding Loans the Bank Owes | ${liabLoansOwed ? formatCurrency(liabLoansOwed) : ''} |
| Taxes | Withheld Withdrawal Taxes | ${liabTaxesWithheld ? formatCurrency(liabTaxesWithheld) : ''} |
| Other | Misc. List and Describe | ${liabOther ? formatCurrency(liabOther) : ''} |
| Total | Sum of all Liabilities | ${formatCurrency(totalLiabilities)} |

Equity
| Total | Total Assets - Total Liabilities | ${formatCurrency(totalEquity)} |

Certification Statement
I certify that the information contained in this report is accurate and complete to the best of my knowledge.
Signature: ${certName}
Name: ${certName} Title: ${certTitle}
Date: ${certDate}
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
    <div className="max-w-5xl mx-auto pb-16 animate-in fade-in duration-500">
      {/* Hidden/Print Optimization Styles */}
      <style>{`
        @media print {
          @page {
            margin: 12mm 15mm;
            size: letter;
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
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
              Government Regulatory Compliance
            </span>
            {autoFilled && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <Sparkles size={10} /> 100% Gov Template Aligned
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mt-1">MEA Financial Institution Report</h2>
          <p className="text-zinc-400 text-xs mt-0.5">
            Official government submission report. Matches the exact MEA template structure, tables, and disclosures.
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
            title="Download complete 5-page PDF document"
          >
            {exportingPdf ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>{pdfProgress || "Exporting PDF..."}</span>
              </>
            ) : (
              <>
                <FileDown size={15} />
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

      {/* Sync Toast Feedback */}
      {syncToast && (
        <div className="print:hidden mb-4 bg-emerald-950/60 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in duration-300">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Month Selection & Historical Period Navigation Panel */}
      <div className="print:hidden mb-6 bg-[var(--bg-elevated)] border border-indigo-500/30 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar size={18} className="text-indigo-400 shrink-0" />
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Reporting Month & Historical Audit Period
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                <Clock size={11} /> {reportPeriod || selectedMonth}
              </span>
            </div>
            <p className="text-zinc-400 text-xs leading-relaxed max-w-2xl">
              Select the reporting month for this regulatory submission. In-game corporate withdrawal fees, interest revenues, loan registers, and operations will automatically recalculate for that chosen calendar window.
            </p>
          </div>

          {/* Controls: Quick step buttons & Month select */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 shrink-0">
            {/* Quick step buttons */}
            <div className="inline-flex rounded-xl bg-white/5 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => handleStepMonth(-1)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Go back 1 month"
              >
                ← Prev Month
              </button>
              <button
                type="button"
                onClick={() => handleSelectMonth(lastMonthKey)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedMonth === lastMonthKey
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-300 hover:text-white hover:bg-white/10"
                }`}
                title="Select Last Month (Recommended)"
              >
                Last Month ({lastMonthName})
              </button>
              <button
                type="button"
                onClick={() => handleSelectMonth(currentMonthKey)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  selectedMonth === currentMonthKey
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-300 hover:text-white hover:bg-white/10"
                }`}
                title="Select Current Month"
              >
                Current Month ({currentMonthName})
              </button>
              <button
                type="button"
                onClick={() => handleStepMonth(1)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Go forward 1 month"
              >
                Next Month →
              </button>
            </div>

            {/* Dropdown for any month */}
            <div className="relative min-w-[220px]">
              <select
                value={selectedMonth}
                onChange={(e) => handleSelectMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-indigo-500/40 text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none pr-8"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.key} value={opt.key} className="bg-zinc-900 text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
              <Calendar size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Instructions callout */}
      <div className="print:hidden bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info size={18} className="text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-200/90 leading-relaxed">
          <strong className="text-white">Gov Template Match:</strong> This report is structured to 100% replicate the official MEA government PDF filing template. All calculations reflect live balances, transaction fees, and staff credentials.
        </div>
      </div>

      {/* Printable Report Document Container (Official Gov PDF Layout) */}
      <div 
        ref={reportRef} 
        className="print-container bg-white text-slate-900 shadow-2xl p-8 sm:p-12 font-sans border border-slate-300 print:shadow-none print:border-none print:p-0 print:m-0 print:text-black space-y-8"
        style={{ fontFamily: "Arial, sans-serif" }}
      >
        {/* PAGE 1: COVER & INSTITUTION IDENTIFICATION */}
        <div data-pdf-page="1" className="mea-pdf-page print-page space-y-6">
          {/* Header Title */}
          <div className="text-center pb-2 border-b border-[#9fc5e8]">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1c3d5a] uppercase">
              MEA FINANCIAL INSTITUTION REPORT
            </h1>
          </div>

          {/* Top Metadata Table (Page 2 of PDF) */}
          <div className="border border-[#9fc5e8] text-xs">
            <table className="w-full text-left border-collapse">
              <tbody>
                <tr className="border-b border-[#9fc5e8] bg-[#cfe2f3]/40">
                  <td className="p-2 font-bold text-slate-900 w-1/3 border-r border-[#9fc5e8]">Institution Name:</td>
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
                  <td className="p-2 font-bold text-slate-900 border-r border-[#9fc5e8]">Reporting Period:</td>
                  <td className="p-2 text-slate-900">
                    <input 
                      type="text" 
                      value={reportPeriod} 
                      onChange={e => setReportPeriod(e.target.value)}
                      placeholder="e.g. August 2026"
                      className="w-full text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
                <tr className="border-b border-[#9fc5e8] bg-[#cfe2f3]/40">
                  <td className="p-2 font-bold text-slate-900 border-r border-[#9fc5e8]">Prepared By:</td>
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
                  <td className="p-2 font-bold text-slate-900 border-r border-[#9fc5e8]">Date Published:</td>
                  <td className="p-2 text-slate-900">
                    <input 
                      type="text" 
                      value={datePublished} 
                      onChange={e => setDatePublished(e.target.value)}
                      placeholder="e.g. September 4th, 2026"
                      className="w-full text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
                <tr className="bg-[#cfe2f3]/40">
                  <td className="p-2 font-bold text-slate-900 border-r border-[#9fc5e8]">Registered Owners:</td>
                  <td className="p-2 text-slate-900">
                    <input 
                      type="text" 
                      value={registeredOwners} 
                      onChange={e => setRegisteredOwners(e.target.value)}
                      placeholder="1. Owner Name"
                      className="w-full text-slate-900 bg-transparent outline-none" 
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Logo Frame Box */}
          <div className="border border-slate-700 p-6 text-center flex items-center justify-center bg-white min-h-[120px]">
            <div className="border-4 border-slate-900 p-4 max-w-sm w-full text-center flex flex-col items-center justify-center">
              {(bank?.logoUrl || bank?.settings?.logoUrl) ? (
                <img
                  src={bank.logoUrl || bank.settings.logoUrl}
                  alt={bank?.name}
                  referrerPolicy="no-referrer"
                  className="max-h-16 object-contain"
                />
              ) : (
                <span className="text-2xl font-black tracking-tight text-[#1c3d5a] uppercase">
                  {bank?.name || "BANK"}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* PAGE 2: CORPORATE INFORMATION */}
        <div data-pdf-page="2" className="mea-pdf-page print-page space-y-6 pt-6 border-t border-slate-200">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-[#1c3d5a] uppercase tracking-wide border-b border-[#9fc5e8] pb-1">
              CORPORATE INFORMATION
            </h2>

            {/* Description of Institution Sub-Box */}
            <div className="border border-[#9fc5e8] text-xs">
              <div className="bg-[#d9e8f5] p-2 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
                Description of Institution
              </div>
              <div className="p-3 space-y-3">
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
                  <span className="font-bold text-slate-900 block mb-1">Description: </span>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-slate-900 outline-none leading-relaxed text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Executive Overview Sub-Box */}
            <div className="border border-[#9fc5e8] text-xs">
              <div className="bg-[#d9e8f5] p-2 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
                Executive Overview
              </div>
              <div className="p-3 space-y-3">
                <div>
                  <span className="font-bold text-slate-900 block mb-1">Management Team:</span>
                  <textarea
                    rows={4}
                    value={managementTeam.join("\n")}
                    onChange={e => setManagementTeam(e.target.value.split("\n"))}
                    className="w-full p-2 border border-slate-300 rounded text-slate-900 outline-none text-xs leading-relaxed"
                  />
                </div>

                <div>
                  <span className="font-bold text-slate-900 block mb-1">Legal Representation:</span>
                  <input
                    type="text"
                    value={legalRep}
                    onChange={e => setLegalRep(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded text-slate-900 outline-none text-xs"
                  />
                </div>

                <div>
                  <span className="font-bold text-slate-900 block mb-1">
                    A list of names of employees who have direct access to alter or withdraw from account balances, or the bank’s balance:
                  </span>
                  <textarea
                    rows={4}
                    value={directAccessEmployees.join("\n")}
                    onChange={e => setDirectAccessEmployees(e.target.value.split("\n"))}
                    className="w-full p-2 border border-slate-300 rounded text-slate-900 outline-none text-xs leading-relaxed"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PAGE 3: TECHNICAL INFO & CONSUMER PROTECTIONS */}
        <div data-pdf-page="3" className="mea-pdf-page print-page space-y-6 pt-6 border-t border-slate-200">
          {/* Technical Information Sub-Box */}
          <div className="print-no-break border border-[#9fc5e8] text-xs">
            <div className="bg-[#d9e8f5] p-2 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
              Technical Information
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 shrink-0">Discord Link:</span>
                <input
                  type="text"
                  value={discordLink}
                  onChange={e => setDiscordLink(e.target.value)}
                  className="w-full border-b border-slate-300 outline-none text-slate-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 shrink-0">Company In-Game Name:</span>
                <input
                  type="text"
                  value={companyIngameName}
                  onChange={e => setCompanyIngameName(e.target.value)}
                  className="w-full border-b border-slate-300 outline-none text-slate-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 shrink-0">CEO Discord Username:</span>
                <input
                  type="text"
                  value={ceoDiscordUser}
                  onChange={e => setCeoDiscordUser(e.target.value)}
                  className="w-full border-b border-slate-300 outline-none text-slate-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 shrink-0">CEO In-Game Name:</span>
                <input
                  type="text"
                  value={ceoIngameName}
                  onChange={e => setCeoIngameName(e.target.value)}
                  className="w-full border-b border-slate-300 outline-none text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Section: Consumer Financial Protections */}
          <div className="print-no-break space-y-3">
            <h2 className="text-lg font-bold text-[#1c3d5a] tracking-tight border-b border-[#9fc5e8] pb-1">
              Consumer Financial Protections
            </h2>

            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2.5 w-1/2 border-r border-[#9fc5e8]">Protection Requirement (Guidance)</th>
                    <th className="p-2.5 w-1/2">Bank Response</th>
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
                        rows={4} 
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
                        rows={4} 
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
                        rows={4} 
                        value={truthfulAdvertising} 
                        onChange={e => setTruthfulAdvertising(e.target.value)}
                        className="w-full p-1.5 border border-slate-200 rounded text-slate-900 outline-none leading-relaxed text-xs" 
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 4: INCOME STATEMENT, LOAN REGISTER & COLLATERAL */}
        <div data-pdf-page="4" className="mea-pdf-page print-page space-y-6 pt-6 border-t border-slate-200">
          <div>
            <h2 className="text-base font-bold text-[#1c3d5a] uppercase tracking-wide border-b border-[#9fc5e8] pb-1">
              FINANCIAL DISCLOSURES
            </h2>
          </div>

          {/* Income Statement Table */}
          <div className="print-no-break space-y-2">
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

                  {/* Fee Income Rows */}
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

                  {/* Trading & Other Income */}
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

                  {/* Expenses */}
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

                  {/* Net Income Row */}
                  <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-[#9fc5e8]">
                    <td className="p-2.5 font-sans border-r border-slate-300">Net Income</td>
                    <td className="p-2.5 font-sans border-r border-slate-300">Income – (Expenses + Withdrawal tax)</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(netIncome)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Loan Register Table (Page 4 of PDF) */}
          <div className="print-no-break space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#1c3d5a] text-sm">Loan Register</h3>
              <button
                onClick={() => setLoanRegister([...loanRegister, { 
                  id: `LN-${Date.now().toString().slice(-4)}`, 
                  type: "Loan", 
                  borrower: "Borrower", 
                  principal: 100000, 
                  remainingBalance: 100000, 
                  rate: "4%", 
                  term: "14 months", 
                  collateral: "Yes", 
                  status: "Open" 
                }])}
                className="print:hidden text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 font-semibold flex items-center gap-1 hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                <Plus size={11} /> Add Loan Row
              </button>
            </div>

            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8]">Type</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Borrower</th>
                    <th className="p-2 border-r border-[#9fc5e8] text-right">Principal</th>
                    <th className="p-2 border-r border-[#9fc5e8] text-right">Remaining Balance</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Rate</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Term</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Collateral (Yes or No)</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Status</th>
                    <th className="p-2 print:hidden w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono">
                  {loanRegister.length === 0 ? (
                    <tr>
                      <td className="p-2 border-r border-slate-200 font-sans">Loan</td>
                      <td className="p-2 border-r border-slate-200 font-sans">None</td>
                      <td className="p-2 border-r border-slate-200 text-right">$0</td>
                      <td className="p-2 border-r border-slate-200 text-right">$0</td>
                      <td className="p-2 border-r border-slate-200">0%</td>
                      <td className="p-2 border-r border-slate-200">N/A</td>
                      <td className="p-2 border-r border-slate-200">No</td>
                      <td className="p-2 border-r border-slate-200">Closed</td>
                      <td className="p-2 print:hidden"></td>
                    </tr>
                  ) : (
                    loanRegister.map((lr, idx) => (
                      <tr key={lr.id || idx}>
                        <td className="p-1 border-r border-slate-200 font-sans">
                          <input 
                            type="text" 
                            value={lr.type} 
                            onChange={e => { const copy = [...loanRegister]; copy[idx].type = e.target.value; setLoanRegister(copy); }} 
                            className="w-full outline-none font-sans px-1" 
                          />
                        </td>
                        <td className="p-1 border-r border-slate-200 font-sans">
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
                            className="w-full text-right outline-none px-1 font-mono" 
                          />
                        </td>
                        <td className="p-1 border-r border-slate-200 text-right">
                          <input 
                            type="number" 
                            step="0.01" 
                            value={lr.remainingBalance} 
                            onChange={e => { const copy = [...loanRegister]; copy[idx].remainingBalance = Number(e.target.value); setLoanRegister(copy); }} 
                            className="w-full text-right outline-none px-1 font-mono" 
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
                            className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                            title="Delete row"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collateral Table (Page 4 of PDF) */}
          <div className="print-no-break space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#1c3d5a] text-sm">Collateral</h3>
              <button
                onClick={() => setCollateralRegister([...collateralRegister, { 
                  id: `COL-${Date.now().toString().slice(-4)}`, 
                  assetType: "Real Estate", 
                  description: "Plot", 
                  borrower: "Borrower", 
                  appraisedValue: 0, 
                  dateAcquired: "08/01/2026" 
                }])}
                className="print:hidden text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 font-semibold flex items-center gap-1 hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                <Plus size={11} /> Add Collateral Row
              </button>
            </div>

            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#cfe2f3] text-[#1c3d5a] font-bold border-b border-[#9fc5e8]">
                    <th className="p-2 border-r border-[#9fc5e8]">Asset Type</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Description</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Borrower</th>
                    <th className="p-2 border-r border-[#9fc5e8] text-right">Appraised Value</th>
                    <th className="p-2 border-r border-[#9fc5e8]">Date Acquired</th>
                    <th className="p-2 print:hidden w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {collateralRegister.length === 0 ? (
                    <tr>
                      <td className="p-2 border-r border-slate-200 font-sans">Real Estate</td>
                      <td className="p-2 border-r border-slate-200 font-sans">Plot</td>
                      <td className="p-2 border-r border-slate-200 font-sans">Borrower</td>
                      <td className="p-2 border-r border-slate-200 text-right font-mono">N/A</td>
                      <td className="p-2 border-r border-slate-200">08/01/2026</td>
                      <td className="p-2 print:hidden"></td>
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
                            type="text" 
                            value={cr.appraisedValue > 0 ? cr.appraisedValue : "N/A"} 
                            onChange={e => { 
                              const val = parseFloat(e.target.value) || 0;
                              const copy = [...collateralRegister]; 
                              copy[idx].appraisedValue = val; 
                              setCollateralRegister(copy); 
                            }} 
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
                            className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                            title="Delete row"
                          >
                            <Trash2 size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* PAGE 5: BALANCE SHEET & CERTIFICATION */}
        <div data-pdf-page="5" className="mea-pdf-page print-page space-y-6 pt-6 border-t border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-[#1c3d5a] tracking-tight border-b border-[#9fc5e8] pb-1">
              Balance Sheet
            </h2>
          </div>

          {/* Assets Table */}
          <div className="print-no-break space-y-2">
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
                  <tr>
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Cash</td>
                    <td className="p-2 font-sans border-r border-slate-200">Bank Cash Balance</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={cashBankBalance || ""} 
                        placeholder="$0.00"
                        onChange={e => setCashBankBalance(Number(e.target.value))} 
                        className="w-full text-right p-1 outline-none font-mono" 
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
                        className="w-full text-right p-1 outline-none font-mono font-bold" 
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

                  {/* Total Assets Row */}
                  <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-[#9fc5e8]">
                    <td className="p-2.5 font-sans border-r border-slate-300">Total</td>
                    <td className="p-2.5 font-sans border-r border-slate-300">Sum of all Assets</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(totalAssets)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Liabilities Table */}
          <div className="print-no-break space-y-2">
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
                        className="w-full text-right p-1 outline-none font-mono font-bold" 
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
                    <td className="p-2 font-sans font-semibold border-r border-slate-200">Taxes</td>
                    <td className="p-2 font-sans border-r border-slate-200">Withheld Withdrawal Taxes</td>
                    <td className="p-1 text-right">
                      <input 
                        type="number" 
                        step="0.01" 
                        value={liabTaxesWithheld || ""} 
                        placeholder="$0.00"
                        onChange={e => setLiabTaxesWithheld(Number(e.target.value))} 
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

                  {/* Total Liabilities Row */}
                  <tr className="bg-slate-50 font-bold text-slate-900 border-t-2 border-[#9fc5e8]">
                    <td className="p-2.5 font-sans border-r border-slate-300">Total</td>
                    <td className="p-2.5 font-sans border-r border-slate-300">Sum of all Liabilities</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(totalLiabilities)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Equity Table */}
          <div className="print-no-break space-y-2">
            <h3 className="font-bold text-[#1c3d5a] text-sm">Equity</h3>
            <div className="border border-[#9fc5e8] text-xs">
              <table className="w-full text-left border-collapse">
                <tbody>
                  <tr className="bg-white font-bold text-slate-900">
                    <td className="p-2.5 w-1/3 border-r border-[#9fc5e8] font-sans">Total</td>
                    <td className="p-2.5 w-1/3 border-r border-[#9fc5e8] font-sans">Total Assets - Total Liabilities</td>
                    <td className="p-2.5 w-1/3 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(totalEquity)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Certification Statement Sub-Box (Page 5 of PDF) */}
          <div className="print-no-break border border-[#9fc5e8] text-xs mt-8">
            <div className="bg-[#d9e8f5] p-2 font-bold text-[#1c3d5a] border-b border-[#9fc5e8]">
              Certification Statement
            </div>
            <div className="p-4 space-y-4">
              <p className="text-slate-900 font-medium leading-relaxed">
                I certify that the information contained in this report is accurate and complete to the best of my knowledge.
              </p>

              <div className="space-y-2 pt-2 border-t border-slate-200">
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
                      className="border-b border-slate-300 outline-none text-slate-900 w-40"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 shrink-0">Title:</span>
                    <input
                      type="text"
                      value={certTitle}
                      onChange={e => setCertTitle(e.target.value)}
                      className="border-b border-slate-300 outline-none text-slate-900 w-48"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 shrink-0">Date:</span>
                  <input
                    type="text"
                    value={certDate}
                    onChange={e => setCertDate(e.target.value)}
                    className="border-b border-slate-300 outline-none text-slate-900 w-32"
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
            Save the complete 5-page report with all corporate governance disclosures, income statements (including withdraw fees), loan & collateral schedules, balance sheets, and executive certification.
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
