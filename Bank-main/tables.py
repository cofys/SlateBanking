import sqlite3
import os

for path in ['./Bank-main/bank_data.db', '/data/bank.db']:
    if not os.path.exists(path):
        continue
    db = sqlite3.connect(path)
    print(f"Tables in {path}:")
    c = db.cursor()
    c.execute("SELECT name FROM sqlite_master WHERE type='table';")
    print([r[0] for r in c.fetchall()])
    
    if path == '/data/bank.db':
        c.execute("SELECT COUNT(*) FROM transactions")
        print("transactions count:", c.fetchone()[0])
