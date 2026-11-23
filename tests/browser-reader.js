const pause=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw Error(m);};
async function until(fn,m){for(let i=0;i<240;i++){if(await fn())return;await pause(25);}throw Error(m);}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
const click=text=>{const b=button(text);assert(b&&!b.disabled,'Missing/disabled: '+text);b.click();};
const set=(el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
const idle=async()=>{await pause(20);await until(()=>{const b=button('Uitloggen')??button('Sign out');return b&&!b.disabled;},'app stayed busy');};
const open=async name=>{await until(()=>buttonRow(name),'missing row '+name);buttonRow(name).click();await idle();await until(()=>document.getElementById('readtitle')?.textContent===`Reader ${name}`,'wrong message');};
const buttonRow=name=>[...document.querySelectorAll('.list .mail')].find(b=>b.querySelector('strong')?.textContent===`Reader ${name}`&&!b.disabled);
const requests=()=>fetch('/__test_image_requests').then(r=>r.json());
const connections=()=>fetch('/__test_image_connections').then(r=>r.json());
const nav=()=>{const b=document.querySelector('.mobile-nav-toggle');if(b.getClientRects().length&&b.getAttribute('aria-expanded')==='false')b.click();};
const reader=()=>document.querySelector('.reader');
let words;
export async function beforeConsent(lang){
 words=lang==='en'?{settings:'Settings',back:'Back',list:'← Back to list',load:'Load remote images',tracking:'IP address',reply:'Reply'}:{settings:'Instellingen',back:'Terug',list:'← Terug naar lijst',load:'Externe afbeeldingen laden',tracking:'IP-adres',reply:'Beantwoorden'};
 await idle();await open('work');
 assert(reader().querySelector('pre')?.textContent.trim()==='Plain work'&&!reader().querySelector('.formatted-mail,.image-controls'),'not plain by default');
 await pause(200);assert((await requests()).length===0,'plain view contacted image host');
 click('Instellingen');await pause(0);
 const prefs=document.querySelectorAll('main select');
 assert(prefs[2]?.value==='plain'&&prefs[2].selectedOptions[0].textContent.includes('standaard'),'missing plain default setting');
 set(prefs[0],lang);set(prefs[1],'dark');set(prefs[2],'html');await pause(0);click('Instellingen opslaan');await idle();click(words.back);
 await open('plain');assert(reader().querySelector('pre')?.textContent.includes('<b>literal</b>')&&!button(words.load),'plain-only MIME did not fall back');click(words.list);
 await open('work');
 const body=reader().querySelector('.formatted-mail');
 assert(body?.querySelector('strong')?.textContent==='work'&&body.textContent.includes('Newsletter'),'formatting lost');
 assert(!body.querySelector('a,img,link,form,script,iframe,mail-image,[src],[href]'),'non-inert DOM');
 assert(reader().querySelector('details pre')?.textContent.trim()==='Plain work','no original plain alternative');
 const control=button(words.load);assert(control&&!body.contains(control)&&document.getElementById(control.getAttribute('aria-describedby')).textContent.includes(words.tracking),'missing tracking notice or misplaced control');
 control.click();await pause(250);assert((await requests()).length===0&&(await connections())===0,'network before trusted consent');
 assert(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
 control.focus();control.scrollIntoView({block:'center'});const box=control.getBoundingClientRect();
 return {locale:document.documentElement.lang,theme:document.documentElement.dataset.theme,requests:await requests(),connections:await connections(),point:{x:box.x+box.width/2,y:box.y+box.height/2}};
}
export async function afterConsent(){
 const frames=[...reader().querySelectorAll('.formatted-mail iframe')];
 assert(frames.length===2&&frames.every(f=>f.getAttribute('sandbox')===''&&f.hasAttribute('credentialless')&&f.referrerPolicy==='no-referrer'&&f.contentDocument===null&&f.getBoundingClientRect().width>0),'missing isolated image frames');
 assert(document.documentElement.scrollWidth<=innerWidth,'images cause horizontal overflow');
 const observed=await requests();assert(observed.map(r=>r.path).sort().join(',')==='/final.png,/redirect.png,/work.png'&&observed.every(r=>!r.referer&&!r.authorization),'unexpected request or metadata: '+JSON.stringify(observed));
 async function blocked(name){await open(name);assert(button(words.load)&&!reader().querySelector('img,iframe'),'consent leaked to '+name);}
 click(words.list);await until(()=>document.activeElement===buttonRow('work'),'closing reader did not restore row focus');await blocked('work');
 await blockedWithoutClose('second');
 click(words.settings);await pause(0);assert(!reader(),'settings did not dismiss reader');click(words.back);await blocked('work');
 nav();await pause(0);const accounts=document.querySelector('aside select');const priv=[...accounts.options].find(o=>o.text.includes('private@example.test'));set(accounts,priv.value);await idle();await blocked('private');
 click(words.reply);await pause(0);assert(document.querySelector('textarea').value.trim()==='Plain private','reply no longer uses plain MIME');
 await pause(250);assert((await requests()).length===3,'reopen/switch triggered network');
 const m=await fetch('/__test_metrics').then(r=>r.json());assert(!m.sendRequests&&!m.smtpAuth&&!m.deliveries&&!m.appendAttempts,'reading changed mail or sent a draft');
 return {passed:true,observed,checks:['plain default and plain fallback; localized safe HTML','zero observer connections or requests until a trusted click or tap','inert formatting and plain alternative; isolated image controls with tracking notice','resets across same UID reopen, same sender, Settings and another account with the same UID','no SMTP, APPEND or send POST; reply uses plain MIME']};
 async function blockedWithoutClose(name){
  // In mobile the list is hidden while reading; the desktop also tests direct replacement.
  if(!document.querySelector('.list').getClientRects().length)click(words.list);
  await blocked(name);
 }
}

async function openNewsletter(name,baseline=false,lang='en'){
 await idle();await open('garden');
 assert(!reader().querySelector('.image-controls,.formatted-mail'),'plain default changed');
 if(!baseline)assert(reader().textContent.includes('tekstmodus'),'missing plain-mode explanation');
 click('Instellingen');await pause(0);
 const prefs=document.querySelectorAll('main select');
 set(prefs[0],lang);set(prefs[1],'light');set(prefs[2],'html');await pause(0);click('Instellingen opslaan');await idle();click(lang==='nl'?'Terug':'Back');
 await open(name);
}

export async function fullStart(lang){
 await idle();await open('full');assert(reader().querySelector('pre')?.textContent.trim()==='Plain full fixture'&&!button('Alles laden'),'plain default changed');
 click('Instellingen');await pause(0);const prefs=document.querySelectorAll('main select');
 set(prefs[0],lang);set(prefs[1],'light');set(prefs[2],'html');await pause(0);click('Instellingen opslaan');await idle();click(lang==='nl'?'Terug':'Back');
 words=lang==='nl'?{all:'Alles laden',images:'Externe afbeeldingen laden',list:'← Terug naar lijst',safe:'Terug naar veilige weergave'}:{all:'Load all',images:'Load remote images',list:'← Back to list',safe:'Back to safe view'};
 await open('full');click(words.all);click(words.images);await pause(250);
 assert(!reader().querySelector('iframe')&&!(await connections())&&!(await requests()).length,'synthetic click contacted remote');
 return {point:fullPoint('images'),connections:0,requests:0};
}
export function fullPoint(mode){const control=button(words[mode]);assert(control,'missing consent control');control.scrollIntoView({block:'center'});const box=control.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};}
export async function fullReopen(){click(words.list);await open('full');assert(button(words.images)&&button(words.all)&&!reader().querySelector('iframe'),'reopen retained consent');return fullPoint('all');}
export async function fullReset(){
 assert([...reader().querySelectorAll('.mail-text-view pre')].some(e=>e.textContent.trim()==='Plain full fixture'),'text alternative missing');
 click(words.safe);await pause(0);assert(!reader().querySelector('.full-mail-document'),'safe view did not remove full frame');
 await fullReopen();if(!document.querySelector('.list').getClientRects().length)click(words.list);
 await open('work');assert(button(words.all)&&!reader().querySelector('iframe'),'message switch retained consent');
}
export async function fullOpenLong(lang){
 words=lang==='nl'?{all:'Alles laden',list:'← Terug naar lijst',safe:'Terug naar veilige weergave'}:{all:'Load all',list:'← Back to list',safe:'Back to safe view'};
 await idle();await open('long full');
 assert(!reader().querySelector('iframe'),'message opened with a live frame');
 return fullPoint('all');
}
export async function fullDirectPath(){
 const json=(path,options)=>fetch(path,options).then(r=>{assert(r.ok,'test API '+r.status);return r.json();});
 const [{csrf},{messages}]=await Promise.all([json('/api/session'),json('/api/inbox')]);
 const m=messages.find(row=>row.subject==='Reader full');assert(m,'missing message');
 const {readerIdentity}=await json(`/api/messages/${m.accountId}/${m.validity}/${m.uid}`);
 return (await json('/api/reader/document',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(readerIdentity)})).path;
}

