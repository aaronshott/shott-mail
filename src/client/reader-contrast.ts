// The reader allows only opaque sRGB colors and transparent. App surfaces
// behind it also use solid colors; no sender images or CSS layers are involved.
function luminance(color:string){
 const rgb=/^rgb\((\d+), (\d+), (\d+)\)$/.exec(color);
 if(!rgb)return null;
 const linear=(n:string)=>{const c=Number(n)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
 return .2126*linear(rgb[1])+.7152*linear(rgb[2])+.0722*linear(rgb[3]);
}
const ratio=(a:number,b:number)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);

export function protectReaderContrast(reader:HTMLElement){
 const root=document.documentElement;
 const system=matchMedia('(prefers-color-scheme: dark)');
 const authored=[...reader.querySelectorAll<HTMLElement>('[style]')];
 // Only nontransparent sender paint should select the existing white mail canvas.
 reader.classList.toggle('mail-authored-palette',authored.some(el=>
  el.style.backgroundColor&&luminance(getComputedStyle(el).backgroundColor)!==null));
 const nodes=[...reader.querySelectorAll<HTMLElement>('*')].filter(el=>!el.closest('.mail-image-placeholder'));
 const overrides=new Map<HTMLElement,string>();
 function refresh(){
  for(const [el,color] of overrides)el.style.color=color;
  overrides.clear();
  const canvas=getComputedStyle(reader);
  const ink=canvas.color,inkLight=luminance(ink);
  let background=luminance(canvas.backgroundColor);
  for(let el=reader.parentElement;background===null&&el;el=el.parentElement){
   background=luminance(getComputedStyle(el).backgroundColor);
  }
  if(background===null)return;
  const states=new Map([[reader,{background,original:ink,chosen:ink}]]);
  const changes=new Map<HTMLElement,string>();
  // Read the original tree first. Fix inherited ink against each local surface
  // independently, so correcting a parent cannot spoil a readable descendant.
  for(const el of nodes){
   const parent=states.get(el.parentElement!)!;
   const css=getComputedStyle(el),original=css.color;
   const background=luminance(css.backgroundColor)??parent.background;
   const light=luminance(original);
   const size=parseFloat(css.fontSize);
   const minimum=size>=24||(size>=56/3&&Number(css.fontWeight)>=700)?3:4.5;
   const hasInk=el.localName==='li'||Array.from(el.childNodes).some(node=>node.nodeType===Node.TEXT_NODE&&node.textContent?.trim());
   const chosen=!hasInk||(light!==null&&ratio(light,background)>=minimum)?original:
    inkLight!==null&&ratio(inkLight,background)>=minimum?ink:
    ratio(0,background)>=ratio(1,background)?'#000':'#fff';
   states.set(el,{background,original,chosen});
   if(chosen!==original||(!el.style.color&&original===parent.original&&chosen!==parent.chosen)){
    changes.set(el,chosen);
   }
  }
  for(const [el,color] of changes){overrides.set(el,el.style.color);el.style.color=color;}
 }
 refresh();
 const observer=new MutationObserver(refresh);
 observer.observe(root,{attributes:true,attributeFilter:['data-theme']});
 system.addEventListener('change',refresh);
 return ()=>{observer.disconnect();system.removeEventListener('change',refresh);};
}
