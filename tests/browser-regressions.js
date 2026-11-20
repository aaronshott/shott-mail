// Run in a real browser on tests/browser-harness.ts, after /__test_login.
// No credentials are embedded or returned. Only synthetic drafts; production has no fault endpoints.
window.b1Regression = (() => {
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const buttons=()=>[...document.querySelectorAll('button')];
 const button=text=>buttons().find(b=>b.textContent.trim()===text);
 function click(text){const b=button(text);if(!b||b.disabled)throw new Error('Missing/disabled button: '+text);b.click();}
 async function until(fn){for(let i=0;i<100;i++){if(fn())return;await pause(100);}throw new Error('UI wait timeout');}
 function input(selector,text){const e=document.querySelector(selector);if(!e)throw new Error('Input missing');e.value=text;e.dispatchEvent(new Event('input',{bubbles:true}));}
 async function seed(prefix){const session=await(await fetch('/api/session')).json();const accounts=await(await fetch('/api/accounts')).json();const ids={};
  for(const [name,address] of [['A','work@example.test'],['B','private@example.test']]){const account=accounts.find(a=>a.address===address);if(!account)throw new Error('Synthetic account missing');const id=crypto.randomUUID();const response=await fetch('/api/drafts/'+id,{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':session.csrf},body:JSON.stringify({accountId:account.id,revision:0,to:'private@example.test',subject:prefix+' '+name,text:'saved '+name})});if(!response.ok)throw new Error('Seed failed');ids[name]={id,accountId:account.id};}
  return ids;
 }
 async function list(subject){click('Concepten / verzendstatus');await until(()=>!!document.querySelector('.panel .mail strong')&&[...document.querySelectorAll('.panel .mail strong')].some(e=>e.textContent===subject));}
 function open(subject){const e=[...document.querySelectorAll('.panel .mail')].find(b=>b.querySelector('strong')?.textContent===subject);if(!e)throw new Error('Draft missing');e.click();}
 const editor=()=>({text:document.querySelector('textarea')?.value,account:document.querySelector('.panel select')?.value});
 async function dirtyDrafts(){const prefix='QA002 '+crypto.randomUUID();const ids=await seed(prefix);const checks=[];const oldConfirm=window.confirm;let prompts=0;let accept=false;
  window.confirm=()=>{prompts++;return accept;};
  const check=(name,pass,actual)=>checks.push({name,pass,actual});
  try{
   await list(prefix+' A');open(prefix+' A');await until(()=>!!document.querySelector('textarea'));input('textarea','unsaved A v2');await pause(50);
   await list(prefix+' A');const before=prompts;open(prefix+' A');await pause(50);click('Actief concept hervatten');await until(()=>!!document.querySelector('textarea'));
   check('same dirty draft cancel preserves input and asks choice',prompts===before+1&&editor().text==='unsaved A v2'&&editor().account===ids.A.accountId,{prompts:prompts-before,...editor()});
   // Explicit accept may discard, including for the same id.
   input('textarea','unsaved A v3');await pause(50);await list(prefix+' A');accept=true;const beforeAccept=prompts;open(prefix+' A');await until(()=>!!document.querySelector('textarea'));
   check('same dirty draft explicit accept loads saved version',prompts===beforeAccept+1&&editor().text==='saved A',{prompts:prompts-beforeAccept,...editor()});
   input('textarea','unsaved cross-account');await pause(50);await list(prefix+' B');accept=false;const beforeOther=prompts;open(prefix+' B');await pause(50);click('Actief concept hervatten');await until(()=>!!document.querySelector('textarea'));
   check('other draft/account cancel retains old text and sender',prompts===beforeOther+1&&editor().text==='unsaved cross-account'&&editor().account===ids.A.accountId,{prompts:prompts-beforeOther,...editor()});
   await list(prefix+' B');accept=true;open(prefix+' B');await until(()=>document.querySelector('textarea')?.value==='saved B');
   check('other draft/account accept loads correct saved sender',editor().account===ids.B.accountId,editor());
   const beforeClean=prompts;await list(prefix+' B');open(prefix+' B');await until(()=>!!document.querySelector('textarea'));
   check('clean same draft reopen needs no discard prompt',prompts===beforeClean&&editor().text==='saved B',{prompts:prompts-beforeClean,...editor()});
   return {case:'B1-QA-002',passed:checks.every(c=>c.pass),checks,confirmationDriver:'browser window.confirm stub: cancel/accept; native dialog additional manual check'};
  }finally{window.confirm=oldConfirm;}
 }
 async function sendResponseLoss(){const prefix='QA003 '+crypto.randomUUID();const ids=await seed(prefix);await list(prefix+' A');open(prefix+' A');await until(()=>!!document.querySelector('textarea'));
  const before=await(await fetch('/__test_metrics')).json();await fetch('/__test_drop_send_response',{method:'POST'});click('Verzenden');await until(()=>document.querySelector('[role=status]')?.textContent.includes('Uitkomst onbekend'));
  const capture=()=>({status:document.querySelector('[role=status]')?.textContent,notice:document.querySelector('.feedback>p:not(.error)')?.textContent,text:document.querySelector('textarea')?.value,locked:document.querySelector('fieldset')?.disabled,stale:document.body.innerText.includes('Verzending wordt aangeboden')});
  const unknown=capture();const checks=[{name:'lost HTTP reply gives matching unknown status/notice and preserves text',pass:unknown.status===unknown.notice&&!unknown.stale&&unknown.locked&&unknown.text==='saved A',actual:unknown}];
  click('Verzendstatus controleren');await until(()=>document.querySelector('[role=status]')?.textContent.includes('Niet aangeboden'));const refreshed=capture();
  checks.push({name:'status GET reconciles both status and notice',pass:refreshed.status===refreshed.notice&&!refreshed.stale&&refreshed.locked&&refreshed.text==='saved A',actual:refreshed});
  click('Verzendstatus controleren');await pause(200);const after=await(await fetch('/__test_metrics')).json();
  checks.push({name:'one processed POST, one dropped response, status refresh never resends',pass:after.sendRequests-before.sendRequests===1&&after.droppedReplies-before.droppedReplies===1,actual:{sendRequests:after.sendRequests-before.sendRequests,droppedReplies:after.droppedReplies-before.droppedReplies}});
  return {case:'B1-QA-003',passed:checks.every(c=>c.pass),checks,scope:'real HTTP reply loss after real backend handler; policy-denied SMTP, not accepted mail delivery'};
 }
 return {dirtyDrafts,sendResponseLoss};
})();
