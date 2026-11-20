import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';import {resolve,join} from 'node:path';import {buildApp} from '../src/server/app.ts';
test('provisional draft size is configurable and rejected input cannot overwrite saved draft',async()=>{
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/limits-'));const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('hex'),origin:'http://127.0.0.1:3000',secureCookie:false,allowedMail:[],sessionMs:60000,staticRoot:resolve('dist/client'),maxDraftChars:3};const app=await buildApp(c);
 try{const login=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:c.password}});const headers={origin:c.origin,cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};const ep={host:'mail.invalid',port:993,tls:'implicit',user:'synthetic',password:randomBytes(24).toString('hex')};const a=(await app.inject({method:'POST',url:'/api/accounts',headers,payload:{label:'Small',address:'work@example.test',imap:ep,smtp:ep}})).json();const id=randomUUID();const d={accountId:a.id,revision:0,to:'private@example.test',subject:'Size',text:'123'};
 assert.equal((await app.inject({method:'PUT',url:`/api/drafts/${id}`,headers,payload:d})).statusCode,200);
 assert.equal((await app.inject({method:'PUT',url:`/api/drafts/${id}`,headers,payload:{...d,revision:1,text:'1234'}})).statusCode,400);
 assert.equal((await app.inject({url:`/api/drafts/${id}`,headers})).json().body.text,'123');
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
