import express from "express";
import { db } from "../db/index.js";
import { bankCustomers, users, accountMembers, bankAccounts, globalAdmins, bankStaff } from "../db/schema.js";
import { eq, or, and, inArray } from "drizzle-orm";

/**
 * UUID / Discord-snowflake variants only. Do not expand on display names —
 * colliding Minecraft usernames must not merge identities across tenants.
 * Discord snowflakes must not get an `mc_` prefix.
 */
export function normalizeIdentifier(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const val = String(raw).trim();
  if (!val) return [];

  const results = new Set<string>();
  results.add(val);

  if (/^\d{17,20}$/.test(val)) {
    return Array.from(results);
  }

  if (val.toLowerCase().startsWith("mc_")) {
    const stripped = val.substring(3).trim();
    if (stripped) {
      results.add(stripped);
      results.add(`mc_${stripped}`);
    }
  } else if (/^[0-9a-fA-F-]{32,36}$/.test(val.replace(/^mc_/i, ""))) {
    results.add(`mc_${val}`);
  }

  const cleanHex = val.replace(/-/g, "").replace(/^mc_/i, "").trim();
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
  const seeds = [user.discordId, user.mcUuid, user.linkedDiscordId].filter(Boolean);
  for (const s of seeds) {
    normalizeIdentifier(s).forEach((id) => candidates.add(id));
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
        if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
        if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach((id) => candidates.add(id));
        if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
      }
    } else {
      const matchedCustomers = await db.select().from(bankCustomers).where(or(...customerConditions));
      for (const c of matchedCustomers) {
        if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
        if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach((id) => candidates.add(id));
        if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
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
      userConditions.push(eq(users.linkedDiscordId, k));
    }
    if (userConditions.length > 0) {
      const matchedUsers = await db.select().from(users).where(or(...userConditions));
      for (const u of matchedUsers) {
        if (u.discordId) normalizeIdentifier(u.discordId).forEach((id) => candidates.add(id));
        if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach((id) => candidates.add(id));
        if ((u as any).linkedDiscordId) normalizeIdentifier((u as any).linkedDiscordId).forEach((id) => candidates.add(id));
      }
    }
  } catch (e) {
    console.error("[userResolver] Error querying users table:", e);
  }

  return Array.from(candidates).filter(Boolean);
}

/** Discord bot users must have linked Discord in the portal. Empty = not linked. */
export async function getCandidateIdsForDiscordSnowflake(snowflake: string): Promise<string[]> {
  if (!snowflake) return [];
  try {
    const userRows = await db.select().from(users).where(
      or(eq(users.discordId, snowflake), eq(users.linkedDiscordId, snowflake))
    );
    const custRows = await db.select().from(bankCustomers).where(
      or(eq(bankCustomers.discordId, snowflake), eq(bankCustomers.linkedDiscordId, snowflake))
    );
    if (userRows.length === 0 && custRows.length === 0) return [];

    const candidates = new Set<string>();
    candidates.add(snowflake);
    for (const u of userRows) {
      if (u.discordId) normalizeIdentifier(u.discordId).forEach((id) => candidates.add(id));
      if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach((id) => candidates.add(id));
      if ((u as any).linkedDiscordId) candidates.add((u as any).linkedDiscordId);
    }
    for (const c of custRows) {
      if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
      if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
      if (c.linkedDiscordId) candidates.add(c.linkedDiscordId);
    }
    return Array.from(candidates);
  } catch (e) {
    console.error("[userResolver] snowflake lookup failed:", e);
    return [];
  }
}

function envAdminIds(): Set<string> {
  const envAdminStrings = [
    process.env.GLOBAL_ADMIN_DISCORD_IDS,
    process.env.GLOBAL_ADMIN_DISCORD_ID,
    process.env.ADMIN_DISCORD_IDS,
    process.env.DISCORD_ADMIN_IDS,
    process.env.ADMIN_IDS,
    process.env.GLOBAL_ADMIN_IDS,
    process.env.DISCORD_BOT_OWNER_ID,
    process.env.GLOBAL_ADMIN_MC_USERNAMES,
  ].filter(Boolean);

  const ids = new Set<string>();
  for (const envStr of envAdminStrings) {
    if (envStr) {
      envStr.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).forEach((id) => {
        normalizeIdentifier(id).forEach((normalized) => ids.add(normalized));
        const name = id.replace(/^@/, "").toLowerCase();
        if (name) ids.add(name);
      });
    }
  }
  // Hard-coded platform operator (CityCorp / Minecraft username Cofys).
  ["cofys", "24e375154a2d4c60a6033c41320a6f03", "24e37515-4a2d-4c60-a603-3c41320a6f03"].forEach((id) => {
    normalizeIdentifier(id).forEach((n) => ids.add(n));
    ids.add(id.toLowerCase());
  });
  return ids;
}

