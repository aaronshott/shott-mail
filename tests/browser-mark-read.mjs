export async function runMarkRead({call,evaluate,poll,mobile}){
 const check=async(expr,message)=>{if(!await evaluate(expr))throw Error(message);};
 const buttons=text=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
 const row=name=>`[...document.querySelectorAll('.list .mail')].find(b=>b.querySelector('strong').textContent==='Seed for ${name}@example.test')`;
 const wait=expr=>poll(()=>evaluate(expr));
 const idle=()=>wait(`${buttons('Uitloggen')} && !${buttons('Uitloggen')}.disabled`);
 const click=expr=>evaluate(`${expr}.click()`);
 const postFault=()=>evaluate("fetch('/__test_reject_seen',{method:'POST'}).then(r=>r.ok)",true);
 const stores=()=>evaluate("fetch('/__test_seen_writes').then(r=>r.json())",true);
 const unread=name=>`${row(name)}?.querySelector('[aria-label=Ongelezen]')`;
 const mark=buttons('Markeren als gelezen'),back=buttons('← Terug naar lijst');
 const open=async name=>{await click(row(name));await wait(`document.querySelector('#readtitle')?.textContent==='Seed for ${name}@example.test'`);await idle();};
 async function activate(){
  if(!mobile){
   await check("document.activeElement.id==='readtitle'",'Reader did not take focus');
   await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
   await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
   await check(`document.activeElement===${mark}`,'Tab did not reach Mark as read');
   await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
   await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  }else{
   const {x,y}=await evaluate(`(()=>{const b=${mark};b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(r.height<44||!b.contains(document.elementFromPoint(x,y)))throw Error('Touch target is obstructed or too short');return {x,y};})()`);
   await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
 }
 await wait(`${row('work')} && ${row('private')}`);await idle();
 await open('work');
 await check(unread('work'),'Opening the reader marked the row');
 if((await stores()).length)throw Error('Opening the reader wrote flags');
 await check(`${mark}`, 'Mark as read action is missing');
 await activate();await wait(buttons('Gelezen'));await idle();
 if(!mobile)await check(`document.activeElement===${buttons('Gelezen')}`,'Focus was lost after marking read');
 await click(back);
 await check(`!${unread('work')} && ${unread('private')}`,'Wrong list markers immediately after returning');
 await check(`document.activeElement===${row('work')}`,'Focus did not return to the target row');
 await open('work');await check(`${buttons('Gelezen')}?.getAttribute('aria-disabled')==='true'`,'Reopened reader lost read state');
 await click(back);await click(buttons('Vernieuwen'));await idle();
 await check(`!${unread('work')} && ${unread('private')}`,'IMAP-backed refresh lost read state');
 if(!await postFault())throw Error('Fixture rejection was not armed');
 await open('private');await activate();
 await wait("[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('niet bevestigen'))");await idle();
 await check(`${mark}?.getAttribute('aria-disabled')==='false'`,'Failed write disabled retry or claimed success');
 await click(back);await check(unread('private'),'Failed write cleared unread marker');
 await click(buttons('Vernieuwen'));await idle();await check(unread('private'),'Failed write persisted read');
 const writes=await stores();if(writes.length!==2||writes[0].user!=='work@example.test'||writes[1].user!=='private@example.test'||writes.some(w=>w.path!=='INBOX'))throw Error('Unexpected flag writes');
 return {passed:true,input:mobile?'touch':'Tab + Enter',checks:['opening is read-only','target row immediately updates','reader reopen and list refresh retain state','rejected IMAP write shows error and preserves unread','focus returns to row']};
}
