import discord
from discord.ui import View, Button, Select, Modal, TextInput
from db.models import Database, Account, AccountMember, Transaction, Loan
from .transfer_modal import TransferModal
from .settings_panel import SettingsPanelView
from .signup_flow import FirstTimeSetupModal, TermsAgreementView
from .business import PayrollModal, CreateInvoiceModal
import yaml
import logging
from datetime import datetime
from typing import TYPE_CHECKING, List, Dict

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('client_dashboard')

with open("config.yaml", "r") as f:
    cfg = yaml.safe_load(f)

BANK_NAME = cfg["bank"]["name"]
CORP_NAME = cfg["bank"]["corp_name"]
LOGO_URL = cfg["bank"].get("logo_url", "")
THEME_COLOR = int(cfg["bank"].get("theme_color", "0x0A2351"), 16)
LOAN_CHANNEL_ID = int(cfg["discord"].get("loan_channel_id", 0))
TERMS_URL = cfg["bank"].get("terms_url", "https://cityrp.org/terms")
LOAN_POOL = cfg["bank"].get("loan_pool", "loans") 

# --- STAFF MANAGEMENT MODALS ---

class AddStaffModal(Modal, title="Hire Staff Member"):
    def __init__(self, cog, account_name, parent_view):
        super().__init__()
        self.cog = cog
        self.account_name = account_name
        self.parent_view = parent_view
        self.discord_id = TextInput(label="Discord User ID", min_length=17, max_length=20, required=True)
        self.add_item(self.discord_id)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        session = self.cog.db.get_session()
        try:
            exists = session.query(AccountMember).filter_by(account_name=self.account_name, discord_id=self.discord_id.value).first()
            if exists:
                return await interaction.followup.send("❌ User is already on the staff list.", ephemeral=True)
            
            new_mem = AccountMember(account_name=self.account_name, discord_id=self.discord_id.value, role='viewer')
            session.add(new_mem)
            session.commit()
            
            await interaction.followup.send(f"✅ Added <@{self.discord_id.value}> to {self.account_name}.", ephemeral=True)
            await self.parent_view.refresh(interaction)
        except Exception as e:
            logger.error(f"Error adding staff: {e}")
            await interaction.followup.send("❌ Database error.", ephemeral=True)
        finally:
            session.close()

class ManageStaffView(View):
    def __init__(self, cog, account_name):
        super().__init__(timeout=300)
        self.cog = cog
        self.account_name = account_name
        self.generate_items()

    def generate_items(self):
        self.clear_items()
        hire_btn = Button(label="Hire Staff (Add ID)", style=discord.ButtonStyle.success, row=0)
        hire_btn.callback = self.hire_callback
        self.add_item(hire_btn)

        session = self.cog.db.get_session()
        members = session.query(AccountMember).filter_by(account_name=self.account_name).all()
        session.close()

        if members:
            options = []
            for m in members[:25]: 
                options.append(discord.SelectOption(label=f"Remove ID: {m.discord_id}", value=str(m.id), emoji="🗑️"))
            
            select = Select(placeholder="Select staff to remove...", options=options, row=1)
            select.callback = self.fire_callback
            self.add_item(select)
        else:
            self.add_item(Button(label="No Staff Found", style=discord.ButtonStyle.grey, disabled=True, row=1))

    async def hire_callback(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AddStaffModal(self.cog, self.account_name, self))

    async def fire_callback(self, interaction: discord.Interaction):
        member_id = int(interaction.data['values'][0])
        session = self.cog.db.get_session()
        try:
            session.query(AccountMember).filter_by(id=member_id).delete()
            session.commit()
        finally:
            session.close()
        
        await interaction.response.defer()
        await self.refresh(interaction)
        await interaction.followup.send("✅ Staff member removed.", ephemeral=True)

    async def refresh(self, interaction):
        self.generate_items()
        await interaction.edit_original_response(view=self)

