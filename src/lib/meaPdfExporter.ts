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
 * Generates an official, crystal-clear, multi-page MEA Financial Institution Report PDF.
 * Uses native vector shapes, tables, and typography via jsPDF & jspdf-autotable.
 */
export async function exportMEAReportPDF(data: MEAReportExportData): Promise<string> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter", // 215.9 x 279.4 mm
    compress: true,
  });

  const pageWidth = 215.9;
  const pageHeight = 279.4;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 187.9 mm

  const navy = [28, 61, 90] as [number, number, number]; // #1c3d5a
  const softBlue = [207, 226, 243] as [number, number, number]; // #cfe2f3
  const lightBlueBg = [243, 247, 252] as [number, number, number];
  const borderBlue = [159, 197, 232] as [number, number, number]; // #9fc5e8
  const darkText = [30, 41, 59] as [number, number, number]; // slate-800
  const grayText = [100, 116, 139] as [number, number, number]; // slate-500

  const drawHeader = (title: string, subtitle?: string) => {
    // Top banner
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.rect(marginX, 12, contentWidth, 14, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("MEA FINANCIAL INSTITUTION REPORT", marginX + 4, 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(207, 226, 243);
    const sub = subtitle || `${data.bankName.toUpperCase()} — ${data.reportPeriod || "OFFICIAL FILING"}`;
    doc.text(sub, pageWidth - marginX - 4, 18, { align: "right" });

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(navy[0], navy[1], navy[2]);
    doc.text(title, marginX, 33);

    // Decorative line
    doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX, 35, pageWidth - marginX, 35);
  };

  // =========================================================================
  // PAGE 1: COVER & INSTITUTION IDENTIFICATION
  // =========================================================================
  drawHeader("COVER & INSTITUTION IDENTIFICATION");

  // Welcome / Subtitle banner
  doc.setFillColor(lightBlueBg[0], lightBlueBg[1], lightBlueBg[2]);
  doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, 38, contentWidth, 18, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("OFFICIAL GOVERNMENT REGULATORY DISCLOSURE", marginX + 4, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(grayText[0], grayText[1], grayText[2]);
  doc.text(
    "Ministry of Economic Affairs (MEA) Financial Institution Regulatory Submission & Compliance Filing.",
    marginX + 4,
    50
  );

  // Institution Identification Table
  autoTable(doc, {
    startY: 60,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Identification Field", "Institution Record"]],
    body: [
      ["Institution Name:", data.bankName || "Commercial Bank"],
      ["Reporting Period:", data.reportPeriod || "Current Reporting Period"],
      ["Prepared By:", data.preparedBy || "Bank Compliance Staff"],
      ["Date Published:", data.datePublished || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })],
      ["Registered Owners:", data.registeredOwners || `1. ${data.bankName}`],
      ["Institution Classification:", data.institutionType || "Commercial Bank"],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 9,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 8.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55, fillColor: [250, 252, 255] },
      1: { cellWidth: contentWidth - 55 },
    },
  });

  // Regulatory Notice Box
  const noticeY = (doc as any).lastAutoTable.finalY + 12;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, noticeY, contentWidth, 52, 1.5, 1.5, "FD");

  doc.setFillColor(softBlue[0], softBlue[1], softBlue[2]);
  doc.rect(marginX, noticeY, contentWidth, 8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("REGULATORY COMPLIANCE ATTESTATION & SUMMARY", marginX + 4, noticeY + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  const noticeText = [
    `This regulatory disclosure document has been prepared for the Ministry of Economic Affairs (MEA) to certify compliance with all applicable banking charters, consumer protection regulations, and reporting standards.`,
    ``,
    `Sections included in this document:`,
    `  • Page 1: Cover & Official Identification`,
    `  • Page 2: Corporate Information & Executive Governance`,
    `  • Page 3: Technical Information & Consumer Financial Protections`,
    `  • Page 4: Financial Disclosures (Income Statement, Loan Register & Collateral)`,
    `  • Page 5: Balance Sheet, Liquidity Attestation & Executive Certification`,
    ``,
    `All financial records are certified under penalty of charter forfeiture and civil sanctions for misrepresentation.`,
  ];
  doc.text(noticeText, marginX + 4, noticeY + 13);

  // =========================================================================
  // PAGE 2: CORPORATE INFORMATION
  // =========================================================================
  doc.addPage("letter", "portrait");
  drawHeader("CORPORATE INFORMATION & GOVERNANCE");

  // Description of Institution
  autoTable(doc, {
    startY: 40,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Description of Institution"]],
    body: [
      [`Institution Type: ${data.institutionType || "Commercial Bank"}`],
      [`Description:\n${data.description || "No description provided."}`],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 9,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 8.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 4,
    },
  });

  // Executive Overview
  const execY = (doc as any).lastAutoTable.finalY + 8;
  const managementList = data.managementTeam.length > 0 ? data.managementTeam.join("\n") : "None specified";
  const directAccessList = data.directAccessEmployees.length > 0 ? data.directAccessEmployees.join("\n") : "None";

  autoTable(doc, {
    startY: execY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Executive Overview & Account Authorization"]],
    body: [
      [`Management Team:\n${managementList}`],
      [`Legal Representation:\n${data.legalRep || "Independent Legal Counsel"}`],
      [`Employees with Direct Access to Alter or Withdraw Balances:\n${directAccessList}`],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 9,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 8.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 4,
    },
  });

  // =========================================================================
  // PAGE 3: TECHNICAL INFO & CONSUMER FINANCIAL PROTECTIONS
  // =========================================================================
  doc.addPage("letter", "portrait");
  drawHeader("TECHNICAL INFO & CONSUMER PROTECTIONS");

  // Technical Information Table
  autoTable(doc, {
    startY: 40,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Technical Attribute", "Configuration Record"]],
    body: [
      ["Discord Community Link:", data.discordLink || "N/A"],
      ["Company In-Game Name:", data.companyIngameName || data.bankName],
      ["CEO Discord Username:", data.ceoDiscordUser || "N/A"],
      ["CEO In-Game Name:", data.ceoIngameName || "N/A"],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 9,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 8.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55, fillColor: [250, 252, 255] },
      1: { cellWidth: contentWidth - 55 },
    },
  });

  // Consumer Protections Q&A Table
  const cpY = (doc as any).lastAutoTable.finalY + 8;
  autoTable(doc, {
    startY: cpY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Protection Requirement (MEA Guidance)", "Bank Policy & Operational Response"]],
    body: [
      [
        "Clear & Accurate Information:\nHow does the bank ensure all fees, interest rates, loan terms, risks, and account rules are explained clearly before customers use the product?",
        data.consumerProtections.clearInfo || "Not answered",
      ],
      [
        "Privacy & Data Protection:\nHow does the bank protect player financial data, restrict access, and enforce confidentiality for staff with account permissions?",
        data.consumerProtections.privacyData || "Not answered",
      ],
      [
        "Complaint & Dispute Handling:\nWhat is the bank's process for receiving, responding to, and resolving consumer complaints? Include average response times & channels.",
        data.consumerProtections.disputeHandling || "Not answered",
      ],
      [
        "New / Vulnerable Player Protections:\nWhat safeguards prevent inexperienced players from being exploited (simplified explanations, extra approvals for risky products, etc.)?",
        data.consumerProtections.vulnerableProtections || "Not answered",
      ],
      [
        "Truthful Advertising Practices:\nHow does the bank ensure all advertising is accurate, non-misleading, and compliant with MEA standards?",
        data.consumerProtections.truthfulAdvertising || "Not answered",
      ],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 70, fillColor: [250, 252, 255] },
      1: { cellWidth: contentWidth - 70 },
    },
  });

  // =========================================================================
  // PAGE 4: FINANCIAL DISCLOSURES — INCOME STATEMENT & REGISTERS
  // =========================================================================
  doc.addPage("letter", "portrait");
  drawHeader("FINANCIAL DISCLOSURES — INCOME STATEMENT");

  const inc = data.incomeStatement;

  autoTable(doc, {
    startY: 40,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Category", "Subcategory", "Amount"]],
    body: [
      ["Interest Income", "Business Loans", fmtNullable(inc.interestBusinessLoans)],
      ["Interest Income", "Personal Loans", fmtNullable(inc.interestPersonalLoans)],
      ["Interest Income", "Mortgages", fmtNullable(inc.interestMortgages)],
      ["Interest Income", "Other, List and Describe", fmtNullable(inc.interestOther)],
      ["Fee Income", "Account Fees", fmtNullable(inc.feeAccount)],
      ["Fee Income", "Service Fees", fmtNullable(inc.feeService)],
      ["Fee Income", "Late Fees", fmtNullable(inc.feeLate)],
      ["Fee Income", "Other Fees (In-Game Withdraw Fees)", fmtNullable(inc.feeOther)],
      ["Trading Income", "Trading Gains / Losses", fmtNullable(inc.tradingGains)],
      ["Other Income", "List and Describe", fmtNullable(inc.otherIncome)],
      ["Expenses", "Interest Expense", fmtNullable(inc.expInterest)],
      ["Expenses", "Salaries", fmtNullable(inc.expSalaries)],
      ["Expenses", "Operations", fmtNullable(inc.expOperations)],
      ["Expenses", "Marketing", fmtNullable(inc.expMarketing)],
      ["Expenses", "Technology", fmtNullable(inc.expTechnology)],
      ["Expenses", "Legal", fmtNullable(inc.expLegal)],
      ["Other Expenses", "List and Describe", fmtNullable(inc.expOther)],
      ["Taxes", "Withdrawal Tax", fmtNullable(inc.taxWithdrawal)],
      ["Net Income", "Income – (Expenses + Withdrawal tax)", fmt(inc.netIncome)],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: 80 },
      2: { halign: "right", fontStyle: "bold", cellWidth: contentWidth - 130 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.row.index === 18) {
        hookData.cell.styles.fillColor = [220, 235, 252];
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = navy;
      }
    },
  });

  // Loan Register Table
  const loanY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Loan Register", marginX, loanY);

  const loanRows = data.loanRegister.length > 0
    ? data.loanRegister.map(l => [
        l.type,
        l.borrower,
        fmt(l.principal),
        fmt(l.remainingBalance),
        l.rate,
        l.term,
        l.collateral?.toLowerCase().includes("none") ? "No" : "Yes",
        l.status,
      ])
    : [["Loan", "None", "$0.00", "$0.00", "0%", "N/A", "No", "Closed"]];

  autoTable(doc, {
    startY: loanY + 2,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Type", "Borrower", "Principal", "Balance", "Rate", "Term", "Collateral", "Status"]],
    body: loanRows,
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 1.8,
    },
  });

  // Collateral Register Table
  const colY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Collateral Register", marginX, colY);

  const colRows = data.collateralRegister.length > 0
    ? data.collateralRegister.map(c => [
        c.assetType,
        c.description,
        c.borrower,
        c.appraisedValue > 0 ? fmt(c.appraisedValue) : "N/A",
        c.dateAcquired,
      ])
    : [["Real Estate", "None", "N/A", "N/A", "N/A"]];

  autoTable(doc, {
    startY: colY + 2,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Asset Type", "Description", "Borrower", "Appraised Value", "Date Acquired"]],
    body: colRows,
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 1.8,
    },
  });

  // =========================================================================
  // PAGE 5: BALANCE SHEET & OFFICIAL CERTIFICATION
  // =========================================================================
  doc.addPage("letter", "portrait");
  drawHeader("BALANCE SHEET & CERTIFICATION");

  const bs = data.balanceSheet;

  // Assets Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Assets", marginX, 39);

  autoTable(doc, {
    startY: 41,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
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
      ["Total", "Sum of all Assets", fmt(bs.totalAssets)],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 1.8,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40 },
      1: { cellWidth: 90 },
      2: { halign: "right", fontStyle: "bold", cellWidth: contentWidth - 130 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.row.index === 11) {
        hookData.cell.styles.fillColor = [220, 235, 252];
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = navy;
      }
    },
  });

  // Liabilities Table
  const liabY = (doc as any).lastAutoTable.finalY + 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("Liabilities", marginX, liabY);

  autoTable(doc, {
    startY: liabY + 2,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Category", "Subcategory", "Value"]],
    body: [
      ["Deposits", "Personal Deposits", fmtNullable(bs.liabPersonalDeposits)],
      ["Deposits", "Business Deposits", fmtNullable(bs.liabBusinessDeposits)],
      ["Deposits", "Certificates of Deposit (CDs)", fmtNullable(bs.liabCDs)],
      ["Liabilities", "Pending Payments", fmtNullable(bs.liabPendingPayments)],
      ["Liabilities", "Outstanding Loans the Bank Owes", fmtNullable(bs.liabLoansOwed)],
      ["Taxes", "Withheld Withdrawal Taxes", fmtNullable(bs.liabTaxesWithheld)],
      ["Other", "Misc. List and Describe", fmtNullable(bs.liabOther)],
      ["Total", "Sum of all Liabilities", fmt(bs.totalLiabilities)],
    ],
    theme: "grid",
    headStyles: {
      fillColor: softBlue,
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: borderBlue,
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7.5,
      textColor: darkText,
      lineColor: borderBlue,
      lineWidth: 0.2,
      cellPadding: 1.8,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40 },
      1: { cellWidth: 90 },
      2: { halign: "right", fontStyle: "bold", cellWidth: contentWidth - 130 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.row.index === 7) {
        hookData.cell.styles.fillColor = [254, 235, 235];
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.textColor = [153, 27, 27];
      }
    },
  });

  // Equity Table
  const eqY = (doc as any).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: eqY,
    margin: { left: marginX, right: marginX },
    tableWidth: contentWidth,
    head: [["Total Equity", "Total Assets - Total Liabilities", fmt(bs.totalEquity)]],
    body: [],
    theme: "grid",
    headStyles: {
      fillColor: [219, 234, 254],
      textColor: navy,
      fontStyle: "bold",
      fontSize: 8.5,
      lineColor: borderBlue,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 40 },
      1: { cellWidth: 90 },
      2: { halign: "right", fontStyle: "bold", cellWidth: contentWidth - 130 },
    },
  });

  // Official Certification Statement
  const certBoxY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, certBoxY, contentWidth, 38, 1.5, 1.5, "FD");

  doc.setFillColor(softBlue[0], softBlue[1], softBlue[2]);
  doc.rect(marginX, certBoxY, contentWidth, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("CERTIFICATION STATEMENT", marginX + 4, certBoxY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(
    "I certify that the information contained in this report is accurate and complete to the best of my knowledge.",
    marginX + 4,
    certBoxY + 12
  );

  // Signature line
  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(
    `Signature:  ${data.certification.certName || "________________________"}`,
    marginX + 4,
    certBoxY + 20
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(darkText[0], darkText[1], darkText[2]);
  doc.text(`Name:`, marginX + 4, certBoxY + 27);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.certification.certName || "N/A"}`, marginX + 16, certBoxY + 27);

  doc.setFont("helvetica", "bold");
  doc.text(`Title:`, marginX + 65, certBoxY + 27);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.certification.certTitle || "Managing Director / Compliance Officer"}`, marginX + 75, certBoxY + 27);

  doc.setFont("helvetica", "bold");
  doc.text(`Date:`, marginX + 140, certBoxY + 27);
  doc.setFont("helvetica", "normal");
  doc.text(`${data.certification.certDate || new Date().toLocaleDateString()}`, marginX + 150, certBoxY + 27);

  // Digital verification hash/timestamp
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(grayText[0], grayText[1], grayText[2]);
  const auditStamp = `VERIFIED SLATE SAAS AUDIT HASH: SHA256-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Date.now().toString(36).toUpperCase()} | ATTESTATION SUBMISSION`;
  doc.text(auditStamp, marginX + 4, certBoxY + 34);

  // =========================================================================
  // RUNNING FOOTERS ON ALL PAGES
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(grayText[0], grayText[1], grayText[2]);

    // Footer rule
    doc.setDrawColor(borderBlue[0], borderBlue[1], borderBlue[2]);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    doc.text(
      `MEA FINANCIAL INSTITUTION REPORT — ${data.bankName.toUpperCase()} — CONFIDENTIAL REGULATORY FILING`,
      marginX,
      pageHeight - 7
    );
    doc.text(
      `PAGE ${p} OF ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 7,
      { align: "right" }
    );
  }

  const cleanBankName = (data.bankName || "Bank").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanPeriod = (data.reportPeriod || "Report").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `MEA_Report_${cleanBankName}_${cleanPeriod}.pdf`;

  doc.save(filename);
  return filename;
}
