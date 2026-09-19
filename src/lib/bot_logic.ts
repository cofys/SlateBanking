import { REST, Routes, Interaction, CacheType, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonInteraction, StringSelectMenuBuilder, Client, EmbedBuilder } from 'discord.js';
import { db } from '../db/index';
import { banks, bankAccounts, transactions, users, bankCustomers, loans, bankSettings, bankStaff, auditLogs, globalAdmins, loanProducts } from '../db/schema';
import { eq, and, sql, or, desc, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CityCorpClient } from './citycorp_api';
import { getCandidateIdsForDiscordSnowflake } from '../server/userResolver';
import { SCHEME_HEX } from './theme';

const LINK_DISCORD_MSG = "Link Discord in your bank portal first. Sign in with CityCorp, then tap **Link Discord**. The bot only works after that.";

async function requireLinkedIds(interaction: any): Promise<string[] | null> {
  const ids = await getCandidateIdsForDiscordSnowflake(interaction.user.id);
  if (!ids.length) {
    const content = LINK_DISCORD_MSG;
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content, ephemeral: true });
      else if (interaction.isRepliable?.() || interaction.reply) await interaction.reply({ content, ephemeral: true });
    } catch {}
    return null;
  }
  return ids;
}

function money(cents: number): string {
  return `$${(Number(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function httpsUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const t = String(raw).trim();
  if (!/^https:\/\//i.test(t) || t.length > 500) return undefined;
  return t;
}

function parseBrandColor(hex?: string | null): number | null {
  if (!hex) return null;
  const raw = String(hex).trim().replace('#', '');
  const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  const n = parseInt(expanded, 16);
  return Number.isFinite(n) ? n : null;
}

function brandColor(bank: { brandingColor?: string | null }, settings?: { colorScheme?: string | null } | null): number {
  return parseBrandColor(bank.brandingColor)
    ?? parseBrandColor(settings?.colorScheme ? SCHEME_HEX[settings.colorScheme] : null)
    ?? 0x8b95a5;
}

function bankPublicOrigin(bank: { customDomain?: string | null }): string | null {
  if (bank.customDomain) {
    const host = bank.customDomain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
    if (host) return `https://${host}`;
  }
  const env = (process.env.APP_URL || process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (env && /^https?:\/\//i.test(env)) return env;
  return null;
}

function citizenPortalUrl(bank: { id: string; customDomain?: string | null }): string | null {
  const origin = bankPublicOrigin(bank);
  if (!origin) return null;
  if (bank.customDomain) return `${origin}/`;
  return `${origin}/portal/${bank.id}`;
}

function staffPortalUrl(bank: { id: string; customDomain?: string | null }): string | null {
  const origin = bankPublicOrigin(bank);
  if (!origin) return null;
  return `${origin}/bank/${bank.id}`;
}

function typeLabel(type?: string | null): string {
  if (!type) return 'Personal';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function loansEnabled(settings?: { enableLoans?: boolean | null; loanAllowCitizenApply?: boolean | null } | null): boolean {
  if (!settings) return true;
  if (settings.enableLoans === false) return false;
  if (settings.loanAllowCitizenApply === false) return false;
  return true;
}

function footerText(bank: { name: string }, settings?: { discordFooter?: string | null } | null): string {
  const custom = (settings?.discordFooter || '').trim();
  return custom || bank.name;
}

export async function isBankStaffOrGlobalAdmin(bankId: string, discordId: string): Promise<boolean> {
  if (!discordId) return false;
  const admin = await db.select().from(globalAdmins).where(eq(globalAdmins.discordId, discordId)).get();
  if (admin) return true;
  const staff = await db.select().from(bankStaff).where(and(eq(bankStaff.bankId, bankId), eq(bankStaff.discordId, discordId))).get();
  if (staff) return true;
  return false;
}

async function getBankClient(bankId: string) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (!b || b.length === 0) return null;
  const bank = b[0];
  if (!bank.corpId || !bank.corpApiUuid || !bank.corpApiKey) return null;
  return new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey);
}

const commands = [
  new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Open your personal bank dashboard.'),
].map(command => command.toJSON());

export async function registerBankCommands(token: string, clientId: string) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
}

export async function handleBankInteraction(bankId: string, interaction: Interaction<CacheType>) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length > 0 && b[0].maintenanceMode) {
    const isStaff = await isBankStaffOrGlobalAdmin(bankId, interaction.user.id);
    if (!isStaff) {
      const msg = `**${b[0].name}** is currently closed for maintenance. Please check back shortly.`;
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: msg, ephemeral: true });
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
      }
      return;
    }
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'bank') {
      await showMainMenu(bankId, interaction, true);
    } else if (interaction.isRepliable()) {
      await interaction.reply({
        content: 'The only command is **/bank**. Channel panels are spawned from Bank Settings on the web.',
        ephemeral: true,
      });
    }
    return;
  }
  
  if (interaction.isButton()) {
    await handleButton(bankId, interaction);
    return;
  }

  if (interaction.isStringSelectMenu()) {
    const value = interaction.values[0];
    if (value.startsWith('select_acc_')) {
      const accountId = value.replace('select_acc_', '');
      await interaction.deferUpdate();
      await showMainMenu(bankId, interaction, true, accountId);
    }
    return;
  }
  
  if (interaction.isModalSubmit()) {
    await handleModal(bankId, interaction);
    return;
  }
}


export async function buildPublicGUIEmbedAndComponents(bankId: string) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) throw new Error("Bank not found");
  const bank = b[0];

  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const color = brandColor(bank, settings);
  const logo = httpsUrl(settings?.logoUrl || bank.logoUrl);
  const portalUrl = citizenPortalUrl(bank);
  const tagline = (settings?.tagline || '').trim();
  const welcome = (settings?.discordWelcome || '').trim()
    || `Welcome to **${bank.name}**. Use the buttons below for your dashboard, transfers, and rates — or open the web portal.`;
  const showStats = settings?.discordShowStats !== false;
  const statusLine = bank.maintenanceMode ? 'Closed for maintenance' : 'Open';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(bank.name)
    .setDescription(
      (tagline ? `*${tagline}*\n\n` : '') +
      welcome +
      `\n\n**Status** · ${statusLine}`
    )
    .setTimestamp();

  if (logo) {
    embed.setThumbnail(logo);
    embed.setAuthor({ name: bank.name, iconURL: logo });
  } else {
    embed.setAuthor({ name: bank.name });
  }
  embed.setFooter({ text: footerText(bank, settings), ...(logo ? { iconURL: logo } : {}) });

  if (showStats) {
    const accounts = await db.select({
      totalBalance: sql<number>`COALESCE(SUM(${bankAccounts.balance}), 0)`,
      count: sql<number>`COUNT(${bankAccounts.id})`
    }).from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.isSystem, false))).get();

    embed.addFields(
      { name: 'Deposits', value: money(accounts?.totalBalance || 0), inline: true },
      { name: 'Accounts', value: String(accounts?.count || 0), inline: true },
      { name: 'Hours', value: statusLine, inline: true },
    );
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_gui_dashboard').setLabel('My Dashboard').setStyle(ButtonStyle.Primary).setEmoji('🏦'),
    new ButtonBuilder().setCustomId('bank_gui_transfer').setLabel('Transfer').setStyle(ButtonStyle.Primary).setEmoji('↔️'),
    new ButtonBuilder().setCustomId('bank_gui_history').setLabel('History').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    new ButtonBuilder().setCustomId('bank_gui_open_acc').setLabel('Sync').setStyle(ButtonStyle.Success).setEmoji('🔄'),
  );

  const row2Buttons: ButtonBuilder[] = [];
  if (loansEnabled(settings)) {
    row2Buttons.push(
      new ButtonBuilder().setCustomId('bank_gui_apply_loan').setLabel('Apply for a Loan').setStyle(ButtonStyle.Secondary).setEmoji('📝')
    );
  }
  row2Buttons.push(
    new ButtonBuilder().setCustomId('bank_gui_rates').setLabel('Rates').setStyle(ButtonStyle.Secondary).setEmoji('📈')
  );
  if (portalUrl) {
    row2Buttons.push(
      new ButtonBuilder().setLabel('Web Portal').setStyle(ButtonStyle.Link).setURL(portalUrl).setEmoji('🌐')
    );
  }
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row2Buttons);

  return { embeds: [embed], components: row2Buttons.length ? [row1, row2] : [row1] };
}

