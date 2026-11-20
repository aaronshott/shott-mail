import {ImapFlow} from 'imapflow';
import nodemailer from 'nodemailer';
import sanitize from 'sanitize-html';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
export type Endpoint={host:string;port:number;tls:'implicit'|'starttls';user:string;password:string};
export type MailPolicy={allowedMail:string[];ca?:string;timeoutMs?:number;maxMessageBytes?:number;pageSize?:number;maxDraftChars?:number};
export function safeHtml(html:string):string{return sanitize(html,{allowedTags:['p','br','b','strong','em','i','u','ul','ol','li','blockquote','pre','code','h1','h2','h3','table','tr','td','th','tbody','div','span'],allowedAttributes:{},allowedSchemes:[],allowProtocolRelative:false});}
export async function endpointOptions(e:Endpoint,c:MailPolicy){
 if(!c.allowedMail.includes(`${e.host}:${e.port}`))throw new Error('POLICY');
 // Explicit admin allowlist, then resolve once; socket connects to this IP, TLS validates original name.
 const address=isIP(e.host)?e.host:(await lookup(e.host)).address;
 return {host:address,port:e.port,secure:e.tls==='implicit',auth:{user:e.user,pass:e.password},
 tls:{servername:isIP(e.host)?undefined:e.host,rejectUnauthorized:true,minVersion:'TLSv1.2' as const,...(c.ca?{ca:c.ca}:{})},
 connectionTimeout:c.timeoutMs??10000,greetingTimeout:c.timeoutMs??10000,socketTimeout:c.timeoutMs??10000};
}
export async function imap(e:Endpoint,c:MailPolicy){
 const opts=await endpointOptions(e,c);
 const client=new ImapFlow({...opts,doSTARTTLS:e.tls==='starttls'?true:undefined,logger:false,logRaw:false,disableAutoIdle:true});
 client.on('error',()=>{});return client;
}
export async function smtp(e:Endpoint,c:MailPolicy){return nodemailer.createTransport({...await endpointOptions(e,c),requireTLS:e.tls==='starttls',logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});}
export async function testConnection(protocol:'imap'|'smtp',e:Endpoint,c:MailPolicy):Promise<string>{
 try{
  if(protocol==='imap'){const client=await imap(e,c);try{await client.connect();await client.logout();}finally{client.close();}}
  else{const transport=await smtp(e,c);try{await transport.verify();}finally{transport.close();}}
  return 'OK';
 }catch(error){return (error as Error).message==='POLICY'?'POLICY':'TLS_AUTH_OR_CONNECTION_FAILED';}
}
