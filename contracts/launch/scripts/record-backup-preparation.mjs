import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const previous=read('evidence/active-work.json'),p=read('evidence/preparation-progress.json');
if(!p.indexBackup?.locallyVerified||!p.indexBackup.currentInputsMatch||!p.localTests.currentInputsMatch||p.localTests.failed!==0||!p.historicalDexFork.verified||!p.executorGas.localMeasurementsVerified)throw Error('CURRENT_BACKUP_PREPARATION_REQUIRED');
const state={...previous,observedAt:new Date().toISOString(),goalStatus:'active',classification:'progress',previousGoalTurnClassification:'progress',
 currentStage:'Online SQLite WAL snapshot and new-directory restore locally verified.8source-current tests include real520receipt/pending-history/NFT recovery,concurrent writes,corruption,resource limits,interruption and CLI paths. Actual16project preview backed up/restored without stopping source service. Production operations and other gates remain.',
 indexBackup:p.indexBackup,liveTestSession:null,
 completedThisTurn:[
  'Implemented source-read-only SQLite online backup with canonical index-constructor scope/schema validation,integrity/foreign-key checks,SHA-256 manifest and bounded copying.',
  'Implemented verify and restore into new directories only. Existing files/unrelated schemas,wrong scope,damaged data,unsealed/authority-forged manifests and foreign-key corruption are rejected.',
  'Verified pending history restoration from25to50events without changing the original scan,20NFT item observations and fresh canonical sync on the owned local EVM.',
  'Verified a separate WAL writer retains an atomic metadata transaction and interrupted/resource-limited copying fails closed.8tests and three actual offline CLI commands pass.',
  'Actually backed up the running16project/1411event preview and restored a new cache,verified checksum/head/counts,and rechecked the original HTTP service without downtime.',
  'Added the recovery runbook and a source-current local backup gate;public hosting,off-device replicas,retention/monitoring and production recovery targets remain unverified.'
 ],nextActions:p.nextActions,productionReady:false,executionReady:false,contractsDeployed:false,audited:false,launchUploaded:false,
 limitations:'Backup/restore is tested on owned local EVM and loopback preview caches. It does not verify off-device storage,production durability,finality,current eligibility or financial authority. Actual hosted providers/operations,public storage/admission,independent review,public testnet,real-wallet/deployment signing,startup funds and production authorization remain open.'};
fs.writeFileSync(path.join(root,'evidence/active-work.json'),JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify({recorded:true,goalStatus:'active',backupTests:state.indexBackup.testsPassed,liveProjects:state.indexBackup.actualLivePreviewProjects,productionReady:false}));
