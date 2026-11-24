import assert from 'node:assert/strict';
import {unhintedAlt} from './preconsent-fixture.ts';

export async function runImageDescriptions({call,evaluate,poll,run,gesture,imageFrames,external,traffic,mobile,shot,locale,before}){
 const nl=locale==='nl',label=nl?'Afbeeldingsbeschrijvingen tonen':'Show image descriptions';
 const title=nl?'Beschrijvingen van geblokkeerde afbeeldingen':'Blocked image descriptions';
 const close=nl?'Sluiten':'Close';
 const trigger='.image-descriptions-trigger',modal='.image-descriptions-dialog';
 const find=selector=>`document.querySelector(${JSON.stringify(selector)})`;
 const point=selector=>evaluate(`(()=>{const b=${find(selector)};b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const key=async (key,windowsVirtualKeyCode)=>{
  await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode,...(key==='Enter'?{text:'\r'}:{})});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode});
 };
 const focused=selector=>evaluate(`${find(selector)}!==null && document.activeElement===${find(selector)}`);
 const heights=()=>evaluate(`[...document.querySelectorAll('tr')].filter(r=>r.cells.length>1&&r.querySelector('.mail-image-placeholder')).map(r=>r.getBoundingClientRect().height)`);
 const activate=async(selector)=>{
  if(mobile)await gesture(await point(selector));
  else{
   await evaluate("document.getElementById('readtitle').focus()");
   for(let i=0;i<7&&!(await focused(selector));i++)await key('Tab',9);
   assert.ok(await focused(selector),`${selector} not reachable by Tab from the message heading`);
   await key('Enter',13);
  }
 };
 const open=async()=>{
  await activate(trigger);
  assert.ok(await evaluate(`${find(modal)}?.matches(':modal')`),'description dialog did not open');
  assert.ok(await focused(`${modal} button`),'initial focus did not enter dialog');
 };
 const narrow=before.geometry[1];
 assert.ok(narrow.cell>=8&&narrow.cell<=11&&narrow.text===''&&narrow.iconCount===1,'9px reproduction is not icon-only');
 assert.equal(before.geometry.length,9);
 assert.ok(before.geometry.every(r=>Math.abs(r.height-r.withoutLabel)<=.5));
 assert.deepEqual({connections:before.connections,requests:before.requests,external,frames:imageFrames.size},{connections:0,requests:[],external:[],frames:0});
 const control=await evaluate(`(()=>{const b=${find(trigger)};if(!b)return null;const r=b.getBoundingClientRect();return {text:b.textContent.trim(),width:r.width,height:r.height,count:document.querySelectorAll('${trigger}').length,inBody:!!b.closest('.formatted-mail')};})()`);
 assert.ok(control,'one discoverable message-level image description action is missing');
 assert.deepEqual({text:control.text,count:control.count,inBody:control.inBody},{text:label,count:1,inBody:false});
 assert.ok(control.width>=44&&control.height>=44,'description action is too small');
 assert.equal(await evaluate("document.querySelectorAll('.formatted-mail :is(button,[tabindex],a[href])').length"),0);
 await point(trigger);
 await shot(`image-descriptions-${locale}-trigger`,true);
 const httpStart=traffic.length;
 await open();
 const openedHeights=await heights();
 assert.deepEqual(openedHeights,before.geometry.map(r=>r.height));
 const detail=await evaluate(`(()=>{const d=${find(modal)},list=d.querySelector('ol');return {title:document.getElementById(d.getAttribute('aria-labelledby')).textContent,close:d.querySelector('button').textContent,
 items:[...list.children].map(li=>li.textContent),markup:list.querySelectorAll('*:not(li):not(bdi)').length,visible:list.checkVisibility(),fits:list.scrollWidth===list.clientWidth};})()`);
 const labelForImage=nl?'Externe afbeelding geblokkeerd':'Remote image blocked';
 const narrowText=`${labelForImage} — ${unhintedAlt} <b>blue & gold</b> Parent inline CSS`;
 assert.equal(detail.items[1],narrowText);
 assert.deepEqual(detail.items,await evaluate("[...document.querySelectorAll('.formatted-mail .mail-image-placeholder')].map(p=>p.getAttribute('aria-label'))"));
 assert.equal(detail.items.length,12);
 assert.deepEqual({title:detail.title,close:detail.close,markup:detail.markup,visible:detail.visible,fits:detail.fits},{title,close,markup:0,visible:true,fits:true});
 // Let Chromium's transient tap highlight clear before capturing the dialog.
 if(mobile)await new Promise(resolve=>setTimeout(resolve,350));
 await shot(`image-descriptions-${locale}-open`,true);
 if(mobile)await gesture(await point(`${modal} button`));
 else{
  await key('Tab',9);
  assert.ok(await focused(`${modal} [role=region]`),'keyboard cannot enter the description list to scroll');
  await key('Escape',27);
 }
 assert.ok(await focused(trigger),'dismissal did not restore focus');
 assert.ok(await evaluate(`!${find(modal)}?.open`),'dialog not dismissed');
 const closedHeights=await heights();
 assert.deepEqual(closedHeights,openedHeights);
 await open();
 if(mobile)await gesture(await point(`${modal} button`));else await key('Enter',13);
 assert.ok(await focused(trigger)&&await evaluate(`!${find(modal)}?.open`),'close button did not restore focus');
 await new Promise(resolve=>setTimeout(resolve,250));
 const displayRequests=traffic.slice(httpStart);
 assert.deepEqual(displayRequests,[],'description actions made HTTP(S) requests');
 const reset=await run('descriptionReset',JSON.stringify(locale));
 assert.deepEqual(reset,{connections:0,requests:[]});
 assert.deepEqual(external,[]);
 assert.equal(imageFrames.size,0);
 await open();
 assert.equal(await evaluate(`${find(modal)}.querySelectorAll('li')[1].textContent`),narrowText);
 if(mobile)await gesture(await point(`${modal} button`));else await key('Escape',27);
 assert.ok(await focused(trigger));
 assert.deepEqual(external,[]);
 assert.equal(imageFrames.size,0);
 const beforeConsent={external:[...external],frames:imageFrames.size};
 await activate('.image-controls .primary');
 const imageOnly=await poll(async()=>{
  const frames=[...imageFrames.values()];
  if(frames.length!==10)return;
  const images=await Promise.all(frames.map(session=>evaluate(`(()=>{const i=document.querySelector('img');return i?.complete&&i.naturalWidth?{path:new URL(i.currentSrc).pathname,alt:i.alt}:null;})()`,false,session)));
  return images.every(Boolean)?images:null;
 });
 assert.ok(imageOnly.some(i=>i.path==='/parent-inline-css.png'&&i.alt===narrowText.slice(labelForImage.length+3)));
 assert.equal(await evaluate("document.querySelectorAll('.full-mail-document').length"),0);
 const hostRequests=await evaluate("fetch('/__test_image_requests').then(r=>r.json())",true);
 assert.deepEqual(hostRequests.map(r=>r.path).sort(),imageOnly.map(i=>i.path).sort());
 assert.ok(hostRequests.every(r=>!r.cookie&&!r.authorization&&!r.referer));
 await open();
 const remaining=await evaluate(`[...${find(modal)}.querySelectorAll('li')].map(li=>li.textContent)`);
 const inlineLabel=nl?'Ingesloten afbeelding wordt niet weergegeven':'Inline image is not displayed';
 assert.deepEqual(remaining,[`${inlineLabel} — Unavailable inline symbol`,'Unavailable archive chart']);
 if(mobile)await gesture(await point(`${modal} button`));else await key('Escape',27);
 return {passed:true,locale,control,detail,openedHeights,closedHeights,displayRequests,beforeConsent,reset,imageOnly,hostRequests,remaining,dismissal:mobile?'touch Close':'keyboard Escape and Close',focusRestored:true};
}
