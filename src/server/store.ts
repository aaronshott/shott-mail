import { DatabaseSync } from 'node:sqlite';
import { openSync, closeSync, lstatSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type Account = { label: string; address: string };
export type Credentials = { imap: string; smtp: string };

/** Single-writer B1 persistence. The encryption key must come from a separate secret file.
 * Only credentials are encrypted; metadata/drafts need host/backup protection.
 */
export class Store {
  private db: DatabaseSync;
  private key: Buffer;

  constructor(path: string, key: Buffer, busyMs = 5000) {
    if (!Number.isSafeInteger(busyMs) || busyMs <= 0 || busyMs > 2147483647) throw new Error('INVALID_SQLITE_BUSY_TIMEOUT');
    if (key.length !== 32) throw new Error('KEY_LENGTH');
    try { closeSync(openSync(path, 'wx', 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = lstatSync(path);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('DATABASE_PERMISSIONS');
    this.key = Buffer.from(key);
    this.db = new DatabaseSync(path);
    try {
      // DELETE journal avoids dependence on WAL versions; no network FS support claimed.
      this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=${busyMs};`);
      this.db.exec(`CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), check_value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, credentials TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), revision INTEGER NOT NULL, body TEXT NOT NULL);`);
      const row = this.db.prepare('SELECT check_value FROM meta WHERE id=1').get();
      if (row) {
        try { if (this.open(String(row.check_value), 'installation') !== 'shott-mail-key-check-v1') throw new Error(); }
        catch { throw new Error('KEY_MISMATCH'); }
      } else {
        this.db.prepare('INSERT INTO meta VALUES (1,?)').run(this.seal('shott-mail-key-check-v1', 'installation'));
      }
    } catch (error) { this.db.close(); this.key.fill(0); throw error; }
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

  putAccount(id: string, metadata: Account, credentials: Credentials): void {
    this.db.prepare(`INSERT INTO accounts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE
      SET metadata=excluded.metadata, credentials=excluded.credentials`).run(
      id, JSON.stringify(metadata), this.seal(JSON.stringify(credentials), `account:${id}`));
  }

  listAccounts(): (Account & { id: string })[] {
    return this.db.prepare('SELECT id,metadata FROM accounts ORDER BY id').all().map(row =>
      ({ ...JSON.parse(String(row.metadata)), id: String(row.id) }));
  }

  credentials(id: string): Credentials {
    const row = this.db.prepare('SELECT credentials FROM accounts WHERE id=?').get(id);
    if (!row) throw new Error('ACCOUNT_NOT_FOUND');
    return JSON.parse(this.open(String(row.credentials), `account:${id}`));
  }

  saveDraft(id: string, accountId: string, expectedRevision: number, body: {to: string; subject: string; text: string}): number {
    if (!this.db.prepare('SELECT id FROM accounts WHERE id=?').get(accountId)) throw new Error('ACCOUNT_NOT_FOUND');
    const result = this.db.prepare(`INSERT INTO drafts (id,account_id,revision,body)
      SELECT ?,?,1,? WHERE ?=0
      ON CONFLICT(id) DO NOTHING`).run(id,accountId,JSON.stringify(body),expectedRevision);
    if (result.changes === 1) return 1;
    const updated = this.db.prepare(`UPDATE drafts SET body=?,revision=revision+1
      WHERE id=? AND account_id=? AND revision=?`).run(JSON.stringify(body),id,accountId,expectedRevision);
    if (updated.changes !== 1) throw new Error('DRAFT_CONFLICT');
    return expectedRevision + 1;
  }

  draft(id: string): {id: string; accountId: string; revision: number; body: {to: string; subject: string; text: string}} {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id=?').get(id);
    if (!row) throw new Error('DRAFT_NOT_FOUND');
    return {id:String(row.id),accountId:String(row.account_id),revision:Number(row.revision),body:JSON.parse(String(row.body))};
  }

  close(): void { this.db.close(); this.key.fill(0); }
}
