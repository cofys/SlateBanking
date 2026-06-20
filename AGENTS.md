# AI Agent Instructions

## Platform Context
You are working on **Slate SaaS**, an advanced multi-tenant banking platform and global Payment Service Provider (Onyx) designed primarily for roleplay and gaming communities. It runs on Node.js/Express with React/Vite in the frontend, backed by SQLite (Drizzle). The platform is heavily integrated with Discord (OAuth and Bots).

## Documentation Guidelines
- The official platform documentation is located at `WIKI.md`. 
- **Critical Directive**: Going forward, **always keep `WIKI.md` updated.** Whenever you introduce a new feature, architecture change, database schema modification, or integration flow, you MUST append or update the `WIKI.md` file to reflect these additions accurately. 
- You must always maintain `WIKI.md` as the definitive, extremely thorough source of truth for the entire platform.

## Architecture Guidelines
- Always use SQLite with Drizzle ORM (`src/db/schema.ts`).
- Secure all administrative endpoints with Discord JWT session validation (`requireGlobalAdmin` or `requireBankStaff`).
- Follow modern, highly polished dark-mode aesthetic principles using Tailwind CSS and Lucide icons.
- Ensure new API routes are compliant with the global rate-limiting.