export async function buildStaffPanelEmbedAndComponents(bankId: string) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) throw new Error("Bank not found");
  const bank = b[0];

  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();

  const accounts = await db.select({
    totalBalance: sql<number>`COALESCE(SUM(${bankAccounts.balance}), 0)`,
    count: sql<number>`COUNT(${bankAccounts.id})`
  }).from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.isSystem, false))).get();

  const pendingLoans = await db.select().from(loans).where(and(
    eq(loans.bankId, bankId),
    or(eq(loans.status, 'pending'), eq(loans.status, 'awaiting_signature'))
  ));
  const customers = await db.select({ count: sql<number>`COUNT(${bankCustomers.id})` }).from(bankCustomers).where(eq(bankCustomers.bankId, bankId)).get();

  const totalDepositsCents = accounts?.totalBalance || 0;
  const pendingCount = pendingLoans.length;
  const customerCount = customers?.count || 0;
  const color = brandColor(bank, settings);
  const logo = httpsUrl(settings?.logoUrl || bank.logoUrl);
  const staffUrl = staffPortalUrl(bank);
  const showLoans = settings?.enableLoans !== false;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${bank.name} · Staff`)
    .setDescription(
      `Teller desk and queue for **${bank.name}**.\n\n` +
      `**Deposits** · ${money(totalDepositsCents)}\n` +
      `**Customers** · ${customerCount}\n` +
      (showLoans ? `**Loan queue** · ${pendingCount} awaiting review\n` : '') +
      `**Hours** · ${bank.maintenanceMode ? 'Closed for maintenance' : 'Open'}`
    )
    .setTimestamp()
    .setFooter({ text: footerText(bank, settings), ...(logo ? { iconURL: logo } : {}) });

  if (logo) {
    embed.setThumbnail(logo);
    embed.setAuthor({ name: `${bank.name} Staff`, iconURL: logo });
  } else {
    embed.setAuthor({ name: `${bank.name} Staff` });
  }

  const row1Buttons: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId('staff_gui_overview').setLabel('Vault').setStyle(ButtonStyle.Primary).setEmoji('📊'),
    new ButtonBuilder().setCustomId('staff_gui_customer_search').setLabel('Lookup').setStyle(ButtonStyle.Secondary).setEmoji('👥'),
    new ButtonBuilder().setCustomId('staff_gui_audit_logs').setLabel('Audit').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
  ];
  if (showLoans) {
    row1Buttons.splice(1, 0,
      new ButtonBuilder()
        .setCustomId('staff_gui_loans')
        .setLabel(pendingCount > 0 ? `Loans (${pendingCount})` : 'Loans')
        .setStyle(pendingCount > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setEmoji('📋')
    );
  }
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row1Buttons.slice(0, 5));

  const row2Buttons: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId('staff_gui_teller_tx').setLabel('Teller').setStyle(ButtonStyle.Success).setEmoji('💵'),
    new ButtonBuilder().setCustomId('staff_gui_toggle_status').setLabel('Hours').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
  ];
  if (staffUrl) {
    row2Buttons.push(new ButtonBuilder().setLabel('Staff Portal').setStyle(ButtonStyle.Link).setURL(staffUrl).setEmoji('🌐'));
  }
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row2Buttons);

  return { embeds: [embed], components: [row1, row2] };
}

export async function refreshBankChannelGUIs(bankId: string, client?: Client | null) {
  try {
    const b = await db.select().from(banks).where(eq(banks.id, bankId));
    if (b.length === 0) return;

    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (!settings) return;

    if (!client) {
      const { botManager } = await import('./bot_manager');
      const instance = botManager.getInstance(bankId);
      if (!instance || instance.status !== 'online') return;
      client = instance.client;
    }

    if (settings.guiChannelId && settings.guiMessageId) {
      try {
        const channel = await client.channels.fetch(settings.guiChannelId);
        if (channel && channel.isTextBased() && 'messages' in channel) {
          const msg = await (channel as any).messages.fetch(settings.guiMessageId);
          if (msg) {
            const data = await buildPublicGUIEmbedAndComponents(bankId);
            await msg.edit(data);
          }
        }
      } catch (err) {
        console.error(`[BankBot ${bankId}] Failed to auto-update public GUI embed:`, err);
      }
    }

    if (settings.staffChannelId && settings.staffMessageId) {
      try {
        const channel = await client.channels.fetch(settings.staffChannelId);
        if (channel && channel.isTextBased() && 'messages' in channel) {
          const msg = await (channel as any).messages.fetch(settings.staffMessageId);
          if (msg) {
            const data = await buildStaffPanelEmbedAndComponents(bankId);
            await msg.edit(data);
          }
        }
      } catch (err) {
        console.error(`[BankBot ${bankId}] Failed to auto-update staff panel embed:`, err);
      }
    }
  } catch (e) {
    console.error(`[BankBot ${bankId}] Error in refreshBankChannelGUIs:`, e);
  }
}

async function safeReplyOrUpdate(interaction: any, payload: any) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  } catch (err) {
    try {
      await interaction.update(payload);
    } catch (e2) {
      console.error("safeReplyOrUpdate failed completely:", err, e2);
    }
  }
}

async function showMainMenu(bankId: string, interaction: any, isEphemeral: boolean = true, activeAccountId?: string) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const bank = b[0];
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const color = brandColor(bank, settings);
  const logo = httpsUrl(settings?.logoUrl || bank.logoUrl);
  const portalUrl = citizenPortalUrl(bank);

  const ids = await requireLinkedIds(interaction);
  if (!ids) return;
  const accounts = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, bankId), 
      inArray(bankAccounts.ownerDiscordId, ids),
      eq(bankAccounts.isSystem, false)
    )
  );

  const userMap = await db.select().from(users).where(inArray(users.linkedDiscordId, ids));
  const isLinked = userMap.length > 0;

  if (accounts.length === 0) {
    const welcome = (settings?.discordWelcome || '').trim();
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(bank.name)
      .setDescription(
        ((settings?.tagline || '').trim() ? `*${(settings?.tagline || '').trim()}*\n\n` : '') +
        (welcome || `You don't have an account with **${bank.name}** on this Discord yet.`) +
        `\n\nOpen the web portal to create an account, then come back and tap **Sync**.`
      )
      .addFields(
        {
          name: 'Minecraft',
          value: isLinked
            ? `Linked as **${userMap[0].mcUsername}**`
            : 'Not linked yet — sign in through CityCorp on the web portal.',
        },
      )
      .setFooter({ text: footerText(bank, settings), ...(logo ? { iconURL: logo } : {}) });
    if (logo) {
      embed.setThumbnail(logo);
      embed.setAuthor({ name: bank.name, iconURL: logo });
    } else {
      embed.setAuthor({ name: bank.name });
    }

    const onboardingButtons: ButtonBuilder[] = [
      new ButtonBuilder().setCustomId('bank_sync_account').setLabel('Sync').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
    ];
    if (portalUrl) {
      onboardingButtons.push(new ButtonBuilder().setLabel('Web Portal').setStyle(ButtonStyle.Link).setURL(portalUrl).setEmoji('🌐'));
    }
    const onboardingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(...onboardingButtons);

    const msg = {
      content: '',
      embeds: [embed],
      components: [onboardingRow],
      ephemeral: isEphemeral
    };

    if (!isEphemeral && interaction.channel) {
      await (interaction.channel as any).send({ embeds: [embed], components: [onboardingRow] });
      return;
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
    return;
  }

  let activeAccount = accounts[0];
  if (activeAccountId) {
    const found = accounts.find(a => a.id === activeAccountId);
    if (found) activeAccount = found;
  } else {
    const personal = accounts.find(a => a.accountType === 'personal');
    if (personal) activeAccount = personal;
  }

  const mcUsername = userMap[0]?.mcUsername || interaction.user.username;
  const customer = await db.select().from(bankCustomers).where(
    and(
      eq(bankCustomers.bankId, bankId),
      eq(bankCustomers.discordId, interaction.user.id)
    )
  ).limit(1);
  const registeredAddress = customer[0]?.address || customer[0]?.notes;

  const dashboardEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(activeAccount.accountName)
    .setDescription(`**${money(activeAccount.balance)}**`)
    .addFields(
      { name: 'Holder', value: mcUsername, inline: true },
      { name: 'Type', value: typeLabel(activeAccount.accountType), inline: true },
      ...(registeredAddress ? [{ name: 'Address', value: String(registeredAddress).slice(0, 256), inline: true }] : []),
    )
    .setFooter({ text: footerText(bank, settings), ...(logo ? { iconURL: logo } : {}) })
    .setTimestamp();
  if (logo) {
    dashboardEmbed.setThumbnail(logo);
    dashboardEmbed.setAuthor({ name: bank.name, iconURL: logo });
  } else {
    dashboardEmbed.setAuthor({ name: bank.name });
  }

  const selectMenuOptions = accounts.slice(0, 25).map(acc => ({
    label: `${acc.accountName}`.slice(0, 100),
    value: `select_acc_${acc.id}`,
    description: `${typeLabel(acc.accountType)} · ${money(acc.balance)}`.slice(0, 100),
    default: acc.id === activeAccount.id
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('bank_select_account')
    .setPlaceholder('Switch account')
    .addOptions(selectMenuOptions);
  
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bank_transfer_${activeAccount.id}`).setLabel('Transfer').setStyle(ButtonStyle.Primary).setEmoji('↔️'),
    new ButtonBuilder().setCustomId('bank_history').setLabel('Activity').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    new ButtonBuilder().setCustomId('bank_sync_account').setLabel('Sync').setStyle(ButtonStyle.Success).setEmoji('🔄')
  );

  const row2Buttons: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId('bank_open_business_modal').setLabel('New Business').setStyle(ButtonStyle.Success).setEmoji('🏢'),
  ];
  if (loansEnabled(settings) || accounts.length > 0) {
    // Always allow viewing existing loans; hide apply elsewhere.
    if (settings?.enableLoans !== false) {
      row2Buttons.push(new ButtonBuilder().setCustomId('bank_view_loans').setLabel('Loans').setStyle(ButtonStyle.Secondary).setEmoji('📄'));
    }
  }
  row2Buttons.push(new ButtonBuilder().setCustomId('bank_view_settings').setLabel('Profile').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'));
  if (portalUrl && row2Buttons.length < 5) {
    row2Buttons.push(new ButtonBuilder().setLabel('Portal').setStyle(ButtonStyle.Link).setURL(portalUrl).setEmoji('🌐'));
  }
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(...row2Buttons);

  const msg = {
    content: '',
    embeds: [dashboardEmbed],
    components: [selectRow, row1, row2],
    ephemeral: isEphemeral
  };

  if (!isEphemeral && interaction.channel) {
    await (interaction.channel as any).send({ embeds: [dashboardEmbed], components: [selectRow, row1, row2] });
    return;
  }

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(msg);
  } else {
    await interaction.reply(msg);
  }
}

async function handleButton(bankId: string, interaction: ButtonInteraction) {
  const cid = interaction.customId;

  if (cid === 'bank_main_menu' || cid === 'bank_gui_dashboard') {
    await interaction.deferUpdate();
    await showMainMenu(bankId, interaction);
    return;
  }
  
  if (cid === 'bank_balances') {
    await handleBalance(bankId, interaction);
  } else if (cid === 'bank_history' || cid === 'bank_gui_history') {
    await handleHistory(bankId, interaction);
  } else if (cid === 'bank_in_game_info' || cid === 'bank_gui_ingame') {
    await safeReplyOrUpdate(interaction, { 
      content: 'ℹ️ Account management, balances, and transfers are synchronized via the web portal or the **🔄 Sync Account** button on your banking menu.', 
      components: [backButtonRow] 
    });
  } else if (cid === 'bank_sync_account' || cid === 'bank_open_account' || cid === 'bank_gui_open_acc') {
    const b = await db.select().from(banks).where(eq(banks.id, bankId));
    if (b.length === 0) return;
    const bank = b[0];
    const portalUrl = citizenPortalUrl(bank);

    const ids = await getCandidateIdsForDiscordSnowflake(interaction.user.id);
    const isLinked = ids.length > 0;

    if (!isLinked) {
      await safeReplyOrUpdate(interaction, { 
        content: `Your Discord isn't linked yet.\n\n` +
          `1. Open the **${bank.name}** ${portalUrl ? `[web portal](${portalUrl})` : 'web portal'} and sign in with CityCorp.\n` +
          `2. Tap **Link Discord**.\n` +
          `3. Come back and tap **Sync**.`,
        components: [backButtonRow]
      });
      return;
    }

    const accounts = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.bankId, bankId), 
        inArray(bankAccounts.ownerDiscordId, ids),
        eq(bankAccounts.isSystem, false)
      )
    );

    if (accounts.length === 0) {
      await safeReplyOrUpdate(interaction, {
        content: `No **${bank.name}** account is linked to this Discord yet.\n\n` +
          `Open ${portalUrl ? `the **[web portal](${portalUrl})**` : 'the web portal'}, create an account, then tap **Sync**.`,
        components: [backButtonRow]
      });
      return;
    }

    // Accounts exist! Render dashboard
    if (interaction.deferred || interaction.replied) {
      await showMainMenu(bankId, interaction, true);
    } else {
      await interaction.deferUpdate();
      await showMainMenu(bankId, interaction, true);
    }
  } else if (cid === 'bank_open_business_modal') {
    const userMap = await db.select().from(users).where(
      or(eq(users.linkedDiscordId, interaction.user.id), eq(users.discordId, interaction.user.id))
    );
    const isLinked = userMap.length > 0 || (await getCandidateIdsForDiscordSnowflake(interaction.user.id)).length > 0;

    if (!isLinked) {
      await interaction.reply({ content: 'Link your Minecraft character on the web portal before opening a business account.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_open_business_account')
      .setTitle('Open Business Account');
      
    const nameInput = new TextInputBuilder()
      .setCustomId('account_name')
      .setLabel("Business / Corporation Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
    
    await interaction.showModal(modal);
  } else if (cid.startsWith('bank_transfer') || cid === 'bank_gui_transfer') {
    const parts = cid.split('_');
    const sourceAccId = parts.length > 2 ? parts[2] : null;

    const modal = new ModalBuilder()
      .setCustomId(sourceAccId ? `modal_transfer_${sourceAccId}` : 'modal_transfer')
      .setTitle('Transfer Funds');
      
    const toInput = new TextInputBuilder()
      .setCustomId('to_account')
      .setLabel("Destination Account Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    const amtInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel("Amount (in Dollars)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(toInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput)
    );
    await interaction.showModal(modal);
  } else if (cid === 'bank_gui_apply_loan') {
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (!loansEnabled(settings)) {
      await interaction.reply({ content: 'This bank is not accepting loan applications right now.', ephemeral: true });
      return;
    }
    const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
    if (userMap.length === 0) {
      await interaction.reply({ content: 'Link your Minecraft character on the web portal before applying for a loan.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_apply_loan')
      .setTitle('Apply for Bank Loan');

    const amtInput = new TextInputBuilder()
      .setCustomId('loan_amount')
      .setLabel("Requested Loan Amount ($)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("1000.00")
      .setRequired(true);

    const purposeInput = new TextInputBuilder()
      .setCustomId('loan_purpose')
      .setLabel("Purpose / Notes")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("e.g. Business expansion or shop restocking")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(purposeInput)
    );
    await interaction.showModal(modal);
  } else if (cid === 'bank_view_loans') {
    await handleViewLoans(bankId, interaction);
  } else if (cid === 'bank_view_settings') {
    await handleViewSettings(bankId, interaction);
  } else if (cid === 'bank_gui_rates') {
    await handleBankRates(bankId, interaction);
  } else if (cid === 'bank_gui_ingame') {
    await handleBankInGameInfo(bankId, interaction);
  } else if (cid.startsWith('bank_repay_loan_')) {
    const loanId = cid.replace('bank_repay_loan_', '');
    const modal = new ModalBuilder()
      .setCustomId(`modal_repay_loan_${loanId}`)
      .setTitle('Repay Bank Loan');

    const amtInput = new TextInputBuilder()
      .setCustomId('repay_amount')
      .setLabel("Payment Amount ($)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. 250.00")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput));
    await interaction.showModal(modal);
  }

  // --- STAFF PANEL BUTTON HANDLERS ---
  else if (cid === 'staff_gui_overview') {
    await handleStaffOverview(bankId, interaction);
  } else if (cid === 'staff_gui_audit_logs') {
    await handleStaffAuditLogs(bankId, interaction);
  } else if (cid === 'staff_gui_loans') {
    await handleStaffLoansList(bankId, interaction);
  } else if (cid.startsWith('staff_approve_loan_')) {
    const loanId = cid.replace('staff_approve_loan_', '');
    await handleStaffApproveLoan(bankId, interaction, loanId);
  } else if (cid.startsWith('staff_deny_loan_')) {
    const loanId = cid.replace('staff_deny_loan_', '');
    await handleStaffDenyLoan(bankId, interaction, loanId);
  } else if (cid === 'staff_gui_customer_search') {
    const modal = new ModalBuilder()
      .setCustomId('modal_customer_search')
      .setTitle('Customer Lookup');

    const searchInput = new TextInputBuilder()
      .setCustomId('search_query')
      .setLabel("Minecraft Username or Discord ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(searchInput));
    await interaction.showModal(modal);
  } else if (cid === 'staff_gui_teller_tx') {
    const modal = new ModalBuilder()
      .setCustomId('modal_staff_teller_tx')
      .setTitle('Teller Account Adjustment');

    const targetInput = new TextInputBuilder()
      .setCustomId('target_account')
      .setLabel("Account Name (e.g. personal)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const typeInput = new TextInputBuilder()
      .setCustomId('tx_type')
      .setLabel("Type: 'deposit' or 'withdraw'")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("deposit")
      .setRequired(true);

    const amtInput = new TextInputBuilder()
      .setCustomId('tx_amount')
      .setLabel("Amount ($)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId('tx_reason')
      .setLabel("Teller Reason / Audit Memo")
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(targetInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
    );
    await interaction.showModal(modal);
  } else if (cid === 'staff_gui_toggle_status') {
    await handleStaffToggleStatus(bankId, interaction);
  }
}

async function handleModal(bankId: string, interaction: ModalSubmitInteraction) {
  try {
    if (interaction.customId === 'modal_open_account') {
      const name = interaction.fields.getTextInputValue('account_name');
      await handleOpenAccount(bankId, interaction, name, 'personal');
    } else if (interaction.customId === 'modal_open_business_account') {
      const name = interaction.fields.getTextInputValue('account_name');
      await handleOpenAccount(bankId, interaction, name, 'business');
    } else if (interaction.customId.startsWith('modal_transfer')) {
      const parts = interaction.customId.split('_');
      const sourceAccId = parts.length > 2 ? parts[2] : null;
      const toAccount = interaction.fields.getTextInputValue('to_account');
      const amountStr = interaction.fields.getTextInputValue('amount');
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ content: 'Invalid amount. Must be a positive number.', ephemeral: true });
        return;
      }
      await handleTransfer(bankId, interaction, toAccount, amount, sourceAccId);
    } else if (interaction.customId === 'modal_apply_loan') {
      const amountStr = interaction.fields.getTextInputValue('loan_amount');
      const purpose = interaction.fields.getTextInputValue('loan_purpose');
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ content: 'Invalid loan amount.', ephemeral: true });
        return;
      }
      await handleApplyLoanModal(bankId, interaction, amount, purpose);
    } else if (interaction.customId.startsWith('modal_repay_loan_')) {
      const loanId = interaction.customId.replace('modal_repay_loan_', '');
      const amountStr = interaction.fields.getTextInputValue('repay_amount');
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ content: 'Invalid repayment amount.', ephemeral: true });
        return;
      }
      await handleRepayLoanModal(bankId, interaction, loanId, amount);
    } else if (interaction.customId === 'modal_customer_search') {
      const query = interaction.fields.getTextInputValue('search_query');
      await handleCustomerSearchModal(bankId, interaction, query);
    } else if (interaction.customId === 'modal_staff_teller_tx') {
      const targetAcc = interaction.fields.getTextInputValue('target_account');
      const txType = interaction.fields.getTextInputValue('tx_type').toLowerCase();
      const amount = parseFloat(interaction.fields.getTextInputValue('tx_amount'));
      const reason = interaction.fields.getTextInputValue('tx_reason') || "Teller manual adjustment";
      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ content: 'Invalid transaction amount.', ephemeral: true });
        return;
      }
      await handleStaffTellerTxModal(bankId, interaction, targetAcc, txType, amount, reason);
    }
  } catch (e) {
    console.error(e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An internal error occurred.', ephemeral: true });
    }
  }
}

const backButtonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_main_menu').setLabel('🔙 Back to Menu').setStyle(ButtonStyle.Secondary)
);

async function handleBalance(bankId: string, interaction: ButtonInteraction) {
  const ids = await requireLinkedIds(interaction);
  if (!ids) return;
  const accounts = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, bankId), 
      inArray(bankAccounts.ownerDiscordId, ids)
    )
  );

  if (accounts.length === 0) {
    await safeReplyOrUpdate(interaction, { content: 'You do not have any bank accounts registered here. Create an account on the web portal and click "Sync Account".', components: [backButtonRow] });
    return;
  }

  const list = accounts.map(a => `**${a.accountName}**: $${(a.balance / 100).toFixed(2)}`).join('\n');
  await safeReplyOrUpdate(interaction, { 
    content: `🏦 **Your Open Accounts**\n${list}`, 
    components: [backButtonRow]
  });
}

async function handleOpenAccount(bankId: string, interaction: ModalSubmitInteraction, _name: string, _type: string = 'personal') {
  await interaction.deferReply({ ephemeral: true });
  const ids = await requireLinkedIds(interaction);
  if (!ids) return;
  await interaction.editReply({ content: 'Open new accounts in the bank portal after signing in with CityCorp. Discord only operates accounts you already hold.', components: [backButtonRow] });
}

