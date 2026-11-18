import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backupIndex,verifyIndexBackup,restoreIndexBackup} from './index-backup.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.resolve(root,'../../work/echo-launch-preview-20261113/runtime-read-20261114');
const active=JSON.parse(fs.readFileSync(path.join(work,'active-preview.json'),'utf8')),directory=fs.realpathSync(active.directory);
assert.ok(directory.startsWith(fs.realpathSync(work)+path.sep));assert.equal(active.chainId,31337);assert.equal(active.localOnly,true);
const metadata=JSON.parse(fs.readFileSync(path.join(directory,'rehearsal.json'),'utf8')),url=new URL(active.url);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');
const status=async()=>{const response=await fetch(new URL('/launch-api/status',url),{signal:AbortSignal.timeout(5000)});assert.equal(response.ok,true);const s=await response.json();assert.equal(s.chainId,31337);assert.equal(s.readOnly,true);assert.equal(s.executionReady,false);assert.equal(s.index.registry.toLowerCase(),metadata.config.registry.address.toLowerCase());return s;};
const before=await status(),output=fs.mkdtempSync(path.join(work,'backup-demo-')),settings={config:metadata.config,startBlock:metadata.startBlock};
const saved=await backupIndex({source:path.join(directory,'index.sqlite'),bundle:path.join(output,'backup'),settings});
assert.equal(verifyIndexBackup({bundle:saved.bundle,settings}).verified,true);
const restored=restoreIndexBackup({bundle:saved.bundle,destination:path.join(output,'restored'),settings});
assert.equal(JSON.stringify(restored.status.head),JSON.stringify(before.index.head));assert.equal(restored.status.projects,before.index.projects);assert.equal(restored.status.events,before.index.events);
const after=await status();assert.deepEqual(after.index.head,before.index.head);assert.equal(after.index.projects,before.index.projects);assert.equal(after.index.events,before.index.events);
const scopeFile=path.join(output,'rehearsal-scope.json');fs.writeFileSync(scopeFile,JSON.stringify({config:metadata.config,startBlock:metadata.startBlock},null,2)+'\n');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result={at:new Date().toISOString(),actualLivePreview:true,previewUrl:active.url,previewPid:active.pid,outputDirectory:output,sourceBefore:before.index,sourceAfter:after.index,
 backup:{bundle:saved.bundle,pages:saved.manifest.pages,snapshotSha256:saved.manifest.snapshotSha256,observation:saved.manifest.observation},restored,
 inputHashes:Object.fromEntries(['scripts/demo-index-backup.mjs','scripts/index-backup.mjs'].map(f=>[f,hash(path.join(root,f))])),externalHashes:Object.fromEntries([scopeFile,path.join(saved.bundle,'snapshot.sqlite'),path.join(saved.bundle,'manifest.json')].map(f=>[f,hash(f)])),
 readOnlySource:true,sourcePreviewStillLive:true,sourceHeadAndCountsUnchanged:true,backupChecksumVerified:true,restoredToNewDirectory:true,publicServiceDeployed:false,financialExecutionAllowed:false,liveCanonicalStateAfterRestoreVerified:false};
fs.writeFileSync(path.join(root,'evidence/index-backup-live-demo.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({livePreviewStillRunning:true,projects:before.index.projects,events:before.index.events,pages:saved.manifest.pages,restoredToNewDirectory:true,outputDirectory:output,financialExecutionAllowed:false}));
