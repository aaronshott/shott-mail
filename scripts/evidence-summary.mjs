import {readFileSync} from 'node:fs';
const base=process.argv[2]??'../logs';
const audit=JSON.parse(readFileSync(base+'/b1-npm-audit.json','utf8'));
const inventory=JSON.parse(readFileSync(base+'/b1-license-inventory.json','utf8'));
const tests=readFileSync(base+'/b1-final-tests.log','utf8');
const match=(key)=>Number(tests.match(new RegExp('ℹ '+key+' (\\d+)'))?.[1]??NaN);
const summary={node:process.version,tests:{total:match('tests'),passed:match('pass'),failed:match('fail')},vulnerabilities:audit.metadata?.vulnerabilities,licenses:{lockEntries:inventory.packageCount,installedCount:inventory.installedCount,unknown:inventory.unknownLicenses,missingNoticeFiles:inventory.missingNoticeFiles,notInstalledCount:inventory.notInstalled.length},fullThreatChecksCompleted:false,containerExecuted:false,realDovecotPostfixAcceptanceExecuted:false};
if(!Number.isInteger(summary.tests.total))throw new Error('Missing test totals');
console.info(JSON.stringify(summary,null,2));
