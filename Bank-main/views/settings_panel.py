import discord
from discord.ui import View, Button, Modal, TextInput
from db.models import Account
from utils.logging_utils import log_setting_change
from .business_panel import BusinessMemberEditorView 
import logging
import bcrypt
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('settings_panel')

class ChangeAddressModal(Modal, title="Change Registered Address"):
    def __init__(self, cog: 'BankCog', account: Account):
        super().__init__()
        self.cog = cog
        self.account = account
        
        self.current_pin = TextInput(label="Confirm PIN", min_length=4, max_length=6, style=discord.TextStyle.short, required=True)
        self.new_address = TextInput(
            label="New Registered Address", 
            style=discord.TextStyle.paragraph, 
            default=account.registered_address or "",
            required=True
        )

        self.add_item(self.current_pin)
        self.add_item(self.new_address)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        if not self.cog.verify_pin(self.account, self.current_pin.value):
            return await interaction.followup.send("❌ PIN is incorrect. Cannot update address.", ephemeral=True)

        session = self.cog.db.get_session()
        try:
            account = session.query(Account).filter_by(account_name=self.account.account_name).first()
            if account:
                old_addr = account.registered_address
                account.registered_address = self.new_address.value
                session.commit()
                
                await log_setting_change(
                    interaction, 
                    self.account.account_name, 
                    "Registered Address Update", 
                    f"From: {old_addr}\nTo: {self.new_address.value}"
                )
                await interaction.followup.send("✅ Registered address has been updated.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error changing address: {e}")
            await interaction.followup.send("❌ An error occurred while updating your address.", ephemeral=True)
        finally:
            session.close()

class ChangePinModal(Modal, title="Change Your PIN"):
    def __init__(self, cog: 'BankCog', account: Account):
        super().__init__()
        self.cog = cog
        self.account = account
        
        self.old_pin = TextInput(label="Current PIN", min_length=4, max_length=6, style=discord.TextStyle.short, required=True)
        self.new_pin = TextInput(label="New PIN", min_length=4, max_length=6, style=discord.TextStyle.short, required=True)
        self.confirm_pin = TextInput(label="Confirm New PIN", min_length=4, max_length=6, style=discord.TextStyle.short, required=True)
        
        self.add_item(self.old_pin)
        self.add_item(self.new_pin)
        self.add_item(self.confirm_pin)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        if not self.cog.verify_pin(self.account, self.old_pin.value):
            return await interaction.followup.send("❌ Current PIN is incorrect.", ephemeral=True)

        if self.new_pin.value != self.confirm_pin.value:
            return await interaction.followup.send("❌ New PINs do not match.", ephemeral=True)
            
        try:
            salt = bcrypt.gensalt()
            hashed_pin = bcrypt.hashpw(self.new_pin.value.encode(), salt).decode()
            self.cog.db.update_account_pin(self.account.account_name, hashed_pin)
            
            await log_setting_change(interaction, self.account.account_name, "PIN Change", "User changed their PIN.")
            await interaction.followup.send("✅ Your PIN has been successfully updated.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error changing PIN: {e}")
            await interaction.followup.send("❌ An error occurred while updating your PIN.", ephemeral=True)


class ChangeSecretModal(Modal, title="Change Secret Question"):
    def __init__(self, cog: 'BankCog', account: Account):
        super().__init__()
        self.cog = cog
        self.account = account
        
        self.current_pin = TextInput(label="Current PIN", min_length=4, max_length=6, style=discord.TextStyle.short, required=True)
        self.new_question = TextInput(label="New Secret Question", style=discord.TextStyle.paragraph, required=True)
        self.new_answer = TextInput(label="New Secret Answer", style=discord.TextStyle.short, required=True)

        self.add_item(self.current_pin)
        self.add_item(self.new_question)
        self.add_item(self.new_answer)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        if not self.cog.verify_pin(self.account, self.current_pin.value):
            return await interaction.followup.send("❌ PIN is incorrect. Cannot update secret.", ephemeral=True)

        try:
            salt = bcrypt.gensalt()
            hashed_secret = bcrypt.hashpw(self.new_answer.value.encode(), salt).decode()
            self.cog.db.update_account_secret(self.account.account_name, self.new_question.value, hashed_secret)
            
            await log_setting_change(interaction, self.account.account_name, "Secret Q/A Change", "User updated secret question.")
            await interaction.followup.send("✅ Your secret question and answer have been updated.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error changing secret: {e}")
            await interaction.followup.send("❌ An error occurred while updating your secret.", ephemeral=True)


class SettingsPanelView(View):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(timeout=180)
        self.cog = cog
        self.account_name = account_name
        
        # FIX: Use helper that returns expunged object
        self.account = self.cog.db.get_account_by_name(account_name)
            
        if self.account:
            if self.account.account_type != 'business':
                self.remove_item(self.manage_members_button)
        else:
            self.clear_items()

    @discord.ui.button(label="Change PIN", style=discord.ButtonStyle.secondary, emoji="🔒", row=0)
    async def change_pin(self, interaction: discord.Interaction, button: Button):
        if not self.account: return
        await interaction.response.send_modal(ChangePinModal(self.cog, self.account))

    @discord.ui.button(label="Change Secret", style=discord.ButtonStyle.secondary, emoji="🤫", row=0)
    async def change_secret(self, interaction: discord.Interaction, button: Button):
        if not self.account: return
        await interaction.response.send_modal(ChangeSecretModal(self.cog, self.account))

    @discord.ui.button(label="Update Address", style=discord.ButtonStyle.primary, emoji="🏠", row=1)
    async def change_addr_button(self, interaction: discord.Interaction, button: Button):
        if not self.account: return
        await interaction.response.send_modal(ChangeAddressModal(self.cog, self.account))

    @discord.ui.button(label="Manage Members", style=discord.ButtonStyle.success, emoji="👥", row=1)
    async def manage_members_button(self, interaction: discord.Interaction, button: Button):
        if not self.account: return
        view = BusinessMemberEditorView(self.cog, self.account.account_name)
        await interaction.response.send_message(f"👥 Managing members for `{self.account.account_name}`:", view=view, ephemeral=True)

    @discord.ui.button(label="Toggle Auto-Collect", style=discord.ButtonStyle.secondary, emoji="🔄", row=2)
    async def toggle_auto_collect(self, interaction: discord.Interaction, button: Button):
        if not self.account: return
        
        new_state = not self.account.auto_collect
        self.cog.db.toggle_auto_collect(self.account.account_name, new_state)
        
        self.account.auto_collect = new_state
        status = "ENABLED" if new_state else "DISABLED"
        await interaction.response.send_message(f"✅ Automatic loan payment collection is now **{status}**.", ephemeral=True)