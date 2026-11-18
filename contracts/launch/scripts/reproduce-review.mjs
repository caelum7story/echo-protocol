import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {sha256,verifyReviewBundle} from './review-bundle.mjs';

const [bundleArg,outputArg,...extra]=process.argv.slice(2);
if(!bundleArg||!outputArg||extra.length)throw Error('Usage: node scripts/reproduce-review.mjs <extracted-bundle> <new-report-directory>');
const bundle=fs.realpathSync(bundleArg),output=path.resolve(outputArg),backend=path.join(bundle,'outputs/echo-launch-contracts-v1'),frontend=path.join(bundle,'outputs/echo-mint-preview-20261105');
if(fs.existsSync(output)||output===bundle||output.startsWith(bundle+path.sep)||bundle.startsWith(output+path.sep))throw Error('Report directory must be new and outside the bundle');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Reproduction requires Node24');
const initial=verifyReviewBundle(bundle,{installed:true}),manifest=JSON.parse(fs.readFileSync(path.join(bundle,'REVIEW-MANIFEST.json'),'utf8'));
const dependencies=path.join(backend,'node_modules');if(fs.lstatSync(dependencies).isSymbolicLink())throw Error('Fresh local dependencies required,no symlink to another checkout');
const require=createRequire(path.join(backend,'package.json')),resolved={};
for(const name of ['ethers','solc','@nomicfoundation/edr']){const file=fs.realpathSync(require.resolve(name));if(!file.startsWith(fs.realpathSync(dependencies)+path.sep))throw Error('Dependency resolved outside the extracted bundle: '+name);resolved[name]=path.relative(bundle,file).split(path.sep).join('/');}
fs.mkdirSync(output,{recursive:true});
// Check native storage/recovery first so platform failures fail early.
const commands=[
 ['bundle-integrity-tests',backend,['--test','--test-reporter=tap','test/review-bundle.test.mjs']],
 ['confirmed-release-configuration',backend,['--test','--test-reporter=tap','test/release-config.test.mjs']],
 ['confirmed-release-pins',backend,['scripts/check-release-config.mjs']],
 ['readonly-release-network-negative-cases',backend,['--test','--test-reporter=tap','test/release-preflight.test.mjs']],
 ['public-read-transport',backend,['--test','--test-concurrency=1','--test-reporter=tap','test/public-read-server.test.mjs','test/public-read-cli.test.mjs']],
 ['recipient-reentrancy-and-payout',backend,['scripts/test-recipient-adversarial.mjs']],
 ['sqlite-long-path-recovery',backend,['--test','--test-reporter=tap','test/sqlite-windows-path.test.mjs']],
 ['index-wal-backup',backend,['scripts/test-index-backup.mjs']],
 ['distribution-backup',backend,['scripts/test-distribution-backup.mjs']],
 ['distribution-budget',backend,['scripts/test-distribution-budget.mjs']],
 ['distribution-service',backend,['scripts/test-distribution-service.mjs']],
 ['distribution-monitor',backend,['scripts/test-distribution-monitor.mjs']],
 ['distribution-queue',backend,['scripts/test-distribution-queue.mjs']],
 ['full-local-lifecycle',backend,['scripts/test.mjs']],
 ['lifecycle-cutoff-boundaries',backend,['scripts/test-lifecycle-boundaries.mjs']],
 ['initial-deployment-route',backend,['scripts/test-deployment-route.mjs']],
 ['deployment-receipt-recovery',backend,['scripts/test-deployment-recovery.mjs']],
 ['boundary-browser-evidence',backend,['--test','--test-reporter=tap','test/boundary-browser-evidence.test.mjs']],
 ['nft-content',backend,['scripts/test-nft-content.mjs']],
 ['exact-dex-runtime',backend,['scripts/test-official-dex.mjs']],
 ['strict-oracle-boundaries',backend,['scripts/test-oracle-boundaries.mjs']],
 ['rounding-comparison',backend,['scripts/compare-rounding-policy.mjs']],
 ['accounting-evidence',backend,['scripts/test-accounting-evidence.mjs']],
 ['frontend',frontend,['scripts/test-launch-handoff.mjs']]
],observations=[];
function write(terminal=false){const immutableMismatches=manifest.files.filter(f=>f.role!=='evidence-snapshot').filter(f=>{try{return sha256(fs.readFileSync(path.join(bundle,...f.path.split('/'))))!==f.sha256;}catch{return true;}}).map(f=>f.path),report={schema:'echo-launch-review-reproduction/v1',observedAt:new Date().toISOString(),terminal,bundle,initialIntegrity:initial,node:process.version,dependencyResolution:resolved,symlinkedDependencies:false,checks:observations,immutableInputsUnchanged:immutableMismatches.length===0,immutableMismatches,passed:terminal&&observations.length===commands.length&&observations.every(r=>r.exitCode===0)&&immutableMismatches.length===0,localOnly:true,publicTransactions:false,realWalletUsed:false,uploaded:false,independentReview:false,productionReady:false};fs.writeFileSync(path.join(output,'reproduction.json'),JSON.stringify(report,null,2)+'\n');return report;}
write();
for(const [name,cwd,args]of commands){
 const startedAt=new Date().toISOString(),stream=fs.createWriteStream(path.join(output,name+'.log'),{flags:'wx'}),child=spawn(process.execPath,args,{cwd,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_PATH:''}});let text='';
 for(const pipe of [child.stdout,child.stderr])pipe.on('data',bytes=>{text+=bytes;stream.write(bytes);});
 const completion=await new Promise(resolve=>{child.once('error',error=>resolve({exitCode:null,error:error.message}));child.once('exit',(exitCode,signal)=>resolve({exitCode,signal}));});await new Promise(resolve=>stream.end(resolve));
 let counts={};if(name==='frontend'){const r=JSON.parse(fs.readFileSync(path.join(bundle,'work/echo-launch-preview-20261113/agent-runtime-20261114/frontend-result.json'),'utf8'));counts={passed:r.passed,failed:r.failed};}else{const pass=text.match(/# pass (\d+)/),fail=text.match(/# fail (\d+)/);if(pass)counts.passed=Number(pass[1]);if(fail)counts.failed=Number(fail[1]);}
 observations.push({name,cwd:path.relative(bundle,cwd).split(path.sep).join('/'),command:[process.execPath,...args],startedAt,finishedAt:new Date().toISOString(),...completion,...counts,logSha256:sha256(fs.readFileSync(path.join(output,name+'.log')))});
 write();console.log(JSON.stringify({name,...completion,...counts}));if(completion.exitCode!==0){write(true);process.exitCode=1;break;}
}
const final=write(true);if(!final.passed)process.exitCode=1;console.log(JSON.stringify({passed:final.passed,checks:observations.length,immutableInputsUnchanged:final.immutableInputsUnchanged,report:path.join(output,'reproduction.json'),productionReady:false}));
