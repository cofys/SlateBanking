import discord
from discord.ui import View, Button, Select, Modal, TextInput
from db.models import Database, Account, AccountMember, LoanProduct, LoanApplication, Loan, Transaction
from utils.cityrp_api import CityRPAPI
from utils.logging_utils import log_account_creation, log_transaction, log_account_deletion
from .business_panel import BusinessMgmtView
from typing import TYPE_CHECKING, List, Dict, Optional, Tuple
import logging
import yaml
from datetime import datetime, timedelta
import asyncio
import sqlite3
import bcrypt
import os
import re

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('admin_panel')

with open("config.yaml", "r") as f:
    cfg = yaml.safe_load(f)

BANK_NAME = cfg.get("bank", {}).get("name", "JPM")
CORP_NAME = cfg.get("bank", {}).get("corp_name")
LOGO_URL = cfg.get("bank", {}).get("logo_url", "")
THEME_COLOR = int(cfg["bank"].get("theme_color", "0x0A2351"), 16)
ANNOUNCEMENT_CHANNEL_ID = int(cfg["discord"].get("announcement_channel_id", 0))

# --- NEW: User-Facing PIN Reset Modal (For DM) ---
class UserSetPinModal(Modal):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(title=f"Set PIN for {account_name}")
        self.cog = cog
        self.account_name = account_name
        
        self.new_pin = TextInput(
            label="New 4-Digit PIN", 
            min_length=4, 
            max_length=4, 
            placeholder="1234", 
            required=True
        )
        self.confirm_pin = TextInput(
            label="Confirm New PIN", 
            min_length=4, 
            max_length=4, 
            placeholder="1234", 
            required=True
        )
        self.add_item(self.new_pin)
        self.add_item(self.confirm_pin)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        p1 = self.new_pin.value
        p2 = self.confirm_pin.value
        
        if p1 != p2:
            return await interaction.followup.send("❌ PINs do not match. Please try again.", ephemeral=True)
        
        if not p1.isdigit():
            return await interaction.followup.send("❌ PIN must contain numbers only.", ephemeral=True)

        try:
            # Hash the PIN
            salt = bcrypt.gensalt()
            hashed_pin = bcrypt.hashpw(p1.encode(), salt).decode()
            
            # Update DB
            success = self.cog.db.update_account_pin(self.account_name, hashed_pin)
            
            if success:
                embed = discord.Embed(
                    title="✅ PIN Updated",
                    description=f"The PIN for account **{self.account_name}** has been successfully reset.\nYou can now use this PIN to access your account.",
                    color=discord.Color.green()
                )
                await interaction.followup.send(embed=embed, ephemeral=True)
                logger.info(f"PIN reset successfully for {self.account_name} by user {interaction.user.id}")
            else:
                await interaction.followup.send("❌ Failed to update PIN in database.", ephemeral=True)
                
        except Exception as e:
            logger.error(f"Error resetting PIN for {self.account_name}: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected error occurred.", ephemeral=True)

# --- NEW: User-Facing DM View ---
class ResetPinDMView(View):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(timeout=300)
        self.cog = cog
        self.account_name = account_name

    @discord.ui.button(label="Set New PIN", style=discord.ButtonStyle.primary, emoji="🔑")
    async def set_pin_btn(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(UserSetPinModal(self.cog, self.account_name))

# --- LOAN PRODUCT COMPONENTS ---
class LoanProductSelect(Select):
    def __init__(self, options):
        super().__init__(placeholder="Select a product to edit or toggle...", options=options)
    
    async def callback(self, interaction: discord.Interaction):
        if self.view:
            self.view.selected_product_id = int(self.values[0])
        await interaction.response.defer()

class LoanProductModal(Modal, title="Configure Loan Product"):
    def __init__(self, cog: 'BankCog', product: LoanProduct = None):
        super().__init__(timeout=300)
        self.cog = cog
        self.product = product
        is_editing = product is not None
        
        self.product_name = TextInput(
            label="Product Name (e.g., Small Personal)",
            default=product.name if is_editing else "",
            placeholder="Required",
            required=True
        )
        self.interest_rate = TextInput(
            label="Weekly Interest Rate (Decimal)",
            default=str(product.interest_rate) if is_editing else "",
            placeholder="e.g., 0.025 for 2.5% Weekly",
            required=True
        )
        self.term_weeks = TextInput(
            label="Term in Weeks (e.g., 4, 12, 52)",
            default=str(product.term_weeks) if is_editing else "",
            placeholder="Required (e.g., 8)",
            required=True
        )
        self.origination_fee = TextInput(
            label="Origination Fee (Decimal)",
            default=str(product.origination_fee_percent) if is_editing else "0.00",
            placeholder="Optional (e.g., 0.02 for 2%)",
            required=False
        )
        self.max_amount = TextInput(
            label="Maximum Loan Amount ($)",
            default=str(getattr(product, 'max_amount', "10000.00")) if is_editing else "10000.00",
            placeholder="e.g., 50000.00",
            required=True
        )

        self.add_item(self.product_name)
        self.add_item(self.interest_rate)
        self.add_item(self.term_weeks)
        self.add_item(self.origination_fee)
        self.add_item(self.max_amount)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            name = self.product_name.value
            rate = float(self.interest_rate.value)
            term_weeks = int(self.term_weeks.value)
            fee = float(self.origination_fee.value or 0.0)
            max_amount = float(self.max_amount.value)

            if self.product:
                self.cog.db.update_loan_product(self.product.id, name, rate, term_weeks, fee, max_amount) 
                message = f"✅ Loan product **{name}** updated successfully.\nMax: ${max_amount:,.2f} | Rate: {rate*100:.1f}%"
            else:
                self.cog.db.create_loan_product(name, rate, term_weeks, fee, max_amount)
                message = f"✅ New loan product **{name}** created.\nMax: ${max_amount:,.2f} | Rate: {rate*100:.1f}%"

            await interaction.followup.send(content=message, view=LoanProductMgmtView(self.cog), ephemeral=True)
        except ValueError:
            await interaction.followup.send("❌ Invalid numeric input. Please check your numbers.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error submitting loan product modal: {e}", exc_info=True)
            await interaction.followup.send(f"❌ An error occurred: {e}", ephemeral=True)

class LoanProductMgmtView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=300)
        self.cog = cog
        self.products: List[LoanProduct] = self.cog.db.get_all_loan_products() 

        product_options = [
            discord.SelectOption(
                label=f"{p.name} (Max: ${getattr(p, 'max_amount', 10000.00):,.0f})",
                value=str(p.id),
                description=f"Rate: {p.interest_rate*100:.1f}% / {p.term_weeks} Wks | Status: {'Active' if p.is_active else 'Inactive'}"
            ) for p in self.products
        ]
        
        if product_options:
            self.add_item(LoanProductSelect(product_options))
        else:
             self.add_item(Button(label="No Products Found", style=discord.ButtonStyle.grey, disabled=True, row=0))

    @discord.ui.button(label="Create New Product", style=discord.ButtonStyle.success, row=1)
    async def create_new_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(LoanProductModal(self.cog))

    @discord.ui.button(label="Edit Selected Product", style=discord.ButtonStyle.primary, row=1)
    async def edit_button(self, interaction: discord.Interaction, button: Button):
        if not hasattr(self, 'selected_product_id'):
            await interaction.response.send_message("Please select a product first.", ephemeral=True)
            return
        product = self.cog.db.get_loan_product_by_id(self.selected_product_id)
        if product:
            await interaction.response.send_modal(LoanProductModal(self.cog, product))
        else:
            await interaction.response.send_message("Product not found.", ephemeral=True)

    @discord.ui.button(label="Toggle Status (Active/Inactive)", style=discord.ButtonStyle.danger, row=1)
    async def toggle_status_button(self, interaction: discord.Interaction, button: Button):
        if not hasattr(self, 'selected_product_id'):
            await interaction.response.send_message("Please select a product first.", ephemeral=True)
            return
        product = self.cog.db.get_loan_product_by_id(self.selected_product_id)
        if product:
            new_status = not product.is_active
            self.cog.db.update_loan_product_status(product.id, new_status) 
            await interaction.response.edit_message(content=f"✅ Product **{product.name}** is now **{'ACTIVE' if new_status else 'INACTIVE'}**.", view=LoanProductMgmtView(self.cog))
        else:
            await interaction.response.send_message("Product not found.", ephemeral=True)

    @discord.ui.button(label="« Back to Admin Menu", style=discord.ButtonStyle.secondary, row=2)
    async def back_to_admin(self, interaction: discord.Interaction, button: Button):
        await interaction.response.edit_message(content="Admin Menu", view=AdminPanelView(self.cog))

