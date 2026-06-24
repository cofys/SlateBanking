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

### 2. Verify File Permissions
The `Dockerfile` has already been configured to ensure the `/app/data` directory is owned by the `node` user, so SQLite can write to it without permission errors:

```dockerfile
# Create the data directory and ensure it is writable by the node user
RUN mkdir -p /app/data && chown -R node:node /app/data
```

### 3. Deploy
1. Click **Deploy** to rebuild and restart your container.
2. From now on, any data written to `/app/data/slate_saas.db` will be saved on your server's persistent disk.
3. When you deploy future updates, Coolify will re-mount the same volume to the new container, preserving your data!

## Alternative: PostgreSQL / MariaDB
We strongly recommend sticking with SQLite unless your banking volume scales to thousands of concurrent transactions per second. 

If you absolutely must migrate to PostgreSQL in the future, you will need to swap out `better-sqlite3` for `pg`, replace `drizzle-orm/sqlite-core` with `drizzle-orm/pg-core` across the codebase, and refactor all synchronous SQLite `.get()`, `.all()`, and `.run()` queries to use Postgres `.limit(1)` and `.returning()`.
