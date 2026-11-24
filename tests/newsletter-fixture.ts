// Synthetic newsletter, shared by MIME and loopback browser tests.
const logo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPioAAAAASUVORK5CYII=';
const headers=(subject:string)=>`From: Field Notes <editor@example.test>\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n`;
export function studio(origin:string){
 const tiles=Array.from({length:23},(_,i)=>`<img src="${origin.replace('https:','http:')}/tile-${i}.png" width="128" height="24" alt="Edition tile ${i+1}">`).join(' ');
 return headers('Reader studio')+`Content-Type: text/html; charset=utf-8\r\n\r\n<table role="presentation" width="640" align="center" bgcolor="#f5efe3" cellpadding="16" style="color:#24334a;font-family:Georgia,serif"><tr><td>
 <p style="color:#873b30;font-size:14px;font-weight:bold;letter-spacing:2px">THE STUDIO POST / 04</p>
 <h1 style="color:#24334a;font-size:38px">Make room for colour</h1>
 <p style="font-size:18px;line-height:1.5">A short edition about paper, pigments and the people making things with them.</p>
 <img srcset="${origin}/studio.png 1x, ${origin}/studio-large.png 2x" width="640" height="120" alt="Studio palette">
 <table role="presentation" width="100%" cellpadding="14"><tr><td width="50%" bgcolor="#ffdfb0"><strong>01 / Paper</strong><br>Try a warmer ground.</td><td width="50%" bgcolor="#dfebcb"><strong>02 / Ink</strong><br>Mix a quiet green.</td></tr></table>
 <p style="text-align:center"><a href="${origin}/archive" style="display:inline-block;color:#ffffff;background-color:#873b30;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Explore the edition</a></p>
 <p>Past edition swatches</p><div>${tiles}</div></td></tr></table>\r\n`;
}
export function newsletter(origin:string){
 const body=`<!doctype html><html><head><style>.masthead { color: forestgreen }</style></head><body>
<table role="presentation" align="center" width="640" cellpadding="24" style="background:#ecf3ec"><tr><td>
<p class="masthead"><strong>FIELD NOTES / NOVEMBER</strong></p>
<h1>Make room for winter birds</h1>
<p>Three small changes make a garden more welcoming as the days get shorter.</p>
<img src="${origin}/garden.png" srcset="${origin}/garden-large.png 2x" width="640" height="120" alt="Winter garden banner">
<table width="100%"><caption>November checklist</caption><tr><th colspan="2">In the garden</th></tr><tr><th>Water</th><th>Shelter</th></tr><tr><td>Refresh shallow dishes.</td><td>Leave seed heads standing.</td></tr></table>
<p><a href="${origin}/edition">Read the full edition</a> in the community archive.</p>
<p><img src="cid:club-logo@example.test" alt="Club logo"> <img src="/partners.png" alt="Partner badge"></p>
</td></tr></table></body></html>`;
 return (headers('Reader garden')+'Content-Type: multipart/alternative; boundary=alt\n\n--alt\nContent-Type: text/plain; charset=utf-8\n\nField Notes: Make room for winter birds. Refresh dishes and leave seed heads standing.\n--alt\nContent-Type: multipart/related; boundary=related\n\n--related\nContent-Type: text/html; charset=utf-8\n\n'+body+'\n--related\nContent-Type: image/png\nContent-Transfer-Encoding: base64\nContent-ID: <club-logo@example.test>\nContent-Disposition: inline; filename="club.png"\n\n'+logo+'\n--related--\n--alt--\n').replace(/\r?\n/g,'\r\n');
}
export function imageOnly(origin:string){
 return headers('Reader unavailable')+`Content-Type: text/html; charset=utf-8\r\n\r\n<img src="cid:missing@example.test"><img src="data:image/png;base64,${logo}"><img src="/relative.png"><img srcset="${origin}/only-2x.png 2x, /other.png 1x">\r\n`;
}
export function missingImage(origin:string){
 return headers('Reader missing')+`Content-Type: text/html; charset=utf-8\r\n\r\n<h1>Monthly notice</h1><img src="${origin}/missing.png" alt="Archive illustration">\r\n`;
}

export function imageLoadFixtures(origin:string){
 const valid=`<img src="${origin}/alpha.svg" width="96" height="48" alt="Clear &amp; blue illustration">`;
 const missing=`<img src="${origin}/missing.png" width="96" height="48" alt="Archive illustration">`;
 const invalid=`<img src="${origin}/invalid.png" width="96" height="48" alt="Unreadable illustration">`;
 return [valid,missing,valid+missing+invalid].map((markup,i)=>headers(`Reader image-load-${i}`)+
  `Content-Type: text/html; charset=utf-8\r\n\r\n<h1>Image load test</h1><p style="background-color:#bce8cc;color:#18342a">${markup}</p>\r\n`);
}

