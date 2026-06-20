import sqlite3
import os
import sys

def main():
    db_path = './Bank-main/bank_data.db'
    if not os.path.exists(db_path) and os.path.exists('/data/bank.db'):
        db_path = '/data/bank.db'
        
    if not os.path.exists(db_path):
        print(f"DB not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Find non-fee positive ones
    c.execute("SELECT amount, description, category, created_at FROM corp_transactions WHERE amount > 0 AND category != 'fee' AND description NOT LIKE '%Fee%' AND description NOT LIKE '%Tax%' LIMIT 5")
    print("Non-Fee Positive:")
    for r in c.fetchall(): print(r)

    # Find fees
    c.execute("SELECT amount, description, category, created_at FROM corp_transactions WHERE description LIKE '%(WITHDRAW)%' LIMIT 5")
    print("\nWithdraw Fees:")
    for r in c.fetchall(): print(r)

    c.execute("SELECT amount, description, category, created_at FROM corp_transactions WHERE description LIKE '%(DEPOSIT)%' LIMIT 5")
    print("\nDeposit Fees:")
    for r in c.fetchall(): print(r)

    conn.close()

if __name__ == '__main__':
    main()
