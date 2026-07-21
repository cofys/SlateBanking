import discord
from discord.ext import commands
from discord import app_commands, ui
from db.models import Database, Account, Invoice # <--- Added Invoice import
from utils.cityrp_api import CityRPAPI
from tasks.scheduler import Scheduler
from views.main_menu import MainMenu
from views.signup_flow import SignupTypeView 
from views.business import PayInvoiceView # <--- Import view to re-register
from utils.image_gen import CardGenerator 
import yaml
import logging
import bcrypt

logger = logging.getLogger('bank_bot')

# --- REGISTRATION MODAL ---
class RegisterModal(ui.Modal, title='Vance & Hamilton Registration'):
    mc_username = ui.TextInput(label='Minecraft Username', placeholder='Enter your in-game name')
    rp_name = ui.TextInput(label='Roleplay Name', placeholder='Enter your character\'s full name')
    pin = ui.TextInput(label='4-Digit PIN', min_length=4, max_length=4, style=discord.TextStyle.short)
    secret_question = ui.TextInput(label='Secret Question', placeholder='e.g., Name of your first pet?')
    secret_answer = ui.TextInput(label='Secret Answer', placeholder='Enter the answer')

    def __init__(self, cog):
        super().__init__()
        self.cog = cog

    async def on_submit(self, interaction: discord.Interaction):
        try:
            if " " in self.mc_username.value:
                await interaction.response.send_message("❌ **Error:** Account names cannot contain spaces.", ephemeral=True)
                return

            if self.cog.db.get_account_by_discord_id(interaction.user.id) or \
               self.cog.db.get_account_by_name(self.mc_username.value):
                await interaction.response.send_message("You are already registered or that Minecraft account is already in use.", ephemeral=True)
                return

            salt = bcrypt.gensalt()
            hashed_pin = bcrypt.hashpw(self.pin.value.encode(), salt).decode()
            hashed_secret = bcrypt.hashpw(self.secret_answer.value.encode(), salt).decode()

            new_account = self.cog.db.create_account(
                account_name=self.mc_username.value.lower(),
                discord_id=str(interaction.user.id),
                mc_username=self.mc_username.value,
                rp_name=self.rp_name.value,
                account_type='personal',
                pin=hashed_pin,
                secret_question=self.secret_question.value,
                secret_answer=hashed_secret
            )
            
            logger.info(f"New account created: {new_account.account_name} for {interaction.user.name}")
            await interaction.response.send_message(f"Welcome to Vance & Hamilton, {self.rp_name.value}! Your personal account, '{new_account.account_name}', is now active.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error in RegisterModal on_submit: {e}", exc_info=True)
            await interaction.response.send_message("An unexpected error occurred.", ephemeral=True)


