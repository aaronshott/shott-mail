import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessage} from '../src/server/inbox.ts';
import {newsletter,imageOnly,edition,editionImages,studio,diagnostics,pictureFixtures,picturePaths} from './newsletter-fixture.ts';
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
  assert.deepEqual(body.imageRejections,{limit:4});
 }
});

test('raw MIME aggregates fixed reasons once per skipped img without classified values',async()=>{
 const origin='https://images.example.test';
 const {formatted}=await parseMessage(Buffer.from(diagnostics(origin)));
 assert.deepEqual(formatted?.images,[origin+'/diagnostics.png?one=1&two=2']);
 assert.deepEqual(Object.entries(formatted!.imageRejections!),Object.entries({missing:1,relative:13,unsupportedScheme:1,unsupportedAttribute:1,dataRaster:1,blockedHost:1,tooLong:1,malformed:1,credentials:1,srcsetSyntax:1,srcsetLimit:1,cid:1,limit:1}));
 assert.doesNotMatch(JSON.stringify(formatted),/private-fixture-token|base64|data-original|ignored-/);
});

test('canonical URLs over the renderer cap do not exhaust slots for eligible URLs',async()=>{
 const origin='https://images.example.test';
 const tooLong=origin+'/'+'é'.repeat(350);
 const raw=Buffer.from(`From: fixture@example.test\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${`<img src="${tooLong}">\r\n`.repeat(48)}<img src="${origin}/eligible.png">`);
 const {formatted}=await parseMessage(raw);
 assert.equal(formatted?.images.length,1);
 assert.ok(formatted?.images[0]===origin+'/eligible.png','oversize canonical URL displaced eligible source');
 assert.match(formatted!.markup,/data-index="0"/);
 assert.deepEqual(formatted!.imageRejections,{tooLong:48});
});

test('MIME transfer decoding preserves signed queries, eligible srcset and CID through the formatter',async()=>{
 const raw=Buffer.from('From: fixture@example.test\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n'+
  '<img src=3D"//images.example.test/a?key=3Da%2Bb&amp;sig=3D=\r\n%2F">\r\n<img srcset=3D"http://images.example.test/b 2x, https://images.example.test/c 1x">\r\n<img src=3D"CID:private-fixture-token">\r\n');
 const {formatted}=await parseMessage(raw);
 assert.deepEqual(formatted?.images,['https://images.example.test/a?key=a%2Bb&sig=%2F','https://images.example.test/c']);
 assert.deepEqual(formatted?.imageRejections,{cid:1});
});

test('presentation normalizes only closed grammar values and discards unsupported CSS and metadata',()=>{
 const body=formatBody(`<div class="main" data-p-width="100%" style="color:rgb(24, 50, 73);max-width:600px;padding:800px;position:relative;background-image:url(https://images.example.test/paper.png);font-family:'Georgia', serif;margin:4px 0"><p align="center" style="text-align:right;padding-left:8px">Paper</p></div>`)!;
 assert.equal(body.markup,'<div data-p-color="#183249" data-p-max-width="600px" data-p-font-family="Georgia, serif" data-p-margin="4px 0px"><p data-p-text-align="right" data-p-padding-left="8px">Paper</p></div>');
 assert.deepEqual(body.images,[]);
});

test('wrapped quoted-printable MIME recovers 23 picture slots but not 23 truly empty slots',async()=>{
 const origin='https://images.example.test:4443';
 const [picture,empty]=await Promise.all(pictureFixtures(origin).map(raw=>parseMessage(Buffer.from(raw))));
 assert.deepEqual(empty.formatted?.images,[]);
 assert.deepEqual(empty.formatted?.imageRejections,{missing:23});
 assert.equal(picture.text.trim(),'Plain picture fixture.');
 assert.deepEqual({slots:picture.formatted?.images.length,rejections:picture.formatted?.imageRejections},{slots:23,rejections:undefined});
 assert.deepEqual(picture.formatted?.images,picturePaths.map(path=>origin+path));
 assert.equal([...picture.formatted!.markup.matchAll(/<mail-image data-index="\d+" data-image-width="128" data-image-height="24">Swatch \d+<\/mail-image>/g)].length,23);
 assert.doesNotMatch(JSON.stringify([picture.formatted,empty.formatted]),/private-|<picture|<source|\b(?:srcset|href|style)=/);
});

test('picture fallback is bounded, validates whole declarations, and cannot borrow across structure',()=>{
 const origin='https://images.example.test';
 const source=(name:string)=>`<source srcset="${origin}/${name}.png">`;
 const wrap=(inside:string)=>`<picture>${inside}</picture>`;
 const nine=Array.from({length:9},(_,i)=>`${origin}/unused.png ${i+1}w`).join(', ');
 const formatted=formatBody([
  wrap(source('unused')+`<img src="${origin}/fallback.png">`),
  wrap(source('unused')+`<img src="/relative" data-src="${origin}/lazy.png">`),
  wrap(source('unused')+`<img srcset="${origin}/own.png">`),
  wrap(source('unused')+'<img src="cid:private-cid">'),
  wrap(`<source srcset="${origin}/unused.png 1x, /bad 2x">${source('eligible')}<img>`),
  wrap(`<source srcset="${nine}"><img>`),
  wrap(`<source srcset="https://user:secret@images.example.test/unusable"><img>`),
  wrap(`<source srcset="https://app.example.test/unusable"><img>`),
  wrap(`<source srcset="${origin}/unusable 0x"><img src="/existing-diagnosis">`),
  wrap(`<source type="video/mp4" srcset="${origin}/unused"><img>`),
  wrap(`<source src="${origin}/unused"><img>`),
  wrap(source('unused').repeat(9)+'<img>'),
  source('unused')+'<img>',wrap(source('unused'))+'<img>',
  wrap('<img>'+source('unused')+'<img>'),
  wrap(source('unused')+'<div><img></div>'),
  wrap(`<div>${source('unused')}</div><img>`),
  wrap(source('unused')+wrap('<img>')),wrap(wrap(source('unused'))+'<img>'),
  `<video>${source('unused')}</video><img>`,
  `<template>${wrap(source('unused')+'<img>')}</template>`,
  `<noscript>${wrap(source('unused')+'<img>')}</noscript>`,
 ].join(''),'app.example.test')!;
 assert.deepEqual(formatted.images,['fallback','lazy','own','eligible'].map(name=>`${origin}/${name}.png`));
 assert.deepEqual(formatted.imageRejections,{missing:10,relative:1,unsupportedAttribute:1,blockedHost:1,credentials:1,srcsetLimit:2,cid:1});
 assert.doesNotMatch(JSON.stringify(formatted),/unused|secret|private-cid|existing-diagnosis|<picture|<source/);
});