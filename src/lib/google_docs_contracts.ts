/**
 * Google Docs Contract Integration Service
 * Generates configurable legal contract templates and Google Doc contract links for Loans, Credit Accounts, and Escrow.
 */

export interface ContractContext {
  bankName: string;
  clientDiscordId: string;
  contractType: 'loan' | 'credit' | 'escrow';
  contractId: string;
  amount: number; // in cents
  interestRate?: number; // e.g. 500 for 5.00%
  termDays?: number;
  purpose?: string;
  buyerAccountId?: string;
  sellerAccountId?: string;
  date?: string;
}

export function generateContractUrl(
  templateUrl: string | null | undefined,
  context: ContractContext
): string {
  const dateStr = context.date || new Date().toISOString().split('T')[0];
  const amountFormatted = `$${(context.amount / 100).toFixed(2)}`;
  const rateFormatted = context.interestRate !== undefined ? `${(context.interestRate / 100).toFixed(2)}%` : 'N/A';

  if (templateUrl && templateUrl.trim().length > 0) {
    let url = templateUrl.trim();
    // Replace custom tags if template link supports params or standard doc copy
    url = url
      .replace(/\{BANK_NAME\}/g, encodeURIComponent(context.bankName))
      .replace(/\{CLIENT_DISCORD\}/g, encodeURIComponent(context.clientDiscordId))
      .replace(/\{AMOUNT\}/g, encodeURIComponent(amountFormatted))
      .replace(/\{INTEREST_RATE\}/g, encodeURIComponent(rateFormatted))
      .replace(/\{CONTRACT_ID\}/g, encodeURIComponent(context.contractId))
      .replace(/\{DATE\}/g, encodeURIComponent(dateStr));
    return url;
  }

  // Default generated Slate Google Docs Contract Viewer link
  const query = new URLSearchParams({
    bank: context.bankName,
    client: context.clientDiscordId,
    type: context.contractType,
    id: context.contractId,
    amount: amountFormatted,
    rate: rateFormatted,
    purpose: context.purpose || 'General Financial Contract',
    date: dateStr
  });

  return `https://docs.google.com/document/d/e/2PACX-1vTemplateDocPlaceholder/pub?${query.toString()}`;
}
