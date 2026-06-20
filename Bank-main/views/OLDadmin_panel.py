import discord
from discord.ui import View, Button, Select, Modal, TextInput
from db.models import Database, Account, AccountMember, LoanProduct, LoanApplication, Loan
from utils.cityrp_api import CityRPAPI
from utils.logging_utils import log_account_creation, log_transaction, log_account_deletion
from .business_panel import BusinessMgmtView
from typing import TYPE_CHECKING, List, Dict
import logging
import yaml
from datetime import datetime, timedelta
import asyncio
import sqlite3

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

# --- NEW LOAN PRODUCT SELECT ---
class LoanProductSelect(Select):
    def __init__(self, options):
        super().__init__(placeholder="Select a product to edit or toggle...", options=options)
    
    async def callback(self, interaction: discord.Interaction):
        if self.view:
            self.view.selected_product_id = int(self.values[0])
        await interaction.response.defer()

# --- Helper Modal for Loan Product Creation/Editing ---
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

        self.add_item(self.product_name)
        self.add_item(self.interest_rate)
        self.add_item(self.term_weeks)
        self.add_item(self.origination_fee)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            name = self.product_name.value
            rate = float(self.interest_rate.value)
            term_weeks = int(self.term_weeks.value)
            fee = float(self.origination_fee.value or 0.0)

            if self.product:
                self.cog.db.update_loan_product(self.product.id, name, rate, term_weeks, fee)
                message = f"✅ Loan product **{name}** updated successfully. Rate: {rate*100:.2f}% Weekly."
            else:
                self.cog.db.create_loan_product(name, rate, term_weeks, fee)
                message = f"✅ New loan product **{name}** created. Rate: {rate*100:.2f}% Weekly."

            await interaction.followup.send(message, ephemeral=True)
            await interaction.edit_original_response(view=LoanProductMgmtView(self.cog))

        except ValueError:
            await interaction.followup.send("❌ Invalid numeric input. Please use decimals.", ephemeral=True)
        except Exception as e:
            logger.error(f"Error submitting loan product modal: {e}", exc_info=True)
            await interaction.followup.send(f"❌ An error occurred: {e}", ephemeral=True)

# --- Loan Product Management View ---
class LoanProductMgmtView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=300)
        self.cog = cog
        self.products: List[LoanProduct] = self.cog.db.get_all_loan_products() 

        product_options = [
            discord.SelectOption(
                label=f"{p.name} ({p.term_weeks} Wks @ {p.interest_rate*100:.1f}%)",
                value=str(p.id),
                description=f"Status: {'Active' if p.is_active else 'Inactive'} | Fee: {p.origination_fee_percent*100:.1f}%"
            ) for p in self.products
        ]
        
        if product_options:
            self.add_item(LoanProductSelect(product_options))
        else:
             self.remove_item(self.edit_button)
             self.remove_item(self.toggle_status_button)
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
            
            await interaction.response.send_message(f"✅ Product **{product.name}** is now **{'ACTIVE' if new_status else 'INACTIVE'}**.", ephemeral=True)
            await interaction.edit_original_response(view=LoanProductMgmtView(self.cog))
        else:
            await interaction.response.send_message("Product not found.", ephemeral=True)

    @discord.ui.button(label="« Back to Admin Menu", style=discord.ButtonStyle.secondary, row=2)
    async def back_to_admin(self, interaction: discord.Interaction, button: Button):
        await interaction.response.edit_message(view=AdminPanelView(self.cog))


# --- General Admin Modals/Views ---

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
    """Paginates through local database accounts."""
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
        self.transactions = self._normalize_transactions(transactions)
        self.transactions = sorted(self.transactions, key=lambda x: x.get("timestamp", 0), reverse=True)
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
        return normalized

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

        self.add_item(self.rp_name)
        self.add_item(self.mc_username)
        self.add_item(self.discord_id)
        self.add_item(self.account_type)
        self.add_item(self.verified)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        account_type_val = self.account_type.value.lower()
        if account_type_val not in ['personal', 'business']:
            return await interaction.followup.send("❌ **Error:** Type must be 'personal' or 'business'.", ephemeral=True)
        
        verified_val = self.verified.value.lower() in ['true', '1', 'yes', 't']

        session = self.cog.db.get_session()
        try:
            account = session.query(Account).filter_by(account_name=self.account_name).first()
            if account:
                account.rp_name = self.rp_name.value
                account.mc_username = self.mc_username.value
                account.discord_id = self.discord_id.value
                account.account_type = account_type_val
                account.verified = verified_val
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

# --- NEW: Admin Account Action Modal (Replaces Generic Select) ---
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

