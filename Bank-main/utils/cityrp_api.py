import requests
import datetime
import yaml
import logging
import time
import base64
from typing import Dict, Union, List, Optional
import asyncio
import json

# Configure logging for the API utility
logger = logging.getLogger('cityrp_api')

class CityRPAPI:
    def __init__(self, cfg):
        # Extract config values
        self.base_url = cfg["api"].get("base_url", "https://api.cityrp.org/citycorp").replace("cityrp.net", "cityrp.org")
        self.api_key = cfg["api"].get("api_key", "").strip()
        self.cityrp_uuid = cfg["api"].get("cityrp_uuid", "")
        self.bank_name = cfg["bank"].get("name", "JPM")
        
        # Capture Numeric Corp ID
        self.corp_id = int(cfg["bank"].get("corp_id", 0)) 
        self.corp_name = cfg["bank"].get("corp_name") 

        # Prepare authentication headers
        auth_string = f"{self.cityrp_uuid}:{self.api_key}"
        auth_encoded = base64.b64encode(auth_string.encode()).decode()
        self.headers = {
            "Authorization": f"Basic {auth_encoded}",
            "User-Agent": f"{self.bank_name}Bot/2.2",
            "Content-Type": "application/json"
        }

    # --- Universal Request Helper (Supports POST, PATCH, DELETE) ---
    async def _request(self, method: str, endpoint: str, payload: dict = None) -> Dict:
        url = f"{self.base_url}{endpoint}"
        
        # For write methods, we put corp_id in body AND params to be safe
        params = {"corp_id": self.corp_id}
        if payload:
            payload["corp_id"] = self.corp_id
            # Copy payload to params if the API relies on query strings (like we saw with POST)
            params.update(payload)
        
        try:
            loop = asyncio.get_event_loop()
            
            if method == "DELETE":
                resp = await loop.run_in_executor(None, lambda: requests.delete(url, params=params, headers=self.headers, timeout=15))
            else:
                resp = await loop.run_in_executor(None, lambda: requests.request(method, url, json=payload, params=params, headers=self.headers, timeout=10))
            
            if resp.status_code == 200:
                return {"success": True, "message": "Success"}
            
            # Parse Error
            try:
                err = resp.json().get("error", {}).get("message", resp.text)
            except:
                err = resp.text
            
            logger.error(f"API {method} Failed ({endpoint}): {resp.status_code} - {err}")
            return {"success": False, "message": err}
        except Exception as e:
            logger.error(f"Request Exception: {e}")
            return {"success": False, "message": str(e)}

    # --- Mojang API for UUID Lookup ---
    def _format_uuid(self, uuid_str: str) -> str:
        """Formats a raw UUID string with dashes."""
        return f"{uuid_str[:8]}-{uuid_str[8:12]}-{uuid_str[12:16]}-{uuid_str[16:20]}-{uuid_str[20:]}"

    async def get_minecraft_uuid(self, username: str) -> Optional[str]:
        logger.info(f"Looking up Minecraft UUID for username: {username}")
        mojang_url = f"https://api.mojang.com/users/profiles/minecraft/{username}"
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(mojang_url, timeout=10))
            if resp.status_code == 200:
                raw_uuid = resp.json().get("id")
                return self._format_uuid(raw_uuid)
            return None
        except Exception as e:
            logger.error(f"Mojang API error: {e}")
            return None

    # --- Account & Corp Info ---

    async def get_account_details(self, account_name: str) -> Optional[dict]:
        """Asynchronously fetches account details from the CityCorp API."""
        endpoint = f"{self.base_url}/corp/accounts"
        params = {"corp_id": self.corp_id, "account_name": account_name.lower()}
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(endpoint, params=params, headers=self.headers, timeout=10))
            if resp.status_code == 200:
                return resp.json()
            if resp.status_code != 404:
                logger.warning(f"Get Account API Error: {resp.status_code} - {resp.text}")
            return None
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed for {account_name}: {e}", exc_info=True)
            return None

    async def get_corp_details(self) -> Optional[dict]:
        """Asynchronously fetches the main corporation's details."""
        endpoint = f"{self.base_url}/corp"
        params = {"corp_id": self.corp_id}
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(endpoint, params=params, headers=self.headers, timeout=10))
            return resp.json() if resp.status_code == 200 else None
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed for corp details: {e}", exc_info=True)
            return None

    async def get_all_corp_accounts(self) -> List[dict]:
        """Asynchronously fetches ALL accounts for the corporation, handling pagination."""
        all_accounts = []
        page = 1
        endpoint = f"{self.base_url}/corp/accounts/list"
        
        while True:
            params = {"corp_id": self.corp_id, "page": page}
            try:
                loop = asyncio.get_event_loop()
                resp = await loop.run_in_executor(None, lambda: requests.get(endpoint, params=params, headers=self.headers, timeout=15))
                if resp.status_code != 200: break
                accounts = resp.json().get("accounts", [])
                if not accounts: break
                all_accounts.extend(accounts)
                if len(accounts) < 10: break
                page += 1
            except Exception:
                break
        return all_accounts

    async def get_corp_transactions(self, page=1) -> Optional[Dict]:
        """Fetches the transaction history for the main bank corporation."""
        # Endpoint: GET corp/transactions/list?corp_id=CORP_ID&page=1
        if not self.corp_id:
            return None
            
        endpoint = f"{self.base_url}/corp/transactions/list"
        params = {"corp_id": self.corp_id, "page": page}
        
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(endpoint, params=params, headers=self.headers, timeout=10))
            if resp.status_code == 200:
                return resp.json()
            return None
        except Exception as e:
            logger.error(f"Error fetching corp transactions: {e}")
            return None

    async def get_transactions(self, account_name: str, page: int = 1) -> Optional[Dict[str, Union[list, int]]]:
        """Asynchronously fetches a single page of transactions."""
        endpoint = f"{self.base_url}/corp/accounts/transactions/list"
        params = {"corp_id": self.corp_id, "account_name": account_name.lower(), "page": page}
        
        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(None, lambda: requests.get(endpoint, params=params, headers=self.headers, timeout=10))
            
            if resp.status_code == 200:
                data = resp.json()
                target_acc = account_name.lower().strip()
                
                for tx in data.get("transactions", []):
                    to_acc = tx.get("to_account", "").lower().strip()
                    from_acc = tx.get("from_account", "").lower().strip()
                    
                    # FIX: Swapped priority. Check Sender (Debit) first to match in-game UI.
                    if from_acc == target_acc:
                        tx['type'] = 'debit'
                    elif to_acc == target_acc:
                        tx['type'] = 'credit'
                    else:
                        # Fallback
                        if tx.get('deposit') is True:
                            tx['type'] = 'credit'
                        else:
                            tx['type'] = 'debit'
                            
                return data
            return None
        except Exception as e:
            logger.error(f"Exception fetching transactions: {e}")
            return None

    # --- Transactions & Transfers ---

    async def withdraw(self, account_name: str, amount: float) -> Dict[str, Union[bool, str]]:
        """Asynchronously withdraws a specified amount from a user account."""
        logger.info(f"Withdrawing ${amount:.2f} from {account_name}")
        return await self._request("PATCH", "/corp/accounts/withdraw", {
            "account_name": account_name.lower(),
            "amount": round(float(amount), 2)  # FIXED: Send exact float, rounded to 2 decimals
        })

    async def deposit(self, account_name: str, amount: float) -> Dict[str, Union[bool, str]]:
        """Asynchronously deposits a specified amount into a user account."""
        logger.info(f"Depositing ${amount:.2f} to {account_name}")
        return await self._request("PATCH", "/corp/accounts/deposit", {
            "account_name": account_name.lower(),
            "amount": round(float(amount), 2)  # FIXED: Send exact float, rounded to 2 decimals
        })

    async def pay_corporation(self, amount: float) -> Dict[str, Union[bool, str]]:
        """Pays the corporation from the bot owner's personal balance."""
        logger.info(f"Paying corporation {self.corp_name} ${amount:.2f} from owner's balance.")
        return await self._request("PATCH", "/corp/pay", {
            "amount": round(float(amount), 2) # FIXED
        })

    async def force_withdraw(self, account_name: str, amount: float) -> Dict[str, Union[bool, str]]:
        """Admin action: Withdraws from a user account and pays the corporation from the owner's balance."""
        logger.info(f"Force withdrawing ${amount:.2f} from {account_name} to pay corporation {self.corp_name}")
        
        withdraw_result = await self.withdraw(account_name, amount)
        if not withdraw_result["success"]:
            return {"success": False, "message": f"Withdrawal failed: {withdraw_result['message']}"}
        
        payment_result = await self.pay_corporation(amount)
        if not payment_result["success"]:
            msg = f"CRITICAL: Withdrawal succeeded, but corp payment failed. Attempting refund."
            logger.critical(msg)
            
            refund_result = await self.deposit(account_name, amount)
            if not refund_result["success"]:
                logger.critical(f"REFUND FAILED for {account_name}. Money is in owner's balance.")
                return {"success": False, "message": "Corp payment failed. Refund FAILED. Contact Admin."}
            
            return {"success": False, "message": "Corp payment failed. Refunded user."}
            
        return {"success": True, "message": f"Successfully force-withdrew ${amount:,.2f} from `{account_name}`."}

    async def transfer_money(self, sender_account: str, recipient_account: str, amount: float) -> Dict[str, Union[bool, str]]:
        """Performs a fund transfer using the supported two-step withdraw/deposit process."""
        logger.info(f"Transfer ${amount} {sender_account} -> {recipient_account}")
        
        # 1. Withdraw
        withdraw_result = await self.withdraw(sender_account, amount)
        if not withdraw_result["success"]:
            return withdraw_result

        # 2. Deposit
        deposit_result = await self.deposit(recipient_account, amount)
        if not deposit_result["success"]:
            logger.warning(f"Transfer deposit failed. Refunding {sender_account}.")
            refund_result = await self.deposit(sender_account, amount)
            if not refund_result["success"]:
                logger.critical("CRITICAL: Refund failed during transfer.")
                return {"success": False, "message": "Transfer failed. Refund FAILED. Contact Admin."}
            return {"success": False, "message": "Transfer failed. Refunded sender."}

        return {"success": True, "message": "Transfer successful"}

    # --- Account Management ---

    async def has_valid_deposit(self, account_name: str, min_amount: float) -> bool:
        details = await self.get_account_details(account_name)
        if details:
            return float(details.get("balance", 0)) >= min_amount
        return False

    async def delete_account(self, account_name: str) -> Dict[str, Union[bool, str]]:
        logger.warning(f"Deleting account: {account_name}")
        return await self._request("DELETE", "/corp/accounts", {
            "account_name": account_name.lower()
        })

    async def add_subuser(self, account_name: str, subuser_uuid: str) -> Dict[str, Union[bool, str]]:
        logger.info(f"Adding subuser {subuser_uuid} to {account_name}")
        return await self._request("POST", "/corp/accounts/subusers", {
            "account_name": account_name.lower(),
            "subuser_uuid": subuser_uuid
        })

    async def create_account(self, account_name: str) -> bool:
        logger.info(f"Creating account: {account_name}")
        res = await self._request("POST", "/corp/accounts", {
            "account_name": account_name
        })
        return res['success']

    async def set_account_fee(self, account_name: str, fee_type: str, fee_percentage: float) -> bool:
        """Sets the deposit or withdrawal fee."""
        logger.info(f"Setting {fee_type} fee for {account_name} to {fee_percentage}%.")
        res = await self._request("PATCH", "/corp/accounts/fees", {
            "account_name": account_name.lower(),
            "fee_type": fee_type.upper(),
            "fee": fee_percentage
        })
        return res['success']