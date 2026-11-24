import assert from 'node:assert/strict';

const paths=['/alpha.svg','/missing.png','/invalid.png'];
const names=['Clear & blue illustration','Archive illustration','Unreadable illustration'];
const img='document.querySelector("img")';

export async function runImageLoad({call,evaluate,poll,run,gesture,imageFrames,external,shot,record}){
 const expected=[];
 const checkTraffic=seen=>{
  assert.deepEqual(seen.map(r=>r.path).sort(),[...expected].sort());
  assert.ok(seen.every(r=>!r.cookie&&!r.referer&&!r.authorization));
  assert.ok(external.every(url=>expected.includes(new URL(url).pathname)));
 };
 record.cases=[];
 for(const [index,indices] of [[0,[0]],[1,[1]],[2,[0,1,2]]]){
  const before=await run('imageLoadBefore',String(index));
  checkTraffic(before.requests);
  if(!index)assert.equal(before.connections,0);
  assert.equal(imageFrames.size,0);
  await gesture(before.point);
  const frames=await poll(async()=>{
   if(imageFrames.size!==indices.length)return;
   const states=await Promise.all([...imageFrames.entries()].map(async ([id,session])=>{
    const state=await evaluate(`(async()=>{const i=${img};if(!i?.complete||!i.currentSrc)return null;
     const decoded=await i.decode().then(()=>true,()=>false);
     return {path:new URL(i.currentSrc).pathname,alt:i.alt,decoded,size:[i.width,i.height],natural:[i.naturalWidth,i.naturalHeight],
     focusable:!!document.querySelector('a,button,[tabindex],script,[onerror],[onload]'),scroll:[document.documentElement.scrollWidth-innerWidth,document.documentElement.scrollHeight-innerHeight]};})()`,true,session);
    return state&&{...state,id,session};
   }));
   return states.every(Boolean)?states:null;
  });
  expected.push(...indices.map(i=>paths[i]));
  assert.deepEqual(frames.map(f=>f.path).sort(),indices.map(i=>paths[i]).sort());
  const item={preconsent:before.requests.length,frames:[]};record.cases.push(item);
  for(const [domIndex,i] of indices.entries()){
   const {id,session,...state}=frames.find(f=>f.path===paths[i]);
   const {nodes}=await call('Accessibility.getFullAXTree',{},session);
   assert.deepEqual(nodes.filter(n=>!n.ignored&&n.role.value==='image').map(n=>n.name.value),[names[i]]);
   assert.equal(state.alt,names[i]);assert.equal(state.focusable,false);
   const {backendNodeId}=await call('DOM.getFrameOwner',{frameId:id});
   const {object:{objectId}}=await call('DOM.resolveNode',{backendNodeId});
   const {result:{value:rect}}=await call('Runtime.callFunctionOn',{objectId,returnByValue:true,functionDeclaration:`function(){
    if(this.getAttribute('sandbox')!==''||!this.hasAttribute('credentialless')||this.referrerPolicy!=='no-referrer'||this.contentDocument!==null||
       this!==document.querySelectorAll('.formatted-mail iframe')[${domIndex}])throw Error('Frame isolation or order changed');
    this.scrollIntoView({block:'center'});const r=this.getBoundingClientRect();return {x:Math.ceil(r.left+scrollX),y:Math.ceil(r.top+scrollY),size:[r.width,r.height]};}`});
   assert.deepEqual(rect.size,[96,48]);
   const capture=(x,y,width,height)=>call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip:{x:rect.x+x,y:rect.y+y,width,height,scale:1}}).then(r=>r.data);
   const pixels=async()=>[await capture(0,0,14,14),await capture(18,0,74,17),await capture(0,19,92,24),await capture(43,4,30,38)];
   const visible=await pixels();
   await evaluate(`${img}.style.visibility='hidden'`,false,session);
   const hidden=await pixels();
   await evaluate(`${img}.style.removeProperty('visibility')`,false,session);
   const changed=visible.map((r,j)=>r!==hidden[j]);
   if(i===0){
    assert.equal(state.decoded,true);assert.deepEqual(state.size,[96,48]);assert.deepEqual(state.natural,[96,48]);
    assert.deepEqual(changed,[false,true,true,true],'Transparent successful image gained fallback pixels or lost artwork');
   }else{
    assert.equal(state.decoded,false);assert.deepEqual(state.natural,[0,0]);
   }
   item.frames.push({...state,changed});
  }
  await shot(`image-load-${index}`,true);
 }
 const reset=await run('imageLoadReset');checkTraffic(reset.requests);
 assert.equal(imageFrames.size,0);record.requests=reset.requests;record.browserRequests=[...external];
 for(const item of record.cases)for(const frame of item.frames)if(!frame.decoded){
  assert.deepEqual(frame.changed,[true,false,false,false],'Failed image must paint only the local marker, never native inline alt');
  assert.deepEqual(frame.scroll,[0,0],'Failed image should not add an inner scroll range');
 }
 return {passed:true};
}
