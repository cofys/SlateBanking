FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS builder
# Copy package files
COPY package*.json ./
# Install all dependencies including devDependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# The app binds to process.env.SERVER_PORT or defaults to 3000
ENV SERVER_PORT=3000
ENV PORT=3000

# Install necessary libraries for native module compilation on ARM64 if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install only production dependencies.
# We also install drizzle-kit so it's available for the start script.
RUN npm ci --omit=dev && npm install drizzle-kit

# Copy the built assets from the builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Ensure the /app directory is writable by the node user so it can create slate_saas.db
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