# --- HELPER MODALS (Deposit, Link, Edit, etc) ---

class DepositFixModal(Modal, title="💰 Manual Deposit Tool"):
    def __init__(self, cog: 'BankCog'):
        super().__init__()
        self.cog = cog
        self.account_name = TextInput(label="Recipient's Account Name", required=True)
        self.amount = TextInput(label="Amount to Deposit", required=True)
        self.add_item(self.account_name)
        self.add_item(self.amount)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            amount_to_deposit = float(self.amount.value)
            if amount_to_deposit <= 0:
                await interaction.followup.send("❌ Amount must be positive.", ephemeral=True)
                return
        except ValueError:
            await interaction.followup.send("❌ Please enter a valid number for the amount.", ephemeral=True)
            return

        account_name_val = self.account_name.value.lower()
        if not await self.cog.api.get_account_details(account_name_val):
            await interaction.followup.send(f"❌ The account `{account_name_val}` could not be found via the API.", ephemeral=True)
            return

        result = await self.cog.api.deposit(account_name_val, amount_to_deposit)
        if result["success"]:
            await log_transaction(interaction, "ADMIN ACTION", account_name_val, amount_to_deposit, "Admin Deposit Fix")
            embed = discord.Embed(title="✅ Deposit Successful", description=f"Successfully deposited **${amount_to_deposit:,.2f}** into `{account_name_val}`.", color=discord.Color.green())
            await interaction.followup.send(embed=embed, ephemeral=True)
        else:
            embed = discord.Embed(title="❌ Deposit Failed", description=f"**Reason:** {result.get('message', 'Unknown error.')}", color=discord.Color.red())
            await interaction.followup.send(embed=embed, ephemeral=True)

class DeleteAccountConfirmationView(View):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(timeout=60)
        self.cog = cog
        self.account_name = account_name

    @discord.ui.button(label="CONFIRM DELETION", style=discord.ButtonStyle.danger)
    async def confirm_delete(self, interaction: discord.Interaction, button: Button):
        await interaction.response.defer(ephemeral=True, thinking=True)
        
        account_details = await self.cog.api.get_account_details(self.account_name)
        if not account_details:
            await interaction.followup.send(f"❌ **API Error:** Could not fetch details for `{self.account_name}` to check balance. Aborting.", ephemeral=True)
            return
            
        balance = float(account_details.get('balance', 0.0))

        if balance > 0:
            logger.info(f"Account `{self.account_name}` has a balance of ${balance:,.2f}. Zeroing out before deletion.")
            zero_out_result = await self.cog.api.force_withdraw(self.account_name, balance)
            if not zero_out_result["success"]:
                await interaction.followup.send(f"❌ **API Error:** Failed to zero out the balance of `{self.account_name}`. Deletion aborted. Reason: {zero_out_result.get('message', 'Unknown')}", ephemeral=True)
                return
            logger.info(f"Successfully zeroed out balance for `{self.account_name}`.")

        api_deleted = await self.cog.api.delete_account(self.account_name)
        if not api_deleted["success"]: 
            await interaction.followup.send(f"❌ **API Error:** Failed to delete the in-game account `{self.account_name}`. The account balance was zeroed, but the final deletion failed. Reason: {api_deleted.get('message', 'Unknown')}", ephemeral=True)
            return

        session = self.cog.db.get_session()
        try:
            session.query(AccountMember).filter_by(account_name=self.account_name).delete()
            session.query(Account).filter_by(account_name=self.account_name).delete()
            session.commit()
            
            await log_account_deletion(interaction, self.account_name, interaction.user.id)
            success_message = f"✅ **Success!** Account `{self.account_name}` has been permanently deleted."
            if balance > 0:
                success_message += f"\n*A remaining balance of ${balance:,.2f} was transferred out before deletion.*"
            await interaction.followup.send(success_message, ephemeral=True)
        except Exception as e:
            logger.error(f"DB error during account deletion: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected database error occurred.", ephemeral=True)
        finally:
            session.close()
            
        for item in self.children:
            item.disabled = True
        await interaction.edit_original_response(view=self)

class AccountListPagination(View):
    def __init__(self, cog: 'BankCog', accounts: list):
        super().__init__(timeout=300)
        self.cog = cog
        self.accounts: List[Dict] = sorted(accounts, key=lambda x: x.get('name', ''))
        self.page = 0
        self.per_page = 10
        self.total_pages = (len(self.accounts) + self.per_page - 1) // self.per_page
        self.update_buttons()

    def update_buttons(self):
        self.children[0].disabled = self.page == 0
        self.children[1].disabled = (self.page + 1) >= self.total_pages

    def create_embed(self) -> discord.Embed:
        start_idx = self.page * self.per_page
        end_idx = start_idx + self.per_page
        current_accounts = self.accounts[start_idx:end_idx]
        embed = discord.Embed(title=f"🏦 All In-Game Accounts for {BANK_NAME}", color=THEME_COLOR)
        description = "".join([f"• `{acc.get('name', 'N/A')}` - **${float(acc.get('balance', 0.0)):,.2f}**\n" for acc in current_accounts]) or "No accounts found."
        embed.description = description
        embed.set_footer(text=f"Page {self.page + 1}/{self.total_pages} ({len(self.accounts)} total accounts)")
        return embed

    @discord.ui.button(label="⬅️ Previous", style=discord.ButtonStyle.grey)
    async def prev_button(self, interaction: discord.Interaction, button: Button):
        self.page -= 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.create_embed(), view=self)

    @discord.ui.button(label="➡️ Next", style=discord.ButtonStyle.grey)
    async def next_button(self, interaction: discord.Interaction, button: Button):
        self.page += 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.create_embed(), view=self)

class DbAccountPagination(View):
    def __init__(self, cog: 'BankCog', accounts: List[Account]):
        super().__init__(timeout=300)
        self.cog = cog
        self.accounts = accounts
        self.page = 0
        self.per_page = 10
        self.total_pages = (len(self.accounts) + self.per_page - 1) // self.per_page
        self.update_buttons()

    def update_buttons(self):
        self.children[0].disabled = self.page == 0
        self.children[1].disabled = (self.page + 1) >= self.total_pages

    async def get_page_embed(self) -> discord.Embed:
        start_idx = self.page * self.per_page
        end_idx = start_idx + self.per_page
        current_accounts = self.accounts[start_idx:end_idx]
        
        embed = discord.Embed(title=f"{BANK_NAME} Accounts (Database)", color=THEME_COLOR)
        desc = []
        
        api_tasks = [self.cog.api.get_account_details(acc.account_name) for acc in current_accounts]
        api_results = await asyncio.gather(*api_tasks)
        
        for acc, details in zip(current_accounts, api_results):
            balance = f"${float(details.get('balance', 0)):,.2f}" if details else "API Error"
            status = "❄️ Frozen" if acc.frozen else "✅ Active"
            user = f"<@{acc.discord_id}>" if acc.discord_id else "Unlinked"
            desc.append(f"**{acc.account_name}** ({acc.account_type.title()})\n- Owner: {user}\n- Balance: {balance}\n- Status: {status}")
            
        embed.description = "\n\n".join(desc)
        embed.set_footer(text=f"Page {self.page + 1}/{self.total_pages} ({len(self.accounts)} total)")
        return embed

    @discord.ui.button(label="⬅️ Previous", style=discord.ButtonStyle.grey)
    async def prev_button(self, interaction: discord.Interaction, button: Button):
        self.page -= 1
        self.update_buttons()
        await interaction.response.defer()
        embed = await self.get_page_embed()
        await interaction.edit_original_response(embed=embed, view=self)

    @discord.ui.button(label="➡️ Next", style=discord.ButtonStyle.grey)
    async def next_button(self, interaction: discord.Interaction, button: Button):
        self.page += 1
        self.update_buttons()
        await interaction.response.defer()
        embed = await self.get_page_embed()
        await interaction.edit_original_response(embed=embed, view=self)