# --- MANUAL LOAN PAYMENT ---
class LoanPaymentModal(Modal, title="Make a Loan Payment"):
    def __init__(self, cog: 'BankCog', loan: Loan):
        super().__init__()
        self.cog = cog
        self.loan = loan
        self.amount = TextInput(
            label=f"Payment Amount (Max ${loan.remaining_amount:,.2f})",
            placeholder="e.g., 200.00",
            required=True
        )
        self.add_item(self.amount)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            amount_val = float(self.amount.value)
            if amount_val <= 0: return await interaction.followup.send("❌ Positive amount required.", ephemeral=True)
            if amount_val > self.loan.remaining_amount: amount_val = self.loan.remaining_amount

            result = await self.cog.api.transfer_money(self.loan.account_name, LOAN_POOL, amount_val)
            
            if result['success']:
                session = self.cog.db.get_session()
                try:
                    loan = session.query(Loan).filter_by(id=self.loan.id).first()
                    if loan:
                        loan.remaining_amount -= amount_val
                        msg = f"✅ Payment of **${amount_val:,.2f}** accepted."
                        
                        if loan.remaining_amount <= 0.01:
                            loan.remaining_amount = 0
                            loan.is_active = False
                            msg += " Loan is **PAID OFF**! 🎉"
                        
                        self.cog.db.save_transaction(loan.account_name, {
                            'amount': amount_val,
                            'type': 'debit',
                            'other_account': LOAN_POOL,
                            'description': f"Manual Payment Loan #{loan.id}",
                            'created_at': datetime.utcnow().isoformat()
                        })
                        session.commit()
                        await interaction.followup.send(msg, ephemeral=True)
                finally:
                    session.close()
            else:
                await interaction.followup.send(f"❌ Payment Failed: {result['message']}", ephemeral=True)
        except ValueError:
            await interaction.followup.send("❌ Invalid amount.", ephemeral=True)

# --- ACTIVE LOANS VIEW ---
class ActiveLoansView(View):
    def __init__(self, cog, account_name, dashboard_view, loans):
        super().__init__(timeout=300)
        self.cog = cog
        self.account_name = account_name
        self.dashboard_view = dashboard_view
        self.loans = loans

    @discord.ui.button(label="Pay Loan", style=discord.ButtonStyle.primary, emoji="💳", row=1)
    async def pay_loan(self, interaction: discord.Interaction, button: Button):
        if not self.loans: return await interaction.response.send_message("No active loans.", ephemeral=True)
        await interaction.response.send_modal(LoanPaymentModal(self.cog, self.loans[0]))

    @discord.ui.button(label="Apply for New Loan", style=discord.ButtonStyle.success, emoji="💸", row=1)
    async def apply_new(self, interaction: discord.Interaction, button: Button):
        from .loan_application_view import LoanApplicationView 
        view = LoanApplicationView(self.cog, self.account_name, self.dashboard_view)
        if not view.active_products: return await interaction.response.send_message("❌ No loan products available.", ephemeral=True)
        await interaction.response.edit_message(content="**Select a product:**", embed=None, view=view)

    @discord.ui.button(label="Back to Dashboard", style=discord.ButtonStyle.secondary, row=1)
    async def back(self, interaction: discord.Interaction, button: Button):
        embed = await self.dashboard_view.create_dashboard_embed()
        await interaction.response.edit_message(content=None, embed=embed, view=self.dashboard_view)

