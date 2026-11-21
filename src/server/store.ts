import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, lstatSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { initializeSchema } from './schema.ts';

export type Account = { label: string; address: string };
export type Credentials = { imap: string; smtp: string };
type DraftBody = {to: string; subject: string; text: string};

/** Single writer; credentials are encrypted, metadata/drafts need host protection. */
export class Store {
  readonly db: DatabaseSync;
  private key: Buffer;

  constructor(path: string, key: Buffer, password: string, busyMs = 5000) {
    if (!Number.isSafeInteger(busyMs) || busyMs <= 0 || busyMs > 2147483647) throw new Error('INVALID_SQLITE_BUSY_TIMEOUT');
    if (key.length !== 32) throw new Error('KEY_LENGTH');
    try { closeSync(openSync(path, 'wx', 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('DATABASE_PERMISSIONS');
    this.key = Buffer.from(key);
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=${busyMs}; BEGIN IMMEDIATE;`);
      const hasMeta = this.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='meta'").get();
      if (hasMeta) {
        const row = this.db.prepare('SELECT check_value FROM meta WHERE id=1').get();
        try { if (!row || this.open(String(row.check_value), 'installation') !== 'shott-mail-key-check-v1') throw new Error(); }
        catch { throw new Error('KEY_MISMATCH'); }
      }
      initializeSchema(this.db,password);
      // Additive to schema 10: older binaries can still read the installation.
      this.db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        language TEXT NOT NULL CHECK(language IN ('nl','en')),
        theme TEXT NOT NULL CHECK(theme IN ('system','light','dark')))`);
      if (!this.db.prepare("SELECT 1 FROM pragma_table_info('user_preferences') WHERE name='reader_format'").get()) {
        this.db.exec("ALTER TABLE user_preferences ADD COLUMN reader_format TEXT NOT NULL DEFAULT 'plain' CHECK(reader_format IN ('plain','html'))");
      }
      if (!hasMeta) {
        this.db.exec('CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id=1), check_value TEXT NOT NULL)');
        this.db.prepare('INSERT INTO meta VALUES (1,?)').run(this.seal('shott-mail-key-check-v1', 'installation'));
      }
      this.db.exec(`UPDATE send_operations SET state='outcome_unknown',result='{}' WHERE state IN ('preparing','submitting');
        UPDATE send_operations SET result=json_set(result,'$.filing.status',CASE json_extract(result,'$.filing.status') WHEN 'appending' THEN 'uncertain' ELSE 'failed' END)
        WHERE state='accepted' AND json_extract(result,'$.filing.status') IN ('pending','appending'); COMMIT;`);
    } catch (error) { this.close(); throw error; }
  }

  private seal(value: string, binding: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(`shott-mail:v1:${binding}`));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  private open(value: string, binding: string): string {
    const data = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(`shott-mail:v1:${binding}`));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }

  putAccount(owner: number, id: string, metadata: Account, credentials: Credentials): void {
    const result = this.db.prepare(`INSERT INTO mailboxes (owner_id,id,metadata,credentials) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE
      SET metadata=excluded.metadata, credentials=excluded.credentials WHERE mailboxes.owner_id=excluded.owner_id`).run(
      owner,id,JSON.stringify(metadata),this.seal(JSON.stringify(credentials),`account:${id}`));
    if (result.changes!==1) throw new Error('ACCOUNT_NOT_FOUND');
  }

  listAccounts(owner: number): (Account & { id: string })[] {
    return this.db.prepare('SELECT id,metadata FROM mailboxes WHERE owner_id=? ORDER BY id').all(owner).map(row =>
      ({ ...JSON.parse(String(row.metadata)), id: String(row.id) }));
  }

  account(owner:number,id:string): Account & {id:string} {
    const row = this.db.prepare('SELECT metadata FROM mailboxes WHERE owner_id=? AND id=?').get(owner,id);
    if (!row) throw new Error('ACCOUNT_NOT_FOUND');
    return {...JSON.parse(String(row.metadata)),id};
  }

  credentials(owner: number, id: string): Credentials {
    const row = this.db.prepare('SELECT credentials FROM mailboxes WHERE owner_id=? AND id=?').get(owner,id);
    if (!row) throw new Error('ACCOUNT_NOT_FOUND');
    return JSON.parse(this.open(String(row.credentials), `account:${id}`));
  }

  saveDraft(owner: number, id: string, accountId: string, expectedRevision: number, body: DraftBody): number {
    if (!this.db.prepare('SELECT 1 FROM mailboxes WHERE owner_id=? AND id=?').get(owner,accountId)) throw new Error('ACCOUNT_NOT_FOUND');
    const result = this.db.prepare(`INSERT INTO user_drafts (owner_id,id,account_id,revision,body)
      SELECT ?,?,?,1,? WHERE ?=0 ON CONFLICT(owner_id,id) DO NOTHING`).run(owner,id,accountId,JSON.stringify(body),expectedRevision);
    if (result.changes === 1) return 1;
    const updated = this.db.prepare(`UPDATE user_drafts SET body=?,revision=revision+1
      WHERE owner_id=? AND id=? AND account_id=? AND revision=?`).run(JSON.stringify(body),owner,id,accountId,expectedRevision);
    if (updated.changes !== 1) throw new Error('DRAFT_CONFLICT');
    return expectedRevision + 1;
  }

  draft(owner: number, id: string): {id: string; accountId: string; revision: number; body: DraftBody} {
    const row = this.db.prepare('SELECT * FROM user_drafts WHERE owner_id=? AND id=?').get(owner,id);
    if (!row) throw new Error('DRAFT_NOT_FOUND');
    return {id:String(row.id),accountId:String(row.account_id),revision:Number(row.revision),body:JSON.parse(String(row.body))};
  }

  close(): void { this.db.close(); this.key.fill(0); }
}
