import discord
from discord.ext import commands, tasks
import sqlite3
import requests
import asyncio
import yaml
import logging
import base64
from datetime import datetime, timedelta
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger("BankSync")
DB_NAME = "bank_data.db"

class BankSync(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.load_config()
        self.setup_db()
        self.sync_corp_transactions.start()
        # self.sync_client_transactions.start() # Disabled (Using Event Listener)

    def cog_unload(self):
        self.sync_corp_transactions.cancel()

    def load_config(self):
        try:
            with open("config.yaml", "r") as f:
                cfg = yaml.safe_load(f)
            
            base_url = cfg["api"].get("base_url", "https://api.cityrp.org/citycorp").replace("cityrp.net", "cityrp.org")
            self.base_url = base_url
            self.api_key = cfg["api"].get("api_key", "").strip()
            self.cityrp_uuid = cfg["api"].get("cityrp_uuid", "")
            self.corp_id = int(cfg["bank"].get("corp_id", 0))

            auth_string = f"{self.cityrp_uuid}:{self.api_key}"
            auth_encoded = base64.b64encode(auth_string.encode()).decode()
            self.auth_headers = {
                "Authorization": f"Basic {auth_encoded}",
                "User-Agent": "SlateBot/Sync",
                "Content-Type": "application/json"
            }
        except Exception as e:
            logger.critical(f"Failed to load config.yaml: {e}")
            self.api_key = None

    def setup_db(self):
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        c.execute("""
            CREATE TABLE IF NOT EXISTS corp_transactions (
                id INTEGER PRIMARY KEY,
                created_at TEXT,
                amount REAL,
                description TEXT,
                category TEXT
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_corp_date ON corp_transactions(created_at)")

        c.execute("""
            CREATE TABLE IF NOT EXISTS client_transactions (
                id INTEGER, 
                account_name TEXT,
                created_at TEXT,
                amount REAL,
                description TEXT,
                type TEXT,
                PRIMARY KEY (id, account_name)
            )
        """)
        c.execute("CREATE INDEX IF NOT EXISTS idx_client_date ON client_transactions(created_at)")
        
        c.execute("""
            UPDATE corp_transactions 
            SET amount = -ABS(amount), category = 'expense'
            WHERE description LIKE '%PayTransaction%' AND amount > 0
        """)
        
        conn.commit()
        conn.close()

    def get_api_session(self):
        session = requests.Session()
        retries = Retry(total=3, backoff_factor=2, status_forcelist=[500, 502, 503, 504])
        session.mount('https://', HTTPAdapter(max_retries=retries))
        return session

    def parse_date(self, tx_data):
        try:
            ts = tx_data.get('timestamp') or tx_data.get('created_at')
            if ts:
                if isinstance(ts, (int, float)) or (isinstance(ts, str) and ts.replace('.', '').isdigit()):
                    ts = float(ts)
                    if ts > 100000000000: ts /= 1000
                    return datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S')
                return str(ts)
            return datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        except:
            return datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    # --- LOOP 1: CORP SYNC (Fees & Expenses) ---
    @tasks.loop(minutes=60)
    async def sync_corp_transactions(self):
        if not self.api_key: return
        
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # 1. Calculate Start Page
        c.execute("SELECT COUNT(*) FROM corp_transactions")
        total = c.fetchone()[0]
        
        session = self.get_api_session()
        url = f"{self.base_url}/corp/transactions/list"
        
        # Test page 1 to find page_size
        try:
            resp = session.get(url, params={"corp_id": self.corp_id, "page": 1}, headers=self.auth_headers, timeout=10)
            txs = resp.json().get('transactions', [])
            page_size = len(txs)
        except:
            page_size = 100 # Safe fallback
        
        # If the API returns oldest-first, the new records are on the LAST page.
        # So we start right before the last page we know about. 
        start_page = max(1, total // (page_size if page_size > 0 else 100))
        page = start_page

        logger.info(f"Corp Sync starting at Page {page} (Local DB: {total} records)")

        consecutive_old_pages = 0

        while True:
            try:
                await asyncio.sleep(0.5) 
                
                resp = await self.bot.loop.run_in_executor(None, lambda: session.get(url, params={"corp_id": self.corp_id, "page": page}, headers=self.auth_headers, timeout=10))
                
                if resp.status_code != 200: 
                    logger.warning(f"Corp Sync stopped: API returned {resp.status_code} at Page {page}")
                    break
                
                txs = resp.json().get('transactions', [])
                if not txs: 
                    # Empty list means we reached the future. Sync Complete.
                    logger.info(f"Corp Sync reached the end at Page {page}. Caught up!")
                    break 
                
                new_count = 0
                for tx in txs:
                    tid = tx.get('id')
                    amt = float(tx.get('amount', 0))
                    raw_type = tx.get('type', 'Unknown')
                    
                    if "FeeTransaction" in raw_type:
                        cat = "fee"
                    else:
                        cat = "income" if amt > 0 else "expense"


                    desc = f"{raw_type}"
                    if tx.get('feeType'): desc += f" ({tx.get('feeType')})"
                    if tx.get('accountName'): desc += f" - {tx.get('accountName')}"

                    try:
                        # INSERT OR IGNORE avoids errors on duplicates
                        c.execute("INSERT OR IGNORE INTO corp_transactions VALUES (?, ?, ?, ?, ?)",
                                 (tid, self.parse_date(tx), amt, desc, cat))
                        if c.rowcount > 0: new_count += 1
                    except: pass
                
                conn.commit()
                
                # --- SAFETY BREAK ---
                if new_count == 0:
                    consecutive_old_pages += 1
                else:
                    consecutive_old_pages = 0
                    
                # If we read 3 full pages and found ZERO new items, we are either too far back
                # or fully caught up and looping infinitely without hitting an empty page.
                if consecutive_old_pages >= 3:
                    logger.info(f"Corp Sync stopped at Page {page} (found 0 new records for 3 pages - fully caught up).")
                    break 

                logger.info(f"Corp Sync Page {page}: {new_count} new records")
                page += 1
                
            except Exception as e:
                logger.error(f"Corp Sync Error: {e}")
                break
        conn.close()

    @sync_corp_transactions.before_loop
    async def before_corp_sync(self): await self.bot.wait_until_ready()

    @discord.app_commands.command(name="rebuild_sync")
    @discord.app_commands.default_permissions(administrator=True)
    async def rebuild_sync(self, interaction: discord.Interaction):
        """Rebuilds the local transactions database from the API."""
        await interaction.response.defer(ephemeral=False)
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("DELETE FROM corp_transactions")
        conn.commit()
        conn.close()
        
        session = self.get_api_session()
        url = f"{self.base_url}/corp/transactions/list"
        resp = session.get(url, params={"corp_id": self.corp_id, "page": 1}, headers=self.auth_headers, timeout=10)
        
        txs = resp.json().get('transactions', [])
        page_size = len(txs)
        oldest = txs[-1].get('timestamp') if txs else 'none'
        newest = txs[0].get('timestamp') if txs else 'none'
        
        self.sync_corp_transactions.restart()
        await interaction.followup.send(f"Sync db cleared. Page 1 had {page_size} items. Newest ts: {newest}. Oldest ts: {oldest}. Rebuilding background task started.")

    @discord.app_commands.command(name="check_sync")
    async def check_sync(self, interaction: discord.Interaction):
        """Checks the status of the local database."""
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM corp_transactions")
        corp_count = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM client_transactions")
        client_count = c.fetchone()[0]
        
        c.execute("SELECT type, count(*), sum(amount) FROM client_transactions GROUP BY type")
        client_stats = "\n".join([f"- {r[0]}: {r[1]} ({r[2]})" for r in c.fetchall()])
        
        c.execute("SELECT category, description, count(*), sum(amount) FROM corp_transactions GROUP BY category, description limit 15")
        corp_stats = "\n".join([f"- {r[0]} | {r[1]}: {r[2]} ({r[3]})" for r in c.fetchall()])
        conn.close()
        
        try:
            db_path = 'bank_data.db'
            if not os.path.exists(db_path) and os.path.exists('/data/bank.db'): db_path = '/data/bank.db'
            conn2 = sqlite3.connect(db_path)
            c2 = conn2.cursor()
            c2.execute("SELECT DISTINCT category, description FROM corp_transactions")
            unique_desc = c2.fetchall()
            
            c2.execute("SELECT sum(amount) FROM corp_transactions WHERE amount > 0 AND category != 'fee'")
            sum_pos = c2.fetchone()[0]

            c2.execute("SELECT sum(amount) FROM corp_transactions WHERE amount < 0")
            sum_neg = c2.fetchone()[0]
            
            conn2.close()
            sql_stats = f"Unique Descs: {repr(unique_desc)[:500]}\nSum Pos Non-Fee: {sum_pos}\nSum Neg: {sum_neg}"
        except Exception as e:
            sql_stats = str(e)
            
            
        await interaction.response.send_message(
            f"📊 **Database Status**\n"
            f"• Corporate Ledger: **{corp_count}** transactions\n"
            f"{corp_stats}\n"
            f"• Client Ledger: **{client_count}** transactions\n"
            f"{client_stats}\n"
            f"• Main DB: {sql_stats}\n",
            ephemeral=True
        )

async def setup(bot):
    await bot.add_cog(BankSync(bot))