import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  banks,
  bankSettings,
  bankAccounts,
  bankCustomers,
  transactions,
  loans,
  creditApplications,
  cards,
  escrows,
  invoices,
  onyxMerchants,
  subscriptions,
  vaultDeposits,
  bankStaff,
  auditLogs
} from "../db/schema.js";

export interface EncryptedBackupEnvelope {
  format: "SLATE_ENCRYPTED_BACKUP_V1";
  algorithm: "aes-256-gcm";
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string; // hex
  iv: string; // hex
  authTag: string; // hex
  ciphertext: string; // base64
  checksumSha256: string; // hex of raw unencrypted JSON
  exportedAt: string;
  bankId: string;
  bankName: string;
  stats: Record<string, number>;
}

/**
 * Extracts and bundles all tenant-specific bank data for a single bank.
 */
export async function generateBankBackup(bankId: string) {
  const bank = await db.select().from(banks).where(eq(banks.id, bankId)).get();
  if (!bank) throw new Error(`Bank not found: ${bankId}`);

  const [
    settings,
    accountsList,
    customersList,
    transactionsList,
    loansList,
    creditAppsList,
    cardsList,
    escrowsList,
    invoicesList,
    merchantsList,
    subscriptionsList,
    vaultList,
    staffList,
    logsList,
  ] = await Promise.all([
    db.select().from(bankSettings).where(eq(bankSettings.bankId, bankId)).get(),
    db.select().from(bankAccounts).where(eq(bankAccounts.bankId, bankId)),
    db.select().from(bankCustomers).where(eq(bankCustomers.bankId, bankId)),
    db.select().from(transactions).where(eq(transactions.bankId, bankId)).orderBy(desc(transactions.timestamp)).limit(5000),
    db.select().from(loans).where(eq(loans.bankId, bankId)),
    db.select().from(creditApplications).where(eq(creditApplications.bankId, bankId)),
    db.select().from(cards).where(eq(cards.bankId, bankId)),
    db.select().from(escrows).where(eq(escrows.bankId, bankId)),
    db.select().from(invoices).where(eq(invoices.bankId, bankId)),
    db.select().from(onyxMerchants).where(eq(onyxMerchants.bankId, bankId)),
    db.select().from(subscriptions).where(eq(subscriptions.bankId, bankId)),
    db.select().from(vaultDeposits).where(eq(vaultDeposits.bankId, bankId)),
    db.select().from(bankStaff).where(eq(bankStaff.bankId, bankId)),
    db.select().from(auditLogs).where(eq(auditLogs.bankId, bankId)).orderBy(desc(auditLogs.timestamp)).limit(1000),
  ]);

  // Strip top-level platform secret from export for security
  const sanitizedBank = { ...bank };
  delete (sanitizedBank as any).discordToken;
  delete (sanitizedBank as any).apiKeyHash;

  const stats = {
    accounts: accountsList.length,
    customers: customersList.length,
    transactions: transactionsList.length,
    loans: loansList.length,
    creditApplications: creditAppsList.length,
    cards: cardsList.length,
    escrows: escrowsList.length,
    invoices: invoicesList.length,
    merchants: merchantsList.length,
    subscriptions: subscriptionsList.length,
    vaultDeposits: vaultList.length,
    staff: staffList.length,
    auditLogs: logsList.length,
  };

  const payload = {
    version: "1.0",
    bankId,
    bankName: bank.name,
    exportedAt: new Date().toISOString(),
    stats,
    bank: sanitizedBank,
    settings: settings || null,
    accounts: accountsList,
    customers: customersList,
    transactions: transactionsList,
    loans: loansList,
    creditApplications: creditAppsList,
    cards: cardsList,
    escrows: escrowsList,
    invoices: invoicesList,
    onyxMerchants: merchantsList,
    subscriptions: subscriptionsList,
    vaultDeposits: vaultList,
    staff: staffList,
    auditLogs: logsList,
  };

  return { payload, stats, bank, settings };
}

/**
 * Encrypts bank data payload using AES-256-GCM and PBKDF2.
 */
export function encryptBackup(
  payload: any,
  passphrase?: string | null,
  bankId?: string,
  bankName?: string
): EncryptedBackupEnvelope {
  const rawJson = JSON.stringify(payload);
  const checksumSha256 = crypto.createHash("sha256").update(rawJson).digest("hex");

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const effectivePass = (passphrase && passphrase.trim().length > 0)
    ? passphrase.trim()
    : `slate_tenant_backup_key_${bankId || "core"}`;

  const key = crypto.pbkdf2Sync(effectivePass, salt, 100000, 32, "sha256");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(rawJson, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    format: "SLATE_ENCRYPTED_BACKUP_V1",
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: 100000,
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext: encrypted.toString("base64"),
    checksumSha256,
    exportedAt: new Date().toISOString(),
    bankId: bankId || payload.bankId || "unknown",
    bankName: bankName || payload.bankName || "Slate Bank",
    stats: payload.stats || {},
  };
}

/**
 * Decrypts a SLATE_ENCRYPTED_BACKUP_V1 envelope with the provided passphrase.
 */
