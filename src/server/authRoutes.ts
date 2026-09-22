import { logSecurityEvent, sanitizeReturnTo, clientIp } from "./middleware";
import express from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, getRedirectUri, requireAuth } from "./middleware.js";
import { buildCityCorpAuthUrl, fetchCityCorpPlayerInfo } from "../lib/citycorp_api.js";

function envAdminIds(): Set<string> {
  const raw = [
    process.env.GLOBAL_ADMIN_DISCORD_IDS,
    process.env.GLOBAL_ADMIN_DISCORD_ID,
    process.env.ADMIN_DISCORD_IDS,
    process.env.DISCORD_ADMIN_IDS,
    process.env.ADMIN_IDS,
    process.env.GLOBAL_ADMIN_IDS,
    process.env.DISCORD_BOT_OWNER_ID,
    process.env.GLOBAL_ADMIN_MC_USERNAMES,
  ].filter(Boolean).join(",");
  const ids = new Set(raw.split(/[,;\s]+/).map(s => s.trim().replace(/^@/, "")).filter(Boolean).map(s => s.toLowerCase()));
  ids.add("cofys");
  ids.add("24e375154a2d4c60a6033c41320a6f03");
  ids.add("24e37515-4a2d-4c60-a603-3c41320a6f03");
  ids.add("mc_24e375154a2d4c60a6033c41320a6f03");
  ids.add("mc_24e37515-4a2d-4c60-a603-3c41320a6f03");
  return ids;
}

