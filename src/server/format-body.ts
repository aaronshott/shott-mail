import sanitize from 'sanitize-html';
import {boundedInteger,formattingTags,imageRejections,maxPictureSources,maxReaderImages,selectImageSource,tableWidth,type ImageRejectionCounts} from '../reader-policy.ts';
import {cellPadding,presentationAttributes,presentationHints} from '../reader-presentation.ts';

const marker='mail-image'; // only used in a detached HTML template, never inserted in the page
const discard=['head','script','style','template','noscript','form','button','textarea','select','option','iframe','object','embed','svg','math','canvas','audio','video','xmp','plaintext'];
const cell:sanitize.Transformer=(tagName,attrs)=>{
 const attribs=presentationHints(tagName,attrs);
 for(const key of ['colspan','rowspan']){
  const span=boundedInteger(attrs[key],12);if(span)attribs[key]=span;
 }
 return {tagName,attribs};
};

export function formatBody(html:string,appHostname=''):{markup:string;images:string[];imageRejections?:ImageRejectionCounts}|null {
 try{
  let count=0,slots=0,pictureDepth=0;
  type Picture={sources:Record<string,string>[];used:boolean};
  const stack:{tag:string;picture?:Picture;imageSources?:Picture['sources']}[]=[];
  const images:string[]=[];
  const rejected:ImageRejectionCounts={};
  const markup=sanitize(html,{
   allowedTags:[...formattingTags,marker],allowedAttributes:{'*':presentationAttributes,[marker]:['data-index','data-reason','data-image-width','data-image-height'],table:['data-layout','data-width','data-align','data-cell-padding'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedSchemes:[],allowProtocolRelative:false,
   nonTextTags:discard,
   // These hooks see original parser structure, before disallowed tags are
   // stripped. Only the first direct img can use preceding direct sources.
   // Keep one extra declaration to signal overflow; never retain source URLs
   // beyond this picture or serialize its tags/attributes into reader markup.
   onOpenTag(tag,attrs){
    if(++count>4000||stack.length>=48)throw Error('FORMAT_LIMIT');
    const parent=stack.at(-1)?.picture;
    const frame:typeof stack[number]={tag};
    if(tag==='picture'&&++pictureDepth===1)frame.picture={sources:[],used:false};
    if(parent&&!parent.used){
     if(tag==='source'&&parent.sources.length<=maxPictureSources)parent.sources.push(attrs);
     if(tag==='img'){parent.used=true;frame.imageSources=parent.sources;}
    }
    stack.push(frame);
   },
   onCloseTag(){if(stack.pop()?.tag==='picture')pictureDepth--;},
   transformTags:{
    ...Object.fromEntries([...formattingTags].map(tag=>[tag,(tagName:string,attrs:Record<string,string>)=>({tagName,attribs:presentationHints(tagName,attrs)})])),
    a:(_tag,attrs)=>({tagName:'span',attribs:presentationHints('span',attrs)}),
    [marker]:()=>({tagName:'span',attribs:{}}), // mail cannot supply a marker
    table:(tagName,attrs)=>{
     const attribs:Record<string,string>={},width=tableWidth(attrs.width?.trim());
     if(/^(presentation|none)$/i.test(attrs.role??''))attribs['data-layout']='presentation';
     if(width)attribs['data-width']=width;
     if(attrs.align?.toLowerCase()==='center')attribs['data-align']='center';
     const padding=cellPadding(attrs.cellpadding);
     if(padding)attribs['data-cell-padding']=padding;
     return {tagName,attribs:{...attribs,...presentationHints(tagName,attrs)}};
    },
    td:cell,th:cell,
    img:(_tag,attrs):sanitize.Tag=>{
     const source=selectImageSource(attrs,appHostname,stack.at(-1)?.imageSources);
     const url='url' in source?source.url:null;
     const text=(attrs.alt??'').trim().slice(0,512);
     let index=url&&slots<maxReaderImages?images.indexOf(url):-1;
     if(url&&slots<maxReaderImages&&index<0&&images.length<maxReaderImages)index=images.push(url)-1;
     if(index>=0)slots++;
     const reason='reason' in source?source.reason:'limit';
     if(index<0)rejected[reason]=(rejected[reason]??0)+1;
     const markerReason=reason==='cid'?'inline':reason==='limit'?'limit':'source';
     const attribs:Record<string,string>=index>=0?{'data-index':String(index)}:{'data-reason':markerReason};
     const width=boundedInteger(attrs.width?.trim(),1200),height=boundedInteger(attrs.height?.trim(),800);
     if(index>=0&&width&&height){attribs['data-image-width']=width;attribs['data-image-height']=height;}
     return {tagName:marker,attribs,text};
    }
   }
  });
  if(!markup.includes(`<${marker} `)&&!markup.replace(/<[^>]*>|&nbsp;/g,'').trim())return null;
  const counts:ImageRejectionCounts={};
  for(const reason of imageRejections)if(rejected[reason])counts[reason]=rejected[reason];
  return {markup,images,...(Object.keys(counts).length?{imageRejections:counts}:{})};
 }catch{return null;}
}
