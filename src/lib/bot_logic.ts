import { REST, Routes, Interaction, CacheType, SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonInteraction, StringSelectMenuBuilder, Client } from 'discord.js';
import { db } from '../db/index';
import { banks, bankAccounts, transactions, users, bankCustomers, loans, bankSettings, bankStaff, auditLogs, globalAdmins } from '../db/schema';
import { eq, and, sql, or, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CityCorpClient } from './citycorp_api';

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
    .setDescription('Open the Bank Dashboard (Personal Overlay).'),
  new SlashCommandBuilder()
    .setName('spawn_menu')
    .setDescription('Admin only: Spawn a permanent banking menu in this channel.')
    .setDefaultMemberPermissions(8),
  new SlashCommandBuilder()
    .setName('setup_gui')
    .setDescription('Admin only: Spawn/Bind the auto-updating Public Banking Portal GUI in this channel.')
    .setDefaultMemberPermissions(8),
  new SlashCommandBuilder()
    .setName('setup_staff_panel')
    .setDescription('Staff only: Spawn/Bind the auto-updating Staff Command Panel in this channel.')
    .setDefaultMemberPermissions(8),
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
      const msg = `⚠️ **Bank Maintenance Active**: **${b[0].name}** is currently undergoing maintenance and staff testing. Standard customer operations are temporarily suspended. Please check back later!`;
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
    } else if (interaction.commandName === 'spawn_menu' || interaction.commandName === 'spawn_atm') {
      await showMainMenu(bankId, interaction, false);
      await interaction.reply({ content: "Banking menu spawned below.", ephemeral: true });
    } else if (interaction.commandName === 'setup_gui') {
      await setupGUICommand(bankId, interaction);
    } else if (interaction.commandName === 'setup_staff_panel') {
      await setupStaffPanelCommand(bankId, interaction);
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

  const accounts = await db.select({
    totalBalance: sql<number>`COALESCE(SUM(${bankAccounts.balance}), 0)`,
    count: sql<number>`COUNT(${bankAccounts.id})`
  }).from(bankAccounts).where(eq(bankAccounts.bankId, bankId)).get();

  const totalDepositsCents = accounts?.totalBalance || 0;
  const accountCount = accounts?.count || 0;

  const hexColor = bank.brandingColor ? parseInt(bank.brandingColor.replace('#', ''), 16) : 0x4f46e5;
  const portalUrl = bank.customDomain 
    ? `https://${bank.customDomain}/` 
    : `https://ais-dev-x33dat556cunbev6anuble-271675189999.us-east1.run.app/portal/${bankId}`;

  const statusText = bank.maintenanceMode ? '⚠️ Maintenance Mode' : '🟢 Online & Active';
  const corpText = bank.corpId ? '⚡ CityCorp Gateway Sync' : '🏛️ Standalone Slate PSP Ledger';

  const embed = {
    title: `🏛️ ${bank.name} • Official Banking Terminal`,
    description: `Welcome to **${bank.name}**! Click below to access your accounts, transfer funds, or apply for credit services.\n\n` +
      `**Status**: ${statusText}\n` +
      `**Total Bank Reserves**: **$${(totalDepositsCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n` +
      `**Active Accounts**: **${accountCount}** registered\n` +
      `**CityCorp Integration**: ${corpText}\n\n` +
      `🌐 **Web Banking Portal**: [Open Citizen Web Portal](${portalUrl})\n` +
      `──────────────────────────────────────────────`,
    color: hexColor,
    thumbnail: settings?.logoUrl ? { url: settings.logoUrl } : undefined,
    fields: [
      {
        name: '💳 Citizen Banking Features',
        value: '• **Open My Dashboard**: Personal account picker & balance\n• **Open Account**: Personal or business accounts\n• **Quick Transfer**: Send funds instantly',
        inline: true
      },
      {
        name: '📄 Credit & Services',
        value: '• **Apply for Loan**: Instant credit application\n• **My History**: View recent transactions\n• **In-Game Commands**: CityCorp banking commands',
        inline: true
      }
    ],
    footer: { text: `Slate SaaS Onyx Network • Live Auto-Update • Bank ID: ${bank.id.substring(0, 8)}` },
    timestamp: new Date().toISOString()
  };

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_gui_dashboard').setLabel('🏦 Open My Dashboard').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bank_gui_open_acc').setLabel('💳 Open Account').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bank_gui_transfer').setLabel('↔️ Quick Transfer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bank_gui_history').setLabel('📄 My History').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_gui_apply_loan').setLabel('📝 Apply for Loan').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bank_gui_rates').setLabel('📈 Rates & Yields').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bank_gui_ingame').setLabel('ℹ️ In-Game Info').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🌐 Web Portal').setStyle(ButtonStyle.Link).setURL(portalUrl)
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function buildStaffPanelEmbedAndComponents(bankId: string) {
  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) throw new Error("Bank not found");
  const bank = b[0];

  const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();

  const accounts = await db.select({
    totalBalance: sql<number>`COALESCE(SUM(${bankAccounts.balance}), 0)`,
    count: sql<number>`COUNT(${bankAccounts.id})`
  }).from(bankAccounts).where(eq(bankAccounts.bankId, bankId)).get();

  const pendingLoans = await db.select().from(loans).where(and(eq(loans.bankId, bankId), eq(loans.status, 'pending')));
  const customers = await db.select({ count: sql<number>`COUNT(${bankCustomers.id})` }).from(bankCustomers).where(eq(bankCustomers.bankId, bankId)).get();

  const totalDepositsCents = accounts?.totalBalance || 0;
  const pendingCount = pendingLoans.length;
  const customerCount = customers?.count || 0;

  const hexColor = 0xf59e0b; // Gold/Amber accent
  const staffPortalUrl = bank.customDomain 
    ? `https://${bank.customDomain}/portal/${bankId}/staff` 
    : `https://ais-dev-x33dat556cunbev6anuble-271675189999.us-east1.run.app/portal/${bankId}/staff`;

  const embed = {
    title: `🛡️ ${bank.name} • Staff Command & Operations Panel`,
    description: `Operational control center for **${bank.name}** staff, tellers, and managers.\n\n` +
      `💰 **Reserve Liquidity**: **$${(totalDepositsCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}**\n` +
      `📋 **Pending Loans Queue**: **${pendingCount} Applications**\n` +
      `👥 **Total Customers**: **${customerCount}**\n` +
      `⚙️ **Bank Mode**: **${bank.maintenanceMode ? '⚠️ MAINTENANCE' : '🟢 ONLINE'}**\n` +
      `📊 **Platform Fee**: **${((bank.platformFeePercent || 0) / 100).toFixed(2)}%**\n\n` +
      `🌐 **Staff Web Workspace**: [Open Staff Portal](${staffPortalUrl})\n` +
      `──────────────────────────────────────────────`,
    color: hexColor,
    thumbnail: settings?.logoUrl ? { url: settings.logoUrl } : undefined,
    fields: [
      {
        name: '⚙️ Operations & Review',
        value: '• **Vault Overview**: System liquidity & accounts\n• **Pending Loans**: Review & approve/deny\n• **Customer Search**: Lookup by MC/Discord\n• **Audit Logs**: View live staff actions',
        inline: true
      },
      {
        name: '💵 Cash Desk Controls',
        value: '• **Teller Transaction**: Manual credit/debit\n• **Toggle Status**: Maintenance mode switch\n• **Staff Web Portal**: Access browser dashboard',
        inline: true
      }
    ],
    footer: { text: `Slate SaaS Onyx Network • Live Staff Operations Panel` },
    timestamp: new Date().toISOString()
  };

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('staff_gui_overview').setLabel('📊 Vault Overview').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('staff_gui_loans').setLabel(`📋 Loans (${pendingCount})`).setStyle(pendingCount > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('staff_gui_customer_search').setLabel('👥 Customer Lookup').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('staff_gui_audit_logs').setLabel('📜 Audit Trail').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('staff_gui_teller_tx').setLabel('💵 Teller Transaction').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('staff_gui_toggle_status').setLabel('⚙️ Toggle Maintenance').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('🌐 Staff Portal').setStyle(ButtonStyle.Link).setURL(staffPortalUrl)
  );

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

