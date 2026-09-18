export function bankIsSuspended(bank: { billingStatus?: string | null; status?: string | null } | null | undefined): boolean {
  if (!bank) return false;
  return bank.billingStatus === "suspended" || bank.status === "suspended";
}

export function bankBlocksCustomerMoney(bank: { billingStatus?: string | null; status?: string | null; maintenanceMode?: boolean | number | null } | null | undefined): { blocked: boolean; reason: string } {
  if (!bank) return { blocked: true, reason: "Bank not found." };
  if (bankIsSuspended(bank)) {
    return { blocked: true, reason: "This bank is suspended. Transfers are frozen." };
  }
  if (bank.maintenanceMode) {
    return { blocked: true, reason: "This bank is in maintenance. Transfers are paused." };
  }
  return { blocked: false, reason: "" };
}
