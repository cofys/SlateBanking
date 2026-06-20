import discord
from discord.ext import commands
from fastapi import FastAPI, HTTPException, Header, Depends
from pydantic import BaseModel
import uvicorn
import threading
import logging
import yaml
import asyncio
from typing import Optional

logger = logging.getLogger('vh_node')

# --- Data Models ---
class NodeTransaction(BaseModel):
    user_discord_id: str
    amount: float
    pin: str
    merchant_name: str
    target_account: str         # The merchant's actual bank account name
    invoice_id: str             # UNIQUE KEY for Idempotency
    fee_amount: float = 0.0     # The cut Onyx takes

class NodeAPI(commands.Cog):
    def __init__(self, bot, cfg):
        self.bot = bot
        self.cfg = cfg
        self.node_secret = cfg.get("api", {}).get("node_secret", "secret")
        self.port = int(cfg.get("api", {}).get("port", 9000))
        # The account where fees are deposited. Create this account in-game!
        self.onyx_account_name = "onyx_settlement" 
        
        self.app = FastAPI(title="VH Bank Node")
        self.setup_routes()
        self.server_thread = None

    def setup_routes(self):
        def verify_hub(x_node_secret: str = Header(...)):
            if x_node_secret != self.node_secret:
                raise HTTPException(401, "Unauthorized Hub Access")

        # 1. GET ACCOUNTS
        @self.app.get("/node/accounts/{user_id}")
        async def get_accounts(user_id: str, auth = Depends(verify_hub)):
            bank_cog = self.bot.get_cog("BankCog")
            if not bank_cog: raise HTTPException(500, "Bank Node Offline")
            accounts = bank_cog.db.get_all_accounts_for_user(user_id)
            return {
                "bank_name": self.cfg["bank"]["name"], 
                "accounts": [{"id": a.account_name, "name": a.account_name, "balance": 0, "type": a.account_type} for a in accounts]
            }

        # 2. PROCESS PAYMENT (One Withdraw, Split Deposit)
        @self.app.post("/node/process")
        async def process_tx(tx: NodeTransaction, auth = Depends(verify_hub)):
            bank_cog = self.bot.get_cog("BankCog")
            if not bank_cog: return {"success": False, "message": "Bank Node Offline"}
            
            # --- A. IDEMPOTENCY CHECK ---
            session = bank_cog.db.get_session()
            existing = session.query(bank_cog.db.Transaction).filter_by(remote_id=tx.invoice_id).first()
            session.close()
            
            if existing:
                return {"success": True, "message": "Transaction already processed", "tx_id": "cached"}

            # --- B. AUTHENTICATION & CHECK ---
            accounts = bank_cog.db.get_all_accounts_for_user(tx.user_discord_id)
            payer = next((a for a in accounts if a.account_type == 'personal'), None)
            
            if not payer: 
                return {"success": False, "message": "No Personal Account Found"}

            if not bank_cog.verify_pin(payer, tx.pin): 
                return {"success": False, "message": "Incorrect PIN"}
            
            # Check Balance locally first to save an API call
            # Note: This is an estimate. Real verification happens on withdraw.
            api_res = await bank_cog.api.get_account_details(payer.account_name)
            current_balance = float(api_res.get("balance", 0))
            if current_balance < tx.amount: 
                return {"success": False, "message": "Insufficient Funds"}

            # --- C. EXECUTE TRANSACTION ---
            # Step 1: Withdraw Full Amount from User
            withdraw_res = await bank_cog.api.withdraw(payer.account_name, tx.amount)
            if not withdraw_res['success']:
                return {"success": False, "message": f"Declined: {withdraw_res.get('message')}"}

            # Step 2: Deposit Net Amount to Merchant
            net_to_merchant = tx.amount - tx.fee_amount
            deposit_res = await bank_cog.api.deposit(tx.target_account, net_to_merchant)
            
            if not deposit_res['success']:
                # CRITICAL FAILURE: Money taken, but merchant rejected.
                # Action: Refund the user immediately.
                logger.critical(f"Deposit to {tx.target_account} failed. Refunding {payer.account_name}.")
                await bank_cog.api.deposit(payer.account_name, tx.amount)
                return {"success": False, "message": f"Merchant Account Error: {deposit_res.get('message')}"}

            # Step 3: Deposit Fee to Onyx (Fire and Forget)
            if tx.fee_amount > 0:
                fee_res = await bank_cog.api.deposit(self.onyx_account_name, tx.fee_amount)
                if not fee_res['success']:
                    # Non-Critical Failure: Onyx didn't get its fee, but the customer and merchant are happy.
                    # We just log this for admin review.
                    logger.error(f"⚠️ FAILED TO COLLECT FEE for Invoice {tx.invoice_id}. Amount: {tx.fee_amount}")

            # --- D. LOGGING ---
            # 1. Debit Log (User)
            bank_cog.db.save_transaction(payer.account_name, {
                'id': tx.invoice_id, 
                'amount': tx.amount, 
                'type': 'debit', 
                'other_account': tx.merchant_name, 
                'description': f"Purchase at {tx.merchant_name}"
            })
            
            # 2. Credit Log (Merchant)
            bank_cog.db.save_transaction(tx.target_account, {
                'amount': net_to_merchant,
                'type': 'credit',
                'other_account': payer.account_name,
                'description': "Onyx Sale"
            })
            
            # 3. Credit Log (Onyx) - Optional, but good for records
            if tx.fee_amount > 0:
                bank_cog.db.save_transaction(self.onyx_account_name, {
                    'amount': tx.fee_amount,
                    'type': 'credit',
                    'other_account': payer.account_name,
                    'description': "Onyx Fee"
                })

            return {"success": True, "tx_id": tx.invoice_id}

    def run_server(self):
        uvicorn.run(self.app, host="0.0.0.0", port=self.port, log_level="critical")

    @commands.Cog.listener()
    async def on_ready(self):
        if not self.server_thread:
            logger.info(f"🟢 VH Bank Node Listening on Port {self.port}")
            self.server_thread = threading.Thread(target=self.run_server, daemon=True)
            self.server_thread.start()

async def setup(bot):
    with open("config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
    await bot.add_cog(NodeAPI(bot, cfg))