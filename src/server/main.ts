import {readFileSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildApp,type Config} from './app.ts';
import {z} from 'zod';
process.umask(0o077);
const positive=(value:string|undefined,fallback:number)=>z.coerce.number().int().positive().parse(value??fallback);
function secret(path:string){const stat=lstatSync(path);if(!stat.isFile()||(stat.mode&0o077)!==0)throw new Error('SECRET_FILE_PERMISSIONS');return readFileSync(path);}
const origin=z.url().parse(process.env.APP_ORIGIN??'http://127.0.0.1:3000');const url=new URL(origin);
if(url.origin!==origin)throw new Error('ORIGIN_MUST_NOT_INCLUDE_PATH');
const secureCookie=url.protocol==='https:';
if(!secureCookie&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('HTTPS_REQUIRED_EXCEPT_LOOPBACK');
const config:Config={dbPath:resolve(process.env.DB_PATH??'data/app.sqlite'),key:secret(process.env.KEY_FILE??'secrets/key'),password:secret(process.env.PASSWORD_FILE??'secrets/login').toString().trim(),origin,secureCookie,allowedMail:(process.env.MAIL_ALLOWLIST??'').split(',').filter(Boolean),sessionMs:positive(process.env.SESSION_MS,28800000),staticRoot:resolve('dist/client'),...(process.env.MAIL_CA_FILE?{ca:readFileSync(process.env.MAIL_CA_FILE,'utf8')}:{}),maxMessageBytes:positive(process.env.MAX_MESSAGE_BYTES,2097152),pageSize:positive(process.env.INBOX_PAGE_SIZE,50),timeoutMs:positive(process.env.MAIL_TIMEOUT_MS,10000),loginAttempts:positive(process.env.LOGIN_ATTEMPTS_PER_MINUTE,10),bodyLimit:positive(process.env.BODY_LIMIT_BYTES,262144),maxDraftChars:positive(process.env.MAX_DRAFT_CHARS,200000),sqliteBusyMs:positive(process.env.SQLITE_BUSY_MS,5000)};
const app=await buildApp(config);
await app.listen({host:process.env.BIND_HOST??'127.0.0.1',port:positive(process.env.PORT,3000)});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{app.close().then(()=>process.exit(0));});
console.info('Shott Mail gestart. Logging bevat geen mailboxinhoud of credentials.');
