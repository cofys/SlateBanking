import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { handleBankInteraction, registerBankCommands, refreshBankChannelGUIs } from './bot_logic';
import { handleOnyxInteraction, registerOnyxCommands, refreshOnyxChannelGUI } from './onyx_bot_logic';

interface BotInstance {
  id: string; // The bank ID
  client: Client;
  status: 'offline' | 'online' | 'error';
}

export class BotManager {
  private instances: Map<string, BotInstance> = new Map();

  // The Onyx PSP Bot
  private onyxBot: Client | null = null;
  private onyxBotStatus: 'offline' | 'online' | 'error' = 'offline';
  private autoUpdateTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Start background auto-updater for active bank GUIs (runs every 45s)
    this.autoUpdateTimer = setInterval(() => {
      this.refreshAllBankGUIs();
    }, 45000);
  }

  getInstance(bankId: string) {
    return this.instances.get(bankId);
  }

  getOnyxClient() {
    return this.onyxBot;
  }

  getOnyxBotStatus() {
    return this.onyxBotStatus;
  }

  async updateBankBotPresence(bankId: string, isMaintenance?: boolean) {
    const instance = this.instances.get(bankId);
    if (!instance || instance.status !== 'online' || !instance.client.user) return;

    try {
      const { db } = await import("../db/index");
      const { banks } = await import("../db/schema");
      const { eq } = await import("drizzle-orm");
      
      const bank = await db.select({ name: banks.name, maintenanceMode: banks.maintenanceMode }).from(banks).where(eq(banks.id, bankId)).get();
      if (!bank) return;

      const inMaintenance = isMaintenance !== undefined ? isMaintenance : !!bank.maintenanceMode;

      if (inMaintenance) {
        instance.client.user.setPresence({
          activities: [{ name: '⚠️ Maintenance Mode', state: '⚠️ Maintenance Mode', type: ActivityType.Custom }],
          status: 'dnd',
        });
      } else {
        instance.client.user.setPresence({
          activities: [{ name: `/bank | ${bank.name}`, state: `/bank | ${bank.name}`, type: ActivityType.Custom }],
          status: 'online',
        });
      }
    } catch (e) {
      console.error(`[BankBot ${bankId}] Error updating presence:`, e);
    }
  }

  async refreshAllBankGUIs() {
    for (const [bankId, instance] of this.instances.entries()) {
      if (instance.status === 'online') {
        try {
          await this.updateBankBotPresence(bankId);
          await refreshBankChannelGUIs(bankId, instance.client);
        } catch (e) {
          console.error(`[BotManager] Error refreshing GUI for bank ${bankId}:`, e);
        }
      }
    }

    if (this.onyxBot && this.onyxBotStatus === 'online') {
      try {
        await refreshOnyxChannelGUI(this.onyxBot);
      } catch (e) {
        console.error(`[BotManager] Error refreshing Onyx GUI:`, e);
      }
    }
  }

  async provisionBankBot(bankId: string, token: string) {
    if (this.instances.has(bankId)) {
      throw new Error(`Bot for bank ${bankId} is already running.`);
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
      ],
    });

    this.instances.set(bankId, { id: bankId, client, status: 'offline' });

    client.once('ready', async () => {
      console.log(`[BankBot ${bankId}] Logged in as ${client.user?.tag}`);
      const instance = this.instances.get(bankId);
      if (instance) instance.status = 'online';
      
      // Update Discord presence to reflect maintenance mode or active state
      await this.updateBankBotPresence(bankId);

      // Attempt to register slash commands for this bot
      try {
        await registerBankCommands(token, client.user!.id);
      } catch (e) {
        console.error(`[BankBot ${bankId}] Failed to register commands:`, e);
      }

      // Initial refresh of channel GUIs
      try {
        await refreshBankChannelGUIs(bankId, client);
      } catch (e) {
        console.error(`[BankBot ${bankId}] Initial GUI refresh error:`, e);
      }
    });

    client.on('error', (err) => {
      console.error(`[BankBot ${bankId}] Error:`, err);
      const instance = this.instances.get(bankId);
      if (instance) instance.status = 'error';
    });

    client.on('interactionCreate', async (interaction) => {
      await handleBankInteraction(bankId, interaction);
    });

    try {
      await client.login(token);
    } catch (error) {
      console.error(`[BankBot ${bankId}] Failed to login:`, error);
      const instance = this.instances.get(bankId);
      if (instance) instance.status = 'error';
    }
  }

  async stopBankBot(bankId: string) {
    const instance = this.instances.get(bankId);
    if (instance) {
       instance.client.destroy();
       this.instances.delete(bankId);
    }
  }

  async restartBankBot(bankId: string, token: string) {
    await this.stopBankBot(bankId);
    if (token && token.trim().length > 0) {
      await this.provisionBankBot(bankId, token.trim());
    }
  }

  async sendNotification(bankId: string, message: string) {
     const instance = this.instances.get(bankId);
     if (instance?.status === 'online') {
        try {
          const { db } = await import("../db/index");
          const { bankSettings } = await import("../db/schema");
          const { eq } = await import("drizzle-orm");
          const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
          if (settings?.staffChannelId) {
             const channel = await instance.client.channels.fetch(settings.staffChannelId);
             if (channel && channel.isTextBased() && 'send' in channel) {
                await (channel as any).send({ content: `**[Slate Notification]** ${message}` });
                return;
             }
          }
        } catch (e) {
          console.error(`[BankBot ${bankId}] Failed to send Discord notification:`, e);
        }
        console.log(`[BankBot ${bankId} Notification]: ${message}`);
     }
  }

  async startOnyxBot(token: string) {
    if (this.onyxBot) {
      throw new Error("Onyx Bot is already running.");
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.onyxBot = client;
    this.onyxBotStatus = 'offline';

    client.once('ready', async () => {
      console.log(`[Onyx PSP Bot] Logged in as ${client.user?.tag}`);
      this.onyxBotStatus = 'online';

      try {
        await registerOnyxCommands(token, client.user!.id);
      } catch (e) {
        console.error('[Onyx PSP Bot] Failed to register slash commands:', e);
      }

      try {
        await refreshOnyxChannelGUI(client);
      } catch (e) {
        console.error('[Onyx PSP Bot] Initial GUI refresh error:', e);
      }
    });

    client.on('error', (err) => {
      console.error(`[Onyx PSP Bot] Error:`, err);
      this.onyxBotStatus = 'error';
    });

    client.on('interactionCreate', async (interaction) => {
      await handleOnyxInteraction(interaction);
    });

    try {
      await client.login(token);
    } catch (error) {
      console.error(`[Onyx PSP Bot] Failed to login:`, error);
      this.onyxBotStatus = 'error';
      this.onyxBot = null;
    }
  }

  async stopOnyxBot() {
    if (this.onyxBot) {
      this.onyxBot.destroy();
      this.onyxBot = null;
      this.onyxBotStatus = 'offline';
    }
  }

  getBankStatuses() {
    const statuses: Record<string, string> = {};
    for (const [id, instance] of this.instances.entries()) {
      statuses[id] = instance.status;
    }
    return statuses;
  }
}

export const botManager = new BotManager();
