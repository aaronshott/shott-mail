import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {Store} from './store.ts';
import {smtp,testConnection,type Endpoint,type MailPolicy} from './mail.ts';
import {assertEndpoint} from './mail-policy.ts';
const idSchema=z.string().uuid();
const endpoint=z.object({host:z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/),port:z.number().int().min(1).max(65535),tls:z.enum(['implicit','starttls']),user:z.string().min(1).max(320),password:z.string().max(1024).optional()}).strict();
const accountSchema=z.object({label:z.string().min(1).max(80),address:z.email().max(320),imap:endpoint,smtp:endpoint}).strict();
export type MailAccount={id:string;label:string;address:string;imap:Omit<Endpoint,'password'>;smtp:Omit<Endpoint,'password'>};
const draftSchema=(max:number)=>z.object({accountId:idSchema,revision:z.number().int().min(0),to:z.email().max(320),subject:z.string().max(998).refine(s=>!/[\r\n]/.test(s)),text:z.string().max(max)}).strict();
export function routes(app:FastifyInstance,store:Store,c:MailPolicy){
 const db=store.db;
 const getAccount=(owner:number,id:string)=>store.account(owner,id) as MailAccount;
 const operation=(owner:number,id:string)=>{
  const op=db.prepare('SELECT state,result FROM send_operations WHERE owner_id=? AND id=?').get(owner,id);
  return op?{id,state:String(op.state),...JSON.parse(String(op.result))}:null;
 };
 function saveAccount(owner:number,body:unknown,id:string,update:boolean){
  const value=accountSchema.parse(body);const old=update?store.credentials(owner,id):undefined;
  assertEndpoint('imap',value.imap,c);assertEndpoint('smtp',value.smtp,c);
  if(c.mailMode==='public'&&!update&&Number(db.prepare('SELECT count(*) AS n FROM mailboxes WHERE owner_id=?').get(owner)?.n)>=10)throw new Error('ACCOUNT_LIMIT');
  const secrets={imap:value.imap.password||old?.imap,smtp:value.smtp.password||old?.smtp};
  if(!secrets.imap||!secrets.smtp)throw new Error('PASSWORD_REQUIRED');
  const {password:_i,...imap}=value.imap;const {password:_s,...smtp}=value.smtp;
  store.putAccount(owner,id,{label:value.label,address:value.address,imap,smtp} as MailAccount,{imap:secrets.imap,smtp:secrets.smtp});return {id};
 }
 app.post('/api/accounts',async req=>saveAccount(req.principal!.userId,req.body,randomUUID(),false));
 app.put<{Params:{id:string}}>('/api/accounts/:id',async req=>saveAccount(req.principal!.userId,req.body,idSchema.parse(req.params.id),true));
 app.post<{Params:{id:string}}>('/api/accounts/:id/test',async req=>{
  const owner=req.principal!.userId;
  const a=getAccount(owner,idSchema.parse(req.params.id)),credentials=store.credentials(owner,a.id);
  return {imap:await testConnection('imap',{...a.imap,password:credentials.imap},c),smtp:await testConnection('smtp',{...a.smtp,password:credentials.smtp},c)};
 });
 app.delete<{Params:{id:string}}>('/api/accounts/:id',async(req,reply)=>{
  const owner=req.principal!.userId,id=idSchema.parse(req.params.id);getAccount(owner,id);
  if(db.prepare('SELECT id FROM user_drafts WHERE owner_id=? AND account_id=? LIMIT 1').get(owner,id))return reply.code(409).send({error:'ACCOUNT_HAS_DRAFTS'});
  db.prepare('DELETE FROM mailboxes WHERE owner_id=? AND id=?').run(owner,id);return {ok:true};
 });
 app.get('/api/drafts',async req=>{
  const owner=req.principal!.userId;
  return db.prepare('SELECT id,account_id AS accountId,revision,body FROM user_drafts WHERE owner_id=? ORDER BY rowid DESC')
   .all(owner).map(row=>({...row,body:JSON.parse(String(row.body)),operation:operation(owner,String(row.id))}));
 });
 app.get<{Params:{id:string}}>('/api/drafts/:id',async req=>{
  const owner=req.principal!.userId,id=idSchema.parse(req.params.id);
  return {...store.draft(owner,id),operation:operation(owner,id)};
 });
 app.put<{Params:{id:string}}>('/api/drafts/:id',async(req,reply)=>{
  const owner=req.principal!.userId,id=idSchema.parse(req.params.id),d=draftSchema(c.maxDraftChars??200000).parse(req.body);
  if(operation(owner,id))return reply.code(409).send({error:'SEND_LOCKED'});
  try{return {id,revision:store.saveDraft(owner,id,d.accountId,d.revision,{to:d.to,subject:d.subject,text:d.text})};}
  catch{return reply.code(409).send({error:'DRAFT_CONFLICT'});}
 });
 app.post<{Params:{id:string}}>('/api/drafts/:id/send',async(req,reply)=>{
  const owner=req.principal!.userId,id=idSchema.parse(req.params.id);
  const existing=operation(owner,id);if(existing)return existing;
  const revision=z.object({revision:z.number().int()}).strict().parse(req.body).revision;
  const draft=store.draft(owner,id);if(draft.revision!==revision)return reply.code(409).send({error:'DRAFT_CONFLICT'});
  const a=getAccount(owner,draft.accountId);const credentials=store.credentials(owner,a.id);
  // Journal lock is committed before network work; a repeated request returns this operation.
  db.prepare('INSERT INTO send_operations (owner_id,id,state,result) VALUES(?,?,?,?)').run(owner,id,'preparing','{}');
  const setState=(state:string,result='{}')=>db.prepare('UPDATE send_operations SET state=?,result=? WHERE owner_id=? AND id=?').run(state,result,owner,id);
  let transport;let submitted=false;
  try{
   transport=await smtp({...a.smtp,password:credentials.smtp},c);await transport.verify();
   setState('submitting');submitted=true;
   const result=await transport.sendMail({from:a.address,to:draft.body.to,subject:draft.body.subject,text:draft.body.text,messageId:`<${randomUUID()}@shott-mail.local>`,disableFileAccess:true,disableUrlAccess:true});
   const state=result.rejected.length?'partial_recipients':'accepted';
   setState(state,JSON.stringify({accepted:result.accepted,rejected:result.rejected}));
  }catch{setState(submitted?'outcome_unknown':'failed_before_submit');}
  finally{transport?.close();}
  return operation(owner,id);
 });
}
