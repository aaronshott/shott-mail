import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/server/store.ts';
import { resolve, join } from 'node:path';

const root = resolve('.test-data');
mkdirSync(root, { recursive: true, mode: 0o700 });

// Only project-local, disposable SQLite data. Secrets never printed.
test('account credentials persist encrypted and remain bound to account', async () => {
  const dir = mkdtempSync(join(root, 'store-'));
  const key = randomBytes(32);
  const secretA = randomBytes(32).toString('hex');
  const secretB = randomBytes(32).toString('hex');
  const a = randomUUID(); const b = randomUUID();
  let store;
  try {
    store = new Store(join(dir, 'mail.sqlite'), key);
    store.putAccount(a, { label: 'Werk', address: 'work@example.test' }, { imap: secretA, smtp: secretB });
    store.putAccount(b, { label: 'Privé', address: 'private@example.test' }, { imap: secretB, smtp: secretA });
    assert.equal(JSON.stringify(store.listAccounts()).includes(secretA), false);
    assert.equal(store.credentials(a).imap === secretA, true);
    assert.equal(store.credentials(b).imap === secretB, true);
    store.close(); store = undefined;
    assert.equal(readFileSync(join(dir, 'mail.sqlite')).includes(Buffer.from(secretA)), false);
    store = new Store(join(dir, 'mail.sqlite'), key);
    assert.equal(store.listAccounts().length, 2);
    assert.equal(store.credentials(a).smtp === secretB, true);
    store.close(); store = undefined;
    assert.throws(() => new Store(join(dir, 'mail.sqlite'), randomBytes(32)), /KEY_MISMATCH/);
  } finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('new database is owner-only; missing account and swapped ciphertext fail closed', () => {
  const dir = mkdtempSync(join(root, 'security-'));
  const file = join(dir, 'mail.sqlite');
  const key = randomBytes(32);
  const a = randomUUID(); const b = randomUUID();
  let store: Store | undefined;
  try {
    assert.throws(() => new Store(file, randomBytes(16)), /KEY_LENGTH/);
    store = new Store(file, key);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    store.putAccount(a, {label:'Werk',address:'a@example.test'}, {imap:randomBytes(32).toString('hex'),smtp:randomBytes(32).toString('hex')});
    store.putAccount(b, {label:'Privé',address:'b@example.test'}, {imap:randomBytes(32).toString('hex'),smtp:randomBytes(32).toString('hex')});
    assert.throws(() => store!.credentials(randomUUID()), /ACCOUNT_NOT_FOUND/);
    const db = new DatabaseSync(file);
    try {
      db.prepare('UPDATE accounts SET credentials=(SELECT credentials FROM accounts WHERE id=?) WHERE id=?').run(a,b);
    } finally { db.close(); }
    assert.throws(() => store!.credentials(b));
    assert.equal(typeof store.credentials(a).imap, 'string');
  } finally { store?.close(); rmSync(dir, {recursive:true,force:true}); }
});
