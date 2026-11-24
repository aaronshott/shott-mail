// Scoped regressions adapted from the independent QA17 browser probes.
// Seeded loopback IMAP only: these scenarios never submit or append a message.
export async function runContext(){
 const native=window.fetch.bind(window),checks=[];
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(v,message)=>{if(!v)throw Error(message);};
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
 const press=text=>{const b=button(text);assert(b&&!b.disabled,'Missing/disabled: '+text);b.click();};
 const idle=async()=>{await pause(20);for(let i=0;i<240;i++){if(button('Uitloggen')&&!button('Uitloggen').disabled)return;await pause(50);}throw Error('App stayed busy');};
 const set=(el,value)=>{assert(el,'Missing field');el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 const json=async path=>{const r=await native(path);assert(r.ok,`HTTP ${r.status}: ${path}`);return r.json();};
 const run=async(name,fn)=>{try{checks.push({name,details:await fn(),passed:true});}catch(error){checks.push({name,error:error.message,passed:false});}finally{window.fetch=native;}};
 async function hold(match,drive){
  let arrive,release,seen=false;const reached=new Promise(r=>arrive=r),gate=new Promise(r=>release=r);
  window.fetch=async(url,...args)=>{const response=await native(url,...args);if(!seen&&match(String(url),args[0])){seen=true;arrive(response.status);await gate;}return response;};
  try{await drive(()=>Promise.race([reached,pause(8000).then(()=>{throw Error('Expected response was not held');})]));}
  finally{release();window.fetch=native;await idle();}
 }
 const title=()=>document.querySelector('main h1')?.textContent.trim();
 const readTitle=()=>document.querySelector('#readtitle')?.textContent;
 const row=()=>document.querySelector('.list .mail'),rowSubject=()=>row()?.querySelector('strong')?.textContent;
 const sentSubject='QA17 Sent row';
 const policy=()=>document.querySelector('.sent-settings select');
 await idle();const accounts=await json('/api/accounts'),work=accounts.find(a=>a.label==='Werk'),priv=accounts.find(a=>a.label==='Privé');
 const inboxURL=`/api/inbox?account=${work.id}&page=0`;
 const sent=(await json(`/api/accounts/${work.id}/folders`)).find(f=>f.path==='Shared/Verzonden');
 const sentList=`/api/accounts/${work.id}/folders/${sent.id}/messages`;
 const [inboxRows,sentRows]=await Promise.all([json(inboxURL),json(sentList)]);
 const {validity,uid}=sentRows.messages[0];assert(validity===inboxRows.messages[0].validity&&uid===inboxRows.messages[0].uid,'Fixture must collide in UID and UIDVALIDITY');
 const sentRead=`${sentList}/${validity}/${uid}`,inboxRead=`/api/messages/${work.id}/${validity}/${uid}`;
 const before=await json('/__test_metrics');
 set(document.querySelector('aside select'),work.id);await idle();
 function pickSent(){const b=document.querySelector('.folder-select[title="Shared/Verzonden"]');assert(b&&!b.disabled,'Missing Sent folder');b.click();}
 async function showTree(){
  const nav=document.querySelector('.mobile-nav-toggle');if(nav.getClientRects().length&&nav.getAttribute('aria-expanded')==='false')nav.click();
  const summary=document.querySelector('.account-folders summary[aria-label="Mappen voor Werk"]');if(!summary.parentElement.open)summary.click();
  for(let i=0;i<200&&!document.querySelector('.folder-toggle[aria-label="Submappen van Shared"]');i++)await pause(50);
  const group=document.querySelector('.folder-toggle[aria-label="Submappen van Shared"]');if(group.getAttribute('aria-expanded')==='false')group.click();await pause(20);
 }
 async function showSent(){await showTree();pickSent();await idle();assert(rowSubject()===sentSubject,'Seeded Sent row missing');}
 await run('QA17-01: 429 cannot turn a Sent row into an Inbox read',async()=>{
  await showSent();const paths=[];let faults=0;
  window.fetch=(url,...args)=>{paths.push(String(url));if(String(url)===inboxURL&&faults++===0)return Promise.resolve(Response.json({error:'TRY_LATER'},{status:429}));return native(url,...args);};
  row().click();await idle();assert(readTitle()===sentSubject&&paths.includes(sentRead),'Normal Sent read used wrong source');
  document.querySelector('.mobile-list-return')?.click();press('Inbox');await idle();
  assert(faults===1&&document.querySelector('[role=alert]')?.textContent.includes('Te veel pogingen'),'Expected 429 not visible');
  const stale=rowSubject();if(stale===sentSubject&&!row().disabled){row().click();await idle();}
  assert(!paths.includes(inboxRead),`Sent click opened ${readTitle()} via Inbox`);
  assert(title()!=='Inbox'||stale!==sentSubject||row().disabled,'Old Sent row re-labelled as Inbox');
  press('Inbox');await idle();assert(rowSubject()==='Seed for work@example.test','Retry failed to load real Inbox');
  row().click();await idle();assert(readTitle()==='Seed for work@example.test'&&paths.includes(inboxRead),'Normal Inbox read changed');
  return {collision:{uid,validity},faults,normalSentAndInbox:true};
 });
 await run('QA17-02: a late policy save is applied to its request account only',async()=>{
  press('Accounts');await pause(0);press('Werk');await pause(0);set(policy(),'provider');await pause(0);
  await hold((url,init)=>url===`/api/accounts/${work.id}/sent`&&init.method==='PUT',async reached=>{
   press('Verzonden-instellingen opslaan');assert(await reached()===200,'Policy PUT failed');
   press('Privé');await pause(0);set(document.querySelector('main form input[maxlength="80"]'),'Privé unsaved');
  });
  const stored=await json('/api/accounts');
  assert(stored.find(a=>a.id===work.id).sent?.policy==='provider'&&!stored.find(a=>a.id===priv.id).sent,'Unexpected server-side policy');
  assert(policy().value==='client',`Privé UI shows ${policy().value} despite client default`);
  assert(document.querySelector('main form input[maxlength="80"]').value==='Privé unsaved','Unrelated form edit overwritten');
  press('Werk');await pause(0);assert(policy().value==='provider','Saved Werk policy missing after revisit');
  return {work:'provider',private:'client',privateEditPreserved:true};
 });
 await run('Failed policy save keeps the current selection and saves nothing',async()=>{
  press('Accounts');await pause(0);press('Privé');await pause(0);set(policy(),'provider');await pause(0);
  window.fetch=(url,...args)=>String(url)===`/api/accounts/${priv.id}/sent`?Promise.resolve(Response.json({error:'TRY_LATER'},{status:429})):native(url,...args);
  press('Verzonden-instellingen opslaan');await idle();
  assert(policy().value==='provider'&&document.querySelector('[role=alert]')?.textContent.includes('Te veel pogingen'),'Failed save lost input or error');
  assert(!(await json('/api/accounts')).find(a=>a.id===priv.id).sent,'Failed save changed persistent policy');
 });
 await run('A late folder load cannot replace the composer or lose new text',async()=>{
  await showTree();
  await hold(url=>url.startsWith(sentList+'?'),async reached=>{
   pickSent();assert(await reached()===200,'Folder list request failed');
   press('+ Nieuw bericht');await pause(0);set(document.querySelector('textarea'),'Unsaved QA17 text');
  });
  assert(title()==='Bericht opstellen'&&document.querySelector('textarea')?.value==='Unsaved QA17 text','Delayed folder response replaced the editor');
 });
 await run('A late read stays out of Accounts and does not reappear in Inbox',async()=>{
  await showSent();
  await hold(url=>url===sentRead,async reached=>{row().click();assert(await reached()===200,'Read request failed');press('Accounts');});
  assert(title()==='Accounts'&&!document.querySelector('.shell').classList.contains('reading'),'Stale read mutated Accounts');
  press('Inbox');await idle();assert(!readTitle()&&rowSubject()==='Seed for work@example.test','Stale reader reappeared in Inbox');
 });
 await run('No SMTP, send POST or IMAP APPEND during these regressions',async()=>{
  const after=await json('/__test_metrics');const delta=Object.fromEntries(['sendRequests','smtpAuth','deliveries','appendAttempts'].map(k=>[k,after[k]-before[k]]));assert(Object.values(delta).every(n=>n===0),JSON.stringify(delta));return delta;
 });
 return {passed:checks.every(c=>c.passed),viewport:[innerWidth,innerHeight],checks};
}
