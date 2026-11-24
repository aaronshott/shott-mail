// Minimal, loopback-only synthetic IMAP/SMTP peer. No production import or external relay.
import {createServer,type TLSSocket} from 'node:tls';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

export async function startMailFixture(dir:string,folders=false,nested='INBOX/Projects/&ZcWITA-'){ // modified UTF-7: 旅行 by default
 const key=join(dir,'mail.key'),cert=join(dir,'mail.crt');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const ca=readFileSync(cert,'utf8'),options={key:readFileSync(key),cert:ca};
 const users=['work','private','other'].map(name=>`${name}@example.test`);
 const passwords=new Map(users.map(user=>[user,randomBytes(24).toString('hex')]));

 const sent='Shared/Verzonden',custom='Shared/Custom &- Sent';
 const paths=new Map(users.map(user=>[user,new Map<string,string[]>([
  ['INBOX',[`From: sender@example.test\r\nTo: ${user}\r\nDate: Fri, 20 Nov 2026 12:00:00 +0000\r\nSubject: Seed for ${user}\r\n\r\nPrivate body for ${user}\r\n`]],
  [sent,[]],[custom,[]],
  [nested,[1,2].map(n=>`From: sender@example.test\r\nSubject: Nested ${n} for ${user}\r\nContent-Type: text/html\r\n\r\n<p>Nested body ${n}</p><script>alert(1)</script><img src="https://example.test/no">\r\n`)],
  ['Shared/<b>literal</b>',[]]
 ])]));
 const flags=new Map<string,Set<string>>(),stores:{user:string;path:string;command:string}[]=[];
 const flagKey=(user:string,path:string,uid:number)=>JSON.stringify([user,path,uid]);
 const behavior={sentFlags:1,validity:44,provider:'none' as 'none'|'auto'|'delay',append:'ok' as 'ok'|'reject'|'lost'|'drop',smtpLost:false,store:'ok' as 'ok'|'reject'|'noop'|'readonly'};
 const submitted:string[]=[],appended:string[]=[],delayed:{mail:string[];raw:string}[]=[];
 const sockets=new Set<TLSSocket>();let deliveries=0,imapAuth=0,smtpAuth=0,appendAttempts=0;
 function readLines(socket:TLSSocket,handler:(line:string)=>void){
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  let pending:Buffer=Buffer.alloc(0),literal:{size:number;accept:(raw:string)=>void}|undefined;
  socket.on('data',chunk=>{
   pending=Buffer.concat([pending,chunk]);
   while(pending.length){
    if(literal){if(pending.length<literal.size+2)return;const {size,accept}=literal;literal=undefined;const raw=pending.subarray(0,size).toString();pending=pending.subarray(size+2);accept(raw);continue;}
    const i=pending.indexOf('\r\n');if(i<0)return;
    const line=pending.subarray(0,i).toString();pending=pending.subarray(i+2);handler(line);
   }
  });
  return (size:number,accept:(raw:string)=>void)=>{literal={size,accept};};
 }
 const plain=(data:string)=>{const [,user,pass]=Buffer.from(data,'base64').toString().split('\0');return passwords.get(user)===pass&&passwords.has(user)?user:'';};
 const imap=createServer(options,socket=>{
  const cap='IMAP4rev1 AUTH=PLAIN SASL-IR'+(folders?' SPECIAL-USE NAMESPACE UIDPLUS':'');let user='',authTag='',selected='INBOX',readOnly=true;
  const write=(line:string)=>socket.write(line+'\r\n');
  const finishAuth=(tag:string,data:string)=>{user=plain(data);if(user)imapAuth++;write(`${tag} ${user?'OK authenticated':'NO authentication failed'}`);};
  write(`* OK [CAPABILITY ${cap}] Synthetic IMAP ready`);
  const readLiteral=readLines(socket,line=>{
   if(authTag){const tag=authTag;authTag='';finishAuth(tag,line);return;}
   const [tag,command='',...args]=line.split(' '),op=command.toUpperCase();
   const ok=()=>write(`${tag} OK ${op}`);
   if(op==='CAPABILITY'){write(`* CAPABILITY ${cap}`);ok();return;}
   if(op==='AUTHENTICATE'&&args[0]?.toUpperCase()==='PLAIN'){if(args[1])finishAuth(tag,args[1]);else{authTag=tag;write('+');}return;}
   if(op==='LOGOUT'){write('* BYE');ok();socket.end();return;}
   if(!user){write(`${tag} NO authenticate first`);return;}
   const boxes=paths.get(user)!,mail=boxes.get(selected)!;
   const wirePath=()=>args.join(' ').match(/^(?:"((?:[^"\\]|\\.)*)"|([^ ]+))/)?.slice(1).find(v=>v!==undefined)?.replace(/\\(.)/g,'$1')??'';
   if(folders&&op==='NAMESPACE'){write('* NAMESPACE (("INBOX/" "/")) NIL (("Shared/" "/"))');ok();return;}
   if(folders&&(op==='LIST'||op==='LSUB')){
    const row=(flags:string,name:string)=>write(`* ${op} (${flags}) "/" "${name}"`);
    row('','INBOX');
    if(op==='LIST'){
     row('\\Noselect','INBOX/Projects');row('',nested);row('\\NonExistent','Shared');
     row(behavior.sentFlags>=1?'\\Sent':'',sent);row(behavior.sentFlags>=2?'\\Sent':'',custom);row('','Shared/<b>literal</b>');
    }
    ok();return;
   }
   if(op==='LIST'||op==='LSUB'){write(`* ${op} () "/" "${op==='LIST'&&line.endsWith('""')?'':'INBOX'}"`);ok();return;}
   if(op==='SELECT'||op==='EXAMINE'){
    const path=wirePath(),target=boxes.get(path);
    if(!target){write(`${tag} NO unknown mailbox`);return;}
    selected=path;readOnly=op==='EXAMINE'||behavior.store==='readonly';
    for(const status of ['FLAGS (\\Seen \\Flagged $Synthetic)','OK [PERMANENTFLAGS (\\Seen \\Flagged \\*)] flags',`${target.length} EXISTS`,'0 RECENT',`OK [UIDVALIDITY ${path===nested?behavior.validity:33}] stable`,`OK [UIDNEXT ${target.length+1}] next`])write(`* ${status}`);
    write(`${tag} OK [READ-${readOnly?'ONLY':'WRITE'}] selected`);return;
   }
   if(folders&&op==='APPEND'){
    appendAttempts++;
    const target=boxes.get(wirePath()),size=Number(/\{(\d+)\}$/.exec(line)?.[1]);
    if(!target||!size||behavior.append==='reject'){write(`${tag} NO [OVERQUOTA] rejected`);return;}
    readLiteral(size,raw=>{
     if(behavior.append!=='drop'){target.push(raw);appended.push(raw);}
     if(behavior.append==='lost'||behavior.append==='drop'){socket.destroy();return;}
     write(`${tag} OK [APPENDUID 33 ${target.length}] stored`);
    });write('+ continue');return;
   }
   if(folders&&op==='UID'&&args[0]==='SEARCH'){
    const id=/<[^>]+>/.exec(line)?.[0];
    write(`* SEARCH ${mail.flatMap((raw,i)=>id&&raw.includes(id)?[i+1]:[]).join(' ')}`.trimEnd());ok();return;
   }
   if(op==='UID'&&args[0]==='STORE'){
    stores.push({user,path:selected,command:args.join(' ')});
    const uid=Number(args[1]);
    if(readOnly||behavior.store==='reject'){write(`${tag} NO store rejected`);return;}
    if(!/^STORE \d+ \+FLAGS(?:\.SILENT)? \(\\Seen\)$/.test(args.join(' '))){write(`${tag} BAD expected additive Seen`);return;}
    if(mail[uid-1]&&behavior.store!=='noop'){
     const key=flagKey(user,selected,uid),values=flags.get(key)??new Set<string>();values.add('\\Seen');flags.set(key,values);
     if(args[2]==='+FLAGS')write(`* ${uid} FETCH (UID ${uid} FLAGS (${[...values].join(' ')}))`);
    }
    ok();return;
   }
   const fetch=op==='FETCH'?args:op==='UID'&&args[0]?.toUpperCase()==='FETCH'?args.slice(1):null;
   if(fetch){
    const indices=fetch[0].split(',').flatMap(range=>{const [start,end=start]=range.split(':').map(s=>s==='*'?mail.length:Number(s));return Array.from({length:Math.max(0,Math.min(end,mail.length)-start+1)},(_,i)=>start+i);}),query=fetch.slice(1).join(' ').toUpperCase();
    for(const i of indices){
     const source=mail[i-1],size=Buffer.byteLength(source),subject=/^Subject: (.*)\r$/m.exec(source)?.[1];
     let result=`* ${i} FETCH (UID ${i} RFC822.SIZE ${size} FLAGS (${[...flags.get(flagKey(user,selected,i))??[]].join(' ')})`;
     const id=/^Message-ID: (.*)\r$/mi.exec(source)?.[1];
     if(query.includes('ENVELOPE'))result+=` ENVELOPE ("Fri, 20 Nov 2026 12:00:00 +0000" ${subject===undefined?'NIL':JSON.stringify(subject)} ((NIL NIL "sender" "example.test")) NIL NIL NIL NIL NIL NIL ${id?JSON.stringify(id):'NIL'})`;
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
   if(data){
    if(line!=='.'){data.push(line.startsWith('..')?line.slice(1):line);return;}
    const raw=data.join('\r\n')+'\r\n';paths.get(recipient)!.get('INBOX')!.push(raw);submitted.push(raw);deliveries++;data=null;
    if(behavior.smtpLost){socket.destroy();return;}
    const mail=paths.get(user)!.get(sent)!;
    if(behavior.provider==='auto')mail.push(raw);
    if(behavior.provider==='delay')delayed.push({mail,raw});
    write('250 delivered locally');return;
   }
   if(line.startsWith('EHLO '))write('250-synthetic.example.test\r\n250 AUTH PLAIN');
   else if(line.startsWith('AUTH PLAIN ')){user=plain(line.slice(11));if(user)smtpAuth++;write(user?'235 authenticated':'535 denied');}
   else if(line==='QUIT'){write('221 bye');socket.end();}
   else if(!user)write('530 authenticate first');
   else if(line.startsWith('MAIL FROM:')){recipient='';write(line.includes(`<${user}>`)?'250 sender ok':'553 sender mismatch');}
   else if(line.startsWith('RCPT TO:')){recipient=/<([^>]+)>/.exec(line)?.[1]??'';write(paths.has(recipient)?'250 recipient ok':'550 no relay');}
   else if(line==='DATA'&&paths.has(recipient)){data=[];write('354 end with dot');}
   else write('500 unsupported fixture command');
  });
 });
 const listen=async(server:typeof imap)=>{const ready=once(server,'listening');server.listen(0,'127.0.0.1');await ready;return (server.address() as {port:number}).port;};
 const imapPort=await listen(imap),smtpPort=await listen(smtp);
 return {ca,allowedMail:[`127.0.0.1:${imapPort}`,`127.0.0.1:${smtpPort}`],metrics:()=>({deliveries,imapAuth,smtpAuth}),
  stores,seedFlags:(user:string,path:string,uid:number,values:string[])=>flags.set(flagKey(user,path,uid),new Set(values)),
  behavior,submitted,appended,appendCount:()=>appendAttempts,releaseProvider:()=>{for(const {mail,raw} of delayed.splice(0))mail.push(raw);},
  seedSent:()=>paths.get('work@example.test')!.get(sent)!.push('From: work@example.test\r\nSubject: QA17 Sent row\r\n\r\nSent context only\r\n'),
  seedReplySubjects:()=>paths.get('work@example.test')!.set('INBOX',[undefined,'(Geen onderwerp)','(No subject)','Quarterly report'].map((subject,i)=>`From: sender@example.test\r\n${subject===undefined?'':`Subject: ${subject}\r\n`}\r\nReply fixture ${i}\r\n`)),
  seedReader:(origin:string,extra:string[]=[])=>{
   const rich=(kind:string)=>`From: sender@example.test\r\nSubject: Reader ${kind}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=alt\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nPlain ${kind}\r\n--alt\r\nContent-Type: text/html\r\n\r\n<link rel="prefetch" href="${origin}/prefetch"><p>Rich <strong>${kind}</strong> <a href="${origin}/link">Newsletter</a><img src="${origin}/${kind}.png" srcset="${origin}/large.png 2x" alt="Fixture photo">${kind==='work'?`<img src="${origin}/redirect.png" alt="Redirected photo">`:''}</p>\r\n--alt--\r\n`;
   paths.get('work@example.test')!.set('INBOX',[rich('work'),rich('second'),'From: sender@example.test\r\nSubject: Reader plain\r\n\r\nPlain only <b>literal</b>\r\n',...extra]);
   paths.get('private@example.test')!.set('INBOX',[rich('private')]);
  },
  mailbox:(name:string)=>{const user=`${name}@example.test`,password=passwords.get(user);if(!password)throw new Error('Invalid fixture mailbox');
   const ep={host:'127.0.0.1',tls:'implicit' as const,user,password};return {label:name,address:user,imap:{...ep,port:imapPort},smtp:{...ep,port:smtpPort}};},
  close:async()=>{for(const socket of sockets)socket.destroy();await Promise.all([new Promise<void>(r=>imap.close(()=>r())),new Promise<void>(r=>smtp.close(()=>r()))]);}};
}
