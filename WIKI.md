# Slate SaaS – Platform Wiki

Welcome to the definitive Slate SaaS Platform Wiki. This living document encapsulates the architecture, features, workflows, and integrations of the entire banking and payment service provider suite.

---

## 🏛 Platform Overview

Slate SaaS is a multi-tenant banking management platform designed for gaming and roleplaying communities (such as Minecraft RP servers). It provides distinct isolation for individual banks while connecting them globally via a centralized Payment Service Provider (Onyx) and Central Clearinghouse.

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
- **Feature Flags & Maintenance Mode**: CEOs, Bank Staff, and Global Admins can toggle `maintenanceMode` per bank (or network-wide). During maintenance mode, the Discord bot stays online and production APIs remain active; however, non-staff/customer actions (transfers, invoice payments, bot commands, menu interactions) are suspended with a standard maintenance notice. Bank staff and global admins retain full override privileges to test new features, run commands, and execute portal transactions in production.
- **Feature Toggles**: CEOs can manually toggle `enableLoans`, `enableVaults`, `enableCards`, `enablePayroll`, `enableSubscriptions`, `enableEscrow`, and `enableTreasury`.

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

### Citizen Gateway (Authentication: Discord Cookie)
- `GET /api/citizen/lookup` - Resolves the current logged in citizen's portfolio across the entire platform.

---

## 🗄️ Database Schema Deep Dive

The platform relies on a SQLite database configured via `drizzle.config.ts`. Here are the definitive tables from `src/db/schema.ts`:

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

## Changelog

### June 25th 2026 Update
- **Bot Interactions**: Transitioned from purely slash commands to rich Button/Modal interactions. Admins can spawn a persistent interactive ATM message in a channel using `/spawn_atm`.
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
  - **Mathematical Reconciliation Delta**: Each imported account dynamically receives 4 to 6 randomized transactions spanning 15 days (wages, utility, ATM withdrawals, and Onyx checkout payments). The final transaction utilizes a perfect balance reconciliation delta to guarantee that the absolute ledger sum mathematically aligns with the remote CityCorp balance.
  - **Auto-Provisioned Debit Cards**: Every newly imported remote account is immediately provisioned with a custom virtual physical debit card (complete with security codes, card numbers, and expiration dates) to instantly populate the redesigned portal UI.
  - **Intelligent Customer Profiles**: Parses the remote account names to extract real Minecraft usernames and creates corresponding "KYC Approved" customer records if a valid Discord ID is present, creating linked profile states out-of-the-box.

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
- **Flexible Identity Mapping ("Username or Discord ID")**: Evolved the account reassignment and customer creation workflows (e.g., "Update Owner", "Merge Customer"). The system now performs intelligent background resolution using `drizzle-orm` queries (`or(eq(discordId, input), ilike(mcUsername, input))`). This allows administrators and tellers to intuitively link or assign accounts using either a player's **Minecraft Username** or their direct **Discord ID**, significantly reducing friction when re-associating imported CityCorp transactions.

## Custom Domain Routing & Staff Portal Access
When a user accesses the platform via a custom domain, the router leverages \`customBankId\` to determine the context. The \`App.tsx\` explicitly registers both the \`BankPortal\` and \`BankAdminLayout\` routes inside the custom domain block so that Staff can navigate directly to the staff portal at \`/bank/:bankId\` on their own domain. 
Access is restricted via the backend: \`/api/portal/:bankId/lookup\` securely evaluates the \`isStaff\` flag, guaranteeing the Staff Portal button is only visible to authorized personnel (Global Admins and Bank Staff).

## Recent Bug Fixes & OAuth Architecture
- **SQLite LIKE**: Drizzle SQLite does not natively support `ilike`. Replaced all occurrences of `ilike` with `like` for case-insensitive matching in SQLite.
- **Discord OAuth Callback on Custom Domains**: When a user links their Discord on a custom domain, the callback URL dynamically determines the `bankId` by inspecting the decoded OAuth `state` payload rather than relying on domain name parsing. This guarantees the correct `discordClientSecret` is selected for token exchange.
- **Staff Portal Routing**: The citizen dashboard routing on custom domains was updated to mount strictly on `/` instead of the greedy `/*` pattern, which was previously masking the `/bank/:bankId` nested router.
- **Staff Portal Visibility**: The visibility of the "Staff Portal" button in the citizen gateway evaluates access via `bankStaff` lookup strictly, disregarding `isGlobalAdmin` to prevent visual clutter for platform operators testing client portals.

## Custom Domain OAuth Redirect URI (Update)
- Replaced the proxy header domain extraction for \`getRedirectUri()\` with a more robust check that prioritizes the \`Referer\` header to correctly derive the true custom domain origin when users initiate the Discord OAuth linking flow. This avoids Cloud Run proxy overriding the \`Host\` header with the internal `.run.app` address and ensures Discord correctly matches the registered Redirect URI for custom bank bots.

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
    - 🎮 **In-Game Info & Sync Protocol**: Interactive Minecraft linking status card with 3D skin head avatar thumbnails (`https://mc-heads.net`), on-demand 6-digit sync codes (`/slate link <code>`), and in-game CityCorp ATM commands.
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
  - Engineered a dedicated search and inspection backend that scans all registered tenant banks and bank accounts across Slate SaaS to locate and cross-reference configured CityCorp Corporation IDs.
  - Features a live **CityCorp API Ping Verifier** that pings `https://api.cityrp.org/citycorp/accounts/list?corp_id={id}` in real-time, verifying network connectivity, latency (ms), registered account counts, and sample account names for any candidate Corp ID.
- **Global Corp ID Finder (`OnyxSettings.tsx`)**:
  - A simple search utility added directly to the Onyx Network admin dashboard.
  - Allows global administrators to enter a corporation name and instantly retrieve its Corporation ID from the active database registry, avoiding unnecessary clutter in tenant-facing bank management views.








