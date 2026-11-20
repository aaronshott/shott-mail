import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';

test('mail rendering strips scripts, styles, remote loads and active links',async()=>{
 const m=await import('../src/server/mail.ts').catch(()=>null);assert.equal(typeof m?.safeHtml,'function');
 const html=m!.safeHtml('<p>Hello</p><script>alert(1)</script><img src="https://tracker.invalid/x"><svg onload="x()"></svg><a href="javascript:x()">x</a><style>body{background:url(https://tracker.invalid)}</style>');
 assert.ok(html.includes('<p>Hello</p>'));assert.equal(/script|<img|<svg|href=|<style|tracker.invalid/i.test(html),false);
});
test('disallowed mail endpoint refuses before network; absent STARTTLS never sends credentials',async()=>{
 const m=await import('../src/server/mail.ts').catch(()=>null);assert.equal(typeof m?.testConnection,'function');
 let observed='';const sockets=new Set<any>();
 const server=createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));s.write('220 isolated fault fixture\r\n');s.on('data',data=>{observed+=data.toString();s.write('250 isolated-no-starttls\r\n');});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as any).port;
 const endpoint={host:'127.0.0.1',port,tls:'starttls',user:'synthetic',password:randomBytes(24).toString('hex')};
 try{
  assert.equal(await m!.testConnection('smtp',endpoint,{allowedMail:[]}), 'POLICY');
  assert.equal(observed,'');
  assert.notEqual(await m!.testConnection('smtp',endpoint,{allowedMail:[`127.0.0.1:${port}`]}),'OK');
  assert.equal(/AUTH/i.test(observed),false);
 }finally{for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));}
});