async function handleTransfer(bankId: string, interaction: ModalSubmitInteraction, toAccountName: string, amount: number, sourceAccId?: string | null) {
  await interaction.deferReply({ ephemeral: true });
  const amountInCents = Math.round(amount * 100);

  const ids = await requireLinkedIds(interaction);
  if (!ids) return;

  // Source accounts — must belong to this bank and this user
  let sourceAccount;
  if (sourceAccId) {
    const accs = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.id, sourceAccId),
        eq(bankAccounts.bankId, bankId),
        inArray(bankAccounts.ownerDiscordId, ids)
      )
    );
    if (accs.length > 0) sourceAccount = accs[0];
  }

  if (!sourceAccount) {
    const sourceAccounts = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.bankId, bankId), 
        inArray(bankAccounts.ownerDiscordId, ids)
      )
    );
    if (sourceAccounts.length === 0) {
      await interaction.editReply({ content: 'You do not have any bank accounts open here.' });
      return;
    }
    sourceAccount = sourceAccounts[0];
  }

  if (sourceAccount.balance < amountInCents) {
    await interaction.editReply({ content: `Insufficient funds. Your balance is $${(sourceAccount.balance / 100).toFixed(2)}.` });
    return;
  }

  const { resolvePayableAccount } = await import('./account_lookup');
  const destResolved = await resolvePayableAccount(toAccountName, { bankId, excludeId: sourceAccount.id });
  if (!destResolved.account) {
    await interaction.editReply({ content: destResolved.error || `Destination account **${toAccountName}** not found at this bank.` });
    return;
  }
  const destAccount = destResolved.account;

  if (sourceAccount.id === destAccount.id) {
    await interaction.editReply({ content: 'Cannot transfer to the same account.' });
    return;
  }

  const client = await getBankClient(bankId);
  if (!client) {
    await interaction.editReply({ content: 'This bank is not connected to CityCorp. Transfers are unavailable.' });
    return;
  }
  try {
    const { executeSameBankBookTransfer } = await import('./citycorp_money');
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    await executeSameBankBookTransfer({
      sourceAccount,
      destAccount,
      desiredCents: amountInCents,
      mode: (settings?.defaultFeePayerMode as any) || 'from_payment',
      description: `Transfer to ${toAccountName}`,
    });
    await interaction.editReply({ content: `✅ Transferred $${amount.toFixed(2)} from **${sourceAccount.accountName}** to **${destAccount.accountName}** via CityCorp.` });
  } catch (e: any) {
    await interaction.editReply({ content: `CityCorp Transfer Failed: ${e.message}` });
  }
}

