# 🏛️ Slate Banking Platform & Onyx PSP
### Enterprise Multi-Tenant Digital Banking, Automated Clearinghouse & Financial Discord Ecosystem

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![SQLite & Drizzle](https://img.shields.io/badge/SQLite-Drizzle--ORM-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://orm.drizzle.team/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)

---

## 🌟 Executive Summary

**Slate** is a high-availability, full-stack multi-tenant banking platform and global Payment Service Provider (**Onyx**) engineered to power complex virtual economies, gaming networks (Minecraft/Roleplay communities), and digital financial ecosystems. 

Built from the ground up with high performance, strict double-entry ledger integrity, and institutional-grade security, Slate enables operators to deploy independent, white-labeled financial institutions complete with branded customer web portals, staff administrative suites, live Discord bot swarms, inter-bank clearinghouse settlement networks, and developer APIs.

---

## 💎 Key Platform Capabilities

### 1. 🏢 Institutional Bank Desks & Multi-Tenancy
- **Isolated Tenant Ledgers**: Complete physical and logical separation of accounts, transactions, products, staff roles, and audit trails across unlimited distinct banks.
- **Custom Brand Customization**: Dedicated per-bank styling engines including custom color palettes, logos, login backgrounds, domain routing, and customized terms.
- **Granular Staff RBAC**: Multi-tiered role-based access control with distinct permission boundaries for `Owner`, `Admin`, `Teller`, `Loan Officer`, and `Compliance Officer`.
- **Comprehensive Audit Trail**: Tamper-evident logging of all staff interventions, account adjustments, credit limit updates, and permission modifications.

---

### 2. 📱 Branded Customer Self-Service Banking Portal
- **Modern Dark-Mode UX**: Sleek, responsive financial dashboard built with React 19, Motion, and Tailwind CSS.
- **Multi-Account Management**: Instant creation and monitoring of Checking, Savings, and Business accounts with tier-based interest rates and minimum balances.
- **Payment Cards & Cash Advances**: Digital debit and credit cards with instant freeze/unfreeze toggles, dynamic PIN & CVV reveal, and direct cash advance facilities.
- **Automated Bills & Subscriptions**: Recurring standing orders, invoice management, payroll pipelines, and peer-to-peer bill splitting.
- **In-Game Deposit Guidance**: Automatic generation of copy-to-clipboard server commands guiding users through in-game funds synchronization.

---

### 3. 🌐 Onyx Payment Service Provider (PSP) & Clearinghouse
- **Macro Inter-Bank Clearinghouse**: Automatic tracking of cross-bank net balances with continuous liquidity monitoring.
- **Stateless Merchant Checkout API**: Global payment gateway allowing external servers, Minecraft plugin gateways, and webstores to process instant transactions across the network.
- **Manual Wire Liquidity Safeguards**: Configurable settlement thresholds that trigger liquidity-protected wire transfers requiring dual-party staff confirmations when large sums cross tenant boundaries.
- **Automated Settlement Runs**: Scheduled net-position settlement cycles balancing systemic discrepancies across institutions.

---

### 4. 🤖 Discord Bot Swarm Daemon
- **Dynamic Swarm Manager**: Backend process supervisor that spins up, monitors, and unloads isolated `discord.js` client instances dynamically per bank token.
- **Interactive Slash Commands (`/bank`)**: Rich Discord UI components, ephemeral portfolio lookups, balance checks, and quick-transfer modals directly inside Discord guilds.
- **Real-Time Webhook Broadcasts**: Instant rich-embed event notifications dispatched for transfers, card charges, invoice payments, and loan approvals.
- **Self-Healing State Sync**: Automatic reconnection, gateway health telemetry, and automatic database state reconciliation.

---

### 5. 🛡️ Peer-to-Peer Escrow & Dispute Mediation Desk
- **Cryptographic Custody Holds**: Securely lock deal capital in systemic escrow custody accounts until transaction terms and delivery milestones are fulfilled.
- **Milestone Agreements & Signatures**: Customizable terms and conditions with client signature tracking and inspection periods.
- **Staff Dispute Mediation**: Integrated customer support ticketing engine allowing bank compliance staff to arbitrate disputed escrows and issue fair settlements or refunds.

---

### 6. 📈 Treasury, Lending & Time Vaults
- **Loan Underwriting Engine**: Fixed and amortized loan products with auto-approval thresholds, collateral tracking, delinquency tracking, and daily interest accrual.
- **High-Yield Time Vaults**: Maturity-locked certificates of deposit (CDs) offering custom APYs with configurable early-withdrawal penalty schedules.
- **Automated Interest Accrual**: Daily and monthly background cron jobs computing interest distributions for savings tiers and active loan portfolios.

---

## 🏗️ Technical Architecture & Engineering Highlights

```
                          ┌────────────────────────────────────────┐
                          │         CLIENT APPLICATIONS            │
                          │  • Customer Portal  • Staff Desk       │
                          │  • Discord Bot GUI  • External APIs    │
                          └───────────────────┬────────────────────┘
                                              │
                                              ▼
                          ┌────────────────────────────────────────┐
                          │         SECURITY & ROUTING LAYER       │
                          │  • Helmet Security  • Rate Limiters    │
                          │  • Transitive Identity Engine (OAuth)  │
                          └───────────────────┬────────────────────┘
                                              │
                                              ▼
                          ┌────────────────────────────────────────┐
                          │           CORE SERVICES ENGINE         │
                          │  • Ledger Engine     • Onyx PSP        │
                          │  • Escrow Custody    • Bot Daemon      │
                          │  • Loan Amortization • Clearinghouse   │
                          └───────────────────┬────────────────────┘
                                              │
                                              ▼
                          ┌────────────────────────────────────────┐
                          │           STORAGE & PERSISTENCE        │
                          │  • SQLite (WAL Mode, Drizzle ORM)      │
                          │  • Auto-Schema Self-Healing Migration  │
                          └────────────────────────────────────────┘
```

### 🔑 Key Engineering Solutions

- **Transitive Multi-Provider Identity Engine**: Solves the fractured identity problem across virtual ecosystems by linking Discord OAuth IDs, CityCorp OAuth tokens, Minecraft UUIDs (both dashed and undashed), and character usernames into a single unified customer profile.
- **Atomic Double-Entry Bookkeeping**: Every transaction generates synchronized debit and credit entries with transaction-level idempotency protection, preventing double-spend and race conditions.
- **Fault-Tolerant Settlement Rollbacks**: Automated compensation rollback mechanisms for cross-bank transfers, backed by high-severity platform alerting (`raisePlatformAlert`) to notify administrators if funds ever fail to reach their destination.
- **Zero-Downtime Auto-Migrating Database**: Embedded SQLite schema reconciliation engine running on `WAL` mode with automatic table and column synchronization without data loss.

---

## 💻 Tech Stack Summary

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Motion, Lucide Icons, Recharts
- **Backend**: Node.js, Express, TypeScript, tsx, esbuild
- **Database & ORM**: SQLite (`better-sqlite3`), Drizzle ORM
- **Authentication & Security**: Discord OAuth 2.0, CityCorp OAuth 2.0, JSON Web Tokens (HS256), Helmet, Express Rate Limit
- **Daemons & Integrations**: Discord.js v14, Node-Cron, WebSockets (`ws`), REST APIs

---

## 📜 Documentation Index

- **`WIKI.md`**: Complete and exhaustive technical specification of all system components, data models, and business logic.
- **`PUBLIC_API.md`**: Integration reference for third-party developers, Minecraft plugins, and external merchant systems.
- **`DOCS.md`**: Architecture notes and developer workflows.
