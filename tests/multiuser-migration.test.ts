import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {hashSync} from '@node-rs/argon2';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {buildApp} from '../src/server/app.ts';
import {Store} from '../src/server/store.ts';

// Exact B1 table layout and AES-GCM format from 2142aab. No in-place writes to authentic data.
test('B1 migration requires original key and login proof; transfers only to owner, revokes old session, retains ciphertext and journal',async()=>{
 mkdirSync('.test-data',{recursive:true,mode:0o700});const dir=mkdtempSync(resolve('.test-data/migration-'));
 const key=randomBytes(32),password=randomBytes(24).toString('base64url');
 const c={dbPath:join(dir,'app.sqlite'),key,password,origin:'http://127.0.0.1:3000',secureCookie:false,allowedMail:[],sessionMs:60000,staticRoot:resolve('dist/client')};
 const seal=(value:string,binding:string)=>{
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(Buffer.from(`shott-mail:v1:${binding}`));const ciphertext=Buffer.concat([cipher.update(value),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),ciphertext]).toString('base64');
 };
 const account=randomUUID(),sent=randomUUID(),pending=randomUUID(),token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
 const credentials={imap:randomBytes(24).toString('base64url'),smtp:randomBytes(24).toString('base64url')};
 const ciphertext=seal(JSON.stringify(credentials),`account:${account}`),check=seal('shott-mail-key-check-v1','installation');
 const authHash=hashSync(password,{memoryCost:19456,timeCost:2,parallelism:1});
 const old={origin:c.origin,cookie:`shottmail-local=${token}`,'x-csrf-token':csrf};
 const ep={host:'mail.invalid',port:993,tls:'implicit',user:'legacy'};
 const metadata={label:'Owner mailbox',address:'owner@example.test',imap:ep,smtp:ep};
 const body={to:'recipient@example.test',subject:'Legacy draft',text:'Original owner only'};
 let app:Awaited<ReturnType<typeof buildApp>>|undefined;
 try{
  writeFileSync(c.dbPath,'',{mode:0o600});
  const legacy=new DatabaseSync(c.dbPath);
  try{
   legacy.exec(`CREATE TABLE meta (id INTEGER PRIMARY KEY CHECK(id=1), check_value TEXT NOT NULL);
    CREATE TABLE accounts (id TEXT PRIMARY KEY, metadata TEXT NOT NULL, credentials TEXT NOT NULL);
    CREATE TABLE drafts (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), revision INTEGER NOT NULL, body TEXT NOT NULL);
    CREATE TABLE auth (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE sends (id TEXT PRIMARY KEY REFERENCES drafts(id), state TEXT NOT NULL, result TEXT NOT NULL);`);
   legacy.prepare('INSERT INTO meta VALUES(1,?)').run(check);
   legacy.prepare('INSERT INTO auth VALUES(1,?)').run(authHash);
   legacy.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),csrf,Date.now()+60000);
   legacy.prepare('INSERT INTO accounts VALUES(?,?,?)').run(account,JSON.stringify(metadata),ciphertext);
   for(const [id,state] of [[sent,'accepted'],[pending,'submitting']]){
    legacy.prepare('INSERT INTO drafts VALUES(?,?,?,?)').run(id,account,4,JSON.stringify(body));
    legacy.prepare('INSERT INTO sends VALUES(?,?,?)').run(id,state,JSON.stringify({accepted:[body.to],rejected:[]}));
   }
  }finally{legacy.close();}
  await assert.rejects(buildApp({...c,key:randomBytes(32)}),/KEY_MISMATCH/);
  await assert.rejects(buildApp({...c,password:randomBytes(24).toString('base64url')}),/B1_OWNER_SECRET_MISMATCH/);
  const unchanged=new DatabaseSync(c.dbPath,{readOnly:true});
  try{
   assert.equal(unchanged.prepare('PRAGMA user_version').get()?.user_version,0);
   assert.equal(unchanged.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n,1);
   assert.equal(unchanged.prepare('SELECT credentials FROM accounts').get()?.credentials,ciphertext);
  }finally{unchanged.close();}
  app=await buildApp(c);
  assert.equal((await app.inject({url:'/api/session',headers:old})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/admin/users',headers:old,payload:{login:'first',password}})).statusCode,401);
  const signin=async(login:string,password:string)=>{
   const response=await app!.inject({method:'POST',url:'/api/login',headers:{origin:c.origin},payload:{login,password}});
   assert.equal(response.statusCode,200);
   return {origin:c.origin,cookie:String(response.headers['set-cookie']).split(';')[0],'x-csrf-token':response.json().csrf};
  };
  const admin=await signin('admin',password);
  const newPassword=randomBytes(24).toString('base64url');
  assert.equal((await app.inject({method:'POST',url:'/api/admin/users',headers:admin,payload:{login:'newuser',password:newPassword}})).statusCode,201);
  const user=await signin('newuser',newPassword);
  assert.deepEqual((await app.inject({url:'/api/accounts',headers:user})).json(),[]);
  assert.deepEqual((await app.inject({url:'/api/drafts',headers:user})).json(),[]);
  assert.deepEqual((await app.inject({url:'/api/accounts',headers:admin})).json(),[{...metadata,id:account}]);
  const drafts=(await app.inject({url:'/api/drafts',headers:admin})).json();
  assert.equal(drafts.length,2);
  assert.deepEqual(drafts.find((d:{id:string})=>d.id===sent),{id:sent,accountId:account,revision:4,body,operation:{id:sent,state:'accepted',accepted:[body.to],rejected:[]}});
  assert.deepEqual(drafts.find((d:{id:string})=>d.id===pending)?.operation,{id:pending,state:'outcome_unknown'});
  await app.close();app=undefined;
  const store=new Store(c.dbPath,key,password);
  try{
   assert.equal(store.db.prepare('SELECT check_value FROM meta').get()?.check_value,check);
   assert.equal(store.db.prepare('SELECT password_hash FROM users WHERE login=?').get('admin')?.password_hash,authHash);
   assert.equal(store.db.prepare('SELECT credentials FROM mailboxes').get()?.credentials,ciphertext);
   const userId=Number(store.db.prepare('SELECT id FROM users WHERE login=?').get('admin')?.id);
   assert.ok(JSON.stringify(store.credentials(userId,account))===JSON.stringify(credentials),'existing key decrypts migrated credentials');
   assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);
   assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE name IN ('accounts','drafts','sends','auth','sessions')").get()?.n,0);
  }finally{store.close();}
  app=await buildApp(c);
  assert.equal((await app.inject({url:'/api/session',headers:old})).statusCode,401);
  assert.equal((await app.inject({url:'/api/session',headers:admin})).statusCode,200);
 }finally{await app?.close();rmSync(dir,{recursive:true,force:true});}
});
