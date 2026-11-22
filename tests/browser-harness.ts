// Local browser harness only. Never imported by production; fresh synthetic DB and credentials.
// /__test_login exchanges a generated server-side secret for a session, avoiding secrets in browser tooling/logs.
import {mkdtempSync,mkdirSync,readFileSync,rmSync} from 'node:fs';import {resolve,join} from 'node:path';import {randomBytes,randomUUID} from 'node:crypto';import {buildApp} from '../src/server/app.ts';import {Store} from '../src/server/store.ts';
import {startMailFixture} from './mail-fixture.ts';
import {createServer as createHttps} from 'node:https';
import {once} from 'node:events';
import {crc32,deflateSync} from 'node:zlib';
import {newsletter,imageOnly,missingImage,edition,studio,contrastFixtures,diagnostics,pictureFixtures} from './newsletter-fixture.ts';

function newsletterPng(){
 const width=640,height=120;
 const dimensions=Buffer.alloc(13);dimensions.writeUInt32BE(width);dimensions.writeUInt32BE(height,4);dimensions.set([8,2],8);
 const pixels=Buffer.alloc((1+width*3)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set(x<width/2?[24,96,160]:[28,138,91],y*(1+width*3)+1+x*3);
 const chunk=(type:string,data:Buffer)=>{
  const body=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
  length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(body));return Buffer.concat([length,body,checksum]);
 };
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',dimensions),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/browser-'));
const folders=process.argv.includes('--folders');
const treeStyle=process.argv.includes('--tree-style');
const replySubjects=process.argv.includes('--reply-subjects');
const garden=process.argv.includes('--newsletter');
const reader=process.argv.includes('--reader')||garden;
const mail=folders||replySubjects||reader||process.argv.includes('--composer')?await startMailFixture(dir,folders,treeStyle?'INBOX/Projects/Travel':undefined):null;
const imageRequests:{path?:string;cookie:boolean;referer:boolean;authorization:boolean}[]=[];
const imageConnections:{count:number}={count:0};
const imageBytes=reader?newsletterPng():null;
const imageHost=reader?createHttps({key:readFileSync(join(dir,'mail.key')),cert:mail!.ca},(req,res)=>{
 imageRequests.push({path:req.url,cookie:!!req.headers.cookie,referer:!!req.headers.referer,authorization:!!req.headers.authorization});
 if(req.url==='/redirect.png'){
  res.writeHead(302,{Location:imageOrigin.replace('images.example.test','cdn.example.test')+'/final.png','Cache-Control':'no-store'});res.end();return;
 }
 if(req.url==='/missing.png'){res.writeHead(404,{'Cache-Control':'no-store'});res.end();return;}
 res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}); // deliberately no CORS
 res.end(imageBytes);
}):null;
let imageOrigin='';
if(imageHost){imageHost.on('connection',()=>{imageConnections.count++;});const listening=once(imageHost,'listening');imageHost.listen(0,'127.0.0.1');await listening;imageOrigin=`https://images.example.test:${(imageHost.address() as {port:number}).port}`;mail!.seedReader(imageOrigin,garden?[newsletter(imageOrigin),imageOnly(imageOrigin),missingImage(imageOrigin),edition(imageOrigin),studio(imageOrigin),...contrastFixtures(),...pictureFixtures(imageOrigin)]:process.argv.includes('--diagnostics')?[diagnostics(imageOrigin),missingImage(imageOrigin)]:[]);}
if(replySubjects)mail?.seedReplySubjects();
if(process.argv.includes('--context'))mail?.seedSent();
const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password:randomBytes(24).toString('base64url'),origin:'http://127.0.0.1',secureCookie:false,allowedMail:mail?.allowedMail??[],sessionMs:3600000,staticRoot:resolve('dist/client'),...(mail?{mailMode:'fixture' as const,ca:mail.ca,timeoutMs:3000}:{}),...(folders?{pageSize:1}:{})};
const store=new Store(c.dbPath,c.key,c.password);
for(const label of ['Werk','Privé']){
 const user=label==='Werk'?'work':'private';
 if(mail){const {imap:{password:i,...imap},smtp:{password:s,...smtp},address}=mail.mailbox(user);
  const id=treeStyle?`00000000-0000-4000-8000-00000000000${user==='work'?1:2}`:randomUUID();
  const account={label,address,imap,smtp};
  store.putAccount(1,id,account,{imap:i,smtp:s});}
 else store.putAccount(1,randomUUID(),{label,address:`${user}@example.test`,imap:{host:'mail.invalid',port:993,tls:'implicit',user},smtp:{host:'mail.invalid',port:465,tls:'implicit',user}},{imap:randomBytes(24).toString('hex'),smtp:randomBytes(24).toString('hex')});
}store.close();
const app=await buildApp(c);
// Fault injection only in this loopback harness: finish the real handler, then lose its HTTP reply.
let dropNextSend=false,sendRequests=0,droppedReplies=0;
app.post('/__test_drop_send_response',async()=>{dropNextSend=true;return {armed:true};});
app.get('/__test_metrics',async()=>({sendRequests,droppedReplies,...mail?.metrics(),appendAttempts:mail?.appendCount()}));
app.addHook('onRequest',async req=>{if(req.method==='POST'&&req.url.endsWith('/send'))sendRequests++;});
app.addHook('onSend',async(req,reply,payload)=>{if(dropNextSend&&req.method==='POST'&&req.url.endsWith('/send')){dropNextSend=false;droppedReplies++;reply.raw.writeHead(200,{'Content-Type':'application/json','Content-Length':'1024'});reply.raw.write('{');await new Promise(resolve=>setTimeout(resolve,50));reply.raw.destroy();}return payload;});
app.get<{Querystring:{workflow?:string}}>('/__test_login',async(req,reply)=>{const result=await app.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{login:'admin',password:c.password}});reply.header('Set-Cookie',result.headers['set-cookie']!);return reply.redirect(req.query.workflow==='1'?'/__test_users':req.query.workflow==='b1'?'/__test_b1':'/');});
app.get('/__test_users',async(_req,reply)=>reply.type('text/html').send(readFileSync(join(c.staticRoot,'index.html'),'utf8').replace('</body>','<script type="module" src="/__test_users.js"></script></body>')));
app.get('/__test_users.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-users.js','utf8')));
app.get('/__test_composer.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-composer.js','utf8')));
app.get('/__test_settings.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-settings.js','utf8')));
if(reader){
 app.get('/__test_reader.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-reader.js','utf8')));
 app.get('/__test_image_requests',async()=>imageRequests);
 app.get('/__test_image_connections',async()=>imageConnections.count);
}
if(replySubjects)app.get('/__test_reply_subjects.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-reply-subjects.js','utf8')));
if(folders&&mail){
 app.get('/__test_folders.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-folders.js','utf8')));
 app.get('/__test_folder_context.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-folder-context.js','utf8')));
 app.post('/__test_folder_fault',async()=>{mail.behavior.append='reject';return {armed:true};});
}
app.get('/__test_b1',async(_req,reply)=>reply.type('text/html').send(readFileSync(join(c.staticRoot,'index.html'),'utf8').replace('</body>','<script type="module" src="/__test_b1.js"></script></body>')));
app.get('/__test_b1.js',async(_req,reply)=>reply.type('text/javascript').send(readFileSync('tests/browser-regressions.js','utf8')+`
async function run(){
 for(let n=0;n<100;n++){if([...document.querySelectorAll('button')].some(b=>b.textContent==='Vernieuwen'&&!b.disabled))break;await new Promise(r=>setTimeout(r,100));}
 try {const a=await window.b1Regression.dirtyDrafts();window.b1Results=[a,await window.b1Regression.sendResponseLoss()];}
 catch(error){window.b1Results={error:error.message};}
} await run();`));
const address=await app.listen({host:'127.0.0.1',port:0});c.origin=address;console.info('BROWSER_HARNESS '+address+(imageOrigin?' '+imageOrigin:''));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{imageHost?.close();await app.close();await mail?.close();rmSync(dir,{recursive:true,force:true});process.exit(0);});
