# Coolify Setup & SQLite Persistence Guide

Since Slate SaaS relies on a local SQLite database by default, deploying it in Docker containers (like in Coolify) can cause the database to be overwritten or lost during updates if the storage volume is not persisted. 

To prevent your database from resetting on every deployment, you MUST map a persistent volume to the `/app/data` directory inside your container.

## How to Persist the Database in Coolify

### 1. Configure Persistent Storage
1. Go to your Slate SaaS application resource in your **Coolify** dashboard.
2. Navigate to the **Storage** section.
3. Click **+ Add Storage**.
4. Configure the volume mapping:
   - **Source Path (Host Path)**: Leave it blank (or let Coolify auto-generate a volume name).
   - **Destination Path (Container Path)**: `/app/data`
5. Save the configuration.

### 2. File Permissions
The `Dockerfile` has been updated to run as root by default to avoid permission issues with mounted host volumes in Coolify. SQLite can write to `/app/data` without permission errors.

### 3. Deploy
1. Click **Deploy** to rebuild and restart your container.
2. From now on, any data written to `/app/data/slate_saas.db` will be saved on the server's persistent disk.
3. When you deploy future updates, Coolify will re-mount the same volume to the new container, preserving your data!

## If deploy fails with "no space left on device"

The AWS host is full of old Docker images and build cache. Coolify cannot copy the new image until that is cleared.

1. In Coolify, open the **server** (not the app) → **Docker Cleanup** / unused images.
2. Or SSH to the host and run (do **not** prune volumes — that is the ledger):

```
docker container prune -f
docker image prune -af
docker builder prune -af
```

Never run `docker volume prune` or `docker system prune --volumes`. The SQLite ledger lives on a volume at `/app/data`.

3. Redeploy the app after cleanup. The production image now only ships the built app plus the SQLite native addon, not the full `node_modules` tree.

## Secrets

Keep `JWT_SECRET`, `DISCORD_CLIENT_SECRET`, `DB_ENCRYPTION_KEY`, and CityCorp tokens as **runtime environment variables**, not build-time ARG. Coolify injecting them as Dockerfile ARG bakes them into image history.

## Alternative: PostgreSQL / MariaDB
We strongly recommend sticking with SQLite unless your banking volume scales to thousands of concurrent transactions per second. 

If you absolutely must migrate to PostgreSQL in the future, you will need to swap out `better-sqlite3` for `pg`, replace `drizzle-orm/sqlite-core` with `drizzle-orm/pg-core` across the codebase, and refactor all synchronous SQLite `.get()`, `.all()`, and `.run()` queries to use Postgres `.limit(1)` and `.returning()`.
