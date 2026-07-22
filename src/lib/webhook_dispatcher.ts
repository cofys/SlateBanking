import { db } from "../db/index";
import { discordWebhooks, bankSettings } from "../db/schema";
import { eq, or } from "drizzle-orm";

export interface WebhookEmbed {
  title: string;
  description: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footerText?: string;
}

export async function dispatchDiscordWebhook(
  bankId: string,
  eventName: string,
  embed: WebhookEmbed
) {
  try {
    // 1. Check legacy single discordWebhookUrl in bankSettings
    if (bankId !== "global") {
      const settingsList = await db
        .select()
        .from(bankSettings)
        .where(eq(bankSettings.bankId, bankId));

      if (settingsList.length > 0 && settingsList[0].discordWebhookUrl) {
        const url = settingsList[0].discordWebhookUrl;
        sendWebhookPayload(url, embed, eventName);
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

      let eventList: string[] = [];
      try {
        eventList = JSON.parse(hook.events);
      } catch (e) {
        eventList = [];
      }

      if (eventList.includes(eventName) || eventList.includes("*")) {
        sendWebhookPayload(hook.url, embed, eventName);
      }
    }
  } catch (err) {
    console.error("[WebhookDispatcher] Error querying webhooks:", err);
  }
}

async function sendWebhookPayload(url: string, embed: WebhookEmbed, eventName: string) {
  try {
    const payload = {
      username: "Slate SaaS • Notification Engine",
      avatar_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&q=80",
      embeds: [
        {
          title: embed.title,
          description: embed.description,
          color: embed.color || 0x4f46e5,
          fields: embed.fields || [],
          footer: {
            text: embed.footerText || `Event: ${eventName} • Slate SaaS Onyx PSP`
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
