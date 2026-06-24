# Slate SaaS – Platform Wiki

Welcome to the definitive Slate SaaS Platform Wiki. This living document encapsulates the architecture, features, workflows, and integrations of the entire banking and payment service provider suite.

---

## 🏛 Platform Overview

Slate SaaS is a multi-tenant banking management platform designed for gaming and roleplaying communities (such as Minecraft RP servers). It provides distinct isolation for individual banks while connecting them globally via a centralized Payment Service Provider (Onyx) and Central Clearinghouse.

### Core Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, React Router DOM, Recharts for data visualization.
- **Backend**: Node.js, Express (with `helmet`, `cors`, `express-rate-limit`, `cookie-parser`).
- **Database**: SQLite (local `slate_saas.db` with WAL mode enabled) driven by Drizzle ORM.
- **Authentication**: Discord OAuth via manual JWT cookies.
- **Hosting**: Pre-configured for seamless execution on Pterodactyl Panels (binds automatically to `SERVER_PORT`).

---

## 🏦 Tenant Architecture (Banks)

A single deployment of Slate supports an unlimited number of Banks. Each Bank represents an isolated financial institution.

### 1. Financial Core
- **Ledgers & Transactions**: Double-entry accounting system where money moves strictly between accounts via `transactions`.
  - Transaction types: `transfer`, `deposit`, `withdraw`, `onyx_payment`.
- **Bank Accounts**: Configurable user accounts identifiable by unique IDs. Account types include `personal`, `business`, and `payroll`.
  - Uses lowest denomination (cents) to avoid floating-point errors.
- **Audit Logs**: Irreversible system action records tracking all internal financial manipulation or staff changes. Automatically logs `action`, `details`, and `timestamp`.

### 2. Retail Banking Features
- **Vaults & Time-Locks**: Time-locked deposit accounts that generate interest upon release. Early withdrawal limits are natively supported. Can be toggled per-bank in settings.
- **Loans & Credit Facility**: Active credit facilitation. Tracks principal amounts, remaining balances, interest rates, and upcoming payment dates. Supports active status tracking (`pending`, `approved`, `active`, `paid`, `rejected`).
  - **Credit Applications**: Citizens can apply for specialized lines of credit via the Citizen Gateway. Bank staff review and approve/reject applications. 
  - **Auto-Approval**: In `Bank Settings`, banks may toggle `autoApproveLoans` and `autoApproveCreditCards` along with a threshold `maxAutoApproveLoanAmount`. When toggled, requests falling under the safe limit are instantly generated (funds deposited or cards provisioned) without staff intervention.
- **Cards**: Generated debit and credit card objects (Card Number, CVV, Expiry, Locked state) tied directly to a bank account. Lock states toggle true/false.

### 3. Business & B2B
- **Payroll**: Automated, recurring employee compensation workflows (`weekly`, `biweekly`, `monthly`). Operates cron-like checks against active jobs.
- **Subscriptions**: Recurring billing mechanisms allowing businesses and individuals to charge customer accounts automatically.
- **Invoices**: Pending payment requests issued by a merchant or bank staff to a customer (`pending`, `paid`, `overdue`). Contains due dates and strict relationships to biller and customer accounts.
- **Escrow Services**: Safe transaction locking mechanism allowing funds to be held neutrally until a specific fulfillment trigger (`pending`, `funded`, `released`, `refunded`).

### 4. Admin & Workforce
- **Team Management**: Granular staff permissions controlled via Discord IDs. Role assignments (`owner`, `admin`, `teller`, `support`) govern what UI panes bank employees can access.
- **Support Tickets**: Internal CRM allowing customers to open tickets (`open`, `in_progress`, `resolved`, `closed`) within their citizen portal directed to bank staff.