export function decryptBackup(envelope: EncryptedBackupEnvelope, passphrase?: string | null) {
  if (envelope.format !== "SLATE_ENCRYPTED_BACKUP_V1") {
    throw new Error("Invalid or unsupported backup format.");
  }

  const salt = Buffer.from(envelope.salt, "hex");
  const iv = Buffer.from(envelope.iv, "hex");
  const authTag = Buffer.from(envelope.authTag, "hex");
  const ciphertextBuffer = Buffer.from(envelope.ciphertext, "base64");

  const effectivePass = (passphrase && passphrase.trim().length > 0)
    ? passphrase.trim()
    : `slate_tenant_backup_key_${envelope.bankId || "core"}`;

  const key = crypto.pbkdf2Sync(effectivePass, salt, envelope.iterations || 100000, 32, "sha256");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
  const rawJson = decrypted.toString("utf8");

  const computedChecksum = crypto.createHash("sha256").update(rawJson).digest("hex");
  if (computedChecksum !== envelope.checksumSha256) {
    throw new Error("Checksum mismatch: Decrypted backup content is corrupted or altered.");
  }

  return JSON.parse(rawJson);
}

/**
 * Executes an encrypted backup export and uploads it as a file attachment to the configured Discord Webhook.
 */
export async function dispatchBackupWebhook(
  bankId: string,
  overrideWebhookUrl?: string,
  actorDiscordId: string = "system_cron"
) {
  const { payload, stats, bank, settings } = await generateBankBackup(bankId);

  const targetWebhook = (overrideWebhookUrl || settings?.backupWebhookUrl || settings?.discordWebhookUrl || "").trim();
  if (!targetWebhook) {
    throw new Error("No webhook URL configured. Please specify a Backup Webhook URL or General Discord Webhook.");
  }

  const envelope = encryptBackup(payload, settings?.backupEncryptionPassphrase, bank.id, bank.name);
  const serializedEnvelope = JSON.stringify(envelope, null, 2);
  const envelopeBuffer = Buffer.from(serializedEnvelope, "utf8");

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const slug = ((bank as any).slug || bank.name || bank.id || "bank").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const fileName = `${slug}_backup_${dateStr}.slate.enc`;

  // Multipart/form-data upload to Discord Webhook
  const formData = new FormData();
  const fileBlob = new Blob([envelopeBuffer], { type: "application/json" });
  formData.append("files[0]", fileBlob, fileName);

  const embedFields = [
    { name: "🛡️ Encryption", value: "`AES-256-GCM` (100k PBKDF2)", inline: true },
    { name: "🗄️ File Size", value: `${(envelopeBuffer.length / 1024).toFixed(1)} KB`, inline: true },
    { name: "🔑 Key Passphrase", value: settings?.backupEncryptionPassphrase ? "Custom Vault Passphrase" : "Bank-Isolated Master Key", inline: true },
    { name: "📊 Snapshot Summary", value: `• **${stats.accounts}** Accounts\n• **${stats.customers}** Customers\n• **${stats.transactions}** Transactions\n• **${stats.loans}** Loans\n• **${stats.cards}** Payment Cards`, inline: false },
    { name: "🔒 SHA-256 Checksum", value: `\`${envelope.checksumSha256.substring(0, 24)}…\``, inline: false },
  ];

  const payloadJson = {
    username: `${bank.name} Vault Guard`,
    avatar_url: bank.logoUrl || undefined,
    embeds: [
      {
        title: `🔐 Automated Encrypted Bank Backup — ${bank.name}`,
        description: `Full cryptographic snapshot generated on **${now.toUTCString()}**.\n\nAll customer ledgers, account balances, KYC identity records, and transactions for **${bank.name}** are encrypted inside the attached file.`,
        color: 0x10b981,
        fields: embedFields,
        footer: {
          text: "Slate Banking System • Encrypted Tenant Backup",
        },
        timestamp: now.toISOString(),
      },
    ],
  };

  formData.append("payload_json", JSON.stringify(payloadJson));

  const response = await fetch(targetWebhook, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Discord Webhook upload failed (${response.status}): ${errorText}`);
  }

  // Update last backup timestamp
  await db
    .update(bankSettings)
    .set({
      lastDailyBackupAt: now,
    })
    .where(eq(bankSettings.bankId, bank.id));

  // Log in audit log
  const { v4: uuidv4 } = await import("uuid");
  await db.insert(auditLogs).values({
    id: `aud_${uuidv4().substring(0, 8)}`,
    bankId: bank.id,
    userDiscordId: actorDiscordId,
    action: "backup_webhook_dispatched",
    details: `Encrypted backup (${(envelopeBuffer.length / 1024).toFixed(1)} KB) dispatched to webhook. Accounts: ${stats.accounts}, Customers: ${stats.customers}.`,
    timestamp: now,
  });

  return {
    success: true,
    fileName,
    fileSizeBytes: envelopeBuffer.length,
    stats,
    dispatchedAt: now.toISOString(),
    checksumSha256: envelope.checksumSha256,
  };
}

/**
 * Scheduled job to check all banks with daily backups enabled and dispatch if >= 20 hours since last run.
 */
export async function runScheduledDailyBackups() {
  try {
    const eligibleSettings = await db
      .select()
      .from(bankSettings)
      .where(eq(bankSettings.dailyBackupEnabled, true));

    const now = Date.now();
    const TWENTY_HOURS_MS = 20 * 60 * 60 * 1000;

    for (const setting of eligibleSettings) {
      const lastRun = setting.lastDailyBackupAt ? new Date(setting.lastDailyBackupAt).getTime() : 0;
      if (now - lastRun >= TWENTY_HOURS_MS) {
        console.log(`[BackupService] Starting scheduled daily backup for bank: ${setting.bankId}`);
        try {
          await dispatchBackupWebhook(setting.bankId, undefined, "system_daily_cron");
          console.log(`[BackupService] Successfully dispatched daily backup for bank: ${setting.bankId}`);
        } catch (err: any) {
          console.error(`[BackupService] Scheduled backup error for bank ${setting.bankId}:`, err?.message || err);
        }
      }
    }
  } catch (globalErr) {
    console.error("[BackupService] Error in runScheduledDailyBackups:", globalErr);
  }
}
