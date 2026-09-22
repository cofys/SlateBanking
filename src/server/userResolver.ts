import express from "express";
import { db } from "../db/index.js";
import { bankCustomers, users, accountMembers, bankAccounts, globalAdmins, bankStaff, banks } from "../db/schema.js";
import { eq, or, and, inArray, sql, isNull, ne } from "drizzle-orm";

/**
 * Normalizes an identifier (Discord snowflake, Minecraft UUID, or Minecraft username)
 * into all standard variations so that queries match across different storage styles.
 */
export function normalizeIdentifier(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const val = String(raw).trim();
  if (!val) return [];

  const results = new Set<string>();
  results.add(val);
  results.add(val.toLowerCase());

  // Pure Discord snowflake (17-20 digits)
  if (/^\d{17,20}$/.test(val)) {
    return Array.from(results);
  }

  // Minecraft username or prefix
  if (val.toLowerCase().startsWith("mc_")) {
    const stripped = val.substring(3).trim();
    if (stripped) {
      results.add(stripped);
      results.add(stripped.toLowerCase());
      results.add(`mc_${stripped}`);
      results.add(`mc_${stripped.toLowerCase()}`);
    }
  } else {
    results.add(`mc_${val}`);
    results.add(`mc_${val.toLowerCase()}`);
  }

  // 32-36 character UUID with or without hyphens
  const cleanHex = val.replace(/-/g, "").replace(/^mc_/i, "").trim();
  if (/^[0-9a-fA-F]{32}$/.test(cleanHex)) {
    const lowerClean = cleanHex.toLowerCase();
    const dashed = `${lowerClean.slice(0, 8)}-${lowerClean.slice(8, 12)}-${lowerClean.slice(12, 16)}-${lowerClean.slice(16, 20)}-${lowerClean.slice(20)}`;
    results.add(lowerClean);
    results.add(dashed);
    results.add(lowerClean.toUpperCase());
    results.add(dashed.toUpperCase());
    results.add(`mc_${lowerClean}`);
    results.add(`mc_${dashed}`);
  }

  return Array.from(results);
}

export async function getUserCandidateIdentifiers(req: express.Request, bankId?: string): Promise<string[]> {
  const user = (req as any).user;
  if (!user) return [];

  const candidates = new Set<string>();
  const seeds = [user.discordId, user.mcUuid, user.linkedDiscordId, user.username, user.mcUsername].filter(Boolean);
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
      customerConditions.push(eq(bankCustomers.mcUsername, k));
    }
    if (bankId) {
      const scoped = customerConditions.map((c) => and(eq(bankCustomers.bankId, bankId), c));
      const matchedCustomers = await db.select().from(bankCustomers).where(or(...scoped));
      for (const c of matchedCustomers) {
        if (c.id) candidates.add(c.id);
        if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
        if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach((id) => candidates.add(id));
        if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
        if (c.mcUsername) normalizeIdentifier(c.mcUsername).forEach((id) => candidates.add(id));
      }
    } else {
      const matchedCustomers = await db.select().from(bankCustomers).where(or(...customerConditions));
      for (const c of matchedCustomers) {
        if (c.id) candidates.add(c.id);
        if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
        if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach((id) => candidates.add(id));
        if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
        if (c.mcUsername) normalizeIdentifier(c.mcUsername).forEach((id) => candidates.add(id));
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
      userConditions.push(eq(users.mcUsername, k));
    }
    if (userConditions.length > 0) {
      const matchedUsers = await db.select().from(users).where(or(...userConditions));
      for (const u of matchedUsers) {
        if (u.id) candidates.add(u.id);
        if (u.discordId) normalizeIdentifier(u.discordId).forEach((id) => candidates.add(id));
        if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach((id) => candidates.add(id));
        if ((u as any).linkedDiscordId) normalizeIdentifier((u as any).linkedDiscordId).forEach((id) => candidates.add(id));
        if (u.mcUsername) normalizeIdentifier(u.mcUsername).forEach((id) => candidates.add(id));
      }
    }
  } catch (e) {
    console.error("[userResolver] Error querying users table:", e);
  }

  return Array.from(candidates).filter(Boolean);
}

