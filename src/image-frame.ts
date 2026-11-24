// Match the iframe element's color scheme so Chromium composites the
// transparent image canvas over the mail's local surface in either app theme.
// Blink generates these pseudo-elements for the non-replaced fallback, not
// for a decoded image. Keep the real alt for AX; place the native fallback
// beyond the clipped viewport, rather than painting over image transparency.
const layout='html,body{margin:0;height:100%;color-scheme:light;background:transparent}'+
 'img{display:block;position:relative;overflow:clip;max-width:100%;max-height:100%;width:auto;height:auto}'+
 'img::before,img::after{content:"";width:min(15px,100%);height:15px}'+
 'img::before{display:block;margin-block-end:100vh;border-radius:3px;background:#f3f5f2}'+
 'img::after{position:absolute;top:0;left:0;background:#243c36;mask:url(#unavailable)}'+
 'svg{position:absolute;width:0;height:0}';
// Allow exactly the fixed layout, including in the inherited srcdoc CSP.
export const imageStyleHash="'sha256-ACrKPhjOGSy3p5KOhnxu3SqKZ5rkY4EB5/uyLXAZYvE='";
const attribute=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
// Shared app geometry, never sender SVG. The mask is document-local, not an image URL.
export const unavailableImagePath='M3 7v9h9m5-3V4H8M4 14l3-3 2 2m3-4 1-1 3 3M2 2l16 16';
const unavailableMask='<svg aria-hidden="true" focusable="false"><mask id="unavailable" maskContentUnits="objectBoundingBox">'+
 `<path d="${unavailableImagePath}" transform="scale(.05)" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></mask></svg>`;

// Called only with a checked URL and alt text, after the current view's trusted click.
// No original message HTML, scripts, same-origin permission or app credentials.
export function imageFrameDocument(url:string,alt:string):string {
 return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer">`+
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src ${imageStyleHash}; base-uri 'none'; form-action 'none'">`+
  `<style>${layout}</style>${unavailableMask}<img src="${attribute(url)}" alt="${attribute(alt)}" referrerpolicy="no-referrer">`;
}