async function handleHistory(bankId: string, interaction: ButtonInteraction) {
  const { or, desc } = await import('drizzle-orm');
  const ids = await requireLinkedIds(interaction);
  if (!ids) return;
  
  const myAccounts = await db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.bankId, bankId), inArray(bankAccounts.ownerDiscordId, ids)));
    
  if (myAccounts.length === 0) {
    await safeReplyOrUpdate(interaction, { content: 'You have no accounts in this bank.', components: [backButtonRow] });
    return;
  }
  
  const accountIds = myAccounts.map(a => a.id);
  
  const txHistory = await db.select().from(transactions)
    .where(and(
      eq(transactions.bankId, bankId),
      or(
        ...accountIds.map(id => eq(transactions.fromAccountId, id)),
        ...accountIds.map(id => eq(transactions.toAccountId, id))
      )
    ))
    .orderBy(desc(transactions.timestamp))
    .limit(15);
    
  if (txHistory.length === 0) {
    await safeReplyOrUpdate(interaction, { content: 'No recent transactions found.', components: [backButtonRow] });
    return;
  }
  
  let historyTxt = '';
  for (const tx of txHistory) {
    let prefix = '';
    if (accountIds.includes(tx.fromAccountId!) && accountIds.includes(tx.toAccountId!)) {
      prefix = '🔄 Internal: ';
    } else if (accountIds.includes(tx.fromAccountId!)) {
      prefix = '🔴 Out: ';
    } else {
      prefix = '🟢 In: ';
    }
    historyTxt += `${prefix} $${(tx.amount / 100).toFixed(2)} (${tx.type}) - <t:${Math.floor(tx.timestamp.getTime()/1000)}:R> - ${tx.description}\n`;
  }
  
  await safeReplyOrUpdate(interaction, { content: `📜 **Your Recent Transactions**\n\n${historyTxt}`, components: [backButtonRow] });
}

