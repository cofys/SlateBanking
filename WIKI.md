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
- **Feature Flags**: CEOs can manually toggle `enableLoans`, `enableVaults`, `enableCards`, `enablePayroll`, `enableSubscriptions`, `enableEscrow`, and `enableTreasury`.

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