# --- MoEA Report Generator Logic (Optimized for Local DB) ---
class MoEAReportView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=900)
        self.cog = cog

    async def generate_report(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        
        session = self.cog.db.get_session()
        conn = None
        try:
            # 1. API Calls for Snapshot Data
            corp_data = await self.cog.api.get_corp_details()
            corp_balance = float(corp_data.get('balance', 0)) if corp_data else 0.0
            
            all_corp_accounts = await self.cog.api.get_all_corp_accounts()
            total_deposits = sum(float(acc.get('balance', 0)) for acc in all_corp_accounts)

            all_loans = session.query(Loan).filter_by(is_active=True).all()
            total_loans = sum(l.remaining_amount for l in all_loans)
            
            # 2. LOCAL DB for Transaction Data (Last 30 Days)
            conn = sqlite3.connect("bank_data.db")
            c = conn.cursor()
            
            # A) FEES REVENUE (From Corp Ledger)
            c.execute("""
                SELECT SUM(amount) FROM corp_transactions 
                WHERE category = 'fee'
                AND created_at >= date('now', '-30 days')
            """)
            fees_revenue = c.fetchone()[0] or 0.0

            # B) CLIENT TRANSACTION VOLUMES (From Client Ledger)
            # Deposits (Positive flow into client accounts)
            c.execute("""
                SELECT COUNT(*), SUM(amount) FROM client_transactions
                WHERE amount > 0
                AND created_at >= date('now', '-30 days')
            """)
            row = c.fetchone()
            dep_count = row[0] or 0
            dep_total = row[1] or 0.0

            # Withdrawals (Negative flow out of client accounts)
            c.execute("""
                SELECT COUNT(*), SUM(amount) FROM client_transactions
                WHERE amount < 0
                AND created_at >= date('now', '-30 days')
            """)
            row = c.fetchone()
            wd_count = row[0] or 0
            wd_total = row[1] or 0.0 # This is negative
            
            # Net Cash Flow for Bank (Fees - Expenses)
            c.execute("SELECT SUM(amount) FROM corp_transactions WHERE amount > 0 AND created_at >= date('now', '-30 days')")
            bank_inflow = c.fetchone()[0] or 0.0
            c.execute("SELECT SUM(amount) FROM corp_transactions WHERE amount < 0 AND created_at >= date('now', '-30 days')")
            bank_outflow = c.fetchone()[0] or 0.0
            
            # NPL Value
            today = datetime.utcnow()
            npl_loans = [l for l in all_loans if l.next_due_date and l.next_due_date < today.date()]
            npl_value = sum(l.remaining_amount for l in npl_loans)
            
            # Ratios
            total_assets = corp_balance + total_loans 
            liquidity_ratio = (corp_balance / total_deposits * 100) if total_deposits > 0 else 0
            ltd_ratio = (total_loans / total_deposits * 100) if total_deposits > 0 else 0
            npl_ratio = (npl_value / total_loans * 100) if total_loans > 0 else 0
            
            start_date = today - timedelta(days=30)
            
            # Footer data
            c.execute("SELECT COUNT(*) FROM corp_transactions")
            total_scanned_tx = c.fetchone()[0]

        except Exception as e:
            logger.error(f"Report Error: {e}")
            return await interaction.followup.send("❌ Error generating report.", ephemeral=True)
        finally:
            session.close()
            if conn: conn.close()

        # Build Embed
        embed = discord.Embed(title="📊 MoEA Monthly Report Data", description=f"Period: {start_date.strftime('%Y-%m-%d')} to {today.strftime('%Y-%m-%d')}", color=discord.Color.gold())
        
        embed.add_field(name="💰 Balance Sheet", value=f"""
**Liquid Assets:** ${corp_balance:,.2f}
**Total Deposits:** ${total_deposits:,.2f}
**Total Loans:** ${total_loans:,.2f}
**Est. Total Assets:** ${total_assets:,.2f}
        """, inline=False)

        embed.add_field(name="HTC Financial Ratios", value=f"""
**Liquidity Ratio:** {liquidity_ratio:.2f}%
**Loan-to-Deposit Ratio:** {ltd_ratio:.2f}%
**NPL Ratio:** {npl_ratio:.2f}%
        """, inline=False)

        embed.add_field(name="📝 Client Transaction Activity (30d)", value=f"""
**Customer Deposits:** {dep_count} txs | ${dep_total:,.2f}
**Customer Withdrawals:** {wd_count} txs | ${abs(wd_total):,.2f}
**Net Client Flow:** ${(dep_total + wd_total):,.2f}
        """, inline=False)

        embed.add_field(name="🌊 Corporate Cash Flow (30d)", value=f"""
**Bank Income (Fees):** ${fees_revenue:,.2f}
**Total Inflow:** ${bank_inflow:,.2f}
**Total Outflow:** ${abs(bank_outflow):,.2f}
        """, inline=False)
        
        embed.set_footer(text=f"Data derived from {total_scanned_tx} synced corporate transactions.")
        
        await interaction.followup.send(embed=embed, ephemeral=True)

# --- Main Admin Panel View ---
class AdminPanelView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=900)
        self.cog = cog
        self.add_buttons()

    def add_buttons(self):
        # Row 0: Daily Account Management
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

        # Row 1: Financials & Loans
        actions_r1 = [
            ("💼 Loan Products", self.manage_loan_products, discord.ButtonStyle.primary),
            ("💰 Deposit Fix", self.deposit_fix, discord.ButtonStyle.success),
            ("💸 Force Withdrawal", self.force_withdrawal, discord.ButtonStyle.danger),
        ]
        for label, callback, style in actions_r1:
            btn = Button(label=label, style=style, row=1)
            btn.callback = callback
            self.add_item(btn)

        # Row 2: System & Reporting
        actions_r2 = [
            ("📈 Bank Audit", self.bank_audit, discord.ButtonStyle.blurple),
            ("🌐 List In-Game Accounts", self.list_in_game_accounts, discord.ButtonStyle.blurple),
            ("📢 Announce", self.announce, discord.ButtonStyle.secondary),
        ]
        for label, callback, style in actions_r2:
            btn = Button(label=label, style=style, row=2)
            btn.callback = callback
            self.add_item(btn)

        # Row 3: Danger / Config
        actions_r3 = [
            ("❄️ Freeze/Unfreeze", self.freeze_unfreeze, discord.ButtonStyle.secondary),
            ("⚙️ Set Global Fees", self.set_global_fees, discord.ButtonStyle.danger),
            ("🗑️ Delete Account", self.delete_account_action, discord.ButtonStyle.danger),
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
        view = MoEAReportView(self.cog)
        await view.generate_report(interaction)