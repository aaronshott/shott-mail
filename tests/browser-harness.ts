// Local browser harness only. Never imported by production; fresh synthetic DB and credentials.
// /__test_login exchanges a generated server-side secret for a session, avoiding secrets in browser tooling/logs.
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';import {resolve,join} from 'node:path';import {randomBytes,randomUUID} from 'node:crypto';import {buildApp} from '../src/server/app.ts';import {Store} from '../src/server/store.ts';
mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/browser-'));
const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1',secureCookie:false,allowedMail:[],sessionMs:3600000,staticRoot:resolve('dist/client')};
const store=new Store(c.dbPath,c.key);
for(const label of ['Werk','Privé']){const user=label==='Werk'?'work':'private';store.putAccount(randomUUID(),{label,address:`${user}@example.test`,imap:{host:'mail.invalid',port:993,tls:'implicit',user},smtp:{host:'mail.invalid',port:465,tls:'implicit',user}} as any,{imap:randomBytes(24).toString('hex'),smtp:randomBytes(24).toString('hex')});}store.close();
const app=await buildApp(c);
// Fault injection only in this loopback harness: finish the real handler, then lose its HTTP reply.
let dropNextSend=false,sendRequests=0,droppedReplies=0;
app.post('/__test_drop_send_response',async()=>{dropNextSend=true;return {armed:true};});
app.get('/__test_metrics',async()=>({sendRequests,droppedReplies}));
app.addHook('onRequest',async req=>{if(req.method==='POST'&&req.url.endsWith('/send'))sendRequests++;});
app.addHook('onSend',async(req,reply,payload)=>{if(dropNextSend&&req.method==='POST'&&req.url.endsWith('/send')){dropNextSend=false;droppedReplies++;reply.raw.writeHead(200,{'Content-Type':'application/json','Content-Length':'1024'});reply.raw.write('{');await new Promise(resolve=>setTimeout(resolve,50));reply.raw.destroy();}return payload;});
app.get('/__test_login',async(_req,reply)=>{const result=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{password:c.password}});reply.header('Set-Cookie',result.headers['set-cookie']!);return reply.redirect('/');});
const address=await app.listen({host:'127.0.0.1',port:0});c.origin=address;console.info('BROWSER_HARNESS '+address);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});
