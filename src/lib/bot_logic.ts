import { REST, Routes, Interaction, CacheType, SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonInteraction, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { db } from '../db/index';
import { banks, bankAccounts, transactions, users, bankCustomers, loans } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { CityCorpClient } from './citycorp_api';

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
    .setDescription('Open the Bank Dashboard (Personal).'),
  new SlashCommandBuilder()
    .setName('spawn_atm')
    .setDescription('Admin only: Spawn a permanent ATM menu in this channel.')
    .setDefaultMemberPermissions(8) // Administrator only
].map(command => command.toJSON());

export async function registerBankCommands(token: string, clientId: string) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
}

export async function handleBankInteraction(bankId: string, interaction: Interaction<CacheType>) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'bank') {
      await showMainMenu(bankId, interaction, true);
    } else if (interaction.commandName === 'spawn_atm') {
      await showMainMenu(bankId, interaction, false);
      await interaction.reply({ content: "ATM spawned below.", ephemeral: true });
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
  
  if (cid === 'bank_main_menu') {
    await interaction.deferUpdate();
    await showMainMenu(bankId, interaction);
    return;
  }
  
  if (cid === 'bank_balances') {
    await handleBalance(bankId, interaction);
  } else if (cid === 'bank_history') {
    await handleHistory(bankId, interaction);
  } else if (cid === 'bank_in_game_info') {
    await safeReplyOrUpdate(interaction, { 
      content: '📥 **In-Game Commands**\n\nTo manage your money in-game, find an ATM or bank teller and use the following commands:\n\n**Deposit**: `/c account deposit corpname accountname amount`\n**Withdraw**: `/c account withdraw corpname accountname amount`', 
      components: [backButtonRow] 
    });
  } else if (cid === 'bank_open_account') {
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
  } else if (cid.startsWith('bank_transfer')) {
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
  } else if (cid === 'bank_view_loans') {
    await handleViewLoans(bankId, interaction);
  } else if (cid === 'bank_view_settings') {
    await handleViewSettings(bankId, interaction);
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
      content: "📝 **Your Loans**\n\nYou have no active loans with this bank.\nTo apply for a loan, please visit the Bank Portal.",
      components: [backButtonRow]
    });
    return;
  }

  const list = myLoans.map(l => {
    const statusEmoji = l.status === 'active' ? '🟢' : l.status === 'pending' ? '🟡' : '🔴';
    return `${statusEmoji} **Loan ID**: \`${l.id.split('-')[0]}\`\n**Principal**: $${(l.principalAmount / 100).toFixed(2)}\n**Remaining**: $${(l.remainingAmount / 100).toFixed(2)}\n**Interest**: ${(l.interestRate / 100).toFixed(2)}%\n**Status**: ${l.status?.toUpperCase()}`;
  }).join('\n\n');

  await safeReplyOrUpdate(interaction, {
    content: `📝 **Your Loans with This Bank**\n\n${list}`,
    components: [backButtonRow]
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

