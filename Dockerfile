FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --include=optional --no-audit --no-fund

COPY . .
RUN npm run build

# Runtime only needs the compiled app plus the native SQLite addon.
RUN mkdir -p /native/node_modules && node <<'NODE'
const fs = require("fs");
const path = require("path");
const srcRoot = path.join(process.cwd(), "node_modules");
const destRoot = "/native/node_modules";
const seen = new Set();
function copyPkg(name) {
  if (!name || seen.has(name)) return;
  seen.add(name);
  const from = path.join(srcRoot, name);
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, path.join(destRoot, name), { recursive: true });
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(from, "package.json"), "utf8")); }
  catch { return; }
  for (const dep of Object.keys(pkg.dependencies || {})) copyPkg(dep);
}
copyPkg("better-sqlite3");
NODE

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_PORT=3000
ENV PORT=3000

COPY --from=builder /app/dist ./dist
COPY --from=builder /native/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
