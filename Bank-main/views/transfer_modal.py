import discord
from discord.ui import Modal, TextInput, View, button
import logging
import yaml
from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING
from utils.logging_utils import log_transaction
from db.models import Account 

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logging.basicConfig(level=logging.INFO, handlers=[logging.StreamHandler(), logging.FileHandler('bot.log', encoding='utf-8')])
logger = logging.getLogger(__name__)

with open("config.yaml", "r", encoding="utf-8") as f:
    _cfg = yaml.safe_load(f)

BANK_NAME = _cfg.get("bank", {}).get("name", "Vance & Hamilton")

# --- TAX CONFIGURATION ---
# 1. 'withdrawal_tax_percent': The fee your bank keeps (e.g., 2.0)
# 2. 'gov_tax_cut_percent': The total system friction (Gov + API fees) (e.g., 0.26)

config_bank_fee = Decimal(str(_cfg.get("bank", {}).get("withdrawal_tax_percent", 0.0)))
config_system_tax = Decimal(str(_cfg.get("bank", {}).get("gov_tax_cut_percent", 0.0)))

# DEPOSIT SIDE:
# We assume the 'gov_tax_cut_percent' covers the entire hit on the deposit side.
SYSTEM_DEPOSIT_PCT = config_system_tax

# WITHDRAW SIDE:
# The user pays the Bank Fee + the System Tax
WITHDRAW_TAX_PCT = config_bank_fee + config_system_tax

def _fee_rates(bank_fee_pct: Decimal) -> dict:
    withdraw_tax_pct = bank_fee_pct + config_system_tax
    total_display_fee = withdraw_tax_pct + SYSTEM_DEPOSIT_PCT
    deposit_fee_rate = (SYSTEM_DEPOSIT_PCT / Decimal("100")).quantize(Decimal("0.0001"))
    withdraw_fee_rate = (withdraw_tax_pct / Decimal("100")).quantize(Decimal("0.0001"))
    return {
        "withdraw_tax_pct": withdraw_tax_pct,
        "total_display_fee": total_display_fee,
        "deposit_fee_rate": deposit_fee_rate,
        "withdraw_fee_rate": withdraw_fee_rate,
    }

