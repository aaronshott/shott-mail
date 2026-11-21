<script>
 import {onMount,tick} from 'svelte';
 import EndpointFields from './EndpointFields.svelte';
 import SentSettings from './SentSettings.svelte';
 let maxDraftChars=200000,mailMode='disabled';
 let logged=false,password='',csrf='',error='',notice='',busy=false,accounts=[],messages=[],drafts=[],filter='all',page=0,hasMore=false,view='inbox',reader=null,editor=null,settings=null,dirty=false;
 let loginName='',role='',identity='',users=[],newLogin='',newPassword='';
 let folders=[],activeFolder=null,folderIndex=0,folderValidity='',filingNotice='',observation='';
 $: currentPage=view==='folder'?folderIndex:page;
 const emptyEndpoint=(port)=>({host:'',port,tls:'implicit',user:'',password:''});
 const describe={LOGIN_REQUIRED:'Sessie verlopen. Meld opnieuw aan; invoer blijft in deze open tab.',LOGIN_FAILED:'Aanmelden mislukt.',LOGIN_EXISTS:'Deze loginnaam is al in gebruik.',ADMIN_REQUIRED:'Alleen de beheerder mag gebruikers beheren.',TRY_LATER:'Te veel pogingen. Wacht even.',REQUEST_FAILED:'Actie mislukt. Controleer invoer, verbinding en serverconfiguratie.',DRAFT_CONFLICT:'Concept gewijzigd of account niet beschikbaar. Je invoer is behouden; overschrijf niet blind.',SEND_LOCKED:'Deze verzendoperatie staat vast. Niet opnieuw versturen.',ACCOUNT_HAS_DRAFTS:'Account heeft concepten/verzendhistorie en kan nog niet verwijderd worden.'};
 async function api(path,method='GET',data){
  let response;try{response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});}catch{throw new Error('Geen verbinding. Invoer niet automatisch opgeslagen. Niet sluiten of herladen.');}
  const value=await response.json();if(!response.ok){if((response.status===401||value.error==='CSRF')&&path!=='/api/login'){logged=false;csrf='';role='';clearWorkspace(true);}throw new Error(describe[value.error]||folderErrors[value.error]||value.error||'Actie mislukt');}return value;
 }
 const folderErrors={MAIL_UNAVAILABLE:'IMAP niet beschikbaar. Controleer de verbinding bij Accounts.',FOLDER_UNAVAILABLE:'Deze IMAP-map is niet meer beschikbaar. Laad de mappenlijst opnieuw.',MESSAGE_IDENTITY_CHANGED:'De map is gewijzigd. Vernieuw de berichtenlijst voordat je verder leest.'};
 async function action(fn){if(busy)return;busy=true;error='';try{await fn();}catch(e){error=e.message;}finally{busy=false;}}
 async function refresh(){({maxDraftChars,mailMode}=await api('/api/config'));accounts=await api('/api/accounts');if(filter!=='all'&&!accounts.some(a=>a.id===filter)){filter='all';page=0;}if(view==='inbox'){const r=await api(`/api/inbox?account=${filter}&page=${page}`);messages=r.messages;hasMore=r.hasMore;if(r.errors.length)error='Inbox onvolledig: '+r.errors.map(e=>accounts.find(a=>a.id===e.accountId)?.label||'account').join(', ')+'. Controleer verbinding/TLS/aanmelding bij Accounts.';}drafts=await api('/api/drafts');}
 function clearWorkspace(keepEditor=false){
  accounts=[];messages=[];drafts=[];reader=null;settings=null;users=[];newLogin='';newPassword='';filter='all';page=0;hasMore=false;notice='';folders=[];activeFolder=null;folderValidity='';filingNotice='';observation='';
  if(!keepEditor){editor=null;dirty=false;}view=editor?'compose':'inbox';
 }
 function activate(r){if(identity!==r.login)clearWorkspace();identity=r.login;loginName=r.login;role=r.role;csrf=r.csrf;logged=true;}
 async function login(){await action(async()=>{
  if(dirty&&identity&&loginName.trim().toLowerCase()!==identity&&!confirm('Aanmelden als een andere gebruiker wist het actieve concept uit deze tab. Doorgaan?'))return;
  try{activate(await api('/api/login','POST',{login:loginName,password}));await refresh();}finally{password='';}
 });}
 async function logout(){await action(async()=>{if(dirty&&!confirm('Niet-opgeslagen invoer gaat bij uitloggen verloren. Toch uitloggen?'))return;await api('/api/logout','POST',{});logged=false;csrf='';role='';identity='';loginName='';clearWorkspace();});}
 async function openUsers(){await action(async()=>{users=await api('/api/admin/users');reader=null;view='users';notice='';});}
 async function createUser(){await action(async()=>{
  try{const created=await api('/api/admin/users','POST',{login:newLogin,password:newPassword});newLogin='';users=await api('/api/admin/users');notice=`Gebruiker ${created.login} aangemaakt.`;}
  finally{newPassword='';}
 });}
 function newDraft(reply){editor={id:crypto.randomUUID(),accountId:reply?.accountId||(filter==='all'?'':filter),revision:0,to:reply?.replyTo||'',subject:reply?'Re: '+reply.subject:'',text:reply?'\n\n'+reply.text:'',operation:null};dirty=true;view='compose';reader=null;notice='Nog niet opgeslagen. Sluiten/herladen kan invoer verliezen.';}
 async function save(){
  const draft=editor;
  const r=await api(`/api/drafts/${draft.id}`,'PUT',{accountId:draft.accountId,revision:draft.revision,to:draft.to,subject:draft.subject,text:draft.text});
  if(editor!==draft)return null;
  editor={...draft,revision:r.revision};dirty=false;notice='Opgeslagen op Shott Mail, niet gesynchroniseerd naar IMAP Drafts.';return editor;
 }
 const acceptedNotice='SMTP-server heeft het bericht geaccepteerd.';
 function isSendResult(draft,op){return op?.id===draft.id&&!!status(op);}
 async function applySendResult(draft,op){
  // The editor instance is the request's local identity, even if the same draft is reopened.
  if(editor!==draft)return;
  if(op.state!=='accepted'){editor={...draft,operation:op};notice=status(op);return;}
  editor=null;dirty=false;notice=acceptedNotice;filingNotice=filingStatus(op);
  if(view!=='compose')return;
  reader=null;view='inbox';
  await tick();document.getElementById('inboxtitle')?.focus();
  await refresh();
 }
 async function send(){await action(async()=>{
  if(!editor||editor.operation)return;
  const saved=await save();if(!saved||editor!==saved)return;
  const pending={...saved,operation:{id:saved.id,state:'preparing'}};
  editor=pending;notice='Verzending wordt aangeboden; niet opnieuw versturen.';
  let op;
  try{
   op=await api(`/api/drafts/${pending.id}/send`,'POST',{revision:pending.revision});
   if(!isSendResult(pending,op))throw new Error('Geen geldige verzendstatus ontvangen.');
  }catch(e){
   if(editor!==pending)return;
   editor={...pending,operation:{id:pending.id,state:'outcome_unknown'}};notice=status(editor.operation);throw e;
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
   notice='Geen bevestigde verzendstatus. Concept behouden; niet opnieuw versturen.';return;
  }
  await applySendResult(draft,d.operation);
 });}
 function filingStatus(op){return ({pending:'Opslaan in Verzonden wordt voorbereid.',appending:'Opslaan in Verzonden loopt.',filed:'Kopie door IMAP geaccepteerd in Verzonden.',observed:'Kopie met dit Message-ID gezien in Verzonden. Dit bewijst niet dat er maar één kopie is.',provider_unverified:'De provider beheert de kopie. Deze is nog niet bevestigd; Shott Mail voegt geen kopie toe.',needs_folder:'Geen eenduidige Verzonden-map. Kies een map bij Accounts voor toekomstige berichten; dit bericht wordt niet opnieuw aangeboden.',failed:'Verzonden-kopie niet opgeslagen door Shott Mail. Het bericht is wel door SMTP geaccepteerd; niet opnieuw verzenden.',uncertain:'IMAP-uitkomst onbekend: er kan al een kopie zijn. Shott Mail probeert niet opnieuw op te slaan.'})[op?.filing?.status]||'Geen IMAP-kopie geregistreerd voor deze eerdere verzending.';}
 function status(op){return ({preparing:'Voorbereiding loopt. Controleer status; niet opnieuw verzenden.',submitting:'Verzending loopt. Niet opnieuw verzenden.',accepted:'SMTP-server heeft geaccepteerd; dit bewijst geen aflevering. '+filingStatus(op),partial_recipients:'Gedeeltelijk geaccepteerd. Niet opnieuw naar iedereen versturen.',outcome_unknown:'Uitkomst onbekend: mogelijk al verzonden. Controleer bij ontvanger/provider; ontbreken van een Sent-kopie bewijst niets. Niet blind opnieuw versturen.',failed_before_submit:'Niet aangeboden: verbinding/TLS/auth/configuratie faalde. Tekst behouden. Deze operatie blijft geblokkeerd; maak pas na controle bewust een nieuw bericht.'})[op?.state]||'';}
 async function checkCopy(){await action(async()=>{
  const draft=editor;const op=await api(`/api/drafts/${draft.id}/check-sent`,'POST',{});
  if(editor!==draft||!isSendResult(draft,op))return;
  editor={...draft,operation:op};
  observation=op.filing?.status==='observed'?'':({not_seen:'Niet gezien. Een vertraagde, verplaatste of gewijzigde kopie is nog mogelijk; er wordt niets toegevoegd.',needs_folder:'Geen eenduidige map voor deze verzending. Controleer de kopie bij je provider.',unavailable:'IMAP-controle niet beschikbaar; de kopiestatus blijft onzeker.',account_changed:'Het IMAP-account is gewijzigd; de oorspronkelijke bestemming kan niet worden gecontroleerd.'})[op.observation]||'';
 });}
 const folderBase=(account,folder)=>`/api/accounts/${account}/folders/${folder}/messages`;
 async function showFolders(){await action(async()=>{
  reader=null;activeFolder=null;folderValidity='';folders=[];view='folders';notice='';
  if(filter!=='all')folders=await api(`/api/accounts/${filter}/folders`);
 });}
 function changeAccount(){page=0;if(view==='folders'||view==='folder')return showFolders();return goInbox();}
 function goInbox(){return action(async()=>{reader=null;view='inbox';await refresh();});}
 function pageMail(next){return action(async()=>{if(view==='folder')await folderPage(activeFolder,next,true);else{page=next;await refresh();}});}
 async function folderPage(folder,next,keepValidity=false){
  reader=null;
  const validity=keepValidity?`&validity=${folderValidity}`:'';
  const result=await api(`${folderBase(filter,folder.id)}?page=${next}${validity}`);
  activeFolder=folder;folderValidity=result.validity;folderIndex=next;messages=result.messages;hasMore=result.hasMore;view='folder';
 }
 async function openMail(m){await action(async()=>{reader=await api(view==='folder'?`${folderBase(m.accountId,activeFolder.id)}/${m.validity}/${m.uid}`:`/api/messages/${m.accountId}/${m.validity}/${m.uid}`);await tick();document.getElementById('readtitle')?.focus();});}
 function editAccount(a){settings=a?structuredClone(a):{label:'',address:'',imap:emptyEndpoint(993),smtp:emptyEndpoint(465)};settings.imap.password='';settings.smtp.password='';view='accounts';notice='';}
 async function saveAccount(){await action(async()=>{const data={label:settings.label,address:settings.address,imap:settings.imap,smtp:settings.smtp};const result=await api(settings.id?`/api/accounts/${settings.id}`:'/api/accounts',settings.id?'PUT':'POST',data);settings.id=result.id;settings.imap.password='';settings.smtp.password='';accounts=await api('/api/accounts');notice='Account opgeslagen. Test IMAP en SMTP afzonderlijk; opslaan bewijst geen verbinding.';});}
 async function testAccount(){await action(async()=>{const result=await api(`/api/accounts/${settings.id}/test`,'POST',{});notice=`IMAP: ${result.imap}; SMTP: ${result.smtp}. Geen testmail verzonden. Controleer host, poort, TLS en inloggegevens bij fouten.`;});}
 function leaveWarning(e){if(dirty){e.preventDefault();e.returnValue='';}}
 onMount(()=>{action(async()=>{try{activate(await api('/api/session'));}catch{return;}await refresh();});});
