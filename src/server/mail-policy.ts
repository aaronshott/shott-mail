import {Resolver} from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import {checkServerIdentity,getCACertificates} from 'node:tls';

export type Protocol='imap'|'smtp';
export type Endpoint={host:string;port:number;tls:'implicit'|'starttls';user:string;password:string};
export type MailMode='disabled'|'public'|'fixture';
export type MailPolicy={mailMode?:MailMode;allowedMail?:string[];ca?:string;timeoutMs?:number;maxMessageBytes?:number;pageSize?:number;maxDraftChars?:number};

export const publicPorts={imap:{implicit:993,starttls:143},smtp:{implicit:465,starttls:587}} as const;
const hostLabel=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const localSuffixes=new Set(['localhost','local','internal','lan','home','arpa']);
const v4Denied=new BlockList();
// IANA special-purpose blocks, plus multicast and reserved space. Conservatively
// deny whole special-purpose blocks even where individual exceptions are routable.
for(const [base,prefix] of [
 ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
 ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.31.196.0',24],['192.52.193.0',24],
 ['192.88.99.0',24],['192.168.0.0',16],['192.175.48.0',24],['198.18.0.0',15],['198.51.100.0',24],
 ['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4],
] as const)v4Denied.addSubnet(base,prefix,'ipv4');
const v6Global=new BlockList();v6Global.addSubnet('2000::',3,'ipv6');
const v6Denied=new BlockList();
for(const [base,prefix] of [
 ['2001::',23],['2001:db8::',32],['2002::',16],['2620:4f:8000::',48],['3ffe::',16],['3fff::',20],
] as const)v6Denied.addSubnet(base,prefix,'ipv6');

export function isPublicAddress(address:string){
 if(address.includes('%'))return false;
 switch(isIP(address)){
  case 4:return !v4Denied.check(address,'ipv4');
  case 6:return v6Global.check(address,'ipv6')&&!v6Denied.check(address,'ipv6');
  default:return false;
 }
}

export function assertEndpoint(protocol:Protocol,e:Omit<Endpoint,'password'>,policy:MailPolicy){
 if(e.tls!=='implicit'&&e.tls!=='starttls')throw new Error('POLICY');
 if(policy.mailMode==='fixture'){
  if(!policy.allowedMail?.includes(`${e.host}:${e.port}`))throw new Error('POLICY');
 }else{
  const labels=e.host.split('.');const tld=labels.at(-1)??'';
  if(e.port!==publicPorts[protocol][e.tls]||e.host.length>253||labels.length<2||
    !labels.every(l=>hostLabel.test(l))||!/[a-z]/i.test(tld)||/^0x/i.test(tld)||
    localSuffixes.has(tld.toLowerCase()))throw new Error('POLICY');
 }
}

type ResolveAnswers=(host:string,timeoutMs:number)=>Promise<string[]>;
const resolvePublic:ResolveAnswers=async(host,timeoutMs)=>{
 // Both families must finish. Only a definitive no-records response is an
 // empty family; timeouts/SERVFAIL/NXDOMAIN are not partial successes.
 const resolver=new Resolver({timeout:timeoutMs,tries:1});
 const timer=setTimeout(()=>resolver.cancel(),timeoutMs);
 const family=async(p:Promise<string[]>):Promise<string[]>=>{
  try{return await p;}catch(error){if((error as NodeJS.ErrnoException).code==='ENODATA')return [];throw error;}
 };
 try{return (await Promise.all([family(resolver.resolve4(host+'.')),family(resolver.resolve6(host+'.'))])).flat();}
 finally{clearTimeout(timer);resolver.cancel();}
};

export async function endpointOptions(protocol:Protocol,e:Endpoint,c:MailPolicy,resolveAnswers=resolvePublic){
 assertEndpoint(protocol,e,c);
 if(!e.user||!e.password)throw new Error('POLICY');
 const timeout=c.timeoutMs??10000;
 let address:string;
 if(c.mailMode==='public'){
  const answers=await resolveAnswers(e.host,timeout);
  if(!answers.length||answers.some(a=>!isPublicAddress(a)))throw new Error('POLICY');
  address=answers[0]!;
 }else if(c.mailMode==='fixture'){
  // The built-in isolated fixture uses Docker DNS or synthetic loopback.
  if(isIP(e.host))address=e.host;
  else{
   const resolver=new Resolver({timeout,tries:1});
   const timer=setTimeout(()=>resolver.cancel(),timeout);
   try{address=(await resolver.resolve4(e.host))[0]??'';}finally{clearTimeout(timer);resolver.cancel();}
  }
  if(!isIP(address))throw new Error('POLICY');
 }else throw new Error('POLICY');

 // Pass only the numeric pin as the connection host. Neither client can
 // re-resolve the configured name or fall back to a different DNS answer.
 const fixtureCA=c.mailMode==='fixture'?c.ca:undefined;
 return {host:address,port:e.port,secure:e.tls==='implicit',auth:{user:e.user,pass:e.password},
  tls:{servername:isIP(e.host)?undefined:e.host,rejectUnauthorized:true,minVersion:'TLSv1.2' as const,
   checkServerIdentity:(_name:string,cert:Parameters<typeof checkServerIdentity>[1])=>checkServerIdentity(e.host,cert),
   ca:c.mailMode==='public'?getCACertificates('system'):fixtureCA},
  connectionTimeout:timeout,greetingTimeout:timeout,socketTimeout:timeout};
}
