<script>
 import {onMount,tick} from 'svelte';
 import {formattingTags,imageURL} from '../reader-policy.ts';
 import {imageFrameDocument} from '../image-frame.ts';

 let {body,text,t}=$props();
 let target=$state(),status=$state(),available=$state(false),usable=$state(true),consented=$state(false);
 const placeholders=[];

 onMount(()=>{
  // The server sanitizer emits only inert formatting and generated image indices.
  // Parse in a detached, inert template. Rebuild, never insert its nodes or attributes.
  const template=document.createElement('template');
  template.innerHTML=body.markup;
  function copy(from,to){
   for(const node of from.childNodes){
    if(node.nodeType===Node.TEXT_NODE){to.append(document.createTextNode(node.data));continue;}
    if(node.nodeType!==Node.ELEMENT_NODE||node.namespaceURI!=='http://www.w3.org/1999/xhtml')continue;
    if(node.localName==='mail-image'){
     const index=node.getAttribute('data-index');
     const url=/^\d{1,2}$/.test(index??'')?imageURL(body.images[Number(index)]??'',location.hostname):null;
     const alt=node.textContent;
     if(!url||placeholders.length>=16){to.append(document.createTextNode(alt));continue;}
     const slot=document.createElement('span');slot.textContent=alt;to.append(slot);
     placeholders.push({slot,url,alt});
    }else if(formattingTags.has(node.localName)){
     const el=document.createElement(node.localName);copy(node,el);to.append(el);
    }
   }
  }
  copy(template.content,target);
  available=placeholders.length>0;
  usable=available||!!target.textContent.trim();
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
   frame.srcdoc=imageFrameDocument(url,alt);
   slot.replaceChildren(frame);
  }
  await tick();
  if(status?.isConnected)status.focus({preventScroll:true});
 }
</script>

{#if available}
 <div class="image-controls">
  {#if !consented}<p id="image-privacy" class="note">{t('imagePrivacy')}</p><button type="button" aria-describedby="image-privacy" onclick={allowImages}>{t('loadImages')}</button>{/if}
  <p role="status" tabindex="-1" bind:this={status}>{consented?t('imagesRequested'):''}</p>
 </div>
{/if}
<div class="formatted-mail" bind:this={target} hidden={!usable}></div>
{#if usable}<details><summary>{t('textView')}</summary><pre>{text}</pre></details>{:else}<pre>{text}</pre>{/if}
