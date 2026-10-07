import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface MEAReportExportData {
  bankName: string;
  reportPeriod: string;
  preparedBy: string;
  datePublished: string;
  registeredOwners: string;
  institutionType: string;
  description: string;
  managementTeam: string[];
  legalRep: string;
  directAccessEmployees: string[];
  discordLink: string;
  companyIngameName: string;
  ceoDiscordUser: string;
  ceoIngameName: string;
  consumerProtections: {
    clearInfo: string;
    privacyData: string;
    disputeHandling: string;
    vulnerableProtections: string;
    truthfulAdvertising: string;
  };
  creditUnionGovernance?: {
    governanceType: string;
    leadership: string;
    profitRetention: string;
    profitDistribution: string;
  };
  incomeStatement: {
    interestBusinessLoans: number;
    interestPersonalLoans: number;
    interestMortgages: number;
    interestOther: number;
    feeAccount: number;
    feeService: number;
    feeLate: number;
    feeOther: number;
    tradingGains: number;
    otherIncome: number;
    expInterest: number;
    expSalaries: number;
    expOperations: number;
    expMarketing: number;
    expTechnology: number;
    expLegal: number;
    expOther: number;
    taxWithdrawal: number;
    totalInterestIncome: number;
    totalFeeIncome: number;
    totalGrossIncome: number;
    totalExpenses: number;
    netIncome: number;
  };
  loanRegister: Array<{
    type: string;
    borrower: string;
    principal: number;
    remainingBalance: number;
    rate: string;
    term: string;
    collateral: string;
    status: string;
  }>;
  collateralRegister: Array<{
    assetType: string;
    description: string;
    borrower: string;
    appraisedValue: number;
    dateAcquired: string;
  }>;
  balanceSheet: {
    cashBankBalance: number;
    cashDepositsHeld: number;
    assetBusinessLoans: number;
    assetPersonalLoans: number;
    assetMortgages: number;
    assetCollateralPlots: number;
    assetCollateralItems: number;
    assetRealEstatePlots: number;
    assetInventory: number;
    assetReceivables: number;
    assetOther: number;
    totalAssets: number;
    liabPersonalDeposits: number;
    liabBusinessDeposits: number;
    liabCDs: number;
    liabPendingPayments: number;
    liabLoansOwed: number;
    liabTaxesWithheld: number;
    liabOther: number;
    totalLiabilities: number;
    totalEquity: number;
  };
  investmentProducts?: Array<{
    name: string;
    type: string;
    totalValue: number;
    investorsCount: number;
    riskLevel: string;
    quarterlyReturn: string;
    notes: string;
  }>;
  accountsAuditList?: Array<{
    holder: string;
    type: string;
    balance: number;
  }>;
  certification: {
    certName: string;
    certTitle: string;
    certDate: string;
  };
}

function fmt(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function fmtNullable(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount) || amount === 0) return "";
  return fmt(amount);
}

/**
 * Generates an official, publication-grade MEA Financial Institution Report PDF
 * matching 100% the official 5-page template specifications.
 */
