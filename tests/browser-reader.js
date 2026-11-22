const pause=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(v,m)=>{if(!v)throw Error(m);};
async function until(fn,m){for(let i=0;i<240;i++){if(await fn())return;await pause(25);}throw Error(m);}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
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

async function openNewsletter(name,baseline=false){
 await idle();await open('garden');
 assert(!reader().querySelector('.image-controls,.formatted-mail'),'plain default changed');
 if(!baseline)assert(reader().textContent.includes('tekstmodus'),'missing plain-mode explanation');
 click('Instellingen');await pause(0);
 const prefs=document.querySelectorAll('main select');
 set(prefs[0],'en');set(prefs[1],'light');set(prefs[2],'html');await pause(0);click('Instellingen opslaan');await idle();click('Back');
 await open(name);
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
