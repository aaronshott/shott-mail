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
