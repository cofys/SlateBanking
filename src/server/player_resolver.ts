import { db } from "../db/index.js";
import { users, bankCustomers, bankAccounts } from "../db/schema.js";
import { eq, or } from "drizzle-orm";
import type { CityCorpClient } from "../lib/citycorp_api.js";

// Cache for resolved UUID -> Username mapping to avoid repetitive external API calls
const uuidToUsernameCache = new Map<string, string>();

/**
 * Resolves a Minecraft UUID to a Minecraft username using local DB first,
 * then CityCorp player API, Mojang API, Ashcon API, or PlayerDB API.
 */
export async function resolveMinecraftUsername(uuid: string, client?: CityCorpClient): Promise<string | null> {
  if (!uuid) return null;
  const cleanUuid = uuid.replace(/-/g, "").toLowerCase();

  if (uuidToUsernameCache.has(cleanUuid)) {
    return uuidToUsernameCache.get(cleanUuid)!;
  }

  // 1. Check local DB (users & bankCustomers)
  try {
    const userRow = await db.select().from(users).where(or(eq(users.mcUuid, uuid), eq(users.mcUuid, cleanUuid))).get();
    if (userRow?.mcUsername) {
      uuidToUsernameCache.set(cleanUuid, userRow.mcUsername);
      return userRow.mcUsername;
    }

    const customerRow = await db.select().from(bankCustomers).where(or(eq(bankCustomers.mcUuid, uuid), eq(bankCustomers.mcUuid, cleanUuid))).get();
    if (customerRow?.mcUsername) {
      uuidToUsernameCache.set(cleanUuid, customerRow.mcUsername);
      return customerRow.mcUsername;
    }
  } catch (e) {
    // ignore db read errors
  }

  // 2. CityCorp API player endpoint
  try {
    const cityCorpPlayerRes = await fetch(`https://api.cityrp.org/player?uuid=${uuid}`, { signal: AbortSignal.timeout(3500) });
    if (cityCorpPlayerRes.ok) {
      const pData = await cityCorpPlayerRes.json();
      const name = pData?.username || pData?.name || pData?.player?.name || pData?.player_name;
      if (name && typeof name === "string" && name !== "Citizen") {
        uuidToUsernameCache.set(cleanUuid, name);
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
        uuidToUsernameCache.set(cleanUuid, mData.name);
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
        uuidToUsernameCache.set(cleanUuid, aData.username);
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
        uuidToUsernameCache.set(cleanUuid, username);
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
