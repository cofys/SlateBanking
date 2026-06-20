import discord
from discord.ui import View, Button, Modal, TextInput, Select
from db.models import Database, Account, AccountMember, LoanProduct, LoanApplication, Loan, Transaction
from utils.cityrp_api import CityRPAPI
from typing import TYPE_CHECKING, List, Optional, Dict
from datetime import timedelta, datetime
import logging
import yaml
import math

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('clerk_panel')

with open("config.yaml", "r") as f:
    cfg = yaml.safe_load(f)
BANK_NAME = cfg["bank"]["name"]
THEME_COLOR = int(cfg["bank"].get("theme_color", "0x0A2351"), 16)
CORP_ID = cfg["bank"].get("corp_id")
LOAN_POOL = cfg["bank"].get("loan_pool")
WITHDRAWAL_TAX = cfg["bank"].get("withdrawal_tax_percent", 0.0) 


# --- Loan Approval Helpers ---

def calculate_loan_schedule(principal, rate, term_weeks, fee_percent) -> Dict:
    """Calculates total repayment and payment schedule (simplified weekly compounding)."""
    weekly_rate = rate / 52
    total_interest = principal * rate * (term_weeks / 52)
    origination_fee = principal * fee_percent
    
    total_due = principal + total_interest
    weekly_payment = total_due / term_weeks
    deposit_amount = principal - origination_fee

    return {
        "principal": principal,
        "total_due": total_due,
        "total_interest": total_interest,
        "origination_fee": origination_fee,
        "deposit_amount": deposit_amount,
        "weekly_payment": weekly_payment,
        "term_weeks": term_weeks,
        "rate": rate 
    }

# --- Modals ---

class EditLoanTermsModal(Modal, title="Edit Loan Terms"):
    def __init__(self, parent_view: 'LoanDetailView'):
        super().__init__()
        self.parent_view = parent_view
        current = parent_view.schedule
        self.amount = TextInput(label="Principal Amount", default=str(current['principal']), required=True)
        weekly_percent = (current['rate'] / 52) * 100
        self.weekly_rate = TextInput(label="Weekly Interest Rate (%)", default=f"{weekly_percent:.2f}", required=True)
        self.weeks = TextInput(label="Term (Weeks)", default=str(current['term_weeks']), required=True)
        self.add_item(self.amount)
        self.add_item(self.weekly_rate)
        self.add_item(self.weeks)

    async def on_submit(self, interaction: discord.Interaction):
        try:
            new_principal = float(self.amount.value)
            new_weekly_percent = float(self.weekly_rate.value)
            new_weeks = int(self.weeks.value)
            new_annual_decimal = (new_weekly_percent / 100) * 52
            
            session = self.parent_view.cog.db.get_session()
            try:
                app = session.query(LoanApplication).filter_by(id=self.parent_view.application.id).first()
                if app:
                    app.amount = new_principal
                    app.interest_rate = new_annual_decimal
                    app.term_weeks = new_weeks
                    session.commit()
                    self.parent_view.application.amount = new_principal
                    self.parent_view.application.interest_rate = new_annual_decimal
                    self.parent_view.application.term_weeks = new_weeks
            except Exception as e:
                logger.error(f"Error saving terms: {e}")
            finally:
                session.close()

            fee_percent = self.parent_view.application.product.origination_fee_percent
            new_schedule = calculate_loan_schedule(new_principal, new_annual_decimal, new_weeks, fee_percent)
            self.parent_view.schedule = new_schedule
            embed = self.parent_view.create_detail_embed()
            await interaction.response.edit_message(content="✅ **Terms Updated & Saved**", embed=embed, view=self.parent_view)
        except ValueError:
            await interaction.response.send_message("❌ Invalid input format.", ephemeral=True)

# --- Active Loans View ---

