// Minimal, loopback-only synthetic IMAP/SMTP peer. No production import or external relay.
import {createServer,type TLSSocket} from 'node:tls';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

export async function startMailFixture(dir:string){
 const key=join(dir,'mail.key'),cert=join(dir,'mail.crt');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const ca=readFileSync(cert,'utf8'),options={key:readFileSync(key),cert:ca};
 const users=['work','private','other'].map(name=>`${name}@example.test`);
 const passwords=new Map(users.map(user=>[user,randomBytes(24).toString('hex')]));
 const inboxes=new Map(users.map(user=>[user,[`From: sender@example.test\r\nTo: ${user}\r\nDate: Fri, 20 Nov 2026 12:00:00 +0000\r\nSubject: Seed for ${user}\r\n\r\nPrivate body for ${user}\r\n`]]));
 const sockets=new Set<TLSSocket>();let deliveries=0,imapAuth=0,smtpAuth=0;
 function readLines(socket:TLSSocket,handler:(line:string)=>void){
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  let pending='';socket.on('data',chunk=>{pending+=chunk.toString();let i;while((i=pending.indexOf('\r\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+2);handler(line);}});
 }
 const plain=(data:string)=>{const [,user,pass]=Buffer.from(data,'base64').toString().split('\0');return passwords.has(user)&&passwords.get(user)===pass?user:'';};
 const imap=createServer(options,socket=>{
  const cap='IMAP4rev1 AUTH=PLAIN SASL-IR';let user='',authTag='';
  const write=(line:string)=>socket.write(line+'\r\n');
  const finishAuth=(tag:string,data:string)=>{user=plain(data);if(user)imapAuth++;write(`${tag} ${user?'OK authenticated':'NO authentication failed'}`);};
  write(`* OK [CAPABILITY ${cap}] Synthetic IMAP ready`);
  readLines(socket,line=>{
   if(authTag){const tag=authTag;authTag='';finishAuth(tag,line);return;}
   const [tag,command='',...args]=line.split(' '),op=command.toUpperCase();
   const ok=()=>write(`${tag} OK ${op}`);
   if(op==='CAPABILITY'){write(`* CAPABILITY ${cap}`);ok();return;}
   if(op==='AUTHENTICATE'&&args[0]?.toUpperCase()==='PLAIN'){if(args[1])finishAuth(tag,args[1]);else{authTag=tag;write('+');}return;}
   if(op==='LOGOUT'){write('* BYE');ok();socket.end();return;}
   if(!user){write(`${tag} NO authenticate first`);return;}
   const mail=inboxes.get(user)!;
   if(op==='LIST'||op==='LSUB'){write(`* ${op} () "/" "INBOX"`);ok();return;}
   if(op==='SELECT'||op==='EXAMINE'){
    for(const status of ['FLAGS (\\Seen)',`${mail.length} EXISTS`,'0 RECENT','OK [UIDVALIDITY 33] stable',`OK [UIDNEXT ${mail.length+1}] next`])write(`* ${status}`);
    write(`${tag} OK [READ-ONLY] selected`);return;
   }
   const fetch=op==='FETCH'?args:op==='UID'&&args[0]?.toUpperCase()==='FETCH'?args.slice(1):null;
   if(fetch){
    const [start,end=start]=fetch[0].split(':').map(s=>s==='*'?mail.length:Number(s)),query=fetch.slice(1).join(' ').toUpperCase();
    for(let i=start;i<=Math.min(end,mail.length);i++){
     const source=mail[i-1],size=Buffer.byteLength(source),subject=/^Subject: (.*)\r$/m.exec(source)?.[1]??'Fixture';
     let result=`* ${i} FETCH (UID ${i} RFC822.SIZE ${size} FLAGS ()`;
     if(query.includes('ENVELOPE'))result+=` ENVELOPE ("Fri, 20 Nov 2026 12:00:00 +0000" "${subject}" ((NIL NIL "sender" "example.test")) NIL NIL NIL NIL NIL NIL NIL)`;
     if(query.includes('BODY.PEEK[]')||query.includes('BODY[]'))result+=` BODY[]<0> {${size}}\r\n${source}`;
     write(result+')');
    }
    ok();return;
   }
   write(`${tag} BAD unsupported fixture command`);
  });
 });
 const smtp=createServer(options,socket=>{
  const write=(line:string)=>socket.write(line+'\r\n');
  let user='',recipient='',data:string[]|null=null;write('220 synthetic.example.test ESMTP');
  readLines(socket,line=>{
   if(data){if(line!=='.'){data.push(line.startsWith('..')?line.slice(1):line);return;}inboxes.get(recipient)!.push(data.join('\r\n')+'\r\n');deliveries++;data=null;write('250 delivered locally');return;}
   if(line.startsWith('EHLO '))write('250-synthetic.example.test\r\n250 AUTH PLAIN');
   else if(line.startsWith('AUTH PLAIN ')){user=plain(line.slice(11));if(user)smtpAuth++;write(user?'235 authenticated':'535 denied');}
   else if(line==='QUIT'){write('221 bye');socket.end();}
   else if(!user)write('530 authenticate first');
   else if(line.startsWith('MAIL FROM:')){recipient='';write(line.includes(`<${user}>`)?'250 sender ok':'553 sender mismatch');}
   else if(line.startsWith('RCPT TO:')){recipient=/<([^>]+)>/.exec(line)?.[1]??'';write(inboxes.has(recipient)?'250 recipient ok':'550 no relay');}
   else if(line==='DATA'&&inboxes.has(recipient)){data=[];write('354 end with dot');}
   else write('500 unsupported fixture command');
  });
 });
 const listen=async(server:typeof imap)=>{const ready=once(server,'listening');server.listen(0,'127.0.0.1');await ready;return (server.address() as {port:number}).port;};
 const imapPort=await listen(imap),smtpPort=await listen(smtp);
 return {ca,allowedMail:[`127.0.0.1:${imapPort}`,`127.0.0.1:${smtpPort}`],metrics:()=>({deliveries,imapAuth,smtpAuth}),
  mailbox:(name:string)=>{const user=`${name}@example.test`,password=passwords.get(user);if(!password)throw new Error('Invalid fixture mailbox');
   const ep={host:'127.0.0.1',tls:'implicit' as const,user,password};return {label:name,address:user,imap:{...ep,port:imapPort},smtp:{...ep,port:smtpPort}};},
  close:async()=>{for(const socket of sockets)socket.destroy();await Promise.all([new Promise<void>(r=>imap.close(()=>r())),new Promise<void>(r=>smtp.close(()=>r()))]);}};
}
