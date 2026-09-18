export async function processYieldsAndAutomations(_targetBankId?: string) {
  // Savings APY is owned by the hourly interest cron + Interest page "Run now".
  // Loan interest is owned by loan_processor.accrueLoanInterest.
  // Payroll/subscriptions are booked through CityCorp rails in cron.ts.
}