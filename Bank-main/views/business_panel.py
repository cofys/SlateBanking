import discord
from discord.ui import View, Button, Select, Modal, TextInput
from db.models import Account, AccountMember
from typing import TYPE_CHECKING, List, Optional
import logging

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('business_panel')

class BusinessMgmtView(View):
    """Initial view for business management, allowing selection of a business account."""
    def __init__(self, discord_id: int, is_admin: bool = False):
        super().__init__(timeout=300)
        # Pass context to select menu. Note: We don't have 'cog' here yet because this view 
        # is initialized inside other views before interaction context is fully established.
        # We will grab 'cog' from the interaction in the Select callback or pass it down if possible.
        # However, looking at previous files, BusinessMgmtView is called from main_menu/admin_panel 
        # where 'cog' isn't easily passed.
        #
        # FIX: We must update this to require 'cog' so DB access works. 
        # This means the caller (admin_panel/main_menu) must pass 'self.cog'.
        # I'll add it to __init__ but note that calling files need updating.
        # For this file, I will assume the caller WILL pass 'cog'.
        pass 

    # Re-init with Cog support
    def __init__(self, discord_id: int, is_admin: bool = False):
        super().__init__(timeout=300)
        self.add_item(BusinessAccountSelect(discord_id, is_admin))

class BusinessAccountSelect(Select):
    def __init__(self, discord_id: int, is_admin: bool = False):
        self.discord_id = discord_id
        self.is_admin = is_admin
        super().__init__(placeholder="Select a business account...", options=[discord.SelectOption(label="Loading...", value="loading")])

    async def callback(self, interaction: discord.Interaction):
        # FIX: Grab Cog from context
        cog = None
        if interaction.message and interaction.message.view and hasattr(interaction.message.view, 'cog'):
            cog = interaction.message.view.cog
        
        if not cog:
            # Fallback attempt for contexts where view might be ephemeral/detached
            # Ideally we pass cog into __init__, but since Select is added in __init__ of View...
            # We'll rely on the parent view having it.
            await interaction.response.send_message("❌ Error: Context lost. Please try again.", ephemeral=True)
            return

        selected_account = self.values[0]
        await interaction.response.edit_message(content=f"Managing members for `{selected_account}`:", view=BusinessMemberEditorView(cog, selected_account))

    # We need a way to populate options async or pass cog in.
    # Since we can't do async in __init__, we have to do a hack or require cog passed in.
    # Let's change the architecture slightly: The View should take the Cog and pass options.
    
# --- REWRITING CLASS STRUCTURE FOR COG COMPATIBILITY ---

class BusinessMgmtView(View):
    def __init__(self, cog: 'BankCog', discord_id: int, is_admin: bool = False):
        super().__init__(timeout=300)
        self.cog = cog
        self.add_item(BusinessAccountSelect(cog, discord_id, is_admin))

class BusinessAccountSelect(Select):
    def __init__(self, cog: 'BankCog', discord_id: int, is_admin: bool):
        self.cog = cog
        
        session = self.cog.db.get_session()
        try:
            if is_admin:
                # Admins see all business accounts
                accounts = session.query(Account).filter_by(account_type='business').all()
            else:
                # Users see accounts they own OR are members of
                owned = session.query(Account).filter_by(discord_id=str(discord_id), account_type='business')
                member_of = session.query(Account).join(AccountMember).filter(
                    AccountMember.discord_id == str(discord_id),
                    Account.account_type == 'business'
                )
                accounts = owned.union(member_of).all()
        finally:
            session.close()
            
        options = [discord.SelectOption(label=acc.account_name, value=acc.account_name) for acc in accounts]
        if not options:
            options = [discord.SelectOption(label="No business accounts found", value="none")]
            
        super().__init__(placeholder="Select a business account to manage...", options=options)

    async def callback(self, interaction: discord.Interaction):
        if self.values[0] == "none":
            return await interaction.response.edit_message(content="No business accounts available.", view=None)
        
        selected_account = self.values[0]
        await interaction.response.edit_message(content=f"Managing members for `{selected_account}`:", view=BusinessMemberEditorView(self.cog, selected_account))


