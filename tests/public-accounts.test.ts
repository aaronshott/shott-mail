import test from 'node:test';
import assert from 'node:assert/strict';
import {Resolver} from 'node:dns/promises';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildApp} from '../src/server/app.ts';

test('public Accounts enforce login, CSRF, ownership, write validation and per-user bounds',async t=>{
 const dns=t.mock.method(Resolver.prototype,'resolve4',async()=>[]);
 const dns6=t.mock.method(Resolver.prototype,'resolve6',async()=>['::1']);
 const dir=mkdtempSync(join(tmpdir(),'shott-mail-public-'));
 const password=randomBytes(24).toString('hex');
 const origin='https://mail.example.test';
 const app=await buildApp({dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password,origin,secureCookie:true,mailMode:'public',sessionMs:60000,staticRoot:resolve('dist/client')});
 const login=async(login:string)=>{
  const res=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{login,password}});
  assert.equal(res.statusCode,200);
  return {origin,cookie:String(res.headers['set-cookie']).split(';')[0],'x-csrf-token':res.json().csrf};
 };
 const ep={host:'server.example.test',port:993,tls:'implicit',user:'test',password};
 const body={label:'Synthetic',address:'test@example.test',imap:ep,smtp:{...ep,port:587,tls:'starttls'}};
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/accounts',headers:{origin},payload:body})).statusCode,401);
  const admin=await login('admin');
  assert.equal((await app.inject({method:'POST',url:'/api/admin/users',headers:admin,payload:{login:'member',password}})).statusCode,201);
  const member=await login('member');
  assert.equal((await app.inject({url:'/api/config',headers:member})).json().mailMode,'public');
  assert.equal((await app.inject({method:'POST',url:'/api/accounts',headers:{...member,'x-csrf-token':'invalid'},payload:body})).statusCode,403);
  for(const smtp of [{...body.smtp,port:25},{...body.smtp,host:'127.0.0.1'},{...body.smtp,tls:'cleartext'}]){
   assert.equal((await app.inject({method:'POST',url:'/api/accounts',headers:member,payload:{...body,smtp}})).statusCode,400);
  }
  const saved=await app.inject({method:'POST',url:'/api/accounts',headers:member,payload:body});assert.equal(saved.statusCode,200);
  const id=saved.json().id;
  const list=(await app.inject({url:'/api/accounts',headers:member})).json();
  assert.equal(list.length,1);assert.equal(list[0].smtp.port,587);assert.ok(!JSON.stringify(list).includes(password));
  assert.deepEqual((await app.inject({url:'/api/accounts',headers:admin})).json(),[]);
  assert.equal((await app.inject({method:'PUT',url:`/api/accounts/${id}`,headers:admin,payload:body})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:`/api/accounts/${id}/test`,headers:admin,payload:{}})).statusCode,400);
  assert.equal(dns.mock.callCount(),0);assert.equal(dns6.mock.callCount(),0);
  const runTest=()=>app.inject({method:'POST',url:`/api/accounts/${id}/test`,headers:member,payload:{}});
  for(let i=0;i<20;i++)assert.deepEqual((await runTest()).json(),{imap:'POLICY',smtp:'POLICY'});
  assert.equal((await runTest()).statusCode,429);
  assert.equal(dns.mock.callCount(),40);assert.equal(dns6.mock.callCount(),40);
  for(let i=1;i<=10;i++)assert.equal((await app.inject({method:'POST',url:'/api/accounts',headers:member,payload:body})).statusCode,i<10?200:400);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
