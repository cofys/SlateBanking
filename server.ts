import { globalAudit } from './src/server/globalAudit.js';
import express from "express";
import { randomInt } from "crypto";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import cron from "node-cron";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { botManager } from "./src/lib/bot_manager";
import { startCronJobs } from "./src/lib/cron";

async function startServer() {
  const app = express();
  
  app.set("trust proxy", 1);
  const PORT = 3000;

  startCronJobs();

  app.use(helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const token = req.cookies.session;
      const latency = Date.now() - start;
      const path = req.originalUrl || req.url;
      
      // Do not log static assets or frequent polls unless needed.
      if (path.startsWith('/api/')) {
        let discordId: string | null = null;
        let bankId = req.params?.bankId || req.body?.bankId || req.query?.bankId || null;
        
        // Try to grab from user if set by requireAuth
        if ((req as any).user && (req as any).user.discordId) {
          discordId = (req as any).user.discordId;
        } else if (req.cookies && req.cookies.auth_token) {
          try {
            const decoded = jwt.decode(req.cookies.auth_token);
            if (decoded && (decoded as any).discordId) discordId = (decoded as any).discordId;
          } catch(e) {}
        }
        
        // Simple details payload
        const details = {
          status: res.statusCode,
          method: req.method,
          query: path.includes("/auth/") ? undefined : req.query,
          bodySize: req.body ? JSON.stringify(req.body).length : 0
        };

        let action = "api_request";
        if (path.includes("/auth/")) action = "auth";
        if (path.includes("/transfer")) action = "transfer";

        globalAudit.log({
          discordId,
          action,
          details: JSON.stringify(details),
          ipAddress: (req.ip || req.headers["x-forwarded-for"] || null) as string | null,
          route: path,
          method: req.method,
          bankId,
          latencyMs: latency
        });
      }
    });
    next();
  });

    app.use(cors({
    origin: async (origin, callback) => {
      if (!origin) return callback(null, true);
      try {
        const { db } = await import("./src/db/index.js");
        const { banks } = await import("./src/db/schema.js");
        const { isNotNull } = await import("drizzle-orm");
        
        const banksList = await db.select({ customDomain: banks.customDomain }).from(banks).where(isNotNull(banks.customDomain));
        
        const originUrl = new URL(origin);
        const originHost = originUrl.hostname.toLowerCase();

        let valid = false;
        for (const b of banksList) {
          if (b.customDomain) {
            let domainHost = b.customDomain.trim().toLowerCase();
            if (domainHost.startsWith("http://") || domainHost.startsWith("https://")) {
              try { domainHost = new URL(domainHost).hostname; } catch (e) {}
            } else {
              domainHost = domainHost.split(":")[0].split("/")[0];
            }
            if (originHost === domainHost) {
              valid = true;
              break;
            }
          }
        }
        
        if (!valid) {
          const isProd = process.env.NODE_ENV === "production";
          if (originHost === "localhost" || originHost === "127.0.0.1") {
            valid = !isProd;
          } else if (!isProd && (originHost.endsWith(".run.app") || originHost === "run.app")) {
            valid = true;
          } else if (process.env.APP_URL) {
            try {
              const appHost = new URL(process.env.APP_URL).hostname.toLowerCase();
              if (originHost === appHost) valid = true;
            } catch (e) {}
          }
        }

        if (valid) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      } catch (e) {
        callback(null, false);
      }
    },
    credentials: true
  }));

  const limiterValidate = { xForwardedForHeader: false, forwardedHeader: false };
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    standardHeaders: true, 
    legacyHeaders: false,
    validate: limiterValidate,
  });
  
  const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: "Too many authentication attempts, please try again later.",
    validate: limiterValidate,
  });
  
  const transferLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 10,
    message: "Too many transfer requests, please try again later.",
    validate: limiterValidate,
  });
  
  app.use('/api/', globalLimiter);
  app.use('/api/auth/', authLimiter);
  app.use('/api/portal/:bankId/transfer', transferLimiter);
  app.use('/api/citizen/transfer', transferLimiter);
  app.use('/api/citizen/pay-merchant', transferLimiter);
  app.use('/api/citizen/onyx-token', transferLimiter);
  app.use('/api/v1/transfers', transferLimiter);
  app.use('/api/onyx/checkout', transferLimiter);

  // API Routes
  
  // -- Auth Routes & Middlewares --
  const { JWT_SECRET, requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, getRedirectUri } = await import("./src/server/middleware.js");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "super_secret_jwt_key_here") {
    console.warn("[Slate] Notice: JWT_SECRET not set in environment. Using fallback development secret.");
  }

  const { registerAuthRoutes } = await import("./src/server/authRoutes.js");
  registerAuthRoutes(app);
  
  const { registerInterestRoutes } = await import("./src/server/interestRoutes.js");
  registerInterestRoutes(app);

    const { registerAllRoutes } = await import("./src/server/routes.js");
    registerAllRoutes(app, { getRedirectUri, requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET,  });

if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // The * route should come after any API routes
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Start Discord Bot Managers and WebSockets
  const { db } = await import("./src/db/index");
  const { banks } = await import("./src/db/schema");
  const { initCityCorpEventSubscribers } = await import("./src/lib/bot_events");
  try {
    await initCityCorpEventSubscribers();
    
    const { onyxSettings } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const gSettings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, "global")).get();
    const globalMaint = gSettings?.globalBotMaintenance || false;

    const allBanks = await db.select().from(banks);
    for (const bank of allBanks) {
      if (bank.discordToken && !globalMaint && !bank.maintenanceMode) {
        botManager.provisionBankBot(bank.id, bank.discordToken).catch(e => {
          console.error(`Failed to start on boot for bank ${bank.name}:`, e);
        });
      }
    }
  } catch (e) {
    console.error("Failed to load banks mapping", e);
  }

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (e) => {
    console.error("Express server error:", e);
  });
}

startServer().catch(console.error);
