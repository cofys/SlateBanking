import { 
  Client, 
  ButtonInteraction, 
  CommandInteraction, 
  ChatInputCommandInteraction,
  ModalSubmitInteraction, 
  Interaction, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  REST, 
  Routes, 
  SlashCommandBuilder 
} from 'discord.js';
import { db } from '../db/index';
import { banks, bankAccounts, transactions, onyxSettings, onyxMerchants, clearinghouseSettlements, onyxMerchantProducts, onyxQuotes } from '../db/schema';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { dispatchDiscordWebhook } from './webhook_dispatcher';

export async function buildOnyxGlobalEmbedAndComponents() {
  const settings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, 'global')).get();
  const allBanks = await db.select().from(banks);
  const activeBanks = allBanks.filter(b => !b.maintenanceMode);
  
  const allMerchants = await db.select().from(onyxMerchants);
  
  const txSummary = await db.select({
    totalVolume: sql<number>`COALESCE(SUM(${transactions.amount}), 0)`,
    totalCount: sql<number>`COUNT(${transactions.id})`,
  }).from(transactions).where(sql`${transactions.type} LIKE 'onyx_%'`).get();

  const totalVolFormatted = ((txSummary?.totalVolume || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const feePercent = (((settings?.b2bApiFeePercent || 200)) / 100).toFixed(2);

  const embed = {
    title: '💎 Onyx Payment Service Provider (PSP) • Global Clearinghouse',
    description: 
      `**Welcome to Onyx Payment Service Provider.**\n` +
      `Onyx is the unified global clearinghouse network connecting all member banks across the economy. Execute instant cross-bank payments, register merchant checkout terminals, and view real-time inter-bank settlement feeds.\n\n` +
      `──────────────────────────────────────────────\n` +
      `🌐 **Connected Banks**: **${activeBanks.length} / ${allBanks.length} Online**\n` +
      `🏪 **Registered Merchants**: **${allMerchants.length} Active Stores**\n` +
      `📊 **Cleared Onyx Volume**: **$${totalVolFormatted}** (${txSummary?.totalCount || 0} txs)\n` +
      `⚡ **B2B Clearing Fee**: **${feePercent}%**\n` +
      `⚙️ **Clearinghouse Status**: ${settings?.clearinghouseEnabled ? '🟢 OPERATIONAL' : '🔴 PAUSED'}\n` +
      `──────────────────────────────────────────────`,
    color: 0x6366f1, // Indigo / Sapphire Onyx color
    fields: [
      {
        name: '💳 Cross-Bank Instant Payments',
        value: 'Send funds directly between **Bank A and Bank B** using Onyx clearing routes. Supports personal & commercial accounts.',
        inline: true
      },
      {
        name: '🏪 Merchant Checkout Engine',
        value: 'Register your Discord server store to receive automated API payments with instant settlement into your bank account.',
        inline: true
      }
    ],
    footer: { text: 'Onyx PSP Global Network • Cross-Bank Financial Protocol' },
    timestamp: new Date().toISOString()
  };

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('onyx_btn_pay').setLabel('💳 Pay Any Account').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('onyx_btn_merchant').setLabel('🏪 Merchant Registration').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('onyx_btn_paylink').setLabel('🔗 Payment Link Generator').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('onyx_btn_banks').setLabel('🏦 Member Banks Directory').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('onyx_btn_stores').setLabel('🛒 Merchant Directory').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('onyx_btn_feed').setLabel('📜 Inter-Bank Settlement Feed').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function refreshOnyxChannelGUI(client: Client | null) {
  if (!client || !client.user) return;

  const settings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, 'global')).get();
  if (!settings || !settings.guiChannelId || !settings.guiMessageId) return;

  try {
    const channel = await client.channels.fetch(settings.guiChannelId);
    if (channel && channel.isTextBased() && 'messages' in channel) {
      const msg = await (channel as any).messages.fetch(settings.guiMessageId);
      if (msg) {
        const payload = await buildOnyxGlobalEmbedAndComponents();
        await msg.edit(payload);
      }
    }
  } catch (e) {
    console.error('[OnyxBot] Error refreshing Onyx Channel GUI:', e);
  }
}

