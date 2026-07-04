import { db } from "../db/index";
import { cityCorpLogs } from "../db/schema";
import { v4 as uuidv4 } from "uuid";

export class CityCorpClient {
  private baseUrl = "https://api.cityrp.org";
  private corpId: number;
  private apiUuid: string;
  private apiKey: string;
  private bankId: string | null;
  private headers: HeadersInit;

  constructor(corpId: number, apiUuid: string, apiKey: string, bankId: string | null = null) {
    this.corpId = corpId;
    this.apiUuid = apiUuid;
    this.apiKey = apiKey;
    this.bankId = bankId;

    const authString = `${this.apiUuid}:${this.apiKey}`;
    const authEncoded = Buffer.from(authString).toString('base64');
    
    this.headers = {
      "Authorization": `Basic ${authEncoded}`,
      "User-Agent": "SlateBankBot/1.0",
      "Content-Type": "application/json"
    };
  }

  private async logApiResult(endpoint: string, payload: any, latencyMs: number, status: number, success: boolean, errorMessage?: string) {
    try {
      await db.insert(cityCorpLogs).values({
        id: uuidv4(),
        bankId: this.bankId,
        endpoint,
        latencyMs,
        status,
        success,
        errorMessage: errorMessage || null,
        payload: payload ? JSON.stringify(payload) : null,
        timestamp: new Date()
      });
    } catch (e) {
      console.error("Failed to log CityCorp API result:", e);
    }
  }

  private async request(method: string, endpoint: string, payload?: any) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    // Always include corp_id in query params
    url.searchParams.append("corp_id", this.corpId.toString());

    // The API expects all variables in the URL query string, even for POST/PATCH!
    if (payload) {
      for (const [key, val] of Object.entries(payload)) {
        url.searchParams.append(key, String(val));
      }
    }

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    console.log(`Sending API request to ${endpoint} with url:`, url.toString());

    const startTime = Date.now();
    try {
      const response = await fetch(url.toString(), options);
      const latencyMs = Date.now() - startTime;
      
      if (response.ok) {
        if (method === "GET") {
          const data = await response.json();
          await this.logApiResult(endpoint, payload, latencyMs, response.status, true);
          return data;
        }
        await this.logApiResult(endpoint, payload, latencyMs, response.status, true);
        return { success: true, message: "Success" };
      }

      let errorMessage = await response.text();
      try {
        const json = JSON.parse(errorMessage);
        if (json.error?.message) {
          errorMessage = json.error.message;
        }
      } catch (e) {}

      // Consider it a success if the user is already added to the account
      if (endpoint === "/corp/accounts/subusers" && method === "POST" && errorMessage.includes("already added to this account")) {
        await this.logApiResult(endpoint, payload, latencyMs, response.status, true);
        return { success: true, message: "Success" };
      }

      console.error(`CityCorp API ${method} Failed (${endpoint}): ${response.status} - ${errorMessage}`);
      await this.logApiResult(endpoint, payload, latencyMs, response.status, false, errorMessage);
      return { success: false, message: errorMessage };
    } catch (e: any) {
      console.error(`CityCorp Request Exception: ${e}`);
      const latencyMs = Date.now() - startTime;
      await this.logApiResult(endpoint, payload, latencyMs, 0, false, e.message);
      return { success: false, message: e.message };
    }
  }

  async getAccountDetails(accountName: string) {
    const url = new URL(`${this.baseUrl}/corp/accounts`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("account_name", accountName);
    
    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;
      
      if (res.ok) {
         const data = await res.json();
         await this.logApiResult("/corp/accounts", { account_name: accountName }, latencyMs, res.status, true);
         return data;
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/corp/accounts", { account_name: accountName }, latencyMs, res.status, false, errMsg);
      return null;
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/corp/accounts", { account_name: accountName }, latencyMs, 0, false, e.message);
      return null;
    }
  }

  async listAccounts(page: number = 1) {
    const url = new URL(`${this.baseUrl}/corp/accounts/list`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("page", page.toString());
    
    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;
      
      if (res.ok) {
         const data = await res.json();
         await this.logApiResult("/corp/accounts/list", { page }, latencyMs, res.status, true);
         return data;
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/corp/accounts/list", { page }, latencyMs, res.status, false, errMsg);
      return { accounts: [], currentPage: 1, totalPages: 1, totalAccounts: 0 };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/corp/accounts/list", { page }, latencyMs, 0, false, e.message);
      return { accounts: [], currentPage: 1, totalPages: 1, totalAccounts: 0 };
    }
  }

  async createAccount(accountName: string) {
    console.log("createAccount called with:", accountName);
    return await this.request("POST", "/corp/accounts", { account_name: accountName });
  }

  async withdraw(accountName: string, amount: number) {
    return await this.request("PATCH", "/corp/accounts/withdraw", {
      account_name: accountName,
      amount: Number(amount.toFixed(2))
    });
  }

  async deposit(accountName: string, amount: number) {
    return await this.request("PATCH", "/corp/accounts/deposit", {
      account_name: accountName,
      amount: Number(amount.toFixed(2))
    });
  }

  async addSubuser(accountName: string, subuserUuid: string) {
    return await this.request("POST", "/corp/accounts/subusers", {
      account_name: accountName,
      subuser_uuid: subuserUuid
    });
  }

  async payCorporation(amount: number) {
    return await this.request("PATCH", "/corp/pay", {
      amount: Number(amount.toFixed(2))
    });
  }
}
