import express from "express";
import { requireAuth, requireBankStaff, requireGlobalAdmin } from "../middleware.js";
import { db } from "../../db/index";
import { discordWebhooks, bankSettings } from "../../db/schema";
import { eq, or, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { dispatchDiscordWebhook } from "../../lib/webhook_dispatcher";
import { processYieldsAndAutomations } from "../../lib/yield_engine";

export const webhooksRouter = express.Router();

// Get webhooks for a bank or global
webhooksRouter.get("/api/banks/:bankId/webhooks", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const bankId = req.params.bankId;
    const hooks = await db
      .select()
      .from(discordWebhooks)
      .where(eq(discordWebhooks.bankId, bankId));

    // Hide full webhook secrets for security, return masked URLs
    const sanitized = hooks.map(h => ({
      ...h,
      maskedUrl: h.url ? `${h.url.substring(0, 35)}...` : "",
      eventsList: (() => {
        try { return JSON.parse(h.events); } catch (e) { return []; }
      })()
    }));

    res.json({ webhooks: sanitized });
  } catch (err: any) {
    console.error("[WebhooksAPI] Error listing webhooks:", err);
    res.status(500).json({ error: "Failed to list webhooks" });
  }
});

// Create new Discord Webhook
webhooksRouter.post("/api/banks/:bankId/webhooks", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const bankId = req.params.bankId;
    const { name, url, events } = req.body;

    if (!name || !url) {
      return res.status(400).json({ error: "Name and Discord Webhook URL are required." });
    }

    const eventsJson = JSON.stringify(Array.isArray(events) ? events : ["*"]);
    const id = uuidv4();

    await db.insert(discordWebhooks).values({
      id,
      bankId,
      name,
      url,
      events: eventsJson,
      isActive: true,
      createdAt: new Date()
    });

    res.json({ success: true, id });
  } catch (err: any) {
    console.error("[WebhooksAPI] Error creating webhook:", err);
    res.status(500).json({ error: err.message || "Failed to create webhook" });
  }
});

// Delete Discord Webhook
webhooksRouter.delete("/api/banks/:bankId/webhooks/:webhookId", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const { bankId, webhookId } = req.params;
    await db.delete(discordWebhooks).where(and(eq(discordWebhooks.id, webhookId), eq(discordWebhooks.bankId, bankId)));
    res.json({ success: true });
  } catch (err: any) {
    console.error("[WebhooksAPI] Error deleting webhook:", err);
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

// Send Test Notification
webhooksRouter.post("/api/banks/:bankId/webhooks/test", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const bankId = req.params.bankId;
    const { url } = req.body;

    await dispatchDiscordWebhook(bankId, "test_ping", {
      title: "Webhook connected",
      description: "This channel will receive bank alerts from the web portal.",
      fields: [
        { name: "Status", value: "Online", inline: true },
      ]
    });

    res.json({ success: true, message: "Test webhook dispatched successfully." });
  } catch (err: any) {
    console.error("[WebhooksAPI] Error sending test webhook:", err);
    res.status(500).json({ error: "Failed to dispatch test webhook" });
  }
});

// Trigger Manual Yield Distribution
webhooksRouter.post("/api/banks/:bankId/process-yields", requireBankStaff, async (req: express.Request, res: express.Response) => {
  try {
    const bankId = req.params.bankId;
    await processYieldsAndAutomations(bankId);
    res.json({ success: true, message: "Automated APY yield distribution & loan interest engine executed." });
  } catch (err: any) {
    console.error("[YieldsAPI] Error running yield processor:", err);
    res.status(500).json({ error: "Failed to process yields" });
  }
});
