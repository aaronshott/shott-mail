import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';
import {compile} from 'svelte/compiler';
test('real Svelte frontend compiles and provides login, account, inbox and composer screens',()=>{
 assert.equal(existsSync('src/client/App.svelte'),true,'frontend must exist');
 const source=readFileSync('src/client/App.svelte','utf8');const result=compile(source,{generate:'client'});
 assert.ok(result.js.code.length>0);assert.ok(source.includes('/api/login'));assert.ok(source.includes('/api/inbox'));assert.ok(source.includes('/api/accounts'));assert.ok(source.includes('/send'));
 assert.equal(source.includes('localStorage'),false);assert.equal(source.includes('{@html'),false);
});