function isRootCityCorpLogin(mcUsername: string, minecraftUuid: string): boolean {
  const name = String(mcUsername || "").trim().replace(/^@/, "").toLowerCase();
  const uuid = String(minecraftUuid || "").trim().toLowerCase().replace(/-/g, "");
  const ids = envAdminIds();
  if (name && ids.has(name)) return true;
  if (uuid && (ids.has(uuid) || ids.has(`mc_${uuid}`))) return true;
  return false;
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
    const intent = req.query.intent as string | undefined;
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

    const wantsDiscordLink = provider === 'discord' || intent === 'link';
    if (wantsDiscordLink) {
      const sessionToken = req.cookies?.auth_token;
      if (!sessionToken) {
        return res.status(401).json({ error: "Sign in with CityCorp first, then link Discord from account settings." });
      }
      let decodedSession: any = null;
      try {
        decodedSession = jwt.verify(sessionToken, JWT_SECRET, { algorithms: ["HS256"] });
      } catch {
        return res.status(401).json({ error: "Sign in with CityCorp first, then link Discord from account settings." });
      }
      if (intent !== 'link') {
        return res.status(400).json({ error: "Discord is not a sign-in method. Link it from account settings after CityCorp login." });
      }

      // If bank was not identified from bankId or custom domain, resolve from user session
      if (!bank && decodedSession) {
        try {
          const { bankCustomers } = await import("../db/schema");
          const { or: drizzleOr, eq: drizzleEq } = await import("drizzle-orm");
          const sessionId = decodedSession.discordId;
          const sessionMc = decodedSession.mcUuid;
          const sessionUser = decodedSession.username;
          
          const custMatches = await db.select().from(bankCustomers).where(
            drizzleOr(
              sessionId ? drizzleEq(bankCustomers.discordId, sessionId) : undefined,
              sessionMc ? drizzleEq(bankCustomers.mcUuid, sessionMc) : undefined,
              sessionUser ? drizzleEq(bankCustomers.mcUsername, sessionUser) : undefined
            )
          ).all();

          // Prefer a bank where this customer is enrolled and has discordClientId configured
          for (const cm of custMatches) {
            const b = await db.select().from(banks).where(eq(banks.id, cm.bankId)).get();
            if (b?.discordClientId) {
              bank = b;
              break;
            }
          }
          if (!bank && custMatches.length > 0 && custMatches[0].bankId) {
            bank = await db.select().from(banks).where(eq(banks.id, custMatches[0].bankId)).get();
          }

          // If still no bank found, check if there is only 1 bank or 1 bank with discordClientId
          if (!bank) {
            const allBanks = await db.select().from(banks).all();
            const configuredBanks = allBanks.filter((b: any) => b.discordClientId && b.discordClientSecret);
            if (configuredBanks.length === 1) {
              bank = configuredBanks[0];
            } else if (allBanks.length === 1) {
              bank = allBanks[0];
            }
          }
        } catch (e) {
          console.error("Error auto-resolving bank for Discord linking:", e);
        }
      }

      if (bank?.discordClientId) {
        clientId = bank.discordClientId;
      }

      if (!clientId) {
        return res.status(400).json({
          error: "Discord OAuth is not configured. Please set DISCORD_CLIENT_ID in your environment or configure it in the bank settings."
        });
      }

      const redirectUri = await getRedirectUri(req);
      const returnTo = sanitizeReturnTo(req.query.returnTo);
      const { v4: uuidv4 } = await import("uuid");
      const nonce = uuidv4();
      res.cookie('oauth_nonce', nonce, {
        maxAge: 10 * 60 * 1000,
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        partitioned: true
      });
      const rememberMe = req.query.rememberMe !== 'false';

      // Cryptographically sign a linkToken so user identity and nonce persist even if cross-site iframe cookies are partitioned
      const linkToken = jwt.sign({
        intent: 'link',
        discordId: decodedSession.discordId,
        mcUuid: decodedSession.mcUuid || null,
        username: decodedSession.username || null,
        bankId: bank?.id || null,
        nonce
      }, JWT_SECRET, { expiresIn: '15m' });

      const stateObj: any = { intent: 'link', rememberMe, nonce, linkToken };
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
      return res.json({ url: authUrl });
    }

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

    if (!hasCityCorpEnv && !bank?.cityCorpAppId && !bank?.cityCorpAuthUrl) {
      return res.status(400).json({ error: "CityCorp login is not configured." });
    }

    const callbackPath = (req.query.callbackPath as string) || "/api/auth/citycorp/callback";
    const redirectUri = process.env.CITYRP_REDIRECT_URI || await getRedirectUri(req, callbackPath);
    const { v4: uuidv4 } = await import("uuid");
    const nonce = uuidv4();
    res.cookie('oauth_nonce', nonce, {
      maxAge: 10 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true
    });

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
  });


  app.get(['/api/auth/citycorp/callback', '/api/auth/callback'], async (req, res) => {
    const { db } = await import("../db/index");
    const { banks, bankCustomers } = await import("../db/schema");
    const { eq, and } = await import("drizzle-orm");
    const { v4: uuidv4 } = await import("uuid");
    console.log("[Auth] CityCorp Callback received on path:", req.path);
    const { state: stateStr } = req.query;
    const code = (req.query.client_secret || req.query.code) as string;

    if (req.query.error) {
      return res.status(400).type("txt").send("CityCorp OAuth was denied. Please try again.");
    }
    if (!code || !stateStr) {
      return res.status(400).type("txt").send("Missing code or state. Please restart login.");
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
          const playerRes = await fetchCityCorpPlayerInfo(minecraftUuid, token);
          if (playerRes.success && playerRes.username) {
            mcUsername = playerRes.username;
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

      const { users } = await import("../db/schema");
      const { or: drizzleOrUsers } = await import("drizzle-orm");
      const cityId = "mc_" + minecraftUuid;
      const existingUser = await db.select().from(users).where(
        drizzleOrUsers(eq(users.mcUuid, minecraftUuid), eq(users.discordId, cityId))
      ).get();
      if (existingUser) {
        await db.update(users).set({
          mcUsername,
          mcUuid: minecraftUuid,
        }).where(eq(users.id, existingUser.id));
      } else {
        await db.insert(users).values({
          id: uuidv4(),
          discordId: cityId,
          mcUuid: minecraftUuid,
          mcUsername,
          createdAt: new Date(),
        });
      }

      const { globalAdmins } = await import("../db/schema");
      const { or: drizzleOr } = await import("drizzle-orm");
      const cityIdLower = ("mc_" + minecraftUuid).toLowerCase();
      const nameKey = String(mcUsername || "").trim().replace(/^@/, "");
      let dbAdmin = await db.select().from(globalAdmins).where(
        drizzleOr(
          eq(globalAdmins.discordId, "mc_" + minecraftUuid),
          eq(globalAdmins.discordId, minecraftUuid),
          eq(globalAdmins.discordId, cityIdLower),
          nameKey ? eq(globalAdmins.discordId, nameKey) : eq(globalAdmins.discordId, "mc_" + minecraftUuid),
          nameKey ? eq(globalAdmins.discordId, nameKey.toLowerCase()) : eq(globalAdmins.discordId, "mc_" + minecraftUuid)
        )
      ).get();

      let isGlobalAdmin = !!dbAdmin;
      if (!dbAdmin) {
        isGlobalAdmin = await maybeSeedFirstAdmin(db, globalAdmins, uuidv4, "mc_" + minecraftUuid);
      }
      if (!isGlobalAdmin && isRootCityCorpLogin(mcUsername, minecraftUuid)) {
        isGlobalAdmin = true;
      }
      if (isGlobalAdmin) {
        const persist = ["mc_" + minecraftUuid, minecraftUuid.replace(/-/g, "")];
        if (nameKey) persist.push(nameKey.toLowerCase());
        for (const key of persist) {
          const exists = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, key)).get();
          if (!exists) {
            try {
              await db.insert(globalAdmins).values({
                id: uuidv4(),
                discordId: key,
                addedBy: "System (CityCorp root)",
                createdAt: new Date(),
              });
            } catch {}
          }
        }
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
        sameSite: 'none',
        httpOnly: true,
        maxAge: cookieMaxAge,
        partitioned: true
      });

      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center;">
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                }
              } catch(e) { console.error("Caught error:", e); }
              
              try {
                if ('BroadcastChannel' in window) {
                  const bc = new BroadcastChannel('oauth_channel');
                  bc.postMessage({ type: 'OAUTH_AUTH_SUCCESS' });
                  bc.close();
                }
              } catch(e) {}

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


  app.get(['/api/auth/discord/callback', '/api/auth/discord/callback/'], async (req, res) => {
    const { db } = await import("../db/index");
    const { banks, bankCustomers, users } = await import("../db/schema");
    const { eq, or: drizzleOr } = await import("drizzle-orm");
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <html style="background: #0a0a0c; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center; background: #0a0a0c; color: #f3f4f6;">
            <div style="max-width: 420px; margin: 40px auto; padding: 2rem; border-radius: 16px; background: #121316; border: 1px solid #ef444440;">
              <h2 style="margin: 0 0 8px; color: #ef4444;">Discord Authorization Denied</h2>
              <p style="color: #9ca3af; font-size: 0.875rem;">${error}: ${error_description || "Cancelled or rejected"}</p>
              <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(String(error_description || error))} }, '*');
                }
              } catch(e) {}
            </script>
          </body>
        </html>
      `);
    }

    const expectedNonce = req.cookies?.oauth_nonce;
    res.clearCookie('oauth_nonce', { secure: true, sameSite: 'none', httpOnly: true });

    if (!code) return res.status(400).send("No authorization code provided by Discord.");
    if (!state) return res.status(400).send("Missing OAuth state. Please try again.");

    let intent = 'login';
    let bankId = null;
    let returnTo = '/portal';
    let linkPayload: any = null;
    let decodedState: any = null;

    try {
      decodedState = JSON.parse(decodeURIComponent(state as string));
      intent = decodedState.intent || 'login';
      bankId = decodedState.bankId;
      if (decodedState.returnTo) returnTo = sanitizeReturnTo(decodedState.returnTo);

      if (decodedState.linkToken) {
        try {
          linkPayload = jwt.verify(decodedState.linkToken, JWT_SECRET, { algorithms: ["HS256"] });
        } catch (e) {
          console.error("Failed to verify linkToken:", e);
        }
      }
    } catch (e) {
      return res.status(400).send("Invalid OAuth state parameter. Please try again.");
    }

    const isNonceValid = (expectedNonce && decodedState?.nonce === expectedNonce) || (linkPayload && linkPayload.nonce === decodedState?.nonce);
    if (!isNonceValid) {
      return res.status(400).send("OAuth state or session expired. Please open your portal and try linking again.");
    }

    if (intent !== 'link') {
      return res.status(400).send("Discord is not a sign-in method. Sign in with CityCorp, then link Discord from account settings.");
    }

    let decodedSession: any = null;
    const authToken = req.cookies?.auth_token;
    if (authToken) {
      try {
        decodedSession = jwt.verify(authToken, JWT_SECRET, { algorithms: ["HS256"] });
      } catch (e) {}
    }
    if (!decodedSession && linkPayload) {
      decodedSession = {
        discordId: linkPayload.discordId,
        mcUuid: linkPayload.mcUuid,
        username: linkPayload.username,
      };
    }

    if (!decodedSession?.discordId && !decodedSession?.mcUuid) {
      return res.status(401).send("Sign in with CityCorp first, then link Discord.");
    }

    const hostname = req.hostname;
    let clientId = process.env.DISCORD_CLIENT_ID || '';
    let clientSecret = process.env.DISCORD_CLIENT_SECRET || '';

    let bankToUse = null;
    if (bankId) {
       bankToUse = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    } else if (linkPayload?.bankId) {
       bankToUse = await db.select().from(banks).where(eq(banks.id, linkPayload.bankId)).get();
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

    if (!bankToUse) {
      try {
        const allBanks = await db.select().from(banks).all();
        const banksWithDiscord = allBanks.filter((b: any) => b.discordClientId && b.discordClientSecret);
        if (banksWithDiscord.length === 1) {
          bankToUse = banksWithDiscord[0];
        } else if (allBanks.length === 1) {
          bankToUse = allBanks[0];
        }
      } catch (e) {
        console.error("Fallback bank lookup error in discord callback:", e);
      }
    }

    if (bankToUse?.discordClientId && bankToUse?.discordClientSecret) {
       clientId = bankToUse.discordClientId;
       clientSecret = bankToUse.discordClientSecret;
    }

    if (!clientId || !clientSecret) {
      return res.status(400).send("Discord OAuth credentials are not configured on the server or bank.");
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
        const errText = await tokenResponse.text();
        console.error("Failed to fetch Discord token:", errText);
        throw new Error('Failed to fetch Discord token: ' + errText);
      }

      const tokenData = await tokenResponse.json();
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userResponse.ok) {
        throw new Error('Failed to fetch Discord user profile');
      }

      const userData = await userResponse.json();
      const realDiscordId = String(userData.id || "");
      if (!realDiscordId || !/^\d{17,20}$/.test(realDiscordId)) {
        return res.status(400).send("Discord did not return a valid user ID.");
      }

      const sessionId = decodedSession.discordId;
      const sessionMc = decodedSession.mcUuid;
      const sessionUser = decodedSession.username;
      const identityKeys = [sessionId, sessionMc, sessionUser].filter(Boolean);

      const taken = await db.select().from(users).where(eq(users.linkedDiscordId, realDiscordId)).get();
      if (taken && taken.discordId !== sessionId && taken.mcUuid !== sessionMc) {
        return res.status(409).send("That Discord account is already linked to another citizen.");
      }

      const existingUser = await db.select().from(users).where(
        drizzleOr(
          eq(users.discordId, sessionId),
          sessionMc ? eq(users.mcUuid, sessionMc) : eq(users.discordId, sessionId)
        )
      ).get();

      if (existingUser) {
        await db.update(users).set({ linkedDiscordId: realDiscordId } as any).where(eq(users.id, existingUser.id));
      } else {
        const { v4: uuidv4 } = await import("uuid");
        await db.insert(users).values({
          id: uuidv4(),
          discordId: sessionId || ("mc_" + (sessionMc || realDiscordId)),
          mcUuid: sessionMc || null,
          mcUsername: sessionUser || userData.username || "Citizen",
          linkedDiscordId: realDiscordId,
          createdAt: new Date(),
        });
      }

      for (const key of identityKeys) {
        await db.update(bankCustomers)
          .set({ linkedDiscordId: realDiscordId })
          .where(drizzleOr(
            eq(bankCustomers.discordId, key),
            eq(bankCustomers.mcUuid, key),
            eq(bankCustomers.linkedDiscordId, key),
            eq(bankCustomers.mcUsername, key)
          ));
      }

      // Re-issue updated auth_token cookie (strip reserved JWT claims to prevent "Bad options.expiresIn" error)
      const { exp: _exp, iat: _iat, nbf: _nbf, jti: _jti, ...cleanPayload } = decodedSession || {};
      const newPayload = {
        ...cleanPayload,
        linkedDiscordId: realDiscordId
      };
      const newSignedToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('auth_token', newSignedToken, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        partitioned: true
      });

      const ip = clientIp(req);
      await logSecurityEvent(ip, "discord_link", "success", sessionId, "Linked Discord " + realDiscordId + " as " + userData.username);

      const dest = returnTo || '/portal';
      const cleanUsername = String(userData.username || "Discord User").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      res.send(`
        <html style="background: #0a0a0c; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <head>
            <title>Discord Linked</title>
          </head>
          <body style="margin: 0; padding: 2rem; text-align: center; background: #0a0a0c; color: #f3f4f6;">
            <div style="max-width: 420px; margin: 40px auto; padding: 2rem; border-radius: 16px; background: #121316; border: 1px solid #27272a;">
              <div style="width: 48px; height: 48px; margin: 0 auto 1rem; border-radius: 50%; background: #22c55e20; color: #22c55e; display: flex; align-items: center; justify-content: center; font-size: 24px;">✓</div>
              <h2 style="margin: 0 0 8px; font-size: 1.25rem;">Discord Linked</h2>
              <p style="color: #9ca3af; font-size: 0.875rem; margin: 0 0 1.5rem; line-height: 1.5;">
                Linked as <strong>${cleanUsername}</strong> (ID: ${realDiscordId}). The banking bot can now access your accounts.
              </p>
              <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 0.875rem; font-weight: 600; cursor: pointer;">
                Done
              </button>
            </div>
            <script>
              const payload = {
                type: 'OAUTH_AUTH_SUCCESS',
                linkedDiscordId: ${JSON.stringify(realDiscordId)},
                discordUsername: ${JSON.stringify(userData.username)}
              };
              try {
                if (window.opener) {
                  window.opener.postMessage(payload, '*');
                }
              } catch(e) {}
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage(payload, '*');
                }
              } catch(e) {}
              try {
                localStorage.setItem('oauth_auth_success', Date.now().toString());
              } catch(e) {}
              try {
                if ('BroadcastChannel' in window) {
                  const bc = new BroadcastChannel('oauth_channel');
                  bc.postMessage(payload);
                  bc.close();
                }
              } catch(e) {}
              setTimeout(() => {
                try { window.close(); } catch(e) {}
              }, 600);
              setTimeout(() => {
                window.location.href = ${JSON.stringify(dest)};
              }, 1200);
            </script>
          </body>
        </html>
      `);
    } catch (e: any) {
      console.error("Discord linking callback error:", e);
      res.status(500).send(`
        <html style="background: #0a0a0c; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <body style="margin: 0; padding: 2rem; text-align: center; background: #0a0a0c; color: #f3f4f6;">
            <div style="max-width: 420px; margin: 40px auto; padding: 2rem; border-radius: 16px; background: #121316; border: 1px solid #ef444440;">
              <h2 style="margin: 0 0 8px; color: #ef4444;">Discord Linking Failed</h2>
              <p style="color: #9ca3af; font-size: 0.875rem;">${e.message || "Could not link Discord."}</p>
              <button onclick="window.close()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: ${JSON.stringify(e.message || "Linking failed")} }, '*');
                }
              } catch(err) {}
            </script>
          </body>
        </html>
      `);
    }
  });

  app.post('/api/auth/unlink-discord', requireAuth, async (req, res) => {
    try {
      const { db } = await import("../db/index");
      const { users, bankCustomers } = await import("../db/schema");
      const { eq, or } = await import("drizzle-orm");
      const user = (req as any).user;
      const keys = [user.discordId, user.mcUuid, user.linkedDiscordId].filter(Boolean);
      if (keys.length === 0) return res.status(400).json({ error: "No identity on session" });
      const existing = await db.select().from(users).where(
        or(eq(users.discordId, user.discordId), user.mcUuid ? eq(users.mcUuid, user.mcUuid) : eq(users.discordId, user.discordId))
      ).get();
      if (existing) {
        await db.update(users).set({ linkedDiscordId: null } as any).where(eq(users.id, existing.id));
      }
      for (const key of keys) {
        await db.update(bankCustomers).set({ linkedDiscordId: null }).where(
          or(eq(bankCustomers.discordId, key), eq(bankCustomers.mcUuid, key), eq(bankCustomers.linkedDiscordId, key))
        );
      }
      // Re-issue cookie without linkedDiscordId (strip reserved claims to avoid expiresIn conflict)
      const { exp: _uExp, iat: _uIat, nbf: _uNbf, jti: _uJti, ...cleanUser } = user || {};
      const newPayload = { ...cleanUser, linkedDiscordId: null };
      const newSignedToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: '30d' });
      res.cookie('auth_token', newSignedToken, {
        secure: true,
        sameSite: 'none',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        partitioned: true
      });
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Could not unlink Discord" });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const token = req.cookies.auth_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
      (req as any).user = decoded;
      const { checkUserIsGlobalAdmin } = await import("./userResolver.js");
      const isGlobal = await checkUserIsGlobalAdmin(req);
      decoded.isGlobalAdmin = isGlobal;
      try {
        const { db } = await import("../db/index");
        const { users, bankCustomers } = await import("../db/schema");
        const { eq, or } = await import("drizzle-orm");
        const row = await db.select().from(users).where(
          or(eq(users.discordId, decoded.discordId), decoded.mcUuid ? eq(users.mcUuid, decoded.mcUuid) : eq(users.discordId, decoded.discordId))
        ).get();
        let linked = row?.linkedDiscordId || null;
        if (!linked) {
          const cust = await db.select().from(bankCustomers).where(
            or(
              eq(bankCustomers.discordId, decoded.discordId),
              decoded.mcUuid ? eq(bankCustomers.mcUuid, decoded.mcUuid) : eq(bankCustomers.discordId, decoded.discordId),
              decoded.username ? eq(bankCustomers.mcUsername, decoded.username) : eq(bankCustomers.discordId, decoded.discordId)
            )
          ).get();
          if (cust?.linkedDiscordId) {
            linked = cust.linkedDiscordId;
          }
        }
        decoded.linkedDiscordId = linked;
        if (row?.mcUuid) decoded.mcUuid = row.mcUuid;
      } catch {}
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

  app.post('/api/auth/demo-admin-login', async (_req, res) => {
    return res.status(410).json({ error: "Demo admin login is disabled." });
  });

  app.post('/api/citizen/link-discord-manual', requireAuth, async (_req, res) => {
    return res.status(410).json({ error: "Manual Discord linking is disabled. Use OAuth Link Discord." });
  });


}