export async function headerBefore(theme){
 await openNewsletter('header');
 document.documentElement.dataset.theme=theme;
 const body=reader().querySelector('.formatted-mail');
 body.style.maxWidth='720px'; // match the reported newsletter region, not browser outer width
 const control=button('Load remote images');
 assert(control&&!body.querySelector('a,img,iframe,script,style,[href],[src]'),'header not inert before consent');
 control.click();await pause(250);
 assert(!(await connections())&&!(await requests()).length,'header connected before trusted consent');
 control.scrollIntoView({block:'center'});const box=control.getBoundingClientRect();
 return {connections:0,requests:0,point:{x:box.x+box.width/2,y:box.y+box.height/2}};
}
export async function preconsentCrop(theme){
 await openNewsletter('preconsent');
 document.documentElement.dataset.theme=theme;
 const body=reader().querySelector('.formatted-mail');
 const table=body.querySelector('table'),band=table.querySelector('table');
 const icon=band.querySelector('.mail-image-placeholder'),title=band.querySelector('strong');
 const data=table.querySelector('table:has(caption)');
 assert(button('Load remote images')&&button('Load all')&&!reader().querySelector('dialog,iframe'),'consent boundary changed');
 assert(!body.querySelector('a,img,link,style,script,[src],[srcset],[href],[background]')&&
   [...body.querySelectorAll('[style]')].every(el=>!el.style.cssText.includes('url(')),'active resource in Safe HTML');
 body.scrollIntoView({block:'start'});await pause(300);
 const box=el=>el.getBoundingClientRect();
 const range=document.createRange();range.selectNodeContents(title);
 const first=range.getBoundingClientRect(),last=box(data.tBodies[0].rows[0]);
 const fg=getComputedStyle(title).color;
 const bg=[band,table].map(el=>getComputedStyle(el).backgroundColor).find(c=>c.startsWith('rgb('));
 const lum=c=>c.match(/\d+/g).reduce((v,x,i)=>{const n=x/255;return v+[.2126,.7152,.0722][i]*(n<=.04045?n/12.92:((n+.055)/1.055)**2.4);},0);
 const [a,b]=[lum(fg),lum(bg)];
 return {theme,width:body.clientWidth,band:box(band).height,icon:[box(icon).width,box(icon).height],fg,bg,
  ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),columnWidths:[...data.tHead.rows[0].cells].map(c=>box(c).width),
  aligns:[...data.tBodies[0].rows[0].cells].map(c=>getComputedStyle(c).textAlign),
  rowsAligned:[...data.tBodies[0].rows].every(r=>[...r.cells].every((c,i)=>box(c).x===box(data.tHead.rows[0].cells[i]).x)),
  firstRowOffset:last.top-box(band).top,titleInCrop:first.top>=0&&first.bottom<=innerHeight,rowInCrop:last.top>=0&&last.bottom<=innerHeight,
  layoutBorders:[table,band].map(t=>getComputedStyle(t.rows[0].cells[0]).borderTopWidth),dataBorder:getComputedStyle(data.tBodies[0].rows[0].cells[0]).borderTopWidth,
  scope:[data.tHead.rows[0].cells[0].scope,data.tBodies[0].rows[0].cells[0].scope],role:data.getAttribute('role'),
  overflow:body.scrollWidth>body.clientWidth||document.documentElement.scrollWidth>innerWidth,requests:await requests(),connections:await connections()};
}

