import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessage} from '../src/server/inbox.ts';
import {imageURL} from '../src/reader-policy.ts';

const mime=(body:string)=>Buffer.from(`From: sender@example.test\r\nSubject: Reader fixture\r\nMIME-Version: 1.0\r\n${body}`);
const html=(body:string)=>mime(`Content-Type: text/html; charset=utf-8\r\n\r\n${body}`);

test('only real HTML body becomes inert structured content; preserve the plain alternative',async()=>{
 const source=mime('Content-Type: multipart/alternative; boundary=alt\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nPlain & literal <b>\r\n--alt\r\nContent-Type: text/html\r\n\r\n<p class="newsletter">Hello &amp; <strong>team</strong></p>\r\n--alt--\r\n');
 const original=Buffer.from(source);
 const parsed=await parseMessage(source);
 assert.equal(parsed.text.trim(),'Plain & literal <b>');
 assert.deepEqual(parsed.formatted,{markup:'<p>Hello &amp; <strong>team</strong></p>',images:[]});
 assert.equal('html' in parsed,false);
 assert.deepEqual(source,original);
 assert.equal((await parseMessage(mime('Content-Type: text/plain\r\n\r\n<b>literal</b>'))).formatted,null);
 const attached=await parseMessage(mime('Content-Type: multipart/mixed; boundary=parts\r\n\r\n--parts\r\nContent-Type: text/plain\r\n\r\nBody\r\n--parts\r\nContent-Type: text/html\r\nContent-Disposition: attachment; filename=letter.html\r\n\r\n<p>Attachment only</p>\r\n--parts--\r\n'));
 assert.equal(attached.formatted,null);assert.equal(attached.attachments.length,1);
});

test('allowlisted formatting and explicit HTTPS image candidates only',async()=>{
 const parsed=await parseMessage(html('<p><a href="https://example.test/news">News</a> <img src="https://images.example.test/p.png?a=1&amp;b=2" srcset="https://example.test/large.png 2x" alt="Photo"> <img src="/logo.png" alt="Logo"></p><form><label>Search <input name="q"></label></form>'));
 assert.deepEqual(parsed.formatted,{markup:'<p>News <mail-image data-index="0">Photo</mail-image> <mail-image data-reason="source">Logo</mail-image></p>',images:['https://images.example.test/p.png?a=1&b=2']});
 assert.ok(parsed.text.includes('News'));
 assert.equal((await parseMessage(html('<div> </div>'))).formatted,null);
 assert.equal((await parseMessage(html('<blockquote>'.repeat(70)+'deep'+'</blockquote'.repeat(70)))).formatted,null);
});

test('reject obvious non-public initial image URLs and the app hostname without DNS',()=>{
 for(const url of ['http://images.example.test/a','https://localhost/a','https://one-label/a','https://a.local/a','https://a.internal/a','https://a.home.arpa/a','https://192.168.1.3/a','https://127.1/a','https://[::1]/a','https://reader.example.test.:444/a','https://user:pw@images.example.test/a']){
  assert.equal(imageURL(url,'reader.example.test'),null,url);
 }
 assert.equal(imageURL('https://images.example.test/a?edition=3#fragment','reader.example.test'),'https://images.example.test/a?edition=3');
});

test('new img sources keep the existing restrictions and valid src wins',async()=>{
 const host='reader.example.test',origin='https://images.example.test';
 const blocked=['http://images.example.test/x','https://u:p@images.example.test/x','https://127.1/x','https://[::1]/x','https://media.internal/x',`https://${host}:8443/x`,'https://images.example.test/'+ 'x'.repeat(2048)];
 const pics=blocked.map(url=>`<img src="${url.replace(/^https:/,'')}" data-src="${url}">`).join('');
 const parsed=await parseMessage(html(`${pics}<img src="///images.example.test/x"><img data-src="//images.example.test/x"><img srcset="${origin}/variant.png 2x"><img data-original="${origin}/other.png"><img src="https://${host}/x" data-src="${origin}/fallback.png?v=%2B"><img src="${origin}/direct.png?b=2&amp;a=1#drop" data-src="${origin}/unused.png">`),host);
 assert.deepEqual(parsed.formatted?.images,[`${origin}/fallback.png?v=%2B`,`${origin}/direct.png?b=2&a=1`]);
 assert.doesNotMatch(parsed.formatted!.markup,/data-src|srcset=|data-original/);
});
