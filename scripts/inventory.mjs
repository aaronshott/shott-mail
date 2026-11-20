import {readFileSync,readdirSync,existsSync,statSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));let notices='Shott Mail: installed dependency license/notice texts. Optional packages absent on this platform are listed in the inventory, not covered by these texts. This is not legal clearance.\n';
const packages=Object.entries(lock.packages).filter(([path])=>path).map(([path,pkg])=>{
 const installed=existsSync(path);const files=installed?readdirSync(path).filter(name=>/^(license|licence|copying|notice)(\.|$)/i.test(name)&&statSync(join(path,name)).isFile()):[];
 for(const name of files)notices+=`\n===== ${path} ${pkg.version} / ${name} =====\n${readFileSync(join(path,name),'utf8')}\n`;
 return {path,version:pkg.version,license:pkg.license??'UNKNOWN',installed,optional:pkg.optional??false,notices:files.map(name=>({name,sha256:createHash('sha256').update(readFileSync(join(path,name))).digest('hex')}))};
});
const db=new DatabaseSync(':memory:');const sqlite=db.prepare('SELECT sqlite_version() AS version').get().version;db.close();
if(process.argv.includes('--notices'))writeFileSync('THIRD_PARTY_NOTICES.txt',notices.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n');
console.log(JSON.stringify({node:process.version,sqlite,packageCount:packages.length,installedCount:packages.filter(p=>p.installed).length,packages,unknownLicenses:packages.filter(p=>p.license==='UNKNOWN').map(p=>p.path),missingNoticeFiles:packages.filter(p=>p.installed&&p.notices.length===0).map(p=>p.path),notInstalled:packages.filter(p=>!p.installed).map(p=>p.path),note:'Metadata and notice inventory; absent optional-platform packages and container OS require separate review. Not full transitive legal review or release approval.'},null,2));
