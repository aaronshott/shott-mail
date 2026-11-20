import type {DatabaseSync} from 'node:sqlite';
import {hashSync, verifySync} from '@node-rs/argon2';

export const OWNER_LOGIN = 'admin';
export const passwordOptions = {memoryCost:19456,timeCost:2,parallelism:1};
const version = 10;
const legacyNames = ['meta','auth','sessions','accounts','drafts','sends'];

/** Called in the same startup transaction as installation-key verification. */
export function initializeSchema(db:DatabaseSync, password:string){
 const installed = Number(db.prepare('PRAGMA user_version').get()?.user_version);
 const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>String(r.name)));
 if(installed===version){
  if(!tables.has('meta'))throw new Error('MISSING_KEY_CHECK');
  if(legacyNames.slice(1).some(name=>tables.has(name)))throw new Error('LEGACY_TABLES_AFTER_UPGRADE');
  return;
 }
 if(installed!==0)throw new Error('UNSUPPORTED_SCHEMA');
 if(tables.size && (!tables.has('meta') || !tables.has('auth') || !tables.has('accounts') || !tables.has('drafts') || [...tables].some(name=>!legacyNames.includes(name))))throw new Error('UNRECOGNIZED_B1_SCHEMA');
 const legacy = tables.size>0;
 const oldHash = legacy ? db.prepare('SELECT hash FROM auth WHERE id=1').get()?.hash : undefined;
 if(legacy && (typeof oldHash!=='string' || !verifySync(oldHash,password,passwordOptions)))throw new Error('B1_OWNER_SECRET_MISMATCH');
 if(!legacy && (password.length<16 || password.length>1024))throw new Error('INVALID_INITIAL_PASSWORD_LENGTH');
 db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')));
  CREATE TABLE user_sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    csrf TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE mailboxes (id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
    metadata TEXT NOT NULL, credentials TEXT NOT NULL, UNIQUE(owner_id,id));
  CREATE TABLE user_drafts (owner_id INTEGER NOT NULL, id TEXT NOT NULL, account_id TEXT NOT NULL,
    revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(owner_id,id),
    FOREIGN KEY(owner_id,account_id) REFERENCES mailboxes(owner_id,id));
  CREATE INDEX draft_mailbox ON user_drafts(owner_id,account_id);
  CREATE TABLE send_operations (owner_id INTEGER NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL,
    result TEXT NOT NULL, PRIMARY KEY(owner_id,id),
    FOREIGN KEY(owner_id,id) REFERENCES user_drafts(owner_id,id));`);
 const owner = db.prepare("INSERT INTO users(login,password_hash,role) VALUES(?,?,'admin')")
  .run(OWNER_LOGIN, typeof oldHash==='string' ? oldHash : hashSync(password,passwordOptions)).lastInsertRowid;
 if(legacy){
  db.prepare('INSERT INTO mailboxes SELECT id,?,metadata,credentials FROM accounts').run(owner);
  db.prepare('INSERT INTO user_drafts SELECT ?,id,account_id,revision,body FROM drafts').run(owner);
  if(tables.has('sends')){
   db.prepare('INSERT INTO send_operations SELECT ?,id,state,result FROM sends').run(owner);
   db.exec('DROP TABLE sends');
  }
  db.exec('DROP TABLE drafts; DROP TABLE accounts; DROP TABLE IF EXISTS sessions; DROP TABLE auth;');
 }
 db.exec(`PRAGMA user_version=${version}`);
}