export async function registerOnyxCommands(token: string, clientId: string) {
  const commands = [
    new SlashCommandBuilder()
      .setName('onyx-pay')
      .setDescription('Execute an Onyx cross-bank payment')
      .addStringOption(o => o.setName('to_account').setDescription('Target account name or ID').setRequired(true))
      .addNumberOption(o => o.setName('amount').setDescription('Amount in dollars').setRequired(true))
      .addStringOption(o => o.setName('to_bank').setDescription('Target Bank ID or name (optional)').setRequired(false))
      .addStringOption(o => o.setName('memo').setDescription('Payment description / invoice note').setRequired(false)),

    new SlashCommandBuilder()
      .setName('onyx-banks')
      .setDescription('View all active member banks connected to Onyx Clearinghouse'),

    new SlashCommandBuilder()
      .setName('onyx-merchant-setup')
      .setDescription('Register a new merchant store on Onyx PSP')
      .addStringOption(o => o.setName('store_name').setDescription('Name of your store/business').setRequired(true))
      .addStringOption(o => o.setName('bank_id').setDescription('Target settlement bank ID').setRequired(true))
      .addStringOption(o => o.setName('account_name').setDescription('Account name to receive payments').setRequired(true)),

    new SlashCommandBuilder()
      .setName('onyx-checkout-button')
      .setDescription('Generate an interactive merchant product checkout button on Discord')
      .addStringOption(o => o.setName('merchant_id').setDescription('Your Onyx Merchant Store ID').setRequired(true))
      .addStringOption(o => o.setName('product_name').setDescription('Product Title').setRequired(true))
      .addStringOption(o => o.setName('price_type').setDescription('fixed (flat price) or custom_customer (customer enters amount)').setRequired(true)
        .addChoices(
          { name: 'Flat Fixed Price', value: 'fixed' },
          { name: 'Customer Enters Custom Amount', value: 'custom_customer' }
        ))
      .addNumberOption(o => o.setName('price').setDescription('Price in dollars (if fixed)').setRequired(false))
      .addStringOption(o => o.setName('description').setDescription('Item Description').setRequired(false)),

    new SlashCommandBuilder()
      .setName('onyx-quote')
      .setDescription('Generate an interactive instant custom checkout quote / invoice button')
      .addStringOption(o => o.setName('merchant_id').setDescription('Your Onyx Merchant Store ID').setRequired(true))
      .addNumberOption(o => o.setName('amount').setDescription('Quote amount in dollars').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Quote / Invoice Title').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Detailed Breakdown / Description').setRequired(false))
      .addUserOption(o => o.setName('client_user').setDescription('Target Client Discord User (optional)').setRequired(false)),
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}

