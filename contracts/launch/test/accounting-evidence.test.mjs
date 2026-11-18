import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectAccountingEvidence} from '../scripts/accounting-evidence.mjs';
const root=path.resolve(import.meta.dirname,'..'),file=f=>path.resolve(root,f),read=f=>fs.readFileSync(file(f)),json=f=>JSON.parse(String(read(f))),sha=data=>createHash('sha256').update(data).digest('hex');
function inspect(overrides={}){const files=new Map(Object.entries(overrides).map(([f,data])=>[file(f),Buffer.from(typeof data==='string'?data:JSON.stringify(data))]));return inspectAccountingEvidence(root,{readFile:f=>files.get(f)??fs.readFileSync(f),existsFile:f=>files.has(f)||fs.existsSync(f)});}
function sealedWalk(change){const r=json('evidence/stateful-funds-test-result.json'),w=json('evidence/stateful-funds-walkthrough.json');change(w);const text=JSON.stringify(w);r.evidenceHashes['evidence/stateful-funds-walkthrough.json']=sha(text);return {'evidence/stateful-funds-test-result.json':r,'evidence/stateful-funds-walkthrough.json':text};}
test('current evidence distinguishes12cases from277checkpoints and verifies the explicitly confirmed alignment',()=>{
 const p=inspect();assert.equal(p.statefulAccounting.locallyVerified,true,JSON.stringify(p));assert.equal(p.statefulAccounting.testsPassed,12);assert.equal(p.statefulAccounting.invariantCheckpoints,277);assert.equal(p.statefulAccounting.independentSecurityReview,false);assert.equal(p.statefulAccounting.financialExecutionAllowed,false);
 assert.equal(p.roundingPolicy.comparisonVerified,true);assert.equal(p.roundingPolicy.userDecisionPending,false);assert.equal(p.roundingPolicy.previewCandidateAligned,true);
});
test('missing source manifest or changed compiled source cannot retain a green accounting gate',()=>{
 const report=json('evidence/stateful-funds-test-result.json');report.inputHashes={};assert.equal(inspect({'evidence/stateful-funds-test-result.json':report}).statefulAccounting.locallyVerified,false);
 const stale=inspect({'src/TokenLaunch.sol':String(read('src/TokenLaunch.sol'))+'\n// changed source\n'});assert.equal(stale.statefulAccounting.locallyVerified,false);assert.equal(stale.statefulAccounting.currentInputsMatch,false);assert.equal(stale.roundingPolicy.comparisonVerified,false);
});
test('walkthrough hash damage is rejected without altering authoritative artifacts',()=>{
 const walkthrough=json('evidence/stateful-funds-walkthrough.json');walkthrough.results[0].withdrawnWei='999';const p=inspect({'evidence/stateful-funds-walkthrough.json':walkthrough});assert.equal(p.statefulAccounting.locallyVerified,false);assert.ok(p.statefulAccounting.mismatches.some(x=>x.includes('stateful-funds-walkthrough')));
});
test('even a resealed summary must conserve funds and contain every lifecycle and boundary proof',()=>{
 for(const change of [w=>w.results.splice(5,1),w=>w.results[0].withdrawnWei=String(BigInt(w.results[0].withdrawnWei)+1n),w=>w.results[0].finalEscrowWei='1',w=>w.results.at(-1).failedReceiptStatus='0x1',w=>w.results[6].delivered=0,w=>w.realWalletUsed=true]){
  const p=inspect(sealedWalk(change));assert.equal(p.statefulAccounting.currentInputsMatch,true);assert.equal(p.statefulAccounting.locallyVerified,false);assert.ok(p.statefulAccounting.errors.length>0);
 }
});
test('failed or skipped terminal output and an elevated scope cannot be disguised by pass counts',()=>{
 const r=json('evidence/stateful-funds-test-result.json'),tap=String(read('evidence/stateful-funds-tests.tap')).replace('# skipped 0','# skipped 1');r.evidenceHashes['evidence/stateful-funds-tests.tap']=sha(tap);
 assert.equal(inspect({'evidence/stateful-funds-test-result.json':r,'evidence/stateful-funds-tests.tap':tap}).statefulAccounting.locallyVerified,false);
 for(const key of ['audit','realWalletUsed','remoteWrites']){const changed=json('evidence/stateful-funds-test-result.json');changed[key]=true;assert.equal(inspect({'evidence/stateful-funds-test-result.json':changed}).statefulAccounting.locallyVerified,false);}
});
test('changed inputs and forged summaries cannot turn user confirmation into an aligned or executable result',()=>{
 const external='../../frontend/dist/launch/delivery.mjs';const stale=inspect({[external]:String(read(external))+'\n// changed rules\n'});assert.equal(stale.roundingPolicy.comparisonVerified,false);assert.equal(stale.roundingPolicy.userDecisionPending,false);assert.equal(stale.roundingPolicy.previewCandidateAligned,false);
 for(const change of [r=>r.userRuleDecisionPending=true,r=>r.userDecisionEvidence.sha256='0'.repeat(64),r=>r.executionReady=true,r=>r.samples[0].candidateFormulaAppliesOnlyIfSuccessfulSettlement=false,r=>r.exitSamples[1].candidateSourceFormula.refundWei='18',r=>{r.exitSamples[1].preview.refundWei='18';r.exitSamples[1].preview.platformFeeWei='1';},r=>{r.samples[1].preview.platformWei='1';r.samples[1].preview.creatorWei='3';}]){
  const report=json('evidence/rounding-policy-comparison.json');change(report);const p=inspect({'evidence/rounding-policy-comparison.json':report});assert.equal(p.roundingPolicy.comparisonVerified,false);assert.equal(p.roundingPolicy.userDecisionPending,false);assert.equal(p.roundingPolicy.previewCandidateAligned,false);
 }
 const d=json('rules/user-decisions-20261115.json');d.confirmedByUser=false;const p=inspect({'rules/user-decisions-20261115.json':d});assert.equal(p.roundingPolicy.comparisonVerified,false);assert.equal(p.roundingPolicy.userDecisionPending,true);
});
