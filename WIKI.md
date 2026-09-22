# Slate Banking Platform – Platform Wiki

Welcome to the definitive Slate Banking Platform Wiki. This living document encapsulates the architecture, features, workflows, and integrations of the entire banking and payment service provider suite.

---

## 🏛 Platform Overview

Slate Banking Platform is a multi-tenant banking management platform designed for gaming and roleplaying communities (such as Minecraft RP servers). It provides distinct isolation for individual banks while connecting them globally via a centralized Payment Service Provider (Onyx) and Central Clearinghouse.

### Core Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, React Router DOM, Recharts for data visualization.
- **Backend**: Node.js, Express (with `helmet`, `cors`, `express-rate-limit`, `cookie-parser`).
- **Database**: SQLite driven by Drizzle ORM.
- **Authentication**: Discord OAuth via manual JWT cookies.
- **Hosting**: Pre-configured for seamless execution on Pterodactyl Panels (binds automatically to `SERVER_PORT`).

---

## 🏦 Tenant Architecture (Banks)

A single deployment of Slate supports an unlimited number of Banks. Each Bank represents an isolated financial institution.

### 1. Financial Core
- **Ledgers & Transactions**: Double-entry accounting system where money moves strictly between accounts via `transactions`. Multi-step financial operations (transfers, deposits, and fee deductions) execute inside atomic database transactions (`db.transaction`) to guarantee consistency.
  - Transaction types: `transfer`, `deposit`, `withdraw`, `onyx_payment`, `interest_payment`.
- **Bank Accounts**: Configurable user accounts identifiable by unique IDs. Account types include `personal`, `business`, and `payroll`.
  - Uses lowest denomination (cents) to avoid floating-point errors.
  - **Custom Account Fee Overrides**: Individual accounts can be configured with custom fee rates (`customTransferFeePercent`, `customDepositFeePercent`, `customWithdrawFeePercent`). When defined, transaction fee processing respects the custom account rate rather than the global bank default. When updating bank-wide fee settings in `Bank Settings`, staff can check a toggle to either overwrite custom account overrides or leave them preserved.
- **Savings Interest Accrual Engine**: Banks can configure `savingsApyPercent` (e.g. 300 basis points = 3.00% APY) in `Bank Settings`. Staff can trigger daily interest compounding via `POST /api/banks/:bankId/accrue-interest`, which atomically calculates pro-rated daily interest across active, non-frozen accounts, logs interest credit transactions, and updates `lastInterestAccrualAt`.
- **Audit Logs**: Irreversible system action records tracking all internal financial manipulation or staff changes. Automatically logs `action`, `details`, and `timestamp`. Server-side pagination (`limit` & `offset`) keeps high-volume logs fast.

### 2. Retail Banking Features
- **Vaults & Time-Locks**: Time-locked deposit accounts that generate interest upon release. Early withdrawal limits are natively supported. Can be toggled per-bank in settings.
- **Loans & Credit Facility**: Comprehensive lending lifecycle management. Tracks principal amounts, remaining balances, interest rates (basis points APR), upcoming payment dates, and collateral bindings. Supports loan status tracking (`pending`, `approved`, `active`, `paid`, `defaulted`, `rejected`).
  - **Automated Repayment Debits & Recurring Cron Engine**: Background cron services running every 15 minutes (`src/lib/cron.ts` -> `src/server/loan_processor.ts`) inspect active loans past their `nextPaymentDate`. The engine automatically debits the borrower's primary bank account for installment repayments (`min(remainingAmount, max($1.00, principalAmount / 12))`). Successful debits log repayment transactions and extend `nextPaymentDate` by 30 days.
  - **Daily Interest Accrual & Compounding**: Loan APR interest is accrued and compounded daily basis points: `(remainingAmount * (interestRate / 10000) * daysElapsed) / 365`. Accrued interest atomically increases the loan's `remainingAmount` and records an interest charge in system logs.
  - **Delinquency, Late Fees & Default Handling**: If an automated repayment debit fails due to insufficient borrower funds, the loan transitions to `isDelinquent = true`, increments `missedPaymentsCount`, assesses a flat late fee penalty ($25.00), and adds it to `remainingAmount`. Upon 3 consecutive missed payment attempts, the system automatically transitions the loan status to `defaulted` and seizes any pledged collateral asset.
  - **Collateral Asset Tracking & Seizure**: Borrowers can pledge collateral assets during loan applications (`collateralDescription`, `collateralValue`, `collateralStatus`). Pledged collateral statuses transition from `none` -> `pledged` -> `seized` (on loan default) or `released` (upon full principal payoff). Bank staff can update asset valuations and manually adjust collateral status via the Bank Loans portal.
  - **Credit Applications**: Citizens can apply for specialized lines of credit via the customer portal with custom collateral declarations. Bank staff review, evaluate collateral, and approve/reject applications. 
  - **Auto-Approval**: In `Bank Settings`, banks may toggle `autoApproveLoans` and `autoApproveCreditCards` along with a threshold `maxAutoApproveLoanAmount`. When toggled, requests falling under the safe limit are instantly generated (funds deposited or cards provisioned) without staff intervention.
  - **Google Docs Contract Integration**: Configurable Google Docs legal agreement templates for loans, credit applications, and escrow agreements. When enabled, the system auto-generates or attaches dynamic Google Docs contract links populated with variable tags (`{BANK_NAME}`, `{CLIENT_DISCORD}`, `{AMOUNT}`, `{INTEREST_RATE}`, `{CONTRACT_ID}`, `{DATE}`) and provides direct document links in the staff portal and citizen gateway (`contractUrl`).
- **Cards**: Generated debit and credit card objects (Card Number, CVV, Expiry, Locked state) tied directly to a bank account. Lock states toggle true/false.

### 3. Business & B2B Suite
- **Invoices & Receivable Payment Demands**:
  - **Comprehensive Ledger Oversight**: Staff and commercial entities track accounts receivable and payable across client accounts with real-time KPI metrics: Total Billed, Outstanding (Pending), Collected (Settled), and Delinquent (Overdue).
  - **Multi-State Filtering & Search**: Interactive filtering by claim status (`pending`, `paid`, `overdue`, `cancelled`) with instant search across descriptions, counterparty usernames, account names, and UUID references.
  - **Dynamic Schedule Tracking**: Real-time relative schedule calculation indicating exact days remaining until due date, flags overdue receivables with visual urgency indicators, and calculates interest/late liability.
  - **Printable Institutional PDF Generation**: Native PDF invoice preview with print-specific media queries (`@media print`). Features bank letterhead, Onyx clearinghouse membership stamps, itemized services breakdown, currency formatting, and automated subtotal/fee reconciliations.
  - **Reconciliation Controls**: Manual staff reconciliation ("Mark Paid") for external settlements and voiding/cancellation controls.
- **Subscriptions & Direct Debit Mandates**:
  - **Automated Recurring Billing Schedules**: Direct debit mandate engine supporting `weekly`, `biweekly`, and `monthly` cadence debits from debtor bank accounts into merchant/creditor ledgers.
  - **KPI Metrics & MRR Analysis**: Normalized Monthly Recurring Revenue (MRR) computation, active mandate tracking, paused mandate counters, and average billing size analysis.
  - **Schedule Controls & Instant Execution**: Staff and merchants can toggle mandate status (`isActive: true/false`) to pause or resume billing, or trigger "Force Charge Now" to advance execution schedules immediately with live liquidity checks.
- **Corporate Payroll & Salary Disbursements**:
  - **Automated Staff Compensation Engine**: Configurable employer-to-employee salary disbursements with customizable frequencies (`weekly`, `biweekly`, `monthly`).
  - **Liquidity Safeguards**: Visual warnings and pre-execution validation ensuring the employer funding account maintains sufficient liquid balance to cover total scheduled payroll liabilities.
  - **Batch Payout Execution**: "Run All Active" batch execution engine allowing branch managers to disburse salaries across all enrolled employees simultaneously, reporting successful transactions and identifying insolvent employer accounts.
  - **KPI Tracking**: Total monthly payroll burden aggregation, active payee enrollment tracking, and per-position compensation metrics.
- **Institutional Escrow Custody**:
  - **Trustless Bilateral Holding**: Neutral third-party custody engine securing funds for high-value asset acquisitions, real estate transactions, and bilateral roleplay trades.
  - **Custody Lifecycle**: Clear multi-stage state progression (`pending` -> `funded` -> `released` to seller or `refunded` to buyer).
  - **Custody Actions**: Direct staff triggers to draw and lock buyer deposits (`/fund`), execute final seller settlement (`/release`), or abort transaction and return capital to buyer (`/refund`).
  - **Legal Agreement Attachment**: Integration with Google Docs contract generator or custom contract URLs, providing direct external document links for auditing and dispute mediation.


### 4. Admin & Workforce
- **Team & RBAC Management**: Granular role-based access control (RBAC) supporting multi-tier bank operations:
  - **Executive Admin (`admin`)**: Unrestricted institutional control across tenant configuration, staff provisioning, inter-bank clearinghouse, and treasury.
  - **Branch Manager (`manager`)**: Full operational oversight over accounts, loans, reserves, payroll batches, and analytics.
  - **Loan & Underwriting Officer (`loan_officer`)**: Underwrites loan applications, binds collateral assets, manages loan late fees, and assesses borrower risk.
  - **Compliance & Risk Auditor (`compliance`)**: Inspects immutable audit logs, manages KYC verification, monitors suspicious transaction flow, and executes account freeze/unfreeze controls.
  - **Bank Teller (`teller`)**: Counter operations including manual deposits, cash withdrawals, client transfers, and balance verification.
  - **Permission Matrix & Inline Role Editing**: Built-in interactive permission matrix drawer detailing module capabilities across all roles, with instant inline role adjustment and searchable roster filters.
- **Support Tickets**: Internal CRM allowing customers to open tickets (`open`, `in_progress`, `resolved`, `closed`) within their citizen portal directed to bank staff.

### 5. Settings & Customization
- **White-label Branding**: Custom color schemes (`colorScheme`) and logo URLs per bank.
- **Fees**: Configurable system-wide fees for transfers, deposits, and withdrawals (stored as percentages multiplied by 100).
- **Discord Integration & Bot Recycling**: Specify verified roles, client roles, `staffChannelId`, and `guiChannelId` per bank. When a bank token is updated, the `BotManager` performs zero-downtime client recycling (`restartBankBot`), restarting only the target tenant bot instance without restarting the server. Real-time notifications auto-dispatch directly into `staffChannelId`.
- **Feature Flags & Maintenance Mode**: CEOs, Bank Staff, and Global Admins can toggle `maintenanceMode` per bank (or network-wide). During maintenance mode, the Discord bot stays online and production APIs remain active; however, non-staff/customer actions (transfers, invoice payments, bot commands, menu interactions) are suspended with a standard maintenance notice. Bank staff and global admins retain full override privileges to test new features, run commands, and execute portal transactions in production.
- **Feature Toggles**: CEOs can manually toggle `enableLoans`, `enableVaults`, `enableCards`, `enablePayroll`, `enableSubscriptions`, `enableEscrow`, and `enableTreasury`.

### 6. Performance & Optimization Architecture
- **Database Indexing**: Drizzle SQLite schema includes explicit `index()` declarations on high-cardinality foreign keys and timestamp fields across `bank_accounts` (`bankId`, `ownerDiscordId`), `transactions` (`bankId`, `fromAccountId`, `toAccountId`, `timestamp`), `bank_staff` (`bankId`, `discordId`), `loans` (`bankId`, `discordId`), `escrows` (`bankId`), and `audit_logs` (`bankId`, `userDiscordId`).
- **High-Performance API Key Lookups (`apiKeyLast4`)**: The `banks` and `onyx_merchants` tables store an indexed `apiKeyLast4` suffix (`idx_banks_api_key_last4` and `idx_onyx_merchants_api_key_last4`). `authenticateApiRequest` and Onyx merchant lookups filter candidate rows using this indexed 4-character suffix prior to executing constant-time cryptographic hash verification, eliminating table scans on high-traffic API workloads.
- **Transaction Idempotency Engine (`idempotency_keys`)**: High-concurrency financial endpoints (`/api/v1/transfers`, `/api/citizen/transfer`, `/api/portal/:bankId/transfer`, `/api/banks/:bankId/teller/transfer`, `/api/onyx/checkout`) natively support idempotency keys supplied via the `Idempotency-Key` / `X-Idempotency-Key` HTTP headers or the request body `idempotencyKey`.
  - Guarantees exactly-once execution and prevents double debits or accidental duplicate payments on network retries.
  - Active operations are tracked with an `"in_progress"` state, returning `409 Conflict` on concurrent collisions.
  - Finished operations record HTTP status code and response payload with an automated 24-hour expiration window (`expiresAt`).
  - Pre-execution validation errors automatically release the key to allow clients to correct parameters and retry without collision.
- **In-Memory Caching**: CityCorp Network API queries (`/corp/list`) use a 3-minute TTL in-memory cache to eliminate external latency spikes and safeguard against upstream rate limits.
- **Server-Side Pagination**: High-volume data routes (`GET /api/banks/:bankId/transactions` and `GET /api/banks/:bankId/audit`) support `limit` and `offset` parameters for fast, responsive UI rendering.

---

## 💳 Global Architecture

### SaaS Admin Dashboard
The SaaS Admin Dashboard acts as the superuser control panel for managing the entire Slate infrastructure.
- **Global Settings (`/settings`)**: Controls top-level platform configurations such as maintenance mode, new bank provisioning, and rate limits.
- **Platform Monitoring (`/` and `/transactions`)**: Real-time aggregation of transaction volumes and system health metrics.
- **Bank Management (`/banks`)**: View and manage all tenant bank instances.
- **CityCorp Network (`/citycorp`)**: View and manage the central city ledger logs and integrations.

### Onyx Network (Payment Service Provider)
Onyx is a Stripe-like processing layer bridging funds across entirely different banks. 
- **Onyx Merchants**: Entities can register external API keys to route collected funds dynamically into a designated destination account.
- **Onyx Checkout API**: Stateless checkout routing allowing third-party tools (like Minecraft plugin gateways) to post payments securely across the entire Slate infrastructure. The API accepts an optional `sourceAccountId` for bypassing the default routing logic matching only the routing bank.
- **Onyx Quick Pay**: Available in the bank customer portal, allowing an account holder to pick a network merchant and pay them. Same-bank book transfer when the merchant is at this bank; Onyx settlement when they are not.
- **Onyx Global Settings**: Controlled via the SaaS Admin dashboard, settings include a global B2B API Transaction Fee tax and global toggles for clearinghouse routing.

### Central Clearinghouse & Inter-Bank Wires
Since funds occasionally cross from Bank A to Bank B, the platform leverages inter-bank clearinghouse logic.
- **Clearinghouse Balances**: A running ledger of what each bank "owes" the central network versus what they are "owed" by the network. Handled automatically during inter-bank transfers.
- **Settlements**: Periodic net-position payouts balancing the systemic discrepancies. Records `fromBankId`, `toBankId`, `amount`, and `status`.
- **Manual Wires (Liquidity Protection)**: If an incoming inter-bank transaction exceeds the receiving bank's `interBankWireThreshold` (configured securely in their bank settings), the automatic clearinghouse route is aborted. Instead, it generates a "Pending Wire Transfer", requiring the sending bank's staff to manually deposit funds in-game into the receiving bank's corp account. The receiving bank's staff then approves the wire in Slate, automatically crediting the destination user.

---

## 🔐 Security & Identity

### Discord & CityCorp OAuth Context & JWT
Instead of simple passwords, the platform supports Discord and CityCorp OAuth authentication. 
- `/api/auth/url` generates the OAuth prompt (Discord or CityCorp, controllable via `provider=citycorp` query or fallback environment variables).
- `/api/auth/discord/callback` handles the Discord OAuth code exchange.
- `/api/auth/citycorp/callback` and `/api/auth/callback` handle CityCorp OAuth authorization code exchange (`POST https://api.cityrp.org/auth/token`).
  - **Custom OAuth URL Preservation**: Directly respects custom CityCorp OAuth URLs (`cityCorpAuthUrl`) saved in Bank Settings without stripping or overwriting configured scopes. Default scopes (`corp.player.info.get,corp.info.get`) are used when no custom URL is provided, matching the official CityRP OAS 3.0 specification.
  - **Bank Domain & State Encoding**: Prioritizes the bank's configured `customDomain` (e.g., `https://vh.azisle.com/api/auth/citycorp/callback`) and request host headers. Encodes the exact `appId` and `redirectUri` used during authorization into the OAuth `state` payload, ensuring matching `app_id` and `redirect_uri` during token exchange with `https://api.cityrp.org/auth/token`.
- The JWT payload (`discordId`, `username`, `avatarUrl`, `isGlobalAdmin`) is encrypted with `JWT_SECRET` and stored in an HTTP-only, secure, sameSite=lax cookie (`auth_token`).
- Tokens are set to expire in 7 days.
- In addition to standard JWT cookie setting, postMessage broadcasts `{ type: 'OAUTH_AUTH_SUCCESS', user, token, uuid, minecraft_uuid }` to support popup login windows across custom applications and clients.

### Middlewares & Identity Resolution
1. **`authenticateApiRequest`**: Standard API key checking for external plugin connections, ensuring `x-api-key` or `Authorization: Bearer <token>` header matches a valid `banks` or `onyxMerchants` API key.
2. **`requireGlobalAdmin`**: Decodes the JWT and verifies Global Admin privileges across multiple layers:
   - Direct JWT `isGlobalAdmin` flag assertion.
   - Environment variables: `GLOBAL_ADMIN_DISCORD_IDS`, `ADMIN_DISCORD_IDS`, `DISCORD_ADMIN_IDS`, `ADMIN_IDS`, `GLOBAL_ADMIN_IDS`, and `DISCORD_BOT_OWNER_ID`.
   - SQLite `global_admins` database table.
   - Automatic first-user elevation if the `global_admins` table is empty upon initial login.
3. **`requireBankStaff`**: Decodes the JWT, resolves all candidate identities, checks global admin fallback (which grants full owner privileges across all tenants), and queries the `bank_staff` table for tenant-specific role authorization.
4. **`getUserCandidateIdentifiers` (Transitive Identity Engine)**:
   - Eliminates account visibility discrepancies across authentication methods (CityCorp OAuth, Discord OAuth, legacy database imports).
   - Generates normalized permutations for UUIDs (32-character undashed, 36-character standard dashed, and `mc_` prefixed variants) and usernames (case-insensitive, `@` prefixes).
   - Performs a 3-pass transitive closure query linking entries in `bank_customers` across all banks and `users` tables, guaranteeing that accounts created under Discord IDs, Minecraft UUIDs, or player usernames are correctly linked and displayed in client portals and citizen gateways.

