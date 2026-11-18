import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
// Normalize only direct fixture inspection/tampering paths; production APIs are tested separately.
const openTestDb=(file,options={})=>new DatabaseSync(file===':memory:'?file:path.toNamespacedPath(file),options);
import {spawnSync} from 'node:child_process';
import {keccak256,toUtf8Bytes,Wallet,toBeHex} from 'ethers';
import {createLocalRuntimeRehearsal} from '../lib/local-rehearsal.mjs';
import {LaunchProjectIndex} from '../lib/project-index.mjs';
import {backupIndex,verifyIndexBackup,restoreIndexBackup,hashBackupFile} from '../scripts/index-backup.mjs';
const root=path.resolve(import.meta.dirname,'..'),observations={};
const directory=()=>fs.mkdtempSync(path.join(root,'evidence/index-backup-test-'));
// Synthetic empty-cache scope for negative/storage tests,not production addresses.
const config={schema:'echo-launch-runtime/v1',chainId:31337,mode:'local-test',executionReady:false,minConfirmations:1,registry:{address:new Wallet(toBeHex(42,32)).address,runtimeHash:keccak256(toUtf8Bytes('SYNTHETIC BACKUP SCOPE'))},approvedTemplates:[]};
const settings={config,startBlock:1};
function empty(){const folder=directory(),source=path.join(folder,'index.sqlite'),index=new LaunchProjectIndex({...settings,databasePath:source,provider:null});return {folder,source,index};}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));

test('real local index WAL backup restores pending receipt history,NFT pages and fresh canonical sync',{timeout:120000},async()=>{
 const folder=directory(),rehearsal=await createLocalRuntimeRehearsal({directory:folder,pagination:true}),meta=read(path.join(folder,'rehearsal.json'));
 const s={config:rehearsal.config,startBlock:meta.startBlock},project=rehearsal.cases.find(x=>x.key==='token-history-pages').address;
 let restored;
 try{
  const pending=await rehearsal.index.state(project,{wallet:rehearsal.sampleWallet});assert.equal(pending.participant,null);assert.equal(pending.participantHistory.processedEvents,0);
  const first=await rehearsal.index.history({project,wallet:rehearsal.sampleWallet,cursor:pending.participantHistory.cursor,limit:25});assert.equal(first.progress.processedEvents,25);
  const before=rehearsal.index.status(),bundle=path.join(folder,'bundle'),saved=await backupIndex({source:path.join(folder,'index.sqlite'),bundle,settings:s,rate:1});
  assert.equal(saved.manifest.readOnlySource,true);assert.ok(saved.manifest.pages>0);assert.deepEqual(rehearsal.index.status(),before);assert.ok(fs.existsSync(path.join(folder,'index.sqlite-wal')));
  const verified=verifyIndexBackup({bundle,settings:s});assert.equal(verified.verified,true);
  const restoredInfo=restoreIndexBackup({bundle,destination:path.join(folder,'restored'),settings:s});assert.equal(restoredInfo.freshSyncRequired,true);assert.equal(restoredInfo.financialExecutionAllowed,false);assert.deepEqual(restoredInfo.status.head,before.head);
  restored=new LaunchProjectIndex({...s,databasePath:restoredInfo.database,provider:rehearsal.provider,maxBlocksPerSync:256});
  assert.deepEqual(await restored.history({project,wallet:rehearsal.sampleWallet,cursor:pending.participantHistory.cursor,limit:25}),first);
  const second=await restored.history({project,wallet:rehearsal.sampleWallet,cursor:first.progress.cursor,limit:25});assert.equal(second.progress.processedEvents,50);
  assert.deepEqual(await rehearsal.index.history({project,wallet:rehearsal.sampleWallet,cursor:pending.participantHistory.cursor,limit:25}),first);
  const nft=rehearsal.cases.find(x=>x.key==='nft-item-pages').address,state=(await restored.state(nft,{wallet:rehearsal.sampleWallet})).state;
  const page=await restored.nftItems({project:nft,wallet:rehearsal.sampleWallet,blockNumber:state.blockNumber,blockHash:state.blockHash,limit:20});assert.equal(page.items.length,20);assert.equal(page.items[0].tokenId,'1');assert.notEqual(page.items[0].currentOwner,page.items[0].reservedWallet);
  await rehearsal.chain.provider.request({method:'evm_mine',params:[]});const synced=await restored.sync();assert.equal(synced.caughtUp,true);assert.ok(restored.status().head.number>before.head.number);assert.deepEqual(rehearsal.index.status().head,before.head);
  observations.realIndex={projects:before.projects,events:before.events,pages:saved.manifest.pages,pendingBefore:25,pendingAfterRestore:50,nftPageItems:20,sourceStayedRunning:true,canonicalSyncAdvanced:true,sourceSnapshotUnchanged:true};
 }finally{restored?.close();await rehearsal.close();}
});

