import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Contract,keccak256,toUtf8Bytes} from 'ethers';
import {createLocalRuntimeRehearsal} from '../lib/local-rehearsal.mjs';
import {LaunchAgentClient,identityIdOf} from '../lib/agent-client.mjs';
import {createRuntimeReadServer} from '../lib/runtime-read-server.mjs';
import {createRuntimeReader,runtimeObservationView} from '../../../frontend/dist/launch/runtime-read.mjs';
const root=path.resolve(import.meta.dirname,'..'),PRICE=10_000_000_000n,DAY=86400,observations=[],receipts=[],negativeReads=[],cases=[];
const id=s=>keccak256(toUtf8Bytes(s)),artifact=n=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',n+'.json'),'utf8'));
const consent=q=>({userConfirmed:true,quoteHash:q.quoteHash,wallet:q.wallet,project:q.project,chainId:q.chainId,action:q.action,configHash:q.configHash,maxPaymentWei:q.paymentWei,gasCapWei:'100000000000000000',expiresAt:String(q.deadline)});
const phaseText={paused:['认购暂停','Paused'],cancelled:['已取消','Cancelled'],open:['认购中','Subscriptions open'],'awaiting-liquidity':['等待建池','Awaiting liquidity'],'awaiting-finalize':['待结算','Awaiting finalization'],succeeded:['发行成功','Succeeded'],refundable:['可退款','Refundable']};
async function using(name,run){
 const directory=fs.mkdtempSync(path.join(root,'evidence/lifecycle-boundary-')),r=await createLocalRuntimeRehearsal({directory});let service;
 try{
  const admin=await r.provider.getSigner(0),creator=await r.provider.getSigner(1),participant=await r.provider.getSigner(2),client=new LaunchAgentClient({provider:r.provider,config:r.config});
  service=await createRuntimeReadServer({index:r.index,staticRoot:path.resolve(root,'../../frontend/dist')});
  const reader=createRuntimeReader({origin:service.url}),now=async()=>Number((await r.provider.getBlock('latest')).timestamp),request=s=>({project:s.target,wallet:r.sampleWallet,handle:'rehearsal'});
  async function time(timestamp){assert.ok(timestamp>=await now());await r.chain.provider.request({method:'evm_setNextBlockTimestamp',params:[timestamp]});await r.chain.provider.request({method:'evm_mine',params:[]});assert.equal(await now(),timestamp);}
  async function tx(p,label){const receipt=await(await p).wait();assert.equal(receipt.status,1);const block=await r.provider.getBlock(receipt.blockNumber);receipts.push({case:name,label,hash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,timestamp:block.timestamp,status:receipt.status,gasUsed:String(receipt.gasUsed)});return receipt;}
  async function reject(run,contract,expected,label){let error;try{await run();}catch(e){error=e;}assert.ok(error,'Expected a rejected read');const raw=error.error??error.info?.error,data=typeof error.data==='string'?error.data:typeof raw?.data==='string'?raw.data:raw?.data?.data??raw?.data?.reason?.Revert;assert.match(data??'',/^0x[0-9a-fA-F]{8,}$/);const decoded=contract.interface.parseError(data);assert.equal(decoded.name,expected);negativeReads.push({case:name,label,expectedError:expected,decodedError:decoded.name,revertData:data,action:error.action??null,blockTimestamp:await now(),readOnly:true,minedTransaction:false});}
  async function submit(q,label){const prepared=await client.prepare(q,consent(q));assert.equal(prepared.broadcast,false);assert.equal(prepared.localTestOnly,true);const receipt=await tx(participant.sendTransaction(prepared.transaction),label);const proof=await client.verifyReceipt({project:q.project,transactionHash:receipt.hash,quote:q});assert.equal(proof.confirmed,true);return proof;}
  async function capture(s,label,phase,status){
   const value=await reader.state(s.target,r.sampleWallet);assert.equal(value.state.phase,phase);if(status)assert.equal(value.participant.status,status);assert.ok(value.participant);if(value.participantHistory)assert.equal(value.participantHistory.complete,true);
   const model={projects:r.index.projects().projects,project:s.target,wallet:r.sampleWallet,observation:value,loading:false},zh=runtimeObservationView(model,'zh'),en=runtimeObservationView(model,'en');
   assert.ok(zh.includes(phaseText[phase][0]));assert.ok(en.includes(phaseText[phase][1]));assert.match(zh,/本页不会提交|无签名、无付款/);assert.match(en,/No signing or payment/);
   observations.push({case:name,label,apiOrigin:service.url,state:value.state,participant:value.participant,historyMode:value.participantHistory?'paged-complete':'bounded-receipt-proof',zh,en,renderedHtmlVerified:true,browserPaintVerified:false});return value;
  }
  async function refundAndPay(s,principal){
   const q=await client.quoteAction({...request(s),action:'refund'});assert.equal(q.expectedReturnWei,String(principal));assert.equal(q.platformFeeWei,'0');assert.equal(q.returnStage,'credit-not-yet-withdrawn');
   const proof=await submit(q,'refund-credit');assert.equal(proof.creditCreated,true);assert.equal(proof.nativePaymentConfirmed,false);await capture(s,'refund-credited',(await client.snapshot(s.target)).phase,'refund-credit');
   const withdrawal=await client.quoteAction({...request(s),action:'withdraw-credit'});assert.equal(withdrawal.expectedReturnWei,String(principal));const paid=await submit(withdrawal,'refund-native-payment');assert.equal(paid.nativePaymentConfirmed,true);await capture(s,'refund-paid',(await client.snapshot(s.target)).phase,'refund-paid');
   await assert.rejects(()=>client.quoteAction({...request(s),action:'refund'}),/NOTHING_DUE/);await assert.rejects(()=>client.quoteAction({...request(s),action:'withdraw-credit'}),/NOTHING_DUE/);
   assert.equal(await s.bnbCredit(await admin.getAddress()),0n);assert.equal(await s.bnbCredit(await creator.getAddress()),0n);
  }
  await run({...r,admin,creator,participant,client,reader,now,time,tx,reject,submit,capture,refundAndPay,request});cases.push({name,passed:true});
 }finally{await service?.close();await r.close();}
}
test('pause blocks stale subscription preparation,accumulates24hours and keeps full refunds payable', {timeout:120000},()=>using('cumulative-pause',async f=>{
 const s=f.projects[1],old=await f.client.quoteSubscription({...f.request(s),units:1});await f.reject(()=>s.connect(f.creator).setPaused.staticCall(true),s,'Unauthorized','creator-cannot-pause');
 await f.tx(s.connect(f.admin).setPaused(true),'pause-first');await f.capture(s,'paused','paused','subscribing');await assert.rejects(()=>f.client.prepare(old,consent(old)),/SUBSCRIPTIONS_CLOSED/);
 assert.equal((await f.client.quoteAction({...f.request(s),action:'exit'})).platformFeeWei,String(50n*PRICE));
 let pausedAt=Number(await s.pausedAt());await f.time(pausedAt+12*3600);await f.tx(s.connect(f.admin).setPaused(false),'resume-first');const accumulated=Number(await s.accumulatedPause());assert.ok(accumulated>=12*3600);
 await f.tx(s.connect(f.admin).setPaused(true),'pause-second');pausedAt=Number(await s.pausedAt());const cancelAt=pausedAt+86400-accumulated;await f.time(cancelAt-1);assert.equal(await s.cancelled(),false);await assert.rejects(()=>f.client.quoteAction({...f.request(s),action:'refund'}),/REFUND_UNAVAILABLE/);
 await f.time(cancelAt);assert.equal(await s.totalPause(),86400n);await f.capture(s,'exact24hour-cancellation','cancelled','refundable');await f.reject(()=>s.connect(f.admin).setPaused.staticCall(false),s,'Unavailable','cancelled-cannot-resume');await assert.rejects(()=>f.client.quoteAction({...f.request(s),action:'exit'}),/EXIT_UNAVAILABLE/);await f.refundAndPay(s,1000n*PRICE);
}));
test('an NFT paused at its seven-day cutoff cancels without a platform fee even below24hours', {timeout:120000},()=>using('nft-paused-cutoff',async f=>{
 const s=f.projects[0],end=Number(await s.endsAt());await f.time(end-30);await f.tx(s.connect(f.admin).setPaused(true),'pause-near-cutoff');await f.time(end-1);assert.equal(await s.cancelled(),false);assert.equal(await s.refundEligible(),false);await f.capture(s,'one-second-before-cutoff','paused','subscribing');
 await f.time(end);assert.ok(await s.totalPause()<86400n);await f.capture(s,'exact-cutoff-cancellation','cancelled','refundable');await f.reject(()=>s.connect(f.admin).setPaused.staticCall(false),s,'Unavailable','expired-pause-cannot-resume');await f.refundAndPay(s,PRICE);await assert.rejects(()=>f.client.quoteAction({...f.request(s),action:'claim',ids:['1']}),/DELIVERY_UNAVAILABLE/);
}));
test('a prepared voluntary-exit intent stops at the exact fifteen-minute cutoff while subscriptions remain open', {timeout:120000},()=>using('early-exit-cutoff',async f=>{
 const s=f.projects[1],end=Number(await s.endsAt()),cutoff=end-900;await f.time(cutoff-30);const exit=await f.client.quoteAction({...f.request(s),action:'exit'}),prepared=await f.client.prepare(exit,consent(exit));assert.equal(prepared.broadcast,false);assert.equal(await s.earlyExitOpen(),true);
 await f.time(cutoff-1);const lastSecond=await f.client.quoteAction({...f.request(s),action:'exit'});
 // Latest-block reads remain valid; explicitly model the next block reaching
 // the cutoff instead of relying on wall-clock drift inside the EDR estimator.
 await f.chain.provider.request({method:'evm_setNextBlockTimestamp',params:[cutoff]});
 const pending=await f.chain.provider.request({method:'eth_getBlockByNumber',params:['pending',false]});
 assert.equal(Number(BigInt(pending.timestamp)),cutoff);
 assert.equal(await f.now(),cutoff-1);
 await f.reject(()=>f.client.prepare(lastSecond,consent(lastSecond)),s,'Unavailable','last-second-estimate-at-explicit-pending-cutoff');
 assert.equal(negativeReads.at(-1).action,'estimateGas');
 negativeReads.at(-1).pendingBlockTimestamp=Number(BigInt(pending.timestamp));
 assert.equal(await f.now(),cutoff-1);assert.equal(await s.activePrincipal(),1000n*PRICE);
 await f.capture(s,'last-second-read-before-cutoff','open','subscribing');
 await f.time(cutoff);assert.equal(await s.earlyExitOpen(),false);await assert.rejects(()=>f.client.prepare(exit,consent(exit)),/EXIT_UNAVAILABLE/);await f.reject(()=>s.exitAll.staticCall(identityIdOf('rehearsal'),exit.revision,exit.deadline),s,'Unavailable','exact-exit-cutoff');assert.equal(await s.activePrincipal(),1000n*PRICE);
 const q=await f.client.quoteSubscription({...f.request(s),units:1}),proof=await f.submit(q,'subscription-after-exit-cutoff');assert.equal(proof.subscriptionConfirmed,true);await f.capture(s,'exit-closed-subscription-open','open','subscribing');assert.equal(await s.activePrincipal(),1001n*PRICE);
 await f.time(end);await f.capture(s,'end-with-minimum-met','awaiting-liquidity','awaiting-liquidity');assert.equal(await s.bnbCredit(await f.admin.getAddress()),0n);
}));
test('soft-cap success waits until close and the exact48hour pool timeout preserves a full refundable principal', {timeout:120000},()=>using('pool-grace-timeout',async f=>{
 const s=f.projects[1],end=Number(await s.endsAt());assert.equal(await s.activePrincipal(),await s.minimumRaise());assert.equal(await s.subscriptionsOpen(),true);await f.reject(()=>s.finalizePool.staticCall(),s,'Unavailable','minimum-does-not-close-early');
 await f.time(end);await f.capture(s,'closed-not-yet-pooled','awaiting-liquidity','awaiting-liquidity');await assert.rejects(()=>f.client.quoteAction({...f.request(s),action:'refund'}),/REFUND_UNAVAILABLE/);await assert.rejects(()=>f.client.quoteAction({...f.request(s),action:'claim'}),/DELIVERY_UNAVAILABLE/);
 await f.time(end+2*DAY-1);assert.equal(await s.refundEligible(),false);await s.finalizePool.staticCall();await f.capture(s,'one-second-before-grace','awaiting-liquidity','awaiting-liquidity');
 await f.time(end+2*DAY);assert.equal(await s.poolCreated(),false);await f.reject(()=>s.finalizePool.staticCall(),s,'Unavailable','exact48hour-pool-timeout');await f.capture(s,'exact-pool-timeout','refundable','refundable');await f.refundAndPay(s,1000n*PRICE);
}));
test('NFT sellout closes new intents and fixed NFT delivery survives a long period without a claim deadline', {timeout:120000},()=>using('nft-sellout-long-claim',async f=>{
 const s=f.projects[0],old=await f.client.quoteSubscription({...f.request(s),units:1});await f.tx(s.subscribe(identityIdOf('rehearsal'),2,id('BOUNDARY-NFT-SELLOUT'),await f.now()+300,{value:2n*PRICE,gasLimit:1000000}),'sellout');await f.capture(s,'sold-out-awaiting-finalize','awaiting-finalize','awaiting-finalization');await assert.rejects(()=>f.client.prepare(old,consent(old)),/SUBSCRIPTIONS_CLOSED/);await f.reject(()=>s.connect(f.admin).setPaused.staticCall(true),s,'Unavailable','sellout-cannot-be-paused');
 await f.tx(s.connect(f.admin).finalize(),'nft-finalize');await f.time(Number(await s.endsAt())+10*365*DAY);await f.capture(s,'long-delayed-claim','succeeded','claimable');const q=await f.client.quoteAction({...f.request(s),action:'claim',ids:['1','2','3']}),proof=await f.submit(q,'long-delayed-nft-delivery');assert.equal(proof.deliveryConfirmed,true);assert.equal(await s.balanceOf(f.sampleWallet),3n);await f.capture(s,'nft-delivered','succeeded','delivery-confirmed');
}));
test('token sellout uses real distinct identities within4percent caps,closes exit and settles before seven days', {timeout:120000},()=>using('token-sellout',async f=>{
 const s=f.projects[1],snap=await f.client.snapshot(s.target),identity=new Contract(snap.base.identity,artifact('MockIdentity').abi,f.admin),exit=await f.client.quoteAction({...f.request(s),action:'exit'});const cap=await s.capacity(),identityCap=await s.IDENTITY_CAP();let contributors=1;
 for(let index=3;await s.activeUnits()<cap;index++){
  assert.ok(index<40);const signer=await f.provider.getSigner(index),wallet=await signer.getAddress(),handle='boundary'+index,identityId=identityIdOf(handle);await f.tx(identity.register(handle,wallet),'register-distinct-identity');const remaining=cap-await s.activeUnits(),units=remaining<identityCap?remaining:identityCap;await f.tx(s.connect(signer).subscribe(identityId,units,id('BOUNDARY-TOKEN-'+index),await f.now()+300,{value:units*PRICE,gasLimit:1000000}),'capped-subscription');assert.ok(await s.identityActiveUnits(identityId)<=identityCap);contributors++;
 }
 assert.equal(contributors,26);assert.equal(await s.activeUnits(),555555555n);assert.ok(await s.closeTime()<await s.endsAt());assert.equal(await s.earlyExitOpen(),false);await assert.rejects(()=>f.client.prepare(exit,consent(exit)),/EXIT_UNAVAILABLE/);await f.capture(s,'sold-out-awaiting-pool','awaiting-liquidity','awaiting-liquidity');await f.tx(s.connect(f.admin).finalizePool({gasLimit:5000000}),'early-sellout-pool');await f.capture(s,'pooled-awaiting-original-wallet-delivery','succeeded','claimable');
 const q=await f.client.quoteAction({...f.request(s),action:'claim'}),proof=await f.submit(q,'original-wallet-token-delivery');assert.equal(proof.deliveryConfirmed,true);await f.capture(s,'token-delivered','succeeded','delivery-confirmed');
}));
after(()=>fs.writeFileSync(path.join(root,'evidence/lifecycle-boundaries-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),environment:'isolated-local-EVM31337;mock-identity-and-DEX;actual-read-only-HTTP-and-rendered-HTML',cases,observations,receipts,negativeReads,publicTransactions:false,realWalletUsed:false,browserPaintVerified:false,economicRulesChanged:false,independentSecurityReview:false},null,2)+'\n'));