### 5. Settings & Customization
- **White-label Branding**: Custom color schemes (`colorScheme`) and logo URLs per bank.
- **Fees**: Configurable system-wide fees for transfers, deposits, and withdrawals (stored as percentages multiplied by 100).
- **Discord Integration Config**: Specify verified roles, client roles, and comprehensive webhook alerting structures per-bank.
- **Feature Flags**: CEOs can manually toggle `enableLoans`, `enableVaults`, `enableCards`, `enablePayroll`, `enableSubscriptions`, `enableEscrow`, and `enableTreasury`.

---

## 💳 Global Architecture

### Onyx Network (Payment Service Provider)
Onyx is a Stripe-like processing layer bridging funds across entirely different banks. 
- **Onyx Merchants**: Entities can register external API keys to route collected funds dynamically into a designated destination account.
- **Onyx Checkout API**: Stateless checkout routing allowing third-party tools (like Minecraft plugin gateways) to post payments securely across the entire Slate infrastructure. The API accepts an optional `sourceAccountId` for bypassing the default routing logic matching only the routing bank.
- **Onyx Quick Pay**: Available in both the global Citizen Gateway and bank-specific Portals, allowing any account holder across the entire Slate network to easily select a merchant from a connected dropdown list and issue a direct cross-bank B2B payment securely from their dashboard.
- **Onyx Global Settings**: Controlled via the SaaS Admin dashboard, settings include a global B2B API Transaction Fee tax and global toggles for clearinghouse routing.

### Central Clearinghouse & Inter-Bank Wires
Since funds occasionally cross from Bank A to Bank B, the platform leverages inter-bank clearinghouse logic.
- **Clearinghouse Balances**: A running ledger of what each bank "owes" the central network versus what they are "owed" by the network. Handled automatically during inter-bank transfers.
- **Settlements**: Periodic net-position payouts balancing the systemic discrepancies. Records `fromBankId`, `toBankId`, `amount`, and `status`.
- **Manual Wires (Liquidity Protection)**: If an incoming inter-bank transaction exceeds the receiving bank's `interBankWireThreshold` (configured securely in their bank settings), the automatic clearinghouse route is aborted. Instead, it generates a "Pending Wire Transfer", requiring the sending bank's staff to manually deposit funds in-game into the receiving bank's corp account. The receiving bank's staff then approves the wire in Slate, automatically crediting the destination user.

---

## 🔐 Security & Identity

### Discord OAuth Context & JWT
Instead of simple passwords, the platform mandates Discord authentication. 
- `/api/auth/url` generates the Discord OAuth2 prompt, requesting `identify email` scopes.
- `/api/auth/discord/callback` handles the return code, exchanges it for a token via Discord's API, and subsequently builds a secure JWT.
- The JWT payload (`discordId`, `username`, `avatarUrl`, `isGlobalAdmin`) is encrypted with `JWT_SECRET` and stored in an HTTP-only, secure, sameSite=none cookie (`auth_token`).
- Tokens are set to expire in 7 days.

### Middlewares
1. **`authenticateApiRequest`**: Standard API key checking for external plugin connections, ensuring `x-api-key` header matches a valid `banks` or `onyxMerchants` API key.
2. **`requireGlobalAdmin`**: Decodes the JWT and asserts that the `isGlobalAdmin` flag is true (tied to core dev/owner accounts).
3. **`requireBankStaff`**: Decodes the JWT, checks global admin fallback, and alternatively queries the `bank_staff` table to ensure the logged-in Discord ID holds authority in the specifically requested `:bankId`.

### Protection Layers
- **Helmet**: Enforces core header securities while selectively disabling `contentSecurityPolicy` and `crossOriginEmbedderPolicy` to allow relaxed iframe cross-embeds for Pterodactyl dashboards.
- **Rate Limiting**: `express-rate-limit` enforces a strict ceiling of 1000 requests per 15 minutes globally across all `/api/` endpoints.
- **Global Admins**: Hard-coded root developers (such as `@cofys` / `cofysmc@gmail.com`) automatically inherit Root Global Admin permissions, bypassing bank-level staff restrictions.

---

## 🤖 Bot Manager Daemon (`bot_manager.ts`)

