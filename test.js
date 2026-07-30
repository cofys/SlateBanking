const db = require('better-sqlite3')('data/sqlite.db');
console.log(db.prepare('SELECT id, custom_domain FROM banks').all());