export async function unhintedCrop(theme,lang='en'){
 await openNewsletter('unhinted',false,lang);
 document.documentElement.dataset.theme=theme;
 const body=reader().querySelector('.formatted-mail');
 assert(button(lang==='nl'?'Externe afbeeldingen laden':'Load remote images')&&button(lang==='nl'?'Alles laden':'Load all')&&!reader().querySelector('dialog[open],iframe'),'consent boundary changed');
 assert(!body.querySelector('img,link,style,script,[src],[srcset],[href],[background]')&&
  [...body.querySelectorAll('[style]')].every(el=>!el.style.cssText.includes('url(')),'active resource in Safe HTML');
 body.scrollIntoView({block:'start'});await pause(300);
 const box=el=>el.getBoundingClientRect();
 const rows=[...body.querySelectorAll('tr')].filter(row=>row.cells.length>1&&row.querySelector('.mail-image-placeholder'));
 const geometry=rows.map(row=>{
  const slot=row.querySelector('.mail-image-placeholder'),cell=slot.closest('td'),table=cell.closest('table');
  const range=document.createRange();range.selectNodeContents(slot);
  const title=row.querySelector('strong')??row.querySelector('th');
  const alt=slot.querySelector('.mail-image-alt')??slot;
  const info={height:box(row).height,cell:box(cell).width,slotWidth:box(slot).width,lines:new Set([...range.getClientRects()].map(r=>r.y)).size,
   sameRow:box(cell).top===box(title.closest('td,th')).top,fg:getComputedStyle(title).color,bg:getComputedStyle(table).backgroundColor,
   backgroundImage:getComputedStyle(table).backgroundImage,alt:alt.textContent,altWidth:alt.clientWidth,altScrollWidth:alt.scrollWidth};
  slot.style.display='none';info.withoutLabel=box(row).height;slot.style.removeProperty('display');
  return info;
 });
 const grid=body.querySelector('table:has(caption)'),head=[...grid.tHead.rows[0].cells];
 return {width:body.clientWidth,geometry,grid:{caption:grid.caption.textContent,role:grid.getAttribute('role'),
  scope:[head[0].scope,grid.tBodies[0].rows[0].cells[0].scope],border:getComputedStyle(head[0]).borderTopWidth,
  aligns:[...grid.tBodies[0].rows[0].cells].map(c=>getComputedStyle(c).textAlign),
  tracks:head.map(c=>box(c).width),width:box(grid).width,
  aligned:[...grid.tBodies[0].rows].every(r=>[...r.cells].every((c,i)=>box(c).x===box(head[i]).x))},
  standalone:[...body.querySelectorAll('p .mail-image-placeholder,tr:has(>td:only-child) .mail-image-placeholder')].map(e=>[e.textContent,e.checkVisibility(),getComputedStyle(e).position]),
  reasons:[...reader().querySelectorAll('.image-source-summary li')].map(e=>e.textContent),
  overflow:body.scrollWidth>body.clientWidth||document.documentElement.scrollWidth>innerWidth,requests:await requests(),connections:await connections()};
}