# --- MAIN DASHBOARD VIEW ---
class ClientDashboardView(View):
    def __init__(self, cog: 'BankCog', discord_id: int, selected_account: str = None):
        super().__init__(timeout=900)
        self.cog = cog
        self.discord_id = int(discord_id)
        self.selected_account = selected_account
        self.is_profile_complete = False
        self.user_accounts = self.get_user_accounts()

        if not self.selected_account and len(self.user_accounts) >= 1:
            self.selected_account = self.user_accounts[0]['account_name']

        self.add_item(AccountSelect(self.discord_id, self.user_accounts, self.selected_account))
        
        if self.selected_account:
            self.check_profile_status()
            self.add_action_buttons()

    def get_user_accounts(self) -> List[Dict]: 
        session = self.cog.db.get_session()
        try:
            owned = session.query(Account).filter(Account.discord_id == str(self.discord_id))
            member = session.query(Account).join(AccountMember).filter(AccountMember.discord_id == str(self.discord_id))
            all_accs = owned.union(member).all()
            return [{'account_name': acc.account_name, 'account_type': acc.account_type} for acc in all_accs]
        finally:
            session.close()

    def check_profile_status(self):
        session = self.cog.db.get_session()
        try:
            user_data = session.query(Account.pin).filter(Account.discord_id == str(self.discord_id)).first()
            self.is_profile_complete = bool(user_data and user_data[0])
        finally:
            session.close()

    async def create_dashboard_embed(self) -> discord.Embed:
        if not self.selected_account:
            embed = discord.Embed(title=f"🏦 Welcome to {BANK_NAME}", description="Please select an account.", color=THEME_COLOR)
            if LOGO_URL: embed.set_thumbnail(url=LOGO_URL)
            return embed

        active_count = 0
        total_debt = 0.0
        acc_type_title = "Unknown"
        registered_addr = "N/A"
        
        session = self.cog.db.get_session()
        try:
            acc_details = session.query(Account).filter_by(account_name=self.selected_account).first()
            if acc_details:
                acc_type_title = acc_details.account_type.title()
                registered_addr = acc_details.registered_address or "N/A"
                
                if acc_details.loans:
                    active_loans = [l for l in acc_details.loans if l.is_active]
                    active_count = len(active_loans)
                    total_debt = sum(l.remaining_amount for l in active_loans)
        finally:
            session.close()

        # Fetch Balance via API
        api_details = await self.cog.api.get_account_details(self.selected_account)
        balance = float(api_details.get("balance", 0)) if api_details else 0.0
        
        embed = discord.Embed(title=f"🏦 {BANK_NAME} Dashboard", description=f"Viewing **{acc_type_title}** Account", color=THEME_COLOR)
        if LOGO_URL: embed.set_thumbnail(url=LOGO_URL)

        embed.add_field(name="📝 Account", value=f"`{self.selected_account}`", inline=True)
        embed.add_field(name="💰 Balance", value=f"**${balance:,.2f}**", inline=True)
        embed.add_field(name="📍 Registered Address", value=registered_addr, inline=False)
        
        if active_count > 0:
            embed.add_field(name="📉 Active Debt", value=f"${total_debt:,.2f} ({active_count} Loans)", inline=False)

        return embed

    def add_action_buttons(self):
        if not self.is_profile_complete:
            setup_button = Button(label="⚠️ Complete Profile Setup", style=discord.ButtonStyle.danger, row=1)
            setup_button.callback = self.trigger_setup_modal
            self.add_item(setup_button)
            return

        current_acc = next((a for a in self.user_accounts if a['account_name'] == self.selected_account), None)
        is_business = current_acc and current_acc['account_type'] == 'business'
        
        session = self.cog.db.get_session()
        is_owner = False
        try:
            acc = session.query(Account).filter_by(account_name=self.selected_account).first()
            if acc and acc.discord_id == str(self.discord_id):
                is_owner = True
        finally:
            session.close()

        self.add_item(self.create_button("↔️ Transfer", self.transfer, discord.ButtonStyle.primary, 1))
        self.add_item(self.create_button("📄 Transactions", self.transactions, discord.ButtonStyle.secondary, 1))
        self.add_item(self.create_button("📥 Deposit Info", self.deposit_info, discord.ButtonStyle.success, 1))

        if is_business:
            self.add_item(self.create_button("💸 Payroll", self.payroll, discord.ButtonStyle.success, 2))
            self.add_item(self.create_button("🧾 Create Invoice", self.invoice, discord.ButtonStyle.primary, 2))
            if is_owner:
                self.add_item(self.create_button("👥 Manage Staff", self.manage_staff, discord.ButtonStyle.danger, 2))
        else:
            if is_owner: 
                 self.add_item(self.create_button("🏢 New Business", self.new_business, discord.ButtonStyle.success, 2))

        self.add_item(self.create_button("📋 Loans", self.loans, discord.ButtonStyle.secondary, 3))
        self.add_item(self.create_button("⚙️ Settings", self.settings, discord.ButtonStyle.secondary, 3))

    def create_button(self, label, callback, style, row):
        button = Button(label=label, style=style, row=row)
        button.callback = callback
        return button

    async def trigger_setup_modal(self, interaction):
        await interaction.response.send_modal(FirstTimeSetupModal(self.cog, self.discord_id, self.selected_account))

    async def transfer(self, interaction):
        await interaction.response.send_modal(TransferModal(self.cog, self.selected_account))

    async def payroll(self, interaction):
        await interaction.response.send_modal(PayrollModal(self.cog, self.selected_account))

    async def invoice(self, interaction):
        await interaction.response.send_modal(CreateInvoiceModal(self.cog, self.selected_account))

    async def manage_staff(self, interaction):
        await interaction.response.defer(ephemeral=True)
        view = ManageStaffView(self.cog, self.selected_account)
        await interaction.followup.send(f"👥 **Staff Management:** {self.selected_account}", view=view, ephemeral=True)

    async def loans(self, interaction): 
        await interaction.response.defer(ephemeral=True)
        session = self.cog.db.get_session()
        try:
            active_loans = session.query(Loan).filter_by(account_name=self.selected_account, is_active=True).all()
        finally:
            session.close()

        if active_loans:
            embed = discord.Embed(title=f"📋 Active Loans", color=THEME_COLOR)
            for loan in active_loans:
                due_str = loan.next_due_date.strftime("%Y-%m-%d") if loan.next_due_date else "N/A"
                embed.add_field(name=f"Loan #{loan.id}", value=f"Due: {due_str}\nBalance: ${loan.remaining_amount:,.2f}", inline=False)
            view = ActiveLoansView(self.cog, self.selected_account, self, active_loans)
            await interaction.followup.send(embed=embed, view=view, ephemeral=True)
            return

        from .loan_application_view import LoanApplicationView 
        view = LoanApplicationView(self.cog, self.selected_account, self)
        if not view.active_products: return await interaction.followup.send("❌ No loan products available.", ephemeral=True)
        await interaction.followup.send(content="**Select a product:**", view=view, ephemeral=True)

    async def transactions(self, interaction):
        await interaction.response.defer(ephemeral=True)
        transactions = self.cog.db.get_transactions(self.selected_account, limit=10)
        if not transactions: return await interaction.followup.send("ℹ️ No recent transactions.", ephemeral=True)

        desc = ""
        for tx in transactions:
            icon = "🟢" if tx.trans_type == 'credit' else "🔴"
            desc += f"{icon} **${tx.amount:,.2f}** | {tx.other_party}\n_{tx.description or 'No Desc'}_\n"
        
        embed = discord.Embed(title=f"📄 History: {self.selected_account}", description=desc, color=THEME_COLOR)
        await interaction.followup.send(embed=embed, ephemeral=True)

    async def settings(self, interaction):
        await interaction.response.send_message(view=SettingsPanelView(self.cog, self.selected_account), ephemeral=True)

    async def new_business(self, interaction):
        embed = discord.Embed(title=f"📜 Terms of Service", description=f"[Read Terms]({TERMS_URL})", color=discord.Color.blue())
        await interaction.response.send_message(embed=embed, view=TermsAgreementView(self.cog, 'business', self.discord_id), ephemeral=True)

    async def deposit_info(self, interaction):
        embed = discord.Embed(title="📥 Deposit", description=f"Use in-game:\n`/c account deposit {CORP_NAME} {self.selected_account} <amount>`", color=THEME_COLOR)
        await interaction.response.send_message(embed=embed, ephemeral=True)

