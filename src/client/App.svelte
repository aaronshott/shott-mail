<script>
 import {onMount,tick} from 'svelte';
 import EndpointFields from './EndpointFields.svelte';
 import SentSettings from './SentSettings.svelte';
 import FolderNavigation from './FolderNavigation.svelte';
 import FormattedMail from './FormattedMail.svelte';
 import {accountFilter} from './navigation.js';
 import {translate,hasMessage,UiError} from './i18n.js';
 let maxDraftChars=200000,mailMode='disabled';
 let logged=false,password='',csrf='',error='',notice='',busy=false,accounts=[],messages=[],drafts=[],filter='all',page=0,hasMore=false,view='inbox',reader=null,editor=null,settings=null,dirty=false;
 let loginName='',role='',identity='',users=[],newLogin='',newPassword='';
 let activeFolder=null,folderIndex=0,folderValidity='',filingNotice='',observation='';
 let explicitAccount=null,folderEpochs={},mobileNav=false,navToggle,lastReadButton;
 let language='nl',theme='system',readerFormat='plain',preferenceForm,returnView='inbox';
 $: t=translate.bind(null,language);
 $: locale=language==='en'?'en-GB':'nl-NL';
 $: numbers=new Intl.NumberFormat(locale);
 $: dates=new Intl.DateTimeFormat(locale,{dateStyle:'medium'});
 $: applyAppearance(language,theme);
 function applyAppearance(lang,appearance){document.documentElement.lang=lang;document.documentElement.dataset.theme=appearance;}
 const connectionText=(t,result)=>t(result==='OK'?'connectionOK':result==='POLICY'?'connectionPolicy':'connectionFailed');
 function noticeText(t,value){
  if(!Array.isArray(value))return t(value);
  if(value[0]==='accountTest')return t(value[0],{imap:connectionText(t,value[1].imap),smtp:connectionText(t,value[1].smtp)});
  if(value[0]==='sendStatus')return status(t,value[1]);
  return t(...value);
 }
 function invalid(e){const field=e.target;field.setCustomValidity(t(field.validity.valueMissing?'required':field.validity.typeMismatch&&field.type==='email'?'invalidEmail':'invalidField'));}
 function clearValidation(e){e.target.setCustomValidity?.('');}
 let navigation=0;
 $: currentPage=view==='folder'?folderIndex:page;
 const emptyEndpoint=(port)=>({host:'',port,tls:'implicit',user:'',password:''});

 async function api(path,method='GET',data){
  const session=csrf;
  let response,value;try{response=await fetch(path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(session?{'x-csrf-token':session}:{})},...(data?{body:JSON.stringify(data)}:{})});value=await response.json();}catch{throw new UiError('network');}
  if(!response.ok){
   const expired=(response.status===401||value.error==='CSRF')&&path!=='/api/login';
   if(expired&&csrf===session){logged=false;csrf='';role='';clearWorkspace(true);}
   throw new UiError(expired?'LOGIN_REQUIRED':hasMessage(value.error)?value.error:'REQUEST_FAILED');
  }return value;
 }
 async function action(fn){if(busy)return;busy=true;error='';try{await fn();}catch(e){error=e instanceof UiError?e:new UiError('REQUEST_FAILED');}finally{busy=false;}}
 function clearRows(){messages=[];hasMore=false;}
 function enter(next,preserveRows=false){navigation++;reader=null;if(next==='inbox'&&view!=='inbox'&&!preserveRows)clearRows();view=next;}
 async function focusView(stamp=navigation){await tick();if(logged&&stamp===navigation)document.querySelector('.workspace h1')?.focus();}
 function goView(next,preserveRows=false){enter(next,preserveRows);mobileNav=false;return focusView();}
 function toggleMobile(){mobileNav=!mobileNav;}
 function closeNavigation(e){if(e.key!=='Escape'||!mobileNav||!matchMedia('(max-width:760px)').matches)return;e.preventDefault();mobileNav=false;navToggle?.focus();}
 function setAccounts(owned){
  if(explicitAccount&&explicitAccount!=='all'&&!owned.some(a=>a.id===explicitAccount))explicitAccount=null;
  const next=accountFilter(owned,explicitAccount);
  if(next!==filter){filter=next;page=0;clearRows();}
  accounts=owned;
 }
 async function inNavigation(fn){
  const stamp=navigation,current=()=>logged&&navigation===stamp;
  try{await fn(current);}catch(e){if(current()||!logged)throw e;}
 }
 async function refresh(){await inNavigation(async current=>{
  const config=await api('/api/config'),owned=await api('/api/accounts');
  if(!current())return;
  ({maxDraftChars,mailMode}=config);setAccounts(owned);
  if(view==='inbox'){
   const r=await api(`/api/inbox?account=${filter}&page=${page}`);
   if(!current())return;
   messages=messageRows(r);hasMore=r.hasMore;
   if(r.errors.length)error=new UiError('incompleteInbox',{accounts:r.errors.map(e=>accounts.find(a=>a.id===e.accountId)?.label||e.accountId).join(', ')});
  }
  const loaded=await api('/api/drafts');if(current())drafts=loaded;
 });}
 function clearWorkspace(keepEditor=false){
  accounts=[];messages=[];drafts=[];reader=null;settings=null;users=[];newLogin='';newPassword='';filter='all';explicitAccount=null;page=0;hasMore=false;notice='';activeFolder=null;folderValidity='';filingNotice='';observation='';folderEpochs={};mobileNav=false;lastReadButton=null;
  language='nl';theme='system';readerFormat='plain';preferenceForm=null;returnView='inbox';
  if(!keepEditor){editor=null;dirty=false;}enter(editor?'compose':'inbox');
 }
 function activate(r){if(identity!==r.login)clearWorkspace();identity=r.login;loginName=r.login;role=r.role;csrf=r.csrf;logged=true;}
 async function loadWorkspace(){
  const session=csrf;let preferenceError;
  try{const saved=await api('/api/preferences');if(logged&&csrf===session)({language,theme,readerFormat}=saved);}
  catch(e){if(!logged||csrf!==session)throw e;preferenceError=e;}
  await refresh();if(preferenceError)throw preferenceError;
 }
 function openPreferences(){
  if(view==='preferences')return;
  preferenceForm={language,theme,readerFormat};returnView=view;notice='';return goView('preferences');
 }
 async function savePreferences(){await action(async()=>{
  const session=csrf;
  const saved=await api('/api/preferences','PUT',preferenceForm);
  if(logged&&csrf===session){({language,theme,readerFormat}=saved);notice='preferencesSaved';}
 });}
 function closePreferences(){
  if(returnView==='inbox'&&!messages.length)return goInbox();
  if(returnView==='folder'&&!accounts.some(a=>a.id===activeFolder?.account))return goInbox();
  if(returnView==='compose')return resumeDraft();
  return goView(returnView,true);
 }
 async function login(){await action(async()=>{
  if(dirty&&identity&&loginName.trim().toLowerCase()!==identity&&!confirm(t('otherUser')))return;
  try{activate(await api('/api/login','POST',{login:loginName,password}));await loadWorkspace();}finally{password='';}
 });}
 async function logout(){await action(async()=>{if(dirty&&!confirm(t('logoutDirty')))return;await api('/api/logout','POST',{});logged=false;csrf='';role='';identity='';loginName='';clearWorkspace();});}
 async function openUsers(){await action(()=>inNavigation(async current=>{const loaded=await api('/api/admin/users');if(current()){users=loaded;notice='';await goView('users');}}));}
 async function createUser(){await action(async()=>{
  try{const created=await api('/api/admin/users','POST',{login:newLogin,password:newPassword});newLogin='';users=await api('/api/admin/users');notice=['userCreated',{login:created.login}];}
  finally{newPassword='';}
 });}
 function newDraft(reply){editor={id:crypto.randomUUID(),accountId:reply?.accountId??(view==='folder'?activeFolder.account:filter==='all'?'':filter),revision:0,to:reply?.replyTo||'',subject:reply&&!reply.subjectMissing?'Re: '+reply.subject:'',text:reply?'\n\n'+reply.text:'',operation:null};dirty=true;observation='';notice='draftUnsaved';return goView('compose');}
 async function save(){
  const draft=editor;
  const r=await api(`/api/drafts/${draft.id}`,'PUT',{accountId:draft.accountId,revision:draft.revision,to:draft.to,subject:draft.subject,text:draft.text});
  if(editor!==draft)return null;
  editor={...draft,revision:r.revision};dirty=false;notice='draftSaved';return editor;
 }
 const acceptedNotice='acceptedNotice';
 function isSendResult(draft,op){return op?.id===draft.id&&hasMessage('send.'+op.state);}
 async function applySendResult(draft,op){
  // The editor instance is the request's local identity, even if the same draft is reopened.
  if(editor!==draft)return;
  if(op.state!=='accepted'){editor={...draft,operation:op};notice=['sendStatus',op];return;}
  editor=null;dirty=false;notice=acceptedNotice;filingNotice=filingStatus(op);
  if(view==='preferences'&&returnView==='compose')returnView='inbox';
  if(view!=='compose')return;
  await goView('inbox');
  await refresh();
 }
 async function send(){await action(async()=>{
  if(!editor||editor.operation)return;
  const saved=await save();if(!saved||editor!==saved)return;
  const pending={...saved,operation:{id:saved.id,state:'preparing'}};
  editor=pending;notice='sending';
  let op;
  try{
   op=await api(`/api/drafts/${pending.id}/send`,'POST',{revision:pending.revision});
   if(!isSendResult(pending,op))throw new UiError('invalidReceipt');
  }catch(e){
   if(editor!==pending)return;
   editor={...pending,operation:{id:pending.id,state:'outcome_unknown'}};notice=['sendStatus',editor.operation];throw e;
  }
  await applySendResult(pending,op);
 });}
 async function checkSend(){await action(async()=>{
  const draft=editor;if(!draft?.operation)return;
  let d;
  try{d=await api(`/api/drafts/${draft.id}`);}
  catch(e){if(editor===draft)throw e;return;}
  if(editor!==draft)return;
  if(d?.id!==draft.id||d.revision!==draft.revision||!isSendResult(draft,d.operation)){
   // No matching receipt is not proof that the previous POST did not send.
   notice='noReceipt';return;
  }
  await applySendResult(draft,d.operation);
 });}
 function filingStatus(op){const key='filing.'+op?.filing?.status;return hasMessage(key)?key:'filing.none';}
 function status(t,op){return t('send.'+op?.state)+(op?.state==='accepted'?' '+t(filingStatus(op)):'');}
 async function checkCopy(){await action(async()=>{
  const draft=editor;const op=await api(`/api/drafts/${draft.id}/check-sent`,'POST',{});
  if(editor!==draft||!isSendResult(draft,op))return;
  editor={...draft,operation:op};
  observation=op.filing?.status==='observed'?'':'observation.'+op.observation;
 });}
 const folderBase=(account,folder)=>`/api/accounts/${account}/folders/${folder}/messages`;
 // Capture the reader route when rows arrive, never from the view at click time.
 function messageRows(result,folder){return result.messages.map(m=>({...m,source:Object.freeze({owner:identity,session:csrf,
  url:folder?`${folderBase(m.accountId,folder)}/${m.validity}/${m.uid}`:`/api/messages/${m.accountId}/${m.validity}/${m.uid}`})}));}
 function changeAccount(e){explicitAccount=e.currentTarget.value;setAccounts(accounts);page=0;clearRows();return goInbox();}
 function goInbox(){return action(async()=>{await goView('inbox');if(view==='inbox')await refresh();});}
 function goDrafts(){const focused=goView('drafts');return action(async()=>{await focused;if(view==='drafts')await refresh();});}
 function resumeDraft(){if(notice==='preferencesSaved')notice=dirty?'draftUnsaved':'';return goView('compose');}
 function loadDraft(d){
  if(dirty&&!confirm(t('replaceDraft')))return;
  editor={id:d.id,accountId:d.accountId,revision:d.revision,...d.body,operation:d.operation};
  dirty=false;observation='';notice='draftLoaded';return goView('compose');
 }
 function pageMail(next){return action(async()=>{if(view==='folder')await folderPage(activeFolder,next,true);else{enter('inbox');clearRows();page=next;await refresh();}});}
 async function folderPage(folder,next,keepValidity=false){
  reader=null;
  const validity=keepValidity?`&validity=${folderValidity}`:'';
  await inNavigation(async current=>{
   const result=await api(`${folderBase(folder.account,folder.id)}?page=${next}${validity}`);
   if(!current()||!accounts.some(a=>a.id===folder.account))return;
   enter('folder');activeFolder=folder;folderValidity=result.validity;folderIndex=next;messages=messageRows(result,folder.id);hasMore=result.hasMore;
   if(!keepValidity){mobileNav=false;await focusView();}
  });
 }
 async function openMail(m,button){await action(()=>inNavigation(async current=>{
  if(!messages.includes(m)||m.source.owner!==identity||m.source.session!==csrf)return;
  reader=null;
  const loaded=await api(m.source.url);
  if(!current()||!messages.includes(m))return;
  lastReadButton=button;reader=loaded;await tick();if(current()&&reader===loaded)document.getElementById('readtitle')?.focus();
 }));}
 async function closeReader(){const stamp=navigation;reader=null;await tick();if(stamp!==navigation)return;if(lastReadButton?.isConnected)lastReadButton.focus();else await focusView(stamp);}
 function editAccount(a){settings=a?structuredClone(a):{label:'',address:'',imap:emptyEndpoint(993),smtp:emptyEndpoint(465)};settings.imap.password='';settings.smtp.password='';enter('accounts');notice='';}
 async function saveSent(id,data){await action(async()=>{
  const form=settings,session=csrf,stamp=navigation;
  try{
   const {sent}=await api(`/api/accounts/${id}/sent`,'PUT',data);
   if(!logged||csrf!==session)return;
   accounts=accounts.map(a=>a.id===id?{...a,sent}:a);
   if(navigation===stamp&&settings===form)notice='sentSaved';
  }catch(e){if(navigation===stamp||!logged)throw e;}
 });}
 async function saveAccount(){await action(()=>inNavigation(async current=>{
  const form=settings,session=csrf,{id,label,address,imap,smtp}=structuredClone(form);
  const result=await api(id?`/api/accounts/${id}`:'/api/accounts',id?'PUT':'POST',{label,address,imap,smtp});
  if(!logged||csrf!==session)return;
  if(settings===form){
   settings.id=result.id;
   if(settings.imap.password===imap.password)settings.imap.password='';
   if(settings.smtp.password===smtp.password)settings.smtp.password='';
  }
  folderEpochs={...folderEpochs,[result.id]:(folderEpochs[result.id]??0)+1};
  const owned=await api('/api/accounts');if(logged&&csrf===session)setAccounts(owned);
  if(current())notice='accountSaved';
 }));}
 async function testAccount(){await action(()=>inNavigation(async current=>{
  const result=await api(`/api/accounts/${settings.id}/test`,'POST',{});
  if(current())notice=['accountTest',result];
 }));}
 async function deleteAccount(){await action(()=>inNavigation(async()=>{
  if(!confirm(t('confirmDeleteAccount')))return;
  const form=settings,session=csrf;
  await api(`/api/accounts/${form.id}`,'DELETE');
  if(!logged||csrf!==session)return;
  if(settings===form)settings=null;
  setAccounts(accounts.filter(a=>a.id!==form.id));
 }));}
 function leaveWarning(e){if(dirty){e.preventDefault();e.returnValue='';}}
 onMount(()=>{action(async()=>{try{activate(await api('/api/session'));}catch(e){if(e.key!=='LOGIN_REQUIRED')throw e;return;}await loadWorkspace();});});