export async function descriptionReset(lang){
 const back=lang==='nl'?'← Terug naar lijst':'← Back to list';
 assert(!reader().querySelector('dialog[open],iframe'),'reader not back in safe view');
 if(!document.querySelector('.list').getClientRects().length)click(back);
 await open('garden');
 assert(!reader().querySelector('dialog[open],iframe,.mail-image-in-row'),'previous message details still active');
 click(back);await open('unhinted');
 assert(!reader().querySelector('dialog[open],iframe'),'reopening retained modal or consent');
 return {connections:await connections(),requests:await requests()};
}

export async function headerAfter(){
 const body=reader().querySelector('.formatted-mail');
 const frames=[...body.querySelectorAll('iframe')];
 assert(frames.every(f=>f.getAttribute('sandbox')===''&&f.hasAttribute('credentialless')&&f.referrerPolicy==='no-referrer'&&f.contentDocument===null),'header frame isolation changed');
 assert(!body.querySelector('a,img,[href],script,style'),'unexpected active header content');
 const ink=['Dispatch window','09:00 UTC','Trail conditions','Clear'].map(label=>measureInk(body,label));
 body.scrollIntoView({block:'start'});
 const data=body.querySelector('table:has(caption)');
 const dataTable=data&&{caption:data.caption.textContent,headers:[...data.tHead.rows[0].cells].map(c=>c.textContent),
  label:data.tBodies[0].rows[0].cells[1].textContent,role:data.getAttribute('role'),layout:getComputedStyle(data).tableLayout,
  border:getComputedStyle(data.querySelector('td')).borderTopWidth};
 return {ink,dataTable,requests:await requests(),overflow:body.scrollWidth>body.clientWidth||document.documentElement.scrollWidth>innerWidth};
}

export async function headerReset(){
 const before={requests:(await requests()).length,connections:await connections()};
 click('← Back to list');await open('header');await pause(250);
 assert(button('Load remote images')&&!reader().querySelector('img,iframe'),'header consent persisted on reopen');
 const after={requests:(await requests()).length,connections:await connections()};
 assert(after.requests===before.requests&&after.connections===before.connections,'header reopen contacted host');
 return {before,after};
}

