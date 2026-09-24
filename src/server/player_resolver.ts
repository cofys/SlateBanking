import { db } from "../db/index.js";
import { users, bankCustomers, bankAccounts } from "../db/schema.js";
import { eq, or } from "drizzle-orm";
import type { CityCorpClient } from "../lib/citycorp_api.js";

// Cache for resolved UUID -> Username mapping to avoid repetitive external API calls
const uuidToUsernameCache = new Map<string, {name: string, ts: number}>();

// Prevent unbounded growth of the cache
setInterval(() => {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [key, val] of uuidToUsernameCache.entries()) {
    if (now - val.ts > ONE_DAY) {
      uuidToUsernameCache.delete(key);
    }
  }
  // Hard limit as a fallback
  if (uuidToUsernameCache.size > 20000) {
    uuidToUsernameCache.clear();
  }
}, 60 * 60 * 1000).unref();

/**
 * Resolves a Minecraft UUID to a Minecraft username using local DB first,
 * then CityCorp player API, Mojang API, Ashcon API, or PlayerDB API.
 */
export async function resolveMinecraftUsername(uuid: string, client?: CityCorpClient): Promise<string | null> {
  if (!uuid) return null;
  const cleanUuid = uuid.replace(/-/g, "").toLowerCase();

  if (uuidToUsernameCache.has(cleanUuid)) {
    return uuidToUsernameCache.get(cleanUuid)!.name;
  }

  // 1. Check local DB (users & bankCustomers)
  try {
    const userRow = await db.select().from(users).where(or(eq(users.mcUuid, uuid), eq(users.mcUuid, cleanUuid))).get();
    if (userRow?.mcUsername) {
      uuidToUsernameCache.set(cleanUuid, {name: userRow.mcUsername, ts: Date.now()});
      return userRow.mcUsername;
    }

    const customerRow = await db.select().from(bankCustomers).where(or(eq(bankCustomers.mcUuid, uuid), eq(bankCustomers.mcUuid, cleanUuid))).get();
    if (customerRow?.mcUsername) {
      uuidToUsernameCache.set(cleanUuid, {name: customerRow.mcUsername, ts: Date.now()});
      return customerRow.mcUsername;
    }
  } catch (e) {
    // ignore db read errors
  }

  // 2. CityCorp API player endpoint
  try {
    const cityCorpPlayerRes = await fetch(`https://api.cityrp.org/citycorp/player?uuid=${uuid}`, { signal: AbortSignal.timeout(3500) });
    if (cityCorpPlayerRes.ok) {
      const pData = await cityCorpPlayerRes.json();
      const name = pData?.username || pData?.name || pData?.player?.name || pData?.player_name;
      if (name && typeof name === "string" && name !== "Citizen") {
        uuidToUsernameCache.set(cleanUuid, {name, ts: Date.now()});
        return name;
      }
    }
  } catch (e) {
    // proceed to next fallback
  }

  try {
    const legacyPlayerRes = await fetch(`https://api.cityrp.org/player?uuid=${uuid}`, { signal: AbortSignal.timeout(3500) });
    if (legacyPlayerRes.ok) {
      const pData = await legacyPlayerRes.json();
      const name = pData?.username || pData?.name || pData?.player?.name || pData?.player_name;
      if (name && typeof name === "string" && name !== "Citizen") {
        uuidToUsernameCache.set(cleanUuid, {name, ts: Date.now()});
        return name;
      }
    }
  } catch (e) {
    // proceed to next fallback
  }

  // 3. Mojang SessionServer API
  try {
    const mojangRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}`, { signal: AbortSignal.timeout(3500) });
    if (mojangRes.ok) {
      const mData = await mojangRes.json();
      if (mData?.name) {
        uuidToUsernameCache.set(cleanUuid, {name: mData.name, ts: Date.now()});
        return mData.name;
      }
    }
  } catch (e) {
    // proceed to next fallback
  }

  // 4. Ashcon Mojang API
  try {
    const ashconRes = await fetch(`https://api.ashcon.app/mojang/v2/user/${uuid}`, { signal: AbortSignal.timeout(3500) });
    if (ashconRes.ok) {
      const aData = await ashconRes.json();
      if (aData?.username) {
        uuidToUsernameCache.set(cleanUuid, {name: aData.username, ts: Date.now()});
        return aData.username;
      }
    }
  } catch (e) {
    // proceed to next fallback
  }

  // 5. PlayerDB API
  try {
    const playerDbRes = await fetch(`https://playerdb.co/api/player/minecraft/${uuid}`, { signal: AbortSignal.timeout(3500) });
    if (playerDbRes.ok) {
      const pdbData = await playerDbRes.json();
      if (pdbData?.data?.player?.username) {
        const username = pdbData.data.player.username;
        uuidToUsernameCache.set(cleanUuid, {name: username, ts: Date.now()});
        return username;
      }
    }
  } catch (e) {
    // proceed
  }

  return null;
}

