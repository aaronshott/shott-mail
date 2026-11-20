import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const packages=Object.entries(lock.packages).filter(([path])=>path).map(([path,pkg])=>{
  const files=readdirSync(path).filter(name=>/^(license|licence|copying|notice)(\.|$)/i.test(name));
  return {path,version:pkg.version,license:pkg.license??'UNKNOWN',notices:files.map(name=>({name,sha256:createHash('sha256').update(readFileSync(join(path,name))).digest('hex')}))};
});
const db=new DatabaseSync(':memory:');
const sqlite=db.prepare('SELECT sqlite_version() AS version').get().version;db.close();
console.log(JSON.stringify({node:process.version,sqlite,packageCount:packages.length,packages,
  unknownLicenses:packages.filter(p=>p.license==='UNKNOWN').map(p=>p.path),
  missingNoticeFiles:packages.filter(p=>p.notices.length===0).map(p=>p.path),
  note:'Metadata and notice inventory, not full transitive legal review or release approval.'},null,2));
