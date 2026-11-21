// Real built UI, local IMAP/SMTP TLS fixture. No messages sent in this workflow.
export async function runSettings(){
 const checks=[];
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn,message){for(let i=0;i<240;i++){if(fn())return;await wait(25);}throw Error(message);}
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const press=text=>{const b=button(text);assert(b&&!b.disabled,'Missing or disabled: '+text);b.click();};
 const set=(field,value)=>{field.value=value;field.dispatchEvent(new Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 const nav=document.querySelector('.mobile-nav-toggle'), aside=document.querySelector('aside');
 const mobile=!!nav.getClientRects().length, html=document.documentElement;
 const scheme=()=>getComputedStyle(html).colorScheme;
 const idle=async()=>{await wait(25);await until(()=>{const b=button('Sign out')??button('Uitloggen');return b&&!b.disabled;},'app stayed busy');};
 const openNav=async()=>{if(mobile&&nav.getAttribute('aria-expanded')==='false'){nav.click();await wait(0);}};
 const pick=(path)=>aside.querySelector(`.folder-select[title="${path}"]`);
 const h1=()=>document.querySelector('main h1');
 await idle();
 assert(html.lang==='nl'&&html.dataset.theme==='system'&&scheme()==='dark','Dutch/system defaults');
 if(mobile){
  assert(!aside.getClientRects().length,'navigation initially hidden');await openNav();
  assert(nav.getAttribute('aria-expanded')==='true'&&aside.getClientRects().length,'navigation did not open');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',cancelable:true}));await wait(0);
  assert(!aside.getClientRects().length&&document.activeElement===nav,'Escape did not restore focus');
 }
 await openNav();
 const selector=aside.querySelector('select');
 assert(selector.value==='all','multi-account login not unified');
 const work=[...selector.options].find(option=>option.text.includes('work@example.test'));
 const priv=[...selector.options].find(option=>option.text.includes('private@example.test'));
 const summary=aside.querySelector('summary[aria-label="Mappen voor Werk"]');summary.click();
 await until(()=>pick('INBOX'),'tree did not load');
 const expand=aside.querySelector('[aria-label="Submappen van INBOX"]');
 assert(expand&&expand.getBoundingClientRect().height>=44&&summary.getBoundingClientRect().height>=44,'folder controls too small');
 expand.focus();expand.click();await wait(0);
 assert(document.activeElement===expand&&expand.getAttribute('aria-expanded')==='true'&&pick('INBOX'),'selectable parent lacks independent disclosure');
 pick('INBOX').click();await idle();
 assert(h1().textContent==='INBOX'&&document.activeElement===h1(),'folder navigation failed to focus heading');
 assert(!mobile||!aside.getClientRects().length,'mobile navigation stayed open');
 await openNav();press('+ Nieuw bericht');await wait(0);
 const sender=()=>document.querySelector('main select');
 assert(sender().value===work.value,'folder account not suggested for new draft');
 set(sender(),priv.value);
 const body='Ongewijzigd 概念 <literal> & text';set(document.querySelector('textarea'),body);await wait(0);
 press('Instellingen');await wait(0);
 assert(h1().textContent==='Persoonlijke instellingen'&&document.activeElement===h1(),'settings focus');
 const prefs=()=>document.querySelectorAll('main select');
 const save=async (lang,theme)=>{set(prefs()[0],lang);set(prefs()[1],theme);await wait(0);press(html.lang==='en'?'Save settings':'Instellingen opslaan');await idle();};
 await save('en','light');
 assert(html.lang==='en'&&scheme()==='light'&&h1().textContent==='Personal settings','explicit light/English not applied');
 await save('en','dark');assert(scheme()==='dark','dark theme not applied');
 press('Back');await wait(0);
 assert(h1().textContent==='Compose message'&&document.querySelector('textarea').value===body&&sender().value===priv.value,'settings lost body or explicit sender');
 const to=document.querySelector('main input[type=email]');to.checkValidity();assert(to.validationMessage==='Fill in this field.','validation is not localized');
 const native=window.fetch;
 try{
  window.fetch=(url,...args)=>String(url)==='/api/preferences'&&args[0]?.method==='PUT'?Promise.resolve(Response.json({error:'TRY_LATER'},{status:429})):native(url,...args);
  press('Settings');await wait(0);await save('nl','system');
  assert(html.lang==='en'&&html.dataset.theme==='dark'&&document.querySelector('[role=alert]')?.textContent.includes('Too many attempts'),'unlocalized failed save, or failed save changed appearance');
 }finally{window.fetch=native;}
 press('Back');await wait(0);
 set(document.querySelector('main input[type=email]'),'work@example.test');await wait(0);
 press('Save draft');await idle();
 assert(document.querySelector('.feedback')?.textContent.includes('Saved in Shott Mail'),'fixture draft not saved before reload');
 await openNav();set(selector,work.value);await idle();
 assert(h1().textContent==='Inbox'&&selector.value===work.value&&!document.querySelector('.list').textContent.includes('Seed for private'),'explicit inbox scope lost');
 const time=document.querySelector('time');assert(time&&time.textContent===new Intl.DateTimeFormat('en-GB',{dateStyle:'medium'}).format(new Date(time.dateTime)),'incorrect date localization');
 await openNav();assert(summary.getAttribute('aria-label')==='Folders for Werk'&&pick('INBOX').title==='INBOX'&&summary.textContent.includes('work@example.test'),'translation changed mailbox data');
 assert(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
 checks.push('Dutch/system defaults; explicit light, dark, English and localized failures/validation/date','disclosure, 44px targets, mobile Escape/focus, selectable parent, explicit inbox scope','unsaved Unicode draft and independently chosen sender retained');
 return {passed:true,checks};
}