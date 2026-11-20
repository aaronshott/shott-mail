import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';import {execFileSync} from 'node:child_process';
process.umask(0o077);mkdirSync('secrets',{recursive:true,mode:0o700});mkdirSync('data',{recursive:true,mode:0o700});
function create(path,value){if(!existsSync(path))writeFileSync(path,value,{mode:0o600,flag:'wx'});}
if(existsSync('data/app.sqlite')&&(!existsSync('secrets/key')||!existsSync('secrets/login'))){
 throw new Error('EXISTING_DATABASE_REQUIRES_EXISTING_KEY_AND_LOGIN_FILE');
}
create('secrets/key',randomBytes(32));create('secrets/login',randomBytes(24).toString('base64url')+'\n');
for(const user of ['work','private'])create(`secrets/${user}`,randomBytes(24).toString('base64url')+'\n');
if(!existsSync('secrets/mail.crt')){
 execFileSync('openssl',['req','-x509','-newkey','rsa:3072','-nodes','-keyout','secrets/mail.key','-out','secrets/mail.crt','-days','30','-subj','/CN=mail','-addext','subjectAltName=DNS:mail,IP:127.0.0.1'],{stdio:'ignore'});
}
console.info('Secrets lokaal aangemaakt/behouden; waarden worden niet gelogd. Login: secrets/login. Testaccounts: secrets/work en secrets/private. Certificaat 30 dagen geldig.');
