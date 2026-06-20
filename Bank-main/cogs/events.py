import discord
from discord.ext import commands
import aiohttp
import asyncio
import yaml
import logging
import base64
import json
import sqlite3
import time
from datetime import datetime

logger = logging.getLogger("EventStream")
DB_NAME = "bank_data.db"

class EventListener(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.ws_task = None
        self.load_config()
        # Start the listener in the background
        self.ws_task = self.bot.loop.create_task(self.connect_websocket())

    def cog_unload(self):
        if self.ws_task:
            self.ws_task.cancel()

    def load_config(self):
        try:
            with open("config.yaml", "r") as f:
                cfg = yaml.safe_load(f)
            
            # Convert HTTP URL to WebSocket URL
            base_url = cfg["api"].get("base_url", "https://api.cityrp.org/citycorp")
            self.ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://")
            
            self.api_key = cfg["api"].get("api_key", "").strip()
            self.cityrp_uuid = cfg["api"].get("cityrp_uuid", "")
            
            auth_string = f"{self.cityrp_uuid}:{self.api_key}"
            auth_encoded = base64.b64encode(auth_string.encode()).decode()
            self.headers = {
                "Authorization": f"Basic {auth_encoded}"
            }
        except Exception as e:
            logger.critical(f"Failed to load config for Events: {e}")
            self.ws_url = None

    async def connect_websocket(self):
        await self.bot.wait_until_ready()
        
        if not self.ws_url:
            logger.warning("WebSocket URL missing. Event Listener disabled.")
            return

        logger.info(f"🔌 Connecting to Event Stream: {self.ws_url}")

        while not self.bot.is_closed():
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(self.ws_url, headers=self.headers) as ws:
                        logger.info("✅ WebSocket Connected! Listening for real-time transactions...")
                        
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self.process_event(msg.data)
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                logger.error(f"WebSocket Error: {ws.exception()}")
                                break
                                
            except Exception as e:
                logger.error(f"WebSocket Connection Failed: {e}")
                
            logger.info("Reconnecting in 5 seconds...")
            await asyncio.sleep(5)

    async def process_event(self, data_str):
        try:
            payload = json.loads(data_str)
            event_name = payload.get("name", "Unknown")
            event_data = payload.get("event", {})

            # We care about Account Deposits and Withdrawals
            # Matches: CorpAccountDepositEvent, CorpAccountWithdrawAPIEvent, etc.
            if "CorpAccount" in event_name:
                await self.handle_account_transaction(event_name, event_data)

        except json.JSONDecodeError:
            pass
        except Exception as e:
            logger.error(f"Error processing event: {e}")

    async def handle_account_transaction(self, event_name, data):
        """Parses the event and writes to the local DB immediately."""
        try:
            # 1. Extract Core Data
            corp_account = data.get("corpAccount", {})
            account_name = corp_account.get("name")
            amount = float(data.get("amount", 0))
            
            if not account_name or amount == 0:
                return

            # 2. Determine Type & Direction
            # If it's a Deposit, amount is +, Type is 'deposit'
            # If it's a Withdraw, amount is -, Type is 'withdrawal'
            if "Deposit" in event_name:
                trans_type = "deposit"
                final_amount = abs(amount)
                logger.info(f"💰 LIVE DEPOSIT: +${final_amount} to {account_name}")
            elif "Withdraw" in event_name:
                trans_type = "withdrawal"
                final_amount = -abs(amount) # Force Negative
                logger.info(f"💸 LIVE WITHDRAW: ${final_amount} from {account_name}")
            else:
                return # Ignore other account events (like Changes)

            # 3. Generate Metadata
            # We generate a unique ID based on microtime to avoid primary key collisions 
            # with the REST API (which uses smaller integers).
            tx_id = int(time.time() * 1000000) 
            created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            description = "Real-time Event Update"

            # 4. Write to DB
            conn = sqlite3.connect(DB_NAME)
            c = conn.cursor()
            
            # Using INSERT OR IGNORE, though our custom ID ensures insertion.
            c.execute("INSERT OR IGNORE INTO client_transactions VALUES (?, ?, ?, ?, ?, ?)",
                      (tx_id, account_name, created_at, final_amount, description, trans_type))
            
            conn.commit()
            conn.close()

        except Exception as e:
            logger.error(f"Failed to save live transaction: {e}")

async def setup(bot):
    await bot.add_cog(EventListener(bot))