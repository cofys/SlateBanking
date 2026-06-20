# views/transactions_panel.py
import discord
import discord.ui as ui
from utils.cityrp_api import CityRPApi

class TransactionsPanelView(ui.View):
    def __init__(self, bot: discord.Client, discord_id: str, page: int = 1, transactions_per_page: int = 5):
        super().__init__(timeout=None)
        self.bot = bot
        self.discord_id = discord_id
        self.page = page
        self.transactions_per_page = transactions_per_page
        self.api = CityRPApi()

    async def fetch_transactions(self):
        try:
            # Fetch fresh transactions with pagination support
            transactions = await self.api.get_transactions(self.discord_id, page=self.page, per_page=self.transactions_per_page)
            return transactions
        except Exception as e:
            return []

    async def update_embed(self):
        transactions = await self.fetch_transactions()
        embed = discord.Embed(
            title="Transaction History",
            description="Your recent transactions.",
            color=discord.Color.blue()
        )
        if not transactions:
            embed.add_field(name="No Transactions", value="No transactions found.", inline=False)
        else:
            for tx in transactions:
                embed.add_field(
                    name=f"Transaction {tx.get('id', 'N/A')}",
                    value=(
                        f"**Type**: {tx.get('type', 'N/A')}\n"
                        f"**Amount**: ${tx.get('amount', 0):.2f}\n"
                        f"**Date**: {tx.get('date', 'N/A')}\n"
                        f"**Memo**: {tx.get('memo', 'None')}"
                    ),
                    inline=False
                )
        total_transactions = await self.api.get_transaction_count(self.discord_id)  # Assume API provides total count
        total_pages = max(1, (total_transactions + self.transactions_per_page - 1) // self.transactions_per_page)
        embed.set_footer(text=f"Page {self.page} of {total_pages}")
        return embed

    @ui.button(label="⬅️ Previous", style=discord.ButtonStyle.grey, disabled=True)
    async def previous_button(self, interaction: discord.Interaction, button: ui.Button):
        self.page = max(1, self.page - 1)
        embed = await self.update_embed()
        self.previous_button.disabled = self.page == 1
        transactions = await self.fetch_transactions()
        total_transactions = await self.api.get_transaction_count(self.discord_id)
        self.next_button.disabled = self.page * self.transactions_per_page >= total_transactions
        await interaction.response.edit_message(embed=embed, view=self)

    @ui.button(label="Next ➡️", style=discord.ButtonStyle.grey)
    async def next_button(self, interaction: discord.Interaction, button: ui.Button):
        self.page += 1
        embed = await self.update_embed()
        self.previous_button.disabled = self.page == 1
        transactions = await self.fetch_transactions()
        total_transactions = await self.api.get_transaction_count(self.discord_id)
        self.next_button.disabled = self.page * self.transactions_per_page >= total_transactions
        await interaction.response.edit_message(embed=embed, view=self)

    async def on_timeout(self):
        for item in self.children:
            item.disabled = True