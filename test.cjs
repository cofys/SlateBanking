const db = require('better-sqlite3')('data/slate_saas.db');
console.log(db.prepare('SELECT id, name, custom_domain FROM banks').all());
