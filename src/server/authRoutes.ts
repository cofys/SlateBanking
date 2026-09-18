import { logSecurityEvent, sanitizeReturnTo, clientIp } from "./middleware";
import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, getRedirectUri, requireAuth } from "./middleware.js";
import { buildCityCorpAuthUrl } from "../lib/citycorp_api.js";

function envAdminIds(): Set<string> {
  const raw = [
    process.env.GLOBAL_ADMIN_DISCORD_IDS,
    process.env.GLOBAL_ADMIN_DISCORD_ID,
    process.env.ADMIN_DISCORD_IDS,
    process.env.DISCORD_ADMIN_IDS,
    process.env.ADMIN_IDS,
    process.env.GLOBAL_ADMIN_IDS,
    process.env.DISCORD_BOT_OWNER_ID
  ].filter(Boolean).join(",");
  return new Set(raw.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean));
}

async function maybeSeedFirstAdmin(db: any, globalAdmins: any, uuidv4: () => string, discordId: string): Promise<boolean> {
  if (process.env.ALLOW_FIRST_ADMIN !== "true") return false;
  if (envAdminIds().size > 0) return false;
  const totalAdmins = await db.select().from(globalAdmins).all();
  if (totalAdmins.length > 0) return false;
  await db.insert(globalAdmins).values({
    id: uuidv4(),
    discordId,
    addedBy: "System (ALLOW_FIRST_ADMIN)",
    createdAt: new Date()
  });
  return true;
}

