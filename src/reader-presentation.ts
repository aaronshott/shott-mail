// The wire values are normalized hints, not a CSS declaration block. Both ends
// use the same closed grammar; the reader sets only these named CSSOM properties.
const oneOf=(v:string,values:string)=>values.split(' ').includes(v)?v:null;
const colorNames='black white gray grey silver navy blue teal green olive lime yellow orange red maroon purple fuchsia aqua transparent rebeccapurple darkgreen forestgreen darkblue darkred whitesmoke linen ivory beige';
function color(v:string){
 if(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/.test(v))return v;
 const rgb=/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(v);
 if(rgb&&rgb.slice(1).every(n=>Number(n)<=255))return '#'+rgb.slice(1).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
 return oneOf(v,colorNames);
}
function px(v:string,min:number,max:number){
 const n=/^(\d{1,4})(?:px)?$/.exec(v);
 return n&&Number(n[1])>=min&&Number(n[1])<=max?`${Number(n[1])}px`:null;
}
function width(v:string){
 const n=/^(\d{1,3})%$/.exec(v);
 return n&&Number(n[1])>0&&Number(n[1])<=100?`${Number(n[1])}%`:px(v,1,1200);
}
function box(v:string,max:number){
 const parts=v.split(/\s+/),lengths=parts.map(x=>px(x,0,max));
 return parts.length<=4&&lengths.every(Boolean)?lengths.join(' '):null;
}
const families=new Map([['arial','Arial, sans-serif'],['helvetica','Helvetica, sans-serif'],['verdana','Verdana, sans-serif'],['tahoma','Tahoma, sans-serif'],['georgia','Georgia, serif'],['times new roman','Times New Roman, serif'],['courier new','Courier New, monospace'],['serif','serif'],['sans-serif','sans-serif'],['monospace','monospace'],['system-ui','system-ui']]);
function family(v:string){
 for(const item of v.split(',').slice(0,6)){
  const mapped=families.get(item.trim().replace(/^(['"])(.*)\1$/,'$2'));
  if(mapped)return mapped;
 }
 return null;
}
const isBlock=(tag:string)=>/^(div|p|table|td|th|h[1-6]|blockquote|ul|ol|pre|hr)$/.test(tag);
const fields={
 color:(v:string)=>color(v),
 'background-color':(v:string)=>color(v),
 'font-family':(v:string)=>family(v),
 'font-size':(v:string)=>px(v,10,48),
 'font-weight':(v:string)=>oneOf(v,'normal bold 400 500 600 700 800'),
 'font-style':(v:string)=>oneOf(v,'normal italic'),
 'line-height':(v:string)=>/^\d(?:\.\d{1,2})?$/.test(v)&&Number(v)>=1&&Number(v)<=2.2?String(Number(v)):px(v,14,64),
 'letter-spacing':(v:string)=>px(v,0,4),
 'text-decoration':(v:string)=>oneOf(v,'none underline line-through'),
 'text-align':(v:string)=>oneOf(v,'left center right start end'),
 'vertical-align':(v:string,tag:string)=>/^(td|th)$/.test(tag)?oneOf(v,'top middle bottom'):null,
 width:(v:string,tag:string)=>isBlock(tag)?width(v):null,
 'max-width':(v:string,tag:string)=>isBlock(tag)?width(v):null,
 padding:(v:string)=>box(v,32),
 'padding-top':(v:string)=>px(v,0,32),
 'padding-right':(v:string)=>px(v,0,32),
 'padding-bottom':(v:string)=>px(v,0,32),
 'padding-left':(v:string)=>px(v,0,32),
 margin:(v:string,tag:string)=>isBlock(tag)?box(v,32):null,
 'margin-top':(v:string,tag:string)=>isBlock(tag)?px(v,0,32):null,
 'margin-bottom':(v:string,tag:string)=>isBlock(tag)?px(v,0,32):null,
 'border-radius':(v:string)=>px(v,0,24),
 display:(v:string,tag:string)=>tag==='span'&&v==='inline-block'?v:null,
} satisfies Record<string,(v:string,tag:string)=>string|null>;
type Field=keyof typeof fields;
export const presentationAttributes=Object.keys(fields).map(key=>`data-p-${key}`);
function normalize(key:string,value:string,tag:string){
 if(!Object.hasOwn(fields,key)||value.length>160)return null;
 return fields[key as Field](value.trim().toLowerCase(),tag);
}

export function presentationHints(tag:string,attrs:Record<string,string>){
 const hints:Record<string,string>={};
 const set=(key:string,input?:string)=>{
  const value=input==null?null:normalize(key,input,tag);
  if(value){delete hints[`data-p-${key}`];hints[`data-p-${key}`]=value;}
 };
 set('background-color',attrs.bgcolor);
 if(tag!=='table')set('text-align',attrs.align);
 set('vertical-align',attrs.valign);
 // Table width attribute is reconstructed separately for legacy markup.
 if(tag!=='table')set('width',attrs.width);
 if((attrs.style?.length??0)<=2048){
  for(const declaration of (attrs.style??'').split(';').slice(0,48)){
   const colon=declaration.indexOf(':');if(colon<1)continue;
   let key=declaration.slice(0,colon).trim().toLowerCase();
   if(key==='background')key='background-color'; // only solid colors, never shorthand layers
   set(key,declaration.slice(colon+1));
  }
 }
 return hints;
}

export function applyPresentation(from:Element,to:HTMLElement){
 // Attribute iteration preserves normalized shorthand/longhand order.
 for(const {name,value} of from.attributes){
  if(!name.startsWith('data-p-'))continue;
  const key=name.slice(7),safe=normalize(key,value,to.localName);
  if(safe)to.style.setProperty(key,key==='max-width'?`min(100%, ${safe})`:safe);
 }
}

export function cellPadding(value:string|null|undefined){return value==null?null:px(value.trim(),0,24);}