</script>

<style>
 .folder-list{padding-inline-start:1.25rem}
 .folder-list li{margin-block:.35rem;overflow-wrap:anywhere}
 .folder-list button{white-space:normal;text-align:start;max-width:100%}
 #inboxtitle{overflow-wrap:anywhere}
</style>
<svelte:window onbeforeunload={leaveWarning}/>
<header><div class="brand"><span class="mark">s</span> Shott Mail</div><span class="tag">IMAP / SMTP</span>{#if logged}<span class="tag">{identity}</span><button onclick={logout} disabled={busy}>Uitloggen</button>{/if}</header>
{#if !logged}
 <main class="login"><h1>Een rustige plek voor je mail.</h1><p>Meld aan met je eigen Shott Mail-account. Nog geen account? Vraag je beheerder.</p><form onsubmit={e=>{e.preventDefault();login();}}><label>Loginnaam<input autocomplete="username" bind:value={loginName} maxlength="64" required/></label><label>Wachtwoord<input type="password" autocomplete="current-password" bind:value={password} maxlength="1024" required/></label><button class="primary" disabled={busy}>Aanmelden</button></form>{#if editor}<p>Je actieve concept blijft alleen beschikbaar als je opnieuw aanmeldt als dezelfde gebruiker. Niet herladen.</p>{/if}</main>
{:else}
 <div class="shell" class:reading={!!reader}>
  <aside><div class="eyebrow">JOUW MAILBOXEN</div><label>Account<select bind:value={filter} disabled={busy} onchange={changeAccount}><option value="all">Alle accounts</option>{#each accounts as a}<option value={a.id}>{a.label} · {a.address}</option>{/each}</select></label><button class="primary" onclick={()=>newDraft(null)} disabled={!!editor&&dirty}>+ Nieuw bericht</button><nav><button onclick={goInbox} disabled={busy}>Inbox</button><button onclick={showFolders} disabled={busy}>IMAP-mappen</button><button onclick={()=>action(async()=>{reader=null;view='drafts';await refresh();})}>Concepten / verzendstatus</button><button onclick={()=>{reader=null;view='accounts';}}>Accounts</button>{#if role==='admin'}<button onclick={openUsers}>Gebruikers</button>{/if}{#if editor}<button onclick={()=>view='compose'}>Actief concept hervatten</button>{/if}</nav><p class="motto">Een rustige plek<br/>voor al je mail.</p></aside>
  <main class="workspace">
  {#if view==='folders'}
   <section class="panel"><h1>IMAP-mappen</h1>{#if filter==='all'}<p>Kies één account in het menu om de IMAP-mappen te tonen.</p>{:else}<button onclick={showFolders} disabled={busy}>Mappen vernieuwen</button><ul class="folder-list">{#each folders as folder (folder.id)}<li>{#if folder.selectable}<button onclick={()=>action(()=>folderPage(folder,0))} disabled={busy}><bdi>{folder.path}</bdi>{folder.subscribed?'':' · niet geabonneerd'}</button>{:else}<span><bdi>{folder.path}</bdi> · bovenliggende map</span>{/if}</li>{/each}</ul>{#if !folders.length&&!busy}<p>Geen mappen geladen.</p>{/if}{/if}</section>
  {:else if view==='inbox'||view==='folder'}
   <section class="list"><div class="listhead"><div class="eyebrow">JE OVERZICHT</div><h1 id="inboxtitle" tabindex="-1">{#if view==='folder'}<bdi>{activeFolder.path}</bdi>{:else}Inbox{/if}</h1>{#if view==='folder'}<button onclick={showFolders} disabled={busy}>← IMAP-mappen</button>{/if}<div role="status">{#if notice===acceptedNotice}<p>{notice}</p>{/if}</div>{#if notice===acceptedNotice}<p role="status">{filingNotice}</p>{/if}<button onclick={()=>view==='folder'?action(()=>folderPage(activeFolder,0)):action(refresh)} disabled={busy}>Vernieuwen</button><p>Pagina {currentPage+1} per account · nieuwste eerst</p></div>{#each messages as m}<button class="mail" onclick={()=>openMail(m)}><span>{m.unread?'● ':''}{m.from}</span><strong>{m.subject}</strong><span class="tag">{m.accountLabel} · {m.address}</span></button>{/each}{#if !messages.length}<p class="empty">Geen berichten geladen.{accounts.length?'':' Voeg eerst een account toe.'}</p>{/if}<div class="actions"><button disabled={currentPage===0||busy} onclick={()=>pageMail(currentPage-1)}>Nieuwere</button><button disabled={!hasMore||busy} onclick={()=>pageMail(currentPage+1)}>Oudere</button></div></section>
   <section class="reader">{#if reader}<button onclick={()=>reader=null}>← Terug naar lijst</button><span class="tag">{reader.accountLabel} · {reader.address}</span><h2 id="readtitle" tabindex="-1">{reader.subject}</h2><p>{reader.from}</p><p class="note">Veilige weergave: externe afbeeldingen, links en actieve inhoud zijn uitgeschakeld.</p>{#if reader.html}<iframe title="Veilige berichtinhoud" sandbox="" srcdoc={'<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; form-action &#39;none&#39;; base-uri &#39;none&#39;"><meta charset="utf-8">'+reader.html}></iframe><details><summary>Tekstweergave</summary><pre>{reader.text}</pre></details>{:else}<pre>{reader.text}</pre>{/if}{#if reader.attachments.length}<p>Bijlagen aanwezig; downloaden volgt na B1.</p>{/if}<button class="primary" onclick={()=>newDraft(reader)} disabled={!!editor&&dirty}>Beantwoorden</button>{:else}<p class="empty">Selecteer een bericht.</p>{/if}</section>
  {:else if view==='compose' && editor}
   <section class="panel"><h1>Bericht opstellen</h1><p class="note">Tekstbericht, één ontvanger. Bewaren gebeurt op Shott Mail. Geen automatische verzending of offline-opslag.</p><form onsubmit={e=>{e.preventDefault();send();}} oninput={()=>dirty=true}><fieldset disabled={!!editor.operation||busy}><label>Van<select bind:value={editor.accountId} required disabled={editor.revision>0}><option value="">Kies bewust een afzender</option>{#each accounts as a}<option value={a.id}>{a.label} · {a.address}</option>{/each}</select></label><label>Aan<input type="email" bind:value={editor.to} required/></label><label>Onderwerp<input bind:value={editor.subject} maxlength="998"/></label><label>Bericht<textarea bind:value={editor.text} maxlength={maxDraftChars}></textarea></label><div class="actions"><button type="submit" class="primary">Verzenden</button><button type="button" onclick={()=>action(save)}>Concept bewaren</button></div></fieldset></form>{#if editor.operation}<p class="note" role="status">{status(editor.operation)}</p><button onclick={checkSend} disabled={busy}>Verzendstatus controleren</button>{#if editor.operation.state==='accepted'&&['provider_unverified','uncertain','needs_folder'].includes(editor.operation.filing?.status)}<button onclick={checkCopy} disabled={busy}>Verzonden-kopie controleren</button><p role="status">{observation}</p>{/if}{/if}</section>
  {:else if view==='drafts'}
   <section class="panel"><h1>Concepten en verzendstatus</h1>{#each drafts as d}<button class="mail" onclick={()=>{if(dirty&&!confirm('Actieve onopgeslagen tekst vervangen?'))return;editor={id:d.id,accountId:d.accountId,revision:d.revision,...d.body,operation:d.operation};dirty=false;observation='';view='compose';notice='Opgeslagen versie geladen.';}}><strong>{d.body.subject||'(Geen onderwerp)'}</strong><span>{accounts.find(a=>a.id===d.accountId)?.address} → {d.body.to}</span><span class="tag">{d.operation?.state||'Concept'} · revisie {d.revision}</span></button>{/each}</section>
  {:else if view==='users' && role==='admin'}
   <section class="panel"><h1>Gebruikers beheren</h1><p>Gebruikers beheren hun eigen mailboxen en concepten. Alleen de installatie-eigenaar is beheerder.</p><ul>{#each users as user}<li>{user.login} · {user.role==='admin'?'Beheerder':'Gebruiker'}</li>{/each}</ul><form onsubmit={e=>{e.preventDefault();createUser();}}><label>Nieuwe loginnaam<input bind:value={newLogin} maxlength="64" autocomplete="off" required/></label><label>Nieuw wachtwoord<input type="password" bind:value={newPassword} minlength="16" maxlength="1024" autocomplete="new-password" required/></label><button class="primary" disabled={busy}>Gebruiker aanmaken</button></form></section>
  {:else if view==='accounts'}
   <section class="panel"><h1>Accounts</h1><p>{#if mailMode==='public'}Gebruik de openbare DNS-hostnamen van je provider: IMAP 993 (TLS) of 143 (STARTTLS), SMTP 465 (TLS) of 587 (STARTTLS). TLS en geldige certificaten zijn verplicht.{:else if mailMode==='fixture'}Geïsoleerde testmodus: alleen de ingestelde testservers zijn toegestaan.{:else}Mailverbindingen zijn uitgeschakeld.{/if}</p><div class="actions">{#each accounts as a}<button onclick={()=>editAccount(a)}>{a.label}</button>{/each}<button onclick={()=>editAccount(null)}>Account toevoegen</button></div>{#if settings}<form onsubmit={e=>{e.preventDefault();saveAccount();}}><label>Naam<input bind:value={settings.label} required maxlength="80"/></label><label>Afzenderadres<input type="email" bind:value={settings.address} required/></label><div class="fields"><EndpointFields protocol="IMAP" bind:endpoint={settings.imap} publicMode={mailMode==='public'} saved={!!settings.id}/><EndpointFields protocol="SMTP" bind:endpoint={settings.smtp} publicMode={mailMode==='public'} saved={!!settings.id}/></div><button class="primary" disabled={busy}>Account opslaan</button></form>{#if settings.id}{#key settings.id}<SentSettings account={accounts.find(a=>a.id===settings.id)??settings} {api} {action} {busy} onSaved={sent=>{accounts=accounts.map(a=>a.id===settings.id?{...a,sent}:a);notice='Verzonden-instellingen opgeslagen voor toekomstige berichten.';}}/>{/key}<div class="actions"><button onclick={testAccount} disabled={busy}>Opgeslagen instellingen testen</button><button disabled={busy} onclick={()=>action(async()=>{if(confirm('Alleen lokaal account verwijderen, geen mail bij provider?')){await api(`/api/accounts/${settings.id}`,'DELETE');settings=null;accounts=await api('/api/accounts');}})}>Account verwijderen</button></div>{/if}{/if}</section>
  {/if}
  </main>
 </div>
{/if}
<div class="feedback" aria-live="polite">{#if error}<p role="alert" class="error">{error}</p>{/if}{#if notice&&(view!=='inbox'||notice!==acceptedNotice)}<p>{notice}</p>{/if}</div>
<footer>Shott Mail · Geen garantie · <a href="/LICENSE">AGPL-licentie</a> · <a href="https://github.com/aaronshott/shott-mail/tree/feat/mailclient-10-multiuser" target="_blank" rel="noreferrer noopener">Broncode</a> · Snooze en PWA-installatie volgen in v1.</footer>
