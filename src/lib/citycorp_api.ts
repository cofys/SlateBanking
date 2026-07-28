import { db } from "../db/index";
import { cityCorpLogs } from "../db/schema";
import { v4 as uuidv4 } from "uuid";

export const CITYCORP_REQUIRED_SCOPES = "corp.player.info.get,corp.player.shop_notifications.write,corp.accounts.get,corp.account_transactions.get,corp.applicants.get,corp.positions.get,corp.shop_sales.get,corp.shareholders.get,corp.shops.get,corp.staff.get,corp.stocks.get,corp.tasks.get,corp.transactions.get,corp.types.get,corp.universal_prices.get,corp.info.get,corp.account_subuser.create,corp.position.create,corp.position_permission.create,corp.hire.create,corp.task.create,corp.universal_prices.create,corp.advert.create,corp.ad.create,corp.ad.write,corp.advert.write,corp.apply.create,corp.create,corp.dividend_type.write,corp.dividend_payment.write,corp.position_bonus.write,corp.position_commission.write,corp.position_permissions.write,corp.position_salary.write,corp.staff.demote,corp.staff.promote,corp.business_stocks.transfer,corp.individual_stocks.transfer,corp.task.assign,corp.task.unassign,corp.universal_buy_price.write,corp.universal_quantity.write,corp.universal_sell_price.write,corp.money.transfer,corp.description.write,corp.discord.write,corp.hq.write,corp.applicant.delete,corp.dividend.disable,corp.position_permission.delete,corp.position.delete,corp.staff.fire,corp.task.delete,corp.universal_prices.delete";

export function buildCityCorpAuthUrl(
  bank: { cityCorpAppId?: string | null; cityCorpAuthUrl?: string | null },
  redirectUri: string,
  state: string
): { url: string; appIdUsed: string; redirectUriUsed: string; toString: () => string } {
  const envAppId = process.env.CITYRP_APP_ID;
  let appId = bank.cityCorpAppId || envAppId || "9";
  let finalRedirectUri = redirectUri;
  const rawAuthUrl = bank.cityCorpAuthUrl?.trim();

  let finalUrl = "";

  if (!rawAuthUrl) {
    finalUrl = `https://dashboard.cityrp.org/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(finalRedirectUri)}&scopes=${encodeURIComponent(CITYCORP_REQUIRED_SCOPES)}&state=${state}`;
  } else {
    try {
      const urlObj = new URL(rawAuthUrl);
      if (urlObj.searchParams.get("app_id")) {
        appId = urlObj.searchParams.get("app_id")!;
      } else {
        urlObj.searchParams.set("app_id", appId);
      }
      urlObj.searchParams.set("redirect_uri", finalRedirectUri);
      urlObj.searchParams.set("scopes", CITYCORP_REQUIRED_SCOPES);
      urlObj.searchParams.set("state", state);
      finalUrl = urlObj.toString();
    } catch (e) {
      finalUrl = `https://dashboard.cityrp.org/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(finalRedirectUri)}&scopes=${encodeURIComponent(CITYCORP_REQUIRED_SCOPES)}&state=${state}`;
    }
  }

  return {
    url: finalUrl,
    appIdUsed: appId,
    redirectUriUsed: finalRedirectUri,
    toString() {
      return this.url;
    }
  };
}

export class CityCorpClient {
  private baseUrl = "https://api.cityrp.org/citycorp";
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
      if (endpoint === "/accounts/subusers" && method === "POST" && errorMessage.includes("already added to this account")) {
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
    const url = new URL(`${this.baseUrl}/accounts`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("account_name", accountName);
    
    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;
      
      if (res.ok) {
         const data = await res.json();
         await this.logApiResult("/accounts", { account_name: accountName }, latencyMs, res.status, true);
         return data;
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/accounts", { account_name: accountName }, latencyMs, res.status, false, errMsg);
      return null;
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts", { account_name: accountName }, latencyMs, 0, false, e.message);
      return null;
    }
  }

  
  async getAccountTransactions(accountName: string, page: number = 1) {
    const url = new URL(`${this.baseUrl}/accounts/transactions`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("account_name", accountName);
    url.searchParams.append("page", page.toString());
    
    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;
      
      if (res.ok) {
         const data = await res.json();
         await this.logApiResult("/accounts/transactions", { account_name: accountName, page }, latencyMs, res.status, true);
         return data;
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/accounts/transactions", { account_name: accountName, page }, latencyMs, res.status, false, errMsg);
      return null;
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts/transactions", { account_name: accountName, page }, latencyMs, 0, false, e.message);
      return null;
    }
  }

  async listAccounts(page: number = 1) {
    const url = new URL(`${this.baseUrl}/accounts/list`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("page", page.toString());
    
    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;
      
      if (res.ok) {
         const data = await res.json();
         await this.logApiResult("/accounts/list", { page }, latencyMs, res.status, true);
         return data;
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/accounts/list", { page }, latencyMs, res.status, false, errMsg);
      return { accounts: [], currentPage: 1, totalPages: 1, totalAccounts: 0 };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts/list", { page }, latencyMs, 0, false, e.message);
      return { accounts: [], currentPage: 1, totalPages: 1, totalAccounts: 0 };
    }
  }

  async createAccount(accountName: string) {
    console.log("createAccount called with:", accountName);
    return await this.request("POST", "/accounts", { account_name: accountName });
  }

  async withdraw(accountName: string, amount: number) {
    return await this.request("PATCH", "/accounts/withdraw", {
      account_name: accountName,
      amount: Number(amount.toFixed(2))
    });
  }

  async deposit(accountName: string, amount: number) {
    return await this.request("PATCH", "/accounts/deposit", {
      account_name: accountName,
      amount: Number(amount.toFixed(2))
    });
  }

  async addSubuser(accountName: string, subuserUuid: string) {
    return await this.request("POST", "/accounts/subusers", {
      account_name: accountName,
      subuser_uuid: subuserUuid
    });
  }

  async payCorporation(amount: number) {
    return await this.request("PATCH", "/pay", {
      amount: Number(amount.toFixed(2))
    });
  }
}
