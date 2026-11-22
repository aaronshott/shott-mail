<script>
 import {onMount,tick} from 'svelte';
 import {boundedInteger,formattingTags,imageURL,maxReaderImages,tableWidth} from '../reader-policy.ts';
 import {imageFrameDocument} from '../image-frame.ts';

 let {body,text,t}=$props();
 let target=$state(),status=$state(),available=$state(false),usable=$state(true),consented=$state(false);
 const placeholders=[];

 onMount(()=>{
  // Parse in a detached, inert template. Rebuild; never insert its nodes or copy attributes wholesale.
  const template=document.createElement('template');
  template.innerHTML=body.markup;
  function copy(from,to){
   for(const node of from.childNodes){
    if(node.nodeType===Node.TEXT_NODE){to.append(document.createTextNode(node.data));continue;}
    if(node.nodeType!==Node.ELEMENT_NODE||node.namespaceURI!=='http://www.w3.org/1999/xhtml')continue;
    const tag=node.localName;
    if(tag==='mail-image'){
     const index=node.getAttribute('data-index'),reason=node.getAttribute('data-reason');
     const url=/^\d{1,2}$/.test(index??'')?imageURL(body.images[Number(index)]??'',location.hostname):null;
     const alt=node.textContent;
     const slot=document.createElement('span');slot.className='mail-image-placeholder';to.append(slot);
     let label;
     if(url&&placeholders.length<maxReaderImages){
      label=t('remoteImageBlocked');placeholders.push({slot,url,alt});
     }else{
      label=t(reason==='inline'?'inlineImageUnavailable':reason==='srcset'?'srcsetImageUnavailable':reason==='limit'||url?'imageLimitReached':'imageSourceUnavailable');
     }
     slot.textContent=alt?`${label} — ${alt}`:label;
    }else if(formattingTags.has(tag)){
     const el=document.createElement(tag);
     if(tag==='table'){
      const width=tableWidth(node.getAttribute('data-width'));
      if(width)el.setAttribute('width',width);
      if(node.getAttribute('data-align')==='center')el.classList.add('mail-table-centered');
      if(node.getAttribute('data-layout')==='presentation')el.setAttribute('role','presentation');
     }else if(tag==='td'||tag==='th'){
      for(const key of ['colspan','rowspan']){
       const span=boundedInteger(node.getAttribute(key),12);if(span)el.setAttribute(key,span);
      }
     }
     copy(node,el);to.append(el);
    }
   }
  }
  copy(template.content,target);
  available=placeholders.length>0;
  usable=!!target.textContent.trim();
 });

 async function allowImages(event){
  if(!event.isTrusted||consented||!available)return;
  consented=true;
  for(const {slot,url,alt} of placeholders){
   const frame=document.createElement('iframe');
   frame.setAttribute('sandbox','');
   frame.setAttribute('credentialless',''); // extra isolation where supported; not credentials:omit
   frame.referrerPolicy='no-referrer';
   frame.title=alt||t('remoteImage');
   // The sandbox is opaque: use native image alt fallback rather than treating frame load as image success.
   frame.srcdoc=imageFrameDocument(url,alt||t('remoteImageUnavailable'));
   slot.className='mail-image-frame';slot.replaceChildren(frame);
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
<div class="formatted-mail" bind:this={target} hidden={!usable}></div>
{#if usable&&text.trim()}<details class="mail-text-view"><summary>{t('textView')}</summary><pre>{text}</pre></details>
{:else if !usable}<p class="note">{t('htmlUnavailable')}</p>{#if text.trim()}<pre>{text}</pre>{/if}{/if}
