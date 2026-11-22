import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {headerPaths} from './header-fixture.ts';

export async function runHeader({call,evaluate,poll,run,gesture,imageFrames,observed,origin,mobile,record,theme,dir}){
 const baseline=process.env.HEADER_BASELINE==='1';
 record.before=await run('headerBefore',JSON.stringify(theme));
 assert.deepEqual(observed,[],'browser observed image traffic before consent');
 await gesture(record.before.point);
 record.decoded=await poll(async()=>{
  const sessions=[...imageFrames.values()];if(sessions.length!==(baseline?5:4))return;
  const decoded=await Promise.all(sessions.map(id=>evaluate(`(() => {
   const i=document.querySelector('img');if(!i?.complete||!i.naturalWidth)return null;
   const r=i.getBoundingClientRect();return {path:new URL(i.src).pathname,natural:[i.naturalWidth,i.naturalHeight],paint:[r.width,r.height],scheme:getComputedStyle(document.documentElement).colorScheme,static:document.scripts.length===0};
  })()`,false,id)));
  return decoded.every(Boolean)?decoded:null;
 });
 record.after=await run('headerAfter');
 const expected=baseline?[...headerPaths,'/header-alternate.png']:headerPaths;
 assert.deepEqual(record.after.requests.map(r=>r.path).sort(),[...expected].sort());
 assert.ok(record.after.requests.every(r=>!r.cookie&&!r.referer&&!r.authorization));
 assert.ok(record.decoded.every(i=>i.static));
 const geometry=reference=>evaluate(`(() => {
  const root=document.querySelector(${JSON.stringify(reference?'main':'.formatted-mail')}),{x,y,width}=root.getBoundingClientRect();
  const box=el=>{const r=el.getBoundingClientRect(),n=v=>Math.round(v*10)/10;return [n(r.x-x),n(r.y-y),n(r.width),n(r.height)]};
  const tables=[...root.querySelectorAll('table')].filter(t=>t.getClientRects().length);
  const art=[...root.querySelectorAll(${JSON.stringify(reference?'img':'iframe')})].filter(i=>i.getClientRects().length);
  return {x:Math.round(x+scrollX),y:Math.round(y+scrollY),width,tables:tables.map(box),art:art.map(box),heading:box(root.querySelector('h1')), lines:[...tables[0].querySelectorAll('td>span:not([class])')].map(el=>{const r=document.createRange();r.selectNodeContents(el);return r.getClientRects().length})};
 })()`);
 const crop=async (name,rect)=>{
  const {data}=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:rect.x,y:rect.y,width:rect.width,height:320,scale:1}});
  if(dir){await mkdir(dir,{recursive:true});await writeFile(join(dir,`${name}-${theme}-${mobile?'narrow':'wide'}.png`),Buffer.from(data,'base64'));}
  // Read actual compositor pixels, not the iframe's computed background.
  return evaluate(`(async()=>{
   const bmp=await createImageBitmap(new Blob([Uint8Array.fromBase64(${JSON.stringify(data)})],{type:'image/png'}));
   const ctx=new OffscreenCanvas(bmp.width,bmp.height).getContext('2d');ctx.drawImage(bmp,0,0);
   const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3);
   const {art,heading,width}= ${JSON.stringify(rect)};
   const area=(x,y,w,h)=>{const d=ctx.getImageData(x,y,w,h).data;let white=0,green=0,ink=0;
    for(let i=0;i<d.length;i+=4){const [r,g,b]=[d[i],d[i+1],d[i+2]];if(r===255&&g===255&&b===255)white++;if(r===23&&g===76&&b===54)green++;if(r===245&&g===255&&b===245)ink++;}return {white,green,ink};};
   const [cx,cy,cw,ch]=art.at(-2),[hx,hy,hw]=art.at(-1);
   return {logoCorner:pixel(art[0][0]+1,art[0][1]+1),iconCorner:pixel(art[1][0]+1,art[1][1]+1),
    logo:area(Math.floor(art[0][0]),Math.floor(art[0][1]),Math.min(126,Math.floor(art[0][2])),24),
    topEdge:pixel(2,2),titleEdge:pixel(2,heading[1]+1),crop:area(0,0,width,320),
    countdown:area(Math.round(cx),Math.round(cy),Math.round(cw),Math.round(ch)).ink,
    heroTop:pixel(hx+hw/2,hy+4)};
  })()`,true);
 };
 record.reader=await geometry(false);
 await call('Page.bringToFront');
 record.readerPixels=await crop(baseline?'baseline':'candidate',record.reader);
 await call('Emulation.setDeviceMetricsOverride',{width:record.reader.width,height:844,deviceScaleFactor:1,mobile});
 await call('Page.navigate',{url:origin+'/__test_header'});
 await poll(()=>evaluate(`location.pathname==='/__test_header'&&document.readyState==='complete'&&[...document.images].every(i=>i.naturalWidth)`));
 record.reference=await geometry(true);
 record.referencePixels=await crop('reference',record.reference);
 const a=record.reader,b=record.reference,p=record.readerPixels,q=record.referencePixels;
 assert.equal(a.width,b.width);
 if(!mobile)assert.equal(a.width,720);
 if(baseline){
  assert.ok(a.tables.length>b.tables.length&&a.art[0][3]>b.art[0][3]*2&&a.heading[1]>b.heading[1]+60,'baseline geometry did not reproduce');
  assert.notDeepEqual(p.logoCorner,q.logoCorner,'baseline opaque iframe did not reproduce');
  assert.ok(a.lines.every((n,i)=>n>b.lines[i]),'baseline label wrapping did not reproduce');
 }else{
  assert.ok(!record.after.overflow);
  assert.equal(a.tables.length,b.tables.length);
  assert.equal(a.art.length,4);
  assert.deepEqual(a.lines,b.lines);
  assert.deepEqual([p.logoCorner,p.iconCorner,p.topEdge,p.titleEdge],[q.logoCorner,q.iconCorner,q.topEdge,q.titleEdge]);
  assert.ok(p.logo.ink>q.logo.ink*.8,'wordmark not painted legibly');
  assert.deepEqual(p.heroTop,q.heroTop);
  assert.ok(p.countdown>1000&&p.countdown===q.countdown,'static countdown pixels missing');
  assert.ok(a.art[0][2]<=126&&a.art[0][3]<=36&&a.art[1][2]<=24&&a.art[1][3]<=36,'unbounded compact art');
  assert.ok(Math.abs(a.heading[1]-b.heading[1])<=10&&Math.abs(a.art[3][1]-b.art[3][1])<=10,'heading/hero not aligned to reference');
  assert.ok(Math.abs(a.art[2][0]+a.art[2][2]/2-a.width/2)<=1,'countdown not centered');
  assert.deepEqual(record.decoded.find(i=>i.path===headerPaths[2]).natural,[240,72]);
 }
 return {passed:true};
}
