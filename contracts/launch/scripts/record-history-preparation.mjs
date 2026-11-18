import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const tests=read('evidence/local-chain-result.json'),progress=read('evidence/preparation-progress.json'),previous=read('evidence/active-work.json');
if(tests.exitCode!==0||tests.failed!==0||!progress.localTests.currentInputsMatch||!progress.participantHistory?.backendVerified)throw Error('CURRENT_HISTORY_TESTS_REQUIRED');
const state={...previous,observedAt:new Date().toISOString(),goalStatus:'active',classification:'progress',previousGoalTurnClassification:'progress',
 currentStage:`Durable large-history backend/API/CLI verified;${tests.passed}source-current backend tests pass. Browser history controls and per-item NFT proofs remain unfinished.`,
 liveTestSession:null,lastObservedTests:{passed:tests.passed,failed:tests.failed,terminal:true,evidence:'local-chain-result.json',currentInputsMatch:true},
 projectIndex:progress.projectIndex,runtimeRead:progress.runtimeRead,participantProofs:progress.participantProofs,participantHistory:progress.participantHistory,
 frontendHandoff:progress.frontendHandoff,
 completedThisTurn:[
  'Added durable SQLite participant-history jobs and bounded keyset pages,fixed snapshot/wallet/project scope,atomic cursor/counter/receipt commits and restart recovery.',
  'Verified520successful local subscription receipts/1040events over44pages;newly indexed blocks do not alter an existing scan. Exact retry does not duplicate accounting;stale/foreign scope is rejected.',
  'Verified RPC/corrupt-receipt failures preserve progress,shallow reorg removes orphan scans,and NFT refund history reconciles principal and actual native payout.',
  'Tightened receipt hash/structure verification before caching;preserved initial3failed diagnostics and corrected fixture field/method/depth mismatches.',
  'Added read-only history API and one-command Agent follow mode with explicit bounded incomplete output. Actual CLI subprocess through read-only RPC confirms no signing/broadcast.',
  'Completed the injected hourly research/post round separately:two peer projects inspected,live site left atv48,and exactly one own-card bilingual post verified/logged.'
 ],
 nextActions:[
  'Integrate pending history progress,explicit bounded continuation and complete receipt-preview totals into runtime reader/UI. Do not render pending state as zero entitlement or financial authority.',
  'Implement bounded per-item NFT reservation,mint-receipt,current-owner and immutable content-path proof at one canonical snapshot;typed nonexistence must be distinct from RPC failure.',
  'Restart the one owned local preview after backend/UI completion;verify new paths and responsive layout in actual browser and retain matching source-bound evidence.',
  ...progress.nextActions
 ],
 productionReady:false,executionReady:false,contractsDeployed:false,audited:false,launchUploaded:false,
 limitations:'Backend/API/CLI large-history verification is locally tested. Browser integration and per-item NFT pagination are unfinished;prior browser evidence is source-stale for changed backend modules. Existing preview5484 still serves its earlier loaded backend. Public storage/admission,official historical-state DEX fork,independent review,testnet,real-wallet,budget and deployment/upload authorization remain open.',
 hourlyPublication:{url:'https://x.com/EchoFun_/status/2121599437659398240',publishedAt:'2026-11-14T13:41:38.000Z',cardVisible:true,evidence:'../../../work/echo-x-hourly/research-20261114-2126/result.json'}
};
fs.writeFileSync(path.join(root,'evidence/active-work.json'),JSON.stringify(state,null,2)+'\n');
console.log(JSON.stringify({recorded:true,goalStatus:state.goalStatus,passed:tests.passed,historyBackendVerified:true,frontendHistoryIntegrated:false,nftItemsComplete:false,productionReady:false}));
