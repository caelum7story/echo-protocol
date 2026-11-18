import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Wallet,id,toBeHex,keccak256,toUtf8Bytes} from 'ethers';
import {DistributionQueue} from '../scripts/distribution-queue.mjs';
import {backupDistributionQueue,verifyDistributionBackup,restoreDistributionBackup} from '../scripts/distribution-backup.mjs';
import {LaunchProjectIndex} from '../lib/project-index.mjs';
import {backupIndex,verifyIndexBackup,restoreIndexBackup} from '../scripts/index-backup.mjs';

test('long database and backup paths retain WAL data,scope checks and the durable restore hold',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),fixture=fs.mkdtempSync(path.join(root,'evidence/sqlite-long-path-'));
 let directory=fixture;while(path.join(directory,'queue.sqlite').length<290)directory=path.join(directory,'nested-runtime-location-'.repeat(2));
 fs.mkdirSync(directory,{recursive:true});
 const databasePath=path.join(directory,'queue.sqlite'),wallet=new Wallet(toBeHex(1,32)).address,project=new Wallet(toBeHex(2,32)).address,scope={chainId:31337,wallet};
 let queue=new DistributionQueue({databasePath,...scope}),clone;
 try{
  const job=queue.enqueue({project,keys:[id('LONG-PATH-RECOVERY')]});
  const saved=await backupDistributionQueue({source:databasePath,bundle:path.join(directory,'online-backup'),scope});
  assert.equal(verifyDistributionBackup({bundle:saved.bundle,scope}).verified,true);
  const restored=restoreDistributionBackup({bundle:saved.bundle,destination:path.join(directory,'held-restored-queue'),scope});
  clone=new DistributionQueue({databasePath:restored.database,...scope});
  assert.equal(clone.get(job.id).id,job.id);assert.ok(clone.recoveryHold);
  assert.throws(()=>clone.claim({owner:'must-not-resume'}),/QUEUE_RECOVERY_HOLD/);
  clone.close();clone=null;queue.close();queue=null;
  queue=new DistributionQueue({databasePath,...scope});assert.equal(queue.get(job.id).id,job.id);
  assert.throws(()=>new DistributionQueue({databasePath,chainId:56,wallet}),/QUEUE_SCOPE_MISMATCH/);
  assert.equal(queue.snapshot().jobCount,1);
 }finally{clone?.close();queue?.close();}
});

test('the project index retains its in-memory mode and can back up and restore beyond the Windows path limit',async()=>{
 const root=path.resolve(import.meta.dirname,'..'),fixture=fs.mkdtempSync(path.join(root,'evidence/index-long-path-'));
 let directory=fixture;while(path.join(directory,'index.sqlite').length<290)directory=path.join(directory,'nested-index-location-'.repeat(2));fs.mkdirSync(directory,{recursive:true});
 const config={schema:'echo-launch-runtime/v1',chainId:31337,mode:'local-test',executionReady:false,minConfirmations:1,registry:{address:new Wallet(toBeHex(42,32)).address,runtimeHash:keccak256(toUtf8Bytes('SYNTHETIC LONG PATH INDEX'))},approvedTemplates:[]};
 const settings={config,startBlock:1},memory=new LaunchProjectIndex({...settings,databasePath:':memory:',provider:null});assert.equal(memory.status().chainId,31337);memory.close();
 const source=path.join(directory,'index.sqlite');let index=new LaunchProjectIndex({...settings,databasePath:source,provider:null}),restoredIndex;
 try{
  const before=index.status(),saved=await backupIndex({source,bundle:path.join(directory,'online-index-backup'),settings});assert.equal(verifyIndexBackup({bundle:saved.bundle,settings}).verified,true);
  const restored=restoreIndexBackup({bundle:saved.bundle,destination:path.join(directory,'restored-index'),settings});restoredIndex=new LaunchProjectIndex({...settings,databasePath:restored.database,provider:null});
  assert.equal(restoredIndex.status().chainId,before.chainId);assert.equal(restoredIndex.status().projectCount,before.projectCount);
  restoredIndex.close();restoredIndex=null;index.close();index=null;index=new LaunchProjectIndex({...settings,databasePath:source,provider:null});assert.equal(index.status().chainId,31337);
 }finally{restoredIndex?.close();index?.close();}
});
