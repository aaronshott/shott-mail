<script>
 import {onMount,tick} from 'svelte';
 import {boundedInteger,safeFormattingTags,imageRejections,imageURL,maxReaderImages,tableHeaderScope,tableWidth} from '../reader-policy.ts';
 import {applyPresentation,cellPadding} from '../reader-presentation.ts';
 import {imageFrameDocument,unavailableImagePath} from '../image-frame.ts';
 import {protectReaderContrast} from './reader-contrast.ts';

 let {body,text,t,requestDocument,subject,messageActions}=$props();
 let target=$state(),status=$state(),available=$state(false),usable=$state(true),consented=$state(false);
 let fullPath=$state(''),pending=$state(false),fullError=$state(false),fullToggle=$state(),active=true;
 let fullFrame=$state(),backSafe=$state(),showInfo=$state(false);
 let descriptions=$state([]),descriptionsOpen=$state(false),descriptionsTrigger=$state(),descriptionsDialog=$state(),descriptionsClose=$state();
 const blockedDescriptions=$derived(descriptions.filter(({loadable})=>!consented||!loadable));
 let unsupportedSources=$state(0),limited=$state(0),inline=$state(0),rendererRejected=$state(0);
 const reasons=imageRejections.filter(reason=>reason!=='cid'&&reason!=='limit');
 const count=reason=>{
  const value=body?.imageRejections?.[reason];
  return Number.isInteger(value)&&value>0&&value<=4000?value:0;
 };
 const sourceTotal=$derived(body?.imageRejections?reasons.reduce((sum,reason)=>sum+count(reason),0):unsupportedSources);
 const placeholders=[];
 const smallImageHints=new WeakSet();
 function blockedImageIcon(){
  const svgNS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox','0 0 20 20');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  // Fixed app geometry, not sender SVG. Gaps keep the slash distinct.
  const shape=document.createElementNS(svgNS,'path');
  shape.setAttribute('d',unavailableImagePath);
  shape.setAttribute('fill','none');
  shape.setAttribute('stroke','currentColor');
  shape.setAttribute('stroke-width','1.8');
  shape.setAttribute('stroke-linecap','round');
  shape.setAttribute('stroke-linejoin','round');
  svg.append(shape);
  return svg;
 }
 const hasText=el=>[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
 const onlyChild=(el,test)=>!hasText(el)&&el.children.length===1&&test(el.firstElementChild);
 function onlyImage(el){
  while(el.localName==='td'||el.localName==='span'){
   if(hasText(el)||el.children.length!==1)return null;
   el=el.firstElementChild;
   if(el.classList.contains('mail-image-placeholder'))return el;
  }
  return null;
 }
 const hasLiveCellText=cell=>cell.textContent.trim()&&!cell.querySelector('table,.mail-image-placeholder');
 function styleTable(table,layout){
  const rows=[...table.rows];
  const simple=rows.length&&!table.caption&&!table.tHead&&!table.tFoot&&rows.every(row=>
   row.cells.length&&[...row.cells].every(c=>c.localName==='td'&&c.colSpan===1&&c.rowSpan===1));
  const cells=rows.length===1?[...rows[0].cells]:[];
  const leadingIcon=simple&&cells.length>=2&&smallImageHints.has(onlyImage(cells[0]))&&
   cells.slice(1).some(hasLiveCellText);
  // border=0 alone is not evidence of layout. Only style structural wrappers
  // and icon/label rows; do not change the accessibility role of inferred tables.
  if(layout==='borderless-candidate'&&simple&&(leadingIcon||rows.every(row=>
   row.cells.length===1&&onlyChild(row.cells[0],el=>el.localName==='table'))))table.classList.add('mail-layout-table');
  if(layout==='presentation'&&!leadingIcon&&cells.length>=2&&cells.length<=3&&
   cells.every(c=>c.localName==='td'&&c.colSpan===1&&c.rowSpan===1))table.classList.add('mail-stack-columns');
  for(const row of rows){
   const rowCells=[...row.cells];
   if(!rowCells.some(hasLiveCellText))continue;
   for(const cell of rowCells){
    const slot=cell.rowSpan===1&&onlyImage(cell);
    if(!slot)continue;
    // A marker beside live text must not drive the shared row size.
    cell.classList.add('mail-image-cell');
    slot.classList.add('mail-image-in-row');
   }
  }
 }

 onMount(()=>{
  // Parse in a detached, inert template. Rebuild; never insert its nodes or copy attributes wholesale.
  const template=document.createElement('template');
  template.innerHTML=body?.markup??'';
  let unsupported=0,overBudget=0,embedded=0,rejectedAtRender=0;
  const alternatives=[];
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
     }
     const width=boundedInteger(node.getAttribute('data-image-width'),1200);
     const height=boundedInteger(node.getAttribute('data-image-height'),800);
     const slot=document.createElement('span');slot.className='mail-image-placeholder';to.append(slot);
     let label;
     if(canLoad){
      label=t('remoteImageBlocked');placeholders.push({slot,url,alt,width,height});
     }else if(!generic)label=t(isInline?'inlineImageUnavailable':'imageLimitReached');
     const name=label?(alt?`${label} — ${alt}`:label):(alt.trim()||t('imageUnavailable'));
     // The name and ordered description survive independently of the icon.
     if(alt.trim())alternatives.push({name,loadable:!!canLoad});
     if(width&&Number(width)<=32&&(!height||Number(height)<=32))smallImageHints.add(slot);
     slot.setAttribute('role','img');slot.setAttribute('aria-label',name);
     slot.append(blockedImageIcon());
    }else if(safeFormattingTags.has(tag)){
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
      const scope=tag==='th'&&tableHeaderScope(node.getAttribute('scope'));if(scope)el.setAttribute('scope',scope);
     }else if(tag==='col'||tag==='colgroup'){
      const span=boundedInteger(node.getAttribute('span'),12);if(span)el.setAttribute('span',span);
     }
     applyPresentation(node,el);
     copy(node,el,padding);
     if(tag==='table')styleTable(el,node.getAttribute('data-layout'));
     to.append(el);
    }
   }
  }
  copy(template.content,target);
  descriptions=alternatives;
  available=placeholders.length>0;
  unsupportedSources=unsupported;
  limited=overBudget;
  inline=embedded;
  rendererRejected=rejectedAtRender;
  usable=!!target.textContent.trim()||!!target.querySelector('.mail-image-placeholder');
  const cleanup=protectReaderContrast(target);
  return ()=>{active=false;cleanup();};
 });

 async function showDescriptions(){
  if(descriptionsOpen||!blockedDescriptions.length)return;
  descriptionsOpen=true;
  await tick();
  if(!active)return;
  descriptionsDialog.showModal();
  descriptionsClose.focus();
 }

 function closeDescriptions(){
  descriptionsDialog.close();
  descriptionsOpen=false;
  descriptionsTrigger?.focus({preventScroll:true});
 }

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
   backSafe.focus();
  }catch{if(active){fullPath='';fullError=true;}}
  finally{if(active)pending=false;}
 }

 async function resetFull(){
  fullPath='';showInfo=false;
  await tick();fullToggle?.focus();
 }

 function fullKeys(event){
  if(event.key!=='Escape'||event.defaultPrevented)return;
  event.preventDefault();
  event.stopPropagation();
  resetFull();
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
   // The sandbox stays opaque; fallback paint and alt live inside the frame.
   frame.srcdoc=imageFrameDocument(url,alt||t('remoteImageUnavailable'));
   if(slot.classList.contains('mail-image-in-row'))slot.closest('td').classList.remove('mail-image-cell');
   for(const attr of ['role','aria-label'])slot.removeAttribute(attr);
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

{#if fullPath}
<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Escape from a focused child returns to safe view) -->
<section class="full-reader" aria-label={subject} onkeydown={fullKeys}>
  <div class="full-reader-toolbar">
   <button type="button" bind:this={backSafe} onclick={resetFull} aria-label={t('backSafeReader')} title={t('backSafeReader')}><span>{t('backSafeReader')}</span><span class="compact-label" aria-hidden="true">{t('backSafeReaderShort')}</span></button>
   <button type="button" aria-expanded={showInfo} aria-controls="full-reader-info" onclick={()=>showInfo=!showInfo} aria-label={t('fullReaderInfo')} title={t('fullReaderInfo')}><span>{t('fullReaderInfo')}</span><span class="compact-label" aria-hidden="true">{t('fullReaderInfoShort')}</span></button>
   <button type="button" onclick={focusFullDocument} aria-label={t('fullReaderRead')} aria-describedby="full-reader-keyboard" title={t('fullReaderKeyboardExit')}><span>{t('fullReaderRead')}</span><span class="compact-label" aria-hidden="true">{t('fullReaderReadShort')}</span></button>
   <span id="full-reader-keyboard" hidden>{t('fullReaderKeyboardExit')}</span>
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
 </section>
{/if}
<div class="safe-reader" hidden={!!fullPath}>
{#if requestDocument}
 <div class="full-reader-controls">
  <button type="button" bind:this={fullToggle} aria-describedby="full-reader-privacy" disabled={pending} onclick={allowAll}>{t('loadAll')}</button>
  <p id="full-reader-privacy" class="note">{t('fullReaderPrivacy')}</p>
  {#if fullError}<p role="status">{t('fullReaderFailed')}</p>{/if}
 </div>
{/if}
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
{#if blockedDescriptions.length}
 <button class="image-descriptions-trigger" type="button" aria-haspopup="dialog" bind:this={descriptionsTrigger} onclick={showDescriptions}>{t('showImageDescriptions')}</button>
{/if}
{#if descriptionsOpen}
 <dialog class="image-descriptions-dialog" bind:this={descriptionsDialog} aria-labelledby="image-descriptions-title"
  oncancel={event=>{event.preventDefault();closeDescriptions();}}>
  <h2 id="image-descriptions-title">{t('blockedImageDescriptions')}</h2>
  <button type="button" bind:this={descriptionsClose} onclick={closeDescriptions}>{t('closeImageDescriptions')}</button>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (the description list needs keyboard scrolling) -->
  <div tabindex="0" role="region" aria-label={t('imageDescriptionList')}>
   <ol>
    {#each blockedDescriptions as {name}}<li><bdi>{name}</bdi></li>{/each}
   </ol>
  </div>
  <button class="image-descriptions-end" type="button" onclick={closeDescriptions}>{t('closeImageDescriptions')}</button>
 </dialog>
{/if}
<div class="formatted-mail" bind:this={target} hidden={!usable}></div>
{#if usable||sourceTotal||rendererRejected}
 {#if text.trim()}<details class="mail-text-view"><summary>{t('textView')}</summary><pre>{text}</pre></details>{/if}
{:else}<p class="note">{t('htmlUnavailable')}</p>{#if text.trim()}<pre>{text}</pre>{/if}{/if}
</div>

<style>
 .image-descriptions-trigger{margin-block:.5rem;min-block-size:44px;max-inline-size:100%;overflow-wrap:anywhere}
 .image-descriptions-dialog[open]{display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:.5rem;
  box-sizing:border-box;inline-size:min(38rem,calc(100% - 1rem));max-inline-size:100%;max-block-size:calc(100dvh - 1rem);
  padding:.75rem;border:1px solid var(--line);border-radius:.4em;background:var(--surface);color:var(--ink);overflow-wrap:anywhere;overscroll-behavior:contain}
 .image-descriptions-dialog h2{margin:0;font-size:1.125rem}
 .image-descriptions-dialog button{justify-self:start;min-block-size:44px}
 .image-descriptions-dialog [role=region]{min-block-size:0;overflow:auto;overscroll-behavior:contain}
 .image-descriptions-dialog [role=region]:focus-visible{outline-offset:-2px}
 .image-descriptions-dialog ol{margin:0;padding:.25rem .5rem .25rem 2rem;padding-inline:2rem .5rem}
 .image-descriptions-dialog li+li{margin-block-start:.5rem}
 .image-descriptions-end{display:none}
 /* When the title and Close would crowd out the list, scroll them with it.
    Keep the initial Close and provide the same action after the last item. */
 @media (max-height:280px){
  :global(html:has(.image-descriptions-dialog:modal)){overflow:hidden;scrollbar-gutter:stable}
  .image-descriptions-dialog[open]{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(min-content,1fr) auto;align-content:start;align-items:start;overflow:auto;padding:.5rem}
  .image-descriptions-dialog h2{line-height:1.2}
  .image-descriptions-dialog [role=region]{grid-column:1/-1;overflow:visible}
  .image-descriptions-end{display:block;grid-column:1/-1}
 }
 /* The pane supplies a bounded track. Only the opaque document (or the
    options panel in its place) scrolls; no document-size bridge is needed. */
 .full-reader{display:grid;grid-template-rows:auto minmax(0,1fr);inline-size:100%;block-size:100%;min-block-size:0;
  overflow:clip;background:var(--surface);color:var(--ink)}
 .full-reader-toolbar{display:flex;flex-wrap:wrap;gap:4px 8px;padding:6px 8px}
 .full-reader-toolbar button{max-inline-size:100%;overflow-wrap:anywhere}
 .full-reader-toolbar .compact-label{display:none}
 /* Keep space for the document at high zoom or in a short window, without
    reducing the type size or creating a second scrolling area. */
 @media (max-width:400px), (max-height:380px){
  .full-reader-toolbar{gap:2px;padding:3px}
  .full-reader-toolbar button{min-inline-size:44px;padding:0 2px}
  .full-reader-toolbar button:focus-visible{outline-offset:-4px}
  .full-reader-toolbar button span{display:none}
  .full-reader-toolbar .compact-label{display:inline}
 }
 @media (max-width:170px) and (max-height:210px){
  .full-reader-toolbar{padding-block:2px}
  .full-reader-toolbar button{min-inline-size:40px;min-block-size:28px}
 }
 .full-mail-document,.full-reader-info{grid-area:2/1;min-inline-size:0;min-block-size:0}
 .full-mail-document{display:block;inline-size:100%;block-size:100%;border:0;background:transparent;color-scheme:light}
 .full-mail-document[inert]{visibility:hidden}
 .full-mail-document:focus-visible{outline-offset:-3px}
 .full-reader-info{overflow:auto;overscroll-behavior:contain;overflow-wrap:anywhere;padding:8px 16px}
</style>