Every bank defined in the platform can attach a unique Discord Bot Token to its configuration. Slate SaaS runs an internal `BotManager` class designed to handle an unlimited swarm of isolated Discord JS Client instances.

- **Provisioning**: When a bank is created or updated, `botManager.provisionBankBot(bankId, token)` spins up a new independent bot process logged in under that token.
- **Shutdowns**: `botManager.stopBankBot(bankId)` safely terminates the client.
- **Status API**: Exposes `/api/bots/status` for the Admin Dashboard to visualize real-time WebSocket connection states of every client.
- **Use Case**: Allows individual banks to offer slash commands (`/balance`, `/transfer`, `/pay`) and ticket channel management internally within their respective Discord Guilds, all routing back directly to the core SQLite models.

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

### Citizen Gateway (Authentication: Discord Cookie)
- `GET /api/citizen/lookup` - Resolves the current logged in citizen's portfolio across the entire platform.

---

## 🗄️ Database Schema Deep Dive

The platform relies on a single `sqlite.db` configured via `drizzle.config.ts`. Here are the definitive tables from `src/db/schema.ts`:

- **`users`**: Global identity mapping table linking Discord IDs to Minecraft UUIDs and Usernames.
- **`banks`**: The foundational tenant row. Contains `discordToken`, `status`, `brandingColor`, etc.
- **`bank_accounts`**: The core ledger holding entity. Links to `banks` via foreign key. Houses the core integer `balance`.
- **`transactions`**: Absolute source-of-truth for money layout. Connects optional `fromAccountId` and `toAccountId` for atomic transfers.
- **`onyx_merchants`**: API Gateway configurations routing external keys to specific `destinationAccount` strings.
- **`bank_settings`**: Toggles and fee assignments tied cleanly inside a 1-to-1 relationship with `banks.id`.
- **`escrows`**, **`invoices`**, **`subscriptions`**, **`payroll_jobs`**, **`vault_deposits`**, **`cards`**, **`loans`**: Standard operational modules executing temporal state locking.
- **`audit_logs`**, **`bank_staff`**, **`support_tickets`**: Workforce and HR organization elements.
- **`clearinghouse_balances`**, **`clearinghouse_settlements`**: Central Macro-economy resolution models logging discrepancies across multiple banks.
- **`city_corp_logs`**: Systemic logging table recording latency, response codes, and network health of the external CityCorp API integrations via automated ping trackers and organic user actions.

---

## 💾 Intelligent Data Migration Module
Contained within `BankTools.tsx` and the `mass-action` APIs is a full ingestion system. Legacy roleplay server databases (JSON dumps) can be injected, parsed, and normalized, seamlessly porting thousands of ancient accounts into valid Slate SaaS ledger records with intact routing metrics.

---

## Developer & Public API Documentation

- **Internal Developer Wiki:** See `WIKI.md` for core architecture, stack guidelines, and schema definitions.
- **Public API Documentation:** See `PUBLIC_API.md` for the player-facing and developer integration documentation outlining authentication and HTTP routes.
- **Interactive UI Wiki:** Users can access the interactive developer documentation at the `/docs` route online.

## Developer Guide: Expanding the Code

To expand Slate SaaS, always follow the tri-level approach:
1. **Schema Definitions (`src/db/schema.ts`)**: Add your Drizzle-ORM tables or columns. Push structural changes using `npx -y drizzle-kit push`.
2. **Server Endpoints (`server.ts`)**: Construct your Express router mappings making sure to use `await db.select()`, `await db.insert()` inside logic structures. Ensure new APIs correctly implement the `requireBankStaff` or `requireGlobalAdmin` middleware when mutating sensitive arrays. Note that the frontend proxies `/api/*` to the Node.js backend.
3. **Frontend UIs (`src/pages/*`)**: Utilize modern React functional structures, consume the data in `useEffect`, and leverage Tailwind CSS with Lucide React Icons for a polished, highly-crafted professional dark aesthetic. Components should generally align strictly to the `BankAdminLayout` or `DashboardLayout` for seamless auth ingestion.
