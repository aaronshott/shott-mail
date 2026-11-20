import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {hash,verify} from '@node-rs/argon2';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Store} from './store.ts';
import {routes} from './routes.ts';
import {inboxRoutes} from './inbox.ts';
import staticPlugin from '@fastify/static';
import {existsSync} from 'node:fs';
export type Config={dbPath:string;key:Buffer;password:string;origin:string;secureCookie:boolean;allowedMail:string[];sessionMs:number;staticRoot:string;ca?:string;dir?:string;maxMessageBytes?:number;pageSize?:number;timeoutMs?:number;loginAttempts?:number;maxDraftChars?:number;bodyLimit?:number;sqliteBusyMs?:number};
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function buildApp(c:Config){
 const store=new Store(c.dbPath,c.key,c.sqliteBusyMs); const db=new DatabaseSync(c.dbPath);
 db.exec(`PRAGMA foreign_keys=ON;PRAGMA synchronous=FULL;PRAGMA busy_timeout=${c.sqliteBusyMs??5000};
 CREATE TABLE IF NOT EXISTS auth (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);`);
 if(!db.prepare('SELECT id FROM auth WHERE id=1').get()){
  if(c.password.length<16)throw new Error('INITIAL_PASSWORD_TOO_SHORT');
  db.prepare('INSERT INTO auth VALUES(1,?)').run(await hash(c.password,{memoryCost:19456,timeCost:2,parallelism:1}));
 }
 const app=Fastify({logger:false,bodyLimit:c.bodyLimit??262144,trustProxy:false});
 await app.register(cookie);
 const cookieName=c.secureCookie?'__Host-shottmail':'shottmail-local';
 let loginCount=0,windowStart=Date.now(); let hashing=false;
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
  reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if(!req.url.startsWith('/api/'))return;
  if(req.method!=='GET'&&req.headers.origin!==c.origin)return reply.code(403).send({error:'ORIGIN'});
  if(req.url==='/api/login')return;
  const token=req.cookies[cookieName];
  const session=token?db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(digest(token),Date.now()):undefined;
  if(!session)return reply.code(401).send({error:'LOGIN_REQUIRED'});
  if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)return reply.code(403).send({error:'CSRF'});
 });
 app.setErrorHandler((_error,_req,reply)=>reply.code(400).send({error:'REQUEST_FAILED'}));
 app.get('/health',async()=>({ok:true}));
 app.post('/api/login',async(req,reply)=>{
  if(Date.now()-windowStart>60000){loginCount=0;windowStart=Date.now();}
  if(++loginCount>(c.loginAttempts??10)||hashing)return reply.code(429).send({error:'TRY_LATER'});
  const password=(req.body as {password?:unknown})?.password;
  if(typeof password!=='string'||password.length>1024)return reply.code(401).send({error:'LOGIN_FAILED'});
  hashing=true;let valid=false;
  try{valid=await verify(String(db.prepare('SELECT hash FROM auth WHERE id=1').get()!.hash),password);}finally{hashing=false;}
  if(!valid)return reply.code(401).send({error:'LOGIN_FAILED'});
  const old=req.cookies[cookieName];if(old)db.prepare('DELETE FROM sessions WHERE id=?').run(digest(old));
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),csrf,Date.now()+c.sessionMs);
  reply.setCookie(cookieName,token,{httpOnly:true,secure:c.secureCookie,sameSite:'strict',path:'/',maxAge:Math.floor(c.sessionMs/1000)});
  return {csrf};
 });
 app.get('/api/session',async req=>{const token=req.cookies[cookieName]!;return {csrf:db.prepare('SELECT csrf FROM sessions WHERE id=?').get(digest(token))!.csrf};});
 app.post('/api/logout',async(req,reply)=>{
  db.prepare('DELETE FROM sessions WHERE id=?').run(digest(req.cookies[cookieName]!));reply.clearCookie(cookieName,{path:'/',secure:c.secureCookie,httpOnly:true,sameSite:'strict'});return {ok:true};
 });
 app.get('/api/config',async()=>({maxDraftChars:c.maxDraftChars??200000}));
 app.get('/api/accounts',async()=>store.listAccounts());
 routes(app,db,store,c);
 inboxRoutes(app,store,c);
 if(existsSync(c.staticRoot))await app.register(staticPlugin,{root:c.staticRoot,index:['index.html']});
 app.addHook('onClose',async()=>{db.close();store.close();});
 return app;
}
