// Usage: node tests/browser-runner.mjs /absolute/path/to/chrome [context]
// Fresh loopback-only harness per workflow/viewport; no production credentials.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {runTreeStyle} from './browser-tree-style.mjs';
import {runHeader} from './browser-header.mjs';
import {runFullReader} from './browser-full-reader.mjs';
import {runImageDescriptions} from './browser-image-descriptions.mjs';
import {runImageLoad} from './browser-image-load.mjs';
import {runMarkRead} from './browser-mark-read.mjs';
import {editionImages,picturePaths} from './newsletter-fixture.ts';
const chrome=process.argv[2];if(!chrome)throw Error('Pass an absolute Chrome/Chromium path');
const workflows=process.argv.length>3?process.argv.slice(3):['folders','context','mark-read','composer','b1','users','settings','reply-nl','reply-en','reader-nl','reader-en','diagnostics-nl','diagnostics-en','newsletter','edition','studio','picture','contrast','header-light','header-dark','tree-light','tree-dark','full-reader','preconsent-light','preconsent-dark','unhinted-light','unhinted-dark','image-descriptions-en','image-descriptions-nl','icon-only-light','icon-only-dark','image-load'];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir('.test-data',{recursive:true,mode:0o700});
const profile=await mkdtemp(resolve('.test-data/browser-chrome-'));
function start(file,args){const proc=spawn(file,args,{stdio:['ignore','pipe','pipe']});proc.stderr.resume();return proc;}
async function stop(proc){if(proc.exitCode!==null||proc.signalCode!==null)return;proc.kill('SIGTERM');await Promise.race([once(proc,'exit'),delay(3000)]);if(proc.exitCode===null&&proc.signalCode===null)proc.kill('SIGKILL');}
async function poll(fn){for(let i=0;i<280;i++){const v=await Promise.resolve().then(fn).catch(()=>null);if(v)return v;await delay(75);}throw Error('Polling deadline');}
const browser=start(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-proxy-server','--blink-settings=primaryHoverType=2,availableHoverTypes=2','--host-resolver-rules=MAP images.example.test 127.0.0.1, MAP cdn.example.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
browser.stdout.resume();const results=[];
try{
 const port=(await poll(()=>readFile(join(profile,'DevToolsActivePort'),'utf8'))).split('\n')[0],endpoint=`http://127.0.0.1:${port}`;
 const {Browser}=await (await fetch(endpoint+'/json/version')).json();
 for(const mobile of [false,true])for(const kind of workflows){
  const record={kind,mobile};results.push(record);
  const replyLocale=kind==='reply-nl'?'nl':kind==='reply-en'?'en':null;
  const readerLocale=kind==='reader-nl'?'nl':kind==='reader-en'?'en':null;
  const diagnosticsLocale=kind==='diagnostics-nl'?'nl':kind==='diagnostics-en'?'en':null;
  const header=kind==='header-light'?'light':kind==='header-dark'?'dark':null;
  const unhinted=kind.startsWith('unhinted-');
  const descriptions=kind.startsWith('image-descriptions-')?kind.slice(-2):null;
  const iconOnly=kind.startsWith('icon-only-');
  const preconsent=iconOnly?kind.slice(10):descriptions?(descriptions==='nl'?'dark':'light'):unhinted?kind.slice(9):kind.startsWith('preconsent-')?kind.slice(11):null;
  const imageLoad=kind==='image-load';
  const full=kind==='full-reader',studio=kind==='studio',edition=kind==='edition',picture=kind==='picture',garden=kind==='newsletter'||kind==='contrast'||edition||studio||picture||header||preconsent,needsImage=readerLocale||garden||diagnosticsLocale||full||imageLoad;
  const treeTheme=kind==='tree-light'?'light':kind==='tree-dark'?'dark':null;
  const h=start(process.execPath,['tests/browser-harness.ts',...(kind==='mark-read'?['--folders','--mark-read']:full?['--full-reader']:imageLoad?['--reader','--image-load']:garden?['--newsletter']:diagnosticsLocale?['--reader','--diagnostics']:readerLocale?['--reader']:replyLocale?['--reply-subjects']:kind==='context'?['--folders','--context']:treeTheme?['--folders','--tree-style']:kind==='settings'?['--folders']:['folders','composer'].includes(kind)?[`--${kind}`]:[])]);
  let origin,imageOrigin,tab,ws,harnessOutput='';h.stdout.on('data',chunk=>{harnessOutput+=chunk;const match=/BROWSER_HARNESS (https?:\/\/127\.0\.0\.1:\d+)(?: (https:\/\/images\.example\.test:\d+))?\r?\n/.exec(harnessOutput);if(match)[,origin,imageOrigin]=match;});
  try{
   await poll(()=>origin);tab=await (await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
   ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
   let seq=0;const pending=new Map(),observed=[],imageFrames=new Map(),responses=[],external=[],traffic=[];
   const call=(method,params={},sessionId)=>new Promise((r,j)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);j(Error(method+' timeout'));},45000);
    pending.set(id,(value,error)=>{pending.delete(id);clearTimeout(timer);error?j(Error(error.message)):r(value);});ws.send(JSON.stringify({id,method,params,sessionId}));
   });
   ws.onmessage=e=>{
    const {id,result,error,method,params}=JSON.parse(e.data);pending.get(id)?.(result,error);
    if(!needsImage)return;
    if(method==='Target.attachedToTarget'&&params.targetInfo.type==='iframe'){
     const {sessionId,targetInfo}=params;
     imageFrames.set(targetInfo.targetId,sessionId);
     // Supplement server logs with CDP events; initial parser requests can precede attachment.
     call('Network.enable',{},sessionId).then(()=>call('Runtime.runIfWaitingForDebugger',{},sessionId)).catch(()=>{});
    }
    if(method==='Target.detachedFromTarget')for(const [frameId,sessionId] of imageFrames)if(sessionId===params.sessionId)imageFrames.delete(frameId);
    if(full&&method==='Network.responseReceived'){
     const {url,status,headers}=params.response,{origin,pathname:path}=new URL(url);
     if(path==='/api/reader/document'||path==='/full-mail.css')responses.push({origin,path,status,headers:Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]))});
    }
    if(method==='Network.requestWillBeSent'){
     const url=new URL(params.request.url);
     if((descriptions||iconOnly)&&['https:','http:'].includes(url.protocol))traffic.push(url.href);
     if((preconsent||imageLoad)&&['https:','http:'].includes(url.protocol)&&url.origin!==origin)external.push(url.href);
     if([imageOrigin,imageOrigin.replace('images.','cdn.')].includes(url.origin))observed.push(url.pathname);
    }
   };
   await call('Emulation.setDeviceMetricsOverride',{width:mobile?(replyLocale||readerLocale?320:390):(header||full||preconsent||imageLoad?1600:1280),height:mobile?844:900,deviceScaleFactor:mobile&&!header&&!full&&!preconsent&&!imageLoad?3:1,mobile});
   await call('Emulation.setTouchEmulationEnabled',{enabled:mobile});
   if(treeTheme||kind==='settings')await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:treeTheme??'dark'}]});
   if(needsImage){
    await call('Network.enable');await call('Security.setIgnoreCertificateErrors',{ignore:true});
    await call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:'iframe'}]});
    const cookie=await call('Network.setCookie',{url:imageOrigin,name:'fixture_image_cookie',value:'synthetic',secure:true,sameSite:'None'});
    if(!cookie.success)throw Error('Image host test cookie not set');
   }
   const suffix=kind==='users'?'?workflow=1':kind==='b1'?'?workflow=b1':'';
   await call('Page.navigate',{url:origin+'/__test_login'+suffix});
   const evaluate=async(expression,awaitPromise=false,sessionId)=>{
    const out=await call('Runtime.evaluate',{expression,awaitPromise,returnByValue:true},sessionId);
    if(out.exceptionDetails)throw Error(out.exceptionDetails.exception?.description??out.exceptionDetails.text);
    return out.result.value;
   };
   await poll(()=>evaluate(`location.origin===${JSON.stringify(origin)} && !!document.querySelector('main')`));
   record.viewport=await evaluate('[innerWidth,innerHeight]');
   if(kind==='users'||kind==='b1')record.result=await poll(()=>evaluate(kind==='users'?'window.multiuserBrowserResult':'window.b1Results'));
   else if(treeTheme)record.result=await runTreeStyle({call,evaluate,poll,mobile,theme:treeTheme,baseline:process.env.FOLDER_TREE_BASELINE==='1',screenshots:process.env.FOLDER_TREE_SCREENSHOTS});
   else if(kind==='context')record.result=await evaluate("import('/__test_folder_context.js').then(m=>m.runContext())",true);
   else if(kind==='mark-read')record.result=await runMarkRead({call,evaluate,poll,mobile});
   else if(replyLocale)record.result=await evaluate(`import('/__test_reply_subjects.js').then(m=>m.runReplySubjects(${JSON.stringify(replyLocale)}))`,true);
   else if(garden||diagnosticsLocale||full||imageLoad){
    const baseline=process.env.NEWSLETTER_BASELINE==='1',dir=full?process.env.FULL_READER_SCREENSHOTS:process.env.NEWSLETTER_SCREENSHOTS;
    const run=(method,arg='')=>evaluate(`import('/__test_reader.js').then(m=>m.${method}(${arg}))`,true);
    const shot=async (name,viewportOnly=false)=>{
     if(!dir)return;
     await mkdir(dir,{recursive:true});
     const {cssContentSize:{height}}=await call('Page.getLayoutMetrics');
     const {data}=await call('Page.captureScreenshot',{format:'png',fromSurface:true,...(viewportOnly?{}:{captureBeyondViewport:true,clip:{x:0,y:0,width:record.viewport[0],height,scale:1}})});
     await writeFile(join(dir,`${name}-${mobile?'mobile':'desktop'}.png`),Buffer.from(data,'base64'));
    };
    const gesture=async point=>{
     await call('Page.bringToFront');
     if(mobile){await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
     else for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
    };
    if(imageLoad){
     record.result=await runImageLoad({call,evaluate,poll,run,gesture,imageFrames,external,shot,record});
    }else if(iconOnly){
     const state=record.before=await run('iconOnlyCrop',JSON.stringify(preconsent));
     await shot(kind,true);
     record.externalRequests=external;
     if(external.length||state.connections||state.requests.length||imageFrames.size||state.active||!state.controls)throw Error('Safe HTML consent or network changed');
     if(state.slots.some(s=>s.text||s.title)||/Externe afbeelding geblokkeerd|(?:Repeated|Unresolved|Unsupported) observation/.test(state.bodyText))throw Error('Inline placeholder text or tooltip still present');
     if(state.caption!=='Sender caption remains'||!['Narrow cell text','Wide cell text'].every(s=>state.bodyText.includes(s))||state.overflow)throw Error('Sender content or layout changed');
     const names=[...Array(3).fill('Externe afbeelding geblokkeerd — Repeated observation'),'Ingesloten afbeelding wordt niet weergegeven — Unresolved observation','Unsupported observation','Afbeelding niet beschikbaar'];
     if(JSON.stringify(state.slots.map(s=>s.name))!==JSON.stringify(names)||state.slots.some(s=>s.svg!==1||!s.visible||s.focusable||s.width<=0||s.height<=0||s.width>16.5||s.height>16.5||s.width>(s.cell??16)+.5))throw Error('One compact, named icon per slot expected');
     const {root}=await call('DOM.getDocument');
     const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'.formatted-mail'});
     const {nodes}=await call('Accessibility.queryAXTree',{nodeId,role:'image'});
     record.names=nodes.filter(n=>!n.ignored).map(n=>n.name?.value);
     if(JSON.stringify(record.names)!==JSON.stringify(names))throw Error('Image names missing in the browser accessibility tree');
     // Keep the tile and layout in place, hide just the SVG, then compare real raster captures.
     record.painted=[];
     for(let i=0;i<names.length;i++){
      const icon=`document.querySelectorAll('.formatted-mail .mail-image-placeholder > svg')[${i}]`;
      const clip=await evaluate(`(()=>{const r=${icon}.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)throw Error('Icon outside screenshot viewport');return {x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
      const capture=()=>call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip}).then(x=>x.data);
      const shown=await capture();
      await evaluate(`${icon}.style.visibility='hidden'`);
      const hidden=await capture();
      await evaluate(`${icon}.style.removeProperty('visibility')`);
      record.painted.push(shown!==hidden);
     }
     if(record.painted.some(p=>!p))throw Error('An SVG did not change the rendered pixels');
     const trigger='.image-descriptions-trigger',modal='.image-descriptions-dialog';
     const point=sel=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(sel)});b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!b.contains(document.elementFromPoint(x,y)))throw Error('Control not hit-testable');return {x,y};})()`);
     const start=traffic.length;
     await gesture(await point(trigger));
     record.descriptions=await evaluate(`([...document.querySelectorAll('${modal}:modal li')].map(li=>li.textContent))`);
     if(JSON.stringify(record.descriptions)!==JSON.stringify(names.slice(0,-1)))throw Error('Description panel lost ordered alternatives, including repeated slots');
     await delay(350);await shot(kind+'-descriptions',true);
     await gesture(await point(modal+' button'));
     if(!await evaluate(`document.activeElement.matches('${trigger}')&&!document.querySelector('${modal}:modal')`)||traffic.length!==start||external.length||imageFrames.size)throw Error('Description access changed focus, consent or network');
     record.result={passed:true};
    }else if(descriptions){
     record.before=await run('unhintedCrop',[preconsent,descriptions].map(x=>JSON.stringify(x)).join(','));
     record.result=await runImageDescriptions({call,evaluate,poll,run,gesture,imageFrames,external,traffic,mobile,shot,locale:descriptions,before:record.before});
    }else if(unhinted){
     const g=record.before=await run('unhintedCrop',JSON.stringify(preconsent));
     await shot(kind,true);
     const {nodes}=await call('Accessibility.getFullAXTree');
     record.names=nodes.filter(n=>n.role?.value==='image').map(n=>n.name?.value);
     record.externalRequests=external;
     if(external.length||g.connections||g.requests.length||imageFrames.size)throw Error('External resource activity before consent');
     if(g.geometry.length!==9||g.geometry.some(r=>Math.abs(r.height-r.withoutLabel)>.5||!r.sameRow||r.text||r.iconCount!==1||r.slotWidth>Math.min(16,r.cell)+.5)||g.overflow)throw Error('Image icon affected shared row geometry');
     if([0,1,2,3].some((i)=>Math.abs(g.geometry[i].cell-[24,9,34,52][i])>2)||Math.abs(g.geometry[4].cell/g.width-.08)>.01||
      g.geometry[1].slotWidth<8||g.geometry[5].cell<.45*g.width)throw Error('Unexpected cell widths or clipping');
     if(g.geometry.some((r,i)=>i!==5&&i!==8&&(r.bg!=='rgb(24, 38, 58)'||r.fg!=='rgb(245, 249, 255)'))||g.geometry[5].bg!=='rgba(0, 0, 0, 0)'||g.geometry[5].backgroundImage!=='none')throw Error('Unexpected sender palette or stylesheet applied');
     if(!g.grid.aligned||g.grid.role||g.grid.caption!=='Instrument readings'||g.grid.scope.join()!=='col,row'||g.grid.border!=='1px'||g.grid.aligns[1]!=='right'||
      g.grid.tracks.some((w,i)=>Math.abs(w/g.grid.width-[.48,.29,.23][i])>.02))throw Error('Data grid changed');
     if(record.names.filter(n=>n.startsWith('Remote image blocked — Observatory symbol')).length!==8||!record.names.some(n=>n.endsWith('Parent inline CSS'))||
      !record.names.some(n=>n.includes('Unavailable inline symbol'))||!g.reasons.includes('Relative source: 1')||!g.reasons.includes('Embedded and not displayed: 1')||
      g.standalone.length!==3||g.standalone.some(([name,visible,position,text,icons])=>!name||!visible||position==='absolute'||text||icons!==1)||
      !g.geometry[6].alt?.includes('Wide illustration'))throw Error('Meaningful alternative or diagnostic missing');
     record.result={passed:true};
    }else if(preconsent){
     const g=record.before=await run('preconsentCrop',JSON.stringify(preconsent));
     await shot(kind,true);
     const {nodes}=await call('Accessibility.getFullAXTree');
     record.accessibleIcon=nodes.find(n=>n.role?.value==='image'&&n.name?.value?.includes('Field bulletin symbol'))?.name.value??null;
     record.externalRequests=external;
     if(external.length||g.connections||g.requests.length||imageFrames.size)throw Error('External resource activity before consent');
     if(g.band<54||g.band>72||g.icon.some(n=>n<12||n>22)||g.bg!=='rgb(24, 38, 58)'||g.fg!=='rgb(245, 249, 255)'||g.ratio<4.5||
      g.firstRowOffset>135||!g.titleInCrop||!g.rowInCrop||g.layoutBorders.join()!=='0px,0px'||g.dataBorder!=='1px'||
      g.scope.join()!=='col,row'||g.role||g.aligns.join()!=='start,right,right'||!g.rowsAligned||g.overflow||
      g.columnWidths.some((w,i)=>Math.abs(w/g.width-[.48,.29,.23][i])>.02)||
      record.accessibleIcon!=='Remote image blocked — Field bulletin symbol')throw Error('Preconsent first crop fidelity mismatch');
     record.result={passed:true};
    }else if(full){
     record.result=await runFullReader({call,evaluate,poll,run,gesture,imageFrames,observed,origin,mobile,shot,responses});
    }else if(header){
     record.result=await runHeader({call,evaluate,poll,run,gesture,imageFrames,observed,origin,mobile,record,theme:header,dir:process.env.HEADER_SCREENSHOTS});
    }else if(diagnosticsLocale){
     const lang=JSON.stringify(diagnosticsLocale);
     record.before=await run('diagnosticsBefore',lang);
     if(observed.length)throw Error('CDP observed network before consent');
     await shot(kind+'-expanded',true);
     const point=await run('diagnosticsMissing',lang);
     if(observed.length)throw Error('CDP observed network on message switch');
     await gesture(point);
     record.failedImage=await poll(async()=>{
      const [session]=imageFrames.values();if(!session)return;
      return evaluate(`(() => {const i=document.querySelector('img');return i?.complete&&!i.naturalWidth&&i.alt==='Archive illustration'?{failedWithAlt:true}:null;})()`,false,session);
     });
     record.result=await run('diagnosticsAfter',lang);
    }else if(picture){
     const expected=picturePaths.map(path=>imageOrigin+path);
     record.before=await run('pictureBefore',JSON.stringify(expected));
     if(observed.length)throw Error('CDP observed picture network before consent');
     await shot('picture-blocked',true);
     await gesture(record.before.point);
     record.decoded=await poll(async()=>{
      const sessions=[...imageFrames.values()];if(sessions.length!==expected.length)return;
      const images=await Promise.all(sessions.map(session=>evaluate(`(async()=>{const i=document.querySelector('img');if(!i?.complete||!i.naturalWidth)return null;await i.decode();const r=i.getBoundingClientRect();return {url:i.currentSrc,alt:i.alt,natural:[i.naturalWidth,i.naturalHeight],width:r.width,height:r.height,visible:i.checkVisibility({visibilityProperty:true,opacityProperty:true})};})()`,true,session)));
      return images.every(i=>i?.natural[0]===640&&i.natural[1]===120&&i.width===128&&i.height>0&&i.visible)?images:null;
     });
     for(const [index,url] of expected.entries())if(!record.decoded.some(i=>i.url===url&&i.alt===`Swatch ${index+1}`))throw Error('Unexpected picture variant or alt text');
     record.visibleFrames=await run('pictureVisible',String(expected.length));
     await evaluate("document.querySelector('.formatted-mail iframe').scrollIntoView({block:'center'})");await delay(250);
     await shot('picture-loaded',true);
     record.result=await run('pictureReset');
     if(JSON.stringify(record.result.observed.map(r=>r.path).sort())!==JSON.stringify([...picturePaths].sort())||record.result.observed.some(r=>r.cookie||r.referer||r.authorization))throw Error('Unexpected picture requests or request metadata');
     record.browserRequests=observed;
    }else if(kind==='contrast'){
     record.result=await run('contrastStart');
     await shot('contrast-light',true);
     record.result.dark=await run('contrastTheme',JSON.stringify('dark'));
     await shot('contrast-dark',true);
     record.result.lightAgain=await run('contrastTheme',JSON.stringify('light'));
     record.result.palette=await run('contrastPalette');
     await shot('contrast-palette',true);
     record.result.paletteDark=await run('contrastPalette',JSON.stringify('dark'));
    }else if(studio){
     record.before=await run('studioBefore');
     if(observed.length)throw Error('CDP observed studio network before consent');
     await shot(baseline?'studio-before':'studio-after-blocked');
     const b=record.before;
     if(baseline){
      if(b.point||b.summary!=='23 images have unsupported sources.'||b.paper!=='rgba(0, 0, 0, 0)'||b.padding!=='0px'||b.cta?.fill!=='rgba(0, 0, 0, 0)')throw Error('Baseline does not match synthetic reproduction');
     }else{
      if(!b.point||b.summary||b.paper!=='rgb(245, 239, 227)'||b.ink!=='rgb(36, 51, 74)'||b.padding!=='16px'||b.heading!=='38px'||!b.font.includes('Georgia')||b.cta?.fill!=='rgb(135, 59, 48)'||b.cta.padding!=='24px'||b.overflow||
       (mobile?b.left.x!==b.right.x||b.right.y<=b.left.y:b.right.x<=b.left.x||b.left.y!==b.right.y))throw Error('Studio design reference did not match');
      await gesture(b.point);
      record.decoded=await poll(async()=>{
       const sessions=[...imageFrames.values()];if(sessions.length!==24)return;
       const images=await Promise.all(sessions.map(session=>evaluate(`(() => {const i=document.querySelector('img');if(!i?.complete)return null;return {path:new URL(i.src).pathname,width:i.naturalWidth,height:i.naturalHeight};})()`,false,session)));
       return images.every(i=>i?.width===640&&i.height===120)?images:null;
      });
      record.sizedFrames=await evaluate(`(() => [...document.querySelectorAll('.formatted-mail iframe')].map(f=>[f.clientWidth,f.clientHeight]))()`);
      if(record.sizedFrames[0][0]<=0||record.sizedFrames.slice(1).some(([w,h])=>w!==128||h!==24))throw Error('Incorrect bounded image dimensions');
      await evaluate("document.querySelector('.formatted-mail').scrollIntoView({block:'start'})");await delay(300);
      await shot('studio-after-detail',true);
      await shot('studio-after-loaded');
      record.hostRequests=await run('studioReset');
      const expected=['/studio.png',...Array.from({length:23},(_,i)=>`/tile-${i}.png`)].sort().join(',');
      if(record.decoded.map(i=>i.path).sort().join(',')!==expected||record.hostRequests.map(r=>r.path).sort().join(',')!==expected||record.hostRequests.some(r=>r.referer||r.authorization))throw Error('Unexpected studio images or request metadata');
     }
     record.result={passed:true};
    }else if(edition){
     record.before=await run('editionBefore');
     if(observed.length)throw Error('CDP observed edition network before consent');
     await shot(baseline?'edition-before':'edition-after-blocked');
     if(!record.before.point||record.before.oldWarnings||record.before.summary!=='3 images have unsupported sources.'||!record.before.alt)throw Error('Expected consent action, one counted summary and retained alt text');
     await gesture(record.before.point);
     record.decoded=await poll(async()=>{
      const sessions=[...imageFrames.values()];if(sessions.length!==2)return;
      const images=await Promise.all(sessions.map(session=>evaluate(`(() => {const img=document.querySelector('img');if(!img?.complete)return null;return {url:img.src,alt:img.alt,natural:img.naturalWidth,width:img.getBoundingClientRect().width,frameWidth:innerWidth};})()`,false,session)));
      return images.every(i=>i?.natural===640&&i.width>0&&i.width<=i.frameWidth&&(!mobile||i.width<640))?images:null;
     });
     // Bring both out-of-process frames into the mobile viewport before capture.
     if(mobile&&dir){
      await evaluate("document.querySelector('.formatted-mail iframe').scrollIntoView({block:'start'})");
      await delay(250);
     }
     await shot('edition-after-loaded');
     record.hostRequests=await run('editionReopen');
     if(JSON.stringify(record.hostRequests.map(r=>r.path).sort())!==JSON.stringify([...editionImages].sort())||record.hostRequests.some(r=>r.referer||r.authorization)||
        JSON.stringify(record.decoded.map(i=>i.url).sort())!==JSON.stringify(editionImages.map(path=>imageOrigin+path).sort())||
        record.decoded.map(i=>i.alt).sort().join(',')!=='Market stalls,Orchard at dawn')throw Error('Unexpected image URLs, alt text or request metadata');
     record.browserRequests=observed;
     record.result={passed:true};
    }else{
     const image=expected=>poll(async()=>{
      const sessions=[...imageFrames.values()];if(sessions.length!==1)return;
      const value=await evaluate(`(() => {const img=document.querySelector('img');if(!img?.complete)return null;return {path:new URL(img.src).pathname,alt:img.alt,natural:img.naturalWidth,width:img.getBoundingClientRect().width,frameWidth:innerWidth};})()`,false,sessions[0]);
      return value?.path===expected?value:null;
     });
     record.before=await run('gardenBefore',String(baseline));
     if(observed.length)throw Error('CDP observed newsletter network before consent');
     await shot(baseline?'before-blocked':'after-blocked');
     await gesture(record.before.point);
     record.gardenImage=await image('/garden.png');
     if(record.gardenImage.natural!==640||record.gardenImage.width<=0||record.gardenImage.width>record.gardenImage.frameWidth)throw Error('Garden image did not decode responsively');
     await shot(baseline?'before-loaded':'after-loaded');
     record.result={passed:true};
     if(!baseline){
      const missingPoint=await run('gardenMissing');
      if(observed.some(path=>path!=='/garden.png'))throw Error('Consent carried over to the missing image');
      await gesture(missingPoint);
      record.missingImage=await image('/missing.png');
      if(record.missingImage.natural!==0||record.missingImage.alt!=='Archive illustration'||record.missingImage.width<=0)throw Error('Missing-image fallback did not render');
      await shot('after-missing');
      record.result=await run('gardenAfter');
     }
     record.browserRequests=observed;
    }
   }
   else if(readerLocale){
    record.before=await evaluate(`import('/__test_reader.js').then(m=>m.beforeConsent(${JSON.stringify(readerLocale)}))`,true);
    if(record.before.locale!==readerLocale||record.before.theme!=='dark'||observed.length||record.before.connections||record.before.requests.length)throw Error('Wrong preference or network before consent: '+JSON.stringify(observed));
    const point=record.before.point;
    await call('Page.bringToFront');
    if(mobile){
     await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
     await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else{
     await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
     await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    }
    await evaluate(`new Promise((resolve,reject)=>{let tries=0;const timer=setInterval(()=>{if(document.querySelectorAll('.formatted-mail iframe').length===2){clearInterval(timer);resolve(true);}else if(++tries===40){clearInterval(timer);reject(Error('Consent did not create two isolated image frames'));}},50);})`,true);
    record.decoded=await poll(async()=>{
     const frames=[...imageFrames.values()];
     if(frames.length!==2)return null;
     const images=await Promise.all(frames.map(sessionId=>evaluate(`(() => {const img=document.querySelector('img');if(!img?.complete)return null;const {width,height}=img.getBoundingClientRect();return {path:new URL(img.src).pathname,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,width,height,frameWidth:innerWidth};})()`,false,sessionId)));
     return images.every(img=>img?.naturalWidth===640&&img.naturalHeight===120&&img.width>0&&img.width<=img.frameWidth&&img.height>0&&(!mobile||img.width<640))?images:null;
    }).catch(async error=>{
     record.frameCount=imageFrames.size;
     record.browserRequests=observed;
     record.hostRequests=await evaluate("fetch('/__test_image_requests').then(r=>r.json())",true);
     throw error;
    });
    if(record.decoded.map(i=>i.path).sort().join(',')!=='/redirect.png,/work.png')throw Error('Wrong decoded images');
    record.result=await evaluate("import('/__test_reader.js').then(m=>m.afterConsent())",true);
    record.browserRequests=observed;
    if(observed.some(path=>!['/final.png','/redirect.png','/work.png'].includes(path)))throw Error('Unexpected browser request: '+JSON.stringify(observed));
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
  }catch(error){record.error=error.stack;record.passed=false;}
  finally{ws?.close();if(tab?.id)await fetch(endpoint+'/json/close/'+tab.id);await stop(h);}
 }
 console.log(JSON.stringify({browser:Browser,results},null,2));if(results.some(r=>!r.passed))process.exitCode=1;
}finally{await stop(browser);await rm(profile,{recursive:true,force:true,maxRetries:5});}