export async function handleOnyxInteraction(interaction: Interaction) {
  try {
    if (interaction.isButton()) {
      const cid = interaction.customId;
      if (cid === 'onyx_btn_pay') {
        const modal = new ModalBuilder()
          .setCustomId('onyx_modal_pay')
          .setTitle('💳 Onyx Cross-Bank Payment');

        const senderInput = new TextInputBuilder()
          .setCustomId('sender_acc')
          .setLabel('Your Account Name or ID')
          .setPlaceholder('e.g. personal, savings, or UUID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const targetBankInput = new TextInputBuilder()
          .setCustomId('target_bank')
          .setLabel('Target Bank ID or Name')
          .setPlaceholder('e.g. citybank, bank-of-america')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const targetAccInput = new TextInputBuilder()
          .setCustomId('target_acc')
          .setLabel('Recipient Account Name or ID')
          .setPlaceholder('e.g. store_account, merchant, or UUID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const amountInput = new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount ($)')
          .setPlaceholder('e.g. 50.00')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const memoInput = new TextInputBuilder()
          .setCustomId('memo')
          .setLabel('Memo / Description')
          .setPlaceholder('e.g. Cross-bank merchant purchase')
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(senderInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(targetBankInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(targetAccInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(memoInput)
        );

        await interaction.showModal(modal);
      } else if (cid === 'onyx_btn_merchant') {
        const modal = new ModalBuilder()
          .setCustomId('onyx_modal_merchant')
          .setTitle('🏪 Onyx Merchant Registration');

        const storeInput = new TextInputBuilder()
          .setCustomId('store_name')
          .setLabel('Store / Business Name')
          .setPlaceholder('e.g. Diamond Exchange Store')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const bankInput = new TextInputBuilder()
          .setCustomId('bank_id')
          .setLabel('Settlement Bank ID')
          .setPlaceholder('e.g. citybank')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const accountInput = new TextInputBuilder()
          .setCustomId('account_name')
          .setLabel('Payout Account Name')
          .setPlaceholder('e.g. store_revenue')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(storeInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(bankInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(accountInput)
        );

        await interaction.showModal(modal);
      } else if (cid === 'onyx_btn_paylink') {
        const modal = new ModalBuilder()
          .setCustomId('onyx_modal_paylink')
          .setTitle('🔗 Generate Onyx Payment Button');

        const amountInput = new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount ($)')
          .setPlaceholder('e.g. 25.00')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const descInput = new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Item Description')
          .setPlaceholder('e.g. VIP Subscription Pass')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
        );

        await interaction.showModal(modal);
      } else if (cid === 'onyx_btn_banks') {
        await handleOnyxBanksList(interaction);
      } else if (cid === 'onyx_btn_stores') {
        await handleOnyxMerchantsList(interaction);
      } else if (cid === 'onyx_btn_feed') {
        await handleOnyxFeed(interaction);
      } else if (cid.startsWith('onyx_btn_checkout_')) {
        const productId = cid.replace('onyx_btn_checkout_', '');
        await handleOnyxCheckoutButtonClick(interaction, productId);
      } else if (cid.startsWith('onyx_btn_quote_')) {
        const quoteId = cid.replace('onyx_btn_quote_', '');
        await handleOnyxQuoteButtonClick(interaction, quoteId);
      }
    } else if (interaction.isModalSubmit()) {
      const mid = interaction.customId;
      if (mid === 'onyx_modal_pay') {
        const senderAcc = interaction.fields.getTextInputValue('sender_acc').trim();
        const targetBank = interaction.fields.getTextInputValue('target_bank').trim();
        const targetAcc = interaction.fields.getTextInputValue('target_acc').trim();
        const amountStr = interaction.fields.getTextInputValue('amount').trim();
        const memo = interaction.fields.getTextInputValue('memo')?.trim() || 'Onyx PSP Payment';

        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          await interaction.reply({ content: '❌ Invalid payment amount.', ephemeral: true });
          return;
        }

        await handleOnyxCrossBankPayment(interaction, senderAcc, targetBank, targetAcc, amount, memo);
      } else if (mid === 'onyx_modal_merchant') {
        const storeName = interaction.fields.getTextInputValue('store_name').trim();
        const bankId = interaction.fields.getTextInputValue('bank_id').trim();
        const accName = interaction.fields.getTextInputValue('account_name').trim();

        await handleOnyxRegisterMerchantModal(interaction, storeName, bankId, accName);
      } else if (mid === 'onyx_modal_paylink') {
        const amountStr = interaction.fields.getTextInputValue('amount').trim();
        const desc = interaction.fields.getTextInputValue('description').trim();
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount <= 0) {
          await interaction.reply({ content: '❌ Invalid payment amount.', ephemeral: true });
          return;
        }

        await handleOnyxCreatePayLinkModal(interaction, amount, desc);
      } else if (mid.startsWith('onyx_modal_pay_product_')) {
        const productId = mid.replace('onyx_modal_pay_product_', '');
        const senderAcc = interaction.fields.getTextInputValue('sender_acc').trim();
        const amountStr = interaction.fields.getTextInputValue('amount')?.trim();
        await handleOnyxSubmitProductPayment(interaction, productId, senderAcc, amountStr);
      } else if (mid.startsWith('onyx_modal_pay_quote_')) {
        const quoteId = mid.replace('onyx_modal_pay_quote_', '');
        const senderAcc = interaction.fields.getTextInputValue('sender_acc').trim();
        await handleOnyxSubmitQuotePayment(interaction, quoteId, senderAcc);
      }
    } else if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;
      if (name === 'onyx-banks') {
        await handleOnyxBanksList(interaction);
      } else if (name === 'onyx-pay') {
        const toAcc = interaction.options.getString('to_account', true);
        const amount = interaction.options.getNumber('amount', true);
        const toBank = interaction.options.getString('to_bank') || '';
        const memo = interaction.options.getString('memo') || 'Slash Onyx Payment';

        await handleOnyxCrossBankPayment(interaction, 'default', toBank, toAcc, amount, memo);
      } else if (name === 'onyx-merchant-setup') {
        const storeName = interaction.options.getString('store_name', true);
        const bankId = interaction.options.getString('bank_id', true);
        const accName = interaction.options.getString('account_name', true);
        await handleOnyxRegisterMerchantModal(interaction, storeName, bankId, accName);
      } else if (name === 'onyx-checkout-button') {
        await handleOnyxCreateCheckoutButtonCmd(interaction);
      } else if (name === 'onyx-quote') {
        await handleOnyxCreateQuoteCmd(interaction);
      }
    }
  } catch (e) {
    console.error('[OnyxBot] Interaction error:', e);
  }
}

