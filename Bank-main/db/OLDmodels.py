from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship, joinedload # <--- FIX: Added joinedload
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
    account_type = Column(String)  # 'personal', 'business', 'government'
    pin = Column(String)  # Hashed
    secret_question = Column(String)
    secret_answer = Column(String)  # Hashed
    frozen = Column(Boolean, default=False)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # --- NEW LOAN FIELDS ---
    loan_rating = Column(Float, default=1.0) # 1.0 is neutral, drops with late payments
    auto_collect = Column(Boolean, default=True) # User setting for automated collection
    
    # Relationships
    members = relationship("AccountMember", back_populates="account", cascade="all, delete-orphan")
    loans = relationship("Loan", back_populates="account")
    applications = relationship("LoanApplication", back_populates="account")
    transactions = relationship("Transaction", back_populates="account", order_by="desc(Transaction.timestamp)")

class Transaction(Base):
    __tablename__ = 'transactions'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    remote_id = Column(String, unique=True) # Unique ID from API to prevent duplicates
    amount = Column(Float)
    trans_type = Column(String) # 'credit' or 'debit'
    other_party = Column(String) # The account name of sender/receiver
    description = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    account = relationship("Account", back_populates="transactions")

class AccountMember(Base):
    __tablename__ = 'account_members'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    discord_id = Column(String, nullable=False)
    role = Column(String, default='viewer')  # 'owner', 'admin', 'viewer'
    
    account = relationship("Account", back_populates="members")

class LoanProduct(Base):
    __tablename__ = 'loan_products'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, unique=True, nullable=False)
    min_amount = Column(Float, default=100.00)
    max_amount = Column(Float, default=10000.00)
    interest_rate = Column(Float, nullable=False)
    term_weeks = Column(Integer, default=4)
    origination_fee_percent = Column(Float, default=0.0) # e.g., 0.02 for 2%
    is_active = Column(Boolean, default=True)

class Loan(Base):
    __tablename__ = 'loans'
    id = Column(Integer, primary_key=True, autoincrement=True)
    account_name = Column(String, ForeignKey('accounts.account_name'))
    product_id = Column(Integer, ForeignKey('loan_products.id')) # Link to product
    amount = Column(Float, nullable=False) # Principal Amount
    interest_rate = Column(Float, nullable=False)
    term_weeks = Column(Integer, nullable=False)
    collateral = Column(Text) # NEW: Collateral field
    
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
    product_id = Column(Integer, ForeignKey('loan_products.id')) # Link to product
    amount = Column(Float, nullable=False)
    purpose = Column(Text)
    collateral = Column(Text) # NEW: Collateral field
    income_proof = Column(Text)
    status = Column(String, default='pending')  # 'pending', 'approved', 'denied'
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="applications")
    product = relationship("LoanProduct")

class Database:
    def __init__(self, db_path):
        self.engine = create_engine(f'sqlite:///{db_path}')
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)

    def get_session(self):
        return self.Session()

    def create_account(self, **kwargs):
        session = self.Session()
        try:
            new_account = Account(**kwargs)
            session.add(new_account)
            session.commit()
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
            # Returns the first personal account found for the user
            return session.query(Account).filter_by(discord_id=str(discord_id), account_type='personal').first()
        finally:
            session.close()

    def get_account_by_name(self, account_name):
        session = self.Session()
        try:
            return session.query(Account).filter_by(account_name=account_name.lower()).first()
        finally:
            session.close()

    def get_all_accounts_for_user(self, discord_id):
        session = self.Session()
        try:
            # Get personal account
            accounts = session.query(Account).filter_by(discord_id=str(discord_id)).all()
            # Get member accounts
            member_records = session.query(AccountMember).filter_by(discord_id=str(discord_id)).all()
            for record in member_records:
                account = session.query(Account).filter_by(account_name=record.account_name).first()
                if account and account not in accounts:
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
    
    # --- Transaction Methods ---
    def save_transaction(self, account_name, tx_data):
        session = self.Session()
        try:
            # Use remote_id (from API) to check if transaction already exists
            remote_id = tx_data.get('id')
            if not remote_id:
                # Fallback generator if API doesn't send ID (unlikely but safe)
                remote_id = f"{tx_data.get('timestamp')}-{tx_data.get('amount')}"

            exists = session.query(Transaction).filter_by(remote_id=str(remote_id)).first()
            if exists:
                return False # Skip duplicates

            # Parse timestamp
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
            return session.query(Account).all()
        finally:
            session.close()
    
    # --- Loan Product Methods ---
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
            
    def create_loan_product(self, name, rate, term_weeks, fee):
        session = self.Session()
        try:
            new_product = LoanProduct(
                name=name,
                interest_rate=rate,
                term_weeks=term_weeks,
                origination_fee_percent=fee
            )
            session.add(new_product)
            session.commit()
            return new_product
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating loan product: {e}")
            raise
        finally:
            session.close()

    def update_loan_product(self, product_id, name, rate, term_weeks, fee):
        session = self.Session()
        try:
            product = session.query(LoanProduct).filter_by(id=product_id).first()
            if product:
                product.name = name
                product.interest_rate = rate
                product.term_weeks = term_weeks
                product.origination_fee_percent = fee
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

    # --- Loan Application Methods ---
    def get_pending_loan_applications(self):
        session = self.Session()
        try:
            # FIX: Eagerly load 'product' and 'account' to prevent DetachedInstanceError
            return session.query(LoanApplication).options(
                joinedload(LoanApplication.product),
                joinedload(LoanApplication.account)
            ).filter_by(status='pending').all()
        finally:
            session.close()
            
    def get_loan_application_by_id(self, app_id):
        session = self.Session()
        try:
            # FIX: Eager load relations here too
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

    # --- Loan Management Methods ---
    def get_active_loans(self):
        session = self.Session()
        try:
            # FIX: Eager load 'account' for scheduler usage
            return session.query(Loan).options(joinedload(Loan.account)).filter_by(is_active=True).all()
        finally:
            session.close()

    def create_loan(self, **kwargs):
        session = self.Session()
        try:
            new_loan = Loan(**kwargs)
            session.add(new_loan)
            session.commit()
            return new_loan
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating loan: {e}")
            raise
        finally:
            session.close()