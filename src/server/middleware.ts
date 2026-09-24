import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { checkUserIsGlobalAdmin, isUserStaffOrGlobalAdmin } from "./userResolver.js";

export const JWT_SECRET = process.env.JWT_SECRET || "slate-dev-jwt-secret-key-32charsminimum";

export function clientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // With trust proxy = 1, req.ip is the resolved client. Prefer it.
    return (req.ip || forwarded.split(',')[0].trim() || 'unknown');
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function sanitizeReturnTo(raw: any): string {
  if (typeof raw !== 'string' || !raw) return '/portal';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('\n') || raw.includes('\r') || raw.includes("'") || raw.includes('"') || raw.includes('<')) {
    return '/portal';
  }
  if (!/^\/[A-Za-z0-9/_?&=#.\-]*$/.test(raw)) return '/portal';
  return raw;
}

export function isAllowedWebhookUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'discord.com' || host === 'discordapp.com' || host.endsWith('.discord.com') || host.endsWith('.discordapp.com');
  } catch {
    return false;
  }
}

export function extractAuthToken(req: express.Request): string | null {
  if (req.cookies?.auth_token) return req.cookies.auth_token;
  const header = req.headers?.authorization;
  if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    (req as any).user = decoded;
    const isGlobal = await checkUserIsGlobalAdmin(req);
    (req as any).user.isGlobalAdmin = isGlobal;
    next();
  } catch(e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireGlobalAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    (req as any).user = decoded;
    const isGlobal = await checkUserIsGlobalAdmin(req);
    if (!isGlobal) {
      return res.status(403).json({ error: "Forbidden - Not a Global Admin" });
    }
    (req as any).user.isGlobalAdmin = true;
    next();
  } catch(e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireBankStaff = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = extractAuthToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    (req as any).user = decoded;
    const bankId = req.params.bankId || req.params.id;
    if (!bankId) return res.status(400).json({ error: "Bank ID missing" });

    const { isStaff, role } = await isUserStaffOrGlobalAdmin(req, bankId);
    if (!isStaff) {
      return res.status(403).json({ error: "Forbidden - Not bank staff" });
    }
    (req as any).staffRole = role || 'owner';
    next();
  } catch(e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const isGlobal = await checkUserIsGlobalAdmin(req);
    (req as any).user.isGlobalAdmin = isGlobal;
    if (isGlobal) return next();
    const role = (req as any).staffRole;
    if (!role) return res.status(403).json({ error: "Forbidden - No role assigned" });
    if (role === 'owner' || allowedRoles.includes(role)) {
       return next();
    }
    return res.status(403).json({ error: `Forbidden - Requires one of roles: ${allowedRoles.join(', ')}` });
  };
};

export const authenticateApiRequest = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
     return res.status(401).json({ error: "Missing or invalid authorization header. Expected Bearer token." });
  }
  const token = authHeader.split(" ")[1];
  const { db } = await import("../db/index.js");
  const { banks } = await import("../db/schema.js");
  try {
    const { verifyPresentedKey, hashApiKey, last4OfKey } = await import("../lib/api_keys.js");
    const { bankIsSuspended } = await import("../lib/tenant_guard.js");
    const { or, eq, isNull } = await import("drizzle-orm");
    const tokenLast4 = last4OfKey(token);
    const candidates = await db.select().from(banks).where(
      tokenLast4 ? or(eq(banks.apiKeyLast4, tokenLast4), isNull(banks.apiKeyLast4)) : undefined
    );
    const bank = candidates.find((b) => {
      const result = verifyPresentedKey({
        presented: token,
        storedHash: (b as any).apiKeyHash,
        storedEncrypted: b.apiKey,
      });
      return result.ok;
    });
    if (!bank) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    const verified = verifyPresentedKey({
      presented: token,
      storedHash: (bank as any).apiKeyHash,
      storedEncrypted: bank.apiKey,
    });
    if (verified.needsBackfill) {
      await db.update(banks).set({
        apiKeyHash: hashApiKey(token),
        apiKeyLast4: last4OfKey(token),
      } as any).where((await import("drizzle-orm")).eq(banks.id, bank.id));
    }
    if (bankIsSuspended(bank)) {
      return res.status(403).json({ error: "This bank is suspended. API access is frozen." });
    }
    (req as any).bank = bank;
    next();
  } catch (e) {
     console.error(e);
     res.status(500).json({ error: "Internal error checking API key" });
  }
};