</script>

<svelte:window onbeforeunload={leaveWarning} onkeydown={closeNavigation} oninvalidcapture={invalid} oninput={clearValidation}/>
<header>
 <div class="brand"><span class="mark">s</span> Shott Mail</div><span class="tag">IMAP / SMTP</span>
 {#if logged}
  <span class="tag">{identity}</span>
  <div class="header-actions">
   <button class="mobile-nav-toggle" bind:this={navToggle} onclick={toggleMobile} aria-controls="mailbox-nav" aria-expanded={mobileNav}>{t('mailboxNav')}</button>
   <button onclick={openPreferences} disabled={view==='preferences'}>{t('settings')}</button>
   <button onclick={logout} disabled={busy}>{t('logout')}</button>
  </div>
 {/if}
</header>
{#if !logged}
 <main class="login">
  <h1>{t('loginTitle')}</h1><p>{t('loginIntro')}</p>
  <form onsubmit={e=>{e.preventDefault();login();}}>
   <label>{t('loginName')}<input autocomplete="username" bind:value={loginName} maxlength="64" required/></label>
   <label>{t('password')}<input type="password" autocomplete="current-password" bind:value={password} maxlength="1024" required/></label>
   <button class="primary" disabled={busy}>{t('login')}</button>
  </form>
  {#if editor}<p>{t('reauthDraft')}</p>{/if}
 </main>
{:else}
 <div class="shell" class:reading={!!reader}>
  <aside id="mailbox-nav" class:mobile-open={mobileNav} aria-label={t('mailboxNav')}>
   <div class="eyebrow">{t('mailboxes')}</div>
   {#if accounts.length>1}
    <label>{t('account')}<select value={filter} disabled={busy} onchange={changeAccount}>
     <option value="all">{t('allAccounts')}</option>
     {#each accounts as a}<option value={a.id}>{a.label} · {a.address}</option>{/each}
    </select></label>
   {/if}
   <button class="primary" onclick={()=>newDraft(null)} disabled={!accounts.length||!!editor&&dirty}>{t('newMessage')}</button>
   <nav aria-label={t('mailboxNav')}>
    <button onclick={goInbox} disabled={busy} aria-current={view==='inbox'?'page':undefined}>{t('inbox')}</button>
    {#if accounts.length}
     <div class="folder-section" role="group" aria-label={t('folders')}>
      <div class="folder-heading">{t('folders')}</div>
      {#each accounts as account (account.id)}
       {#key folderEpochs[account.id]}
        <FolderNavigation {account} {api} {t} {busy} active={view==='folder'&&activeFolder.account===account.id?activeFolder.id:null} onPick={folder=>action(()=>folderPage(folder,0))}/>
       {/key}
      {/each}
     </div>
    {/if}
    <button onclick={goDrafts} aria-current={view==='drafts'?'page':undefined}>{t('draftsNav')}</button>
    <button onclick={()=>goView('accounts')} aria-current={view==='accounts'?'page':undefined}>{t('accounts')}</button>
    {#if role==='admin'}<button onclick={openUsers} aria-current={view==='users'?'page':undefined}>{t('users')}</button>{/if}
    {#if editor}<button onclick={resumeDraft}>{t('resumeDraft')}</button>{/if}
   </nav>
  </aside>
  <main class="workspace">
   {#if view==='inbox'||view==='folder'}
    <section class="list">
     <div class="listhead">
      <div class="eyebrow">{t('overview')}</div>
      <h1 id="inboxtitle" tabindex="-1">{#if view==='folder'}<bdi>{activeFolder.path}</bdi>{:else}{t('inbox')}{/if}</h1>
      {#if view==='folder'}<p class="tag"><bdi>{accounts.find(a=>a.id===activeFolder.account)?.label}</bdi></p>{/if}
      <div role="status">{#if notice===acceptedNotice}<p>{t(notice)}</p>{/if}</div>
      {#if notice===acceptedNotice}<p role="status">{t(filingNotice)}</p>{/if}
      <button onclick={()=>action(async()=>{reader=null;if(view==='folder')await folderPage(activeFolder,0);else await refresh();})} disabled={busy}>{t('refresh')}</button>
      <p>{t('page',{page:numbers.format(currentPage+1)})}</p>
     </div>
     {#each messages as m (m)}
      <button class="mail" onclick={e=>openMail(m,e.currentTarget)} disabled={busy}>
       <span>{#if m.unread}<span aria-label={t('unread')} role="img">●</span> {/if}{m.from}</span>
       <strong>{m.subjectMissing?t('noSubject'):m.subject}</strong>
       <span class="tag">{m.accountLabel} · {m.address}</span>
       {#if m.date}<time datetime={m.date}>{dates.format(new Date(m.date))}</time>{/if}
      </button>
     {/each}
     {#if !messages.length}<p class="empty">{t('emptyMail')} {accounts.length?'':t('addFirst')}</p>{/if}
     <div class="actions"><button disabled={currentPage===0||busy} onclick={()=>pageMail(currentPage-1)}>{t('newer')}</button><button disabled={!hasMore||busy} onclick={()=>pageMail(currentPage+1)}>{t('older')}</button></div>
    </section>
    <section class="reader">
     {#if reader}
      <button onclick={closeReader}>{t('backToList')}</button><span class="tag">{reader.accountLabel} · {reader.address}</span>
      <h2 id="readtitle" tabindex="-1">{reader.subjectMissing?t('noSubject'):reader.subject}</h2><p>{reader.from}</p><p class="note">{t('safeView')}</p>
      {#if readerFormat==='html'&&reader.formatted}
       {#key reader}<FormattedMail body={reader.formatted} text={reader.text} {t}/>{/key}
      {:else}<pre>{reader.text}</pre>{/if}
      {#if reader.attachments.length}<p>{t('attachments')}</p>{/if}
      <button class="primary" onclick={()=>newDraft(reader)} disabled={!!editor&&dirty}>{t('reply')}</button>
     {:else}<p class="empty">{t('chooseMessage')}</p>{/if}
    </section>
   {:else if view==='compose'&&editor}
    <section class="panel">
     <h1 tabindex="-1">{t('compose')}</h1><p class="note">{t('composeNote')}</p>
     <form onsubmit={e=>{e.preventDefault();send();}} oninput={()=>dirty=true} onchange={()=>dirty=true}>
      <fieldset disabled={!!editor.operation||busy}>
       <label>{t('from')}<select bind:value={editor.accountId} required disabled={editor.revision>0}>
        <option value="">{t('chooseSender')}</option>
        {#if editor.accountId&&!accounts.some(a=>a.id===editor.accountId)}<option value={editor.accountId} disabled>{t('senderUnavailable')}</option>{/if}
        {#each accounts as a}<option value={a.id}>{a.label} · {a.address}</option>{/each}
       </select></label>
       <label>{t('to')}<input type="email" bind:value={editor.to} required/></label>
       <label>{t('subject')}<input bind:value={editor.subject} maxlength="998"/></label>
       <label>{t('message')}<textarea bind:value={editor.text} maxlength={maxDraftChars}></textarea></label>
       <div class="actions"><button type="submit" class="primary" disabled={!!editor.accountId&&!accounts.some(a=>a.id===editor.accountId)}>{t('send')}</button><button type="button" onclick={()=>action(save)} disabled={!!editor.accountId&&!accounts.some(a=>a.id===editor.accountId)}>{t('saveDraft')}</button></div>
      </fieldset>
     </form>
     {#if editor.operation}
      <p class="note" role="status">{status(t,editor.operation)}</p><button onclick={checkSend} disabled={busy}>{t('checkSend')}</button>
      {#if editor.operation.state==='accepted'&&['provider_unverified','uncertain','needs_folder'].includes(editor.operation.filing?.status)}
       <button onclick={checkCopy} disabled={busy}>{t('checkCopy')}</button><p role="status">{t(observation)}</p>
      {/if}
     {/if}
    </section>
   {:else if view==='drafts'}
    <section class="panel"><h1 tabindex="-1">{t('draftList')}</h1>
     {#each drafts as d (d.id)}
      <button class="mail" onclick={()=>loadDraft(d)}>
       <strong>{d.body.subject||t('noSubject')}</strong><span>{accounts.find(a=>a.id===d.accountId)?.address} → {d.body.to}</span>
       <span class="tag">{d.operation?t('state.'+d.operation.state)||t('unknownStatus'):t('draft')} · {t('revision',{revision:numbers.format(d.revision)})}</span>
      </button>
     {/each}
    </section>
   {:else if view==='preferences'}
    <section class="panel"><h1 tabindex="-1">{t('personal')}</h1>
     <form onsubmit={e=>{e.preventDefault();savePreferences();}}>
      <label>{t('language')}<select bind:value={preferenceForm.language} disabled={busy}><option value="nl" lang="nl">Nederlands</option><option value="en" lang="en">English</option></select></label>
      <label>{t('theme')}<select bind:value={preferenceForm.theme} disabled={busy}>
       <option value="system">{t('system')}</option><option value="light">{t('light')}</option><option value="dark">{t('dark')}</option>
      </select></label>
      <label>{t('readerFormat')}<select bind:value={preferenceForm.readerFormat} disabled={busy}>
       <option value="plain">{t('plainDefault')}</option><option value="html">{t('safeHtmlPreference')}</option>
      </select></label>
      <div class="actions"><button class="primary" disabled={busy}>{t('savePreferences')}</button><button type="button" onclick={closePreferences} disabled={busy}>{t('back')}</button></div>
     </form>
    </section>
   {:else if view==='users'&&role==='admin'}
    <section class="panel"><h1 tabindex="-1">{t('manageUsers')}</h1><p>{t('usersIntro')}</p>
     <ul>{#each users as user}<li>{user.login} · {t(user.role==='admin'?'admin':'user')}</li>{/each}</ul>
     <form onsubmit={e=>{e.preventDefault();createUser();}}>
      <label>{t('newLogin')}<input bind:value={newLogin} maxlength="64" autocomplete="off" required/></label>
      <label>{t('newPassword')}<input type="password" bind:value={newPassword} minlength="16" maxlength="1024" autocomplete="new-password" required/></label>
      <button class="primary" disabled={busy}>{t('createUser')}</button>
     </form>
    </section>
   {:else if view==='accounts'}
    <section class="panel"><h1 tabindex="-1">{t('accounts')}</h1><p>{t(mailMode==='public'?'publicMode':mailMode==='fixture'?'fixtureMode':'disabledMode')}</p>
     <div class="actions">{#each accounts as a}<button onclick={()=>editAccount(a)}>{a.label}</button>{/each}<button onclick={()=>editAccount(null)}>{t('addAccount')}</button></div>
     {#if settings}
      <form onsubmit={e=>{e.preventDefault();saveAccount();}}>
       <label>{t('label')}<input bind:value={settings.label} required maxlength="80"/></label>
       <label>{t('senderAddress')}<input type="email" bind:value={settings.address} required/></label>
       <div class="fields">
        <EndpointFields {t} protocol="IMAP" bind:endpoint={settings.imap} publicMode={mailMode==='public'} saved={!!settings.id}/>
        <EndpointFields {t} protocol="SMTP" bind:endpoint={settings.smtp} publicMode={mailMode==='public'} saved={!!settings.id}/>
       </div>
       <button class="primary" disabled={busy}>{t('saveAccount')}</button>
      </form>
      {#if settings.id}
       {#key settings.id}<SentSettings {t} account={accounts.find(a=>a.id===settings.id)??settings} {api} {action} {busy} onSave={saveSent}/>{/key}
       <div class="actions"><button onclick={testAccount} disabled={busy}>{t('testAccount')}</button><button disabled={busy} onclick={deleteAccount}>{t('deleteAccount')}</button></div>
      {/if}
     {/if}
    </section>
   {/if}
  </main>
 </div>
{/if}
<div class="feedback" aria-live="polite">
 {#if error}<p role="alert" class="error">{t(error.key,error.params)}</p>{/if}
 {#if notice&&(!['inbox','folder'].includes(view)||notice!==acceptedNotice)}<p>{noticeText(t,notice)}</p>{/if}
</div>
<footer>Shott Mail · {t('noWarranty')} · <a href="/LICENSE">{t('license')}</a> · <a href="https://github.com/aaronshott/shott-mail/tree/feat/mailclient-10-multiuser" target="_blank" rel="noreferrer noopener">{t('source')}</a> · {t('roadmap')}</footer>
