import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest=data=>createHash('sha256').update(data).digest('hex');
const uint=value=>typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value);
const cases=[['token',13,'success','1'],['token',71,'success','19'],['token',2026,'failed','7'],['token',42,'failed-cap','10000000000'],['token',511,'cancelled','19'],['token',1337,'pool-timeout','7'],['nft',2,'success','1'],['nft',5,'success','19'],['nft',17,'failed','7'],['nft',31,'cancelled','19']];
const requiredSources=['src/DexInterfaces.sol','src/LaunchEscrow.sol','src/LaunchRegistry.sol','src/LaunchToken.sol','src/NftLaunch.sol','src/NftLaunchFactory.sol','src/TokenLaunch.sol','src/TokenLaunchFactory.sol','test/mocks/Fixtures.sol','test/stateful-funds.test.mjs','test/local-chain.mjs','scripts/test-stateful-funds.mjs','scripts/compile.mjs','package-lock.json','artifacts/compile-report.json','artifacts/TokenLaunch.json','artifacts/NftLaunch.json','artifacts/LaunchToken.json'];
export function inspectAccountingEvidence(root,{readFile=f=>fs.readFileSync(f),existsFile=f=>fs.existsSync(f)}={}){
 root=path.resolve(root);const frontend=path.resolve(root,'../../frontend/dist/launch');
 const read=(file,errors)=>{try{return JSON.parse(String(readFile(path.join(root,file))));}catch{errors.push('missing-or-invalid:'+file);return null;}};
 function checkHashes(manifest,required,errors,{external=false,exact=false}={}){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)){errors.push('missing-input-manifest');return;}
  for(const file of required)if(!Object.hasOwn(manifest,file))errors.push('missing-input:'+file);
  if(exact&&Object.keys(manifest).length!==required.length)errors.push('unexpected-input-manifest');
  for(const [file,expected]of Object.entries(manifest)){
   const resolved=external?file:path.resolve(root,file);
   if(!/^[a-f0-9]{64}$/.test(expected??'')||(external?!required.includes(file):!resolved.startsWith(root+path.sep))){errors.push('invalid-input:'+file);continue;}
   try{if(!existsFile(resolved)||digest(readFile(resolved))!==expected)errors.push('changed-input:'+file);}catch{errors.push('unreadable-input:'+file);}
  }
 }
 const stateErrors=[],stateMismatch=[],result=read('evidence/stateful-funds-test-result.json',stateErrors),walk=read('evidence/stateful-funds-walkthrough.json',stateErrors),compiled=read('artifacts/compile-report.json',stateErrors);
 const compiledSources=Object.keys(compiled?.sourceHashes??{}).map(f=>f.startsWith('@')?'node_modules/'+f:f);
 if(!compiledSources.length)stateErrors.push('missing-compiler-source-manifest');
 checkHashes(result?.inputHashes,[...new Set([...requiredSources,...compiledSources])],stateMismatch);
 checkHashes(result?.evidenceHashes,['evidence/stateful-funds-tests.tap','evidence/stateful-funds-walkthrough.json'],stateMismatch,{exact:true});
 if(!result||result.exitCode!==0||result.passed!==12||result.failed!==0||result.unchangedInputs!==true||result.changed?.length!==0||result.localOnly!==true||result.remoteWrites!==false||result.realWalletUsed!==false||result.audit!==false)stateErrors.push('unsuccessful-or-out-of-scope-run');
 let tap='';try{tap=String(readFile(path.join(root,'evidence/stateful-funds-tests.tap')));}catch{stateErrors.push('missing-tap');}
 if((tap.match(/^ok \d+ - /gm)??[]).length!==12||!/^1\.\.12$/m.test(tap)||!/^# pass 12$/m.test(tap)||!/^# fail 0$/m.test(tap)||!/^# cancelled 0$/m.test(tap)||!/^# skipped 0$/m.test(tap)||!/^# todo 0$/m.test(tap)||/^not ok /m.test(tap))stateErrors.push('tap-incomplete-or-failing');
 if(!walk||walk.environment!=='isolated-EVM31337;synthetic EOA actors;mock identity/DEX'||walk.independentCashModel!==true||walk.remoteWrites!==false||walk.realWalletUsed!==false||walk.independentSecurityReview!==false||!Array.isArray(walk.results)||walk.results.length!==12)stateErrors.push('walkthrough-incomplete-or-out-of-scope');
 const rows=Array.isArray(walk?.results)?walk.results:[];
 for(const [kind,seed,mode,price]of cases){
  const matches=rows.filter(x=>x?.kind===kind&&x.seed===seed&&x.mode===mode&&x.priceWei===price),row=matches[0];
  if(matches.length!==1||!Number.isSafeInteger(row?.invariantChecks)||row.invariantChecks<=0||row.finalEscrowWei!=='0'||![row.receivedWei,row.withdrawnWei,row.liquidityWei??'0'].every(uint)){stateErrors.push('missing-or-invalid-ledger:'+kind+':'+seed);continue;}
  if(BigInt(row.receivedWei)!==BigInt(row.withdrawnWei)+BigInt(row.liquidityWei??'0'))stateErrors.push('nonconserving-final-ledger:'+kind+':'+seed);
  if(kind==='nft'&&(row.delivered!==(mode==='success'?12:0)))stateErrors.push('wrong-nft-delivery:'+seed);
 }
 for(const name of ['one-wei-zero-liquidity-full-timeout-refund','uint256-price-capacity-product']){
  const found=rows.filter(x=>x?.kind==='boundary'&&x.case===name);if(found.length!==1||found[0].verified!==true)stateErrors.push('boundary-not-verified:'+name);
  if(name==='uint256-price-capacity-product'&&(found[0]?.decodedError!=='InvalidConfig'||found[0]?.failedReceiptStatus!=='0x0'))stateErrors.push('overflow-not-proven-by-failed-receipt');
 }
 const checkpoints=rows.reduce((n,x)=>n+(Number.isSafeInteger(x?.invariantChecks)?x.invariantChecks:0),0);
 const roundErrors=[],roundMismatch=[],round=read('evidence/rounding-policy-comparison.json',roundErrors),decision=read('rules/user-decisions-20261115.json',roundErrors);
 const decisionConfirmed=decision?.schema==='echo-launch-user-rule-decisions/v1'&&decision.confirmedByUser===true&&decision.roundingPolicy==='fee-floor-remainder-20261115'&&decision.tokenSuccessRemainder==='platform'&&decision.nftSuccessFee==='floor10percent-remainder-to-creator'&&decision.tokenVoluntaryExitFee==='floor5percent-remainder-to-participant'&&decision.preserveLegacyRecords===true;
 if(!decisionConfirmed)roundErrors.push('user-decision-record-not-confirmed');
 checkHashes(round?.inputHashes,['src/TokenLaunch.sol','src/NftLaunch.sol','scripts/compare-rounding-policy.mjs','rules/user-decisions-20261115.json'],roundMismatch,{exact:true});
 checkHashes(round?.externalHashes,['core.mjs','delivery.mjs'].map(f=>path.join(frontend,f)),roundMismatch,{external:true,exact:true});
 if(!round||round.schema!=='echo-launch-rounding-comparison/v1'||round.analysisOnly!==true||round.contractBasis!=='pinned-current-source-formula;not-a-separate-transaction-receipt'||round.previewBasis!=='actual-current-economics-and-exit-functions'||round.userRuleDecisionPending!==false||round.economicRuleChanged!==false||round.executionReady!==false||round.financialExecutionAllowed!==false||round.userDecisionEvidence?.file!=='rules/user-decisions-20261115.json'||round.userDecisionEvidence?.roundingPolicy!==decision?.roundingPolicy||round.userDecisionEvidence?.sha256!==round.inputHashes?.['rules/user-decisions-20261115.json'])roundErrors.push('comparison-scope-or-authority-invalid');
 const settlements=Array.isArray(round?.samples)?round.samples:[],exits=Array.isArray(round?.exitSamples)?round.exitSamples:[];
 if(settlements.length!==5||exits.length!==3)roundErrors.push('comparison-samples-incomplete');
 const hasDifference=settlements.some(x=>x?.matchesAllocatedCandidate===false),hasExitDifference=exits.some(x=>x?.matchesCandidate===false);
 if(round?.differenceFound!==hasDifference||round?.exitDifferenceFound!==hasExitDifference)roundErrors.push('comparison-difference-flags-inconsistent');
 for(const [kind,principal]of [['token','1'],['token','19'],['token','137'],['nft','12'],['nft','19']]){
  const found=settlements.filter(x=>x?.kind===kind&&x.principalWei===principal),row=found[0],p=row?.preview,c=row?.candidateSourceFormula;
  if(found.length!==1||!p||!c||![p.liquidityWei,p.creatorWei,p.platformWei,p.unallocatedRoundingWei,c.liquidityWei,c.creatorWei,c.platformWei].every(uint)){roundErrors.push('invalid-settlement-sample:'+kind+':'+principal);continue;}
  const R=BigInt(principal),L=kind==='token'?R*80n/100n:0n,C=kind==='token'?R*15n/100n:R-R*10n/100n,P=R-L-C;
  if(BigInt(p.liquidityWei)+BigInt(p.creatorWei)+BigInt(p.platformWei)+BigInt(p.unallocatedRoundingWei)!==R||BigInt(c.liquidityWei)!==L||BigInt(c.creatorWei)!==C||BigInt(c.platformWei)!==P||row.candidateFormulaAppliesOnlyIfSuccessfulSettlement!==true||row.hasNonzeroLiquidity!==(kind!=='token'||L>0n))roundErrors.push('settlement-formula-mismatch:'+kind+':'+principal);
  const matches=BigInt(p.unallocatedRoundingWei)===0n&&BigInt(p.liquidityWei)===L&&BigInt(p.creatorWei)===C&&BigInt(p.platformWei)===P;
  if(row.matchesAllocatedCandidate!==matches||row.platformDifferenceWei!==String(P-BigInt(p.platformWei))||row.creatorDifferenceWei!==String(C-BigInt(p.creatorWei)))roundErrors.push('settlement-comparison-summary-mismatch:'+kind+':'+principal);
 }
 for(const principal of ['1','19','137']){
  const found=exits.filter(x=>x?.principalWei===principal),row=found[0],p=row?.preview,c=row?.candidateSourceFormula;
  if(found.length!==1||!p||!c||![p.refundWei,p.platformFeeWei,c.refundWei,c.platformFeeWei].every(uint)){roundErrors.push('invalid-exit-sample:'+principal);continue;}
  const R=BigInt(principal),fee=R*5n/100n;
  if(BigInt(p.refundWei)+BigInt(p.platformFeeWei)!==R||BigInt(c.platformFeeWei)!==fee||BigInt(c.refundWei)!==R-fee)roundErrors.push('exit-formula-mismatch:'+principal);
  if(row.matchesCandidate!==(BigInt(p.platformFeeWei)===fee&&BigInt(p.refundWei)===R-fee)||row.refundDifferenceWei!==String(R-fee-BigInt(p.refundWei)))roundErrors.push('exit-comparison-summary-mismatch:'+principal);
 }
 return {
  statefulAccounting:{locallyVerified:stateErrors.length===0&&stateMismatch.length===0,currentInputsMatch:stateMismatch.length===0,mismatches:stateMismatch,errors:stateErrors,testsPassed:result?.passed??0,testsFailed:result?.failed??null,tokenSequences:rows.filter(x=>x?.kind==='token').length,nftSequences:rows.filter(x=>x?.kind==='nft').length,boundaries:rows.filter(x=>x?.kind==='boundary').length,invariantCheckpoints:checkpoints,scope:'isolated-local-EVM31337;synthetic-EOAs;mock-identity-and-DEX;bounded-deterministic-sequences',independentSecurityReview:false,exhaustiveFuzzing:false,financialExecutionAllowed:false,evidence:'evidence/stateful-funds-test-result.json',walkthrough:'evidence/stateful-funds-walkthrough.json',runbook:'ACCOUNTING-CHECKS.md'},
  roundingPolicy:{comparisonVerified:roundErrors.length===0&&roundMismatch.length===0,currentInputsMatch:roundMismatch.length===0,mismatches:roundMismatch,errors:roundErrors,userDecisionPending:!decisionConfirmed,previewCandidateAligned:roundErrors.length===0&&roundMismatch.length===0&&!hasDifference&&!hasExitDifference,userDecisionEvidence:'rules/user-decisions-20261115.json',settlementSamples:settlements.length,exitSamples:exits.length,settlementDifferenceFound:hasDifference,exitDifferenceFound:hasExitDifference,analysisOnly:true,economicRuleChanged:false,financialExecutionAllowed:false,evidence:'evidence/rounding-policy-comparison.json',finding:'LAUNCH-ACCT-003',runbook:'ACCOUNTING-CHECKS.md'}
 };
}
