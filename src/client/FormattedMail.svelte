<script>
 import {onMount,tick} from 'svelte';
 import {boundedInteger,formattingTags,imageRejections,imageURL,maxReaderImages,tableWidth} from '../reader-policy.ts';
 import {applyPresentation,cellPadding} from '../reader-presentation.ts';
 import {imageFrameDocument} from '../image-frame.ts';
 import {protectReaderContrast} from './reader-contrast.ts';

 let {body,text,t,requestDocument,subject,messageActions}=$props();
 let target=$state(),status=$state(),available=$state(false),usable=$state(true),consented=$state(false);
 let fullPath=$state(''),pending=$state(false),fullError=$state(false),fullToggle=$state(),active=true;
 let fullDialog=$state(),fullFrame=$state(),backSafe=$state(),showInfo=$state(false);
 let unsupportedSources=$state(0),limited=$state(0),inline=$state(0),rendererRejected=$state(0);
 const reasons=imageRejections.filter(reason=>reason!=='cid'&&reason!=='limit');
 const count=reason=>{
  const value=body?.imageRejections?.[reason];
  return Number.isInteger(value)&&value>0&&value<=4000?value:0;
 };
 const sourceTotal=$derived(body?.imageRejections?reasons.reduce((sum,reason)=>sum+count(reason),0):unsupportedSources);
 const placeholders=[];

 onMount(()=>{
  // Parse in a detached, inert template. Rebuild; never insert its nodes or copy attributes wholesale.
  const template=document.createElement('template');
  template.innerHTML=body?.markup??'';
  let unsupported=0,overBudget=0,embedded=0,rejectedAtRender=0;
  function copy(from,to,inheritedPadding=null){
   for(const node of from.childNodes){
    if(node.nodeType===Node.TEXT_NODE){to.append(document.createTextNode(node.data));continue;}
    if(node.nodeType!==Node.ELEMENT_NODE||node.namespaceURI!=='http://www.w3.org/1999/xhtml')continue;
    const tag=node.localName;
    if(tag==='mail-image'){
     const index=node.getAttribute('data-index'),reason=node.getAttribute('data-reason');
     const url=/^\d{1,2}$/.test(index??'')?imageURL(body.images[Number(index)]??'',location.hostname):null;
     const alt=node.textContent;
     const canLoad=url&&placeholders.length<maxReaderImages;
     const atLimit=reason==='limit'||(url&&!canLoad);
     const isInline=!url&&reason==='inline';
     const generic=!url&&!isInline&&!atLimit;
     if(atLimit)overBudget++;
     if(isInline)embedded++;
     if(generic){
      if(index!==null)rejectedAtRender++;else unsupported++;
      if(!alt.trim())continue;
     }
     const slot=document.createElement('span');slot.className='mail-image-placeholder';to.append(slot);
     let label;
     if(canLoad){
      const width=boundedInteger(node.getAttribute('data-image-width'),1200);
      const height=boundedInteger(node.getAttribute('data-image-height'),800);
      label=t('remoteImageBlocked');placeholders.push({slot,url,alt,width,height});
     }else if(!generic)label=t(isInline?'inlineImageUnavailable':'imageLimitReached');
     slot.textContent=label?(alt?`${label} — ${alt}`:label):alt;
    }else if(formattingTags.has(tag)){
     const el=document.createElement(tag);
     let padding=inheritedPadding;
     if(tag==='table'){
      const width=tableWidth(node.getAttribute('data-width'));
      if(width)el.setAttribute('width',width);
      if(node.getAttribute('data-align')==='center')el.classList.add('mail-table-centered');
      if(node.getAttribute('data-layout')==='presentation')el.setAttribute('role','presentation');
      padding=cellPadding(node.getAttribute('data-cell-padding'));
     }else if(tag==='td'||tag==='th'){
      if(padding)el.style.padding=padding;
      for(const key of ['colspan','rowspan']){
       const span=boundedInteger(node.getAttribute(key),12);if(span)el.setAttribute(key,span);
      }
     }
     applyPresentation(node,el);
     copy(node,el,padding);
     if(tag==='table'&&el.getAttribute('role')==='presentation'&&el.rows.length===1){
      const row=el.rows[0],cells=[...row.cells];
      if(cells.length>=2&&cells.length<=3&&cells.every(c=>c.localName==='td'&&c.colSpan===1&&c.rowSpan===1))el.classList.add('mail-stack-columns');
     }
     to.append(el);
    }
   }
  }
  copy(template.content,target);
  available=placeholders.length>0;
  unsupportedSources=unsupported;
  limited=overBudget;
  inline=embedded;
  rendererRejected=rejectedAtRender;
  usable=!!target.textContent.trim();
  const cleanup=protectReaderContrast(target);
  return ()=>{active=false;cleanup();};
 });

 async function allowAll(event){
  if(!event.isTrusted||pending||fullPath||!requestDocument)return;
  pending=true;fullError=false;
  try{
   const {path}=await requestDocument();
   if(!active)return;
   if(!/^\/api\/reader\/document\?view=[a-zA-Z0-9_-]{32}$/.test(path))throw Error('Invalid view');
   fullPath=path;
   await tick();
   if(!active)return;
   fullDialog.showModal();
   backSafe.focus();
  }catch{if(active){fullPath='';fullError=true;}}
  finally{if(active)pending=false;}
 }

 async function resetFull(){
  fullDialog.close();fullPath='';showInfo=false;
  await tick();fullToggle?.focus();
 }

 async function focusFullDocument(){
  showInfo=false;
  await tick();fullFrame?.focus({preventScroll:true});
 }

 async function allowImages(event){
  if(!event.isTrusted||consented||!available)return;
  consented=true;
  // Only compact an image-only cell in an explicit, single-row layout
  // table that shares the row with live text. Classify before replacing
  // placeholders, so their labels cannot count as live text.
  const short=new Set(placeholders.filter(({slot,width,height})=>{
   if(!width||height||Number(width)>160)return false;
   const cell=slot.parentElement,row=cell?.parentElement,table=row?.parentElement?.parentElement;
   return cell?.localName==='td'&&row?.localName==='tr'&&table?.matches('table[role=presentation]')&&
    table.rows.length===1&&cell.children.length===1&&
    ![...cell.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim())&&
    [...row.cells].every(c=>c.localName==='td'&&c.colSpan===1&&c.rowSpan===1)&&
    [...row.cells].some(c=>c!==cell&&c.textContent.trim()&&!c.querySelector('table,.mail-image-placeholder'));
  }).map(({slot})=>slot));
  for(const {slot,url,alt,width,height} of placeholders){
   const frame=document.createElement('iframe');
   frame.setAttribute('sandbox','');
   frame.setAttribute('credentialless',''); // extra isolation where supported; not credentials:omit
   frame.referrerPolicy='no-referrer';
   frame.title=alt||t('remoteImage');
   // The sandbox is opaque: use native image alt fallback rather than treating frame load as image success.
   frame.srcdoc=imageFrameDocument(url,alt||t('remoteImageUnavailable'));
   slot.className='mail-image-frame';slot.replaceChildren(frame);
   if(width){
    if(height)slot.style.maxWidth=`min(100%, ${width}px)`;
    else slot.style.width=`${width}px`;
    if(getComputedStyle(slot).textAlign==='center')slot.classList.add('mail-image-centered');
    if(!height)slot.classList.add(short.has(slot)?'mail-image-short':'mail-image-width-only');
   }
   if(width&&height){
    slot.classList.add('mail-image-sized');
    slot.style.aspectRatio=`${width} / ${height}`;
    if(Number(width)<=160)slot.classList.add('mail-image-compact');
   }
  }
  await tick();
  if(status?.isConnected)status.focus({preventScroll:true});
 }
