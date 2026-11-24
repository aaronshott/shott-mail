export const fullCSS=`@font-face{font-family:Fixture;src:url('/full-font.ttf') format('truetype')}
.edition{max-width:720px;margin:auto;color:#192b41}.cover{background:#174c36 url('/full-background.svg');color:white;padding:12px}.cover h1{font:26px Fixture,serif;margin:8px 0}.grid{display:grid;grid-template-columns:120px 1fr;gap:16px;margin:12px 0}.grid p{margin:0}
@media(max-width:500px){.cover{background-color:#1f4167}.grid{grid-template-columns:1fr;gap:8px}}`;
export function documentMail(media:string){
 const html=`<!doctype html><html><head><link rel="stylesheet" href="${media}/full-mail.css"><style>.inline{margin-top:19px;background-image:url('/__test_full_same_origin.svg')}</style></head><body>
 <main class="edition"><header class="cover"><img class="logo" src="${media}/header-wordmark.png" width="120" height="28" alt="Pine Post"><h1>Field briefing</h1></header>
 <section class="grid"><img class="portrait" src="${media}/sizing-portrait.png" width="120" height="240" alt="Survey swatches"><p>Field observations from a synthetic edition.</p></section>
 <p class="inline" style="padding-left:13px">Inline layout</p><a href="${media}/unused" download>Archive label</a><form><input name="answer"><button>Send form</button></form><iframe title="Nested sample"></iframe><script type="application/json">{"label":"synthetic"}</script>
 </main></body></html>`;
 return ['From: synthetic@example.test','Subject: Reader full','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary=view','','--view','Content-Type: text/plain','','Plain full fixture','--view','Content-Type: text/html; charset=utf-8','',html,'--view--',''].join('\r\n');
}
export function longDocumentMail(media:string){
 const html=`<!doctype html><html><body><main style="max-width:720px;margin:auto">
 <h1>Long synthetic newsletter</h1><img src="${media}/late-reader.svg" alt="Late illustration" style="display:block;max-width:100%;height:auto">
 ${Array.from({length:12},(_,i)=>`<section style="padding:50px 12px;background:${i%2?'#e7efe9':'#f5f2e9'}"><h2>Field notes ${i+1}</h2><p>Sample newsletter copy for a scrolling test.</p></section>`).join('')}
 <footer style="background:#174c36;color:white;padding:16px">End of newsletter · Synthetic footer</footer>
 </main></body></html>`;
 return ['From: synthetic@example.test','Subject: Reader long full','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary=view','','--view','Content-Type: text/plain','','Plain long fixture','--view','Content-Type: text/html; charset=utf-8','',html,'--view--',''].join('\r\n');
}
