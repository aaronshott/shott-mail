<script>
 import {onDestroy} from 'svelte';
 import {DEFAULT_SENT_POLICY} from '../sent-policy.ts';
 export let account;
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
 <h2>Kopie in Verzonden</h2>
 <label>Wie bewaart de kopie?
  <select bind:value={policy} disabled={busy}>
   <option value="client">Shott Mail (standaard)</option>
   <option value="provider">Provider (Shott Mail voegt niets toe)</option>
  </select>
 </label>
 <p>Zonder opgeslagen keuze probeert Shott Mail na bevestigde SMTP-acceptatie een kopie via IMAP op te slaan. Slaat je provider zelf automatisch een kopie op? Kies dan Provider om dubbele kopieën te voorkomen. De kopie van je provider kan vertraagd zijn.</p>
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
