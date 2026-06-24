# Slate SaaS Bank Platform - Technical Documentation

Welcome to the internal technical documentation for Slate SaaS. This platform provides multi-tenant banking infrastructure primarily for gaming/Minecraft communities, complete with a global Payment Service Provider (Onyx).

## Core Architecture

- **Frontend:** React, Tailwind CSS, Vite.
- **Backend:** Node.js, Express, SQLite (via Drizzle ORM).
- **Hosting:** Pterodactyl natively supported via `SERVER_PORT` injection and simple `npm run build && npm start` command sequence.
- **Database:** SQLite.

## Multi-Tenancy

The platform allows any number of "Banks" to be created. Each bank operates as an isolated tenant with its own:
- Accounts & Customers
- Ledger (Transactions)
- Integrations (Vaults, Loans, Cards, Escrow, Invoices)
- Team Staff & Permissions

The URL structure uses `/bank/:bankId/*` for tenant routing.

### Key Workflows:
- **Invoicing System:** Bank administrators can issue pending payment requests (Invoices) directly to customer accounts. Citizens can instantly pay these open invoices from the `CitizenPortal` via a dedicated processing pipeline.

## Global Systems

- **Clearinghouse & Onyx:** 
  The Onyx Network is our Payment Service Provider. It acts as an interoperability layer between different configured Banks. Merchants can generate Onyx API keys linked to a specific destination bank account. When a purchase is triggered (e.g., via the Discord bot or external API), Onyx handles cross-bank settlement logic, bridging funds automatically and logging it in the global ledger.

## Integrations

- **Discord Bot (bot_manager.ts):**
  Banks can optionally launch their own isolated Discord Bot instances by providing a token in their settings. The backend dynamically spins up a `discord.js` client in real-time, logs in, and listens to slash commands. It unloads the bot if the token is changed or disabled.

- **Data Migration:**
  The `BankTools` area contains an Intelligent Data Migration UI. You can upload a JSON dump of a legacy system's ledgers and it parses, heals, and provisions accounts automatically—establishing a valid ledger balance back to the beginning of time.

## Developing & Expanding

To expand the platform, refer to the Drizzle schema in `src/db/schema.ts` to add modules. To add a new tenant-level feature (like Loans or Payroll):
1. Create frontend views in `src/pages`.
2. Link them in `App.tsx` and `BankAdminLayout.tsx`.
3. Build the supporting Express endpoints in `server.ts`.
4. Register any boolean feature toggles (e.g. `enablePayroll`) in the `bankSettings` table so the bank owner can enable/disable it in `BankSettings.tsx`.
