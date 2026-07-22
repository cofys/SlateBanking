import Database from 'better-sqlite3';
const db = new Database('./data/slate_saas.db');
const row = db.prepare("SELECT corp_id, corp_api_uuid, corp_api_key FROM banks WHERE corp_api_key IS NOT NULL LIMIT 1").get();
console.log(row);