test('online backup restarts for a separate WAL writer and retains an atomic metadata transaction',{timeout:30000},async()=>{
 const f=empty(),writer=openTestDb(f.source);let changed=false;
 try{
  writer.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('backup_fixture_padding','X'.repeat(4*1024*1024));
  writer.exec("INSERT INTO meta VALUES('backup_fixture_a','0');INSERT INTO meta VALUES('backup_fixture_b','0');");
  const saved=await backupIndex({source:f.source,bundle:path.join(f.folder,'concurrent'),settings,rate:1,onProgress:({remainingPages})=>{
   if(!changed&&remainingPages>0){changed=true;writer.exec("BEGIN IMMEDIATE;UPDATE meta SET value='43' WHERE key IN ('backup_fixture_a','backup_fixture_b');COMMIT;");}
  }});
  assert.equal(changed,true);const db=openTestDb(path.join(saved.bundle,'snapshot.sqlite'),{readOnly:true});
  try{const a=db.prepare("SELECT value FROM meta WHERE key='backup_fixture_a'").get().value,b=db.prepare("SELECT value FROM meta WHERE key='backup_fixture_b'").get().value;assert.equal(a,'43');assert.equal(b,a);}finally{db.close();}
  assert.equal(verifyIndexBackup({bundle:saved.bundle,settings}).verified,true);observations.concurrentWriter={changedDuringBackup:true,atomicValuesPreserved:true,steps:saved.manifest.steps,pages:saved.manifest.pages};
 }finally{writer.close();f.index.close();}
});

test('backup and restore refuse existing destinations without overwriting their contents',async()=>{
 const f=empty();try{
  const occupied=path.join(f.folder,'occupied');fs.mkdirSync(occupied);fs.writeFileSync(path.join(occupied,'sentinel'),'keep');
  await assert.rejects(()=>backupIndex({source:f.source,bundle:occupied,settings}),/BACKUP_DESTINATION_EXISTS/);assert.equal(fs.readFileSync(path.join(occupied,'sentinel'),'utf8'),'keep');
  const b=await backupIndex({source:f.source,bundle:path.join(f.folder,'bundle'),settings});assert.throws(()=>restoreIndexBackup({bundle:b.bundle,destination:occupied,settings}),/BACKUP_DESTINATION_EXISTS/);assert.equal(fs.readFileSync(path.join(occupied,'sentinel'),'utf8'),'keep');observations.existingDestinationsPreserved=true;
 }finally{f.index.close();}
});

test('wrong scope,unrelated database and changed schema are rejected before creating a backup',async()=>{
 const f=empty();try{
  for(const patch of [{startBlock:2},{confirmations:2},{config:{...config,chainId:56,mode:'production'}},{config:{...config,registry:{...config.registry,runtimeHash:'0x'+'22'.repeat(32)}}}]){
   const target=path.join(f.folder,'wrong');await assert.rejects(()=>backupIndex({source:f.source,bundle:target,settings:{...settings,...patch}}),/BACKUP_SCOPE_MISMATCH/);assert.equal(fs.existsSync(target),false);
  }
  const unrelated=path.join(f.folder,'unrelated.sqlite'),other=openTestDb(unrelated);other.exec('CREATE TABLE note(value TEXT);');other.close();const hash=hashBackupFile(unrelated);
  await assert.rejects(()=>backupIndex({source:unrelated,bundle:path.join(f.folder,'not-created'),settings}),/BACKUP_NOT_INDEX_DATABASE/);assert.equal(hashBackupFile(unrelated),hash);
  const writer=openTestDb(f.source);writer.exec('CREATE TABLE unexpected(value TEXT);');writer.close();await assert.rejects(()=>backupIndex({source:f.source,bundle:path.join(f.folder,'schema-rejected'),settings}),/BACKUP_SCHEMA_MISMATCH/);observations.scopeAndUnrelatedRejected=true;observations.changedSchemaRejected=true;
 }finally{f.index.close();}
});