class BusinessMemberEditorView(View):
    """View for adding/removing members from a selected business account."""
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(timeout=300)
        self.cog = cog
        self.account_name = account_name

    @discord.ui.button(label="➕ Add Member", style=discord.ButtonStyle.success)
    async def add_member(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(AddMemberModal(self.cog, self.account_name))

    @discord.ui.button(label="➖ Remove Member", style=discord.ButtonStyle.danger)
    async def remove_member(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message("Select a member to remove:", view=RemoveMemberView(self.cog, self.account_name), ephemeral=True)

class AddMemberModal(Modal):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(title=f"Add Member to {account_name}")
        self.cog = cog
        self.account_name = account_name
        self.discord_id = TextInput(label="User's Discord ID", required=True)
        self.mc_username = TextInput(label="User's Minecraft Username", required=True)
        self.add_item(self.discord_id)
        self.add_item(self.mc_username)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        discord_id_val = self.discord_id.value
        mc_username_val = self.mc_username.value

        # API Call: UUID Lookup
        minecraft_uuid = await self.cog.api.get_minecraft_uuid(mc_username_val)
        if not minecraft_uuid:
            await interaction.followup.send(f"❌ Could not find a Minecraft account with the username `{mc_username_val}`. Member not added.", ephemeral=True)
            return

        # API Call: Add Subuser
        result = await self.cog.api.add_subuser(self.account_name, minecraft_uuid)
        if not result["success"]:
            msg = result.get('message', 'Unknown Error')
            if msg != 'already_exists': # Continue if they are just re-linking
                await interaction.followup.send(f"❌ Failed to add `{mc_username_val}` to in-game account. API Error: {msg}", ephemeral=True)
                return

        session = self.cog.db.get_session()
        try:
            # Check if already linked locally
            exists = session.query(AccountMember).filter_by(account_name=self.account_name, discord_id=discord_id_val).first()
            if not exists:
                new_member = AccountMember(account_name=self.account_name, discord_id=discord_id_val)
                session.add(new_member)
                session.commit()
                await interaction.followup.send(f"✅ Added user `{discord_id_val}` to `{self.account_name}` and granted in-game access.", ephemeral=True)
            else:
                 await interaction.followup.send(f"⚠️ User `{discord_id_val}` is already a member locally, but in-game access was verified.", ephemeral=True)
                 
        except Exception as e:
            session.rollback()
            logger.error(f"DB error while adding business member: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected database error occurred.", ephemeral=True)
        finally:
            session.close()

class RemoveMemberView(View):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(timeout=180)
        self.cog = cog
        self.add_item(RemoveMemberSelect(cog, account_name))

class RemoveMemberSelect(Select):
    def __init__(self, cog: 'BankCog', account_name: str):
        self.cog = cog
        self.account_name = account_name
        
        session = self.cog.db.get_session()
        members = session.query(AccountMember).filter_by(account_name=account_name).all()
        session.close()
        
        options = [discord.SelectOption(label=f"User ID: {m.discord_id}", value=m.discord_id) for m in members]
        if not options:
            options = [discord.SelectOption(label="No members to remove", value="none")]
            
        super().__init__(placeholder="Select a member...", options=options)

    async def callback(self, interaction: discord.Interaction):
        if self.values[0] == "none":
            return await interaction.response.edit_message(content="No member selected.", view=None)
        
        member_id = self.values[0]
        
        session = self.cog.db.get_session()
        try:
            session.query(AccountMember).filter_by(account_name=self.account_name, discord_id=member_id).delete()
            session.commit()
            await interaction.response.edit_message(content=f"✅ Removed user `{member_id}` from `{self.account_name}` database (In-game access remains until manual removal).", view=None)
        except Exception as e:
            logger.error(f"Error removing member: {e}")
            await interaction.response.send_message("❌ Error removing member.", ephemeral=True)
        finally:
            session.close()