/**
 * Fetches subusers for a CityCorp corporate account (including corp owner as first item)
 * and resolves the owner's Minecraft username.
 */
export async function fetchAndResolveAccountOwner(
  client: CityCorpClient,
  accountName: string
): Promise<{ ownerUuid: string | null; username: string | null; allSubusers: string[] }> {
  try {
    const subusersRes = await client.listSubusers(accountName, 1, true);
    if (subusersRes.success && subusersRes.subusers && subusersRes.subusers.length > 0) {
      const ownerUuid = subusersRes.subusers[0]; // First user is the actual account owner
      const username = await resolveMinecraftUsername(ownerUuid, client);
      return {
        ownerUuid,
        username: username || ownerUuid,
        allSubusers: subusersRes.subusers
      };
    }
  } catch (err) {
    console.warn(`[PlayerResolver] Failed to resolve subusers for account "${accountName}":`, err);
  }

  return { ownerUuid: null, username: null, allSubusers: [] };
}

export interface ResolvedPlayerIdentity {
  mcUsername: string;
  mcUuid: string | null;
  discordId: string | null;
  avatarUrl: string;
}

/**
 * Resolves a player identifier (Minecraft username, UUID, or Discord ID)
 * into a canonical Minecraft player identity, linking local user records if found.
 */
