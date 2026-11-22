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
export function imageURL(value:string,appHostname=''):string|null {
 if(value.length>2048||!/^https:\/\//i.test(value))return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  const host=hostname(url.hostname);
  // Syntax only. Reject all IP literals, single labels and common internal names.
  // Neither this check nor the image CSP can classify DNS results or redirect hosts.
  if(host===hostname(appHostname)||!host.includes('.')||host.startsWith('[')||/^[\d.]+$/.test(host)||
     /(?:^|\.)(?:localhost|local|localdomain|lan|internal|intranet|corp|home|arpa|onion|invalid)$/.test(host))return null;
  url.hash='';
  return url.href;
 }catch{return null;}
}

export function newsletterImageURL(raw:string|undefined,appHostname:string):string|null {
 const value=raw?.trim()??'';
 if(/[\\\u0000-\u0020\u007f]/.test(value))return null;
 const promoted=value.replace(/^http:\/\/([^/])/i,'https://$1');
 return imageURL(/^\/\/[^/]/.test(promoted)?`https:${promoted}`:promoted,appHostname);
}

// A bounded subset: no commas in URLs or sender sizes. Select just one
// validated fallback (smallest candidate), never hand srcset to the browser.
export function srcsetFallback(raw:string|undefined,appHostname:string):string|null {
 if(!raw||raw.length>8192)return null;
 const entries=raw.trim().split(/,\s+/);
 if(entries.length>8)return null;
 const seen=new Set<number>();
 let kind='',best:{url:string;size:number}|undefined;
 for(const entry of entries){
  const match=/^([^,\s]+)(?:\s+(\d{1,4}w|\d(?:\.\d{1,2})?x))?$/.exec(entry.trim());
  if(!match)return null;
  const descriptor=match[2]??'1x',unit=descriptor.slice(-1),size=Number(descriptor.slice(0,-1));
  if((kind&&kind!==unit)||size<=0||size>(unit==='w'?4096:4)||seen.has(size))return null;
  const url=newsletterImageURL(match[1],appHostname);if(!url)return null;
  seen.add(size);kind=unit;
  if(!best||size<best.size)best={url,size};
 }
 return best?.url??null;
}
