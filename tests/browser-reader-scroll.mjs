import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const shellState=`(() => {
 const f=document.querySelector('.full-mail-document');if(!f)return null;
 const rect=e=>{const {x,y,width,height}=e.getBoundingClientRect();return {x,y,width,height}};
 const root=document.scrollingElement;
 return {frame:rect(f),pane:rect(f.closest('.reader')),modal:!!f.closest('dialog'),border:getComputedStyle(f).borderTopWidth,frameHeightRule:getComputedStyle(f).height,
  rootRange:root.scrollHeight-root.clientHeight,rootY:root.scrollTop,viewport:[innerWidth,innerHeight],opaque:f.contentDocument===null,
  ancestors:Array.from((function*(){for(let e=f.parentElement;e;e=e.parentElement)yield e})(),e=>({name:e.nodeName,className:e.className,overflow:getComputedStyle(e).overflowY,range:e.scrollHeight-e.clientHeight,y:e.scrollTop})),
  controls:[...document.querySelectorAll('.full-reader-toolbar button')].map(rect)};
})()`;
const newsletter=`(() => {
 const footer=document.querySelector('footer');if(!footer?.innerText.includes('Synthetic footer'))return null;
 const r=footer.getBoundingClientRect(),root=document.scrollingElement;
 return {y:scrollY,range:root.scrollHeight-root.clientHeight,footer:[r.top,r.bottom],visible:r.top>=0&&r.bottom<=innerHeight,image:document.images[0].naturalHeight,height:innerHeight};
})()`;
const baseline=process.env.FULL_SCROLL_BASELINE==='1';

export function assertSingle(s){
 assert.equal(s.border,'0px');assert.equal(s.rootRange,0);assert.equal(s.rootY,0);assert.equal(s.opaque,true);
 assert.equal(s.modal,false);assert.equal(s.frame.x,s.pane.x);assert.equal(s.frame.width,s.pane.width);
 assert.ok(s.frame.height>0&&Math.abs(s.frame.y+s.frame.height-s.pane.y-s.pane.height)<=1,JSON.stringify(s));
 assert.ok(s.ancestors.every(e=>e.y===0&&(!(e.range>0)||['visible','clip'].includes(e.overflow))));
 assert.equal(s.controls.length,3);
 assert.ok(s.controls.every(b=>b.y>=0&&b.y+b.height<=s.frame.y&&b.x>=0&&b.x+b.width<=s.viewport[0]));
}

export async function shortReaderGeometry({evaluate,poll,child,shot}){
 const shell=await poll(()=>evaluate(shellState));
 const content=await child('document.documentElement.scrollHeight-innerHeight');
 if(!baseline)assertSingle(shell);
 await shot('short-full',true);
 return {shell,content};
}

