import assert from 'node:assert/strict';
import {runReaderScroll,shortReaderGeometry} from './browser-reader-scroll.mjs';
import {paneLayout} from './browser-pane-layout.mjs';
const fixturePaths=['/full-background.svg','/full-font.ttf','/full-mail.css','/header-wordmark.png','/sizing-portrait.png'];
const imagePaths=['/header-wordmark.png','/sizing-portrait.png'];
const sorted=xs=>xs.map(r=>r.path).sort();
const childState=`(() => {
 const h=document.querySelector('.cover'),img=[...document.images];
 if(!h||document.readyState!=='complete'||document.fonts.status!=='loaded'||img.some(i=>!i.naturalWidth))return null;
 const rect=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]};
 const p=document.querySelector('.inline'),grid=document.querySelector('.grid');
 return {origin:self.origin,referrer:document.referrer,viewport:[innerWidth,innerHeight],clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
  logo:rect(img[0]),portrait:rect(img[1]),column:rect(grid.querySelector('p')),cover:getComputedStyle(h).backgroundColor,
  background:getComputedStyle(h).backgroundImage,padding:getComputedStyle(p).paddingLeft,margin:getComputedStyle(p).marginTop,
  fonts:[...document.fonts].map(f=>[f.family,f.status]),active:document.querySelectorAll('form,button,input,iframe,script,[download],a[href]').length};
})()`;
const readerCSP="sandbox; default-src 'none'; style-src https: 'unsafe-inline'; img-src https:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
export async function runFullReader({call,evaluate,poll,run,gesture,imageFrames,observed,origin,mobile,shot,responses}){
 const locale=mobile?'nl':'en';
 const response=path=>responses.findLast(r=>r.origin===origin&&r.path===path);
 const headers=await evaluate(`Promise.all(['/', '/index.html','/health','/api/session', '/api/reader/document'].map(async path=>{const r=await fetch(path);return {path,status:r.status,headers:Object.fromEntries(r.headers)}}))`,true);
 const parent=headers[0].headers['content-security-policy'];
 assert.equal(headers[1].headers['content-security-policy'],parent);
 assert.equal(parent,headers[2].headers['content-security-policy'].replace("frame-src 'none'",`frame-src ${origin}/api/reader/document`));
 assert.equal(headers[2].headers['content-security-policy'],headers[3].headers['content-security-policy']);
 assert.equal(headers[4].status,404);
 assert.equal(headers[4].headers['content-security-policy'],readerCSP);
 const before=await run('fullStart',JSON.stringify(locale));
 assert.deepEqual(observed,[]);
 await shot('full-blocked',true);
 const assets=()=>evaluate("fetch('/__test_image_requests').then(r=>r.json())",true);
 if(process.env.PANE_LAYOUT_ONLY==='1')return {passed:true,layout:await paneLayout({call,evaluate,poll,run,gesture,mobile,shot,locale,assets})};
 const connections=()=>evaluate("fetch('/__test_image_connections').then(r=>r.json())",true);
 const ownAssets=()=>evaluate("fetch('/__test_full_same_origin_requests').then(r=>r.json())",true);
 await gesture(before.point);
 const images=await poll(async()=>{const r=await assets();return r.length>=2?r:null;});
 assert.deepEqual(sorted(images),imagePaths);
 assert.ok(images.every(r=>!r.referer&&!r.cookie&&!r.authorization));
 assert.deepEqual(await ownAssets(),[]);
 const allPoint=await run('fullReopen');
 assert.equal((await assets()).length,2);
 await gesture(allPoint);
 const frame=await poll(()=>evaluate(`(()=>{const f=document.querySelector('.full-mail-document');return f&&{opaque:f.contentDocument===null,sandbox:f.getAttribute('sandbox'),referrer:f.referrerPolicy,hasSrcdoc:f.hasAttribute('srcdoc'),width:f.clientWidth,overflow:document.documentElement.scrollWidth>innerWidth}})()`));
 assert.deepEqual({...frame,width:0},{opaque:true,sandbox:'',referrer:'no-referrer',hasSrcdoc:false,width:0,overflow:false});
 const child=async expression=>{
  for(const session of imageFrames.values()){
   const r=await evaluate(expression,false,session).catch(()=>null);
   if(r!==null&&r!==undefined)return r;
  }
 };
 const rendered=await poll(()=>child(childState));
 const checks=r=>{
  assert.equal(r.origin,'null');assert.equal(r.referrer,'');assert.equal(r.active,0);
  assert.equal(r.scrollWidth,r.clientWidth);assert.deepEqual(r.logo.slice(2),[120,28]);assert.deepEqual(r.portrait.slice(2),[120,240]);
  assert.equal(r.cover,mobile?'rgb(31, 65, 103)':'rgb(23, 76, 54)');
  assert.ok(mobile?r.column[0]===r.portrait[0]&&r.column[1]>r.portrait[1]:r.column[0]>r.portrait[0]&&r.column[1]===r.portrait[1]);
  assert.equal(r.padding,'13px');assert.equal(r.margin,'19px');assert.match(r.background,/full-background\.svg/);
  assert.deepEqual(r.fonts,[['Fixture','loaded']]);
 };
 checks(rendered);
 const iframeResponse=response('/api/reader/document');
 function checkResponse(r){assert.equal(r.status,200);for(const [name,value] of Object.entries({'content-security-policy':readerCSP,'cache-control':'no-store','referrer-policy':'no-referrer','content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','x-dns-prefetch-control':'off'}))assert.equal(r.headers[name],value);}
 checkResponse(iframeResponse);
 const css=responses.find(r=>r.path==='/full-mail.css');assert.ok(css&&!css.headers['access-control-allow-origin']);
 const full=await assets();const framedConnections=await connections();
 assert.deepEqual(sorted(full.slice(2)),fixturePaths);
 for(const r of full)assert.ok(!r.cookie&&!r.authorization&&(!r.referer||r.stylesheetReferrer),JSON.stringify(r));
 const iframeOwnAssets=await ownAssets();
 const anonymous={cookie:false,authorization:false,referer:false};
 assert.deepEqual(iframeOwnAssets,[anonymous]);
 if(process.env.FULL_SCROLL_BASELINE==='1')await evaluate("document.getElementById('full-reader-privacy').parentElement.scrollIntoView({block:'start'})");
 const short=await shortReaderGeometry({evaluate,poll,child,shot});
 await shot('full-loaded',true);
 await run('fullReset');
 assert.equal((await assets()).length,full.length);assert.equal(await connections(),framedConnections);
 const directPath=await run('fullDirectPath');
 await call('Page.enable');
 // Trusted top-level browser navigation from the app, with no iframe sandbox attribute present.
 await evaluate(`location.assign(${JSON.stringify(directPath)});true`);
 const direct=await poll(()=>evaluate(childState));checks(direct);
 const directResponse=response('/api/reader/document');checkResponse(directResponse);
 await call('Page.navigate',{url:origin+'/'});
 await poll(()=>evaluate("!!document.querySelector('main')"));
 const directOwnAssets=await ownAssets();
 assert.deepEqual(directOwnAssets,[anonymous,anonymous]);
 const after=await assets();assert.deepEqual(sorted(after.slice(full.length)),fixturePaths);
 assert.ok(after.every(r=>!r.cookie&&!r.authorization&&(!r.referer||r.stylesheetReferrer)));
 const scroll=await runReaderScroll({call,evaluate,poll,child,run,gesture,mobile,shot,locale,assets,connections});
 return {passed:true,locale,headers,iframeResponse,directResponse,css,before,imageOnly:images,framed:full.slice(2),framedConnections,frame,rendered,direct,directRequests:after.slice(full.length),iframeOwnAssets,directOwnAssets,short,scroll};
}
