import {randomBytes} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import sanitizeHtml from 'sanitize-html';
import {z} from 'zod';
import {formattingTags,selectImageSource,imageURL} from '../reader-policy.ts';
import {folderId} from './folders.ts';
import type {Store} from './store.ts';

export const documentPath='/api/reader/document';
export const documentPolicy="sandbox; default-src 'none'; style-src https: 'unsafe-inline'; img-src https:; font-src https:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const drop=['script','textarea','option','noscript','title','form','button','select','iframe','object','embed','svg','math','template','video','audio','canvas'];

export function readerDocument(html:string,host:string){
 const rendered=sanitizeHtml(html,{
  // CSS is confined to the opaque document. Never insert this output into the app DOM.
  allowVulnerableTags:true,parseStyleAttributes:false,nestingLimit:64,
  allowedTags:[...formattingTags,'a','article','section','header','footer','main','figure','figcaption','center','font','colgroup','col','img','style','link'],
  nonTextTags:drop,
  allowedAttributes:{'*':['class','id','style','dir','lang','role'],link:['rel','href','media','referrerpolicy'],style:['media'],
   img:['src','alt','width','height','referrerpolicy'],table:['width','align','border','cellspacing','cellpadding','bgcolor'],
   tr:['align','valign','bgcolor'],td:['width','height','align','valign','bgcolor','colspan','rowspan'],
   th:['width','height','align','valign','bgcolor','colspan','rowspan'],col:['width','span'],font:['color','face','size']},
  allowedSchemes:['https'],allowProtocolRelative:false,
  transformTags:{
   link:(tag,attrs)=>{
    const url=attrs.rel?.trim().toLowerCase()==='stylesheet'&&imageURL(attrs.href?.trim()??'',host);
    const attribs:Record<string,string>=url?{rel:'stylesheet',href:url,media:attrs.media??'',referrerpolicy:'no-referrer'}:{};
    return {tagName:tag,attribs};
   },
   img:(tag,attrs)=>{
    const source=selectImageSource(attrs,host);
    const safe={...attrs,referrerpolicy:'no-referrer'};
    delete (safe as Record<string,string>).src;
    return {tagName:tag,attribs:{...safe,...('url' in source?{src:source.url}:{})}};
   },
  },
  exclusiveFilter:frame=>frame.tag==='link'&&!frame.attribs.href,
 });
 return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mail</title><style>html{overflow-wrap:anywhere}body{margin:8px}img{max-width:100%}</style></head><body>'+rendered+'</body></html>';
}

const request=z.object({account:z.string().uuid(),mailbox:folderId,folder:folderId.optional(),validity:z.string().regex(/^\d{1,20}$/),uid:z.number().int().positive().max(4294967295)}).strict();
export type ReaderIdentity=z.infer<typeof request>;
type Grant={expires:number;owner:number;session:string;identity:ReaderIdentity};

export function readerDocumentRoutes(app:FastifyInstance,store:Store,load:(owner:number,identity:ReaderIdentity)=>Promise<{status:number;html?:string}>){
 const grants=new Map<string,Grant>();
 app.post(documentPath,async(req,reply)=>{
  const {userId:owner,csrf:session}=req.principal!;
  const identity=request.parse(req.body);
  store.account(owner,identity.account);
  const now=Date.now();
  for(const [key,grant] of grants)if(grant.expires<=now||grant.session===session)grants.delete(key);
  if(grants.size>=512)return reply.code(429).send({error:'TRY_LATER'});
  const key=randomBytes(24).toString('base64url');
  // Not a bearer credential: valid once, in the issuing live session only, for this exact identity.
  grants.set(key,{expires:now+30_000,owner,session,identity});
  return {path:`${documentPath}?view=${key}`};
 });
 const unavailable='<!doctype html><html><head><meta charset="utf-8"><title>Mail</title></head><body><p>Weergave niet beschikbaar / View unavailable</p></body></html>';
 app.get<{Querystring:{view?:string}}>(documentPath,{exposeHeadRoute:false},async(req,reply)=>{
  reply.type('text/html; charset=utf-8');
  const key=req.query.view??'';
  const grant=/^[a-zA-Z0-9_-]{32}$/.test(key)?grants.get(key):undefined;
  const {userId:owner,csrf:session}=req.principal!;
  if(!grant||grant.expires<=Date.now()||grant.owner!==owner||grant.session!==session)return reply.code(404).send(unavailable);
  grants.delete(key);
  try{
   const document=await load(owner,grant.identity);
   return reply.code(document.status).send(document.html??unavailable);
  }catch{return reply.code(502).send(unavailable);}
 });
}