async function handleOnyxCrossBankPayment(
  interaction: ButtonInteraction | ModalSubmitInteraction | CommandInteraction,
  senderAccQuery: string,
  targetBankQuery: string,
  targetAccQuery: string,
  amount: number,
  memo: string
) {
  await interaction.deferReply({ ephemeral: true });
  const amountCents = Math.round(amount * 100);

  // 1. Locate sender's bank account across ALL banks
  let senderAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.ownerDiscordId, interaction.user.id));
  if (senderAccounts.length === 0) {
    await interaction.editReply({ content: '❌ You do not have any registered bank accounts in the system.' });
    return;
  }

  let sourceAccount = senderAccounts[0];
  if (senderAccQuery && senderAccQuery !== 'default') {
    const matched = senderAccounts.find(a => a.accountName.toLowerCase() === senderAccQuery.toLowerCase() || a.id === senderAccQuery);
    if (matched) sourceAccount = matched;
  }

  if (sourceAccount.balance < amountCents) {
    await interaction.editReply({ 
      content: `❌ **Insufficient Funds.**\nAccount **${sourceAccount.accountName}** has balance **$${(sourceAccount.balance / 100).toFixed(2)}**, required: **$${amount.toFixed(2)}**.` 
    });
    return;
  }

  // 2. Locate target bank
  let targetBankObj = null;
  const allBanks = await db.select().from(banks);
  if (targetBankQuery) {
    targetBankObj = allBanks.find(b => b.id.toLowerCase() === targetBankQuery.toLowerCase() || b.name.toLowerCase().includes(targetBankQuery.toLowerCase()));
  }
  
  if (!targetBankObj) {
    // Search target account across all banks
    const possibleAccs = await db.select().from(bankAccounts).where(
      or(
        eq(bankAccounts.accountName, targetAccQuery),
        eq(bankAccounts.id, targetAccQuery)
      )
    );
    if (possibleAccs.length === 0) {
      await interaction.editReply({ content: `❌ Recipient account **${targetAccQuery}** or target bank not found.` });
      return;
    }
    const destAcc = possibleAccs[0];
    targetBankObj = allBanks.find(b => b.id === destAcc.bankId) || null;
  }

  if (!targetBankObj) {
    await interaction.editReply({ content: '❌ Target bank could not be determined.' });
    return;
  }

  // 3. Locate target account in target bank
  const destAccs = await db.select().from(bankAccounts).where(
    and(
      eq(bankAccounts.bankId, targetBankObj.id),
      or(
        eq(bankAccounts.accountName, targetAccQuery),
        eq(bankAccounts.id, targetAccQuery)
      )
    )
  );

  if (destAccs.length === 0) {
    await interaction.editReply({ content: `❌ Account **${targetAccQuery}** not found in bank **${targetBankObj.name}**.` });
    return;
  }

  const destAcc = destAccs[0];

  // 4. Calculate B2B Onyx Fee
  const settings = await db.select().from(onyxSettings).where(eq(onyxSettings.id, 'global')).get();
  const feePercent = settings?.b2bApiFeePercent || 200; // 2.00%
  const onyxFeeCents = Math.round((amountCents * feePercent) / 10000);
  const netAmountCents = amountCents - onyxFeeCents;

  // 5. Execute ledger transfer
  await db.update(bankAccounts).set({ balance: sourceAccount.balance - amountCents }).where(eq(bankAccounts.id, sourceAccount.id));
  await db.update(bankAccounts).set({ balance: destAcc.balance + netAmountCents }).where(eq(bankAccounts.id, destAcc.id));

  // 6. Record transaction and settlement
  const txId = uuidv4();
  await db.insert(transactions).values({
    id: txId,
    bankId: sourceAccount.bankId,
    fromAccountId: sourceAccount.id,
    toAccountId: destAcc.id,
    amount: amountCents,
    type: 'onyx_transfer',
    description: `Onyx PSP Cross-Bank: ${memo} (Fee: $${(onyxFeeCents / 100).toFixed(2)})`,
    timestamp: new Date()
  });

  if (sourceAccount.bankId !== destAcc.bankId) {
    await db.insert(clearinghouseSettlements).values({
      id: uuidv4(),
      fromBankId: sourceAccount.bankId,
      toBankId: destAcc.bankId,
      amount: netAmountCents,
      status: 'paid',
      createdAt: new Date()
    });
  }

  const sourceBankObj = allBanks.find(b => b.id === sourceAccount.bankId);

  await interaction.editReply({
    content: 
      `✅ **Onyx PSP Cross-Bank Payment Successful!**\n\n` +
      `💸 **Amount**: **$${amount.toFixed(2)}**\n` +
      `🏦 **From**: **${sourceBankObj?.name || 'Bank'}** (\`${sourceAccount.accountName}\`)\n` +
      `🏦 **To**: **${targetBankObj.name}** (\`${destAcc.accountName}\`)\n` +
      `⚡ **Onyx Fee (${(feePercent / 100).toFixed(2)}%)**: **$${(onyxFeeCents / 100).toFixed(2)}**\n` +
      `📝 **Memo**: \`${memo}\`\n` +
      `🆔 **Onyx Tx ID**: \`${txId.substring(0, 8)}\``
  });
}