export async function resolvePlayerIdentity(
  input: string,
  client?: CityCorpClient
): Promise<ResolvedPlayerIdentity | null> {
  if (!input || typeof input !== "string") return null;
  const clean = input.trim().replace(/^<@!?/, "").replace(/>$/, "").trim();
  if (!clean) return null;

  // 1. Check local users table
  try {
    const allUsers = await db.select().from(users).all();
    const cleanLower = clean.toLowerCase();
    const cleanNoDashes = cleanLower.replace(/-/g, "").replace(/^mc_/, "");

    const matchedUser = allUsers.find(u => {
      if (u.mcUsername && u.mcUsername.toLowerCase() === cleanLower) return true;
      if (u.rpName && u.rpName.toLowerCase() === cleanLower) return true;
      if (u.discordId && u.discordId.toLowerCase() === cleanLower) return true;
      if (u.mcUuid && u.mcUuid.replace(/-/g, "").toLowerCase() === cleanNoDashes) return true;
      return false;
    });

    if (matchedUser) {
      const mcName = matchedUser.mcUsername || matchedUser.rpName || clean;
      return {
        mcUsername: mcName,
        mcUuid: matchedUser.mcUuid || null,
        discordId: matchedUser.discordId || null,
        avatarUrl: `https://mc-heads.net/avatar/${mcName}/64`
      };
    }
  } catch (e) {
    console.error("[resolvePlayerIdentity] Error checking users:", e);
  }

  // 2. Check local bankCustomers table
  try {
    const allCustomers = await db.select().from(bankCustomers).all();
    const cleanLower = clean.toLowerCase();
    const cleanNoDashes = cleanLower.replace(/-/g, "").replace(/^mc_/, "");

    const matchedCust = allCustomers.find(c => {
      if (c.mcUsername && c.mcUsername.toLowerCase() === cleanLower) return true;
      if (c.rpName && c.rpName.toLowerCase() === cleanLower) return true;
      if (c.discordId && c.discordId.toLowerCase() === cleanLower) return true;
      if (c.linkedDiscordId && c.linkedDiscordId.toLowerCase() === cleanLower) return true;
      if (c.mcUuid && c.mcUuid.replace(/-/g, "").toLowerCase() === cleanNoDashes) return true;
      return false;
    });

    if (matchedCust) {
      const mcName = matchedCust.mcUsername || matchedCust.rpName || clean;
      return {
        mcUsername: mcName,
        mcUuid: matchedCust.mcUuid || null,
        discordId: matchedCust.linkedDiscordId || matchedCust.discordId || null,
        avatarUrl: `https://mc-heads.net/avatar/${mcName}/64`
      };
    }
  } catch (e) {
    console.error("[resolvePlayerIdentity] Error checking bankCustomers:", e);
  }

  // 3. If input is a UUID (with hyphens, without hyphens, or prefixed with mc_)
  const cleanUuidHex = clean.replace(/^mc_/, "").replace(/-/g, "").toLowerCase();
  if (/^[0-9a-f]{32}$/.test(cleanUuidHex)) {
    const dashedUuid = `${cleanUuidHex.slice(0, 8)}-${cleanUuidHex.slice(8, 12)}-${cleanUuidHex.slice(12, 16)}-${cleanUuidHex.slice(16, 20)}-${cleanUuidHex.slice(20)}`;
    const resolvedName = await resolveMinecraftUsername(dashedUuid, client);
    const finalName = resolvedName || clean;
    return {
      mcUsername: finalName,
      mcUuid: dashedUuid,
      discordId: `mc_${cleanUuidHex}`,
      avatarUrl: `https://mc-heads.net/avatar/${finalName}/64`
    };
  }

  // 4. If input is a Discord snowflake ID (17-20 digits)
  if (/^\d{17,20}$/.test(clean)) {
    return {
      mcUsername: clean,
      mcUuid: null,
      discordId: clean,
      avatarUrl: `https://mc-heads.net/avatar/MHF_Steve/64`
    };
  }

  // 5. Query Mojang API for Minecraft username
  try {
    const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(3500)
    });
    if (mojangRes.ok) {
      const mData = await mojangRes.json();
      if (mData?.id && mData?.name) {
        const id = mData.id.toLowerCase();
        const dashedUuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
        
        let linkedDiscord: string | null = null;
        try {
          const u = await db.select().from(users).where(or(eq(users.mcUuid, dashedUuid), eq(users.mcUuid, id))).get();
          if (u) linkedDiscord = u.discordId;
        } catch (_) {}

        return {
          mcUsername: mData.name,
          mcUuid: dashedUuid,
          discordId: linkedDiscord || `mc_${id}`,
          avatarUrl: `https://mc-heads.net/avatar/${mData.name}/64`
        };
      }
    }
  } catch (e) {
    // Mojang API unavailable or timeout
  }

  // 6. Query PlayerDB API
  try {
    const pdbRes = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(clean)}`, {
      signal: AbortSignal.timeout(3500)
    });
    if (pdbRes.ok) {
      const pData = await pdbRes.json();
      if (pData?.code === "player.found" && pData?.data?.player) {
        const p = pData.data.player;
        const rawId = (p.raw_id || p.id || "").replace(/-/g, "").toLowerCase();
        const dashedUuid = p.id?.includes("-") ? p.id : `${rawId.slice(0, 8)}-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}-${rawId.slice(16, 20)}-${rawId.slice(20)}`;
        return {
          mcUsername: p.username,
          mcUuid: dashedUuid,
          discordId: `mc_${rawId}`,
          avatarUrl: p.avatar || `https://mc-heads.net/avatar/${p.username}/64`
        };
      }
    }
  } catch (e) {
    // PlayerDB fallback
  }

  // 7. Fallback: Accept Minecraft username directly (for offline/cracked/custom servers)
  return {
    mcUsername: clean,
    mcUuid: null,
    discordId: `mc:${clean.toLowerCase()}`,
    avatarUrl: `https://mc-heads.net/avatar/${clean}/64`
  };
}

