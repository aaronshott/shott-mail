// Usage: node tests/browser-runner.mjs /absolute/path/to/chrome [context]
// Fresh loopback-only harness per workflow/viewport; no production credentials.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const chrome=process.argv[2];if(!chrome)throw Error('Pass an absolute Chrome/Chromium path');
const workflows=process.argv.length>3?process.argv.slice(3):['folders','context','composer','b1','users','settings','reply-nl','reply-en','reader-nl','reader-en'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir('.test-data',{recursive:true,mode:0o700});
const profile=await mkdtemp(resolve('.test-data/browser-chrome-'));
function start(file,args){const proc=spawn(file,args,{stdio:['ignore','pipe','pipe']});proc.stderr.resume();return proc;}
async function stop(proc){if(proc.exitCode!==null||proc.signalCode!==null)return;proc.kill('SIGTERM');await Promise.race([once(proc,'exit'),delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null)proc.kill('SIGKILL');}
async function poll(fn){for(let i=0;i<280;i++){const v=await Promise.resolve().then(fn).catch(()=>null);if(v)return v;await delay(75);}throw Error('Polling deadline');}
const browser=start(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
browser.stdout.resume();const results=[];
try{
 const port=(await poll(()=>readFile(join(profile,'DevToolsActivePort'),'utf8'))).split('\n')[0],endpoint=`http://127.0.0.1:${port}`;
 const {Browser}=await (await fetch(endpoint+'/json/version')).json();
 for(const mobile of [false,true])for(const kind of workflows){
  const record={kind,mobile};results.push(record);
  const replyLocale=kind==='reply-nl'?'nl':kind==='reply-en'?'en':null;
  const readerLocale=kind==='reader-nl'?'nl':kind==='reader-en'?'en':null;
  const h=start(process.execPath,['tests/browser-harness.ts',...(readerLocale?['--reader']:replyLocale?['--reply-subjects']:kind==='context'?['--folders','--context']:kind==='settings'?['--folders']:['folders','composer'].includes(kind)?[`--${kind}`]:[])]);
  let origin,imageOrigin,tab,ws;h.stdout.on('data',chunk=>{const match=/BROWSER_HARNESS (http:\/\/127\.0\.0\.1:\d+)(?: (https:\/\/127\.0\.0\.1:\d+))?/.exec(String(chunk));if(match)[,origin,imageOrigin]=match;});
  try{
   await poll(()=>origin);tab=await (await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
   ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
   let seq=0;const pending=new Map(),observed=[];ws.onmessage=e=>{const {id,result,error,method,params}=JSON.parse(e.data);const done=pending.get(id);if(done)done(result,error);if(readerLocale&&method==='Network.requestWillBeSent'&&params.request.url.startsWith(imageOrigin+'/'))observed.push(new URL(params.request.url).pathname);};
   const call=(method,params={})=>new Promise((r,j)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);j(Error(method+' timeout'));},45000);
    pending.set(id,(value,error)=>{pending.delete(id);clearTimeout(timer);error?j(Error(error.message)):r(value);});ws.send(JSON.stringify({id,method,params}));
   });
   await call('Emulation.setDeviceMetricsOverride',{width:mobile?(replyLocale||readerLocale?320:390):1280,height:mobile?844:900,deviceScaleFactor:mobile?3:1,mobile});
   await call('Emulation.setTouchEmulationEnabled',{enabled:mobile});
   if(kind==='settings')await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});
   if(readerLocale){
    await call('Network.enable');await call('Security.setIgnoreCertificateErrors',{ignore:true});
    const cookie=await call('Network.setCookie',{url:imageOrigin,name:'fixture_image_cookie',value:'synthetic',secure:true,sameSite:'None'});
    if(!cookie.success)throw Error('Image host test cookie not set');
   }
   const suffix=kind==='users'?'?workflow=1':kind==='b1'?'?workflow=b1':'';
   await call('Page.navigate',{url:origin+'/__test_login'+suffix});
   const evaluate=async(expression,awaitPromise=false)=>{
    const out=await call('Runtime.evaluate',{expression,awaitPromise,returnByValue:true});
    if(out.exceptionDetails)throw Error(out.exceptionDetails.exception?.description??out.exceptionDetails.text);
    return out.result.value;
   };
   await poll(()=>evaluate(`location.origin===${JSON.stringify(origin)} && !!document.querySelector('main')`));
   record.viewport=await evaluate('[innerWidth,innerHeight]');
   if(kind==='users'||kind==='b1')record.result=await poll(()=>evaluate(kind==='users'?'window.multiuserBrowserResult':'window.b1Results'));
   else if(kind==='context')record.result=await evaluate("import('/__test_folder_context.js').then(m=>m.runContext())",true);
   else if(replyLocale)record.result=await evaluate(`import('/__test_reply_subjects.js').then(m=>m.runReplySubjects(${JSON.stringify(replyLocale)}))`,true);
   else if(readerLocale){
    record.before=await evaluate(`import('/__test_reader.js').then(m=>m.beforeConsent(${JSON.stringify(readerLocale)}))`,true);
    if(record.before.locale!==readerLocale||record.before.theme!=='dark'||observed.length)throw Error('Wrong preference or network before consent: '+JSON.stringify(observed));
    const point=record.before.point;
    await call('Page.bringToFront');
    if(mobile){
     await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
     await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
     await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
     await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    }
    record.result=await evaluate("import('/__test_reader.js').then(m=>m.afterConsent())",true);
    record.browserRequests=observed;
    if(JSON.stringify(observed)!=='["/work.png"]')throw Error('Unexpected browser request: '+JSON.stringify(observed));
   }
   else if(kind==='settings'){
    record.result=await evaluate("import('/__test_settings.js').then(m=>m.runSettings())",true);
    const beforeReload=await evaluate('performance.timeOrigin');
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
    await call('Page.reload');
    await poll(()=>evaluate(`performance.timeOrigin!==${beforeReload} && document.documentElement.lang==='en' && document.documentElement.dataset.theme==='dark' && [...document.querySelectorAll('button')].some(b=>b.textContent==='Sign out'&&!b.disabled)`));
    if(!(await evaluate("getComputedStyle(document.documentElement).colorScheme === 'dark' && !document.querySelector('textarea')")))throw Error('Reload did not restore preferences');
    record.result.checks.push('authenticated reload restores English and explicit dark even with system light');
   }
   else record.result=await evaluate(`import('/__test_${kind}.js').then(m=>m.run${kind==='folders'?'Folders':'Composer'}())`,true);
   record.passed=Array.isArray(record.result)?record.result.every(r=>r.passed):record.result?.passed===true;
  }catch(error){record.error=error.message;record.passed=false;}
  finally{ws?.close();if(tab?.id)await fetch(endpoint+'/json/close/'+tab.id);await stop(h);}
 }
 console.log(JSON.stringify({browser:Browser,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
}finally{await stop(browser);await rm(profile,{recursive:true,force:true,maxRetries:5});}
