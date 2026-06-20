# Slate - Public Developer API & Wiki

Welcome to the **Slate REST API** documentation. 
This wiki is designed for **Players, Server Owners, and Developers** looking to integrate Slate's banking infrastructure and the Onyx Network payment processor into their own Discord bots, Minecraft plugins, or standalone web applications.

## General Information
- **Base URL:** `https://api.slate.saas/api/`
- **Rate Limits:** 1000 requests per 15 minutes per IP address.
- **Content Type:** All requests must send and accept `application/json`.

---

## 1. Authentication
There are two distinct types of authentication depending on the scope of your integration:

### Onyx Merchant API Key
*Use Case: You are a merchant wanting to process global payments across any bank on the network.*
- Passed via Header: `x-api-key: onyx_live_XXXXX`
- Obtain this key from the Global Administrators.

### Bank Developer Secret Key
*Use Case: You run a specific bank and want to query your own internal accounts or execute specific actions on behalf of your bank.*
- Passed via Header: `Authorization: Bearer sk_live_XXXXX`
- Obtain this key from your `<Bank Admin Dashboard> -> Developer`.

---

## 2. Onyx Network (Global Payments)

### Charge a User (Onyx Checkout)
Deducts funds from a user's account in *any* bank on the network and credits your merchant destination account.

**Endpoint:** `POST /onyx/checkout`  
**Auth:** `x-api-key`

**Payload:**
```json
{
  "userDiscordId": "183928198302",
  "amountCents": 500,
  "description": "Premium VIP Rank Purchase",
  "sourceAccountId": "optional-uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "tx_xxxxxx",
  "status": "APPROVED",
  "clearinghouse": false
}
```

---

## 3. Bank Endpoints (Internal Tooling)

*All endpoints in this section require the `Authorization: Bearer sk_live_...` header.*

### List Accounts
Retrieve all bank accounts associated with your specific bank.

**Endpoint:** `GET /v1/accounts`

### Open New Account
Programmatically open a new account for a Discord user within your bank.

**Endpoint:** `POST /v1/accounts`

**Payload:**
```json
{
  "discordId": "183928198302",
  "initialDeposit": 100000,
  "type": "checking",
  "accountName": "Business Holdings"
}
```

### Internal Transfer
Move funds securely between any two accounts within your bank. Bypasses standard overdraft limits if executed via API, allowing custom loan tools.

**Endpoint:** `POST /v1/transfers`

**Payload:**
```json
{
  "fromAccountId": "uuid-1234",
  "toAccountId": "uuid-5678",
  "amount": "250.00",
  "description": "Invoice Payout API"
}
```

### Issuing Cards
Programmatically list or issue generic credit/debit cards attached to your user's accounts.

- **List All:** `GET /v1/cards`
- **Issue Card:** `POST /v1/cards`
  - Body: `{"accountId": "...", "type": "debit"}`

---

## Supported Libraries
While we do not have an official SDK yet, any HTTP networking library will function:
- **Node.js:** `axios`, `fetch`
- **Java/Minecraft:** `java.net.http.HttpClient`, `OkHttp`
- **Python:** `requests`

For support, please open a ticket with the Slate Administration team on Discord.
