import {ImapFlow} from 'imapflow';
import nodemailer from 'nodemailer';
import sanitize from 'sanitize-html';
import {endpointOptions,type Endpoint,type MailPolicy,type Protocol} from './mail-policy.ts';
export type {Endpoint,MailPolicy} from './mail-policy.ts';
export function safeHtml(html:string):string{return sanitize(html,{allowedTags:['p','br','b','strong','em','i','u','ul','ol','li','blockquote','pre','code','h1','h2','h3','table','tr','td','th','tbody','div','span'],allowedAttributes:{},allowedSchemes:[],allowProtocolRelative:false});}
export async function imap(e:Endpoint,c:MailPolicy){
 const opts=await endpointOptions('imap',e,c);
 const client=new ImapFlow({...opts,servername:opts.tls.servername,doSTARTTLS:e.tls==='starttls',logger:false,logRaw:false,disableAutoIdle:true});
 client.on('error',()=>{});return client;
}
export async function smtp(e:Endpoint,c:MailPolicy){
 const opts=await endpointOptions('smtp',e,c);
 return nodemailer.createTransport({...opts,servername:opts.tls.servername,requireTLS:e.tls==='starttls',forceAuth:true,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
}
export async function testConnection(protocol:Protocol,e:Endpoint,c:MailPolicy):Promise<string>{
 try{
  if(protocol==='imap'){const client=await imap(e,c);try{await client.connect();await client.logout();}finally{client.close();}}
  else{const transport=await smtp(e,c);try{await transport.verify();}finally{transport.close();}}
  return 'OK';
 }catch(error){return (error as Error).message==='POLICY'?'POLICY':'TLS_AUTH_OR_CONNECTION_FAILED';}
}