async function handleViewLoans(bankId: string, interaction: ButtonInteraction) {
  const myLoans = await db.select().from(loans).where(and(eq(loans.bankId, bankId), eq(loans.discordId, interaction.user.id)));
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  
  if (myLoans.length === 0) {
    await safeReplyOrUpdate(interaction, {
      content: settings?.enableLoans === false
        ? "This bank is not offering loans right now."
        : "You have no loans with this bank.",
      components: [backButtonRow]
    });
    return;
  }

  const list = myLoans.map(l => {
    const statusEmoji = l.status === 'active' ? '🟢' : l.status === 'pending' ? '🟡' : '🔴';
    return `${statusEmoji} **Loan ID**: \`${l.id}\`\n**Principal**: $${(l.principalAmount / 100).toFixed(2)}\n**Remaining**: $${(l.remainingAmount / 100).toFixed(2)}\n**Interest**: ${(l.interestRate / 100).toFixed(2)}%\n**Status**: ${l.status?.toUpperCase()}`;
  }).join('\n\n');

  const repayableLoans = myLoans.filter(l => (l.status === 'active' || l.status === 'delinquent' || l.status === 'defaulted') && l.remainingAmount > 0);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [backButtonRow];

  if (repayableLoans.length > 0) {
    const repayRow = new ActionRowBuilder<ButtonBuilder>();
    for (const l of repayableLoans.slice(0, 4)) {
      repayRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`bank_repay_loan_${l.id}`)
          .setLabel(`💸 Repay Loan (${l.id.substring(0, 6)})`)
          .setStyle(ButtonStyle.Success)
      );
    }
    rows.unshift(repayRow);
  }

  await safeReplyOrUpdate(interaction, {
    content: `📝 **Your Loans with This Bank**\n\n${list}`,
    components: rows
  });
}

async function handleViewSettings(bankId: string, interaction: ButtonInteraction) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
  const mcUsername = userMap[0]?.mcUsername;
  const portalUrl = b ? citizenPortalUrl(b) : null;
  const color = brandColor(b || { brandingColor: null }, settings);
  const logo = httpsUrl(settings?.logoUrl || b?.logoUrl);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(b?.name || 'Profile')
    .setDescription(`<@${interaction.user.id}>`)
    .addFields(
      { name: 'Minecraft', value: mcUsername ? `**${mcUsername}**` : 'Not linked', inline: true },
    )
    .setFooter({ text: footerText(b || { name: 'Bank' }, settings), ...(logo ? { iconURL: logo } : {}) });
  if (logo) embed.setThumbnail(logo);

  const buttons: ButtonBuilder[] = [];
  if (portalUrl) {
    buttons.push(new ButtonBuilder().setLabel('Web Portal').setStyle(ButtonStyle.Link).setURL(portalUrl).setEmoji('🌐'));
  }
  buttons.push(new ButtonBuilder().setCustomId('bank_main_menu').setLabel('Back').setStyle(ButtonStyle.Secondary));

  await safeReplyOrUpdate(interaction, {
    content: '',
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)],
  });
}

async function handleApplyLoanModal(bankId: string, interaction: ModalSubmitInteraction, amount: number, purpose: string) {
  await interaction.deferReply({ ephemeral: true });
  const amountInCents = Math.round(amount * 100);

  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  if (!loansEnabled(settings)) {
    await interaction.editReply({ content: 'This bank is not currently accepting loan applications.' });
    return;
  }

  const ids = await requireLinkedIds(interaction);
  if (!ids) return;
  const userAccs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), inArray(bankAccounts.ownerDiscordId, ids)));
  const liveAccs = userAccs.filter(a => a.isActive && !a.isFrozen && a.existsInGame !== false);
  if (liveAccs.length === 0) {
    await interaction.editReply({ content: '❌ You need an existing CityCorp-linked account at this bank before applying for a loan. Open an account first.' });
    return;
  }
  const personal = liveAccs.find(a => a.accountType === 'personal') || liveAccs[0];

  try {
    const { submitLoanApplication } = await import('../server/loan_processor');
    const result = await submitLoanApplication({
      bankId,
      discordId: interaction.user.id,
      accountId: personal.id,
      principalAmount: amountInCents,
      purpose,
      allowAutoApprove: true,
    });

    await db.insert(auditLogs).values({
      id: uuidv4(),
      bankId,
      userDiscordId: interaction.user.id,
      action: 'LOAN_APPLICATION_SUBMITTED',
      details: `Applied for $${amount.toFixed(2)} loan. Purpose: ${purpose}. Status: ${result.status}`,
      timestamp: new Date()
    });

    refreshBankChannelGUIs(bankId);

    const statusLine = result.status === 'active'
      ? '🟢 AUTO-APPROVED AND DISBURSED'
      : result.awaitingSignature
        ? '📝 AWAITING YOUR SIGNATURE'
        : '🟡 PENDING REVIEW BY BANK STAFF';

    await interaction.editReply({
      content: `✅ **Loan Application Submitted!**\n\n` +
        `**Amount**: $${amount.toFixed(2)}\n` +
        `**Purpose**: ${purpose}\n` +
        `**Status**: ${statusLine}`
    });
  } catch (e: any) {
    await interaction.editReply({ content: `❌ ${e.message || 'Loan application failed.'}` });
  }
}

async function handleStaffOverview(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const bank = b[0];

  const sysAccounts = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.isSystem, true)));
  const totalAccs = await db.select({ count: sql<number>`COUNT(${bankAccounts.id})`, sum: sql<number>`COALESCE(SUM(${bankAccounts.balance}), 0)` }).from(bankAccounts).where(eq(bankAccounts.bankId, bankId)).get();

  let sysTxt = sysAccounts.map(a => `• **${a.accountName}**: $${(a.balance / 100).toFixed(2)}`).join('\n');
  if (!sysTxt) sysTxt = '• No dedicated system reserve accounts configured.';

  await interaction.editReply({
    content: `📊 **${bank.name} • System Vault & Liquidity Breakdown**\n\n` +
      `💰 **Total Customer Deposits**: **$${((totalAccs?.sum || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}**\n` +
      `👥 **Total Accounts**: **${totalAccs?.count || 0}**\n\n` +
      `🏦 **System Reserve Accounts**:\n${sysTxt}\n\n` +
      `⚙️ **Bank Status**: ${bank.maintenanceMode ? '⚠️ Maintenance Mode' : '🟢 Online'}\n` +
      `🔗 **CityCorp ID**: \`${bank.corpId || 'N/A'}\``
  });
}

async function handleStaffLoansList(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const pending = await db.select().from(loans).where(and(
    eq(loans.bankId, bankId),
    or(eq(loans.status, 'pending'), eq(loans.status, 'awaiting_signature'))
  )).limit(5);

  if (pending.length === 0) {
    await interaction.editReply({ content: "✅ **No Pending Loan Applications**\nAll loan applications have been processed." });
    return;
  }

  let txt = `📋 **Pending Loan Applications (${pending.length})**\n\n`;
  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  for (const l of pending) {
    const shortId = l.id.substring(0, 8);
    txt += `• **ID**: \`${shortId}\` | **Applicant**: <@${l.discordId}>\n` +
      `  **Amount**: **$${(l.principalAmount / 100).toFixed(2)}** | **Interest**: ${(l.interestRate / 100).toFixed(2)}%\n\n`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`staff_approve_loan_${l.id}`).setLabel(`Approve $${(l.principalAmount / 100).toFixed(0)} (${shortId})`).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`staff_deny_loan_${l.id}`).setLabel(`Deny (${shortId})`).setStyle(ButtonStyle.Danger)
    );
    components.push(row);
  }

  await interaction.editReply({ content: txt, components });
}