class ActiveLoansPagination(View):
    def __init__(self, cog: 'BankCog', loans: List[Loan]):
        super().__init__(timeout=300)
        self.cog = cog
        self.loans = loans
        self.page = 0
        self.per_page = 5
        self.total_pages = math.ceil(len(loans) / self.per_page)
        self.update_buttons()

    def update_buttons(self):
        self.children[0].disabled = self.page == 0
        self.children[1].disabled = (self.page + 1) >= self.total_pages

    def create_embed(self) -> discord.Embed:
        start_idx = self.page * self.per_page
        end_idx = start_idx + self.per_page
        current_loans = self.loans[start_idx:end_idx]
        
        embed = discord.Embed(title=f"📂 Active Loans Registry ({len(self.loans)} Total)", color=THEME_COLOR)
        
        if not current_loans:
            embed.description = "No active loans found."
            return embed

        for loan in current_loans:
            # Calculate status
            due_date = loan.next_due_date.strftime('%Y-%m-%d') if loan.next_due_date else "N/A"
            status = "✅ Current"
            
            # FIX: Convert loan.next_due_date to .date() for comparison
            if loan.next_due_date and loan.next_due_date.date() < datetime.utcnow().date():
                status = "⚠️ Overdue"
            
            embed.add_field(
                name=f"Loan #{loan.id} | {loan.account_name}",
                value=f"**Balance:** ${loan.remaining_amount:,.2f} / ${loan.total_due:,.2f}\n"
                      f"**Next Due:** {due_date}\n"
                      f"**Status:** {status}",
                inline=False
            )
        
        embed.set_footer(text=f"Page {self.page + 1}/{self.total_pages}")
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

# --- Loan Review Views ---

