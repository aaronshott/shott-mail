import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import net from 'node:net';
import {Resolver} from 'node:dns/promises';
import {assertEndpoint,endpointOptions,isPublicAddress,type MailPolicy} from '../src/server/mail-policy.ts';
import {testConnection} from '../src/server/mail.ts';

const pub={mailMode:'public',timeoutMs:500} as const;
const ep={host:'mail.example.test',port:993,tls:'implicit',user:'synthetic',password:'test-only'} as const;
const v4='93.184.216.34', v6='2606:4700::1234'; // synthetic resolver answers, never dialled

test('non-global IPv4, IPv6, transition addresses and invalid IPs fail closed',()=>{
 for(const address of ['0.1.2.3','10.1.2.3','100.64.0.1','127.2.3.4','169.254.169.254','172.31.0.1','192.0.0.9','192.0.2.1','192.88.99.1','192.168.1.1','198.19.1.1','198.51.100.3','203.0.113.4','239.5.1.2','240.0.0.1','255.255.255.255','::','::1','::ffff:93.184.216.34','::ffff:7f00:1','::127.0.0.1','64:ff9b::7f00:1','100::1','2001::1','2001:db8::1','2002::1','3fff::1','5f00::1','fc00::1','fe80::1%eth0','fec0::1','ff00::1','127.1','0x7f000001','not-an-address'])assert.equal(isPublicAddress(address),false,address);
 for(const address of [v4,v6,'100.63.255.255','172.32.0.1'])assert.equal(isPublicAddress(address),true,address);
});

test('public mode enforces exact protocol/port/TLS pairs and DNS names only',async()=>{
 assert.doesNotThrow(()=>assertEndpoint('imap',ep,pub));
 assert.doesNotThrow(()=>assertEndpoint('imap',{...ep,tls:'starttls',port:143},pub));
 assert.doesNotThrow(()=>assertEndpoint('smtp',{...ep,port:465},pub));
 assert.doesNotThrow(()=>assertEndpoint('smtp',{...ep,tls:'starttls',port:587},pub));
 for(const host of ['localhost','mail.local','mail.internal','127.0.0.1','127.1','0177.0.0.1','0x7f.0x0.0x0.0x1','[::1]','https://example.test','example.test.','example..test','-bad.example.test','example.test:993'])assert.throws(()=>assertEndpoint('imap',{...ep,host},pub),/POLICY/,host);
 for(const port of [25,143,465,587,1993])assert.throws(()=>assertEndpoint('imap',{...ep,port},pub),/POLICY/);
 for(const port of [25,143,587,993,1587])assert.throws(()=>assertEndpoint('smtp',{...ep,port},pub),/POLICY/);
 const forbiddenLookup=async()=>{assert.fail('Invalid configuration must not resolve DNS');};
 await assert.rejects(endpointOptions('smtp',{...ep,port:25},pub,forbiddenLookup),/POLICY/);
 await assert.rejects(endpointOptions('imap',ep,{allowedMail:[`${ep.host}:${ep.port}`]},forbiddenLookup),/POLICY/);
 const fixture={host:'127.0.0.1',port:1993};
 const fixturePolicy={mailMode:'fixture',allowedMail:['127.0.0.1:1993'],ca:'fixture-only'} as const;
 const f=await endpointOptions('imap',{...ep,...fixture},{...fixturePolicy,allowedMail:[...fixturePolicy.allowedMail]},forbiddenLookup);
 assert.equal(f.host,fixture.host);assert.equal(f.tls.ca,'fixture-only');
 await assert.rejects(endpointOptions('imap',{...ep,...fixture},{...pub,allowedMail:[...fixturePolicy.allowedMail]},forbiddenLookup),/POLICY/);
});

test('every DNS answer must be global; TLS trusts system roots and binds the configured name',async()=>{
 for(const answers of [[],['127.0.0.1'],[v4,'::ffff:10.1.2.3'],['fe80::1',v4],[v6,'10.1.2.3'],[v4,'malformed']])await assert.rejects(endpointOptions('imap',ep,pub,async()=>answers),/POLICY/);
 let lookups=0;
 const opts=await endpointOptions('imap',ep,{...pub,ca:'must not be used'},async(host,timeout)=>{lookups++;assert.equal(host,ep.host);assert.equal(timeout,500);return [v6,v4];});
 assert.equal(lookups,1);assert.equal(opts.host,v6);assert.equal(opts.tls.servername,ep.host);
 assert.equal(opts.tls.rejectUnauthorized,true);assert.equal(opts.tls.minVersion,'TLSv1.2');assert.deepEqual(opts.tls.ca,tls.getCACertificates('system'));
 const cert={subject:{CN:ep.host},subjectaltname:`DNS:${ep.host}`} as tls.PeerCertificate;
 assert.equal(opts.tls.checkServerIdentity(v6,cert),undefined);
 assert.ok(opts.tls.checkServerIdentity(ep.host,{...cert,subjectaltname:'DNS:other.example.test'}));
});

test('actual library dial calls get a numeric pin; mixed or failed DNS never reaches dial',async t=>{
 const queries:string[]=[];const dials:{host?:string;port?:number;servername?:string}[]=[];
 let answer6:string[]|Error=[v6];
 t.mock.method(Resolver.prototype,'resolve4',async(host:string)=>{queries.push(`A ${host}`);return [v4];});
 t.mock.method(Resolver.prototype,'resolve6',async(host:string)=>{queries.push(`AAAA ${host}`);if(answer6 instanceof Error)throw answer6;return answer6;});
 t.mock.method(tls,'connect',(opts:tls.ConnectionOptions)=>{dials.push(opts);throw new Error('synthetic dial stop');});
 t.mock.method(net,'connect',(opts:net.TcpNetConnectOpts)=>{dials.push(opts);throw new Error('synthetic dial stop');});
 const cases=[['imap',ep],['smtp',{...ep,port:465}],['imap',{...ep,tls:'starttls',port:143}],['smtp',{...ep,tls:'starttls',port:587}]] as const;
 for(const [protocol,endpoint] of cases){
  const n=dials.length;
  assert.equal(await testConnection(protocol,endpoint,pub),'TLS_AUTH_OR_CONNECTION_FAILED');
  assert.equal(dials.length,n+1);assert.equal(dials[n]!.host,v4);assert.equal(dials[n]!.port,endpoint.port);
  if(endpoint.tls==='implicit')assert.equal(dials[n]!.servername,ep.host);
 }
 assert.deepEqual(queries,cases.flatMap(()=>[`A ${ep.host}.`,`AAAA ${ep.host}.`]));
 answer6=['::1'];
 assert.equal(await testConnection('imap',ep,pub),'POLICY');
 answer6=Object.assign(new Error('synthetic DNS error'),{code:'ESERVFAIL'});
 assert.equal(await testConnection('smtp',{...ep,port:465},pub),'TLS_AUTH_OR_CONNECTION_FAILED');
 assert.equal(dials.length,cases.length);
 answer6=Object.assign(new Error('no AAAA data'),{code:'ENODATA'});
 const opts=await endpointOptions('imap',ep,pub as MailPolicy);
 assert.equal(opts.host,v4);
});