async function handleOnyxRegisterMerchantModal(
  interaction: ModalSubmitInteraction | ChatInputCommandInteraction,
  storeName: string,
  bankId: string,
  accName: string
) {
  await interaction.deferReply({ ephemeral: true });

  const b = await db.select().from(banks).where(eq(banks.id, bankId));
  if (b.length === 0) {
    await interaction.editReply({ content: `❌ Bank **${bankId}** does not exist.` });
    return;
  }

  const accs = await db.select().from(bankAccounts).where(and(eq(bankAccounts.bankId, bankId), eq(bankAccounts.accountName, accName)));
  if (accs.length === 0) {
    await interaction.editReply({ content: `❌ Account **${accName}** not found in bank **${b[0].name}**.` });
    return;
  }

  const apiKey = 'onyx_live_' + crypto.randomBytes(20).toString('hex');
  const merchantId = uuidv4();

  await db.insert(onyxMerchants).values({
    id: merchantId,
    name: storeName,
    bankId,
    destinationAccount: accs[0].id,
    apiKey,
    createdAt: new Date()
  });

  await interaction.editReply({
    content: 
      `🎉 **Merchant Terminal Registered on Onyx PSP!**\n\n` +
      `🏪 **Store Name**: **${storeName}**\n` +
      `🏦 **Settlement Bank**: **${b[0].name}** (\`${accName}\`)\n` +
      `🔑 **Onyx Merchant API Key**: \`${apiKey}\`\n\n` +
      `⚠️ *Keep this API key secret! You can use it for cross-server Discord checkout integration and web API payments.*`
  });
}

