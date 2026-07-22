import express from "express";
import jwt from "jsonwebtoken";

export const JWT_SECRET = process.env.JWT_SECRET as string;

export const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    if (decoded.isGlobalAdmin) {
        const { db } = await import("../db/index.js");
        const { globalAdmins } = await import("../db/schema.js");
        const { eq } = await import("drizzle-orm");
        const stillAdmin = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, decoded.discordId)).get();
        if (!stillAdmin) {
            decoded.isGlobalAdmin = false;
        }
    }
    (req as any).user = decoded;
    next();
  } catch(e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireGlobalAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    const { db } = await import("../db/index.js");
    const { globalAdmins } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const admin = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, decoded.discordId)).get();
    if (!admin) return res.status(403).json({ error: "Forbidden - Not a Global Admin" });
    decoded.isGlobalAdmin = true;
    (req as any).user = decoded;
    next();
  } catch(e) {
    res.status(401).json({ error: "Invalid token" });
  }
};

export const requireBankStaff = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded: any = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    const { db } = await import("../db/index.js");
    const { bankStaff, globalAdmins } = await import("../db/schema.js");
    const { eq, and } = await import("drizzle-orm");
    if (decoded.isGlobalAdmin) {
        const stillAdmin = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, decoded.discordId)).get();
        if (stillAdmin) return next();
    }
    const bankId = req.params.bankId || req.params.id;
    if (!bankId) return res.status(400).json({ error: "Bank ID missing" });
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

export const requireRole = (allowedRoles: string[]) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

export const authenticateApiRequest = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
     return res.status(401).json({ error: "Missing or invalid authorization header. Expected Bearer token." });
  }
  const token = authHeader.split(" ")[1];
  const { db } = await import("../db/index.js");
  const { banks } = await import("../db/schema.js");
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

export const getRedirectUri = async (req: express.Request, callbackPath: string = "/api/auth/discord/callback") => {
  const { db } = await import("../db/index.js");
  const { banks } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  let bankId = undefined;
  if (req.query.bankId) {
     bankId = req.query.bankId;
  } else if (req.query.state) {
     try {
         const stateObj = JSON.parse(decodeURIComponent(req.query.state as string));
         bankId = stateObj.bankId;
     } catch(e) {}
  }
  if (bankId) {
      const bank = await db.select().from(banks).where(eq(banks.id, bankId as string)).get();
      if (bank && bank.customDomain) {
           return `https://${bank.customDomain}${callbackPath}`;
      }
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
