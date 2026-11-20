import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';

export function config(){
 mkdirSync('.test-data',{recursive:true,mode:0o700});
 const dir=mkdtempSync(resolve('.test-data/app-'));
 return {dir,dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1:3000',secureCookie:false,allowedMail:[],sessionMs:60000,staticRoot:resolve('dist/client')};
}
test('own login rejects spoofing, rotates sessions, enforces CSRF and logout',async()=>{
 const mod=await import('../src/server/app.ts').catch(()=>null);
 assert.equal(typeof mod?.buildApp,'function','real Fastify app required');
 const c=config(); const app=await mod!.buildApp(c);
 try {
  assert.equal((await app.inject({url:'/api/accounts',headers:{'x-forwarded-user':'admin'}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:randomBytes(12).toString('hex')}})).statusCode,401);
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:c.password}});
  assert.equal(login.statusCode,200); const cookie=login.headers['set-cookie'];
  assert.ok(String(cookie).includes('HttpOnly'));assert.ok(String(cookie).includes('SameSite=Strict'));
  const headers={cookie:String(cookie).split(';')[0],origin:c.origin,'x-csrf-token':login.json().csrf};
  assert.equal((await app.inject({url:'/api/accounts',headers})).statusCode,200);
  const renewed=await app.inject({method:'POST',url:'/api/login',headers,payload:{password:c.password}});
  assert.equal(renewed.statusCode,200);
  assert.equal((await app.inject({url:'/api/accounts',headers})).statusCode,401,'old session revoked on re-login');
  headers.cookie=String(renewed.headers['set-cookie']).split(';')[0];headers['x-csrf-token']=renewed.json().csrf;
  assert.equal((await app.inject({url:'/api/accounts',headers})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:'/api/logout',headers:{cookie:headers.cookie,origin:c.origin}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/logout',headers:{...headers,origin:'https://attacker.invalid'}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/logout',headers})).statusCode,200);
  assert.equal((await app.inject({url:'/api/accounts',headers})).statusCode,401);
 }finally{await app.close();rmSync(c.dir,{recursive:true,force:true});}
});

test('account settings and drafts persist, send failure retains input and cannot be silently retried',async()=>{
 const {buildApp}=await import('../src/server/app.ts');const c=config();const app=await buildApp(c);
 try{
  const login=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:c.password}});
  const headers={cookie:String(login.headers['set-cookie']).split(';')[0],origin:c.origin,'x-csrf-token':login.json().csrf};
  const ep={host:'mail.invalid',port:993,tls:'implicit',user:'synthetic',password:randomBytes(24).toString('hex')};
  const account=await app.inject({method:'POST',url:'/api/accounts',headers,payload:{label:'Werk',address:'work@example.test',imap:ep,smtp:{...ep,port:465}}});
  assert.equal(account.statusCode,200);
  const id=account.json().id;
  const list=(await app.inject({url:'/api/accounts',headers})).json();assert.equal(list.length,1);assert.equal(JSON.stringify(list).includes(ep.password),false);
  const draftId=crypto.randomUUID();const draft={accountId:id,revision:0,to:'recipient@example.test',subject:'Test',text:'Behoud deze tekst'};
  const saved=await app.inject({method:'PUT',url:`/api/drafts/${draftId}`,headers,payload:draft});assert.equal(saved.statusCode,200);
  const send=await app.inject({method:'POST',url:`/api/drafts/${draftId}/send`,headers,payload:{revision:1}});
  assert.equal(send.statusCode,200);assert.equal(send.json().state,'failed_before_submit');
  const repeat=await app.inject({method:'POST',url:`/api/drafts/${draftId}/send`,headers,payload:{revision:1}});assert.deepEqual(repeat.json(),send.json());
  const retained=(await app.inject({url:`/api/drafts/${draftId}`,headers})).json();assert.equal(retained.body.text,draft.text);
  const changed=await app.inject({method:'PUT',url:`/api/drafts/${draftId}`,headers,payload:{...draft,revision:1,text:'changed'}});assert.equal(changed.statusCode,409);
  const bad=await app.inject({method:'POST',url:'/api/accounts',headers,payload:{label:'Bad',address:'x\r\nBcc: x',imap:ep,smtp:ep}});assert.equal(bad.statusCode,400);
 }finally{await app.close();rmSync(c.dir,{recursive:true,force:true});}
});
