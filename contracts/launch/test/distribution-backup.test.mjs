import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
// Normalize only direct fixture inspection/tampering paths; production APIs are tested separately.
const openTestDb=(file,options={})=>new DatabaseSync(file===':memory:'?file:path.toNamespacedPath(file),options);
import {Wallet,Interface,id,toBeHex} from 'ethers';
import {DistributionQueue,recoveryMarkerName,stageDistributionJob,reconcileDistributionJob} from '../scripts/distribution-queue.mjs';
import {backupDistributionQueue,verifyDistributionBackup,restoreDistributionBackup} from '../scripts/distribution-backup.mjs';
import {createLocalRuntimeRehearsal} from '../lib/local-rehearsal.mjs';
import {LaunchAgentClient,identityIdOf,quoteDigest} from '../lib/agent-client.mjs';
const root=path.resolve(import.meta.dirname,'..'),folder=fs.mkdtempSync(path.join(root,'evidence/queue-backup-tests-')),wallets=[1,2,3].map(i=>new Wallet(toBeHex(i,32)).address),scope={chainId:31337,wallet:wallets[0]},observations=[];
const file=name=>path.join(folder,name),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),create=name=>new DistributionQueue({databasePath:file(name+'.sqlite'),...scope}),iface=new Interface(['function distribute(bytes32[] keys)']);
function syntheticQuote(job){const quote={schema:'echo-launch-quote/v1',action:'distribute',kind:2,chainId:31337,project:job.project,wallet:scope.wallet,versionId:id('BACKUP-SYNTHETIC-VERSION'),configHash:id('BACKUP-CONFIG'),stateHash:id('BACKUP-STATE'),blockNumber:1,blockHash:id('BACKUP-BLOCK'),deadline:2000000000,keys:job.keys,deliveries:job.keys.map(key=>({key,wallet:wallets[2],identityId:'1',units:'1',tokenAmount:'1000000000000000000',revision:'0'})),destinationPolicy:'original-onchain-wallet-only',paymentWei:'0',platformGasFunded:false,broadcast:false,transaction:{chainId:31337,from:scope.wallet,to:job.project,value:'0',data:iface.encodeFunctionData('distribute',[job.keys])}};return {...quote,quoteHash:quoteDigest(quote)};}
function boundary(queue,job){const lease=queue.claim({owner:'backup-test'}),quote=syntheticQuote(job);queue.recordQuote(lease,quote);return queue.beginSubmissionBoundary(lease,{quoteHash:quote.quoteHash,nonce:7,gasCapWei:'1000000'});}
function reseal(bundle){const target=path.join(bundle,'snapshot.sqlite'),manifestFile=path.join(bundle,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));manifest.snapshotBytes=fs.statSync(target).size;manifest.snapshotSha256=hash(target);fs.writeFileSync(manifestFile,JSON.stringify(manifest));}
let rehearsal;
test.after(async()=>{await rehearsal?.close();fs.writeFileSync(path.join(root,'evidence/distribution-backup-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),scope:'isolated-local-EVM31337 and private synthetic SQLite fixtures',observations,publicTransactions:false,realWalletUsed:false,automaticResumeAllowed:false,automaticSignerConfigured:false,productionReady:false},null,2)+'\n');});

test('online WAL backup remains consistent while the source accepts a submission boundary and continues operating',async()=>{
 const queue=create('online');for(let n=0;n<100;n++)queue.enqueue({project:wallets[1],keys:Array.from({length:20},(_,i)=>id('ONLINE-'+n+'-'+i))});
 const job=queue.get(queue.snapshot({limit:1}).jobs[0].id);let progressWrites=0;
 const saved=await backupDistributionQueue({source:file('online.sqlite'),bundle:file('online-bundle'),scope,rate:1,onProgress(){if(progressWrites++===0)boundary(queue,job);}});
 assert.ok(saved.manifest.steps>1);assert.equal(saved.manifest.observation.counts.jobs,100);assert.equal(saved.manifest.observation.counts.items,2000);assert.equal(saved.manifest.observation.counts.lane,1);assert.equal(saved.manifest.observation.phases.find(p=>p.phase==='submission-unknown').count,1);assert.equal(verifyDistributionBackup({bundle:file('online-bundle'),scope}).verified,true);assert.equal(queue.get(job.id).phase,'submission-unknown');
 queue.enqueue({project:wallets[1],keys:[id('AFTER-ONLINE-SNAPSHOT')]});assert.equal(queue.snapshot().jobCount,101);observations.push({name:'live-wal-consistent-snapshot',steps:saved.manifest.steps,sourceJobCount:101,snapshotJobCount:100,snapshotLaneCount:1});queue.close();
});

test('restore uses a new directory,retains attempts,and blocks both claims and stale quote submissions even after marker removal',async()=>{
 const queue=create('restore'),job=queue.enqueue({project:wallets[1],keys:[id('RESTORE-QUOTED')]}),lease=queue.claim({owner:'pre-snapshot'}),quote=syntheticQuote(job);queue.recordQuote(lease,quote);
 const saved=await backupDistributionQueue({source:file('restore.sqlite'),bundle:file('restore-bundle'),scope});
 // The original source moves beyond the snapshot. The clone must never infer no submission from its old rows.
 const original=queue.beginSubmissionBoundary(lease,{quoteHash:quote.quoteHash,nonce:7,gasCapWei:'1000000'});queue.recordSubmission({...original,hash:id('LATER-ORIGINAL-HASH'),nonce:7});
 assert.throws(()=>restoreDistributionBackup({bundle:saved.bundle,destination:saved.bundle,scope}),/QUEUE_BACKUP_DESTINATION_SCOPE/);assert.throws(()=>restoreDistributionBackup({bundle:saved.bundle,destination:path.join(saved.bundle,'nested'),scope}),/QUEUE_BACKUP_DESTINATION_SCOPE/);
 const restored=restoreDistributionBackup({bundle:saved.bundle,destination:file('restored'),scope});assert.equal(restored.recoveryHold,true);assert.equal(restored.originalExecutorStopped,false);let clone=new DistributionQueue({databasePath:restored.database,...scope});assert.equal(clone.get(job.id).tx_hash,null);assert.throws(()=>clone.claim({owner:'unsafe-resume'}),/QUEUE_RECOVERY_HOLD/);assert.throws(()=>clone.beginSubmissionBoundary(lease,{quoteHash:quote.quoteHash,nonce:7,gasCapWei:'1000000'}),/QUEUE_RECOVERY_HOLD/);clone.close();
 fs.unlinkSync(path.join(file('restored'),recoveryMarkerName));clone=new DistributionQueue({databasePath:restored.database,...scope});assert.ok(clone.snapshot().recoveryHold);assert.throws(()=>clone.claim({owner:'still-blocked'}),/QUEUE_RECOVERY_HOLD/);clone.close();assert.throws(()=>restoreDistributionBackup({bundle:saved.bundle,destination:file('restored'),scope}),/QUEUE_BACKUP_DESTINATION_EXISTS/);assert.equal(queue.get(job.id).tx_hash,id('LATER-ORIGINAL-HASH'));queue.close();observations.push({name:'stale-snapshot-never-authorizes-replay',recoveryHoldPersistsInDatabase:true,laterSourceHashNotInSnapshot:true});
});

test('an interrupted restore with only the durable directory marker acquires its hold before any queue claim',async()=>{
 const queue=create('interrupted-restore');queue.enqueue({project:wallets[1],keys:[id('INTERRUPTED-RESTORE')]});const saved=await backupDistributionQueue({source:file('interrupted-restore.sqlite'),bundle:file('interrupted-restore-bundle'),scope});queue.close();
 const destination=file('interrupted-clone');fs.mkdirSync(destination);const marker={schema:'echo-launch-queue-recovery-hold/v1',chainId:31337,wallet:scope.wallet.toLowerCase(),snapshotSha256:saved.manifest.snapshotSha256,automaticResumeAllowed:false};fs.writeFileSync(path.join(destination,recoveryMarkerName),JSON.stringify(marker));fs.copyFileSync(path.join(saved.bundle,'snapshot.sqlite'),path.join(destination,'queue.sqlite'));
 const clone=new DistributionQueue({databasePath:path.join(destination,'queue.sqlite'),...scope});assert.throws(()=>clone.claim({owner:'after-crash'}),/QUEUE_RECOVERY_HOLD/);assert.ok(clone.snapshot().recoveryHold);clone.close();observations.push({name:'interrupted-restore-directory-guard',claimBlocked:true});
});

test('checksum,scope,inventory,schema and resealed orphan/lane corruption are rejected without altering a destination',async()=>{
 const queue=create('tamper'),job=queue.enqueue({project:wallets[1],keys:[id('TAMPER')]}),attempt=boundary(queue,job);queue.recordSubmission({...attempt,hash:id('TAMPER-HASH'),nonce:7});const saved=await backupDistributionQueue({source:file('tamper.sqlite'),bundle:file('tamper-bundle'),scope});queue.close();
 assert.throws(()=>verifyDistributionBackup({bundle:saved.bundle,scope:{...scope,wallet:wallets[2]}}),/QUEUE_BACKUP_SCOPE/);
 const bad=(name,change,resealed=true)=>{const dir=file(name);fs.cpSync(saved.bundle,dir,{recursive:true,errorOnExist:true,force:false});change(dir);if(resealed)reseal(dir);return dir;};
 const checksum=bad('bad-bytes',dir=>fs.appendFileSync(path.join(dir,'snapshot.sqlite'),'changed'),false);assert.throws(()=>verifyDistributionBackup({bundle:checksum,scope}),/QUEUE_BACKUP_CHECKSUM/);
 const extra=bad('bad-extra',dir=>fs.writeFileSync(path.join(dir,'secret.txt'),'synthetic'),false);assert.throws(()=>verifyDistributionBackup({bundle:extra,scope}),/QUEUE_BACKUP_INVENTORY/);
 const schema=bad('bad-schema',dir=>{const db=openTestDb(path.join(dir,'snapshot.sqlite'));db.exec('CREATE TABLE unrelated(v TEXT)');db.close();});assert.throws(()=>verifyDistributionBackup({bundle:schema,scope}),/QUEUE_BACKUP_SCHEMA/);
 const lane=bad('bad-lane',dir=>{const db=openTestDb(path.join(dir,'snapshot.sqlite'));db.exec('DELETE FROM lane');db.close();});assert.throws(()=>restoreDistributionBackup({bundle:lane,destination:file('must-not-exist'),scope}),/QUEUE_BACKUP_LANE/);assert.equal(fs.existsSync(file('must-not-exist')),false);
 const orphan=bad('bad-orphan',dir=>{const db=openTestDb(path.join(dir,'snapshot.sqlite'));db.exec("UPDATE items SET job_id='missing'");db.close();});assert.throws(()=>verifyDistributionBackup({bundle:orphan,scope}),/QUEUE_BACKUP_ITEMS/);
 observations.push({name:'corruption-and-scope-fail-closed',rejectedCases:6,invalidRestoreDirectoryCreated:false});
});

test('size limits and backup callback failure produce no complete manifest and do not stop or rewrite the source',async()=>{
 const queue=create('failure');for(let n=0;n<20;n++)queue.enqueue({project:wallets[1],keys:[id('FAILURE-'+n)]});
 await assert.rejects(backupDistributionQueue({source:file('failure.sqlite'),bundle:file('too-small'),scope,maxBytes:4096}),/QUEUE_BACKUP_SIZE_LIMIT/);assert.equal(fs.existsSync(file('too-small')),false);
 await assert.rejects(backupDistributionQueue({source:file('failure.sqlite'),bundle:file('callback-failure'),scope,rate:1,onProgress(){throw Error('INJECTED_BACKUP_FAILURE');}}),/INJECTED_BACKUP_FAILURE/);assert.equal(fs.existsSync(path.join(file('callback-failure'),'manifest.json')),false);assert.throws(()=>verifyDistributionBackup({bundle:file('callback-failure'),scope}),/QUEUE_BACKUP_INCOMPLETE/);assert.equal(queue.snapshot().jobCount,20);queue.enqueue({project:wallets[1],keys:[id('SOURCE-STILL-WRITABLE')]});queue.close();observations.push({name:'incomplete-backup-not-restorable',sourceRemainsWritable:true});
});

test('a restored actual pending EVM batch can reconcile its original hash without enabling a new dispatch',async()=>{
 rehearsal=await createLocalRuntimeRehearsal({directory:file('runtime')});const sale=rehearsal.projects[1],start=Number(await sale.startsAt());await rehearsal.chain.provider.request({method:'evm_setNextBlockTimestamp',params:[start+7*86400]});await rehearsal.chain.provider.request({method:'evm_mine',params:[]});await(await sale.finalizePool({gasLimit:3000000})).wait();
 const client=new LaunchAgentClient({provider:rehearsal.provider,config:rehearsal.config}),operator=await rehearsal.provider.getSigner(0),key=await sale.positionKey(identityIdOf('rehearsal'),wallets[2]),queue=create('actual-pending'),job=queue.enqueue({project:sale.target,keys:[key]}),stage=await stageDistributionJob({queue,client,owner:'original'}),quote=stage.job.quote,nonce=await rehearsal.provider.getTransactionCount(scope.wallet,'pending'),attempt=queue.beginSubmissionBoundary(stage.lease,{quoteHash:quote.quoteHash,nonce,gasCapWei:'1000000000000000000'});
 let response,clone;await rehearsal.chain.provider.request({method:'evm_setAutomine',params:[false]});try{
  response=await operator.sendTransaction(quote.transaction);queue.recordSubmission({...attempt,hash:response.hash,nonce});const saved=await backupDistributionQueue({source:file('actual-pending.sqlite'),bundle:file('actual-pending-bundle'),scope}),restored=restoreDistributionBackup({bundle:saved.bundle,destination:file('actual-pending-restored'),scope});clone=new DistributionQueue({databasePath:restored.database,...scope});assert.equal((await reconcileDistributionJob({queue:clone,client,id:job.id})).status,'awaiting-confirmation');assert.ok(clone.snapshot().lane);assert.throws(()=>clone.claim({owner:'cannot-resume'}),/QUEUE_RECOVERY_HOLD/);
 }finally{await rehearsal.chain.provider.request({method:'evm_mine',params:[]});await rehearsal.chain.provider.request({method:'evm_setAutomine',params:[true]});}
 const receipt=await response.wait();assert.equal(receipt.status,1);const checked=await reconcileDistributionJob({queue:clone,client,id:job.id});assert.equal(checked.job.phase,'confirmed');assert.equal(clone.snapshot().lane,null);assert.ok(clone.snapshot().recoveryHold);assert.throws(()=>clone.claim({owner:'still-no-resume'}),/QUEUE_RECOVERY_HOLD/);assert.equal(queue.get(job.id).phase,'submitted');observations.push({name:'restored-pending-real-receipt',transactionHash:receipt.hash,receiptStatus:receipt.status,receiptProvenCount:JSON.parse(checked.job.outcome_json).receiptProvenCount,holdAfterReconciliation:true});clone.close();queue.close();
});

test('the actual backup/verify/restore CLI completes without RPC and refuses an execution command',async()=>{
 const queue=create('cli');queue.enqueue({project:wallets[1],keys:[id('CLI-BACKUP')]});queue.close();const run=args=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/distribution-backup.mjs',...args],{cwd:root,env:{...process.env,ECHO_LAUNCH_RPC_URL:''},stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));}),common=['--bundle',file('cli-bundle'),'--chain-id','31337','--wallet',scope.wallet];
 const saved=await run(['backup',...common,'--source',file('cli.sqlite')]);assert.equal(saved.code,0,saved.err);const verified=await run(['verify',...common]);assert.equal(verified.code,0,verified.err);assert.equal(JSON.parse(verified.out).verified,true);const restored=await run(['restore',...common,'--destination',file('cli-restored')]);assert.equal(restored.code,0,restored.err);assert.equal(JSON.parse(restored.out).automaticResumeAllowed,false);const rejected=await run(['execute',...common]);assert.notEqual(rejected.code,0);assert.match(rejected.err,/QUEUE_BACKUP_ARGUMENTS/);observations.push({name:'actual-backup-cli',commandsPassed:3,executionRejected:true,networkRequired:false});
});

test('killing an owned backup worker mid-copy leaves an incomplete bundle and preserves the live source',async()=>{
 const queue=create('killed-backup');for(let n=0;n<30;n++)queue.enqueue({project:wallets[1],keys:[id('KILLED-BACKUP-'+n)]});const module=pathToFileURL(path.join(root,'scripts/distribution-backup.mjs')).href,code="const {backupDistributionQueue}=await import(process.argv[1]);await backupDistributionQueue({source:process.argv[2],bundle:process.argv[3],scope:JSON.parse(process.argv[4]),rate:1,onProgress(){process.stdout.write('COPYING\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}});";
 const child=spawn(process.execPath,['--input-type=module','-e',code,module,file('killed-backup.sqlite'),file('killed-bundle'),JSON.stringify(scope)],{stdio:['ignore','pipe','pipe']});const exited=new Promise(resolve=>child.once('exit',(exitCode,signal)=>resolve({exitCode,signal})));await new Promise((resolve,reject)=>{let out='';const timer=setTimeout(()=>reject(Error('OWNED_BACKUP_WORKER_NOT_OBSERVED')),10000);child.stdout.on('data',data=>{out+=data;if(out.includes('COPYING')){clearTimeout(timer);resolve();}});child.once('error',reject);});child.kill('SIGKILL');const result=await exited;assert.ok(result.exitCode!==0||result.signal);assert.equal(fs.existsSync(path.join(file('killed-bundle'),'manifest.json')),false);assert.throws(()=>verifyDistributionBackup({bundle:file('killed-bundle'),scope}),/QUEUE_BACKUP_INCOMPLETE/);assert.equal(queue.snapshot().jobCount,30);queue.enqueue({project:wallets[1],keys:[id('AFTER-KILL')]});queue.close();observations.push({name:'abrupt-backup-death-incomplete',sourceStillWritable:true,childTerminated:true});
});
