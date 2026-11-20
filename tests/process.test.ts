import test from 'node:test';import assert from 'node:assert/strict';import {spawn,type ChildProcess} from 'node:child_process';import {randomBytes,randomUUID} from 'node:crypto';import {createServer} from 'node:net';import {once} from 'node:events';import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {resolve,join} from 'node:path';
test('real server process restart preserves account, session and draft',async()=>{
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/process-'));const password=randomBytes(24).toString('base64url');writeFileSync(join(dir,'key'),randomBytes(32),{mode:0o600});writeFileSync(join(dir,'login'),password,{mode:0o600});
 const reserve=createServer();await new Promise<void>(r=>reserve.listen(0,'127.0.0.1',r));const port=(reserve.address() as any).port;await new Promise<void>(r=>reserve.close(()=>r()));const origin=`http://127.0.0.1:${port}`;
 let child:ChildProcess|undefined;
 async function start(){child=spawn(process.execPath,['src/server/main.ts'],{env:{...process.env,PORT:String(port),APP_ORIGIN:origin,DB_PATH:join(dir,'app.sqlite'),KEY_FILE:join(dir,'key'),PASSWORD_FILE:join(dir,'login'),MAIL_ALLOWLIST:''},stdio:'ignore'});for(let n=0;n<160;n++){if(child.exitCode!==null)throw new Error('Server exited before readiness');try{if((await fetch(origin+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('Readiness timeout');}
 async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}}
 try{
  await start();const login=await fetch(origin+'/api/login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({login:'admin',password})});assert.equal(login.status,200);const csrf=(await login.json()).csrf;
  const headers={origin,'Content-Type':'application/json',cookie:login.headers.get('set-cookie')!.split(';')[0],'x-csrf-token':csrf};
  const ep={host:'mail.invalid',port:993,tls:'implicit',user:'synthetic',password:randomBytes(24).toString('hex')};const a=await fetch(origin+'/api/accounts',{method:'POST',headers,body:JSON.stringify({label:'Persist',address:'work@example.test',imap:ep,smtp:{...ep,port:465}})});assert.equal(a.status,200);const id=(await a.json()).id;const draft=randomUUID();
  assert.equal((await fetch(origin+`/api/drafts/${draft}`,{method:'PUT',headers,body:JSON.stringify({accountId:id,revision:0,to:'private@example.test',subject:'Persistent',text:'Survives process restart'})})).status,200);
  await stop();await start();const saved=await fetch(origin+`/api/drafts/${draft}`,{headers});assert.equal(saved.status,200);assert.equal((await saved.json()).body.text,'Survives process restart');assert.equal((await(await fetch(origin+'/api/accounts',{headers})).json())[0].id,id);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
