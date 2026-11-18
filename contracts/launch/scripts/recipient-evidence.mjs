import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),uint=v=>typeof v==='string'&&/^(0|[1-9][0-9]*)$/.test(v),txHash=v=>/^0x[0-9a-fA-F]{64}$/.test(v??'');
const expectedCases=[
 ['nft-success-rejected-and-cross-entry-credit',['reentryGuardVerified','otherRecipientPaid'],['NativeTransferFailed','NothingDue']],
 ['token-failure-forced-bnb-and-refund',['minimumNotSatisfiedByBalance','fullRefundsPaid','reentryGuardVerified'],['Unavailable','NativeTransferFailed']],
 ['nft-callback-batch-atomicity',['partialBatchRolledBack','otherHolderClaimed','reentryGuardVerified'],['Error','ERC721InvalidReceiver','ERC721InvalidReceiver','Unauthorized']],
 ['token-callback-free-batch-delivery',['duplicateDeliveryPrevented','otherRecipientPaid'],['NativeTransferFailed']],
 ['token-exit-gas-grief-and-recovery',['creditPreserved','otherRecipientPaid','reentryGuardVerified'],['NativeTransferFailed','NativeTransferFailed']],
 ['tax-forced-bnb-and-isolated-recipient-credit',['donationExcludedFromTaxCredit','otherRecipientPaid','reentryGuardVerified'],['Forbidden','TransferFailed']]
];
export function inspectRecipientEvidence(root){
 root=path.resolve(root);const errors=[],mismatches=[],read=file=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{errors.push('missing-or-invalid:'+file);return null;}};
 const result=read('evidence/recipient-adversarial-test-result.json'),walk=read('evidence/recipient-adversarial-walkthrough.json'),compiled=read('artifacts/compile-report.json'),fixtures=read('evidence/recipient-adversarial-fixtures.json');
 const sources=Object.keys(compiled?.sourceHashes??{}).map(f=>f.startsWith('@')?'node_modules/'+f:f);
 const required=[...sources,'scripts/test-recipient-adversarial.mjs','scripts/compile-recipient-fixtures.mjs','test/adversarial-fixtures/Recipients.sol','test/recipient-adversarial.test.mjs','test/local-chain.mjs','package-lock.json','evidence/recipient-adversarial-fixtures.json','artifacts/compile-report.json','artifacts/NftLaunch.json','artifacts/TokenLaunch.json','artifacts/LaunchToken.json','artifacts/MockIdentity.json','artifacts/MockFactory.json','artifacts/MockRouter.json','artifacts/MockPair.json','artifacts/MockWBNB.json'];
 function check(manifest,files){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)){mismatches.push('missing-hash-manifest');return;}
  for(const f of files)if(!Object.hasOwn(manifest,f))mismatches.push('missing-input:'+f);
  for(const [f,d]of Object.entries(manifest)){const resolved=path.resolve(root,f);try{if(!resolved.startsWith(root+path.sep)||!/^[a-f0-9]{64}$/.test(d??'')||hash(fs.readFileSync(resolved))!==d)mismatches.push('changed-input:'+f);}catch{mismatches.push('missing-input:'+f);}}
 }
 check(result?.inputHashes,required);check(result?.evidenceHashes,['evidence/recipient-adversarial-tests.tap','evidence/recipient-adversarial-walkthrough.json']);
 if(!sources.length||!result||result.exitCode!==0||result.passed!==6||result.failed!==0||result.unchangedInputs!==true||result.changed?.length!==0||result.localOnly!==true||result.remoteWrites!==false||result.realWalletUsed!==false||result.independentSecurityReview!==false)errors.push('terminal-run-or-scope-incomplete');
 if(!fixtures||fixtures.compiler!==compiled?.compiler||fixtures.localOnly!==true||!fixtures.contracts?.CallbackRecipient?.bytecode||!fixtures.contracts?.ForceNative?.bytecode||fixtures.sourceSha256!==result?.inputHashes?.['test/adversarial-fixtures/Recipients.sol'])errors.push('independent-test-fixture-provenance-incomplete');
 let tap='';try{tap=fs.readFileSync(path.join(root,'evidence/recipient-adversarial-tests.tap'),'utf8');}catch{errors.push('missing-terminal-output');}
 if((tap.match(/^ok \d+ - /gm)??[]).length!==6||!/^1\.\.6$/m.test(tap)||!/^# pass 6$/m.test(tap)||!/^# fail 0$/m.test(tap)||!/^# skipped 0$/m.test(tap)||!/^# cancelled 0$/m.test(tap)||!/^# todo 0$/m.test(tap)||/^not ok /m.test(tap))errors.push('terminal-output-incomplete');
 if(walk?.environment!=='isolated-EVM31337;synthetic-actors;mock-identity-and-DEX'||walk.realWalletUsed!==false||walk.remoteWrites!==false||walk.independentSecurityReview!==false||walk.observations?.length!==6)errors.push('walkthrough-scope-incomplete');
 const rows=Array.isArray(walk?.observations)?walk.observations:[];let successfulReceipts=0,failedReceipts=0,forcedDonations=0;
 for(const [name,flags,expectedFailures]of expectedCases){
  const matches=rows.filter(x=>x?.caseId===name),r=matches[0];if(matches.length!==1||!flags.every(f=>r[f]===true)){errors.push('missing-case:'+name);continue;}
  const transactions=Array.isArray(r.transactions)?r.transactions:[],failures=Array.isArray(r.failedTransactions)?r.failedTransactions:[],donations=Array.isArray(r.forcedDonations)?r.forcedDonations:[];
  if(!transactions.length||!transactions.every(t=>t?.status===1&&txHash(t.hash)&&txHash(t.blockHash)&&Number.isSafeInteger(t.blockNumber)&&t.blockNumber>0&&uint(t.gasUsed)&&BigInt(t.gasUsed)>0n))errors.push('successful-receipt-incomplete:'+name);
  if(JSON.stringify(failures.map(t=>t?.error))!==JSON.stringify(expectedFailures)||!failures.every(t=>t?.status==='0x0'&&txHash(t.hash)&&txHash(t.blockHash)&&Number.isSafeInteger(t.blockNumber)&&t.blockNumber>0&&uint(t.gasUsed)&&BigInt(t.gasUsed)>0n))errors.push('failed-receipt-incomplete:'+name);
  if(new Set([...transactions,...failures].map(t=>t?.hash)).size!==transactions.length+failures.length)errors.push('duplicate-case-receipt:'+name);
  for(const d of donations){if(![d?.amountWei,d?.beforeWei,d?.afterWei].every(uint)||BigInt(d.afterWei)-BigInt(d.beforeWei)!==BigInt(d.amountWei)||d.actorRemoved!==true||!transactions.some(t=>t?.kind==='deployment'&&t.contract==='ForceNative'&&t.hash===d.transactionHash))errors.push('forced-transfer-not-proven:'+name);}
  successfulReceipts+=transactions.length;failedReceipts+=failures.length;forcedDonations+=donations.length;
 }
 const byId=id=>rows.find(x=>x?.caseId===id);
 if(byId(expectedCases[0][0])?.delivered!==2||byId(expectedCases[2][0])?.delivered!==3||byId(expectedCases[2][0])?.rejectionModes!==3||byId(expectedCases[3][0])?.tokenCallbacksInvoked!==0||byId(expectedCases[4][0])?.finalEscrowWei!=='0')errors.push('delivery-or-exit-observation-incomplete');
 for(const name of [expectedCases[0][0],expectedCases[1][0],expectedCases[5][0]]){const r=byId(name);if(!r||r.remainingBalanceWei!==r.forcedSurplusWei)errors.push('surplus-not-isolated:'+name);}
 const tax=byId(expectedCases[5][0]);if(!uint(tax?.convertedBnbWei)||!uint(tax?.minimumBnbWei)||BigInt(tax.convertedBnbWei)<BigInt(tax.minimumBnbWei))errors.push('tax-output-not-proven');
 if(forcedDonations!==4||failedReceipts!==13)errors.push('expected-donation-or-failure-count-missing');
 return {locallyVerified:errors.length===0&&mismatches.length===0,currentInputsMatch:mismatches.length===0,errors,mismatches,testsPassed:result?.passed??0,testsFailed:result?.failed??null,successfulLocalReceipts:successfulReceipts,failedLocalReceipts:failedReceipts,forcedNativeTransfers:forcedDonations,
  scope:'isolated-local-EVM31337;synthetic-recipients;mock-identity-and-DEX',independentSecurityReview:false,exhaustiveAdversarialCoverage:false,financialExecutionAllowed:false,productionWalletCompatibilityVerified:false,
  evidence:'evidence/recipient-adversarial-test-result.json',walkthrough:'evidence/recipient-adversarial-walkthrough.json',runbook:'RECIPIENT-AND-SURPLUS-CHECKS.md'};
}