</script>

{#if requestDocument}
 <div class="full-reader-controls">
  <button type="button" bind:this={fullToggle} aria-describedby="full-reader-privacy" disabled={pending} onclick={allowAll}>{t('loadAll')}</button>
  <p id="full-reader-privacy" class="note">{t('fullReaderPrivacy')}</p>
  {#if fullError}<p role="status">{t('fullReaderFailed')}</p>{/if}
 </div>
{/if}
{#if fullPath}
 <dialog class="full-reader-dialog" bind:this={fullDialog} aria-label={subject}
  oncancel={event=>{event.preventDefault();resetFull();}}>
  <div class="full-reader-toolbar">
   <button type="button" bind:this={backSafe} onclick={resetFull}>{t('backSafeReader')}</button>
   <button type="button" aria-expanded={showInfo} aria-controls="full-reader-info" onclick={()=>showInfo=!showInfo}>{t('fullReaderInfo')}</button>
   <button type="button" onclick={focusFullDocument}>{t('fullReaderRead')}</button>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users must be able to enter the scrollable document) -->
  <iframe class="full-mail-document" title={t('fullReaderTitle')} sandbox="" referrerpolicy="no-referrer" src={fullPath} bind:this={fullFrame} tabindex="0" inert={showInfo}></iframe>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (the scrollable options pane needs keyboard access) -->
  <div id="full-reader-info" class="full-reader-info" hidden={!showInfo} tabindex="0" role="region" aria-label={t('fullReaderInfo')}>
   <h2>{subject}</h2>
   <p>{t('fullReaderRequested')}</p>
   {@render messageActions()}
   {#if text.trim()}<details class="mail-text-view"><summary>{t('textView')}</summary><pre>{text}</pre></details>{/if}
  </div>
 </dialog>
{/if}
<div>
{#if available}
 <div class="image-controls">
  {#if !consented}
   <button class="primary" type="button" aria-describedby="image-privacy" onclick={allowImages}>{t('loadImages')}</button>
   <p id="image-privacy" class="note">{t('imagePrivacy')}</p>
  {/if}
  <p role="status" tabindex="-1" bind:this={status}>{consented?t('imagesRequested'):''}</p>
 </div>
{/if}
{#if sourceTotal||count('limit')||limited||count('cid')||inline||rendererRejected||consented}
 <details class="note image-source-summary">
  <summary>{t('imageDetails')}</summary>
  <ul>
   {#if sourceTotal}<li>{t(sourceTotal===1?'imageSourceUnavailable':'imageSourcesUnavailable',{count:sourceTotal})}</li>{/if}
   {#each reasons as reason}
    {#if count(reason)}<li>{t(`imageReason.${reason}`,{count:count(reason)})}</li>{/if}
   {/each}
   {#if count('limit')||limited}<li>{t('imageLimitCount',{count:count('limit')||limited})}</li>{/if}
   {#if count('cid')||inline}<li>{t('inlineImageCount',{count:count('cid')||inline})}</li>{/if}
   {#if rendererRejected}<li>{t('imageRendererCount',{count:rendererRejected})}</li>{/if}
   {#if consented}<li>{t('imageLoadFailureNote')}</li>{/if}
  </ul>
 </details>
{/if}
<div class="formatted-mail" bind:this={target} hidden={!usable}></div>
</div>
{#if usable||sourceTotal||rendererRejected}
 {#if text.trim()}<details class="mail-text-view"><summary>{t('textView')}</summary><pre>{text}</pre></details>{/if}
{:else}<p class="note">{t('htmlUnavailable')}</p>{#if text.trim()}<pre>{text}</pre>{/if}{/if}

<style>
 /* The shell is inert in the modal; clipping its layout also removes the
    root scroll range. The document needs neither a height read nor a bridge. */
 :global(#app:has(.full-reader-dialog[open])){block-size:100dvh;overflow:clip}
 .full-reader-dialog[open]{position:fixed;inset:0;display:grid;grid-template-rows:auto minmax(0,1fr);
  inline-size:100%;block-size:100dvh;max-inline-size:none;max-block-size:none;
  margin:0;padding:0;border:0;overflow:clip;background:var(--surface);color:var(--ink)}
 .full-reader-toolbar{display:flex;flex-wrap:wrap;gap:4px 8px;padding:6px 8px}
 .full-reader-toolbar button{max-inline-size:100%;overflow-wrap:anywhere}
 .full-mail-document,.full-reader-info{grid-area:2/1;min-inline-size:0;min-block-size:0}
 .full-mail-document{display:block;inline-size:100%;block-size:100%;border:0;background:transparent;color-scheme:light}
 .full-mail-document[inert]{visibility:hidden}
 .full-mail-document:focus-visible{outline-offset:-3px}
 .full-reader-info{overflow:auto;overflow-wrap:anywhere;padding:8px 16px}
</style>
