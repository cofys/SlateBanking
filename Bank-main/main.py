import discord
from discord.ext import commands
import yaml
import logging
import sys
import os
from utils.logging_utils import setup_logging
from migrate_db import run_migrations

# --- Logging Setup ---
setup_logging()
logger = logging.getLogger(__name__)

# --- Configuration Loading ---
try:
    with open("config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
except FileNotFoundError:
    logger.critical("CRITICAL: config.yaml not found. The bot cannot start.")
    sys.exit(1)

# --- Bot Initialization ---
intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.guilds = True

class SlateBot(commands.Bot):
    def __init__(self):
        super().__init__(command_prefix='/', intents=intents, help_command=None)
        self.guild_id = int(cfg["discord"]["guild_id"])
        self.guild_object = discord.Object(id=self.guild_id)

    async def setup_hook(self):
        """This is called once the bot logs in, before connecting to the gateway."""
        logger.info("--- Running setup_hook ---")
        run_migrations()
        
        # 1. Load all cogs
        logger.info("Attempting to load cogs...")
        if os.path.exists('./cogs'):
            for filename in os.listdir('./cogs'):
                if filename.endswith('.py'):
                    cog_name = f'cogs.{filename[:-3]}'
                    try:
                        await self.load_extension(cog_name)
                        logger.info(f"[SUCCESS] Loaded cog: {cog_name}")
                    except Exception as e:
                        logger.error(f"[FAILURE] Failed to load cog {cog_name}.", exc_info=e)
        else:
            logger.warning("No 'cogs' directory found.")
        
        # 2. Sync commands to the specific guild
        logger.info(f"Attempting to sync commands to guild {self.guild_id}...")
        
        # Clear old commands first to ensure a clean slate (removes /ping if it exists)
        self.tree.clear_commands(guild=self.guild_object)
        
        # Copy the global commands (from BankCog) to the guild
        self.tree.copy_global_to(guild=self.guild_object)
        
        try:
            synced = await self.tree.sync(guild=self.guild_object)
            logger.info(f"[SUCCESS] Synced {len(synced)} command(s) to guild {self.guild_id}.")
            for cmd in synced:
                logger.info(f"  -> Synced '{cmd.name}'")
        except Exception as e:
            logger.error(f"[FAILURE] Failed to sync commands to guild {self.guild_id}.", exc_info=e)
            
        logger.info("--- setup_hook complete ---")


    async def on_ready(self):
        """This function runs once the bot is fully connected."""
        logger.info(f"Bot logged in as {self.user} (ID: {self.user.id})")
        logger.info("-----------------------------------------")
        logger.info("Bot is fully operational and ready.")
        logger.info("-----------------------------------------")


# --- Main Execution ---
if __name__ == "__main__":
    token = cfg["discord"].get("token")
    if not token or "YOUR_DISCORD_BOT_TOKEN" in token:
        logger.critical("CRITICAL: Bot token is missing from config.yaml. Please add it to run the bot.")
    else:
        bot = SlateBot()
        bot.run(token)