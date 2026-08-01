const Database = require('better-sqlite3');
const db = new Database('./sqlite.db', { fileMustExist: false });
try {
  const admins = db.prepare('SELECT * FROM global_admins').all();
  console.log(admins);
} catch (e) { console.log(e.message); }
