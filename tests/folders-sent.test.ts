import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {buildApp,type Config} from '../src/server/app.ts';
import {Store} from '../src/server/store.ts';
import {startMailFixture} from './mail-fixture.ts';
import type {Folder} from '../src/server/folders.ts';

async function withFixture(run:(ctx:Awaited<ReturnType<typeof setup>>)=>Promise<void>){
 const f=await setup();try{await run(f);}finally{await f.close();}
}
async function setup(){
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/folders-sent-'));
 const mail=await startMailFixture(dir,true);
 const c:Config={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1',secureCookie:false,sessionMs:60000,staticRoot:resolve('dist/client'),pageSize:1,mailMode:'fixture',allowedMail:mail.allowedMail,ca:mail.ca,timeoutMs:2000};
 let app=await buildApp(c);
 async function session(login:string,password:string){
  const r=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{login,password}});assert.equal(r.statusCode,200,r.body);
  const headers={origin:c.origin,cookie:String(r.headers['set-cookie']).split(';')[0],'x-csrf-token':r.json().csrf};
  return async(url:string,method:'GET'|'POST'|'PUT'='GET',payload?:object)=>app.inject({url,method,headers,payload});
 }
 const admin=await session('admin',c.password);
 const account=(await admin('/api/accounts','POST',mail.mailbox('work'))).json().id as string;
 const folderPath=`/api/accounts/${account}/folders`;
 const folders=async()=>{const r=await admin(folderPath);assert.equal(r.statusCode,200,r.body);return r.json<Folder[]>();};
 const policy=(policy:string,folder?:string)=>admin(`/api/accounts/${account}/sent`,'PUT',{policy,...(folder?{folder}:{})});
 async function draft(){const id=randomUUID();const r=await admin(`/api/drafts/${id}`,'PUT',{accountId:account,revision:0,to:'private@example.test',subject:`Synthetic ${id}`,text:'first line\n.\nUnicode: 旅行\nlast line'});assert.equal(r.statusCode,200,r.body);return id;}
 const send=async(id:string)=>{const r=await admin(`/api/drafts/${id}/send`,'POST',{revision:1});assert.equal(r.statusCode,200,r.body);return r.json();};
 const check=async(id:string)=>{const r=await admin(`/api/drafts/${id}/check-sent`,'POST',{});assert.equal(r.statusCode,200,r.body);return r.json();};
 const restart=async(interrupt?:()=>void)=>{await app.close();interrupt?.();app=await buildApp(c);};
 return {mail,c,admin,session,account,folderPath,folders,policy,draft,send,check,restart,close:async()=>{await app.close();await mail.close();rmSync(dir,{recursive:true,force:true});}};
}

test('LIST, owned absolute mailbox identity, UIDVALIDITY paging and sanitized UID read',()=>withFixture(async f=>{
 const folders=await f.folders(),nested=folders.find(x=>x.path==='INBOX/Projects/旅行')!,parent=folders.find(x=>x.path==='INBOX/Projects')!;
 assert.equal(folders.length,7);assert.equal(nested.subscribed,false);assert.equal(parent.selectable,false);assert.equal(folders.find(x=>x.path==='Shared')?.selectable,false);
 assert(folders.find(x=>x.path==='Shared/Custom & Sent')?.selectable);
 const path=(id:string)=>`${f.folderPath}/${id}/messages`;
 assert.equal((await f.admin(path(parent.id))).statusCode,404);
 assert.equal((await f.admin(path('f'.repeat(64)))).statusCode,404);
 assert.equal((await f.admin(path('INBOX%0D%0A'))).statusCode,400);
 const first=(await f.admin(path(nested.id))).json();assert.equal(first.validity,'44');assert.equal(first.hasMore,true);assert.equal(first.messages[0].uid,2);
 assert.equal((await f.admin(`${path(nested.id)}?page=1`)).statusCode,400);
 const second=(await f.admin(`${path(nested.id)}?page=1&validity=44`)).json();assert.equal(second.hasMore,false);assert.equal(second.messages[0].uid,1);
 const read=(await f.admin(`${path(nested.id)}/44/1`)).json();assert.equal(read.subject,'Nested 1 for work@example.test');assert.equal(read.html.trim(),'<p>Nested body 1</p>');
 const inbox=(await f.admin('/api/inbox')).json();assert.equal(inbox.messages.length,1);assert.match(inbox.messages[0].subject,/^Seed for work/);
 assert.match((await f.admin(`/api/messages/${f.account}/33/1`)).json().text,/Private body/);
 f.mail.behavior.validity=55;
 assert.equal((await f.admin(`${path(nested.id)}?page=1&validity=44`)).statusCode,409);
 assert.equal((await f.admin(`${path(nested.id)}/44/1`)).statusCode,409);
 const otherPassword=randomBytes(24).toString('hex');assert.equal((await f.admin('/api/admin/users','POST',{login:'other',password:otherPassword})).statusCode,201);
 const other=await f.session('other',otherPassword),otherId=(await other('/api/accounts','POST',f.mail.mailbox('other'))).json().id;
 const sendId=await f.draft(),authBefore=f.mail.metrics().imapAuth;
 for(const url of [f.folderPath,path(nested.id),`${path(nested.id)}/55/1`])assert.equal((await other(url)).statusCode,400);
 assert.equal((await other(`/api/accounts/${f.account}/sent`,'PUT',{policy:'client'})).statusCode,400);
 assert.equal((await other(`/api/drafts/${sendId}/check-sent`,'POST',{})).json(),null);
 assert.equal(f.mail.metrics().imapAuth,authBefore);
 assert.equal((await other(`/api/accounts/${otherId}/folders/${nested.id}/messages`)).statusCode,404);
}));

