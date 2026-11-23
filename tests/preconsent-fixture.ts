// Synthetic MIME: no real sender, message, links or remotely reachable hosts.
export const preconsentMarkup=(origin:string)=>`<style>@import url('${origin}/sheet.css'); .hidden{display:none;background-image:url('${origin}/hidden-rule.png')}</style>
<link rel="stylesheet" href="${origin}/linked.css">
<table border="0" width="100%" bgcolor="#eef2f6"><tr><td>
<table border="0" width="100%" style="background-color:#18263a !important;color:#f5f9ff !important;font-family:Arial;font-size:14px;line-height:16px"><colgroup><col width="28"><col></colgroup><tr>
<td width="28" valign="middle"><span><img width="16" height="16" src="${origin}/fixture-mark.png" alt="Field bulletin symbol"></span></td>
<td valign="middle" style="padding:17px 8px;font-size:20px;line-height:26px"><strong>Observatory Brief</strong></td>
</tr></table></td></tr><tr><td>
<table border="0" width="100%" bgcolor="#fff" style="color:#172436;font-size:14px">
<caption>Instrument readings</caption><colgroup><col width="48%"><col width="29%"><col width="23%"></colgroup>
<thead><tr><th scope="col">Sensor</th><th scope="col" align="right">Value</th><th scope="col" align="right">Delta</th></tr></thead>
<tbody><tr><th scope="row">North array</th><td align="right">52.4</td><td align="right" style="color:#146344">+1.2</td></tr>
<tr><th scope="row">South array</th><td align="right">38.6</td><td align="right">−0.4</td></tr></tbody></table>
</td></tr></table>
<span class="hidden" style="display:none;background-image:url('${origin}/hidden-inline.png')"></span>`;
export const preconsentMail=(origin:string)=>`From: bulletin@example.test\r\nSubject: Reader preconsent\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=alt\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nSynthetic observatory bulletin.\r\n--alt\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${preconsentMarkup(origin)}\r\n--alt--\r\n`;

export const unhintedAlt='Observatory symbol with a deliberately long unbroken SpectrophotometerCalibrationReference';
export const unhintedMail=(origin:string)=>{
 const band='style="background-color:#18263a;color:#f5f9ff;font-size:14px;line-height:20px"';
 const bandTitle='<td style="padding:8px"><strong>Observatory Brief</strong></td>';
 const header=(cell:string,attrs=band,cols='',role='role="presentation"')=>`<table ${role} width="100%" ${attrs}>${cols}<tr>${cell}${bandTitle}</tr></table>`;
 const img=(name:string,hints='',extra='')=>`<img ${hints} src="${origin}/${name.toLowerCase().replaceAll(' ','-')}.png" alt="${unhintedAlt}${extra} ${name}">`;
 return preconsentMail(origin).replace('Reader preconsent','Reader unhinted').replace(preconsentMarkup(origin),`
 <link rel="stylesheet" href="${origin}/sheet.css">
 <style>@import url('${origin}/import.css'); .sheet {background:#18263a url('${origin}/back.png');color:#f5f9ff}
 .skinny {width:12px}.hidden{display:none;background:url('${origin}/hidden.png')}</style>
 ${header(`<td width="24">${img('Parent attribute')}</td>`)}
 ${header(`<td style="width:9px;padding:0"><span><span>${img('Parent inline CSS','',' &lt;b&gt;blue &amp; gold&lt;/b&gt;')}</span></span></td>`,band,'','border="0"')}
 ${header(`<td>${img('Height only','height="40"')}</td>`,band,'<colgroup><col width="34"><col></colgroup>')}
 ${header(`<td width="52"><span>${img('Width only','width="112"')}</span></td>`)}
 ${header(`<td width="8%">${img('Large hints','width="640" height="480"')}</td>`)}
 ${header(`<td class="skinny">${img('Stylesheet only')}</td>`,'class="sheet"')}
 ${header(`<td width="65%">${img('Wide illustration','width="640" height="480"')}</td>`)}
 ${header('<td width="22"><span><img src="cid:fixture@example.test" alt="Unavailable inline symbol"></span></td>')}
 <table border="0" width="100%" bgcolor="#fff" style="color:#172436;font-size:14px">
 <caption>Instrument readings</caption><colgroup><col width="48%"><col width="29%"><col width="23%"></colgroup>
 <thead><tr><th scope="col">Sensor</th><th align="right" scope="col">Value</th><th scope="col">Chart</th></tr></thead>
 <tbody><tr><th scope="row">North array</th><td align="right">52.4</td><td>${img('Data cell')}</td></tr>
 <tr><th scope="row">South array</th><td align="right">38.6</td><td>None</td></tr></tbody></table>
 <p><img width="640" height="480" src="${origin}/standalone.png" alt="Standalone observatory panorama"></p>
 <table role="presentation" width="100%"><tr><td><img src="${origin}/panel.png" alt="Standalone image in a table"></td></tr></table>
 <p><img src="/unavailable.png" alt="Unavailable archive chart"></p>
 <span class="hidden" style="background-image:url('${origin}/inline.png')"></span>`);
};
