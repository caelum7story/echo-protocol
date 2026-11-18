import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {getAddress,ZeroAddress} from 'ethers';
import {DistributionQueue,recoveryMarkerName} from './distribution-queue.mjs';
import {normalizeBudgetPolicy,budgetUint,budgetDigest} from './distribution-budget.mjs';
import {normalizeServicePolicy} from './distribution-service-policy.mjs';

const root=path.resolve(import.meta.dirname,'..'),MAX=64*1024*1024,APP=0x45434451;
const fail=code=>{throw Error(code);},digest=value=>createHash('sha256').update(value).digest('hex');
function scopeOf({chainId,wallet}){if(![56,97,31337].includes(chainId))fail('QUEUE_BACKUP_SCOPE');try{wallet=getAddress(wallet);if(wallet===ZeroAddress)fail('QUEUE_BACKUP_SCOPE');}catch{fail('QUEUE_BACKUP_SCOPE');}return {chainId,wallet:wallet.toLowerCase()};}
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())fail('QUEUE_BACKUP_REGULAR_FILE');return stat;}
function fileHash(file){const hash=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);try{let n;while((n=fs.readSync(fd,buffer,0,buffer.length,null)))hash.update(buffer.subarray(0,n));return hash.digest('hex');}finally{fs.closeSync(fd);}}
function readonly(file){regular(file);const db=new DatabaseSync(path.toNamespacedPath(file),{readOnly:true,allowExtension:false});db.exec('PRAGMA query_only=ON;PRAGMA trusted_schema=OFF;PRAGMA busy_timeout=5000');return db;}
function schema(db){return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();}
function expectedSchema(scope){
 fs.mkdirSync(path.join(root,'evidence'),{recursive:true});const dir=fs.mkdtempSync(path.join(root,'evidence/queue-backup-scope-')),file=path.join(dir,'scope.sqlite');let queue,db;
 try{queue=new DistributionQueue({databasePath:file,...scope});queue.close();queue=null;db=readonly(file);return digest(JSON.stringify(schema(db)));}
 finally{db?.close();queue?.close();for(const name of ['scope.sqlite','scope.sqlite-wal','scope.sqlite-shm']){const target=path.resolve(dir,name);if(!target.startsWith(path.resolve(dir)+path.sep))fail('QUEUE_BACKUP_CLEANUP_SCOPE');if(fs.existsSync(target))fs.unlinkSync(target);}fs.rmdirSync(dir);}
}
function inspectBudget(db,scope){
 const raw=db.prepare("SELECT value FROM meta WHERE key='budget_policy'").get()?.value,holdRaw=db.prepare("SELECT value FROM meta WHERE key='budget_hold'").get()?.value,rows=db.prepare("SELECT key,value FROM meta WHERE key LIKE 'budget_reservation:%'").all(),usageRows=db.prepare("SELECT key,value FROM meta WHERE key LIKE 'budget_usage:%'").all();
 if(raw===undefined&&holdRaw===undefined&&!rows.length&&!usageRows.length)return null;
 let policy;try{const value=JSON.parse(raw);policy=normalizeBudgetPolicy(value,scope);if(policy.policyHash!==value.policyHash||value.financialAuthorization!==false)fail('QUEUE_BACKUP_BUDGET_POLICY');}catch{fail('QUEUE_BACKUP_BUDGET_POLICY');}
 const days=new Map(),ids=new Set();let reservedWei=0n,settledWei=0n;
 for(const row of rows){
  let reservation;try{reservation=JSON.parse(row.value);}catch{fail('QUEUE_BACKUP_BUDGET_RESERVATION');}const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(reservation.id);
  if(!job||row.key!=='budget_reservation:'+reservation.id||reservation.schema!=='echo-launch-distribution-fee-reservation/v1'||reservation.chainId!==scope.chainId||reservation.wallet!==scope.wallet||reservation.financialAuthorization!==false||!['reserved','settled'].includes(reservation.status)||reservation.attempt!==job.attempt||reservation.nonce!==job.nonce||reservation.capWei!==job.gas_cap||!/^[a-f0-9]{64}$/.test(reservation.policyHash??'')||!/^[a-f0-9]{64}$/.test(reservation.checkHash??'')||!Number.isSafeInteger(reservation.confirmations)||reservation.confirmations<1||reservation.confirmations>128)fail('QUEUE_BACKUP_BUDGET_RESERVATION');
  const quote=JSON.parse(job.quote_json??'null'),transaction=reservation.transaction;if(!quote||!transaction||transaction.from.toLowerCase()!==scope.wallet||transaction.to.toLowerCase()!==job.project||transaction.data!==quote.transaction.data||String(transaction.value)!=='0'||transaction.chainId!==scope.chainId)fail('QUEUE_BACKUP_BUDGET_RESERVATION');
  const cap=budgetUint(reservation.capWei,true);ids.add(reservation.id);
  if(reservation.status==='reserved')reservedWei+=cap;
  else{
   const proof=reservation.feeProof;if(!proof||proof.transactionHash!==job.tx_hash||!/^0x[0-9a-f]{64}$/.test(proof.blockHash??'')||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(proof.receiptDay??'')||budgetDigest(proof)!==reservation.feeProofHash||![0,1].includes(proof.status))fail('QUEUE_BACKUP_BUDGET_FEE_PROOF');
   const fee=budgetUint(proof.actualFeeWei);if(fee>cap||fee!==budgetUint(proof.gasUsed,true)*budgetUint(proof.gasPriceWei))fail('QUEUE_BACKUP_BUDGET_FEE_PROOF');settledWei+=fee;const day=days.get(proof.receiptDay)??{fee:0n,count:0};day.fee+=fee;day.count++;days.set(proof.receiptDay,day);
  }
 }
 for(const row of usageRows){let usage;try{usage=JSON.parse(row.value);}catch{fail('QUEUE_BACKUP_BUDGET_LEDGER');}const day=row.key.slice('budget_usage:'.length),expected=days.get(day);if(!expected||budgetUint(usage.spentWei)!==expected.fee||usage.receiptCount!==expected.count)fail('QUEUE_BACKUP_BUDGET_LEDGER');days.delete(day);}
 if(days.size)fail('QUEUE_BACKUP_BUDGET_LEDGER');
 if(holdRaw!==undefined){let hold;try{hold=JSON.parse(holdRaw);}catch{fail('QUEUE_BACKUP_BUDGET_HOLD');}if(hold?.schema!=='echo-launch-distribution-budget-hold/v1'||hold.chainId!==scope.chainId||hold.wallet!==scope.wallet||hold.automaticResumeAllowed!==false||!ids.has(hold.jobId))fail('QUEUE_BACKUP_BUDGET_HOLD');}
 return {policyHash:policy.policyHash,reservationCount:rows.length,reservedWei:String(reservedWei),settledFeeWei:String(settledWei),budgetHold:holdRaw!==undefined};
}
function inspectService(db,scope){
 const raw=db.prepare("SELECT value FROM meta WHERE key='service_policy'").get()?.value,leaseRaw=db.prepare("SELECT value FROM meta WHERE key='service_lease'").get()?.value,stateRaw=db.prepare("SELECT value FROM meta WHERE key='service_state'").get()?.value;if(raw===undefined&&leaseRaw===undefined&&stateRaw===undefined)return null;
 let policy,lease=null,state=null;try{const value=JSON.parse(raw);policy=normalizeServicePolicy(value,scope);if(policy.policyHash!==value.policyHash||value.financialAuthorization!==false)fail('QUEUE_BACKUP_SERVICE_POLICY');}catch{fail('QUEUE_BACKUP_SERVICE_POLICY');}
 try{if(leaseRaw!==undefined)lease=JSON.parse(leaseRaw);if(stateRaw!==undefined)state=JSON.parse(stateRaw);}catch{fail('QUEUE_BACKUP_SERVICE_STATE');}
 if(lease&&(!Number.isSafeInteger(lease.token)||lease.token<1||!Number.isSafeInteger(lease.expiresAt)||lease.expiresAt<0||typeof lease.owner!=='string'||!lease.owner||lease.owner.length>100||!/^[a-f0-9]{64}$/.test(lease.policyHash??'')))fail('QUEUE_BACKUP_SERVICE_STATE');
 if(state&&(!lease||state.token!==lease.token||state.policyHash!==lease.policyHash||typeof state.healthy!=='boolean'||!Number.isSafeInteger(state.cycles)||state.cycles<0))fail('QUEUE_BACKUP_SERVICE_STATE');
 for(const key of ['service_monitor_cursor','service_receipt_cursor']){const cursor=db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;if(cursor!==undefined&&cursor!==''&&!/^[a-f0-9]{64}$/.test(cursor))fail('QUEUE_BACKUP_SERVICE_CURSOR');}
 return {policyHash:policy.policyHash,leaseToken:lease?.token??null,historicalHealthyFlag:state?.healthy??false,freshnessNotVerified:true};
}
function inspect(db,scope,schemaHash){
 db.exec('BEGIN');try{
  if(db.prepare('PRAGMA application_id').get().application_id!==APP||db.prepare('PRAGMA user_version').get().user_version!==1)fail('QUEUE_BACKUP_DATABASE_ID');
  if(digest(JSON.stringify(schema(db)))!==schemaHash)fail('QUEUE_BACKUP_SCHEMA');
  if(db.prepare("SELECT value FROM meta WHERE key='chain'").get()?.value!==String(scope.chainId)||db.prepare("SELECT value FROM meta WHERE key='wallet'").get()?.value!==scope.wallet)fail('QUEUE_BACKUP_SCOPE');
  if(db.prepare('PRAGMA integrity_check').all().some(row=>Object.values(row)[0]!=='ok')||db.prepare('PRAGMA foreign_key_check').all().length)fail('QUEUE_BACKUP_INTEGRITY');
  const clock=db.prepare("SELECT value FROM meta WHERE key='clock'").get()?.value;if(!/^(0|[1-9][0-9]*)$/.test(clock??'')||!Number.isSafeInteger(Number(clock)))fail('QUEUE_BACKUP_CLOCK');
  const counts=Object.fromEntries(['jobs','items','lane','events'].map(table=>[table,db.prepare('SELECT count(*) n FROM '+table).get().n]));
  if(counts.lane>1||db.prepare("SELECT count(*) n FROM jobs WHERE phase NOT IN ('queued','quoted','submission-unknown','submitted','needs-review','confirmed','reconciled')").get().n)fail('QUEUE_BACKUP_PHASE');
  if(db.prepare('SELECT count(*) n FROM items i LEFT JOIN jobs j ON i.job_id=j.id WHERE j.id IS NULL OR i.project!=j.project').get().n)fail('QUEUE_BACKUP_ITEMS');
  const lanes=db.prepare('SELECT * FROM lane').all();for(const lane of lanes){const job=db.prepare('SELECT * FROM jobs WHERE id=?').get(lane.job_id);if(!job||!['submission-unknown','submitted','needs-review'].includes(job.phase)||job.attempt!==lane.attempt||job.nonce!==lane.nonce)fail('QUEUE_BACKUP_LANE');}
  const active=db.prepare("SELECT id FROM jobs WHERE phase IN ('submission-unknown','submitted','needs-review')").all();if(active.length!==lanes.length||active.some(job=>!lanes.some(l=>l.job_id===job.id)))fail('QUEUE_BACKUP_LANE');
  for(const job of db.prepare('SELECT * FROM jobs').all()){
   let keys;try{keys=JSON.parse(job.keys_json);}catch{fail('QUEUE_BACKUP_KEYS');}
   if(!Array.isArray(keys)||keys.length<1||keys.length>100||keys.some(key=>!/^0x[0-9a-f]{64}$/.test(key))||new Set(keys).size!==keys.length||JSON.stringify([...keys].sort())!==job.keys_json||digest(JSON.stringify([scope.chainId,scope.wallet,job.project,keys]))!==job.id)fail('QUEUE_BACKUP_KEYS');
   const rows=db.prepare('SELECT position_key FROM items WHERE job_id=? ORDER BY position_key').all(job.id);if(JSON.stringify(rows.map(row=>row.position_key))!==job.keys_json)fail('QUEUE_BACKUP_ITEMS');
   if(job.phase==='quoted'&&!job.quote_json||['submission-unknown','submitted','needs-review'].includes(job.phase)&&(!job.quote_json||!/^[a-f0-9]{48}$/.test(job.attempt??'')||!Number.isSafeInteger(job.nonce)||job.nonce<0||!/^[1-9][0-9]*$/.test(job.gas_cap??''))||job.phase==='submitted'&&!/^0x[0-9a-f]{64}$/.test(job.tx_hash??'')||job.tx_hash!==null&&!/^0x[0-9a-f]{64}$/.test(job.tx_hash))fail('QUEUE_BACKUP_ATTEMPT');
   for(const value of [job.quote_json,job.outcome_json])if(value!==null)try{JSON.parse(value);}catch{fail('QUEUE_BACKUP_JSON');}
  }
  const holdRaw=db.prepare("SELECT value FROM meta WHERE key='recovery_hold'").get()?.value;let hold=null;
  if(holdRaw!==undefined){try{hold=JSON.parse(holdRaw);}catch{fail('QUEUE_BACKUP_RECOVERY_HOLD');}if(hold?.schema!=='echo-launch-queue-recovery-hold/v1'||hold.chainId!==scope.chainId||hold.wallet!==scope.wallet||hold.automaticResumeAllowed!==false||!/^[a-f0-9]{64}$/.test(hold.snapshotSha256??''))fail('QUEUE_BACKUP_RECOVERY_HOLD');}
  const monitorHoldRaw=db.prepare("SELECT value FROM meta WHERE key='monitor_hold'").get()?.value;let monitorHold=null;
  if(monitorHoldRaw!==undefined){try{monitorHold=JSON.parse(monitorHoldRaw);}catch{fail('QUEUE_BACKUP_MONITOR_HOLD');}if(monitorHold?.schema!=='echo-launch-distribution-monitor-hold/v1'||monitorHold.chainId!==scope.chainId||monitorHold.wallet!==scope.wallet||monitorHold.automaticResumeAllowed!==false||!/^[a-f0-9]{64}$/.test(monitorHold.firstJobId??''))fail('QUEUE_BACKUP_MONITOR_HOLD');}
  const phases=db.prepare('SELECT phase,count(*) count FROM jobs GROUP BY phase ORDER BY phase').all(),lastEvent=db.prepare('SELECT max(seq) seq FROM events').get().seq;
  const budget=inspectBudget(db,scope),service=inspectService(db,scope);return {scope,schemaHash,counts,phases,lastEvent,clock:Number(clock),recoveryHold:hold!==null,...monitorHold?{monitorHold:true}:{},...budget?{budget}:{},...service?{service}:{},liveStateVerified:false};
 }finally{db.exec('ROLLBACK');}
}
function newDirectory(value,forbidden){if(typeof value!=='string'||!path.isAbsolute(value))fail('QUEUE_BACKUP_ABSOLUTE_DESTINATION');const parent=fs.realpathSync(path.dirname(value)),target=path.join(parent,path.basename(value));if(forbidden&&(target===forbidden||target.startsWith(forbidden+path.sep)))fail('QUEUE_BACKUP_DESTINATION_SCOPE');if(fs.existsSync(target))fail('QUEUE_BACKUP_DESTINATION_EXISTS');fs.mkdirSync(target,{mode:0o700});return fs.realpathSync(target);}
function seal(file,data){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function syncFile(file){const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export async function backupDistributionQueue({source,bundle,scope,rate=100,onProgress,maxBytes=MAX,timeoutMs=30000}){
 scope=scopeOf(scope);if(!Number.isSafeInteger(rate)||rate<1||rate>1000||!Number.isSafeInteger(maxBytes)||maxBytes<4096||maxBytes>512*1024*1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)fail('QUEUE_BACKUP_POLICY');
 const schemaHash=expectedSchema(scope),db=readonly(source);try{
  inspect(db,scope,schemaHash);const pageSize=db.prepare('PRAGMA page_size').get().page_size;if(pageSize*db.prepare('PRAGMA page_count').get().page_count>maxBytes)fail('QUEUE_BACKUP_SIZE_LIMIT');
  const dir=newDirectory(bundle),target=path.join(dir,'snapshot.sqlite'),started=Date.now();let steps=0;
  const pages=await backup(db,path.toNamespacedPath(target),{rate,progress:progress=>{steps++;if(Date.now()-started>timeoutMs)fail('QUEUE_BACKUP_TIMEOUT');if(progress.totalPages*pageSize>maxBytes)fail('QUEUE_BACKUP_SIZE_LIMIT');onProgress?.(progress);}});
  fs.chmodSync(target,0o600);const copy=new DatabaseSync(path.toNamespacedPath(target));let observation;try{copy.exec('PRAGMA journal_mode=DELETE;PRAGMA synchronous=FULL');observation=inspect(copy,scope,schemaHash);}finally{copy.close();}
  const bytes=regular(target).size;if(bytes>maxBytes)fail('QUEUE_BACKUP_SIZE_LIMIT');syncFile(target);
  const manifest={schema:'echo-launch-distribution-backup/v1',createdAt:new Date().toISOString(),snapshotFile:'snapshot.sqlite',snapshotSha256:fileHash(target),snapshotBytes:bytes,pages,steps,observation,complete:true,readOnlySource:true,liveStateVerified:false,automaticResumeAllowed:false,financialExecutionAllowed:false};seal(path.join(dir,'manifest.json'),manifest);return {bundle:dir,manifest};
 }finally{db.close();}
}
export function verifyDistributionBackup({bundle,scope}){
 scope=scopeOf(scope);const dir=fs.realpathSync(bundle),manifestFile=path.join(dir,'manifest.json'),target=path.join(dir,'snapshot.sqlite');if(!fs.existsSync(manifestFile))fail('QUEUE_BACKUP_INCOMPLETE');if(regular(manifestFile).size>131072)fail('QUEUE_BACKUP_MANIFEST_LIMIT');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));if(manifest.schema!=='echo-launch-distribution-backup/v1'||manifest.snapshotFile!=='snapshot.sqlite'||manifest.complete!==true||manifest.readOnlySource!==true||manifest.liveStateVerified!==false||manifest.automaticResumeAllowed!==false||manifest.financialExecutionAllowed!==false||!Number.isSafeInteger(manifest.snapshotBytes)||manifest.snapshotBytes<4096||manifest.snapshotBytes>512*1024*1024||!/^[a-f0-9]{64}$/.test(manifest.snapshotSha256??''))fail('QUEUE_BACKUP_MANIFEST');
 if(fs.readdirSync(dir).sort().join(',')!=='manifest.json,snapshot.sqlite')fail('QUEUE_BACKUP_INVENTORY');
 if(regular(target).size!==manifest.snapshotBytes||fileHash(target)!==manifest.snapshotSha256)fail('QUEUE_BACKUP_CHECKSUM');
 const db=readonly(target);let observation;try{observation=inspect(db,scope,expectedSchema(scope));}finally{db.close();}if(JSON.stringify(observation)!==JSON.stringify(manifest.observation))fail('QUEUE_BACKUP_OBSERVATION');
 return {bundle:dir,manifest,verified:true,automaticResumeAllowed:false,liveStateVerified:false,financialExecutionAllowed:false};
}
export function restoreDistributionBackup({bundle,destination,scope}){
 scope=scopeOf(scope);const verified=verifyDistributionBackup({bundle,scope}),dir=newDirectory(destination,verified.bundle),target=path.join(dir,'queue.sqlite');
 // Persist the hold before copying. A crash before the database metadata update still leaves the constructor's directory guard.
 const hold={schema:'echo-launch-queue-recovery-hold/v1',chainId:scope.chainId,wallet:scope.wallet,snapshotSha256:verified.manifest.snapshotSha256,createdAt:new Date().toISOString(),automaticResumeAllowed:false,reason:'Snapshot may predate submissions or deliveries;stop original executor and reconcile chain/wallet before any separately reviewed handover.'};seal(path.join(dir,recoveryMarkerName),hold);
 fs.copyFileSync(path.join(verified.bundle,'snapshot.sqlite'),target,fs.constants.COPYFILE_EXCL);fs.chmodSync(target,0o600);if(fileHash(target)!==verified.manifest.snapshotSha256)fail('QUEUE_BACKUP_CHECKSUM');
 const queue=new DistributionQueue({databasePath:target,...scope});let status;try{status=queue.snapshot({limit:1});if(!status.recoveryHold)fail('QUEUE_RESTORE_HOLD_MISSING');}finally{queue.close();}
 const db=readonly(target);let observation;try{observation=inspect(db,scope,expectedSchema(scope));}finally{db.close();}const prior=verified.manifest.observation;for(const key of ['counts','phases','lastEvent','clock'])if(JSON.stringify(observation[key])!==JSON.stringify(prior[key]))fail('QUEUE_RESTORE_OBSERVATION');syncFile(target);
 const result={schema:'echo-launch-distribution-restore/v1',restoredAt:new Date().toISOString(),database:target,sourceSnapshotSha256:verified.manifest.snapshotSha256,observation,recoveryHold:true,originalExecutorStopped:false,canonicalReconciliationRequired:true,automaticResumeAllowed:false,liveStateVerified:false,financialExecutionAllowed:false};seal(path.join(dir,'restore.json'),result);return result;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 try{const {positionals:p,values:v}=parseArgs({allowPositionals:true,options:Object.fromEntries(['source','bundle','destination','chain-id','wallet'].map(k=>[k,{type:'string'}]))});if(p.length!==1||!['backup','verify','restore'].includes(p[0])||!v.bundle||!v.wallet||!v['chain-id'])fail('QUEUE_BACKUP_ARGUMENTS');const scope={chainId:Number(v['chain-id']),wallet:v.wallet},result=p[0]==='backup'?await backupDistributionQueue({source:v.source,bundle:path.resolve(v.bundle),scope}):p[0]==='verify'?verifyDistributionBackup({bundle:v.bundle,scope}):restoreDistributionBackup({bundle:v.bundle,destination:path.resolve(v.destination),scope});console.log(JSON.stringify(result,null,2));}
 catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'QUEUE_BACKUP_FAILED',financialExecutionAllowed:false}));process.exitCode=1;}
}