async function handleStaffApproveLoan(bankId: string, interaction: ButtonInteraction, loanId: string) {
  await interaction.deferReply({ ephemeral: true });

  const l = await db.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.bankId, bankId)));
  if (l.length === 0) {
    await interaction.editReply({ content: "❌ Loan application not found." });
    return;
  }

  const loan = l[0];
  if (loan.status !== 'pending' && loan.status !== 'awaiting_signature') {
    await interaction.editReply({ content: `❌ Loan is already ${loan.status}.` });
    return;
  }

  try {
    const { disburseLoan } = await import('../server/loan_processor');
    await disburseLoan(loan);
  } catch (e: any) {
    console.error("[StaffApproveLoan] disbursement failed", e);
    await interaction.editReply({ content: `❌ Loan disbursement failed: ${e.message || "CityCorp pool transfer failed"}` });
    return;
  }

  await db.update(loans).set({ status: 'active' }).where(eq(loans.id, loanId));

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId,
    userDiscordId: interaction.user.id,
    action: 'LOAN_APPROVED',
    details: `Staff approved loan ${loanId} for user ${loan.discordId} ($${(loan.principalAmount/100).toFixed(2)})`,
    timestamp: new Date()
  });

  refreshBankChannelGUIs(bankId);

  await interaction.editReply({ content: `✅ **Loan Approved & Disbursed!**\nLoan ID \`${loanId.substring(0, 8)}\` approved for <@${loan.discordId}>. Funds credited via CityCorp.` });
}

async function handleStaffDenyLoan(bankId: string, interaction: ButtonInteraction, loanId: string) {
  await interaction.deferReply({ ephemeral: true });

  const l = await db.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.bankId, bankId)));
  if (l.length === 0) {
    await interaction.editReply({ content: "❌ Loan application not found." });
    return;
  }

  const loan = l[0];
  if (loan.status !== 'pending' && loan.status !== 'awaiting_signature') {
    await interaction.editReply({ content: "❌ Loan application is no longer pending." });
    return;
  }

  await db.update(loans).set({ status: 'rejected' }).where(eq(loans.id, loanId));

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId,
    userDiscordId: interaction.user.id,
    action: 'LOAN_REJECTED',
    details: `Staff denied loan ${loanId} for user ${l[0].discordId}`,
    timestamp: new Date()
  });

  refreshBankChannelGUIs(bankId);

  await interaction.editReply({ content: `🔴 **Loan Application Denied.**\nLoan ID \`${loanId.substring(0, 8)}\` marked as rejected.` });
}

async function handleCustomerSearchModal(bankId: string, interaction: ModalSubmitInteraction, query: string) {
  await interaction.deferReply({ ephemeral: true });

  const foundUsers = await db.select().from(users).where(
    or(
      eq(users.mcUsername, query),
      eq(users.discordId, query)
    )
  );

  if (foundUsers.length === 0) {
    await interaction.editReply({ content: `❌ No citizen found matching username or ID **${query}**.` });
    return;
  }

  const u = foundUsers[0];
  const userAccs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, u.discordId)));

  let accsTxt = userAccs.map(a => `• **${a.accountName}** (${a.accountType}): **$${(a.balance / 100).toFixed(2)}**`).join('\n');
  if (!accsTxt) accsTxt = '• No bank accounts open at this bank.';

  await interaction.editReply({
    content: `🔍 **Citizen Profile Lookup**\n\n` +
      `👤 **Minecraft Username**: **${u.mcUsername}**\n` +
      `🆔 **Discord**: <@${u.discordId}> (\`${u.discordId}\`)\n` +
      `🔑 **UUID**: \`${u.mcUuid}\`\n\n` +
      `🏦 **Accounts at this Bank**:\n${accsTxt}`
  });
}

async function handleStaffTellerTxModal(bankId: string, interaction: ModalSubmitInteraction, targetAccName: string, type: string, amount: number, reason: string) {
  await interaction.deferReply({ ephemeral: true });
  const amountCents = Math.round(amount * 100);

  const accs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.accountName, targetAccName)));
  if (accs.length === 0) {
    await interaction.editReply({ content: `❌ Bank account **${targetAccName}** not found.` });
    return;
  }

  const acc = accs[0];

  if (type === 'withdraw' && acc.balance < amountCents) {
    await interaction.editReply({ content: `❌ Cannot withdraw. Account balance is $${(acc.balance / 100).toFixed(2)}.` });
    return;
  }

  const bankRow = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  if (!bankRow?.corpId || !bankRow.corpApiUuid || !bankRow.corpApiKey) {
    await interaction.editReply({ content: 'This bank is not connected to CityCorp. Teller cash window is unavailable.' });
    return;
  }

  const { CityCorpClient } = await import('./citycorp_api');
  const { refreshAccountCache } = await import('./citycorp_money');
  const client = new CityCorpClient(bankRow.corpId, bankRow.corpApiUuid, bankRow.corpApiKey, bankId);
  const clientRes = type === 'deposit'
    ? await client.deposit(acc.accountName, amountCents / 100)
    : await client.withdraw(acc.accountName, amountCents / 100);

  if (clientRes && clientRes.success === false) {
    await interaction.editReply({ content: `❌ CityCorp teller ${type} failed: ${clientRes.message || 'unknown error'}` });
    return;
  }

  const live = await refreshAccountCache({
    bankId,
    accountName: acc.accountName,
    accountId: acc.id,
    client,
  });
  if (live == null) {
    await interaction.editReply({ content: 'CityCorp did not confirm the new balance. No local funds were created. Try again.' });
    return;
  }
  const newBalance = live;

  await db.insert(transactions).values({
    id: uuidv4(),
    bankId,
    toAccountId: type === 'deposit' ? acc.id : undefined,
    fromAccountId: type === 'withdraw' ? acc.id : undefined,
    amount: amountCents,
    type: type === 'deposit' ? 'deposit' : 'withdraw',
    description: `Teller Adjustment: ${reason}`,
    timestamp: new Date()
  });

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId,
    userDiscordId: interaction.user.id,
    action: `TELLER_${type.toUpperCase()}`,
    details: `Teller adjusted ${targetAccName} by $${amount.toFixed(2)} (${type}). Reason: ${reason}`,
    timestamp: new Date()
  });

  refreshBankChannelGUIs(bankId);

  await interaction.editReply({ content: `✅ **Teller Transaction Complete!**\nAdjusted account **${targetAccName}** (${type.toUpperCase()}) by **$${amount.toFixed(2)}**.\nNew Balance: **$${(newBalance / 100).toFixed(2)}**.` });
}

