import discord
from discord.ui import Modal, TextInput, View, Select, Button
from db.models import Account
from utils.logging_utils import log_account_creation
import logging
import yaml
import bcrypt
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

# --- Configuration and Logging ---
logging.basicConfig(level=logging.INFO, handlers=[logging.FileHandler('bot.log', encoding='utf-8')])
logger = logging.getLogger(__name__)

with open("config.yaml", "r") as f:
    cfg = yaml.safe_load(f)

BANK_NAME = cfg["bank"]["name"]
CORP_NAME = cfg["bank"]["corp_name"]
TERMS_URL = cfg["bank"].get("terms_url", "https://cityrp.org/terms")
MIN_DEPOSIT = cfg["bank"].get("min_initial_deposit", 200)
DEFAULT_WITHDRAW_FEE = cfg["bank"].get("withdrawal_tax_percent", 0.0)
DEFAULT_DEPOSIT_FEE = cfg["bank"].get("deposit_tax_percent", 0.0)

# --- Deposit Verification View ---
class DepositVerificationView(View):
    def __init__(self, cog: 'BankCog', discord_id: int, account_name: str):
        super().__init__(timeout=1800) 
        self.cog = cog
        self.discord_id = discord_id
        self.account_name = account_name

    @discord.ui.button(label="✅ Verify My Deposit", style=discord.ButtonStyle.success)
    async def verify_deposit(self, interaction: discord.Interaction, button: Button):
        await interaction.response.defer(ephemeral=True, thinking=True)

        # Use API from cog
        if await self.cog.api.has_valid_deposit(self.account_name, MIN_DEPOSIT):
            button.disabled = True
            await interaction.edit_original_response(view=self)
            
            await interaction.followup.send(
                "✅ Deposit verified! Please complete the final security setup to activate your account.",
                view=FirstTimeSetupTriggerView(self.cog, self.discord_id, self.account_name),
                ephemeral=True
            )
        else:
            await interaction.followup.send(
                f"❌ Deposit not found. Please ensure you have deposited at least **${MIN_DEPOSIT:,.2f}** in-game and try again.",
                ephemeral=True
            )

# --- SELF-SERVICE SIGNUP FLOW (FOR NEW USERS) ---