function measureInk(body,label){
 const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
 let node;while((node=walker.nextNode())&&node.data.trim()!==label){}
 assert(node,'Missing text: '+label);
 const el=node.parentElement,foreground=getComputedStyle(el).color;
 let background;
 for(let paint=el;paint;paint=paint.parentElement){
  const color=getComputedStyle(paint).backgroundColor;
  if(color!=='rgba(0, 0, 0, 0)'){background=color;break;}
 }
 const luminance=value=>{
  assert(/^rgb\(\d+, \d+, \d+\)$/.test(value),'Not opaque RGB: '+value+' ('+label+')');
  return value.match(/\d+/g).reduce((sum,part,i)=>{
   const v=Number(part)/255;return sum+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  },0);
 };
 const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 el.scrollIntoView({block:'nearest'});
 const range=document.createRange();range.selectNodeContents(node);
 const visible=el.checkVisibility({visibilityProperty:true,opacityProperty:true})&&[...range.getClientRects()].some(r=>
  r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight);
 assert(visible&&ratio>=4.5,`Unreadable ${label}: ${foreground} on ${background}, ${ratio}`);
 return {label,foreground,background,ratio,visible};
}
export async function contrastStart(){
 await openNewsletter('contrast');
 assert((await connections())===0&&(await requests()).length===0,'contrast fixture caused image traffic');
 return {passed:true,light:await contrastTheme('light')};
}
export async function contrastTheme(theme){
 // Switch the same mounted reader to check that fallback colors are reversible.
 document.documentElement.dataset.theme=theme;
 await pause(0);
 const body=reader().querySelector('.formatted-mail');
 assert(!body.classList.contains('mail-authored-palette'),'transparent paint selected the white canvas');
 const samples=['White text from a dark-mode design','No background','Transparent foreground'].map(label=>measureInk(body,label));
 const dark=theme==='dark',paper=dark?'rgb(23, 36, 31)':'rgb(255, 255, 255)';
 assert(samples.every(s=>s.background===paper)&&samples.slice(0,2).every(s=>(s.foreground==='rgb(255, 255, 255)')===dark),'wrong canvas or readable sender white lost');
 return samples;
}
export async function contrastPalette(theme='light'){
 if(theme==='light'){click('← Back to list');await open('contrast-palette');}
 document.documentElement.dataset.theme=theme;
 await pause(0);
 const body=reader().querySelector('.formatted-mail');
 const labels=['White on unpainted canvas','White inherited on dark','White nested on dark','Low contrast on cream','Readable ink on cream','Read the notes'];
 const samples=labels.map(label=>measureInk(body,label));
 const pairs=samples.map(s=>[s.foreground,s.background]);
 const white='rgb(255, 255, 255)',dark='rgb(23, 36, 31)',cream='rgb(250, 243, 228)';
 assert(JSON.stringify(pairs.slice(1,3))===JSON.stringify([[white,dark],[white,dark]]),'readable inherited color changed');
 assert(pairs[0][1]===white&&pairs[3][1]===cream&&pairs[4][0]==='rgb(33, 52, 67)'&&pairs[4][1]===cream&&pairs[5][0]===white&&pairs[5][1]==='rgb(118, 44, 40)','authored palette changed');
 const cta=[...body.querySelectorAll('span')].find(el=>el.textContent==='Read the notes');
 const css=getComputedStyle(cta),cell=getComputedStyle(body.querySelector('td'));
 assert(css.paddingLeft==='21px'&&css.borderRadius==='9px'&&css.display==='inline-block'&&cell.paddingTop==='12px'&&!body.querySelector('a,[href]'),'CTA or table layout changed');
 assert(body.scrollWidth<=body.clientWidth&&document.documentElement.scrollWidth<=innerWidth,'contrast fixture overflows');
 return samples;
}

export async function editionBefore(){
 await openNewsletter('edition');
 const body=reader().querySelector('.formatted-mail');
 assert(body?.querySelector('h1')?.textContent==='A winter orchard walk','fixture not visible');
 assert(!body.querySelector('img,iframe,style,link,[src],[data-src],[style]'),'sender markup became active');
 const control=button('Load remote images');control?.click();await pause(250);
 const pre={requests:await requests(),connections:await connections()};
 assert(pre.requests.length===0&&pre.connections===0,'image host contacted before trusted consent');
 const text=reader().textContent;
 assert(body.scrollWidth<=body.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth,'newsletter overflows');
 return {...pre,point:control?gardenPoint():null,oldWarnings:(text.match(/Image source is not supported/g)??[]).length,
  summary:reader().querySelector('.image-source-summary li')?.textContent??null,
  alt:['Orchard at dawn','Market stalls','Walking map','Community badge'].every(alt=>body.textContent.includes(alt))};
}