async function handleStaffToggleStatus(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const currentMode = b[0].maintenanceMode;
  const newMode = !currentMode;

  await db.update(banks).set({ maintenanceMode: newMode }).where(eq(banks.id, bankId));

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId,
    userDiscordId: interaction.user.id,
    action: 'BANK_STATUS_TOGGLED',
    details: `Toggled maintenance mode to ${newMode}`,
    timestamp: new Date()
  });

  refreshBankChannelGUIs(bankId);
  const { botManager } = await import('./bot_manager');
  await botManager.updateBankBotPresence(bankId, newMode);

  await interaction.editReply({ content: `⚙️ **Bank Operating Mode Updated!**\nMaintenance Mode is now: **${newMode ? 'ENABLED (Maintenance)' : 'DISABLED (Online)'}**.` });
}

async function handleBankRates(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const bank = b[0];
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
  const { loadLoanPolicy, productAprToLoanRate } = await import('../server/loan_processor');
  const policy = await loadLoanPolicy(bankId);
  const color = brandColor(bank, settings);
  const logo = httpsUrl(settings?.logoUrl || bank.logoUrl);

  const savingsApy = ((settings?.savingsApyPercent || 0) / 100).toFixed(2);
  const depositFee = Number(settings?.depositFeePercent || 0);
  const withdrawFee = Number(settings?.withdrawFeePercent || 0);
  const transferFee = Number(settings?.transferFeePercent || 0);
  const defaultApr = (policy.defaultApr / 100).toFixed(2);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${bank.name} · Rates`)
    .setDescription((settings?.tagline || '').trim() ? `*${(settings?.tagline || '').trim()}*` : `Published rates for **${bank.name}**.`)
    .addFields(
      { name: 'Savings APY', value: `${savingsApy}%`, inline: true },
      { name: 'Deposit fee', value: `${depositFee}%`, inline: true },
      { name: 'Withdraw fee', value: `${withdrawFee}%`, inline: true },
      { name: 'Transfer fee', value: `${transferFee}%`, inline: true },
    )
    .setFooter({ text: footerText(bank, settings), ...(logo ? { iconURL: logo } : {}) })
    .setTimestamp();
  if (logo) embed.setThumbnail(logo);

  if (settings?.enableLoans !== false) {
    const products = await db.select().from(loanProducts).where(
      and(eq(loanProducts.bankId, bankId), eq(loanProducts.isActive, true))
    ).limit(6);
    if (products.length > 0) {
      const lines = products.map((p) => {
        const apr = (productAprToLoanRate(p.interestRate) / 100).toFixed(2);
        const max = money(p.maxAmount);
        const term = p.termDays ? `${Math.round(p.termDays / 30)} mo` : `${policy.defaultTermMonths} mo`;
        return `**${p.name}** — ${apr}% APR · up to ${max} · ${term}`;
      });
      embed.addFields({ name: 'Loan products', value: lines.join('\n').slice(0, 1024) });
    } else {
      embed.addFields({
        name: 'Loans',
        value: `${defaultApr}% APR · ${policy.defaultTermMonths} month term` +
          (policy.maxAmountCents > 0 ? ` · up to ${money(policy.maxAmountCents)}` : ''),
      });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

async function handleStaffAuditLogs(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const logs = await db.select().from(auditLogs)
    .where(eq(auditLogs.bankId, bankId))
    .orderBy(desc(auditLogs.timestamp))
    .limit(10);

  if (logs.length === 0) {
    await interaction.editReply({ content: "📜 **No Staff Audit Logs Found**\nNo staff operations recorded yet." });
    return;
  }

  let logTxt = `📜 **Recent Staff & Audit Activity (Last 10 Logs)**\n\n`;
  for (const log of logs) {
    const timeStr = `<t:${Math.floor(log.timestamp.getTime()/1000)}:R>`;
    const userMention = log.userDiscordId ? `<@${log.userDiscordId}>` : 'System';
    logTxt += `• **${log.action}** by ${userMention} (${timeStr})\n  \`${log.details}\`\n\n`;
  }

  await interaction.editReply({ content: logTxt });
}

async function handleRepayLoanModal(bankId: string, interaction: ModalSubmitInteraction, loanId: string, amount: number) {
  await interaction.deferReply({ ephemeral: true });

  const amountCents = Math.round(amount * 100);

  const targetLoans = await db.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.bankId, bankId)));
  if (targetLoans.length === 0) {
    await interaction.editReply({ content: '❌ Loan not found.' });
    return;
  }

  const loan = targetLoans[0];
  if (loan.discordId !== interaction.user.id) {
    await interaction.editReply({ content: '❌ You can only repay your own loans from Discord.' });
    return;
  }
  if (loan.remainingAmount <= 0 || loan.status === 'paid' || loan.status === 'paid_off') {
    await interaction.editReply({ content: '✅ This loan has already been paid off in full!' });
    return;
  }

  const account = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, loan.accountId), eq(bankAccounts.bankId, bankId))).get();
  if (!account) {
    await interaction.editReply({ content: '❌ Linked loan account not found.' });
    return;
  }

  try {
    const { collectLoanPayment } = await import('../server/loan_processor');
    const result = await collectLoanPayment({
      loan,
      fromAccount: account,
      amountCents,
    });
    await interaction.editReply({
      content: 
        `🎉 **Loan Repayment Processed!**\n\n` +
        `💸 **Payment Amount**: **$${(result.appliedCents / 100).toFixed(2)}**\n` +
        `💳 **Source Account**: **${account.accountName}**\n` +
        `📉 **Remaining Loan Balance**: **$${(result.newRemaining / 100).toFixed(2)}**\n` +
        `🏷️ **Status**: **${result.status.toUpperCase()}**`
    });
  } catch (e: any) {
    console.error("[RepayLoan] collect failed", e);
    await interaction.editReply({ content: `❌ Loan repayment failed: ${e.message || "CityCorp collection failed"}` });
  }
}

async function handleBankInGameInfo(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const bank = b[0];
  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();

  const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
  const isLinked = userMap.length > 0;
  const mcUser = isLinked ? userMap[0].mcUsername : null;
  const portalUrl = citizenPortalUrl(bank);
  const color = brandColor(bank, settings);
  const logo = httpsUrl(settings?.logoUrl || bank.logoUrl);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${bank.name} · In-game`)
    .setDescription(
      isLinked
        ? `Linked as **${mcUser}**.\n\nDeposit and withdraw in-game through CityCorp on the **${bank.name}** account that matches your portal account name.`
        : `Minecraft isn't linked yet. Open ${portalUrl ? `[the web portal](${portalUrl})` : 'the web portal'} and sign in with CityCorp.`
    )
    .setFooter({ text: footerText(bank, settings), ...(logo ? { iconURL: logo } : {}) })
    .setTimestamp();
  if (logo) embed.setThumbnail(logo);
  if (isLinked && mcUser) {
    embed.setThumbnail(`https://mc-heads.net/avatar/${encodeURIComponent(mcUser)}/100`);
  }

  await interaction.editReply({ embeds: [embed] });
}


