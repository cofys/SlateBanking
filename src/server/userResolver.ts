import express from "express";
import { db } from "../db/index.js";
import { bankCustomers, users, accountMembers, bankAccounts, globalAdmins, bankStaff } from "../db/schema.js";
import { eq, or, and, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * Normalizes an identity string into all possible candidate representations:
 * - UUID variations: raw, dashed, undashed, with and without 'mc_' prefix
 * - Username variations: raw, lowercase, uppercase, with and without '@' or 'mc_' prefix
 * - Discord ID variations: raw, 'mc_' prefixed
 */
function normalizeIdentifier(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const val = String(raw).trim();
  if (!val) return [];

  const results = new Set<string>();
  results.add(val);

  // Strip 'mc_' prefix if present
  if (val.toLowerCase().startsWith("mc_")) {
    const stripped = val.substring(3).trim();
    if (stripped) {
      results.add(stripped);
      normalizeIdentifier(stripped).forEach(s => results.add(s));
    }
  } else {
    results.add(`mc_${val}`);
  }

  // Strip '@' prefix if present
  if (val.startsWith("@")) {
    const stripped = val.substring(1).trim();
    if (stripped) {
      results.add(stripped);
      results.add(`@${stripped}`);
      results.add(stripped.toLowerCase());
      results.add(`@${stripped.toLowerCase()}`);
    }
  } else if (!val.toLowerCase().startsWith("mc_")) {
    results.add(`@${val}`);
    results.add(val.toLowerCase());
    results.add(`@${val.toLowerCase()}`);
  }

  // Check if val is a UUID (either with or without dashes)
  const cleanHex = val.replace(/-/g, '').replace(/^mc_/i, '').trim();
  if (/^[0-9a-fA-F]{32}$/.test(cleanHex)) {
    const lowerClean = cleanHex.toLowerCase();
    const dashed = `${lowerClean.slice(0, 8)}-${lowerClean.slice(8, 12)}-${lowerClean.slice(12, 16)}-${lowerClean.slice(16, 20)}-${lowerClean.slice(20)}`;
    results.add(lowerClean);
    results.add(dashed);
    results.add(`mc_${lowerClean}`);
    results.add(`mc_${dashed}`);
  }

  return Array.from(results);
}

/**
 * Resolves all candidate identity strings for the currently authenticated user in a request.
 * Resolves discordId, username, stripped mc_ prefix, linked Discord IDs, MC usernames, and MC UUIDs
 * transitively across all bank customers and global users.
 */
export async function getUserCandidateIdentifiers(req: express.Request, bankId?: string): Promise<string[]> {
  const user = (req as any).user;
  if (!user) return [];

  const candidates = new Set<string>();

  // 1. Initial seeds from user session
  const seeds = [
    user.discordId,
    user.username,
    user.mcUuid,
    user.id,
    (user as any).sub
  ];

  for (const s of seeds) {
    if (s) {
      normalizeIdentifier(s).forEach(id => candidates.add(id));
    }
  }

  // 2. Transitive closure across bankCustomers and users tables (up to 3 expansion passes)
  let previousSize = 0;
  for (let pass = 0; pass < 3; pass++) {
    if (candidates.size === previousSize) break;
    previousSize = candidates.size;

    const currentSearchKeys = Array.from(candidates).filter(Boolean);
    if (currentSearchKeys.length === 0) break;

    // Search bankCustomers table across ALL banks to link identities
    try {
      const customerConditions: any[] = [];
      // Chunk currentSearchKeys if necessary
      for (const k of currentSearchKeys) {
        customerConditions.push(eq(bankCustomers.discordId, k));
        customerConditions.push(eq(bankCustomers.linkedDiscordId, k));
        customerConditions.push(eq(bankCustomers.mcUsername, k));
        customerConditions.push(eq(bankCustomers.mcUuid, k));
      }

      if (customerConditions.length > 0) {
        const matchedCustomers = await db.select().from(bankCustomers).where(or(...customerConditions));
        for (const c of matchedCustomers) {
          if (c.discordId) normalizeIdentifier(c.discordId).forEach(id => candidates.add(id));
          if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach(id => candidates.add(id));
          if (c.mcUsername) normalizeIdentifier(c.mcUsername).forEach(id => candidates.add(id));
          if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach(id => candidates.add(id));
        }
      }
    } catch (e) {
      console.error("[userResolver] Error querying bankCustomers:", e);
    }

    // Search global users table
    try {
      const userConditions: any[] = [];
      for (const k of currentSearchKeys) {
        userConditions.push(eq(users.discordId, k));
        userConditions.push(eq(users.mcUsername, k));
        userConditions.push(eq(users.mcUuid, k));
      }

      if (userConditions.length > 0) {
        const matchedUsers = await db.select().from(users).where(or(...userConditions));
        for (const u of matchedUsers) {
          if (u.discordId) normalizeIdentifier(u.discordId).forEach(id => candidates.add(id));
          if (u.mcUsername) normalizeIdentifier(u.mcUsername).forEach(id => candidates.add(id));
          if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach(id => candidates.add(id));
        }
      }
    } catch (e) {
      console.error("[userResolver] Error querying users table:", e);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

/**
 * Checks if the user is a registered Global Admin across all candidate identity keys.
 * Checks environment variables (e.g. GLOBAL_ADMIN_DISCORD_IDS, ADMIN_DISCORD_IDS, DISCORD_ADMIN_IDS),
 * database table global_admins, JWT payload isGlobalAdmin, and auto-seeds the first authenticated user.
 */
export async function checkUserIsGlobalAdmin(req: express.Request): Promise<boolean> {
  const user = (req as any).user;
  if (!user) return false;

  // 1. Direct JWT token assertion check
  if (user.isGlobalAdmin === true) {
    return true;
  }

  const candidateIds = await getUserCandidateIdentifiers(req);
  if (candidateIds.length === 0) {
    if (user.discordId) candidateIds.push(String(user.discordId));
    if (user.username) candidateIds.push(String(user.username));
  }

  // 2. Check environment variable admin IDs
  const envAdminStrings = [
    process.env.GLOBAL_ADMIN_DISCORD_IDS,
    process.env.ADMIN_DISCORD_IDS,
    process.env.DISCORD_ADMIN_IDS,
    process.env.ADMIN_IDS,
    process.env.GLOBAL_ADMIN_IDS,
    process.env.DISCORD_BOT_OWNER_ID
  ].filter(Boolean);

  const envAdminIds = new Set<string>();
  for (const envStr of envAdminStrings) {
    if (envStr) {
      envStr.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).forEach(id => {
        normalizeIdentifier(id).forEach(normalized => envAdminIds.add(normalized));
      });
    }
  }

  for (const candidate of candidateIds) {
    if (envAdminIds.has(candidate)) {
      return true;
    }
  }

  // 3. Check database global_admins table
  try {
    const admin = await db.select().from(globalAdmins).where(
      inArray(globalAdmins.discordId, candidateIds)
    ).get();

    if (admin) return true;

    // Check if table is empty, auto-seed the first user
    const allAdmins = await db.select().from(globalAdmins).all();
    if (allAdmins.length === 0 && (user.discordId || user.username)) {
      const primaryId = user.discordId ? String(user.discordId) : String(user.username);
      await db.insert(globalAdmins).values({
        id: uuidv4(),
        discordId: primaryId,
        addedBy: "System (First User Auto-Elevate)",
        createdAt: new Date()
      });
      return true;
    }
  } catch (e) {
    console.error("Error in checkUserIsGlobalAdmin:", e);
  }
  return false;
}

/**
 * Checks if the user is authorized as staff for a specific bank or is a Global Admin.
 */
export async function isUserStaffOrGlobalAdmin(req: express.Request, bankId: string): Promise<{ isStaff: boolean; role?: string }> {
  const user = (req as any).user;
  if (!user) return { isStaff: false };

  const isGlobal = await checkUserIsGlobalAdmin(req);
  if (isGlobal) {
    user.isGlobalAdmin = true;
    return { isStaff: true, role: 'owner' };
  }

  const candidateIds = await getUserCandidateIdentifiers(req, bankId);
  if (candidateIds.length === 0) return { isStaff: false };

  try {
    const staff = await db.select().from(bankStaff)
      .where(and(
        eq(bankStaff.bankId, bankId),
        inArray(bankStaff.discordId, candidateIds)
      ))
      .get();

    if (staff) {
      return { isStaff: true, role: staff.role };
    }
  } catch (e) {
    console.error("Error in isUserStaffOrGlobalAdmin:", e);
  }

  return { isStaff: false };
}

/**
 * Checks if an account belongs to the user or if user is a member of the account.
 */
export async function isUserAccountOwnerOrMember(account: any, candidateIds: string[]): Promise<boolean> {
  if (!account || !candidateIds || candidateIds.length === 0) return false;

  // Direct ownership check across all normalized candidate IDs
  if (account.ownerDiscordId) {
    const normalizedOwner = normalizeIdentifier(account.ownerDiscordId);
    if (candidateIds.some(c => normalizedOwner.includes(c) || c === account.ownerDiscordId)) {
      return true;
    }
  }

  // Check accountMembers table
  try {
    const membership = await db.select()
      .from(accountMembers)
      .where(and(eq(accountMembers.accountId, account.id), inArray(accountMembers.discordId, candidateIds)))
      .get();
    if (membership) return true;
  } catch (e) {}

  return false;
}

