<script>
 import {onMount,tick} from 'svelte';
 import {boundedInteger,formattingTags,imageURL,maxReaderImages,tableWidth} from '../reader-policy.ts';
 import {applyPresentation,cellPadding} from '../reader-presentation.ts';
 import {imageFrameDocument} from '../image-frame.ts';
 import {protectReaderContrast} from './reader-contrast.ts';

 let {body,text,t}=$props();
 let target=$state(),status=$state(),available=$state(false),usable=$state(true),consented=$state(false);
 let unsupportedSources=$state(0),limited=$state(0),inline=$state(0);
 const placeholders=[];

 onMount(()=>{
  // Parse in a detached, inert template. Rebuild; never insert its nodes or copy attributes wholesale.
  const template=document.createElement('template');
  template.innerHTML=body.markup;
  let unsupported=0,overBudget=0,embedded=0;
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
      unsupported++;
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
  usable=!!target.textContent.trim();
  return protectReaderContrast(target);
 });

 async function allowImages(event){
  if(!event.isTrusted||consented||!available)return;
  consented=true;
  for(const {slot,url,alt,width,height} of placeholders){
   const frame=document.createElement('iframe');
   frame.setAttribute('sandbox','');
   frame.setAttribute('credentialless',''); // extra isolation where supported; not credentials:omit
   frame.referrerPolicy='no-referrer';
   frame.title=alt||t('remoteImage');
   // The sandbox is opaque: use native image alt fallback rather than treating frame load as image success.
   frame.srcdoc=imageFrameDocument(url,alt||t('remoteImageUnavailable'));
   slot.className='mail-image-frame';slot.replaceChildren(frame);
   if(width&&height){
    slot.style.maxWidth=`${width}px`;
    slot.classList.add('mail-image-sized');
    slot.style.aspectRatio=`${width} / ${height}`;
    if(Number(width)<=160)slot.classList.add('mail-image-compact');
   }
  }
  await tick();
  if(status?.isConnected)status.focus({preventScroll:true});
 }
</script>

{#if available}
 <div class="image-controls">
  {#if !consented}
   <button class="primary" type="button" aria-describedby="image-privacy" onclick={allowImages}>{t('loadImages')}</button>
   <p id="image-privacy" class="note">{t('imagePrivacy')}</p>
  {/if}
  <p role="status" tabindex="-1" bind:this={status}>{consented?t('imagesRequested'):''}</p>
 </div>
{/if}
{#if unsupportedSources||limited||inline}
 <details class="note image-source-summary">
  <summary>{t('imageDetails')}</summary>
  <ul>
   {#if unsupportedSources}<li>{t(unsupportedSources===1?'imageSourceUnavailable':'imageSourcesUnavailable',{count:unsupportedSources})}</li>{/if}
   {#if limited}<li>{t('imageLimitCount',{count:limited})}</li>{/if}
   {#if inline}<li>{t('inlineImageCount',{count:inline})}</li>{/if}
  </ul>
 </details>
{/if}
<div class="formatted-mail" bind:this={target} hidden={!usable}></div>
{#if usable||unsupportedSources}
 {#if text.trim()}<details class="mail-text-view"><summary>{t('textView')}</summary><pre>{text}</pre></details>{/if}
{:else}<p class="note">{t('htmlUnavailable')}</p>{#if text.trim()}<pre>{text}</pre>{/if}{/if}
