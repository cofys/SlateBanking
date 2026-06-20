import { REST, Routes, Interaction, CacheType, SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonInteraction } from 'discord.js';
import { db } from '../db/index';
import { banks, bankAccounts, transactions, users } from '../db/schema';
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
    .setDescription('Open the Bank Dashboard.'),
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
      await showMainMenu(interaction);
    }
    return;
  }
  
  if (interaction.isButton()) {
    await handleButton(bankId, interaction);
    return;
  }
  
  if (interaction.isModalSubmit()) {
    await handleModal(bankId, interaction);
    return;
  }
}

async function showMainMenu(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_balances').setLabel('💳 Account Balances').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bank_transfer').setLabel('🔄 Transfer Funds').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bank_history').setLabel('📜 Transaction History').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('bank_open_account').setLabel('➕ Open Account').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bank_leaderboard').setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bank_in_game_info').setLabel('ℹ️ In-Game Info').setStyle(ButtonStyle.Secondary),
  );

  const msg = {
    content: '🏦 **Welcome to the Bank Dashboard**\nSelect an option below to manage your finances:',
    components: [row1, row2],
    ephemeral: true
  };

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
    await showMainMenu(interaction);
    return;
  }
  
  if (cid === 'bank_balances') {
    await handleBalance(bankId, interaction);
  } else if (cid === 'bank_leaderboard') {
    await handleLeaderboard(bankId, interaction);
  } else if (cid === 'bank_history') {
    await handleHistory(bankId, interaction);
  } else if (cid === 'bank_in_game_info') {
    await interaction.update({ 
      content: '📥 **In-Game Commands**\n\nTo manage your money in-game, find an ATM or bank teller and use the following commands:\n\n**Deposit**: `/c account deposit CityCorp <account_name> <amount>`\n**Withdraw**: `/c account withdraw CityCorp <account_name> <amount>`', 
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
  } else if (cid === 'bank_transfer') {
    const modal = new ModalBuilder()
      .setCustomId('modal_transfer')
      .setTitle('Transfer Funds');
      
    const toInput = new TextInputBuilder()
      .setCustomId('to_account')
      .setLabel("Destination Account Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    const amtInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel("Amount")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(toInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput)
    );
    await interaction.showModal(modal);
  }
}

async function handleModal(bankId: string, interaction: ModalSubmitInteraction) {
  try {
    if (interaction.customId === 'modal_open_account') {
      const name = interaction.fields.getTextInputValue('account_name');
      await handleOpenAccount(bankId, interaction, name);
    } else if (interaction.customId === 'modal_transfer') {
      const toAccount = interaction.fields.getTextInputValue('to_account');
      const amountStr = interaction.fields.getTextInputValue('amount');
      const amount = parseInt(amountStr);
      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ content: 'Invalid amount. Must be a positive integer.', ephemeral: true });
        return;
      }
      await handleTransfer(bankId, interaction, toAccount, amount);
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
    await interaction.update({ content: 'You do not have any bank accounts open here. Tap "Open Account" to create one.', components: [backButtonRow] });
    return;
  }

  const list = accounts.map(a => `**${a.accountName}**: $${(a.balance / 100).toFixed(2)}`).join('\n');
  await interaction.update({ 
    content: `🏦 **Your Open Accounts**\n${list}`, 
    components: [backButtonRow]
  });
}

async function handleOpenAccount(bankId: string, interaction: ModalSubmitInteraction, name: string) {
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

async function handleTransfer(bankId: string, interaction: ModalSubmitInteraction, toAccountName: string, amount: number) {
  await interaction.deferReply({ ephemeral: true });
  const amountInCents = amount * 100;

  // Source accounts
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

  const sourceAccount = sourceAccounts[0]; 

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

  await interaction.editReply({ content: `✅ Transferred $${amount.toFixed(2)} to **${toAccountName}**.` });
}

async function handleLeaderboard(bankId: string, interaction: ButtonInteraction) {
  const { desc } = await import('drizzle-orm');
  const topAccounts = await db.select().from(bankAccounts)
    .where(eq(bankAccounts.bankId, bankId))
    .orderBy(desc(bankAccounts.balance))
    .limit(10);
    
  if (topAccounts.length === 0) {
    await interaction.update({ content: 'No accounts in this bank yet.', components: [backButtonRow] });
    return;
  }
  
  const leaderboardTxt = topAccounts.map((acc, i) => 
    `**${i + 1}.** <@${acc.ownerDiscordId}> - **${acc.accountName}**: $${(acc.balance / 100).toFixed(2)}`
  ).join('\n');
  
  await interaction.update({ content: `🏆 **Richest Accounts Leaderboard**\n\n${leaderboardTxt}`, components: [backButtonRow] });
}

async function handleHistory(bankId: string, interaction: ButtonInteraction) {
  const { or, desc } = await import('drizzle-orm');
  
  const myAccounts = await db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.ownerDiscordId, interaction.user.id)));
    
  if (myAccounts.length === 0) {
    await interaction.update({ content: 'You have no accounts in this bank.', components: [backButtonRow] });
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
    await interaction.update({ content: 'No recent transactions found.', components: [backButtonRow] });
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
  
  await interaction.update({ content: `📜 **Your Recent Transactions**\n\n${historyTxt}`, components: [backButtonRow] });
}

