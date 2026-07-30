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

export function matchAccountNames(nameA: string, nameB: string, discordA?: string, discordB?: string): boolean {
  if (!nameA || !nameB) return false;

  const aLower = nameA.toLowerCase().trim();
  const bLower = nameB.toLowerCase().trim();
  if (aLower === bLower) return true;

  const clean = (s: string) => s
    .toLowerCase()
    .replace(/\(\d{17,20}\)/g, "")
    .replace(/\b\d{17,20}\b/g, "")
    .replace(/_(checking|savings|vault|business|payroll|personal)$/i, "")
    .replace(/ (checking|savings|vault|business|payroll|personal)$/i, "")
    .replace(/[^a-z0-9]/g, "");

  const cA = clean(nameA);
  const cB = clean(nameB);
  if (cA && cB && cA === cB) return true;

  const discordMatchA = nameA.match(/\b\d{17,20}\b/)?.[0] || discordA;
  const discordMatchB = nameB.match(/\b\d{17,20}\b/)?.[0] || discordB;

  if (discordMatchA && discordMatchB && discordMatchA === discordMatchB) {
    return true;
  }

  if (cA.length >= 3 && cB.length >= 3) {
    if (cA.includes(cB) || cB.includes(cA)) return true;
  }

  return false;
}

function cleanName(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/\(\d{17,20}\)/g, "")
    .replace(/\b\d{17,20}\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function syncSingleAccount(
  account: any, 
  bank: any, 
  preMap?: Map<string, any> | null, 
  preError?: string | null
) {
  let syncedRemote = false;
  let existsInGame = account.existsInGame ?? true;
  let syncError: string | null = null;
  let remoteBalanceCents: number | null = null;
  let addedTxsCount = 0;

  if (bank && bank.corpApiKey && bank.corpId !== null && bank.corpApiUuid !== null) {
    try {
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);

      let res: any = null;

      if (preMap !== undefined) {
        if (preMap !== null) {
          const targetRaw = (account.accountName || "").toString();

          let matchedRemote: any = null;
          for (const [key, remoteAcc] of preMap.entries()) {
            const remoteName = (remoteAcc.name || remoteAcc.account_name || remoteAcc.title || key || "").toString();
            if (matchAccountNames(targetRaw, remoteName, account.ownerDiscordId)) {
              matchedRemote = remoteAcc;
              break;
            }
          }

          if (matchedRemote) {
            res = {
              success: true,
              status: 200,
              balance: matchedRemote.balance ?? 0,
              account: matchedRemote
            };
          } else {
            // Direct query fallback for single account
            const directRes = await client.getAccountDetails(account.accountName);
            if (directRes && directRes.success) {
              res = directRes;
            } else {
              res = {
                success: false,
                status: 404,
                notFound: true,
                error: "Account not found on CityCorp in-game"
              };
            }
          }
        } else {
          res = {
            success: false,
            status: 500,
            notFound: false,
            error: preError || "CityCorp API error"
          };
        }
      } else {
        res = await client.getAccountDetails(account.accountName);
      }

      if (res && res.success) {
        remoteBalanceCents = Math.round(Number(res.balance ?? 0) * 100);
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
      } else if (res && res.notFound) {
        // Account specifically does NOT exist on CityCorp in game
        existsInGame = false;
        syncError = "Account does not exist on CityCorp in-game";
        remoteBalanceCents = 0;
        syncedRemote = true;
      } else if (res && !res.success) {
        // CityCorp API error (e.g. 401 Unauthorized, 403, 429, 500)
        // Keep previous existsInGame state (do not falsely mark as missing in game!), and present clear API error
        syncError = res.error || `CityCorp API error (${res.status})`;
        syncedRemote = false;
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

  let remoteAccountsMap: Map<string, any> | null = null;
  let remoteFetchError: string | null = null;

  if (bank && bank.corpApiKey && bank.corpId !== null && bank.corpApiUuid !== null) {
    try {
      const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
      const allRemote = await client.fetchAllAccounts();
      if (allRemote.success) {
        remoteAccountsMap = new Map();
        for (const remoteAcc of allRemote.accounts) {
          const rawName = (remoteAcc.name || remoteAcc.account_name || remoteAcc.title || "").toString();
          const nameKey = rawName.toLowerCase().trim();
          const cKey = cleanName(rawName);

          if (nameKey) remoteAccountsMap.set(nameKey, remoteAcc);
          if (cKey && !remoteAccountsMap.has(cKey)) remoteAccountsMap.set(cKey, remoteAcc);
        }
      } else {
        remoteFetchError = allRemote.error || `CityCorp API error (${allRemote.status})`;
      }
    } catch (err: any) {
      remoteFetchError = err.message || "Failed to reach CityCorp API";
    }
  }

  for (const acc of accounts) {
    job.currentAccountName = acc.accountName;
    job.updatedAt = new Date();

    try {
      const res = await syncSingleAccount(acc, bank, remoteAccountsMap, remoteFetchError);
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

    await new Promise(r => setTimeout(r, 50));
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

  // Cache bank details and bank remote account maps
  const bankCache = new Map<string, any>();
  const bankRemoteMaps = new Map<string, { map: Map<string, any> | null; error: string | null }>();

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

      let bankMapInfo: { map: Map<string, any> | null; error: string | null } | undefined = undefined;

      if (bank && bank.corpApiKey && bank.corpId !== null && bank.corpApiUuid !== null) {
        if (bankRemoteMaps.has(bank.id)) {
          bankMapInfo = bankRemoteMaps.get(bank.id)!;
        } else {
          try {
            const client = new CityCorpClient(bank.corpId, bank.corpApiUuid, bank.corpApiKey, bank.id);
            const allRemote = await client.fetchAllAccounts();
            if (allRemote.success) {
              const map = new Map<string, any>();
              for (const remoteAcc of allRemote.accounts) {
                const rawName = (remoteAcc.name || remoteAcc.account_name || remoteAcc.title || "").toString();
                const nameKey = rawName.toLowerCase().trim();
                const cKey = cleanName(rawName);

                if (nameKey) map.set(nameKey, remoteAcc);
                if (cKey && !map.has(cKey)) map.set(cKey, remoteAcc);
              }
              bankMapInfo = { map, error: null };
            } else {
              bankMapInfo = { map: null, error: allRemote.error || `CityCorp API error (${allRemote.status})` };
            }
          } catch (err: any) {
            bankMapInfo = { map: null, error: err.message || "Failed to reach CityCorp API" };
          }
          bankRemoteMaps.set(bank.id, bankMapInfo);
        }
      }

      const res = await syncSingleAccount(
        acc, 
        bank, 
        bankMapInfo ? bankMapInfo.map : undefined, 
        bankMapInfo ? bankMapInfo.error : undefined
      );

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

    await new Promise(r => setTimeout(r, 50));
  }

  job.status = 'completed';
  job.currentAccountName = undefined;
  job.updatedAt = new Date();
}
