import {createHash} from 'node:crypto';
import type {ImapFlow} from 'imapflow';
import {z} from 'zod';
import type {MailAccount} from './routes.ts';
import {imap,type MailPolicy} from './mail.ts';

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const folderId=z.string().regex(/^[a-f0-9]{64}$/);
export const mailboxIdentity=(a:MailAccount)=>hash([a.id,a.imap.host,a.imap.port,a.imap.tls,a.imap.user]);
export type Folder={id:string;path:string;selectable:boolean;sent:boolean;subscribed:boolean};

export async function useMailbox<T>(a:MailAccount,password:string,c:MailPolicy,fn:(client:ImapFlow)=>Promise<T>):Promise<T>{
 const client=await imap({...a.imap,password},c);
 // Bound a whole operation, not just each socket read (a peer can drip responses).
 const deadline=setTimeout(()=>client.close(),c.timeoutMs??15000);
 try{
  await client.connect();
  // These are absolute names from LIST, not relative personal-namespace paths.
  // Prevent ImapFlow from prepending the first personal namespace to others.
  if(client.namespace)client.namespace={...client.namespace,prefix:''};
  return await fn(client);
 }finally{clearTimeout(deadline);client.close();}
}

export async function discover(client:ImapFlow,a:MailAccount):Promise<Folder[]>{
 const listed=await client.list();
 const identity=mailboxIdentity(a);
 const folders=new Map<string,Folder>();
 for(const entry of listed){
  // ImapFlow strips the leading hierarchy delimiter for display. Restore it
  // before issuing IMAP commands. Never accept a mailbox path from the browser.
  const prefix=entry.delimiter&&entry.pathAsListed.startsWith(entry.delimiter)?entry.delimiter:'';
  const path=prefix+entry.path;
  if(!path||/[\x00-\x1f\x7f]/.test(path))continue;
  const flags=new Set([...entry.flags].map(flag=>flag.toLowerCase()));
  const id=hash([identity,path]);
  const old=folders.get(id);
  folders.set(id,{id,path,selectable:(!old||old.selectable)&&!flags.has('\\noselect')&&!flags.has('\\nonexistent'),sent:!!old?.sent||flags.has('\\sent'),subscribed:!!old?.subscribed||!!entry.subscribed});
 }
 return [...folders.values()].sort((a,b)=>a.path.localeCompare(b.path));
}

export function sentFolder(folders:Folder[],selection?:string){
 if(selection)return folders.find(f=>f.id===selection&&f.selectable);
 // The library's `specialUse` also guesses by name and resolves conflicts.
 // Use raw flags instead, so multiple server claims require a real user choice.
 const candidates=folders.filter(f=>f.sent&&f.selectable);
 return candidates.length===1?candidates[0]:undefined;
}