function sessionUsernames(user: any): string[] {
  const names = new Set<string>();
  for (const raw of [user?.username, user?.mcUsername]) {
    if (!raw) continue;
    const n = String(raw).trim().replace(/^@/, "").toLowerCase();
    if (n) names.add(n);
  }
  return Array.from(names);
}

export async function checkUserIsGlobalAdmin(req: express.Request): Promise<boolean> {
  const user = (req as any).user;
  if (!user) return false;

  const candidateIds = await getUserCandidateIdentifiers(req);
  if (user.discordId) normalizeIdentifier(user.discordId).forEach((id) => {
    if (!candidateIds.includes(id)) candidateIds.push(id);
  });
  if (user.mcUuid) normalizeIdentifier(user.mcUuid).forEach((id) => {
    if (!candidateIds.includes(id)) candidateIds.push(id);
  });

  const names = sessionUsernames(user);
  try {
    const keys = [user.discordId, user.mcUuid].filter(Boolean);
    if (keys.length) {
      const rows = await db.select().from(users).where(
        or(inArray(users.discordId, keys as string[]), inArray(users.mcUuid, keys as string[]))
      );
      for (const row of rows) {
        if (row.mcUsername) names.push(String(row.mcUsername).trim().replace(/^@/, "").toLowerCase());
      }
    }
  } catch {}

  const envIds = envAdminIds();
  for (const candidate of candidateIds) {
    if (envIds.has(candidate) || envIds.has(String(candidate).toLowerCase())) return true;
  }
  for (const name of names) {
    if (envIds.has(name)) return true;
  }

  try {
    const lookup = [...candidateIds, ...names].filter(Boolean);
    if (lookup.length > 0) {
      const admin = await db.select().from(globalAdmins).where(
        inArray(globalAdmins.discordId, lookup)
      ).get();
      if (admin) return true;
      const allAdmins = await db.select({ discordId: globalAdmins.discordId }).from(globalAdmins);
      const lowered = new Set(lookup.map((x) => String(x).toLowerCase()));
      if (allAdmins.some((a) => lowered.has(String(a.discordId || "").toLowerCase()))) return true;
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
    return { isStaff: true, role: "owner" };
  }

  const candidateIds = await getUserCandidateIdentifiers(req, bankId);
  const uname = sessionUsernames(user);
  for (const n of uname) {
    if (!candidateIds.includes(n)) candidateIds.push(n);
    const raw = String(user.username || "").trim();
    if (raw && !candidateIds.includes(raw)) candidateIds.push(raw);
  }
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

    if (uname.length) {
      const allStaff = await db.select().from(bankStaff).where(eq(bankStaff.bankId, bankId));
      const lowered = new Set(uname);
      const hit = allStaff.find((s) => lowered.has(String(s.discordId || "").trim().replace(/^@/, "").toLowerCase()));
      if (hit) return { isStaff: true, role: hit.role };
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
    if (candidateIds.some((c) => normalizedOwner.includes(c) || c === account.ownerDiscordId)) {
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

export async function requireOwnedAccount(req: express.Request, account: any, managerOnly = false): Promise<boolean> {
  const candidateIds = await getUserCandidateIdentifiers(req);
  if (!account || candidateIds.length === 0) return false;
  if (account.ownerDiscordId) {
    const normalizedOwner = normalizeIdentifier(account.ownerDiscordId);
    if (candidateIds.some((c) => normalizedOwner.includes(c) || c === account.ownerDiscordId)) return true;
  }
  try {
    const membership = await db.select()
      .from(accountMembers)
      .where(and(eq(accountMembers.accountId, account.id), inArray(accountMembers.discordId, candidateIds)))
      .get();
    if (!membership) return false;
    if (managerOnly) return membership.role === "manager";
    return true;
  } catch {
    return false;
  }
}

export async function requireAccountOwner(req: express.Request, account: any): Promise<boolean> {
  const candidateIds = await getUserCandidateIdentifiers(req);
  if (!account || candidateIds.length === 0 || !account.ownerDiscordId) return false;
  const normalizedOwner = normalizeIdentifier(account.ownerDiscordId);
  return candidateIds.some((c) => normalizedOwner.includes(c) || c === account.ownerDiscordId);
}