async function handleOnyxCreatePayLinkModal(
  interaction: ModalSubmitInteraction,
  amount: number,
  desc: string
) {
  await interaction.deferReply({ ephemeral: true });

  // Find user's primary bank account
  const userAccs = await db.select().from(bankAccounts).where(eq(bankAccounts.ownerDiscordId, interaction.user.id));
  if (userAccs.length === 0) {
    await interaction.editReply({ content: '❌ You must open a bank account at any member bank before generating payment links.' });
    return;
  }

  const acc = userAccs[0];
  const b = await db.select().from(banks).where(eq(banks.id, acc.bankId)).get();

  await interaction.editReply({
    content: 
      `🔗 **Onyx PSP Instant Payment Request**\n\n` +
      `💰 **Amount Requested**: **$${amount.toFixed(2)}**\n` +
      `📦 **Item**: **${desc}**\n` +
      `🏦 **Recipient Settlement**: **${b?.name || 'Bank'}** (\`${acc.accountName}\`)\n` +
      `🆔 **Payee**: <@${interaction.user.id}>\n\n` +
      `Any Discord user from ANY bank can click **Pay Any Account** on Onyx PSP to fulfill this request!`
  });
}

async function handleOnyxBanksList(interaction: ButtonInteraction | CommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const allBanks = await db.select().from(banks);
  let txt = `🏦 **Onyx PSP Member Banks Directory (${allBanks.length})**\n\n`;

  for (const b of allBanks) {
    const accs = await db.select({ count: sql<number>`COUNT(${bankAccounts.id})`, sum: sql<number>`COALESCE(SUM(${bankAccounts.balance}), 0)` }).from(bankAccounts).where(eq(bankAccounts.bankId, b.id)).get();
    const status = b.maintenanceMode ? '🔴 Maintenance' : '🟢 Online';
    txt += `• **${b.name}** (\`${b.id}\`) — ${status}\n` +
      `  Accounts: **${accs?.count || 0}** | Liquidity: **$${((accs?.sum || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}**\n\n`;
  }

  await interaction.editReply({ content: txt });
}

async function handleOnyxFeed(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const recent = await db.select({
    id: transactions.id,
    amount: transactions.amount,
    desc: transactions.description,
    time: transactions.timestamp
  }).from(transactions).where(sql`${transactions.type} LIKE 'onyx_%'`).orderBy(desc(transactions.timestamp)).limit(10);

  if (recent.length === 0) {
    await interaction.editReply({ content: '📜 **No Recent Onyx Inter-Bank Settlements**\nNo cross-bank transfers cleared recently.' });
    return;
  }

  let txt = `📜 **Recent Onyx Cross-Bank Settlement Feed**\n\n`;
  for (const r of recent) {
    const timeStr = `<t:${Math.floor(r.time.getTime()/1000)}:R>`;
    txt += `• **$${(r.amount / 100).toFixed(2)}** — \`${r.desc}\` (${timeStr})\n`;
  }

  await interaction.editReply({ content: txt });
}

async function handleOnyxMerchantsList(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const merchants = await db.select().from(onyxMerchants);

  if (merchants.length === 0) {
    await interaction.editReply({
      content: '🛒 **Onyx PSP Merchant Directory**\n\nNo active registered merchant stores found. Click **🏪 Merchant Registration** to register your store on the Onyx PSP network!'
    });
    return;
  }

  let text = `🛒 **Onyx PSP Active Merchant Directory**\n\n`;
  for (const m of merchants) {
    text += `• 🏪 **${m.name}**\n  ├ Settlement Bank: \`${m.bankId}\`\n  ├ Payout Account: \`${m.destinationAccount}\`\n  └ Status: 🟢 ACTIVE\n\n`;
  }

  await interaction.editReply({ content: text });
}

// --- MERCHANT CHECKOUT BUTTONS & CUSTOM QUOTES HANDLERS ---

