from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
import logging
import asyncio
import yaml

# Imports adjusted to match root execution structure
from db.models import Database, Loan, Account, Transaction
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from utils.cityrp_api import CityRPAPI

logger = logging.getLogger('scheduler')

with open("config.yaml", "r") as f:
    cfg = yaml.safe_load(f)
LOAN_POOL = cfg.get("bank", {}).get("loan_pool", "loans")

class Scheduler:
    def __init__(self, db: Database, api: 'CityRPAPI'):
        self.scheduler = AsyncIOScheduler()
        self.db = db
        self.api = api
        self._is_running = False

    def start(self):
        if self._is_running:
            return
        
        # Schedule jobs
        # 1. Process Loan Payments (Runs daily at 10:00 AM EST / 3:00 PM UTC)
        self.scheduler.add_job(
            self.process_loan_payments,
            CronTrigger(hour=15, minute=0),
            id='process_loan_payments',
            replace_existing=True
        )
        
        # 2. Sync Transactions (Every 5 minutes)
        # DISABLED: We use events.py for live updates now.
        # self.scheduler.add_job(
        #     self.sync_transactions,
        #     CronTrigger(minute='*/5'),
        #     id='sync_transactions',
        #     replace_existing=True
        # )

        self.scheduler.start()
        self._is_running = True
        logger.info("Scheduler started with jobs: process_loan_payments")

    def shutdown(self):
        self.scheduler.shutdown()
        self._is_running = False
        logger.info("Scheduler shut down.")

    async def process_loan_payments(self):
        logger.info("Starting automated loan payment processing...")
        session = self.db.get_session()
        try:
            now = datetime.utcnow()
            due_loans = session.query(Loan).filter(
                Loan.is_active == True,
                Loan.next_due_date <= now
            ).all()
            
            if not due_loans:
                logger.info("No loans due for payment today.")
                return

            for loan in due_loans:
                account = loan.account
                if not account or not account.auto_collect:
                    continue
                
                if loan.term_weeks > 0:
                    payment_amount = loan.total_due / loan.term_weeks
                else:
                    payment_amount = loan.remaining_amount
                
                if payment_amount > loan.remaining_amount:
                    payment_amount = loan.remaining_amount

                logger.info(f"Attempting to collect loan payment ${payment_amount:,.2f} from {account.account_name}")
                
                result = await self.api.transfer_money(account.account_name, LOAN_POOL, payment_amount)
                
                if result['success']:
                    loan.remaining_amount -= payment_amount
                    
                    tx_data = {
                        'id': f"loan-pay-{loan.id}-{int(datetime.utcnow().timestamp())}",
                        'amount': payment_amount,
                        'type': 'debit',
                        'other_account': LOAN_POOL,
                        'description': f"Auto-payment for Loan #{loan.id}",
                        'created_at': datetime.utcnow().isoformat()
                    }
                    self.db.save_transaction(account.account_name, tx_data)

                    if loan.remaining_amount <= 0.01:
                        loan.remaining_amount = 0
                        loan.is_active = False
                        logger.info(f"Loan #{loan.id} for {account.account_name} PAID OFF!")
                    else:
                        loan.next_due_date += timedelta(weeks=1)
                        logger.info(f"Loan #{loan.id} payment successful.")
                    
                    session.commit()
                else:
                    logger.warning(f"Failed to collect loan payment for {account.account_name}: {result['message']}")

        except Exception as e:
            logger.error(f"Error in process_loan_payments: {e}", exc_info=True)
        finally:
            session.close()

    async def sync_transactions(self):
        # Disabled logic placeholder
        pass