class TransactionPagination(View):
    def __init__(self, cog: 'BankCog', interaction: discord.Interaction, account_name: str, transactions: list):
        super().__init__(timeout=180)
        self.cog = cog
        self.account_name = account_name
        self._normalize_transactions(transactions)
        self.page, self.per_page = 0, 5
        self.total_pages = (len(self.transactions) + self.per_page - 1) // self.per_page
        self.update_buttons()

    def _normalize_transactions(self, tx_list):
        normalized = []
        for tx in tx_list:
            if isinstance(tx, dict):
                normalized.append(tx)
            else:
                normalized.append({
                    "amount": tx.amount,
                    "type": tx.trans_type,
                    "timestamp": int(tx.timestamp.timestamp() * 1000),
                    "description": tx.description,
                    "afterBalance": None 
                })
        self.transactions = sorted(normalized, key=lambda x: x.get("timestamp", 0), reverse=True)

    def update_buttons(self):
        self.children[0].disabled = self.page == 0
        self.children[1].disabled = (self.page + 1) >= self.total_pages

    def create_transaction_embed(self) -> discord.Embed:
        start_idx, end_idx = self.page * self.per_page, (self.page + 1) * self.per_page
        current_transactions = self.transactions[start_idx:end_idx]
        embed = discord.Embed(title=f"📋 Transaction History for {self.account_name}", color=THEME_COLOR)
        if not current_transactions:
            embed.description = "No transactions found."
        else:
            for tx in current_transactions:
                sign = "🟢 +" if tx.get("type", "debit").lower() == "credit" else "🔴 -"
                amount = float(tx.get("amount", 0.0))
                timestamp_ms = tx.get("timestamp", 0)
                formatted_time = f"<t:{int(timestamp_ms / 1000)}:f>" if timestamp_ms else "N/A"
                balance_after = tx.get('afterBalance')
                balance_str = f"New Balance: **${float(balance_after):,.2f}**" if balance_after is not None else ""
                desc = tx.get("description", "")
                desc_str = f"\n*{desc}*" if desc else ""
                embed.add_field(name=f"{sign}${abs(amount):,.2f} on {formatted_time}", value=f"{balance_str}{desc_str}", inline=False)
        embed.set_footer(text=f"Page {self.page + 1}/{self.total_pages}")
        return embed

    @discord.ui.button(label="⬅️ Previous", style=discord.ButtonStyle.grey)
    async def prev_button(self, interaction: discord.Interaction, button: Button):
        self.page -= 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.create_transaction_embed(), view=self)

    @discord.ui.button(label="➡️ Next", style=discord.ButtonStyle.grey)
    async def next_button(self, interaction: discord.Interaction, button: Button):
        self.page += 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.create_transaction_embed(), view=self)

class SetGlobalFeesModal(Modal, title="⚙️ Set Global Account Fees"):
    def __init__(self, cog: 'BankCog'):
        super().__init__()
        self.cog = cog
        self.new_withdraw_fee = TextInput(label="New Withdrawal Fee (%)", placeholder="e.g., 1.5 for 1.5%", required=True)
        self.new_deposit_fee = TextInput(label="New Deposit Fee (%)", placeholder="e.g., 0.5 for 0.5%", required=True)
        self.add_item(self.new_withdraw_fee)
        self.add_item(self.new_deposit_fee)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            withdraw_fee, deposit_fee = float(self.new_withdraw_fee.value), float(self.new_deposit_fee.value)
        except ValueError:
            return await interaction.followup.send("❌ Invalid input. Please enter valid numbers.", ephemeral=True)

        session = self.cog.db.get_session()
        accounts = [row.account_name for row in session.query(Account).all()]
        session.close()

        tasks = [self.cog.api.set_account_fee(name, fee_type, fee) for name in accounts for fee_type, fee in [('withdraw', withdraw_fee), ('deposit', deposit_fee)]]
        results = await asyncio.gather(*tasks)
        successful_updates = sum(1 for i in range(0, len(results), 2) if results[i] and results[i+1])
        failed_updates = len(accounts) - successful_updates

        try:
            with open('config.yaml', 'r') as f: config_data = yaml.safe_load(f)
            config_data['bank']['withdrawal_tax_percent'] = withdraw_fee
            config_data['bank']['deposit_tax_percent'] = deposit_fee
            with open('config.yaml', 'w') as f: yaml.dump(config_data, f, sort_keys=False)
            config_updated = True
        except Exception as e:
            logger.error(f"Failed to update config.yaml: {e}", exc_info=True)
            config_updated = False

        embed = discord.Embed(title="✅ Fee Update Complete", color=discord.Color.green())
        embed.add_field(name="Accounts Updated", value=str(successful_updates))
        embed.add_field(name="Failed Updates", value=str(failed_updates))
        embed.add_field(name="Config Updated", value="✅ Yes" if config_updated else "❌ No")
        embed.set_footer(text=f"New Defaults: {withdraw_fee}% Withdraw / {deposit_fee}% Deposit")
        await interaction.followup.send(embed=embed, ephemeral=True)

class LinkAccountModal(Modal):
    def __init__(self, cog: 'BankCog'):
        super().__init__(title="Manually Link Account")
        self.cog = cog
        self.account_name = TextInput(label="In-Game Account Name", required=True)
        self.discord_id = TextInput(label="User's Discord ID", required=True)
        self.account_type = TextInput(label="Account Type", placeholder="personal or business", required=True)
        self.add_item(self.account_name)
        self.add_item(self.discord_id)
        self.add_item(self.account_type)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        account_name_val, discord_id_val, account_type_val = self.account_name.value.lower(), self.discord_id.value, self.account_type.value.lower()

        if account_type_val not in ['personal', 'business']:
            return await interaction.followup.send("❌ **Error:** Type must be 'personal' or 'business'.", ephemeral=True)
        
        if not await self.cog.api.get_account_details(account_name_val):
            return await interaction.followup.send(f"❌ **Error:** In-Game account `{account_name_val}` not found.", ephemeral=True)

        session = self.cog.db.get_session()
        try:
            session.merge(Account(account_name=account_name_val, discord_id=discord_id_val, account_type=account_type_val, verified=True))
            session.commit()
            await log_account_creation(interaction, account_name_val, "N/A", "N/A", interaction.user.id, "Admin Manual Link")
            await interaction.followup.send(f"✅ **Success!** `{account_name_val}` linked.", ephemeral=True)
        except Exception as e:
            logger.error(f"DB error during manual link: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected database error occurred.", ephemeral=True)
        finally:
            session.close()

