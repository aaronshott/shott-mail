// The reader only instantiates these inert tags, with no mail-supplied attributes.
export const formattingTags = new Set(['p','br','hr','b','strong','em','i','u','s','ul','ol','li','blockquote','pre','code','h1','h2','h3','h4','h5','h6','table','thead','tbody','tfoot','tr','td','th','div','span','del','sub','sup']);

export function imageURL(value:string):string|null {
 if(value.length>2048||!/^https:\/\//i.test(value))return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return null;
  url.hash='';
  return url.href;
 }catch{return null;}
}
