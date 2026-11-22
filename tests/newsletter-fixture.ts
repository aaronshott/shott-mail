// Synthetic newsletter, shared by MIME and loopback browser tests.
const logo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPioAAAAASUVORK5CYII=';
const headers=(subject:string)=>`From: Field Notes <editor@example.test>\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\n`;
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
 return headers('Reader unavailable')+`Content-Type: text/html; charset=utf-8\r\n\r\n<img src="cid:missing@example.test"><img src="data:image/png;base64,${logo}"><img src="http://images.example.test/post.png"><img srcset="${origin}/only-2x.png 2x"><img src="//images.example.test/relative.png">\r\n`;
}
export function missingImage(origin:string){
 return headers('Reader missing')+`Content-Type: text/html; charset=utf-8\r\n\r\n<h1>Monthly notice</h1><img src="${origin}/missing.png" alt="Archive illustration">\r\n`;
}