class EditAccountModal(Modal):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(title=f"Editing Account: {account_name}")
        self.cog = cog
        self.account_name = account_name
        session = self.cog.db.get_session()
        data = session.query(Account).filter_by(account_name=account_name).first()
        session.close()
        
        self.rp_name = TextInput(label="RP Name", default=data.rp_name, required=True)
        self.mc_username = TextInput(label="Minecraft Username", default=data.mc_username, required=True)
        self.discord_id = TextInput(label="Discord ID", default=data.discord_id, required=True)
        self.account_type = TextInput(label="Account Type (personal/business)", default=data.account_type, required=True)
        self.verified = TextInput(label="Verified? (true/false)", default=str(data.verified).lower(), required=True)
        tax_default = "" if data.custom_withdrawal_tax_percent is None else str(data.custom_withdrawal_tax_percent)
        self.custom_withdraw_tax = TextInput(
            label="Custom Withdraw Tax (%)",
            placeholder="Leave blank to use default",
            default=tax_default,
            required=False
        )

        self.add_item(self.rp_name)
        self.add_item(self.mc_username)
        self.add_item(self.discord_id)
        self.add_item(self.account_type)
        self.add_item(self.verified)
        self.add_item(self.custom_withdraw_tax)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        account_type_val = self.account_type.value.lower()
        if account_type_val not in ['personal', 'business']:
            return await interaction.followup.send("❌ **Error:** Type must be 'personal' or 'business'.", ephemeral=True)
        
        verified_val = self.verified.value.lower() in ['true', '1', 'yes', 't']
        custom_tax_raw = self.custom_withdraw_tax.value.strip()
        custom_tax_val = None
        if custom_tax_raw:
            try:
                custom_tax_val = float(custom_tax_raw)
                if custom_tax_val < 0 or custom_tax_val >= 100:
                    raise ValueError
            except ValueError:
                return await interaction.followup.send("❌ **Error:** Custom tax must be a number between 0 and 100.", ephemeral=True)

        session = self.cog.db.get_session()
        try:
            account = session.query(Account).filter_by(account_name=self.account_name).first()
            if account:
                account.rp_name = self.rp_name.value
                account.mc_username = self.mc_username.value
                account.discord_id = self.discord_id.value
                account.account_type = account_type_val
                account.verified = verified_val
                account.custom_withdrawal_tax_percent = custom_tax_val
                session.commit()
            
            await interaction.followup.send(f"✅ Account `{self.account_name}` updated.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error updating account {self.account_name}: {e}", exc_info=True)
            await interaction.followup.send("❌ An error occurred.", ephemeral=True)
        finally:
            session.close()

class ForceWithdrawalModal(Modal):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__(title=f"Force Withdrawal: {account_name}")
        self.cog = cog
        self.account_name = account_name
        self.amount = TextInput(label="Amount to Withdraw", required=True)
        self.add_item(self.amount)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            amount = float(self.amount.value)
            result = await self.cog.api.force_withdraw(self.account_name, amount)
            if result["success"]:
                await log_transaction(interaction, self.account_name, CORP_NAME, amount, "Admin Force Withdrawal")
                embed = discord.Embed(title="✅ Withdrawal Successful", description=result["message"], color=discord.Color.green())
            else:
                embed = discord.Embed(title="❌ Withdrawal Failed", description=result["message"], color=discord.Color.red())
            await interaction.followup.send(embed=embed, ephemeral=True)
        except ValueError:
            await interaction.followup.send("❌ Invalid amount.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error in force withdrawal for {self.account_name}: {e}", exc_info=True)
            await interaction.followup.send("❌ An unexpected error occurred.", ephemeral=True)

class AnnounceModal(Modal, title="📢 Create Bank Announcement"):
    message = TextInput(label="Announcement Message", style=discord.TextStyle.paragraph, required=True)
    async def on_submit(self, interaction: discord.Interaction):
        channel = interaction.guild.get_channel(ANNOUNCEMENT_CHANNEL_ID) if ANNOUNCEMENT_CHANNEL_ID else None
        if not channel:
            return await interaction.response.send_message("❌ Announcement channel not configured or found.", ephemeral=True)
        embed = discord.Embed(title=f"📢 {BANK_NAME} Announcement", description=self.message.value, color=THEME_COLOR)
        if LOGO_URL: embed.set_thumbnail(url=LOGO_URL)
        embed.set_footer(text=f"Announced by {interaction.user.display_name}")
        await channel.send(embed=embed)
        await interaction.response.send_message("✅ Announcement sent.", ephemeral=True)

# --- Admin Account Action Modal (Updated with Reset PIN) ---
class AdminAccountActionModal(Modal, title="Admin Account Action"):
    def __init__(self, cog: 'BankCog', action: str):
        super().__init__()
        self.cog = cog
        self.action = action
        self.account_name = TextInput(label="Enter Account Name", required=True)
        self.add_item(self.account_name)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        account_name = self.account_name.value.lower()
        
        if self.action == "delete":
            embed = discord.Embed(
                title="⚠️ Confirm Account Deletion",
                description=f"You are about to permanently delete the account `{account_name}`.\n\n**This action is irreversible.**",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, view=DeleteAccountConfirmationView(self.cog, account_name), ephemeral=True)
            
        elif self.action == "withdraw":
            view = View()
            btn = Button(label="Proceed to Withdraw", style=discord.ButtonStyle.danger)
            async def btn_callback(inter: discord.Interaction):
                await inter.response.send_modal(ForceWithdrawalModal(self.cog, account_name))
            btn.callback = btn_callback
            view.add_item(btn)
            await interaction.followup.send(f"Ready to force withdraw from `{account_name}`.", view=view, ephemeral=True)

        elif self.action == "edit":
            session = self.cog.db.get_session()
            exists = session.query(Account).filter_by(account_name=account_name).first()
            session.close()
            
            if not exists:
                return await interaction.followup.send(f"❌ Account `{account_name}` not found in database.", ephemeral=True)
                
            view = View()
            btn = Button(label="Edit Account Details", style=discord.ButtonStyle.primary)
            async def btn_callback(inter: discord.Interaction):
                await inter.response.send_modal(EditAccountModal(self.cog, account_name))
            btn.callback = btn_callback
            view.add_item(btn)
            await interaction.followup.send(f"Account `{account_name}` found.", view=view, ephemeral=True)

        elif self.action == "freeze":
            session = self.cog.db.get_session()
            try:
                account = session.query(Account).filter_by(account_name=account_name).first()
                if account:
                    new_status = not account.frozen
                    account.frozen = new_status
                    session.commit()
                    await interaction.followup.send(f"✅ Account `{account_name}` is now **{'frozen' if new_status else 'unfrozen'}**.", ephemeral=True)
                else:
                    await interaction.followup.send(f"❌ Account `{account_name}` not found in database.", ephemeral=True)
            finally:
                session.close()

        elif self.action == "transactions":
            transactions = self.cog.db.get_transactions(account_name)
            if not transactions:
                transactions_api_data = await self.cog.api.get_transactions(account_name)
                if not transactions_api_data:
                    return await interaction.followup.send("ℹ️ No transactions found (DB or API).", ephemeral=True)
                transactions = transactions_api_data.get('transactions', [])
            
            view = TransactionPagination(self.cog, interaction, account_name, transactions)
            await interaction.followup.send(embed=view.create_transaction_embed(), view=view, ephemeral=True)

        # --- NEW: Reset PIN Logic ---
        elif self.action == "reset_pin":
            account = self.cog.db.get_account_by_name(account_name)
            if not account or not account.discord_id:
                return await interaction.followup.send(f"❌ Account `{account_name}` not found or has no linked Discord ID.", ephemeral=True)
            
            try:
                user = await self.cog.bot.fetch_user(int(account.discord_id))
                if user:
                    embed = discord.Embed(
                        title="🔑 PIN Reset Requested",
                        description=f"An admin has requested a PIN reset for your account **{account_name}**.\nClick the button below to set a new PIN.",
                        color=discord.Color.orange()
                    )
                    await user.send(embed=embed, view=ResetPinDMView(self.cog, account_name))
                    await interaction.followup.send(f"✅ Reset link sent to <@{account.discord_id}> via DM.", ephemeral=True)
                else:
                    await interaction.followup.send("❌ Could not find the Discord user to send the DM.", ephemeral=True)
            except Exception as e:
                logger.error(f"Failed to send DM for PIN reset: {e}")
                await interaction.followup.send(f"❌ Failed to DM user: {e}", ephemeral=True)

# --- Report Period Select Menu ---
class ReportPeriodSelect(Select):
    def __init__(self, cog: 'BankCog'):
        self.cog = cog
        
        options = []
        db_path = 'bank_data.db'
        if not os.path.exists(db_path) and os.path.exists('/data/bank.db'): db_path = '/data/bank.db'
        
        try:
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT DISTINCT strftime('%Y-%m-01', created_at) as m FROM corp_transactions WHERE created_at IS NOT NULL ORDER BY m DESC LIMIT 12")
            months = [row[0] for row in c.fetchall() if row[0]]
            conn.close()
        except:
            months = []
            
        if not months:
            today = datetime.utcnow()
            for i in range(3):
                month_date = today - timedelta(days=i*30)
                months.append(month_date.replace(day=1).strftime('%Y-%m-%d'))
                
        for i, m_str in enumerate(months):
            dt = datetime.strptime(m_str, '%Y-%m-%d')
            label = dt.strftime('%B %Y')
            desc = "Latest Data" if i == 0 else "Past Month"
            emoji = "📅" if i == 0 else "🗄️"
            options.append(discord.SelectOption(label=label, value=m_str, description=desc, emoji=emoji))

        super().__init__(placeholder="Select Report Period...", min_values=1, max_values=1, options=options)

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        selected_date_str = self.values[0]
        selected_date = datetime.strptime(selected_date_str, '%Y-%m-%d')
        
        # Generate the report for the selected month
        await self.view.generate_report(interaction, selected_date)

