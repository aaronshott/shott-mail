import sanitize from 'sanitize-html';
import {formattingTags,imageURL} from '../reader-policy.ts';

const marker='mail-image'; // only used in a detached HTML template, never inserted in the page
const discard=['head','script','style','template','noscript','form','button','textarea','select','option','iframe','object','embed','svg','math','canvas','audio','video','xmp','plaintext'];

export function formatBody(html:string):{markup:string;images:string[]}|null {
 try{
  let count=0,depth=0;
  const images:string[]=[];
  const markup=sanitize(html,{
   allowedTags:[...formattingTags,marker],allowedAttributes:{[marker]:['data-index']},allowedSchemes:[],allowProtocolRelative:false,
   nonTextTags:discard,
   onOpenTag(){if(++count>4000||++depth>48)throw Error('FORMAT_LIMIT');},
   onCloseTag(){depth--;},
   transformTags:{
    [marker]:()=>({tagName:'span',attribs:{}}), // mail cannot supply a marker
    img:(_tag,attrs):sanitize.Tag=>{
     const url=imageURL(attrs.src??''),text=(attrs.alt??'').slice(0,512);
     let index=url?images.indexOf(url):-1;
     if(url&&index<0&&images.length<16)index=images.push(url)-1;
     return index>=0?{tagName:marker,attribs:{'data-index':String(index)},text}:{tagName:'span',attribs:{},text};
    }
   }
  });
  if(!images.length&&!markup.replace(/<[^>]*>|&nbsp;/g,'').trim())return null;
  return {markup,images};
 }catch{return null;}
}
