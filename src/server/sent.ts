import type {ImapFlow} from 'imapflow';
import {discover,sentFolder,useMailbox} from './folders.ts';
import type {MailAccount} from './routes.ts';
import type {MailPolicy} from './mail.ts';

export type SentSettings={policy:'provider'|'client';folder?:string};
export type Filing={status:'pending'|'provider_unverified'|'needs_folder'|'appending'|'filed'|'failed'|'uncertain'|'observed';folder?:string};

export async function fileSent(a:MailAccount,password:string,c:MailPolicy,raw:Buffer,settings:SentSettings,record:(f:Filing)=>void){
 let folder:string|undefined,started=false;
 try{
  const result=await useMailbox(a,password,c,async client=>{
   const target=sentFolder(await discover(client,a),settings.folder);
   if(!target)return 'needs_folder';
   folder=target.id;
   // Commit the irreversible attempt before sending the command. Never replay
   // it, including after a crash between this write and the command itself.
   record({status:'appending',folder});started=true;
   return await client.append(target.path,raw,['\\Seen'])?'filed':'uncertain';
  });
  return {status:result,folder} satisfies Filing;
 }catch(error){
  const response=(error as {responseStatus?:string})?.responseStatus;
  const knownFailure=!started||response==='NO'||response==='BAD';
  return {status:knownFailure?'failed':'uncertain',folder} satisfies Filing;
 }
}

async function findMessageId(client:ImapFlow,messageId:string){
 const hits=await client.search({header:{'Message-ID':messageId}},{uid:true});
 if(!Array.isArray(hits)||!hits.length)return false;
 // SEARCH is substring matching and may be stale. Confirm the returned
 // envelope; a positive observation is not a uniqueness guarantee.
 for await(const item of client.fetch(hits.slice(0,25),{envelope:true},{uid:true})){
  if(item.envelope?.messageId===messageId)return true;
 }
 return false;
}

export async function observeSent(a:MailAccount,password:string,c:MailPolicy,messageId:string,selection?:string){
 return useMailbox(a,password,c,async client=>{
  const target=sentFolder(await discover(client,a),selection);
  if(!target)return {found:false,needsFolder:true};
  await client.mailboxOpen(target.path,{readOnly:true});
  return {found:await findMessageId(client,messageId),needsFolder:false};
 });
}
