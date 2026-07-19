import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  mcUuid: text("mc_uuid").notNull(),
  mcUsername: text("mc_username").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const banks = sqliteTable("banks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  guildId: text("guild_id").notNull(),
  discordToken: text("discord_token").notNull(),
  discordClientId: text("discord_client_id"),
  discordClientSecret: text("discord_client_secret"),
  corpId: integer("corp_id"),
  corpApiUuid: text("corp_api_uuid"),
  corpApiKey: text("corp_api_key"),
  cityCorpAppId: text("city_corp_app_id"),
  cityCorpAppSecret: text("city_corp_app_secret"),
  cityCorpAuthUrl: text("city_corp_auth_url"),
  customDomain: text("custom_domain"),
  brandingColor: text("branding_color").default("#4f46e5"), // indigo-600
  logoUrl: text("logo_url"),
  apiKey: text("api_key"),
  webhookSecret: text("webhook_secret"),
  apiWebhookUrl: text("api_webhook_url"),
  status: text("status").default("offline"),
  plan: text("plan").default("standard"), // starter, standard, enterprise
  billingStatus: text("billing_status").default("active"), // active, suspended, trialing
  platformFeePercent: integer("platform_fee_percent").default(200), // e.g. 200 = 2.00%
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const bankAccounts = sqliteTable("bank_accounts", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  ownerDiscordId: text("owner_discord_id").notNull(),
  accountName: text("account_name").notNull(), // e.g. "Main Checking" or "Corp Savings"
  accountType: text("account_type").default("personal"), // "personal", "business", "payroll", "system_asset", "system_revenue", "system_expense", "system_liability"
  balance: integer("balance").notNull().default(0), // stored in cents or lowest denominaton to avoid floats
  creditLimit: integer("credit_limit").notNull().default(0), // For credit accounts
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  isFrozen: integer("is_frozen", { mode: "boolean" }).default(false),
  isSystem: integer("is_system", { mode: "boolean" }).default(false),
  systemCategory: text("system_category"), // e.g., "vault_cash", "fee_revenue", "interest_revenue", "clearinghouse"
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  fromAccountId: text("from_account_id").references(() => bankAccounts.id), // nullable for deposits from game
  toAccountId: text("to_account_id").references(() => bankAccounts.id), // nullable for withdrawals to game
  amount: integer("amount").notNull(),
  type: text("type").notNull(), // "transfer", "deposit", "withdraw", "onyx_payment"
  description: text("description"),
  isFlagged: integer("is_flagged", { mode: "boolean" }).default(false),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

export const onyxMerchants = sqliteTable("onyx_merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  bankId: text("bank_id").references(() => banks.id).notNull(), // The routing bank
  destinationAccount: text("destination_account").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const bankSettings = sqliteTable("bank_settings", {
  bankId: text("bank_id").primaryKey().references(() => banks.id),
  withdrawFeePercent: integer("withdraw_fee_percent").default(0), // multiplied by 100
  depositFeePercent: integer("deposit_fee_percent").default(0),
  transferFeePercent: integer("transfer_fee_percent").default(0),
  interBankWireThreshold: integer("inter_bank_wire_threshold").default(5000000), // Default $50,000 before requiring manual wire
  colorScheme: text("color_scheme").default("indigo"),
  logoUrl: text("logo_url"),
  supportEmail: text("support_email"),
  discordWebhookUrl: text("discord_webhook_url"),
  requireKyc: integer("require_kyc", { mode: "boolean" }).default(false),
  discordVerifiedRoleId: text("discord_verified_role_id"),
  discordClientRoleId: text("discord_client_role_id"),
  enableLoans: integer("enable_loans", { mode: "boolean" }).default(true),
  enableVaults: integer("enable_vaults", { mode: "boolean" }).default(true),
  enableCards: integer("enable_cards", { mode: "boolean" }).default(true),
  enablePayroll: integer("enable_payroll", { mode: "boolean" }).default(true),
  enableSubscriptions: integer("enable_subscriptions", { mode: "boolean" }).default(true),
  enableEscrow: integer("enable_escrow", { mode: "boolean" }).default(true),
  enableTreasury: integer("enable_treasury", { mode: "boolean" }).default(true),
  // Auto-approval options
  autoApproveLoans: integer("auto_approve_loans", { mode: "boolean" }).default(false),
  autoApproveCreditCards: integer("auto_approve_credit_cards", { mode: "boolean" }).default(false),
  maxAutoApproveLoanAmount: integer("max_auto_approve_loan_amount").default(1000000), // 10,000.00
});

export const escrows = sqliteTable("escrows", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  buyerAccountId: text("buyer_account_id").references(() => bankAccounts.id).notNull(),
  sellerAccountId: text("seller_account_id").references(() => bankAccounts.id).notNull(),
  amount: integer("amount").notNull(),
  description: text("description"),
  status: text("status").default("pending"), // pending, funded, released, refunded
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const bankStaff = sqliteTable("bank_staff", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  discordId: text("discord_id").notNull(),
  role: text("role").notNull(), 
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  discordId: text("discord_id").notNull(),
  subject: text("subject").notNull(),
  status: text("status").default("open"), 
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  userDiscordId: text("user_discord_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

export const loans = sqliteTable("loans", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  discordId: text("discord_id").notNull(),
  accountId: text("account_id").references(() => bankAccounts.id).notNull(), // specific account that gets funded/pays
  principalAmount: integer("principal_amount").notNull(),
  remainingAmount: integer("remaining_amount").notNull(),
  interestRate: integer("interest_rate").notNull(), // percentage * 100
  nextPaymentDate: integer("next_payment_date", { mode: "timestamp" }).notNull(),
  purpose: text("purpose"), // Why do they need it?
  status: text("status").default("pending"), // pending, active, rejected, paid_off, defaulted
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const creditApplications = sqliteTable("credit_applications", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  discordId: text("discord_id").notNull(),
  accountId: text("account_id").references(() => bankAccounts.id).notNull(), // backing account
  requestedLimit: integer("requested_limit").notNull(),
  monthlyIncome: integer("monthly_income").notNull(),
  purpose: text("purpose"),
  status: text("status").default("pending"), // pending, approved, rejected
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const vaultDeposits = sqliteTable("vault_deposits", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  accountId: text("account_id").references(() => bankAccounts.id).notNull(),
  amount: integer("amount").notNull(),
  lockedUntil: integer("locked_until", { mode: "timestamp" }).notNull(),
  interestRate: integer("interest_rate").notNull(), // percentage * 100
  status: text("status").default("locked"), // locked, released, early_withdrawn
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  accountId: text("account_id").references(() => bankAccounts.id).notNull(),
  cardNumber: text("card_number").notNull().unique(), // securely generated
  cvv: text("cvv").notNull(),
  expiryDate: text("expiry_date").notNull(),
  isLocked: integer("is_locked", { mode: "boolean" }).default(false),
  type: text("type").notNull(), // "debit" or "credit"
  
  // Credit specific fields
  creditLimit: integer("credit_limit").default(0),
  creditUsed: integer("credit_used").default(0),
  apr: integer("apr").default(0), // Interest rate * 100
  minimumPayment: integer("minimum_payment").default(0),
  nextPaymentDate: integer("next_payment_date", { mode: "timestamp" }),
  
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const payrollJobs = sqliteTable("payroll_jobs", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  employerAccountId: text("employer_account_id").references(() => bankAccounts.id).notNull(),
  employeeAccountId: text("employee_account_id").references(() => bankAccounts.id).notNull(),
  amount: integer("amount").notNull(),
  frequency: text("frequency").notNull(), // "weekly", "biweekly", "monthly"
  nextRun: integer("next_run", { mode: "timestamp" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  billerAccountId: text("biller_account_id").references(() => bankAccounts.id).notNull(),
  customerAccountId: text("customer_account_id").references(() => bankAccounts.id).notNull(),
  amount: integer("amount").notNull(),
  frequency: text("frequency").notNull(), // "weekly", "monthly"
  nextRun: integer("next_run", { mode: "timestamp" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const clearinghouseBalances = sqliteTable("clearinghouse_balances", {
  bankId: text("bank_id").primaryKey().references(() => banks.id),
  balance: integer("balance").notNull().default(0), // Can be negative (owed) or positive (owed to)
  lastSettled: integer("last_settled", { mode: "timestamp" }),
});

export const clearinghouseSettlements = sqliteTable("clearinghouse_settlements", {
  id: text("id").primaryKey(),
  fromBankId: text("from_bank_id").references(() => banks.id).notNull(),
  toBankId: text("to_bank_id").references(() => banks.id).notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending"), // pending, paid
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const interBankTransfers = sqliteTable("inter_bank_transfers", {
  id: text("id").primaryKey(),
  fromBankId: text("from_bank_id").references(() => banks.id).notNull(),
  toBankId: text("to_bank_id").references(() => banks.id).notNull(),
  fromAccountId: text("from_account_id").references(() => bankAccounts.id).notNull(),
  toAccountId: text("to_account_id").references(() => bankAccounts.id).notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending_wire"), // pending_wire, completed, rejected
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const onyxSettings = sqliteTable("onyx_settings", {
  id: text("id").primaryKey(), // Using a single row 'global'
  b2bApiFeePercent: integer("b2b_api_fee_percent").default(200), // 2.00%
  clearinghouseEnabled: integer("clearinghouse_enabled", { mode: "boolean" }).default(true),
});

export const cityCorpLogs = sqliteTable("city_corp_logs", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id), // Bank whose credentials were used, if any
  endpoint: text("endpoint").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  status: integer("status").notNull(), // HTTP Status (200, 500, etc, or 0 for network err)
  success: integer("success", { mode: "boolean" }).notNull(),
  errorMessage: text("error_message"),
  payload: text("payload"),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});


export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  billerAccountId: text("biller_account_id").references(() => bankAccounts.id).notNull(),
  customerAccountId: text("customer_account_id").references(() => bankAccounts.id).notNull(),
  amount: integer("amount").notNull(),
  description: text("description"),
  dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
  status: text("status").default("pending"), // pending, paid, overdue
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const bankCustomers = sqliteTable("bank_customers", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  discordId: text("discord_id").notNull(),
  kycStatus: text("kyc_status").default("pending"), 
  mcUuid: text("mc_uuid"),
  mcUsername: text("mc_username"),
  linkedDiscordId: text("linked_discord_id"),
  cityCorpToken: text("city_corp_token"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const loanProducts = sqliteTable("loan_products", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  name: text("name").notNull(),
  interestRate: integer("interest_rate").notNull(), 
  maxAmount: integer("max_amount").notNull(),
  termDays: integer("term_days").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const creditProducts = sqliteTable("credit_products", {
  id: text("id").primaryKey(),
  bankId: text("bank_id").references(() => banks.id).notNull(),
  name: text("name").notNull(),
  interestRate: integer("interest_rate").notNull(), 
  maxLimit: integer("max_limit").notNull(),
  rewardsPercent: integer("rewards_percent").default(0),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const globalAdmins = sqliteTable("global_admins", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  addedBy: text("added_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