class IncludeAccountsToggle(Button):
    def __init__(self):
        super().__init__(style=discord.ButtonStyle.secondary, label="Include Accounts List: OFF", emoji="📋", row=1)
        
    async def callback(self, interaction: discord.Interaction):
        self.view.include_accounts = not self.view.include_accounts
        if self.view.include_accounts:
            self.style = discord.ButtonStyle.success
            self.label = "Include Accounts List: ON"
        else:
            self.style = discord.ButtonStyle.secondary
            self.label = "Include Accounts List: OFF"
        await interaction.response.edit_message(view=self.view)

class MoEAReportView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=900)
        self.cog = cog
        self.include_accounts = False
        self.add_item(ReportPeriodSelect(cog))
        self.add_item(IncludeAccountsToggle())

    def _parse_tx_timestamp(self, tx: dict) -> Optional[datetime]:
        ts = tx.get('timestamp') or tx.get('created_at')
        if ts is None:
            return None
        if isinstance(ts, (int, float)) or (isinstance(ts, str) and ts.replace('.', '', 1).isdigit()):
            value = float(ts)
            if value > 100000000000:
                value /= 1000
            return datetime.utcfromtimestamp(value)
        if isinstance(ts, str):
            try:
                return datetime.fromisoformat(ts.replace('Z', '+00:00')).replace(tzinfo=None)
            except ValueError:
                try:
                    return datetime.strptime(ts, '%Y-%m-%d %H:%M:%S')
                except ValueError:
                    return None
        return None

    async def _get_account_net_since(self, account_name: str, earliest_cutoff: datetime, latest_cutoff: datetime) -> Tuple[float, float]:
        net_since_earliest = 0.0
        net_since_latest = 0.0
        
        try:
            db_path = 'bank_data.db'
            if not os.path.exists(db_path) and os.path.exists('/data/bank.db'): db_path = '/data/bank.db'
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            
            c.execute("SELECT amount, created_at FROM corp_transactions WHERE description LIKE ?", (f"% - {account_name}%",))
            rows = c.fetchall()
            conn.close()

            for amount, created_at in rows:
                if not created_at: continue
                # Parse timestamp using existing parser
                tx_dt = self._parse_tx_timestamp({'created_at': created_at})
                if not tx_dt: continue
                
                if tx_dt >= earliest_cutoff:
                    amt = float(amount or 0)
                    
                    net_since_earliest += amt
                    if tx_dt >= latest_cutoff:
                        net_since_latest += amt

        except Exception as e:
            logger.error(f"DB Error in _get_account_net_since for account {account_name}: {e}")

        return net_since_earliest, net_since_latest

    def _loan_interest_for_period(self, session, start_dt: datetime, end_dt: datetime) -> Tuple[float, float]:
        loan_payments = session.query(Transaction).filter(
            Transaction.timestamp >= start_dt,
            Transaction.timestamp < end_dt,
            Transaction.description.ilike('%Loan #%')
        ).all()

        interest_total = 0.0
        payment_total = 0.0

        for payment in loan_payments:
            amount = abs(payment.amount or 0)
            payment_total += amount
            match = re.search(r'Loan #(\d+)', payment.description or '')
            if not match:
                interest_total += amount
                continue

            loan_id = int(match.group(1))
            loan = session.query(Loan).filter_by(id=loan_id).first()
            if not loan or not loan.total_due or loan.amount is None:
                interest_total += amount
                continue

            total_interest = max(loan.total_due - loan.amount, 0.0)
            ratio = total_interest / loan.total_due if loan.total_due else 0.0
            interest_total += amount * ratio

        return interest_total, payment_total

    def _format_money(self, amount: float) -> str:
        return f"${amount:,.2f}"

    def _format_pct(self, value: float) -> str:
        return f"{value:.2f}%"

    async def generate_report(self, interaction: discord.Interaction, report_start_date: datetime):
        session = self.cog.db.get_session()
        conn = None
        
        try:
            # --- 1. DATE MATH ---
            # Calculate Report Month End (Start of next month)
            if report_start_date.month == 12:
                report_end_date = report_start_date.replace(year=report_start_date.year + 1, month=1)
            else:
                report_end_date = report_start_date.replace(month=report_start_date.month + 1)
            
            # Comparison Month (The month before the selected month)
            if report_start_date.month == 1:
                prev_start_date = report_start_date.replace(year=report_start_date.year - 1, month=12)
            else:
                prev_start_date = report_start_date.replace(month=report_start_date.month - 1)
            prev_end_date = report_start_date

            # Strings
            d_curr_start = report_start_date.strftime('%Y-%m-%d')
            d_curr_end = report_end_date.strftime('%Y-%m-%d')
            d_prev_start = prev_start_date.strftime('%Y-%m-%d')
            d_prev_end = prev_end_date.strftime('%Y-%m-%d')
            
            str_curr = report_start_date.strftime('%b')
            str_prev = prev_start_date.strftime('%b')

            loan_pool_name = cfg["bank"].get("loan_pool", "loans").lower()

            # --- 2. ASSETS (Snapshot - always current) ---
            corp_data = await self.cog.api.get_corp_details()
            corp_balance = float(corp_data.get('balance', 0)) if corp_data else 0.0
            loan_pool_data = await self.cog.api.get_account_details(loan_pool_name)
            loan_pool_balance = float(loan_pool_data.get('balance', 0)) if loan_pool_data else 0.0
            all_corp_accounts = await self.cog.api.get_all_corp_accounts()

            # --- 3. CONNECT DB ---
            db_path = 'bank_data.db'
            if not os.path.exists(db_path) and os.path.exists('/data/bank.db'): db_path = '/data/bank.db'
            conn = sqlite3.connect(db_path)
            c = conn.cursor()

            # --- 4. BALANCE SNAPSHOTS (END OF MONTH) ---
            def sum_corp_activity_since(cutoff: datetime) -> float:
                cutoff_str = cutoff.strftime('%Y-%m-%d %H:%M:%S')
                try:
                    c.execute("SELECT SUM(amount) FROM corp_transactions WHERE created_at >= ?", (cutoff_str,))
                    return float(c.fetchone()[0] or 0.0)
                except Exception:
                    return 0.0

            corp_net_since_prev = sum_corp_activity_since(prev_end_date)
            corp_net_since_curr = sum_corp_activity_since(report_end_date)
            corp_balance_prev = corp_balance - corp_net_since_prev
            corp_balance_curr = corp_balance - corp_net_since_curr

            def sum_loan_pool_activity_since(cutoff: datetime) -> float:
                cutoff_str = cutoff.strftime('%Y-%m-%d %H:%M:%S')
                try:
                    c.execute(
                        "SELECT SUM(amount) FROM client_transactions WHERE account_name = ? AND created_at >= ?",
                        (loan_pool_name, cutoff_str)
                    )
                    return float(c.fetchone()[0] or 0.0)
                except Exception:
                    return 0.0

            loan_pool_net_since_prev = sum_loan_pool_activity_since(prev_end_date)
            loan_pool_net_since_curr = sum_loan_pool_activity_since(report_end_date)
            loan_pool_balance_prev = loan_pool_balance - loan_pool_net_since_prev
            loan_pool_balance_curr = loan_pool_balance - loan_pool_net_since_curr

            total_liquid_cash_prev = corp_balance_prev + loan_pool_balance_prev
            total_liquid_cash_curr = corp_balance_curr + loan_pool_balance_curr

            # --- 5. CLIENT ACTIVITY (LOCAL LEDGER) ---
            loan_pool_net_since_prev, loan_pool_net_since_curr = await self._get_account_net_since(
                loan_pool_name,
                prev_end_date,
                report_end_date
            )
            loan_pool_balance_prev = loan_pool_balance - loan_pool_net_since_prev
            loan_pool_balance_curr = loan_pool_balance - loan_pool_net_since_curr

            total_liquid_cash_prev = corp_balance_prev + loan_pool_balance_prev
            total_liquid_cash_curr = corp_balance_curr + loan_pool_balance_curr

            total_deposits_prev = 0.0
            total_deposits_curr = 0.0
            for acc in all_corp_accounts:
                acc_name = acc.get('name', '').lower()
                if not acc_name or acc_name == loan_pool_name:
                    continue
                try:
                    acc_balance = float(acc.get('balance', 0))
                    acc_net_since_prev, acc_net_since_curr = await self._get_account_net_since(
                        acc_name,
                        prev_end_date,
                        report_end_date
                    )
                    total_deposits_prev += acc_balance - acc_net_since_prev
                    total_deposits_curr += acc_balance - acc_net_since_curr
                except Exception:
                    total_deposits_prev += float(acc.get('balance', 0))
                    total_deposits_curr += float(acc.get('balance', 0))

            # --- 5. INCOME (FEES + LOAN INTEREST) ---
            fee_condition = "(category = 'fee' OR LOWER(description) LIKE '%fee%' OR LOWER(description) LIKE '%tax%')"
            not_fee_condition = "((category != 'fee' OR category IS NULL) AND LOWER(description) NOT LIKE '%fee%' AND LOWER(description) NOT LIKE '%tax%')"
            
            try:
                c.execute(f"SELECT SUM(amount) FROM corp_transactions WHERE {fee_condition} AND created_at >= ? AND created_at < ?", (d_curr_start, d_curr_end))
                curr_fees = c.fetchone()[0] or 0.0
                c.execute(f"SELECT SUM(amount) FROM corp_transactions WHERE {fee_condition} AND created_at >= ? AND created_at < ?", (d_prev_start, d_prev_end))
                prev_fees = c.fetchone()[0] or 0.0
            except Exception as e:
                logger.error(f"Error fetching fees: {e}")
                curr_fees, prev_fees = 0.0, 0.0

            curr_int, _ = self._loan_interest_for_period(session, report_start_date, report_end_date)
            prev_int, _ = self._loan_interest_for_period(session, prev_start_date, prev_end_date)

            # --- 6. CLIENT ACTIVITY ---
            try:
                wd_fee_pct_base = float(cfg["bank"].get("withdrawal_tax_percent", 0.0)) + float(cfg["bank"].get("gov_tax_cut_percent", 0.0))
                dep_fee_pct_base = float(cfg["bank"].get("deposit_tax_percent", 0.0)) + float(cfg["bank"].get("gov_tax_cut_percent", 0.0))

                # Withdrawals (Estimated via Fees)
                c.execute(
                    f"SELECT description, amount FROM corp_transactions "
                    f"WHERE category = 'fee' AND LOWER(description) LIKE '%(withdraw)%' "
                    f"AND created_at >= ? AND created_at < ?",
                    (d_curr_start, d_curr_end)
                )
                wd_fees = c.fetchall()
                curr_wd_count = len(wd_fees)
                estimated_wd_total = 0.0
                for desc, amt in wd_fees:
                    parts = desc.split(' - ')
                    acc_name = parts[-1].strip() if len(parts) > 1 else None
                    fee_pct = wd_fee_pct_base
                    if acc_name:
                        acc = session.query(Account).filter_by(account_name=acc_name.lower()).first()
                        if acc and acc.custom_withdrawal_tax_percent is not None:
                            fee_pct = float(acc.custom_withdrawal_tax_percent) + float(cfg["bank"].get("gov_tax_cut_percent", 0.0))
                    
                    if fee_pct > 0:
                        estimated_wd_total += abs(amt) / (fee_pct / 100.0)
                
                curr_wd_total = estimated_wd_total

                # Deposits (Estimated via Fees + Any Non-Fee direct positive transfers)
                c.execute(
                    f"SELECT description, amount FROM corp_transactions "
                    f"WHERE category = 'fee' AND LOWER(description) LIKE '%(deposit)%' "
                    f"AND created_at >= ? AND created_at < ?",
                    (d_curr_start, d_curr_end)
                )
                dep_fees = c.fetchall()
                curr_dep_count = len(dep_fees)
                estimated_dep_total = 0.0
                for desc, amt in dep_fees:
                    parts = desc.split(' - ')
                    acc_name = parts[-1].strip() if len(parts) > 1 else None
                    fee_pct = dep_fee_pct_base
                    if fee_pct > 0:
                        estimated_dep_total += abs(amt) / (fee_pct / 100.0)

                # Add direct non-fee positive transactions (excluding loans)
                c.execute(
                    f"SELECT COUNT(*), SUM(amount) FROM corp_transactions "
                    f"WHERE amount > 0 AND category != 'fee' AND description NOT LIKE ? AND description NOT LIKE '%Fee%' AND description NOT LIKE '%Tax%' "
                    f"AND created_at >= ? AND created_at < ?",
                    (f"% - {loan_pool_name}%", d_curr_start, d_curr_end)
                )
                row = c.fetchone()
                if row[0]:
                    curr_dep_count += row[0]
                    estimated_dep_total += row[1] or 0.0

                curr_dep_total = estimated_dep_total

                # PREVIOUS MONTH Withdrawals (Estimated via Fees)
                c.execute(
                    f"SELECT description, amount FROM corp_transactions "
                    f"WHERE category = 'fee' AND LOWER(description) LIKE '%(withdraw)%' "
                    f"AND created_at >= ? AND created_at < ?",
                    (d_prev_start, d_prev_end)
                )
                p_wd_fees = c.fetchall()
                prev_wd_count = len(p_wd_fees)
                p_estimated_wd_total = 0.0
                for desc, amt in p_wd_fees:
                    parts = desc.split(' - ')
                    acc_name = parts[-1].strip() if len(parts) > 1 else None
                    fee_pct = wd_fee_pct_base
                    if acc_name:
                        acc = session.query(Account).filter_by(account_name=acc_name.lower()).first()
                        if acc and acc.custom_withdrawal_tax_percent is not None:
                            fee_pct = float(acc.custom_withdrawal_tax_percent) + float(cfg["bank"].get("gov_tax_cut_percent", 0.0))
                    
                    if fee_pct > 0:
                        p_estimated_wd_total += abs(amt) / (fee_pct / 100.0)
                
                prev_wd_total = p_estimated_wd_total

                # PREVIOUS MONTH Deposits (Estimated via Fees + Any Non-Fee)
                c.execute(
                    f"SELECT description, amount FROM corp_transactions "
                    f"WHERE category = 'fee' AND LOWER(description) LIKE '%(deposit)%' "
                    f"AND created_at >= ? AND created_at < ?",
                    (d_prev_start, d_prev_end)
                )
                p_dep_fees = c.fetchall()
                prev_dep_count = len(p_dep_fees)
                p_estimated_dep_total = 0.0
                for desc, amt in p_dep_fees:
                    fee_pct = dep_fee_pct_base
                    if fee_pct > 0:
                        p_estimated_dep_total += abs(amt) / (fee_pct / 100.0)

                c.execute(
                    f"SELECT COUNT(*), SUM(amount) FROM corp_transactions "
                    f"WHERE amount > 0 AND category != 'fee' AND description NOT LIKE ? AND description NOT LIKE '%Fee%' AND description NOT LIKE '%Tax%' "
                    f"AND created_at >= ? AND created_at < ?",
                    (f"% - {loan_pool_name}%", d_prev_start, d_prev_end)
                )
                row = c.fetchone()
                if row[0]:
                    prev_dep_count += row[0]
                    p_estimated_dep_total += row[1] or 0.0

                prev_dep_total = p_estimated_dep_total
            except Exception as e:
                logger.error(f"Error fetching client transactions: {e}")
                curr_dep_count = curr_wd_count = prev_dep_count = prev_wd_count = 0
                curr_dep_total = curr_wd_total = prev_dep_total = prev_wd_total = 0.0

            curr_net_flow = curr_dep_total - curr_wd_total
            prev_net_flow = prev_dep_total - prev_wd_total

            curr_int, _ = self._loan_interest_for_period(session, report_start_date, report_end_date)
            prev_int, _ = self._loan_interest_for_period(session, prev_start_date, prev_end_date)
            # --- 7. LOAN PORTFOLIO ---
            all_loans = session.query(Loan).filter_by(is_active=True).all()
            loan_by_category = {
                "Business Loans": [],
                "Personal Loans": [],
                "Real Estate Mortgages": [],
                "Other": []
            }
            report_end_date_only = report_end_date.date()

            for loan in all_loans:
                account = session.query(Account).filter_by(account_name=loan.account_name).first()
                if account and account.account_type == 'business':
                    loan_by_category["Business Loans"].append(loan)
                elif account and account.account_type == 'personal':
                    loan_by_category["Personal Loans"].append(loan)
                else:
                    loan_by_category["Other"].append(loan)

            def summarize_loans(loans: List[Loan]) -> Tuple[float, float, float]:
                total_balance = sum(l.remaining_amount for l in loans)
                if total_balance <= 0:
                    return 0.0, 0.0, 0.0
                weighted_rate = sum(l.remaining_amount * l.interest_rate for l in loans) / total_balance
                npl_balance = sum(l.remaining_amount for l in loans if l.next_due_date and l.next_due_date.date() < report_end_date_only)
                npl_rate = (npl_balance / total_balance) * 100 if total_balance > 0 else 0.0
                return total_balance, weighted_rate, npl_rate

            total_loan_balance = sum(l.remaining_amount for l in all_loans)

            # --- 8. MARKDOWN GENERATION ---
            md_lines = []
            md_lines.append(f"# MEA FINANCIAL INSTITUTION REPORT")
            md_lines.append(f"**Institution Name:** {BANK_NAME}")
            md_lines.append(f"**Reporting Period:** {report_start_date.strftime('%B %Y')}")
            md_lines.append(f"**Prepared By:** {interaction.user.name}")
            md_lines.append(f"**Date Published:** {datetime.now().strftime('%Y-%m-%d')}")
            owners = cfg["bank"].get("owners", ["N/A"])
            md_lines.append(f"**Registered Owners:** {', '.join(owners) if isinstance(owners, list) else owners}")
            md_lines.append("")
            md_lines.append(f"## CORPORATE INFORMATION")
            md_lines.append(f"**Institution Type:** Commercial Bank")
            md_lines.append(f"**Description:** N/A")
            md_lines.append(f"**Management Team:** N/A")
            md_lines.append(f"**Legal Representation:** N/A")
            md_lines.append(f"**Employees with direct access:** (Check Database/Permissions)")
            discord_url = cfg["discord"].get("invite_url", "N/A")
            md_lines.append(f"**Discord Link / In-Game Location:** {discord_url}")
            md_lines.append(f"**Company In-Game Name:** {CORP_NAME}")
            md_lines.append(f"**CEO Discord Username:** N/A")
            md_lines.append(f"**CEO In-Game Name:** N/A")
            md_lines.append("")
            md_lines.append(f"## CONSUMER FINANCIAL PROTECTIONS & GOVERNANCE")
            md_lines.append(f"*Clear & Accurate Info:* N/A")
            md_lines.append(f"*Privacy & Data Protection:* N/A")
            md_lines.append(f"*Complaint & Dispute Handling:* N/A")
            md_lines.append(f"*New/Vulnerable Player Protections:* N/A")
            md_lines.append(f"*Truthful Advertising Practices:* N/A")
            md_lines.append(f"*Governance & Compliance (Credit Unions):* N/A")
            md_lines.append("")
            
            # --- Income Statement ---
            md_lines.append(f"## FINANCIAL DISCLOSURES")
            md_lines.append(f"### Income Statement ({str_curr})")
            md_lines.append(f"- **Interest Income (Loans):** {self._format_money(curr_int)}")
            md_lines.append(f"- **Interest Income (Other):** $0.00")
            md_lines.append(f"- **Fee Income:** $0.00")
            md_lines.append(f"- **Trading Income:** $0.00")
            md_lines.append(f"- **Other Income:** $0.00")
            md_lines.append(f"- **Expenses:** $0.00")
            md_lines.append(f"- **Taxes (Withdrawal Tax):** {self._format_money(curr_fees)}")
            md_lines.append(f"- **Net Income:** {self._format_money(curr_int + curr_fees)}")
            md_lines.append("")
            
            # --- Loan Register ---
            md_lines.append(f"### Loan Register")
            md_lines.append("| Type | Borrower | Principal | Remaining Balance | Rate | Term | Collateral | Status |")
            md_lines.append("|---|---|---|---|---|---|---|---|")
            for cat, loans_list in loan_by_category.items():
                for l in loans_list:
                    collateral = "Yes" if l.collateral else "No"
                    status = "Active" if getattr(l, 'is_active', True) else "Paid"
                    # interest_rate is likely ANNUAL. to get monthly, divide by 52 and multiply by 4 weeks.
                    monthly_rate_pct = ((l.interest_rate or 0) / 52 * 4) * 100
                    md_lines.append(f"| {cat} | {l.account_name} | {self._format_money(l.amount or 0)} | {self._format_money(l.remaining_amount or 0)} | {self._format_pct(monthly_rate_pct)} | {getattr(l, 'term_weeks', getattr(l, 'term_days', 'N/A'))} | {collateral} | {status} |")
            if sum(len(x) for x in loan_by_category.values()) == 0:
                md_lines.append("| N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |")
            md_lines.append("")
            
            # --- Balance Sheet ---
            md_lines.append(f"### Balance Sheet")
            md_lines.append(f"**Assets:**")
            md_lines.append(f"- **Cash (Bank Cash Balance):** {self._format_money(corp_balance_curr)}")
            md_lines.append(f"- **Cash (Total Deposits Held):** {self._format_money(total_deposits_curr)}")
            md_lines.append(f"- **Loans (Total Outstanding):** {self._format_money(total_loan_balance)}")
            md_lines.append(f"- **Collateral / Real Estate / Inventory / Receivables / Other:** $0.00")
            total_assets = corp_balance_curr + total_deposits_curr + total_loan_balance
            md_lines.append(f"- **Total Assets:** {self._format_money(total_assets)}")
            md_lines.append("")
            
            md_lines.append(f"**Liabilities:**")
            md_lines.append(f"- **Deposits (Client Deposits):** {self._format_money(total_deposits_curr)}")
            md_lines.append(f"- **Liabilities (Outstanding/Taxes/Other):** $0.00")
            md_lines.append(f"- **Total Liabilities:** {self._format_money(total_deposits_curr)}")
            md_lines.append("")
            
            db_path = 'bank_data.db'
            if not os.path.exists(db_path) and os.path.exists('/data/bank.db'): db_path = '/data/bank.db'
            conn = sqlite3.connect(db_path)
            c = conn.cursor()
            c.execute("SELECT amount, description, category, created_at FROM corp_transactions WHERE amount < 0 LIMIT 20")
            rows = c.fetchall()
            conn.close()
            md_lines.append("### Debug Corp Transactions")
            for r in rows:
                md_lines.append(f"- `{r}`")
            md_lines.append("")
            md_lines.append("")
            
            md_lines.append(f"**Equity:**")
            md_lines.append(f"- **Total Equity:** {self._format_money(total_assets - total_deposits_curr)}")
            md_lines.append("")
            
            # --- Monthly Transactions ---
            try:
                c_dep_cnt = curr_dep_count
            except:
                c_dep_cnt = 0
            try:
                c_wd_cnt = curr_wd_count
            except:
                c_wd_cnt = 0
                
            md_lines.append(f"### Monthly Transactions ({str_curr})")
            md_lines.append(f"- **Total Monthly Deposits:** {c_dep_cnt} txs / {self._format_money(curr_dep_total)}")
            md_lines.append(f"- **Total Monthly Withdrawals:** {c_wd_cnt} txs / {self._format_money(curr_wd_total)}")
            md_lines.append(f"- **Monthly Total (Net):** {self._format_money(curr_net_flow)}")
            md_lines.append("")
            
            md_lines.append(f"### Investment Products & Funds")
            md_lines.append("N/A")
            md_lines.append("")

            # Optional Append
            if self.include_accounts:
                md_lines.append(f"### Accounts List - For Audits Only")
                md_lines.append("| Account Holder | Account Type | Balance |")
                md_lines.append("|---|---|---|")
                db_accs = {acc.account_name.lower(): acc.account_type for acc in session.query(Account).all()}
                
                for acc in all_corp_accounts:
                    acc_name = acc.get('name', 'Unknown')
                    acc_name_lower = acc_name.lower()
                    if acc_name_lower == loan_pool_name: continue
                    typ = db_accs.get(acc_name_lower, 'Unknown (API only)')
                    try:
                        acc_balance = float(acc.get('balance', 0))
                    except:
                        acc_balance = 0.0
                    md_lines.append(f"| {acc_name} | {typ} | {self._format_money(acc_balance)} |")

            # Output embed and file
            report_text = "\n".join(md_lines)
            import io
            file_obj = discord.File(io.BytesIO(report_text.encode('utf-8')), filename=f"MEA_Report_{str_curr}_{report_start_date.year}.md")
            
            embed = discord.Embed(title=f"✅ MEA Report Generated", description=f"The full report for **{str_curr} {report_start_date.year}** is attached above.", color=discord.Color.green())
            await interaction.followup.send(embed=embed, file=file_obj, ephemeral=True)

        except Exception as e:
            logger.error(f"Report Error: {e}", exc_info=True)
            await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)
        finally:
            session.close()
            if conn: conn.close()

