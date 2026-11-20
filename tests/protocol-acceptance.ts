// Acceptance against the real isolated Dovecot/Postfix fixture. Not included in npm test.
import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';import {resolve,join} from 'node:path';import {buildApp} from '../src/server/app.ts';import {testConnection,smtp} from '../src/server/mail.ts';
if(process.env.CONFIRM_SYNTHETIC_FIXTURE!=='yes')throw new Error('Explicit isolated synthetic fixture confirmation required');
const host=process.env.FIXTURE_HOST??'mail';if(!['mail','127.0.0.1'].includes(host))throw new Error('Only isolated fixture or loopback allowed');
const base=process.env.TEST_DATA_DIR??'.test-data';mkdirSync(base,{recursive:true,mode:0o700});const dir=mkdtempSync(resolve(base,'protocol-'));
const secrets=process.env.TEST_SECRET_DIR??'secrets';const ca=readFileSync(join(secrets,'mail.crt'),'utf8');
const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1:3000',secureCookie:false,allowedMail:[`${host}:1993`,`${host}:1587`],sessionMs:60000,staticRoot:resolve('dist/client'),ca,timeoutMs:10000};
const app=await buildApp(c);const checks:string[]=[];
try{
 const l=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:c.password}});assert.equal(l.statusCode,200);
 const headers={origin:c.origin,cookie:String(l.headers['set-cookie']).split(';')[0],'x-csrf-token':l.json().csrf};
 const ids:Record<string,string>={};
 for(const user of ['work','private']){
  const password=readFileSync(join(secrets,user),'utf8').trim();
  const imap={host,port:1993,tls:'implicit' as const,user:`${user}@example.test`,password};const smtp={...imap,port:1587,tls:'starttls' as const};
  assert.equal(await testConnection('imap',imap,c),'OK');assert.equal(await testConnection('smtp',smtp,c),'OK');
  assert.notEqual(await testConnection('imap',{...imap,password:randomBytes(24).toString('hex')},c),'OK');
  assert.notEqual(await testConnection('smtp',{...smtp,password:randomBytes(24).toString('hex')},c),'OK');
  assert.notEqual(await testConnection('imap',imap,{...c,ca:undefined}),'OK');assert.notEqual(await testConnection('smtp',smtp,{...c,ca:undefined}),'OK');
  const a=await app.inject({method:'POST',url:'/api/accounts',headers,payload:{label:user,address:`${user}@example.test`,imap,smtp}});assert.equal(a.statusCode,200);ids[user]=a.json().id;
 }
 checks.push('IMAP+SMTP both accounts, invalid auth and untrusted TLS');
 for(const user of ['work','private']){
  const inbox=(await app.inject({url:`/api/inbox?account=${ids[user]}`,headers})).json();assert.equal(inbox.errors.length,0);assert.ok(inbox.messages.some((m:any)=>m.subject===`Alleen voor ${user}`));assert.ok(inbox.messages.every((m:any)=>m.accountId===ids[user]));assert.ok(!inbox.messages.some((m:any)=>m.subject===`Alleen voor ${user==='work'?'private':'work'}`));
 }
 const both=(await app.inject({url:'/api/inbox?account=all',headers})).json();assert.equal(both.errors.length,0);assert.equal(new Set(both.messages.map((m:any)=>m.accountId)).size,2);checks.push('two inboxes isolated; unified inbox includes both account badges');
 const id=randomUUID(),subject=`B1-isolated-${id}`;
 assert.equal((await app.inject({method:'PUT',url:`/api/drafts/${id}`,headers,payload:{accountId:ids.work,revision:0,to:'private@example.test',subject,text:'Synthetic local protocol delivery'}})).statusCode,200);
 const send=await app.inject({method:'POST',url:`/api/drafts/${id}/send`,headers,payload:{revision:1}});assert.equal(send.json().state,'accepted');
 let message;
 for(let n=0;n<20;n++){const inbox=(await app.inject({url:`/api/inbox?account=${ids.private}`,headers})).json();message=inbox.messages.find((m:any)=>m.subject===subject);if(message)break;await new Promise(r=>setTimeout(r,250));}
 assert.ok(message,'SMTP mail must actually arrive through LMTP in recipient IMAP');
 const read=await app.inject({url:`/api/messages/${ids.private}/${message.validity}/${message.uid}`,headers});assert.equal(read.statusCode,200);assert.equal(read.json().text.trim(),'Synthetic local protocol delivery');assert.ok(read.json().from.includes('work@example.test'));
 const work=(await app.inject({url:`/api/inbox?account=${ids.work}`,headers})).json();assert.equal(work.messages.some((m:any)=>m.subject===subject),false);
 const invalidIdentity=await app.inject({url:`/api/messages/${ids.private}/0/${message.uid}`,headers});assert.equal(invalidIdentity.statusCode,409);
 checks.push('actual SMTP delivery and IMAP read, explicit sender, account isolation, UIDVALIDITY rejection');
 const transport=await smtp({host,port:1587,tls:'starttls',user:'work@example.test',password:readFileSync(join(secrets,'work'),'utf8').trim()},c);
 try{await assert.rejects(transport.sendMail({from:'work@example.test',to:'nobody@outside.invalid',subject:'Relay must reject',text:'Synthetic relay rejection check'}));}finally{transport.close();}
 checks.push('authenticated external relay rejected');
 console.info(JSON.stringify({result:'PASS',checks},null,2));
}finally{await app.close();rmSync(dir,{recursive:true,force:true});}
