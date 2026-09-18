import express from "express";
import { db } from "../db/index.js";
import { bankCustomers, users, accountMembers, bankAccounts, globalAdmins, bankStaff } from "../db/schema.js";
import { eq, or, and, inArray } from "drizzle-orm";

/**
 * UUID / Discord-snowflake variants only. Do not expand on display names —
 * colliding Minecraft usernames must not merge identities across tenants.
 */
function normalizeIdentifier(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const val = String(raw).trim();
  if (!val) return [];

  const results = new Set<string>();
  results.add(val);

  if (val.toLowerCase().startsWith("mc_")) {
    const stripped = val.substring(3).trim();
    if (stripped) {
      results.add(stripped);
      results.add(`mc_${stripped}`);
    }
  } else {
    results.add(`mc_${val}`);
  }

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

export async function getUserCandidateIdentifiers(req: express.Request, bankId?: string): Promise<string[]> {
  const user = (req as any).user;
  if (!user) return [];

  const candidates = new Set<string>();
  const seeds = [user.discordId, user.mcUuid].filter(Boolean);
  for (const s of seeds) {
    normalizeIdentifier(s).forEach(id => candidates.add(id));
  }
  const currentSearchKeys = Array.from(candidates).filter(Boolean);
  if (currentSearchKeys.length === 0) return [];

  try {
    const customerConditions: any[] = [];
    for (const k of currentSearchKeys) {
      customerConditions.push(eq(bankCustomers.discordId, k));
      customerConditions.push(eq(bankCustomers.linkedDiscordId, k));
      customerConditions.push(eq(bankCustomers.mcUuid, k));
    }
    if (bankId) {
      const scoped = customerConditions.map((c) => and(eq(bankCustomers.bankId, bankId), c));
      const matchedCustomers = await db.select().from(bankCustomers).where(or(...scoped));
      for (const c of matchedCustomers) {
        if (c.discordId) normalizeIdentifier(c.discordId).forEach(id => candidates.add(id));
        if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach(id => candidates.add(id));
        if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach(id => candidates.add(id));
      }
    } else {
      const matchedCustomers = await db.select().from(bankCustomers).where(or(...customerConditions));
      for (const c of matchedCustomers) {
        if (c.discordId) normalizeIdentifier(c.discordId).forEach(id => candidates.add(id));
        if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach(id => candidates.add(id));
        if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach(id => candidates.add(id));
      }
    }
  } catch (e) {
    console.error("[userResolver] Error querying bankCustomers:", e);
  }

  try {
    const userConditions: any[] = [];
    for (const k of currentSearchKeys) {
      userConditions.push(eq(users.discordId, k));
      userConditions.push(eq(users.mcUuid, k));
    }
    if (userConditions.length > 0) {
      const matchedUsers = await db.select().from(users).where(or(...userConditions));
      for (const u of matchedUsers) {
        if (u.discordId) normalizeIdentifier(u.discordId).forEach(id => candidates.add(id));
        if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach(id => candidates.add(id));
      }
    }
  } catch (e) {
    console.error("[userResolver] Error querying users table:", e);
  }

  return Array.from(candidates).filter(Boolean);
}

function envAdminIds(): Set<string> {
  const envAdminStrings = [
    process.env.GLOBAL_ADMIN_DISCORD_IDS,
    process.env.GLOBAL_ADMIN_DISCORD_ID,
    process.env.ADMIN_DISCORD_IDS,
    process.env.DISCORD_ADMIN_IDS,
    process.env.ADMIN_IDS,
    process.env.GLOBAL_ADMIN_IDS,
    process.env.DISCORD_BOT_OWNER_ID
  ].filter(Boolean);

  const ids = new Set<string>();
  for (const envStr of envAdminStrings) {
    if (envStr) {
      envStr.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).forEach(id => {
        normalizeIdentifier(id).forEach(normalized => ids.add(normalized));
      });
    }
  }
  return ids;
}

export async function checkUserIsGlobalAdmin(req: express.Request): Promise<boolean> {
  const user = (req as any).user;
  if (!user) return false;

  const candidateIds = await getUserCandidateIdentifiers(req);
  if (candidateIds.length === 0) {
    if (user.discordId) candidateIds.push(String(user.discordId));
  }

  const envIds = envAdminIds();
  for (const candidate of candidateIds) {
    if (envIds.has(candidate)) return true;
  }

  try {
    if (candidateIds.length > 0) {
      const admin = await db.select().from(globalAdmins).where(
        inArray(globalAdmins.discordId, candidateIds)
      ).get();
      if (admin) return true;
    }
  } catch (e) {
    console.error("Error in checkUserIsGlobalAdmin:", e);
  }
  return false;
}

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

export async function isUserAccountOwnerOrMember(account: any, candidateIds: string[]): Promise<boolean> {
  if (!account || !candidateIds || candidateIds.length === 0) return false;

  if (account.ownerDiscordId) {
    const normalizedOwner = normalizeIdentifier(account.ownerDiscordId);
    if (candidateIds.some(c => normalizedOwner.includes(c) || c === account.ownerDiscordId)) {
      return true;
    }
  }

  try {
    const membership = await db.select()
      .from(accountMembers)
      .where(and(eq(accountMembers.accountId, account.id), inArray(accountMembers.discordId, candidateIds)))
      .get();
    if (membership) return true;
  } catch (e) {}

  return false;
}
