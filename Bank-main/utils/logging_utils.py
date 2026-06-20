import discord
import yaml
import logging
import sys
from datetime import datetime
import logging.handlers

# --- Standard Python Logging Setup (Fixes main.py crash) ---
def setup_logging():
    """
    Configures the global logging settings for the bot.
    Logs to both the console (stdout) and a file (bot.log).
    """
    # Create a custom logger
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    # Create handlers
    c_handler = logging.StreamHandler(sys.stdout)
    f_handler = logging.FileHandler('bot.log', encoding='utf-8', mode='a')

    c_handler.setLevel(logging.INFO)
    f_handler.setLevel(logging.INFO)

    # Create formatters and add it to handlers
    log_format = logging.Formatter('%(asctime)s:%(levelname)s:%(name)s: %(message)s')
    c_handler.setFormatter(log_format)
    f_handler.setFormatter(log_format)

    # Add handlers to the logger
    # Check if handlers already exist to avoid duplicate logs
    if not logger.handlers:
        logger.addHandler(c_handler)
        logger.addHandler(f_handler)

# --- Discord Embed Logging (Your Existing Logic) ---
logger = logging.getLogger(__name__)

# Configuration Loading for Embeds
try:
    with open("config.yaml", "r") as f:
        cfg = yaml.safe_load(f)
except Exception as e:
    logger.error(f"Failed to load config.yaml in logging_utils: {e}", exc_info=True)
    cfg = {}

REVIEW_CHANNEL_ID = int(cfg.get("discord", {}).get("review_channel_id", 0))
THEME_COLOR = int(cfg.get("bank", {}).get("theme_color", "0x0A2351"), 16)
BANK_NAME = cfg.get("bank", {}).get("name", "JPM")

async def _send_log(interaction: discord.Interaction, embed: discord.Embed):
    """Internal helper to send a log embed to the review channel."""
    if not REVIEW_CHANNEL_ID:
        logger.warning("review_channel_id is not set in config.yaml. Skipping log message.")
        return

    if not interaction.guild:
        return

    review_channel = interaction.guild.get_channel(REVIEW_CHANNEL_ID)
    if not review_channel:
        logger.error(f"Could not find review channel with ID {REVIEW_CHANNEL_ID}.")
        return

    try:
        await review_channel.send(embed=embed)
    except discord.Forbidden:
        logger.error(f"Bot does not have permissions to send messages in the review channel ({REVIEW_CHANNEL_ID}).")
    except Exception as e:
        logger.error(f"Failed to send log message to review channel: {e}", exc_info=True)

async def log_account_deletion(interaction: discord.Interaction, account_name: str, admin_id: int):
    """Logs the deletion of a bank account."""
    embed = discord.Embed(
        title=f"🗑️ Account Deleted: `{account_name}`",
        description=f"The account `{account_name}` has been permanently deleted from the system.",
        color=discord.Color.red(),
        timestamp=datetime.utcnow()
    )
    embed.add_field(name="Deleted By", value=f"<@{admin_id}>", inline=False)
    embed.set_footer(text=f"{BANK_NAME} Admin Action")

    await _send_log(interaction, embed)
    logger.info(f"Logged deletion of account {account_name} by admin {admin_id}.")

async def log_transaction(interaction: discord.Interaction, sender: str, recipient: str, amount: float, transaction_type: str):
    """Logs a financial transaction."""
    embed = discord.Embed(
        title=f"💸 Transaction Logged: {transaction_type}",
        color=discord.Color.green(),
        timestamp=datetime.utcnow()
    )
    embed.add_field(name="Initiated By", value=f"<@{interaction.user.id}>", inline=True)
    embed.add_field(name="Amount", value=f"${amount:,.2f}", inline=True)
    embed.add_field(name="Sender", value=f"`{sender}`", inline=False)
    embed.add_field(name="Recipient", value=f"`{recipient}`", inline=False)
    embed.set_footer(text=f"{BANK_NAME} Transaction System")
    
    await _send_log(interaction, embed)
    logger.info(f"Logged transaction: {amount} from {sender} to {recipient} by {interaction.user.id}.")

async def log_setting_change(interaction: discord.Interaction, account_name: str, setting_changed: str, details: str):
    """Logs a non-sensitive change to user or account settings."""
    embed = discord.Embed(
        title=f"⚙️ Setting Changed: {setting_changed}",
        description=details,
        color=discord.Color.orange(),
        timestamp=datetime.utcnow()
    )
    embed.add_field(name="User", value=f"<@{interaction.user.id}>", inline=True)
    embed.add_field(name="Affected Account", value=f"`{account_name}`", inline=True)
    embed.set_footer(text=f"{BANK_NAME} Settings System")

    await _send_log(interaction, embed)
    logger.info(f"Logged setting change for {account_name} by {interaction.user.id}: {setting_changed}")

async def log_account_creation(interaction: discord.Interaction, account_name: str, mc_username: str, rp_name: str, creator_id: int, creation_type: str):
    """Logs the creation of a new bank account."""
    embed = discord.Embed(
        title=f"📬 New Account Link: `{account_name}`",
        color=THEME_COLOR,
        timestamp=datetime.utcnow()
    )
    embed.add_field(name="Process", value=creation_type, inline=True)
    embed.add_field(name="Processed By", value=f"<@{creator_id}>", inline=True)
    
    # Logic to find owner ID
    owner_id = interaction.user.id
    if creation_type != "Self-Service Signup" and 'options' in interaction.data:
        # Attempt to extract ID from slash command options if available
        try:
            owner_id = discord.utils.get(interaction.data['options'], name='discord_id')['value']
        except (KeyError, TypeError):
            pass
            
    embed.add_field(name="Account Owner", value=f"<@{owner_id}>", inline=True)
    embed.add_field(name="In-Game Account", value=f"`{account_name}`", inline=False)
    embed.add_field(name="RP Name", value=rp_name, inline=True)
    embed.add_field(name="MC Username", value=mc_username, inline=True)
    embed.set_footer(text=f"{BANK_NAME} Onboarding System")

    await _send_log(interaction, embed)
    logger.info(f"Logged creation of account {account_name} to review channel.")