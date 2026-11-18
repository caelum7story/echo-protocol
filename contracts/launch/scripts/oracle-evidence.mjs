import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),uint=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),hexHash=v=>/^0x[0-9a-fA-F]{64}$/.test(v??'');
const cases=[
 ['window-age-and-reset',['windowMinusOneRejected','windowExactAccepted','ageExactAccepted','agePlusOneRejected','longGapReset','fullWindowRewarm','permissionlessUpdater'],Array(6).fill('PriceUnavailable')],
 ['amount-deadline-and-token-surplus',['capPlusOneRejected','collectedPlusOneRejected','zeroRejected','expiredRejected','ttl901Rejected','ttl900Accepted','unrelatedTokensExcluded','allowanceCleared'],Array(5).fill('InvalidAmount')],
 ...['up','down'].map(d=>['abrupt-'+d+'-move',['staleIntentRejected','ordinaryTransferWorks','actualRouterBuyWorks','actualRouterSellWorks','buyTaxZero','sellTaxTwoPercent','fullWindowChangedPriceAccepted','sustainedManipulationExcludedFromGuarantee'],['PriceProtection','PriceProtection']]),
 ['uint32-single-wrap',['singleWrapHandled','multipleWrapIdleNotVerified'],['PriceUnavailable']],
 ['strict-shortfall-rounding-gap',['baselineGapReproducedSeparately','repairVerified','formerOverThreePercentPayoutRejected','noBnbPaid'],['PriceProtection']]
];
export function inspectOracleEvidence(root){
 root=path.resolve(root);const errors=[],mismatches=[],read=f=>{try{return JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));}catch{errors.push('missing-or-invalid:'+f);return null;}};
 const result=read('evidence/oracle-boundaries-test-result.json'),walk=read('evidence/oracle-boundaries-walkthrough.json'),compiled=read('artifacts/compile-report.json'),capture=read('references/pancake-v2/deployed-runtime.json');
 const sources=Object.keys(compiled?.sourceHashes??{}).map(f=>f.startsWith('@')?'node_modules/'+f:f),required=[...sources,'scripts/test-oracle-boundaries.mjs','test/oracle-boundaries.test.mjs','test/local-chain.mjs','package-lock.json','references/pancake-v2/deployed-runtime.json','artifacts/compile-report.json','artifacts/TokenLaunch.json','artifacts/LaunchToken.json','artifacts/MockIdentity.json','artifacts/IV2Pair.json','artifacts/IV2Router.json','artifacts/IWBNB.json'];
 function check(manifest,required){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)){mismatches.push('missing-input-manifest');return;}
  for(const f of required)if(!Object.hasOwn(manifest,f))mismatches.push('missing-input:'+f);
  for(const [f,d]of Object.entries(manifest)){const resolved=path.resolve(root,f);try{if(!resolved.startsWith(root+path.sep)||!/^[a-f0-9]{64}$/.test(d??'')||hash(fs.readFileSync(resolved))!==d)mismatches.push('changed-input:'+f);}catch{mismatches.push('missing-input:'+f);}}
 }
 check(result?.inputHashes,required);check(result?.evidenceHashes,['evidence/oracle-boundaries-tests.tap','evidence/oracle-boundaries-walkthrough.json']);
 if(!sources.length||result?.exitCode!==0||result.passed!==6||result.failed!==0||result.unchangedInputs!==true||result.changed?.length!==0||result.localOnly!==true||result.remoteWrites!==false||result.realWalletUsed!==false||result.historicalStateFork!==false||result.independentSecurityReview!==false)errors.push('terminal-run-or-scope-incomplete');
 if(capture?.chainId!==56||capture.readOnly!==true||!hexHash(capture.blockHash)||walk?.sourceCaptureBlock!==capture.blockNumber||walk?.sourceCaptureBlockHash!==capture.blockHash||walk?.environment!=='isolated-EVM31337;exact-captured-DEX-runtime;fresh-empty-storage;mock-identity'||walk.remoteWrites!==false||walk.realWalletUsed!==false||walk.historicalStateFork!==false||walk.independentSecurityReview!==false||walk.livePriceVerified!==false)errors.push('runtime-or-environment-provenance-incomplete');
 let tap='';try{tap=fs.readFileSync(path.join(root,'evidence/oracle-boundaries-tests.tap'),'utf8');}catch{errors.push('missing-terminal-output');}
 if((tap.match(/^ok \d+ - /gm)??[]).length!==6||!/^1\.\.6$/m.test(tap)||!/^# pass 6$/m.test(tap)||!/^# fail 0$/m.test(tap)||!/^# skipped 0$/m.test(tap)||!/^# cancelled 0$/m.test(tap)||!/^# todo 0$/m.test(tap)||/^not ok /m.test(tap))errors.push('terminal-output-incomplete');
 const rows=Array.isArray(walk?.observations)?walk.observations:[];if(rows.length!==6)errors.push('case-count-incomplete');let successfulReceipts=0,failedReceipts=0;
 for(const [name,flags,expectedFailures]of cases){
  const found=rows.filter(r=>r?.caseId===name),r=found[0];if(found.length!==1||!flags.every(f=>r[f]===true)){errors.push('missing-case:'+name);continue;}
  if(r.pairRuntimeHash!==capture?.codes?.pair?.runtimeHash||r.feeTo!=='0x0000000000000000000000000000000000000000')errors.push('wrong-local-runtime-or-storage:'+name);
  const ok=Array.isArray(r.receipts)?r.receipts:[],bad=Array.isArray(r.failedReceipts)?r.failedReceipts:[];
  if(!ok.length||!ok.every(t=>t?.status===1&&hexHash(t.hash)&&hexHash(t.blockHash)&&Number.isSafeInteger(t.blockNumber)&&t.blockNumber>0&&Number.isSafeInteger(t.timestamp)&&t.timestamp>0&&uint(t.gasUsed)&&BigInt(t.gasUsed)>0n))errors.push('successful-receipt-incomplete:'+name);
  if(JSON.stringify(bad.map(t=>t?.error))!==JSON.stringify(expectedFailures)||!bad.every(t=>t?.status==='0x0'&&hexHash(t.hash)&&hexHash(t.blockHash)&&Number.isSafeInteger(t.blockNumber)&&t.blockNumber>0&&Number.isSafeInteger(t.timestamp)&&t.timestamp>0&&t.timestamp===t.expectedTimestamp&&t.fundsUnchanged===true))errors.push('failed-receipt-or-exact-timestamp-incomplete:'+name);
  if(new Set([...ok,...bad].map(t=>t?.hash)).size!==ok.length+bad.length)errors.push('duplicate-case-receipt:'+name);successfulReceipts+=ok.length;failedReceipts+=bad.length;
 }
 const find=id=>rows.find(r=>r?.caseId===id),w=find(cases[0][0]),a=find(cases[1][0]),wrap=find(cases[4][0]),repair=find(cases[5][0]);
 if(w?.windowSeconds!==1800||w?.maxAgeSeconds!==7200)errors.push('wrong-candidate-window');
 if(!a||![a.onePercentCapWei,a.averagePriceX112,a.collectedBeforeWei,a.referenceBnbWei,a.minimumBnbWei,a.actualBnbWei,a.unrelatedTokenDonationWei].every(uint))errors.push('missing-amount-proof');
 else {const denominator=(1n<<112n)*10000n,minimum=(BigInt(a.onePercentCapWei)*BigInt(a.averagePriceX112)*9700n+denominator-1n)/denominator;if(BigInt(a.onePercentCapWei)<=0n||BigInt(a.collectedBeforeWei)<=BigInt(a.onePercentCapWei)||BigInt(a.minimumBnbWei)!==minimum||BigInt(a.actualBnbWei)<minimum||a.unrelatedTokenDonationWei!=='1000000000000000000')errors.push('rational-ceiling-proof-mismatch');}
 if(wrap?.initialTimestamp!==String(2**32-1800)||wrap?.wrappedObservation!=='0'||wrap?.absoluteUpdatedAt!==String(2**32)||wrap?.secondObservation!=='1800')errors.push('wrap-boundary-proof-mismatch');
 if(repair?.integerReferenceBnbWei!=='98'||repair?.strictRationalMinimumBnbWei!=='96'||repair?.candidateMinimumBnbWei!=='96'||repair?.rejectedRouterQuoteBnbWei!=='95'||repair?.rationalQuoteSamples!==101||!Number.isSafeInteger(repair.acceptedRationalQuotes)||repair.acceptedRationalQuotes<=0||!Number.isSafeInteger(repair.protectedSmallQuotes)||repair.protectedSmallQuotes<=0||repair.acceptedRationalQuotes+repair.protectedSmallQuotes!==101)errors.push('strict-shortfall-repair-proof-incomplete');
 const baseline=read('evidence/oracle-boundaries-baseline-rounding-gap-result.json'),oldWalk=read('evidence/oracle-boundaries-baseline-rounding-gap-walkthrough.json'),old=oldWalk?.observations?.find(x=>x.caseId==='strict-shortfall-rounding-gap');let baselineReproductionVerified=false;
 try{baselineReproductionVerified=baseline?.exitCode===0&&baseline.passed===6&&baseline.failed===0&&old?.gapReproduced===true&&old.integerReferenceBnbWei==='98'&&old.candidateMinimumBnbWei==='95'&&old.actualBnbWei==='95'&&old.repairRequired===true&&old.receipts.some(t=>t.status===1)&&hash(fs.readFileSync(path.join(root,'evidence/oracle-boundaries-baseline-rounding-gap-walkthrough.json')))===baseline.evidenceHashes['evidence/oracle-boundaries-walkthrough.json']&&hash(fs.readFileSync(path.join(root,'evidence/oracle-rounding-baseline-LaunchToken.json')))===baseline.inputHashes['artifacts/LaunchToken.json'];}catch{}
 if(!baselineReproductionVerified)errors.push('baseline-reproduction-evidence-incomplete');
 if(failedReceipts!==17)errors.push('missing-negative-receipts');
 return {locallyVerified:errors.length===0&&mismatches.length===0,currentInputsMatch:mismatches.length===0,errors,mismatches,testsPassed:result?.passed??0,testsFailed:result?.failed??null,successfulLocalReceipts:successfulReceipts,failedLocalReceipts:failedReceipts,
  windowSeconds:1800,maxAgeSeconds:7200,maxSwapReserveBps:100,maxShortfallBps:300,technicalSpecificationUserConfirmed:false,parametersChanged:false,baselineReproductionVerified,strictRationalCeilingRepairVerified:!!repair?.repairVerified&&errors.length===0&&mismatches.length===0,rationalQuoteSamples:repair?.rationalQuoteSamples??0,sourceChanged:true,completeRegressionRefreshRequired:true,
  scope:'isolated-local-EVM31337;exact-captured-DEX-runtime;fresh-empty-storage;mock-identity',sourceCaptureBlock:capture?.blockNumber??null,historicalStateFork:false,sustainedPriceManipulationResistanceProven:false,independentSecurityReview:false,livePriceVerified:false,financialExecutionAllowed:false,
  evidence:'evidence/oracle-boundaries-test-result.json',walkthrough:'evidence/oracle-boundaries-walkthrough.json',runbook:'ORACLE-BOUNDARY-CHECKS.md'};
}
