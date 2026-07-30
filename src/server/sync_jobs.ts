import { db } from "../db/index";
import { bankAccounts, transactions, banks, accountMembers } from "../db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { CityCorpClient } from "../lib/citycorp_api";

export interface SyncJob {
  id: string;
  type: 'bank' | 'citizen';
  bankId?: string;
  discordId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  syncedCount: number;
  flaggedCount: number;
  currentAccountName?: string;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const syncJobs = new Map<string, SyncJob>();

// Clean up jobs older than 1 hour periodically
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of syncJobs.entries()) {
    if (job.updatedAt.getTime() < oneHourAgo) {
      syncJobs.delete(id);
    }
  }
}, 10 * 60 * 1000);

export function getSyncJob(jobId: string): SyncJob | undefined {
  return syncJobs.get(jobId);
}

export async function syncSingleAccount(account: any, bank: any) {
  let syncedRemote = false;
  let existsInGame = true;
  let syncError: string | null = null;
  let remoteBalanceCents: number | null = null;
  let addedTxsCount = 0;

  if (bank && bank.corpApiKey && bank.corpId !== null && bank.corpApiUuid !== null) {
    try {
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      const accountDetails = await client.getAccountDetails(account.accountName);

      if (accountDetails && accountDetails.account) {
        remoteBalanceCents = Math.round(Number(accountDetails.account.balance) * 100);
        syncedRemote = true;
        existsInGame = true;
        syncError = null;

        // Fetch remote transactions to keep local ledger updated
        try {
          const remoteTxs = await client.getAccountTransactions(account.accountName, 1);
          if (remoteTxs && Array.isArray(remoteTxs.transactions) && remoteTxs.transactions.length > 0) {
            const existingTxs = await db.select().from(transactions).where(
              and(
                eq(transactions.bankId, bank.id),
                or(eq(transactions.toAccountId, account.id), eq(transactions.fromAccountId, account.id))
              )
            );
            const existingTxIds = new Set(existingTxs.map(t => t.id));
            const existingTxKeys = new Set(existingTxs.map(t => `${t.type}_${t.amount}_${t.description}`));

            for (const tx of remoteTxs.transactions) {
              let txAmount = tx.amount || tx.value || 0;
              if (typeof txAmount === 'string') txAmount = parseFloat(txAmount.replace(/[^0-9.-]+/g, ""));
              const isOutflow = tx.type === 'withdraw' || tx.type === 'transfer_out' || txAmount < 0;
              const amountCents = Math.abs(Math.round(Number(txAmount) * 100));
              const desc = tx.description || tx.memo || "Synced transaction";
              const txTypeKey = `${isOutflow ? 'withdraw' : 'deposit'}_${amountCents}_${desc}`;

              if (!existingTxIds.has(tx.id) && !existingTxKeys.has(txTypeKey)) {
                await db.insert(transactions).values({
                  id: tx.id || uuidv4(),
                  bankId: bank.id,
                  fromAccountId: isOutflow ? account.id : null,
                  toAccountId: !isOutflow ? account.id : null,
                  type: isOutflow ? 'withdraw' : 'deposit',
                  amount: amountCents,
                  description: desc,
                  timestamp: new Date(tx.timestamp || tx.date || tx.created_at || Date.now())
                });
                addedTxsCount++;
                existingTxKeys.add(txTypeKey);
              }
            }
          }
        } catch (txErr) {
          console.error(`Non-fatal transaction fetch error for ${account.accountName}:`, txErr);
        }
      } else {
        // Account does NOT exist on CityCorp in game!
        existsInGame = false;
        syncError = "Account does not exist on CityCorp in-game";
        remoteBalanceCents = 0;
        syncedRemote = true;
      }
    } catch (err: any) {
      console.error(`Error syncing account ${account.accountName}:`, err);
      syncError = err.message || "Failed to reach CityCorp API";
    }
  }

  let finalBalance = account.balance;
  if (syncedRemote && remoteBalanceCents !== null) {
    finalBalance = remoteBalanceCents;
  } else if (!bank || !bank.corpApiKey) {
    // Standalone bank ledger recalculation
    const accTxs = await db.select().from(transactions).where(
      or(eq(transactions.toAccountId, account.id), eq(transactions.fromAccountId, account.id))
    );
    let net = 0;
    for (const t of accTxs) {
      if (t.toAccountId === account.id) net += t.amount;
      if (t.fromAccountId === account.id) net -= t.amount;
    }
    finalBalance = net;
  }

  await db.update(bankAccounts).set({
    balance: finalBalance,
    existsInGame: existsInGame,
    syncError: syncError,
    lastSyncedAt: new Date()
  }).where(eq(bankAccounts.id, account.id));

  return {
    success: true,
    existsInGame,
    balance: finalBalance,
    syncError,
    addedTxsCount
  };
}

