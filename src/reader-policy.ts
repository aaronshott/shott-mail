// The reader only instantiates these inert tags, with no mail-supplied attributes.
export const formattingTags = new Set(['p','br','hr','b','strong','em','i','u','s','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','table','thead','tbody','tfoot','tr','td','th','div','span','del','sub','sup']);

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
