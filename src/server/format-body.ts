import sanitize from 'sanitize-html';
import {boundedInteger,formattingTags,imageURL,maxReaderImages,tableWidth} from '../reader-policy.ts';

const marker='mail-image'; // only used in a detached HTML template, never inserted in the page
const discard=['head','script','style','template','noscript','form','button','textarea','select','option','iframe','object','embed','svg','math','canvas','audio','video','xmp','plaintext'];
const cell:sanitize.Transformer=(tagName,attrs)=>{
 const attribs:Record<string,string>={};
 for(const key of ['colspan','rowspan']){
  const span=boundedInteger(attrs[key],12);if(span)attribs[key]=span;
 }
 return {tagName,attribs};
};

export function formatBody(html:string):{markup:string;images:string[]}|null {
 try{
  let count=0,depth=0;
  const images:string[]=[];
  const markup=sanitize(html,{
   allowedTags:[...formattingTags,marker],allowedAttributes:{[marker]:['data-index','data-reason'],table:['data-layout','data-width','data-align'],td:['colspan','rowspan'],th:['colspan','rowspan']},allowedSchemes:[],allowProtocolRelative:false,
   nonTextTags:discard,
   onOpenTag(){if(++count>4000||++depth>48)throw Error('FORMAT_LIMIT');},
   onCloseTag(){depth--;},
   transformTags:{
    [marker]:()=>({tagName:'span',attribs:{}}), // mail cannot supply a marker
    table:(tagName,attrs)=>{
     const attribs:Record<string,string>={},width=tableWidth(attrs.width?.trim());
     if(/^(presentation|none)$/i.test(attrs.role??''))attribs['data-layout']='presentation';
     if(width)attribs['data-width']=width;
     if(attrs.align?.toLowerCase()==='center')attribs['data-align']='center';
     return {tagName,attribs};
    },
    td:cell,th:cell,
    img:(_tag,attrs):sanitize.Tag=>{
     const src=(attrs.src??'').trim(),url=imageURL(src),text=(attrs.alt??'').trim().slice(0,512);
     let index=url?images.indexOf(url):-1;
     if(url&&index<0&&images.length<maxReaderImages)index=images.push(url)-1;
     const reason=/^cid:/i.test(src)?'inline':url?'limit':!src&&attrs.srcset?.trim()?'srcset':'source';
     return {tagName:marker,attribs:index>=0?{'data-index':String(index)}:{'data-reason':reason},text};
    }
   }
  });
  if(!markup.includes(`<${marker} `)&&!markup.replace(/<[^>]*>|&nbsp;/g,'').trim())return null;
  return {markup,images};
 }catch{return null;}
}
