import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {hash,hashSync,verify} from '@node-rs/argon2';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {Store} from './store.ts';
import {OWNER_LOGIN,passwordOptions} from './schema.ts';
import {routes} from './routes.ts';
import {inboxRoutes} from './inbox.ts';
import staticPlugin from '@fastify/static';
import {existsSync} from 'node:fs';

import type {MailPolicy} from './mail-policy.ts';
export type Config=MailPolicy & {dbPath:string;key:Buffer;password:string;origin:string;secureCookie:boolean;sessionMs:number;staticRoot:string;dir?:string;loginAttempts?:number;bodyLimit?:number;sqliteBusyMs?:number};
type Principal={userId:number;login:string;role:'admin'|'user';csrf:string};
declare module 'fastify' { interface FastifyRequest { principal:Principal|null } }
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const loginName=z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/).transform(s=>s.toLowerCase());
const loginBody=z.object({login:loginName,password:z.string().max(1024)}).strict();
const userBody=z.object({login:loginName,password:z.string().min(16).max(1024)}).strict();
const preferences=z.object({language:z.enum(['nl','en']),theme:z.enum(['system','light','dark'])}).strict();
const publicPrincipal=({login,role,csrf}:Principal)=>({login,role,csrf});

export async function buildApp(c:Config){
 const store=new Store(c.dbPath,c.key,c.password,c.sqliteBusyMs);
 const db=store.db;
 const dummyHash=hashSync(randomBytes(32).toString('base64url'),passwordOptions);
 const app=Fastify({logger:false,bodyLimit:c.bodyLimit??262144,trustProxy:false});
 app.addHook('onClose',async()=>store.close());
 try{
 await app.register(cookie);
 app.decorateRequest('principal',null);
 const cookieName=c.secureCookie?'__Host-shottmail':'shottmail-local';
 let loginCount=0,windowStart=Date.now(); let hashing=false;
 app.addHook('onRequest',async(req,reply)=>{
  reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer');
  reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if(!req.routeOptions.url?.startsWith('/api/'))return;
  if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers.origin!==c.origin)return reply.code(403).send({error:'ORIGIN'});
  if(req.method==='POST'&&req.routeOptions.url==='/api/login')return;
  const token=req.cookies[cookieName];
  const session=token?db.prepare(`SELECT u.id AS userId,u.login,u.role,s.csrf FROM user_sessions s
   JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?`).get(digest(token),Date.now()) as Principal|undefined:undefined;
  if(!session)return reply.code(401).send({error:'LOGIN_REQUIRED'});
  const csrfHeader=req.headers['x-csrf-token'];
  if(req.method==='GET'||req.method==='HEAD'){
   if(csrfHeader!==undefined&&csrfHeader!==session.csrf)return reply.code(401).send({error:'LOGIN_REQUIRED'});
  }else if(csrfHeader!==session.csrf)return reply.code(403).send({error:'CSRF'});
  req.principal=session;
 });
 app.setErrorHandler((_error,_req,reply)=>reply.code(400).send({error:'REQUEST_FAILED'}));
 app.get('/health',async()=>({ok:true}));
 app.post('/api/login',async(req,reply)=>{
  // Only this exact route can create a session; its origin is checked above.
  if(req.headers.origin!==c.origin)return reply.code(403).send({error:'ORIGIN'});
  if(Date.now()-windowStart>60000){loginCount=0;windowStart=Date.now();}
  if(++loginCount>(c.loginAttempts??10)||hashing)return reply.code(429).send({error:'TRY_LATER'});
  const parsed=loginBody.safeParse(req.body);
  if(!parsed.success)return reply.code(401).send({error:'LOGIN_FAILED'});
  const {login,password}=parsed.data;
  const user=db.prepare('SELECT id,login,role,password_hash FROM users WHERE login=?').get(login);
  hashing=true;let valid=false;
  try{valid=await verify(String(user?.password_hash??dummyHash),password);}finally{hashing=false;}
  if(!user||!valid)return reply.code(401).send({error:'LOGIN_FAILED'});
  const old=req.cookies[cookieName];if(old)db.prepare('DELETE FROM user_sessions WHERE id=?').run(digest(old));
  db.prepare('DELETE FROM user_sessions WHERE expires<=?').run(Date.now());
  const token=randomBytes(32).toString('base64url'),csrf=randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO user_sessions (id,user_id,csrf,expires) VALUES(?,?,?,?)').run(digest(token),user.id!,csrf,Date.now()+c.sessionMs);
  reply.setCookie(cookieName,token,{httpOnly:true,secure:c.secureCookie,sameSite:'strict',path:'/',maxAge:Math.floor(c.sessionMs/1000)});
  return {csrf,login:user.login,role:user.role};
 });
 app.get('/api/session',async req=>publicPrincipal(req.principal!));
 app.get('/api/preferences',async req=>{
  const saved=db.prepare('SELECT language,theme FROM user_preferences WHERE user_id=?').get(req.principal!.userId);
  const result=preferences.safeParse(saved&&{...saved});
  return result.success?result.data:{language:'nl',theme:'system'};
 });
 app.put('/api/preferences',async req=>{
  const value=preferences.parse(req.body);
  db.prepare(`INSERT INTO user_preferences(user_id,language,theme) VALUES (?,?,?)
   ON CONFLICT(user_id) DO UPDATE SET language=excluded.language,theme=excluded.theme`)
   .run(req.principal!.userId,value.language,value.theme);
  return value;
 });
 app.post('/api/logout',async(req,reply)=>{
  db.prepare('DELETE FROM user_sessions WHERE id=? AND user_id=?').run(digest(req.cookies[cookieName]!),req.principal!.userId);
  reply.clearCookie(cookieName,{path:'/',secure:c.secureCookie,httpOnly:true,sameSite:'strict'});return {ok:true};
 });
 app.get('/api/admin/users',async(req,reply)=>{
  if(req.principal!.role!=='admin')return reply.code(403).send({error:'ADMIN_REQUIRED'});
  return db.prepare('SELECT login,role FROM users ORDER BY login').all();
 });
 app.post('/api/admin/users',async(req,reply)=>{
  if(req.principal!.role!=='admin')return reply.code(403).send({error:'ADMIN_REQUIRED'});
  const {login,password}=userBody.parse(req.body);
  if(login===OWNER_LOGIN||db.prepare('SELECT 1 FROM users WHERE login=?').get(login))return reply.code(409).send({error:'LOGIN_EXISTS'});
  if(hashing)return reply.code(429).send({error:'TRY_LATER'});
  hashing=true;
  try{
   const passwordHash=await hash(password,passwordOptions);
   const result=db.prepare("INSERT INTO users(login,password_hash,role) VALUES(?,?,'user') ON CONFLICT(login) DO NOTHING").run(login,passwordHash);
   if(result.changes!==1)return reply.code(409).send({error:'LOGIN_EXISTS'});
   return reply.code(201).send({login,role:'user'});
  }finally{hashing=false;}
 });
 app.get('/api/config',async()=>({maxDraftChars:c.maxDraftChars??200000,mailMode:c.mailMode??'disabled'}));
 app.get('/api/accounts',async req=>store.listAccounts(req.principal!.userId));
 if(c.mailMode==='public'){
  const networkRoutes=new Set(['/api/accounts/:id/test','/api/drafts/:id/send','/api/inbox','/api/messages/:account/:validity/:uid',
   '/api/accounts/:account/folders','/api/accounts/:account/folders/:folder/messages','/api/accounts/:account/folders/:folder/messages/:validity/:uid','/api/accounts/:id/sent','/api/drafts/:id/check-sent']);
  const requests=new Map<number,number>();let windowEnd=0,active=0;
  app.addHook('onRoute',route=>{
   if(!networkRoutes.has(route.url))return;
   const handler=route.handler;
   route.handler=async function(req,reply){
    const user=req.principal!.userId;
    const now=Date.now();if(now>=windowEnd){requests.clear();windowEnd=now+60000;}
    const used=requests.get(user)??0;
    if(active>=8||used>=20)return reply.code(429).send({error:'TRY_LATER'});
    requests.set(user,used+1);active++;
    try{return await handler.call(this,req,reply);}finally{active--;}
   };
  });
 }
 routes(app,store,c);
 inboxRoutes(app,store,c);
 if(existsSync(c.staticRoot))await app.register(staticPlugin,{root:c.staticRoot,index:['index.html']});
 return app;
 }catch(error){await app.close();throw error;}
}
