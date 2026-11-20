// Deliberately a protocol fault simulator, NOT an interoperability/Dovecot acceptance test.
import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';import {createServer} from 'node:tls';import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';import {resolve,join} from 'node:path';import {buildApp} from '../src/server/app.ts';import {testConnection} from '../src/server/mail.ts';
test('TLS/auth failures and DATA acknowledgement loss are fail-closed without automatic retry',async()=>{
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/smtp-fault-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key'),'-out',join(dir,'cert'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const cert=readFileSync(join(dir,'cert'),'utf8'),password=randomBytes(24).toString('base64url');let auths=0,dataCount=0;const sockets=new Set<any>();
 const server=createServer({key:readFileSync(join(dir,'key')),cert},s=>{
  sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{});s.write('220 isolated fault simulator\r\n');let buffer='',inData=false;
  s.on('data',chunk=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+2);
   if(inData){if(line==='.'){dataCount++;s.destroy();}continue;}
   if(line.startsWith('EHLO'))s.write('250-localhost\r\n250 AUTH PLAIN\r\n');
   else if(line.startsWith('AUTH PLAIN ')){auths++;const parts=Buffer.from(line.slice(11),'base64').toString().split('\0');s.write(parts.at(-1)===password?'235 Authenticated\r\n':'535 Authentication failed\r\n');}
   else if(line.startsWith('MAIL FROM')||line.startsWith('RCPT TO'))s.write('250 Accepted\r\n');
   else if(line==='DATA'){inData=true;s.write('354 Continue\r\n');}
   else if(line==='QUIT'){s.end('221 Bye\r\n');}
   else s.write('500 Unsupported fault-fixture command\r\n');
  }});
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;
 const ep={host:'127.0.0.1',port,tls:'implicit' as const,user:'work@example.test',password};
 const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1:3000',secureCookie:false,mailMode:'fixture' as const,allowedMail:[`127.0.0.1:${port}`],sessionMs:60000,staticRoot:resolve('dist/client'),ca:cert,timeoutMs:1500};
 const app=await buildApp(c);
 try{
  assert.notEqual(await testConnection('smtp',ep,{...c,ca:undefined}),'OK');assert.equal(auths,0,'untrusted TLS must fail before AUTH');
  assert.notEqual(await testConnection('smtp',{...ep,password:randomBytes(24).toString('hex')},c),'OK');
  assert.equal(await testConnection('smtp',ep,c),'OK');
  const l=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{login:'admin',password:c.password}});const headers={origin:c.origin,cookie:String(l.headers['set-cookie']).split(';')[0],'x-csrf-token':l.json().csrf};
  const a=(await app.inject({method:'POST',url:'/api/accounts',headers,payload:{label:'Fault fixture',address:'work@example.test',imap:ep,smtp:ep}})).json();const id=randomUUID();
  assert.equal((await app.inject({method:'PUT',url:`/api/drafts/${id}`,headers,payload:{accountId:a.id,revision:0,to:'private@example.test',subject:'Unknown outcome',text:'keep input'}})).statusCode,200);
  const op=(await app.inject({method:'POST',url:`/api/drafts/${id}/send`,headers,payload:{revision:1}})).json();assert.equal(op.state,'outcome_unknown');assert.equal(dataCount,1);
  await app.inject({method:'POST',url:`/api/drafts/${id}/send`,headers,payload:{revision:1}});assert.equal(dataCount,1);
  assert.equal((await app.inject({url:`/api/drafts/${id}`,headers})).json().body.text,'keep input');
 }finally{await app.close();for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true});}
});
