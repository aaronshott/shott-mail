import test from 'node:test';import assert from 'node:assert/strict';
test('MIME parser returns safe text and HTML without attachments or active network content',async()=>{
 const m=await import('../src/server/inbox.ts').catch(()=>null);assert.equal(typeof m?.parseMessage,'function');
 const mail=await m!.parseMessage(Buffer.from('From: sender@example.test\r\nTo: recipient@example.test\r\nSubject: Synthetisch\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hallo</p><img src="https://tracker.invalid"><script>bad()</script>'));
 assert.equal(mail.subject,'Synthetisch');assert.doesNotMatch(mail.formatted!.markup,/<img|<script|tracker\.invalid/);assert.ok(mail.formatted!.markup.includes('Hallo'));
});