function hostAllowedForRedirect(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase().split(':')[0];
  return allowed.some((a) => {
    try {
      const ah = new URL(a.startsWith('http') ? a : `https://${a}`).hostname.toLowerCase();
      return h === ah;
    } catch {
      return h === a.toLowerCase().split('/')[0].split(':')[0];
    }
  });
}

export const getRedirectUri = async (req: express.Request, callbackPath: string = "/api/auth/discord/callback") => {
  const { db } = await import("../db/index.js");
  const { banks } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");

  let bankId: string | undefined = req.query.bankId as string | undefined;
  if (!bankId && req.query.state) {
     try {
         const stateObj = JSON.parse(decodeURIComponent(req.query.state as string));
         bankId = stateObj.bankId;
     } catch(e) {}
  }

  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');

  let bank = null;
  if (bankId) {
    try {
      bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
    } catch (e) {}
  } else if (host && host !== 'localhost' && host !== 'localhost:3000' && !host.includes('127.0.0.1')) {
    try {
      const cleanHost = host.split(':')[0].toLowerCase();
      const all = await db.select().from(banks);
      bank = all.find((b) => {
        if (!b.customDomain) return false;
        try {
          const d = b.customDomain.trim().toLowerCase();
          const dh = d.startsWith('http') ? new URL(d).hostname : d.split('/')[0].split(':')[0];
          return dh === cleanHost;
        } catch { return false; }
      }) || null;
    } catch (e) {}
  }

  const isHostCustomDomain = bank?.customDomain && host && (
    host.toLowerCase() === bank.customDomain.trim().toLowerCase() ||
    host.toLowerCase().includes(bank.customDomain.trim().toLowerCase())
  );

  if (isHostCustomDomain && bank?.customDomain) {
    let domain = bank.customDomain.trim();
    if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
      domain = `${proto}://${domain}`;
    }
    if (domain.endsWith("/")) domain = domain.slice(0, -1);
    return `${domain}${callbackPath}`;
  }

  if (host) {
    return `${proto}://${host}${callbackPath}`;
  }

  if (callbackPath.includes("citycorp") && process.env.CITYRP_REDIRECT_URI) {
    return process.env.CITYRP_REDIRECT_URI;
  }

  let origin = process.env.APP_URL || "http://localhost:3000";
  if (origin.endsWith('/')) origin = origin.slice(0, -1);
  return `${origin}${callbackPath}`;
};

export const sendWebhook = async (bankId: string, message: string) => {
  try {
    const { db } = await import("../db/index.js");
    const { bankSettings } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId));
    if (settings.length > 0 && settings[0].discordWebhookUrl) {
      const url = settings[0].discordWebhookUrl;
      if (!isAllowedWebhookUrl(url)) {
        console.warn("[webhook] blocked non-Discord URL for bank", bankId);
        return;
      }
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message })
      }).catch(err => console.error("Webhook firing failed", err));
    }
  } catch (e) {
    console.error(e);
  }
};


export const securityFirewall = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const ipStr = clientIp(req);
    const { db } = await import("../db/index.js");
    const { bannedIps } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    if (ipStr !== 'unknown') {
      const banned = await db.select().from(bannedIps).where(eq(bannedIps.ipAddress, ipStr)).get();
      
      if (banned) {
        if (banned.expiresAt && new Date() > banned.expiresAt) {
          await db.delete(bannedIps).where(eq(bannedIps.ipAddress, ipStr));
        } else {
          return res.status(403).json({ error: "Access Denied: Your IP address has been banned by the platform administrator.", reason: banned.reason });
        }
      }
    }
  } catch (e) {
    console.error("Firewall error:", e);
  }
  next();
};

export const logSecurityEvent = async (ip: string, action: string, status: string, discordId: string | null = null, details: string | null = null) => {
  try {
    const { db } = await import("../db/index.js");
    const { securityAuditLogs } = await import("../db/schema.js");
    const { v4: uuidv4 } = await import("uuid");
    const ipStr = typeof ip === 'string' ? ip.split(',')[0].trim() : String(ip);

    await db.insert(securityAuditLogs).values({
      id: uuidv4(),
      ipAddress: ipStr,
      action,
      status,
      discordId,
      details,
      timestamp: new Date()
    });
  } catch (e) {
    console.error("Failed to log security event:", e);
  }
};