export function startBankSyncJob(bankId: string, accounts: any[], bank: any): string {
  const jobId = uuidv4();
  const job: SyncJob = {
    id: jobId,
    type: 'bank',
    bankId,
    status: 'pending',
    total: accounts.length,
    processed: 0,
    syncedCount: 0,
    flaggedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  syncJobs.set(jobId, job);

  // Run asynchronously in background
  processSyncJob(jobId, accounts, bank);

  return jobId;
}

export function startCitizenSyncJob(discordId: string, accounts: any[]): string {
  const jobId = uuidv4();
  const job: SyncJob = {
    id: jobId,
    type: 'citizen',
    discordId,
    status: 'pending',
    total: accounts.length,
    processed: 0,
    syncedCount: 0,
    flaggedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  syncJobs.set(jobId, job);

  // Run asynchronously in background
  processCitizenSyncJob(jobId, accounts);

  return jobId;
}

async function processSyncJob(jobId: string, accounts: any[], bank: any) {
  const job = syncJobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date();

  for (const acc of accounts) {
    job.currentAccountName = acc.accountName;
    job.updatedAt = new Date();

    try {
      const res = await syncSingleAccount(acc, bank);
      if (res.existsInGame) {
        job.syncedCount++;
      } else {
        job.flaggedCount++;
      }
    } catch (e: any) {
      console.error("Sync job error for account:", acc.id, e);
      job.flaggedCount++;
    }

    job.processed++;
    job.updatedAt = new Date();

    // 250ms pause between accounts to prevent hitting API limits
    await new Promise(r => setTimeout(r, 250));
  }

  job.status = 'completed';
  job.currentAccountName = undefined;
  job.updatedAt = new Date();
}

async function processCitizenSyncJob(jobId: string, accounts: any[]) {
  const job = syncJobs.get(jobId);
  if (!job) return;

  job.status = 'processing';
  job.updatedAt = new Date();

  // Cache bank details
  const bankCache = new Map<string, any>();

  for (const acc of accounts) {
    job.currentAccountName = acc.accountName;
    job.updatedAt = new Date();

    try {
      let bank = null;
      if (acc.bankId) {
        if (bankCache.has(acc.bankId)) {
          bank = bankCache.get(acc.bankId);
        } else {
          bank = await db.select().from(banks).where(eq(banks.id, acc.bankId)).get();
          if (bank) bankCache.set(acc.bankId, bank);
        }
      }

      const res = await syncSingleAccount(acc, bank);
      if (res.existsInGame) {
        job.syncedCount++;
      } else {
        job.flaggedCount++;
      }
    } catch (e: any) {
      console.error("Citizen sync job error for account:", acc.id, e);
      job.flaggedCount++;
    }

    job.processed++;
    job.updatedAt = new Date();

    // 250ms pause between accounts
    await new Promise(r => setTimeout(r, 250));
  }

  job.status = 'completed';
  job.currentAccountName = undefined;
  job.updatedAt = new Date();
}
