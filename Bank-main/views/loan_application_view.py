import discord
from discord.ui import View, Button, Select
from db.models import LoanProduct
from typing import TYPE_CHECKING, List
from .loan_application_modal import LoanApplicationModal 

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog
    from .client_dashboard import ClientDashboardView

class ProductSelect(Select):
    """Dropdown menu to select a specific loan product."""
    def __init__(self, cog: 'BankCog', account_name: str, products: List[LoanProduct]):
        self.cog = cog
        self.account_name = account_name
        options = [
            discord.SelectOption(
                label=p.name,
                value=str(p.id),
                description=f"{p.term_weeks} Weeks @ {p.interest_rate*100:.1f}% Fee: {p.origination_fee_percent*100:.1f}%"
            ) for p in products
        ]
        
        super().__init__(placeholder="Select a loan product to apply for...", options=options, row=0)

    async def callback(self, interaction: discord.Interaction):
        product_id = int(self.values[0])
        product = self.cog.db.get_loan_product_by_id(product_id)
        
        if product:
            # Pass account_name and product to the dedicated modal file
            modal = LoanApplicationModal(self.cog, self.account_name, product)
            await interaction.response.send_modal(modal)
        else:
            await interaction.response.send_message("❌ Error: Loan product not found.", ephemeral=True)


class LoanApplicationView(View):
    """Main view for clients to browse and apply for loans."""
    def __init__(self, cog: 'BankCog', account_name: str, parent_view: View):
        super().__init__(timeout=300)
        self.cog = cog
        self.account_name = account_name
        self.parent_view: 'ClientDashboardView' = parent_view

        # Fetch all active loan products
        self.active_products = self.cog.db.get_active_loan_products()
        
        if not self.active_products:
            self.add_item(Button(label="No Active Loan Products Available", style=discord.ButtonStyle.grey, disabled=True, row=0))
        else:
            # Add product selection dropdown, passing the account name
            self.add_item(ProductSelect(self.cog, self.account_name, self.active_products))

        # FIX: Removed manual self.add_item calls for buttons below.
        # The @discord.ui.button decorator handles adding them automatically.

    @discord.ui.button(label="Back to Dashboard", style=discord.ButtonStyle.secondary, row=2)
    async def back_button(self, interaction: discord.Interaction, button: Button):
        # Return to the ClientDashboardView (which is the parent)
        # Regenerate the embed to keep data fresh
        embed = await self.parent_view.create_dashboard_embed()
        await interaction.response.edit_message(content=None, embed=embed, view=self.parent_view)

    @discord.ui.button(label="Open Support Ticket", style=discord.ButtonStyle.blurple, emoji="📧", row=2)
    async def ticket_button(self, interaction: discord.Interaction, button: Button):
        # Integration point for https://tickets.bot
        await interaction.response.send_message(
            "📧 **Loan Support:** Please open a ticket with the bot named `tickets.bot` for assistance with loan details or questions.", 
            ephemeral=True
        )