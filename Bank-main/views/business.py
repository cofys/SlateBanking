import discord
from discord.ui import View, Button, Modal, TextInput, Select
from db.models import Database, Account, Invoice, PayrollEntry
from typing import TYPE_CHECKING
import logging

if TYPE_CHECKING:
    from cogs.bank_cog import BankCog

logger = logging.getLogger('business_features')

# --- PAYROLL SYSTEM ---

class PayrollModal(Modal, title="Run Payroll"):
    def __init__(self, cog: 'BankCog', account_name: str):
        super().__init__()
        self.cog = cog
        self.account_name = account_name
        
        self.data = TextInput(
            label="Payroll List (User: Amount)",
            style=discord.TextStyle.paragraph,
            placeholder="Kendall: 5000\nLiam: 7500\nSecurity_Team: 2000",
            required=True
        )
        self.add_item(self.data)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        lines = self.data.value.strip().split('\n')
        total_amount = 0.0
        valid_entries = []
        errors = []

        # 1. Parse and Validate
        for line in lines:
            if ':' not in line:
                errors.append(f"Invalid format: {line}")
                continue
            
            user_part, amount_part = line.split(':', 1)
            target_name = user_part.strip().lower()
            
            try:
                amount = float(amount_part.strip().replace('$', '').replace(',', ''))
                if amount <= 0: raise ValueError
            except:
                errors.append(f"Invalid amount for {target_name}")
                continue

            # Verify target account exists
            target_acc = self.cog.db.get_account_by_name(target_name)
            if not target_acc:
                errors.append(f"Account not found: {target_name}")
                continue
                
            valid_entries.append({"name": target_name, "amount": amount})
            total_amount += amount

        if not valid_entries:
            return await interaction.followup.send(f"❌ No valid entries found.\nErrors:\n" + "\n".join(errors), ephemeral=True)

        # 2. Check Balance
        sender_details = await self.cog.api.get_account_details(self.account_name)
        current_balance = float(sender_details.get('balance', 0))
        
        if current_balance < total_amount:
            return await interaction.followup.send(f"❌ Insufficient funds. Balance: ${current_balance:,.2f} | Needed: ${total_amount:,.2f}", ephemeral=True)

        # 3. Confirmation View
        view = ConfirmPayrollView(self.cog, self.account_name, valid_entries, total_amount)
        embed = discord.Embed(title="⚠️ Confirm Payroll", description=f"Total: **${total_amount:,.2f}** to {len(valid_entries)} employees.", color=discord.Color.orange())
        if errors:
            embed.add_field(name="Skipped Lines", value="\n".join(errors), inline=False)
            
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)

class ConfirmPayrollView(View):
    def __init__(self, cog, account_name, entries, total):
        super().__init__(timeout=60)
        self.cog = cog
        self.account_name = account_name
        self.entries = entries
        self.total = total

    @discord.ui.button(label="✅ Execute Payroll", style=discord.ButtonStyle.green)
    async def confirm(self, interaction: discord.Interaction, button: Button):
        await interaction.response.defer(ephemeral=True)
        self.stop()
        
        success_count = 0
        failed = []
        
        status_msg = await interaction.followup.send("⏳ Processing Payroll... please wait...", ephemeral=True)

        for entry in self.entries:
            # Transfer
            res = await self.cog.api.transfer_money(self.account_name, entry['name'], entry['amount'])
            
            if res['success']:
                success_count += 1
                # Log to DB
                self.cog.db.create_payroll_entry(
                    employer_account=self.account_name,
                    recipient_name=entry['name'],
                    recipient_account=entry['name'],
                    amount=entry['amount'],
                    description="Payroll Run"
                )
            else:
                failed.append(f"{entry['name']}: {res['message']}")
        
        # Report
        embed = discord.Embed(title="💸 Payroll Complete", color=discord.Color.green())
        embed.add_field(name="Summary", value=f"Paid: {success_count}/{len(self.entries)}\nTotal: ${self.total:,.2f}", inline=False)
        if failed:
            embed.add_field(name="Failures", value="\n".join(failed), inline=False)
            
        await status_msg.edit(content="", embed=embed)

# --- INVOICING SYSTEM ---

