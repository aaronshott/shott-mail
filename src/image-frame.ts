// Match the iframe element's color scheme so Chromium composites the
// transparent image canvas over the mail's local surface in either app theme.
const layout='html,body{margin:0;height:100%;color-scheme:light;background:transparent}img{display:block;max-width:100%;max-height:100%;width:auto;height:auto}';
// Allow exactly the fixed layout, including in the inherited srcdoc CSP.
export const imageStyleHash="'sha256-PMTY6otxIvEwiKApY3VhRBXWVicfKflLT0emQeDECv0='";
const attribute=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');

// Called only with a checked URL and alt text, after the current view's trusted click.
// No original message HTML, scripts, same-origin permission or app credentials.
export function imageFrameDocument(url:string,alt:string):string {
 return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">`+
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src ${imageStyleHash}; base-uri 'none'; form-action 'none'">`+
  `<style>${layout}</style><img src="${attribute(url)}" alt="${attribute(alt)}" referrerpolicy="no-referrer">`;
}