async function setupGUICommand(bankId: string, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      await interaction.editReply({ content: "❌ Command must be executed in a text channel." });
      return;
    }

    const data = await buildPublicGUIEmbedAndComponents(bankId);
    const msg = await (channel as any).send(data);

    const existing = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (existing) {
      await db.update(bankSettings).set({
        guiChannelId: channel.id,
        guiMessageId: msg.id,
      }).where(eq(bankSettings.bankId, bankId));
    } else {
      await db.insert(bankSettings).values({
        bankId,
        guiChannelId: channel.id,
        guiMessageId: msg.id,
      });
    }

    await interaction.editReply({ content: "✅ Auto-updating Public Banking Portal GUI successfully bound and spawned in this channel!" });
  } catch (e: any) {
    console.error(e);
    await interaction.editReply({ content: `❌ Failed to setup Public GUI: ${e.message}` });
  }
}

async function setupStaffPanelCommand(bankId: string, interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      await interaction.editReply({ content: "❌ Command must be executed in a text channel." });
      return;
    }

    const data = await buildStaffPanelEmbedAndComponents(bankId);
    const msg = await (channel as any).send(data);

    const existing = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (existing) {
      await db.update(bankSettings).set({
        staffChannelId: channel.id,
        staffMessageId: msg.id,
      }).where(eq(bankSettings.bankId, bankId));
    } else {
      await db.insert(bankSettings).values({
        bankId,
        staffChannelId: channel.id,
        staffMessageId: msg.id,
      });
    }

    await interaction.editReply({ content: "🛡️ Auto-updating Staff Command Panel successfully bound and spawned in this channel!" });
  } catch (e: any) {
    console.error(e);
    await interaction.editReply({ content: `❌ Failed to setup Staff Panel: ${e.message}` });
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

  const accounts = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, bankId), 
      eq(bankAccounts.ownerDiscordId, interaction.user.id),
      eq(bankAccounts.isSystem, false)
    )
  );

  const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
  const isLinked = userMap.length > 0;

  // If no bank accounts, show onboarding/registration information screen instead
  if (accounts.length === 0) {
    const portalUrl = bank.customDomain ? `https://${bank.customDomain}/` : `https://ais-dev-x33dat556cunbev6anuble-271675189999.us-east1.run.app/portal/${bankId}`;

    const registrationEmbed = {
      title: `🏛️ ${bank.name} Onboarding`,
      description: `Welcome! To start banking with **${bank.name}**, you need to link your Minecraft profile and open a bank account.`,
      color: parseInt(bank.brandingColor?.replace('#', '') || '4f46e5', 16),
      fields: [
        {
          name: "🔗 Step 1: Link Minecraft Account",
          value: isLinked 
            ? `✅ Your Discord is already linked to Minecraft account **${userMap[0].mcUsername}**.` 
            : `❌ You need to link your Minecraft account.\n👉 Go to the **[Bank Portal](${portalUrl})** and log in with Discord to link your Minecraft account.`
        },
        {
          name: "💳 Step 2: Open a Bank Account",
          value: "Once linked, click the **➕ Open Account** button below to open your first bank account."
        }
      ],
      footer: { text: "Slate SaaS • Automated Compliance & Onboarding" }
    };

    const onboardingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('bank_open_account').setLabel('➕ Open Account').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bank_in_game_info').setLabel('ℹ️ In-Game Info').setStyle(ButtonStyle.Secondary)
    );

    const msg = {
      content: '',
      embeds: [registrationEmbed],
      components: [onboardingRow],
      ephemeral: isEphemeral
    };

    if (!isEphemeral && interaction.channel) {
      await (interaction.channel as any).send({ embeds: [registrationEmbed], components: [onboardingRow] });
      return;
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
    return;
  }

  // Find active account
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
  const registeredAddress = customer[0]?.notes || "r034";

  const dashboardEmbed = {
    title: `🏛️ ${bank.name} Dashboard`,
    description: `Viewing **${activeAccount.accountType ? activeAccount.accountType.charAt(0).toUpperCase() + activeAccount.accountType.slice(1) : "Personal"}** Account\n\n📝 **Account**      💰 **Balance**\n\`${mcUsername}\`       **$${(activeAccount.balance / 100).toFixed(2)}**\n\n📍 **Registered Address**\n${registeredAddress}`,
    color: parseInt(bank.brandingColor?.replace('#', '') || '4f46e5', 16),
    footer: { text: "Slate SaaS • Automated Compliance & Onboarding" }
  };

  const selectMenuOptions = accounts.map(acc => ({
    label: `${acc.accountName} (${acc.accountType ? acc.accountType.charAt(0).toUpperCase() + acc.accountType.slice(1) : "Personal"})`,
    value: `select_acc_${acc.id}`,
    description: `Balance: $${(acc.balance / 100).toFixed(2)}`,
    default: acc.id === activeAccount.id
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('bank_select_account')
    .setPlaceholder('Select an account...')
    .addOptions(selectMenuOptions);
  
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bank_transfer_${activeAccount.id}`).setLabel('↔️ Transfer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bank_history').setLabel('📄 Transactions').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bank_in_game_info').setLabel('📥 Deposit Info').setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_open_business_modal').setLabel('🏢 New Business').setStyle(ButtonStyle.Success)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_view_loans').setLabel('📄 Loans').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bank_view_settings').setLabel('⚙️ Settings').setStyle(ButtonStyle.Secondary)
  );

  const msg = {
    content: '',
    embeds: [dashboardEmbed],
    components: [selectRow, row1, row2, row3],
    ephemeral: isEphemeral
  };

  if (!isEphemeral && interaction.channel) {
    await (interaction.channel as any).send({ embeds: [dashboardEmbed], components: [selectRow, row1, row2, row3] });
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
      content: '📥 **In-Game CityCorp Banking Commands**\n\nTo manage funds in-game via CityCorp accounts, use:\n\n**Deposit**: `/c account deposit corpname accountname amount`\n**Withdraw**: `/c account withdraw corpname accountname amount`', 
      components: [backButtonRow] 
    });
  } else if (cid === 'bank_open_account' || cid === 'bank_gui_open_acc') {
    const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
    const isLinked = userMap.length > 0;

    if (!isLinked) {
      await interaction.reply({ content: '❌ You must register and link your Minecraft account first before opening a bank account.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_open_account')
      .setTitle('Open New Account');
      
    const nameInput = new TextInputBuilder()
      .setCustomId('account_name')
      .setLabel("Account Name (e.g. personal, corp-biz)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
    
    await interaction.showModal(modal);
  } else if (cid === 'bank_open_business_modal') {
    const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
    const isLinked = userMap.length > 0;

    if (!isLinked) {
      await interaction.reply({ content: '❌ You must register and link your Minecraft account first before opening a bank account.', ephemeral: true });
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
    const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
    if (userMap.length === 0) {
      await interaction.reply({ content: '❌ You must link your Minecraft account before applying for a loan.', ephemeral: true });
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
  const accounts = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, bankId), 
      eq(bankAccounts.ownerDiscordId, interaction.user.id)
    )
  );

  if (accounts.length === 0) {
    await safeReplyOrUpdate(interaction, { content: 'You do not have any bank accounts open here. Tap "Open Account" to create one.', components: [backButtonRow] });
    return;
  }

  const list = accounts.map(a => `**${a.accountName}**: $${(a.balance / 100).toFixed(2)}`).join('\n');
  await safeReplyOrUpdate(interaction, { 
    content: `🏦 **Your Open Accounts**\n${list}`, 
    components: [backButtonRow]
  });
}

async function handleOpenAccount(bankId: string, interaction: ModalSubmitInteraction, name: string, type: string = 'personal') {
  await interaction.deferReply({ ephemeral: true });

  let mcUuidToLink: string | null = null;
  const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
  if (userMap.length > 0) {
    mcUuidToLink = userMap[0].mcUuid;
  }

  const client = await getBankClient(bankId);
  if (client) {
    const res = await client.createAccount(name);
    if (!res.success) {
      await interaction.editReply({ content: `Failed to create account in CityCorp: ${res.message}` });
      return;
    }

    if (mcUuidToLink) {
      const resUuid = await client.addSubuser(name, mcUuidToLink);
      if (!resUuid.success) {
        console.error(`Failed to link subuser ${mcUuidToLink} to account ${name}`);
      }
    }
  }

  await db.insert(bankAccounts).values({
    id: uuidv4(),
    bankId,
    ownerDiscordId: interaction.user.id,
    accountName: name,
    accountType: type,
    balance: 0,
    createdAt: new Date(),
  });

  // Attempt to assign the Discord Client Role
  try {
    const { bankSettings } = await import('../db/schema');
    const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get();
    if (settings?.discordClientRoleId && interaction.guild) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member) {
        await member.roles.add(settings.discordClientRoleId);
      }
    }
  } catch (err) {
    console.error("Failed to assign Discord client role:", err);
  }

  await interaction.editReply({ content: `✅ Successfully opened your account: **${name}**!`, components: [backButtonRow] });
}

async function handleTransfer(bankId: string, interaction: ModalSubmitInteraction, toAccountName: string, amount: number, sourceAccId?: string | null) {
  await interaction.deferReply({ ephemeral: true });
  const amountInCents = Math.round(amount * 100);

  // Source accounts
  let sourceAccount;
  if (sourceAccId) {
    const accs = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.id, sourceAccId),
        eq(bankAccounts.ownerDiscordId, interaction.user.id)
      )
    );
    if (accs.length > 0) sourceAccount = accs[0];
  }

  if (!sourceAccount) {
    const sourceAccounts = await db.select().from(bankAccounts).where(
      and(
        eq(bankAccounts.bankId, bankId), 
        eq(bankAccounts.ownerDiscordId, interaction.user.id)
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

  // Find destination account purely by name within this bank
  const destAccounts = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, bankId),
      eq(bankAccounts.accountName, toAccountName)
    )
  );

  if (destAccounts.length === 0) {
    await interaction.editReply({ content: `Destination account **${toAccountName}** not found.` });
    return;
  }

  const destAccount = destAccounts[0];

  if (sourceAccount.id === destAccount.id) {
    await interaction.editReply({ content: 'Cannot transfer to the same account.' });
    return;
  }

  const client = await getBankClient(bankId);
  if (client) {
    const wRes = await client.withdraw(sourceAccount.accountName, amount);
    if (!wRes.success) {
      await interaction.editReply({ content: `CityCorp Transfer Failed (Withdrawal): ${wRes.message}` });
      return;
    }
    const dRes = await client.deposit(destAccount.accountName, amount);
    if (!dRes.success) {
      await client.deposit(sourceAccount.accountName, amount);
      await interaction.editReply({ content: `CityCorp Transfer Failed (Deposit). Deposited funds back. Error: ${dRes.message}` });
      return;
    }
    await interaction.editReply({ content: `✅ Transferred $${amount.toFixed(2)} from **${sourceAccount.accountName}** to **${destAccount.accountName}** via CityCorp. It may take a moment to reflect.` });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(bankAccounts)
      .set({ balance: sourceAccount.balance - amountInCents })
      .where(eq(bankAccounts.id, sourceAccount.id));

    await tx.update(bankAccounts)
      .set({ balance: destAccount.balance + amountInCents })
      .where(eq(bankAccounts.id, destAccount.id));

    await tx.insert(transactions).values({
      id: uuidv4(),
      bankId,
      fromAccountId: sourceAccount.id,
      toAccountId: destAccount.id,
      amount: amountInCents,
      type: 'transfer',
      description: `Transfer to ${toAccountName}`,
      timestamp: new Date()
    });
  });

  await interaction.editReply({ content: `✅ Transferred ${amount.toFixed(2)} to **${toAccountName}**.` });
}

async function handleHistory(bankId: string, interaction: ButtonInteraction) {
  const { or, desc } = await import('drizzle-orm');
  
  const myAccounts = await db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, interaction.user.id)));
    
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
  
  if (myLoans.length === 0) {
    await safeReplyOrUpdate(interaction, {
      content: "📝 **Your Loans**\n\nYou have no active loans with this bank.\nTo apply for a loan, please click **Apply for Loan**.",
      components: [backButtonRow]
    });
    return;
  }

  const list = myLoans.map(l => {
    const statusEmoji = l.status === 'active' ? '🟢' : l.status === 'pending' ? '🟡' : '🔴';
    return `${statusEmoji} **Loan ID**: \`${l.id}\`\n**Principal**: $${(l.principalAmount / 100).toFixed(2)}\n**Remaining**: $${(l.remainingAmount / 100).toFixed(2)}\n**Interest**: ${(l.interestRate / 100).toFixed(2)}%\n**Status**: ${l.status?.toUpperCase()}`;
  }).join('\n\n');

  const activeLoans = myLoans.filter(l => (l.status === 'active' || l.status === 'pending') && l.remainingAmount > 0);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [backButtonRow];

  if (activeLoans.length > 0) {
    const repayRow = new ActionRowBuilder<ButtonBuilder>();
    for (const l of activeLoans.slice(0, 4)) {
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
  const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
  const mcUsername = userMap[0]?.mcUsername || "Not Linked";
  
  await safeReplyOrUpdate(interaction, {
    content: `⚙️ **Bank Settings & Identity**\n\n👤 **Discord User**: <@${interaction.user.id}>\n🔗 **Linked Minecraft Character**: **${mcUsername}**\n\nNeed to link or unlink an account? Please visit the Citizen Portal.`,
    components: [backButtonRow]
  });
}

async function handleApplyLoanModal(bankId: string, interaction: ModalSubmitInteraction, amount: number, purpose: string) {
  await interaction.deferReply({ ephemeral: true });
  const amountInCents = Math.round(amount * 100);

  let userAccs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, interaction.user.id)));
  let accountId: string;
  if (userAccs.length > 0) {
    accountId = userAccs[0].id;
  } else {
    // Auto open a personal account if none exists
    accountId = uuidv4();
    await db.insert(bankAccounts).values({
      id: accountId,
      bankId,
      ownerDiscordId: interaction.user.id,
      accountName: "personal",
      accountType: "personal",
      balance: 0,
      createdAt: new Date(),
    });
  }

  const loanId = uuidv4();
  const nextPayment = new Date();
  nextPayment.setDate(nextPayment.getDate() + 30);

  await db.insert(loans).values({
    id: loanId,
    bankId,
    discordId: interaction.user.id,
    accountId,
    principalAmount: amountInCents,
    remainingAmount: amountInCents,
    interestRate: 500, // 5% default
    nextPaymentDate: nextPayment,
    purpose,
    status: 'pending',
    createdAt: new Date(),
  });

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId,
    userDiscordId: interaction.user.id,
    action: 'LOAN_APPLICATION_SUBMITTED',
    details: `Applied for $${amount.toFixed(2)} loan. Purpose: ${purpose}`,
    timestamp: new Date()
  });

  refreshBankChannelGUIs(bankId);

  await interaction.editReply({
    content: `✅ **Loan Application Submitted!**\n\n` +
      `**Amount**: $${amount.toFixed(2)}\n` +
      `**Purpose**: ${purpose}\n` +
      `**Status**: 🟡 PENDING REVIEW BY BANK STAFF\n\n` +
      `You will be notified once a bank teller or manager reviews your application.`
  });
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

  const pending = await db.select().from(loans).where(and(eq(loans.bankId, bankId), eq(loans.status, 'pending'))).limit(5);

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
  if (loan.status !== 'pending') {
    await interaction.editReply({ content: `❌ Loan is already ${loan.status}.` });
    return;
  }

  await db.update(loans).set({ status: 'active' }).where(eq(loans.id, loanId));

  const userAccs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, loan.discordId)));
  if (userAccs.length > 0) {
    const acc = userAccs[0];
    await db.update(bankAccounts).set({ balance: acc.balance + loan.principalAmount }).where(eq(bankAccounts.id, acc.id));
    await db.insert(transactions).values({
      id: uuidv4(),
      bankId,
      toAccountId: acc.id,
      amount: loan.principalAmount,
      type: 'transfer',
      description: `Loan Disbursement (ID: ${loan.id.substring(0, 8)})`,
      timestamp: new Date()
    });
  }

  await db.insert(auditLogs).values({
    id: uuidv4(),
    bankId,
    userDiscordId: interaction.user.id,
    action: 'LOAN_APPROVED',
    details: `Staff approved loan ${loanId} for user ${loan.discordId} ($${(loan.principalAmount/100).toFixed(2)})`,
    timestamp: new Date()
  });

  refreshBankChannelGUIs(bankId);

  await interaction.editReply({ content: `✅ **Loan Approved & Disbursed!**\nLoan ID \`${loanId.substring(0, 8)}\` approved for <@${loan.discordId}>. Funds credited.` });
}

