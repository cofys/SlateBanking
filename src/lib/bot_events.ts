import WebSocket from "ws";
import { db } from "../db/index";
import { banks, bankAccounts, transactions } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

interface CityCorpEvent {
  name: string;
  event: {
    corpAccount?: { name: string };
    amount?: number;
  };
}

export class CityCorpWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private headers: any;
  private bankId: string;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor(bankId: string, apiUuid: string, apiKey: string) {
    this.bankId = bankId;
    this.url = "wss://api.cityrp.org/citycorp";
    const authString = `${apiUuid}:${apiKey}`;
    const authEncoded = Buffer.from(authString).toString("base64");
    this.headers = {
      Authorization: `Basic ${authEncoded}`,
    };
  }

  public connect() {
    if (this.isClosed) return;
    console.log(`[Bank ${this.bankId}] Connecting to CityCorp Event Stream...`);
    
    try {
      this.ws = new WebSocket(this.url, { headers: this.headers });

      this.ws.on("open", () => {
        console.log(`[Bank ${this.bankId}] WebSocket Connected! Listening for real-time transactions...`);
      });

      this.ws.on("message", async (data) => {
        try {
          const payload = JSON.parse(data.toString()) as CityCorpEvent;
          await this.processEvent(payload);
        } catch (e) {
          // JSON parse err
        }
      });

      this.ws.on("error", (error) => {
        console.error(`[Bank ${this.bankId}] WebSocket Error:`, error.message);
      });

      this.ws.on("close", () => {
        console.log(`[Bank ${this.bankId}] WebSocket Closed. Reconnecting in 5 seconds...`);
        this.ws = null;
        this.scheduleReconnect();
      });
    } catch (e) {
      console.error(`[Bank ${this.bankId}] WebSocket Connection Failed:`, e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isClosed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  public close() {
    this.isClosed = true;
    if (this.ws) this.ws.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }

  private async processEvent(payload: CityCorpEvent) {
    const eventName = payload.name || "Unknown";
    const eventData = payload.event || {};

    if (eventName.includes("CorpAccount")) {
      const accountName = eventData.corpAccount?.name;
      const amount = Number(eventData.amount || 0);

      if (!accountName || amount === 0) return;

      let transType: "deposit" | "withdraw" | null = null;
      let finalAmountCents = Math.abs(Math.round(amount * 100));
      
      if (eventName.includes("Deposit")) {
        transType = "deposit";
      } else if (eventName.includes("Withdraw")) {
        transType = "withdraw";
      } else {
        return;
      }

      try {
        console.log(`[Bank ${this.bankId}] LIVE ${transType.toUpperCase()}: $${(finalAmountCents/100).toFixed(2)} for ${accountName}`);

        // Find the account
        const accounts = await db.select().from(bankAccounts).where(
          and(
            eq(bankAccounts.bankId, this.bankId),
            eq(bankAccounts.accountName, accountName)
          )
        );

        if (accounts.length === 0) return;
        const account = accounts[0];

        // Ensure we don't duplicate transactions coming from our own API calls.
        // Easiest is to just log it as an external event if needed, but since we rely on caching balance,
        // wait, if we apply it to balance here AND in bot_logic, we double count!
        // To fix this safely: The original Discord Bot fetched balances from the API. We shouldn't store balance locally,
        // OR we ONLY update balance via these webhooks!
        // For MVP, since we do `bot_logic.ts` tx.update, let's just log it in `transactions` with "external" type.
        
        await db.transaction(async (tx) => {
          // If it's deposit, increase balance. If withdraw, decrease balance.
          const balanceChange = transType === "deposit" ? finalAmountCents : -finalAmountCents;
          
          await tx.update(bankAccounts)
            .set({ balance: account.balance + balanceChange })
            .where(eq(bankAccounts.id, account.id));

          await tx.insert(transactions).values({
            id: uuidv4(),
            bankId: this.bankId,
            fromAccountId: transType === "withdraw" ? account.id : null,
            toAccountId: transType === "deposit" ? account.id : null,
            amount: finalAmountCents,
            type: 'external',
            description: `Live ${transType} event`,
            timestamp: new Date()
          });
        });
      } catch (e) {
        console.error(`[Bank ${this.bankId}] Failed to save live transaction:`, e);
      }
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

// Ensure when a new bank is added, it gets a socket.
export function addCityCorpEventSubscriber(bankId: string, apiUuid: string, apiKey: string) {
  if (activeSockets.has(bankId)) return;
  const ws = new CityCorpWebSocket(bankId, apiUuid, apiKey);
  ws.connect();
  activeSockets.set(bankId, ws);
}
