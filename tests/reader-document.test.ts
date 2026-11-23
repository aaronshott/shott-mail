import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {buildApp} from '../src/server/app.ts';
import {readerDocument} from '../src/server/reader-document.ts';
import {startMailFixture} from './mail-fixture.ts';
import {documentMail} from './document-fixture.ts';

const path='/api/reader/document';
const policy="sandbox; default-src 'none'; style-src https: 'unsafe-inline'; img-src https:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

test('full document retains sender layout but not navigation, preloads or active elements',()=>{
 const doc=readerDocument('<style>.one{margin:10px}</style><link rel="stylesheet" href="https://css.example.test/news.css"><link rel="preconnect" href="https://css.example.test"><link rel="stylesheet" href="https://mail.example.test/own.css"><meta http-equiv="refresh" content="60"><a href="https://css.example.test" download>Archive</a><form><input></form><iframe title="Frame"></iframe><p class="one" style="padding:3px">Text</p>','mail.example.test');
 assert.match(doc,/<style>\.one\{margin:10px\}<\/style>/);
 assert.match(doc,/<link rel="stylesheet" href="https:\/\/css.example.test\/news.css"/);
 assert.match(doc,/<a>Archive<\/a><p class="one" style="padding:3px">Text<\/p>/);
 assert.doesNotMatch(doc,/preconnect|own\.css|http-equiv|download|<(form|iframe|input)\b/);
});

test('document requires account ownership, the live issuing session and exact mailbox/message identity',async()=>{
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/document-'));
 const secret=()=>randomBytes(24).toString('hex');
 const origin='https://mail.example.test';
 const mail=await startMailFixture(dir,true);
 mail.seedReader('https://images.example.test',[documentMail('https://images.example.test')]);
 const ownerPassword=secret(),bobPassword=secret();
 const app=await buildApp({dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:ownerPassword,origin,secureCookie:true,sessionMs:600000,staticRoot:resolve('dist/client'),mailMode:'fixture',ca:mail.ca,allowedMail:mail.allowedMail,timeoutMs:3000});
 const req=(method:'GET'|'POST'|'DELETE',url:string,headers:Record<string,string>={},payload?:object)=>app.inject({method,url,headers:{origin,...headers},...(payload?{payload}:{})});
 const signIn=async(login:string,password:string)=>{
  const r=await req('POST','/api/login',{}, {login,password});assert.equal(r.statusCode,200);
  return {cookie:String(r.headers['set-cookie']).split(';')[0],'x-csrf-token':String(r.json().csrf)};
 };
 const status=async(p:ReturnType<typeof req>,code:number)=>{const r=await p;assert.equal(r.statusCode,code);return r;};
 const headerCheck=(r:Awaited<ReturnType<typeof req>>)=>{assert.equal(r.headers['content-security-policy'],policy);assert.equal(r.headers['cache-control'],'no-store');assert.equal(r.headers['referrer-policy'],'no-referrer');assert.equal(r.headers['x-content-type-options'],'nosniff');};
 try{
  const owner=await signIn('admin',ownerPassword);
  await status(req('POST','/api/admin/users',owner,{login:'bob',password:bobPassword}),201);
  const bob=await signIn('bob',bobPassword),otherSession=await signIn('admin',ownerPassword);
  const a=(await status(req('POST','/api/accounts',owner,mail.mailbox('work')),200)).json();
  const item=(await status(req('GET','/api/inbox',owner),200)).json().messages.find((m:{subject:string})=>m.subject==='Reader full');assert.ok(item);
  const sourcePath=`/api/messages/${a.id}/${item.validity}/${item.uid}`;
  const {readerIdentity}= (await status(req('GET',sourcePath,owner),200)).json();
  const grant=async(identity=readerIdentity)=>(await status(req('POST',path,owner,identity),200)).json().path;
  await status(req('POST',path,{cookie:owner.cookie},readerIdentity),403);
  await status(req('POST',path,{...owner,origin:'https://other.example.test'},readerIdentity),403);
  const before=mail.metrics();
  await status(req('POST',path,bob,readerIdentity),400);
  await status(req('GET',sourcePath,bob),400);
  const view=await grant();
  headerCheck(await status(req('GET',view),401));
  headerCheck(await status(req('GET',view,bob),404));
  headerCheck(await status(req('GET',view,otherSession),404));
  assert.deepEqual(mail.metrics(),before);
  const rendered=await status(req('GET',view,{cookie:owner.cookie}),200);headerCheck(rendered);
  assert.equal(rendered.headers['content-type'],'text/html; charset=utf-8');
  assert.match(rendered.body,/Field briefing/);assert.doesNotMatch(rendered.body,/cookie|csrf|<form|<iframe|<script/);
  headerCheck(await status(req('GET',view,owner),404));
  headerCheck(await status(req('GET',await grant({...readerIdentity,validity:'1'+item.validity}),owner),409));
  headerCheck(await status(req('GET',await grant({...readerIdentity,mailbox:'0'.repeat(64)}),owner),409));
  headerCheck(await status(req('GET',await grant({...readerIdentity,uid:4294967295}),owner),404));
  headerCheck(await status(req('GET',await grant({...readerIdentity,folder:'0'.repeat(64)}),owner),404));
  const folders=(await status(req('GET',`/api/accounts/${a.id}/folders`,owner),200)).json();
  const inbox=folders.find((f:{path:string})=>f.path==='INBOX');assert.ok(inbox);
  const folderPath=`/api/accounts/${a.id}/folders/${inbox.id}/messages/${item.validity}/${item.uid}`;
  const folderIdentity=(await status(req('GET',folderPath,owner),200)).json().readerIdentity;
  assert.equal(folderIdentity.folder,inbox.id);
  headerCheck(await status(req('GET',await grant(folderIdentity),owner),200));
  const revokedView=await grant();await status(req('POST','/api/logout',owner,{}),200);
  headerCheck(await status(req('GET',revokedView,owner),401));
  headerCheck(await status(req('GET',revokedView,otherSession),404));
 }finally{await app.close();await mail.close();rmSync(dir,{recursive:true,force:true});}
});