test('provider policies: immediate/delayed/missing saves, checks never append or resubmit',()=>withFixture(async f=>{
 for(const provider of ['auto','delay','none'] as const){
  f.mail.behavior.provider=provider;const id=await f.draft(),before=f.mail.submitted.length;
  const op=await f.send(id);assert.equal(op.state,'accepted');assert.equal(op.filing.status,'provider_unverified');
  const checked=await f.check(id);
  if(provider==='auto')assert.equal(checked.filing.status,'observed');
  else{assert.equal(checked.observation,'not_seen');assert.equal(checked.filing.status,'provider_unverified');}
  if(provider==='delay'){await f.restart();f.mail.releaseProvider();assert.equal((await f.check(id)).filing.status,'observed');}
  assert.equal((await f.send(id)).messageId,op.messageId);assert.equal(f.mail.submitted.length,before+1);assert.equal(f.mail.appendCount(),0);
 }
}));

test('client policy: exact submitted MIME; absent/dual Sent flags require explicit owned selectable target',()=>withFixture(async f=>{
 assert.equal((await f.policy('client')).statusCode,200);
 const id=await f.draft();const outcomes=await Promise.all([f.send(id),f.send(id)]);
 const op=outcomes.find(r=>r.filing?.status==='filed');assert(op);
 assert.equal(f.mail.submitted.length,1);assert.equal(f.mail.appendCount(),1);
 assert.equal(f.mail.submitted[0],f.mail.appended[0]);assert(f.mail.appended[0].includes(`Message-ID: ${op.messageId}`));
 const fs=await f.folders(),custom=fs.find(x=>x.path==='Shared/Custom & Sent')!,parent=fs.find(x=>x.path==='Shared')!;
 assert.equal((await f.policy('client',parent.id)).statusCode,404);
 for(const flagCount of [0,2]){
  f.mail.behavior.sentFlags=flagCount;const id=await f.draft();const result=await f.send(id);
  assert.equal(result.state,'accepted');assert.equal(result.filing.status,'needs_folder');assert.equal(f.mail.appendCount(),1);
  assert.equal((await f.check(id)).observation,'needs_folder');
 }
 assert.equal((await f.policy('client',custom.id)).statusCode,200);
 const selected=await f.send(await f.draft());assert.equal(selected.filing.status,'filed');assert.equal(selected.filing.folder,custom.id);
 assert.equal(f.mail.appendCount(),2);assert.equal(f.mail.submitted.at(-1),f.mail.appended.at(-1));
}));

test('SMTP uncertainty, tagged APPEND rejection, lost APPEND replies and interrupted journal states',()=>withFixture(async f=>{
 assert.equal((await f.policy('client')).statusCode,200);
 f.mail.behavior.smtpLost=true;
 const unknown=await f.draft();assert.equal((await f.send(unknown)).state,'outcome_unknown');
 assert.equal(f.mail.appendCount(),0);assert.equal((await f.check(unknown)).state,'outcome_unknown');
 f.mail.behavior.smtpLost=false;
 for(const append of ['reject','lost','drop'] as const){
  f.mail.behavior.append=append;const id=await f.draft(),before=f.mail.appendCount(),delivered=f.mail.submitted.length;
  const op=await f.send(id);assert.equal(op.state,'accepted');assert.equal(op.filing.status,append==='reject'?'failed':'uncertain');
  await f.restart();const checked=await f.check(id);
  if(append==='lost')assert.equal(checked.filing.status,'observed');
  if(append==='drop'){assert.equal(checked.filing.status,'uncertain');assert.equal(checked.observation,'not_seen');}
  assert.equal((await f.send(id)).messageId,op.messageId);assert.equal(f.mail.appendCount(),before+1);assert.equal(f.mail.submitted.length,delivered+1);
 }
 const pending=await f.draft(),appending=await f.draft();const before=f.mail.appendCount(),sent=f.mail.submitted.length;
 await f.restart(()=>{
  const store=new Store(f.c.dbPath,f.c.key,f.c.password);
  for(const [id,status] of [[pending,'pending'],[appending,'appending']])store.db.prepare('INSERT INTO send_operations (owner_id,id,state,result) VALUES(1,?,?,?)').run(id,'accepted',JSON.stringify({messageId:`<${id}@example.test>`,filing:{status}}));
  store.close();
 });
 assert.equal((await f.send(pending)).filing.status,'failed');assert.equal((await f.send(appending)).filing.status,'uncertain');
 assert.equal((await f.send(unknown)).state,'outcome_unknown');assert.equal(f.mail.appendCount(),before);assert.equal(f.mail.submitted.length,sent);
}));
