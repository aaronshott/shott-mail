// The reader only instantiates these inert tags and reconstructs bounded layout hints.
export const formattingTags = new Set(['p','br','hr','b','strong','em','i','u','s','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','table','caption','thead','tbody','tfoot','tr','td','th','div','span','del','sub','sup']);

// Bound both distinct destinations and instantiated frame slots.
export const maxReaderImages=48;
export function boundedInteger(value:string|null|undefined,max:number):string|null {
 return value&&/^[1-9]\d{0,3}$/.test(value)&&Number(value)<=max?value:null;
}
export function tableWidth(value:string|null|undefined):string|null {
 if(!value?.endsWith('%'))return boundedInteger(value,1200);
 const percent=boundedInteger(value.slice(0,-1),100);
 return percent?`${percent}%`:null;
}

const hostname=(value:string)=>value.toLowerCase().replace(/\.+$/,'');
const maxImageURLLength=2048;
export const imageRejections=['missing','relative','unsupportedScheme','unsupportedAttribute','dataRaster','blockedHost','tooLong','malformed','credentials','srcsetSyntax','srcsetLimit','cid','limit'] as const;
export type ImageRejection=typeof imageRejections[number];
export type ImageRejectionCounts=Partial<Record<ImageRejection,number>>;
type ImageDecision={url:string}|{reason:ImageRejection};

export function imageURL(value:string,appHostname=''):string|null {
 const result=checkImageURL(value,appHostname);
 return 'url' in result?result.url:null;
}

function checkImageURL(value:string,appHostname:string):ImageDecision {
 if(value.length>maxImageURLLength)return {reason:'tooLong'};
 if(!/^https:\/\//i.test(value))return {reason:'malformed'};
 try{
  const url=new URL(value);
  if(url.protocol!=='https:')return {reason:'malformed'};
  if(url.username||url.password)return {reason:'credentials'};
  const host=hostname(url.hostname);
  // Syntax only. Reject all IP literals, single labels and common internal names.
  // Neither this check nor the image CSP can classify DNS results or redirect hosts.
  if(host===hostname(appHostname)||!host.includes('.')||host.startsWith('[')||/^[\d.]+$/.test(host)||
     /(?:^|\.)(?:localhost|local|localdomain|lan|internal|intranet|corp|home|arpa|onion|invalid)$/.test(host))return {reason:'blockedHost'};
  url.hash='';
  // The renderer applies the same cap to the canonical URL it receives.
  // Percent encoding can expand a short input; don't reserve a slot for
  // a destination that cannot pass the renderer's existing check.
  return url.href.length>maxImageURLLength?{reason:'tooLong'}:{url:url.href};
 }catch{return {reason:'malformed'};}
}

function newsletterImageURL(raw:string|undefined,appHostname:string):ImageDecision {
 const value=raw?.trim()??'';
 if(!value)return {reason:'missing'};
 // This labels the declaration only; the payload is neither read nor rendered.
 if(/^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|x-icon|vnd\.microsoft\.icon)[;,]/i.test(value))return {reason:'dataRaster'};
 const scheme=/^([a-z][a-z\d+.-]*):/i.exec(value)?.[1].toLowerCase();
 if(scheme&&scheme!=='https'&&scheme!=='http')return {reason:'unsupportedScheme'};
 if(/[\\\u0000-\u0020\u007f]/.test(value))return {reason:'malformed'};
 const promoted=value.replace(/^http:\/\/([^/])/i,'https://$1');
 if(/^\/\/[^/]/.test(promoted))return checkImageURL(`https:${promoted}`,appHostname);
 if(/^https:\/\//i.test(promoted))return checkImageURL(promoted,appHostname);
 if(/^(?:https?:|\/\/)/i.test(promoted))return {reason:'malformed'};
 return {reason:'relative'};
}

// A bounded subset: no commas in URLs or sender sizes. Select just one
// validated fallback (smallest candidate), never hand srcset to the browser.
function srcsetFallback(raw:string|undefined,appHostname:string):ImageDecision {
 if(!raw?.trim())return {reason:'missing'};
 if(raw.length>8192)return {reason:'tooLong'};
 const entries=raw.trim().split(/,\s+/);
 if(entries.length>8)return {reason:'srcsetLimit'};
 const seen=new Set<number>();
 let kind='',best:{url:string;size:number}|undefined;
 for(const entry of entries){
  const match=/^([^,\s]+)(?:\s+(\d{1,4}w|\d(?:\.\d{1,2})?x))?$/.exec(entry.trim());
  if(!match)return {reason:'srcsetSyntax'};
  const descriptor=match[2]??'1x',unit=descriptor.slice(-1),size=Number(descriptor.slice(0,-1));
  if((kind&&kind!==unit)||size<=0||size>(unit==='w'?4096:4)||seen.has(size))return {reason:'srcsetSyntax'};
  const result=newsletterImageURL(match[1],appHostname);if('reason' in result)return result;
  seen.add(size);kind=unit;
  if(!best||size<best.size)best={url:result.url,size};
 }
 return best?{url:best.url}:{reason:'missing'};
}

export const maxPictureSources=8;
const pictureTypes=new Set(['image/png','image/jpeg','image/gif','image/webp','image/avif','image/bmp','image/x-icon','image/vnd.microsoft.icon']);

function pictureFallback(sources:Record<string,string>[],appHostname:string):ImageDecision {
 if(sources.length>maxPictureSources)return {reason:'srcsetLimit'};
 let reason:ImageRejection='missing';
 for(const attrs of sources){
  if(!attrs.srcset?.trim())continue;
  // This is a static fallback, not responsive selection. Never evaluate
  // sender media queries or ask the browser to try alternate candidates.
  const type=attrs.type?.trim().toLowerCase();
  const result=attrs.media?.trim()||(type&&!pictureTypes.has(type))?
   {reason:'unsupportedAttribute' as const}:srcsetFallback(attrs.srcset,appHostname);
  if('url' in result)return result;
  if(reason==='missing')reason=result.reason;
 }
 return {reason};
}

// Keep the existing fallback order. Only if all fail, report the first
// nonempty attempted source. Recognize a fixed set of ignored attributes;
// never infer meaning from arbitrary names or expose one in the result.
export function selectImageSource(attrs:Record<string,string>,appHostname:string,pictureSources?:Record<string,string>[]):ImageDecision {
 if(/^cid:/i.test(attrs.src?.trim()??''))return {reason:'cid'};
 let reason:ImageRejection='missing';
 for(const check of [()=>newsletterImageURL(attrs.src,appHostname),()=>newsletterImageURL(attrs['data-src'],appHostname),()=>srcsetFallback(attrs.srcset,appHostname)]){
  const result=check();
  if('url' in result)return result;
  if(reason==='missing')reason=result.reason;
 }
 if(reason==='missing'&&['data-original','data-lazy-src','data-srcset'].some(key=>attrs[key]?.trim()))reason='unsupportedAttribute';
 if(pictureSources){
  const result=pictureFallback(pictureSources,appHostname);
  if('url' in result||reason==='missing')return result;
 }
 return {reason};
}