def money(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

class TransferConfirmView(View):
    def __init__(
        self,
        cog: 'BankCog',
        invoker: discord.User,
        sender_account: str,
        recipient_account: str,
        target_amount: Decimal,
        pin: str,
        bank_fee_pct: Decimal,
    ):
        super().__init__(timeout=60)
        self.cog = cog 
        self.invoker = invoker
        self.sender = sender_account.lower().strip()
        self.recipient = recipient_account.lower().strip()
        self.target = money(target_amount)
        self.pin = pin
        self.message = None
        fee_info = _fee_rates(bank_fee_pct)
        self.deposit_fee_rate = fee_info["deposit_fee_rate"]
        self.withdraw_fee_rate = fee_info["withdraw_fee_rate"]

        # --- OPTION A: SENDER PAYS FEE ---
        # Goal: Recipient gets exactly self.target ($100.00)
        
        # 1. Gross up the Deposit to cover the System Tax (from config)
        self.gross_deposit_A = money(self.target / (Decimal("1") - self.deposit_fee_rate))
        
        # 2. Gross up the Withdraw to cover Bank Fee + System Tax (from config)
        self.withdraw_A = money(self.gross_deposit_A / (Decimal("1") - self.withdraw_fee_rate))
        
        # We send the Gross Deposit amount so the system takes its cut and leaves exactly the Target
        self.deposit_A = self.gross_deposit_A


        # --- OPTION B: DEDUCT FROM AMOUNT ---
        # Goal: Sender pays exactly self.target ($100.00)
        self.withdraw_B = self.target

        # 1. Tax the withdraw first
        after_withdraw_tax = self.withdraw_B * (Decimal("1") - self.withdraw_fee_rate)
        
        # 2. Tax the deposit second
        #    We just send the remaining cash, and the API takes its cut automatically.
        self.deposit_B = money(after_withdraw_tax)


    async def _do_transfer(self, interaction: discord.Interaction, withdraw_amt: Decimal, deposit_amt: Decimal):
        await interaction.response.defer(ephemeral=True, thinking=False)

        if self.sender == self.recipient:
            embed = discord.Embed(
                title=f"{BANK_NAME} • Transfer Error",
                description="You cannot transfer funds to the same account.",
                color=discord.Color.red()
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)

        # 1. Verify Sender & PIN
        sender_acc_obj = self.cog.db.get_account_by_name(self.sender)
        if not sender_acc_obj or not self.cog.verify_pin(sender_acc_obj, self.pin):
             embed = discord.Embed(
                title=f"{BANK_NAME} • Security Error",
                description="Invalid PIN entered. Transfer cancelled.",
                color=discord.Color.red()
            )
             return await interaction.followup.send(embed=embed, ephemeral=True)

        # 2. Verify Recipient Exists
        rec_info = await self.cog.api.get_account_details(self.recipient)
        if not rec_info:
            embed = discord.Embed(
                title=f"{BANK_NAME} • Recipient Error",
                description=f"The recipient account `{self.recipient}` does not exist.",
                color=discord.Color.red()
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)

        # 3. WITHDRAW
        withdraw_res = await self.cog.api.withdraw(self.sender, float(withdraw_amt))
        
        if not withdraw_res.get("success"):
            embed = discord.Embed(
                title=f"{BANK_NAME} • Withdrawal Failed",
                description=f"Unable to withdraw funds: {withdraw_res.get('message', 'Error')}",
                color=discord.Color.red()
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)

        # 4. DEPOSIT
        deposit_res = await self.cog.api.deposit(self.recipient, float(deposit_amt))
        
        if deposit_res.get("success"):
            # Calculate what the recipient ACTUALLY got (Net) for the logs
            # We use the config value here so the log calculator matches the real world
            actual_received = deposit_amt * (Decimal("1") - self.deposit_fee_rate)
            
            await log_transaction(interaction, self.sender, self.recipient, float(actual_received), "Transfer")
            
            self.cog.db.save_transaction(self.sender, {
                'amount': float(actual_received),
                'type': 'debit',
                'other_account': self.recipient,
                'description': "Transfer",
                'created_at': discord.utils.utcnow().isoformat()
            })
            
            embed = discord.Embed(
                title=f"{BANK_NAME} • Transfer Successful",
                description=f"Successfully transferred **${actual_received:.2f}** to `{self.recipient}`.",
                color=discord.Color.green()
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)
        else:
            # Refund if deposit fails
            refund_res = await self.cog.api.deposit(self.sender, float(withdraw_amt))
            embed = discord.Embed(
                title=f"{BANK_NAME} • Transfer Failed",
                description=(
                    f"Deposit to `{self.recipient}` failed.\n"
                    f"{'Refunded.' if refund_res.get('success') else 'CRITICAL: Refund failed. Contact Admin.'}"
                ),
                color=discord.Color.red()
            )
            return await interaction.followup.send(embed=embed, ephemeral=True)

    @button(label="A: Sender Pays Fee", style=discord.ButtonStyle.primary)
    async def option_a(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._do_transfer(interaction, self.withdraw_A, self.deposit_A)

    @button(label="B: Deduct From Amount", style=discord.ButtonStyle.secondary)
    async def option_b(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._do_transfer(interaction, self.withdraw_B, self.deposit_B)

    async def on_timeout(self):
        for item in self.children:
            item.disabled = True
        
        if self.message:
            embed = discord.Embed(
                title=f"{BANK_NAME} • Transfer Cancelled",
                description="Transfer confirmation timed out.",
                color=discord.Color.red()
            )
            try:
                await self.message.edit(embed=embed, view=self)
            except discord.NotFound:
                pass

class TransferModal(Modal, title=f"{BANK_NAME} • Transfer Funds"):
    def __init__(self, cog: 'BankCog', sender_account: str):
        super().__init__(timeout=300)
        self.cog = cog 
        self.sender_account = sender_account.lower().strip()
        self.recipient = TextInput(
            label="Recipient Account Name",
            placeholder="e.g., otherplayer",
            required=True
        )
        self.amount = TextInput(
            label="Amount to Transfer (USD)",
            placeholder="e.g., 100.00",
            required=True
        )
        self.pin = TextInput(
            label="Your 4-6 Digit PIN",
            placeholder="Required to authorize withdrawal",
            required=True,
            min_length=4,
            max_length=6,
            style=discord.TextStyle.short
        )

        self.add_item(self.recipient)
        self.add_item(self.amount)
        self.add_item(self.pin)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)

        recipient = self.recipient.value.strip().lower()
        if recipient == self.sender_account:
            embed = discord.Embed(title=f"{BANK_NAME} • Error", description="Cannot transfer to self.", color=discord.Color.red())
            return await interaction.followup.send(embed=embed, ephemeral=True)

        try:
            amt = money(Decimal(self.amount.value.replace(",", "").strip()))
        except Exception:
            embed = discord.Embed(title=f"{BANK_NAME} • Error", description="Invalid amount.", color=discord.Color.red())
            return await interaction.followup.send(embed=embed, ephemeral=True)

        if amt <= Decimal("0.00"):
            embed = discord.Embed(title=f"{BANK_NAME} • Error", description="Amount must be positive.", color=discord.Color.red())
            return await interaction.followup.send(embed=embed, ephemeral=True)

        sender_acc_obj = self.cog.db.get_account_by_name(self.sender_account)
        if sender_acc_obj and sender_acc_obj.custom_withdrawal_tax_percent is not None:
            bank_fee_pct = Decimal(str(sender_acc_obj.custom_withdrawal_tax_percent))
        else:
            bank_fee_pct = config_bank_fee

        fee_info = _fee_rates(bank_fee_pct)
        deposit_fee_rate = fee_info["deposit_fee_rate"]
        withdraw_fee_rate = fee_info["withdraw_fee_rate"]
        total_display_fee = fee_info["total_display_fee"]

        # --- PREVIEW CALCULATIONS (Matches View Logic) ---
        
        # Option A: Sender Pays
        gross_deposit_A = money(amt / (Decimal("1") - deposit_fee_rate))
        withdraw_A = money(gross_deposit_A / (Decimal("1") - withdraw_fee_rate))
        net_receive_A = amt

        # Option B: Deduct
        withdraw_B = amt
        after_withdraw_tax = withdraw_B * (Decimal("1") - withdraw_fee_rate)
        net_receive_B = money(after_withdraw_tax * (Decimal("1") - deposit_fee_rate))

        embed = discord.Embed(
            title=f"{BANK_NAME} • Confirm Transfer",
            description=(
                f"**From:** `{self.sender_account}`\n"
                f"**To:** `{recipient}`\n\n"
                f"**Transfer Fee:** {total_display_fee}%\n"
                f"Choose how to handle the fee:"
            ),
            color=discord.Color.blue()
        )
        embed.add_field(
            name="Option A — Sender pays fee",
            value=f"Withdraw: **${withdraw_A:.2f}**\nRecipient receives: **${net_receive_A:.2f}**",
            inline=False
        )
        embed.add_field(
            name="Option B — Deduct fee from amount",
            value=f"Withdraw: **${withdraw_B:.2f}**\nRecipient receives: **${net_receive_B:.2f}**",
            inline=False
        )

        view = TransferConfirmView(
            cog=self.cog,
            invoker=interaction.user,
            sender_account=self.sender_account,
            recipient_account=recipient,
            target_amount=amt,
            pin=self.pin.value.strip(),
            bank_fee_pct=bank_fee_pct
        )
        view.message = await interaction.followup.send(embed=embed, view=view, ephemeral=True)
