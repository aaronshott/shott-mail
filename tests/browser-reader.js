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
 words=lang==='en'?{settings:'Settings',back:'Back',list:'← Back to list',load:'Load images for this message',tracking:'IP address',reply:'Reply'}:{settings:'Instellingen',back:'Terug',list:'← Terug naar lijst',load:'Afbeeldingen laden voor dit bericht',tracking:'IP-adres',reply:'Beantwoorden'};
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
