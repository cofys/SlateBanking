from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, joinedload
from datetime import datetime
import logging

Base = declarative_base()
logger = logging.getLogger('database')

class Account(Base):
    __tablename__ = 'accounts'
    account_name = Column(String, primary_key=True)
    discord_id = Column(String, nullable=False)
    mc_username = Column(String)
    rp_name = Column(String)
    nickname = Column(String)
    registered_address = Column(Text)
    account_type = Column(String)
    pin = Column(String)
    secret_question = Column(String)
    secret_answer = Column(String)
    frozen = Column(Boolean, default=False)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Loan Fields
    loan_rating = Column(Float, default=1.0)
    auto_collect = Column(Boolean, default=True) 
    custom_withdrawal_tax_percent = Column(Float, nullable=True)
    
    # Relationships
    members = relationship("AccountMember", back_populates="account", cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="account")
    applications = relationship("LoanApplication", back_populates="account")
    transactions = relationship("Transaction", back_populates="account", order_by="desc(Transaction.timestamp)")
    
    # Business Relationships
    payroll_history = relationship("PayrollEntry", back_populates="employer")
    sent_invoices = relationship("Invoice", back_populates="sender")

class Transaction(Base):
    __tablename__ = 'transactions'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    remote_id = Column(String, unique=True)
    amount = Column(Float)
    trans_type = Column(String)
    other_party = Column(String)
    description = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    account = relationship("Account", back_populates="transactions")

class AccountMember(Base):
    __tablename__ = 'account_members'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    discord_id = Column(String, nullable=False)
    role = Column(String, default='viewer')
    
    account = relationship("Account", back_populates="members")

class LoanProduct(Base):
    __tablename__ = 'loan_products'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    min_amount = Column(Float, default=100.00)
    max_amount = Column(Float, default=10000.00) 
    interest_rate = Column(Float, nullable=False)
    term_weeks = Column(Integer, default=4)
    origination_fee_percent = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)

class Loan(Base):
    __tablename__ = 'loans'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    product_id = Column(Integer, ForeignKey('loan_products.id'))
    amount = Column(Float, nullable=False)
    interest_rate = Column(Float, nullable=False)
    term_weeks = Column(Integer, nullable=False)
    collateral = Column(Text)
    
    total_due = Column(Float, nullable=False)
    remaining_amount = Column(Float)
    next_due_date = Column(DateTime)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="loans")
    product = relationship("LoanProduct")

class LoanApplication(Base):
    __tablename__ = 'loan_applications'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    discord_id = Column(String, nullable=False)
    product_id = Column(Integer, ForeignKey('loan_products.id'))
    amount = Column(Float, nullable=False)
    purpose = Column(Text)
    collateral = Column(Text)
    income_proof = Column(Text)
    status = Column(String, default='pending')
    created_at = Column(DateTime, default=datetime.utcnow)
    
    interest_rate = Column(Float, nullable=True)
    term_weeks = Column(Integer, nullable=True)

    account = relationship("Account", back_populates="applications")
    product = relationship("LoanProduct")

class PayrollEntry(Base):
    __tablename__ = 'payroll_entries'
    id = Column(Integer, primary_key=True, autoincrement=True)
    employer_account = Column(String, ForeignKey('accounts.account_name'))
    recipient_name = Column(String)
    recipient_account = Column(String)
    amount = Column(Float)
    description = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    employer = relationship("Account", back_populates="payroll_history")

class Invoice(Base):
    __tablename__ = 'invoices'
    id = Column(Integer, primary_key=True, autoincrement=True)
    sender_account = Column(String, ForeignKey('accounts.account_name'))
    recipient_name = Column(String)
    amount = Column(Float, nullable=False)
    description = Column(String)
    fee_payer = Column(String, default='sender')
    status = Column(String, default='pending')
    created_at = Column(DateTime, default=datetime.utcnow)
    
    sender = relationship("Account", back_populates="sent_invoices")