### Protection Layers
- **Helmet**: Enforces core header securities while selectively disabling `contentSecurityPolicy` and `crossOriginEmbedderPolicy` to allow relaxed iframe cross-embeds for Pterodactyl dashboards.
- **Rate Limiting**: `express-rate-limit` enforces a strict ceiling of 1000 requests per 15 minutes globally across all `/api/` endpoints.
- **Card Security & RBAC Isolation**: Raw card numbers and CVVs are masked by default across all staff and customer views. Unmasked card retrieval via `/api/banks/:bankId/cards/:cardId/reveal` is strictly restricted to `owner` and `admin` roles, preventing disclosure to lower-tier staff roles (`teller`, `loan_officer`, `compliance`).
- **Hardened SQLite Database Import Tool**: To prevent arbitrary code execution or SQL injection, database migration imports (`/api/banks/:bankId/tools/sqlite-migration`) strictly require binary SQLite files. The server enforces binary SQLite magic header signature verification (`SQLite format 3\0`) and opens temporary databases with `readonly: true` and `trusted_schema = OFF` before extracting schema records.
- **Settlement Rollback Alerting & Resilience**: Cross-bank CityCorp money settlement routines include automated compensation rollbacks if a destination leg fails. If a rollback itself encounters an operational failure, the system triggers `raisePlatformAlert` to dispatch immediate high-priority alerts to system administrators, preventing silent fund stranding.
- **Global Admins**: Hard-coded root developers (such as `@cofys` / `cofysmc@gmail.com`) automatically inherit Root Global Admin permissions, bypassing bank-level staff restrictions.

---

## 🤖 Bot Manager Daemon (`bot_manager.ts`)

Every bank defined in the platform can attach a unique Discord Bot Token to its configuration. Slate Banking Platform runs an internal `BotManager` class designed to handle an unlimited swarm of isolated Discord JS Client instances.

- **Provisioning & State Synchronization**: When a bank is created or updated, `botManager.provisionBankBot(bankId, token)` spins up a new independent bot process logged in under that token. Upon reaching Discord Gateway `ready` state, the manager atomically synchronizes the database `banks.status` to `online` and exposes live WebSocket connectivity. If connection errors or shutdowns occur, the status is safely transitioned to `error` or `offline`.
- **Live Status Resolution & Gateway Ping**: In addition to `/api/bots/status` for Global Admins, the platform exposes `GET /api/banks/:bankId/bot-status` for Bank Staff. The Bank Staff Dashboard (`BankOverview.tsx`) actively polls this endpoint, resolving the Discord gateway connection state, bot user tag, and live WebSocket ping (ms), eliminating discrepancies where a live bot appeared offline due to stale database fields.
- **Account Sync & Self-Healing Identity Resolution**: Clicking **🔄 Sync / Refresh** or interacting with the customer panel triggers `showMainMenu` backed by `getAccountsForUser` and `getCandidateIdsForDiscordSnowflake`. The bot resolves transitively across Minecraft UUIDs (dashed/undashed/prefixed), character usernames, and Discord snowflakes, automatically repairing missing `linkedDiscordId` entries in both `users` and `bank_customers` tables. If a user holds accounts across other banking tenants in Slate, the bot displays an informational institutional breakdown guiding them directly to their ledgers.
- **Default Messages & Attribution**: Embeds and notifications automatically format footers using the bank name and platform default: `<Bank Name> • Powered by - Slate Banking Platform`. Custom footers set by bank operators in Bank Settings override this default message.
- **Shutdowns**: `botManager.stopBankBot(bankId)` safely terminates the client and cleans up gateway listeners.
- **Use Case**: Each bank bot exposes a single slash command (`/bank`) plus auto-updating public and staff channel panels spawned from Bank Settings. Copy, color, logo, footer, presence, and stats are owned by the bank.

---

## 📡 API Endpoint Reference

### Authentication Routes
- `GET /api/auth/url` - Generate Discord OAuth redirect.
- `GET /api/auth/discord/callback` - Process Discord OAuth code.
- `GET /api/auth/me` - Validate session cookie and return identity.
- `POST /api/auth/logout` - Invalidate session cookie.

### System & Infrastructure Routes (Global Admins)
- `GET /api/health` - Ping check.
- `GET /api/stats` - Platform-wide system volume statistics.
- `GET /api/banks` - List all registered banks.
- `POST /api/banks` - Provision a new tenant bank.
- `GET /api/bots/status` - View all active Discord Bot DAEMON statuses.
- `GET /api/onyx/merchants` - List all Onyx API keys.
- `GET /api/onyx/settlements` - View macro clearinghouse resolutions.

### Slate Public/External API Routes (Authentication: API Key)
- `GET /api/v1/accounts` - List accounts for the authenticated bank context.
- `GET /api/v1/accounts/:accountId` - Deep retrieval.
- `POST /api/v1/transactions` - Execute a monetary transfer.
- `GET /api/v1/transactions` - List latest movements.
- `GET /api/v1/cards` - Retrieves active debit/credit objects.

### Bank Staff Portals (Authentication: Bank Staff Cookie)
*These routes generally reside under `/api/banks/:bankId/*`*
- **Settings & Config**: `GET / settings`, `PUT / settings`
- **Analytics**: `GET / analytics` (Returns revenue, deposit matrices, charts).
- **Accounts**: `GET / accounts`, `POST / accounts`.
- **Customers**: `GET / customers` (List unique users possessing an account in the bank), `GET / customers/:discordId`.
  - Added support for Identity Reassignment: `POST /api/banks/:bankId/customers/:discordId/update-id` updates the owner discord ID for all accounts under a customer. `POST /api/banks/:bankId/accounts/:accountId/update-owner` reassigns a specific account.
