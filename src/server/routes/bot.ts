import express from 'express';
import { requireAuth, requireGlobalAdmin, requireBankStaff, requireRole, sendWebhook, authenticateApiRequest, JWT_SECRET, getRedirectUri } from "../middleware.js";
import { botManager } from "../../lib/bot_manager.js";
import * as crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { randomInt } from "crypto";
const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;

export const botRouter = express.Router();

botRouter.get("/api/bots/status", requireGlobalAdmin, (req: express.Request, res: express.Response) => {
  res.json(botManager.getBankStatuses());
});

botRouter.post("/api/banks/:bankId/spawn-discord-gui", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { bankId } = req.params;
    const { channelId, type } = req.body; // type = 'public' | 'staff'
    if (!channelId) return res.status(400).json({ error: "channelId is required" });

    const instance = botManager.getInstance(bankId);
    if (!instance || instance.status !== 'online') {
      return res.status(400).json({ error: "Bank bot is not running. Please start the Discord bot in Bot Settings first." });
    }

    const { buildPublicGUIEmbedAndComponents, buildStaffPanelEmbedAndComponents } = await import("../../lib/bot_logic.js");
    const channel = await instance.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      return res.status(400).json({ error: "Target channel not found or bot lacks permission to view/send messages in it." });
    }

    const data = type === 'staff' 
      ? await buildStaffPanelEmbedAndComponents(bankId)
      : await buildPublicGUIEmbedAndComponents(bankId);

    const msg = await (channel as any).send(data);

    const { db } = await import("../../db/index.js");
    const { bankSettings } = await import("../../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const existing = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (type === 'staff') {
      if (existing) {
        await db.update(bankSettings).set({ staffChannelId: channelId, staffMessageId: msg.id }).where(eq(bankSettings.bankId, bankId));
      } else {
        await db.insert(bankSettings).values({ bankId, staffChannelId: channelId, staffMessageId: msg.id });
      }
    } else {
      if (existing) {
        await db.update(bankSettings).set({ guiChannelId: channelId, guiMessageId: msg.id }).where(eq(bankSettings.bankId, bankId));
      } else {
        await db.insert(bankSettings).values({ bankId, guiChannelId: channelId, guiMessageId: msg.id });
      }
    }

    res.json({ success: true, message: `Successfully spawned ${type || 'public'} GUI embed in channel ${channelId}` });
  } catch (err: any) {
    console.error("Failed to spawn discord gui:", err);
    res.status(500).json({ error: err.message || "Failed to spawn embed" });
  }
});

botRouter.post("/api/banks/:bankId/refresh-discord-gui", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { bankId } = req.params;
    const { refreshBankChannelGUIs } = await import("../../lib/bot_logic.js");
    await refreshBankChannelGUIs(bankId);
    res.json({ success: true, message: "Refreshed Discord channel embeds." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