# --- Main Admin Panel View (Updated with Reset PIN) ---
class AdminPanelView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=900)
        self.cog = cog
        self.add_buttons()

    def add_buttons(self):
        # Row 0
        actions_r0 = [
            ("📋 View Accounts", self.view_accounts, discord.ButtonStyle.primary),
            ("🔗 Link Account", self.link_account, discord.ButtonStyle.success),
            ("✏️ Edit Account", self.edit_account, discord.ButtonStyle.secondary),
            ("🏢 Business Mgmt", self.business_mgmt, discord.ButtonStyle.secondary),
            ("📊 View Transactions", self.view_transactions, discord.ButtonStyle.grey),
        ]
        for label, callback, style in actions_r0:
            btn = Button(label=label, style=style, row=0)
            btn.callback = callback
            self.add_item(btn)

        # Row 1
        actions_r1 = [
            ("💼 Loan Products", self.manage_loan_products, discord.ButtonStyle.primary),
            ("💰 Deposit Fix", self.deposit_fix, discord.ButtonStyle.success),
            ("💸 Force Withdrawal", self.force_withdrawal, discord.ButtonStyle.danger),
        ]
        for label, callback, style in actions_r1:
            btn = Button(label=label, style=style, row=1)
            btn.callback = callback
            self.add_item(btn)

        # Row 2
        actions_r2 = [
            ("📈 Bank Audit", self.bank_audit, discord.ButtonStyle.blurple),
            ("🌐 List In-Game Accounts", self.list_in_game_accounts, discord.ButtonStyle.blurple),
            ("📢 Announce", self.announce, discord.ButtonStyle.secondary),
        ]
        for label, callback, style in actions_r2:
            btn = Button(label=label, style=style, row=2)
            btn.callback = callback
            self.add_item(btn)

        # Row 3 (Added Reset User PIN here)
        actions_r3 = [
            ("❄️ Freeze/Unfreeze", self.freeze_unfreeze, discord.ButtonStyle.secondary),
            ("⚙️ Set Global Fees", self.set_global_fees, discord.ButtonStyle.danger),
            ("🗑️ Delete Account", self.delete_account_action, discord.ButtonStyle.danger),
            ("🔑 Reset User PIN", self.reset_user_pin, discord.ButtonStyle.primary), # <--- NEW
        ]
        for label, callback, style in actions_r3:
            btn = Button(label=label, style=style, row=3)
            btn.callback = callback
            self.add_item(btn)

    async def manage_loan_products(self, interaction: discord.Interaction):
        await interaction.response.edit_message(view=LoanProductMgmtView(self.cog))

    async def deposit_fix(self, interaction: discord.Interaction):
        await interaction.response.send_modal(DepositFixModal(self.cog))

    async def set_global_fees(self, interaction: discord.Interaction):
        await interaction.response.send_modal(SetGlobalFeesModal(self.cog))

    async def delete_account_action(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AdminAccountActionModal(self.cog, "delete"))

    async def view_accounts(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        session = self.cog.db.get_session()
        accounts = session.query(Account).all()
        session.close()
        
        if not accounts:
            return await interaction.followup.send("❌ No accounts in database.", ephemeral=True)
        
        view = DbAccountPagination(self.cog, accounts)
        embed = await view.get_page_embed()
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

    async def link_account(self, interaction: discord.Interaction):
        await interaction.response.send_modal(LinkAccountModal(self.cog))

    async def edit_account(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AdminAccountActionModal(self.cog, "edit"))

    async def announce(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AnnounceModal())

    async def business_mgmt(self, interaction: discord.Interaction):
        await interaction.response.send_message("Select a business to manage:", view=BusinessMgmtView(self.cog, interaction.user.id, is_admin=True), ephemeral=True)

    async def force_withdrawal(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AdminAccountActionModal(self.cog, "withdraw"))

    async def freeze_unfreeze(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AdminAccountActionModal(self.cog, "freeze"))
    
    async def view_transactions(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AdminAccountActionModal(self.cog, "transactions"))

    async def reset_user_pin(self, interaction: discord.Interaction):
        # Calls the generic modal with action="reset_pin"
        await interaction.response.send_modal(AdminAccountActionModal(self.cog, "reset_pin"))

    async def list_in_game_accounts(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        try:
            accounts = await self.cog.api.get_all_corp_accounts()
            if not accounts:
                return await interaction.followup.send("ℹ️ No in-game accounts found.", ephemeral=True)
            view = AccountListPagination(self.cog, accounts)
            await interaction.followup.send(embed=view.create_embed(), view=view, ephemeral=True)
        except Exception as e:
            logger.error(f"Error listing in-game accounts: {e}")
            await interaction.followup.send("❌ Error fetching in-game accounts.", ephemeral=True)

    async def bank_audit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        try:
            all_corp_accounts = await self.cog.api.get_all_corp_accounts()
            total_assets = sum(float(acc.get('balance', 0)) for acc in all_corp_accounts)
        except Exception as e:
            logger.error(f"Audit API Error: {e}")
            total_assets = 0.0

        session = self.cog.db.get_session()
        total_linked_accounts = session.query(Account).count()
        session.close()
        
        corp_details = await self.cog.api.get_corp_details()
        corp_balance = float(corp_details.get('balance', 0)) if corp_details else 0.0

        embed = discord.Embed(title=f"📈 {BANK_NAME} Financial Report", color=THEME_COLOR)
        embed.add_field(name="Total Client Assets (API)", value=f"${total_assets:,.2f}", inline=False)
        embed.add_field(name="Main Corporate Balance", value=f"${corp_balance:,.2f}", inline=False)
        embed.add_field(name="Total Linked Accounts (DB)", value=str(total_linked_accounts), inline=False)
        embed.set_footer(text=f"Report generated on {discord.utils.format_dt(datetime.now())}")
        
        await interaction.followup.send(embed=embed, ephemeral=True)

    @discord.ui.button(label="📄 MoEA Report", style=discord.ButtonStyle.success, row=2)
    async def moea_report_btn(self, interaction: discord.Interaction, button: Button):
        # Just send the view; the user will pick a date from the dropdown to trigger the report
        await interaction.response.send_message("Select a reporting period:", view=MoEAReportView(self.cog), ephemeral=True)
