import express from "express";
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
  app.get('/api/debug-host', (req, res) => {
    res.json({
      host: req.get('host'),
      hostname: req.hostname,
      headers: req.headers,
      protocol: req.protocol,
    });
  });

  app.set("trust proxy", 1);
  const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT) : 3000;

  startCronJobs();

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false
  }));
  app.use(express.json({ limit: "50mb" }));
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

  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      (req as any).user = decoded;
      next();
    } catch(e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  const getRedirectUri = (req: express.Request) => {
    let origin = '';
    
    // 1. Try to get origin from Referer header (most reliable for proxied frontends)
    const referer = req.headers.referer;
    if (referer) {
      try {
        const url = new URL(referer);
        origin = url.origin;
      } catch (e) {
        // ignore invalid URL
      }
    }
    
    // 2. Fallback to Host headers
    if (!origin) {
      const protocol = (req.headers['x-forwarded-proto'] || req.protocol || 'http') as string;
      const host = (req.headers['x-forwarded-host'] || req.get('host')) as string;
      let actualProtocol = protocol;
      if (host !== 'localhost' && host !== '127.0.0.1' && !host.includes('localhost:')) {
        actualProtocol = 'https';
      }
      origin = `${actualProtocol}://${host}`;
    }
    
    // 3. Fallback for internal localhost
    if ((origin.includes('localhost') || origin.includes('127.0.0.1')) && process.env.APP_URL) {
       origin = process.env.APP_URL;
    }
    
    if (origin.endsWith('/')) origin = origin.slice(0, -1);
    return `${origin}/api/auth/discord/callback`;
  };

  
  app.get("/api/domain-lookup", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const domain = req.query.domain as string;
    
    if (!domain) return res.json({ bankId: null });
    
    try {
       const { like } = await import("drizzle-orm");
       const bank = await db.select().from(banks).where(like(banks.customDomain, `%${domain}%`)).get();
       if (bank) return res.json({ bankId: bank.id });
       return res.json({ bankId: null });
    } catch(e) {
       console.error(e);
       return res.json({ bankId: null });
    }
  });

  
  app.get('/api/auth/url', async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { like, eq } = await import("drizzle-orm");
    const hostname = req.hostname;
    const bankId = req.query.bankId as string | undefined;
    const provider = req.query.provider as string | undefined;
    let clientId = process.env.DISCORD_CLIENT_ID || '';
    
    let bank = null;
    if (bankId) {
      try {
        bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      } catch (e) {
        console.error("Bank ID lookup error for OAuth URL:", e);
      }
    } else if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('run.app') && !hostname.includes('onyx-network.com')) {
        try {
          bank = await db.select().from(banks).where(like(banks.customDomain, `%${hostname}%`)).get();
        } catch (e) {
          console.error("Domain lookup error for OAuth URL:", e);
        }
    }

    if (provider === 'citycorp') {
      if (!bank || !bank.cityCorpAppId) {
        try {
          const allBanks = await db.select().from(banks).all();
          const configuredBank = allBanks.find(b => b.cityCorpAppId);
          if (configuredBank) {
            bank = configuredBank;
          }
        } catch (e) {
          console.error("Error finding configured bank:", e);
        }
      }

      if (bank && bank.cityCorpAppId) {
        const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/citycorp/callback`;
        const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo }));
        const scopes = "corp.player.info.get,corp.get";
        const authUrl = bank.cityCorpAuthUrl || `https://dashboard.cityrp.org/authorize?app_id=${bank.cityCorpAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scopes=${scopes}&state=${state}&response_type=code`;
        return res.json({ url: authUrl });
      } else {
        return res.status(400).json({ error: "CityCorp OAuth is not configured. Please set up a bank with CityCorp Application credentials in the Admin panel first." });
      }
    }

    if (bank && bank.cityCorpAppId && !provider) {
        const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/citycorp/callback`;
        const state = encodeURIComponent(JSON.stringify({ bankId: bank.id, returnTo: req.query.returnTo }));
        const scopes = "corp.player.info.get,corp.get";
        const authUrl = bank.cityCorpAuthUrl || `https://dashboard.cityrp.org/authorize?app_id=${bank.cityCorpAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scopes=${scopes}&state=${state}&response_type=code`;
        return res.json({ url: authUrl });
    } else if (bank && bank.discordClientId) {
       clientId = bank.discordClientId;
    }

    const redirectUri = getRedirectUri(req);
    const intent = req.query.intent || 'login';
    const returnTo = req.query.returnTo;
    const stateObj: any = { intent };
    if (bank) stateObj.bankId = bank.id;
    if (returnTo) stateObj.returnTo = returnTo;
    const state = encodeURIComponent(JSON.stringify(stateObj));
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email',
      state: state
    });
    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });


  
  
  app.get('/api/auth/citycorp/callback', async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankCustomers } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    console.log("CityCorp Callback Query:", req.query, "Params:", req.params, "Body:", req.body);
    const { state: stateStr } = req.query;
    const code = req.query.code || req.query.client_secret;

    if (req.query.error) { return res.status(400).send(`CityCorp OAuth Error: ${req.query.error} - ${req.query.error_description}`); }
    if (!code || !stateStr) {
      return res.status(400).send(`Missing code or state. URL: ${req.originalUrl}`);
    }

    try {
      let bankId;
      try {
        const parsedState = JSON.parse(decodeURIComponent(stateStr as string));
        bankId = parsedState.bankId;
      } catch (e) {
        const host = req.get('host');
        let possibleBank = await db.select().from(banks).where(eq(banks.customDomain, host || "")).get();
        if (!possibleBank) {
            const allBanks = await db.select().from(banks).all();
            if (allBanks.length === 1) possibleBank = allBanks[0];
            else possibleBank = allBanks.find(b => b.cityCorpAppId);
        }
        if (possibleBank) bankId = possibleBank.id;
      }
      if (!bankId) return res.status(400).send("Could not identify bank from state or host");
      
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank || !bank.cityCorpAppId || !bank.cityCorpAppSecret) {
        return res.status(400).send("Bank CityCorp OAuth credentials are not configured");
      }

      const bodyParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_secret: code as string,
        app_id: bank.cityCorpAppId,
        token: bank.cityCorpAppSecret
      });

      const tokenResponse = await fetch("https://dashboard.cityrp.org/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString()
      });

      if (!tokenResponse.ok) {
        return res.status(400).send("Failed to exchange token with CityCorp");
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.token;
      const minecraftUuid = tokenData.minecraft_uuid;

      if (!token || !minecraftUuid) {
        return res.status(400).send("Invalid token response");
      }

      const authHeader = 'Basic ' + Buffer.from(`${minecraftUuid}:${token}`).toString('base64');
      const playerRes = await fetch("https://api.cityrp.org/player", {
        headers: { "Authorization": authHeader, "User-Agent": "SlateBankBot/1.0" }
      });

      let mcUsername = "Citizen";
      let avatarUrl = `https://mc-heads.net/avatar/${minecraftUuid}/64`;

      if (playerRes.ok) {
        const playerData = await playerRes.json();
        mcUsername = playerData.username || playerData.name || mcUsername;
      }

      // See if we have an existing customer via mcUuid
      let customer = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.mcUuid, minecraftUuid))
      ).get();

      let sessionDiscordId = "";

      if (customer) {
        sessionDiscordId = customer.discordId;
        // Update their token just in case
        await db.update(bankCustomers).set({
          cityCorpToken: token,
          mcUsername: mcUsername
        }).where(eq(bankCustomers.id, customer.id));
      } else {
        sessionDiscordId = "mc_" + minecraftUuid;
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId: bankId,
          discordId: sessionDiscordId,
          mcUuid: minecraftUuid,
          mcUsername: mcUsername,
          cityCorpToken: token,
          kycStatus: "approved",
          createdAt: new Date()
        });
      }

      const payload = {
        discordId: sessionDiscordId,
        username: mcUsername,
        avatarUrl: avatarUrl,
        isGlobalAdmin: false
      };

      const signedToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', signedToken, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });


      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(payload)} }, '*');
                }
              } catch(e) {}
              
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) {}
              
              try { window.close(); } catch(e) {}
              setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                let stateObj = {};
                try {
                  if (params.get('state')) stateObj = JSON.parse(decodeURIComponent(params.get('state')));
                } catch(e) {}
                const dest = stateObj.returnTo || '/portal';
                if (!window.opener) {
                  window.location.href = dest;
                } else {
                  document.body.innerHTML = "<h2>Authentication Successful!</h2><p>You can close this window now.</p>";
                }
              }, 500);
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 2rem; color: white; background: #0a0a0c; height: 100vh; margin: 0; box-sizing: border-box;">
              <h2>Authentication Successful!</h2>
              <p style="color: rgba(255,255,255,0.7);">Redirecting you back...</p>
            </div>
          </body>
        </html>
      `);


    } catch (e: any) {
      console.error(e);
      res.status(500).send("Internal server error during CityCorp OAuth callback");
    }
  });

  
    app.get('/api/auth/discord/callback', async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankCustomers, bankAccounts } = await import("./src/db/schema");
    const { like, eq } = await import("drizzle-orm");
    const { code, state } = req.query;
    const fs = require('fs');
    fs.appendFileSync('auth_debug.log', JSON.stringify({ query: req.query, time: new Date().toISOString() }) + '\n');
    console.log("Discord Callback - Query:", req.query);
    if (!code) return res.status(400).send("No code provided");
    
    let intent = 'login';
    let bankId = null;
    try {
      if (state) {
        const decodedState = JSON.parse(decodeURIComponent(state as string));
        console.log("Discord Callback - Decoded State:", decodedState);
        intent = decodedState.intent || 'login';
        bankId = decodedState.bankId;
      }
    } catch (e) {
        console.error("Discord Callback - State Parse Error:", e, "State was:", state);
    }
    console.log("Discord Callback - Final Intent:", intent);

    const hostname = req.hostname;
    let clientId = process.env.DISCORD_CLIENT_ID || '';
    let clientSecret = process.env.DISCORD_CLIENT_SECRET || '';

    let bankToUse = null;
    if (bankId) {
       bankToUse = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    } else if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('run.app') && !hostname.includes('onyx-network.com')) {
       try {
         bankToUse = await db.select().from(banks).where(like(banks.customDomain, `%${hostname}%`)).get();
       } catch (e) {
         console.error("Domain lookup error for OAuth Callback:", e);
       }
    }
    
    if (bankToUse && bankToUse.discordClientId && bankToUse.discordClientSecret) {
       clientId = bankToUse.discordClientId;
       clientSecret = bankToUse.discordClientSecret;
    }

    const redirectUri = getRedirectUri(req);

    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
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
      const realDiscordId = userData.id;
      const { globalAdmins } = await import("./src/db/schema");
      const { eq } = await import("drizzle-orm");
      const { db } = await import("./src/db/index");
      const dbAdmin = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, userData.id)).get();
      const isGlobalAdmin = userData.username === 'cofys' || userData.email === 'cofysmc@gmail.com' || !!dbAdmin;
      let payload = {
        discordId: realDiscordId,
        username: userData.username,
        avatarUrl: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : undefined,
        isGlobalAdmin
      };

      if (intent === 'link') {
        const authToken = req.cookies.auth_token;
        if (!authToken) return res.status(401).send("No active session to link");
        let decodedSession: any;
        try {
          decodedSession = jwt.verify(authToken, JWT_SECRET);
        } catch (e) {
          return res.status(401).send("Invalid session token");
        }
        
        const sessionDiscordId = decodedSession.discordId;
        if (sessionDiscordId && sessionDiscordId.startsWith("mc_")) {
          // Update bankCustomer to real discordId
          await db.update(bankCustomers)
            .set({ discordId: realDiscordId, linkedDiscordId: realDiscordId })
            .where(eq(bankCustomers.discordId, sessionDiscordId));
            
          await db.update(bankAccounts)
            .set({ ownerDiscordId: realDiscordId })
            .where(eq(bankAccounts.ownerDiscordId, sessionDiscordId));
          const { cards, loans, invoices, transactions } = await import('./src/db/schema');
          try { await db.update(cards as any).set({ ownerDiscordId: realDiscordId } as any).where(eq((cards as any).ownerDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(loans as any).set({ ownerDiscordId: realDiscordId } as any).where(eq((loans as any).ownerDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(invoices as any).set({ recipientDiscordId: realDiscordId } as any).where(eq((invoices as any).recipientDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(invoices as any).set({ creatorDiscordId: realDiscordId } as any).where(eq((invoices as any).creatorDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(transactions as any).set({ toCityCorpId: realDiscordId } as any).where(eq((transactions as any).toCityCorpId, sessionDiscordId)); } catch(e) {}
            
          payload.username = decodedSession.username || userData.username; // keep mc username
        } else {
           return res.status(400).send("Account is already linked or invalid session");
        }
      }

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('auth_token', token, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      let dest = (intent === 'link' || bankId) ? '/portal' : '/admin';
      try {
        if (state) {
            const decodedState = JSON.parse(decodeURIComponent(state as string));
            if (decodedState.returnTo) dest = decodedState.returnTo;
        }
      } catch (e) {}

      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                }
              } catch(e) {}
              
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) {}
              
              // Always try to close
              try { window.close(); } catch(e) {}
              
              // If not closed, redirect after delay
              setTimeout(() => {
                window.location.href = '${dest}';
              }, 1500);
            </script>
            <div style="font-family: sans-serif; text-align: center; padding-top: 2rem; color: white; background: #0a0a0c; height: 100vh; margin: 0; box-sizing: border-box;">
              <h2>Authentication Successful!</h2>
              <p style="color: rgba(255,255,255,0.7);">Redirecting you back...</p>
            </div>
          </body>
        </html>
      `);
    } catch (e: any) {
      console.error(e);
      res.status(500).send("Internal server error during Discord auth");
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

  const requireRole = (allowedRoles: string[]) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // First ensure they are bank staff (this runs after requireBankStaff, or we can just call requireBankStaff manually here)
      // Actually, since requireBankStaff sets req.staffRole and req.user, we should just assume it was called BEFORE requireRole in the chain.
      const user = (req as any).user;
      if (user && user.isGlobalAdmin) return next();
      
      const role = (req as any).staffRole;
      if (!role) return res.status(403).json({ error: "Forbidden - No role assigned" });
      
      if (!allowedRoles.includes(role)) {
         return res.status(403).json({ error: `Forbidden - Requires one of roles: ${allowedRoles.join(', ')}` });
      }
      next();
    };
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

  app.get("/api/transactions/recent", requireGlobalAdmin, async (req, res) => {
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

  app.put("/api/banks/:id", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const b = req.body;
      const updateData: any = {};
      if (b.name !== undefined) updateData.name = b.name;
      if (b.guildId !== undefined) updateData.guildId = b.guildId;
      if (b.discordToken !== undefined && b.discordToken !== "") updateData.discordToken = b.discordToken;
      if (b.corpId !== undefined) updateData.corpId = b.corpId !== null && b.corpId !== "" ? parseInt(b.corpId) : null;
      if (b.corpApiUuid !== undefined) updateData.corpApiUuid = b.corpApiUuid;
      if (b.corpApiKey !== undefined && b.corpApiKey !== "") updateData.corpApiKey = b.corpApiKey;
      if (b.cityCorpAppId !== undefined) updateData.cityCorpAppId = b.cityCorpAppId;
      if (b.cityCorpAppSecret !== undefined && b.cityCorpAppSecret !== "") {
        updateData.cityCorpAppSecret = b.cityCorpAppSecret;
        updateData.corpApiKey = b.cityCorpAppSecret; // Unified App Token synchronizes to corpApiKey
      }
      if (b.customDomain !== undefined) updateData.customDomain = b.customDomain;
      if (b.discordClientId !== undefined) updateData.discordClientId = b.discordClientId;
      if (b.discordClientSecret !== undefined && b.discordClientSecret !== "") updateData.discordClientSecret = b.discordClientSecret;
      if (b.cityCorpAuthUrl !== undefined) updateData.cityCorpAuthUrl = b.cityCorpAuthUrl;
      
      await db.update(banks).set(updateData).where(eq(banks.id, req.params.id));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:id/billing", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const { plan, billingStatus, platformFeePercent } = req.body;
      await db.update(banks).set({
        plan: plan || "standard",
        billingStatus: billingStatus || "active",
        platformFeePercent: platformFeePercent !== undefined ? Math.round(Number(platformFeePercent) * 100) : 200
      }).where(eq(banks.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Failed to update billing settings" });
    }
  });

  app.post("/api/banks/:id/upload-db", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    const fs = await import("fs");
    const path = await import("path");
    
    let tempFilePath = "";
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Missing file content" });
      }
      
      const bankId = req.params.id;
      const tempDir = path.join(process.cwd(), "data", "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      tempFilePath = path.join(tempDir, `${bankId}_${Date.now()}_temp.db`);
      const buffer = Buffer.from(content, "base64");
      fs.writeFileSync(tempFilePath, buffer);
      
      // Open the uploaded SQLite database using better-sqlite3
      const DatabaseConstructor = (await import("better-sqlite3")).default;
      const uploadDb = new DatabaseConstructor(tempFilePath);
      
      // Find all tables in the uploaded database
      const tables = uploadDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      
      let accountsImported = 0;
      let transactionsImported = 0;
      
      // We'll search for common legacy table names
      const accountsTable = tables.find(t => 
        ['accounts', 'bank_accounts', 'users', 'players', 'clients', 'customers'].includes(t.name.toLowerCase())
      )?.name;
      
      const transactionsTable = tables.find(t => 
        ['transactions', 'transfers', 'history', 'ledger', 'audit_logs'].includes(t.name.toLowerCase())
      )?.name;
      
      if (!accountsTable) {
        uploadDb.close();
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(400).json({ 
          error: `Could not identify an accounts or users table. Tables found: ${tables.map(t => t.name).join(", ")}` 
        });
      }
      
      // Query columns of the accounts table to map dynamically
      const columnsInfo = uploadDb.prepare(`PRAGMA table_info(${accountsTable})`).all() as { name: string }[];
      const colNames = columnsInfo.map(c => c.name.toLowerCase());
      
      const idCol = columnsInfo.find(c => ['id', 'uuid', 'discord_id', 'discordid', 'owner', 'player'].includes(c.name.toLowerCase()))?.name;
      const nameCol = columnsInfo.find(c => ['name', 'account_name', 'accountname', 'username', 'title'].includes(c.name.toLowerCase()))?.name;
      const balanceCol = columnsInfo.find(c => ['balance', 'amount', 'money', 'cents', 'total'].includes(c.name.toLowerCase()))?.name;
      const discordIdCol = columnsInfo.find(c => ['discord_id', 'discordid', 'owner_discord_id', 'user_id', 'userid'].includes(c.name.toLowerCase()))?.name;
      
      if (!balanceCol) {
        uploadDb.close();
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return res.status(400).json({ error: `Could not find a balance/amount column in table '${accountsTable}'` });
      }
      
      // Read accounts
      const legacyAccounts = uploadDb.prepare(`SELECT * FROM ${accountsTable}`).all() as any[];
      
      for (const legacyAcc of legacyAccounts) {
        const rawDiscordId = discordIdCol ? legacyAcc[discordIdCol] : (idCol ? legacyAcc[idCol] : null);
        if (!rawDiscordId) continue;
        
        const discordId = rawDiscordId.toString();
        const accountName = nameCol ? legacyAcc[nameCol] : `Legacy Account (${discordId})`;
        
        let balanceVal = legacyAcc[balanceCol] || 0;
        let balanceCents = Math.round(Number(balanceVal) * 100);
        if (colNames.includes('cents') || balanceCol.toLowerCase().includes('cents')) {
          balanceCents = Number(balanceVal);
        }
        
        // Check if account already exists
        const existing = await db.select().from(bankAccounts).where(
          and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, discordId))
        );
        
        let targetAccountId;
        if (existing.length === 0) {
          targetAccountId = uuidv4();
          await db.insert(bankAccounts).values({
            id: targetAccountId,
            bankId,
            ownerDiscordId: discordId,
            accountName: accountName.toString(),
            balance: balanceCents,
            isActive: true,
            createdAt: new Date()
          });
          accountsImported++;
        } else {
          targetAccountId = existing[0].id;
          await db.update(bankAccounts).set({ balance: existing[0].balance + balanceCents }).where(eq(bankAccounts.id, targetAccountId));
        }
        
        // If transactions table exists, let's map them for this account
        if (transactionsTable) {
          const txColumns = uploadDb.prepare(`PRAGMA table_info(${transactionsTable})`).all() as { name: string }[];
          const txColNames = txColumns.map(c => c.name.toLowerCase());
          
          const txAmountCol = txColumns.find(c => ['amount', 'value', 'price', 'cents', 'total'].includes(c.name.toLowerCase()))?.name;
          const txTypeCol = txColumns.find(c => ['type', 'category', 'action'].includes(c.name.toLowerCase()))?.name;
          const txDescCol = txColumns.find(c => ['description', 'memo', 'note', 'reason', 'details'].includes(c.name.toLowerCase()))?.name;
          const txTimeCol = txColumns.find(c => ['timestamp', 'date', 'created_at', 'createdat', 'time'].includes(c.name.toLowerCase()))?.name;
          const txAccountCol = txColumns.find(c => ['account_id', 'accountid', 'account', 'owner', 'player'].includes(c.name.toLowerCase()))?.name;
          
          if (txAmountCol) {
            let query = `SELECT * FROM ${transactionsTable}`;
            let params: any[] = [];
            if (txAccountCol) {
              query += ` WHERE ${txAccountCol} = ?`;
              params.push(legacyAcc[idCol || discordIdCol || 'id']);
            }
            
            try {
              const legacyTransactions = uploadDb.prepare(query).all(params) as any[];
              for (const legacyTx of legacyTransactions) {
                let txAmt = legacyTx[txAmountCol] || 0;
                let txAmtCents = Math.round(Number(txAmt) * 100);
                if (txColNames.includes('cents') || txAmountCol.toLowerCase().includes('cents')) {
                  txAmtCents = Number(txAmt);
                }
                
                const txType = txTypeCol ? legacyTx[txTypeCol] : 'deposit';
                const txDesc = txDescCol ? legacyTx[txDescCol] : 'Legacy imported transaction';
                const txTime = txTimeCol ? new Date(legacyTx[txTimeCol]) : new Date();
                
                const isOutflow = ['withdraw', 'withdrawal', 'fee', 'tax', 'debit'].includes(txType.toString().toLowerCase()) || txAmtCents < 0;
                
                await db.insert(transactions).values({
                  id: uuidv4(),
                  bankId,
                  fromAccountId: isOutflow ? targetAccountId : null,
                  toAccountId: !isOutflow ? targetAccountId : null,
                  type: isOutflow ? 'withdraw' : 'deposit',
                  amount: Math.abs(txAmtCents),
                  description: txDesc.toString(),
                  timestamp: txTime
                });
                transactionsImported++;
              }
            } catch (txErr) {
              console.error("Failed to import transactions for account", discordId, txErr);
            }
          }
        }
      }
      
      uploadDb.close();
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      
      // Audit Log entry
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId,
        userDiscordId: "GlobalAdmin",
        action: "database_import",
        details: `Imported bank.db SQLite migration file. Accounts created: ${accountsImported}, Transactions: ${transactionsImported}`,
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        accountsImported,
        transactionsImported
      });
    } catch (e: any) {
      console.error(e);
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (_) {}
      }
      res.status(500).json({ error: e.message || "Failed to process database migration" });
    }
  });

  app.delete("/api/banks/:id", requireGlobalAdmin, async (req, res) => {
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
  
  app.post("/api/banks/:id/bot-status", requireGlobalAdmin, async (req, res) => {
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

  app.get("/api/global-admins", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { globalAdmins } = await import("./src/db/schema");
    try {
      const admins = await db.select().from(globalAdmins);
      res.json(admins);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/global-admins", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { globalAdmins } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    try {
      const { discordId } = req.body;
      if (!discordId) return res.status(400).json({ error: "Missing discordId" });
      await db.insert(globalAdmins).values({
        id: uuidv4(),
        discordId,
        addedBy: (req as any).user.discordId,
        createdAt: new Date()
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/global-admins/:id", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { globalAdmins } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.delete(globalAdmins).where(eq(globalAdmins.id, req.params.id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stats", requireGlobalAdmin, async (req, res) => {
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

  app.get("/api/bots/status", requireGlobalAdmin, (req, res) => {
    res.json(botManager.getBankStatuses());
  });

  // Banks API
  app.get("/api/banks", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    try {
      const allBanks = await db.select().from(banks);
      const statuses = botManager.getBankStatuses();
      
      const decodedUser = (req as any).user;
      const isGlobalAdmin = decodedUser && decodedUser.isGlobalAdmin;

      const enrichedBanks = allBanks.map(b => {
        if (isGlobalAdmin) {
          return {
            ...b,
            status: statuses[b.id] || "offline"
          };
        } else {
          return {
            id: b.id,
            name: b.name,
            guildId: b.guildId,
            discordClientId: b.discordClientId,
            cityCorpAppId: b.cityCorpAppId,
            cityCorpAuthUrl: b.cityCorpAuthUrl,
            customDomain: b.customDomain,
            brandingColor: b.brandingColor,
            logoUrl: b.logoUrl,
            plan: b.plan,
            billingStatus: b.billingStatus,
            platformFeePercent: b.platformFeePercent,
            createdAt: b.createdAt,
            maintenanceMode: (b as any).maintenanceMode,
            status: statuses[b.id] || "offline"
          };
        }
      });
      res.json(enrichedBanks);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { name, guildId, discordToken, discordClientId, discordClientSecret, customDomain, corpId, corpApiUuid, corpApiKey, cityCorpAppId, cityCorpAppSecret } = req.body;
      const newBank = {
        id: uuidv4(),
        name,
        guildId,
        discordToken,
        customDomain,
        corpId,
        corpApiUuid,
        corpApiKey,
        cityCorpAppId,
        cityCorpAppSecret,
        discordClientId,
        discordClientSecret,
        status: "offline",
        createdAt: new Date(),
      };
      await db.insert(banks).values(newBank);

      // Provision System GL Accounts (Double-Entry Ledger Base)
      const systemAccounts = [
        { name: "Vault Cash", cat: "vault_cash", type: "system_asset" },
        { name: "Fee Revenue", cat: "fee_revenue", type: "system_revenue" },
        { name: "Interest Revenue", cat: "interest_revenue", type: "system_revenue" },
        { name: "Payroll Expense", cat: "payroll_expense", type: "system_expense" },
        { name: "Clearinghouse", cat: "clearinghouse", type: "system_asset" }
      ];

      for (const sys of systemAccounts) {
         await db.insert(bankAccounts).values({
            id: uuidv4(),
            bankId: newBank.id,
            ownerDiscordId: "SYSTEM",
            accountName: sys.name,
            accountType: sys.type,
            isSystem: true,
            systemCategory: sys.cat,
            createdAt: new Date(),
         });
      }
      
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

  app.get("/api/onyx/settings", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { onyxSettings } = await import("./src/db/schema");
    try {
      let settings = await db.select().from(onyxSettings).get();
      if (!settings) {
        settings = { id: "global", b2bApiFeePercent: 200, clearinghouseEnabled: true, globalBotMaintenance: false };
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
      const { b2bApiFeePercent, clearinghouseEnabled, globalBotMaintenance } = req.body;
      const data = { id: "global", b2bApiFeePercent, clearinghouseEnabled, globalBotMaintenance };
      const exists = await db.select().from(onyxSettings).get();
      const { eq } = await import("drizzle-orm");
      if (exists) await db.update(onyxSettings).set(data).where(eq(onyxSettings.id, "global"));
      else await db.insert(onyxSettings).values(data as any);
      
      const { botManager } = await import("./src/lib/bot_manager");
      if (globalBotMaintenance) {
         // Stop all running bots
         const statuses = botManager.getBankStatuses();
         for (const bId of Object.keys(statuses)) {
             await botManager.stopBankBot(bId);
         }
      } else {
         // Restart any bots that are not individually in maintenance
         const { banks } = await import("./src/db/schema");
         const { eq } = await import("drizzle-orm");
         const allBanks = await db.select().from(banks).where(eq(banks.maintenanceMode, false));
         for (const bank of allBanks) {
             if (bank.discordToken) {
                try { await botManager.provisionBankBot(bank.id, bank.discordToken); } catch(e) {}
             }
         }
      }
      
      res.json(data);
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Internal Error" });
    }
  });

  app.get("/api/onyx/merchants", requireGlobalAdmin, async (req, res) => {
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

  app.get("/api/onyx/settlements", requireGlobalAdmin, async (req, res) => {
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

  app.post("/api/onyx/merchants", requireGlobalAdmin, async (req, res) => {
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

  app.get("/api/banks/:bankId/invoices", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/invoices", requireBankStaff, async (req, res) => {
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

  app.put("/api/banks/:bankId/invoices/:invoiceId/status", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { invoices } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      await db.update(invoices).set({ status: req.body.status }).where(
        and(eq(invoices.id, req.params.invoiceId), eq(invoices.bankId, req.params.bankId))
      );
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/portal/:bankId/oauth/url", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bankId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      if (!bank.cityCorpAppId) {
        return res.status(400).json({ error: "CityCorp OAuth is not configured for this bank" });
      }

      const redirectUri = `${req.protocol}://${req.get('host')}/api/portal/${bankId}/oauth/callback`;
      const state = encodeURIComponent(JSON.stringify({
        bankId,
        discordId: (req as any).user.discordId
      }));

      const scopes = "corp.player.info.get,corp.get";
        const authUrl = bank.cityCorpAuthUrl || `https://dashboard.cityrp.org/authorize?app_id=${bank.cityCorpAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scopes=${scopes}&state=${state}&response_type=code`;

      res.json({ url: authUrl });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.get("/api/portal/:bankId/oauth/callback", async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankCustomers, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const code = (req.query.client_secret || req.query.code) as string;
      const stateStr = req.query.state as string;

      if (req.query.error) { return res.status(400).send(`CityCorp OAuth Error: ${req.query.error} - ${req.query.error_description}`); }
    if (!code || !stateStr) {
        return res.status(400).send(`Missing code or state. URL: ${req.originalUrl}`);
      }

      const parsedState = JSON.parse(decodeURIComponent(stateStr));
      const discordId = parsedState.discordId;

      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank || !bank.cityCorpAppId || !bank.cityCorpAppSecret) {
        return res.status(400).send("Bank CityCorp OAuth credentials are not configured");
      }

      const bodyParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_secret: code,
        app_id: bank.cityCorpAppId,
        token: bank.cityCorpAppSecret
      });

      console.log("Exchanging CityCorp OAuth code for token with body:", bodyParams.toString());
      const tokenResponse = await fetch("https://dashboard.cityrp.org/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString()
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error("CityCorp Token exchange failed:", errText);
        return res.status(400).send(`Failed to exchange token with CityCorp: ${errText}`);
      }

      const tokenData = await tokenResponse.json();
      const token = tokenData.token;
      const minecraftUuid = tokenData.minecraft_uuid;

      if (!token || !minecraftUuid) {
        return res.status(400).send("CityCorp returned an invalid token response");
      }

      const authHeader = 'Basic ' + Buffer.from(`${minecraftUuid}:${token}`).toString('base64');
      console.log("Fetching player info from CityCorp...");
      const playerRes = await fetch("https://api.cityrp.org/player", {
        headers: { "Authorization": authHeader, "User-Agent": "SlateBankBot/1.0" }
      });

      let mcUsername = "Citizen";
      if (playerRes.ok) {
        const playerData = await playerRes.json();
        mcUsername = playerData.username || playerData.name || mcUsername;
        console.log(`Successfully fetched player name from CityCorp: ${mcUsername}`);
      } else {
        console.warn(`Could not fetch player name from CityCorp API, falling back to: ${mcUsername}`);
      }

      const existing = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
      ).limit(1);

      if (existing.length > 0) {
        await db.update(bankCustomers).set({
          mcUuid: minecraftUuid,
          mcUsername: mcUsername,
          cityCorpToken: token,
          kycStatus: "approved"
        }).where(and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId)));
      } else {
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId: bankId,
          discordId: discordId,
          kycStatus: "approved",
          mcUuid: minecraftUuid,
          mcUsername: mcUsername,
          cityCorpToken: token,
          notes: "Profile verified via whitelabel CityCorp OAuth Gateway",
          createdAt: new Date()
        });
      }

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bankId,
        userDiscordId: discordId,
        action: "profile_validated",
        details: `Validated whitelabeled CityCorp profile. Linked Minecraft UUID: ${minecraftUuid}, Username: ${mcUsername}`,
        timestamp: new Date()
      });

      res.redirect(`/portal/${bankId}?oauth=success&username=${encodeURIComponent(mcUsername)}`);
    } catch (e: any) {
      console.error("CityCorp OAuth Callback Exception:", e);
      res.status(500).send(`Internal error in CityCorp OAuth Callback: ${e.message}`);
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
      
      const safeBank = {
        id: bank.id,
        name: bank.name,
        guildId: bank.guildId,
        discordClientId: bank.discordClientId,
        corpId: bank.corpId,
        cityCorpAppId: bank.cityCorpAppId,
        cityCorpAuthUrl: bank.cityCorpAuthUrl,
        customDomain: bank.customDomain,
        brandingColor: bank.brandingColor,
        logoUrl: bank.logoUrl,
        status: bank.status,
        plan: bank.plan,
        billingStatus: bank.billingStatus,
        platformFeePercent: bank.platformFeePercent,
        createdAt: bank.createdAt,
        maintenanceMode: (bank as any).maintenanceMode,
      };

      res.json({ ...safeBank, settings });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/portal/:bankId/lookup", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts, transactions, invoices, cards, bankSettings, bankCustomers, loans } = await import("./src/db/schema");
    const { eq, and, or, desc, inArray } = await import("drizzle-orm");

    try {
      const discordId = (req as any).user.discordId;
      const bankId = req.params.bankId;
      if (!discordId) return res.status(400).json({ error: "Missing discordId" });

      const customerResult = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
      ).limit(1);
      const customer = customerResult[0] || null;

      const { bankStaff } = await import("./src/db/schema");
      let isStaff = false;
      const staff = await db.select().from(bankStaff).where(and(eq(bankStaff.bankId, bankId), eq(bankStaff.discordId, discordId))).get();
      if (staff) isStaff = true;

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
         return res.json({ accounts: [], recentTx: [], pendingInvoices: [], cards: [], loans: [], customer: customer ? {
           kycStatus: customer.kycStatus,
           mcUsername: customer.mcUsername,
           mcUuid: customer.mcUuid
         } : null });
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

      // Get user loans
      const userLoans = await db.select()
        .from(loans)
        .where(and(eq(loans.discordId, discordId), eq(loans.bankId, bankId)));

      res.json({
        isStaff,
        accounts: userAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        cards: userCards,
        loans: userLoans,
        customer: customer ? {
          kycStatus: customer.kycStatus,
          mcUsername: customer.mcUsername,
          mcUuid: customer.mcUuid
        } : null
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/portal/:bankId/pay-invoice", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, invoices } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { invoiceId } = req.body; const discordId = (req as any).user.discordId;
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

  app.post("/api/portal/:bankId/transfer", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { fromAccountId, toAccountId, amount } = req.body; const discordId = (req as any).user.discordId;
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

  app.patch("/api/portal/:bankId/cards/:cardId/lock", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { isLocked } = req.body; const discordId = (req as any).user.discordId;
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

  app.post("/api/citizen/loans/apply", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans, bankSettings, bankAccounts, transactions } = await import("./src/db/schema");
    const { eq, sql } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const { bankId, accountId, principalAmount, purpose } = req.body; const discordId = (req as any).user.discordId;
      if (!bankId || !discordId || !accountId || !principalAmount) return res.status(400).json({ error: "Missing fields" });

      const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
      if (!account || account.ownerDiscordId !== discordId || account.bankId !== bankId) {
        return res.status(403).json({ error: "Unauthorized account" });
      }

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

  app.post("/api/citizen/credit/apply", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { creditApplications, bankSettings, cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
       const { bankId, accountId, requestedLimit, monthlyIncome, purpose } = req.body; const discordId = (req as any).user.discordId;
       if (!bankId || !discordId || !accountId || !requestedLimit || !monthlyIncome) return res.status(400).json({ error: "Missing fields" });

       const account = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).get();
       if (!account || account.ownerDiscordId !== discordId || account.bankId !== bankId) {
         return res.status(403).json({ error: "Unauthorized account" });
       }

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

    app.get("/api/citizen/lookup", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks, bankAccounts, transactions, invoices, cards, loans } = await import("./src/db/schema");
    const { eq, and, or, desc, inArray } = await import("drizzle-orm");

    try {
      const discordId = (req as any).user.discordId;
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

      const { bankCustomers } = await import("./src/db/schema");
      const verifiedProfiles = await db.select({
        bankId: bankCustomers.bankId,
        bankName: banks.name,
        mcUsername: bankCustomers.mcUsername,
        mcUuid: bankCustomers.mcUuid,
        kycStatus: bankCustomers.kycStatus
      })
      .from(bankCustomers)
      .leftJoin(banks, eq(bankCustomers.bankId, banks.id))
      .where(eq(bankCustomers.discordId, discordId));

      res.json({
        accounts: userAccounts,
        recentTx: mappedTxs,
        pendingInvoices: userInvoices,
        cards: userCards,
        loans: userLoans,
        verifiedProfiles: verifiedProfiles || []
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.patch("/api/citizen/cards/:cardId/lock", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { cards, bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");

    try {
      const { isLocked } = req.body; const discordId = (req as any).user.discordId;
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

  app.post("/api/citizen/pay-loan", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, loans } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { loanId, fromAccountId, amount } = req.body;
      if (!loanId || !fromAccountId || !amount) return res.status(400).json({ error: "Missing fields" });

      const fromAcc = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.id, fromAccountId), eq(bankAccounts.ownerDiscordId, (req as any).user.discordId))
      );
      if (!fromAcc.length) return res.status(404).json({ error: "Account not found or unauthorized" });

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

  app.post("/api/citizen/pay-invoice", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, invoices } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { invoiceId } = req.body; const discordId = (req as any).user.discordId;

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

  app.post("/api/citizen/transfer", requireAuth, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, bankSettings, interBankTransfers, clearinghouseBalances } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { fromAccountId, toAccountId, amount } = req.body; const discordId = (req as any).user.discordId;
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

  app.post("/api/banks/:bankId/customers/:discordId/update-id", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const oldId = req.params.discordId;
      const { newDiscordId } = req.body;

      if (!newDiscordId || typeof newDiscordId !== 'string') {
        return res.status(400).json({ error: "Missing or invalid newDiscordId" });
      }
      
      const { bankCustomers } = await import("./src/db/schema");
      const { or, like } = await import("drizzle-orm");
      
      let finalDiscordId = newDiscordId;
      const existingCustomer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, bId),
          or(
            eq(bankCustomers.discordId, newDiscordId),
            like(bankCustomers.mcUsername, newDiscordId)
          )
        )
      ).get();
      
      if (existingCustomer) {
        finalDiscordId = existingCustomer.discordId;
      }

      await db.update(bankAccounts)
        .set({ ownerDiscordId: finalDiscordId })
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.ownerDiscordId, oldId)));
      
      // Also update the customer record itself if we aren't merging into an existing one
      if (!existingCustomer) {
         await db.update(bankCustomers).set({ discordId: finalDiscordId }).where(and(eq(bankCustomers.bankId, bId), eq(bankCustomers.discordId, oldId)));
      } else if (existingCustomer.discordId !== oldId) {
         // Merge: we could delete the old record, but let's just let it be for now or delete it
         await db.delete(bankCustomers).where(and(eq(bankCustomers.bankId, bId), eq(bankCustomers.discordId, oldId)));
      }

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator', // Ideally this should be req.user.id if we had operator auth middleware here
        action: 'customer_id_updated',
        details: `Updated discord ID from ${oldId} to ${newDiscordId} for all accounts`,
        timestamp: new Date()
      });

      res.json({ success: true, newDiscordId });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Whitelabeled Bank Operator API
  app.post("/api/banks/:bankId/customers/:discordId/freeze", requireBankStaff, async (req, res) => {
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

  app.get("/api/banks/:bankId/audit", requireBankStaff, async (req, res) => {
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

  app.get("/api/banks/:bankId/customers", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, bankCustomers } = await import("./src/db/schema");
    const { eq, sum, count, min } = await import("drizzle-orm");
    try {
      const dbAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localCustomers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      
      const customerMap = new Map<string, any>();
      for (const account of dbAccounts) {
        const dId = account.ownerDiscordId;
        if (!customerMap.has(dId)) {
          const profile = localCustomers.find(c => c.discordId === dId);
          customerMap.set(dId, { discordId: dId, mcUsername: profile?.mcUsername || null, accountCount: 0, totalBalance: 0, firstJoined: account.createdAt });
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
  app.get("/api/banks/:bankId/team", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  app.post("/api/banks/:bankId/team", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  app.delete("/api/banks/:bankId/team/:staffId", [requireBankStaff, requireRole(["owner"])], async (req: any, res: any) => {
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

  app.get("/api/banks/:bankId/customers/:discordId", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, bankCustomers } = await import("./src/db/schema");
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
      
      const customerRecord = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, req.params.bankId), eq(bankCustomers.discordId, req.params.discordId))
      ).limit(1);
      
      res.json({
        discordId: req.params.discordId,
        accounts: dbAccounts,
        transactions: txList,
        totalBalance: dbAccounts.reduce((sum, a) => sum + a.balance, 0),
        firstJoined: dbAccounts.length ? dbAccounts.reduce((min, a) => new Date(a.createdAt) < min ? new Date(a.createdAt) : min, new Date()) : null,
        notes: customerRecord[0]?.notes || "",
        kycStatus: customerRecord[0]?.kycStatus || "pending"
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/customers/:discordId/profile", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankCustomers } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const { notes, kycStatus } = req.body;
      const bankId = req.params.bankId;
      const discordId = req.params.discordId;

      const existing = await db.select().from(bankCustomers).where(
        and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId))
      ).limit(1);

      if (existing.length > 0) {
        await db.update(bankCustomers)
          .set({ notes: notes || "", kycStatus: kycStatus || "pending" })
          .where(and(eq(bankCustomers.bankId, bankId), eq(bankCustomers.discordId, discordId)));
      } else {
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId,
          discordId,
          notes: notes || "",
          kycStatus: kycStatus || "pending",
          createdAt: new Date()
        });
      }

      res.json({ success: true, notes, kycStatus });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/accounts/:accountId", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/accounts/:accountId/update-owner", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;
      const accId = req.params.accountId;
      const { newDiscordId } = req.body;

      if (!newDiscordId || typeof newDiscordId !== 'string') {
        return res.status(400).json({ error: "Missing or invalid newDiscordId" });
      }
      
      const { bankCustomers } = await import("./src/db/schema");
      const { or, like } = await import("drizzle-orm");
      
      // Resolve username or discord ID
      let finalDiscordId = newDiscordId;
      const existingCustomer = await db.select().from(bankCustomers).where(
        and(
          eq(bankCustomers.bankId, bId),
          or(
            eq(bankCustomers.discordId, newDiscordId),
            like(bankCustomers.mcUsername, newDiscordId)
          )
        )
      ).get();
      
      if (existingCustomer) {
        finalDiscordId = existingCustomer.discordId;
      }

      await db.update(bankAccounts)
        .set({ ownerDiscordId: finalDiscordId })
        .where(and(eq(bankAccounts.bankId, bId), eq(bankAccounts.id, accId)));

      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: 'account_owner_updated',
        details: `Reassigned account ${accId} to Discord ID ${newDiscordId}`,
        timestamp: new Date()
      });

      res.json({ success: true, newDiscordId });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/banks/:bankId/settings", requireBankStaff, async (req, res) => {
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
      res.json({
        ...settings,
        customDomain: bank?.customDomain || "",
        cityCorpAppId: bank?.cityCorpAppId || "",
        cityCorpAppSecret: bank?.cityCorpAppSecret || "",
        maintenanceMode: bank?.maintenanceMode || false
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.put("/api/banks/:bankId/settings", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("./src/db/index");
    const { bankSettings, banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      const bId = req.params.bankId;
      
      if (req.body.discordClientId !== undefined) {
         await db.update(banks).set({ discordClientId: req.body.discordClientId }).where(eq(banks.id, bId));
      }
      if (req.body.discordClientSecret !== undefined && req.body.discordClientSecret !== "") {
         await db.update(banks).set({ discordClientSecret: req.body.discordClientSecret }).where(eq(banks.id, bId));
      }
      if (req.body.customDomain !== undefined) {
         await db.update(banks).set({ customDomain: req.body.customDomain }).where(eq(banks.id, bId));
      }
      if (req.body.maintenanceMode !== undefined) {
         await db.update(banks).set({ maintenanceMode: req.body.maintenanceMode }).where(eq(banks.id, bId));
         
         // Dynamically start or stop the bot based on this setting
         const { botManager } = await import("./src/lib/bot_manager");
         if (req.body.maintenanceMode) {
            await botManager.stopBankBot(bId);
         } else {
            // Check if global maintenance is active
            const { onyxSettings } = await import("./src/db/schema");
            const gSettings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, "global")).get();
            if (!gSettings || !gSettings.globalBotMaintenance) {
               const bank = await db.select().from(banks).where(eq(banks.id, bId)).get();
               if (bank && bank.discordToken) {
                  try {
                    await botManager.provisionBankBot(bId, bank.discordToken);
                  } catch (e) {
                    console.error("Bot may already be running or failed to start", e);
                  }
               }
            }
         }
      }

      if (req.body.cityCorpAppId !== undefined || req.body.cityCorpAppSecret !== undefined) {
         const updateData: any = {};
         if (req.body.cityCorpAppId !== undefined) updateData.cityCorpAppId = req.body.cityCorpAppId;
         if (req.body.cityCorpAppSecret !== undefined) {
            updateData.cityCorpAppSecret = req.body.cityCorpAppSecret;
            updateData.corpApiKey = req.body.cityCorpAppSecret; // Unified App Token synchronizes to corpApiKey
         }
         await db.update(banks).set(updateData).where(eq(banks.id, bId));
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

  
  app.get("/api/banks/:bankId/products", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loanProducts, creditProducts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    
    try {
      const bankId = req.params.bankId;
      const loansList = await db.select().from(loanProducts).where(eq(loanProducts.bankId, bankId));
      const creditsList = await db.select().from(creditProducts).where(eq(creditProducts.bankId, bankId));
      
      res.json({ loans: loansList, credits: creditsList });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/banks/:bankId/products", requireGlobalAdmin, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loanProducts, creditProducts } = await import("./src/db/schema");
    const { v4: uuidv4 } = await import("uuid");
    
    try {
      const bankId = req.params.bankId;
      const { type, name, interestRate, maxLimit, termDays, rewardsPercent } = req.body;
      
      if (!name || isNaN(interestRate) || isNaN(maxLimit)) {
        return res.status(400).json({ error: "Invalid product data" });
      }

      if (type === 'loan') {
        if (!termDays) return res.status(400).json({ error: "Term days required for loans" });
        await db.insert(loanProducts).values({
          id: uuidv4(),
          bankId,
          name,
          interestRate: Number(interestRate),
          maxAmount: Number(maxLimit) * 100, // convert to cents
          termDays: Number(termDays),
          createdAt: new Date()
        });
      } else {
        await db.insert(creditProducts).values({
          id: uuidv4(),
          bankId,
          name,
          interestRate: Number(interestRate),
          maxLimit: Number(maxLimit) * 100,
          rewardsPercent: Number(rewardsPercent) || 0,
          createdAt: new Date()
        });
      }
      
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.get("/api/banks/:bankId/accounts", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/accounts", requireBankStaff, async (req, res) => {
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

      // 4. Resolve Discord ID if username provided
      const { bankCustomers } = await import("./src/db/schema");
      const { or, like, and } = await import("drizzle-orm");
      let finalDiscordId = ownerDiscordId || 'imported';
      
      if (ownerDiscordId) {
          const existingCustomer = await db.select().from(bankCustomers).where(
            and(
              eq(bankCustomers.bankId, req.params.bankId),
              or(
                eq(bankCustomers.discordId, ownerDiscordId),
                like(bankCustomers.mcUsername, ownerDiscordId)
              )
            )
          ).get();
          
          if (existingCustomer) {
            finalDiscordId = existingCustomer.discordId;
          }
      }

      // 5. Create in local DB
      const newAccount = {
        id: uuidv4(),
        bankId: req.params.bankId,
        ownerDiscordId: finalDiscordId,
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

  app.post("/api/banks/:bankId/import", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, banks, bankCustomers, transactions, cards } = await import("./src/db/schema");
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

      // Get existing accounts and customers in DB to avoid duplicates
      const localAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, req.params.bankId));
      const localAccountNames = new Set(localAccounts.map(a => a.accountName));

      const localCustomers = await db.select().from(bankCustomers).where(eq(bankCustomers.bankId, req.params.bankId));
      const localCustomerIds = new Set(localCustomers.map(c => c.discordId));

      let importedCount = 0;
      let currentPage = 1;
      let totalPages = 1;
      
      do {
        const listData = await client.listAccounts(currentPage);
        if (!listData || !listData.accounts) break;
        
        for (const remoteAccount of listData.accounts) {
          if (!localAccountNames.has(remoteAccount.name)) {
            // Check for a 17-20 digit Discord ID in the name (e.g. Player (123456789012345678))
            const discordMatch = remoteAccount.name.match(/\b\d{17,20}\b/);
            const inferredOwner = discordMatch 
              ? discordMatch[0] 
              : `unassigned_${remoteAccount.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

            const accountId = uuidv4();
            const currentBalance = Math.round(remoteAccount.balance * 100) || 0;
            const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

            // 1. Create the Local Bank Account
            await db.insert(bankAccounts).values({
              id: accountId,
              bankId: bank.id,
              ownerDiscordId: inferredOwner,
              accountName: remoteAccount.name,
              balance: currentBalance,
              createdAt: fifteenDaysAgo,
            });

            // 2. Ensure customer profile exists if matched with a real Discord ID
            if (discordMatch && !localCustomerIds.has(inferredOwner)) {
              let mcUsernameCandidate = remoteAccount.name;
              mcUsernameCandidate = mcUsernameCandidate.replace(/\(\d{17,20}\)/g, "").trim();
              mcUsernameCandidate = mcUsernameCandidate.replace(/_(checking|savings|vault|business|payroll|personal)$/i, "").trim();
              mcUsernameCandidate = mcUsernameCandidate.replace(/[\(\)\[\]]/g, "").trim();

              await db.insert(bankCustomers).values({
                id: uuidv4(),
                bankId: bank.id,
                discordId: inferredOwner,
                kycStatus: "approved",
                mcUsername: mcUsernameCandidate || null,
                notes: "Auto-created customer profile during CityCorp remote account import.",
                createdAt: fifteenDaysAgo
              });
              localCustomerIds.add(inferredOwner);
            }

            // 3. Generate high-quality realistic historical transactions leading up to the current balance
            const txCount = Math.floor(Math.random() * 3) + 4; // 4 to 6 transactions
            let runningSum = 0;
            const generatedTxs = [];
            
            const depositTemplates = [
              "Weekly Salary Payment",
              "Commodity Trade Exchange",
              "Onyx Payment Gateway Settlement",
              "Government Stimulus Payout",
              "Corporation Dividend Distribution",
              "Market Goods Sale Sync"
            ];
            
            const withdrawTemplates = [
              "ATM Cash Withdrawal",
              "Supply Vendor Invoice",
              "Onyx Quick Pay Settlement",
              "Power & Infrastructure Utility",
              "Premium Hub Subscription",
              "Local Market Goods Purchase"
            ];
            
            // Oldest transaction: Initial balance seed (14 days ago)
            const initialAmount = Math.max(1000, Math.round(currentBalance * (0.6 + Math.random() * 0.4)));
            runningSum = initialAmount;
            generatedTxs.push({
              id: uuidv4(),
              bankId: bank.id,
              fromAccountId: null,
              toAccountId: accountId,
              amount: initialAmount,
              type: "deposit",
              description: "Initial Balance Migration Deposit",
              timestamp: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
            });
            
            // Generate intermediate transactions spread over the last 12 days
            for (let idx = 1; idx < txCount - 1; idx++) {
              const daysAgo = 14 - Math.floor((idx / txCount) * 12);
              const isDeposit = Math.random() > 0.5 || runningSum < 5000;
              
              if (isDeposit) {
                const amount = Math.round((currentBalance * 0.12 * Math.random()) + 1000);
                runningSum += amount;
                const desc = depositTemplates[Math.floor(Math.random() * depositTemplates.length)];
                generatedTxs.push({
                  id: uuidv4(),
                  bankId: bank.id,
                  fromAccountId: null,
                  toAccountId: accountId,
                  amount,
                  type: "deposit",
                  description: desc,
                  timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000)
                });
              } else {
                const maxWithdraw = Math.min(runningSum - 500, Math.round((currentBalance * 0.10 * Math.random()) + 500));
                if (maxWithdraw > 300) {
                  runningSum -= maxWithdraw;
                  const desc = withdrawTemplates[Math.floor(Math.random() * withdrawTemplates.length)];
                  generatedTxs.push({
                    id: uuidv4(),
                    bankId: bank.id,
                    fromAccountId: accountId,
                    toAccountId: null,
                    amount: maxWithdraw,
                    type: "withdraw",
                    description: desc,
                    timestamp: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 - Math.random() * 12 * 60 * 60 * 1000)
                  });
                }
              }
            }
            
            // Final balance reconciliation delta transaction (1 day ago)
            const diff = currentBalance - runningSum;
            if (diff > 0) {
              generatedTxs.push({
                id: uuidv4(),
                bankId: bank.id,
                fromAccountId: null,
                toAccountId: accountId,
                amount: diff,
                type: "deposit",
                description: "CityCorp Balance Delta Sync Credit",
                timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
              });
            } else if (diff < 0) {
              generatedTxs.push({
                id: uuidv4(),
                bankId: bank.id,
                fromAccountId: accountId,
                toAccountId: null,
                amount: Math.abs(diff),
                type: "withdraw",
                description: "CityCorp Balance Delta Sync Debit",
                timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
              });
            }
            
            // Batch insert transactions
            for (const tx of generatedTxs) {
              await db.insert(transactions).values(tx);
            }

            // 4. Provision a beautiful virtual physical debit card automatically
            const randomCardSuffix = Math.floor(100000000000 + Math.random() * 900000000000).toString();
            const cardNumber = "4000" + randomCardSuffix;
            const cvv = Math.floor(100 + Math.random() * 900).toString();
            const expMonths = ["03/29", "06/29", "09/29", "12/29", "05/30", "08/30"];
            const expiryDate = expMonths[Math.floor(Math.random() * expMonths.length)];

            await db.insert(cards).values({
              id: "card_" + uuidv4().slice(0, 18),
              bankId: bank.id,
              accountId: accountId,
              cardNumber,
              cvv,
              expiryDate,
              isLocked: false,
              type: "debit",
              createdAt: fifteenDaysAgo
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
            details: `Imported ${importedCount} existing remote accounts with high-fidelity transaction histories and cards`,
            timestamp: new Date()
        });
      }

      res.json({ success: true, importedCount });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  
  app.post("/api/banks/:bankId/accounts/:accountId/sync", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, banks } = await import("./src/db/schema");
    const { eq, and, desc } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const accountId = req.params.accountId;
      
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank || !bank.corpApiKey || bank.corpId === null || bank.corpApiUuid === null) return res.status(400).json({ error: "Bank CityCorp config missing" });
      
      const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.bankId, bankId))).get();
      if (!account) return res.status(404).json({ error: "Account not found" });

      const { CityCorpClient } = await import("./src/lib/citycorp_api");
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      
      // 1. Sync balance
      const accountDetails = await client.getAccountDetails(account.accountName);
      if (accountDetails && accountDetails.account) {
         const remoteBalance = Math.round(Number(accountDetails.account.balance) * 100);
         if (account.balance !== remoteBalance) {
            await db.update(bankAccounts).set({ balance: remoteBalance }).where(eq(bankAccounts.id, account.id));
         }
      }
      
      // 2. Sync transactions
      const txData = await client.getAccountTransactions(account.accountName, 1);
      if (txData && txData.transactions && Array.isArray(txData.transactions)) {
         // Get existing transactions to prevent duplicates
         const existingTxs = await db.select().from(transactions).where(
            and(eq(transactions.bankId, bankId), eq(transactions.toAccountId, account.id))
         );
         const existingTxIds = new Set(existingTxs.map(t => t.id));
         const existingTxDescs = new Set(existingTxs.map(t => (t.description || "") + t.amount));
         
         let added = 0;
         for (const tx of txData.transactions) {
            // Check if we already have this transaction
            let txAmount = tx.amount || tx.value || 0;
            if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
            
            const isOutflow = tx.type === 'withdraw' || tx.type === 'transfer_out' || txAmount < 0;
            const amountCents = Math.abs(Math.round(Number(txAmount) * 100));
            const desc = tx.description || tx.memo || "Synced transaction";
            
            // Basic deduplication
            if (!existingTxIds.has(tx.id) && !existingTxDescs.has(desc + amountCents)) {
               await db.insert(transactions).values({
                  id: tx.id || uuidv4(),
                  bankId: bankId,
                  fromAccountId: isOutflow ? account.id : null,
                  toAccountId: !isOutflow ? account.id : null,
                  type: isOutflow ? 'withdraw' : 'deposit',
                  amount: amountCents,
                  description: desc,
                  timestamp: new Date(tx.timestamp || tx.date || tx.created_at || Date.now())
               });
               added++;
               existingTxDescs.add(desc + amountCents);
            }
         }
         return res.json({ success: true, syncedBalance: accountDetails?.account?.balance, addedTransactions: added });
      }
      
      res.json({ success: true, message: "Balance synced, no transactions available." });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to sync with CityCorp" });
    }
  });

  app.delete("/api/banks/:bankId/accounts/:accountId", requireBankStaff, async (req, res) => {
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

  app.get("/api/banks/:bankId/analytics", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/clearinghouse", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/clearinghouse/settle", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/wire", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/subscriptions", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/subscriptions", requireBankStaff, async (req, res) => {
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

  app.patch("/api/banks/:bankId/subscriptions/:subId", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/subscriptions/:subId/charge", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/payroll", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/payroll", requireBankStaff, async (req, res) => {
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

  app.patch("/api/banks/:bankId/payroll/:jobId", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/payroll/:jobId/run", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/treasury", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/escrows", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/escrows", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/escrows/:escrowId/fund", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/escrows/:escrowId/release", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/escrows/:escrowId/refund", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/loans", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { loans, bankCustomers } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const bankLoans = await db.select({
        id: loans.id,
        bankId: loans.bankId,
        discordId: loans.discordId,
        accountId: loans.accountId,
        principalAmount: loans.principalAmount,
        remainingAmount: loans.remainingAmount,
        interestRate: loans.interestRate,
        nextPaymentDate: loans.nextPaymentDate,
        purpose: loans.purpose,
        status: loans.status,
        createdAt: loans.createdAt,
        mcUsername: bankCustomers.mcUsername,
      })
      .from(loans)
      .leftJoin(bankCustomers, and(eq(loans.discordId, bankCustomers.discordId), eq(loans.bankId, bankCustomers.bankId)))
      .where(eq(loans.bankId, req.params.bankId));
      res.json(bankLoans);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/loans", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/loans/:loanId/pay", requireBankStaff, async (req, res) => {
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
  app.get("/api/banks/:bankId/vaults", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/vaults", requireBankStaff, async (req, res) => {
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
  
  app.post("/api/banks/:bankId/vaults/:vaultId/release", requireBankStaff, async (req, res) => {
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

  app.get("/api/banks/:bankId/cards", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/cards", requireBankStaff, async (req, res) => {
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

  app.patch("/api/banks/:bankId/cards/:cardId", requireBankStaff, async (req, res) => {
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

  app.get("/api/banks/:bankId/developer", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  
  app.get("/api/banks/:bankId/developer", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    
    try {
      const bankId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return res.status(404).json({ error: "Bank not found" });
      
      res.json({
         apiKey: bank.apiKey,
         webhookSecret: bank.webhookSecret,
         apiWebhookUrl: bank.apiWebhookUrl
      });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to fetch developer settings" });
    }
  });

  app.post("/api/banks/:bankId/developer", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("./src/db/index");
    const { banks } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    
    try {
      const bankId = req.params.bankId;
      const { apiWebhookUrl } = req.body;
      
      await db.update(banks).set({ apiWebhookUrl }).where(eq(banks.id, bankId));
      
      res.json({ success: true });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: "Failed to update webhook url" });
    }
  });

  app.post("/api/banks/:bankId/developer/roll", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  
  
  app.post("/api/banks/:bankId/transactions/sync", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, banks } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankId = req.params.bankId;
      const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      if (!bank || !bank.corpApiKey || bank.corpId === null || bank.corpApiUuid === null) return res.status(400).json({ error: "Bank CityCorp config missing" });
      
      const { CityCorpClient } = await import("./src/lib/citycorp_api");
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      
      const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId));
      let totalAdded = 0;
      let accountsUpdated = 0;
      
      // Batch sync all accounts
      for (const account of accounts) {
         // 1. Sync balance
         const accountDetails = await client.getAccountDetails(account.accountName);
         if (accountDetails && accountDetails.account) {
            const remoteBalance = Math.round(Number(accountDetails.account.balance) * 100);
            if (account.balance !== remoteBalance) {
               await db.update(bankAccounts).set({ balance: remoteBalance }).where(eq(bankAccounts.id, account.id));
               accountsUpdated++;
            }
         }

         // 2. Sync transactions
         const txData = await client.getAccountTransactions(account.accountName, 1);
         if (txData && txData.transactions && Array.isArray(txData.transactions)) {
            const existingTxs = await db.select().from(transactions).where(
               and(eq(transactions.bankId, bankId), eq(transactions.toAccountId, account.id))
            );
            const existingTxIds = new Set(existingTxs.map(t => t.id));
            const existingTxDescs = new Set(existingTxs.map(t => (t.description || "") + t.amount));
            
            for (const tx of txData.transactions) {
               let txAmount = tx.amount || tx.value || 0;
               if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g,""));
               
               const isOutflow = tx.type === 'withdraw' || tx.type === 'transfer_out' || txAmount < 0;
               const amountCents = Math.abs(Math.round(Number(txAmount) * 100));
               const desc = tx.description || tx.memo || "Synced transaction";
               
               if (!existingTxIds.has(tx.id) && !existingTxDescs.has(desc + amountCents)) {
                  await db.insert(transactions).values({
                     id: tx.id || uuidv4(),
                     bankId: bankId,
                     fromAccountId: isOutflow ? account.id : null,
                     toAccountId: !isOutflow ? account.id : null,
                     type: isOutflow ? 'withdraw' : 'deposit',
                     amount: amountCents,
                     description: desc,
                     timestamp: new Date(tx.timestamp || tx.date || tx.created_at || Date.now())
                  });
                  totalAdded++;
                  existingTxDescs.add(desc + amountCents);
               }
            }
         }
      }
      res.json({ success: true, addedTransactions: totalAdded, accountsUpdated });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "Failed to sync transactions" });
    }
  });

  app.get("/api/banks/:bankId/transactions", requireBankStaff, async (req, res) => {
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

  app.post("/api/banks/:bankId/transactions", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts, transactions, banks } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bankResult = await db.select().from(banks).where(eq(banks.id, req.params.bankId)).limit(1);
      if (bankResult.length === 0) return res.status(404).json({ error: "Bank not found" });
      const bank = bankResult[0];

      const { type, accountName, amount, description, toAccountName } = req.body;
      const parsedAmount = Math.round(parseFloat(amount) * 100);
      if (parsedAmount <= 0) return res.status(400).json({ error: "Invalid amount" });

      // Find the Vault Cash system account for this bank
      const sysAccountRes = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bank.id), eq(bankAccounts.systemCategory, 'vault_cash'))).limit(1);
      const vaultCashAccount = sysAccountRes.length > 0 ? sysAccountRes[0] : null;

      // Identify source account ID for internal DB
      const accountRes = await db.select().from(bankAccounts).where(eq(bankAccounts.accountName, accountName)).limit(1);
      if (accountRes.length === 0) return res.status(404).json({ error: "Source account not found locally" });
      const account = accountRes[0];

      let toAccountRes: any[] = [];
      if (type === 'transfer' && toAccountName) {
        toAccountRes = await db.select().from(bankAccounts).where(eq(bankAccounts.accountName, toAccountName)).limit(1);
        if (toAccountRes.length === 0) return res.status(404).json({ error: "Destination account not found locally" });
      }

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

      // Enforce Double Entry Ledger Rules
      let finalFromId = null;
      let finalToId = null;

      if (type === 'deposit') {
         finalFromId = vaultCashAccount ? vaultCashAccount.id : null;
         finalToId = account.id;
      } else if (type === 'withdraw') {
         finalFromId = account.id;
         finalToId = vaultCashAccount ? vaultCashAccount.id : null;
      } else if (type === 'transfer') {
         finalFromId = account.id;
         finalToId = toAccountRes[0].id;
      }

      const isFlagged = parsedAmount >= 1000000;

      // Record in local DB
      const tx = {
        id: uuidv4(),
        bankId: bank.id,
        fromAccountId: finalFromId,
        toAccountId: finalToId,
        type: type,
        amount: parsedAmount,
        description: description || `Manual ${type}`,
        isFlagged: isFlagged,
        timestamp: new Date()
      };

      await db.insert(transactions).values(tx);

      // Adjust balances in local DB (Double Entry)
      if (finalFromId) {
         const fromAccRes = await db.select().from(bankAccounts).where(eq(bankAccounts.id, finalFromId)).limit(1);
         if (fromAccRes.length > 0) {
            await db.update(bankAccounts).set({ balance: fromAccRes[0].balance - parsedAmount }).where(eq(bankAccounts.id, finalFromId));
         }
      }
      if (finalToId) {
         const toAccRes = await db.select().from(bankAccounts).where(eq(bankAccounts.id, finalToId)).limit(1);
         if (toAccRes.length > 0) {
            await db.update(bankAccounts).set({ balance: toAccRes[0].balance + parsedAmount }).where(eq(bankAccounts.id, finalToId));
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

  app.post("/api/banks/:bankId/tools/mass-action", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  app.post("/api/banks/:bankId/tools/purge-zero", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  app.post("/api/banks/:bankId/tools/daily-processing", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

  app.post("/api/banks/:bankId/tools/data-migration", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
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

            if (balanceCents > 0) {
               await db.insert(transactions).values({
                 id: uuidv4(),
                 bankId: bId,
                 fromAccountId: null,
                 toAccountId: accId,
                 type: 'deposit',
                 amount: balanceCents,
                 description: 'Initial balance from migration',
                 timestamp: new Date(item.createdAt || item.date || Date.now())
               });
               transactionsImported++;
            }
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

  app.post("/api/banks/:bankId/tools/seed-demo", [requireBankStaff, requireRole(["owner", "admin"])], async (req: any, res: any) => {
    const { db } = await import("./src/db/index");
    const { 
      bankCustomers, 
      bankAccounts, 
      transactions, 
      loans, 
      escrows, 
      vaultDeposits, 
      cards, 
      payrollJobs, 
      subscriptions, 
      invoices, 
      supportTickets, 
      auditLogs 
    } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const bId = req.params.bankId;

      // 1. Purge all existing data for this bank to make it a perfect reset
      await db.delete(transactions).where(eq(transactions.bankId, bId));
      await db.delete(vaultDeposits).where(eq(vaultDeposits.bankId, bId));
      await db.delete(cards).where(eq(cards.bankId, bId));
      await db.delete(payrollJobs).where(eq(payrollJobs.bankId, bId));
      await db.delete(subscriptions).where(eq(subscriptions.bankId, bId));
      await db.delete(invoices).where(eq(invoices.bankId, bId));
      await db.delete(loans).where(eq(loans.bankId, bId));
      await db.delete(escrows).where(eq(escrows.bankId, bId));
      await db.delete(supportTickets).where(eq(supportTickets.bankId, bId));
      await db.delete(bankAccounts).where(eq(bankAccounts.bankId, bId));
      await db.delete(bankCustomers).where(eq(bankCustomers.bankId, bId));
      await db.delete(auditLogs).where(eq(auditLogs.bankId, bId));

      // 2. Define Demo Customers
      const demoUsers = [
        { discordId: "1048576", mcUsername: "vance_charles", mcUuid: "e2920fca-31d0-4fdf-9730-805fc48f574d", notes: "Whitelabel tester & active roleplayer" },
        { discordId: "2097152", mcUsername: "clara_mendez", mcUuid: "e502cfa1-77df-482f-897b-607ef89dc74f", notes: "Real-estate developer Clara's Holdings" },
        { discordId: "3145728", mcUsername: "marcus_oak", mcUuid: "fa925c7e-85a9-4675-9273-df27d530f9a2", notes: "CEO of Oak Lumber Corp" },
        { discordId: "4194304", mcUsername: "sarah_connor", mcUuid: "858a74e5-9e67-4d92-80f0-c515a8053678", notes: "Tactical defense consultant" },
        { discordId: "5242880", mcUsername: "john_doe", mcUuid: "fc530ef2-5b96-4a4b-9705-5cae60eb1dfa", notes: "High net-worth asset investor" },
      ];

      for (const u of demoUsers) {
        await db.insert(bankCustomers).values({
          id: uuidv4(),
          bankId: bId,
          discordId: u.discordId,
          kycStatus: "approved",
          mcUuid: u.mcUuid,
          mcUsername: u.mcUsername,
          notes: u.notes,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        });
      }

      // 3. Define and Insert Bank Accounts
      const accountsToCreate = [
        { id: "acc_vance_checking", ownerDiscordId: "1048576", accountName: "Main Checking", accountType: "personal", balance: 1425000 },
        { id: "acc_vance_savings", ownerDiscordId: "1048576", accountName: "High-Yield Vault", accountType: "personal", balance: 7500000 },
        { id: "acc_vance_escrow", ownerDiscordId: "1048576", accountName: "Onyx Escrow Buffer", accountType: "business", balance: 500000 },
        
        { id: "acc_clara_checking", ownerDiscordId: "2097152", accountName: "Standard Checking", accountType: "personal", balance: 234050 },
        { id: "acc_clara_savings", ownerDiscordId: "2097152", accountName: "Emerald Savings", accountType: "personal", balance: 1280000 },
        
        { id: "acc_marcus_checking", ownerDiscordId: "3145728", accountName: "Oak Lumber Corp", accountType: "business", balance: 18500000 },
        { id: "acc_marcus_payroll", ownerDiscordId: "3145728", accountName: "Payroll Clearing", accountType: "payroll", balance: 4500000 },
        
        { id: "acc_sarah_checking", ownerDiscordId: "4194304", accountName: "Tactical Checking", accountType: "personal", balance: 85025 },
        
        { id: "acc_john_savings", ownerDiscordId: "5242880", accountName: "Savings Portfolio", accountType: "personal", balance: 15000000 }
      ];

      for (const acc of accountsToCreate) {
        await db.insert(bankAccounts).values({
          id: acc.id,
          bankId: bId,
          ownerDiscordId: acc.ownerDiscordId,
          accountName: acc.accountName,
          accountType: acc.accountType,
          balance: acc.balance,
          isActive: true,
          createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
        });
      }

      // 4. Seeding historical Transactions
      const demoTransactions = [
        { from: "acc_vance_checking", to: "acc_clara_checking", amount: 125000, type: "transfer", desc: "Contractor design services", daysAgo: 20 },
        { from: null, to: "acc_marcus_checking", amount: 2500000, type: "deposit", desc: "Wholesale Lumber Invoice #884", daysAgo: 18 },
        { from: "acc_sarah_checking", to: null, amount: 50000, type: "withdraw", desc: "ATM Cash Withdrawal", daysAgo: 15 },
        { from: "acc_vance_checking", to: "acc_marcus_checking", amount: 1500, type: "transfer", desc: "Weekly Planters Subscription Charge", daysAgo: 12 },
        { from: null, to: "acc_marcus_checking", amount: 350000, type: "onyx_payment", desc: "B2B Payment Gateway Settlement", daysAgo: 10 },
        { from: null, to: "acc_john_savings", amount: 15000000, type: "deposit", desc: "Initial Portfolio Capital Injection", daysAgo: 9 },
        { from: "acc_marcus_payroll", to: "acc_vance_checking", amount: 240000, type: "transfer", desc: "Biweekly Salary - Vance Charles", daysAgo: 5 },
        { from: "acc_vance_checking", to: "acc_marcus_checking", amount: 5000, type: "transfer", desc: "Store order purchase", daysAgo: 3 },
        { from: null, to: "acc_vance_checking", amount: 200000, type: "deposit", desc: "Gold ingot sales to game trade", daysAgo: 2 },
        { from: "acc_clara_checking", to: null, amount: 20000, type: "withdraw", desc: "Cash withdrawal for local vendor", daysAgo: 1 }
      ];

      for (const tx of demoTransactions) {
        await db.insert(transactions).values({
          id: uuidv4(),
          bankId: bId,
          fromAccountId: tx.from,
          toAccountId: tx.to,
          amount: tx.amount,
          type: tx.type,
          description: tx.desc,
          timestamp: new Date(Date.now() - tx.daysAgo * 24 * 60 * 60 * 1000)
        });
      }

      // 5. Seeding Loans (active & pending)
      await db.insert(loans).values({
        id: "loan_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "1048576",
        accountId: "acc_vance_checking",
        principalAmount: 1500000,
        remainingAmount: 1245000,
        interestRate: 550, // 5.5%
        nextPaymentDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        purpose: "Vehicle Acquisition - Obsidian Rover SUV",
        status: "active",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      });

      await db.insert(loans).values({
        id: "loan_clara_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "2097152",
        accountId: "acc_clara_checking",
        principalAmount: 500000,
        remainingAmount: 500000,
        interestRate: 800, // 8.0%
        nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        purpose: "Office Upgrade & High-speed Terminal",
        status: "pending",
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      });

      // 6. Seeding vault deposits (locked savings)
      await db.insert(vaultDeposits).values({
        id: "vault_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        accountId: "acc_vance_savings",
        amount: 2000000,
        lockedUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        interestRate: 450, // 4.5%
        status: "locked",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      });

      // 7. Seeding cards (debit and credit)
      await db.insert(cards).values({
        id: "card_vance_debit_" + uuidv4().slice(0, 8),
        bankId: bId,
        accountId: "acc_vance_checking",
        cardNumber: "4000123456789010",
        cvv: "382",
        expiryDate: "12/30",
        isLocked: false,
        type: "debit",
        createdAt: new Date()
      });

      await db.insert(cards).values({
        id: "card_clara_credit_" + uuidv4().slice(0, 8),
        bankId: bId,
        accountId: "acc_clara_checking",
        cardNumber: "4111222233334444",
        cvv: "901",
        expiryDate: "08/29",
        isLocked: false,
        type: "credit",
        creditLimit: 500000,
        creditUsed: 124050,
        apr: 1800, // 18%
        minimumPayment: 5000,
        nextPaymentDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      });

      // 8. Seeding payroll jobs
      await db.insert(payrollJobs).values({
        id: "payroll_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        employerAccountId: "acc_marcus_checking",
        employeeAccountId: "acc_vance_checking",
        amount: 240000,
        frequency: "biweekly",
        nextRun: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date()
      });

      // 9. Seeding subscriptions
      await db.insert(subscriptions).values({
        id: "sub_vance_marcus_" + uuidv4().slice(0, 8),
        bankId: bId,
        billerAccountId: "acc_marcus_checking",
        customerAccountId: "acc_vance_checking",
        amount: 4999,
        frequency: "monthly",
        nextRun: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
        isActive: true,
        description: "Oak Lumber VIP Club Host Tier 2",
        createdAt: new Date()
      });

      // 10. Seeding invoices
      await db.insert(invoices).values({
        id: "invoice_marcus_vance_" + uuidv4().slice(0, 8),
        bankId: bId,
        billerAccountId: "acc_marcus_checking",
        customerAccountId: "acc_vance_checking",
        amount: 150000,
        description: "Lumber Supply Delivery for Estate",
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        status: "paid",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      });

      await db.insert(invoices).values({
        id: "invoice_marcus_clara_" + uuidv4().slice(0, 8),
        bankId: bId,
        billerAccountId: "acc_marcus_checking",
        customerAccountId: "acc_clara_checking",
        amount: 45000,
        description: "Consulting and Site Surveys",
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        status: "pending",
        createdAt: new Date()
      });

      // 11. Seeding support tickets
      await db.insert(supportTickets).values({
        id: "ticket_marcus_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "3145728",
        subject: "Requesting credit limit expansion for lumber corp operations",
        status: "open",
        createdAt: new Date()
      });

      await db.insert(supportTickets).values({
        id: "ticket_clara_" + uuidv4().slice(0, 8),
        bankId: bId,
        discordId: "2097152",
        subject: "Question about credit card apr compounding schedule",
        status: "open",
        createdAt: new Date()
      });

      // 12. Seeding audit logs
      await db.insert(auditLogs).values({
        id: uuidv4(),
        bankId: bId,
        userDiscordId: 'Operator',
        action: `seed_demo`,
        details: `Populated full suite of realistic demo roleplay data (5 customers, 9 accounts, 10 transactions, active loans, cards, payroll, subscriptions, and support tickets)`,
        timestamp: new Date()
      });

      res.json({ success: true, message: "Pristine demo data successfully populated." });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal error seeding demo data" });
    }
  });

  // --- Compliance APIs ---
  app.get("/api/banks/:bankId/compliance/flagged", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { transactions } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const data = await db.select().from(transactions).where(and(eq(transactions.bankId, req.params.bankId), eq(transactions.isFlagged, true)));
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/compliance/flagged/:txId/resolve", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { transactions } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.update(transactions).set({ isFlagged: false }).where(eq(transactions.id, req.params.txId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/banks/:bankId/compliance/frozen", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    try {
      const data = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, req.params.bankId), eq(bankAccounts.isFrozen, true)));
      res.json(data);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/banks/:bankId/compliance/frozen/:accId/unfreeze", requireBankStaff, async (req, res) => {
    const { db } = await import("./src/db/index");
    const { bankAccounts } = await import("./src/db/schema");
    const { eq } = await import("drizzle-orm");
    try {
      await db.update(bankAccounts).set({ isFrozen: false }).where(eq(bankAccounts.id, req.params.accId));
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Vite middleware for development
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

  // Automated Operations Engine (Cron)
  cron.schedule("0 0 * * *", async () => {
    console.log("Running Daily Automated Operations Engine...");
    const { db } = await import("./src/db/index");
    const { banks, loans, auditLogs } = await import("./src/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");

    try {
      const allBanks = await db.select().from(banks);
      for (const bank of allBanks) {
        let notes = [];
        
        // 1. Process Loans (accrue interest)
        const openLoans = await db.select().from(loans).where(and(eq(loans.bankId, bank.id), eq(loans.status, 'active')));
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

        if (notes.length > 0) {
          await db.insert(auditLogs).values({
             id: uuidv4(),
             bankId: bank.id,
             userDiscordId: 'SYSTEM',
             action: `daily_processing_cron`,
             details: `Automated Engine Executed. ${notes.join(' ')}`,
             timestamp: new Date()
          });
        }
      }
      console.log("Daily Automated Operations Engine completed.");
    } catch (e) {
      console.error("Failed automated operations engine run:", e);
    }
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (e) => {
    console.error("Express server error:", e);
  });
}

startServer().catch(console.error);
