import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Store } from '../src/server/store.ts';

const password = randomBytes(24).toString('base64url');
const root = resolve('.test-data'); mkdirSync(root, {recursive:true,mode:0o700});
test('draft revision survives reopen and stale update cannot overwrite saved input', () => {
  const dir = mkdtempSync(join(root,'draft-')); const file = join(dir,'mail.sqlite');
  const key = randomBytes(32); const account = randomUUID(); const draft = randomUUID();
  let store = new Store(file,key,password);
  try {
    assert.equal(typeof store.saveDraft, 'function', 'durable draft save required');
    store.putAccount(1,account,{label:'Werk',address:'work@example.test'},{imap:randomBytes(24).toString('hex'),smtp:randomBytes(24).toString('hex')});
    const body = {to:'recipient@example.test', subject:'Synthetisch', text:'Bewaar deze invoer'};
    assert.equal(store.saveDraft(1,draft,account,0,body),1);
    store.close(); store = new Store(file,key,password);
    assert.deepEqual(store.draft(1,draft),{id:draft,accountId:account,revision:1,body});
    assert.throws(() => store.saveDraft(1,draft,account,0,{...body,text:'Verouderde tab'}),/DRAFT_CONFLICT/);
    assert.equal(store.draft(1,draft).body.text,body.text);
    assert.equal(store.saveDraft(1,draft,account,1,{...body,text:'Tweede revisie'}),2);
    assert.throws(() => store.saveDraft(1,randomUUID(),randomUUID(),0,body),/ACCOUNT_NOT_FOUND/);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