export async function editionReopen(){
 const frames=[...reader().querySelectorAll('.formatted-mail iframe')];
 assert(frames.length===2&&frames.every(f=>f.getAttribute('sandbox')===''&&f.referrerPolicy==='no-referrer'&&f.contentDocument===null),'images are not isolated');
 assert(document.documentElement.scrollWidth<=innerWidth,'loaded newsletter overflows');
 const loaded=await requests(),count=await connections();
 click('← Back to list');await open('edition');await pause(250);
 assert(button('Load remote images')&&!reader().querySelector('iframe,img'),'consent carried over on reopen');
 assert((await requests()).length===loaded.length&&(await connections())===count,'reopen contacted host');
 return loaded;
}

export async function gardenBefore(baseline){
 await openNewsletter(baseline?'garden':'unavailable',baseline);
 if(!baseline){
  const unsupported=reader().querySelector('.formatted-mail');
  assert(unsupported&&unsupported.querySelectorAll('.mail-image-placeholder').length===1&&!reader().querySelector('.image-controls'),'image-only fallback missing or offered consent: '+reader().textContent);
  assert(unsupported.textContent.includes('Inline image is not displayed')&&reader().querySelector('.image-source-summary li')?.textContent==='3 images have unsupported sources.'&&!unsupported.textContent.includes('Remote image'),'unsupported images mislabeled');
  click('← Back to list');
  await open('garden');
 }
 const body=reader().querySelector('.formatted-mail'),controls=reader().querySelector('.image-controls');
 const control=button(baseline?'Load images for this message':'Load remote images');
 assert(control&&body?.querySelector('h1')?.textContent==='Make room for winter birds','fixture not visible');
 assert(!body.querySelector('a,img,iframe,style,link,[src],[srcset],[href]'),'non-inert newsletter');
 assert(reader().querySelector('details pre')?.textContent.trim().startsWith('Field Notes:'),'lost original text alternative');
 if(!baseline){
  assert(control.classList.contains('primary')&&controls.getBoundingClientRect().bottom<body.getBoundingClientRect().top,'action not prominent above message');
  assert(body.querySelector('table[role=presentation][width="640"]')&&body.querySelector('caption')?.textContent==='November checklist'&&body.querySelector('th').colSpan===2,'newsletter table semantics lost');
  assert(body.textContent.includes('Inline image is not displayed — Club logo')&&body.textContent.includes('Remote image blocked — Winter garden banner'),'inline and remote states conflated');
  assert(body.scrollWidth<=body.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth,'newsletter overflows');
 }
 control.click();await pause(200);
 assert((await requests()).length===0&&(await connections())===0,'newsletter contacted observer before trusted gesture');
 return {point:gardenPoint(),bodyWidth:body.clientWidth,scrollWidth:body.scrollWidth,connections:await connections(),requests:await requests(),passed:true};
}

function gardenPoint(){
 const control=reader().querySelector('.image-controls button');
 control.scrollIntoView({block:'nearest'});const box=control.getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};
}

export async function studioBefore(){
 await openNewsletter('studio');
 const body=reader().querySelector('.formatted-mail');
 const outer=body.querySelector('table'),[left,right]=outer.querySelector('table').rows[0].cells;
 const cta=[...body.querySelectorAll('span,p')].find(n=>n.textContent.trim()==='Explore the edition'&&!n.children.length);
 const control=button('Load remote images');control?.click();await pause(250);
 const zero=(await requests()).length===0&&(await connections())===0;
 assert(zero,'studio contacted image host before consent');
 assert(!body.querySelector('a,button,img,iframe,link,form,[href],[src],[srcset]'),'studio activated sender markup');
 const rect=n=>{const {x,y,width}=n.getBoundingClientRect();return {x,y,width};};
 return {zero,point:control?gardenPoint():null,summary:reader().querySelector('.image-source-summary li,.image-source-summary:not(details)')?.textContent??null,
  paper:getComputedStyle(outer).backgroundColor,ink:getComputedStyle(body.querySelector('h1')).color,
  heading:getComputedStyle(body.querySelector('h1')).fontSize,font:getComputedStyle(outer).fontFamily,
  padding:getComputedStyle(outer.rows[0].cells[0]).paddingTop,cta:cta?{fill:getComputedStyle(cta).backgroundColor,padding:getComputedStyle(cta).paddingLeft}:null,
  left:rect(left),right:rect(right),overflow:body.scrollWidth>body.clientWidth+1||document.documentElement.scrollWidth>innerWidth};
}