export function registerAuthRoutes(app: express.Express) {
  app.get("/api/domain-lookup", async (req, res) => {
    const { db } = await import("../db/index");
    const { banks } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const domain = req.query.domain as string;
    
    if (!domain) return res.json({ bankId: null });
    
    try {
       const clean = String(domain).trim().toLowerCase().split(':')[0].split('/')[0];
       if (!clean || clean.length > 253) return res.json({ bankId: null });
       const all = await db.select().from(banks);
       const bank = all.find((b) => {
         if (!b.customDomain) return false;
         try {
           const d = b.customDomain.trim().toLowerCase();
           const dh = d.startsWith('http') ? new URL(d).hostname : d.split('/')[0].split(':')[0];
           return dh === clean;
         } catch { return false; }
       });
       if (bank) return res.json({ bankId: bank.id });
       return res.json({ bankId: null });
    } catch(e) {
       console.error(e);
       return res.json({ bankId: null });
    }
  });

  
  app.get('/api/auth/url', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { db } = await import("../db/index");
    const { banks } = await import("../db/schema");
    const { like, eq } = await import("drizzle-orm");
    const hostHeader = (req.get('x-forwarded-host') || req.get('host') || req.hostname).split(':')[0];
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
    }
    
    if (!bank && hostHeader && hostHeader !== 'localhost' && hostHeader !== '127.0.0.1') {
      try {
        const all = await db.select().from(banks);
        bank = all.find((b: any) => {
          if (!b.customDomain) return false;
          try {
            const d = String(b.customDomain).trim().toLowerCase();
            const dh = d.startsWith('http') ? new URL(d).hostname : d.split('/')[0].split(':')[0];
            return dh === hostHeader.toLowerCase();
          } catch { return false; }
        }) || null;
      } catch (e) {
        console.error("Domain lookup error for OAuth URL:", e);
      }
    }

    const hasCityCorpEnv = Boolean(process.env.CITYRP_APP_ID && (process.env.CITYRP_APP_TOKEN || process.env.CITYRP_APP_SECRET));

    if (provider === 'citycorp' || (!provider && ((bank && (bank.cityCorpAppId || bank.cityCorpAuthUrl)) || hasCityCorpEnv))) {
      if (!bank || (!bank?.cityCorpAppId && !bank?.cityCorpAuthUrl)) {
        try {
          const allBanks = await db.select().from(banks).all();
          const configuredBank = allBanks.find((b: any) => b.cityCorpAppId || b.cityCorpAuthUrl);
          if (configuredBank) {
            bank = configuredBank;
          }
        } catch (e) {
          console.error("Error finding configured bank:", e);
        }
      }

      const callbackPath = (req.query.callbackPath as string) || "/api/auth/citycorp/callback";
      const redirectUri = process.env.CITYRP_REDIRECT_URI || await getRedirectUri(req, callbackPath);
      const { v4: uuidv4 } = await import("uuid");
      const nonce = uuidv4();
      res.cookie('oauth_nonce', nonce, { maxAge: 10 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });

      const appIdForUrl = bank?.cityCorpAppId || process.env.CITYRP_APP_ID;
      if (!appIdForUrl && !bank?.cityCorpAuthUrl) {
        return res.status(400).json({ error: "CityCorp app id is not configured." });
      }
      const mockBankObj = { cityCorpAppId: appIdForUrl, cityCorpAuthUrl: bank?.cityCorpAuthUrl || null };
      const authResultInitial = buildCityCorpAuthUrl(mockBankObj, redirectUri, "");

      const rememberMe = req.query.rememberMe !== 'false';
      const stateObj = {
        bankId: bank?.id,
        appId: authResultInitial.appIdUsed,
        redirectUri: authResultInitial.redirectUriUsed,
        returnTo: sanitizeReturnTo(req.query.returnTo),
        rememberMe,
        nonce
      };
      const state = encodeURIComponent(JSON.stringify(stateObj));

      const finalAuthResult = buildCityCorpAuthUrl(mockBankObj, redirectUri, state);
      return res.json({ url: finalAuthResult.url, state });
    }

    const isCustomDomain = bank && bank.customDomain && hostHeader && hostHeader.includes(bank.customDomain);
    if (isCustomDomain && bank!.discordClientId) {
       clientId = (bank as any).discordClientId;
    }

    const redirectUri = await getRedirectUri(req);
    const intent = req.query.intent || 'login';
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const { v4: uuidv4 } = await import("uuid");
    const nonce = uuidv4();
    res.cookie('oauth_nonce', nonce, { maxAge: 10 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'lax' });
    const rememberMe = req.query.rememberMe !== 'false';
    const stateObj: any = { intent, rememberMe, nonce };
    if (bank) stateObj.bankId = bank.id;
    stateObj.returnTo = returnTo;
    const state = JSON.stringify(stateObj);
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


  app.get(['/api/auth/citycorp/callback', '/api/auth/callback'], async (req, res) => {
    const { db } = await import("../db/index");
    const { banks, bankCustomers } = await import("../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    console.log("[Auth] CityCorp Callback received on path:", req.path);
    const { state: stateStr } = req.query;
    const code = (req.query.client_secret || req.query.code) as string;

    if (req.query.error) { return res.status(400).send(`CityCorp OAuth Error: ${req.query.error} - ${req.query.error_description}`); }
    if (!code || !stateStr) {
      return res.status(400).send(`Missing code or state. URL: ${req.originalUrl}`);
    }

    try {
      let bankId;
      let returnTo;
      let redirectUriFromState;
      let appIdFromState;
      let rememberMeFromState = true;
      try {
        const parsedState = JSON.parse(decodeURIComponent(stateStr as string));
        const expectedNonce = req.cookies?.oauth_nonce;
        res.clearCookie('oauth_nonce');
        if (!expectedNonce || !parsedState.nonce || parsedState.nonce !== expectedNonce) {
           return res.status(400).send("Invalid OAuth state / nonce. Please try again.");
        }
        bankId = parsedState.bankId;
        returnTo = sanitizeReturnTo(parsedState.returnTo);
        redirectUriFromState = parsedState.redirectUri;
        appIdFromState = parsedState.appId;
        if (parsedState.rememberMe !== undefined) {
          rememberMeFromState = Boolean(parsedState.rememberMe);
        }
      } catch (e) {
        return res.status(400).send("Invalid OAuth state. Please try again.");
      }
      
      let bank = null;
      if (bankId) {
        bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
      }

      if (!bank) {
        const allBanks = await db.select().from(banks).all();
        if (allBanks.length > 0) bank = allBanks.find((b: any) => b.cityCorpAppId) || allBanks[0];
      }

      const appId = appIdFromState || bank?.cityCorpAppId || process.env.CITYRP_APP_ID;
      if (!appId) {
        return res.status(400).send("CityCorp app id is not configured for this bank.");
      }
      const redirectUri = redirectUriFromState || process.env.CITYRP_REDIRECT_URI || await getRedirectUri(req, req.path);

      // Collect candidate app secrets (bank app secret first, then env)
      const candidateSecrets: string[] = [];
      if (bank?.cityCorpAppSecret) candidateSecrets.push(bank.cityCorpAppSecret);
      const envSecret = process.env.CITYRP_APP_TOKEN || process.env.CITYRP_APP_SECRET;
      if (envSecret && !candidateSecrets.includes(envSecret)) candidateSecrets.push(envSecret);

      if (candidateSecrets.length === 0) {
        return res.status(400).send("Bank or Server CityCorp OAuth credentials (app secret) are not configured.");
      }

      let tokenData: any = null;
      let lastErrorText = "";
      let lastStatus = 0;

      for (const appSecret of candidateSecrets) {
        const bodyParams = new URLSearchParams({
          grant_type: "authorization_code",
          client_secret: code,
          app_id: appId,
          token: appSecret,
          redirect_uri: redirectUri
        });

        console.log(`[Auth] CityCorp Token exchange attempt: App ID: ${appId}, Redirect URI: ${redirectUri}, Secret Length: ${appSecret.length}`);

        try {
          const tokenResponse = await fetch("https://api.cityrp.org/auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: bodyParams.toString()
          });

          lastStatus = tokenResponse.status;
          const resText = await tokenResponse.text();

          if (tokenResponse.ok) {
            try {
              const parsed = JSON.parse(resText);
              if (parsed && parsed.token) {
                tokenData = parsed;
                console.log(`[Auth] CityCorp Token exchange SUCCESS!`);
                break;
              }
            } catch (e) {}
          }
          lastErrorText = resText;
          console.warn(`[Auth] Exchange failed (Status: ${tokenResponse.status}): ${resText}`);
        } catch (err: any) {
          lastErrorText = err.message;
          console.error(`[Auth] Network error during token exchange:`, err);
        }
      }

      if (!tokenData) {
        console.error("CityCorp OAuth Exchange Failed:", lastErrorText, "Status:", lastStatus);
        return res.status(400).send(`Failed to exchange token with CityCorp (Status: ${lastStatus}): ${lastErrorText}`);
      }

      const token = tokenData.token;
      const minecraftUuid = tokenData.minecraft_uuid;

      if (!token || !minecraftUuid) {
        return res.status(400).send("Invalid token response from CityCorp Auth API");
      }

      let mcUsername = tokenData.username || tokenData.player_name || tokenData.name || tokenData.mcUsername || "";

      if (!mcUsername) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${minecraftUuid}:${token}`).toString('base64');
          const playerRes = await fetch("https://api.cityrp.org/player", {
            headers: { "Authorization": authHeader, "User-Agent": "SlateBankBot/1.0" }
          });

          if (playerRes.ok) {
            const playerData = await playerRes.json();
            mcUsername = playerData.username || playerData.name || playerData.player?.name || playerData.player_name || "";
          }
        } catch (e) {
          console.error("CityCorp player API error:", e);
        }
      }

      if (!mcUsername || mcUsername === "Citizen") {
        try {
          const cleanUuid = minecraftUuid.replace(/-/g, '');
          const mojangRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`);
          if (mojangRes.ok) {
            const mojangData = await mojangRes.json();
            if (mojangData.name) {
              mcUsername = mojangData.name;
            }
          }
        } catch (e) {
          console.error("Mojang session API lookup error:", e);
        }
      }

      if (!mcUsername) {
        mcUsername = `Citizen_${minecraftUuid.substring(0, 6)}`;
      }

      if (mcUsername && mcUsername.trim().toLowerCase() === 'system') {
        return res.status(403).send("Registration Error: The username 'System' is reserved for internal bank accounts and cannot be used.");
      }
      
      const avatarUrl = `https://mc-heads.net/avatar/${mcUsername || minecraftUuid}/64`;

      if (bank) {
        let customer = await db.select().from(bankCustomers).where(
          and(eq(bankCustomers.bankId, bank.id), eq(bankCustomers.mcUuid, minecraftUuid))
        ).get();

        if (customer) {
          await db.update(bankCustomers).set({
            cityCorpToken: token,
            mcUsername: mcUsername
          }).where(eq(bankCustomers.id, customer.id));
        } else {
          await db.insert(bankCustomers).values({
            id: uuidv4(),
            bankId: bank.id,
            discordId: "mc_" + minecraftUuid,
            mcUuid: minecraftUuid,
            mcUsername: mcUsername,
            cityCorpToken: token,
            kycStatus: "approved",
            createdAt: new Date()
          });
        }
      }

      const { globalAdmins } = await import("../db/schema");
      const { or: drizzleOr } = await import("drizzle-orm");
      let dbAdmin = await db.select().from(globalAdmins).where(
        drizzleOr(
          eq(globalAdmins.discordId, "mc_" + minecraftUuid),
          eq(globalAdmins.discordId, minecraftUuid)
        )
      ).get();

      let isGlobalAdmin = !!dbAdmin;
      if (!dbAdmin) {
        isGlobalAdmin = await maybeSeedFirstAdmin(db, globalAdmins, uuidv4, "mc_" + minecraftUuid);
      }
      if (!isGlobalAdmin && envAdminIds().has("mc_" + minecraftUuid)) {
        isGlobalAdmin = true;
      }

      
      const ip = clientIp(req);
      await logSecurityEvent(ip, "citycorp_login", "success", "mc_" + minecraftUuid, "Logged in via CityCorp: " + mcUsername);
      const payload = {
        discordId: "mc_" + minecraftUuid,
        username: mcUsername,
        avatarUrl: avatarUrl,
        mcUuid: minecraftUuid
      };

      const tokenExpiry = rememberMeFromState ? '30d' : '24h';
      const cookieMaxAge = rememberMeFromState ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

      const signedToken = jwt.sign(payload, JWT_SECRET, { expiresIn: tokenExpiry });
      res.cookie('auth_token', signedToken, {
        secure: true,
        sameSite: 'lax',
        httpOnly: true,
        maxAge: cookieMaxAge
      });

      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
                }
              } catch(e) { console.error("Caught error:", e); }
              
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) { console.error("Caught error:", e); }
              
              try { window.close(); } catch(e) { console.error("Caught error:", e); }
              setTimeout(() => {
                const dest = ${JSON.stringify(sanitizeReturnTo(returnTo))};
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
    } catch (err: any) {
      console.error('CityCorp OAuth callback error:', err);
      res.status(500).send(`Authentication error: ${err.message}`);
    }
  });


  app.get('/api/auth/discord/callback', async (req, res) => {
    const { db } = await import("../db/index");
    const { banks, bankCustomers, bankAccounts } = await import("../db/schema");
    const { like, eq } = await import("drizzle-orm");
    const { code, state } = req.query;
    const expectedNonce = req.cookies.oauth_nonce;
    res.clearCookie('oauth_nonce');
        console.log("[Auth] Discord Callback received");
    if (!code) return res.status(400).send("No code provided");
    if (!state) return res.status(400).send("Missing OAuth state. Please try again.");
    if (!expectedNonce) return res.status(400).send("Missing OAuth nonce. Please try again.");
    
    let intent = 'login';
    let bankId = null;
    let rememberMeFromState = true;
    try {
      const decodedState = JSON.parse(decodeURIComponent(state as string));
      if (!decodedState.nonce || decodedState.nonce !== expectedNonce) {
         return res.status(400).send("Invalid OAuth state / nonce. Please try again.");
      }
      console.log("Discord Callback - Decoded State:", decodedState);
      intent = decodedState.intent || 'login';
      bankId = decodedState.bankId;
      if (decodedState.rememberMe !== undefined) {
        rememberMeFromState = Boolean(decodedState.rememberMe);
      }
    } catch (e) {
        console.error("Discord Callback - State Parse Error:", e, "State was:", state);
        return res.status(400).send("Invalid OAuth state. Please try again.");
    }
    console.log("Discord Callback - Final Intent:", intent);

    const hostname = req.hostname;
    let clientId = process.env.DISCORD_CLIENT_ID || '';
    let clientSecret = process.env.DISCORD_CLIENT_SECRET || '';

    let bankToUse = null;
    if (bankId) {
       bankToUse = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    } else if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.includes('run.app')) {
       try {
         const all = await db.select().from(banks);
         bankToUse = all.find((b: any) => {
           if (!b.customDomain) return false;
           try {
             const d = String(b.customDomain).trim().toLowerCase();
             const dh = d.startsWith('http') ? new URL(d).hostname : d.split('/')[0].split(':')[0];
             return dh === hostname.toLowerCase();
           } catch { return false; }
         }) || null;
       } catch (e) {
         console.error("Domain lookup error for OAuth Callback:", e);
       }
    }
    
    const isCustomDomain = bankToUse && bankToUse.customDomain && hostname && hostname.includes(bankToUse.customDomain);
    if (bankToUse && isCustomDomain && bankToUse.discordClientId && bankToUse.discordClientSecret) {
       clientId = bankToUse.discordClientId;
       clientSecret = bankToUse.discordClientSecret;
    }
    

    const redirectUri = await getRedirectUri(req);

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
      if (userData.username && userData.username.trim().toLowerCase() === 'system') {
        return res.status(403).send("Registration Error: The username 'System' is reserved for internal bank accounts and cannot be used.");
      }
      const { globalAdmins, bankCustomers, bankAccounts, cards, loans, invoices, transactions } = await import("../db/schema");
      const { eq, or: drizzleOr } = await import("drizzle-orm");
      const { db } = await import("../db/index");
      const { v4: uuidv4 } = await import("uuid");

      const totalAdmins = await db.select().from(globalAdmins).all();
      let dbAdmin = await db.select().from(globalAdmins).where(
        eq(globalAdmins.discordId, userData.id)
      ).get();

      let isGlobalAdmin = !!dbAdmin;
      if (!dbAdmin) {
        isGlobalAdmin = await maybeSeedFirstAdmin(db, globalAdmins, uuidv4, userData.id);
      }
      if (!isGlobalAdmin && envAdminIds().has(userData.id)) {
        isGlobalAdmin = true;
      }

      
      const ip = clientIp(req);
      await logSecurityEvent(ip, "discord_login", "success", realDiscordId, "Logged in via Discord: " + userData.username);
      let payload: any = {
        discordId: realDiscordId,
        username: userData.username,
        avatarUrl: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : undefined
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
        if (sessionDiscordId) {
          // Update bankCustomer to real discordId
          await db.update(bankCustomers)
            .set({ discordId: realDiscordId, linkedDiscordId: realDiscordId })
            .where(drizzleOr(eq(bankCustomers.discordId, sessionDiscordId), eq(bankCustomers.linkedDiscordId, sessionDiscordId)));
            
          await db.update(bankAccounts)
            .set({ ownerDiscordId: realDiscordId })
            .where(eq(bankAccounts.ownerDiscordId, sessionDiscordId));
            
          try { await db.update(cards as any).set({ ownerDiscordId: realDiscordId } as any).where(eq((cards as any).ownerDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(loans as any).set({ ownerDiscordId: realDiscordId } as any).where(eq((loans as any).ownerDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(invoices as any).set({ recipientDiscordId: realDiscordId } as any).where(eq((invoices as any).recipientDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(invoices as any).set({ creatorDiscordId: realDiscordId } as any).where(eq((invoices as any).creatorDiscordId, sessionDiscordId)); } catch(e) {}
          try { await db.update(transactions as any).set({ toCityCorpId: realDiscordId } as any).where(eq((transactions as any).toCityCorpId, sessionDiscordId)); } catch(e) {}
            
          payload.username = decodedSession.username || userData.username; // keep mc username
          payload.discordId = realDiscordId;
        }
      }

      const tokenExpiry = rememberMeFromState ? '30d' : '24h';
      const cookieMaxAge = rememberMeFromState ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: tokenExpiry });
      res.cookie('auth_token', token, {
        secure: true,
        sameSite: 'lax',
        httpOnly: true,
        maxAge: cookieMaxAge
      });

      let dest = (intent === 'link' || bankId) ? '/portal' : '/admin';
      try {
        if (state) {
            const decodedState = JSON.parse(decodeURIComponent(state as string));
            if (decodedState.returnTo) dest = sanitizeReturnTo(decodedState.returnTo);
        }
      } catch (e) { console.error("Caught error:", e); }

      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, window.location.origin);
                }
              } catch(e) { console.error("Caught error:", e); }
              
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) { console.error("Caught error:", e); }
              
              // Always try to close
              try { window.close(); } catch(e) { console.error("Caught error:", e); }
              
              // If not closed, redirect after delay
              setTimeout(() => {
                window.location.href = ${JSON.stringify(dest)};
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

  app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      (req as any).user = decoded;
      const { checkUserIsGlobalAdmin } = await import("./userResolver.js");
      const isGlobal = await checkUserIsGlobalAdmin(req);
      decoded.isGlobalAdmin = isGlobal;
      res.json(decoded);
    } catch(e) {
      res.status(401).json({ error: "Invalid token" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('auth_token', {
      secure: true,
      sameSite: 'lax',
      httpOnly: true,
    });
    res.json({ success: true });
  });

  app.post('/api/auth/demo-admin-login', async (_req, res) => {
    return res.status(410).json({ error: "Demo admin login is disabled." });
  });

  app.post('/api/citizen/link-discord-manual', requireAuth, async (_req, res) => {
    return res.status(410).json({ error: "Manual Discord linking is disabled. Use OAuth Link Discord." });
  });


}