class AccountSelect(Select):
    def __init__(self, discord_id, accounts, selected_account):
        self.discord_id = discord_id
        options = [discord.SelectOption(label=f"{acc['account_name']} ({acc['account_type'].title()})", value=acc['account_name'], default=(selected_account and acc['account_name'] == selected_account)) for acc in accounts]
        if not options: options.append(discord.SelectOption(label="No accounts", value="none"))
        super().__init__(placeholder="Select Account...", options=options, row=0)

    async def callback(self, interaction):
        await interaction.response.defer()
        if self.values[0] == "none": return
        
        # 1. Create the new view/embed
        new_view = ClientDashboardView(cog=self.view.cog, discord_id=self.discord_id, selected_account=self.values[0])
        new_embed = await new_view.create_dashboard_embed()
        
        # 2. Generate the Card Image for the NEW selected account
        files = []
        try:
            # We need RP Name and Balance
            session = self.view.cog.db.get_session()
            rp_name = "Valued Client"
            acc_type = "personal"
            try:
                acc = session.query(Account).filter_by(account_name=self.values[0]).first()
                if acc:
                    rp_name = acc.rp_name
                    acc_type = acc.account_type
            finally:
                session.close()

            # Balance
            api_data = await self.view.cog.api.get_account_details(self.values[0])
            balance = float(api_data.get('balance', 0)) if api_data else 0.0

            # Generate
            card_buffer = await self.view.cog.bot.loop.run_in_executor(None, 
                lambda: self.view.cog.card_gen.generate_card(
                    self.values[0], 
                    acc_type, 
                    balance,
                    holder_name=rp_name
                )
            )
            if card_buffer:
                files.append(discord.File(card_buffer, filename="debit_card.png"))
                
        except Exception as e:
            logger.error(f"Image gen failed on switch: {e}")

        # 3. Edit the message. 
        await interaction.followup.edit_message(
            embed=new_embed, 
            view=new_view, 
            message_id=interaction.message.id,
            attachments=files 
        )