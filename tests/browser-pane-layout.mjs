import assert from 'node:assert/strict';

const columns=['#mailbox-nav','.list','.reader'];
const offsets=`[${columns.map(s=>`document.querySelector('${s}').scrollTop`).join(',')},scrollY]`;
const returnControl='.mobile-list-return';
export async function paneLayout({call,evaluate,poll,run,gesture,mobile,shot,locale,assets}){
 const sizes=mobile?[390,844]:[1600,900];
 const resize=height=>call('Emulation.setDeviceMetricsOverride',{width:sizes[0],height,deviceScaleFactor:1,mobile});
 const press=async key=>{
  for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:27});
 };
 const point=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
 await run('fullOpenLong',JSON.stringify(locale));
 const navigation=await evaluate(`({legacy:[...document.querySelectorAll('.reader button')].some(b=>/Back to list|Terug naar lijst/.test(b.textContent)),mobileReturn:!!document.querySelector('${returnControl}')?.getClientRects().length})`);
 let scrolling;
 if(!mobile){
  await call('Page.bringToFront');
  await resize(330);
  // Start from the title after the consent-control positioning by the setup helper.
  await evaluate("document.getElementById('readtitle').scrollIntoView({block:'start'})");
  const ranges=await evaluate(`(${JSON.stringify(columns)}).map(s=>{const e=document.querySelector(s);return e.scrollHeight-e.clientHeight})`);
  const rootRange=await evaluate('document.scrollingElement.scrollHeight-innerHeight');
  const movements=[];
  for(const [i,selector] of columns.entries()){
   const before=await evaluate(offsets);
   const p=await point(selector);
   await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.x,y:Math.min(p.y,160),deltaX:0,deltaY:before[i]>=ranges[i]?-160:160});
   await new Promise(resolve=>setTimeout(resolve,220));
   const after=await evaluate(offsets);
   movements.push(after.map((n,j)=>n-before[j]));
  }
  scrolling={ranges,rootRange,movements};
  await resize(sizes[1]);
 }
 const beforeAssets=await assets();
 const grant=await run('fullPoint',JSON.stringify('all'));
 const identity=await evaluate('performance.timeOrigin');
 await gesture(grant);
 const placement=await poll(()=>evaluate(`(()=>{const f=document.querySelector('.full-mail-document');if(!f)return null;
 const box=e=>{const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]};
 return {frame:box(f),pane:box(document.querySelector('.reader')),modal:!!f.closest('dialog'),samePage:performance.timeOrigin===${identity},viewport:[innerWidth,innerHeight]};})()`));
 await shot('pane-layout',true);
 assert.deepEqual({navigation,independent:mobile||scrolling.rootRange===0&&scrolling.ranges.every(n=>n>0)&&scrolling.movements.every((row,i)=>row.every((n,j)=>i===j?n!==0:n===0)),inline:!placement.modal&&placement.samePage&&placement.frame[0]>=placement.pane[0]&&placement.frame[1]>=placement.pane[1]&&placement.frame[2]<=placement.pane[2]+1&&placement.frame[3]<=placement.pane[3]+1},
  {navigation:{legacy:false,mobileReturn:mobile},independent:true,inline:true},JSON.stringify({navigation,scrolling,placement}));
 // Reset with desktop keyboard; on mobile use the messages control from full mode.
 if(mobile)await gesture(await point(returnControl));
 else{
  await press('Escape');
  await poll(()=>evaluate("!document.querySelector('.full-mail-document')&&document.activeElement.matches('.full-reader-controls button')"));
  await press('Escape');
 }
 await poll(()=>evaluate("!document.querySelector('#readtitle')&&document.activeElement.matches('.list .mail')"));
 assert.ok((await assets()).length>=beforeAssets.length);
 await shot('pane-return',true);
 return {navigation,scrolling,placement,returnFocus:true};
}
