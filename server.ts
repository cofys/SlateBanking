import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { botManager } from "./src/lib/bot_manager";
import { startCronJobs } from "./src/lib/cron";

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3000;

  startCronJobs();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors());

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    standardHeaders: true, 
    legacyHeaders: false, 
  });
  app.use('/api/', globalLimiter);

  // API Routes
  
  // -- Auth Routes --
  const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_here";
  const getRedirectUri = (req: express.Request) => {
    // In preview mode, use the APP_URL provided by environment if available.
    // Otherwise fallback to req.headers.origin or host.
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    let origin = process.env.APP_URL || (req.headers.origin ? req.headers.origin : `${protocol}://${req.headers.host}`);
    // Trim trailing slash if present
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    return `${origin}/api/auth/discord/callback`;
  };

  app.get('/api/auth/url', (req, res) => {
    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email', 
    });
    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send("No code provided");

    const redirectUri = getRedirectUri(req);
    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID || '',
          client_secret: process.env.DISCORD_CLIENT_SECRET || '',
          grant_type: 'authorization_code',
          code: code.toString(),
          redirect_uri: redirectUri,
        }).toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to fetch Discord token: ' + await tokenResponse.text());
      }

      const tokenData = await tokenResponse.json();

      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to fetch Discord user');
      }

      const userData = await userResponse.json();
      
      const isGlobalAdmin = userData.username === 'cofys' || userData.email === 'cofysmc@gmail.com';

      const payload = {
        discordId: userData.id,
        username: userData.username,
        avatarUrl: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : undefined,
        isGlobalAdmin
      };

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

      res.cookie('auth_token', token, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (e: any) {
      console.error(e);
      res.status(500).send("Authentication failed: " + e.message);
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      res.json(decoded);
    } catch(e) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
      secure: true,
      sameSite: 'none',
      httpOnly: true,
    });
    res.json({ success: true });
  });

  const requireGlobalAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (!decoded.isGlobalAdmin) return res.status(403).json({ error: "Forbidden" });
      (req as any).user = decoded;
      next();
    } catch(e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const requireBankStaff = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      (req as any).user = decoded;
      if (decoded.isGlobalAdmin) return next();

      const bankId = req.params.bankId || req.params.id;
      if (!bankId) return res.status(400).json({ error: "Bank ID missing" });

      const { db } = await import("./src/db/index");
      const { bankStaff } = await import("./src/db/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const staff = await db.select()
         .from(bankStaff)
         .where(and(eq(bankStaff.bankId, bankId), eq(bankStaff.discordId, decoded.discordId)))
         .get();
         
      if (!staff) return res.status(403).json({ error: "Forbidden - Not bank staff" });
      (req as any).staffRole = staff.role;
      next();
    } catch(e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const sendWebhook = async (bankId: string, message: string) => {
    try {
      const { db } = await import("./src/db/index");
      const { bankSettings } = await import("./src/db/schema");
      const { eq } = await import("drizzle-orm");
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId));
      if (settings.length > 0 && settings[0].discordWebhookUrl) {
        await fetch(settings[0].discordWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message })
        }).catch(err => console.error("Webhook firing failed", err));
      }
    } catch (e) {
      console.error(e);
    }
  };

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Public API Middleware
  const authenticateApiRequest = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
       return res.status(401).json({ error: "Missing or invalid authorization header. Expected Bearer token." });
    }
    const token = authHeader.split(" ")[1];
    
    // Check if token matches a bank
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    
    try {
      const bank = await db.select().from(banks).where(eq(banks.apiKey, token)).get();
      if (!bank) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      (req as any).bank = bank;
      next();
    } catch (e) {
       console.error(e);
       res.status(500).json({ error: "Internal error checking API key" });
    }
  };

  app.get("/api/v1/accounts", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bank.id));
       res.json({ data: accounts });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/v1/accounts", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const bank = (req as any).bank;

    try {
       const { discordId, initialDeposit, type, accountName } = req.body;
       if (!discordId) return res.status(400).json({ error: "missing discordId" });

       const id = uuidv4();
       
       await db.insert(bankAccounts).values({
         id,
         bankId: bank.id,
         ownerDiscordId: discordId,
         accountType: type || "checking",
         balance: parseInt(initialDeposit) || 0,
         accountName: accountName || `${type === 'savings' ? 'Savings' : 'Checking'} Account`,
         isActive: true,
         createdAt: new Date()
       });

       const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, id));
       res.json({ data: acc });

    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/v1/accounts/:accountId", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const [account] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, req.params.accountId), eq(bankAccounts.bankId, bank.id)));
       if (!account) return res.status(404).json({ error: "Account not found" });
       res.json({ data: account });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/v1/transfers", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const bank = (req as any).bank;

    try {
      const { fromAccountId, toAccountId, amount, description } = req.body;
      const amnt = Math.round(parseFloat(amount) * 100);

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, bank.id))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found" });
      if (!sourceAccount.isActive) return res.status(400).json({ error: "Source account is not active" });
      if (sourceAccount.balance < amnt) return res.status(400).json({ error: `Insufficient funds.` });

      const [destAccount] = await db.select().from(bankAccounts).where(
        eq(bankAccounts.id, toAccountId)
      );
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });
      if (!destAccount.isActive) return res.status(400).json({ error: "Destination account is not active" });

      // Process transfer
      await db.update(bankAccounts).set({ balance: sourceAccount.balance - amnt }).where(eq(bankAccounts.id, sourceAccount.id));
      await db.update(bankAccounts).set({ balance: destAccount.balance + amnt }).where(eq(bankAccounts.id, destAccount.id));

      const txId = uuidv4();
      await db.insert(transactions).values({
        id: txId,
        bankId: bank.id,
        fromAccountId: sourceAccount.id,
        toAccountId: destAccount.id,
        type: "transfer",
        amount: amnt,
        description: description || `API Transfer to ${toAccountId.substring(0, 8)}`,
        timestamp: new Date()
      });

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      res.json({ data: tx });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/v1/transactions", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { transactions } = await import("./src/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const txs = await db.select().from(transactions).where(eq(transactions.bankId, bank.id)).orderBy(desc(transactions.timestamp)).limit(50);
       res.json({ data: txs });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/v1/cards", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const bank = (req as any).bank;

    try {
       const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bank.id));
       if (accounts.length === 0) return res.json({ data: [] });

       const accountIds = accounts.map(a => a.id);
       const bankCards = await db.select().from(cards).where(inArray(cards.accountId, accountIds));
       res.json({ data: bankCards });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/v1/cards", authenticateApiRequest, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const bank = (req as any).bank;

    try {
       const { accountId, type } = req.body;
       const [account] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bank.id)));
       if (!account) return res.status(404).json({ error: "Account not found or does not belong to this bank" });

       let cardNumber = "";
       for(let i=0; i<16; i++) cardNumber += Math.floor(Math.random() * 10).toString();
       const cvv = Math.floor(100 + Math.random() * 900).toString();
       const expiryDate = `${new Date().getMonth() + 1}/${new Date().getFullYear() + 3 - 2000}`;

       const cardId = uuidv4();
       await db.insert(cards).values({
         id: cardId,
         bankId: bank.id,
         accountId,
         type: type === 'credit' ? 'credit' : 'debit',
         cardNumber,
         cvv,
         expiryDate,
         isLocked: false,
         createdAt: new Date()
       });

       const [newCard] = await db.select().from(cards).where(eq(cards.id, cardId));
       res.json({ data: newCard });
    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/transactions/recent", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { transactions, banks } = await import("./src/db/schema");
    const { desc, eq } = await import("drizzle-orm");

    try {
      const recent = await db.select({
        id: transactions.id,
        amount: transactions.amount,
        type: transactions.type,
        description: transactions.description,
        timestamp: transactions.timestamp,
        bankName: banks.name
      })
      .from(transactions)
      .leftJoin(banks, eq(transactions.bankId, banks.id))
      .orderBy(desc(transactions.timestamp))
      .limit(50);

      res.json(recent);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:id", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const { name, discordToken, corpId, corpApiUuid, corpApiKey } = req.body;
      await db.update(banks).set({
        name, discordToken, corpId: corpId ? parseInt(corpId) : null, corpApiUuid, corpApiKey
      }).where(eq(banks.id, req.params.id));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.delete("/api/banks/:id", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { botManager } = await import("./src/lib/bot_manager");
    try {
      const id = req.params.id;
      await botManager.stopBankBot(id);
      await db.delete(transactions).where(eq(transactions.bankId, id));
      await db.delete(bankAccounts).where(eq(bankAccounts.bankId, id));
      await db.delete(banks).where(eq(banks.id, id));
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });
  
  app.post("/api/banks/:id/bot-status", async (req, res) => {
    const { botManager } = await import("./src/lib/bot_manager");
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const { action } = req.body;
      const id = req.params.id;
      
      if (action === 'stop') {
        await botManager.stopBankBot(id);
        res.json({ success: true, status: 'offline' });
      } else if (action === 'start') {
        const bankRecord = await db.select().from(banks).where(eq(banks.id, id));
        if (bankRecord.length > 0) {
          await botManager.provisionBankBot(id, bankRecord[0].discordToken);
          res.json({ success: true, status: 'online' });
        } else {
          res.status(404).json({ error: 'Bank not found' });
        }
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/stats", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts, transactions } = await import("./src/db/schema");
    const { count, sum, eq, gte } = await import("drizzle-orm");

    try {
      const [{ value: bankCount }] = await db.select({ value: count() }).from(banks);
      const [{ value: userCount }] = await db.select({ value: count() }).from(bankAccounts);
      
      const onyxTx = await db.select({ value: sum(transactions.amount) }).from(transactions).where(eq(transactions.type, 'onyx_payment'));
      const totalTx = await db.select({ value: sum(transactions.amount) }).from(transactions);

      // Generate 30 days of timeline
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const recentTx = await db.select()
        .from(transactions)
        .where(gte(transactions.timestamp, thirtyDaysAgo));

      // Group by day
      const dailyData: Record<string, number> = {};
      
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        dailyData[d.toISOString().split('T')[0]] = 0;
      }
      
      recentTx.forEach(tx => {
        const day = new Date(tx.timestamp).toISOString().split('T')[0];
        if (dailyData[day] !== undefined) {
          dailyData[day] += tx.amount / 100;
        }
      });

      const timeline = Object.entries(dailyData).map(([date, volume]) => ({
        date,
        volume
      }));

      res.json({
        bankCount: bankCount || 0,
        userCount: userCount || 0,
        onyxProcessedCents: onyxTx[0]?.value || 0,
        totalPlatformVolumeCents: totalTx[0]?.value || 0,
        timeline,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/bots/status", (req, res) => {
    res.json(botManager.getBankStatuses());
  });

  // Banks API
  app.get("/api/banks", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    try {
      const allBanks = await db.select().from(banks);
      const statuses = botManager.getBankStatuses();
      
      const enrichedBanks = allBanks.map(b => ({
        ...b,
        status: statuses[b.id] || "offline"
      }));
      res.json(enrichedBanks);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { name, guildId, discordToken, customDomain, corpId, corpApiUuid, corpApiKey } = req.body;
      const newBank = {
        id: uuidv4(),
        name,
        guildId,
        discordToken,
        customDomain,
        corpId,
        corpApiUuid,
        corpApiKey,
        status: "offline",
        createdAt: new Date(),
      };
      await db.insert(banks).values(newBank);
      
      // Attempt to provision bot
      try {
        await botManager.provisionBankBot(newBank.id, discordToken);
      } catch (err) {
        console.error("Failed to provision new bot right away", err);
      }

      // Add WS listener
      if (corpId && corpApiUuid && corpApiKey) {
        const { addCityCorpEventSubscriber } = await import("./src/lib/bot_events");
        addCityCorpEventSubscriber(newBank.id, corpApiUuid, corpApiKey);
      }
      
      res.json(newBank);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Onyx Setup API
  app.get("/api/onyx/citycorp-logs", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cityCorpLogs, banks } = await import("./src/db/schema");
    const { desc, eq } = await import("drizzle-orm");

    try {
      const logs = await db.select({
        id: cityCorpLogs.id,
        bankName: banks.name,
        endpoint: cityCorpLogs.endpoint,
        latencyMs: cityCorpLogs.latencyMs,
        status: cityCorpLogs.status,
        success: cityCorpLogs.success,
        errorMessage: cityCorpLogs.errorMessage,
        payload: cityCorpLogs.payload,
        timestamp: cityCorpLogs.timestamp
      })
      .from(cityCorpLogs)
      .leftJoin(banks, eq(cityCorpLogs.bankId, banks.id))
      .orderBy(desc(cityCorpLogs.timestamp))
      .limit(100);

      res.json(logs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.get("/api/onyx/settings", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { onyxSettings } = await import("./src/db/schema");
    try {
      let settings = await db.select().from(onyxSettings).get();
      if (!settings) {
        settings = { id: "global", b2bApiFeePercent: 200, clearinghouseEnabled: true };
        await db.insert(onyxSettings).values(settings);
      }
      res.json(settings);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.put("/api/onyx/settings", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { onyxSettings } = await import("./src/db/schema");
    try {
      const { b2bApiFeePercent, clearinghouseEnabled } = req.body;
      const data = { id: "global", b2bApiFeePercent, clearinghouseEnabled };
      const exists = await db.select().from(onyxSettings).get();
      if (exists) await db.update(onyxSettings).set(data).where({ id: "global" } as any);
      else await db.insert(onyxSettings).values(data);
      res.json(data);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.get("/api/onyx/merchants", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { onyxMerchants } = await import("./src/db/schema");
    try {
      const merchants = await db.select().from(onyxMerchants);
      res.json(merchants);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/onyx/settlements", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { clearinghouseSettlements, banks } = await import("./src/db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");

    try {
      const fromBanks = alias(banks, "from_bnk");
      const toBanks = alias(banks, "to_bnk");
      const settlements = await db.select({
        id: clearinghouseSettlements.id,
        amount: clearinghouseSettlements.amount,
        status: clearinghouseSettlements.status,
        timestamp: clearinghouseSettlements.createdAt,
        fromBankName: fromBanks.name,
        toBankName: toBanks.name,
      })
      .from(clearinghouseSettlements)
      .leftJoin(fromBanks, eq(clearinghouseSettlements.fromBankId, fromBanks.id))
      .leftJoin(toBanks, eq(clearinghouseSettlements.toBankId, toBanks.id))
      .orderBy(desc(clearinghouseSettlements.createdAt))
      .limit(50);
      
      res.json(settlements);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/onyx/merchants", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { onyxMerchants } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    const crypto = await import("crypto");
    
    try {
      const { name, bankId, destinationAccount } = req.body;
      const apiKey = "onyx_live_" + crypto.randomBytes(24).toString('hex');
      
      const newMerchant = {
        id: uuidv4(),
        name,
        bankId,
        destinationAccount,
        apiKey,
        createdAt: new Date(),
      };
      
      await db.insert(onyxMerchants).values(newMerchant);
      res.json(newMerchant);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Onyx Checkout API for third-party servers
  app.post("/api/onyx/checkout", async (req, res) => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) return res.status(401).json({ error: "Missing x-api-key header" });

    const { db } = await import("./src/db/index");
    const { onyxMerchants, bankAccounts, transactions, banks } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      // Authenticate merchant
      const merchants = await db.select().from(onyxMerchants).where(eq(onyxMerchants.apiKey, apiKey));
      if (merchants.length === 0) return res.status(403).json({ error: "Invalid API key" });
      const merchant = merchants[0];

      const { userDiscordId, amountCents, description, sourceAccountId } = req.body;

      if (!userDiscordId || !amountCents || amountCents <= 0) {
        return res.status(400).json({ error: "Invalid payment payload" });
      }

      await db.transaction(async (tx) => {
        let userAccount;
        if (sourceAccountId) {
           const matches = await tx.select().from(bankAccounts).where(
             and(eq(bankAccounts.id, sourceAccountId), eq(bankAccounts.ownerDiscordId, userDiscordId))
           );
           if (matches.length === 0) throw new Error("Provided source account not found or unauthorized.");
           userAccount = matches[0];
        } else {
           // Fallback to finding an account in the routing bank
           const userAccounts = await tx.select().from(bankAccounts).where(
             and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.ownerDiscordId, userDiscordId))
           );
   
           if (userAccounts.length === 0) {
             throw new Error("Customer has no bank accounts in the routing bank.");
           }
           userAccount = userAccounts[0]; 
        }

        if (userAccount.balance < amountCents) {
          throw new Error(`Insufficient funds. Customer balance is ${(userAccount.balance / 100).toFixed(2)}.`);
        }

        // Prepare CityCorp client
        const { CityCorpClient } = await import("./src/lib/citycorp_api");
        const merchantBankRes = await tx.select().from(banks).where(eq(banks.id, merchant.bankId));
        const merchantBank = merchantBankRes[0];
        
        const sourceBankRes = await tx.select().from(banks).where(eq(banks.id, userAccount.bankId));
        const sourceBank = sourceBankRes[0];

        const isSourceBankCityCorp = !!(sourceBank && sourceBank.corpId && sourceBank.corpApiUuid && sourceBank.corpApiKey);
        const isMerchantBankCityCorp = !!(merchantBank && merchantBank.corpId && merchantBank.corpApiUuid && merchantBank.corpApiKey);

        // Calculate Tax
        const { onyxSettings, clearinghouseBalances } = await import("./src/db/schema");
        const onyxSet = await tx.select().from(onyxSettings).where(eq(onyxSettings.id, 'global')).get();
        const taxRate = onyxSet?.b2bApiFeePercent || 0; 
        const taxAmount = Math.floor(amountCents * (taxRate / 10000));
        const netAmount = amountCents - taxAmount;

        let destAccountId = null as any;
        const destAccounts = await tx.select().from(bankAccounts).where(
          and(eq(bankAccounts.bankId, merchant.bankId), eq(bankAccounts.accountName, merchant.destinationAccount))
        );

        if (destAccounts.length === 0) {
          destAccountId = uuidv4();
          await tx.insert(bankAccounts).values({
            id: destAccountId,
            bankId: merchant.bankId,
            ownerDiscordId: 'merchant_system',
            accountName: merchant.destinationAccount,
            balance: isMerchantBankCityCorp ? 0 : netAmount, 
            createdAt: new Date(),
          });
        } else {
          destAccountId = destAccounts[0].id;
          if (!isMerchantBankCityCorp) {
            await tx.update(bankAccounts)
              .set({ balance: destAccounts[0].balance + netAmount })
              .where(eq(bankAccounts.id, destAccountId));
          }
        }

        // Deduct from Source
        if (isSourceBankCityCorp) {
           const client = new CityCorpClient(sourceBank.corpId!, sourceBank.corpApiUuid!, sourceBank.corpApiKey!);
           const wRes = await client.withdraw(userAccount.accountName, amountCents / 100);
           if (!wRes.success) throw new Error(`Onyx CityCorp Withdrawal Failed: ${wRes.message}`);
        } else {
           await tx.update(bankAccounts)
             .set({ balance: userAccount.balance - amountCents })
             .where(eq(bankAccounts.id, userAccount.id));
        }

        // Add to Destination CityCorp if needed
        if (isMerchantBankCityCorp) {
           const client = new CityCorpClient(merchantBank.corpId!, merchantBank.corpApiUuid!, merchantBank.corpApiKey!);
           const dRes = await client.deposit(merchant.destinationAccount, netAmount / 100);
           if (!dRes.success) {
             // Rollback if destination fails
             if (isSourceBankCityCorp) {
                const sClient = new CityCorpClient(sourceBank.corpId!, sourceBank.corpApiUuid!, sourceBank.corpApiKey!);
                await sClient.deposit(userAccount.accountName, amountCents / 100);
             } else {
                await tx.update(bankAccounts)
                 .set({ balance: userAccount.balance }) // Revert
                 .where(eq(bankAccounts.id, userAccount.id));
             }
             throw new Error(`Onyx CityCorp Deposit Failed: ${dRes.message}`);
           }
        }
        
        // Handle Clearinghouse Balance Difference
        if (sourceBank.id !== merchantBank.id) {
            // Money left Source network and entered Merchant network
            const fBalance = await tx.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, sourceBank.id)).get();
            if(!fBalance) await tx.insert(clearinghouseBalances).values({ bankId: sourceBank.id, balance: -amountCents });
            else await tx.update(clearinghouseBalances).set({ balance: fBalance.balance - amountCents }).where(eq(clearinghouseBalances.bankId, sourceBank.id));

            const tBalance = await tx.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, merchantBank.id)).get();
            if(!tBalance) await tx.insert(clearinghouseBalances).values({ bankId: merchantBank.id, balance: netAmount });
            else await tx.update(clearinghouseBalances).set({ balance: tBalance.balance + netAmount }).where(eq(clearinghouseBalances.bankId, merchantBank.id));
        }

        if (taxAmount > 0) {
            await tx.insert(transactions).values({
               id: uuidv4(),
               bankId: merchant.bankId,
               fromAccountId: null,
               toAccountId: null,
               type: 'onyx_tax',
               amount: taxAmount,
               description: `Onyx PSP API Processor Fee`,
               timestamp: new Date()
            });
        }

        // Create transaction record explicitly so it shows up as an onyx payment in our DB
        await tx.insert(transactions).values({
          id: uuidv4(),
          bankId: merchant.bankId,
          fromAccountId: userAccount.id,
          toAccountId: destAccountId,
          amount: amountCents,
          type: 'onyx_payment',
          description: description || `Onyx Purchase at ${merchant.name}`,
          timestamp: new Date()
        });
      });

      res.json({ success: true, message: "Payment processed successfully." });
    } catch (e: any) {
      console.error(e);
      res.status(400).json({ error: e.message || "Internal error during checkout" });
    }
  });

  // ==========================
  // INVOICES API
  // ==========================

  app.get("/api/banks/:bankId/invoices", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { invoices } = await import("./src/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const data = await db.select().from(invoices).where(eq(invoices.bankId, req.params.bankId)).orderBy(desc(invoices.createdAt));
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/invoices", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { invoices, bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { billerAccountId, customerAccountId, amount, description, dueDateDays } = req.body;
      
      const bAcc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, billerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!bAcc) return res.status(400).json({ error: "Biller account not found" });

      const due = new Date();
      due.setDate(due.getDate() + (dueDateDays || 7));

      const newInv = {
         id: uuidv4(),
         bankId: req.params.bankId,
         billerAccountId,
         customerAccountId,
         amount,
         description: description || "Invoice",
         dueDate: due,
         status: "pending",
         createdAt: new Date(),
      };
      
      await db.insert(invoices).values(newInv);
      res.json(newInv);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.put("/api/banks/:bankId/invoices/:invoiceId/status", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { invoices } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.update(invoices).set({ status: req.body.status }).where(eq(invoices.id, req.params.invoiceId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/portal/:bankId/info", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankSettings } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bank = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bank.id)).get();
      res.json({ ...bank, settings });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/portal/:bankId/lookup", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts, transactions, invoices, cards, bankSettings } = await import("./src/db/schema");
    const { eq, and, or, desc, inArray } = await import("drizzle-orm");

    try {
      const discordId = req.query.discordId as string;
      const bankId = req.params.bankId;
      if (!discordId) return res.status(400).json({ error: "Missing discordId" });

      const userAccounts = await db.select({
        id: bankAccounts.id,
        bankId: bankAccounts.bankId,
        bankName: banks.name,
        accountName: bankAccounts.accountName,
        type: bankAccounts.accountType,
        balance: bankAccounts.balance
      })
      .from(bankAccounts)
      .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
      .where(and(eq(bankAccounts.ownerDiscordId, discordId), eq(bankAccounts.bankId, bankId)));

      if (userAccounts.length === 0) {
         return res.json({ accounts: [], recentTx: [], pendingInvoices: [], cards: [] });
      }

      const accountIds = userAccounts.map(a => a.id);

      const recentTxs = await db.select()
        .from(transactions)
        .where(or(
          inArray(transactions.fromAccountId, accountIds),
          inArray(transactions.toAccountId, accountIds)
        ))
        .orderBy(desc(transactions.timestamp))
        .limit(10);

      const mappedTxs = recentTxs.map(tx => ({
        ...tx,
        toDiscordId: accountIds.includes(tx.toAccountId!) ? discordId : null
      }));

      // Map pending invoices
      const userInvoices = await db.select({
         id: invoices.id,
         amount: invoices.amount,
         description: invoices.description,
         dueDate: invoices.dueDate,
         billerName: banks.name, 
         customerAccountName: bankAccounts.accountName
      })
      .from(invoices)
      .leftJoin(banks, eq(invoices.bankId, banks.id))
      .leftJoin(bankAccounts, eq(invoices.customerAccountId, bankAccounts.id))
      .where(
         and(
            inArray(invoices.customerAccountId, accountIds),
            eq(invoices.status, "pending"),
            eq(invoices.bankId, bankId)
         )
      )
      .orderBy(desc(invoices.createdAt));

      // Get user cards
      const userCards = await db.select({
         id: cards.id,
         bankId: cards.bankId,
         bankName: banks.name,
         accountId: cards.accountId,
         accountName: bankAccounts.accountName,
         cardNumber: cards.cardNumber,
         cvv: cards.cvv,
         expiryDate: cards.expiryDate,
         isLocked: cards.isLocked,
         type: cards.type
      })
      .from(cards)
      .leftJoin(banks, eq(cards.bankId, banks.id))
      .leftJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
      .where(and(inArray(cards.accountId, accountIds), eq(cards.bankId, bankId)));

      res.json({
        accounts: userAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        cards: userCards
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/portal/:bankId/pay-invoice", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, invoices } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { discordId, invoiceId } = req.body;
      const bankId = req.params.bankId;

      const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.bankId, bankId)));
      if (!inv || inv.status !== 'pending') return res.status(404).json({ error: "Invoice not found or already paid" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, inv.customerAccountId), eq(bankAccounts.ownerDiscordId, discordId))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found or unauthorized to pay this invoice" });
      if (sourceAccount.balance < inv.amount) return res.status(400).json({ error: `Insufficient funds. Balance: $${(sourceAccount.balance/100).toFixed(2)}, Due: $${(inv.amount/100).toFixed(2)}` });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, inv.billerAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination biller account not found" });

      await db.update(bankAccounts).set({ balance: sourceAccount.balance - inv.amount }).where(eq(bankAccounts.id, sourceAccount.id));
      await db.update(bankAccounts).set({ balance: destAccount.balance + inv.amount }).where(eq(bankAccounts.id, destAccount.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: sourceAccount.bankId,
        fromAccountId: sourceAccount.id,
        toAccountId: destAccount.id,
        type: "transfer",
        amount: inv.amount,
        description: `Invoice Payment: ${inv.description || inv.id}`,
        timestamp: new Date()
      });

      await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, inv.id));

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/portal/:bankId/transfer", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { discordId, fromAccountId, toAccountId, amount } = req.body;
      const bankId = req.params.bankId;
      const amnt = Math.round(parseFloat(amount) * 100);

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, discordId), eq(bankAccounts.bankId, bankId))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found or unauthorized" });
      if (sourceAccount.balance < amnt) return res.status(400).json({ error: `Insufficient funds.` });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, toAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });

      await db.update(bankAccounts).set({ balance: sourceAccount.balance - amnt }).where(eq(bankAccounts.id, sourceAccount.id));
      await db.update(bankAccounts).set({ balance: destAccount.balance + amnt }).where(eq(bankAccounts.id, destAccount.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: sourceAccount.bankId,
        fromAccountId: sourceAccount.id,
        toAccountId: destAccount.id,
        type: "transfer",
        amount: amnt,
        description: `Citizen Portal Transfer to ${toAccountId.substring(0, 8)}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/portal/:bankId/cards/:cardId/lock", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { discordId, isLocked } = req.body;
      const [card] = await db.select().from(cards).where(eq(cards.id, req.params.cardId));
      
      if (!card || card.bankId !== req.params.bankId) return res.status(404).json({ error: "Card not found" });

      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, card.accountId));
      if (!account || account.ownerDiscordId !== discordId) {
         return res.status(403).json({ error: "Unauthorized" });
      }

      await db.update(cards).set({ isLocked: !!isLocked }).where(eq(cards.id, req.params.cardId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/citizen/loans/apply", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans, bankSettings, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { bankId, discordId, accountId, principalAmount, purpose } = req.body;
      if (!bankId || !discordId || !accountId || !principalAmount) return res.status(400).json({ error: "Missing fields" });

      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
      if (!settings || !settings.enableLoans) return res.status(400).json({ error: "Loans are disabled for this bank" });

      const autoApprove = settings.autoApproveLoans && principalAmount <= (settings.maxAutoApproveLoanAmount || 0);

      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 30); // Need payment in 30 days
      
      const loanId = uuidv4();
      
      await db.insert(loans).values({
        id: loanId,
        bankId,
        discordId,
        accountId,
        principalAmount,
        remainingAmount: principalAmount, // Assuming simple starting amount, interest accrues or is pre-calculated
        interestRate: 500, // Defauting to 5% apr unless you have complex logic
        nextPaymentDate,
        purpose,
        status: autoApprove ? "approved" : "pending",
        createdAt: new Date(),
      });

      if (autoApprove) {
         // Auto fund
         const ts = new Date();
         await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${principalAmount}` }).where(eq(bankAccounts.id, accountId));
         await db.insert(transactions).values({
            id: uuidv4(),
            bankId,
            fromAccountId: null,
            toAccountId: accountId,
            type: "deposit",
            amount: principalAmount,
            description: `Auto-Approved Loan Disbursement (Principal: $${(principalAmount/100).toFixed(2)})`,
            timestamp: ts
         });
         await db.update(loans).set({ status: "active" }).where(eq(loans.id, loanId));
      }

      const { botManager } = await import("./src/lib/bot_manager");
      botManager.sendNotification(bankId, `New Loan Application: \nDiscord ID: ${discordId}\nAmount: $${(principalAmount/100).toFixed(2)}\nPurpose: ${purpose || 'None specified'}\nStatus: ${autoApprove ? 'Auto-Approved' : 'Pending Review'}`);

      res.json({ success: true, autoApprove });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.post("/api/citizen/credit/apply", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { creditApplications, bankSettings, cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
       const { bankId, discordId, accountId, requestedLimit, monthlyIncome, purpose } = req.body;
       if (!bankId || !discordId || !accountId || !requestedLimit || !monthlyIncome) return res.status(400).json({ error: "Missing fields" });

       const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
       if (!settings || !settings.enableCards) return res.status(400).json({ error: "Cards disabled" });

       const autoApprove = settings.autoApproveCreditCards && requestedLimit <= ((settings.maxAutoApproveLoanAmount || 0) / 2); // Credit is riskier, half parameter
       
       const appId = uuidv4();
       
       await db.insert(creditApplications).values({
           id: appId,
           bankId,
           discordId,
           accountId,
           requestedLimit,
           monthlyIncome,
           purpose,
           status: autoApprove ? "approved" : "pending",
           createdAt: new Date(),
       });

       if (autoApprove) {
          // Provision credit card
          function generateCC() {
            let cc = "";
            for(let i=0; i<16; i++) cc += Math.floor(Math.random() * 10).toString();
            return cc;
          }
          const expiry = new Date();
          expiry.setFullYear(expiry.getFullYear() + 3);
          const cvv = Math.floor(100 + Math.random() * 900).toString();
          
          await db.insert(cards).values({
            id: uuidv4(),
            bankId,
            accountId,
            cardNumber: generateCC(),
            cvv,
            expiryDate: `${(expiry.getMonth()+1).toString().padStart(2, '0')}/${expiry.getFullYear().toString().slice(-2)}`,
            isLocked: false,
            type: "credit",
            creditLimit: requestedLimit,
            creditUsed: 0,
            apr: 1999, // 19.99% APR default
            createdAt: new Date(),
          });
       }

       res.json({ success: true, autoApprove });

    } catch(e) {
       console.error(e);
       res.status(500).json({ error: "Internal Error" });
    }
  });

    app.get("/api/citizen/lookup", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts, transactions, invoices, cards, loans } = await import("./src/db/schema");
    const { eq, and, or, desc, inArray } = await import("drizzle-orm");

    try {
      const discordId = req.query.discordId as string;
      if (!discordId) {
        return res.status(400).json({ error: "Missing discordId" });
      }

      // Fetch all accounts owned by this user
      const userAccounts = await db.select({
        id: bankAccounts.id,
        accountName: bankAccounts.accountName,
        balance: bankAccounts.balance,
        bankName: banks.name,
      })
      .from(bankAccounts)
      .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
      .where(eq(bankAccounts.ownerDiscordId, discordId));

      if (userAccounts.length === 0) {
         return res.json({ accounts: [], recentTx: [], pendingInvoices: [], cards: [], loans: [] });
      }

      const accountIds = userAccounts.map(a => a.id);

      // Fetch recent transactions involving these accounts
      const userTxs = await db.select({
        amount: transactions.amount,
        type: transactions.type,
        timestamp: transactions.timestamp,
        description: transactions.description,
        fromAccountId: transactions.fromAccountId,
        toAccountId: transactions.toAccountId,
        bankName: banks.name
      })
      .from(transactions)
      .leftJoin(banks, eq(transactions.bankId, banks.id))
      .where(
        or(
          ...accountIds.map(id => eq(transactions.fromAccountId, id)),
          ...accountIds.map(id => eq(transactions.toAccountId, id))
        )
      )
      .orderBy(desc(transactions.timestamp))
      .limit(20);

      // Map tx to incoming/outgoing purely for display
      const mappedTxs = userTxs.map(tx => ({
        ...tx,
        toDiscordId: accountIds.includes(tx.toAccountId!) ? discordId : null
      }));

      // Map pending invoices
      const userInvoices = await db.select({
         id: invoices.id,
         amount: invoices.amount,
         description: invoices.description,
         dueDate: invoices.dueDate,
         billerName: banks.name, 
         billerAccountName: bankAccounts.accountName
      })
      .from(invoices)
      .leftJoin(banks, eq(invoices.bankId, banks.id))
      .leftJoin(bankAccounts, eq(invoices.billerAccountId, bankAccounts.id))
      .where(
         and(
            inArray(invoices.customerAccountId, accountIds),
            eq(invoices.status, "pending")
         )
      )
      .orderBy(desc(invoices.createdAt));

      // Get user cards
      const userCards = await db.select({
         id: cards.id,
         bankId: cards.bankId,
         bankName: banks.name,
         accountId: cards.accountId,
         accountName: bankAccounts.accountName,
         cardNumber: cards.cardNumber,
         cvv: cards.cvv,
         expiryDate: cards.expiryDate,
         isLocked: cards.isLocked,
         type: cards.type
      })
      .from(cards)
      .leftJoin(banks, eq(cards.bankId, banks.id))
      .leftJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
      .where(inArray(cards.accountId, accountIds));

      // Get user active loans
      const userLoans = await db.select({
         id: loans.id,
         bankName: banks.name,
         principalAmount: loans.principalAmount,
         remainingAmount: loans.remainingAmount,
         interestRate: loans.interestRate,
         nextPaymentDate: loans.nextPaymentDate,
         status: loans.status
      })
      .from(loans)
      .leftJoin(banks, eq(loans.bankId, banks.id))
      .where(
         and(
           eq(loans.discordId, discordId),
           eq(loans.status, 'active')
         )
      );

      res.json({
        accounts: userAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        cards: userCards,
        loans: userLoans
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/citizen/cards/:cardId/lock", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { discordId, isLocked } = req.body;
      const [card] = await db.select().from(cards).where(eq(cards.id, req.params.cardId));
      
      if (!card) return res.status(404).json({ error: "Card not found" });

      const [account] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, card.accountId));
      if (!account || account.ownerDiscordId !== discordId) {
         return res.status(403).json({ error: "Unauthorized" });
      }

      await db.update(cards).set({ isLocked: !!isLocked }).where(eq(cards.id, req.params.cardId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/citizen/pay-loan", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, loans } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { loanId, fromAccountId, amount } = req.body;
      if (!loanId || !fromAccountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const fromAcc = await db.select().from(bankAccounts).where(eq(bankAccounts.id, fromAccountId));
      if (!fromAcc.length) return res.status(404).json({ error: "Account not found" });

      if (fromAcc[0].balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      const theLoan = await db.select().from(loans).where(eq(loans.id, loanId));
      if (!theLoan.length || theLoan[0].status !== 'active') return res.status(400).json({ error: "Invalid loan" });

      // Deduct funds
      await db.update(bankAccounts).set({ balance: fromAcc[0].balance - amount }).where(eq(bankAccounts.id, fromAccountId));
      
      const newRemaining = theLoan[0].remainingAmount - amount;

      await db.update(loans).set({ 
        remainingAmount: newRemaining,
        status: newRemaining <= 0 ? 'paid' : 'active'
      }).where(eq(loans.id, loanId));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: theLoan[0].bankId,
        fromAccountId: fromAccountId,
        toAccountId: null,
        amount: amount,
        type: 'transfer',
        description: `Manual Loan Payment`,
        timestamp: new Date()
      });

      res.json({ success: true, remaining: newRemaining });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/citizen/pay-invoice", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, invoices } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { discordId, invoiceId } = req.body;

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!inv || inv.status !== 'pending') return res.status(404).json({ error: "Invoice not found or already paid" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, inv.customerAccountId), eq(bankAccounts.ownerDiscordId, discordId))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found or unauthorized to pay this invoice" });
      if (sourceAccount.balance < inv.amount) return res.status(400).json({ error: `Insufficient funds. Balance: $${(sourceAccount.balance/100).toFixed(2)}, Due: $${(inv.amount/100).toFixed(2)}` });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, inv.billerAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination biller account not found" });

      // Execute payment
      await db.update(bankAccounts).set({ balance: sourceAccount.balance - inv.amount }).where(eq(bankAccounts.id, sourceAccount.id));
      await db.update(bankAccounts).set({ balance: destAccount.balance + inv.amount }).where(eq(bankAccounts.id, destAccount.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: sourceAccount.bankId,
        fromAccountId: sourceAccount.id,
        toAccountId: destAccount.id,
        type: "transfer",
        amount: inv.amount,
        description: `Invoice Payment: ${inv.description || inv.id}`,
        timestamp: new Date()
      });

      await db.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, inv.id));

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/citizen/transfer", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, bankSettings, interBankTransfers, clearinghouseBalances } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { discordId, fromAccountId, toAccountId, amount } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      const [sourceAccount] = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, discordId))
      );

      if (!sourceAccount) return res.status(404).json({ error: "Source account not found or unauthorized" });
      if (sourceAccount.balance < parsedAmount) return res.status(400).json({ error: "Insufficient funds" });

      const [destAccount] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, toAccountId));
      if (!destAccount) return res.status(404).json({ error: "Destination account not found" });

      const fromBank = sourceAccount.bankId;
      const toBank = destAccount.bankId;

      if (fromBank === toBank) {
        // Execute internal transfer
        await db.update(bankAccounts).set({ balance: sourceAccount.balance - parsedAmount }).where(eq(bankAccounts.id, sourceAccount.id));
        await db.update(bankAccounts).set({ balance: destAccount.balance + parsedAmount }).where(eq(bankAccounts.id, destAccount.id));

        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: sourceAccount.bankId,
          fromAccountId: sourceAccount.id,
          toAccountId: destAccount.id,
          type: "transfer",
          amount: parsedAmount,
          description: `Transfer to ${destAccount.accountName}`,
          timestamp: new Date()
        });

        const { botManager } = await import("./src/lib/bot_manager");
        botManager.sendNotification(sourceAccount.bankId, `💸 **Citizen Transfer**: <@${discordId}> transferred $${(parsedAmount/100).toFixed(2)} from **${sourceAccount.accountName}** to **${destAccount.accountName}**.`);
      } else {
         // Inter-bank transfer logic
         const tSettings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, toBank)).get();
         const wireThresh = tSettings?.interBankWireThreshold || 5000000;

         if (parsedAmount >= wireThresh) {
            // Require direct wire transfer
            await db.update(bankAccounts).set({ balance: sourceAccount.balance - parsedAmount }).where(eq(bankAccounts.id, sourceAccount.id));
            
            // Generate inter bank transfer record
            const transId = uuidv4();
            await db.insert(interBankTransfers).values({
               id: transId,
               fromBankId: fromBank,
               toBankId: toBank,
               fromAccountId: sourceAccount.id,
               toAccountId: destAccount.id,
               amount: parsedAmount,
               status: "pending_wire",
               createdAt: new Date()
            });

            await db.insert(transactions).values({
               id: uuidv4(),
               bankId: fromBank,
               fromAccountId: sourceAccount.id,
               toAccountId: null,
               type: "transfer",
               amount: parsedAmount,
               description: `Pending Wire: Transfer to foreign bank account`,
               timestamp: new Date()
            });
            
            const { botManager } = await import("./src/lib/bot_manager");
            botManager.sendNotification(fromBank, `🏦 **Pending Outbound Wire**: <@${discordId}> initiated a $${(parsedAmount/100).toFixed(2)} wire transfer to a foreign bank. Please use in-game commands to securely wire this sum to the receiving bank's corp, then approve the wire in SaaS.`);
            botManager.sendNotification(toBank, `🏦 **Pending Inbound Wire**: Expect an inbound wire transfer of $${(parsedAmount/100).toFixed(2)}. Once received in game, approve the transfer to deposit into the customer's account.`);

         } else {
            // Under threshold - process through Onyx Clearinghouse
            await db.update(bankAccounts).set({ balance: sourceAccount.balance - parsedAmount }).where(eq(bankAccounts.id, sourceAccount.id));
            await db.update(bankAccounts).set({ balance: destAccount.balance + parsedAmount }).where(eq(bankAccounts.id, destAccount.id));

            await db.insert(transactions).values({
              id: uuidv4(),
              bankId: fromBank,
              fromAccountId: sourceAccount.id,
              toAccountId: null,
              type: "transfer",
              amount: parsedAmount,
              description: `Onyx Transfer to foreign bank`,
              timestamp: new Date()
            });

            await db.insert(transactions).values({
              id: uuidv4(),
              bankId: toBank,
              fromAccountId: null,
              toAccountId: destAccount.id,
              type: "deposit",
              amount: parsedAmount,
              description: `Onyx Transfer from external bank`,
              timestamp: new Date()
            });

            // Update clearinghouse balances
            const fBalance = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, fromBank)).get();
            if(!fBalance) await db.insert(clearinghouseBalances).values({ bankId: fromBank, balance: -parsedAmount });
            else await db.update(clearinghouseBalances).set({ balance: fBalance.balance - parsedAmount }).where(eq(clearinghouseBalances.bankId, fromBank));

            const tBalance = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, toBank)).get();
            if(!tBalance) await db.insert(clearinghouseBalances).values({ bankId: toBank, balance: parsedAmount });
            else await db.update(clearinghouseBalances).set({ balance: tBalance.balance + parsedAmount }).where(eq(clearinghouseBalances.bankId, toBank));

            const { botManager } = await import("./src/lib/bot_manager");
            botManager.sendNotification(fromBank, `💸 **Onyx Transfer Out**: <@${discordId}> transferred $${(parsedAmount/100).toFixed(2)} to a foreign bank account.`);
            botManager.sendNotification(toBank, `💸 **Onyx Transfer In**: Received $${(parsedAmount/100).toFixed(2)} via clearinghouse.`);
         }
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  // Whitelabeled Bank Operator API
  app.post("/api/banks/:bankId/customers/:discordId/freeze", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const dId = req.params.discordId;
      const { freeze } = req.body;

      await db.update(bankAccounts)
        .set({ isActive: !freeze })
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, dId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: freeze ? 'customer_frozen' : 'customer_unfrozen',
        details: `${freeze ? 'Froze' : 'Unfroze'} all accounts for discord ID ${dId}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/banks/:bankId/audit", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { auditLogs } = await import("./src/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.bankId, req.params.bankId)).orderBy(desc(auditLogs.timestamp));
      res.json(logs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/customers", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { eq, sum, count, min } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      
      const customerMap = new Map<string, any>();
      for (const account of dbAccounts) {
        const dId = account.ownerDiscordId;
        if (!customerMap.has(dId)) {
          customerMap.set(dId, { discordId: dId, accountCount: 0, totalBalance: 0, firstJoined: account.createdAt });
        }
        const c = customerMap.get(dId);
        c.accountCount += 1;
        c.totalBalance += account.balance;
        if (new Date(account.createdAt) < new Date(c.firstJoined)) {
           c.firstJoined = account.createdAt;
        }
      }
      
      res.json(Array.from(customerMap.values()));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Team Management
  app.get("/api/banks/:bankId/team", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankStaff } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const staff = await db.select().from(bankStaff).where(eq(bankStaff.bankId, req.params.bankId));
      res.json(staff);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/team", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankStaff } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const newStaff = {
        id: uuidv4(),
        bankId: req.params.bankId,
        discordId: req.body.discordId,
        role: req.body.role,
        createdAt: new Date(),
      };
      await db.insert(bankStaff).values(newStaff);
      res.json(newStaff);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.delete("/api/banks/:bankId/team/:staffId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankStaff } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.delete(bankStaff).where(and(eq(bankStaff.id, req.params.staffId), eq(bankStaff.bankId, req.params.bankId)));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/customers/:discordId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, or, inArray, desc, and } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.ownerDiscordId, req.params.discordId))
      );
      
      const accountIds = dbAccounts.map(a => a.id);
      const accountNames = dbAccounts.map(a => a.accountName);

      let txList: any[] = [];
      if (accountIds.length > 0 && accountNames.length > 0) {
        txList = await db.select().from(transactions).where(
          and(
            eq(transactions.bankId, req.params.bankId),
            or(
              inArray(transactions.fromAccountId, accountIds),
              inArray(transactions.toAccountId, accountNames)
            )
          )
        ).orderBy(desc(transactions.timestamp)).limit(50);
      }
      
      res.json({
        discordId: req.params.discordId,
        accounts: dbAccounts,
        transactions: txList,
        totalBalance: dbAccounts.reduce((sum, a) => sum + a.balance, 0),
        firstJoined: dbAccounts.length ? dbAccounts.reduce((min, a) => new Date(a.createdAt) < min ? new Date(a.createdAt) : min, new Date()) : null
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/accounts/:accountId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, or, desc, and } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.id, req.params.accountId))
      );
      if (dbAccounts.length === 0) return res.status(404).json({ error: "Account not found" });
      const account = dbAccounts[0];

      const txList = await db.select().from(transactions).where(
        and(
          eq(transactions.bankId, req.params.bankId),
          or(
            eq(transactions.fromAccountId, account.id),
            eq(transactions.toAccountId, account.accountName)
          )
        )
      ).orderBy(desc(transactions.timestamp)).limit(50);
      
      res.json({
        account,
        transactions: txList
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/settings", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankSettings, banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const [bank] = await db.select().from(banks).where(eq(banks.id, req.params.bankId));
      const settingsResult = await db.select().from(bankSettings).where(eq(bankSettings.bankId, req.params.bankId));
      let settings = settingsResult[0];
      if (!settings) {
        // Return default empty settings
        settings = {
          bankId: req.params.bankId,
          withdrawFeePercent: 0,
          depositFeePercent: 0,
          transferFeePercent: 0,
          colorScheme: "indigo",
          logoUrl: null,
          supportEmail: null,
          discordWebhookUrl: null,
          requireKyc: false,
          discordVerifiedRoleId: null,
          discordClientRoleId: null,
          enableLoans: true,
          enableVaults: true,
          enableCards: true,
          enablePayroll: true,
          enableSubscriptions: true,
          enableEscrow: true,
          enableTreasury: true
        } as any;
      }
      res.json({ ...settings, customDomain: bank?.customDomain || "" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:bankId/settings", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankSettings, banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bId = req.params.bankId;
      
      if (req.body.customDomain !== undefined) {
         await db.update(banks).set({ customDomain: req.body.customDomain }).where(eq(banks.id, bId));
      }

      const data = {
        bankId: bId,
        withdrawFeePercent: req.body.withdrawFeePercent,
        depositFeePercent: req.body.depositFeePercent,
        transferFeePercent: req.body.transferFeePercent,
        colorScheme: req.body.colorScheme,
        logoUrl: req.body.logoUrl,
        supportEmail: req.body.supportEmail,
        discordWebhookUrl: req.body.discordWebhookUrl,
        requireKyc: req.body.requireKyc,
        discordVerifiedRoleId: req.body.discordVerifiedRoleId,
        discordClientRoleId: req.body.discordClientRoleId,
        enableLoans: req.body.enableLoans,
        enableVaults: req.body.enableVaults,
        enableCards: req.body.enableCards,
        enablePayroll: req.body.enablePayroll,
        enableSubscriptions: req.body.enableSubscriptions,
        enableEscrow: req.body.enableEscrow,
        enableTreasury: req.body.enableTreasury,
        autoApproveLoans: req.body.autoApproveLoans,
        autoApproveCreditCards: req.body.autoApproveCreditCards,
        maxAutoApproveLoanAmount: req.body.maxAutoApproveLoanAmount
      };

      const existing = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bId));
      if (existing.length === 0) {
        await db.insert(bankSettings).values(data);
      } else {
        await db.update(bankSettings).set(data).where(eq(bankSettings.bankId, bId));
      }
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/accounts", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
      const accounts = await db.select()
        .from(bankAccounts)
        .where(eq(bankAccounts.bankId, req.params.bankId))
        .orderBy(desc(bankAccounts.createdAt));
      res.json(accounts);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/accounts", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    // We expect minecraftUsername in the body
    const { accountName, ownerDiscordId, initialBalanceCents, minecraftUsername } = req.body;
    
    try {
      // 1. Fetch Bank Configuration
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) {
        return res.status(404).json({ error: "Bank not found" });
      }
      const bank = bankResult[0];

      // 2. Fetch Mojang UUID if username is provided
      let mojangUuid = null;
      if (minecraftUsername) {
        try {
          const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${minecraftUsername}`);
          if (mojangRes.ok) {
            const mojangData = await mojangRes.json();
            if (mojangData && mojangData.id) {
              // Add dashes to UUID (CityCorp usually requires dashed UUIDs, but we'll format it just in case)
              const id = mojangData.id;
              mojangUuid = `${id.substring(0,8)}-${id.substring(8,12)}-${id.substring(12,16)}-${id.substring(16,20)}-${id.substring(20)}`;
            }
          } else {
             console.warn(`Mojang API returned ${mojangRes.status} for ${minecraftUsername}`);
             // If we strict-fail on invalid MC username:
             return res.status(400).json({ error: "Invalid Minecraft username" });
          }
        } catch (e) {
          console.error("Mojang API error", e);
        }
      }

      // 3. CityCorp API Integration if configured
      if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
        const { CityCorpClient } = await import("./src/lib/citycorp_api");
        const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
        
        // 3a. Create corp account
        let linkExisting = false;
        const createRes = await client.createAccount(accountName);
        if (!createRes.success) {
          if (createRes.message && createRes.message.includes("An account with that name already exists")) {
             linkExisting = true;
          } else {
            console.error(`CityCorp API Create Account Failed:`, createRes.message);
            // depending on policy, fail or continue. Let's return error to user.
            return res.status(400).json({ error: `CityCorp Error: ${createRes.message}` });
          }
        }

        // Fetch actual balance if linking existing account
        if (linkExisting) {
           const details = await client.getAccountDetails(accountName);
           if (details && details.balance !== undefined) {
             // Overwrite initialBalanceCents with the actual balance from the remote
             // Assuming details.balance is in float dollars
             req.body.initialBalanceCents = Math.round(details.balance * 100);
           }
        }

        // 3b. Add subuser to corp account
        if (mojangUuid) {
          const subuserRes = await client.addSubuser(accountName, mojangUuid);
          if (!subuserRes.success) {
             console.error(`CityCorp Add Subuser Failed:`, subuserRes.message);
             // Inform but don't hard crash the whole creation
          }
        }
        
        // 3c. Initial Deposit (if any and not linking existing)
        if (!linkExisting && initialBalanceCents && initialBalanceCents > 0) {
            const depositRes = await client.deposit(accountName, initialBalanceCents / 100);
            if (!depositRes.success) {
               console.error(`CityCorp Initial Deposit Failed:`, depositRes.message);
            }
        }
      } else {
         console.warn("CityCorp API credentials missing for bank, skipping external creation");
      }

      // 4. Create in local DB
      const newAccount = {
        id: uuidv4(),
        bankId: req.params.bankId,
        ownerDiscordId: ownerDiscordId || 'imported',
        accountName,
        balance: req.body.initialBalanceCents || initialBalanceCents || 0,
        createdAt: new Date(),
      };
      
      await db.insert(bankAccounts).values(newAccount);

      const { auditLogs } = await import("./src/db/schema");
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: 'Operator',
        action: 'create_account',
        details: `Created account: ${accountName}`,
        timestamp: new Date()
      });

      res.json(newAccount);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/import", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) return res.status(404).json({ error: "Bank not found" });
      const bank = bankResult[0];

      if (!bank.corpId || !bank.corpApiUuid || !bank.corpApiKey) {
        return res.status(400).json({ error: "CityCorp API credentials missing for bank" });
      }

      const { CityCorpClient } = await import("./src/lib/citycorp_api");
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);

      // Get existing accounts in DB to avoid duplicates
      const localAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localAccountNames = new Set(localAccounts.map(a => a.accountName));

      let importedCount = 0;
      let currentPage = 1;
      let totalPages = 1;
      
      do {
        const listData = await client.listAccounts(currentPage);
        if (!listData || !listData.accounts) break;
        
        for (const remoteAccount of listData.accounts) {
          if (!localAccountNames.has(remoteAccount.name)) {
            await db.insert(bankAccounts).values({
              id: uuidv4(),
              bankId: bank.id,
              ownerDiscordId: 'imported', // Or infer if possible
              accountName: remoteAccount.name,
              balance: Math.round(remoteAccount.balance * 100) || 0,
              createdAt: new Date(),
            });
            localAccountNames.add(remoteAccount.name);
            importedCount++;
          }
        }
        
        totalPages = listData.totalPages || 1;
        currentPage++;
      } while (currentPage <= totalPages);

      // Add audit log
      if (importedCount > 0) {
        const { auditLogs } = await import("./src/db/schema");
        await db.insert(auditLogs).values({
            id: uuidv4(),
            bankId: bank.id,
            userDiscordId: 'System',
            action: `auto_import`,
            details: `Imported ${importedCount} existing remote accounts`,
            timestamp: new Date()
        });
      }

      res.json({ success: true, importedCount });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.delete("/api/banks/:bankId/accounts/:accountId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const accs = await db.select().from(bankAccounts).where(eq(bankAccounts.id, req.params.accountId));
      const accName = accs.length > 0 ? accs[0].accountName : "unknown";

      await db.delete(bankAccounts).where(
        and(eq(bankAccounts.id, req.params.accountId), eq(bankAccounts.bankId, req.params.bankId))
      );

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        userDiscordId: 'Operator',
        action: 'delete_account',
        details: `Deleted account: ${accName}`,
        timestamp: new Date()
      });

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/analytics", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { transactions, bankAccounts } = await import("./src/db/schema");
    const { eq, and, gte } = await import("drizzle-orm");
    
    try {
      const bId = req.params.bankId;
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      
      const bankTxs = await db.select().from(transactions)
        .where(and(eq(transactions.bankId, bId), gte(transactions.timestamp, fourteenDaysAgo)));
        
      const accs = await db.select().from(bankAccounts)
        .where(and(eq(bankAccounts.bankId, bId), gte(bankAccounts.createdAt, fourteenDaysAgo)));
        
      // Group by day string MM/DD
      const grouped: Record<string, { deposits: number; withdrawals: number; newAccounts: number; date: string }> = {};
      
      for (let i = 14; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        grouped[key] = { date: key, deposits: 0, withdrawals: 0, newAccounts: 0 };
      }
      
      for (const t of bankTxs) {
         const d = new Date(t.timestamp);
         const key = `${d.getMonth() + 1}/${d.getDate()}`;
         if (grouped[key]) {
            if (t.type === 'deposit') grouped[key].deposits += (t.amount / 100);
            else if (t.type === 'withdraw' || t.type === 'transfer') grouped[key].withdrawals += (t.amount / 100);
         }
      }
      
      for (const a of accs) {
         const d = new Date(a.createdAt);
         const key = `${d.getMonth() + 1}/${d.getDate()}`;
         if (grouped[key]) {
            grouped[key].newAccounts++;
         }
      }
      
      res.json(Object.values(grouped));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Clearinghouse APIs ---
  app.get("/api/banks/:bankId/clearinghouse", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { clearinghouseBalances, clearinghouseSettlements, banks, interBankTransfers } = await import("./src/db/schema");
    const { eq, or, desc } = await import("drizzle-orm");
    try {
      // Ensure balance record exists
      let chb = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, req.params.bankId)).get();
      if (!chb) {
        chb = await db.insert(clearinghouseBalances).values({ bankId: req.params.bankId, balance: 0 }).returning().get();
      }

      const network = await db.select({
        id: banks.id,
        name: banks.name,
        balance: clearinghouseBalances.balance
      }).from(banks)
        .leftJoin(clearinghouseBalances, eq(banks.id, clearinghouseBalances.bankId))
        .where(eq(banks.status, "active"));

      const settlements = await db.select({
        id: clearinghouseSettlements.id,
        amount: clearinghouseSettlements.amount,
        status: clearinghouseSettlements.status,
        createdAt: clearinghouseSettlements.createdAt,
        fromBankId: clearinghouseSettlements.fromBankId,
        toBankId: clearinghouseSettlements.toBankId,
      }).from(clearinghouseSettlements)
        .where(or(
          eq(clearinghouseSettlements.fromBankId, req.params.bankId),
          eq(clearinghouseSettlements.toBankId, req.params.bankId)
        ))
        .orderBy(desc(clearinghouseSettlements.createdAt))
        .limit(100);

      const wires = await db.select().from(interBankTransfers)
        .where(or(
          eq(interBankTransfers.fromBankId, req.params.bankId),
          eq(interBankTransfers.toBankId, req.params.bankId)
        ))
        .orderBy(desc(interBankTransfers.createdAt));

      res.json({
        balance: chb?.balance || 0,
        network: network.map(n => ({ ...n, balance: n.balance || 0 })),
        settlements,
        wires
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/clearinghouse/settle", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { clearinghouseBalances, clearinghouseSettlements } = await import("./src/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { toBankId, amount } = req.body;
      if (!toBankId || !amount || amount <= 0) return res.status(400).json({ error: "Invalid parameters" });

      // Create settlement record
      await db.insert(clearinghouseSettlements).values({
        id: uuidv4(),
        fromBankId: req.params.bankId,
        toBankId,
        amount,
        status: "paid",
        createdAt: new Date()
      });

      // From Bank is paying To Bank, so From Bank's debt decreases (balance increases), To Bank's debt increases (balance decreases)
      // Actually, if I send you 50k in cash, you now owe the network 50k more, and I owe 50k less.
      // So From Bank balance += amount
      // To Bank balance -= amount
      
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${req.params.bankId}, ${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance + ${amount}, last_settled = CURRENT_TIMESTAMP
      `);
      
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${toBankId}, -${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance - ${amount}, last_settled = CURRENT_TIMESTAMP
      `);

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:bankId/clearinghouse/wires/:wireId", requireBankStaff, async (req, res) => {
     const { db } = await import("./src/db/index");
     const { interBankTransfers, bankAccounts, transactions } = await import("./src/db/schema");
     const { eq } = await import("drizzle-orm");
     const { v4: uuidv4 } = await import("uuid");
     try {
       // Only allow bank staff of the receiving bank to accept a wire
       const wire = await db.select().from(interBankTransfers).where(eq(interBankTransfers.id, req.params.wireId)).get();
       
       if (!wire || wire.status !== 'pending_wire') {
          return res.status(404).json({ error: "Wire not found or already processed" });
       }

       if (req.params.bankId !== wire.toBankId) {
          return res.status(403).json({ error: "Only the receiving bank can approve the inbound wire." });
       }

       const { action } = req.body;

       if (action === 'approve') {
          // Deposit money to destination account
          const da = await db.select().from(bankAccounts).where(eq(bankAccounts.id, wire.toAccountId)).get();
          if (da) {
             await db.update(bankAccounts).set({ balance: da.balance + wire.amount }).where(eq(bankAccounts.id, da.id));
             
             await db.insert(transactions).values({
               id: uuidv4(),
               bankId: wire.toBankId,
               fromAccountId: null,
               toAccountId: da.id,
               type: "deposit",
               amount: wire.amount,
               description: `Approved Inbound Wire Transfer`,
               timestamp: new Date()
             });
          }
          await db.update(interBankTransfers).set({ status: 'completed', completedAt: new Date() }).where(eq(interBankTransfers.id, wire.id));
       } else if (action === 'reject') {
          // Refund source account
          const sa = await db.select().from(bankAccounts).where(eq(bankAccounts.id, wire.fromAccountId)).get();
          if (sa) {
             await db.update(bankAccounts).set({ balance: sa.balance + wire.amount }).where(eq(bankAccounts.id, sa.id));

             await db.insert(transactions).values({
               id: uuidv4(),
               bankId: wire.fromBankId,
               fromAccountId: null,
               toAccountId: sa.id,
               type: "deposit",
               amount: wire.amount,
               description: `Refund: Rejected Outbound Wire`,
               timestamp: new Date()
             });
          }
          await db.update(interBankTransfers).set({ status: 'rejected', completedAt: new Date() }).where(eq(interBankTransfers.id, wire.id));
       }

       res.json({ success: true });
     } catch(e) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
     }
  });

  app.post("/api/banks/:bankId/wire", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, clearinghouseBalances } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { fromAccountId, toBankId, toAccountName, amount, description } = req.body;
      if (!fromAccountId || !toBankId || !toAccountName || !amount || amount <= 0) return res.status(400).json({ error: "Invalid params" });

      const fromAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!fromAccount) return res.status(404).json({ error: "Source account not found" });
      if (fromAccount.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      // 1. Deduct from sender
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${amount}` }).where(eq(bankAccounts.id, fromAccountId));
      
      // 2. Add to recipient (if we can find by name + bank ID)
      // In a real network, toAccountName might just be text, but we can try to resolve it.
      let actualToAccountId = toAccountName; // fallback to string
      const toAccount = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, toBankId), eq(bankAccounts.accountName, toAccountName))).get();
      if (toAccount) {
         actualToAccountId = toAccount.id;
         await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${amount}` }).where(eq(bankAccounts.id, toAccount.id));
      }

      // 3. Update clearinghouse balances 
      // From Bank sends money to To Bank. So From Bank owes To Bank.
      // From Bank network balance -= amount
      // To Bank network balance += amount
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${req.params.bankId}, -${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance - ${amount}, last_settled = CURRENT_TIMESTAMP
      `);
      
      await db.run(sql`
        INSERT INTO clearinghouse_balances (bank_id, balance, last_settled) 
        VALUES (${toBankId}, ${amount}, CURRENT_TIMESTAMP) 
        ON CONFLICT(bank_id) DO UPDATE SET balance = balance + ${amount}, last_settled = CURRENT_TIMESTAMP
      `);

      // 4. Record transactions
      const ts = new Date();
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId,
        toAccountId: `ext_${toBankId}`,
        type: "wire_transfer",
        amount,
        description: description || `Wire to ${toAccountName}`,
        timestamp: ts
      });

      if (toAccount) {
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: toBankId,
          fromAccountId: `ext_${req.params.bankId}`,
          toAccountId: toAccount.id,
          type: "wire_transfer",
          amount,
          description: description || `Wire from ${fromAccount.accountName}`,
          timestamp: ts
        });
      }

      sendWebhook(req.params.bankId, `🌐 **Wire Transfer Sent**: $${(amount/100).toFixed(2)} routed to ${toAccountName}.`);
      sendWebhook(toBankId, `🌐 **Wire Transfer Received**: $${(amount/100).toFixed(2)} received into ${toAccountName}.`);

      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Subscriptions APIs ---
  app.get("/api/banks/:bankId/subscriptions", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { subscriptions, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");
    
    // We need aliased accounts for biller and customer
    const billers = alias(bankAccounts, "biller");
    const customers = alias(bankAccounts, "customer");

    try {
      const subs = await db.select({
        id: subscriptions.id,
        amount: subscriptions.amount,
        frequency: subscriptions.frequency,
        nextRun: subscriptions.nextRun,
        isActive: subscriptions.isActive,
        description: subscriptions.description,
        billerAccountName: billers.accountName,
        customerAccountName: customers.accountName,
        customerDiscordId: customers.ownerDiscordId,
      })
      .from(subscriptions)
      .innerJoin(billers, eq(subscriptions.billerAccountId, billers.id))
      .innerJoin(customers, eq(subscriptions.customerAccountId, customers.id))
      .where(eq(subscriptions.bankId, req.params.bankId));

      res.json(subs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/subscriptions", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { subscriptions, bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { billerAccountId, customerAccountId, amount, frequency, nextRun, description } = req.body;
      if (!billerAccountId || !customerAccountId || !amount || !frequency || !nextRun) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // Check BOTH accounts exist in THIS bank
      const biller = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, billerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      const customer = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, customerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();

      if (!biller || !customer) return res.status(404).json({ error: "Account(s) not found" });

      const result = await db.insert(subscriptions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        billerAccountId,
        customerAccountId,
        amount,
        frequency,
        nextRun: new Date(nextRun),
        description,
        isActive: true,
        createdAt: new Date()
      }).returning().get();

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/banks/:bankId/subscriptions/:subId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { subscriptions } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { isActive } = req.body;
      const result = await db.update(subscriptions)
        .set({ isActive })
        .where(and(eq(subscriptions.id, req.params.subId), eq(subscriptions.bankId, req.params.bankId)))
        .returning().get();
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/subscriptions/:subId/charge", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { subscriptions, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const sub = await db.select().from(subscriptions).where(and(eq(subscriptions.id, req.params.subId), eq(subscriptions.bankId, req.params.bankId))).get();
      if (!sub) return res.status(404).json({ error: "Sub not found" });

      const biller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.billerAccountId)).get();
      const customer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, sub.customerAccountId)).get();

      if (!biller || !customer) return res.status(400).json({ error: "Accounts invalid" });
      if (customer.balance < sub.amount) return res.status(400).json({ error: "Customer has insufficient funds" });

      // Deduct customer
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${sub.amount}` }).where(eq(bankAccounts.id, customer.id));
      
      // Add biller
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${sub.amount}` }).where(eq(bankAccounts.id, biller.id));

      const ts = new Date();
      // Record transaction
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: customer.id,
        toAccountId: biller.id,
        type: "transfer",
        amount: sub.amount,
        description: `Subscription Charge: ${sub.description}`,
        timestamp: ts
      });

      // Advance next run date
      const nextRun = new Date(sub.nextRun);
      if (sub.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (sub.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

      await db.update(subscriptions).set({ nextRun }).where(eq(subscriptions.id, sub.id));

      res.json({ success: true, nextRun });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Payroll APIs ---
  app.get("/api/banks/:bankId/payroll", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { payrollJobs, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");
    
    // We need aliased accounts for employer and employee
    const employers = alias(bankAccounts, "employer");
    const employees = alias(bankAccounts, "employee");

    try {
      const jobs = await db.select({
        id: payrollJobs.id,
        amount: payrollJobs.amount,
        frequency: payrollJobs.frequency,
        nextRun: payrollJobs.nextRun,
        isActive: payrollJobs.isActive,
        employerAccountName: employers.accountName,
        employeeAccountName: employees.accountName,
        employeeDiscordId: employees.ownerDiscordId,
      })
      .from(payrollJobs)
      .innerJoin(employers, eq(payrollJobs.employerAccountId, employers.id))
      .innerJoin(employees, eq(payrollJobs.employeeAccountId, employees.id))
      .where(eq(payrollJobs.bankId, req.params.bankId));

      res.json(jobs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/payroll", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { payrollJobs, bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { employerAccountId, employeeAccountId, amount, frequency, nextRun } = req.body;
      if (!employerAccountId || !employeeAccountId || !amount || !frequency || !nextRun) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // Check BOTH accounts exist in THIS bank
      const employer = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, employerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      const employee = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, employeeAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();

      if (!employer || !employee) return res.status(404).json({ error: "Account(s) not found" });

      const result = await db.insert(payrollJobs).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        employerAccountId,
        employeeAccountId,
        amount,
        frequency,
        nextRun: new Date(nextRun),
        isActive: true,
        createdAt: new Date()
      }).returning().get();

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/banks/:bankId/payroll/:jobId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { payrollJobs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const { isActive } = req.body;
      const result = await db.update(payrollJobs)
        .set({ isActive })
        .where(and(eq(payrollJobs.id, req.params.jobId), eq(payrollJobs.bankId, req.params.bankId)))
        .returning().get();
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/payroll/:jobId/run", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { payrollJobs, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const job = await db.select().from(payrollJobs).where(and(eq(payrollJobs.id, req.params.jobId), eq(payrollJobs.bankId, req.params.bankId))).get();
      if (!job) return res.status(404).json({ error: "Job not found" });

      const employer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employerAccountId)).get();
      const employee = await db.select().from(bankAccounts).where(eq(bankAccounts.id, job.employeeAccountId)).get();

      if (!employer || !employee) return res.status(400).json({ error: "Accounts invalid" });
      if (employer.balance < job.amount) return res.status(400).json({ error: "Employer has insufficient funds to run payroll" });

      // Deduct employer
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${job.amount}` }).where(eq(bankAccounts.id, employer.id));
      
      // Add employee
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${job.amount}` }).where(eq(bankAccounts.id, employee.id));

      const ts = new Date();
      // Record transaction
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: employer.id,
        toAccountId: employee.id,
        type: "transfer",
        amount: job.amount,
        description: `Automated Payroll Deposit`,
        timestamp: ts
      });

      // Advance next run date
      const nextRun = new Date(job.nextRun);
      if (job.frequency === 'weekly') nextRun.setDate(nextRun.getDate() + 7);
      else if (job.frequency === 'biweekly') nextRun.setDate(nextRun.getDate() + 14);
      else if (job.frequency === 'monthly') nextRun.setMonth(nextRun.getMonth() + 1);

      await db.update(payrollJobs).set({ nextRun }).where(eq(payrollJobs.id, job.id));

      res.json({ success: true, nextRun });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Treasury APIs ---
  app.get("/api/banks/:bankId/treasury", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, vaultDeposits, loans, transactions } = await import("./src/db/schema");
    const { eq, sum, and, desc, sql } = await import("drizzle-orm");

    try {
      const bId = req.params.bankId;

      // 1. Total Liabilities (Customer Deposits)
      // Base account deposits
      const accountSum = await db.select({ total: sum(bankAccounts.balance) })
        .from(bankAccounts).where(eq(bankAccounts.bankId, bId)).get();
      const totalAccountBalances = Number(accountSum?.total || 0);

      // Vault deposits
      const vaultSum = await db.select({ total: sum(vaultDeposits.amount) })
        .from(vaultDeposits).where(eq(vaultDeposits.bankId, bId)).get();
      const totalVaultBalances = Number(vaultSum?.total || 0);

      const totalDeposits = totalAccountBalances + totalVaultBalances;

      // 2. Total Assets (Active Loans outstanding)
      const loanSum = await db.select({ total: sum(loans.remainingAmount) })
        .from(loans).where(and(eq(loans.bankId, bId), eq(loans.status, "active"))).get();
      const totalLoans = Number(loanSum?.total || 0);

      // 3. P&L / Revenue (sum of fees collected, interest collected)
      // Usually represented by withdraw/transfer fees where toAccountId is null and type="fee"
      // or "interest"
      const revenueSum = await db.select({ total: sum(transactions.amount) })
        .from(transactions).where(
          and(
            eq(transactions.bankId, bId),
            sql`(${transactions.type} = 'fee' OR ${transactions.type} = 'interest_payment' OR ${transactions.type} = 'loan_payment')`,
            sql`${transactions.toAccountId} IS NULL`
          )
        ).get();
      const rawRevenue = Number(revenueSum?.total || 0);

      // Daily balances over last 7 days? Here we can just send the recent transactions to build a chart
      const recentTxs = await db.select()
        .from(transactions)
        .where(eq(transactions.bankId, bId))
        .orderBy(desc(transactions.timestamp))
        .limit(100);

      const dailyVolume = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0,0,0,0);
        return {
          date: d.toISOString().split('T')[0],
          inflow: 0,
          outflow: 0,
        };
      }).reverse();

      for (const tx of recentTxs) {
        const dStr = new Date(tx.timestamp).toISOString().split('T')[0];
        const day = dailyVolume.find(dv => dv.date === dStr);
        if (day) {
          if (tx.type === 'deposit') day.inflow += tx.amount;
          if (tx.type === 'withdraw' || tx.type === 'transfer') day.outflow += tx.amount;
        }
      }

      res.json({
        totalDeposits,
        totalLoans,
        estimatedRevenue: rawRevenue,
        dailyVolume,
        reserveRatio: totalDeposits > 0 ? (totalDeposits - totalLoans) / totalDeposits : 1, 
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Escrow APIs ---
  app.get("/api/banks/:bankId/escrows", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { escrows, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { alias } = await import("drizzle-orm/sqlite-core");
    
    const buyers = alias(bankAccounts, "buyer");
    const sellers = alias(bankAccounts, "seller");

    try {
      const dbEscrows = await db.select({
        id: escrows.id,
        amount: escrows.amount,
        status: escrows.status,
        description: escrows.description,
        createdAt: escrows.createdAt,
        buyerAccountName: buyers.accountName,
        sellerAccountName: sellers.accountName,
        buyerDiscordId: buyers.ownerDiscordId,
        sellerDiscordId: sellers.ownerDiscordId,
        buyerAccountId: buyers.id,
        sellerAccountId: sellers.id
      })
      .from(escrows)
      .innerJoin(buyers, eq(escrows.buyerAccountId, buyers.id))
      .innerJoin(sellers, eq(escrows.sellerAccountId, sellers.id))
      .where(eq(escrows.bankId, req.params.bankId));

      res.json(dbEscrows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/escrows", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { escrows, bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { buyerAccountId, sellerAccountId, amount, description } = req.body;
      if (!buyerAccountId || !sellerAccountId || !amount) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const buyer = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, buyerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      const seller = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, sellerAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();

      if (!buyer || !seller) return res.status(404).json({ error: "Account(s) not found" });

      const result = await db.insert(escrows).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        buyerAccountId,
        sellerAccountId,
        amount,
        description,
        status: "pending",
        createdAt: new Date()
      }).returning().get();

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/escrows/:escrowId/fund", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { escrows, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "pending") return res.status(400).json({ error: "Escrow not pending" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      if (!buyer) return res.status(404).json({ error: "Buyer account not found" });
      if (buyer.balance < escrow.amount) return res.status(400).json({ error: "Insufficient funds" });

      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${escrow.amount}` }).where(eq(bankAccounts.id, buyer.id));
      await db.update(escrows).set({ status: "funded" }).where(eq(escrows.id, escrow.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: buyer.id,
        toAccountId: null,
        type: "withdraw",
        amount: escrow.amount,
        description: `Escrow Funded: ${escrow.description || escrow.id}`,
        timestamp: new Date()
      });

      res.json({ success: true, status: "funded" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/escrows/:escrowId/release", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { escrows, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "funded") return res.status(400).json({ error: "Escrow not funded" });

      const seller = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.sellerAccountId)).get();
      
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${escrow.amount}` }).where(eq(bankAccounts.id, seller!.id));
      await db.update(escrows).set({ status: "released" }).where(eq(escrows.id, escrow.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: seller!.id,
        type: "deposit",
        amount: escrow.amount,
        description: `Escrow Released: ${escrow.description || escrow.id}`,
        timestamp: new Date()
      });

      res.json({ success: true, status: "released" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/escrows/:escrowId/refund", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { escrows, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const escrow = await db.select().from(escrows).where(and(eq(escrows.id, req.params.escrowId), eq(escrows.bankId, req.params.bankId))).get();
      if (!escrow) return res.status(404).json({ error: "Escrow not found" });
      if (escrow.status !== "funded") return res.status(400).json({ error: "Escrow not funded" });

      const buyer = await db.select().from(bankAccounts).where(eq(bankAccounts.id, escrow.buyerAccountId)).get();
      
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${escrow.amount}` }).where(eq(bankAccounts.id, buyer!.id));
      await db.update(escrows).set({ status: "refunded" }).where(eq(escrows.id, escrow.id));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: buyer!.id,
        type: "deposit",
        amount: escrow.amount,
        description: `Escrow Refunded: ${escrow.description || escrow.id}`,
        timestamp: new Date()
      });

      res.json({ success: true, status: "refunded" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Loan APIs ---
  app.get("/api/banks/:bankId/loans", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bankLoans = await db.select().from(loans).where(eq(loans.bankId, req.params.bankId));
      res.json(bankLoans);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/loans", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { discordId, principalAmount, interestRate, depositAccountId } = req.body;
      if (!discordId || !principalAmount || interestRate === undefined || !depositAccountId) {
        return res.status(400).json({ error: "Missing fields" });
      }

      // Find the account to deposit the loan into
      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, depositAccountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Deposit account not found" });

      const nextPaymentDate = new Date();
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 30); // First payment in 30 days

      const ts = new Date();

      // Give money
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${principalAmount}` }).where(eq(bankAccounts.id, depositAccountId));

      // Record transaction
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: depositAccountId,
        type: "deposit",
        amount: principalAmount,
        description: `Loan Disbursement (Principal: $${(principalAmount/100).toFixed(2)})`,
        timestamp: ts
      });

      // Create loan
      const result = await db.insert(loans).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        discordId,
        accountId: depositAccountId,
        principalAmount,
        remainingAmount: principalAmount,
        interestRate,
        nextPaymentDate,
        status: "active",
        createdAt: ts
      }).returning().get();

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:bankId/loans/:loanId/status", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { status } = req.body;
      const loan = await db.select().from(loans).where(eq(loans.id, req.params.loanId)).get();
      if (!loan || loan.bankId !== req.params.bankId) return res.status(404).json({ error: "Loan not found" });

      if (loan.status === "pending" && status === "approved") {
        const ts = new Date();
        await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${loan.principalAmount}` }).where(eq(bankAccounts.id, loan.accountId));
        await db.insert(transactions).values({
            id: uuidv4(),
            bankId: loan.bankId,
            fromAccountId: null,
            toAccountId: loan.accountId,
            type: "deposit",
            amount: loan.principalAmount,
            description: `Loan Disbursement (Principal: $${(loan.principalAmount/100).toFixed(2)})`,
            timestamp: ts
        });
        await db.update(loans).set({ status: "active" }).where(eq(loans.id, req.params.loanId));
      } else {
        await db.update(loans).set({ status }).where(eq(loans.id, req.params.loanId));
      }
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.get("/api/banks/:bankId/credit-applications", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { creditApplications } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const apps = await db.select().from(creditApplications).where(eq(creditApplications.bankId, req.params.bankId));
      res.json(apps);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:bankId/credit-applications/:appId", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { creditApplications, cards } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { status } = req.body;
      const capp = await db.select().from(creditApplications).where(eq(creditApplications.id, req.params.appId)).get();
      if (!capp || capp.bankId !== req.params.bankId) return res.status(404).json({ error: "App not found" });

      if (capp.status === "pending" && status === "approved") {
          function generateCC() {
            let cc = "";
            for(let i=0; i<16; i++) cc += Math.floor(Math.random() * 10).toString();
            return cc;
          }
          const expiry = new Date();
          expiry.setFullYear(expiry.getFullYear() + 3);
          const cvv = Math.floor(100 + Math.random() * 900).toString();
          
          await db.insert(cards).values({
            id: uuidv4(),
            bankId: capp.bankId,
            accountId: capp.accountId,
            cardNumber: generateCC(),
            cvv,
            expiryDate: `${(expiry.getMonth()+1).toString().padStart(2, '0')}/${expiry.getFullYear().toString().slice(-2)}`,
            isLocked: false,
            type: "credit",
            creditLimit: capp.requestedLimit,
            creditUsed: 0,
            apr: 1999, // default
            createdAt: new Date(),
          });
      }
      
      await db.update(creditApplications).set({ status }).where(eq(creditApplications.id, req.params.appId));
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.post("/api/banks/:bankId/loans/:loanId/pay", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { accountId, amount } = req.body;
      if (!accountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const loan = await db.select().from(loans).where(and(eq(loans.id, req.params.loanId), eq(loans.bankId, req.params.bankId))).get();
      if (!loan) return res.status(404).json({ error: "Loan not found" });
      if (loan.status === "paid") return res.status(400).json({ error: "Loan already paid off" });

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });
      if (acc.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      const newRemaining = Math.max(0, loan.remainingAmount - amount);
      const isPaid = newRemaining === 0;

      // Deduct from account
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${amount}` }).where(eq(bankAccounts.id, accountId));

      // Record transaction
      const ts = new Date();
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: accountId,
        toAccountId: null,
        type: "withdraw",
        amount,
        description: `Loan Payment${isPaid ? ' (Final}' : ''}`,
        timestamp: ts
      });

      // Update loan
      await db.update(loans).set({ 
        remainingAmount: newRemaining,
        status: isPaid ? "paid" : "active",
        nextPaymentDate: isPaid ? loan.nextPaymentDate : sql`datetime(${loan.nextPaymentDate.toISOString()}, '+30 days')` // simplified, push back next payment by 30 days
      }).where(eq(loans.id, loan.id));

      res.json({ success: true, newRemaining, isPaid });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // --- Vault APIs ---
  app.get("/api/banks/:bankId/vaults", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { vaultDeposits, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const vaults = await db.select({
        id: vaultDeposits.id,
        amount: vaultDeposits.amount,
        lockedUntil: vaultDeposits.lockedUntil,
        interestRate: vaultDeposits.interestRate,
        status: vaultDeposits.status,
        createdAt: vaultDeposits.createdAt,
        accountName: bankAccounts.accountName,
        ownerDiscordId: bankAccounts.ownerDiscordId,
      })
      .from(vaultDeposits)
      .innerJoin(bankAccounts, eq(vaultDeposits.accountId, bankAccounts.id))
      .where(eq(vaultDeposits.bankId, req.params.bankId));

      res.json(vaults);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/vaults", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { vaultDeposits, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { accountId, amount, durationDays, interestRate } = req.body;
      if (!accountId || !amount || !durationDays || interestRate === undefined) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
      if (!acc) return res.status(404).json({ error: "Account not found" });
      if (acc.balance < amount) return res.status(400).json({ error: "Insufficient funds" });

      // Deduct from account
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} - ${amount}` }).where(eq(bankAccounts.id, accountId));

      // Record transaction
      const ts = new Date();
      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: accountId,
        toAccountId: null,
        type: "withdraw",
        amount,
        description: `Deposit to Vault (${durationDays} days @ ${(interestRate/100).toFixed(2)}%)`,
        timestamp: ts
      });

      // Create Vault
      const lockedUntil = new Date();
      lockedUntil.setDate(lockedUntil.getDate() + durationDays);

      const result = await db.insert(vaultDeposits).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        accountId,
        amount,
        lockedUntil,
        interestRate,
        status: "locked",
        createdAt: ts
      }).returning().get();

      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });
  
  app.post("/api/banks/:bankId/vaults/:vaultId/release", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { vaultDeposits, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const vault = await db.select().from(vaultDeposits).where(and(eq(vaultDeposits.id, req.params.vaultId), eq(vaultDeposits.bankId, req.params.bankId))).get();
      if (!vault) return res.status(404).json({ error: "Vault not found" });
      if (vault.status !== "locked") return res.status(400).json({ error: "Vault is not locked" });

      const now = new Date();
      const isEarly = now < vault.lockedUntil;
      
      let payout = vault.amount;
      if (!isEarly) {
        // Calculate interest (simple interest for now)
        const daysLocked = Math.floor((now.getTime() - vault.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const interestAmount = Math.floor((vault.amount * (vault.interestRate / 10000)) * (daysLocked / 365));
        payout += interestAmount;
      } else {
        // Early withdrawal penalty? Let's just give back principal for now.
      }

      await db.update(vaultDeposits).set({ status: isEarly ? "early_withdrawn" : "released" }).where(eq(vaultDeposits.id, vault.id));
      
      await db.update(bankAccounts).set({ balance: sql`${bankAccounts.balance} + ${payout}` }).where(eq(bankAccounts.id, vault.accountId));

      await db.insert(transactions).values({
        id: uuidv4(),
        bankId: req.params.bankId,
        fromAccountId: null,
        toAccountId: vault.accountId,
        type: "deposit",
        amount: payout,
        description: isEarly ? "Early Vault Withdrawal (No Interest)" : "Vault Maturity Release",
        timestamp: now
      });

      res.json({ success: true, payout, isEarly });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/cards", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
       const bankCards = await db.select({
         id: cards.id,
         cardNumber: cards.cardNumber,
         cvv: cards.cvv,
         expiryDate: cards.expiryDate,
         isLocked: cards.isLocked,
         type: cards.type,
         createdAt: cards.createdAt,
         accountId: cards.accountId,
         accountName: bankAccounts.accountName,
         ownerDiscordId: bankAccounts.ownerDiscordId,
       })
       .from(cards)
       .innerJoin(bankAccounts, eq(cards.accountId, bankAccounts.id))
       .where(eq(cards.bankId, req.params.bankId));
       
       res.json(bankCards);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/cards", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    try {
       const { accountId, type } = req.body;
       if (!accountId || !type) return res.status(400).json({ error: "Missing fields" });
       
       // check account exists in bank
       const acc = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, req.params.bankId))).get();
       if (!acc) return res.status(404).json({ error: "Account not found in bank" });

       const cardNumber = Array.from({length: 16}, () => Math.floor(Math.random() * 10)).join('');
       const cvv = Array.from({length: 3}, () => Math.floor(Math.random() * 10)).join('');
       
       const nextYear = new Date();
       nextYear.setFullYear(nextYear.getFullYear() + 4);
       const expiryDate = `${(nextYear.getMonth() + 1).toString().padStart(2, '0')}/${nextYear.getFullYear().toString().slice(-2)}`;

       const result = await db.insert(cards).values({
         id: uuidv4(),
         bankId: req.params.bankId,
         accountId,
         cardNumber,
         cvv,
         expiryDate,
         type,
         isLocked: false,
         createdAt: new Date(),
       }).returning().get();

       res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/banks/:bankId/cards/:cardId", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
       const { isLocked } = req.body;
       if (typeof isLocked !== "boolean") return res.status(400).json({ error: "Invalid isLocked" });
       
       const result = await db.update(cards)
         .set({ isLocked })
         .where(and(eq(cards.id, req.params.cardId), eq(cards.bankId, req.params.bankId)))
         .returning().get();

       res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/developer", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      let bank = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });

      if (!bank.apiKey || !bank.webhookSecret) {
         const newApi = "sk_live_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
         const newWh = "whsec_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
         bank = await db.update(banks).set({ apiKey: newApi, webhookSecret: newWh }).where(eq(banks.id, req.params.bankId)).returning().get();
      }

      res.json({ apiKey: bank.apiKey, webhookSecret: bank.webhookSecret });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/developer/roll", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
       const newApi = "sk_live_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
       const newWh = "whsec_" + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 8);
       const bank = await db.update(banks)
         .set({ apiKey: newApi, webhookSecret: newWh })
         .where(eq(banks.id, req.params.bankId))
         .returning().get();
       if (!bank) return res.status(404).json({ error: "Bank not found" });
       res.json({ apiKey: bank.apiKey, webhookSecret: bank.webhookSecret });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/transactions", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { transactions, bankAccounts } = await import("./src/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    try {
       const bankTxs = await db.select({
         id: transactions.id,
         amount: transactions.amount,
         type: transactions.type,
         description: transactions.description,
         timestamp: transactions.timestamp,
         fromAccountId: transactions.fromAccountId,
         toAccountId: transactions.toAccountId
       })
       .from(transactions)
       .where(eq(transactions.bankId, req.params.bankId))
       .orderBy(desc(transactions.timestamp))
       .limit(100);
       res.json(bankTxs);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/transactions", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) return res.status(404).json({ error: "Bank not found" });
      const bank = bankResult[0];

      const { type, accountName, amount, description, toAccountName } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      // Identify source account ID for internal DB
      const accountRes = await db.select().from(bankAccounts).where(eq(bankAccounts.accountName, accountName)).limit(1);
      if (accountRes.length === 0) return res.status(404).json({ error: "Source account not found locally" });
      const account = accountRes[0];

      // Execute on CityCorp if configured
      if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
        const { CityCorpClient } = await import("./src/lib/citycorp_api");
        const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
        
        let clientRes;
        if (type === 'deposit') {
          clientRes = await client.deposit(accountName, parsedAmount / 100);
        } else if (type === 'withdraw') {
          clientRes = await client.withdraw(accountName, parsedAmount / 100);
        } else if (type === 'transfer') {
          // Withdraw from source, deposit to target via CityCorp logic internally
          if (!toAccountName) return res.status(400).json({ error: "Missing destination account" });
          // Note: Real API doesn't have an atomic transfer endpoint yet, so we emulate it.
          const wRes = await client.withdraw(accountName, parsedAmount / 100);
          if (!wRes.success) return res.status(400).json({ error: `Withdraw failed: ${wRes.message}` });
          
          clientRes = await client.deposit(toAccountName, parsedAmount / 100);
          if (!clientRes.success) {
            // Rollback the withdrawal on failure
            await client.deposit(accountName, parsedAmount / 100);
            return res.status(400).json({ error: `Deposit to target failed: ${clientRes.message}` });
          }
        }
        
        if (clientRes && !clientRes.success) {
          return res.status(400).json({ error: `CityCorp API Error: ${clientRes.message}` });
        }
      }

      // Record in local DB
      const tx = {
        id: uuidv4(),
        bankId: bank.id,
        fromAccountId: account.id,
        toAccountId: type === 'transfer' ? toAccountName : null,
        type: type,
        amount: parsedAmount,
        description: description || `Manual ${type}`,
        timestamp: new Date()
      };

      await db.insert(transactions).values(tx);

      // Adjust balances in local DB
      const newFromBalance = type === 'deposit' ? account.balance + parsedAmount : account.balance - parsedAmount;
      await db.update(bankAccounts).set({ balance: newFromBalance }).where(eq(bankAccounts.id, account.id));

      if (type === 'transfer') {
        const toAccountRes = await db.select().from(bankAccounts).where(eq(bankAccounts.accountName, toAccountName)).limit(1);
        if (toAccountRes.length > 0) {
           await db.update(bankAccounts).set({ balance: toAccountRes[0].balance + parsedAmount }).where(eq(bankAccounts.id, toAccountRes[0].id));
        }
      }

      // Add audit log
      const { auditLogs } = await import("./src/db/schema");
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bank.id,
        userDiscordId: 'Operator',
        action: `manual_${type}`,
        details: `Processed ${type} of $${(parsedAmount / 100).toFixed(2)} on account ${accountName}`,
        timestamp: new Date()
      });

      res.json(tx);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/tools/mass-action", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, auditLogs } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { type, amount, description } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });
      
      const isDeposit = type === 'deposit';

      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      if (accounts.length === 0) return res.status(400).json({ error: "No accounts found" });

      // We do this locally instead of hammering the CityCorp API. 
      for (const account of accounts) {
         await db.update(bankAccounts)
           .set({ balance: isDeposit ? account.balance + parsedAmount : Math.max(0, account.balance - parsedAmount) })
           .where(eq(bankAccounts.id, account.id));
         
         await db.insert(transactions).values({
           id: uuidv4(),
           bankId: req.params.bankId,
           fromAccountId: account.id,
           toAccountId: null,
           type: isDeposit ? 'deposit' : 'withdraw',
           amount: isDeposit ? parsedAmount : Math.min(account.balance, parsedAmount),
           description: description || `Mass ${type}`,
           timestamp: new Date()
         });
      }

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: req.params.bankId,
         userDiscordId: 'Operator',
         action: `mass_${type}`,
         details: `Applied mass ${type} of $${(parsedAmount/100).toFixed(2)} to ${accounts.length} accounts`,
         timestamp: new Date()
      });

      res.json({ success: true, affectedCount: accounts.length });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/tools/purge-zero", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const zeroBalanceAccounts = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.balance, 0))
      );

      if (zeroBalanceAccounts.length === 0) {
        return res.json({ success: true, purgedCount: 0 });
      }

      for (const acc of zeroBalanceAccounts) {
         await db.delete(bankAccounts).where(eq(bankAccounts.id, acc.id));
      }

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: req.params.bankId,
         userDiscordId: 'Operator',
         action: `purge_zero`,
         details: `Purged ${zeroBalanceAccounts.length} zero-balance accounts`,
         timestamp: new Date()
      });

      res.json({ success: true, purgedCount: zeroBalanceAccounts.length });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/tools/daily-processing", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, auditLogs, loans, subscriptions } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      let notes = [];

      // 1. Process Loans (accrue interest)
      const openLoans = await db.select().from(loans).where(and(eq(loans.bankId, bId), eq(loans.status, 'active')));
      let loansAccrued = 0;
      for (const loan of openLoans) {
        if (loan.interestRate && loan.principalAmount) {
          const dailyInterest = Math.round((loan.principalAmount * (loan.interestRate / 100)) / 365);
          if (dailyInterest > 0) {
            await db.update(loans)
              .set({ remainingAmount: loan.remainingAmount + dailyInterest })
              .where(eq(loans.id, loan.id));
            loansAccrued++;
          }
        }
      }
      if (loansAccrued > 0) notes.push(`Accrued interest on ${loansAccrued} loans.`);

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: bId,
         userDiscordId: 'Operator',
         action: `daily_processing`,
         details: notes.length > 0 ? `Executed EOD processes. ${notes.join(' ')}` : `Executed EOD processes. No actions needed.`,
         timestamp: new Date()
      });

      res.json({ success: true, message: notes.length > 0 ? `EOD Processing complete. ${notes.join(' ')}` : "Finished. No actions required." });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/tools/data-migration", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const rawData = req.body.rawData;
      if (!rawData) return res.status(400).json({ error: "Missing rawData payload" });

      let dataArray = Array.isArray(rawData) ? rawData : 
                     (rawData.data || rawData.accounts || rawData.users || rawData.transactions || [rawData]);

      let accountsImported = 0;
      let transactionsImported = 0;

      for (const item of dataArray) {
        // --- 1. Attempt to parse as an Account / Customer ---
        // Looks for common user identity fields
        if (item.discordId || item.ownerDiscordId || item.userId || item.accountName || item.name || item.customer) {
          const ownerDiscordId = (item.discordId || item.ownerDiscordId || item.userId || item.customer || "import_" + Math.floor(Math.random()*1000000)).toString();
          const accountName = (item.accountName || item.name || item.title || `Migrated Account (${ownerDiscordId})`).toString();
          
          // Parse balance
          let balanceValue = item.balance || item.currentBalance || item.total || 0;
          if (typeof balanceValue === 'string') balanceValue = parseFloat(balanceValue.replace(/[^0-9.-]+/g,""));
          // Assume provided balance is in DOLLARS unless it's explicitly cents or it's a huge integer and they specify.
          // By default, convert to cents.
          let balanceCents = Math.round(Number(balanceValue) * 100);

          // Check if account already exists for this discord ID to prevent dupes, 
          // or if they force new account per line
          const existing = await db.select().from(bankAccounts).where(
             and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, ownerDiscordId))
          );

          let accId;
          if (existing.length === 0) {
            accId = uuidv4();
            await db.insert(bankAccounts).values({
              id: accId,
              bankId: bId,
              ownerDiscordId: ownerDiscordId,
              accountName: accountName,
              balance: balanceCents,
              isActive: item.isActive !== undefined ? item.isActive : true,
              createdAt: new Date(item.createdAt || item.date || Date.now())
            });
            accountsImported++;
          } else {
            accId = existing[0].id; // Merge / attach to existing
          }

          // --- 2. Inner array of transactions ---
          const txs = item.transactions || item.history || item.sales || item.records;
          if (Array.isArray(txs)) {
            for (const tx of txs) {
              let txAmount = tx.amount || tx.value || tx.total || tx.fee || 0;
              if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
              
              const isOutflow = tx.type === 'withdraw' || tx.type === 'fee' || tx.type === 'tax' || txAmount < 0;
              
              await db.insert(transactions).values({
                id: tx.id || uuidv4(),
                bankId: bId,
                fromAccountId: isOutflow ? accId : null,
                toAccountId: !isOutflow ? accId : null,
                type: tx.type || (isOutflow ? 'withdraw' : 'deposit'),
                amount: Math.abs(Math.round(Number(txAmount) * 100)),
                description: tx.description || tx.memo || tx.note || "Historical record",
                timestamp: new Date(tx.timestamp || tx.date || tx.createdAt || Date.now())
              });
              transactionsImported++;
            }
          }
        } 
        // --- 3. Attempt to parse as standalone Transaction / Sale log ---
        else if (item.amount !== undefined && (item.type || item.description || item.memo || item.recipient || item.sender)) {
          // It's a flat transaction log. Create a generic "Legacy Import" account if we don't know who it belongs to.
          // Or map to owner if they supply a discord ID.
          const ownerDiscordId = (item.discordId || item.userId || item.customer || "legacy_import_pool").toString();
          
          const existing = await db.select().from(bankAccounts).where(
             and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, ownerDiscordId))
          );
          
          let accId;
          if (existing.length === 0) {
            accId = uuidv4();
            await db.insert(bankAccounts).values({
              id: accId,
              bankId: bId,
              ownerDiscordId: ownerDiscordId,
              accountName: `Imported Ledger (${ownerDiscordId})`,
              balance: 0,
              isActive: true,
              createdAt: new Date()
            });
            accountsImported++;
          } else {
            accId = existing[0].id;
          }

          let txAmount = item.amount || item.value || item.total || item.fee || 0;
          if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
          
          const isOutflow = item.type === 'withdraw' || item.type === 'fee' || item.type === 'tax' || txAmount < 0;
          
          await db.insert(transactions).values({
            id: item.id || uuidv4(),
            bankId: bId,
            fromAccountId: isOutflow ? accId : null,
            toAccountId: !isOutflow ? accId : null,
            type: item.type || (isOutflow ? 'withdraw' : 'deposit'),
            amount: Math.abs(Math.round(Number(txAmount) * 100)),
            description: item.description || item.memo || item.note || "Imported historical record",
            timestamp: new Date(item.timestamp || item.date || item.createdAt || Date.now())
          });
          transactionsImported++;
        }
      }

      await db.insert(auditLogs).values({
         id: uuidv4(),
         bankId: bId,
         userDiscordId: 'Operator',
         action: `data_migration`,
         details: `Intelligently imported ${accountsImported} accounts and ${transactionsImported} transactions.`,
         timestamp: new Date()
      });

      res.json({ success: true, accountsImported, transactionsImported });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error during migration parsing" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
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
    
    const allBanks = await db.select().from(banks);
    for (const bank of allBanks) {
      if (bank.discordToken) {
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
