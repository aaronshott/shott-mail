<script>
 import {onDestroy} from 'svelte';
 export let account;
 export let api;
 export let action;
 export let busy;
 export let onSave;
 let folders=[],policy='provider',selection='';
 let savedPolicy,savedSelection;
 $: reset(account.sent?.policy??'provider',account.sent?.folder??'');
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
 <h2>Kopie in Verzonden</h2>
 <label>Wie bewaart de kopie?
  <select bind:value={policy} disabled={busy}>
   <option value="provider">Provider (standaard; Shott Mail voegt niets toe)</option>
   <option value="client">Shott Mail (alleen als de provider zelf niet opslaat)</option>
  </select>
 </label>
 <p>Weet je het niet? Laat dit op Provider staan. Een kopie kan vertraagd zijn. Kies Shott Mail alleen als je weet dat de provider geen kopie maakt; anders kunnen dubbele kopieën ontstaan.</p>
 <button type="button" onclick={load} disabled={busy}>Verzonden-mappen laden</button>
 <label>Verzonden-map
  <select bind:value={selection} disabled={busy}>
   <option value="">Automatisch: één door IMAP gemarkeerde \Sent-map</option>
   {#if selection&&!folders.some(f=>f.id===selection&&f.selectable)}<option value={selection}>Eerder gekozen map (laad de mappenlijst)</option>{/if}
   {#each folders.filter(f=>f.selectable) as folder (folder.id)}<option value={folder.id}>{folder.path}{folder.sent?' (\u005cSent)':''}</option>{/each}
  </select>
 </label>
 <p>Kies een map als IMAP geen of meerdere Verzonden-mappen meldt. Wijzigingen gelden alleen voor toekomstige verzendingen.</p>
 <button type="button" onclick={save} disabled={busy}>Verzonden-instellingen opslaan</button>
</section>
