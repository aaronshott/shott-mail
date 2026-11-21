<script>
 import {onDestroy} from 'svelte';
 import {DEFAULT_SENT_POLICY} from '../sent-policy.ts';
 export let account;
 export let t;
 export let api;
 export let action;
 export let busy;
 export let onSave;
 let folders=[],policy=DEFAULT_SENT_POLICY,selection='';
 let savedPolicy,savedSelection;
 $: reset(account.sent?.policy??DEFAULT_SENT_POLICY,account.sent?.folder??'');
 function reset(nextPolicy,nextSelection){
  if(nextPolicy===savedPolicy&&nextSelection===savedSelection)return;
  savedPolicy=nextPolicy;savedSelection=nextSelection;
  folders=[];policy=nextPolicy;selection=nextSelection;
 }
 let mounted=true;
 onDestroy(()=>mounted=false);
 async function load(){await action(async()=>{
  try{const loaded=await api(`/api/accounts/${account.id}/folders`);if(mounted)folders=loaded;}
  catch(e){if(mounted)throw e;}
 });}
 function save(){return onSave(account.id,{policy,...(selection?{folder:selection}:{})});}
</script>
<section class="sent-settings">
 <h2>{t('sentCopy')}</h2>
 <label>{t('sentWho')}
  <select bind:value={policy} disabled={busy}>
   <option value="client">{t('sentClient')}</option>
   <option value="provider">{t('sentProvider')}</option>
  </select>
 </label>
 <p>{t('sentDefault')}</p>
 <button type="button" onclick={load} disabled={busy}>{t('loadSent')}</button>
 <label>{t('sentFolder')}
  <select bind:value={selection} disabled={busy}>
   <option value="">{t('automaticSent')}</option>
   {#if selection&&!folders.some(f=>f.id===selection&&f.selectable)}<option value={selection}>{t('previouslySelected')}</option>{/if}
   {#each folders.filter(f=>f.selectable) as folder (folder.id)}<option value={folder.id}>{folder.path}{folder.sent?' (\u005cSent)':''}</option>{/each}
  </select>
 </label>
 <p>{t('sentOverride')}</p>
 <button type="button" onclick={save} disabled={busy}>{t('saveSent')}</button>
</section>
