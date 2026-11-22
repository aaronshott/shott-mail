import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Runs against the real client using the browser harness's synthetic nested mailboxes.
export async function runTreeStyle({call,evaluate,poll,mobile,theme,baseline,screenshots}){
 const find={account:'.account-folders summary[aria-label="Mappen voor Werk"]',reload:'.account-folders[open]>button',nav:'.mobile-nav-toggle',
  inbox:'.folder-select[title="INBOX"]',branch:'.folder-toggle[aria-label="Submappen van INBOX"]',
  group:'.folder-toggle[aria-label="Submappen van INBOX/Projects"]',leaf:'.folder-select[title="INBOX/Projects/Travel"]',
  row:'.folder-row:has(>.folder-select[aria-current="page"])',other:'#mailbox-nav nav>button'};
 const element=s=>`document.querySelector(${JSON.stringify(find[s]??s)})`;
 const state=(s,expr)=>evaluate(`(e=>e?(${expr}):null)(${element(s)})`);
 const wait=(s,expr)=>poll(()=>state(s,expr)).catch(error=>{throw Error(`${s}: ${expr}: ${error.message}`);});
 const key=async(key,code=key)=>{
  const windowsVirtualKeyCode={Tab:9,Enter:13,Space:32}[code];
  const text={Enter:'\r',Space:' '}[code];
  await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode,...(text?{text}:{})});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode});
 };
 const tabTo=async s=>{
  for(let i=0;i<24;i++){
   if(await state(s,'e===document.activeElement'))return;
   await key('Tab');
  }
  throw Error(`Tab did not reach ${s}`);
 };
 const point=async s=>{
  const [x,y]=await state(s,"(e.scrollIntoView({block:'nearest'}),[e.getBoundingClientRect().x+e.offsetWidth/2,e.getBoundingClientRect().y+e.offsetHeight/2])");
  return {x,y};
 };
 const move=async s=>call('Input.dispatchMouseEvent',{type:'mouseMoved',...await point(s)});
 const tap=async s=>{
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[await point(s)]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 };
 const css=s=>state(s,`(()=>{const c=getComputedStyle(e),r=e.getBoundingClientRect();return {
  bg:c.backgroundColor,image:c.backgroundImage,borders:[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth],
  radius:c.borderRadius,shadow:c.boxShadow,outline:[c.outlineStyle,c.outlineWidth,c.outlineOffset,c.outlineColor],
  focus:e.matches(':focus-visible'),width:r.width,height:r.height,x:r.x};})()`);
 function flat(s){
  assert.deepEqual([s.bg,s.image,s.borders,s.radius,s.shadow],['rgba(0, 0, 0, 0)','none',['0px','0px','0px','0px'],'0px','none']);
  assert.ok(s.height>=44&&s.width>=44,`Touch target: ${JSON.stringify(s)}`);
 }
 function focused(s){assert.deepEqual([s.focus,...s.outline.slice(0,3)],[true,'solid','2px','-2px']);}
 const snap=async(name,top=false)=>{
  if(!screenshots)return;
  if(top)await evaluate('window.scrollTo(0,0)');
  if(mobile)await new Promise(resolve=>setTimeout(resolve,300)); // let the browser's tap highlight fade
  const {data}=await call('Page.captureScreenshot',{format:'png',fromSurface:true});
  await writeFile(join(screenshots,`${baseline?'before':'after'}-${mobile?'mobile':'desktop'}-${theme}${name}.png`),Buffer.from(data,'base64'));
 };
 await call('Page.bringToFront');
 await wait('account','!document.querySelector("header button:last-child").disabled');
 assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'),theme);
 assert.equal(await evaluate('matchMedia("(hover:hover)").matches'),!mobile,'Wrong pointer capabilities');
 if(mobile)await tap('nav');
 const closed=await css('account');
 await tabTo('account');
 const accountFocus=await css('account');
 await key('Enter');
 await wait('branch','e.getClientRects().length>0');
 const opened=await css('account');
 const normal=await Promise.all(['branch','inbox','reload','other'].map(css));
 const hover={};
 if(!mobile){
  for(const s of ['account','branch','inbox']){
   await move(s);
   await wait(s,'e.matches(":hover")');
   hover[s]=await css(s);
  }
  hover.row=await css('.folder-row:has(>.folder-select[title="INBOX"])');
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:innerPoint(mobile),y:22});
 }
 await tabTo('branch');
 const toggleFocus=await css('branch');
 const heading=await state('main h1','e.textContent');
 await key(' ','Space');
 await wait('group','e.getClientRects().length>0');
 assert.equal(await state('branch','e.getAttribute("aria-expanded")'),'true');
 assert.equal(await state('main h1','e.textContent'),heading,'Expand must not navigate');
 await tabTo('inbox');
 const openFocus=await css('inbox');
 await key('Enter');
 await wait('inbox','e.getAttribute("aria-current")==="page"&&!e.disabled');
 if(mobile)await tap('nav');
 assert.equal(await state('branch','e.getAttribute("aria-expanded")'),'true','Select must not collapse');
 const parentSelected=await Promise.all(['inbox','branch','row'].map(css));
 if(!mobile){
  await move('branch');
  await wait('branch','e.matches(":hover")');
  hover.selectedToggle=await css('branch');
  await move('inbox');
  await wait('inbox','e.matches(":hover")');
  hover.selectedButton=await css('inbox');
  hover.selectedRow=await css('row');
 }
 if(mobile)await tap('group');
 else {await tabTo('group');await key('Enter');}
 await wait('leaf','e.getClientRects().length>0');
 assert.equal(await state('inbox','e.getAttribute("aria-current")'),'page','Expand changed selection');
 await tabTo('leaf');
 const leafFocus=await css('leaf');
 if(!baseline)await snap('-keyboard');
 await key('Enter');
 await wait('leaf','e.getAttribute("aria-current")==="page"&&!e.disabled');
 assert.equal(await state('main h1','e.textContent'),'INBOX/Projects/Travel');
 if(mobile)await tap('nav');
 await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:innerPoint(mobile),y:22});
 // Blur only for the clean comparison; interaction above used genuine keyboard/touch input.
 await evaluate('document.activeElement.blur()');
 const selected=await Promise.all(['leaf','row'].map(css));
 assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Horizontal overflow');
 await snap('',true);
 if(!baseline){
  [closed,opened,...normal.slice(0,2),...parentSelected.slice(0,2),selected[0]].forEach(flat);
  [accountFocus,toggleFocus,openFocus,leafFocus].forEach(focused);
  assert.deepEqual(normal.slice(2).map(s=>[s.borders,s.radius]),[[['1px','1px','1px','1px'],'9px'],[['1px','1px','1px','4px'],'9px']],'Reload and active Inbox navigation retain button styling');
  assert.equal(selected[1].x,opened.x);
  assert.equal(selected[1].width,opened.width);
  assert.equal(selected[1].bg,parentSelected[2].bg);
  assert.notEqual(selected[1].bg,'rgba(0, 0, 0, 0)');
  assert.equal(selected[0].x-normal[1].x,20,'Expected two indentation steps');
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('.folder-list :is(.folder-select,.folder-label), .folder-list .folder-toggle, .account-folders summary')).every(e=>e.querySelector('svg[aria-hidden="true"][focusable="false"]'))`));
  if(!mobile){
   [hover.branch,hover.inbox,hover.selectedToggle,hover.selectedButton].forEach(flat);
   assert.notEqual(hover.account.bg,opened.bg,'Account hover does not tint the header');
   assert.deepEqual({...hover.account,bg:opened.bg,focus:opened.focus,outline:opened.outline},opened);
   assert.notEqual(hover.row.bg,selected[1].bg);
   assert.notEqual(hover.row.bg,'rgba(0, 0, 0, 0)','Folder hover does not tint the row');
   assert.equal(hover.selectedRow.bg,selected[1].bg);
  }
 }
 if(mobile){
  await tap('group');
  await wait('group','e.getAttribute("aria-expanded")==="false"');
  assert.equal(await state('leaf','!!e'),null);
  assert.equal(await state('main h1','e.textContent'),'INBOX/Projects/Travel');
  await tap('inbox');
  await wait('inbox','e.getAttribute("aria-current")==="page"&&!e.disabled');
 }
 return {passed:true,theme,baseline,closed,opened,normal,hover,parentSelected,selected,focus:{accountFocus,toggleFocus,openFocus,leafFocus}};
}

const innerPoint=mobile=>mobile?380:1200;
