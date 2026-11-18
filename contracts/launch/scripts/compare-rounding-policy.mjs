import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),frontend=path.resolve(root,'../../frontend/dist/launch/core.mjs');
const deliveryFile=path.join(path.dirname(frontend),'delivery.mjs');
const decisionFile=path.join(root,'rules/user-decisions-20261115.json');
const files=[frontend,path.join(root,'src/TokenLaunch.sol'),path.join(root,'src/NftLaunch.sol'),path.join(root,'scripts/compare-rounding-policy.mjs'),deliveryFile,decisionFile],hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),inputs=Object.fromEntries(files.map(f=>[f,hash(f)]));
const decision=JSON.parse(fs.readFileSync(decisionFile,'utf8'));
assert.equal(decision.confirmedByUser,true);assert.equal(decision.roundingPolicy,'fee-floor-remainder-20261115');
assert.equal(decision.tokenSuccessRemainder,'platform');assert.equal(decision.nftSuccessFee,'floor10percent-remainder-to-creator');assert.equal(decision.tokenVoluntaryExitFee,'floor5percent-remainder-to-participant');
const tokenSource=fs.readFileSync(files[1],'utf8'),nftSource=fs.readFileSync(files[2],'utf8');
assert.ok(tokenSource.includes('uint256 bnb = _percent(activePrincipal, 80);')&&tokenSource.includes('uint256 creator = _percent(activePrincipal, 15);')&&tokenSource.includes('_credit(platformRecipient, activePrincipal - bnb - creator, "TOKEN_PLATFORM");'),'Candidate token formula changed;reinspect instead of reusing this comparison');
assert.ok(nftSource.includes('uint256 platform = _percent(activePrincipal, 10);')&&nftSource.includes('_credit(creatorRecipient, activePrincipal - platform, "NFT_CREATOR");'),'Candidate NFT formula changed');
assert.ok(tokenSource.includes('uint256 fee = _percent(principal, 5);')&&tokenSource.includes('_credit(msg.sender, principal - fee, "EARLY_EXIT_REFUND");'),'Candidate exit formula changed');
const {newDraft,economics,exitQuote}=await import(pathToFileURL(frontend).href),samples=[],exitSamples=[];
for(const [kind,units]of [['token',1n],['token',19n],['token',137n],['nft',12n],['nft',19n]]){
 const raw={...newDraft(kind),price:'0.000000000000000001',minimumRaise:'0.000000000000000001',nftSupply:'100'},e=economics(raw,{soldUnits:units}),R=e.raisedWei;
 const L=kind==='token'?R*80n/100n:0n,P=kind==='token'?R-L-R*15n/100n:R*10n/100n,C=R-L-P;
 assert.equal(e.liquidityWei+e.creatorWei+e.platformWei+e.roundingWei,R);assert.equal(L+C+P,R);
 samples.push({kind,principalWei:String(R),preview:{liquidityWei:String(e.liquidityWei),creatorWei:String(e.creatorWei),platformWei:String(e.platformWei),unallocatedRoundingWei:String(e.roundingWei)},
  candidateSourceFormula:{liquidityWei:String(L),creatorWei:String(C),platformWei:String(P)},candidateFormulaAppliesOnlyIfSuccessfulSettlement:true,hasNonzeroLiquidity:kind!=='token'||L>0n,platformDifferenceWei:String(P-e.platformWei),creatorDifferenceWei:String(C-e.creatorWei),matchesAllocatedCandidate:e.roundingWei===0n&&P===e.platformWei&&C===e.creatorWei});
}
const now=Date.parse('2026-11-14T00:00:00Z');
for(const units of [1n,19n,137n]){
 const raw={...newDraft('token',now),price:'0.000000000000000001',minimumRaise:'0.000000000000000001',startsAt:new Date(now-3600000).toISOString()},q=exitQuote(raw,{soldUnits:String(units),paused:false},{units:String(units),principalWei:String(units)},{now});
 const fee=units*5n/100n,refund=units-fee;
 exitSamples.push({principalWei:String(units),preview:{refundWei:q.refundWei,platformFeeWei:q.platformFeeWei},candidateSourceFormula:{refundWei:String(refund),platformFeeWei:String(fee)},refundDifferenceWei:String(refund-BigInt(q.refundWei)),matchesCandidate:String(refund)===q.refundWei&&String(fee)===q.platformFeeWei});
}
for(const [file,digest]of Object.entries(inputs))assert.equal(hash(file),digest);
const result={at:new Date().toISOString(),schema:'echo-launch-rounding-comparison/v1',analysisOnly:true,contractBasis:'pinned-current-source-formula;not-a-separate-transaction-receipt',previewBasis:'actual-current-economics-and-exit-functions',samples,exitSamples,differenceFound:samples.some(x=>!x.matchesAllocatedCandidate),exitDifferenceFound:exitSamples.some(x=>!x.matchesCandidate),userRuleDecisionPending:false,userDecisionEvidence:{file:'rules/user-decisions-20261115.json',sha256:inputs[decisionFile],roundingPolicy:decision.roundingPolicy},
 inputHashes:Object.fromEntries(files.filter(f=>f.startsWith(root+path.sep)).map(f=>[path.relative(root,f).split(path.sep).join('/'),inputs[f]])),externalHashes:{[frontend]:inputs[frontend],[deliveryFile]:inputs[deliveryFile]},economicRuleChanged:false,executionReady:false,financialExecutionAllowed:false};
fs.writeFileSync(path.join(root,'evidence/rounding-policy-comparison.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({differenceFound:result.differenceFound,exitDifferenceFound:result.exitDifferenceFound,settlementSamples:samples.length,exitSamples:exitSamples.length,userRuleDecisionPending:false}));
