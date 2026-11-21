import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {buildApp} from '../src/server/app.ts';
import {discover} from '../src/server/folders.ts';

test('preferences are authenticated, validated, isolated and persistent',async()=>{
 const dir=mkdtempSync('.navigation-');
 const password=randomBytes(24).toString('hex'), origin='http://127.0.0.1';
 const c={dbPath:join(dir,'app.sqlite'),key:randomBytes(32),password,origin,secureCookie:false,sessionMs:3600000,staticRoot:join(dir,'none')};
 let app=await buildApp(c);
 async function login(login:string){
  const r=await app.inject({method:'POST',url:'/api/login',headers:{origin},payload:{login,password}});
  assert.equal(r.statusCode,200);
  return {origin,cookie:r.cookies[0].name+'='+r.cookies[0].value,'x-csrf-token':r.json().csrf as string};
 }
 try{
  // Simulate opening an existing schema-10 installation without preferences.
  await app.close();
  const db=new DatabaseSync(c.dbPath);db.exec('DROP TABLE user_preferences');db.close();
  app=await buildApp(c);
  const url='/api/preferences', defaults={language:'nl',theme:'system'}, chosen={language:'en',theme:'dark'};
  assert.equal((await app.inject(url)).statusCode,401);
  const admin=await login('admin');
  assert.deepEqual((await app.inject({url,headers:admin})).json(),defaults);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/users',headers:admin,payload:{login:'other',password}})).statusCode,201);
  assert.equal((await app.inject({method:'PUT',url,headers:{...admin,'x-csrf-token':'wrong'},payload:chosen})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url,headers:admin,payload:{...chosen,userId:2}})).statusCode,400);
  assert.equal((await app.inject({method:'PUT',url,headers:admin,payload:{...chosen,theme:'purple'}})).statusCode,400);
  assert.deepEqual((await app.inject({method:'PUT',url,headers:admin,payload:chosen})).json(),chosen);
  const other=await login('other');
  assert.deepEqual((await app.inject({url,headers:other})).json(),defaults);
  await app.close(); app=await buildApp(c);
  assert.deepEqual((await app.inject({url,headers:await login('admin')})).json(),chosen);
  assert.deepEqual((await app.inject({url,headers:await login('other')})).json(),defaults);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('folder hierarchy uses per-entry delimiter without changing identities',async()=>{
 const {buildFolderTree}=await import('../src/client/navigation.js');
 const parent={id:'p',path:'Team',delimiter:'.',selectable:true};
 const child={id:'c',path:'Team.Shared',delimiter:'.',selectable:false};
 const leaf={id:'l',path:'Team.Shared.Bèta/Raw',delimiter:'.',selectable:true};
 const absent={id:'a',path:'/Root/Absent/子',delimiter:'/',selectable:true};
 const flat={id:'f',path:'Team.Flat',delimiter:null,selectable:true};
 const tree=buildFolderTree([leaf,parent,absent,flat,child]);
 const p=tree.find(n=>n.folder===parent)!;
 assert.equal(p.children[0].folder,child);
 assert.equal(p.children[0].children[0].folder,leaf);
 assert.equal(p.children[0].children[0].label,'Bèta/Raw');
 const root=tree.find(n=>n.path==='/Root')!;
 assert.equal(root.folder,null);
 assert.equal(root.children[0].folder,null);
 assert.equal(root.children[0].children[0].folder,absent);
 assert.equal(tree.find(n=>n.folder===flat)?.label,'Team.Flat');
});

test('automatic single-account selection does not become an explicit multi-account choice',async()=>{
 const {accountFilter}=await import('../src/client/navigation.js');
 const a={id:'a'},b={id:'b'};
 assert.equal(accountFilter([],null),'all');
 assert.equal(accountFilter([a],null),'a');
 assert.equal(accountFilter([a,b],null),'all');
 assert.equal(accountFilter([a,b],'b'),'b');
 assert.equal(accountFilter([a,b],'all'),'all');
 assert.equal(accountFilter([a],'b'),'a');
 assert.equal(accountFilter([a,b], 'removed'),'all');
});

test('LIST carries the delimiter without changing canonical paths or IDs',async()=>{
 const listed=[{path:'Team.Shared',pathAsListed:'Team.Shared',delimiter:'.',flags:new Set(['\\Noselect'])},
  {path:'Root/Leaf',pathAsListed:'/Root/Leaf',delimiter:'/',flags:new Set()},
  {path:'Literal.Dot',pathAsListed:'Literal.Dot',delimiter:null,flags:new Set()}];
 const client={list:async()=>listed} as unknown as Parameters<typeof discover>[0];
 const imap={host:'mail.invalid',port:993,tls:'implicit' as const,user:'fixture'};
 const account={id:'synthetic',label:'Test',address:'fixture@example.test',imap,smtp:imap};
 const byPath=new Map((await discover(client,account)).map(f=>[f.path,f]));
 assert.equal(byPath.get('Team.Shared')?.delimiter,'.');
 assert.equal(byPath.get('Team.Shared')?.selectable,false);
 assert.equal(byPath.get('/Root/Leaf')?.delimiter,'/');
 assert.equal(byPath.get('Literal.Dot')?.delimiter,null);
 listed[0].delimiter=null;
 assert.equal((await discover(client,account)).find(f=>f.path==='Team.Shared')?.id,byPath.get('Team.Shared')?.id);
});