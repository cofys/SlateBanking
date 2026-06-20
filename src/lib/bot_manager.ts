import { Client, GatewayIntentBits } from 'discord.js';
import { handleBankInteraction, registerBankCommands } from './bot_logic';

interface BotInstance {
  id: string; // The bank ID
  client: Client;
  status: 'offline' | 'online' | 'error';
}

export class BotManager {
  private instances: Map<string, BotInstance> = new Map();

  // The Onyx PSP Bot
  private onyxBot: Client | null = null;

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
      
      // Attempt to register slash commands for this bot
      try {
        await registerBankCommands(token, client.user!.id);
      } catch (e) {
        console.error(`[BankBot ${bankId}] Failed to register commands:`, e);
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

  async sendNotification(bankId: string, message: string) {
     const instance = this.instances.get(bankId);
     if (instance?.status === 'online') {
        // Ideally send to a configured logging channel. 
        // For now, this is a stub as the channel isn't configured in the schema yet.
        console.log(`[BankBot ${bankId} Notification]: ${message}`);
     }
  }

  async startOnyxBot(token: string) {
    if (this.onyxBot) {
      throw new Error("Onyx Bot is already running.");
    }

    this.onyxBot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.onyxBot.once('ready', () => {
      console.log(`[Onyx PSP Bot] Logged in as ${this.onyxBot?.user?.tag}`);
    });

    try {
      await this.onyxBot.login(token);
    } catch (error) {
      console.error(`[Onyx PSP Bot] Failed to login:`, error);
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
