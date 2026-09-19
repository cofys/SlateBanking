FROM node:22-bookworm-slim AS base
WORKDIR /app

# Install build dependencies for native modules (e.g., better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

FROM base AS builder
# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies including native binaries
RUN npm install --include=optional --force

# Copy the application code
COPY . .

# Build frontend and bundle server
RUN npm run build

# Prune dev dependencies while keeping compiled native modules
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_PORT=3000
ENV PORT=3000

# Copy package.json and pruned node_modules from builder stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db/schema.ts ./src/db/schema.ts

# Create persistent data directory
RUN mkdir -p /app/data

EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