async function handleStaffDenyLoan(bankId: string, interaction: ButtonInteraction, loanId: string) {
  await interaction.deferReply({ ephemeral: true });

  const l = await db.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.bankId, bankId)));
  if (l.length === 0) {
    await interaction.editReply({ content: "❌ Loan application not found." });
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

  const newBalance = type === 'deposit' ? acc.balance + amountCents : acc.balance - amountCents;
  await db.update(bankAccounts).set({ balance: newBalance }).where(eq(bankAccounts.id, acc.id));

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

  await interaction.editReply({ content: `⚙️ **Bank Operating Mode Updated!**\nMaintenance Mode is now: **${newMode ? 'ENABLED (Maintenance)' : 'DISABLED (Online)'}**.` });
}

async function handleBankRates(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const bank = b[0];

  const hexColor = bank.brandingColor ? parseInt(bank.brandingColor.replace('#', ''), 16) : 0x4f46e5;

  const embed = {
    title: `📈 ${bank.name} • Interest Rates & Market Schedule`,
    description: `Current interest rate tiers and fees for **${bank.name}**.\n\n` +
      `• **Base Loan APR**: **5.00%** per annum\n` +
      `• **Savings Account APY**: **2.25%** compound yield\n` +
      `• **Internal Transfer Fee**: **$0.00** (Free)\n` +
      `• **Platform Onyx Fee**: **${((bank.platformFeePercent || 0) / 100).toFixed(2)}%**\n` +
      `• **CityCorp Network Inter-Bank Fee**: Standard CityCorp API rates\n\n` +
      `For personalized commercial credit or custom treasury rates, please open a ticket with bank staff.`,
    color: hexColor,
    footer: { text: "Slate SaaS Onyx PSP Ledger • Financial Schedule" },
    timestamp: new Date().toISOString()
  };

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
  if (loan.remainingAmount <= 0 || loan.status === 'paid') {
    await interaction.editReply({ content: '✅ This loan has already been paid off in full!' });
    return;
  }

  const accs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, interaction.user.id)));
  if (accs.length === 0) {
    await interaction.editReply({ content: '❌ No bank account found to draw funds from.' });
    return;
  }

  const account = accs[0];
  if (account.balance < amountCents) {
    await interaction.editReply({
      content: `❌ **Insufficient Funds.**\nAccount **${account.accountName}** balance: **$${(account.balance / 100).toFixed(2)}**, payment: **$${amount.toFixed(2)}**.`
    });
    return;
  }

  const newBalance = account.balance - amountCents;
  const newRemaining = Math.max(0, loan.remainingAmount - amountCents);
  const newStatus = newRemaining === 0 ? 'paid' : 'active';

  await db.update(bankAccounts).set({ balance: newBalance }).where(eq(bankAccounts.id, account.id));
  await db.update(loans).set({ remainingAmount: newRemaining, status: newStatus }).where(eq(loans.id, loan.id));

  await db.insert(transactions).values({
    id: uuidv4(),
    bankId,
    fromAccountId: account.id,
    toAccountId: account.id,
    amount: amountCents,
    type: 'loan_repayment',
    description: `Loan Repayment (${loanId.substring(0, 8)}). Remaining: $${(newRemaining / 100).toFixed(2)}`,
    timestamp: new Date()
  });

  await interaction.editReply({
    content: 
      `🎉 **Loan Repayment Processed!**\n\n` +
      `💸 **Payment Amount**: **$${amount.toFixed(2)}**\n` +
      `💳 **Source Account**: **${account.accountName}**\n` +
      `📉 **Remaining Loan Balance**: **$${(newRemaining / 100).toFixed(2)}**\n` +
      `🏷️ **Status**: **${newStatus.toUpperCase()}**`
  });
}

