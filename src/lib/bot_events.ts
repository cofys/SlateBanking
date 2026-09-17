import WebSocket from "ws";
import { db } from "../db/index";
import { banks, bankAccounts, bankSettings, clearinghouseBalances } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { extractLiveBalanceCents, refreshAccountCache, settlementAccountName, clientForBank } from "./citycorp_money";
import { botManager } from "./bot_manager";

interface CityCorpEvent {
  type?: string;
  name?: string;
  event?: any;
}

export class CityCorpWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private headers: any;
  private bankId: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isClosed = false;
  private reconnectDelay = 5000;
  private maxReconnectDelay = 300000;
  private failureCount = 0;

  constructor(bankId: string, apiUuid: string, apiKey: string) {
    this.bankId = bankId;
    this.url = "wss://api.cityrp.org/citycorp";

    if (!apiKey || apiKey.trim() === "" || !apiUuid || apiUuid.trim() === "") {
      this.isClosed = true;
      console.log(`[Bank ${this.bankId}] CityCorp WebSocket event subscription is disabled (missing credentials).`);
      return;
    }

    const authString = `${apiUuid}:${apiKey}`;
    const authEncoded = Buffer.from(authString).toString("base64");
    this.headers = {
      Authorization: `Basic ${authEncoded}`,
    };
  }

  public connect() {
    if (this.isClosed) return;
    console.log(`[Bank ${this.bankId}] Connecting to CityCorp Event Stream (attempt #${this.failureCount + 1})...`);

    try {
      this.ws = new WebSocket(this.url, { headers: this.headers });

      this.ws.on("open", () => {
        console.log(`[Bank ${this.bankId}] WebSocket Connected! Listening for real-time transactions...`);
        this.reconnectDelay = 5000;
        this.failureCount = 0;
      });

      this.ws.on("message", async (data) => {
        try {
          const raw = data.toString();
          if (!raw || raw === "ping" || raw === "pong") return;
          const payload = JSON.parse(raw) as CityCorpEvent;
          await this.processEvent(payload);
        } catch (e) {
          // keepalive / non-JSON
        }
      });

      this.ws.on("error", (error) => {
        this.failureCount++;
        console.warn(`[Bank ${this.bankId}] WebSocket Connection Issue: ${error.message}`);
      });

      this.ws.on("close", () => {
        this.ws = null;
        if (!this.isClosed) {
          console.log(`[Bank ${this.bankId}] WebSocket Closed. Reconnecting in ${this.reconnectDelay / 1000} seconds...`);
          this.scheduleReconnect();
        }
      });
    } catch (e: any) {
      this.failureCount++;
      console.warn(`[Bank ${this.bankId}] WebSocket Connection Exception:`, e.message || e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isClosed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  public close() {
    this.isClosed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
  }

  private accountNameFromEvent(eventData: any): string | null {
    return (
      eventData?.corpAccount?.name ||
      eventData?.newAccount?.name ||
      eventData?.previousAccount?.name ||
      eventData?.account?.name ||
      eventData?.accountName ||
      null
    );
  }

  private async processEvent(payload: CityCorpEvent) {
    const eventName = payload.name || "Unknown";
    const eventData = payload.event || {};

    if (eventName === "CorpDisbandEvent") {
      console.error(`[Bank ${this.bankId}] RESERVE/CORP ALERT: CorpDisbandEvent`);
      botManager.sendNotification(this.bankId, "🚨 **CityCorp**: The bank corporation was disbanded in-game. Freeze operations and check ownership.");
      return;
    }

    if (eventName === "CorpTransferOwnershipEvent") {
      const newOwner = eventData?.newOwner?.name || eventData?.newOwner?.uuid || "unknown";
      botManager.sendNotification(this.bankId, `⚠️ **CityCorp ownership transferred** to ${newOwner}. API key holder may have changed.`);
      return;
    }

    const isAccountEvent = eventName.includes("CorpAccount");
    const isTreasuryEvent = eventName === "CorpDepositEvent" || eventName === "CorpWithdrawEvent";
    if (!isAccountEvent && !isTreasuryEvent) return;

    const accountName = this.accountNameFromEvent(eventData);
    const liveCents =
      extractLiveBalanceCents(eventData.newAccount) ??
      extractLiveBalanceCents({ balance: eventData.newBalance }) ??
      extractLiveBalanceCents(eventData.corpAccount);

    const bank = await db.select().from(banks).where(eq(banks.id, this.bankId)).get();
    if (!bank) return;
    const client = clientForBank(bank);

    if (accountName) {
      const local = await db.select().from(bankAccounts).where(
        and(eq(bankAccounts.bankId, this.bankId), eq(bankAccounts.accountName, accountName))
      ).get();

      const previousLocal = local?.balance ?? null;
      const newCents = await refreshAccountCache({
        bankId: this.bankId,
        accountName,
        accountId: local?.id,
        liveBalanceCents: liveCents,
        client,
      });

      if (newCents == null) return;

      const settings = await db.select().from(bankSettings).where(eq(bankSettings.bankId, this.bankId)).get();
      const settleName = settlementAccountName(settings);
      if (accountName.toLowerCase() === settleName.toLowerCase()) {
        await db.update(clearinghouseBalances)
          .set({ settlementCashCents: newCents })
          .where(eq(clearinghouseBalances.bankId, this.bankId))
          .catch(async () => {
            const row = await db.select().from(clearinghouseBalances).where(eq(clearinghouseBalances.bankId, this.bankId)).get();
            if (!row) {
              await db.insert(clearinghouseBalances).values({ bankId: this.bankId, balance: 0, settlementCashCents: newCents });
            }
          });

        if (previousLocal != null && newCents < previousLocal - 100) {
          const drop = previousLocal - newCents;
          botManager.sendNotification(
            this.bankId,
            `🚨 **RESERVE_BREACH**: SETTLEMENT dropped $${(drop / 100).toFixed(2)} without a matching Slate debit (now $${(newCents / 100).toFixed(2)}). Outbound Onyx should be reviewed.`
          );
        }
        const warn = settings?.settlementWarnCents || 0;
        if (warn > 0 && newCents < warn) {
          botManager.sendNotification(
            this.bankId,
            `⚠️ **Settlement low**: $${(newCents / 100).toFixed(2)} is under the warning threshold of $${(warn / 100).toFixed(2)}. Time to settle / self-fund.`
          );
        }
      }

      console.log(`[Bank ${this.bankId}] LIVE ${eventName}: ${accountName} cache set to $${(newCents / 100).toFixed(2)}`);
    }
  }
}

const activeSockets = new Map<string, CityCorpWebSocket>();

export async function initCityCorpEventSubscribers() {
  const allBanks = await db.select().from(banks);
  for (const bank of allBanks) {
    if (bank.corpId && bank.corpApiUuid && bank.corpApiKey) {
      if (!activeSockets.has(bank.id)) {
        const ws = new CityCorpWebSocket(bank.id, bank.corpApiUuid, bank.corpApiKey);
        ws.connect();
        activeSockets.set(bank.id, ws);
      }
    }
  }
}

export function addCityCorpEventSubscriber(bankId: string, apiUuid: string, apiKey: string) {
  const existing = activeSockets.get(bankId);
  if (existing) {
    existing.close();
    activeSockets.delete(bankId);
  }
  const ws = new CityCorpWebSocket(bankId, apiUuid, apiKey);
  ws.connect();
  activeSockets.set(bankId, ws);
}
