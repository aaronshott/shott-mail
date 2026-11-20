import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {DatabaseSync} from 'node:sqlite';
import {Store} from './store.ts';
import {smtp,testConnection,type Endpoint,type MailPolicy} from './mail.ts';
const idSchema=z.string().uuid();
const endpoint=z.object({host:z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/),port:z.number().int().min(1).max(65535),tls:z.enum(['implicit','starttls']),user:z.string().min(1).max(320),password:z.string().max(1024).optional()}).strict();
const accountSchema=z.object({label:z.string().min(1).max(80),address:z.email().max(320),imap:endpoint,smtp:endpoint}).strict();
export type MailAccount={id:string;label:string;address:string;imap:Omit<Endpoint,'password'>;smtp:Omit<Endpoint,'password'>};
const draftSchema=(max:number)=>z.object({accountId:idSchema,revision:z.number().int().min(0),to:z.email().max(320),subject:z.string().max(998).refine(s=>!/[\r\n]/.test(s)),text:z.string().max(max)}).strict();
export function routes(app:FastifyInstance,db:DatabaseSync,store:Store,c:MailPolicy){
 db.exec(`CREATE TABLE IF NOT EXISTS sends (id TEXT PRIMARY KEY REFERENCES drafts(id), state TEXT NOT NULL, result TEXT NOT NULL);
 UPDATE sends SET state='outcome_unknown',result='{}' WHERE state IN ('preparing','submitting');`);
 const getAccount=(id:string)=>{const a=store.listAccounts().find(a=>a.id===id) as MailAccount|undefined;if(!a)throw new Error('ACCOUNT_NOT_FOUND');return a;};
 const operation=(id:string)=>{const op=db.prepare('SELECT * FROM sends WHERE id=?').get(id);return op?{id,state:String(op.state),...JSON.parse(String(op.result))}:null;};
 async function saveAccount(body:unknown,id:string){
  const value=accountSchema.parse(body);const old=store.listAccounts().some(a=>a.id===id)?store.credentials(id):undefined;
  const secrets={imap:value.imap.password||old?.imap,smtp:value.smtp.password||old?.smtp};
  if(!secrets.imap||!secrets.smtp)throw new Error('PASSWORD_REQUIRED');
  const {password:_i,...imap}=value.imap;const {password:_s,...smtp}=value.smtp;
  store.putAccount(id,{label:value.label,address:value.address,imap,smtp} as MailAccount,{imap:secrets.imap,smtp:secrets.smtp});return {id};
 }
 app.post('/api/accounts',async req=>saveAccount(req.body,randomUUID()));
 app.put<{Params:{id:string}}>('/api/accounts/:id',async req=>{const id=idSchema.parse(req.params.id);getAccount(id);return saveAccount(req.body,id);});
 app.post<{Params:{id:string}}>('/api/accounts/:id/test',async req=>{
  const a=getAccount(idSchema.parse(req.params.id)),credentials=store.credentials(a.id);
  return {imap:await testConnection('imap',{...a.imap,password:credentials.imap},c),smtp:await testConnection('smtp',{...a.smtp,password:credentials.smtp},c)};
 });
 app.delete<{Params:{id:string}}>('/api/accounts/:id',async(req,reply)=>{
  const id=idSchema.parse(req.params.id);getAccount(id);
  if(db.prepare('SELECT id FROM drafts WHERE account_id=? LIMIT 1').get(id))return reply.code(409).send({error:'ACCOUNT_HAS_DRAFTS'});
  db.prepare('DELETE FROM accounts WHERE id=?').run(id);return {ok:true};
 });
 app.get('/api/drafts',async()=>db.prepare('SELECT id,account_id AS accountId,revision,body FROM drafts ORDER BY rowid DESC').all().map(row=>({...row,body:JSON.parse(String(row.body)),operation:operation(String(row.id))})));
 app.get<{Params:{id:string}}>('/api/drafts/:id',async req=>{const id=idSchema.parse(req.params.id);return {...store.draft(id),operation:operation(id)};});
 app.put<{Params:{id:string}}>('/api/drafts/:id',async(req,reply)=>{
  const id=idSchema.parse(req.params.id),d=draftSchema(c.maxDraftChars??200000).parse(req.body);
  if(operation(id))return reply.code(409).send({error:'SEND_LOCKED'});
  try{return {id,revision:store.saveDraft(id,d.accountId,d.revision,{to:d.to,subject:d.subject,text:d.text})};}
  catch{return reply.code(409).send({error:'DRAFT_CONFLICT'});}
 });
 app.post<{Params:{id:string}}>('/api/drafts/:id/send',async(req,reply)=>{
  const id=idSchema.parse(req.params.id);const existing=operation(id);if(existing)return existing;
  const revision=z.object({revision:z.number().int()}).strict().parse(req.body).revision;
  const draft=store.draft(id);if(draft.revision!==revision)return reply.code(409).send({error:'DRAFT_CONFLICT'});
  const a=getAccount(draft.accountId);const credentials=store.credentials(a.id);
  // Journal lock is committed before network work; a repeated request returns this operation.
  db.prepare('INSERT INTO sends VALUES(?,?,?)').run(id,'preparing','{}');
  let transport;let submitted=false;
  try{
   transport=await smtp({...a.smtp,password:credentials.smtp},c);await transport.verify();
   db.prepare('UPDATE sends SET state=? WHERE id=?').run('submitting',id);submitted=true;
   const result=await transport.sendMail({from:a.address,to:draft.body.to,subject:draft.body.subject,text:draft.body.text,messageId:`<${id}@shott-mail.local>`,disableFileAccess:true,disableUrlAccess:true});
   const state=result.rejected.length?'partial_recipients':'accepted';
   db.prepare('UPDATE sends SET state=?,result=? WHERE id=?').run(state,JSON.stringify({accepted:result.accepted,rejected:result.rejected}),id);
  }catch{db.prepare('UPDATE sends SET state=? WHERE id=?').run(submitted?'outcome_unknown':'failed_before_submit',id);}
  finally{transport?.close();}
  return operation(id);
 });
 return {getAccount};
}
