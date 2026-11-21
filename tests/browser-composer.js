// Run in Chromium against browser-harness.ts --composer, after /__test_login.
// All mail stays in the TLS loopback fixture. The browser can delay delivery of a real API response to the app.
export async function runComposer(){
 const checks=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(ok,why)=>{if(!ok)throw new Error(why);};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const click=text=>{const b=button(text);assert(b&&!b.disabled,`Missing/disabled: ${text}`);b.click();};
 const until=async(fn,why)=>{for(let i=0;i<160;i++){if(fn())return;await pause(50);}throw new Error(why);};
 const waitIdle=async()=>{await pause(0);await until(()=>!button('Uitloggen')?.disabled&&!!button('Uitloggen'),'App still busy');};
 const field=()=>document.querySelector('textarea');
 const locked=()=>document.querySelector('fieldset')?.disabled;
 const notice=()=>document.querySelector('.feedback p:not(.error)')?.textContent??'';
 const set=(selector,value)=>{const el=document.querySelector(selector);assert(el,`Missing: ${selector}`);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 const json=async(path,init)=>{const r=await fetch(path,init);assert(r.ok,`HTTP ${r.status}: ${path}`);return r.json();};
 await waitIdle();
 const account=(await json('/api/accounts')).find(a=>a.address==='work@example.test').id;
 const csrf=(await json('/api/session')).csrf;
 const metrics=()=>json('/__test_metrics');
 const body=n=>`synthetic body ${n}`;
 const showInbox=async()=>{click('Inbox');await waitIdle();set('aside select',account);await waitIdle();assertOverview();};
 function assertOverview(){
  assert(document.querySelector('.list h1')?.textContent==='Inbox','Inbox not restored');
  assert(document.querySelector('aside select').value===account,'Account filter changed');
  assert(document.querySelector('.list').textContent.includes('Seed for work@example.test')&&!document.querySelector('.list').textContent.includes('Seed for private@example.test'),'Wrong filtered messages');
 }
 async function compose(n){await showInbox();click('+ Nieuw bericht');await until(()=>!!field(),'Composer not open');set('input[type=email]','private@example.test');set('input[maxlength="998"]',`MC14 ${n} ${crypto.randomUUID()}`);set('textarea',body(n));await pause(0);}
 const subject=()=>document.querySelector('input[maxlength="998"]').value;
 const row=name=>[...document.querySelectorAll('.panel .mail')].find(b=>b.querySelector('strong')?.textContent===name);
 const draftList=async()=>{click('Concepten / verzendstatus');await waitIdle();};
 async function openDraft(name){await draftList();assert(row(name),'Stored draft missing');row(name).click();await until(()=>!!field(),'Stored draft not displayed');}
 async function accepted(name){
  assert(!field(),'Accepted operation left composer open');assert(!button('Actief concept hervatten'),'Accepted composer still active');assertOverview();
  assert(document.querySelector('.listhead [role=status]')?.textContent==='SMTP-server heeft het bericht geaccepteerd.','Short, accurate confirmation missing');
  await draftList();assert(row(name)?.textContent.includes('accepted'),'Accepted draft/history missing');
 }
 async function once(before,dropped=0){const after=await metrics();const delta=['sendRequests','deliveries','droppedReplies'].map(k=>after[k]-before[k]);assert(delta.join()===`1,1,${dropped}`,`Unexpected POST/delivery/drop counts: ${delta}`);}
 const run=async(name,fn)=>{try{await fn();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});}}
 async function hold(match,exercise){
  const original=window.fetch;
  let captured,release;const gate=new Promise(r=>release=r);
  window.fetch=async (...args)=>{const r=await original(...args);if(!captured&&match(...args)){captured=await r.clone().json();await gate;}return r;};
  try{await exercise(async()=>{await until(()=>!!captured,'Expected real API response');return captured;},release);}
  finally{release();window.fetch=original;await waitIdle();}
 }
 function pressSendTwice(){const b=button('Verzenden');click('Verzenden');b.click();}
 await run('direct accepted: closes, filtered inbox, confirmation, history, no duplicate',async()=>{
  await compose('direct');const name=subject(),before=await metrics();pressSendTwice();await waitIdle();await once(before);await accepted(name);
 });
 await run('lost HTTP response: text locked, status GET closes accepted, no duplicate',async()=>{
  await compose('lost');const name=subject(),before=await metrics();await json('/__test_drop_send_response',{method:'POST'});pressSendTwice();await waitIdle();
  assert(field()?.value===body('lost')&&locked()&&notice().includes('Uitkomst onbekend'),'Unknown response lost text or unlocked send');
  click('Verzendstatus controleren');await waitIdle();await once(before,1);await accepted(name);
 });
 await run('late accepted POST: cannot close or overwrite newer draft',async()=>{
  await compose('late-post');const before=await metrics();
  await hold((p,init)=>p.endsWith('/send')&&init?.method==='POST',async(read,release)=>{
   click('Verzenden');assert((await read()).state==='accepted','Fixture did not accept');
   click('+ Nieuw bericht');await pause(0);release();await waitIdle();
   assert(field()?.value===''&&subject()===''&&!locked()&&!notice().includes('geaccepteerd'),'Late POST closed or mutated the new draft');
  });await once(before);
 });
 // Clear the intentionally abandoned newer draft using the ordinary discard confirmation when reopening.
 const oldConfirm=window.confirm;window.confirm=()=>true;
 try{
  await run('late accepted status GET: cannot close or overwrite newer draft',async()=>{
   const known=(await json('/api/drafts')).find(d=>d.operation?.state==='accepted');assert(known,'No accepted history');
   await openDraft(known.body.subject);const before=await metrics();
   await hold((p,init)=>p===`/api/drafts/${known.id}`&&init?.method==='GET',async(read,release)=>{
    click('Verzendstatus controleren');assert((await read()).operation.state==='accepted','Expected accepted history');
    click('+ Nieuw bericht');await pause(0);release();await waitIdle();
    assert(field()?.value===''&&subject()===''&&!locked()&&!notice().includes('geaccepteerd'),'Late GET closed or mutated the new draft');
   });assert((await metrics()).sendRequests===before.sendRequests,'Status GET triggered send');
  });
  await run('real save conflict: unsaved text preserved, zero POSTs',async()=>{
   const name=`MC14 conflict ${crypto.randomUUID()}`,id=crypto.randomUUID();
   const put=revision=>json(`/api/drafts/${id}`,{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify({accountId:account,revision,to:'private@example.test',subject:name,text:'stored'})});
   const saved=await put(0);await openDraft(name);set('textarea','unsaved conflict text');await put(saved.revision);const before=await metrics();
   click('Verzenden');await waitIdle();assert(field()?.value==='unsaved conflict text'&&!locked()&&document.querySelector('[role=alert]')?.textContent.includes('invoer is behouden'),'Save error lost text or compose');
   assert((await metrics()).sendRequests===before.sendRequests,'Send attempted after failed save');
  });
 }finally{window.confirm=oldConfirm;}
 return {browser:navigator.userAgent,viewport:[innerWidth,innerHeight],passed:checks.every(c=>c.pass),checks};
}