class TermsAgreementView(View):
    def __init__(self, cog: 'BankCog', account_type: str, discord_id: int):
        super().__init__(timeout=300)
        self.cog = cog
        self.account_type = account_type
        self.discord_id = discord_id

    @discord.ui.button(label="Agree & Continue", style=discord.ButtonStyle.success)
    async def agree(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(NewUserSignupModal(self.cog, self.account_type, self.discord_id))

class NewUserSignupModal(Modal):
    def __init__(self, cog: 'BankCog', account_type: str, discord_id: int):
        super().__init__(title=f"New {account_type.title()} Account Signup")
        self.cog = cog
        self.account_type = account_type.lower()
        self.discord_id = discord_id
        self.mc_username = TextInput(label="Minecraft Username", required=True)
        self.rp_name = TextInput(label="Legal Name (In-Game RP Name)", required=True)
        self.add_item(self.mc_username)
        self.add_item(self.rp_name)
        if self.account_type == 'business':
            self.account_name_input = TextInput(label="Business Account Name (e.g., corp-mybiz)", required=True)
            self.add_item(self.account_name_input)
        else:
            self.account_name_input = None

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        mc_username_val = self.mc_username.value
        account_name = f"personal-{''.join(filter(str.isalnum, mc_username_val.lower()))}" if self.account_type == 'personal' else self.account_name_input.value.lower()

        # API Check: Does account exist?
        if await self.cog.api.get_account_details(account_name):
            return await interaction.followup.send(f"❌ The account name `{account_name}` already exists.", ephemeral=True)

        # API Check: UUID
        minecraft_uuid = await self.cog.api.get_minecraft_uuid(mc_username_val)
        if not minecraft_uuid:
            return await interaction.followup.send(f"❌ Could not find a Minecraft account with the username `{mc_username_val}`.", ephemeral=True)

        # API Action: Create Account
        if not await self.cog.api.create_account(account_name):
            return await interaction.followup.send(f"❌ Failed to create account `{account_name}` via API.", ephemeral=True)
        
        # API Action: Add Subuser
        if not await self.cog.api.add_subuser(account_name, minecraft_uuid):
            logger.error(f"CRITICAL: Created account {account_name} but FAILED to add subuser {minecraft_uuid}.")
        
        # API Action: Set Fees
        await self.cog.api.set_account_fee(account_name, 'withdraw', DEFAULT_WITHDRAW_FEE)
        await self.cog.api.set_account_fee(account_name, 'deposit', DEFAULT_DEPOSIT_FEE)

        # DB Action: Save to Local Database using ORM
        session = self.cog.db.get_session()
        try:
            new_account = Account(
                account_name=account_name,
                discord_id=str(self.discord_id),
                mc_username=mc_username_val,
                rp_name=self.rp_name.value,
                account_type=self.account_type,
                verified=False # Not fully verified until deposit + setup
            )
            session.add(new_account)
            session.commit()
            
            await log_account_creation(interaction, account_name, mc_username_val, self.rp_name.value, interaction.user.id, "Self-Service Signup")
            
            embed = discord.Embed(
                title="➡️ Next Step: Initial Deposit",
                description=f"Your account placeholder for `{account_name}` has been created!\n\nTo activate your account, you must make an initial deposit of at least **${MIN_DEPOSIT:,.2f}**.",
                color=discord.Color.blue()
            )
            embed.add_field(
                name="In-Game Deposit Command",
                value=f"```/c account deposit {CORP_NAME} {account_name} {MIN_DEPOSIT}```"
            )
            embed.set_footer(text="Once you have made the deposit, click the button below.")

            await interaction.followup.send(embed=embed, view=DepositVerificationView(self.cog, self.discord_id, account_name), ephemeral=True)

        except Exception as e:
            session.rollback()
            logger.error(f"Error during new user signup for {account_name}: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected database error occurred.", ephemeral=True)
        finally:
            session.close()

class SignupTypeView(View):
    def __init__(self, cog: 'BankCog', discord_id: int):
        super().__init__(timeout=300)
        self.add_item(SignupTypeSelect(cog, discord_id))

class SignupTypeSelect(Select):
    def __init__(self, cog: 'BankCog', discord_id: int):
        self.cog = cog
        self.discord_id = discord_id
        options = [
            discord.SelectOption(label="Personal Account", value="personal", emoji="👤"),
            discord.SelectOption(label="Business Account", value="business", emoji="🏢")
        ]
        super().__init__(placeholder="Choose your account type...", options=options)

    async def callback(self, interaction: discord.Interaction):
        embed = discord.Embed(title=f"📜 {BANK_NAME} Terms of Service", description=f"Please read and agree to our [Terms of Service]({TERMS_URL}) to continue.", color=discord.Color.blue())
        await interaction.response.edit_message(embed=embed, view=TermsAgreementView(self.cog, self.values[0], self.discord_id))

# --- FIRST-TIME SETUP FLOW ---

class FirstTimeSetupModal(Modal):
    def __init__(self, cog: 'BankCog', discord_id: int, account_name: str):
        super().__init__(title="Step 1: Profile Information")
        self.cog = cog
        self.discord_id = discord_id
        self.account_name = account_name
        
        # Fetch current data to pre-fill
        session = self.cog.db.get_session()
        user_data = session.query(Account).filter_by(account_name=account_name).first()
        session.close()

        self.mc_username = TextInput(label="Minecraft Username", default=user_data.mc_username if user_data else "", required=True)
        self.rp_name = TextInput(label="Legal Name (In-Game RP Name)", default=user_data.rp_name if user_data else "", required=True)
        self.registered_address = TextInput(label="Registered Address (In-Game)", style=discord.TextStyle.paragraph, required=True)
        self.add_item(self.mc_username)
        self.add_item(self.rp_name)
        self.add_item(self.registered_address)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        profile_data = {
            "mc_username": self.mc_username.value,
            "rp_name": self.rp_name.value,
            "registered_address": self.registered_address.value
        }
        embed = discord.Embed(title="Step 1 Complete!", description="Next, please set your security details to finish activating your account.", color=discord.Color.blue())
        # Pass interaction to allow follow-up editing
        await interaction.followup.send(embed=embed, view=SetupStep2View(self.cog, interaction, self.discord_id, self.account_name, profile_data), ephemeral=True)

class SetupStep2View(View):
    def __init__(self, cog: 'BankCog', original_interaction: discord.Interaction, discord_id: int, account_name: str, profile_data: dict):
        super().__init__(timeout=600)
        self.cog = cog
        self.original_interaction = original_interaction
        self.discord_id = discord_id
        self.account_name = account_name
        self.profile_data = profile_data

    @discord.ui.button(label="Set Security Details", style=discord.ButtonStyle.success)
    async def begin_security_setup(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(SetupStep2Modal(self.cog, self.original_interaction, self.discord_id, self.account_name, self.profile_data))

class SetupStep2Modal(Modal):
    def __init__(self, cog: 'BankCog', original_interaction: discord.Interaction, discord_id: int, account_name: str, profile_data: dict):
        super().__init__(title="Step 2: Security Setup")
        self.cog = cog
        self.original_interaction = original_interaction
        self.discord_id = discord_id
        self.account_name = account_name
        self.profile_data = profile_data
        self.pin = TextInput(label="4-6 Digit PIN", min_length=4, max_length=6, required=True)
        self.secret_q = TextInput(label="Secret Question", required=True)
        self.secret_a = TextInput(label="Secret Answer", required=True)
        self.add_item(self.pin)
        self.add_item(self.secret_q)
        self.add_item(self.secret_a)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        session = self.cog.db.get_session()
        try:
            # Secure hashing for PIN and Secret
            salt = bcrypt.gensalt()
            hashed_pin = bcrypt.hashpw(self.pin.value.encode(), salt).decode()
            hashed_secret = bcrypt.hashpw(self.secret_a.value.encode(), salt).decode()

            # Update Account
            account = session.query(Account).filter_by(account_name=self.account_name).first()
            if account:
                account.mc_username = self.profile_data['mc_username']
                account.rp_name = self.profile_data['rp_name']
                account.registered_address = self.profile_data['registered_address']
                account.pin = hashed_pin
                account.secret_question = self.secret_q.value
                account.secret_answer = hashed_secret
                account.verified = True
                session.commit()
            
            # Load Dashboard
            from .client_dashboard import ClientDashboardView
            dashboard_view = ClientDashboardView(self.cog, self.discord_id, selected_account=self.account_name)
            dashboard_embed = await dashboard_view.create_dashboard_embed()

            await self.original_interaction.edit_original_response(
                content=None,
                embed=dashboard_embed, 
                view=dashboard_view
            )
            # Acknowledge this interaction to close the modal cleanly
            await interaction.followup.send("✅ Setup Complete!", ephemeral=True)
            
        except Exception as e:
            session.rollback()
            logger.error(f"Error during final setup for {self.discord_id}: {e}", exc_info=True)
            await self.original_interaction.edit_original_response(content="❌ An unexpected error occurred during final setup.", embed=None, view=None)
        finally:
            session.close()

class FirstTimeSetupTriggerView(View):
    def __init__(self, cog: 'BankCog', discord_id: int, account_name: str):
        super().__init__(timeout=600)
        self.cog = cog
        self.discord_id = discord_id
        self.account_name = account_name

    @discord.ui.button(label="Begin Account Setup", style=discord.ButtonStyle.success)
    async def begin_setup(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(FirstTimeSetupModal(self.cog, self.discord_id, self.account_name))