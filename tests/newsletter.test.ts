import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessage} from '../src/server/inbox.ts';
import {newsletter,imageOnly,edition,editionImages} from './newsletter-fixture.ts';

test('newsletter promotes protocol-relative src to HTTPS and uses eligible data-src as fallback',async()=>{
 const origin='https://images.example.test:4443';
 const {formatted}=await parseMessage(Buffer.from(edition(origin)));
 assert.deepEqual(formatted?.images,editionImages.map(path=>origin+path));
 assert.match(formatted!.markup,/<mail-image data-index="0">Orchard at dawn<\/mail-image>/);
 assert.match(formatted!.markup,/<mail-image data-index="1">Market stalls<\/mail-image>/);
 assert.match(formatted!.markup,/<mail-image data-reason="source">Walking map<\/mail-image>/);
 assert.doesNotMatch(formatted!.markup,/data-src|background|remote\.css|unused\.png/);
});

test('multipart newsletter retains normalized table layout and separates CID from external images',async()=>{
 const origin='https://images.example.test';
 const parsed=await parseMessage(Buffer.from(newsletter(origin)));
 assert.match(parsed.text,/^Field Notes:/);
 assert.deepEqual(parsed.attachments.map(a=>a.name),['club.png']);
 assert.deepEqual(parsed.formatted?.images,[origin+'/garden.png']);
 const markup=parsed.formatted?.markup??'';
 assert.match(markup,/<table data-layout="presentation" data-width="640" data-align="center">/);
 assert.match(markup,/<caption>November checklist<\/caption>/);
 assert.match(markup,/<th colspan="2">/);
 assert.match(markup,/<mail-image data-reason="inline">Club logo<\/mail-image>/);
 assert.match(markup,/<mail-image data-reason="source">Partner badge<\/mail-image>/);
 assert.doesNotMatch(markup,/\b(?:style|class|href|src|srcset|cellpadding)=|garden-large|cid:/);
});

test('HTML-only unsupported images remain explainable even without alt text',async()=>{
 const parsed=await parseMessage(Buffer.from(imageOnly('https://images.example.test')));
 assert.deepEqual(parsed.formatted?.images,[]);
 const markup=parsed.formatted?.markup??'';
 assert.match(markup,/data-reason="inline"/);
 assert.match(markup,/data-reason="srcset"/);
 assert.equal([...markup.matchAll(/data-reason="source"/g)].length,3);
});