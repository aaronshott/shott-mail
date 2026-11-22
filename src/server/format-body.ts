import sanitize from 'sanitize-html';
import {boundedInteger,formattingTags,maxReaderImages,newsletterImageURL,srcsetFallback,tableWidth} from '../reader-policy.ts';
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

export function formatBody(html:string,appHostname=''):{markup:string;images:string[]}|null {
 try{
  let count=0,depth=0,slots=0;
  const images:string[]=[];
  const markup=sanitize(html,{
   allowedTags:[...formattingTags,marker],allowedAttributes:{'*':presentationAttributes,[marker]:['data-index','data-reason','data-image-width','data-image-height'],table:['data-layout','data-width','data-align','data-cell-padding'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedSchemes:[],allowProtocolRelative:false,
   nonTextTags:discard,
   onOpenTag(){if(++count>4000||++depth>48)throw Error('FORMAT_LIMIT');},
   onCloseTag(){depth--;},
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
     const src=(attrs.src??'').trim();
     const inline=/^cid:/i.test(src);
     const url=inline?null:newsletterImageURL(src,appHostname)??newsletterImageURL(attrs['data-src'],appHostname)??srcsetFallback(attrs.srcset,appHostname);
     const text=(attrs.alt??'').trim().slice(0,512);
     let index=url&&slots<maxReaderImages?images.indexOf(url):-1;
     if(url&&slots<maxReaderImages&&index<0&&images.length<maxReaderImages)index=images.push(url)-1;
     if(index>=0)slots++;
     const reason=url?'limit':inline?'inline':'source';
     const attribs:Record<string,string>=index>=0?{'data-index':String(index)}:{'data-reason':reason};
     const width=boundedInteger(attrs.width?.trim(),1200),height=boundedInteger(attrs.height?.trim(),800);
     if(index>=0&&width&&height){attribs['data-image-width']=width;attribs['data-image-height']=height;}
     return {tagName:marker,attribs,text};
    }
   }
  });
  if(!markup.includes(`<${marker} `)&&!markup.replace(/<[^>]*>|&nbsp;/g,'').trim())return null;
  return {markup,images};
 }catch{return null;}
}
