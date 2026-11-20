import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';import {resolve,join} from 'node:path';import {DatabaseSync} from 'node:sqlite';import {buildApp} from '../src/server/app.ts';
test('session expiry survives restart and interrupted preparing/submitting sends never become retryable',async()=>{
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/restart-'));
 const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1:3000',secureCookie:false,allowedMail:[],sessionMs:60000,staticRoot:resolve('dist/client')};
 let app=await buildApp(c);
 try{
  const l=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:c.password}});const headers={origin:c.origin,cookie:String(l.headers['set-cookie']).split(';')[0],'x-csrf-token':l.json().csrf};
  const ep={host:'mail.invalid',port:993,tls:'implicit',user:'synthetic',password:randomBytes(24).toString('hex')};
  const a=(await app.inject({method:'POST',url:'/api/accounts',headers,payload:{label:'Test',address:'work@example.test',imap:ep,smtp:{...ep,port:465}}})).json();
  const ids=[randomUUID(),randomUUID()];
  for(const id of ids)assert.equal((await app.inject({method:'PUT',url:`/api/drafts/${id}`,headers,payload:{accountId:a.id,revision:0,to:'private@example.test',subject:'Recovery',text:'blijft'}})).statusCode,200);
  await app.close();const db=new DatabaseSync(c.dbPath);
  db.prepare('INSERT INTO sends VALUES(?,?,?)').run(ids[0],'preparing','{}');db.prepare('INSERT INTO sends VALUES(?,?,?)').run(ids[1],'submitting','{}');db.close();
  app=await buildApp(c);
  for(const id of ids){const op=await app.inject({method:'POST',url:`/api/drafts/${id}/send`,headers,payload:{revision:1}});assert.equal(op.json().state,'outcome_unknown');}
  const expiry=new DatabaseSync(c.dbPath);expiry.exec('UPDATE sessions SET expires=0');expiry.close();assert.equal((await app.inject({url:'/api/accounts',headers})).statusCode,401);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
