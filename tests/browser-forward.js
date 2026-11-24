// Built UI + TLS wire peers. The primary action is hit-tested with mouse or CDP touch.
export async function runForward({call,evaluate,poll,mobile,locale,observed}){
 const en=locale==='en',tr=(nl,english)=>en?english:nl;
 const q=JSON.stringify;
 const assert=(ok,label)=>{if(!ok)throw Error(label);};
 const json=(path,method='GET')=>evaluate(`fetch(${q(path)},{method:${q(method)}}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})`,true);
 const button=name=>`[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(b.getAttribute('aria-label')===${q(name)}||b.textContent.trim()===${q(name)}))`;
 const idle=()=>poll(()=>evaluate(`!![...document.querySelectorAll('button')].find(b=>['Uitloggen','Sign out'].includes(b.textContent.trim())&&!b.disabled)`));
 const click=async expression=>{
  const {x,y,height}=await evaluate(`(() => {const b=${expression};if(!b||b.disabled)throw Error('Missing/disabled control');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!b.contains(document.elementFromPoint(x,y)))throw Error('Control not hit-testable');return {x,y,height:r.height}})()`);
  if(mobile){await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
  return height;
 };
 const press=name=>click(button(name));
 const el=selector=>`document.querySelector(${q(selector)})`;
 const set=(selector,value,event='input')=>evaluate(`(() => {const e=${el(selector)};e.value=${q(value)};e.dispatchEvent(new Event(${q(event)},{bubbles:true}));})()`);
 const nav=async()=>{if(mobile&&await evaluate(`${el('.mobile-nav-toggle')}.getAttribute('aria-expanded')==='false'`))await click(el('.mobile-nav-toggle'));};
 const row=title=>`[...document.querySelectorAll('main .mail')].find(b=>b.querySelector('strong')?.textContent===${q(title)})`;
 const choose=async title=>{await poll(()=>evaluate(`!!(${row(title)})`));await click(row(title));};
 const inspect=()=>evaluate(`(() => {const f=document.querySelector('main form');return {accountId:f.querySelector('select').value,to:f.querySelector('[type=email]').value,subject:f.querySelector('[maxlength="998"]').value,text:f.querySelector('textarea').value,focus:document.activeElement===document.querySelector('main h1'),locked:f.querySelector('fieldset').disabled}})()`);
 const noImage=async()=>observed.length===0&&(await json('/__test_image_connections'))===0&&(await json('/__test_image_requests')).length===0;
 const counts=async()=>{const m=await json('/__test_metrics');return [m.sendRequests,m.smtpAuth,m.deliveries,m.appendAttempts];};
 const checkCounts=async(expected,label)=>{const actual=await counts();assert(q(actual)===q(expected),`${label}: ${actual} (expected ${expected})`);};
 await call('Page.bringToFront');await idle();
 await press('Instellingen');
 if(en)await set('main select','en','change');

 await evaluate(`(() => {const s=document.querySelector('main option[value="html"]').parentElement;s.value='html';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await press('Instellingen opslaan');await idle();await press(tr('Terug','Back'));await idle();
 assert(await evaluate('document.documentElement.lang')===locale,'Wrong locale');
 const [work,priv]=['work','private'].map(name=>`${name}@example.test`).map(address=>({address}));
 for(const a of await json('/api/accounts'))Object.assign(a.address===work.address?work:priv,a);
 const sent=(await json(`/api/accounts/${work.id}/folders`)).find(f=>f.path==='Shared/Verzonden');
 const sentPath=`/api/accounts/${work.id}/folders/${sent.id}/messages`;
 const originalRow=(await json(sentPath)).messages[0];
 const privateRow=(await json(`/api/inbox?account=${priv.id}`)).messages[0];
 assert(originalRow.uid===privateRow.uid&&originalRow.validity===privateRow.validity,'Fixture needs an account/folder identity collision');
 const detailPath=`${sentPath}/${originalRow.validity}/${originalRow.uid}`;
 const original=await json(detailPath);
 const title=original.subject,forward=tr('Doorsturen als tekst','Forward as text'),draftTitle=`Fwd: ${title}`;
 assert(original.attachments.length===1&&original.formatted,'Fixture needs HTML and an attachment');
 const openSent=async()=>{
  await nav();
  const account=el(`.account-folders summary[aria-label="${tr('Mappen voor Werk','Folders for Werk')}"]`);
  if(!await evaluate(`${account}.parentElement.open`))await click(account);
  const group=el(`.folder-toggle[aria-label="${tr('Submappen van Shared','Subfolders of Shared')}"]`);
  await poll(()=>evaluate(`!!${group}`));
  if(!await evaluate(`${group}.getAttribute('aria-expanded')==='true'`))await click(group);
  await click(el('.folder-select[title="Shared/Verzonden"]'));
  await choose(title);await idle();
 };
 await openSent();assert(await noImage(),'Reader contacted sender before consent');
 const height=await press(forward);
 assert(!mobile||height>=44,'Forward touch target is smaller than 44px');
 await poll(()=>evaluate('!!document.querySelector("main textarea")'));
 const opened=await inspect();
 assert(opened.accountId===work.id&&opened.to===''&&opened.subject===draftTitle&&opened.focus,'Wrong sender, recipient, subject or composer focus');
 assert(opened.text.includes(tr('Doorgestuurd bericht','Forwarded message'))&&opened.text.includes('sender@example.test')&&opened.text.includes('Exact folder body <b>literal</b>')&&!opened.text.includes('Rich folder body')&&!opened.text.includes('Do not forward this attachment'),'Wrong quote or non-text data included');
 assert(await evaluate(`document.querySelector('main').textContent.includes(${q(tr('bijlagen worden niet','attachments are not'))})`),'No visible text-only limitation');
 await checkCounts([0,0,0,0],'Opening Forward sent mail');
 assert(await noImage(),'Forward loaded sender resources');
 // A dirty forward cannot be replaced by a new forward from the reader.
 await nav();await press('Inbox');await idle();await openSent();
 assert(await evaluate(`${button(forward)}.disabled`),'Forward can overwrite a dirty composer');
 await nav();await press(tr('Actief concept hervatten','Resume active draft'));
 assert((await inspect()).text===opened.text,'Dirty forward was replaced');
 await set('main input[type=email]',priv.address);
 await set('main textarea','Personal note\n'+opened.text);
 await press(tr('Concept bewaren','Save draft'));await idle();
 const [saved]=await json('/api/drafts');
 assert(saved.accountId===work.id&&saved.body.to===priv.address&&saved.body.text==='Personal note\n'+opened.text,'Forward draft not stored faithfully');
 await checkCounts([0,0,0,0],'Saving Forward sent mail');
 await nav();await press(tr('Concepten / verzendstatus','Drafts / send status'));await idle();await choose(draftTitle);
 assert((await inspect()).text===saved.body.text,'Forward draft did not reopen');
 if(!en)await json('/__test_forward_lose_ack','POST');
 await press(tr('Verzenden','Send'));await idle();
 const [finished]=await json('/api/drafts');
 assert(q(finished.body)===q(saved.body),'Send lost the stored draft body');
 if(en){
  assert(finished.operation.state==='accepted'&&finished.operation.filing.status==='filed'&&!await evaluate(`!!${el('main textarea')}`),'Accepted send did not file and close');
 }else{
  await poll(()=>evaluate("document.querySelector('main').textContent.includes('Uitkomst onbekend')"));
  assert(finished.operation.state==='outcome_unknown'&&(await inspect()).locked,'Uncertain send did not stay locked');
  await press('Verzendstatus controleren');await idle();
 }
 // Nodemailer verifies SMTP on one connection and submits on a second.
 const wire=[1,2,1,en?1:0];
 await checkCounts(wire,'Expected one submission and no filing after an uncertain acknowledgement');
 const [delivered]=await json('/__test_forward_deliveries');
 assert(delivered.from===work.address&&delivered.to===priv.address&&delivered.subject===draftTitle&&!delivered.html&&delivered.attachments===0&&delivered.text.replace(/\r\n/g,'\n').trim()===saved.body.text.trim(),'Wrong SMTP account, recipient or MIME');
 const received=(await json(`/api/inbox?account=${priv.id}`)).messages.find(m=>m.subject===draftTitle);
 assert(received?.accountId===priv.id,'No forwarded message in the recipient IMAP inbox');
 const receivedBody=await json(`/api/messages/${priv.id}/${received.validity}/${received.uid}`);
 assert(receivedBody.text.trim()===saved.body.text.trim(),'IMAP round-trip changed the forwarded text');
 assert(q(await json(detailPath))===q(original),'Source message changed on the wire');
 assert(await noImage(),'Unexpected sender network activity');
 const beforeSwitch=await json('/__test_metrics');
 await call('Page.navigate',{url:(await evaluate('location.origin'))+'/__test_forward_other'});
 await poll(async()=> (await json('/api/session')).login==='forward-other');await idle();
 assert((await json('/api/drafts')).length===0&&(await json('/api/accounts')).length===0,'Forward draft or account leaked to another user');
 for(const path of [detailPath,`/api/drafts/${saved.id}`]){
  assert(await evaluate(`fetch(${q(path)}).then(r=>r.status)`,true)===400,'Other user could access a copied source or draft URL');
 }
 assert((await json('/__test_metrics')).imapAuth===beforeSwitch.imapAuth,'Foreign source request reached IMAP');
 return {passed:true,locale,conflictingUid:originalRow.uid,touchHeight:mobile?height:null,wire,outcome:finished.operation.state,recipientImap:true,foreignUserDenied:true};
}