class CreateInvoiceModal(Modal, title="Create Invoice"):
    def __init__(self, cog: 'BankCog', sender_account: str):
        super().__init__()
        self.cog = cog
        self.sender_account = sender_account
        
        self.recipient = TextInput(label="Recipient Account Name", required=True)
        self.amount = TextInput(label="Amount ($)", required=True)
        self.desc = TextInput(label="Description", style=discord.TextStyle.paragraph, required=True)
        self.fee_payer = TextInput(label="Fee Payer? (me/client)", placeholder="Type 'me' or 'client'", default="me", required=True)
        
        self.add_item(self.recipient)
        self.add_item(self.amount)
        self.add_item(self.desc)
        self.add_item(self.fee_payer)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        try:
            amt = float(self.amount.value)
            if amt <= 0: raise ValueError
        except:
            return await interaction.followup.send("❌ Invalid amount.", ephemeral=True)
            
        target_name = self.recipient.value.lower()
        target_acc = self.cog.db.get_account_by_name(target_name)
        if not target_acc:
            return await interaction.followup.send(f"❌ Account `{target_name}` not found.", ephemeral=True)

        fee_choice = 'sender' if 'me' in self.fee_payer.value.lower() else 'recipient'
        
        # Create DB Record
        invoice = self.cog.db.create_invoice(
            sender_account=self.sender_account,
            recipient_name=target_name,
            amount=amt,
            description=self.desc.value,
            fee_payer=fee_choice,
            status='pending'
        )
        
        # Attempt to Notify Recipient via DM
        if target_acc.discord_id:
            try:
                user = await self.cog.bot.fetch_user(int(target_acc.discord_id))
                embed = discord.Embed(title="🧾 You have a new Invoice!", color=discord.Color.blurple())
                embed.add_field(name="From", value=self.sender_account)
                embed.add_field(name="Amount", value=f"${amt:,.2f}")
                embed.add_field(name="Reason", value=self.desc.value)
                embed.set_footer(text=f"Fee paid by: {'Merchant' if fee_choice == 'sender' else 'You'}")
                
                # Send the Persistent "Pay Now" view
                view = PayInvoiceView(self.cog, invoice.id)
                await user.send(embed=embed, view=view)
                
                await interaction.followup.send(f"✅ Invoice #{invoice.id} sent to <@{target_acc.discord_id}>.", ephemeral=True)
                return
            except Exception as e:
                logger.warning(f"Could not DM invoice: {e}")

        await interaction.followup.send(f"✅ Invoice #{invoice.id} created, but could not DM user. They can view it in their dashboard.", ephemeral=True)

class PayInvoiceView(View):
    def __init__(self, cog, invoice_id):
        super().__init__(timeout=None) # Persistent
        self.cog = cog
        self.invoice_id = invoice_id
        
        # Manually create button with static custom_id for persistence
        pay_btn = Button(
            label="💳 Pay Now", 
            style=discord.ButtonStyle.green, 
            custom_id=f"pay_invoice:{invoice_id}" # <--- The key to persistence
        )
        pay_btn.callback = self.pay_callback
        self.add_item(pay_btn)

    async def pay_callback(self, interaction: discord.Interaction):
        # Verify invoice is still pending
        inv = self.cog.db.get_invoice(self.invoice_id)
        if not inv or inv.status != 'pending':
            return await interaction.response.send_message("❌ Invoice not found or already paid.", ephemeral=True)
            
        await interaction.response.send_modal(InvoicePinModal(self.cog, inv))

class InvoicePinModal(Modal, title="Authorize Payment"):
    def __init__(self, cog, invoice):
        super().__init__()
        self.cog = cog
        self.invoice = invoice
        self.pin = TextInput(label="Enter 4-Digit PIN", min_length=4, max_length=4, style=discord.TextStyle.short)
        self.add_item(self.pin)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        # 1. Verify User owns the target account
        user_accounts = self.cog.db.get_all_accounts_for_user(interaction.user.id)
        payer_account = next((a for a in user_accounts if a.account_name == self.invoice.recipient_name), None)
        
        if not payer_account:
            return await interaction.followup.send("❌ You do not own the account billed in this invoice.", ephemeral=True)

        # 2. Verify PIN
        if not self.cog.verify_pin(payer_account, self.pin.value):
            return await interaction.followup.send("❌ Incorrect PIN.", ephemeral=True)

        # 3. Execute Transfer
        base_amount = self.invoice.amount
        res = await self.cog.api.transfer_money(payer_account.account_name, self.invoice.sender_account, base_amount)
        
        if res['success']:
            self.cog.db.update_invoice_status(self.invoice.id, 'paid')
            await interaction.followup.send(f"✅ **Paid!** ${base_amount:,.2f} sent to {self.invoice.sender_account}.", ephemeral=True)
            
            # Disable button on original message if possible
            try:
                await interaction.message.edit(view=None, content=f"✅ **PAID** - ${base_amount:,.2f}")
            except: pass
        else:
            await interaction.followup.send(f"❌ Payment Failed: {res['message']}", ephemeral=True)