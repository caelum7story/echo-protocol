import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const previous=read('evidence/active-work.json'),p=read('evidence/preparation-progress.json');
if(!p.statefulAccounting?.locallyVerified||!p.roundingPolicy?.comparisonVerified||!p.roundingPolicy.userDecisionPending||p.roundingPolicy.previewCandidateAligned!==false||!p.localTests.currentInputsMatch||p.localTests.failed!==0||!p.frontendHandoff.currentInputsMatch||p.frontendHandoff.failed!==0||!p.indexBackup.locallyVerified)throw Error('CURRENT_ACCOUNTING_PREPARATION_REQUIRED');
const state={...previous,observedAt:new Date().toISOString(),goalStatus:'active',classification:'progress',previousGoalTurnClassification:'progress',
 currentStage:`${p.statefulAccounting.testsPassed}bounded independent-ledger cases and${p.statefulAccounting.invariantCheckpoints}invariant checkpoints locally verified. Preview/candidate successful-cash and voluntary-exit rounding differences are explicit pending user decisions;no economic parameters changed.`,
 statefulAccounting:p.statefulAccounting,roundingPolicy:p.roundingPolicy,liveTestSession:null,
 pendingUserDecisions:[
  {id:'nft-content-admission',status:'awaiting-user',proposal:'NFT-CONTENT-ADMISSION-PROPOSAL.md',authorityChanged:false},
  {id:'success-bnb-rounding',status:'awaiting-user',proposal:'ACCOUNTING-CHECKS.md',economicRuleChanged:false},
  {id:'voluntary-exit-rounding',status:'awaiting-user',proposal:'ACCOUNTING-CHECKS.md',economicRuleChanged:false}
 ],
 completedThisTurn:[
  'Completed12bounded local cases:6token sequences,4NFT sequences and2boundaries;277actual invariant checkpoints cover escrow liabilities,original-recipient credits,cap release,delivery,refund and supply conservation.',
  'Preserved the initial11pass/1fail constructor-error assertion report. Required exact decoded InvalidConfig and actual failed receipt0x0instead of accepting an SDK error category;no contract change.',
  'Bound the complete terminal TAP and walkthrough to the source-current runner report by SHA-256 and integrated independent freshness/scope/completeness checks into readiness.',
  'Executed actual frontend settlement/exit calculators and recorded the up-to2wei successful-allocation and1wei early-exit refund differences from pinned candidate source formulas.',
  'Recorded LAUNCH-ACCT-003and a pending rounding-policy release gate. Existing candidate/frontend economics and old local records remain unchanged;NFT admission and the two precision decisions still require user answers.'
 ],nextActions:p.nextActions,productionReady:false,executionReady:false,contractsDeployed:false,audited:false,launchUploaded:false,
 limitations:'Bounded local EVM31337 accounting evidence uses synthetic EOAs and mock identity/DEX;it is not exhaustive fuzzing or independent review. Rounding choices and NFT admission remain unapproved. Public storage/operations,testnet,real-wallet/deployment signing,funding and production authorization remain open.'};
fs.writeFileSync(path.join(root,'evidence/active-work.json'),JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify({recorded:true,goalStatus:'active',testsPassed:state.statefulAccounting.testsPassed,invariantCheckpoints:state.statefulAccounting.invariantCheckpoints,roundingDecisionPending:true,productionReady:false}));
