import discord
from discord.ui import View, Button, Select
from typing import TYPE_CHECKING, List
from db.models import Account

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

# Import the sub-views
from .client_dashboard import ClientDashboardView
from .clerk_panel import ClerkPanelView
from .admin_panel import AdminPanelView

class MainMenu(View):
    def __init__(self, cog: 'BankCog', user: discord.User, accounts: List):
        super().__init__(timeout=300)
        self.cog = cog
        self.user = user
        self.accounts = accounts
        
        self.is_admin = False
        self.is_clerk = False
        
        if isinstance(self.user, discord.Member):
            user_role_names = [role.name for role in self.user.roles]
            
            if "BankAdmin" in user_role_names:
                self.is_admin = True
                self.is_clerk = True 
            elif "BankClerk" in user_role_names:
                self.is_clerk = True

        self.add_buttons()

    def add_buttons(self):
        # 1. Banking Dashboard
        dashboard_btn = Button(label="Banking Dashboard", style=discord.ButtonStyle.success, emoji="💳", row=0)
        dashboard_btn.callback = self.open_client_dashboard
        self.add_item(dashboard_btn)

        # 2. Clerk Panel (Only for Staff)
        if self.is_clerk:
            clerk_btn = Button(label="Bank Clerk Panel", style=discord.ButtonStyle.secondary, emoji="🧑‍💼", row=1)
            clerk_btn.callback = self.open_clerk_panel
            self.add_item(clerk_btn)

        # 3. Admin Panel (Only for Admins)
        if self.is_admin:
            admin_btn = Button(label="Admin Panel", style=discord.ButtonStyle.danger, emoji="🛠️", row=1)
            admin_btn.callback = self.open_admin_panel
            self.add_item(admin_btn)

    async def open_client_dashboard(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        try:
            # Initialize view (this sets the selected_account to the first one available)
            view = ClientDashboardView(self.cog, interaction.user.id)
            embed = await view.create_dashboard_embed()
            
            files = []
            
            # --- INITIAL CARD GENERATION ---
            # If a default account was selected, generate its card now
            if view.selected_account:
                session = self.cog.db.get_session()
                rp_name = "Valued Client"
                acc_type = "personal"
                try:
                    acc = session.query(Account).filter_by(account_name=view.selected_account).first()
                    if acc:
                        rp_name = acc.rp_name
                        acc_type = acc.account_type
                finally:
                    session.close()

                # Get Balance
                api_data = await self.cog.api.get_account_details(view.selected_account)
                balance = float(api_data.get('balance', 0)) if api_data else 0.0

                # Generate
                card_buffer = await self.cog.bot.loop.run_in_executor(None, 
                    lambda: self.cog.card_gen.generate_card(
                        view.selected_account, 
                        acc_type, 
                        balance,
                        holder_name=rp_name 
                    )
                )
                
                if card_buffer:
                    files.append(discord.File(card_buffer, filename="debit_card.png"))

            await interaction.followup.send(embed=embed, view=view, files=files, ephemeral=True)
            
        except Exception as e:
            await interaction.followup.send(f"⚠️ An error occurred loading the dashboard: {e}", ephemeral=True)

    async def open_clerk_panel(self, interaction: discord.Interaction):
        if not self.is_clerk:
            return await interaction.response.send_message("❌ Access Denied.", ephemeral=True)
        
        await interaction.response.defer(ephemeral=True)
        view = ClerkPanelView(self.cog)
        await interaction.followup.send("🏦 **Bank Clerk Interface**", view=view, ephemeral=True)

    async def open_admin_panel(self, interaction: discord.Interaction):
        if not self.is_admin:
            return await interaction.response.send_message("❌ Access Denied.", ephemeral=True)
        
        await interaction.response.defer(ephemeral=True)
        view = AdminPanelView(self.cog)
        await interaction.followup.send("🛠️ **Bank Admin Interface**", view=view, ephemeral=True)