async function handleOnyxCreateCheckoutButtonCmd(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const merchantId = interaction.options.getString('merchant_id', true);
  const productName = interaction.options.getString('product_name', true);
  const priceType = interaction.options.getString('price_type', true);
  const priceDollars = interaction.options.getNumber('price') || 0;
  const description = interaction.options.getString('description') || 'Official Merchant Product';

  const merchant = await db.select().from(onyxMerchants).where(eq(onyxMerchants.id, merchantId)).get();
  if (!merchant) {
    await interaction.editReply({ content: `❌ Merchant store with ID \`${merchantId}\` not found.` });
    return;
  }

  const priceCents = Math.round(priceDollars * 100);
  const productId = uuidv4();

  await db.insert(onyxMerchantProducts).values({
    id: productId,
    merchantId,
    name: productName,
    priceType: priceType as any,
    price: priceCents,
    description,
    createdAt: new Date()
  });

  const priceLabel = priceType === 'fixed' ? `$${priceDollars.toFixed(2)}` : 'Customer Choice Amount';

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`onyx_btn_checkout_${productId}`)
      .setLabel(`🛒 Pay ${priceLabel}`)
      .setStyle(ButtonStyle.Success)
  );

  const embed = {
    title: `🏪 ${merchant.name} • ${productName}`,
    description: `**Item Description**: ${description}\n\n🏷️ **Price**: **${priceLabel}**\n💳 **Accepted Network**: Onyx Global PSP (All Member Banks)`,
    color: 0x10b981,
    footer: { text: `Store ID: ${merchant.id} • Onyx PSP Merchant Terminal` },
    timestamp: new Date().toISOString()
  };

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleOnyxCheckoutButtonClick(interaction: ButtonInteraction, productId: string) {
  const product = await db.select().from(onyxMerchantProducts).where(eq(onyxMerchantProducts.id, productId)).get();
  if (!product || !product.isActive) {
    await interaction.reply({ content: '❌ Product no longer available or inactive.', ephemeral: true });
    return;
  }

  const merchant = await db.select().from(onyxMerchants).where(eq(onyxMerchants.id, product.merchantId)).get();

  const modal = new ModalBuilder()
    .setCustomId(`onyx_modal_pay_product_${product.id}`)
    .setTitle(`Checkout: ${product.name.substring(0, 20)}`);

  const accInput = new TextInputBuilder()
    .setCustomId('sender_acc')
    .setLabel('Your Source Bank Account Name')
    .setPlaceholder('e.g. main, checking, savings, or UUID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  if (product.priceType === 'custom_customer') {
    const amtInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Enter Payment Amount ($)')
      .setPlaceholder('e.g. 15.00')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(accInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amtInput)
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(accInput)
    );
  }

  await interaction.showModal(modal);
}

async function handleOnyxSubmitProductPayment(
  interaction: ModalSubmitInteraction,
  productId: string,
  senderAccQuery: string,
  customAmountStr?: string
) {
  await interaction.deferReply({ ephemeral: true });

  const product = await db.select().from(onyxMerchantProducts).where(eq(onyxMerchantProducts.id, productId)).get();
  if (!product) {
    await interaction.editReply({ content: '❌ Product not found.' });
    return;
  }

  const merchant = await db.select().from(onyxMerchants).where(eq(onyxMerchants.id, product.merchantId)).get();
  if (!merchant) {
    await interaction.editReply({ content: '❌ Merchant store not found.' });
    return;
  }

  let finalAmountCents = product.price;
  if (product.priceType === 'custom_customer') {
    const amt = parseFloat(customAmountStr || '0');
    if (isNaN(amt) || amt <= 0) {
      await interaction.editReply({ content: '❌ Invalid custom amount entered.' });
      return;
    }
    finalAmountCents = Math.round(amt * 100);
  }

  // Execute payment using cross-bank routine
  await handleOnyxCrossBankPayment(
    interaction,
    senderAccQuery,
    merchant.bankId,
    merchant.destinationAccount,
    finalAmountCents / 100,
    `Merchant Sale: ${product.name} (${merchant.name})`
  );

  // Dispatch webhook for Merchant Sale!
  dispatchDiscordWebhook(merchant.bankId, "merchant_sale", {
    title: "🏪 Onyx Merchant Store Sale!",
    description: `Successful checkout for **${merchant.name}**.`,
    color: 0x10b981,
    fields: [
      { name: "Product", value: product.name, inline: true },
      { name: "Amount", value: `$${(finalAmountCents / 100).toFixed(2)}`, inline: true },
      { name: "Customer Discord", value: `<@${interaction.user.id}>`, inline: true }
    ]
  });
}

