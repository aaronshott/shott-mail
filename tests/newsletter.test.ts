import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessage} from '../src/server/inbox.ts';
import {newsletter,imageOnly,edition,editionImages,studio} from './newsletter-fixture.ts';
import {formatBody} from '../src/server/format-body.ts';

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
 assert.match(markup,/<table data-layout="presentation" data-width="640" data-align="center" data-cell-padding="24px" data-p-background-color="#ecf3ec">/);
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
 assert.equal([...markup.matchAll(/data-reason="source"/g)].length,3);
});

test('studio edition yields consent-only HTTPS candidates and normalized presentation',async()=>{
 const origin='https://images.example.test:4443';
 const {formatted}=await parseMessage(Buffer.from(studio(origin)));
 assert.deepEqual(formatted?.images,[origin+'/studio.png',...Array.from({length:23},(_,i)=>`${origin}/tile-${i}.png`)]);
 assert.match(formatted!.markup,/data-p-background-color="#f5efe3"/);
 assert.match(formatted!.markup,/data-image-width="640" data-image-height="120"/);
 assert.match(formatted!.markup,/<span[^>]+data-p-padding="12px 24px"[^>]*>Explore the edition<\/span>/);
 assert.doesNotMatch(formatted!.markup,/\b(?:style|class|href|src|srcset)=|https?:|<a\b/);
});

test('distinct destinations and repeated image slots are separately bounded',()=>{
 const image=(name:string)=>`<img src="https://images.example.test/${name}.png" alt="Tile">`;
 for(const [make,expected] of [[(i:number)=>String(i),48],[()=> 'same',1]] as const){
  const body=formatBody(Array.from({length:52},(_,i)=>image(make(i))).join(''))!;
  assert.equal(body.images.length,expected);
  assert.equal([...body.markup.matchAll(/data-index=/g)].length,48);
  assert.equal([...body.markup.matchAll(/data-reason="limit"/g)].length,4);
 }
});

test('presentation normalizes only closed grammar values and discards unsupported CSS and metadata',()=>{
 const body=formatBody(`<div class="main" data-p-width="100%" style="color:rgb(24, 50, 73);max-width:600px;padding:800px;position:relative;background-image:url(https://images.example.test/paper.png);font-family:'Georgia', serif;margin:4px 0"><p align="center" style="text-align:right;padding-left:8px">Paper</p></div>`)!;
 assert.equal(body.markup,'<div data-p-color="#183249" data-p-max-width="600px" data-p-font-family="Georgia, serif" data-p-margin="4px 0px"><p data-p-text-align="right" data-p-padding-left="8px">Paper</p></div>');
 assert.deepEqual(body.images,[]);
});