export async function studioReset(){
 const loaded=await requests(),count=await connections();
 if(!document.querySelector('.list').getClientRects().length)click('← Back to list');
 await open('missing');await pause(250);
 assert(button('Load remote images')&&!reader().querySelector('iframe,img'),'studio consent carried over to next message');
 assert((await requests()).length===loaded.length&&(await connections())===count,'next message contacted observer');
 return loaded;
}

export async function gardenMissing(){
 click('← Back to list');await open('missing');
 assert(!reader().querySelector('iframe')&&button('Load remote images'),'consent leaked to the HTML-only message');
 return gardenPoint();
}

export async function gardenAfter(){
 const observed=await requests();
 assert(observed.map(r=>r.path).join(',')==='/garden.png,/missing.png'&&observed.every(r=>!r.referer&&!r.authorization),'unexpected newsletter request or metadata');
 assert(reader().querySelector('[role=status]')?.textContent.startsWith('Remote images requested.'),'request incorrectly reported as success');
 const m=await fetch('/__test_metrics').then(r=>r.json());assert(!m.sendRequests&&!m.smtpAuth&&!m.deliveries&&!m.appendAttempts,'reading changed compose or Sent');
 return {passed:true,observed};
}

export async function diagnosticsBefore(lang){
 await idle();click('Instellingen');await pause(0);
 const prefs=document.querySelectorAll('main select');
 set(prefs[0],lang);set(prefs[2],'html');await pause(0);click('Instellingen opslaan');await idle();click(lang==='en'?'Back':'Terug');
 await open('diagnostics');
 const details=reader().querySelector('details.image-source-summary');
 assert(document.documentElement.lang===lang&&details&&!details.open,'wrong locale or diagnostics not collapsed');
 const endpoint=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname.startsWith('/api/messages/'));
 const response=await fetch(endpoint.name);assert(response.ok,'real inbox message API failed');
 const {formatted}=await response.json();
 const expected={missing:1,relative:13,unsupportedScheme:1,unsupportedAttribute:1,dataRaster:1,blockedHost:1,tooLong:1,malformed:1,credentials:1,srcsetSyntax:1,srcsetLimit:1,cid:1,limit:1};
 assert(JSON.stringify(formatted.imageRejections)===JSON.stringify(expected)&&formatted.images.length===1&&!JSON.stringify(formatted).includes('private-fixture-token'),'unexpected API diagnostics or leak');
 const hidden=[...details.querySelectorAll('li')].every(li=>!li.checkVisibility({contentVisibilityAuto:true}));
 assert(hidden,'diagnostic rows visible while collapsed');
 details.querySelector('summary').click();await pause(0);
 const rows=[...details.querySelectorAll('li')].map(li=>li.textContent);
 const labels=lang==='en'?['23 images have unsupported sources.','Missing source: 1','Relative source: 13','Unsupported URL scheme: 1','Unsupported source attribute: 1','Embedded raster source (data URL): 1','Host blocked by image policy: 1','Source too long: 1','Malformed source: 1','Credentials in URL not allowed: 1','Invalid or unsupported source variants: 1','Too many source variants: 1','Embedded and not displayed: 1']:['23 afbeeldingen hebben een niet-ondersteunde bron.','Bron ontbreekt: 1','Relatieve bron: 13','URL-schema niet ondersteund: 1','Bronattribuut niet ondersteund: 1','Ingesloten rasterbron (data-URL): 1','Host geblokkeerd door beeldbeleid: 1','Bron te lang: 1','Ongeldige bron: 1','Inloggegevens in URL niet toegestaan: 1','Bronvarianten ongeldig of niet ondersteund: 1','Te veel bronvarianten: 1','Ingesloten en niet weergegeven: 1'];
 labels.splice(-1,0,lang==='en'?'Skipped due to display limit: 1':'Overgeslagen door weergavelimiet: 1');
 assert(details.open&&JSON.stringify(rows)===JSON.stringify(labels),'wrong diagnostic rows');
 reader().querySelector('.image-controls button').click();await pause(200);
 assert((await requests()).length===0&&(await connections())===0&&!reader().querySelector('iframe,img'),'diagnostics or untrusted click contacted host');
 return {rows,counts:formatted.imageRejections,closedByDefault:hidden,connections:0,requests:0};
}

