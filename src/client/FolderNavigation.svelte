<script>
 import {onDestroy} from 'svelte';
 import {buildFolderTree} from './navigation.js';
 let {account,api,t,onPick,busy,active}=$props();
 let tree=$state(null),loading=$state(false),error=$state(null),expanded=$state({});
 let alive=true;
 onDestroy(()=>alive=false);
 async function load(){
  if(loading)return;
  loading=true;error=null;
  try{
   const result=await api(`/api/accounts/${account.id}/folders`);
   if(alive)tree=buildFolderTree(result);
  }catch(e){if(alive)error=e;}
  finally{if(alive)loading=false;}
 }
 function open(event){if(event.currentTarget.open&&tree===null&&!error)load();}
</script>

{#snippet branches(nodes,depth)}
 <ul class="folder-list" class:indent={depth>0&&depth<=4}>
  {#each nodes as node (node.key)}
   <li>
    <div class="folder-row">
     {#if node.children.length}
      <button class="folder-toggle" type="button" aria-label={t('toggleFolder',{path:node.path})}
       aria-expanded={!!expanded[node.key]} onclick={()=>expanded[node.key]=!expanded[node.key]}>
       <span aria-hidden="true">{expanded[node.key]?'▾':'▸'}</span>
      </button>
     {/if}
     {#if node.folder?.selectable}
      <button class="folder-select" type="button" disabled={busy} title={node.path}
       aria-current={active===node.folder.id?'page':undefined} onclick={()=>onPick({...node.folder,account:account.id})}>
       <bdi>{node.label}</bdi>{#if !node.folder.subscribed}<small>{t('unsubscribed')}</small>{/if}
      </button>
     {:else}
      <span class="folder-label" title={node.path}><bdi>{node.label}</bdi><small>{t('folderGroup')}</small></span>
     {/if}
    </div>
    {#if node.children.length&&expanded[node.key]}{@render branches(node.children,depth+1)}{/if}
   </li>
  {/each}
 </ul>
{/snippet}

<details class="account-folders" ontoggle={open}>
 <summary aria-label={t('accountFolders',{account:account.label})}><bdi>{account.label}</bdi><small><bdi>{account.address}</bdi></small></summary>
 <button type="button" onclick={load} disabled={loading}>{t('reloadFolders')}</button>
 {#if loading}<p role="status">{t('loadingFolders')}</p>{/if}
 {#if error}<p role="alert" class="error">{t(error.key??'REQUEST_FAILED',error.params)}</p>{/if}
 {#if tree?.length}{@render branches(tree,0)}{:else if tree&&!loading}<p>{t('noFolders')}</p>{/if}
</details>