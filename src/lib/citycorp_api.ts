import { db } from "../db/index";
import { cityCorpLogs } from "../db/schema";
import { v4 as uuidv4 } from "uuid";

export const CITYCORP_DEFAULT_SCOPES = "corp.player.info.get,corp.account_money.transfer,corp.account.deposit,corp.account.withdraw";

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

  if (rawAuthUrl) {
    try {
      const urlObj = new URL(rawAuthUrl);
      
      // Extract or preserve app_id from custom URL
      if (urlObj.searchParams.has("app_id")) {
        appId = urlObj.searchParams.get("app_id")!;
      } else if (appId) {
        urlObj.searchParams.set("app_id", appId);
      }
      
      // Extract or preserve redirect_uri from custom URL
      if (urlObj.searchParams.has("redirect_uri")) {
        finalRedirectUri = urlObj.searchParams.get("redirect_uri")!;
      } else if (finalRedirectUri) {
        urlObj.searchParams.set("redirect_uri", finalRedirectUri);
      }

      // Preserve existing scopes from rawAuthUrl! If absent, use default scopes
      if (!urlObj.searchParams.has("scopes")) {
        urlObj.searchParams.set("scopes", CITYCORP_DEFAULT_SCOPES);
      }
      if (state) {
        urlObj.searchParams.set("state", state);
      }
      finalUrl = urlObj.toString();
    } catch (e) {
      finalUrl = rawAuthUrl;
    }
  } else {
    finalUrl = `https://dashboard.cityrp.org/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(finalRedirectUri)}&scopes=${encodeURIComponent(CITYCORP_DEFAULT_SCOPES)}&state=${state}`;
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
  private baseUrl = "https://api.cityrp.org/citycorp/corp";
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

  async fetchAllAccounts(maxPages: number = 25) {
    let allAccounts: any[] = [];
    let page = 1;
    let apiStatus = 200;
    let apiError: string | null = null;
    let success = false;

    while (page <= maxPages) {
      const res: any = await this.listAccounts(page);
      if (res.error) {
        apiStatus = res.status || 500;
        apiError = res.error;
        break;
      }
      success = true;
      let list: any[] = Array.isArray(res.accounts) ? res.accounts : [];

      allAccounts.push(...list);
      const totalPages = res.totalPages || 1;
      if (page >= totalPages || list.length === 0) {
        break;
      }
      page++;
    }

    return {
      success,
      status: apiStatus,
      error: apiError,
      accounts: allAccounts
    };
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
         const rawBalance = data.balance ?? data.account?.balance ?? data.data?.balance ?? 0;
         return {
           success: true,
           status: res.status,
           balance: rawBalance,
           account: data.account || data,
           ...data
         };
      }
      
      let errMsg = await res.text();
      let parsedErr = errMsg;
      try {
        const json = JSON.parse(errMsg);
        if (json.error?.message) parsedErr = json.error.message;
        else if (json.message) parsedErr = json.message;
      } catch (e) {}

      await this.logApiResult("/accounts", { account_name: accountName }, latencyMs, res.status, false, parsedErr);
      
      // Fallback: check fetchAllAccounts() via /accounts/list
      const allRes = await this.fetchAllAccounts();
      if (allRes.success && Array.isArray(allRes.accounts)) {
        const target = accountName.toLowerCase().trim();
        const found = allRes.accounts.find((a: any) => (a.name || a.account_name || "").toLowerCase().trim() === target);
        if (found) {
          return {
            success: true,
            status: 200,
            balance: found.balance ?? 0,
            account: found
          };
        }
      }

      const isNotFound = res.status === 404 || parsedErr.toLowerCase().includes("not found") || parsedErr.toLowerCase().includes("does not exist");
      return {
        success: false,
        status: res.status,
        notFound: isNotFound,
        error: parsedErr || "Account request failed"
      };
    } catch (e: any) {
      try {
        const allRes = await this.fetchAllAccounts();
        if (allRes.success && Array.isArray(allRes.accounts)) {
          const target = accountName.toLowerCase().trim();
          const found = allRes.accounts.find((a: any) => (a.name || a.account_name || "").toLowerCase().trim() === target);
          if (found) {
            return {
              success: true,
              status: 200,
              balance: found.balance ?? 0,
              account: found
            };
          }
        }
      } catch (inner) {}

      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts", { account_name: accountName }, latencyMs, 0, false, e.message);
      return {
        success: false,
        status: 0,
        notFound: false,
        error: e.message || "Network exception"
      };
    }
  }

  
  async getAccountTransactions(accountName: string, page: number = 1) {
    const url = new URL(`${this.baseUrl}/accounts/transactions/list`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("account_name", accountName);
    url.searchParams.append("page", page.toString());
    
    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;
      
      if (res.ok) {
         const data = await res.json();
         await this.logApiResult("/accounts/transactions/list", { account_name: accountName, page }, latencyMs, res.status, true);
         return data;
      }

      // Fallback: Try single/legacy endpoint if list returns error
      const legacyUrl = new URL(`${this.baseUrl}/accounts/transactions`);
      legacyUrl.searchParams.append("corp_id", this.corpId.toString());
      legacyUrl.searchParams.append("account_name", accountName);
      legacyUrl.searchParams.append("page", page.toString());

      const legacyRes = await fetch(legacyUrl.toString(), { headers: this.headers });
      if (legacyRes.ok) {
        const legacyData = await legacyRes.json();
        await this.logApiResult("/accounts/transactions", { account_name: accountName, page }, latencyMs, legacyRes.status, true);
        return legacyData;
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/accounts/transactions/list", { account_name: accountName, page }, latencyMs, res.status, false, errMsg);
      return null;
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts/transactions/list", { account_name: accountName, page }, latencyMs, 0, false, e.message);
      return null;
    }
  }

  async getTransactionById(accountName: string, transactionId: number) {
    const url = new URL(`${this.baseUrl}/accounts/transactions`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("account_name", accountName);
    url.searchParams.append("transaction_id", transactionId.toString());

    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json();
        await this.logApiResult("/accounts/transactions", { account_name: accountName, transaction_id: transactionId }, latencyMs, res.status, true);
        return { success: true, transaction: data };
      }

      let errMsg = await res.text();
      await this.logApiResult("/accounts/transactions", { account_name: accountName, transaction_id: transactionId }, latencyMs, res.status, false, errMsg);
      return { success: false, error: errMsg };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts/transactions", { account_name: accountName, transaction_id: transactionId }, latencyMs, 0, false, e.message);
      return { success: false, error: e.message };
    }
  }

  async getAllAccountTransactions(accountName: string, maxPages: number = 25) {
    let allTxs: any[] = [];
    let page = 1;
    while (page <= maxPages) {
      const res = await this.getAccountTransactions(accountName, page);
      if (!res || !res.transactions || !Array.isArray(res.transactions) || res.transactions.length === 0) {
        break;
      }
      allTxs.push(...res.transactions);
      if (res.totalPages && page >= res.totalPages) {
        break;
      }
      page++;
    }
    return allTxs;
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

         let accountsArr: any[] = [];
         if (Array.isArray(data.accounts)) accountsArr = data.accounts;
         else if (Array.isArray(data.data)) accountsArr = data.data;
         else if (Array.isArray(data.results)) accountsArr = data.results;
         else if (Array.isArray(data.result)) accountsArr = data.result;
         else if (Array.isArray(data)) accountsArr = data;
         else if (data.data && Array.isArray(data.data.accounts)) accountsArr = data.data.accounts;

         const currentPage = data.currentPage || data.current_page || data.page || page;
         const totalPages = data.totalPages || data.total_pages || (data.data && data.data.totalPages) || 1;
         const totalAccounts = data.totalAccounts || data.total_accounts || accountsArr.length;

         return {
           accounts: accountsArr,
           currentPage,
           totalPages,
           totalAccounts,
           raw: data
         };
      }
      
      let errMsg = await res.text();
      await this.logApiResult("/accounts/list", { page }, latencyMs, res.status, false, errMsg);
      return { accounts: [], currentPage: 1, totalPages: 1, totalAccounts: 0, error: errMsg };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts/list", { page }, latencyMs, 0, false, e.message);
      return { accounts: [], currentPage: 1, totalPages: 1, totalAccounts: 0, error: e.message };
    }
  }

  async createAccount(accountName: string) {
    console.log("createAccount called with:", accountName);
    return await this.request("POST", "/accounts", { account_name: accountName });
  }

  async deleteAccount(accountName: string) {
    return await this.request("DELETE", "/accounts", { account_name: accountName });
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

  async transferToAccount(accountName: string, amount: number, receiverCorpId: number, receiverAccountName: string) {
    return await this.request("PATCH", "/accounts/transfer/account", {
      account_name: accountName,
      amount: Number(amount.toFixed(2)),
      receiver_corp_id: receiverCorpId,
      receiver_account_name: receiverAccountName
    });
  }

  async transferToCorp(accountName: string, amount: number, receiverCorpId: number) {
    return await this.request("PATCH", "/accounts/transfer/corp", {
      account_name: accountName,
      amount: Number(amount.toFixed(2)),
      receiver_corp_id: receiverCorpId
    });
  }

  async setAccountFee(accountName: string, feeType: "WITHDRAW" | "DEPOSIT", fee: number) {
    return await this.request("PATCH", "/accounts/fees", {
      account_name: accountName,
      fee_type: feeType,
      fee: Number(fee)
    });
  }

  async addSubuser(accountName: string, subuserUuid: string) {
    return await this.request("POST", "/accounts/subusers", {
      account_name: accountName,
      subuser_uuid: subuserUuid
    });
  }

  async listSubusers(accountName: string, page: number = 1, includeCorpOwner: boolean = false) {
    const url = new URL(`${this.baseUrl}/accounts/subusers/list`);
    url.searchParams.append("corp_id", this.corpId.toString());
    url.searchParams.append("account_name", accountName);
    url.searchParams.append("page", page.toString());
    if (includeCorpOwner) {
      url.searchParams.append("include_corp_owner", "true");
    }

    const startTime = Date.now();
    try {
      const res = await fetch(url.toString(), { headers: this.headers });
      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        const data = await res.json();
        await this.logApiResult("/accounts/subusers/list", { account_name: accountName, page }, latencyMs, res.status, true);
        return {
          success: true,
          subusers: data.subusers || [],
          currentPage: data.currentPage || page,
          totalPages: data.totalPages || 1,
          totalSubusers: data.totalSubusers || (data.subusers ? data.subusers.length : 0)
        };
      }

      let errMsg = await res.text();
      await this.logApiResult("/accounts/subusers/list", { account_name: accountName, page }, latencyMs, res.status, false, errMsg);
      return { success: false, subusers: [], error: errMsg };
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      await this.logApiResult("/accounts/subusers/list", { account_name: accountName, page }, latencyMs, 0, false, e.message);
      return { success: false, subusers: [], error: e.message };
    }
  }

  async payCorporation(amount: number) {
    return await this.request("PATCH", "/pay", {
      amount: Number(amount.toFixed(2))
    });
  }
}