# --- BANK COG ---
class BankCog(commands.Cog):
    def __init__(self, bot, cfg):
        self.bot = bot
        self.cfg = cfg
        try:
            db_path = cfg.get("database", {}).get("path", "data/bank.db")
            self.db = Database(db_path)
            logger.info(f"Database connection established at {db_path}.")
        except Exception as e:
            logger.critical(f"Failed to connect to database: {e}", exc_info=True)
            raise
        
        try:
            self.api = CityRPAPI(cfg)
            logger.info("CityRP API wrapper initialized.")
        except Exception as e:
            logger.critical(f"Failed to initialize CityRP API: {e}", exc_info=True)
            raise
            
        self.scheduler = Scheduler(self.db, self.api)
        self.scheduler.start()
        
        self.card_gen = CardGenerator() 
        logger.info("Scheduler started and CardGenerator initialized.")

    async def cog_load(self):
        """Called when the Cog is fully loaded. Restores persistent views."""
        logger.info("Restoring persistent views...")
        session = self.db.get_session()
        try:
            # Re-register buttons for ALL pending invoices so they work after reboot
            pending_invoices = session.query(Invoice).filter_by(status='pending').all()
            count = 0
            for inv in pending_invoices:
                self.bot.add_view(PayInvoiceView(self, inv.id))
                count += 1
            logger.info(f"✅ Restored {count} pending invoice payment buttons.")
        except Exception as e:
            logger.error(f"Failed to restore invoice views: {e}")
        finally:
            session.close()

    def cog_unload(self):
        self.scheduler.shutdown()
        logger.info("BankCog unloaded.")

        _failed_pins = {}

    async def verify_pin(self, account: Account, pin: str) -> bool:
        if not account or not account.pin: return False
        
        import time
        import asyncio
        key = f"{account.discord_id}_{account.account_name}"
        attempts, lock_until = self._failed_pins.get(key, (0, 0))
        if time.time() < lock_until:
            return False # Locked out

        loop = asyncio.get_event_loop()
        is_valid = False
        
        # 1. Try Hash
        try:
            is_valid = await loop.run_in_executor(None, bcrypt.checkpw, pin.encode(), account.pin.encode())
        except ValueError:
            pass
        except Exception as e:
            logger.warning(f"bcrypt error: {e}")

        # 2. Fallback Plain Text & Auto-Migrate
        if not is_valid and account.pin == pin:
            logger.info(f"Migrating legacy PIN for {account.account_name} to hash.")
            try:
                salt = bcrypt.gensalt()
                new_hash = bcrypt.hashpw(pin.encode(), salt).decode()
                self.db.update_account_pin(account.account_name, new_hash)
                account.pin = new_hash
                is_valid = True
            except Exception as e:
                logger.error(f"Failed to auto-migrate PIN: {e}")
                
        if is_valid:
            self._failed_pins[key] = (0, 0)
            return True
        else:
            attempts += 1
            if attempts >= 5:
                self._failed_pins[key] = (attempts, time.time() + 300) # 5 minutes lockout
            else:
                self._failed_pins[key] = (attempts, 0)
            return False
        
        # 1. Try Hash
        try:
            if bcrypt.checkpw(pin.encode(), account.pin.encode()):
                return True
        except ValueError:
            pass
        except Exception as e:
            logger.warning(f"bcrypt error: {e}")

        # 2. Fallback Plain Text & Auto-Migrate
        if account.pin == pin:
            logger.info(f"Migrating legacy PIN for {account.account_name} to hash.")
            try:
                salt = bcrypt.gensalt()
                new_hash = bcrypt.hashpw(pin.encode(), salt).decode()
                self.db.update_account_pin(account.account_name, new_hash)
            except Exception as e:
                logger.error(f"Failed to migrate PIN: {e}")
            return True
            
        return False

    def verify_secret_answer(self, account: Account, answer: str) -> bool:
        if not account or not account.secret_answer: return False
        
        # 1. Try Hash
        try:
            if bcrypt.checkpw(answer.encode(), account.secret_answer.encode()):
                return True
        except ValueError:
            pass
            
        # 2. Fallback Plain Text & Auto-Migrate
        if account.secret_answer == answer:
            logger.info(f"Migrating legacy Secret for {account.account_name} to hash.")
            try:
                salt = bcrypt.gensalt()
                new_hash = bcrypt.hashpw(answer.encode(), salt).decode()
                self.db.update_account_secret(account.account_name, account.secret_question, new_hash)
            except Exception as e:
                logger.error(f"Failed to migrate secret: {e}")
            return True
            
        return False

    @app_commands.command(name="bank", description="Access your Vance & Hamilton bank account.")
    async def bank(self, interaction: discord.Interaction):
        try:
            accounts = self.db.get_all_accounts_for_user(interaction.user.id)
            
            if not accounts:
                view = SignupTypeView(self, interaction.user.id)
                embed = discord.Embed(
                    title="👋 Welcome to Vance & Hamilton",
                    description="It looks like you don't have an account with us yet.\n\nPlease select an account type below to get started.",
                    color=discord.Color.blue()
                )
                await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
                return
            
            view = MainMenu(self, interaction.user, accounts)
            await interaction.response.send_message("Welcome to Vance & Hamilton.", view=view, ephemeral=True)
            
        except Exception as e:
            logger.error(f"Error in /bank command: {e}", exc_info=True)
            if not interaction.response.is_done():
                await interaction.response.send_message("An error occurred.", ephemeral=True)


async def setup(bot):
    with open("config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
    await bot.add_cog(BankCog(bot, cfg))
    logger.info("BankCog loaded.")