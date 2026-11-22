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

{#snippet chevron()}
 <svg class="folder-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="m6 3.5 4.5 4.5L6 12.5"/>
 </svg>
{/snippet}

{#snippet folderIcon()}
 <svg class="folder-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M1.75 4a1.25 1.25 0 0 1 1.25-1.25h3l1.5 1.5H13a1.25 1.25 0 0 1 1.25 1.25V12A1.25 1.25 0 0 1 13 13.25H3A1.25 1.25 0 0 1 1.75 12Z"/>
 </svg>
{/snippet}

{#snippet branches(nodes,depth)}
 <ul class="folder-list">
  {#each nodes as node (node.key)}
   <li>
    <div class="folder-row" style:--folder-depth={Math.min(depth,4)}>
     {#if node.children.length}
      <button class="folder-toggle" type="button" aria-label={t('toggleFolder',{path:node.path})}
       aria-expanded={!!expanded[node.key]} onclick={()=>expanded[node.key]=!expanded[node.key]}>
       {@render chevron()}
      </button>
     {/if}
     {#if node.folder?.selectable}
      <button class="folder-select" type="button" disabled={busy} title={node.path}
       aria-current={active===node.folder.id?'page':undefined} onclick={()=>onPick({...node.folder,account:account.id})}>
       {@render folderIcon()}
       <span class="folder-text"><bdi>{node.label}</bdi>{#if !node.folder.subscribed}<small>{t('unsubscribed')}</small>{/if}</span>
      </button>
     {:else}
      <span class="folder-label" title={node.path}>
       {@render folderIcon()}
       <span class="folder-text"><bdi>{node.label}</bdi><small>{t('folderGroup')}</small></span>
      </span>
     {/if}
    </div>
    {#if node.children.length&&expanded[node.key]}{@render branches(node.children,depth+1)}{/if}
   </li>
  {/each}
 </ul>
{/snippet}

<details class="account-folders" ontoggle={open}>
 <summary class="folder-account" aria-label={t('accountFolders',{account:account.label})}>
  <span class="account-chevron">{@render chevron()}</span>
  <span class="folder-text"><bdi>{account.label}</bdi><small><bdi>{account.address}</bdi></small></span>
 </summary>
 <button type="button" onclick={load} disabled={loading}>{t('reloadFolders')}</button>
 {#if loading}<p role="status">{t('loadingFolders')}</p>{/if}
 {#if error}<p role="alert" class="error">{t(error.key??'REQUEST_FAILED',error.params)}</p>{/if}
 {#if tree?.length}{@render branches(tree,0)}{:else if tree&&!loading}<p>{t('noFolders')}</p>{/if}
</details>