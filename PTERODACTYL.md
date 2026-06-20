# Running Slate SaaS on Pterodactyl

Slate SaaS is a full-stack Node.js application (Vite/React frontend + Express backend + SQLite database). Unlike typical static files or single-file Discord bots, it requires a build step for the React frontend before it can be served to users, and the database schema must be initialized.

## 1. Revised Pterodactyl Startup Command

The default Pterodactyl Node.js egg startup command you provided only checks for `MAIN_FILE` and executes it. This skips the mandatory frontend build phase. 

Please replace your Pterodactyl **Startup Command** (found in the Startup tab of the Pterodactyl panel) with this updated version:

```bash
if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install && /usr/local/bin/npm run build; fi; /usr/local/bin/npm run start
```

### Why this change was made for production:
- Added `&& /usr/local/bin/npm run build` after the node module installation. This compiles the React application and bundles your backend into a hardened form.
- Discarded the fallback `ts-node`/`node` condition check and hardcoded it to execute `/usr/local/bin/npm run start`.
- The `start` script defined in your app's `package.json` natively forces `drizzle-kit push` to run on boot, applying any schema changes, and then gracefully launches the backend.

## 2. Environment Variables (.env)

In your Pterodactyl File Manager, create a `.env` file in the root directory (`/home/container/.env`). Ensure it contains the following:

```env
# SERVER_PORT is automatically injected by Pterodactyl Wings, so this is optional 
# but good to declare. The application natively binds to this.
SERVER_PORT=3000

# Discord OAuth configuration
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here

# Crucial: This callback URL MUST match the domain/IP and port assigned by Pterodactyl.
# Make sure to whitelist this exact identical URL in your Discord Developer Portal!
DISCORD_CALLBACK_URL=http://your-ptero-ip-here:port/api/auth/discord/callback

# Global Administrator ID
GLOBAL_ADMIN_DISCORD_ID=your_discord_uid
```

## 3. SQLite Persistence & Backup Strategy

Pterodactyl environments isolate and persist files inside `/home/container/`. 
Slate SaaS' database engine is native SQLite, meaning your **entire banking platform** writes directly to a single file at the root inside `/home/container/slate_saas.db`.

- **Do NOT delete** `slate_saas.db` unless you intend to wipe the server. 
- You do not need an external MySQL allocation or MariaDB container. 
- If you use the Pterodactyl Backup tab, ensure it captures `slate_saas.db`.

## 4. Port Configuration

In the Pterodactyl Network/Ports allocation section, ensure the main assigned port (the one mapped to the environment variable `$SERVER_PORT`) matches the port you use to access the website. The Express proxy layer specifically listens on `0.0.0.0` to respect the container's virtual network interface constraints.