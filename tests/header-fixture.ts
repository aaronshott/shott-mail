import {crc32,deflateSync} from 'node:zlib';

export const headerPaths=['/header-wordmark.png','/header-icon.png','/header-clock.png','/header-hero.png'];
const [wordmark,icon,clock,hero]=headerPaths;
const logo=(base:string,path:string,alt:string,width:number)=>`<img src="${base+path}" alt="${alt}" width="${width}">`;
function header(base:string){
 return `<div style="background:#174c36;color:#fff;font-family:Arial;font-size:14px;line-height:1.3">
<table role="presentation" width="100%" cellpadding="8"><tr>
<td width="57%" valign="middle">${logo(base,wordmark,'Pine Post',126)}</td>
<td valign="middle">${logo(base,icon,'Field icon',24)}</td>
<td valign="middle"><span>Dispatch window</span><br><strong>09:00 UTC</strong></td>
<td valign="middle"><span>Trail conditions</span><br><strong>Clear</strong></td>
</tr></table>
<table role="presentation" width="100%" style="display : NONE;"><tr><td>${logo(base,'/header-alternate.png','Alternate Pine Post',126)}</td></tr></table>
<table role="presentation" width="100%"><tr><td align="center">
<h1 style="margin:8px 0 12px;font-size:28px">Spring field briefing</h1>
<img src="${base+clock}" alt="Static countdown: 12:34" width="240" height="72">
</td></tr></table>
<table role="presentation" width="100%"><tr><td><img src="${base+hero}" alt="Illustrated hillside" width="720" height="180"></td></tr></table>
</div>`;
}
export const headerMail=(origin:string)=>`From: reader-fixture@example.test\r\nSubject: Reader header\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=alt\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nSynthetic field briefing.\r\n--alt\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${header(origin)}\r\n--alt--\r\n`;
export const headerReference=()=>`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__test_header.css"><main>${header('/__test_header_asset')}</main>`;
export const headerReferenceCSS=`
body{margin:0}main{max-width:720px;margin:auto}main>div{background:#174c36;color:#fff;font:14px/1.3 Arial,sans-serif}
table{border-collapse:collapse;max-width:100%}td{box-sizing:border-box;padding:0}
table:first-child td{padding:8px}table:nth-of-type(2){display:none}
table:first-child img{display:block;max-width:100%;height:auto}h1{font-size:28px;line-height:1.2;margin:8px 0 12px}
@media(max-width:440px){table:first-child td{width:auto}table:first-child img{max-width:none}}
img[width="240"]{display:block;max-width:100%;height:auto;margin:auto}
img[width="720"]{display:block;width:100%;height:auto}
`;

const letters:Record<string,string>={P:'11110/10001/10001/11110/10000/10000/10000',I:'111/010/010/010/010/010/111',N:'10001/11001/11001/10101/10011/10011/10001',E:'11111/10000/10000/11110/10000/10000/11111',O:'01110/10001/10001/10001/10001/10001/01110',S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100', ' ':'00', '1':'010/110/010/010/010/010/111','2':'01110/10001/00001/00010/00100/01000/11111','3':'11110/00001/00001/01110/00001/00001/11110','4':'10010/10010/10010/11111/00010/00010/00010',':':'00/00/11/00/11/00/00'};
export function headerAsset(path:string){
 const sizes:Record<string,[number,number]>={[wordmark]:[126,28],[icon]:[24,24],[clock]:[240,72],[hero]:[720,180],'/header-alternate.png':[126,28]};
 const size=sizes[path];if(!size)return;
 const [w,h]=size,stride=1+w*4,pixels=Buffer.alloc(stride*h);
 function paint(x:number,y:number,rgb:number[]){pixels.set([...rgb,255],y*stride+1+x*4);}
 const ink=[245,255,245];
 function text(value:string,x:number,y:number,scale:number){
  for(const letter of value){const rows=letters[letter].split('/');
   rows.forEach((row,j)=>[...row].forEach((point,i)=>{if(point==='1')for(let a=0;a<scale;a++)for(let b=0;b<scale;b++)paint(x+i*scale+a,y+j*scale+b,ink);}));
   x+=(rows[0].length+1)*scale;
  }
 }
 if(path===wordmark||path==='/header-alternate.png')text('PINE POST',2,4,2);
 if(path===clock)text('12:34',48,8,8);
 if(path===icon)for(let y=3;y<21;y++)for(let x=3;x<21;x++)if(Math.abs(x-11)+Math.abs(y-11)<9)paint(x,y,ink);
 if(path===hero)for(let y=0;y<h;y++)for(let x=0;x<w;x++)paint(x,y,y>55+25*Math.sin(x/60)?[40,111,78]:[112,173,157]);
 const dimensions=Buffer.alloc(13);dimensions.writeUInt32BE(w);dimensions.writeUInt32BE(h,4);dimensions.set([8,6],8);
 const chunk=(type:string,data:Buffer)=>{const body=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([len,body,crc]);};
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',dimensions),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