async function handleOnyxCreateQuoteCmd(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const merchantId = interaction.options.getString('merchant_id', true);
  const amountDollars = interaction.options.getNumber('amount', true);
  const title = interaction.options.getString('title', true);
  const description = interaction.options.getString('description') || 'Custom Invoice Quote';
  const clientUser = interaction.options.getUser('client_user');

  const merchant = await db.select().from(onyxMerchants).where(eq(onyxMerchants.id, merchantId)).get();
  if (!merchant) {
    await interaction.editReply({ content: `❌ Merchant store with ID \`${merchantId}\` not found.` });
    return;
  }

  const amountCents = Math.round(amountDollars * 100);
  const quoteId = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(onyxQuotes).values({
    id: quoteId,
    merchantId,
    createdByDiscordId: interaction.user.id,
    clientDiscordId: clientUser ? clientUser.id : null,
    amount: amountCents,
    title,
    description,
    expiresAt,
    createdAt: new Date()
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`onyx_btn_quote_${quoteId}`)
      .setLabel(`💳 Pay Quote ($${amountDollars.toFixed(2)})`)
      .setStyle(ButtonStyle.Success)
  );

  const embed = {
    title: `🧾 Custom Quote / Invoice: ${title}`,
    description: 
      `**Store**: **${merchant.name}**\n` +
      `**Details**: ${description}\n` +
      (clientUser ? `**Client Target**: <@${clientUser.id}>\n` : '') +
      `**Total Due**: **$${amountDollars.toFixed(2)}**\n` +
      `**Expires**: <t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
    color: 0x6366f1,
    footer: { text: `Quote ID: ${quoteId.substring(0, 8)} • Onyx PSP Billing` },
    timestamp: new Date().toISOString()
  };

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleOnyxQuoteButtonClick(interaction: ButtonInteraction, quoteId: string) {
  const quote = await db.select().from(onyxQuotes).where(eq(onyxQuotes.id, quoteId)).get();
  if (!quote) {
    await interaction.reply({ content: '❌ Quote / Invoice not found.', ephemeral: true });
    return;
  }

  if (quote.status === 'paid') {
    await interaction.reply({ content: '✅ This quote has already been PAID in full.', ephemeral: true });
    return;
  }

  if (quote.expiresAt && new Date() > quote.expiresAt) {
    await interaction.reply({ content: '⌛ This quote has EXPIRED.', ephemeral: true });
    return;
  }

  if (quote.clientDiscordId && quote.clientDiscordId !== interaction.user.id) {
    await interaction.reply({ content: '🔒 This custom quote was issued specifically for another client.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`onyx_modal_pay_quote_${quote.id}`)
    .setTitle(`Pay Quote: $${(quote.amount / 100).toFixed(2)}`);

  const accInput = new TextInputBuilder()
    .setCustomId('sender_acc')
    .setLabel('Your Source Bank Account Name')
    .setPlaceholder('e.g. main, checking, savings, or UUID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(accInput));
  await interaction.showModal(modal);
}

async function handleOnyxSubmitQuotePayment(
  interaction: ModalSubmitInteraction,
  quoteId: string,
  senderAccQuery: string
) {
  await interaction.deferReply({ ephemeral: true });

  const quote = await db.select().from(onyxQuotes).where(eq(onyxQuotes.id, quoteId)).get();
  if (!quote || quote.status === 'paid') {
    await interaction.editReply({ content: '❌ Quote not found or already paid.' });
    return;
  }

  const merchant = await db.select().from(onyxMerchants).where(eq(onyxMerchants.id, quote.merchantId)).get();
  if (!merchant) {
    await interaction.editReply({ content: '❌ Merchant store not found.' });
    return;
  }

  // Pay quote
  await handleOnyxCrossBankPayment(
    interaction,
    senderAccQuery,
    merchant.bankId,
    merchant.destinationAccount,
    quote.amount / 100,
    `Custom Quote Paid: ${quote.title}`
  );

  // Update status
  await db.update(onyxQuotes).set({ status: 'paid' }).where(eq(onyxQuotes.id, quote.id));

  dispatchDiscordWebhook(merchant.bankId, "merchant_sale", {
    title: "🧾 Onyx Custom Quote / Invoice Paid!",
    description: `Quote **${quote.title}** paid by <@${interaction.user.id}>.`,
    color: 0x10b981,
    fields: [
      { name: "Quote ID", value: quote.id.substring(0, 8), inline: true },
      { name: "Amount Paid", value: `$${(quote.amount / 100).toFixed(2)}`, inline: true },
      { name: "Storefront", value: merchant.name, inline: true }
    ]
  });
}

