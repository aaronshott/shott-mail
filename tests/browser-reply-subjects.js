// Built UI with real loopback IMAP envelopes and MIME sources, and local draft persistence.
export async function runReplySubjects(locale){
 const en=locale==='en', lang=()=>document.documentElement.lang;
 const placeholder=en?'(No subject)':'(Geen onderwerp)';
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const click=b=>{assert(b&&!b.disabled&&b.getClientRects().length,'Missing, disabled or hidden control');b.click();};
 const press=text=>click(button(text));
 async function until(predicate,message){for(let i=0;i<240;i++){if(predicate())return;await new Promise(r=>setTimeout(r,25));}throw Error(message);}
 const idle=async()=>{await new Promise(r=>setTimeout(r,25));await until(()=>{const b=button('Uitloggen')??button('Sign out');return b&&!b.disabled;},'app stayed busy');};
 const select=(el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
 const rowButtons=()=>[...document.querySelectorAll('main button.mail')];
 const field=()=>document.querySelector('main input[maxlength="998"]');
 const openNav=async()=>{const nav=document.querySelector('.mobile-nav-toggle');if(nav.getClientRects().length&&nav.getAttribute('aria-expanded')==='false'){click(nav);await until(()=>nav.getAttribute('aria-expanded')==='true','Mobile navigation did not open');}};
 async function json(path){const r=await fetch(path);assert(r.ok,`GET ${path}: ${r.status}`);return r.json();}
 const metricsBefore=await json('/__test_metrics');
 await idle();
 if(en){
  press('Instellingen');
  await until(()=>document.querySelector('main select'),'Settings did not open');
  select(document.querySelector('main select'),'en');
  await Promise.resolve();press('Instellingen opslaan');await idle();press('Back');
 }
 assert(lang()===locale,'Unexpected language');
 await idle();await openNav();
 const scope=document.querySelector('aside select');
 const account=[...scope.options].find(o=>o.text.includes('work@example.test')).value;
 select(scope,account);await idle();
 const inbox=await json(`/api/inbox?account=${account}`);
 // Use the server's row order and UID, not the displayed subject (which may be identical in two rows).
 const cases=[null,'(Geen onderwerp)','(No subject)','Quarterly report'];
 const draftIds=new Set();
 const checks=[];
 for(let i=0;i<cases.length;i++){
  const original=cases[i], missing=original===null, display=missing?placeholder:original;
  const index=inbox.messages.findIndex(m=>m.uid===i+1);
  const row=inbox.messages[index];
  assert(row?.subjectMissing===missing&& (missing||row.subject===original),'Wrong IMAP envelope subject or marker');
  const titles=rowButtons().map(b=>b.querySelector('strong').textContent);
  assert(titles[index]===display,`Wrong inbox display subject: expected ${display} at ${index} in ${JSON.stringify(titles)}`);
  const path=`/api/messages/${account}/${row.validity}/${row.uid}`;
  const before=await json(path);
  assert(before.subjectMissing===missing&&(missing||before.subject===original),'Wrong MIME subject or marker');
  click(rowButtons()[index]);await idle();
  assert(document.querySelector('#readtitle')?.textContent===display&&document.querySelector('.reader pre')?.textContent.trim()===`Reply fixture ${i}`,'Wrong message or reader subject');
  press(en?'Reply':'Beantwoorden');await until(field,'Reply composer did not open');
  const initial=field().value;
  press(en?'Save draft':'Concept bewaren');await idle();
  const drafts=await json('/api/drafts');
  const newDrafts=drafts.filter(d=>!draftIds.has(d.id));
  assert(newDrafts.length===1,'Reply draft was not saved exactly once');
  const [saved]=newDrafts;draftIds.add(saved.id);
  await openNav();press(en?'Drafts / send status':'Concepten / verzendstatus');await idle();
  const savedRow=rowButtons()[drafts.findIndex(d=>d.id===saved.id)];
  const draftDisplay=savedRow.querySelector('strong').textContent;
  click(savedRow);await until(field,'Saved draft did not reopen');
  const reopened=field().value;
  assert(JSON.stringify(await json(path))===JSON.stringify(before),'Original message changed');
  const expected=missing?'':`Re: ${original}`;
  const passed=initial===expected&&saved.body.subject===expected&&reopened===expected&&draftDisplay===(expected||placeholder);
  checks.push({original,display,expected,initial,saved:saved.body.subject,reopened,draftDisplay,passed});
  await openNav();press('Inbox');await idle();
 }
 const metricsAfter=await json('/__test_metrics');
 const delta=Object.fromEntries(['sendRequests','smtpAuth','deliveries','appendAttempts'].map(k=>[k,metricsAfter[k]-metricsBefore[k]]));
 assert(Object.values(delta).every(n=>n===0),'Reply draft flow touched send or IMAP APPEND: '+JSON.stringify(delta));
 return {passed:checks.every(c=>c.passed),locale,checks,delta};
}
