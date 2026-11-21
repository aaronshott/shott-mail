<script>
 import {onMount,tick} from 'svelte';
 import {formattingTags,imageURL} from '../reader-policy.ts';

 let {body,text,t}=$props();
 let target=$state(),status=$state(),available=$state(false),usable=$state(true),consented=$state(false),pending=$state(false),failed=$state(false);
 const placeholders=new Map(),blobs=new Set();
 const controller=new AbortController();
 const types=new Set(['image/png','image/jpeg','image/gif','image/webp','image/avif']);
 const maxBytes=2*1024*1024;

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
     const url=/^\d{1,2}$/.test(index??'')?imageURL(body.images[Number(index)]??''):null;
     const alt=node.textContent;
     if(!url||new URL(url).origin===location.origin){to.append(document.createTextNode(alt));continue;}
     const slot=document.createElement('span');slot.textContent=alt;to.append(slot);
     if(!placeholders.has(url))placeholders.set(url,[]);
     placeholders.get(url).push({slot,alt});
    }else if(formattingTags.has(node.localName)){
     const el=document.createElement(node.localName);copy(node,el);to.append(el);
    }
   }
  }
  copy(template.content,target);
  available=placeholders.size>0;
  usable=available||!!target.textContent.trim();
  return ()=>{controller.abort();for(const url of blobs)URL.revokeObjectURL(url);};
 });

 async function loadImage(url,slots){
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(10000)]);
  const response=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal});
  const type=response.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
  if(!response.ok||!types.has(type)||!response.body||Number(response.headers.get('content-length'))>maxBytes){
   await response.body?.cancel();throw Error('Not a supported image');
  }
  const stream=response.body.getReader();
  const chunks=[];let size=0;
  for(;;){
   const {done,value}=await stream.read();if(done)break;
   size+=value.byteLength;
   if(size>maxBytes){await stream.cancel();throw Error('Image too large');}
   chunks.push(value);
  }
  if(controller.signal.aborted)return;
  const blob=URL.createObjectURL(new Blob(chunks,{type}));blobs.add(blob);
  for(const {slot,alt} of slots){
   const img=document.createElement('img');img.alt=alt;img.referrerPolicy='no-referrer';
   img.addEventListener('error',()=>{if(!controller.signal.aborted){img.replaceWith(document.createTextNode(alt));failed=true;}},{once:true});
   img.src=blob;slot.replaceChildren(img);
  }
 }
 async function allowImages(event){
  if(!event.isTrusted||consented||!available||controller.signal.aborted)return;
  consented=true;pending=true;
  await tick();
  if(controller.signal.aborted)return;
  status?.focus({preventScroll:true});
  const results=await Promise.allSettled([...placeholders].map(([url,slots])=>loadImage(url,slots)));
  if(!controller.signal.aborted){failed=failed||results.some(r=>r.status==='rejected');pending=false;}
 }
</script>

{#if available}
 <div class="image-controls">
  {#if !consented}<p id="image-privacy" class="note">{t('imagePrivacy')}</p><button type="button" aria-describedby="image-privacy" onclick={allowImages}>{t('loadImages')}</button>{/if}
  <p role="status" tabindex="-1" bind:this={status}>{pending?t('loadingImages'):failed?t('imagesUnavailable'):consented?t('imagesLoaded'):''}</p>
 </div>
{/if}
<div class="formatted-mail" bind:this={target} hidden={!usable}></div>
{#if usable}<details><summary>{t('textView')}</summary><pre>{text}</pre></details>{:else}<pre>{text}</pre>{/if}
