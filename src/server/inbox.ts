import {simpleParser} from 'mailparser';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import {Store} from './store.ts';
import {imap,safeHtml,type MailPolicy} from './mail.ts';
import type {MailAccount} from './routes.ts';
export async function parseMessage(source:Buffer){
 const mail=await simpleParser(source,{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true});
 return {subject:mail.subject??'(Geen onderwerp)',from:mail.from?.text??'',replyTo:mail.replyTo?.value[0]?.address??mail.from?.value[0]?.address??'',text:mail.text??'',html:safeHtml(mail.html||''),attachments:mail.attachments.map(a=>({name:a.filename??'bijlage',size:a.size}))};
}
export function inboxRoutes(app:FastifyInstance,store:Store,c:MailPolicy){
 const accounts=()=>store.listAccounts() as MailAccount[];
 app.get<{Querystring:{account?:string;page?:string}}>('/api/inbox',async req=>{
  const account=req.query.account;const page=z.coerce.number().int().min(0).max(100000).parse(req.query.page??0);
  if(account&&account!=='all'&&!accounts().some(a=>a.id===account))throw new Error('ACCOUNT_NOT_FOUND');
  const result:{messages:any[];errors:{accountId:string;error:string}[];hasMore:boolean}={messages:[],errors:[],hasMore:false};
  for(const a of accounts().filter(a=>!account||account==='all'||a.id===account)){
   let client;
   try{
    client=await imap({...a.imap,password:store.credentials(a.id).imap},c);await client.connect();
    const box=await client.mailboxOpen('INBOX',{readOnly:true});
    const count=c.pageSize??50;const end=box.exists-page*count,start=Math.max(1,end-count+1);result.hasMore ||= start>1;
    if(end>0)for await(const item of client.fetch(`${start}:${end}`,{uid:true,envelope:true,size:true,flags:true})){
     result.messages.push({accountId:a.id,accountLabel:a.label,address:a.address,uid:item.uid,validity:String(box.uidValidity),subject:item.envelope?.subject??'(Geen onderwerp)',from:item.envelope?.from?.map(v=>v.name||v.address).join(', ')??'',date:item.envelope?.date?new Date(item.envelope.date).toISOString():'',unread:!item.flags?.has('\\Seen')});
    }
    await client.logout();
   }catch{result.errors.push({accountId:a.id,error:'MAIL_UNAVAILABLE'});}finally{client?.close();}
  }
  result.messages.sort((a,b)=>b.date.localeCompare(a.date)||b.uid-a.uid);return result;
 });
 app.get<{Params:{account:string;validity:string;uid:string}}>('/api/messages/:account/:validity/:uid',async(req,reply)=>{
  const account=z.string().uuid().parse(req.params.account),uid=z.coerce.number().int().positive().parse(req.params.uid);
  const validity=z.string().regex(/^\d+$/).parse(req.params.validity);const a=accounts().find(a=>a.id===account);if(!a)throw new Error('ACCOUNT_NOT_FOUND');
  let client;
  try{
   client=await imap({...a.imap,password:store.credentials(account).imap},c);await client.connect();
   const box=await client.mailboxOpen('INBOX',{readOnly:true});
   if(String(box.uidValidity)!==validity)return reply.code(409).send({error:'MESSAGE_IDENTITY_CHANGED'});
   const limit=c.maxMessageBytes??2097152;
   const info=await client.fetchOne(String(uid),{size:true},{uid:true});
   if(!info)return reply.code(404).send({error:'MESSAGE_GONE'});
   if((info.size??Infinity)>limit)return reply.code(413).send({error:'MESSAGE_TOO_LARGE'});
   const item=await client.fetchOne(String(uid),{source:{maxLength:limit+1}},{uid:true});
   if(!item||!item.source)return reply.code(404).send({error:'MESSAGE_GONE'});
   if(item.source.length>limit)return reply.code(413).send({error:'MESSAGE_TOO_LARGE'});
   const parsed=await parseMessage(item.source);await client.logout();return {...parsed,accountId:account,accountLabel:a.label,address:a.address};
  }finally{client?.close();}
 });
}