test('unsealed,corrupted or authority-forged bundles cannot restore',async()=>{
 const f=empty();try{
  const incomplete=path.join(f.folder,'incomplete');fs.mkdirSync(incomplete);assert.throws(()=>verifyIndexBackup({bundle:incomplete,settings}),/BACKUP_INCOMPLETE/);
  const a=await backupIndex({source:f.source,bundle:path.join(f.folder,'forged'),settings}),manifest=path.join(a.bundle,'manifest.json'),m=read(manifest);fs.writeFileSync(manifest,JSON.stringify({...m,financialExecutionAllowed:true}));
  assert.throws(()=>verifyIndexBackup({bundle:a.bundle,settings}),/BACKUP_MANIFEST/);fs.writeFileSync(manifest,JSON.stringify(m));
  const file=path.join(a.bundle,'snapshot.sqlite'),fd=fs.openSync(file,'r+');fs.writeSync(fd,Buffer.from([0]),0,1,0);fs.closeSync(fd);assert.throws(()=>restoreIndexBackup({bundle:a.bundle,destination:path.join(f.folder,'not-restored'),settings}),/BACKUP_CHECKSUM/);assert.equal(fs.existsSync(path.join(f.folder,'not-restored')),false);
  const b=await backupIndex({source:f.source,bundle:path.join(f.folder,'foreign-key'),settings}),db=openTestDb(path.join(b.bundle,'snapshot.sqlite'));
  db.exec("PRAGMA foreign_keys=OFF;INSERT INTO participant_receipts VALUES('fixture',999,'fixture','{}');");db.close();const mb=read(path.join(b.bundle,'manifest.json'));mb.snapshotSha256=hashBackupFile(path.join(b.bundle,'snapshot.sqlite'));mb.snapshotBytes=fs.statSync(path.join(b.bundle,'snapshot.sqlite')).size;fs.writeFileSync(path.join(b.bundle,'manifest.json'),JSON.stringify(mb));
  assert.throws(()=>verifyIndexBackup({bundle:b.bundle,settings}),/BACKUP_INTEGRITY/);observations.invalidBundlesRejected=true;observations.foreignKeyDamageRejected=true;
 }finally{f.index.close();}
});

test('actual backup/verify/restore CLI never needs RPC and preserves read-only restoration flags',{timeout:30000},()=>{
 const f=empty(),configFile=path.join(f.folder,'config.json');fs.writeFileSync(configFile,JSON.stringify(config));
 const common=['--config',configFile,'--start-block','1','--bundle',path.join(f.folder,'cli-bundle')];
 const cli=args=>{const r=spawnSync(process.execPath,['scripts/index-backup.mjs',...args,...common],{cwd:root,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
 try{
  assert.equal(cli(['backup','--source',f.source]).manifest.complete,true);assert.equal(cli(['verify']).verified,true);const restored=cli(['restore','--destination',path.join(f.folder,'cli-restored')]);assert.equal(restored.freshSyncRequired,true);assert.equal(restored.liveStateVerified,false);assert.equal(restored.financialExecutionAllowed,false);observations.actualCli={commands:3,noRpc:true,readOnlyFlags:true};
 }finally{f.index.close();}
});
test('backup resource limits account for committed WAL pages before making a destination',async()=>{
 const f=empty();try{
  const before=hashBackupFile(f.source),target=path.join(f.folder,'limited');
  await assert.rejects(()=>backupIndex({source:f.source,bundle:target,settings,maxBytes:4096}),/BACKUP_SIZE_LIMIT/);assert.equal(fs.existsSync(target),false);
  await assert.rejects(()=>backupIndex({source:f.source,bundle:target,settings,rate:0}),/BACKUP_POLICY/);assert.equal(hashBackupFile(f.source),before);observations.resourceLimitsFailClosed=true;
 }finally{f.index.close();}
});
test('interrupted copying leaves an unsealed bundle and keeps the original cache readable',async()=>{
 const f=empty(),writer=openTestDb(f.source);try{
  writer.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('backup_fixture_padding','X'.repeat(1024*1024));const target=path.join(f.folder,'interrupted'),before=f.index.status();
  await assert.rejects(()=>backupIndex({source:f.source,bundle:target,settings,rate:1,onProgress:()=>{throw Error('INJECTED_COPY_STOP');}}),/INJECTED_COPY_STOP/);
  assert.equal(fs.existsSync(path.join(target,'manifest.json')),false);assert.throws(()=>verifyIndexBackup({bundle:target,settings}),/BACKUP_INCOMPLETE/);assert.deepEqual(f.index.status(),before);observations.interruptionFailClosed=true;
 }finally{writer.close();f.index.close();}
});
test.after(()=>{fs.writeFileSync(path.join(root,'evidence/index-backup-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),observations,realWalletUsed:false,remoteWrites:false,publicServiceDeployed:false},null,2)+'\n');});