class LoanDetailView(View):
    def __init__(self, cog: 'BankCog', application: LoanApplication, schedule: Dict):
        super().__init__(timeout=300)
        self.cog = cog
        self.application = application
        self.schedule = schedule
        self.account: Account = application.account

    def create_detail_embed(self) -> discord.Embed:
        product: LoanProduct = self.application.product
        embed = discord.Embed(
            title=f"📋 Loan Application #{self.application.id}", 
            description=f"**Product:** {product.name}",
            color=discord.Color.gold()
        )
        embed.add_field(name="Client Account", value=f"`{self.account.account_name}` (<@{self.application.discord_id}>)", inline=False)
        embed.add_field(name="Requested Amount", value=f"${self.application.amount:,.2f}", inline=True)
        embed.add_field(name="Client Rating", value=f"⭐ {self.account.loan_rating}", inline=True)
        embed.add_field(name="Collateral", value=self.application.collateral or 'None Offered', inline=False)
        embed.add_field(name="Purpose", value=self.application.purpose, inline=False)
        
        embed.add_field(name="--- Financial Breakdown ---", value='\u200b', inline=False)
        weekly_rate_percent = (self.schedule['rate'] / 52) * 100
        embed.add_field(name="Interest Rate (Weekly)", value=f"{weekly_rate_percent:.2f}%", inline=True)
        embed.add_field(name="Term", value=f"{self.schedule['term_weeks']} Weeks", inline=True)
        embed.add_field(name="Origination Fee", value=f"${self.schedule['origination_fee']:,.2f}", inline=True)
        embed.add_field(name="Total Repayable", value=f"**${self.schedule['total_due']:,.2f}**", inline=True)
        embed.add_field(name="Weekly Payment", value=f"${self.schedule['weekly_payment']:,.2f}", inline=True)
        embed.add_field(name="Client Deposit", value=f"**${self.schedule['deposit_amount']:,.2f}**", inline=True)
        return embed

    @discord.ui.button(label="Approve & Fund", style=discord.ButtonStyle.success, row=1)
    async def approve_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.defer(ephemeral=True, thinking=True)
        
        if not LOAN_POOL:
            return await interaction.followup.send("❌ **Config Error:** `loan_pool` is not set in config.yaml.", ephemeral=True)

        session = self.cog.db.get_session()
        try:
            app = session.query(LoanApplication).filter_by(id=self.application.id).first()
            if app.status != 'pending':
                return await interaction.followup.send("❌ Application has already been processed.", ephemeral=True)
            app.status = 'approved'
            session.commit()
        finally:
            session.close()
        
        deposit_amount = self.schedule['deposit_amount']
        
        tax_decimal = WITHDRAWAL_TAX / 100
        if tax_decimal >= 1.0:
            return await interaction.followup.send("❌ **Config Error:** Tax rate is 100% or more.", ephemeral=True)
            
        gross_transfer_amount = deposit_amount / (1 - tax_decimal)
        
        fund_result = await self.cog.api.transfer_money(LOAN_POOL, self.account.account_name, gross_transfer_amount)

        if not fund_result['success']:
            session = self.cog.db.get_session()
            app = session.query(LoanApplication).filter_by(id=self.application.id).first()
            app.status = 'funding_failed'
            session.commit()
            session.close()
            return await interaction.followup.send(f"❌ FUNDING FAILED: {fund_result['message']}", ephemeral=True)

        today = datetime.utcnow().date()
        next_due = today + timedelta(weeks=1) 

        self.cog.db.create_loan(
            account_name=self.account.account_name,
            product_id=self.application.product.id,
            amount=self.schedule['principal'],
            interest_rate=self.schedule['rate'],
            term_weeks=self.schedule['term_weeks'],
            collateral=self.application.collateral,
            total_due=self.schedule['total_due'],
            remaining_amount=self.schedule['total_due'],
            next_due_date=next_due
        )

        success_msg = (
            f"✅ LOAN FUNDED!\n"
            f"Client received: **${deposit_amount:,.2f}**\n"
            f"Bank sent (w/ Tax): **${gross_transfer_amount:,.2f}**\n"
        )
        await interaction.followup.send(success_msg, ephemeral=True)
        await interaction.edit_original_response(content="✅ Application Approved and Funded.", view=None, embed=None)

    @discord.ui.button(label="✏️ Edit Terms", style=discord.ButtonStyle.primary, row=1)
    async def edit_terms(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(EditLoanTermsModal(self))

    @discord.ui.button(label="Deny Application", style=discord.ButtonStyle.danger, row=2)
    async def deny_button(self, interaction: discord.Interaction, button: Button):
        session = self.cog.db.get_session()
        try:
            app = session.query(LoanApplication).filter_by(id=self.application.id).first()
            app.status = 'denied'
            session.commit()
        finally:
            session.close()
        await interaction.response.send_message(f"❌ Application #{self.application.id} denied.", ephemeral=True)
        await interaction.edit_original_response(content="❌ Application Denied.", view=None, embed=None)

    @discord.ui.button(label="Open Support Ticket", style=discord.ButtonStyle.blurple, row=2)
    async def ticket_button(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_message("📧 Open a ticket with `tickets.bot`.", ephemeral=True)

class LoanApplicationSelect(Select):
    def __init__(self, cog: 'BankCog', applications: List[LoanApplication]):
        self.cog = cog
        options = [
            discord.SelectOption(
                label=f"#{app.id} | {app.account_name} | ${app.amount:,.2f}",
                value=str(app.id),
                description=f"Product: {app.product.name} | Submitted: {app.created_at.strftime('%Y-%m-%d')}"
            ) for app in applications
        ]
        super().__init__(placeholder="Select application to review...", options=options, row=0)

    async def callback(self, interaction: discord.Interaction):
        app_id = int(self.values[0])
        application: LoanApplication = self.cog.db.get_loan_application_by_id(app_id)

        if not application or not application.product or not application.account:
             return await interaction.response.send_message("❌ Error loading application.", ephemeral=True)

        rate = application.interest_rate if application.interest_rate is not None else application.product.interest_rate
        term = application.term_weeks if application.term_weeks is not None else application.product.term_weeks

        schedule = calculate_loan_schedule(
            principal=application.amount,
            rate=rate,
            term_weeks=term,
            fee_percent=application.product.origination_fee_percent
        )
        
        view = LoanDetailView(self.cog, application, schedule)
        embed = view.create_detail_embed()
        await interaction.response.edit_message(embed=embed, view=view)

class LoanReviewView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=300)
        self.cog = cog
        self.pending_applications = self.cog.db.get_pending_loan_applications()
        
        if self.pending_applications:
            self.add_item(LoanApplicationSelect(self.cog, self.pending_applications))
        else:
            self.add_item(Button(label="No Pending Applications", style=discord.ButtonStyle.grey, disabled=True))
        
    @discord.ui.button(label="Refresh Queue", style=discord.ButtonStyle.secondary, row=1)
    async def refresh_queue(self, interaction: discord.Interaction, button: Button):
        await interaction.response.edit_message(view=LoanReviewView(self.cog))

# --- General Modals ---

class AccountLookupModal(Modal, title=f"🔢 {BANK_NAME} Account Lookup"):
    def __init__(self, cog: 'BankCog'):
        super().__init__()
        self.cog = cog
        self.account_name = TextInput(label="Account Name", required=True)
        self.add_item(self.account_name)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        account_name_val = self.account_name.value.lower()
        local_data = self.cog.db.get_account_by_name(account_name_val)

        if not local_data:
            await interaction.followup.send(f"❌ No account named `{account_name_val}` found in our database.", ephemeral=True)
            return
        
        api_data = await self.cog.api.get_account_details(account_name_val)
        balance = float(api_data.get("balance", 0.0)) if api_data else 0.0

        embed = discord.Embed(title=f"🔍 Account Details: {account_name_val}", color=THEME_COLOR)
        embed.add_field(name="RP Name", value=local_data.rp_name or 'Not Set', inline=True)
        embed.add_field(name="Account Type", value=local_data.account_type.title() if local_data.account_type else 'N/A', inline=True)
        embed.add_field(name="Live Balance", value=f"${balance:,.2f}", inline=True)
        embed.add_field(name="Status", value="❄️ Frozen" if local_data.frozen else "✅ Active", inline=True)
        await interaction.followup.send(embed=embed, ephemeral=True)

class AddMemberModal(Modal, title=f"📄 Add Member to Business Account"):
    def __init__(self, cog: 'BankCog'):
        super().__init__()
        self.cog = cog
        self.account_name = TextInput(label="Business Account Name", required=True)
        self.new_member_id = TextInput(label="New Member's Discord ID", required=True)
        self.add_item(self.account_name)
        self.add_item(self.new_member_id)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        session = self.cog.db.get_session()
        try:
            account: Optional[Account] = session.query(Account).filter_by(account_name=self.account_name.value).first()
            if not account or account.account_type != 'business':
                await interaction.followup.send(f"❌ Not a valid business account.", ephemeral=True)
                return

            member_exists = session.query(AccountMember).filter_by(account_name=self.account_name.value, discord_id=self.new_member_id.value).first()
            if member_exists:
                await interaction.followup.send(f"❌ User is already a member.", ephemeral=True)
                return

            new_member = AccountMember(account_name=self.account_name.value, discord_id=self.new_member_id.value, role='viewer')
            session.add(new_member)
            session.commit()
            await interaction.followup.send(f"✅ Member added to `{self.account_name.value}`.", ephemeral=True)
        except Exception as e:
            session.rollback()
            logger.error(f"Error adding member: {e}")
            await interaction.followup.send("❌ Error.", ephemeral=True)
        finally:
            session.close()

class VerifyTransactionModal(Modal, title=f"💳 Verify Deposit Transaction"):
    def __init__(self, cog: 'BankCog'):
        super().__init__()
        self.cog = cog
        self.account_name = TextInput(label="Account Name", required=True)
        self.amount = TextInput(label="Amount Deposited", required=True)
        self.add_item(self.account_name)
        self.add_item(self.amount)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            amount_val = float(self.amount.value)
        except ValueError:
            await interaction.followup.send("❌ Invalid amount.", ephemeral=True)
            return

        session = self.cog.db.get_session()
        try:
            found = session.query(Transaction).filter(
                Transaction.account_name == self.account_name.value,
                Transaction.trans_type == 'credit',
                Transaction.amount >= amount_val - 0.01, 
                Transaction.amount <= amount_val + 0.01
            ).order_by(Transaction.timestamp.desc()).first()
            
            if found:
                await interaction.followup.send(f"✅ Verified deposit of ${amount_val:,.2f} (TX: {found.remote_id}).", ephemeral=True)
            else:
                await interaction.followup.send(f"❌ No matching deposit found.", ephemeral=True)
        finally:
            session.close()

# --- Main Clerk View ---

class ClerkPanelView(View):
    def __init__(self, cog: 'BankCog'):
        super().__init__(timeout=300)
        self.cog = cog
        
    @discord.ui.button(label="🔢 Lookup Account", style=discord.ButtonStyle.primary, row=0)
    async def lookup(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(AccountLookupModal(self.cog))

    @discord.ui.button(label="📄 Add Member to Business", style=discord.ButtonStyle.success, row=0)
    async def add_member(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(AddMemberModal(self.cog))

    @discord.ui.button(label="💳 Verify Transaction", style=discord.ButtonStyle.secondary, row=0)
    async def verify_transaction(self, interaction: discord.Interaction, button: Button):
        await interaction.response.send_modal(VerifyTransactionModal(self.cog))
        
    @discord.ui.button(label="📋 Review Loan Applications", style=discord.ButtonStyle.primary, row=1)
    async def review_loans(self, interaction: discord.Interaction, button: Button):
        view = LoanReviewView(self.cog)
        if not view.pending_applications:
            await interaction.response.send_message("✅ No pending loan applications at this time.", ephemeral=True)
        else:
            embed = discord.Embed(
                title=f"💰 Loan Application Queue ({len(view.pending_applications)} Pending)",
                description="Select an application from the dropdown below to review.",
                color=discord.Color.gold()
            )
            await interaction.response.send_message(embed=embed, view=view, ephemeral=True)

    @discord.ui.button(label="📂 Active Loans", style=discord.ButtonStyle.secondary, row=1)
    async def view_active_loans(self, interaction: discord.Interaction, button: Button):
        loans = self.cog.db.get_active_loans()
        if not loans:
            return await interaction.response.send_message("ℹ️ No active loans in the system.", ephemeral=True)
        
        view = ActiveLoansPagination(self.cog, loans)
        await interaction.response.send_message(embed=view.create_embed(), view=view, ephemeral=True)