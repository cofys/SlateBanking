const Database = require('better-sqlite3');
const db = new Database('./data/slate_saas.db');
console.log(db.prepare('SELECT id, name, city_corp_app_id, city_corp_app_secret FROM banks').all());