class Database:
    def __init__(self, db_path):
        self.engine = create_engine(f'sqlite:///{db_path}')
        Base.metadata.create_all(self.engine)
        self._ensure_account_columns()
        self.Session = sessionmaker(bind=self.engine)

    def _ensure_account_columns(self):
        with self.engine.connect() as conn:
            columns = conn.execute(text("PRAGMA table_info(accounts)")).fetchall()
            column_names = {row[1] for row in columns}
            if "custom_withdrawal_tax_percent" not in column_names:
                conn.execute(text("ALTER TABLE accounts ADD COLUMN custom_withdrawal_tax_percent REAL"))

    def get_session(self):
        return self.Session()

    def create_account(self, **kwargs):
        session = self.Session()
        try:
            new_account = Account(**kwargs)
            session.add(new_account)
            session.commit()
            session.refresh(new_account)
            session.expunge(new_account)
            return new_account
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating account: {e}")
            raise
        finally:
            session.close()

    def get_account_by_discord_id(self, discord_id):
        session = self.Session()
        try:
            # Load, Expunge, Return
            acc = session.query(Account).filter_by(discord_id=str(discord_id), account_type='personal').first()
            if acc: session.expunge(acc)
            return acc
        finally:
            session.close()

    def get_account_by_name(self, account_name):
        session = self.Session()
        try:
            acc = session.query(Account).filter_by(account_name=account_name.lower()).first()
            if acc: session.expunge(acc)
            return acc
        finally:
            session.close()

    def get_all_accounts_for_user(self, discord_id):
        session = self.Session()
        try:
            accounts = session.query(Account).filter_by(discord_id=str(discord_id)).all()
            for a in accounts: session.expunge(a)

            member_records = session.query(AccountMember).filter_by(discord_id=str(discord_id)).all()
            for record in member_records:
                # Re-query to get the full account object
                account = session.query(Account).filter_by(account_name=record.account_name).first()
                if account:
                    session.expunge(account)
                    # Deduplicate
                    if not any(x.account_name == account.account_name for x in accounts):
                        accounts.append(account)
            return accounts
        finally:
            session.close()

    def update_account_pin(self, account_name, new_pin_hash):
        session = self.Session()
        try:
            account = session.query(Account).filter_by(account_name=account_name).first()
            if account:
                account.pin = new_pin_hash
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating PIN: {e}")
            return False
        finally:
            session.close()

    def update_account_secret(self, account_name, new_question, new_answer_hash):
        session = self.Session()
        try:
            account = session.query(Account).filter_by(account_name=account_name).first()
            if account:
                account.secret_question = new_question
                account.secret_answer = new_answer_hash
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating secret: {e}")
            return False
        finally:
            session.close()
    
    def toggle_auto_collect(self, account_name: str, enabled: bool):
        session = self.Session()
        try:
            account = session.query(Account).filter_by(account_name=account_name).first()
            if account:
                account.auto_collect = enabled
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Error toggling auto_collect: {e}")
            return False
    
    def save_transaction(self, account_name, tx_data):
        session = self.Session()
        try:
            remote_id = tx_data.get('id')
            if not remote_id:
                remote_id = f"{tx_data.get('timestamp')}-{tx_data.get('amount')}"

            exists = session.query(Transaction).filter_by(remote_id=str(remote_id)).first()
            if exists:
                return False

            try:
                ts = datetime.fromisoformat(tx_data.get('created_at').replace('Z', '+00:00'))
            except:
                ts = datetime.utcnow()

            new_tx = Transaction(
                account_name=account_name,
                remote_id=str(remote_id),
                amount=float(tx_data.get('amount', 0)),
                trans_type=tx_data.get('type', 'unknown'),
                other_party=tx_data.get('other_account', 'System'),
                description=tx_data.get('description', ''),
                timestamp=ts
            )
            session.add(new_tx)
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Error saving transaction: {e}")
            return False
        finally:
            session.close()

    def get_transactions(self, account_name, limit=10):
        session = self.Session()
        try:
            return session.query(Transaction).filter_by(account_name=account_name)\
                .order_by(Transaction.timestamp.desc()).limit(limit).all()
        finally:
            session.close()

    def get_all_accounts(self):
        session = self.Session()
        try:
            accs = session.query(Account).all()
            for a in accs: session.expunge(a)
            return accs
        finally:
            session.close()
    
    def get_all_loan_products(self):
        session = self.Session()
        try:
            return session.query(LoanProduct).all()
        finally:
            session.close()
            
    def get_active_loan_products(self):
        session = self.Session()
        try:
            return session.query(LoanProduct).filter_by(is_active=True).all()
        finally:
            session.close()

    def get_loan_product_by_id(self, product_id):
        session = self.Session()
        try:
            return session.query(LoanProduct).filter_by(id=product_id).first()
        finally:
            session.close()
            
    def create_loan_product(self, name, rate, term_weeks, fee, max_amount=10000.00):
        session = self.Session()
        try:
            new_product = LoanProduct(
                name=name,
                interest_rate=rate,
                term_weeks=term_weeks,
                origination_fee_percent=fee,
                max_amount=max_amount
            )
            session.add(new_product)
            session.commit()
            session.refresh(new_product)
            session.expunge(new_product)
            return new_product
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating loan product: {e}")
            raise
        finally:
            session.close()

    def update_loan_product(self, product_id, name, rate, term_weeks, fee, max_amount):
        session = self.Session()
        try:
            product = session.query(LoanProduct).filter_by(id=product_id).first()
            if product:
                product.name = name
                product.interest_rate = rate
                product.term_weeks = term_weeks
                product.origination_fee_percent = fee
                product.max_amount = max_amount
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating loan product {product_id}: {e}")
            return False
        finally:
            session.close()
            
    def update_loan_product_status(self, product_id, is_active):
        session = self.Session()
        try:
            product = session.query(LoanProduct).filter_by(id=product_id).first()
            if product:
                product.is_active = is_active
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating loan product status {product_id}: {e}")
            return False

    def get_pending_loan_applications(self):
        session = self.Session()
        try:
            return session.query(LoanApplication).options(
                joinedload(LoanApplication.product),
                joinedload(LoanApplication.account)
            ).filter_by(status='pending').all()
        finally:
            session.close()
            
    def get_loan_application_by_id(self, app_id):
        session = self.Session()
        try:
            return session.query(LoanApplication).options(
                joinedload(LoanApplication.product),
                joinedload(LoanApplication.account)
            ).filter_by(id=app_id).first()
        finally:
            session.close()
            
    def create_loan_application(self, account_name, discord_id, product_id, amount, purpose, collateral):
        session = self.Session()
        try:
            new_app = LoanApplication(
                account_name=account_name,
                discord_id=discord_id,
                product_id=product_id,
                amount=amount,
                purpose=purpose,
                collateral=collateral
            )
            session.add(new_app)
            session.commit()
            session.refresh(new_app)
            session.expunge(new_app)
            return new_app
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating loan application: {e}")
            raise
        finally:
            session.close()
            
    def update_loan_application_status(self, app_id, status):
        session = self.Session()
        try:
            app = session.query(LoanApplication).filter_by(id=app_id).first()
            if app:
                app.status = status
                session.commit()
                return True
            return False
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating application status: {e}")
            return False
        finally:
            session.close()

    def get_active_loans(self):
        session = self.Session()
        try:
            return session.query(Loan).options(joinedload(Loan.account)).filter_by(is_active=True).all()
        finally:
            session.close()

    def create_loan(self, **kwargs):
        session = self.Session()
        try:
            new_loan = Loan(**kwargs)
            session.add(new_loan)
            session.commit()
            session.refresh(new_loan)
            session.expunge(new_loan)
            return new_loan
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating loan: {e}")
            raise
        finally:
            session.close()
            
    def create_invoice(self, **kwargs):
        session = self.Session()
        try:
            new_invoice = Invoice(**kwargs)
            session.add(new_invoice)
            session.commit()
            session.refresh(new_invoice) 
            session.expunge(new_invoice)
            return new_invoice
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating invoice: {e}")
            raise
        finally:
            session.close()
            
    def get_invoice(self, invoice_id):
        session = self.Session()
        try:
            inv = session.query(Invoice).filter_by(id=invoice_id).first()
            if inv: session.expunge(inv)
            return inv
        finally:
            session.close()
            
    def update_invoice_status(self, invoice_id, status):
        session = self.Session()
        try:
            inv = session.query(Invoice).filter_by(id=invoice_id).first()
            if inv:
                inv.status = status
                session.commit()
                return True
            return False
        finally:
            session.close()

    def create_payroll_entry(self, **kwargs):
        session = self.Session()
        try:
            entry = PayrollEntry(**kwargs)
            session.add(entry)
            session.commit()
            session.refresh(entry)
            session.expunge(entry)
            return entry
        finally:
            session.close()