export function diagnostics(origin:string){
 const relative='<img src="/private-fixture-token.png">'.repeat(13);
 const variants=Array.from({length:9},(_,i)=>`${origin}/private-fixture-token.png ${i+1}w`).join(', ');
 return headers('Reader diagnostics')+`Content-Type: text/html; charset=utf-8\r\n\r\n<h1>Source diagnostics</h1>${relative}
 <img ignored-private-fixture-token="x"><img data-original="${origin}/private-fixture-token.png">
 <img src="ftp://private-fixture-token.example.test/image.png"><img src="data:image/png;base64,${logo}">
 <img src="https://private-fixture-token.internal/image.png"><img src="${origin}/private-fixture-token${'x'.repeat(2050)}">
 <img src="https://[bad-private-fixture-token]/"><img src="https://private-fixture-token@images.example.test/image.png">
 <img srcset="${origin}/private-fixture-token.png 0x"><img srcset="${variants}">
 <img src="cid:private-fixture-token" data-src="${origin}/private-fixture-token.png">
 <img src="/private-fixture-token.png" data-src="${origin}/diagnostics.png?one=1&amp;two=2" alt="Eligible fixture">
 ${`<img src="${origin}/diagnostics.png?one=1&amp;two=2">`.repeat(48)}
 <template><img src="/private-fixture-token.png"></template><mail-image data-reason="limit"></mail-image>\r\n`;
}

export const picturePaths=Array.from({length:23},(_,i)=>`/picture-${i}.png?key=a%2Bb&tile=${i}`);
export function pictureFixtures(origin:string){
 const raw=(name:string,html:string)=>headers(`Reader ${name}`)+
  'Content-Type: multipart/alternative; boundary=picture-fixture\r\n\r\n--picture-fixture\r\n'+
  'Content-Type: text/plain; charset=utf-8\r\n\r\nPlain picture fixture.\r\n--picture-fixture\r\n'+
  'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n'+
  // Deliberately wrap inside URLs and attributes without splitting an escape.
  html.split('\n').map(line=>line.replace(/=/g,'=3D').match(/(?:=3D|[^=]){1,23}/g)?.join('=\r\n')??'').join('\r\n')+
  '\r\n--picture-fixture--\r\n';
 return [raw('picture',`<h1>Swatches</h1><style>@import '${origin}/private-css';</style>\n`+picturePaths.map((path,i)=>
  `<p><a href="${origin}/private-link"><picture><source media="(min-width: 1px)" srcset="${origin}/private-art-direction"><source type="image/png" srcset="${origin}/private-large-${i}.png 2x, ${origin}${path.replace('&','&amp;')} 1x"><img alt="Swatch ${i+1}" width="128" height="24"></picture></a></p>`).join('\n')),
  raw('empty',`<h1>Empty swatches</h1><picture><source srcset="${origin}/private-orphan"></picture>\n`+
   Array.from({length:23},(_,i)=>`<a href="${origin}/private-link" style="background-image:url(${origin}/private-background)"><img ${i%2?'src=" " ':''}alt="Empty ${i+1}"></a>`).join('\n'))];
}

export function contrastFixtures(){
 const html=(name:string,body:string)=>headers(`Reader ${name}`)+`Content-Type: text/html; charset=utf-8\r\n\r\n${body}\r\n`;
 return [html('contrast','<h1>Plain heading</h1><p><span style="color:white;background-color:transparent">White text from a dark-mode design</span></p>'+
  '<p style="color:white"><strong><em>No background</em></strong></p><p style="color:transparent"><strong>Transparent foreground</strong></p>'),
  html('contrast-palette',`<div style="color:white">White on unpainted canvas
  <p style="background-color:#17241f">White inherited on dark <strong><em>White nested on dark</em></strong></p></div>
  <table role="presentation" bgcolor="#faf3e4" cellpadding="12" style="color:#e8ded3"><tr><td>
   <strong><em>Low contrast on cream</em></strong><p style="color:#213443"><strong>Readable ink on cream</strong></p>
   <p><a href="https://example.test/notes" style="display:inline-block;color:white;background-color:#762c28;padding:8px 21px;border-radius:9px">Read the notes</a></p>
  </td></tr></table>`)];
}

export const editionImages=['/orchard.png?edition=7&crop=wide','/market.png?edition=7&size=compact'];
export function edition(origin:string){
 const [hero,market]=editionImages.map(path=>path.replace('&','&amp;'));
 return headers('Reader edition')+`Content-Type: text/html; charset=utf-8\r\n\r\n<table role="presentation" width="640" align="center"><tr><td>
<style>@import url('${origin}/remote.css');</style>
<p><strong>FIELD NOTES / DECEMBER</strong></p><h1>A winter orchard walk</h1>
<p>Look for winter birds along the hedge, then stop by the market.</p>
<img src="${origin.replace(/^https:/,'')}${hero}" data-src="${origin}/unused.png" alt="Orchard at dawn">
<p><img src="/spacer.gif" data-src="${origin}${market}" alt="Market stalls"></p>
<p style="background:url('${origin}/background.png')"><img src="/map.png" alt="Walking map"> <img src="/badge.png" alt="Community badge"> <img src="/spacer.png"></p>
</td></tr></table>\r\n`;
}