export async function runReaderScroll({call,evaluate,poll,child,run,gesture,mobile,shot,locale,assets,connections}){
 const getShell=()=>evaluate(shellState);
 const measure=()=>child(newsletter);
 const press=async (key,code,modifiers=0)=>{
  for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key,code:key===' '?'Space':key,windowsVirtualKeyCode:code,modifiers,...(type==='keyDown'&&key===' '?{text:' '}:{} )});
 };
 const pointFor=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
 const interact=async (point,direction)=>{
  if(!mobile){await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:direction*650});await delay(100);return;}
  const inset=Math.min(70,point.height/2-4);
  const y=point.y+direction*inset;
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y}]});
  for(let i=1;i<=7;i++){
   await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:y-direction*i*inset*2/7}]});
   await delay(18);
  }
  await delay(90);
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await delay(120);
 };
 const flow=async (point,direction,done)=>{
  for(let i=0;i<90;i++){const state=await measure();if(done(state))return state;await interact(point,direction);}
  assert.fail('User scroll did not reach target: '+JSON.stringify(await measure()));
 };
 const existing=await assets(),existingConnections=await connections();
 const point=await run('fullOpenLong',JSON.stringify(locale));
 assert.deepEqual(await assets(),existing);assert.equal(await connections(),existingConnections);
 await gesture(point);
 const initial=await poll(measure);
 assert.equal(initial.y,0);assert.ok(initial.range>0&&!initial.visible);assert.equal(initial.image,0);
 await evaluate("fetch('/__test_release_late_image',{method:'POST'}).then(r=>r.json())",true);
 const loaded=await poll(async()=>{const s=await measure();return s?.image===380?s:null;});
 assert.ok(loaded.range>=initial.range+340);assert.equal(loaded.y,0);
 const first=await getShell();
 await shot('long-first-screen',true);
 const consentRequests=(await assets()).slice(existing.length);
 assert.deepEqual(consentRequests.map(r=>r.path),['/late-reader.svg']);
 assert.ok(consentRequests.every(r=>!r.cookie&&!r.authorization&&!r.referer));
 if(baseline){
  assert.equal(first.border,'1px');
  assert.ok(Math.abs(first.frame.height-Math.min(800,Math.max(320,first.viewport[1]*.65)))<1);
  assert.ok(first.rootRange>0&&loaded.range>0);
  // Here movement over the app margin changes the page but not the iframe.
  await interact({x:5,y:first.viewport[1]*.55},1);
  const outerMoved=await poll(async()=>{const s=await getShell();return s.rootY!==first.rootY?s:null;});
  assert.equal((await measure()).y,0);
  const framePoint={x:outerMoved.frame.x+outerMoved.frame.width/2,y:Math.max(0,outerMoved.frame.y)+Math.min(first.viewport[1]-Math.max(0,outerMoved.frame.y),outerMoved.frame.height)/2};
  const footer=await flow(framePoint,1,s=>s.visible);
  await shot('long-footer',true);
  return {baseline,initial,loaded,first,outerMoved,footer,afterFooter:await getShell(),consentRequests};
 }
 assertSingle(first);
 const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2,height:r.height});
 const framePoint=center(first.frame);
 let keyboard;
 if(!mobile){
  assert.ok(await evaluate("document.activeElement.matches('.full-reader-toolbar button:first-child')"));
  await press('Tab',9); // Back to safe view → Message options → Read message.
  await press('Tab',9);
  assert.ok(await evaluate("document.activeElement.matches('.full-reader-toolbar button:last-of-type')"));
  await press(' ',32);
  await poll(()=>child('document.hasFocus()'));
  await press('End',35);
  const end=await poll(async()=>{const s=await measure();return s.visible?s:null;});
  await shot('long-keyboard-footer',true);
  await press('Home',36);
  const home=await poll(async()=>{const s=await measure();return s.y===0?s:null;});
  assertSingle(await getShell());keyboard={end,home};
 }
 const footer=await flow(framePoint,1,s=>s.visible);
 assertSingle(await getShell());
 await shot('long-footer',true);
 const returned=await flow(framePoint,-1,s=>s.y===0);
 assertSingle(await getShell());
 await shot('long-returned',true);
 const small=mobile?[320,280]:[640,320];
 await call('Emulation.setDeviceMetricsOverride',{width:small[0],height:small[1],deviceScaleFactor:1,mobile});
 const resized=await poll(async()=>{const s=await getShell();return s.viewport.join()===small.join()?s:null;});
 assertSingle(resized);
 const smallPoint=center(resized.frame);
 await shot('long-small-start',true);
 const resizedFooter=await flow(smallPoint,1,s=>s.visible);
 assertSingle(await getShell());
 await shot('long-small-footer',true);
 const infoPoint=await pointFor('.full-reader-toolbar [aria-controls]');
 await gesture(infoPoint);
 const state=await evaluate(`(()=>{const f=document.querySelector('.full-mail-document'),p=document.querySelector('.full-reader-info');
  return {hidden:getComputedStyle(f).visibility,inert:f.inert,info:!p.hidden,range:p.scrollHeight-p.clientHeight}})()`);
 assert.deepEqual({...state,range:0},{hidden:'hidden',inert:true,info:true,range:0});
 assert.ok(state.range>0);
 const actions='.full-reader-info .actions';
 // Use only the options pane scroll range, then reveal the original plain text.
 const panelPoint=smallPoint;
 const panelGesture=async selector=>{
  for(let i=0;i<5;i++){
   const point=await pointFor(selector);
   if(await evaluate(`!!document.elementFromPoint(${point.x},${point.y})?.closest(${JSON.stringify(selector)})`))return gesture(point);
   await interact(panelPoint,point.y>=panelPoint.y?1:-1);
  }
  assert.fail('Options control not reachable: '+selector);
 };
 await delay(650); // End Chromium's wheel sequence latched to the old frame.
 for(let i=0;i<3;i++){
  await interact(panelPoint,1);
  if(await evaluate("document.querySelector('.full-reader-info').scrollTop>0"))break;
 }
 await poll(()=>evaluate("document.querySelector('.full-reader-info').scrollTop>0 && scrollY===0")).catch(async error=>{
  const state=await evaluate(`({point:${JSON.stringify(panelPoint)},hit:document.elementFromPoint(${panelPoint.x},${panelPoint.y})?.outerHTML.slice(0,160),y:scrollY,infoY:document.querySelector('.full-reader-info').scrollTop})`);
  throw Error('Options scroll: '+JSON.stringify(state),{cause:error});
 });
 await panelGesture('.full-reader-info summary');
 await poll(()=>evaluate("document.querySelector('.full-reader-info details').open && document.querySelector('.full-reader-info pre').textContent.trim()==='Plain long fixture'"));
 await shot('long-small-options',true);
 await gesture(infoPoint);
 assert.ok(await evaluate("document.querySelector('.full-reader-info').hidden"));
 assert.equal((await measure()).y,resizedFooter.y);
 if(mobile)await gesture(await pointFor('.full-reader-toolbar button:first-child'));
 else{
  // Escape does not cross the opaque frame; Shift+Tab returns to Read message.
  const read='.full-reader-toolbar button:last-of-type';
  await press('Tab',9);
  await poll(()=>evaluate(`document.activeElement.matches('${read}[aria-describedby]')`));
  await press(' ',32);
  await poll(()=>child('document.hasFocus()'));
  await press('Tab',9,8);
  await poll(()=>evaluate(`document.activeElement.matches('${read}')`));
  assert.equal(await child('document.hasFocus()'),false);
  await press('Escape',27);
 }
 await poll(()=>evaluate("!document.querySelector('.full-mail-document') && document.activeElement.matches('.full-reader-controls button')"));
 const afterReset=await getShell();assert.equal(afterReset,null);
 const again=await run('fullOpenLong',JSON.stringify(locale));
 assert.deepEqual((await assets()).slice(existing.length),consentRequests);
 await gesture(again);
 const reopened=await poll(async()=>{const s=await measure();return s?.image===380?s:null;});
 assert.equal(reopened.y,0);
 if(mobile)await gesture(await pointFor('.mobile-list-return'));
 else{
  await press('Escape',27);
  await poll(()=>evaluate("document.activeElement.matches('.full-reader-controls button')"));
  await press('Escape',27);
 }
 await poll(()=>evaluate("!document.querySelector('.full-reader') && document.activeElement.matches('.list .mail')"));
 const reopenAgain=await run('fullOpenLong',JSON.stringify(locale));
 assert.equal((await assets()).length,existing.length+2);
 await gesture(reopenAgain);
 await poll(async()=>{const s=await measure();return s?.image===380&&s.y===0;});
 await gesture(await pointFor('.full-reader-toolbar [aria-controls]'));
 await poll(()=>evaluate("!document.querySelector('.full-reader-info').hidden"));
 if(mobile)await panelGesture(`${actions} button:last-of-type`);
 else{
  const onReply=()=>evaluate(`document.activeElement.matches('${actions} button:last-of-type')`);
  for(let i=0;i<5&&!await onReply();i++)await press('Tab',9);
  assert.ok(await onReply());
  await press(' ',32);
 }
 await poll(()=>evaluate("!document.querySelector('.full-reader') && document.querySelector('textarea')?.value.trim()==='Plain long fixture'")).catch(async error=>{
  const state=await evaluate(`({full:!!document.querySelector('.full-reader'),info:document.querySelector('.full-reader-info')?.hidden,actions:[...document.querySelectorAll('${actions} button')].map(b=>[b.textContent,b.disabled]),text:document.querySelector('textarea')?.value})`);
  throw Error('Reply state: '+JSON.stringify(state),{cause:error});
 });
 assert.equal((await assets()).length,existing.length+3);
 return {baseline,initial,loaded,first,footer,returned,keyboard,resized,resizedFooter,state,reopened,consentRequests,closeAndReply:true};
}
