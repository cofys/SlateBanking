import { db } from "../db/index";
import { discordWebhooks, bankSettings, banks } from "../db/schema";
import { eq, or } from "drizzle-orm";
import { isAllowedWebhookUrl } from "../server/middleware";

export interface WebhookEmbed {
  title: string;
  description: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footerText?: string;
}

async function webhookIdentity(bankId: string): Promise<{ username: string; color: number; avatar?: string; footer: string }> {
  if (bankId === "global") {
    return { username: "Notifications", color: 0x4f46e5, footer: "Platform" };
  }
  const bank = await db.select({
    name: banks.name,
    brandingColor: banks.brandingColor,
    logoUrl: banks.logoUrl,
  }).from(banks).where(eq(banks.id, bankId)).get();
  const settings = await db.select({
    logoUrl: bankSettings.logoUrl,
    discordFooter: bankSettings.discordFooter,
  }).from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const raw = (bank?.brandingColor || "#4f46e5").replace("#", "");
  const color = /^[0-9a-fA-F]{6}$/.test(raw) ? parseInt(raw, 16) : 0x4f46e5;
  const avatar = [settings?.logoUrl, bank?.logoUrl].find((u) => !!u && /^https:\/\//i.test(u)) || undefined;
  return {
    username: (bank?.name || "Bank").slice(0, 80),
    color,
    avatar,
    footer: ((settings?.discordFooter || `${bank?.name || "Bank"} • Powered by - Slate Banking Platform`) as string).slice(0, 80),
  };
}

export async function dispatchDiscordWebhook(
  bankId: string,
  eventName: string,
  embed: WebhookEmbed
) {
  try {
    const identity = await webhookIdentity(bankId);

    // 1. Check legacy single discordWebhookUrl in bankSettings
    if (bankId !== "global") {
      const settingsList = await db
        .select()
        .from(bankSettings)
        .where(eq(bankSettings.bankId, bankId));

      if (settingsList.length > 0 && settingsList[0].discordWebhookUrl) {
        const url = settingsList[0].discordWebhookUrl;
        if (isAllowedWebhookUrl(url)) {
          sendWebhookPayload(url, embed, eventName, identity);
        }
      }
    }

    // 2. Check discordWebhooks table for matching bankId or 'global'
    const hooks = await db
      .select()
      .from(discordWebhooks)
      .where(
        or(
          eq(discordWebhooks.bankId, bankId),
          eq(discordWebhooks.bankId, "global")
        )
      );

    for (const hook of hooks) {
      if (!hook.isActive || !hook.url) continue;
      if (!isAllowedWebhookUrl(hook.url)) continue;

      let eventList: string[] = [];
      try {
        eventList = JSON.parse(hook.events);
      } catch (e) {
        eventList = [];
      }

      if (eventList.includes(eventName) || eventList.includes("*")) {
        sendWebhookPayload(hook.url, embed, eventName, identity);
      }
    }
  } catch (err) {
    console.error("[WebhookDispatcher] Error querying webhooks:", err);
  }
}

async function sendWebhookPayload(
  url: string,
  embed: WebhookEmbed,
  eventName: string,
  identity?: { username: string; color: number; avatar?: string; footer: string }
) {
  if (!isAllowedWebhookUrl(url)) {
    console.warn("[WebhookDispatcher] Blocked non-Discord webhook URL");
    return;
  }

  try {
    const payload = {
      username: identity?.username || "Bank",
      avatar_url: identity?.avatar,
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          color: embed.color || identity?.color || 0x4f46e5,
          fields: embed.fields || [],
          footer: {
            text: embed.footerText || identity?.footer || eventName
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error(`[WebhookDispatcher] Failed to dispatch webhook to ${url.substring(0, 30)}...:`, err);
  }
}