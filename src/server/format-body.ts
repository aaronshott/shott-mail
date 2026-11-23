import sanitize from 'sanitize-html';
import {boundedInteger,safeFormattingTags,imageRejections,maxPictureSources,maxReaderImages,selectImageSource,tableHeaderScope,tableWidth,type ImageRejectionCounts} from '../reader-policy.ts';
import {cellPadding,presentationAttributes,presentationHints} from '../reader-presentation.ts';

const marker='mail-image'; // only used in a detached HTML template, never inserted in the page
const discard=['head','script','style','template','noscript','form','button','textarea','select','option','iframe','object','embed','svg','math','canvas','audio','video','xmp','plaintext'];
const isLayout=(attrs:Record<string,string>)=>/^(presentation|none)$/i.test(attrs.role??'');
const cell:sanitize.Transformer=(tagName,attrs)=>{
 const attribs=presentationHints(tagName,attrs);
 for(const key of ['colspan','rowspan']){
  const span=boundedInteger(attrs[key],12);if(span)attribs[key]=span;
 }
 const scope=tagName==='th'&&tableHeaderScope(attrs.scope);if(scope)attribs.scope=scope;
 return {tagName,attribs};
};
const column:sanitize.Transformer=(tagName,attrs)=>{
 const attribs=presentationHints(tagName,attrs),span=boundedInteger(attrs.span,12);
 if(span)attribs.span=span;
 return {tagName,attribs};
};

export function formatBody(html:string,appHostname=''):{markup:string;images:string[];imageRejections?:ImageRejectionCounts}|null {
 try{
  let count=0,slots=0,pictureDepth=0;
  type Picture={sources:Record<string,string>[];used:boolean};
  const stack:{tag:string;picture?:Picture;imageSources?:Picture['sources'];omit:boolean;insideOmitted:boolean}[]=[];
  const images:string[]=[];
  const rejected:ImageRejectionCounts={};
  const markup=sanitize(html,{
   allowedTags:[...safeFormattingTags,marker],allowedAttributes:{'*':presentationAttributes,[marker]:['data-index','data-reason','data-image-width','data-image-height'],table:['data-layout','data-width','data-align','data-cell-padding','data-omit-layout'],td:['colspan','rowspan'],th:['colspan','rowspan','scope'],col:['span'],colgroup:['span']},allowedSchemes:[],allowProtocolRelative:false,
   // Generated solely by the table transformer, and never serialized in the result.
   exclusiveFilter:frame=>frame.tag==='table'&&frame.attribs['data-omit-layout']==='1',
   nonTextTags:discard,
   // These hooks see original parser structure, before disallowed tags are
   // stripped. Only the first direct img can use preceding direct sources.
   // Keep one extra declaration to signal overflow; never retain source URLs
   // beyond this picture or serialize its tags/attributes into reader markup.
   onOpenTag(tag,attrs){
    if(++count>4000||stack.length>=48)throw Error('FORMAT_LIMIT');
    const parent=stack.at(-1);
    // Recognize only this unconditional literal, not CSS rules or a cascade.
    const omit=tag==='table'&&isLayout(attrs)&&/^\s*display\s*:\s*none\s*;?\s*$/i.test(attrs.style??'');
    const frame:typeof stack[number]={tag,omit,insideOmitted:omit||!!parent?.insideOmitted};
    if(tag==='picture'&&++pictureDepth===1)frame.picture={sources:[],used:false};
    const picture=parent?.picture;
    if(picture&&!picture.used){
     if(tag==='source'&&picture.sources.length<=maxPictureSources)picture.sources.push(attrs);
     if(tag==='img'){picture.used=true;frame.imageSources=picture.sources;}
    }
    stack.push(frame);
   },
   onCloseTag(){if(stack.pop()?.tag==='picture')pictureDepth--;},
   transformTags:{
    ...Object.fromEntries([...safeFormattingTags].map(tag=>[tag,(tagName:string,attrs:Record<string,string>)=>({tagName,attribs:presentationHints(tagName,attrs)})])),
    a:(_tag,attrs)=>({tagName:'span',attribs:presentationHints('span',attrs)}),
    [marker]:()=>({tagName:'span',attribs:{}}), // mail cannot supply a marker
    table:(tagName,attrs)=>{
     const attribs:Record<string,string>={},width=tableWidth(attrs.width?.trim());
     if(stack.at(-1)?.omit)return {tagName,attribs:{'data-omit-layout':'1'}};
     if(isLayout(attrs))attribs['data-layout']='presentation';
     else if(attrs.border?.trim()==='0'&&!attrs.role&&!attrs.summary)attribs['data-layout']='borderless-candidate';
     if(width)attribs['data-width']=width;
     if(attrs.align?.toLowerCase()==='center')attribs['data-align']='center';
     const padding=cellPadding(attrs.cellpadding);
     if(padding)attribs['data-cell-padding']=padding;
     return {tagName,attribs:{...attribs,...presentationHints(tagName,attrs)}};
    },
    td:cell,th:cell,colgroup:column,col:column,
    img:(_tag,attrs):sanitize.Tag=>{
     if(stack.at(-1)?.insideOmitted)return {tagName:'span',attribs:{}};
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
     if(width){attribs['data-image-width']=width;if(height)attribs['data-image-height']=height;}
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
