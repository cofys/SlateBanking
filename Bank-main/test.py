import sqlite3
import os

db_path = './Bank-main/bank_data.db'
if not os.path.exists(db_path) and os.path.exists('/data/bank.db'):
    db_path = '/data/bank.db'

conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute("SELECT description, category, sum(amount) FROM corp_transactions WHERE amount < 0 GROUP BY description, category LIMIT 20")
for row in c.fetchall():
    print(row)

c.execute("SELECT description, category, sum(amount) FROM corp_transactions WHERE amount > 0 AND category != 'fee' GROUP BY description, category LIMIT 20")
print("---")
for row in c.fetchall():
    print(row)

conn.close()
