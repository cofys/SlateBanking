import discord
from discord.ui import Modal, TextInput
from db.models import LoanProduct
from typing import TYPE_CHECKING
import logging
import yaml

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('loan_modal')

# Load Config for Notification Channel
with open("config.yaml", "r") as f:
    cfg = yaml.safe_load(f)
REVIEW_CHANNEL_ID = cfg["discord"].get("review_channel_id")

class LoanApplicationModal(Modal, title="Loan Application Form"):
    def __init__(self, cog: 'BankCog', account_name: str, product: LoanProduct):
        super().__init__()
        self.cog = cog
        self.account_name = account_name
        self.product = product
        
        # Display Product Details in Modal Title/Placeholders
        self.amount = TextInput(
            label=f"Requested Amount (Min {product.min_amount:,.2f})",
            placeholder=f"Max: {product.max_amount:,.2f} | Rate: {product.interest_rate*100:.1f}%",
            required=True
        )
        self.purpose = TextInput(
            label="Purpose of Loan",
            style=discord.TextStyle.paragraph,
            required=True
        )
        self.collateral = TextInput(
            label="Collateral Offered (Optional)",
            placeholder="e.g., Vehicle VIN, House Address (Needed for large loans)",
            required=False
        )
        
        self.add_item(self.amount)
        self.add_item(self.purpose)
        self.add_item(self.collateral)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        try:
            amount_val = float(self.amount.value)
            
            # --- VALIDATION ---
            if amount_val <= 0 or amount_val < self.product.min_amount:
                return await interaction.followup.send(f"❌ Loan request must be a positive number and at least **${self.product.min_amount:,.2f}**.", ephemeral=True)
            if amount_val > self.product.max_amount:
                return await interaction.followup.send(f"❌ Loan request exceeds the maximum limit of **${self.product.max_amount:,.2f}** for this product.", ephemeral=True)
                
            # --- DATABASE OPERATION ---
            app = self.cog.db.create_loan_application(
                account_name=self.account_name,
                discord_id=str(interaction.user.id),
                product_id=self.product.id,
                amount=amount_val,
                purpose=self.purpose.value,
                collateral=self.collateral.value
            )
            
            # --- SUCCESS MESSAGE TO USER ---
            embed = discord.Embed(
                title="✅ Application Submitted",
                description=f"Your request for **${amount_val:,.2f}** for the **{self.product.name}** product has been submitted for review.\n\nStaff will process your application shortly.",
                color=discord.Color.green()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
            logger.info(f"Loan application submitted by {self.account_name} for ${amount_val}.")

            # --- STAFF NOTIFICATION ---
            if REVIEW_CHANNEL_ID:
                channel = self.cog.bot.get_channel(int(REVIEW_CHANNEL_ID))
                if channel:
                    staff_embed = discord.Embed(
                        title="🔔 New Loan Application",
                        description=f"**ID:** #{app.id}\n**Account:** `{self.account_name}`\n**Product:** {self.product.name}",
                        color=discord.Color.gold()
                    )
                    staff_embed.add_field(name="Amount", value=f"${amount_val:,.2f}", inline=True)
                    staff_embed.add_field(name="Applicant", value=f"<@{interaction.user.id}>", inline=True)
                    staff_embed.add_field(name="Purpose", value=self.purpose.value, inline=False)
                    staff_embed.set_footer(text="Go to the Bank Clerk Panel to review and approve.")
                    
                    await channel.send(embed=staff_embed)

        except ValueError:
            await interaction.followup.send("❌ Please enter a valid number for the amount.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error submitting loan application: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected error occurred. Please contact bank staff.", ephemeral=True)