export async function exportMEAReportPDF(data: MEAReportExportData): Promise<string> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter", // 215.9 x 279.4 mm
    compress: true,
  });

  const pageWidth = 215.9;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 187.9 mm

  const navy = [28, 61, 90] as [number, number, number];       // #1c3d5a
  const softBlue = [207, 226, 243] as [number, number, number]; // #cfe2f3
  const borderBlue = [159, 197, 232] as [number, number, number]; // #9fc5e8
  const tableBg = [255, 255, 255] as [number, number, number];
  const darkText = [20, 20, 20] as [number, number, number];

  // Helper to draw horizontal section line
  const drawRule = (y: number) => {
    doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, marginX + contentWidth, y);
  };

  // =========================================================================
  // PAGE 1: MEA FINANCIAL INSTITUTION REPORT & CORPORATE INFORMATION
  // =========================================================================

  // 1. Centered Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("MEA FINANCIAL INSTITUTION REPORT", pageWidth / 2, 20, { align: "center" });
  drawRule(23);

  // 2. Identification Table
  let formattedOwners = "1. [Name]\n2. [Name]\n3. [Name]\n4. [Name]";
  if (data.registeredOwners && data.registeredOwners.trim()) {
    const rawOwners = data.registeredOwners.split(",").map(o => o.trim()).filter(Boolean);
    if (rawOwners.length > 0) {
      formattedOwners = rawOwners.map((o, idx) => `${idx + 1}. ${o.replace(/^\d+\.\s*/, '')}`).join("\n");
    }
  }

  autoTable(doc, {
    startY: 27,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 8.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      font: "helvetica",
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: navy, fillColor: softBlue, cellWidth: 50 },
      1: { fillColor: [248, 251, 254], cellWidth: contentWidth - 50 },
    },
    body: [
      ["Institution Name:", data.bankName || "[Bank Name]"],
      ["Reporting Period:", data.reportPeriod || "[Month, Year]"],
      ["Prepared By:", data.preparedBy || "[Name]"],
      ["Date Published:", data.datePublished || "[Date]"],
      ["Registered Owners:", formattedOwners],
    ],
  });

  let curY = (doc as any).lastAutoTable.finalY + 5;

  // 3. Logo Placeholder / Text
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(60, 110, 160);
  doc.text("[Company Logo - Optional]", pageWidth / 2, curY + 3, { align: "center" });
  curY += 7;
  drawRule(curY);
  curY += 6;

  // 4. Section: CORPORATE INFORMATION
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("CORPORATE INFORMATION", marginX, curY);
  curY += 3;

  // Outer Box for Corporate Information matching Template
  const boxTopY = curY;
  const boxWidth = contentWidth;

  // Sub-box 1: Description of Institution
  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2.5, right: 2.5 },
      textColor: darkText,
      font: "helvetica",
    },
    head: [[
      {
        content: "Description of Institution",
        styles: { fontStyle: "bold", fontSize: 8.5, textColor: navy, fillColor: softBlue }
      }
    ]],
    body: [
      [`Institution Type: [${data.institutionType || "Commercial Bank / Credit Union / Investment Bank"}]`],
      [`Description: ${data.description || "[Provide a brief description of the institution's primary business activities, market focus, and operational scope.]"}`]
    ]
  });

  curY = (doc as any).lastAutoTable.finalY + 2;

  // Sub-box 2: Executive Overview
  const mgmtList = (data.managementTeam && data.managementTeam.length > 0)
    ? data.managementTeam.join(", ")
    : "[List key executives and their roles]";
  const accessList = (data.directAccessEmployees && data.directAccessEmployees.length > 0)
    ? data.directAccessEmployees.join(", ")
    : "[List of authorized employees]";

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2.5, right: 2.5 },
      textColor: darkText,
      font: "helvetica",
    },
    head: [[
      {
        content: "Executive Overview",
        styles: { fontStyle: "bold", fontSize: 8.5, textColor: navy, fillColor: softBlue }
      }
    ]],
    body: [
      [`Management Team:\n${mgmtList}`],
      [`Legal Representation:\n${data.legalRep || "[Name of designated bank lawyer or legal retainer, if applicable]"}`],
      [`A list of names of employees who have direct access to alter or withdraw from account balances, or the bank's balance:\n${accessList}`]
    ]
  });

  curY = (doc as any).lastAutoTable.finalY + 2;

  // Sub-box 3: Technical Information
  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2.5, right: 2.5 },
      textColor: darkText,
      font: "helvetica",
    },
    head: [[
      {
        content: "Technical Information",
        styles: { fontStyle: "bold", fontSize: 8.5, textColor: navy, fillColor: softBlue }
      }
    ]],
    body: [
      [`Discord Link or In-Game Location: ${data.discordLink || "[Required]"}`],
      [`Company In-Game Name: ${data.companyIngameName || "[Required]"}`],
      [`CEO Discord Username: ${data.ceoDiscordUser || "[Required]"}`],
      [`CEO In-Game Name: ${data.ceoIngameName || "[Required]"}`]
    ]
  });

  const boxBottomY = (doc as any).lastAutoTable.finalY;
  // Draw clean outer border for Corporate Information Box
  doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
  doc.setLineWidth(0.4);
  doc.rect(marginX, boxTopY, boxWidth, boxBottomY - boxTopY);

  // =========================================================================
  // PAGE 2: CONSUMER FINANCIAL PROTECTIONS & GOVERNANCE
  // =========================================================================
  doc.addPage();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Consumer Financial Protections", marginX, 20);
  drawRule(23);

  autoTable(doc, {
    startY: 27,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 8,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 75, fontStyle: "normal" },
      1: { cellWidth: contentWidth - 75 },
    },
    head: [["Protection Requirement (Guidance)", "Bank Response"]],
    body: [
      [
        "Clear & Accurate Information:\nHow does the bank ensure all fees, interest rates, loan terms, risks, and account rules are explained clearly before customers use the product?",
        data.consumerProtections?.clearInfo || "All fee schedules, loan terms, and account rules are transparently disclosed prior to transaction completion."
      ],
      [
        "Privacy & Data Protection:\nHow does the bank protect player financial data, restrict access, and enforce confidentiality for staff with account permissions?",
        data.consumerProtections?.privacyData || "Role-based access controls strictly limit ledger modification permissions to vetted personnel with permanent audit logging."
      ],
      [
        "Complaint & Dispute Handling:\nWhat is the bank’s process for receiving, responding to, and resolving consumer complaints? Include average response times & channels.",
        data.consumerProtections?.disputeHandling || "Consumer disputes are resolved within 24 to 48 hours via official support channels and dedicated staff review."
      ],
      [
        "New/Vulnerable Player Protections:\nWhat safeguards prevent inexperienced players from being exploited (simplified explanations, extra approvals for risky products, etc.)?",
        data.consumerProtections?.vulnerableProtections || "Conservative borrowing limits, explicit warnings, and simplified explanations protect novice players."
      ],
      [
        "Truthful Advertising Practices:\nHow does the bank ensure all advertising is accurate, non-misleading, and compliant with MEA standards?",
        data.consumerProtections?.truthfulAdvertising || "Promotional materials clearly state effective rates and conditions without hidden fees."
      ],
    ],
  });

  curY = (doc as any).lastAutoTable.finalY + 10;

  // Credit Union Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Governance & Compliance - Credit Unions Only", marginX, curY);
  curY += 4;

  const cuGov = data.creditUnionGovernance;
  const isCU = (data.institutionType || "").toLowerCase().includes("credit union");

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 8,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      font: "helvetica",
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: navy, cellWidth: 75, fillColor: [248, 251, 254] },
      1: { cellWidth: contentWidth - 75 },
    },
    body: [
      [
        "Required Governance Type (President < $200k deposits / Board ≥ $200k deposits)",
        cuGov?.governanceType || (isCU ? "President (< $200k deposits)" : "N/A - Commercial Bank")
      ],
      [
        "Current Leadership (President / Board of Directors)",
        cuGov?.leadership || (isCU ? data.ceoIngameName || "President" : "N/A - Commercial Bank")
      ],
      [
        "Profit Retention % (Max 10% per month)",
        cuGov?.profitRetention || (isCU ? "10% Retained" : "N/A - Commercial Bank")
      ],
      [
        "How Remaining Profits Were Returned/Used for Members",
        cuGov?.profitDistribution || (isCU ? "Distributed as Member Dividend / APY" : "N/A - Commercial Bank")
      ],
    ],
  });

  // =========================================================================
  // PAGE 3: FINANCIAL DISCLOSURES (INCOME STATEMENT, LOANS, COLLATERAL)
  // =========================================================================
  doc.addPage();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("FINANCIAL DISCLOSURES", marginX, 20);
  drawRule(23);

  // Income Statement
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Income Statement", marginX, 29);

  const is = data.incomeStatement;

  autoTable(doc, {
    startY: 32,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7.2,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.2, bottom: 1.2, left: 2.5, right: 2.5 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", textColor: navy },
      1: { cellWidth: 85 },
      2: { cellWidth: contentWidth - 135, halign: "right", font: "courier" },
    },
    head: [["Category", "Subcategory", "Amount"]],
    body: [
      ["Interest Income", "Business Loans", fmtNullable(is.interestBusinessLoans)],
      ["Interest Income", "Personal Loans", fmtNullable(is.interestPersonalLoans)],
      ["Interest Income", "Mortgages", fmtNullable(is.interestMortgages)],
      ["Interest Income", "Other, List and Describe", fmtNullable(is.interestOther)],
      ["Fee Income", "Account Fees", fmtNullable(is.feeAccount)],
      ["Fee Income", "Service Fees", fmtNullable(is.feeService)],
      ["Fee Income", "Late Fees", fmtNullable(is.feeLate)],
      ["Fee Income", "Other Fees", fmtNullable(is.feeOther)],
      ["Trading Income", "Trading Gains/Losses", fmtNullable(is.tradingGains)],
      ["Other Income", "List and Describe", fmtNullable(is.otherIncome)],
      ["Expenses", "Interest Expense", fmtNullable(is.expInterest)],
      ["Expenses", "Salaries", fmtNullable(is.expSalaries)],
      ["Expenses", "Operations", fmtNullable(is.expOperations)],
      ["Expenses", "Marketing", fmtNullable(is.expMarketing)],
      ["Expenses", "Technology", fmtNullable(is.expTechnology)],
      ["Expenses", "Legal", fmtNullable(is.expLegal)],
      ["Other Expenses", "List and Describe", fmtNullable(is.expOther)],
      ["Taxes", "Withdrawal Tax", fmtNullable(is.taxWithdrawal)],
      [
        { content: "Net Income", styles: { fontStyle: "bold", fillColor: softBlue } },
        { content: "Income – (Expenses + Withdrawal tax)", styles: { fontStyle: "bold", fillColor: softBlue } },
        { content: fmt(is.netIncome), styles: { fontStyle: "bold", fillColor: softBlue, textColor: is.netIncome < 0 ? [180, 20, 20] : navy } },
      ],
    ],
  });

  curY = (doc as any).lastAutoTable.finalY + 6;

  // Loan Register Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Loan Register", marginX, curY);
  curY += 3;

  // Build Loan Register Table rows (pad with blank rows if few/none to match template)
  const loanRows: any[] = (data.loanRegister || []).map(l => [
    l.type,
    l.borrower,
    fmt(l.principal),
    fmt(l.remainingBalance),
    l.rate,
    l.term,
    l.collateral,
    l.status
  ]);

  while (loanRows.length < 4) {
    loanRows.push(["", "", "", "", "", "", "", ""]);
  }

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 32 },
      2: { cellWidth: 22, halign: "right", font: "courier" },
      3: { cellWidth: 24, halign: "right", font: "courier" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 22, halign: "center" },
      6: { cellWidth: 26, halign: "center" },
      7: { cellWidth: contentWidth - 162, halign: "center" },
    },
    head: [["Type", "Borrower", "Principal", "Remaining Balance", "Rate", "Term", "Collateral (Yes or No)", "Status"]],
    body: loanRows,
  });

  curY = (doc as any).lastAutoTable.finalY + 6;

  // Collateral Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Collateral", marginX, curY);
  curY += 3;

  const colRows: any[] = (data.collateralRegister || []).map(c => [
    c.assetType,
    c.description,
    c.borrower,
    fmt(c.appraisedValue),
    c.dateAcquired
  ]);

  while (colRows.length < 3) {
    colRows.push(["", "", "", "", ""]);
  }

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 55 },
      2: { cellWidth: 35 },
      3: { cellWidth: 32, halign: "right", font: "courier" },
      4: { cellWidth: contentWidth - 157, halign: "center" },
    },
    head: [["Asset Type", "Description", "Borrower", "Appraised Value", "Date Acquired"]],
    body: colRows,
  });

  // =========================================================================
  // PAGE 4: BALANCE SHEET & INVESTMENT PRODUCTS (TOP)
  // =========================================================================
  doc.addPage();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Balance Sheet", marginX, 20);
  drawRule(23);

  const bs = data.balanceSheet;

  // Assets Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Assets", marginX, 29);

  autoTable(doc, {
    startY: 32,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7.2,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.1, bottom: 1.1, left: 2.5, right: 2.5 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.8,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", textColor: navy },
      1: { cellWidth: 85 },
      2: { cellWidth: contentWidth - 135, halign: "right", font: "courier" },
    },
    head: [["Category", "Subcategory", "Value"]],
    body: [
      ["Cash", "Bank Cash Balance", fmtNullable(bs.cashBankBalance)],
      ["Cash", "Total Deposits Held", fmtNullable(bs.cashDepositsHeld)],
      ["Loans", "Business Loans", fmtNullable(bs.assetBusinessLoans)],
      ["Loans", "Personal Loans", fmtNullable(bs.assetPersonalLoans)],
      ["Loans", "Mortgages", fmtNullable(bs.assetMortgages)],
      ["Collateral", "Plots", fmtNullable(bs.assetCollateralPlots)],
      ["Collateral", "Items / Other", fmtNullable(bs.assetCollateralItems)],
      ["Real Estate", "Plots", fmtNullable(bs.assetRealEstatePlots)],
      ["Inventory", "Bank-Owned Materials", fmtNullable(bs.assetInventory)],
      ["Receivables", "Pending Payments", fmtNullable(bs.assetReceivables)],
      ["Other", "Misc. List and Describe", fmtNullable(bs.assetOther)],
      [
        { content: "Total", styles: { fontStyle: "bold", fillColor: softBlue } },
        { content: "Sum of all Assets", styles: { fontStyle: "bold", fillColor: softBlue } },
        { content: fmt(bs.totalAssets), styles: { fontStyle: "bold", fillColor: softBlue } },
      ],
    ],
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // Liabilities Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Liabilities", marginX, curY);
  curY += 3;

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7.2,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.1, bottom: 1.1, left: 2.5, right: 2.5 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.8,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", textColor: navy },
      1: { cellWidth: 85 },
      2: { cellWidth: contentWidth - 135, halign: "right", font: "courier" },
    },
    head: [["Category", "Subcategory", "Value"]],
    body: [
      ["Deposits", "Personal Deposits", fmtNullable(bs.liabPersonalDeposits)],
      ["Deposits", "Business Deposits", fmtNullable(bs.liabBusinessDeposits)],
      ["Deposits", "Certificates of Deposit (CDs)", fmtNullable(bs.liabCDs)],
      ["Liabilities", "Pending Payments", fmtNullable(bs.liabPendingPayments)],
      ["Liabilities", "Outstanding Loans the Bank Owes", fmtNullable(bs.liabLoansOwed)],
      ["Other", "Misc. List and Describe", fmtNullable(bs.liabOther)],
      [
        { content: "Total", styles: { fontStyle: "bold", fillColor: softBlue } },
        { content: "Sum of all Liabilities", styles: { fontStyle: "bold", fillColor: softBlue } },
        { content: fmt(bs.totalLiabilities), styles: { fontStyle: "bold", fillColor: softBlue } },
      ],
    ],
  });

  curY = (doc as any).lastAutoTable.finalY + 4;

  // Equity Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Equity", marginX, curY);
  curY += 3;

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7.2,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.1, bottom: 1.1, left: 2.5, right: 2.5 },
      font: "helvetica",
    },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", textColor: navy, fillColor: softBlue },
      1: { cellWidth: 85, fontStyle: "bold", fillColor: softBlue },
      2: { cellWidth: contentWidth - 135, halign: "right", fontStyle: "bold", fillColor: softBlue, font: "courier" },
    },
    body: [
      ["Total", "Total Assets - Total Liabilities", fmt(bs.totalEquity)],
    ],
  });

  curY = (doc as any).lastAutoTable.finalY + 6;

  // Investment Products and Funds Disclosure (Top rows on Page 4 matching template)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Investment Products and Funds Disclosure", marginX, curY);
  curY += 3;

  const invList = (data.investmentProducts || []).map(p => [
    p.name,
    p.type,
    fmt(p.totalValue),
    String(p.investorsCount || 0),
    p.riskLevel,
    p.quarterlyReturn,
    p.notes
  ]);

  const p4InvRows = [
    invList[0] || ["", "", "", "", "", "", ""],
    invList[1] || ["", "", "", "", "", "", ""],
  ];

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.2,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 26 },
      2: { cellWidth: 26, halign: "right", font: "courier" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 24, halign: "center" },
      6: { cellWidth: contentWidth - 148 },
    },
    head: [["Product / Fund Name", "Type (ETF, Bond, Fund, Other)", "Total Value Under Mgmt.", "# of Investors", "Risk Level", "Quarterly Return %", "Notes"]],
    body: p4InvRows,
  });

  // =========================================================================
  // PAGE 5: INVESTMENT CONTINUATION, AUDIT ACCOUNTS LIST & CERTIFICATION
  // =========================================================================
  doc.addPage();

  // Continuation of Investment Products table at the very top of Page 5 (matching screenshot!)
  const p5InvRows = [
    invList[2] || ["", "", "", "", "", "", ""],
    invList[3] || ["", "", "", "", "", "", ""],
    invList[4] || ["", "", "", "", "", "", ""],
  ];

  autoTable(doc, {
    startY: 18,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
      font: "helvetica",
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 26 },
      2: { cellWidth: 26, halign: "right", font: "courier" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 24, halign: "center" },
      6: { cellWidth: contentWidth - 148 },
    },
    body: p5InvRows,
  });

  curY = (doc as any).lastAutoTable.finalY + 8;

  // Accounts List - For Audits Only
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Accounts List - For Audits Only", marginX, curY);
  curY += 3;

  const auditRows: any[] = (data.accountsAuditList || []).map(a => [
    a.holder,
    a.type,
    fmt(a.balance)
  ]);

  while (auditRows.length < 14) {
    auditRows.push(["", "", ""]);
  }

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    theme: "grid",
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.3,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2.5, right: 2.5 },
      font: "helvetica",
    },
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 50 },
      2: { cellWidth: contentWidth - 120, halign: "right", font: "courier" },
    },
    head: [[
      "Account Holder\n(May be pseudoanonymized but all accounts by same person should have same code)",
      "Account Type",
      "Balance"
    ]],
    body: auditRows,
  });

  curY = (doc as any).lastAutoTable.finalY + 8;

  // Certification Statement Box (matching Screenshot Page 5)
  const cert = data.certification;
  const certBoxWidth = contentWidth;

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    tableWidth: certBoxWidth,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: darkText,
      font: "helvetica",
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    head: [[
      {
        content: "Certification Statement",
        styles: { fontStyle: "bold", fontSize: 9, textColor: navy, fillColor: softBlue }
      }
    ]],
    body: [
      [
        {
          content: "I certify that the information contained in this report is accurate and complete to the best of my knowledge.",
          styles: { fontStyle: "bold", textColor: navy, fillColor: [248, 251, 254] }
        }
      ],
      [
        {
          content: `Signature:  /s/ ${cert?.certName || data.ceoIngameName || data.preparedBy || "Authorized Signatory"}\n\nName: ${cert?.certName || data.ceoIngameName || data.preparedBy || "Bank Officer"}          Title: ${cert?.certTitle || "Managing Director / Compliance Officer"}\nDate: ${cert?.certDate || data.datePublished || "Official Submission"}`,
          styles: { fillColor: [255, 255, 255], textColor: darkText }
        }
      ]
    ]
  });

  // Draw border around Certification Box
  const certEnd = (doc as any).lastAutoTable.finalY;
  doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
  doc.setLineWidth(0.4);
  doc.rect(marginX, curY, certBoxWidth, certEnd - curY);

  // Return generated PDF filename
  const cleanBankName = data.bankName.replace(/[^a-zA-Z0-9]/g, "_");
  const cleanPeriod = (data.reportPeriod || "Report").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `MEA_Financial_Report_${cleanBankName}_${cleanPeriod}.pdf`;

  doc.save(filename);
  return filename;
}