export async function diagnosticsMissing(lang){
 click(lang==='en'?'← Back to list':'← Terug naar lijst');await open('missing');
 assert(!reader().querySelector('.image-source-summary,iframe,img'),'message diagnostics or consent carried over');
 return gardenPoint();
}

export async function diagnosticsAfter(lang){
 const observed=await requests();
 assert(observed.length===1&&observed[0].path==='/missing.png'&&!observed[0].referer&&!observed[0].authorization,'unexpected load attempt');
 const details=reader().querySelector('.image-source-summary');
 const note=details?.querySelector('li')?.textContent;
 assert(details&&!details.open&&details.querySelectorAll('li').length===1&&note.startsWith(lang==='en'?'Load failures after consent':'Laadfouten na toestemming'),'fetch failure conflated with rejected sources');
 const m=await fetch('/__test_metrics').then(r=>r.json());assert(!m.sendRequests&&!m.smtpAuth&&!m.deliveries&&!m.appendAttempts,'diagnostics changed mail or sent a draft');
 return {passed:true,note,observed};
}

async function picturePayload(){
 const endpoint=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname.startsWith('/api/messages/'));
 const response=await fetch(endpoint.name);assert(response.ok,'real IMAP message API failed');
 const {formatted,text}=await response.json();
 assert(text.trim()==='Plain picture fixture.'&&!JSON.stringify(formatted).includes('private-'),'plain MIME lost or rejected destination leaked');
 assert(!reader().querySelector('.formatted-mail picture,.formatted-mail source,.formatted-mail a,.formatted-mail style,.formatted-mail link,.formatted-mail [href],.formatted-mail [srcset]'),'sender markup activated');
 return formatted;
}

export async function pictureBefore(expected){
 await openNewsletter('empty');
 const empty=await picturePayload();
 assert(JSON.stringify(empty.imageRejections)==='{"missing":23}'&&!empty.images.length&&!button('Load remote images')&&!reader().querySelector('iframe,img'),'truly empty slots became fetchable');
 click('← Back to list');await open('picture');
 const picture=await picturePayload(),control=button('Load remote images');
 control?.click();await pause(250);
 const pre={requests:await requests(),connections:await connections(),empty:empty.imageRejections,slots:picture.images.length,rejections:picture.imageRejections??null};
 assert(!pre.requests.length&&!pre.connections&&!reader().querySelector('iframe,img'),'contact or image before trusted gesture');
 assert(control&&!picture.imageRejections&&JSON.stringify(picture.images)===JSON.stringify(expected),'unexpected picture API result: '+JSON.stringify(pre));
 return {...pre,point:gardenPoint()};
}

export function pictureVisible(count){
 const frames=[...reader().querySelectorAll('.formatted-mail iframe')];
 assert(frames.length===count&&frames.every(f=>f.getAttribute('sandbox')===''&&f.hasAttribute('credentialless')&&f.referrerPolicy==='no-referrer'&&f.contentDocument===null),'picture frames not isolated');
 assert(document.documentElement.scrollWidth<=innerWidth,'picture overflow');
 return frames.map(f=>{
  f.scrollIntoView({block:'center'});
  const r=f.getBoundingClientRect();
  assert(f.checkVisibility({visibilityProperty:true,opacityProperty:true})&&r.width===128&&r.height===24&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,'picture frame not visible');
  return [r.width,r.height];
 });
}

export async function pictureReset(){
 const observed=await requests(),count=await connections();
 click('← Back to list');await open('picture');
 assert(button('Load remote images')&&!reader().querySelector('img,iframe'),'picture consent persisted on reopen');
 if(!document.querySelector('.list').getClientRects().length)click('← Back to list');
 await open('garden');await pause(250);
 assert(button('Load remote images')&&!reader().querySelector('img,iframe'),'picture consent leaked to another message');
 assert((await requests()).length===observed.length&&(await connections())===count,'reopen/switch contacted host');
 const m=await fetch('/__test_metrics').then(r=>r.json());assert(!m.sendRequests&&!m.smtpAuth&&!m.deliveries&&!m.appendAttempts,'reading changed mail or sent a draft');
 return {passed:true,observed,connections:count,reset:true};
}
