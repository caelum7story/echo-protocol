import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from './compile.mjs';
import {inspectAccountingEvidence} from './accounting-evidence.mjs';
import {inspectRecipientEvidence} from './recipient-evidence.mjs';
import {inspectOracleEvidence} from './oracle-evidence.mjs';
import {inspectBoundaryBrowserEvidence} from './boundary-browser-evidence.mjs';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';

const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const optional=file=>fs.existsSync(path.join(root,file))?read(file):null;
const gates=read('release-gates.json'),local=optional('evidence/local-chain-result.json'),bindings=optional('evidence/public-bindings-bsc56.json');
const lifecycleBoundaryBrowser=inspectBoundaryBrowserEvidence(root);
const hash=contents=>createHash('sha256').update(contents).digest('hex');
const deploymentRaw=optional('evidence/deployment-route-result.json'),deploymentWalk=optional('evidence/deployment-route-walkthrough.json'),deploymentMismatch=[];
if(deploymentRaw){
 for(const [file,digest] of Object.entries({...deploymentRaw.sourceHashes,...deploymentRaw.inputHashes,...deploymentRaw.artifactHashes})){
  const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)deploymentMismatch.push(file);
 }
 for(const [file,key]of [['evidence/deployment-route-walkthrough.json','walkthroughSha256'],['evidence/deployment-route-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==deploymentRaw[key])deploymentMismatch.push(file);
}
const deploymentVerified=!!deploymentRaw&&deploymentRaw.exitCode===0&&deploymentRaw.passed===6&&deploymentRaw.failed===0&&deploymentRaw.chainId===31337&&deploymentRaw.publicTransactions===false&&deploymentRaw.realWalletUsed===false&&deploymentRaw.binanceWalletPreviewVerified===false&&deploymentMismatch.length===0&&deploymentWalk?.chainId===31337&&deploymentWalk?.plan?.deployments?.length===3&&deploymentWalk?.plan?.registrations?.length===2&&deploymentWalk?.receipts?.every(r=>r.status===1)&&['deploy-LaunchRegistry','deploy-NftLaunchFactory','deploy-TokenLaunchFactory','Register NFT template','Register token template','deliver-local-nfts','distribute-local-token'].every(label=>deploymentWalk?.receipts?.some(r=>r.label===label));
const recoveryRaw=optional('evidence/deployment-recovery-result.json'),recoveryWalk=optional('evidence/deployment-recovery-walkthrough.json'),recoveryMismatch=[];
if(recoveryRaw){
 for(const [file,digest]of Object.entries({...recoveryRaw.sourceHashes,...recoveryRaw.inputHashes,...recoveryRaw.artifactHashes})){const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)recoveryMismatch.push(file);}
 for(const [file,key]of [['evidence/deployment-recovery-walkthrough.json','walkthroughSha256'],['evidence/deployment-recovery-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==recoveryRaw[key])recoveryMismatch.push(file);
}
const recoveryVerified=!!recoveryRaw&&recoveryRaw.exitCode===0&&recoveryRaw.passed===8&&recoveryRaw.failed===0&&recoveryRaw.chainId===31337&&recoveryRaw.publicTransactions===false&&recoveryRaw.realWalletUsed===false&&recoveryRaw.binanceWalletPreviewVerified===false&&recoveryMismatch.length===0&&recoveryWalk?.chainId===31337&&recoveryWalk?.transactions?.some(t=>t.status===0)&&['five-steps-confirmed','actual-pending','same-pending-hash-confirmed','unknown-is-not-dropped-or-zero','failed-receipt-still-needs-confirmations','real-failed-duplicate-with-separate-existing-state','all-immutable-occurrences-and-full-store-rejected-tampering','retired-template'].every(name=>recoveryWalk?.observations?.some(o=>o.name===name));
const queueRaw=optional('evidence/distribution-queue-result.json'),queueWalk=optional('evidence/distribution-queue-walkthrough.json'),queueMismatch=[];
if(queueRaw){
 for(const [file,digest]of Object.entries({...queueRaw.sourceHashes,...queueRaw.inputHashes,...queueRaw.artifactHashes})){const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)queueMismatch.push(file);}
 for(const [file,key]of [['evidence/distribution-queue-walkthrough.json','walkthroughSha256'],['evidence/distribution-queue-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==queueRaw[key])queueMismatch.push(file);
}
const queueVerified=!!queueRaw&&queueRaw.exitCode===0&&queueRaw.passed===11&&queueRaw.failed===0&&queueRaw.chainId===31337&&queueRaw.publicTransactions===false&&queueRaw.realWalletUsed===false&&queueRaw.automaticSignerConfigured===false&&queueMismatch.length===0&&queueWalk?.automaticSignerConfigured===false&&['two-process-single-claim','expired-worker-fenced','crash-and-unknown-hash-not-retried','actual-batch-proof-completed','concurrent-self-claim-not-attributed-to-platform','actual-failed-batch-keeps-lane-and-rights','actual-readonly-operator-cli','abrupt-worker-death-retains-unknown-boundary'].every(name=>queueWalk?.observations?.some(o=>o.name===name));
const queueBackupRaw=optional('evidence/distribution-backup-result.json'),queueBackupWalk=optional('evidence/distribution-backup-walkthrough.json'),queueBackupMismatch=[];
if(queueBackupRaw){
 for(const [file,digest]of Object.entries({...queueBackupRaw.sourceHashes,...queueBackupRaw.inputHashes,...queueBackupRaw.artifactHashes})){const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)queueBackupMismatch.push(file);}
 for(const [file,key]of [['evidence/distribution-backup-walkthrough.json','walkthroughSha256'],['evidence/distribution-backup-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==queueBackupRaw[key])queueBackupMismatch.push(file);
}
const queueBackupVerified=!!queueBackupRaw&&queueBackupRaw.exitCode===0&&queueBackupRaw.passed===8&&queueBackupRaw.failed===0&&queueBackupRaw.chainId===31337&&queueBackupRaw.publicTransactions===false&&queueBackupRaw.realWalletUsed===false&&queueBackupRaw.automaticResumeAllowed===false&&queueBackupMismatch.length===0&&queueBackupWalk?.automaticResumeAllowed===false&&['live-wal-consistent-snapshot','stale-snapshot-never-authorizes-replay','interrupted-restore-directory-guard','corruption-and-scope-fail-closed','incomplete-backup-not-restorable','restored-pending-real-receipt','actual-backup-cli','abrupt-backup-death-incomplete'].every(name=>queueBackupWalk?.observations?.some(o=>o.name===name));
const monitorRaw=optional('evidence/distribution-monitor-result.json'),monitorWalk=optional('evidence/distribution-monitor-walkthrough.json'),monitorMismatch=[];
if(monitorRaw){
 for(const [file,digest]of Object.entries({...monitorRaw.sourceHashes,...monitorRaw.inputHashes,...monitorRaw.artifactHashes})){const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)monitorMismatch.push(file);}
 for(const [file,key]of [['evidence/distribution-monitor-walkthrough.json','walkthroughSha256'],['evidence/distribution-monitor-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==monitorRaw[key])monitorMismatch.push(file);
}
const monitorVerified=!!monitorRaw&&monitorRaw.exitCode===0&&monitorRaw.passed===8&&monitorRaw.failed===0&&monitorRaw.chainId===31337&&monitorRaw.publicTransactions===false&&monitorRaw.realWalletUsed===false&&monitorRaw.automaticResumeAllowed===false&&monitorRaw.scheduledServiceRunning===false&&monitorMismatch.length===0&&monitorWalk?.automaticResumeAllowed===false&&['actual-completed-reverified','actual-reorg-keeps-history-and-holds-dispatch','self-claim-monitor-no-receipt-attribution','rpc-alert-recovery-never-auto-resumes','canonical-and-entitlement-faults-rejected','bounded-cursor-and-stale-monitor-fencing','monitor-hold-survives-backup-and-restore','actual-readonly-monitor-cli'].every(name=>monitorWalk?.observations?.some(o=>o.name===name));
const feeBudgetRaw=optional('evidence/distribution-budget-result.json'),feeBudgetWalk=optional('evidence/distribution-budget-walkthrough.json'),feeBudgetMismatch=[];
if(feeBudgetRaw){
 for(const [file,digest]of Object.entries({...feeBudgetRaw.sourceHashes,...feeBudgetRaw.inputHashes,...feeBudgetRaw.artifactHashes})){const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)feeBudgetMismatch.push(file);}
 for(const [file,key]of [['evidence/distribution-budget-walkthrough.json','walkthroughSha256'],['evidence/distribution-budget-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==feeBudgetRaw[key])feeBudgetMismatch.push(file);
}
const feeBudgetVerified=!!feeBudgetRaw&&feeBudgetRaw.exitCode===0&&feeBudgetRaw.passed===9&&feeBudgetRaw.failed===0&&feeBudgetRaw.chainId===31337&&feeBudgetRaw.publicTransactions===false&&feeBudgetRaw.realWalletUsed===false&&feeBudgetRaw.financialAuthorization===false&&feeBudgetRaw.automaticSignerConfigured===false&&feeBudgetMismatch.length===0&&['policy-required-without-financial-authority','stale-and-resealed-budget-checks-rejected','uncertainty-reserved-across-days-and-policy','multiprocess-budget-and-lane-atomic','actual-fee-pending-restart-and-reorg','actual-failed-fee-is-charged','fee-proof-fault-never-releases-unknown-cost','budget-state-survives-backup-restore','actual-readonly-budget-cli'].every(name=>feeBudgetWalk?.observations?.some(o=>o.name===name));
const serviceRaw=optional('evidence/distribution-service-result.json'),serviceWalk=optional('evidence/distribution-service-walkthrough.json'),serviceMismatch=[];
if(serviceRaw){
 for(const [file,digest]of Object.entries({...serviceRaw.sourceHashes,...serviceRaw.inputHashes,...serviceRaw.artifactHashes})){const target=path.join(root,file.startsWith('@')?'node_modules':'',file);if(!fs.existsSync(target)||hash(fs.readFileSync(target))!==digest)serviceMismatch.push(file);}
 for(const [file,key]of [['evidence/distribution-service-walkthrough.json','walkthroughSha256'],['evidence/distribution-service-tests.tap','tapSha256']])if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==serviceRaw[key])serviceMismatch.push(file);
}
const serviceCli=serviceWalk?.observations?.find(o=>o.name==='actual-readonly-service-cli-and-fee-reconciliation');
const serviceVerified=!!serviceRaw&&serviceRaw.exitCode===0&&serviceRaw.passed===9&&serviceRaw.failed===0&&serviceRaw.chainId===31337&&serviceRaw.publicTransactions===false&&serviceRaw.realWalletUsed===false&&serviceRaw.productionServiceStarted===false&&serviceRaw.automaticSignerConfigured===false&&serviceMismatch.length===0&&serviceCli?.cycles===2&&serviceCli.observedLiveChild===true&&serviceCli.gracefullyStopped===true&&['explicit-policy-and-initial-sweep-gate','oldest-sweep-and-cycle-freshness','expired-owner-fenced','sequential-bounded-passes-and-heartbeat','actual-two-process-service-ownership','actual-worker-death-stops-dispatch-after-ttl','rpc-fault-and-full-read-recovery','service-backup-never-authorizes-clone'].every(name=>serviceWalk?.observations?.some(o=>o.name===name));
const localMismatch=[];
if(local){
 for(const [file,digest] of Object.entries(local.sourceHashes??{})){
  const resolved=path.join(root,file.startsWith('@')?'node_modules':'',file);
  if(!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)localMismatch.push(file);
 }
 if(local.lockfileSha256!==hash(fs.readFileSync(path.join(root,'package-lock.json'))))localMismatch.push('package-lock.json');
 if(local.testSourceHash!==hash(fs.readFileSync(path.join(root,'test/contracts.test.mjs'))))localMismatch.push('test/contracts.test.mjs');
 if(local.testHarnessHash!==hash(fs.readFileSync(path.join(root,'test/local-chain.mjs'))))localMismatch.push('test/local-chain.mjs');
 if(local.agentClientHash!==hash(fs.readFileSync(path.join(root,'lib/agent-client.mjs'))))localMismatch.push('lib/agent-client.mjs');
 if(local.agentCliHash!==hash(fs.readFileSync(path.join(root,'agent/echo-launch-agent.mjs'))))localMismatch.push('agent/echo-launch-agent.mjs');
 const currentModules=['lib','agent'].flatMap(folder=>fs.readdirSync(path.join(root,folder)).filter(f=>f.endsWith('.mjs')).map(f=>folder+'/'+f)).sort();
 if(JSON.stringify(currentModules)!==JSON.stringify(Object.keys(local.moduleHashes??{}).sort()))localMismatch.push('module-input-manifest');
 for(const [file,digest] of Object.entries(local.moduleHashes??{}))if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==digest)localMismatch.push(file);
 for(const file of ['runtime-read.mjs','participant-view.mjs','runtime-detail.mjs','core.mjs']){const source=path.resolve(root,'../../frontend/dist/launch',file);if(!local.frontendRuntimeHashes?.[file]||!fs.existsSync(source)||hash(fs.readFileSync(source))!==local.frontendRuntimeHashes[file])localMismatch.push('frontend-runtime/'+file);}
}
const audit=optional('evidence/dependency-audit.json');
const auditCurrent=!!audit&&audit.exitCode===0&&audit.unchangedLockfile===true&&audit.lockfileSha256===hash(fs.readFileSync(path.join(root,'package-lock.json')));
const official=optional('evidence/official-dex-runtime-result.json'),officialMismatch=[];
if(official){
 for(const [file,digest] of Object.entries(official.sourceHashes??{})){
  const resolved=path.join(root,file.startsWith('@')?'node_modules':'',file);
  if(!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)officialMismatch.push(file);
 }
 for(const [file,digest] of Object.entries(official.inputHashes??{})){
  if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==digest)officialMismatch.push(file);
 }
 if(official.lockfileSha256!==hash(fs.readFileSync(path.join(root,'package-lock.json'))))officialMismatch.push('package-lock.json');
}
const officialVerified=!!official&&official.exitCode===0&&official.failed===0&&official.passed>0&&officialMismatch.length===0;
const content=optional('evidence/nft-content-result.json'),contentMismatch=[];
if(content)for(const [file,digest] of Object.entries(content.inputHashes??{}))if(!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==digest)contentMismatch.push(file);
const kubo=optional('evidence/kubo-offline-result.json'),tool=optional('evidence/kubo-tool-verification.json'),kuboMismatch=[];
if(kubo){
 for(const file of ['scripts/test-kubo-offline.mjs','lib/nft-content.mjs','references/kubo-release.json','evidence/kubo-tool-verification.json','package-lock.json']){
  if(!kubo.inputHashes?.[file]||!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==kubo.inputHashes[file])kuboMismatch.push(file);
 }
 const executable=tool?.executable?path.resolve(root,tool.executable):null;
 if(!executable||!executable.startsWith(path.resolve(root,'tools')+path.sep)||!fs.existsSync(executable)||hash(fs.readFileSync(executable))!==kubo.toolSha256||kubo.toolSha256!==tool.executableSha256)kuboMismatch.push('verified-kubo-executable');
}
const kuboVerified=!!kubo&&kubo.exitCode===0&&kubo.checksPassed===21&&kubo.allOwnedDaemonsStopped===true&&kubo.localRecursivePinningVerified===true&&kuboMismatch.length===0;
const indexChecks=local&&fs.existsSync(path.join(root,'evidence/local-chain-tests.tap'))?[...fs.readFileSync(path.join(root,'evidence/local-chain-tests.tap'),'utf8').matchAll(/^ok \d+ - index /gm)].length:0;
const indexVerified=!!local&&local.exitCode===0&&local.failed===0&&localMismatch.length===0&&indexChecks===9;
const frontendFile=path.resolve(root,'../../work/echo-launch-preview-20261113/agent-runtime-20261114/frontend-result.json'),frontendRoot=path.resolve(root,'../echo-mint-preview-20261105');
const frontend=fs.existsSync(frontendFile)?JSON.parse(fs.readFileSync(frontendFile,'utf8')):null,frontendMismatch=[];
if(frontend)for(const [file,digest] of Object.entries(frontend.inputHashes??{})){
 const resolved=path.resolve(frontendRoot,file);if(!resolved.startsWith(frontendRoot+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)frontendMismatch.push(file);
}
const browserFile=path.resolve(root,'../../work/echo-launch-preview-20261113/runtime-read-20261114/browser-qa.json'),browserRoot=path.dirname(browserFile);
const browser=fs.existsSync(browserFile)?JSON.parse(fs.readFileSync(browserFile,'utf8')):null,browserMismatch=[];
if(browser){
 for(const file of ['artifacts/LaunchRegistry.json','artifacts/NftLaunch.json','artifacts/TokenLaunch.json','artifacts/LaunchToken.json','artifacts/NftLaunchFactory.json','artifacts/TokenLaunchFactory.json']){
  if(!browser.artifactHashes?.[file]||!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==browser.artifactHashes[file])browserMismatch.push('browser-artifact-not-pinned-or-changed/'+file);
 }
 for(const file of ['lib/participant-history.mjs','lib/nft-items.mjs'])if(!browser.inputHashes?.[file])browserMismatch.push('missing-browser-input/'+file);
 if(!browser.frontendHashes?.['dist/launch/runtime-detail.mjs'])browserMismatch.push('missing-browser-input/runtime-detail.mjs');
 for(const [file,digest] of Object.entries(browser.inputHashes??{})){const resolved=path.resolve(root,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)browserMismatch.push(file);}
 for(const [file,digest] of Object.entries(browser.frontendHashes??{})){const resolved=path.resolve(frontendRoot,file);if(!resolved.startsWith(frontendRoot+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)browserMismatch.push('frontend/'+file);}
 for(const [file,digest] of Object.entries(browser.screenshots??{})){const resolved=path.resolve(browserRoot,file);if(!resolved.startsWith(browserRoot+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)browserMismatch.push('screenshot/'+file);}
 for(const [file,digest] of Object.entries(browser.observationFiles??{})){const resolved=path.resolve(browserRoot,file);if(!resolved.startsWith(browserRoot+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)browserMismatch.push('observation/'+file);}
}
const browserVerified=!!browser&&browser.renderedBrowserVerified===true&&browser.chainId===31337&&browser.localOnly===true&&Object.keys(browser.checks??{}).length>=10&&Object.values(browser.checks).every(v=>v===true)&&browserMismatch.length===0;
const stateChecks=local&&fs.existsSync(path.join(root,'evidence/local-chain-tests.tap'))?[...fs.readFileSync(path.join(root,'evidence/local-chain-tests.tap'),'utf8').matchAll(/^ok \d+ - (?:confirmed state|indexed state|local read service) /gm)].length:0;
const runtimeVerified=indexVerified&&stateChecks===3&&browserVerified&&frontendMismatch.length===0&&frontend?.exitCode===0&&frontend?.failed===0;
const participantChecks=local&&fs.existsSync(path.join(root,'evidence/local-chain-tests.tap'))?[...fs.readFileSync(path.join(root,'evidence/local-chain-tests.tap'),'utf8').matchAll(/^ok \d+ - participant (?:receipt proofs|proof refuses) /gm)].length:0;
const participantVerified=runtimeVerified&&participantChecks===2&&browser?.lifecycleScenarioCount===14&&['participant-browser-observations.json','participant-browser-observations-v2.json'].some(f=>Object.keys(browser?.observationFiles??{}).includes(f));
const history=optional('evidence/participant-history-walkthrough.json'),historyCli=optional('evidence/participant-history-cli-walkthrough.json');
const historyChecks=local&&fs.existsSync(path.join(root,'evidence/local-chain-tests.tap'))?[...fs.readFileSync(path.join(root,'evidence/local-chain-tests.tap'),'utf8').matchAll(/^ok \d+ - participant history /gm)].length:0;
const historyBackendVerified=!!local&&local.exitCode===0&&local.failed===0&&localMismatch.length===0&&historyChecks===4&&history?.frozenSubscriptionTransactions===520&&history?.receiptsVerified===520&&history?.eventsVerified>1000&&history?.receiptPreviewCount===50&&history?.restartResumed===true&&history?.retryIdempotent===true&&history?.wrongScopeRejected===true&&history?.newBlocksExcluded===true&&historyCli?.completed?.historyFollow?.complete===true&&historyCli?.partial?.historyFollow?.complete===false&&historyCli?.transactionBroadcast===false;
const nftItems=optional('evidence/nft-item-pages-walkthrough.json'),nftItemChecks=local&&fs.existsSync(path.join(root,'evidence/local-chain-tests.tap'))?[...fs.readFileSync(path.join(root,'evidence/local-chain-tests.tap'),'utf8').matchAll(/^ok \d+ - NFT item /gm)].length:0;
const nftItemBackendVerified=!!local&&local.exitCode===0&&local.failed===0&&localMismatch.length===0&&nftItemChecks===2&&nftItems?.itemsVerified===125&&nftItems?.pages===7&&nftItems?.newBlocksExcluded===true&&nftItems?.wrongScopeRejected===true&&nftItems?.cliReadOnlyVerified===true;
const paginationBrowserVerified=runtimeVerified&&browser.paginationVerified===true&&browser.paginationScenarioCount===2&&browser.checks.historyCompleted===true&&browser.checks.nftAllPagesRead===true;
const gas=optional('evidence/gas-measurement.json'),gasTests=optional('evidence/gas-budget-test-result.json'),gasCli=optional('evidence/gas-budget-cli-checks.json'),gasMismatch=[];
for(const [label,report] of [['measurement',gas],['tests',gasTests],['cli',gasCli]]){
 if(!report?.inputHashes||!Object.keys(report.inputHashes).length){gasMismatch.push(label+'-input-manifest');continue;}
 for(const [file,digest] of Object.entries(report.inputHashes)){
  const resolved=path.resolve(root,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)gasMismatch.push(label+':'+file);
 }
}
const gasRequired=['startup.registry','startup.nft-factory','startup.token-factory-including-code-store','startup.register-nft','startup.register-token','nft.deliver.100','token.distribute.1','token.distribute.5','token.distribute.20','token.distribute.100','token.distribute-already-delivered.100','token.self-claim-fallback','token.distribute-after-self-claim','nft.record-full-refund','nft.pay-full-refund','token.record-full-refund','token.pay-full-refund','token.exit-all'];
const gasVerified=!!gas&&gas.schema==='echo-launch-local-gas/v1'&&gas.chainId===31337&&gas.localOnly===true&&gas.completed===true&&gas.remoteWrites===false&&gas.realWalletUsed===false&&gasMismatch.length===0&&gas.measurements?.length===59&&new Set(gas.measurements.map(x=>x.id)).size===59&&gasRequired.every(id=>gas.measurements.some(x=>x.id===id))&&gas.measurements.every(x=>/^[1-9][0-9]*$/.test(x.gasUsed)&&/^[1-9][0-9]*$/.test(x.estimatedGas)&&/^[1-9][0-9]*$/.test(x.gasLimit)&&BigInt(x.gasUsed)<=BigInt(x.gasLimit))&&gas.checks?.syntheticRecipients===100&&gas.checks.factoryCreatedExactPairRuntime===true&&gas.checks.tokenNoDuplicateDelivery===true&&gas.checks.selfClaimAndBatchNoDuplicate===true&&gas.checks.refundAndExitRulesUnchanged===true&&gasTests?.exitCode===0&&gasTests.passed===5&&gasTests.failed===0&&gasTests.unchangedInputs===true&&gasCli?.checksPassed===3&&gasCli.realWalletUsed===false&&gasCli.remoteWrites===false&&gasCli.zeroBudget?.result?.funded===false;
const historical=optional('evidence/historical-dex-fork-result.json'),historicalProof=optional('evidence/historical-dex-fork-verification.json'),historicalMismatch=[];
for(const [label,report]of [['fork',historical],['verification',historicalProof]]){
 if(!report?.inputHashes||!Object.keys(report.inputHashes).length){historicalMismatch.push(label+'-input-manifest');continue;}
 for(const [file,digest]of Object.entries(report.inputHashes)){
  const resolved=path.resolve(root,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)historicalMismatch.push(label+':'+file);
 }
}
const historicalRequired=['inheritedExistingStorage','initialLpIrrecoverable','successAccountingUnchanged','actualRouterBuy0Sell2','actualProtocolFeeLpMint','taxConversionWithFeeOn','syncedOneWeiDonationSettles','donationNotCountedAsPrincipalOrFees','remoteWriteFilter'];
const historicalVerified=!!historical&&historical.exitCode===0&&historical.historicalStateFork===true&&historical.sourceChainId===56&&historical.localChainId===31337&&historical.remoteWrites===false&&historical.realWalletUsed===false&&historicalMismatch.length===0&&historicalRequired.every(k=>historical.checks?.[k]===true)&&/^0x[0-9a-fA-F]{40}$/.test(historical.checks?.actualNonzeroFeeTo??'')&&BigInt(historical.checks.actualNonzeroFeeTo)!==0n&&historical.transactions?.length===18&&historical.rpc?.remoteWritesForwarded===0&&historicalProof?.sourceCurrent===true&&historicalProof.historicalStateFork===true&&historicalProof.checksPassed===10&&historicalProof.transactionsVerified===18&&historicalProof.crossEndpointHeaderMatched===true&&historicalProof.anchor?.hash===historical.anchor?.hash&&['artifacts/TokenLaunch.json','artifacts/LaunchToken.json','artifacts/MockIdentity.json','artifacts/compile-report.json','test/historical-fork.mjs','scripts/test-historical-dex.mjs'].every(f=>historical.inputHashes[f]);
const backupTests=optional('evidence/index-backup-test-result.json'),backupWalk=optional('evidence/index-backup-walkthrough.json'),backupDemo=optional('evidence/index-backup-live-demo.json'),backupMismatch=[];
for(const [label,report]of [['tests',backupTests],['live-demo',backupDemo]]){
 if(!report?.inputHashes||!Object.keys(report.inputHashes).length){backupMismatch.push(label+'-input-manifest');continue;}
 for(const [file,digest]of Object.entries(report.inputHashes)){
  const resolved=path.resolve(root,file);if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)||hash(fs.readFileSync(resolved))!==digest)backupMismatch.push(label+':'+file);
 }
 for(const [file,digest]of Object.entries(report.externalHashes??{}))if(!path.isAbsolute(file)||!fs.existsSync(file)||hash(fs.readFileSync(file))!==digest)backupMismatch.push(label+':external-input');
}
const backupObs=backupWalk?.observations;
const backupVerified=!!backupTests&&backupTests.exitCode===0&&backupTests.passed===8&&backupTests.failed===0&&backupTests.unchangedInputs===true&&backupTests.localOnly===true&&backupTests.remoteWrites===false&&backupMismatch.length===0&&backupObs?.realIndex?.projects===4&&backupObs.realIndex.pendingBefore===25&&backupObs.realIndex.pendingAfterRestore===50&&backupObs.realIndex.nftPageItems===20&&backupObs.realIndex.canonicalSyncAdvanced===true&&backupObs.realIndex.sourceSnapshotUnchanged===true&&backupObs.concurrentWriter?.changedDuringBackup===true&&backupObs.concurrentWriter.atomicValuesPreserved===true&&['existingDestinationsPreserved','scopeAndUnrelatedRejected','changedSchemaRejected','invalidBundlesRejected','foreignKeyDamageRejected','resourceLimitsFailClosed','interruptionFailClosed'].every(k=>backupObs[k]===true)&&backupObs.actualCli?.commands===3&&backupObs.actualCli.noRpc===true&&backupDemo?.actualLivePreview===true&&backupDemo.sourcePreviewStillLive===true&&backupDemo.sourceHeadAndCountsUnchanged===true&&backupDemo.backupChecksumVerified===true&&backupDemo.restoredToNewDirectory===true&&backupDemo.restored?.freshSyncRequired===true&&backupDemo.restored.financialExecutionAllowed===false&&backupDemo.sourceBefore?.chainId===31337&&backupDemo.sourceBefore.head.hash===backupDemo.sourceAfter?.head?.hash&&backupDemo.sourceBefore.projects===backupDemo.restored.status?.projects&&backupDemo.sourceBefore.events===backupDemo.restored.status?.events&&backupDemo.backup.snapshotSha256===backupDemo.restored.sourceSnapshotSha256;
const {statefulAccounting,roundingPolicy}=inspectAccountingEvidence(root);
const recipientIsolation=inspectRecipientEvidence(root);
const oracleBoundaries=inspectOracleEvidence(root);
const accountingChecks=optional('evidence/accounting-evidence-checks.json'),accountingCheckMismatch=[];
for(const file of ['scripts/accounting-evidence.mjs','scripts/test-accounting-evidence.mjs','test/accounting-evidence.test.mjs','evidence/stateful-funds-test-result.json','evidence/stateful-funds-walkthrough.json','evidence/stateful-funds-tests.tap','evidence/rounding-policy-comparison.json']){
 if(!accountingChecks?.inputHashes?.[file]||!fs.existsSync(path.join(root,file))||hash(fs.readFileSync(path.join(root,file)))!==accountingChecks.inputHashes[file])accountingCheckMismatch.push('evidence-validator:'+file);
}
const accountingChecksVerified=!!accountingChecks&&accountingChecks.exitCode===0&&accountingChecks.passed===6&&accountingChecks.failed===0&&accountingChecks.unchangedInputs===true&&accountingChecks.localOnly===true&&accountingChecks.remoteWrites===false&&accountingChecks.realWalletUsed===false&&accountingCheckMismatch.length===0;
statefulAccounting.evidenceValidator={verified:accountingChecksVerified,testsPassed:accountingChecks?.passed??0,evidence:'evidence/accounting-evidence-checks.json'};
statefulAccounting.locallyVerified&&=accountingChecksVerified;
statefulAccounting.currentInputsMatch&&=accountingCheckMismatch.length===0;
statefulAccounting.mismatches.push(...accountingCheckMismatch);
if(!accountingChecksVerified)statefulAccounting.errors.push('evidence-validator-checks-incomplete');
oracleBoundaries.completeRegressionRefreshRequired=!(local?.exitCode===0&&local?.failed===0&&localMismatch.length===0&&officialVerified&&historicalVerified&&gasVerified&&backupVerified&&statefulAccounting.locallyVerified&&recipientIsolation.locallyVerified&&runtimeVerified);
const inputHashes={};
for(const folder of ['src','test','test/mocks','lib','agent']){
 for(const file of fs.readdirSync(path.join(root,folder)).filter(f=>/\.(sol|mjs)$/.test(f))){
  const key=folder+'/'+file;inputHashes[key]=createHash('sha256').update(fs.readFileSync(path.join(root,key))).digest('hex');
 }
}
let confirmedReleaseConfiguration;try{confirmedReleaseConfiguration=inspectReleaseConfiguration(root);}catch(error){confirmedReleaseConfiguration={configurationConfirmed:false,verificationError:error.message,financialAuthorization:false,executionReady:false};}
oracleBoundaries.technicalSpecificationUserConfirmed=confirmedReleaseConfiguration.configurationConfirmed===true;
const progress={
 observedAt:new Date().toISOString(),objective:'用户授权的单轮免费上线准备',goalStatus:'paused',classification:'bounded-user-task',confirmedReleaseConfiguration,
 productionReady:false,executionReady:false,uploaded:false,mainnetDeployment:false,testnetDeployment:false,
 candidateContracts:Object.keys(inputHashes).filter(p=>p.startsWith('src/')&&p.endsWith('.sol')),
 localTests:local?{passed:local.passed,failed:local.failed,exitCode:local.exitCode,currentInputsMatch:localMismatch.length===0,mismatches:localMismatch,evidence:'evidence/local-chain-result.json'}:{status:'running-or-not-yet-complete'},
 dependencyAudit:{currentLockfileVerified:auditCurrent,reportedVulnerabilities:audit?.metadata?.vulnerabilities?.total??null},
 officialDexRuntime:official?{passed:official.passed,failed:official.failed,exitCode:official.exitCode,currentInputsMatch:officialMismatch.length===0,mismatches:officialMismatch,
  environment:official.environment,historicalStateFork:false,evidence:'evidence/official-dex-runtime-result.json'}:{status:'not-yet-tested'},
 frontendHandoff:frontend?{passed:frontend.passed,failed:frontend.failed,exitCode:frontend.exitCode,currentInputsMatch:frontendMismatch.length===0,mismatches:frontendMismatch,
  browserConnectedToRuntime:runtimeVerified,runtimeEnvironment:runtimeVerified?'isolated-local-EVM31337':'not-verified',evidence:frontendFile}:{status:'not-yet-tested'},
 nftContent:content?{passed:content.passed,failed:content.failed,exitCode:content.exitCode,currentInputsMatch:contentMismatch.length===0,mismatches:contentMismatch,
  publicPinning:false,uploaded:false,evidence:'evidence/nft-content-result.json',example:'../../work/echo-launch-preview-20261113/nft-content-20261114/reference.json'}:{status:'not-yet-tested'},
 ipfsNode:kubo?{checksPassed:kubo.checksPassed,exitCode:kubo.exitCode,currentInputsMatch:kuboMismatch.length===0,mismatches:kuboMismatch,verified:kuboVerified,
  version:kubo.version,allOwnedDaemonsStopped:kubo.allOwnedDaemonsStopped,publicPinning:false,publicationVerified:false,evidence:'evidence/kubo-offline-result.json'}:{status:'not-yet-tested'},
 projectIndex:{verified:indexVerified,testsPassed:indexChecks,currentInputsMatch:localMismatch.length===0,localOnly:true,publicServiceDeployed:false,
  financialExecutionAllowed:false,evidence:'evidence/project-index-local-walkthrough.json'},
 runtimeRead:{verified:runtimeVerified,stateChecksPassed:stateChecks,renderedBrowserVerified:browserVerified,browserInputMismatches:browserMismatch,environment:'isolated-local-EVM31337',
  readOnly:true,publicServiceDeployed:false,financialExecutionAllowed:false,evidence:'evidence/runtime-read-local-walkthrough.json',browserEvidence:browserFile,preview:browser?.preview??null},
 participantProofs:{verified:participantVerified,testsPassed:participantChecks,browserScenarios:browser?.lifecycleScenarioCount??0,readOnly:true,
  evidence:'evidence/participant-lifecycle-walkthrough.json',historyEventLimit:1000,historyReceiptLimit:100,historyPaginationComplete:paginationBrowserVerified&&historyBackendVerified,scope:'isolated-local-EVM31337'},
 participantHistory:{backendVerified:historyBackendVerified,testsPassed:historyChecks,receiptCount:history?.receiptsVerified??0,eventCount:history?.eventsVerified??0,
  pageEventLimit:50,receiptPreviewLimit:50,frontendIntegrated:paginationBrowserVerified&&historyBackendVerified,nftItemPaginationComplete:paginationBrowserVerified&&nftItemBackendVerified,historyPaginationComplete:paginationBrowserVerified&&historyBackendVerified,scope:'isolated-local-EVM31337',productionPaginationVerified:false,
  evidence:['evidence/participant-history-walkthrough.json','evidence/participant-history-cli-walkthrough.json'],publicServiceDeployed:false,financialExecutionAllowed:false},
 nftItemPages:{backendVerified:nftItemBackendVerified,testsPassed:nftItemChecks,itemsVerified:nftItems?.itemsVerified??0,pages:nftItems?.pages??0,frontendIntegrated:paginationBrowserVerified&&nftItemBackendVerified,
  scope:'isolated-local-EVM31337',evidence:'evidence/nft-item-pages-walkthrough.json',publicContentAvailabilityVerified:false,financialExecutionAllowed:false},
 executorGas:{localMeasurementsVerified:gasVerified,operationsMeasured:gas?.measurements?.length??0,budgetTestsPassed:gasTests?.passed??0,cliChecksPassed:gasCli?.checksPassed??0,currentInputsMatch:gasMismatch.length===0,mismatches:gasMismatch,
  scope:'isolated-local-EVM31337;exact-captured-DEX-runtime;mock-identity',evidence:'evidence/gas-measurement.json',budgetEvidence:'evidence/gas-budget-cli-checks.json',runbook:'GAS-AND-EXECUTOR.md',
  startupIllustrativeCostWei:gasCli?.zeroBudget?.result?.totalGasCostWei??null,illustrativeGasPriceWei:gasCli?.zeroBudget?.result?.gasPriceWei??null,liveGasPriceVerified:false,platformFunded:false,productionExecutorAuthorized:false,productionDeploymentSigningVerified:false,financialExecutionAllowed:false},
 historicalDexFork:{verified:historicalVerified,currentInputsMatch:historicalMismatch.length===0,mismatches:historicalMismatch,sourceChainId:56,localChainId:31337,anchor:historical?.anchor??null,
  checksPassed:historicalProof?.checksPassed??0,localTransactions:historical?.transactions?.length??0,actualFeeTo:historical?.checks?.actualNonzeroFeeTo??null,crossEndpointHeaderMatched:historicalProof?.crossEndpointHeaderMatched??false,
  evidence:'evidence/historical-dex-fork-result.json',verificationEvidence:'evidence/historical-dex-fork-verification.json',scope:'Recent fixed BSC checkpoint;EDR Shanghai execution;inherited DEX storage;mock identity;synthetic accounts',
  archiveCoverageVerified:false,independentSecurityReview:false,publicTransactions:false,financialExecutionAllowed:false},
 indexBackup:{locallyVerified:backupVerified,currentInputsMatch:backupMismatch.length===0,mismatches:backupMismatch,testsPassed:backupTests?.passed??0,actualCliCommands:backupObs?.actualCli?.commands??0,
  actualLivePreviewProjects:backupDemo?.sourceBefore?.projects??0,actualLivePreviewEvents:backupDemo?.sourceBefore?.events??0,liveDemoObservedAt:backupDemo?.at??null,
  onlineWalSnapshot:true,newDestinationOnly:true,sourceServiceStopped:false,freshCanonicalSyncRequired:true,publicServiceDeployed:false,offDeviceReplicasVerified:false,financialExecutionAllowed:false,
  evidence:'evidence/index-backup-test-result.json',walkthrough:'evidence/index-backup-walkthrough.json',liveDemo:'evidence/index-backup-live-demo.json',runbook:'INDEX-BACKUP-RECOVERY.md'},
 statefulAccounting,roundingPolicy,recipientIsolation,oracleBoundaries,
 bindingObservation:bindings?{readOnly:bindings.readOnly,chainId:bindings.chainId,block:bindings.block,routerFactoryMatched:bindings.bindings?.routerFactoryMatched,wbnbResolvedFromRouter:bindings.bindings?.wbnbResolvedFromRouter,trustedForDeployment:false}:null,
 lifecycleBoundaryBrowser,
 deploymentRoute:{locallyVerified:deploymentVerified,testsPassed:deploymentRaw?.passed??0,currentInputsMatch:!!deploymentRaw&&deploymentMismatch.length===0,mismatches:deploymentMismatch,evidence:'evidence/deployment-route-result.json',guide:'DEPLOYMENT-ROUTE.md',publicHelperCodeCaptured:!!deploymentWalk?.publicCapture,runtimeEnvironment:'captured-helper-runtime-on-isolated-EVM31337;mock-identity-and-DEX',binanceWalletPreviewVerified:false,publicDeployment:false,productionReady:false},
 deploymentRecovery:{locallyVerified:recoveryVerified,testsPassed:recoveryRaw?.passed??0,currentInputsMatch:!!recoveryRaw&&recoveryMismatch.length===0,mismatches:recoveryMismatch,evidence:'evidence/deployment-recovery-result.json',guide:'DEPLOYMENT-RECOVERY.md',readOnly:true,directOuterEvmOnly:true,binanceWalletPreviewVerified:false,publicDeployment:false,productionReady:false},
 distributionJournal:{locallyVerified:queueVerified,testsPassed:queueRaw?.passed??0,currentInputsMatch:!!queueRaw&&queueMismatch.length===0,mismatches:queueMismatch,evidence:'evidence/distribution-queue-result.json',guide:'DISTRIBUTION-QUEUE.md',internalCoordinationScope:'one-shared-local-database-and-wallet',automaticSignerConfigured:false,operatingServiceStarted:false,funded:false,completedJobReorgMonitoring:false,publicDeployment:false,productionReady:false},
 distributionMonitoring:{locallyVerified:monitorVerified,testsPassed:monitorRaw?.passed??0,currentInputsMatch:!!monitorRaw&&monitorMismatch.length===0,mismatches:monitorMismatch,evidence:'evidence/distribution-monitor-result.json',guide:'DISTRIBUTION-MONITOR.md',boundedCompletedJobRechecks:monitorVerified,transactionalDispatchHold:monitorVerified,lateAdverseObservationHeld:monitorVerified,automaticResumeAllowed:false,scheduledServiceRunning:false,externalAlertDeliveryConfigured:false,publicDeployment:false,productionReady:false},
 distributionFeeBudget:{locallyVerified:feeBudgetVerified,testsPassed:feeBudgetRaw?.passed??0,currentInputsMatch:!!feeBudgetRaw&&feeBudgetMismatch.length===0,mismatches:feeBudgetMismatch,evidence:'evidence/distribution-budget-result.json',guide:'DISTRIBUTION-FEE-BUDGET.md',atomicReservations:feeBudgetVerified,actualSuccessfulAndFailedFeeProofs:feeBudgetVerified,directEvmEnvelopeOnly:true,productionPolicyConfigured:false,globalWalletActivityControlled:false,financialAuthorization:false,automaticSignerConfigured:false,publicDeployment:false,productionReady:false},
 distributionReadOnlyService:{locallyVerified:serviceVerified,testsPassed:serviceRaw?.passed??0,currentInputsMatch:!!serviceRaw&&serviceMismatch.length===0,mismatches:serviceMismatch,evidence:'evidence/distribution-service-result.json',guide:'DISTRIBUTION-SERVICE.md',ownedTestProcessesObserved:serviceVerified,sequentialCyclesAndLeaseFencing:serviceVerified,cycleAndOldestSweepFreshness:serviceVerified,immediateStopDispatchHold:serviceVerified,productionServiceRunning:false,osStartupInstalled:false,externalAlertDeliveryConfigured:false,financialAuthorization:false,automaticSignerConfigured:false,productionReady:false},
 distributionBackup:{locallyVerified:queueBackupVerified,testsPassed:queueBackupRaw?.passed??0,currentInputsMatch:!!queueBackupRaw&&queueBackupMismatch.length===0,mismatches:queueBackupMismatch,evidence:'evidence/distribution-backup-result.json',guide:'DISTRIBUTION-BACKUP-RECOVERY.md',onlineWalSnapshot:queueBackupVerified,newDirectoryRestore:queueBackupVerified,restoredDispatchHeld:queueBackupVerified,automaticResumeAllowed:false,controlledHandoverImplemented:false,offDeviceReplicasVerified:false,publicDeployment:false,productionReady:false},
 currentInputHashes:inputHashes,
 gates:gates.gates.map(g=>g.id==='local-bytecode-lifecycle'&&local?{...g,status:localMismatch.length?'stale-local-evidence':local.exitCode===0?'local-tested-with-test-doubles':'failing-local-tests'}:
  ['official-dex-runtime','pool-contamination-liveness'].includes(g.id)?{...g,status:officialVerified&&historicalVerified?'local-runtime-and-historical-fork-tested-review-pending':officialVerified?'locally-tested-review-pending':officialMismatch.length?'stale-local-evidence':'verification-incomplete'}:
  g.id==='historical-dex-fork'?{...g,status:historicalVerified?'recent-checkpoint-fee-on-locally-tested':historicalMismatch.length?'stale-local-evidence':'verification-incomplete'}:
  g.id==='ipfs-node-interoperability'?{...g,status:kuboVerified?'offline-real-node-tested':kuboMismatch.length?'stale-local-evidence':'verification-incomplete'}:
  g.id==='project-indexing'?{...g,status:indexVerified?'durable-local-index-tested':'verification-incomplete'}:
  g.id==='index-backup-recovery'?{...g,status:backupVerified?'online-snapshot-and-new-cache-restore-locally-tested':backupMismatch.length?'stale-local-evidence':'verification-incomplete'}:
  g.id==='stateful-accounting'?{...g,status:statefulAccounting.locallyVerified?'bounded-local-ledger-tested':!statefulAccounting.currentInputsMatch?'stale-local-evidence':'verification-incomplete'}:
  g.id==='rounding-policy'?{...g,status:roundingPolicy.comparisonVerified&&roundingPolicy.previewCandidateAligned?'user-confirmed-preview-candidate-aligned':roundingPolicy.userDecisionPending?'user-rule-decision-pending':'comparison-verification-incomplete'}:
  g.id==='recipient-isolation'?{...g,status:recipientIsolation.locallyVerified?'bounded-local-adversarial-tested':!recipientIsolation.currentInputsMatch?'stale-local-evidence':'verification-incomplete'}:
  g.id==='oracle-boundaries'?{...g,status:oracleBoundaries.locallyVerified?oracleBoundaries.completeRegressionRefreshRequired?'strict-ceiling-repaired-focused-tests-pass-regressions-pending':'exact-runtime-boundaries-tested-specification-pending':!oracleBoundaries.currentInputsMatch?'stale-local-evidence':'verification-incomplete'}:
  g.id==='tax-conversion'?{...g,status:oracleBoundaries.locallyVerified&&officialVerified&&historicalVerified?'locally-tested-specification-and-review-pending':'verification-incomplete'}:
  g.id==='participant-history'?{...g,status:paginationBrowserVerified&&historyBackendVerified?'local-browser-tested-production-pending':historyBackendVerified?'local-backend-tested-browser-pending':'verification-incomplete'}:
  g.id==='nft-item-proofs'?{...g,status:paginationBrowserVerified&&nftItemBackendVerified?'local-browser-tested-production-pending':'verification-incomplete'}:
  g.id==='executor-gas'?{...g,status:gasVerified?'locally-measured-funding-and-operations-pending':gasMismatch.length?'stale-local-evidence':'verification-incomplete'}:
  g.id==='lifecycle-boundary-browser'?{...g,status:lifecycleBoundaryBrowser.locallyVerified?'local-boundary-browser-tested':'verification-incomplete'}:
  g.id==='deployment-signing-path'?{...g,status:deploymentVerified?'local-existing-destination-route-tested-wallet-pending':'verification-incomplete'}:
  g.id==='deployment-receipt-recovery'?{...g,status:recoveryVerified?'local-readonly-recovery-tested-wallet-pending':'verification-incomplete'}:
  g.id==='distribution-journal'?{...g,status:queueVerified?'local-durable-journal-tested-live-adapter-pending':'verification-incomplete'}:
  g.id==='frontend-runtime-handoff'?{...g,status:runtimeVerified?'local-runtime-browser-tested':'verification-incomplete'}:g),
 nextActions:[
  ...(oracleBoundaries.completeRegressionRefreshRequired?['Refresh all source/artifact-bound regressions after LAUNCH-ACCT-004strict rational minimum repair:backend,independent ledgers,recipient cases,Gas/runtime/fork and cache tests. Rebuild the runtime preview with actual current artifact pins and re-observe browser flows;old screenshots do not certify the new bytecode.']:[]),
  'Preserve the explicit2026-11-15rounding decision record,verify current frontend/candidate agreement and retain legacy local settlement amounts. A confirmed rule or matching formula does not approve deployment.',
  'NFT creation is permissionless per the explicit2026-11-15decision;no platform content approval authority is added. Independently verify complete public content before proposing participant payment and avoid claims that every factory project passed review.',
  'Preserve verified real offline Kubo interoperability and define actual public pinning,backup,retention and monitoring arrangements before any authorized publication.',
  'Preserve current14lifecycle cases,125NFT pages,520receipt history including browser reload/resume,and the separate cutoff/pause/timeout browser evidence. Extend target-provider and real-wallet verification;EVM31337 is not public testnet/mainnet.',
  'Preserve the captured existing-destination deployment route and its6local bytecode cases. Confirm actual deployment specification,refresh helper code/nonce/bindings,verify real-wallet login/Developer Mode/backend preview and recalculate live bootstrap Gas before any separately authorized transaction. No public signing or deployment is authorized.',
  'Independently review LAUNCH-AVAIL-001 and final disclosure of protocol contribution ratio versus actual donated reserves. Exact-runtime and recent-checkpoint fee-on/donation fork cases pass locally;reserve/rounding extremes and security review remain.',
  'Review candidate registry/factories, code-store and per-project immutable bindings before production approval.',
  'Preserve12bounded local accounting cases/277checkpoints and6recipient/surplus cases with actual successful/failed local receipts. Extend broader arbitrary sequences,adversarial oracle/reserve histories and target smart-wallet/gas/fork behavior;these checks are not an independent review or exhaustive fuzzing.',
  'Preserve5exact-runtime oracle boundary/shock/surplus/single-wrap cases and fixed-checkpoint fee-on fork evidence. Finalize the technical oracle specification and independently assess sustained/gradual manipulation,extreme reserves/prices,multiple-wrap idle gaps and target-chain behavior;3%versus a moving reference is not a universal loss/manipulation guarantee.',
  'Extend the Agent CLI from the tested local implementation to official testnet/runtime configuration and real wallet preview compatibility; do not auto-sign or broadcast.',
  'Preserve verified online WAL backup/new-directory restore and pending-history continuation. Prepare actual hosted provider/access constraints,off-device replicas,retention/recovery targets,scheduled operation,monitoring and deployment;cached observations remain historical and never financial quotes.',
  'Preserve source-bound59operation Gas measurements and budget/retry runbook;verify the real deployment/signing path,live network estimates,startup funding,executor authorization and monitoring before production.',
  'Admin,recipient,Gas wallet,1800/7200oracle and12/120read policy were explicitly confirmed2026-11-15;preserve release/confirmed-config-manifest.json. Remaining:public-testnet full lifecycle,independent security review/remediation,funded operator and final transaction/release approval.'
 ],
 limits:'Local bytecode tests and observed external code do not prove production readiness. Existing ECHO Mint is separate. Candidate contracts execute on isolated EVM31337 only. No real-wallet signing,public testnet/mainnet transaction/deployment or Launch upload occurred.'
};
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/preparation-progress.json'),JSON.stringify(progress,null,2)+'\n');
console.log(JSON.stringify({productionReady:false,localTests:progress.localTests,dependencyAudit:progress.dependencyAudit,next:progress.nextActions[0]},null,2));
if(process.argv.includes('--require-production'))process.exitCode=1;
