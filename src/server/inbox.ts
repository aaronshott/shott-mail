import {simpleParser} from 'mailparser';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {Store} from './store.ts';
import {imap,safeHtml,type MailPolicy} from './mail.ts';
import type {MailAccount} from './routes.ts';
import {discover,folderId,useMailbox} from './folders.ts';
import type {ImapFlow,FetchMessageObject,MailboxObject} from 'imapflow';
const validitySchema=z.string().regex(/^\d{1,20}$/);
const pageSchema=z.coerce.number().int().min(0).max(100000);
const summary=(item:FetchMessageObject,a:MailAccount,box:MailboxObject)=>({accountId:a.id,accountLabel:a.label,address:a.address,uid:item.uid,validity:String(box.uidValidity),subject:item.envelope?.subject??'(Geen onderwerp)',from:item.envelope?.from?.map(v=>v.name||v.address).join(', ')??'',date:item.envelope?.date?new Date(item.envelope.date).toISOString():'',unread:!item.flags?.has('\\Seen')});
export async function parseMessage(source:Buffer){
 const mail=await simpleParser(source,{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true});
 return {subject:mail.subject??'(Geen onderwerp)',from:mail.from?.text??'',replyTo:mail.replyTo?.value[0]?.address??mail.from?.value[0]?.address??'',text:mail.text??'',html:safeHtml(mail.html||''),attachments:mail.attachments.map(a=>({name:a.filename??'bijlage',size:a.size}))};
}
export function inboxRoutes(app:FastifyInstance,store:Store,c:MailPolicy){
 const accountFor=(owner:number,id:string)=>store.account(owner,z.string().uuid().parse(id)) as MailAccount;
 app.get<{Params:{account:string}}>('/api/accounts/:account/folders',async(req,reply)=>{
  const owner=req.principal!.userId,a=accountFor(owner,req.params.account);
  try{return await useMailbox(a,store.credentials(owner,a.id).imap,c,client=>discover(client,a));}
  catch{return reply.code(502).send({error:'MAIL_UNAVAILABLE'});}
 });
 app.get<{Params:{account:string;folder:string};Querystring:{page?:string;validity?:string}}>('/api/accounts/:account/folders/:folder/messages',async(req,reply)=>{
  const owner=req.principal!.userId,a=accountFor(owner,req.params.account),id=folderId.parse(req.params.folder);
  const page=pageSchema.parse(req.query.page??0),validity=validitySchema.optional().parse(req.query.validity);
  if(page&&!validity)return reply.code(400).send({error:'MAILBOX_IDENTITY_REQUIRED'});
  try{return await useMailbox(a,store.credentials(owner,a.id).imap,c,async client=>{
   const folder=(await discover(client,a)).find(f=>f.id===id&&f.selectable);
   if(!folder)return reply.code(404).send({error:'FOLDER_UNAVAILABLE'});
   const box=await client.mailboxOpen(folder.path,{readOnly:true});
   if(validity&&validity!==String(box.uidValidity))return reply.code(409).send({error:'MESSAGE_IDENTITY_CHANGED'});
   const count=c.pageSize??50,end=box.exists-page*count,start=Math.max(1,end-count+1),messages=[];
   if(end>0)for await(const item of client.fetch(`${start}:${end}`,{uid:true,envelope:true,flags:true}))messages.push(summary(item,a,box));
   messages.sort((a,b)=>b.date.localeCompare(a.date)||b.uid-a.uid);
   return {messages,validity:String(box.uidValidity),hasMore:start>1};
  });}catch{return reply.code(502).send({error:'MAIL_UNAVAILABLE'});}
 });
 app.get<{Params:{account:string;folder:string;validity:string;uid:string}}>('/api/accounts/:account/folders/:folder/messages/:validity/:uid',async(req,reply)=>{
  const owner=req.principal!.userId,a=accountFor(owner,req.params.account),id=folderId.parse(req.params.folder);
  const validity=validitySchema.parse(req.params.validity),uid=z.coerce.number().int().positive().max(4294967295).parse(req.params.uid);
  try{return await useMailbox(a,store.credentials(owner,a.id).imap,c,async client=>{
   const folder=(await discover(client,a)).find(f=>f.id===id&&f.selectable);
   if(!folder)return reply.code(404).send({error:'FOLDER_UNAVAILABLE'});
   const box=await client.mailboxOpen(folder.path,{readOnly:true});
   if(String(box.uidValidity)!==validity)return reply.code(409).send({error:'MESSAGE_IDENTITY_CHANGED'});
   return replyWithMessage(client,a,uid,reply,c);
  });}catch{return reply.code(502).send({error:'MAIL_UNAVAILABLE'});}
 });
 app.get<{Querystring:{account?:string;page?:string}}>('/api/inbox',async req=>{
  const owner=req.principal!.userId;
  const account=req.query.account;const page=z.coerce.number().int().min(0).max(100000).parse(req.query.page??0);
  const accounts=account&&account!=='all'
   ? [store.account(owner,z.string().uuid().parse(account)) as MailAccount]
   : store.listAccounts(owner) as MailAccount[];
  const result:{messages:any[];errors:{accountId:string;error:string}[];hasMore:boolean}={messages:[],errors:[],hasMore:false};
  for(const a of accounts){
   let client;
   try{
    client=await imap({...a.imap,password:store.credentials(owner,a.id).imap},c);await client.connect();
    const box=await client.mailboxOpen('INBOX',{readOnly:true});
    const count=c.pageSize??50;const end=box.exists-page*count,start=Math.max(1,end-count+1);result.hasMore ||= start>1;
    if(end>0)for await(const item of client.fetch(`${start}:${end}`,{uid:true,envelope:true,size:true,flags:true})){
     result.messages.push(summary(item,a,box));
    }
    await client.logout();
   }catch{result.errors.push({accountId:a.id,error:'MAIL_UNAVAILABLE'});}finally{client?.close();}
  }
  result.messages.sort((a,b)=>b.date.localeCompare(a.date)||b.uid-a.uid);return result;
 });
 app.get<{Params:{account:string;validity:string;uid:string}}>('/api/messages/:account/:validity/:uid',async(req,reply)=>{
  const owner=req.principal!.userId;
  const account=z.string().uuid().parse(req.params.account),uid=z.coerce.number().int().positive().parse(req.params.uid);
  const validity=z.string().regex(/^\d+$/).parse(req.params.validity);const a=store.account(owner,account) as MailAccount;
  let client;
  try{
   client=await imap({...a.imap,password:store.credentials(owner,account).imap},c);await client.connect();
   const box=await client.mailboxOpen('INBOX',{readOnly:true});
   if(String(box.uidValidity)!==validity)return reply.code(409).send({error:'MESSAGE_IDENTITY_CHANGED'});
   return await replyWithMessage(client,a,uid,reply,c);
  }finally{client?.close();}
 });
}

async function replyWithMessage(client:ImapFlow,a:MailAccount,uid:number,reply:import('fastify').FastifyReply,c:MailPolicy){
   const limit=c.maxMessageBytes??2097152;
   const info=await client.fetchOne(String(uid),{size:true},{uid:true});
   if(!info)return reply.code(404).send({error:'MESSAGE_GONE'});
   if((info.size??Infinity)>limit)return reply.code(413).send({error:'MESSAGE_TOO_LARGE'});
   const item=await client.fetchOne(String(uid),{source:{maxLength:limit+1}},{uid:true});
   if(!item||!item.source)return reply.code(404).send({error:'MESSAGE_GONE'});
   if(item.source.length>limit)return reply.code(413).send({error:'MESSAGE_TOO_LARGE'});
   return {...await parseMessage(item.source),accountId:a.id,accountLabel:a.label,address:a.address};
}