/** Discord bot users must have linked Discord in the portal, or have active records/accounts. Empty = not linked. */
export async function getCandidateIdsForDiscordSnowflake(snowflake: string, bankId?: string): Promise<string[]> {
  if (!snowflake) return [];
  try {
    const candidates = new Set<string>();
    candidates.add(snowflake);
    normalizeIdentifier(snowflake).forEach((id) => candidates.add(id));

    // 1. Initial direct lookup in users and bankCustomers
    const userRows = await db.select().from(users).where(
      or(eq(users.discordId, snowflake), eq(users.linkedDiscordId, snowflake))
    );
    const custRows = await db.select().from(bankCustomers).where(
      or(eq(bankCustomers.discordId, snowflake), eq(bankCustomers.linkedDiscordId, snowflake))
    );

    // Also check direct bank accounts owned by the snowflake
    const directAccounts = await db.select({ ownerDiscordId: bankAccounts.ownerDiscordId })
      .from(bankAccounts)
      .where(eq(bankAccounts.ownerDiscordId, snowflake))
      .limit(5);

    // If completely empty across all 3, return []
    if (userRows.length === 0 && custRows.length === 0 && directAccounts.length === 0) {
      // Check hardcoded operators/admins or globalAdmins table
      const adminMatch = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, snowflake)).get();
      if (!adminMatch && !envAdminIds().has(snowflake)) {
        return [];
      }
    }

    // Collect seeds from user rows
    for (const u of userRows) {
      if (u.id) candidates.add(u.id);
      if (u.discordId) normalizeIdentifier(u.discordId).forEach((id) => candidates.add(id));
      if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach((id) => candidates.add(id));
      if ((u as any).linkedDiscordId) normalizeIdentifier((u as any).linkedDiscordId).forEach((id) => candidates.add(id));
      if (u.mcUsername) {
        normalizeIdentifier(u.mcUsername).forEach((id) => candidates.add(id));
        candidates.add(u.mcUsername);
        candidates.add(u.mcUsername.toLowerCase());
      }
    }

    // Collect seeds from customer rows
    for (const c of custRows) {
      if (c.id) candidates.add(c.id);
      if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
      if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
      if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach((id) => candidates.add(id));
      if (c.mcUsername) {
        normalizeIdentifier(c.mcUsername).forEach((id) => candidates.add(id));
        candidates.add(c.mcUsername);
        candidates.add(c.mcUsername.toLowerCase());
      }
      if (c.rpName) {
        candidates.add(c.rpName);
        candidates.add(c.rpName.toLowerCase());
      }
    }

    // 2. Transitive expansion: Search users and bankCustomers by discovered keys
    const searchKeys = Array.from(candidates).filter(Boolean);
    if (searchKeys.length > 0) {
      // Secondary lookup in users
      try {
        const secondaryUsers = await db.select().from(users).where(
          or(
            inArray(users.discordId, searchKeys),
            inArray(users.mcUuid, searchKeys),
            inArray(users.mcUsername, searchKeys)
          )
        );
        for (const u of secondaryUsers) {
          if (u.id) candidates.add(u.id);
          if (u.discordId) normalizeIdentifier(u.discordId).forEach((id) => candidates.add(id));
          if (u.mcUuid) normalizeIdentifier(u.mcUuid).forEach((id) => candidates.add(id));
          if ((u as any).linkedDiscordId) normalizeIdentifier((u as any).linkedDiscordId).forEach((id) => candidates.add(id));
          if (u.mcUsername) {
            normalizeIdentifier(u.mcUsername).forEach((id) => candidates.add(id));
            candidates.add(u.mcUsername);
            candidates.add(u.mcUsername.toLowerCase());
          }
          // Self-heal: ensure user row has linkedDiscordId set
          if (!(u as any).linkedDiscordId && snowflake) {
            await db.update(users).set({ linkedDiscordId: snowflake } as any).where(eq(users.id, u.id)).catch(() => {});
          }
        }
      } catch (e) {}

      // Secondary lookup in bankCustomers (scoped to bankId if provided, or across all banks)
      try {
        const custConditions = [
          inArray(bankCustomers.discordId, searchKeys),
          inArray(bankCustomers.mcUuid, searchKeys),
          inArray(bankCustomers.mcUsername, searchKeys)
        ];
        const secondaryCust = await db.select().from(bankCustomers).where(
          bankId ? and(eq(bankCustomers.bankId, bankId), or(...custConditions)) : or(...custConditions)
        );
        for (const c of secondaryCust) {
          if (c.id) candidates.add(c.id);
          if (c.discordId) normalizeIdentifier(c.discordId).forEach((id) => candidates.add(id));
          if (c.mcUuid) normalizeIdentifier(c.mcUuid).forEach((id) => candidates.add(id));
          if (c.linkedDiscordId) normalizeIdentifier(c.linkedDiscordId).forEach((id) => candidates.add(id));
          if (c.mcUsername) {
            normalizeIdentifier(c.mcUsername).forEach((id) => candidates.add(id));
            candidates.add(c.mcUsername);
            candidates.add(c.mcUsername.toLowerCase());
          }
          if (c.rpName) {
            candidates.add(c.rpName);
            candidates.add(c.rpName.toLowerCase());
          }
          // Self-heal: link customer record to Discord snowflake
          if (!c.linkedDiscordId && snowflake) {
            await db.update(bankCustomers).set({ linkedDiscordId: snowflake }).where(eq(bankCustomers.id, c.id)).catch(() => {});
          }
        }
      } catch (e) {}
    }

    // 3. Platform operators & hardcoded admins
    if (envAdminIds().has(snowflake) || candidates.has("cofys") || candidates.has("24e375154a2d4c60a6033c41320a6f03")) {
      ["cofys", "Cofys", "mc_cofys", "mc_Cofys", "24e375154a2d4c60a6033c41320a6f03", "24e37515-4a2d-4c60-a603-3c41320a6f03"].forEach((id) => {
        normalizeIdentifier(id).forEach((n) => candidates.add(n));
        candidates.add(id);
        candidates.add(id.toLowerCase());
      });
    }

    return Array.from(candidates).filter(Boolean);
  } catch (e) {
    console.error("[userResolver] snowflake lookup failed:", e);
    return [snowflake];
  }
}