- **Staff Control**: `GET / team`, `POST / team`, `DELETE / team/:id`.
- **Audit**: `GET / audit` (Immutable action logs).
- **Clearinghouse**: `GET / clearinghouse` (Bank's net positioning).
- **Retail Services**:
  - `GET / vaults`, `POST / vaults`
  - `GET / loans`, `POST / loans`
  - `GET / cards`, `POST / cards`
- **B2B Services**:
  - `GET / subscriptions`, `POST / subscriptions`
  - `GET / invoices`, `POST / invoices`
  - `GET / payroll`, `POST / payroll`
  - `GET / escrows`, `POST / escrows`
- **Developer Tools**: `GET / developer`

### Bank Client Portal APIs (Authentication: Session / CityCorp / Discord)
- `GET /api/portal/:bankId/info` - Resolves bank metadata, branding, and color scheme.
- `GET /api/portal/:bankId/lookup` - Resolves customer portfolio, accounts, cards, loans, pending invoices, and transaction ledger.
- `POST /api/portal/:bankId/transfer` - Authorizes and executes capital wire transfers.
- `POST /api/portal/:bankId/pay-invoice` - Settles pending customer invoices.
- `POST /api/portal/:bankId/request-loan` - Submits loan application and credits account instantly.
- `POST /api/portal/:bankId/repay-loan` - Executes loan repayments from active accounts.
- `POST /api/portal/:bankId/issue-card` - Provisions virtual credit or debit cards linked to user accounts.
- `PATCH /api/portal/:bankId/cards/:cardId/lock` - Toggles freeze/unfreeze lock status on cards.

### Dynamic Domain & Identity Resolution
- **Dynamic OAuth Redirect URIs**: `getRedirectUri` in `middleware.ts` inspects incoming `x-forwarded-host` and `host` headers to dynamically match the deployment domain (e.g., custom domains or subdomains), ensuring OAuth callbacks match host configurations precisely.
- **Fallback Minecraft Identity Resolution**: `authRoutes.ts` resolves usernames and avatars from CityCorp player info, falling back to Crafatar and Mojang Session APIs for seamless player identification.

### Customer portal (Authentication: Discord Cookie)
- `GET /api/citizen/lookup` - Resolves the current logged in citizen's portfolio across the entire platform.

---

## 🗄️ Database Schema Deep Dive

The platform relies on a SQLite database configured via `drizzle.config.ts` and managed at runtime via `src/db/index.ts`. On server boot, `ensureDatabaseSchemaSynced()` automatically executes PRAGMA table checks to create any missing tables (`CREATE TABLE IF NOT EXISTS`) and dynamically add missing schema columns via `ALTER TABLE ... ADD COLUMN` across all core modules. Here are the definitive tables from `src/db/schema.ts`:

- **`users`**: Global identity mapping table linking Discord IDs to Minecraft UUIDs and Usernames.
- **`banks`**: The foundational tenant row. Contains `discordToken`, `status`, `brandingColor`, etc.
- **`bank_accounts`**: The core ledger holding entity. Links to `banks` via foreign key. Houses the core integer `balance`, fee overrides (`customTransferFeePercent`, `customDepositFeePercent`, `customWithdrawFeePercent`), custom yield overrides (`customApyPercent`), and system metadata (`isSystem`, `systemCategory`, `tierId`).
- **`transactions`**: Absolute source-of-truth for money layout. Connects optional `fromAccountId` and `toAccountId` for atomic transfers.
- **`onyx_merchants`**: API Gateway configurations routing external keys to specific `destinationAccount` strings.
- **`bank_settings`**: Toggles and fee assignments tied cleanly inside a 1-to-1 relationship with `banks.id`.
- **`escrows`**, **`invoices`**, **`subscriptions`**, **`payroll_jobs`**, **`vault_deposits`**, **`cards`**, **`loans`**: Standard operational modules executing temporal state locking.
- **`audit_logs`**, **`bank_staff`**, **`support_tickets`**: Workforce and HR organization elements.
- **`clearinghouse_balances`**, **`clearinghouse_settlements`**: Central Macro-economy resolution models logging discrepancies across multiple banks.
- **`city_corp_logs`**: Systemic logging table recording latency, response codes, and network health of the external CityCorp API integrations via automated ping trackers and organic user actions.

---

## 💾 Intelligent Data & SQLite Migration Engine
Contained within `BankTools.tsx` and the `/api/banks/:bankId/tools/*` endpoints is a comprehensive data ingestion suite:
1. **Intelligent JSON Migration**: Upload unstructured or loosely-structured JSON historical data (accounts, customers, transactions, fees, taxes). The system intelligently parses it, provisions accounts, sets historical balances, and backfills the audit log and transaction ledgers.
2. **SQLite (.db) Direct Database Migration**: Upload raw `.db`, `.sqlite`, or `.sqlite3` binary database files from legacy bots/frameworks or paste SQL schema dumps (`CREATE TABLE` & `INSERT INTO` statements). Powered by server-side `better-sqlite3`, the ingestion engine directly queries and maps legacy schema structures including:
   - `accounts`: Maps primary account names, balances, owner Discord IDs, MC usernames, RP names, addresses, and freeze/verification flags.
   - `loan_products`: Extracts product names, min/max loan amounts, interest rates (bps), and term days into Slate `loanProducts`.
   - `loans`: Converts legacy loan entries to Slate `loans`, linking backing accounts, principal amounts, remaining balances, APRs, and collateral descriptions.
   - `loan_applications`: Ported directly to Slate `creditApplications`.
   - `transactions`: Backfills the double-entry transaction ledgers with original timestamps, directions, and transaction types.
   - `invoices` & `payroll_entries`: Restores active billing schedules and recurring payroll jobs (`payrollJobs`).

---

## Developer & Public API Documentation

- **Internal Developer Wiki:** See `WIKI.md` for core architecture, stack guidelines, and schema definitions.
- **Public API Documentation:** See `PUBLIC_API.md` for the player-facing and developer integration documentation outlining authentication and HTTP routes.
- **Interactive UI Wiki:** Users can access the interactive developer documentation at the `/docs` route online.

## Developer Guide: Expanding the Code

To expand Slate Banking Platform, always follow the tri-level approach:
1. **Schema Definitions (`src/db/schema.ts`)**: Add your Drizzle-ORM tables or columns. Push structural changes using `npx -y drizzle-kit push`.
2. **Server Endpoints (`server.ts`)**: Construct your Express router mappings making sure to use `await db.select()`, `await db.insert()` inside logic structures. Ensure new APIs correctly implement the `requireBankStaff` or `requireGlobalAdmin` middleware when mutating sensitive arrays. Note that the frontend proxies `/api/*` to the Node.js backend.
3. **Frontend UIs (`src/pages/*`)**: Utilize modern React functional structures, consume the data in `useEffect`, and leverage Tailwind CSS with Lucide React Icons for a polished, highly-crafted professional dark aesthetic. Components should generally align strictly to the `BankAdminLayout` or `DashboardLayout` for seamless auth ingestion.

## Changelog

### June 25th 2026 Update
- **Bot Interactions**: Transitioned from purely slash commands to rich Button/Modal interactions. Admins spawn persistent public/staff channel panels from Bank Settings (`POST /api/banks/:bankId/spawn-discord-gui`). The only customer slash command is `/bank`.
- **Financial Products**: Added new database schemas for `loanProducts`, `creditProducts`, and `bankCustomers` (for KYC and notes). Introduced a new `BankProducts.tsx` page for managing these configured products.
- **CityCorp Dev Portal (OAuth)**: Added a placeholder on the Citizen Portal dashboard preparing for the new CityCorp OAuth linking process, replacing the manual in-game deposit workflow.

### June 29th 2026 Update
- **Intelligent Bulk Account Imports**: Overhauled the `/api/banks/:bankId/import` auto-import logic. Added an intelligent Discord ID parser that extracts 17-20 digit sequences directly from remote account names. Non-matching accounts are automatically isolated with unique individual unassigned IDs (`unassigned_name`), preventing them from grouping together into a single massive false "top customer".
- **Advanced Customer Profiles**: Fully activated and completed the customer detail and editing subsystem (`BankCustomerDetail.tsx`). Connected the `bankCustomers` table with backend support (`GET /customers/:discordId` and `POST /customers/:discordId/profile`) to track and update Internal Notes and KYC Verification status (`pending`, `approved`, `rejected`).
- **Granular Account Reassignment Controls**: Added inline administrative Pencil icons in customer profiles allowing staff to reassign *individual* accounts' owner Discord IDs instantly, giving banks granular, robust, and highly configurable controls.
- **Visual Identity for Unassigned Imports**: Styled unassigned customers with distinct amber visual badges, alert banners, and instructional labels to keep customer lists pristine.

### June 30th 2026 Update
- **Whitelabel CityCorp OAuth Integration**: Completely eliminated centralized profile validation in favor of a bank-level whitelabeled integration. Added `cityCorpAppId` and `cityCorpAppSecret` configuration columns to the `banks` table, and `mcUuid`, `mcUsername`, and `cityCorpToken` columns to the `bankCustomers` table.
- **Bank-Specific Admin Settings**: Added a new configuration panel inside `BankSettings.tsx` where CEOs can manage their CityCorp Developer Application credentials and see their exact Redirect callback URI (`/api/portal/:bankId/oauth/callback`).
- **Whitelabeled Client Verification Flow**: Updated `BankPortal.tsx` to display a beautiful Minecraft Verification card. Users can click "Verify with CityCorp" to redirect to the bank's own CityCorp OAuth app, verify, and receive automated, whitelabeled linkage. Shows active character names and Minecraft skin avatars natively.
- **Global Citizen Profiles**: Upgraded `CitizenPortal.tsx` and the `/api/citizen/lookup` endpoint to fetch and aggregate active, bank-specific linked Minecraft characters and whitelabel verified profiles globally across all Slate network institutions.
- **Automated Operations Engine**: Integrated `node-cron` daemon within the core server to evaluate and process automated daily cron jobs (e.g. `daily_processing_cron`) at `0 0 * * *`. The engine loops over all banks automatically generating daily interest for active loans and generating `SYSTEM` audit logs without manual endpoints.
- **Double-Entry General Ledger**: The system now properly auto-provisions internal `SYSTEM` accounts during bank creation (e.g., Vault Cash, Fee Revenue, Payroll Expense). Re-engineered the core `/transactions` endpoint to enforce 100% compliance with Double Entry accounting standards. User deposits now accurately shift balances from the `Vault Cash` Asset GL to the user's liability GL.
- **Granular RBAC Enforcements**: Implemented robust internal Role-Based Access Control (`requireRole`) middleware. Explicitly segregated sensitive endpoints (`/settings`, `/team`) to strictly enforce `owner` and `admin` roles, preventing unauthorized access by standard bank tellers or support members.

### July 1st 2026 Update
- **Whitelabel Application Configuration**: Synchronized the new Whitelabel OAuth endpoints into the Bank instance provisioning form (`BanksList.tsx`). Super-Admins now directly configure the CityCorp OAuth `cityCorpAppId` and `cityCorpAppSecret` during the bank's initial setup. Old configuration credentials have been explicitly rebranded as "Bot API Key".
- **Compliance & Fraud Module**: Deployed a dedicated "Compliance" Operations dashboard (`BankCompliance.tsx`) inside the bank portal. 
  - **Transaction Monitoring**: High-value transactions (over $10,000) are automatically marked as `isFlagged` inside the double-entry general ledger to support BSA/AML workflows, alerting bank compliance staff.
  - **Asset Freezing**: Bank accounts can now be given an `isFrozen` status, isolating suspicious deposits or stopping outflows. The Compliance UI allows for manual review and subsequent unfreezing of assets or resolution of flags.

### July 2nd 2026 Update
- **Finance-Grade CD Savings Vaults**: Upgraded the old savings vaults into an authentic, sophisticated "Certificates of Deposit" (CD) system. It features real-time accrued interest based on total days elapsed vs. total maturity days, projected maturity value calculations (using current interest rate/APR), and a visual maturity progress bar. Includes real-time risk mitigation displays showing early forfeit warnings and specialized redeem capabilities.
- **Official Print & PDF Exporting Engine**: Integrated client-side rendering overrides supporting instant print-to-PDF workflows for Bank Invoices and Ledger Statements. It features an automated `@media print` style injection that dynamically hides normal UI elements, scrollbars, and buttons, isolates only the formal, elegant corporate document container on a pristine white A4 background, and opens the native print dialog for pixel-perfect PDF rendering.
- **Unified CityCorp App Token Integration**: Streamlined the CityCorp bank provisioning and operator settings panels. Recognizing that CityCorp has unified both credentials into a single "App Token" (starting with `crp_`), we merged the previously redundant "Bot API Key" and "Application Secret" fields. The system now accepts a single unified App Token, automatically synchronizing it to both ledger sync (`corpApiKey`) and whitelabel OAuth flows (`cityCorpAppSecret`) under the hood to completely eliminate configuration confusion.
- **Global Instance Configuration Editor**: Introduced a safe, comprehensive **Modify Settings / Credentials** editor on the central `BanksList.tsx` super-admin panel. This interface permits super-admins to inspect, audit, and modify active bank credentials (including Guild ID, Corporation ID, Auth UUID, App Tokens, and Bot Tokens) in-place without risk of corrupting existing fields. Re-engineered the backend PUT endpoint `/api/banks/:id` to use a safe, patch-like update strategy that protects secrets from being accidentally cleared.
- **Unified Visual Formatting & Numbers Aesthetics**: Standardized the display of currency across the entire Slate platform. Introduced the custom `formatMoney` and `formatNumber` utilities under `src/lib/utils.ts`. Completely eliminated raw decimal formatting (`.toFixed(2)`) across all banking operations, including: the main Bank Overview cards, Account Details, Ledger History, Client and Citizen Portals, Transactions lists, Onyx settlements tables, and Printable A4 statements. Replaced raw balances with beautifully structured, comma-delimited currency elements, leveraging monospace fonts for exact digit alignment.
- **Pristine Demo Data Seeding Engine**: Engineered an automated "Populate Demo Data" module accessible via the bank's administrative overview and bulk tools panels. Designed to showcase Slate's features to prospective customers/bankers in roleplay communities, it clears existing tables for that specific bank instance and dynamically injects 5 verified customers, 9 multi-category accounts (checking, locked HY savings vaults, business, payroll), 10 historical transfers, active loans, locked savings vaults, cards, payroll configs, subscriptions, and active support tickets in a single click. Every generated number uses the unified financial currency formats for consistent elegance.

- **Next-Gen Premium Client Portal Redesign**: Extensively refactored `BankPortal.tsx` to align with the core Onyx aesthetic principles and modern neo-banking platforms:
  - **Static Compilable Brand Colors**: Created a brand-scheme mapper with Indigo, Emerald, Rose, Amber, and Zinc presets to solve compiled CSS dynamic interpolation failures and guarantee perfect, consistent visual brand pairing.
  - **Glassmorphism Header & User Controls**: Introduced a polished glass header with reactive profiles, real-time sync indicators, and floating authenticated states.
  - **Citizen ID Pass Card**: Redesigned the Minecraft whitelabel identity panel into a luxurious landscape-oriented physical passport card, complete with character skin avatars and intuitive verify buttons.
  - **Action Hub Tabbed Panel**: Replaced busy stacked forms with a sleek, interactive tabbed controller containing *Internal Transfers*, *Onyx Quick Pay*, and *Bill Pay / Invoices*, reducing clutter and prioritizing focus. Includes inline loaders and loaders.
  - **Luxurious Connected Cards**: Created ultra-realistic debit and credit card visuals featuring gold micro-chip details, holographic overlay textures, toggleable details visibility, and single-tap automated card locking.
  - **Real-Time Ledger Search**: Deployed instant client-side ledger filtering with incoming/outgoing status symbols and beautiful monospace tabular formatting.

- **High-Fidelity Remote Ledger Import Engine**: Re-engineered the backend bulk import service (`/api/banks/:bankId/import`) to auto-fill high-fidelity historical data:
  - **Mathematical Reconciliation Delta**: Each imported account dynamically receives 4 to 6 randomized transactions spanning 15 days (wages, utility, counter withdrawals, and Onyx checkout payments). The final transaction utilizes a perfect balance reconciliation delta to guarantee that the absolute ledger sum mathematically aligns with the remote CityCorp balance.
  - **Auto-Provisioned Debit Cards**: Every newly imported remote account is immediately provisioned with a custom virtual physical debit card (complete with security codes, card numbers, and expiration dates) to instantly populate the redesigned portal UI.
  - **Intelligent Customer Profiles**: Parses the remote account names to extract real Minecraft usernames and creates corresponding "KYC Approved" customer records if a valid Discord ID is present, creating linked profile states out-of-the-box.

### August 2026 Customer Portal Upgrades
- **Interactive Account Switcher & Filter Focus**: Added multi-account selection toggles in the bank client portal (`BankPortal.tsx`). Clicking any account card filters the real-time transaction ledger directly to that specific account or resets back to all accounts seamlessly.
- **Statement & Ledger CSV Export**: Introduced instant CSV data exporting on the transaction ledger. Users can export customized transaction histories (filtered by account, type, or search term) with formatted timestamps, transaction IDs, counterparty accounts, amounts, and memos.
- **Advanced Transaction Categorization & Filtering**: Added filter pill badges (`all`, `transfer`, `deposit`, `withdraw`, `payment`, `loan`) along with quick reset buttons for responsive financial auditing.
- **Enhanced Wire & Transfer Wizard**: Upgraded the capital transfer form with quick amount preset chips (`$10`, `$50`, `$100`, `$500`), intelligent account pre-selection matching the active focused account, optional transfer memo/reference parameters, and streamlined submission indicators.
- **Upgraded Card Controls**: Added inline account ID copying with single-click feedback, responsive card visibility toggles, and instant freeze/unfreeze actions.

### Whitelabel Custom Domains (Coolify Setup Guide)
To point custom client domains (e.g., `bank.mc-roleplay.com`) to a specific whitelabel bank instance inside Coolify, follow this architectural setup:

1. **DNS Configuration (Client-side)**
   - Have the whitelabel client create a **CNAME** record pointing their custom domain (`bank.mc-roleplay.com`) to your main application deployment domain (e.g., `slate.onyx-network.com`), or an **A Record** pointing directly to your Coolify server's public IP address.

2. **Coolify Traefik / Nginx Reverse Proxy Configuration**
   - Locate your application in the Coolify console.
   - Go to the **Settings** or **Domains** section of the service.
   - In the **Domains** field, Coolify supports comma-separated multiple domains. Append the client's custom domain to your main domain using a comma:
     `https://slate.onyx-network.com, https://bank.mc-roleplay.com`
   - Coolify will automatically provision a Let's Encrypt SSL certificate for the new domain and route its incoming HTTP/S traffic to your container.

3. **Backend Host headers Routing**
   - The application handles multi-tenancy dynamically. When a request hits your backend Express server, the server inspects the `Host` header of the incoming request (`req.headers.host`).
   - The system matches the domain to the associated bank in the database (via a custom domain mapping field in bank settings or matching the subdomain pattern) and dynamically serves that whitelabel bank's logo, color scheme, and credentials.





### July 3rd 2026 Update
- **Loans File Management**: Upgraded the `BankLoans.tsx` operations dashboard. Clicking on any loan row now triggers an interactive, detailed modal overlay. This "whole loan file" view displays complete borrower identity details, origination purpose notes, remaining vs. original balances, interest rates, status, and origination/payment dates, resolving issues where loans were previously unclickable.
- **Client Portal Loans Integration**: Introduced a new **My Loans** tab into the `BankPortal.tsx` (the neo-banking Client Portal). Clients can now view their active and pending loans, including remaining balances, origination principal, APR, and next payment dates directly within their financial Action Hub.

### Custom Domains & Coolify Whitelabel Routing
To route a custom domain for a whitelabel client to this application via Coolify:
1. **DNS Setup**: Instruct the client to create an `A` record pointing their custom domain (e.g., `bank.theircommunity.com`) to the IP address of your Coolify server.
2. **Coolify Configuration**:
   - Go to your application settings in the Coolify dashboard.
   - Under **Domains**, add the new custom domain (e.g., `https://bank.theircommunity.com`).
   - Coolify's Traefik/Caddy reverse proxy will automatically provision a Let's Encrypt SSL certificate and route incoming traffic for that domain to your application's internal port.
3. **Application Routing**: When traffic hits the server, the Express application inspects the `Host` header. If it matches a configured whitelabel domain in the database, it serves that specific bank's portal.

### Global Background Sync Engine
- **CityCorp Unified Sync Strategy**: Engineered a global `/api/banks/:bankId/sync` transaction synchronization endpoint that fully populates a bank's account ledger with up-to-date balances and multi-paginated transaction history from the remote game servers. This solves the previous requirement for granular manual refreshes and brings automated parity directly to the `BankAccounts.tsx` dashboard and the `BankTransactions.tsx` master ledger. 
- **Automated Silent Refresh**: When authorized bank staff navigate to the "Accounts" global index, the system dispatches a silent background sync operation to CityCorp. Any newly resolved ledger changes (deltas in account balance or unrecognized incoming/outgoing transactions) are silently injected into the Drizzle SQLite instance. The UI automatically re-fetches and patches the components without blocking the initial render, satisfying real-time tracking requirements immediately out-of-the-box.

### Financial Product Creation
- **Dynamic Lending & Credit Offerings**: Implemented the Product Creation modal (`BankProducts.tsx`). Bank administrators can now define specific parameter-driven products (e.g. Starter Loan, Infinite Cashback Credit Line) mapped directly to the `loanProducts` and `creditProducts` Drizzle tables. Allows defining exact variables such as Term Length, Base APR%, Maximum Disbursal Limit, and Rewards Percentages.

### Developer API Webhooks
- **Bank Events Egress Configuration**: Activated the "Add Endpoint" configuration flow in the `BankDeveloper.tsx` portal. System integrators and community script writers can specify an absolute URL (`apiWebhookUrl`) to receive standard RESTful POST requests directly from the Slate system, signed and encrypted with their secret API and Webhook keys. This opens up automated Slack/Discord notifications and remote application triggering.

### Security & Access Control
- **Hardened Admin Action Endpoints**: Completed a deep security audit of the API infrastructure. Hardened all high-stakes endpoints under the `developer` and `tools` routes (such as Webhook Configuration, API Key Rolling, Demo Data Seeding, Mass Purges, and Data Migrations) using `requireRole(["owner", "admin"])`. This ensures that standard bank tellers and agents cannot execute destructive actions or manipulate webhook egress vectors.

### Whitelabel Custom Domain Engine
- **Dynamic Hostname Interception**: Engineered a client-side and server-side domain resolution engine. The core `App.tsx` now inspects `window.location.hostname`. If it detects a non-native domain (e.g., `bank.clientdomain.com`), it halts the render, queries `/api/domain-lookup`, and dynamically renders the isolated `BankPortal` environment instead of the Global Admin dashboard, fully realizing the multi-tenant custom domain architecture.

### Security & Access Control
- **Hardened Admin Action Endpoints**: Completed a deep security audit of the API infrastructure. Hardened all high-stakes endpoints under the `developer` and `tools` routes (such as Webhook Configuration, API Key Rolling, Demo Data Seeding, Mass Purges, and Data Migrations) using `requireRole(["owner", "admin"])`. This ensures that standard bank tellers and agents cannot execute destructive actions or manipulate webhook egress vectors.

### Whitelabel Custom Domain Engine
- **Dynamic Hostname Interception**: Engineered a client-side and server-side domain resolution engine. The core `App.tsx` now inspects `window.location.hostname`. If it detects a non-native domain (e.g., `bank.clientdomain.com`), it halts the render, queries `/api/domain-lookup`, and dynamically renders the isolated `BankPortal` environment instead of the Global Admin dashboard, fully realizing the multi-tenant custom domain architecture.

### UI Refinements
- **Dismissible Demo Data Banner**: The "Populate Demo Data" banner in the Bank Overview now natively respects user access levels. It performs a silent role validation against the bank's staff team, ensuring it only renders for `owner` and `admin` roles. Administrators can also permanently dismiss the banner using the new close button, which stores the preference in the client's local storage.
- **Vite Host Header Relaxation**: Resolved Traefik "No available server" errors occurring when testing newly mapped custom domains (e.g. `testbank.azisle.com`) through Coolify. Updated the internal `vite.config.ts` to set `allowedHosts: true`, bypassing the strict Host validation that was silently rejecting incoming connections from non-primary whitelabel subdomains.

### Multi-Tenant Custom Discord OAuth2 Auth
- **Dynamic Credentials Interception**: Added `discordClientId` and `discordClientSecret` capabilities to the `banks` table schema. The `/api/auth/url` and `/api/auth/discord/callback` endpoints now inspect the incoming request's hostname. If a custom domain is detected (e.g. `testbank.azisle.com`), the auth routes dynamically substitute the global SaaS Discord credentials with the specific bank's provided Discord Application credentials.
- **Independent Bot Auth**: This ensures that users authenticating on a bank's custom domain are prompted to authorize that specific bank's brand, name, and bot image in the Discord OAuth flow, preserving the complete whitelabel illusion.

### Bug Fixes
- **Modal Scrolling Fix**: Resolved a layout overflow issue where the "Edit Bank" Configuration modal in the Global SaaS Admin interface (`BanksList.tsx`) could not be scrolled horizontally/vertically on smaller viewports or when numerous integration fields were exposed. Replaced standard screen flexbox layout with \`max-h-[90vh] overflow-y-auto\` containment.

### Code Quality Improvements
- **Resolved Sync Service Type Errors**: Fixed strict null-checking constraint violations inside `server.ts` related to `CityCorpClient` class instantiation and transaction synchronization payload maps (`description` and `corpApiUuid`).

### UI Improvements
- **OAuth Fields Visibility**: Ensured `Discord Client ID` and `Discord Client Secret` fields are fully visible and editable in both the Global SaaS provisioning/management modal (`BanksList.tsx`) and the Whitelabel Bank Settings page (`BankSettings.tsx`).

### UI Improvements - Continued
- **Modal Editing Support**: Fixed a missing replacement operation where the "Discord Client ID" and "Discord Client Secret" fields were accidentally omitted from the interactive "Edit Config" view within the Global SaaS Admin interface. They are now fully supported for bidirectional updates.
Updates to WIKI.md
- Shifted primary user identity architecture from Discord IDs to CityCorp Profiles (Citizen IDs).
- Discord integration is now treated as an optional linked account (linkedDiscordId) rather than the primary session driver.
- UI refactored globally to label user profiles as Citizen IDs.
Fixed 502 issue with server crashing.

## Custom CityCorp OAuth Configuration
Administrators can now provide a exact, custom pre-generated **CityCorp OAuth URL** directly from the CityCorp dashboard, bypassing the platform's automatic URL generation. This handles strict redirect URI requirements by matching the callback bank using the domain host or a single-bank fallback when the OAuth state is not JSON-encoded.

### Discord OAuth URI Consolidation & Flexible Identity Resolution
- **Unified Discord OAuth Callback**: Consolidated the Discord Login and Discord Account Linking flows into a single unified callback endpoint (`/api/auth/discord/callback`). The operation intent ("login" vs "link") is now securely passed via the OAuth2 `state` parameter from `/api/auth/url`. This reduces configuration complexity, requiring only a single **Redirect URI** to be configured in the Discord Developer Portal for both operations.
- **Flexible Identity Mapping ("Username or Discord ID")**: Evolved the account reassignment and customer creation workflows (e.g., "Update Owner", "Merge Customer"). The system now performs intelligent background resolution using `drizzle-orm` queries (`or(eq(discordId, input), ilike(mcUsername, input))`). This allows administrators and tellers to intuitively link or assign accounts using either a player's **Minecraft Username** or their direct **Discord ID**, significantly reducing friction when re-associating imported CityCorp transactions. This same flexibility applies to the **Bank Team (Staff Roster)**, allowing staff to be added securely via their Discord ID or Minecraft Username.

## Custom Domain Routing & Staff Portal Access
When a user accesses the platform via a custom domain or primary domain, staff can access their bank's management portal directly at `/bank/:bankId` (e.g., `https://vh.azisle.com/bank/1`).
- **Direct & Secure Access**: Staff members do NOT require access to the Global SaaS Admin panel. They can navigate directly to `/bank/:bankId`. The **Staff Admin Portal** button on the Client Portal is strictly hidden from regular citizens and unauthenticated visitors, only rendering when an authenticated session belongs to a verified staff member (`isStaff`) or Global Admin.
- **Multi-Provider Authentication**: The staff portal login screen supports both **CityCorp OAuth** (when configured) and **Discord OAuth**. Staff authenticate securely with their credentials.
- **Backend Access Control**: The `requireBankStaff` middleware validates the user's active session token against the `bankStaff` table for that specific `bankId` (or `globalAdmins`). Unauthorized users (regular citizens attempting staff access) are safely blocked with a clear access-denied screen (`403 Forbidden`).
- **Staff Link Sharing**: Bank owners can copy their bank's dedicated **Staff Portal Direct Login Link** directly from the **Team Management** page (`/bank/:bankId/team`) to share with their authorized team members.

## Recent Bug Fixes & OAuth Architecture
- **SQLite LIKE**: Drizzle SQLite does not natively support `ilike`. Replaced all occurrences of `ilike` with `like` for case-insensitive matching in SQLite.
- **Discord OAuth Callback on Custom Domains**: When a user links their Discord on a custom domain, the callback URL dynamically determines the `bankId` by inspecting the decoded OAuth `state` payload rather than relying on domain name parsing. This guarantees the correct `discordClientSecret` is selected for token exchange.
- **Staff Portal Routing**: The citizen dashboard routing on custom domains was updated to mount strictly on `/` instead of the greedy `/*` pattern, which was previously masking the `/bank/:bankId` nested router.
- **Staff Portal Visibility**: The visibility of the "Staff Portal" button in the citizen gateway evaluates access via `bankStaff` lookup strictly, disregarding `isGlobalAdmin` to prevent visual clutter for platform operators testing client portals.

## Custom Domain OAuth Redirect URI (Update)
- Replaced the proxy header domain extraction for \`getRedirectUri()\` with a more robust check that prioritizes the \`Referer\` header to correctly derive the true custom domain origin when users initiate the Discord OAuth linking flow. This avoids Cloud Run proxy overriding the \`Host\` header with the internal `.run.app` address and ensures Discord correctly matches the registered Redirect URI for custom bank bots.

## MEA Monthly Financial Institution Report Generator
Bank staff can access the dedicated **MEA Financial Institution Report** tool directly under **Operations** in the bank management navigation (`/bank/:bankId/mea-report`) or via the **Analytics & Reports** dashboard.
- **Official 5-Page Standard Compliance**: Formatted matching the exact MEA regulatory document layout, including Corporate Information, Executive Overview, Technical Disclosures, Consumer Financial Protections Q&A, Financial Disclosures (Income Statement, Loan Register, Collateral Register), Balance Sheet (Assets, Liabilities, Equity), and Certification Statement.
- **Automated Ledger Sync**: Clicking **Sync Ledger** automatically fetches real-time figures from the database:
  - Bank cash reserves & total deposits held
  - Active business/personal loan principal balances & accrued interest
  - Appraised collateral assets
  - Staff management team & authorized access list
  - Bank technical credentials & Discord links
- **Interactive Customization & Export**: Staff can review, edit, and override text fields or tabular values. Offers one-click **Print / Download PDF** with browser print media formatting (`@media print`), **Copy Markdown** for Discord/forum disclosures, and **Sync Ledger** for instantaneous database recalculations.

## Bot Maintenance Modes
- Two levels of Discord bot maintenance controls have been implemented:
  - **Global Bot Maintenance (`onyxSettings.globalBotMaintenance`)**: Available in the Global Admin Onyx Settings panel. Activating this forcibly stops all running bot instances across the entire platform and suspends provisioning for any new or restarting banks.
  - **Bank-Level Bot Maintenance (`banks.maintenanceMode`)**: Available in individual Bank Settings (under Security & KYC). Activating this will selectively power down the respective bank's Discord bot without affecting others on the network.

## API Secret Sanitization & Data Leakage Prevention
- **Pristine API Security Isolation**: Remediated a critical security vulnerability where raw database records from the `banks` table (exposing highly sensitive secrets like `discordToken`, `discordClientSecret`, `corpApiKey`, and `webhookSecret`) were returned in client-facing payloads.
- **Selective Role-Based Redaction**:
  - **Public Endpoint (`/api/portal/:bankId/info`)**: Completely public; has been strictly modified to sanitize the `bank` object, stripping out all sensitive integration and communication secrets before transmitting JSON.
  - **Authenticated Endpoint (`/api/banks`)**: Accessible to any logged-in user; has been rewritten to inspect the user's JWT payload. It now returns the full credential payload *only* if the authenticated requester is verified as a `isGlobalAdmin`. For regular citizens and non-admin customers, the response is dynamically redacted to contain only visual and branding metadata.


## Security Fixes & Authorization Controls
- **Direct Object Reference Hardening**: Fixed vulnerabilities in `pay-loan`, `loans/apply`, and `credit/apply` endpoints where the supplied `accountId` was not validated against the user's authenticated `discordId`. Endpoints now enforce `ownerDiscordId === req.user.discordId` checking, preventing unauthorized users from funding other accounts with loans or paying loans with unauthorized accounts.
- **Client-Side Authorization**: Verified that any client-side tampering of the React User State (e.g., forcing `isGlobalAdmin = true` in DevTools) is purely cosmetic and does not escalate actual privileges, as all sensitive operations are securely protected by JWT claims and `requireBankStaff` / `requireGlobalAdmin` backend middlewares.

## UX Improvements
- **Custom Domain URLs**: The "View Client Portal" button in the Bank Overview now natively links directly to the root of the custom domain (e.g. `https://bank.azisle.com/`) instead of using the parameterized path (`/portal/bankId`), delivering a cleaner white-label experience.
- **Bank Staff Portal Access & Custom Domain Login Flow**:
  - **Public Info Fetching**: `BankAdminLayout` now retrieves public bank branding and OAuth configuration from `/api/portal/:bankId/info` (which does not require authentication). Unauthenticated staff members navigating directly to `/bank/:bankId` or custom domain paths like `subdomain.azisle.com/bank/1` (or `/bank`, `/staff`, `/admin`) are immediately presented with the **Staff Portal Login** view (supporting both Discord and CityCorp OAuth options) rather than getting stuck on loading or 401 screens.
  - **Staff Status Recognition**: The portal lookup endpoint (`/api/portal/:bankId/lookup`) checks `isUserStaffOrAdmin` (validating both `bankStaff` table entries and `globalAdmins` privileges) and returns `isStaff: true` across all responses—even for staff members who do not hold customer bank accounts.
  - **Header & Card Navigation**: Verified staff members see a **Staff Admin Portal** button in the client portal header. Unauthenticated visitors are also provided with a direct **Staff Admin Portal →** link on the client authentication card.

## Cross-Tenant Escrow & Invoice Isolation (IDOR)
- **Invoice Status Updates**: Ensured that when a bank staff member updates the status of an invoice (`/api/banks/:bankId/invoices/:invoiceId/status`), the query strictly enforces `eq(invoices.bankId, req.params.bankId)`. This prevents a malicious staff member at Bank A from updating the state of an invoice belonging to Bank B by guessing its UUID.
- **Account Verification during Sync**: Re-verified that any endpoint fetching a user's account for processing (such as `/api/banks/:bankId/accounts/:accountId/sync`) strictly ensures the `bankId` of the account matches the `bankId` in the path, ensuring staff cannot peek at or manipulate accounts outside their tenant boundaries.

## Security & Architectural Hardening (July 2026)
- **CORS & CSRF:** Implemented dynamic CORS origin validation against registered bank custom domains and applied `sameSite: lax` to all authentication cookies.
- **Authentication:** Disabled the default `JWT_SECRET` fallback (app will crash if omitted). Shortened token lifetimes and added verified nonces to all Discord and CityCorp OAuth flows to prevent replay and CSRF attacks.
- **Rate Limiting:** Added a strict rate limiter (10 requests/minute) for all money movement (`/transfer`, `/onyx/checkout`) and authentication endpoints.
- **Data Privacy:** CVVs are no longer returned by any API endpoint (`/cards`). Card number generation relies entirely on `crypto.randomInt` rather than `Math.random()`.
- **Authorization:** Scoped destination-account lookups inside intra-bank transfers strictly to the originating bank ID to prevent cross-bank ID guessing. Validated that both source and destination accounts are active and unfrozen during all transfers.
- **Bot Security:** Implemented exponential backoff and locking for failed PIN attempts in Discord. Converted the node API hub secret check to use `hmac.compare_digest()` to prevent timing attacks.

## Architecture Updates - Security & OAuth (Jul 21 2026)
- **Token Revocation Fix**: Global admin status is now actively verified against the database during every request via the `requireAuth` middleware. If a user is demoted from Global Admin mid-token, their privileges are immediately revoked without needing to wait for the 1h token expiration.
- **Redirect URIs**: OAuth redirect URIs for Discord and CityCorp now exclusively derive from the configured Application URL (`APP_URL`) or the bank's explicitly verified `customDomain`. The fallback to HTTP request headers (`req.get('host')`) has been fully removed for security.
- **Encrypted Columns**: All sensitive database columns (including `discordToken`, `discordClientSecret`, `cityCorpAppSecret`, `apiKey`, and `webhookSecret`) in the `banks` and `thirdPartyApps` tables are now fully encrypted at rest using AES-256-GCM. Decryption happens automatically within the `drizzle-orm` custom types (`encryptedText`).

## Architecture Updates - Refactoring & Modularity (Jul 21 2026)
- **`server.ts` Refactoring**: The massive entrypoint was split into logical modules:
  - **`src/server/authRoutes.ts`**: Handles all OAuth flows (Discord & CityCorp), login, and session endpoints.
  - **`src/server/middleware.ts`**: Contains all authentication checks (`requireAuth`, `requireGlobalAdmin`, `requireBankStaff`, `requireRole`), API request authenticators, and helper utilities.
  - **`src/lib/cron.ts`**: Absorbed all recurring automated operations including loan interest accrual, recurring bank transfers, payroll, and CityCorp keep-alive pings.
  - **Result**: `server.ts` was reduced from ~900 lines to ~140 lines, focused purely on Express bootstrapping, rate limiting, Vite proxying, and initializing the Discord bot cluster.
- **Domain-Driven Routing (Jul 21 2026)**: The 5400-line `src/server/routes.ts` file was modularized using the "Separation of Concerns" principle. It is now split into multiple specialized Express Routers inside `src/server/routes/`:
  - `banks.ts`
  - `bot.ts`
  - `citizen.ts`
  - `global.ts`
  - `onyx.ts`
  - `portal.ts`
  - `v1.ts`
  These route handlers are combined in `src/server/routes.ts` and mounted onto the Express `app`.

## Client & Staff Features Update (Jul 21 2026)
- **Savings Vaults (Citizen Portal)**: Added a "Vaults" module where clients can lock funds for fixed periods (7, 30, 90, 180, 365 days) to earn high-yield interest (up to 12%). Includes strict backend logic for early withdrawal penalties (20% haircut).
- **KYC & Approval Queues (Staff Portal)**: The Bank Customers Directory now features inline KYC tracking (`pending`, `approved`, `rejected`). Staff can filter by KYC status and rapidly approve or deny applications.
- **Dynamic Brand Theming**: The `BankSettings` allow admins to select a `colorScheme` (Indigo, Emerald, Rose, Amber, Zinc). This is dynamically injected into the `BankPortal.tsx` to instantly re-theme the white-labeled custom domain for that specific bank's clients.
- **Citizen Lookup Data**: Implemented the robust `/api/citizen/lookup` endpoint that aggregates all relationships (Vaults, Cards, Invoices, Loans) across the entire platform for the global citizen gateway.

## Settings & Vaults Update (Jul 21 2026)
- **Dynamic Savings Vault Tiers**: Bank staff can now fully configure custom vault tiers (Lock Days, Interest Rate %, and Early Withdrawal Penalty %) in their Bank Settings. The Citizen Portal automatically fetches and respects these tier parameters dynamically when calculating deposits and maturity distributions, deprecating all hardcoded intervals and rates.
- **KYC Feature Toggles**: Enforced the `requireKyc` boolean from Bank Settings throughout the Bank Staff Portal. KYC status columns, filters, and approval/rejection actions are now conditionally rendered and cleanly hidden when KYC is disabled.

## Joint Accounts, Deep White-Labeling & Platform Billing (Jul 21 2026)
- **Joint & Corporate Accounts (`account_members`)**:
  - Implemented multi-user account membership schema allowing bank account owners to share management or view access with secondary citizens by Discord ID.
  - Role Permissions: `manager` (can initiate outgoing transfers on behalf of the account) and `viewer` (read-only access to account details and transactions).
  - API Endpoints: `POST /api/citizen/accounts/:accountId/members` to grant joint access with permission validation, `DELETE /api/citizen/accounts/:accountId/members/:memberId` to revoke joint access.
  - Citizen Portal UI: Features an interactive "Joint Access" modal on account cards showing active members, role badges, and invitation controls.
- **Deep White-Labeling (`loginBgUrl`)**:
  - Enhanced `bank_settings` schema with `loginBgUrl`.
  - Individual bank tenants can now specify a custom login background image URL in Bank Settings.
  - Custom tenant domains dynamically apply the configured login background to white-labeled client portals.
- **Rich Audit Trail Search & Filtering**:
  - Upgraded `BankAuditLog.tsx` with instant search capabilities (by Discord User ID, Action, or Details) and action type dropdown filters for bank staff and tellers.
- **Global Network Macro Analytics (`/api/onyx/network-analytics`)**:
  - Implemented macro-level analytics endpoint aggregating global platform transaction volumes, active tenant bank counts, merchant counts, and CityCorp API performance metrics.
  - Added an Onyx KPI Dashboard displaying real-time total transaction volume, active bank ratio, CityCorp call latency/volume, and total SaaS license fees collected.
  - Added a detailed CityCorp Integration API Usage & Performance breakdown displaying request volume, average response latency (ms), and success rates per endpoint (`/withdraw`, `/deposit`, `/balances`, `/lookup`).
- **Flexible Per-Bank SaaS Billing Models & Pricing Engine**:
  - Extended `banks` schema with bank-specific pricing fields (`billingModel`, `flatMonthlyRate`, `volumeFeePercent`, `profitSharePercent`, `perAccountRate`, `perTxRate`, `billingNotes`).
  - Supported SaaS Billing Models:
    1. **Flat Monthly Fee**: Fixed subscription rate ($/mo).
    2. **Volume Fee Percentage**: Tiered or flat percentage of processed transaction volume (e.g. 0.50%).
    3. **Profit / Revenue Share**: Percentage share of bank fees/earnings generated (e.g. 5.00%).
    4. **Per-Account Rate**: Base rate plus fee per active citizen account (e.g. $1.50 / user).
    5. **Per-Transaction Fee**: Base rate plus micro-fee per settled transfer (e.g. $0.25 / tx).
    6. **Hybrid Custom Model**: Multi-component formula combining flat base + volume % + profit share + per-account rates.
  - Endpoint `PUT /api/banks/:id/billing`: Allows Global Admins to set custom pricing parameters on a bank-by-bank basis.
  - Endpoint `GET /api/admin/banks/:id/calculate-billing`: Dynamically evaluates bank usage metrics (active accounts, 30-day transaction volume, estimated earnings, transaction count) and returns recommended invoice totals with itemized text breakdown.
  - Interactive Pricing Modal (`BanksList.tsx`): Includes a live billing model picker, customizable rate controls ($ / % / rates), and real-time monthly invoice projection.
  - SaaS Invoice Auto-Population (`GlobalSettings.tsx`): Selecting a bank when generating an invoice automatically populates the exact calculated amount and itemized breakdown description.

## Interactive Discord Channel GUIs & Staff Panels (Jul 21 2026)
- **Persistent Channel GUI Architecture**:
  - Replaced legacy slash-command workflow with persistent, button-driven channel embeds that mimic each bank's whitelabeled color scheme and brand identity.
  - Channels are bound via `bank_settings` (`guiChannelId`, `guiMessageId`, `staffChannelId`, `staffMessageId`).
- **Public Citizen GUI Embed (`buildPublicGUIEmbedAndComponents`)**:
  - Displays bank operational status, total customer accounts, and primary features.
  - Interactive Action Row Buttons:
    - 💰 **My Accounts / Balance**: View linked accounts, balances, and CityCorp sync status.
    - 💸 **Quick Transfer**: Interactive Modal prompt (`gui_transfer_modal`) to send funds instantly to any account name in the bank.
    - 📝 **Apply & Repay Loans**: Apply for loans via modal and interactively repay active loans with **💸 Repay Loan** buttons that deduct from personal balance and mark loans as settled.
    - 🎮 **In-Game Info & Sync Protocol**: Interactive Minecraft linking status card with 3D skin head avatar thumbnails (`https://mc-heads.net`), on-demand 6-digit sync codes (`/slate link <code>`), and in-game CityCorp commands.
    - 📜 **Recent History**: View the user's 15 most recent incoming and outgoing transactions.
    - ⚙️ **Identity & Settings**: Check Discord link and associated Minecraft character (`mcUsername`).
- **Staff Panel Embed (`buildStaffPanelEmbedAndComponents`)**:
  - Staff-only channel embed providing bank tellers and managers with one-click administrative controls.
  - Interactive Staff Action Row Buttons:
    - 📊 **Vault Overview**: System vault balance, total customer deposits, liquidity ratio, and CityCorp ID.
    - 📋 **Pending Loans**: Review active loan applications with one-click **Approve $X** and **Deny** buttons (`staff_approve_loan_*`, `staff_deny_loan_*`). Approving credit/loan automatically credits funds to the user's personal account and logs an audit trail.
    - 🔍 **Customer Search**: Interactive Modal prompt (`staff_search_modal`) to lookup any citizen by Minecraft username or Discord ID.
    - 💵 **Teller Transaction**: Interactive Modal prompt (`staff_teller_modal`) to deposit/withdraw funds to/from customer accounts with reason logging.
    - ⚙️ **Toggle Bank Status**: One-click toggle between Online and Maintenance mode.
- **Auto-Updating Background Sync**:
  - `BotManager` runs an automated background timer every 45 seconds that invokes `refreshBankChannelGUIs(bankId)` to edit existing Discord messages in real time.
  - Transactions, loan submissions, teller edits, and status changes trigger immediate embed updates to ensure data parity across Discord channels.
- **REST Spawner Endpoints**:
  - `POST /api/banks/:bankId/spawn-discord-gui`: Spawns or updates public or staff GUIs in a target Discord channel ID directly from the Bank Settings web portal (`BankSettings.tsx`).
  - `POST /api/banks/:bankId/refresh-discord-gui`: Triggers immediate background re-rendering of all active channel embeds for a bank.

## Dedicated Onyx PSP Discord Bot & Cross-Bank Clearinghouse (Jul 21 2026)
- **Separation of Concerns**:
  - Tenant Bank Bots are branded specifically to each bank (Bank A, Bank B, etc.) and handle internal account transfers, loan applications, and staff teller controls within that single tenant bank.
  - The **Onyx PSP Bot** is a global, dedicated clearinghouse bot operated directly by the Onyx Payment Service Provider network. It can route instant payments across any two tenant banks (**Bank A to Bank A**, or **Bank A to Bank B**).
- **Onyx PSP Global Embed (`buildOnyxGlobalEmbedAndComponents`)**:
  - Displays network-wide metrics: Total Connected Member Banks, Registered Merchant Terminals, Cleared Onyx Volume, B2B Clearing Fee (e.g. 2.00%), and Clearinghouse Operational Status.
  - Interactive Action Row Buttons:
    - 💳 **Pay Any Account**: Opens Modal (`onyx_modal_pay`) accepting Sender Account, Target Bank, Recipient Account Name/ID, Amount, and Memo. Instantly clears cross-bank ledger transfers and records `clearinghouse_settlements`.
    - 🏪 **Merchant Registration**: Opens Modal (`onyx_modal_merchant`) allowing Discord server owners/merchants to register their store on Onyx, generating a live API Key and linking a payout bank account.
    - 🔗 **Payment Link Generator**: Opens Modal (`onyx_modal_paylink`) to create an interactive cross-bank payment request button that any user from ANY bank can click to pay.
    - 🏦 **Member Banks Directory**: Lists all connected tenant banks, liquidity reserves, and online/maintenance status.
    - 🛒 **Merchant Directory**: Lists active registered Onyx storefronts with settlement bank IDs and payout account destinations.
    - 📜 **Inter-Bank Settlement Feed**: Live feed of the 10 most recent cross-bank clearinghouse settlements processed by Onyx.
- **Onyx Slash Commands (`registerOnyxCommands`)**:
  - `/onyx-pay <to_account> <amount> [to_bank] [memo]`: Execute a cross-bank payment.
  - `/onyx-banks`: View directory of member banks.
  - `/onyx-merchant-setup <store_name> <bank_id> <account_name>`: Express merchant terminal setup.
- **Global Web Portal Management (`OnyxSettings.tsx`)**:
  - Controls for saving the Onyx Bot Token, starting/stopping the bot, and spawning the Onyx PSP Channel Embed via `POST /api/onyx/spawn-bot-gui` or triggering live updates via `POST /api/onyx/refresh-bot-gui`.

## Personal vs. Business Account Identity & Prerequisites (Jul 21 2026)
- **Account Type Differentiation (`bank_accounts`)**:
  - `accountType`: Supports `personal` and `business` entities.
  - Business account metadata: `businessTaxId` (used to store the **In-Game Corp Name**, e.g. `CORP-X7F2D`) and `businessSector` (e.g. `General Commerce`, `Technology`, `Manufacturing`).
- **Personal Account Prerequisite Enforcement (`requirePersonalForBusiness`)**:
  - `bank_settings.requirePersonalForBusiness`: Configurable boolean setting per bank. When enabled (default `true`), citizens MUST open and own at least one active Personal Account in that bank before registering a Business Account.
  - Enforced server-side during self-service account registration (`POST /api/citizen/accounts/register`). If a user attempts to register a business account without an existing personal account in that bank, the server returns a 400 error: *"Bank Policy Violation: [Bank Name] requires you to open at least one Personal Account before registering a Business Account."*
  - Managed in Bank Staff Settings (`BankSettings.tsx`) under Security & KYC controls.
- **Citizen Account Switcher & Self-Service Registration (`CitizenPortal.tsx`)**:
  - Interactive Account Switcher filter pills: **All Accounts**, **👤 Personal Accounts**, and **🏢 Business Accounts**.
  - **Register Account Modal**:
    - Self-service account opening for any bank in the Slate network.
    - Choice between Personal Checking and Business Entity.
    - For Business entities, includes input fields for In-Game Corp Name and Business Sector/Industry.
    - Automatic provision of Onyx Merchant Storefront and Terminal API Key upon business account creation for instant store integration and payment processing.

## Strict Transfer Amount & Input Validation Security Patch (Jul 22 2026)
- **Patched Critical Negative/NaN Transfer Vulnerability (`portal.ts` & `v1.ts`)**:
  - **Citizen Portal Transfers (`POST /api/portal/:bankId/transfer`)**: Added strict validation `if (!Number.isFinite(amnt) || amnt <= 0) return res.status(400).json({ error: "Invalid amount" })` and blocked self-transfers (`fromAccountId === toAccountId`). Prevents malicious users from transferring negative amounts to invert transfer math and drain victim accounts.
  - **Public v1 Transfers API (`POST /api/v1/transfers`)**: Applied identical strict finite positive number checks (`!Number.isFinite(amnt) || amnt <= 0`) and blocked self-transfers. Prevents external API key holders from submitting negative or non-numeric amounts that corrupt account balances to `NaN`.
  - **Public v1 Account Creation (`POST /api/v1/accounts`)**: Validates initial deposit inputs (`parsedDeposit < 0` returns 400 error).
  - **Citizen Transfer & Loan Payment Endpoints (`citizen.ts`)**: Reinforced `/api/citizen/transfer` and `/api/citizen/pay-loan` with strict `Number.isFinite` and `> 0` checks.
- **Cross-Tenant Webhook Deletion (IDOR) Fix (`webhooks.ts`)**:
  - Scoped `DELETE /api/banks/:bankId/webhooks/:webhookId` and `GET /api/banks/:bankId/webhooks` queries strictly with `and(eq(discordWebhooks.id, webhookId), eq(discordWebhooks.bankId, bankId))`. Prevents bank staff from deleting or inspecting Discord notification webhooks belonging to another bank tenant.
- **Strict Hostname CORS Matching (`server.ts`)**:
  - Replaced unsafe `origin.includes(customDomain)` substring matching with exact URL hostname parsing (`originHost === domainHost`). Prevents attackers from using lookalike domains (e.g. `mybank.com.evil.com`) to bypass CORS checks and obtain credentialed cross-origin access.
- **CityCorp OAuth State Nonce Guard Fix (`authRoutes.ts`)**:
  - Updated `/api/auth/citycorp/callback` to enforce `parsedState.nonce !== expectedNonce` without the optional `parsedState.nonce &&` short-circuit guard. Re-instates CSRF state nonce verification for the CityCorp account linking flow.
- **Sanitized OAuth Callback Logging (`authRoutes.ts`)**:
  - Removed raw `req.query` logging from Discord and CityCorp OAuth callback routes (`/api/auth/discord/callback` & `/api/auth/citycorp/callback`). Prevents sensitive single-use authorization codes and state strings from being written to stdout/server logs.
- **Automatic Database Migration Runner (`src/db/index.ts`)**:
  - Added `migrate(db, { migrationsFolder })` from `drizzle-orm/better-sqlite3/migrator` to run automatically upon database initialization in `src/db/index.ts`. Ensures all tables (`payroll_jobs`, `recurring_transfers`, `banks`, etc.) exist before cron tasks and background pipelines execute, resolving `SqliteError: no such table` startup errors.

## CityCorp Corporation ID Finder & Inspector Utility
- **Interactive Corp ID Search Endpoint (`GET /api/banks/corp-finder`)**:
  - Engineered a dedicated search and inspection backend that scans all registered tenant banks and bank accounts across Slate Banking Platform to locate and cross-reference configured CityCorp Corporation IDs.
  - Integrates directly with the `https://api.cityrp.org/citycorp/corp/list` endpoint to search the global CityCorp registry using any active tenant API credentials.
  - Features a live **CityCorp API Ping Verifier** that pings `https://api.cityrp.org/citycorp/accounts/list?corp_id={id}` in real-time, verifying network connectivity, latency (ms), registered account counts, and sample account names for any candidate Corp ID.
- **Global Corp ID Finder (`Overview.tsx`)**:
  - A simple search utility added directly to the Onyx Network admin dashboard.
  - Allows global administrators to enter a corporation name and instantly retrieve its Corporation ID from the active database registry, avoiding unnecessary clutter in tenant-facing bank management views.

## Bank Instance Cascade Deletion Fix
- **Complete Cascade Cleanup (`DELETE /api/banks/:id`)**:
  - Resolved foreign key constraint failures when deleting a bank instance from the Global Admin panel.
  - The deletion endpoint now systematically stops any active Discord bot process and purges all child records across all dependent database tables (`transactions`, `vaultDeposits`, `cards`, `payrollJobs`, `subscriptions`, `invoices`, `loans`, `creditApplications`, `loanProducts`, `creditProducts`, `escrows`, `supportTickets`, `auditLogs`, `discordWebhooks`, `saasInvoices`, `cityCorpLogs`, `onyxMerchants`, `bankStaff`, `bankCustomers`, `bankSettings`, `clearinghouseBalances`, `clearinghouseSettlements`, `interBankTransfers`, `accountMembers`, `savingsGoals`, `paymentLinks`, `recurringTransfers`, and `bankAccounts`) before removing the main `banks` record.
  - Added user confirmation feedback and clear error handling alerts to the `BanksList.tsx` frontend component.

## Maintenance Mode Bot Presence Status Integration
- **Dynamic Discord Bot Status (`bot_manager.ts`, `bot_logic.ts`, `banks.ts`, `onyx.ts`)**:
  - When Maintenance Mode is enabled for a bank (or globally across all banks), the bank's Discord bot instance remains online to serve administrative and staff testing interactions while updating its Discord presence to `⚠️ Maintenance Mode` with a Do Not Disturb (`dnd`) status indicator.
  - When Maintenance Mode is cleared, the bot automatically resets its status back to `online` with custom activity set to `/bank | [Bank Name]`.
  - Added `updateBankBotPresence(bankId, isMaintenance)` to `BotManager` and integrated it across all API endpoints, background periodic update timers, and staff panel toggle interactions.

## Bank Overview UI Refactoring
- **Removal of Demo Data Banner (`BankOverview.tsx`)**:
  - Removed the "Showcasing Slate? Populate realistic demo data!" banner and associated local storage state from the top of the Bank Overview page for a cleaner, production-ready dashboard interface.

## Whitelabel CityCorp OAuth Integration & Dynamic Domain Handling
- **Dynamic Authorization URL Generator (`citycorp_api.ts`, `authRoutes.ts`, `portal.ts`)**:
  - Implemented `buildCityCorpAuthUrl(bank, redirectUri, state)` to dynamically parse and inject the bank's custom domain redirect URI (`https://${bank.customDomain}/api/auth/citycorp/callback` or request host) regardless of the custom authorization URL supplied in Bank Settings.
  - Expanded required authorization scopes to cover full player transaction capabilities:
    `corp.player.info.get,corp.account_transactions.get,corp.account_money.transfer,corp.account.deposit,corp.account.withdraw`
  - Ensured seamless OAuth state nonces and parameter propagation across all client authentication routes.

## Coolify Multi-Stage Docker Build Optimization
- **Pruned Single-Pass Module Compilation (`Dockerfile`)**:
  - Replaced the redundant double `npm install` in the runner image with a single-pass `builder` stage that compiles native C++ modules (such as `better-sqlite3`) and runs `npm prune --omit=dev`.
  - The runner stage directly copies pre-compiled `node_modules` from the builder stage, eliminating native module build failures, `--force` flag errors, and container timeouts during Coolify deployment.

## Direct SQLite (.db / .sqlite / .sql) Migration Engine
- **Direct SQLite Upload & Parsing (`/api/banks/:bankId/tools/sqlite-migration`, `BankTools.tsx`)**:
  - Implemented direct binary `.db` database file and `.sql` script dump ingestion for banks migrating from legacy bots/frameworks.
  - Automatically handles binary base64 decoding and safe server-side query processing using `better-sqlite3`.
  - Parses and maps legacy table structures: `accounts`, `loan_products`, `loans`, `loan_applications`, `transactions`, `invoices`, and `payroll_entries`.
  - Restores accounts, customer KYC notes, double-entry ledger history, active loan terms, credit applications, invoices, and recurring payroll jobs atomically into Slate Banking Platform.
  - Displays a detailed visual breakdown badge summary (Accounts, Customers, Ledger Transactions, Loans, Loan Products, Invoices, Payrolls, and Detected Tables) in the Bank Tools operator interface.

## Global Admin Access & Secure Authentication
- **Multi-Provider Global Admin Login (`DashboardLayout.tsx`, `authRoutes.ts`)**:
  - Streamlined the restricted Control Center landing view with clean, production-grade authentication: **Sign In with Discord (Global Admin)** and **Sign In with CityCorp**.
  - **Auto-Seeding First System Admin**: When `global_admins` database table is empty, the first user logging into the Control Center is automatically seeded as a primary `globalAdmin` to guarantee platform owners are never locked out.
  - **Operator Quick Access Deprecation from UI**: Removed the backdoor "Operator Quick Access" elevation button and related UI prompts from `DashboardLayout.tsx` in favor of standard, secure Discord OAuth verification and role validation against `global_admins`.
  - **Account Switching on Access Denied**: If an authenticated non-admin user arrives at the Control Center, they are presented with an elegant unauthorized badge displaying their profile information and a 1-click **Sign Out & Switch Account** action, eliminating account lockouts and dead ends.

## Citizen Portal Discord Identity Linking & Manual Account Association
- **Unified Discord Linking Engine (`CitizenPortal.tsx`, `AuthContext.tsx`, `authRoutes.ts`)**:
  - Added a prominent **Link Your Discord Account** banner and modal in `CitizenPortal.tsx` for users authenticated via Minecraft/CityCorp (`mc_...`).
  - **OAuth Linking (`intent=link`)**: Executes OAuth authorization with `intent=link`, reading the existing session token and automatically re-linking `bankCustomers` (`discordId` and `linkedDiscordId`), `bankAccounts` (`ownerDiscordId`), `cards`, `loans`, `invoices`, and `transactions` to the verified Discord ID.
  - **Manual ID Linking (`POST /api/citizen/link-discord-manual`)**: Allows citizens to directly submit their numeric Discord User ID or handle (@Username) from the portal, remapping all associated financial ledger records and issuing a refreshed JWT cookie instantly.

## Administrative Profile Editing & Customer Re-linking for Bank Staff
- **Staff-Controlled Customer Mapping (`BankCustomerDetail.tsx`, `banks.ts`)**:
  - Updated `POST /api/banks/:bankId/customers/:discordId/profile` to accept and set `linkedDiscordId` and `mcUsername`.
  - Updated `BankCustomerDetail.tsx` under Administrative Profile to provide staff with editable fields for **Linked Discord ID** and **Minecraft Username**, allowing bank staff to manually associate, reassign, or verify unassigned customer accounts.

## Dynamic Balance Reconciliation, Ledger Recalculation & Account Top-Up Engine
- **Accurate Local Ledger Recalculation & Reconciliation (`/api/banks/:bankId/transactions/sync`, `/api/citizen/sync-balances`, `/api/banks/:bankId/accounts/:accountId/sync`)**:
  - Upgraded the synchronization pipeline to perform strict double-entry ledger reconciliation. External CityCorp API reconciliation is attempted first when credentials are provided.
  - **Multi-Page Transaction Import**: Syncing now pulls all pages of remote account transactions via `getAllAccountTransactions()` rather than limiting to page 1, ensuring complete remote transaction coverage for double-verification.
  - **Ledger Double-Verification**: All local and newly fetched remote transactions are saved and verified (`net = sum(inflows) - sum(outflows)`).
  - **No Unsolicited Auto-Seeding**: Syncing performs pure reconciliation and does NOT inject unrequested funds into $0 balance accounts. Accounts with $0 balances remain $0.
  - **Opening Balance Baseline**: For accounts created or imported with positive balances but 0 transaction records, syncing inserts a single `Opening Account Balance` deposit transaction to anchor the transaction history baseline without modifying the numerical balance.
  - **Automatic Deduplication & Cleanup**: Automatically deduplicates CityCorp remote sync calls by matching both transaction IDs and composite keys (`type_amount_description`). Also cleans up duplicate balance sync records from prior legacy sync attempts.
- **Staff Manual Balance Adjustments (`POST /api/banks/:bankId/accounts/:accountId/adjust-balance`, `BankAccounts.tsx`)**:
  - Implemented secure staff-controlled balance adjustment endpoint supporting `set`, `deposit`, and `withdraw` actions.
  - Generates atomic ledger transaction records for every adjustment to prevent ledger drift and maintain double-entry audit history.
  - Added an **Adjust Balance** modal and row action button (`$`) directly in `BankAccounts.tsx`.
- **Citizen Portal Balance Sync & Top-Up Modal (`POST /api/citizen/deposit-funds`, `CitizenPortal.tsx`)**:
  - Added a **Sync / Top-Up Balances** action button in the Citizen Portal header and a **Top-Up** button on every account card.
  - Opens a dedicated modal allowing citizens to run instant balance auto-syncs or execute direct explicit account deposits with custom descriptions and quick preset amounts (+$500, +$1,000, +$5,000).

## Session Persistence & "Remember Me" Authentication
- **Long-Lived Session Tokens (`src/server/authRoutes.ts`, `src/lib/AuthContext.tsx`)**:
  - Implemented a **"Remember me on this device"** toggle option across all authentication entry points (Bank Staff Portal, Slate Control Center, Citizen Portal, and Payment Links).
  - **30-Day Persistent Token**: When "Remember Me" is enabled (default checked), the system signs JWT session tokens with a **30-day expiration (`30d`)** and sets the `auth_token` HTTP cookie `maxAge` to 30 days (`30 * 24 * 60 * 60 * 1000`), preventing users from having to frequently re-authorize.
  - **Single-Session Fallback**: When unchecked, authentication issues a short-lived 24-hour token (`24h`) for secure temporary or shared device access.
  - **Client Persistence**: User preference is stored in `localStorage` under `slate_remember_me` and automatically passed to the OAuth state pipeline (`/api/auth/url?rememberMe=true/false`).

## Throttled Background Sync Job Engine, In-Game Verification & Account Provisioning
- **Asynchronous Background Job Engine (`src/server/sync_jobs.ts`)**:
  - Replaced synchronous bulk sync loops with an asynchronous background task queue (`startBankSyncJob`, `startCitizenSyncJob`) to eliminate infinite loading spinners, server timeouts, and CityCorp API rate-limiting issues.
  - **Throttled CityCorp API Queries**: Enforces a mandatory `250ms` delay between sequential account API checks, preventing rate limits and API bans when syncing large account lists.
  - **Progress Tracking APIs (`GET /api/banks/:bankId/sync-job/:jobId`, `GET /api/citizen/sync-job/:jobId`)**: Provides live real-time job progress tracking (`processed`, `total`, `currentAccountName`, `syncedCount`, `flaggedCount`, `status`).
  - **Frontend Progress Bar**: Integrated real-time animated progress bars and percentage counters in both `BankAccounts.tsx` and `CitizenPortal.tsx`.
- **In-Game Account Verification & Multi-Tier Fuzzy Account Matching (`bankAccounts` Schema, `src/lib/citycorp_api.ts`, `src/server/sync_jobs.ts`)**:
  - Added `existsInGame` (boolean), `lastSyncedAt` (timestamp), and `syncError` (text) columns to `bankAccounts`.
  - **Response Structure Normalization (`CityCorpClient.listAccounts()`)**: Normalized all API responses from `/accounts/list` to guarantee callers receive a standardized `{ accounts: [...] }` array regardless of whether CityCorp returned top-level arrays, wrapped `data`, or `results`.
  - **Pure Account Name Matching (`matchAccountNames`)**: Decoupled in-game CityCorp account matching from Discord IDs (since the CityCorp in-game API only returns account names, UUIDs, balances, and transaction histories). Implemented clean name normalization that compares account names directly (Exact case-insensitive match -> Cleaned alphanumeric match stripping type suffixes like `_checking`/`_savings` -> Substring match -> Direct API fallback query), matching imported accounts accurately without relying on or parsing Discord ID strings.
  - **Safe Import & DB Synchronization**: Preserves imported SQLite database accounts as valid, active local bank accounts while updating balances for matched in-game corporate accounts.
  - **Auto-Import In-Game Accounts Button (`POST /api/banks/:bankId/import`, `BankAccounts.tsx`)**: Added an **"Auto-Import In-Game Accounts"** button in `BankAccounts.tsx` to automatically pull and populate all corporate accounts directly from CityCorp in-game with full transaction histories and debit cards, assigning imported accounts clean `ownerDiscordId: "imported"` placeholders until players link their Discord accounts.
  - **Network & Credential Guardrails**: Differentiates actual account missing states from API connection, authorization, or rate-limiting errors, keeping `existsInGame` intact when API errors occur and displaying descriptive `syncError` messages instead of falsely flagging accounts.
  - Accounts confirmed as missing on CityCorp render prominent `⚠️ Not Found In-Game` badges in `BankAccounts.tsx`, `BankAccountDetail.tsx`, and `CitizenPortal.tsx`.
- **Manual Corporate Account Provisioning (`POST /api/banks/:bankId/accounts/:accountId/provision-game`)**:
  - Added a manual **"+ Provision in Game"** endpoint and action button on flagged accounts in both `BankAccounts.tsx` and `BankAccountDetail.tsx`.
  - Calls `CityCorpClient.createAccount(accountName)` to provision the corporate account in-game via CityCorp, establishing the missing remote account, setting `existsInGame = true`, and clearing sync flags automatically.
- **Comprehensive CityCorp Bank Accounts API Coverage (`src/lib/citycorp_api.ts`)**:
  - **Base URL Alignment (`https://api.cityrp.org/citycorp/corp`)**: Corrected base URL pathing in `CityCorpClient` to route all account operations under `/citycorp/corp/*`, resolving 404 errors on `/accounts/list`.
  - **Player Resolution & Account Ownership (`src/server/player_resolver.ts`)**: Implemented a comprehensive multi-fallback player resolution service. When importing CityCorp accounts, the system securely resolves the first subuser on the account as the true account owner, resolving their Minecraft UUID to a human-readable username via local DB caches, CityCorp's player API, and fallback Mojang/Ashcon APIs. This replaces raw Discord IDs with exact Minecraft Usernames in the accounts table.
  - **Account Type Classification**: Differentiates personal vs. business accounts automatically. Staff can now edit the owner and account type (`personal`, `business`, `payroll`) dynamically via a new `update-account` endpoint directly in the `BankAccountDetail` view.
  - **Native Endpoints**: Fully aligned `CityCorpClient` with official CityCorp API documentation:
    - `GET /corp/accounts`: `getAccountDetails(accountName)`
    - `POST /corp/accounts`: `createAccount(accountName)`
    - `DELETE /corp/accounts`: `deleteAccount(accountName)` (triggers remote deletion when local staff delete in-game accounts)
    - `GET /corp/accounts/list`: `listAccounts(page)` & `fetchAllAccounts(maxPages)`
    - `PATCH /corp/accounts/deposit`: `deposit(accountName, amount)`
    - `PATCH /corp/accounts/withdraw`: `withdraw(accountName, amount)`
    - `PATCH /corp/accounts/transfer/account`: `transferToAccount(accountName, amount, receiverCorpId, receiverAccountName)`
    - `PATCH /corp/accounts/transfer/corp`: `transferToCorp(accountName, amount, receiverCorpId)`
    - `PATCH /corp/accounts/fees`: `setAccountFee(accountName, feeType, fee)`
    - `GET /corp/accounts/subusers/list`: `listSubusers(accountName, page, includeCorpOwner)`
    - `POST /corp/accounts/subusers`: `addSubuser(accountName, subuserUuid)`
    - `DELETE /corp/accounts/subusers`: `removeSubuser(accountName, subuserUuid)`
    - `GET /corp/accounts/transactions`: `getTransactionById(accountName, transactionId)`
    - `GET /corp/accounts/transactions/list`: `getAccountTransactions(accountName, page)` (paginated listing with fallback)

### 🌐 Official CityRP API v1.0.0 (OAS 3.0) Integration Standard

Slate Banking Platform integrates natively with the official CityRP API specification (OAS 3.0 / `https://api.cityrp.org`).

#### 1. Core Services & Base URLs
- **Auth API (`https://api.cityrp.org/auth`)**: OAuth 2.0 authorization code exchange service (`POST /auth/token`). Used exclusively when an application needs permission to act on behalf of another consenting player.
- **CityCorp API (`https://api.cityrp.org/citycorp`)**: Corporation management, banking accounts, player profiles, economy, stocks/IPOs, tasks, shops, and real-time WebSockets.
  - Corporation operations: `https://api.cityrp.org/citycorp/corp/*`
  - Player profile: `GET https://api.cityrp.org/citycorp/player` (Basic Auth)
  - Live Event Stream: `wss://api.cityrp.org/citycorp`
- **CityRealty API (`https://api.cityrp.org/cityrealty`)**: Property and plot management (`/plot/*`, `/player`, and WebSocket `wss://api.cityrp.org/cityrealty`).

#### 2. Token Types & HTTP Basic Authentication
CityCorp and CityRealty use HTTP Basic Authentication for all requests. The username identifies the account owner, and the password specifies the credential:
- **`crp_...` (App Token)**: Generated in the CityRP Developer Dashboard. Normal private API credential. Unrestricted by OAuth scopes. Authenticates the owner directly (`Basic BASE64(minecraft_uuid:crp_...)`). **Required for WebSocket event streams**.
- **`crpoa_...` (OAuth Token)**: Issued by the Auth API after a player authorizes an application. Scoped token representing that player's permission grant. Authenticates on behalf of that player (`Basic BASE64(authorizing_uuid:crpoa_...)`). Scopes are strictly enforced.

#### 3. Delegated OAuth 2.0 Flow
1. **Authorize Request**: Player is directed to:
   ```
   https://dashboard.cityrp.org/authorize?app_id={APP_ID}&redirect_uri={REDIRECT_URI}&scopes=corp.player.info.get,corp.info.get&state={CSRF_TOKEN}
   ```
2. **Callback Handling**: After approval, the user is redirected to `redirect_uri` with:
   ```
   https://yourserver.com/callback?client_secret={AUTH_CODE}&state={STATE}
   ```
   *Notice*: The one-time authorization code is transmitted in the `client_secret` query parameter (valid for 10 minutes).
3. **Token Exchange**: Server executes a backend POST:
   ```http
   POST https://api.cityrp.org/auth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&client_secret={AUTH_CODE}&app_id={APP_ID}&token={APP_TOKEN}
   ```
4. **Token Response**:
   ```json
   {
     "token": "crpoa_...",
     "token_type": "Basic",
     "scope": "corp.player.info.get,corp.info.get",
     "minecraft_uuid": "a8098c1a-f86e-11da-bd1a-00112444be1e"
   }
   ```
5. **API Calls with Scoped Token**:
   ```http
   GET https://api.cityrp.org/citycorp/player
   Authorization: Basic BASE64(minecraft_uuid:crpoa_...)
   ```

#### 4. Official Scopes Reference
Scopes use a dot-separated naming convention:
- `corp.player.info.get`: Read player info from CityCorp
- `corp.info.get`: Read corporation data
- `corp.staff.write`: Modify corporation staff
- `corp.account.create`: Create a corporation account
- `corp.delete`: Delete a corporation
- `realty.player.info.get`: Read player info from CityRealty
- `realty.plot.info.get`: Read plot information

#### 5. Pagination Standard
- All paginated endpoints are **one-based** (`page=1`). Values `0` and negative numbers are clamped to `1`.
- Requesting pages beyond the end clamps to the final page.
- Standard pagination envelope:
  ```json
  {
    "corps": [ ... ],
    "currentPage": 1,
    "totalPages": 64,
    "totalCorps": 636
  }
  ```
- Most endpoints return 10 records per page; `GET /citycorp/items/list` returns 200.

#### 6. Live Events (WebSocket Stream)
- **Endpoint**: `wss://api.cityrp.org/citycorp`
- **Handshake Authentication**: Requires `Authorization: Basic BASE64(minecraft_uuid:appToken)`.
- **Token Rule**: Only normal `crp_...` app tokens are accepted; scoped OAuth tokens are explicitly rejected.
- **Event Envelope**:
  ```json
  {
    "type": "EVENT_TRIGGERED",
    "name": "CorpDepositEvent",
    "event": { ... }
  }
  ```
- **31 Registered CityCorp Event Types**:
  1. `CorpAdvertiseEvent`
  2. `CorpCreatedEvent`
  3. `CorpDisbandEvent`
  4. `CorpTransferOwnershipEvent`
  5. `CorpAccountChangeEvent`
  6. `CorpAccountCreateEvent`
  7. `CorpAccountDeleteEvent`
  8. `CorpAccountDepositEvent`
  9. `CorpAccountWithdrawEvent`
  10. `CorpDemoteEvent`
  11. `CorpFireEvent`
  12. `CorpHireEvent`
  13. `CorpPromoteEvent`
  14. `CorpResignEvent`
  15. `CorpDepositEvent`
  16. `CorpWithdrawEvent`
  17. `CorpDescriptionChangeEvent`
  18. `CorpDiscordChangeEvent`
  19. `CorpHQChangeEvent`
  20. `CorpShopCreateEvent`
  21. `CorpShopDeleteEvent`
  22. `CorpDelistEvent`
  23. `CorpDividendChangeEvent`
  24. `CorpIPOEvent`
  25. `StockSellEvent`
  26. `StockTransferEvent`
  27. `CorpTaskClaimEvent`
  28. `CorpTaskCompleteEvent`
  29. `CorpTaskCreateEvent`
  30. `CorpTaskDeleteEvent`
  31. `ShopChangeEvent`
- **Automated Yields**: Added an interactive "Interest Engine" page in the Bank Staff Portal under Operations. 
- **Bank-Level Configuration**: Bank Managers and Admins can configure the Base APY Yield (in basis points), minimum balances, max balance caps, and target account types (Savings, Personal, Business, or All).
- **Manual Trigger**: Bank staff can currently run the interest accrual manually from the UI. When triggered, the system automatically loops through all eligible active accounts (excluding system accounts) and securely calculates and deposits the configured APY directly into the accounts.
- **Account-Level Overrides**: Added `customApyPercent` to the `bankAccounts` schema so that specific VIP accounts can override the bank's base APY.

### Account Tiers System
- **Tier Configuration**: Banks can toggle the "Custom Account Tiers" feature in the Settings page or directly configure tiers in the "Account Tiers" page under "Products & Services". Saving account tiers automatically activates the feature for the bank.
- **Granular Rulesets**: Within the Account Tiers UI, bank staff can create tiers (e.g., Gold Savings, Premium Checking) customized with a monthly fee, minimum balance requirements, and custom APY/transfer/deposit/withdraw fee percentages.
- **Private Tiers**: Tiers can be marked as "Private (Staff Only)". Private tiers are ignored by public catalog and automated tier assignment logic when citizens register new accounts, ensuring they are strictly handed out by bank staff.
- **Customer Portal Integration**: The Customer Portal (`BankPortal.tsx`) pulls available tiers directly from the bank's configuration (`/api/portal/:bankId/info` and `/api/portal/:bankId/catalog`). When custom account tiers exist, the "Open an account" form dynamically renders each tier option complete with fee, yield (APY), category, and perk summaries, and automatically associates the created account with the designated `tierId`.
- **Dynamic Tier Registration**: If a bank has public tiers enabled, the registration flows automatically present the dynamic list of available public tiers, allowing users to choose an upgraded tier immediately upon opening an account.
- **Customer Upgrades**: Citizens can upgrade their existing account's tier directly from their customer portal. An "Upgrade" button is displayed on eligible account cards, which opens a modal allowing them to select a new public tier of the same account type.
- **Account Creation Support**: When creating or provisioning new bank accounts manually via the staff portal or customer portal, the selected tier is seamlessly linked if Account Tiers are configured.
- **Tier Reassignment**: Staff can manually reassign an existing account's tier at any point directly from the account's details page by clicking the edit icon next to the tier name.
- **Transaction Engine Integration**: The citizen transaction engine inherently supports these customized configurations. Transfer logic overrides the bank's default transfer fees with the tier's custom rates if assigned.

### Multi-Tenant Domain Routing (Subdomains)
- **Domain Lookups**: The application evaluates `window.location.hostname` to resolve customized domains to specific banks.
- **Root Domains Skip Logic**: Domains such as `localhost`, `127.0.0.1`, `.run.app` instances, and specifically the naked `onyx-network.com` domain bypass the domain lookup and use the primary platform routers. 
- **Subdomain Catch-All**: Using subdomains (like `mybank.onyx-network.com`) triggers the custom domain lookup flow, retrieving the bank details and mounting the localized Client Portal experience.
- **Fail-safe Loading**: If an unknown or unmapped domain accesses the client portal, it safely exits out of the "Loading financial gateway" state into a "Bank Not Found" fallback error screen to avoid infinite loading spinners.

### Environment & Domain Configuration
- **Root Domain Bypass**: The primary platform application bypasses custom domain routing for `localhost`, `127.0.0.1`, Google Cloud Run URLs (`*.run.app`), and specifically the platform roots `sb.azisle.com`, `azisle.com`, and `www.azisle.com`.
- **Database Migrations**: In production environments without explicit `npm run db:push` usage, the platform relies on `src/db/index.ts` executing automatic structural checks (`ensureDatabaseSchemaSynced`). Whenever new columns are added to `src/db/schema.ts`, they MUST be registered inside `ensureDatabaseSchemaSynced` or else DrizzleORM will throw exceptions when querying.

### Global Audit System (Eye of God)
- **Extreme Optimization**: API request telemetry and event logs are handled asynchronously via the `GlobalAuditManager` (`src/server/globalAudit.ts`). To prevent I/O blocking during API requests, logs are held in-memory and flushed in batches (bulk inserts) to the SQLite `global_audit_logs` table every 2 seconds or when the queue hits 500 entries. 
- **Global Middleware**: Attached directly to the root Express app in `server.ts`, logging API paths, status codes, actor Discord IDs (pulled from JWTs), execution latency (ms), and IP addresses. 
- **Global Admin Access Only**: The real-time viewer interface for these telemetry points is secured at `/eye-of-god` within the Global Admin Dashboard.

## Data Snapshots (Downloads)
As of the latest update, both Global Admins (via the Banks list) and Bank Admins (via Bank Settings) can download a full snapshot of a bank's data.
- The snapshot endpoint is `GET /api/banks/:id/snapshot`.
- It returns a JSON dump encompassing the entire bank's data, accounts, transactions, and customers, which serves as a highly portable backup or audit log.

## Global Sanctions and Announcements
*Schema structures for \`global_sanctions\` and \`global_announcements\` have been added to the database to support upcoming system-wide enforcement and broadcast tools.*

## Bot Fleet Management
Global Admins have access to the Bot Fleet Management panel in Global Settings to monitor the connection status of all provisioned Discord bots across the network.

## Clearinghouse Global Views
A Global Clearinghouse Balances panel has been added to Global Settings, allowing Global Admins to view all Onyx Clearinghouse balances centrally without navigating to each bank's portal.

## Customer Directory Resolution & Account Imports (Jul 31 2026)
- **Account Import Schema Migration (`custom_apy_percent`)**: Registered `custom_apy_percent` in `src/db/index.ts` (`ensureDatabaseSchemaSynced`) so imported account records with account-level APY overrides run smoothly without SQLite column errors.
- **Customer Identity Resolution (`/api/banks/:bankId/customers`, `BankCustomers.tsx`, `BankCustomerDetail.tsx`)**:
  - Automatically resolves player identifiers across `bankAccounts`, `bankCustomers`, and `users` tables.
  - When account owners are imported from in-game (where `ownerDiscordId` stores the player's Minecraft username, e.g., `Nopuu`, `SaintSoren`, `Jani_54_`), the system resolves the Minecraft username as the primary display name (**Nopuu**).
  - Displays secondary metadata (e.g. `Discord: <id>` or `In-Game Customer`) below the primary name, resolving the earlier inverted label layout.
  - Updated individual customer detail view (`BankCustomerDetail.tsx`) header title to display the resolved Minecraft username.

## Ledger & Invoices Username Resolution (Jul 31 2026)
- **Resolved Username Pipeline (`resolveAccountAndUser` in `banks.ts`)**:
  - Updated `/api/banks/:bankId/transactions` and `/api/banks/:bankId/invoices` endpoints to resolve account IDs (`fromAccountId`, `toAccountId`, `billerAccountId`, `customerAccountId`) to actual player Minecraft / Discord usernames and account names.
  - **Ledger & History View (`BankTransactions.tsx`)**: Replaced raw transaction/account UUID strings (`ID: 661677b1...`) with clear player usernames and account types (e.g., `Nopuu (Checking)` or `Cofys → Jani_54_`).
  - **Invoices View (`BankInvoices.tsx`)**: Replaced truncated account ID snippets (`acc_12345...`) in the Biller and Customer columns with resolved player usernames and account labels.
  - **Draft New Invoice Form (`BankInvoices.tsx`)**: Replaced manual UUID text input fields with intuitive account selectors listing player usernames, account names, and available balances.
  - **PDF Printable Invoice**: Updated biller and customer addresses in printable PDF documents to output resolved usernames and account names instead of generic account ID placeholders.

## Bank Portal & Citizen Lookup Identity Resolution (Jul 31 2026)
- **Central User Resolver (`src/server/userResolver.ts`)**:
  - Implemented `getUserCandidateIdentifiers(req, bankId?)` to resolve all candidate identity strings associated with an authenticated session user.
  - Candidate sets seamlessly blend `req.user.discordId`, `req.user.username`, stripped Minecraft UUIDs (`mc_<uuid>` -> `<uuid>`), linked Discord IDs, Minecraft usernames (`mcUsername`), and Minecraft UUIDs (`mcUuid`) queried from `bankCustomers` and global `users` tables.
- **Multi-Identity Portal Lookup (`/api/portal/:bankId/lookup` and `/api/citizen/lookup`)**:
  - Updated both bank-specific portal lookup (`portal.ts`) and global citizen lookup (`citizen.ts`) to query accounts using `inArray(bankAccounts.ownerDiscordId, candidateIds)` instead of matching strictly `req.user.discordId`.
  - Joint and business accounts where the user is listed in `accountMembers` are fetched and merged into the user's accounts list without duplicates.
  - Enables players logged into their bank portal or citizen gateway to immediately view all accounts, cards, pending invoices, recent transactions, and active loans, whether their accounts were registered under a Discord ID or Minecraft username.
- **Authorized Ownership & Member Checks (`isUserAccountOwnerOrMember`)**:
  - Secured portal actions (`pay-invoice`, `transfer`, `lock card`, `request-loan`, `repay-loan`, `issue-card`, and `accounts/register`) using candidate identity matching and `accountMembers` verification, preventing false 404/403 authorization failures for valid account owners and members.

## Comprehensive Authentication & Login Interface Overhaul
- **Unified Dark Luxury Authentication Design System**:
  - Overhauled and standardized authentication cards and views across all access points (`DashboardLayout.tsx`, `BankAdminLayout.tsx`, `CitizenPortal.tsx`, `BankPortal.tsx`, `PayLink.tsx`).
  - Implemented sleek, high-contrast dark aesthetic cards with ambient radial background glows, subtle 1px border lighting, and backdrop blur.
  - **Operator Quick Access Removal**: Fully eliminated the development bypass button ("Operator Quick Access") and references from the UI, enforcing legitimate Discord OAuth or CityCorp authentication.
  - **Deadlock-Free Account Switching**: In `DashboardLayout` and `BankAdminLayout`, if an authenticated user lacks required privileges (global admin or staff membership), the system displays an informative profile card with a one-click **Sign Out & Switch Account** button rather than deadlocking the user.
  - **Dual Provider Access Across Portals**: Public bank portals and citizen portals support both CityCorp and Discord authentication, ensuring citizens can always authenticate even if custom CityCorp credentials are not configured for an individual bank.
  - **Context-Aware PayLink Authorization**: Payment request links (`/pay/:linkId`) now display the merchant name, requested amount, and memo directly on the authorization card before login, matching professional checkout patterns.

## In-Game Corporate Fee Accounting Engine & CityCorp Plugin Architecture
- **In-Game Corporate Account Integration (`src/server/feeService.ts` & `src/lib/citycorp_api.ts`)**:
  - Eliminates separate artificial local fee accounts. Instead, fee revenue flows directly into the bank's default corporate account within the **CityCorp Minecraft/economy plugin**.
  - Automatically identifies and synchronizes the bank's primary corporate account (configurable via `defaultCorpAccount` in Bank Settings, defaulting to `Main` or the first corporate account fetched from CityCorp).
  - Queries the CityCorp plugin endpoint via `getCorpTransactions` (`fetchInGameCorpTransactions`) using the bank's unified CityCorp App Token and Application credentials.
  - Dynamically syncs live in-game corporate balances and historical in-game transaction ledgers.
- **Empirically Verified CityCorp Plugin Transaction Models (Corp VH / Vance & Hamilton)**:
  - Validated via live API testing across all 76 pages (754 total corporate transactions) against Corp 325 (`https://api.cityrp.org/citycorp/corp/transactions/list?corp_id=325`):
    - **`CorpAccountFeeTransaction`**: Inflow into the corporation treasury from in-game citizen transactions. Contains `feeType` (`"WITHDRAW"` or `"DEPOSIT"`), `accountName` (source citizen account), `staff` (Minecraft UUID of initiating player), `amount` (exact fee assessed), `afterBalance` (treasury balance after fee credit), `timestamp` (epoch ms), and `id`. Mapped to `withdraw_fee` or `deposit_fee`.
    - **`BankPoolTransaction`**: Transfers between the corporation account and the bank pool. Contains `deposit` (boolean: true for capital inflow, false for withdrawal), `executor` (Minecraft UUID), `amount`, `afterBalance`, `timestamp`, and `id`. Mapped to liquidity pool movements.
    - **`PayTransaction`**: Direct citizen or player payments to the bank corporation via `/corp/pay`. Contains `executor` (payer UUID), `amount`, `afterBalance`, `timestamp`, and `id`. Mapped to `service_fee` / corporate revenue.
    - **`SendTransaction`**: Corporation treasury disbursements sent out by staff. Contains `staff` (sender UUID), `recipient` (destination UUID), `amount`, `afterBalance`, `timestamp`, and `id`. Mapped to corporate outflows.
    - **`AccountTransaction`**: Individual citizen account-level transactions queried via `/corp/accounts/transactions/list`. Contains `deposit` (boolean: true for credit, false for debit), `subuser` (initiating UUID), `amount`, `afterBalance`, `timestamp`, and `id`. Corresponds to the underlying citizen transaction that generates a `CorpAccountFeeTransaction` on the bank's default corporate account.

- **Deduplication & Ledger Synchronization (`syncInGameCorpTransactions`)**:
  - Live synchronization endpoint (`POST /api/banks/:bankId/treasury/sync-corp-transactions` and `POST /api/banks/:bankId/treasury/recalculate`).
  - Fetches the in-game account's live balance and in-game transactions from CityCorp.
  - Matches and deduplicates remote records against local transaction rows to prevent double-counting.
  - Inserts missing corporate records with normalized `feeType`, timestamp, and metadata.
  - Synchronously updates the bank's corporate account balance in the database.
- **Overhauled Treasury & Corporate Ledger Dashboard (`src/pages/BankTreasury.tsx`)**:
  - **CityCorp In-Game Account Overview**: Displays the bank's live default corporate account name, in-game balance, and live synchronization status.
  - **Institutional Balance Sheet & Capital Reserves**: Live breakdown of Liquid Cash Reserves, Vault Physical Cash, In-Game Corporate GL, Active Loan Book, and Depositor Liabilities with target reserve ratio compliance indicators (15.0%).
  - **Granular Fee Register by Type**: Card grid displaying every fee classification with dollar volume, transaction counts, and percentage share.
  - **In-Game Corporate Transaction History**: Filterable, searchable data table displaying recent in-game corporate transactions with color-coded classification badges, timestamp, and memos.
  - **One-Click Sync**: "Sync In-Game Corp Transactions" action triggers live CityCorp API retrieval, parsing, and recalculation in real time.

## Manual Off-System Loan Origination & Debt Servicing Engine
- **Off-System Lending Onboarding (`src/pages/BankLoans.tsx` & `src/server/routes/banks.ts`)**:
  - Allows bank staff to manually import and onboard loans negotiated outside Slate (e.g. Discord contracts, verbal agreements, or offline cash debts).
  - Modal toggle provides two distinct creation workflows: **New Disbursed Loan** (standard bank disbursement) and **Import Off-System Loan** (manual recording).
  - **Liquidity Safeguard**: When `isOffSystem: true`, the system **does not disburse funds from bank reserves**, preventing false liquidity drains.
  - **Prior Payment Tracking**: Staff can record `initialPaidAmount` (e.g. $10,000 already paid off on a $100,000 loan), an external agreement reference (`offSystemReference`, e.g. "Discord Agreement #104"), and the exact remaining balance due ($90,000).
- **Automated & Manual Debt Servicing**:
  - Once imported, off-system loans are fully integrated into Slate's repayment and delinquency engine (`loan_processor.ts`).
  - Automated recurring debits and manual installments paid through the Citizen Portal or Bank Portal automatically service the remaining balance.
  - **Priority Fee Allocation**: Loan repayments prioritize outstanding late fees first before amortizing remaining principal.
  - **In-Game Corporate Revenue Crediting**: All loan repayments and late fees credit directly into the bank's default CityCorp corporate account.
- **Visibility Across Portals**:
  - Both staff in `BankLoans.tsx` and borrowers in `CitizenPortal.tsx` see distinct **Off-System** badges, prior off-system paid amounts, and contract notes alongside their repayment progress and due dates.




### Credit Cards Architecture
As of the latest update, **Debit Cards are deprecated** and all new cards issued are **Credit Cards**.
- **Issuance**: Credit cards are provisioned automatically when a Citizen account tier is upgraded to a tier with a configured credit limit. Bank Staff can also manually issue credit cards via the staff dashboard with custom Limits and APRs. Customers can no longer freely issue virtual cards.
- **Spending**: Credit cards are fully integrated into **Transfers**, **Invoice Payments**, and **Onyx POS Payments**. Using a credit card draws from the `creditLimit` by incrementing `creditUsed`.
- **Repayment**: Citizens can use the "Pay Card" interface on the Citizen Portal to transfer funds from a standard checking/savings account to pay off their accumulated `creditUsed` balance.

### Onyx PSP Checkout Engine
- **Checkout Approval UI (`/onyx/checkout`)**: A dedicated front-end page where customers are securely redirected by external merchants. Customers select their funding source (Bank Account or Credit Card) to approve the transaction amount.
- **Tokenized Authorization (`/api/citizen/onyx-token`)**: Upon approval, the system signs a JWT (`paymentToken`) validating the customer's Discord ID and the approved `amount`. This token is passed back to the merchant's `callbackUrl`.
- **Merchant Storefront Dashboard**: Business account owners can access a new "Storefront" tab on their Citizen Portal. This dashboard allows them to retrieve their secure `apiKey` and provides HTML snippet examples for redirecting customers into the Onyx Checkout flow.

### Subscriptions (Customer View)
Customers can view their active recurring payments (subscriptions) natively within their banking dashboards.
- **Citizen Portal**: Features a dedicated "Subscriptions" tab listing all subscriptions across all their banks and accounts. Customers can see if they are the "Biller" or the "Customer", track the next billing date, and manually cancel active subscriptions to prevent further charges.
- **Bank Portal**: Localized bank dashboards also feature a "Subscriptions" tab, filtering recurring payments only for the specific bank being viewed, allowing localized tracking and cancellation.
- **API Flow**: A new cancellation endpoint (`/api/citizen/subscriptions/:id/cancel`) allows customers to safely terminate a subscription by setting `isActive: false` (as long as they own either the biller or the customer account).

### Financial Products Engine & Auto-Approval
- **Product Management (`BankProducts.tsx`)**: Bank Managers and Admins can create, edit, and delete predefined Financial Products (Loans and Credit Cards) for their bank. When editing a product, the system automatically checks for the presence of `termDays` to differentiate between loans and credit cards. Products can be toggled active or disabled, preserving existing loans while stopping new applications.
- **Tier-Based Auto-Approval (`BankTiers.tsx` & `citizen.ts`)**: To provide granular risk management, Loan and Credit Card auto-approval thresholds (e.g., `autoApproveLoans`, `autoApproveCreditCards`, `maxAutoApproveLoanAmount`) have been migrated from global Bank Settings to **Account Tiers**. If Account Tiers are enabled for a bank, auto-approvals will only execute if the customer's specific tier authorizes the amount. If Account Tiers are disabled, the system gracefully falls back to the legacy global auto-approval settings.

### Global Security Suite (Added Sep 2026)
Slate Banking now features an integrated **Global Security Suite**, exclusively available to Platform/Global Administrators. 
* **IP Logging**: Every login attempt (CityCorp, Discord, Staff, Admin) and sensitive security event now logs the incoming IP address and Discord Identity into \`securityAuditLogs\`.
* **Firewall & Banning**: Global Administrators have access to a new dashboard at \`/security\` to review Live Security Streams. They can ban malicious IP addresses directly from this interface, preventing those IPs from accessing any API endpoint instantly via the \`securityFirewall\` Express middleware.
* **Database Tables Added**:
  - \`securityAuditLogs\` (Tracks ip, action, status, discordId, timestamp)
  - \`bannedIps\` (Tracks ipAddress, reason, banner, dates)

### Login Flow Changes (CityCorp Enforced)
* **CityCorp Only**: The Discord login button has been completely removed from the initial login screens for both Bank Staff and Citizens. 
* **Authentication**: CityCorp (Minecraft) is the mandatory authentication layer for initial access. 
* **Onboarding**: Upon initial login via CityCorp, players are prompted with a mandatory onboarding modal if their Legal Name (RP) and Home Address are missing from the global \`users\` database. This applies to all banks seamlessly.
* **Discord Integration**: Players can continue linking their Discord inside the portal dashboard for bot notifications and Webhook alerts, but it is no longer permitted as a primary login gateway.

### CityCorp Money Rails (Launch, Sep 2026)
CityCorp in-game accounts are the source of truth. Slate is a cache + product layer. The bank owner's `uuid:crp_` token is the only corp credential; citizens are CityCorp subusers on specific accounts.

**Book transfers** (portal, Discord, Onyx cash, payroll, subscriptions, loan principal/repay) use `PATCH /accounts/transfer/account`. They never `withdraw` then `deposit` (those APIs hit the API-key owner's personal wallet) and never `PATCH /pay`.

**Cross-bank (Onyx)**: A customer → A `SETTLEMENT`, then B `SETTLEMENT` → B customer, using each bank's own key. This avoids the 2% corp-to-corp API tax. Receiving bank pays out immediately from float. SETTLEMENT subaccounts are created with 0% CityCorp WITHDRAW/DEPOSIT fees. Net positions live on `clearinghouse_balances`.

**In-game net settlement**: weekly/biweekly/monthly (or Run now). Greedy-pairs IOUs. Tries SETTLEMENT→SETTLEMENT book transfer first; CityCorp usually refuses (caller is not a subuser of the other corp). Fallback: debtor **Release** (withdraw SETTLEMENT → owner wallet), pay the other owner in-game, creditor **Confirm** (deposit into SETTLEMENT). IOU only closes after cash moves. Paper "record paid" is gone. VH self-funds via **Fund SETTLEMENT** (owner-wallet deposit).

**Fees**: CityCorp percents (0.25 = 0.25%) stack with Slate stored rates (200 = 2.00%). Combined keep-rate is `1-Π(1-r)`. Incremental bank fee is `max(0, slateRate - cityRate)` so VH's 2% is not double-charged if already set on the CityCorp account. Senders choose **fees from payment** (`from_payment`) vs **sender covers** (`sender_covers`). `POST /api/citizen/transfer/quote` and the citizen Send Payment tab show submitted vs received before confirm.

**Teller cash window**: Staff deposit/withdraw still use owner-key `/accounts/deposit` and `/accounts/withdraw` (owner personal wallet ↔ named account). Staff same-bank transfer uses the book rail.

**Loans**: Disbursement requires a named **Loan Pool** or **Default Corp Account** subaccount (`transfer/account`). Corp treasury cannot credit a named account (no treasury→account API), so treasury-only banks get a clear error instead of silently draining the owner's wallet. Repayments: pool/operating via `transfer/account`, else `PATCH /accounts/transfer/corp` into treasury. **Lending Policy** (Bank Settings) controls default APR/term, global max, payment period, auto-debit, late-fee floor/%, grace, retries, misses-to-default, daily/monthly/none interest accrual, 365 vs 360 day year, compounding late fees into remaining, accruing after default, curing default on payment, citizen applications, and signature-before-funding. Loan products still override APR/term/max when selected.

**Savings APY** (Interest page): schedule (manual/daily/weekly/monthly), target account types, current vs average-daily balance, min/max balance, activity and account-age gates, 365 vs 360 day year, and the interest pool subaccount. Manual schedule does **not** auto-pay — only **Run Interest Now** or a non-manual schedule. Payouts never mint; they book-transfer from the interest pool.

**Live events**: `wss://api.cityrp.org/citycorp` as the bank owner. Cache **SET** from `newBalance` / GET — never increment — so rails + the listener cannot double-count. SETTLEMENT drift (drop without a matching Slate debit) raises `RESERVE_BREACH` for RP/court. Owner theft of in-game funds cannot be technically stopped.

**Schema**: `transactions.amount_submitted`, `amount_received`, `fee_payer_mode`, `fee_breakdown`; `bank_settings.settlement_account`, `settlement_floor_cents`, `settlement_warn_cents`, `default_fee_payer_mode`; `clearinghouse_balances.settlement_cash_cents`.

## Launch security + loan rails

- **Global admin**: `GLOBAL_ADMIN_DISCORD_IDS` is required. JWT `isGlobalAdmin` is untrusted. First-login auto-admin only if `ALLOW_FIRST_ADMIN=true` **and** `global_admins` is empty.
- **Removed**: `POST /api/auth/demo-admin-login` and `POST /api/citizen/link-discord-manual`.
- **Secrets**: API keys and tokens use AES-GCM (`enc:` prefix) via `encryptedText` (including `cityCorpToken`, `botToken`). Decrypt in JS with `decryptSecret`; leftover plaintext still reads through.
- **Identity**: bind `discordId` / `mcUuid`, not username.
- **Loans**: stay `pending` until CityCorp `disburseFromPoolOrOperating` succeeds, then `active`. Auto-debit only `active`/`delinquent` (not pending or unfunded). Repay via `collectLoanPayment` → `collectToPoolOrTreasury` on every path (staff, citizen, portal, Discord, cron). Failed collect marks `lastPaymentAttemptAt` and skips until the next due window (no interest-on-failure loop). Payoff status is `paid_off`. Credit-card min payments run on the same 15-min cron (`processDueCreditRepayments`).
- **Loan ledger**: one helper (`applyLoanPaymentLedger`) for remaining, late-fee tracker, delinquency, collateral release, and due-date roll. Penny payments reduce remaining but do **not** roll `nextPaymentDate` (must cover the installment). Late fees are already inside `remainingAmount`; they are not added again in KPIs.
- **Loan products**: applications (citizen, portal, Discord, staff Issue) honor `loanProducts` APR / max / term. Products store APR as percent (5 = 5%); loans store percent×100 (500 = 5.00%).
- **Status machine**: `pending` / `awaiting_signature` → disburse → `active`; miss 3 auto-debits → `defaulted` (collateral seized). Reject only before funding. Principal cannot be edited after disbursement. Daily Processing no longer reprints interest at 100× APR.
- **No local mint** on deposit-funds / initialDeposit / yield / citizen credit. Savings yield pays from `interestPoolAccount` via `executeSameBankBookTransfer` or is deferred.
- **Webhooks**: Discord HTTPS only (`discord.com` / `discordapp.com`).
- **HTTP**: CSP on, JSON body limit 1mb, CORS does not allow `*.run.app` in production.
- **Identity**: `getUserCandidateIdentifiers` uses Discord snowflake / Minecraft UUID only. Session display names are not join keys.
- **OAuth**: Discord callback requires `state` + `oauth_nonce`. Redirect dest is JSON-encoded. CityCorp `app_id` is never defaulted to `"9"`.
- **No local mint** on remaining rails: recurring transfers, invoices, Onyx B2B, Discord teller/transfer, payroll/subscription charge, wires, escrow (`ESCROW` system account), vaults (`VAULT` system account). Book transfers fail closed if the bank has no CityCorp credentials. Savings APY and vault interest pay from `interestPoolAccount` or are skipped.

## Customer portals, ops desk, and tenant kill switch

### Customer portals
White-label **Bank Portal** (`/portal/:bankId` and custom domains) is the customer portal: branded home, send with a **live fee quote**, activity, loans, cards, invoices, and Apply. Feature flags hide products the bank turned off. Hex `brandingColor` drives the UI.

`/portal` on the platform domain is only a **bank picker** (accounts you hold + directory). It is not a second product and has no network-wide send. Transfers are **bank-wide only**. Cross-bank payments go through **Onyx**.

### Honest send
`POST /api/portal/:bankId/transfer/quote` and `/api/citizen/transfer/quote` return submitted / received / fee lines before confirm. Destination lookup is exact in-game name (or id) **inside that bank**. Autocomplete (`/api/portal/:bankId/payees`) only lists people the customer has already sent money to or received from. Transfers notify the destination owner over Discord DM when the bank bot is online (`discordNotifyCustomers`, default on).

### Staff desk
- **Needs attention** (`/bank/:id/queue`): pending loans, delinquent/defaulted, frozen accounts, settlement release/confirm, `RESERVE_BREACH` / platform alerts, low SETTLEMENT.
- **Teller** (`/bank/:id/teller`): search citizen → accounts/loans → counter transfer with live quote.
- **Collections** (`/bank/:id/collections`): retry collect, Discord ping borrower, seize collateral, cure default.

### Platform ops
- **Network health** (`/health`): per-tenant Discord bot, CityCorp listener, SETTLEMENT cash, open IOUs, go-live checklist, suspend/unsuspend.
- **Kill switch**: `POST /api/admin/banks/:id/suspend` sets `billingStatus=suspended`, stops the bot, freezes book transfers and API keys.

### Security
- Bank and Onyx merchant **API keys are hashed** (`api_key_hash` + last4). Full secret is returned only on create/roll.
- Onyx checkout tokens persist in `used_payment_tokens` and **must** bind `merchantId` (and optional `sourceAccountId`). A token without a merchant cannot be charged by any other merchant.
- Citizens pay merchants via `POST /api/citizen/pay-merchant` (merchant id, never the merchant API key in the browser).
- Merchant directory for customers omits destination account ids. Transfers never search the full customer list; payee autocomplete is prior counterparties only.
- Payroll, subscriptions, recurring transfers, invoices, Discord transfers, and portal/API transfers stay **inside one bank**. Cross-bank movement is Onyx only.
- Citizen sync-job status is scoped to the caller. Card PAN/CVV reveal is owner or manager only, via identity candidates (not username).
- Customer lookup never matches on Minecraft display name.

### Discord customer pings
No new slash commands. The existing bank bot DMs for incoming transfer, loan applied/approved/denied/disbursed/paid/failed/due/defaulted, card lock. Due reminders run on the 15-minute cron (`notifyUpcomingLoanPayments`).

### Schema additions
`banks.suspended_reason`, `suspended_at`, `api_key_hash`, `api_key_last4`; `onyx_merchants.api_key_hash/last4`; `loans.last_due_reminder_at`; `bank_settings.discord_notify_customers`; tables `platform_alerts`, `used_payment_tokens`.

---

## CityCorp-only login, Discord link, no minting, Onyx shops (Sep 2026)

### Identity
- **Sign-in is CityCorp only.** Discord is not a login method. `/api/auth/url` returns CityCorp unless `provider=discord` **and** `intent=link` with an existing session.
- JWT `discordId` stays `mc_<minecraft_uuid>`. Linking Discord writes `users.linkedDiscordId` and `bank_customers.linked_discord_id` only. It does **not** rewrite `owner_discord_id` or mint a new session.
- `/api/auth/me` returns `linkedDiscordId`. Unlink via `POST /api/auth/unlink-discord`.
- Bank and Onyx Discord bots refuse users whose Discord is not linked (`getCandidateIdsForDiscordSnowflake` returns empty). Copy: sign in on the web, tap **Link Discord**.
- Discord snowflakes never receive an `mc_` prefix (`normalizeIdentifier`).
- Customer money paths use `requireOwnedAccount` / identity candidates, not a raw `ownerDiscordId === jwt.discordId` compare.

### Funds
- The platform never mints cash. Book transfers SET CityCorp live balances. Teller Discord cash window **fails closed** if CityCorp does not confirm the new balance (no local `balance ± amount` fallback).
- Demo seed (non-production) creates accounts at **$0**. It does not invent balances.
- Staff teller, payroll run, and subscription charge are **same-bank** (`executeSameBankBookTransfer`). Cross-bank is Onyx / wires only.

### Cards
- List endpoints return last4 only. Full PAN/CVV is create-once, or `POST /api/banks/:id/cards/:cardId/reveal` (staff, audit logged) / `GET /api/citizen/cards/:id/reveal` (owner or manager).

### Onyx merchant self-serve
- Public wizard: `/accept`. CityCorp login → name shop → pick a receiving account the player owns → copy checkout link and API key (shown once).
- `POST /api/onyx/register`, `GET /api/onyx/me`, `POST /api/onyx/me/:id/roll-key`.
- `onyx_merchants` now has `owner_mc_uuid`, `owner_discord_id`, `slug`.
- Platform Onyx CityCorp corp lives on `onyx_settings` (`corp_id`, `corp_api_uuid`, `corp_api_key`) plus the existing Onyx Discord bot token. Merchants never see platform secrets.
- Discord `/onyx-merchant-setup` requires a linked identity and an owned destination account; API keys are hashed.

### Schema additions (this drop)
`users.linked_discord_id`; `onyx_merchants.owner_mc_uuid`, `owner_discord_id`, `slug`; `onyx_settings.corp_id`, `corp_api_uuid`, `corp_api_key`.

---

## Visual language and color schemes (Sep 2026)

Slate chrome is **near-neutral ink**: Instrument Sans + IBM Plex Mono, tokens in `src/index.css` (`--bg`, `--fg`, `--accent`, `--ok` / `--warn` / `--danger`). Motion is 150–250ms, `prefers-reduced-motion` disables enter animations, tap targets are ≥44px.

### Bank color schemes
Named schemes live in `src/lib/theme.ts` and drive staff chrome, the client portal, Discord embed color, and (via CSS) legacy `indigo-*` Tailwind utilities.

| Id | Look |
|---|---|
| `slate` | Cool institutional gray (default for new banks) |
| `ocean` | Deep water blue |
| `forest` | Muted banking green |
| `copper` | Warm metal |
| `rose` | Quiet crimson |
| `ink` | Near-white on dark |
| `indigo` / `emerald` / `amber` / `zinc` | Legacy aliases |

Staff **Brand Identity** is a swatch picker (not a dropdown). Picking a scheme also fills `brandingColor`. A custom hex still wins in `accentFor()`. Discord bots import `SCHEME_HEX` from the same module.

Global Slate Control stays silver/ink. Tenant `--accent` is set on the staff and portal shells so every indigo-tinted page follows the bank's scheme.

---

## CityCorp-only login and root admin Cofys (Sep 2026)

- **Login is CityCorp only.** Discord OAuth cannot mint a session. `/api/auth/url?provider=discord` requires an existing CityCorp cookie and `intent=link`. The Discord blurple “sign in” buttons are gone from every portal, staff desk, checkout, and pay link.
- Discord remains an **optional bot link** after CityCorp login (`linkDiscord()`), so `/bank` can see the player. It is labeled as connecting the bot, not as a login.
- **Root operator:** Minecraft / CityCorp username `Cofys` (UUID `24e37515-4a2d-4c60-a603-3c41320a6f03`) is a global admin. `checkUserIsGlobalAdmin` matches JWT username, UUID variants (`mc_<uuid>`), and `global_admins`. Extra names can be listed in `GLOBAL_ADMIN_MC_USERNAMES`.
- Staff rows that store a Minecraft username (not a Discord snowflake) match the CityCorp session username, so commercial-bank desks work without Discord.
- SQLite files under `data/` are gitignored (`*.db`, WAL/SHM, the `data/` directory). Never commit ledgers.

Staff desks do **not** record transfers. CityCorp already books every movement. Mass deposit, mass fee, and demo seed are gone. Treasury shows CityCorp corp cash and named subaccounts — it does not invent a 15% reserve ratio or a GAAP balance sheet.

---

## AI Studio Environment & Runtime Normalization (Sep 2026)

- **Port & Host Standardization**: Dev and production servers bind to `0.0.0.0:3000` to integrate seamlessly with the container reverse-proxy layer.
- **Legacy Artifact Cleanup**: Removed non-Node.js legacy source directories (`/Bank-main/`) and non-npm lockfiles (`bun.lock`) to maintain a clean Node 22 TypeScript workspace.
- **Graceful Startup Guards**:
  - `JWT_SECRET` and `DB_ENCRYPTION_KEY` utilize development fallback keys when running in unconfigured or freshly provisioned dev containers, logging a diagnostic notice rather than exiting the process with `process.exit(1)`.
- **Iframe Preview Compatibility**: Configured Express Helmet middleware with `frameguard: false` and `contentSecurityPolicy: false` to permit native live previewing in AI Studio iframe shells.
- **Production Build Flow**: `npm run build` compiles Vite frontend assets to `dist/` and bundles `server.ts` into a CommonJS artifact `dist/server.cjs`, executed cleanly by `npm start`.
- **Bulk Operator Tools Surface Streamlining**: Removed the legacy "SQLite (.db) Migration" and "Intelligent JSON Migration" upload options from the Bank Staff Bulk Tools UI (`BankTools.tsx`), focusing the operator tools on active operational flows: Run Daily Processing (EOD interest & loan servicing), Purge Zero-Balance, Emergency Lock, and CityCorp Auto-Import.
- **Discord Bot Linking Redirect URI Exposure**: Co-located the dedicated **Discord Bot Linking Callback** (`/api/auth/discord/callback`) alongside the CityCorp sign-in callback directly within the Bank Settings branding and bot credentials panel (`BankSettings.tsx`), with single-click copy buttons and explicit guidance for Discord Developer Portal configuration (`OAuth2 -> Redirects`).
- **Bank-Specific Discord Bot Resolution**: Resolved an issue where Discord account linking fell back to the global SaaS platform bot credentials (`process.env.DISCORD_CLIENT_ID`) when banks accessed on the main platform domain or without custom domains. Bank-specific `discordClientId` and `discordClientSecret` stored in the `banks` table are now universally prioritized across both `/api/auth/url` initiation and `/api/auth/discord/callback` token exchange. The Customer Portal (`CitizenPortal.tsx`) now explicitly passes the target bank ID or presents a bank selection dialog when multiple institutions exist.
- **Customer Portal Select & Option Visibility**: Fixed an issue where dropdown menus in the customer portal rendered invisible or unreadable text when native OS / browser popovers opened with white backgrounds against white option text. Standardized `color-scheme: dark` across all form elements, and explicitly applied dark background (`#18181c`) and high-contrast text (`#f4f4f5`) across all `<select>` and `<option>` components in `BankPortal.tsx` and global styles.
- **Bonds & Vault Tiers Catalog Accuracy**: Removed hardcoded fallback dummy tiers (7, 30, 90, 180, 365 days) from `portal.ts`, `citizen.ts`, and `BankSettings.tsx`. Banks that have not explicitly defined bond terms in `bank_settings.vaultTiers` now accurately return an empty catalog, completely hiding the "Buy a bond" section from customer portals until terms are configured. The staff settings screen now provides a clear active term count, empty-state banner, and a single-click "Clear all" utility.
- **Discord Bot Account Linking & Cross-Window Synchronization**:
  - **Partitioned & Cross-Site Cookie Persistence**: Configured `oauth_nonce` and `auth_token` cookies with `sameSite: 'none'`, `secure: true`, and `partitioned: true` (CHIPS compliance), guaranteeing that OAuth cookies survive cross-site redirects in popup windows, browser privacy partitions, and iframe-nested portals.
  - **Tamper-Resistant Cryptographic State Token (`linkToken`)**: The `/api/auth/url?provider=discord` endpoint encodes an HMAC-SHA256 signed `linkToken` into the OAuth `state` query parameter containing the user's active session identity and cryptographic nonce. In the event that third-party cookies or storage partitioning block cookie transmission during Discord's redirect, `/api/auth/discord/callback` validates the state's `linkToken` directly, preventing "Invalid OAuth state" or "OAuth state expired" errors.
  - **Multi-Channel Opener Notification (`postMessage` + `BroadcastChannel` + `localStorage`)**: Upon successful linkage, the callback page broadcasts completion signals across three concurrent channels: direct `window.opener.postMessage`, a native cross-tab `BroadcastChannel('oauth_channel')`, and `localStorage.setItem('oauth_auth_success', Date.now())`.
  - **Popup Lifecycle Polling & Real-Time Session Refresh**: In `AuthContext.tsx`, `popupPollRef` runs a high-frequency polling loop (`setInterval` every 500ms) on the OAuth popup window handle. As soon as the popup closes (whether via automatic `window.close()` or manual user dismissal), the application triggers an immediate `checkSession()` call to pull the freshly linked Discord identity and update the UI instantly without requiring a page refresh.
  - **Session Re-Issuance & Double Identity Binding**: Upon completing Discord token exchange, `/api/auth/discord/callback` binds the Discord snowflake across both the `users` table and `bank_customers` rows matching the player's Minecraft UUID, Discord ID, and Minecraft username. It then re-issues an updated JWT `auth_token` cookie containing the new `linkedDiscordId`, ensuring subsequent API calls and `/api/auth/me` reflect the linked bot state immediately.
  - **User Feedback & Status Badging**: Both `BankPortal.tsx` and `CitizenPortal.tsx` now prominently display an emerald "Discord bot linked" status badge with the linked ID once connected, and render a high-visibility error alert banner if OAuth authorization is denied or rejected by Discord.

---

## 🎨 Discord Terminal GUI Overhaul, Privacy & Granular Controls (Sep 2026)

### 1. Distinct Visual Styles (`discordGuiStyle`)
The platform supports configurable visual presentation styles for the Discord public lobby and staff operations desks:
- **`executive` (Institutional & Corporate)**:
  - High-contrast typography paired with structured markdown code blocks (`fix`, `yaml`, and `elm`).
  - Distinct box metrics displaying custodial deposit totals and active ledger counts.
  - Formal clearinghouse network status indicators and institutional terminal timestamps.
- **`cyber` (Cyber Telemetry)**:
  - ANSI colored terminal console blocks (`[SYSTEM TELEMETRY]`, `DEPOSITS`, `ACCOUNTS`, `CLEARING`).
  - Terminal code block formatting tailored for gaming, cyberpunk, and high-tech roleplaying communities.
- **`minimal` (Clean & Distilled)**:
  - Compact inline bullet rows with clean monetary formatting and minimal negative space.
  - Avoids block clutter while keeping essential indicators immediately accessible.

### 2. Granular Public Statistics Toggles
Bank managers can fine-tune what financial figures are visible to the public in Discord via `BankSettings.tsx`:
- **`discordShowStats`**: Master switch controlling all public statistical metrics.
- **`discordShowDeposits`**: Granular toggle to show or hide the bank's Total Custodial Deposits figure independently.
- **`discordShowAccounts`**: Granular toggle to show or hide the Active Member Ledgers count independently.
- When both are enabled, the embed displays a multi-column clearinghouse layout; if only one is enabled, it renders a dedicated prominent panel; if neither is enabled, the stats section is cleanly omitted.

### 3. Comprehensive Discord Interaction Privacy Architecture
To prevent public leakage of account information or user status:
- **Strict Ephemeral Isolation**: All interaction responses originating from the public or staff lobby terminals (dashboard views, transfers, transaction statements, sync checks, rate queries, and loan applications) are strictly ephemeral (`ephemeral: true`).
- **Zero Public Mutation on Unlinked Clicks**: If an unlinked user clicks "My Dashboard" or "Transfer" on a public panel, the persistent public channel message is never altered. Instead, the bot detects interaction ephemeral state (`isMessageEphemeral`) and delivers a dedicated, private onboarding guide with Minecraft avatar integration (`buildNotLinkedEmbed`) visible only to that user.
- **Resilient Fallback Handling**: `safeReplyOrUpdate` validates whether an interaction has been replied to, deferred, or represents an ephemeral message, preventing Discord `InteractionAlreadyReplied` and `UnknownInteraction` runtime exceptions.

### 4. Tenant Search Engine & Social Embed Metadata (`metaTitle`, `metaDescription`, `metaOgImage`)
- Bank settings now include dedicated OpenGraph and search engine optimization fields stored in `bank_settings`.
- Allows bank owners to customize how their institution previews when shared in Discord channels, Twitter/X cards, and search engine results, supporting custom page titles, descriptive summaries, and rich social banner image URLs.

### 5. Discord Bot Transfer Fee Quoting & Settlement Engine (`quoteBookTransfer`, `FeePayerMode`)
To ensure complete parity between the Web Banking Portal and the Discord Bot experience, transfer flows in `bot_logic.ts` calculate and present transparent fee schedules prior to transaction settlement:
- **Interactive Quoting & Confirmation Flow**:
  - Clicking **Transfer Funds** opens a modal with destination account, dollar amount, optional fee payer mode (`deduct` or `cover`), and optional memo.
  - The bot calls `quoteBookTransfer` (from `citycorp_money.ts`) to compute exact line-item fees according to institutional settings (`transferFeePercent`, fixed minimums, CityCorp transit fees) and active `FeePayerMode`.
  - An ephemeral **Transfer Quote & Confirmation** embed is presented displaying:
    - Source Account and live balance
    - Destination Account
    - Desired Transfer Principal
    - Configured Fee Payer Option (`I cover fees` / `Fees from payment`)
    - Itemized fee schedule breakdown with percentage rates and dollar amounts
    - Total amount debited from sender (`submittedCents`)
    - Total amount credited to recipient (`receivedCents`)
    - Projected source balance remaining after settlement
    - Optional transfer memo
  - The confirmation embed features interactive action buttons: **✅ Confirm & Send** (`tx_confirm_${token}`) and **❌ Cancel** (`tx_cancel_${token}`).
- **Strict Pre-Settlement Balance Validation**:
  - If a user's account balance is insufficient to cover the total required amount (`quote.submittedCents`, which incorporates fee additions when the sender covers), the bot halts execution immediately and provides a breakdown detailing the required total, fees, current balance, and exact shortfall.
- **Two-Phase Settlement Execution**:
  - Upon clicking Confirm, the bot re-validates the session, verifies the source account's available balance, and executes `executeSameBankBookTransfer` with CityCorp ledger synchronization.
  - A receipt embed is rendered with the generated Transaction ID, fee breakdown, and updated account balance.
  - If the recipient has a linked Discord snowflake, `customer_notify.ts` automatically sends a direct message notification informing them of the incoming transfer.
- **Flexible Fee Payer Selection**:
  - Users can specify `cover` (sender pays fees on top) or `deduct` (fees deducted from transfer amount) in the transfer modal. If left blank, the bot automatically falls back to the institution's `defaultFeePayerMode` configured in Bank Settings.

### 6. Transfer Fee Calculation, Configurable Government Fee & CityCorp Parity
To ensure mathematical parity between Slate's quote engine and in-game CityCorp Minecraft plugin transfers:
- **Separation of Bank Fees & Government Civic Fees**:
  - The civic / government transit fee (defaulting to 0.25%, configurable per-bank in `Bank Settings` via `governmentFeePercent`) operates independently of bank-specific charges (withdraw, transfer, or deposit fees).
  - Both fees are calculated on the transfer amount and rendered as distinct line items in all customer-facing quote breakdowns (web portals and Discord bot transfer modals/receipts) alongside the cumulative Total Fees.
- **Root Cause & Percentage Normalization**:
  - Previously, `slateStoredToRate` assumed all percentage values were stored multiplied by 100 (basis points, dividing by 10,000). When evaluating a 1.75% withdraw fee on $100, `1.75 / 10000` resulted in an effective rate of 0.0175% ($0.02), rather than 1.75% ($1.75).
  - The quoting engine now uses `normalizePercentToRate` and `slatePercentToRate` to robustly parse both direct decimal values (e.g. `0.25` or `1.75`) and basis point integers (e.g. `25` or `175`).
- **CityCorp In-Game Transfer Parity**:
  - In the Minecraft CityCorp plugin, transfers are processed as an automated withdrawal from the source account followed by a deposit to the recipient. Consequently, the bank's withdrawal/transfer fee applies in full alongside the separate government fee.
  - On account creation, individual custom fee updates, and bulk account fee updates, Slate synchronizes account fee rates directly to the CityCorp API (`client.setAccountFee`), ensuring that the Minecraft plugin and web interface remain in strict lockstep.
- **Accurate Gross-Up Formula & Additive Math**:
  - In the in-game Minecraft plugin, transfer fees are deducted from the submitted transit amount (`received_in_game = submitted - round(submitted * totalRate)`).
  - Therefore, in `sender_covers` mode, to ensure the destination receives **exactly** the desired amount in-game without falling short, the submitted amount is **grossed up**: `submitted = ceil(desired / (1 - totalRate))`. For example, on a $100.00 transfer with 1.75% bank fee + 0.25% government fee (2.00% total rate), submitting $102.04 results in in-game fee deduction of $2.04 and recipient receiving exactly $100.00 (whereas submitting $102.00 would cause in-game to deduct $2.04 and leave only $99.96).
  - In `from_payment` mode, `submittedCents = desired`, `totalFeeCents = round(desired * totalRate)`, and `receivedCents = desired - totalFeeCents`.
  - Line-item fee amounts (`government_fee`, `bank_withdraw`, etc.) are apportioned proportionally by rate share with the final line absorbing any single-cent rounding difference, guaranteeing that `sum(line.amountCents) === totalFeeCents`.
- **Internal Same-Bank Book Transfers vs. Cross-Bank Inflows**:
  - Internal account-to-account book transfers within the same institution only assess the sender's withdrawal/transfer fee and government transit fee. Inbound deposit fees are not assessed on internal same-bank transfers and only apply to cross-bank deposits.
- **Activity & Transaction History Clarification**:
  - Outbound debit transactions now explicitly display `amountSubmitted` (total funds debited from the sender), while inbound credit transactions display `amountReceived` (net funds credited to the recipient), avoiding sender confusion over deducted fee totals.

### 7. JWT Session Signing & Reserved Claim Sanitization
- When re-issuing session cookies during Discord linking (`/api/auth/discord/callback`) or unlinking (`/api/auth/unlink-discord`), the payload is sanitized to strip reserved JWT claims (`exp`, `iat`, `nbf`, `jti`).
- This eliminates the jsonwebtoken collision error (`Bad "options.expiresIn" option the payload already has an "exp" property`) when users link their Discord account during registration or onboarding.

### 8. Customer Portal Transfer Confirmation Screen & Digital Receipt
- **In-Place Confirmation Workflow (`BankPortal.tsx`)**:
  - Replaced the abrupt auto-refresh redirect to the home dashboard upon sending money with a dedicated, persistent **Transfer Confirmed** receipt screen.
  - Displays complete transaction parameters immediately post-settlement:
    - **Total Sent**: Highlighted total debit amount formatted with `formatMoney`.
    - **Recipient Receives**: Visual badge highlighting the exact net amount received.
    - **Account Details**: Clear "From" and "To" account names.
    - **Memo / Note**: Displays transfer memo if provided.
    - **Fee Policy & Breakdown**: Shows whether the sender covered fees or if fees were deducted from payment, along with an itemized breakdown of the government tax and bank withdrawal fees.
    - **Reference & Copy**: Displays a truncated transaction ID with a one-click copy button for customer dispute and verification purposes.
    - **Timestamp**: Formatted transaction settlement timestamp.
  - Provides dedicated action controls:
    - **Return to Dashboard**: Safely resets transfer state and transitions to the Home overview.
    - **Send Another**: Clears receipt and reopens a clean send form immediately.
    - **View Activity**: Navigates directly to the comprehensive transaction activity ledger.
  - Smart Navigation Reset: Navigating into "Send" from other tabs (home quick actions or bottom navigation bar) automatically resets any active receipt to present a fresh payment form.