async function handleBankInGameInfo(bankId: string, interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) return;
  const bank = b[0];

  const userMap = await db.select().from(users).where(eq(users.discordId, interaction.user.id));
  const isLinked = userMap.length > 0;
  const mcUser = isLinked ? userMap[0].mcUsername : 'Not Linked';

  const hexColor = bank.brandingColor ? parseInt(bank.brandingColor.replace('#', ''), 16) : 0x4f46e5;
  const syncCode = Math.floor(100000 + Math.random() * 900000).toString();

  const embed = {
    title: `🎮 ${bank.name} • Minecraft Server Character Sync`,
    description: 
      `Connect your Discord account with your Minecraft character for instant online balance updates and CityCorp sync.\n\n` +
      `👤 **Minecraft Character**: **${mcUser}**\n` +
      `🔗 **Account Status**: ${isLinked ? '🟢 LINKED & VERIFIED' : '🔴 UNLINKED'}\n\n` +
      (isLinked ? 
        `✅ Your character **${mcUser}** is fully linked! Account actions and balances will sync across Slate and CityCorp.` :
        `🔑 **Linking Instructions**:\n` +
        `1. Log into the Minecraft server\n` +
        `2. Run command: \`/slate link ${syncCode}\`\n` +
        `3. Your accounts and balances will sync automatically!`) +
      `\n\n` +
      `⌨️ **In-Game Commands**:\n` +
      `• \`/bank balance\` — View live account balances\n` +
      `• \`/bank deposit <amount>\` — Deposit in-game funds\n` +
      `• \`/bank withdraw <amount>\` — Withdraw in-game funds`,
    color: hexColor,
    thumbnail: isLinked ? { url: `https://mc-heads.net/avatar/${mcUser}/100` } : undefined,
    footer: { text: `Slate SaaS Onyx Network • MC Sync ID: ${syncCode}` },
    timestamp: new Date().toISOString()
  };

  await interaction.editReply({ embeds: [embed] });
}