/**
 * Retrieves all accounts accessible by candidate IDs for a specific bank:
 * includes owned accounts and co-owned/member accounts (accountMembers).
 * Properly handles case-insensitivity and NULL is_system flags.
 */
export async function getAccountsForUser(bankId: string, candidateIds: string[]): Promise<any[]> {
  if (!bankId || !candidateIds || candidateIds.length === 0) return [];

  const candidateSet = new Set<string>();
  for (const c of candidateIds) {
    if (!c) continue;
    candidateSet.add(c);
    candidateSet.add(c.toLowerCase());
  }
  const candidateList = Array.from(candidateSet).filter(Boolean);
  if (candidateList.length === 0) return [];

  try {
    // 1. Owned accounts in this bank
    const ownedAccounts = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.bankId, bankId),
        or(
          inArray(bankAccounts.ownerDiscordId, candidateList),
          inArray(sql`lower(${bankAccounts.ownerDiscordId})`, candidateList)
        ),
        or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
      )
    );

    // 2. Member/co-owned accounts via accountMembers
    let memberAccounts: any[] = [];
    try {
      const memberships = await db.select().from(accountMembers).where(
        or(
          inArray(accountMembers.discordId, candidateList),
          inArray(sql`lower(${accountMembers.discordId})`, candidateList)
        )
      );
      const memberAccountIds = memberships.map((m) => m.accountId).filter(Boolean);
      if (memberAccountIds.length > 0) {
        memberAccounts = await db.select().from(bankAccounts).where(
          and(
            eq(bankAccounts.bankId, bankId),
            inArray(bankAccounts.id, memberAccountIds),
            or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
          )
        );
      }
    } catch (e) {}

    // Combine and deduplicate
    const accountMap = new Map<string, any>();
    for (const a of ownedAccounts) {
      accountMap.set(a.id, { ...a, isOwner: true, isMember: false });
    }
    for (const a of memberAccounts) {
      if (!accountMap.has(a.id)) {
        accountMap.set(a.id, { ...a, isOwner: false, isMember: true });
      }
    }

    return Array.from(accountMap.values());
  } catch (e) {
    console.error("[userResolver] getAccountsForUser failed:", e);
    return [];
  }
}

/**
 * Retrieves all accounts across all banks accessible by candidate IDs,
 * including bank details. Useful for directing users when they have accounts
 * at a different institution.
 */
export async function getAllAccountsForUser(candidateIds: string[]): Promise<any[]> {
  if (!candidateIds || candidateIds.length === 0) return [];

  const candidateSet = new Set<string>();
  for (const c of candidateIds) {
    if (!c) continue;
    candidateSet.add(c);
    candidateSet.add(c.toLowerCase());
  }
  const candidateList = Array.from(candidateSet).filter(Boolean);
  if (candidateList.length === 0) return [];

  try {
    const owned = await db.select({
      account: bankAccounts,
      bank: banks
    })
    .from(bankAccounts)
    .leftJoin(banks, eq(bankAccounts.bankId, banks.id))
    .where(
      and(
        or(
          inArray(bankAccounts.ownerDiscordId, candidateList),
          inArray(sql`lower(${bankAccounts.ownerDiscordId})`, candidateList)
        ),
        or(eq(bankAccounts.isSystem, false), isNull(bankAccounts.isSystem))
      )
    );

    return owned.map(o => ({ ...o.account, bankName: o.bank?.name || "Unknown Bank" }));
  } catch (e) {
    console.error("[userResolver] getAllAccountsForUser failed:", e);
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
