import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createLocalChain} from './local-chain.mjs';
import {BrowserProvider,Contract,ContractFactory,ZeroAddress,keccak256,toUtf8Bytes} from 'ethers';
import {root} from '../scripts/compile.mjs';
import {LaunchAgentClient,identityIdOf,quoteDigest,bawPreviewArgs} from '../lib/agent-client.mjs';
import {buildNftContent} from '../lib/nft-content.mjs';
import {LaunchProjectIndex} from '../lib/project-index.mjs';
import {DatabaseSync} from 'node:sqlite';
// Normalize only direct fixture inspection/tampering paths; production APIs are tested separately.
const openTestDb=(file,options={})=>new DatabaseSync(file===':memory:'?file:path.toNamespacedPath(file),options);
import {pathToFileURL} from 'node:url';
import {createRuntimeReadServer} from '../lib/runtime-read-server.mjs';
import {createLocalRuntimeRehearsal} from '../lib/local-rehearsal.mjs';

const test=(name,fn)=>nodeTest(name,{timeout:120000},fn);
const artifacts=Object.fromEntries(['NftLaunch','TokenLaunch','LaunchToken','LaunchRegistry','NftLaunchFactory','TokenLaunchFactory','MockIdentity','MockFactory','MockRouter','MockPair','MockWBNB','RecipientHarness'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'))]));
let subscriptionSequence=0;
const nextSubscription=()=>keccak256(toUtf8Bytes('local-request-'+(++subscriptionSequence)));
const PRICE=10_000_000_000n, DAY=86400, PUBLIC=555_555_555n, CAP=22_222_222n, E18=10n**18n;
const tx=async p=>(await p).wait();
// A bounded fixture allowance covers cumulative-price zero-to-nonzero writes between estimate and mining.
const syncPair=pair=>tx(pair.sync({gasLimit:200_000}));
const revert=async fn=>assert.rejects(fn,e=>e.code==='CALL_EXCEPTION');
async function fixture(){
 const connection=await createLocalChain();
 const rpc=connection.provider;
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}); provider.pollingInterval=10;
 const signers=await Promise.all(Array.from({length:35},(_,i)=>provider.getSigner(i)));
 const addresses=await Promise.all(signers.map(s=>s.getAddress()));
 async function deploy(name,args=[]){const a=artifacts[name];const c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:15_000_000});await c.waitForDeployment();return c;}
 const identity=await deploy('MockIdentity'),wbnb=await deploy('MockWBNB'),factory=await deploy('MockFactory');
 const router=await deploy('MockRouter',[factory.target,wbnb.target]);
 for(const i of [2,3])await tx(identity.setOwner(i,addresses[i]));
 async function now(){return Number((await rpc.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);}
 async function timeTo(at){const t=await now();if(at<t)throw Error('Cannot reverse clock');await rpc.request({method:'evm_setNextBlockTimestamp',params:[at]});await rpc.request({method:'evm_mine',params:[]});assert.equal(await now(),at);}
 async function sale(kind,{capacity=3n,minimum=PRICE*100n,creator=addresses[1],platform=addresses[0],price=PRICE}={}){
  const start=(await now())+100;
  const c=[identity.target,addresses[0],platform,creator,start,price,kind==='token'?PUBLIC:capacity,keccak256(toUtf8Bytes('test-config'))];
  const s=kind==='nft'?await deploy('NftLaunch',[c,'Collection','NFT','ipfs://bafy-test-content/',keccak256(toUtf8Bytes('test-metadata'))]):await deploy('TokenLaunch',[c,minimum,'Launch','ECHOX',factory.target,router.target,wbnb.target,1800,7200]);
  const token=kind==='token'?new Contract(await s.token(),artifacts.LaunchToken.abi,signers[0]):null;
  const pair=token?new Contract(await token.pair(),artifacts.MockPair.abi,signers[0]):null;
  return {s,start,end:start+7*DAY,token,pair};
 }
 return {rpc,provider,signers,addresses,identity,wbnb,factory,router,deploy,now,timeTo,sale,close:async()=>{provider.destroy();await connection.close();}};
}
async function exitArgs(f,s,id=2,wallet=f.addresses[2]){return [id,(await s.positions(await s.positionKey(id,wallet))).revision,await f.now()+300];}
async function using(fn){const f=await fixture();try{await fn(f);}finally{await f.close();}}
async function successfulToken(f,units=1_000_000n,options={}){
 const c=await f.sale('token',{minimum:PRICE*units,...options});
 await f.timeTo(c.start);await tx(c.s.connect(f.signers[2]).subscribe(2,units,nextSubscription(),await f.now()+300,{value:PRICE*units}));
 await f.timeTo(c.end);await tx(c.s.finalizePool());
 return c;
}

test('NFT reservations follow subscription order, only exact reserved IDs deliver after sellout, and proceeds conserve BNB',()=>using(async f=>{
 const {s,start}=await f.sale('nft');
 await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await f.timeTo(start);
 await revert(async()=>s.connect(f.signers[3]).subscribe.staticCall(2,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,nextSubscription(),await f.now()+300,{value:PRICE+1n}));
 await tx(s.connect(f.signers[2]).subscribe(2,2,nextSubscription(),await f.now()+300,{value:2n*PRICE}));
 await tx(s.connect(f.signers[3]).subscribe(3,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 assert.equal(await s.reservedFor(1),f.addresses[2]);assert.equal(await s.reservedFor(3),f.addresses[3]);
 await revert(async()=>s.claimFor.staticCall(f.addresses[2],[1]));
 await tx(s.finalize());
 assert.equal(await s.bnbCredit(f.addresses[0]),3n*PRICE/10n);
 assert.equal(await s.bnbCredit(f.addresses[1]),3n*PRICE*9n/10n);
 await revert(async()=>s.claimFor.staticCall(f.addresses[3],[1]));
 await tx(s.claimFor(f.addresses[2],[1,2]));await tx(s.claimFor(f.addresses[3],[3]));
 assert.equal(await s.tokenURI(2),'ipfs://bafy-test-content/2.json');assert.equal(await s.deliveredCount(),3n);
 await revert(async()=>s.claimFor.staticCall(f.addresses[2],[1]));
 await revert(async()=>s.refundFor.staticCall(f.addresses[2]));
 await tx(s.withdrawCreditFor(f.addresses[0]));await tx(s.withdrawCreditFor(f.addresses[1]));
 assert.equal(await f.provider.getBalance(s.target),0n);
}));

test('NFT expiry refunds all principal without creator/platform fee, even before finalize; repeat refund is rejected',()=>using(async f=>{
 const {s,start,end}=await f.sale('nft');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,2,nextSubscription(),await f.now()+300,{value:2n*PRICE}));await f.timeTo(end);
 await tx(s.refundFor(f.addresses[2]));assert.equal(await s.bnbCredit(f.addresses[2]),2n*PRICE);
 assert.equal(await s.bnbCredit(f.addresses[0]),0n);assert.equal(await s.bnbCredit(f.addresses[1]),0n);
 await revert(async()=>s.refundFor.staticCall(f.addresses[2]));await tx(s.finalize());
 await revert(async()=>s.claimFor.staticCall(f.addresses[2],[1]));await tx(s.withdrawCreditFor(f.addresses[2]));
 assert.equal(await f.provider.getBalance(s.target),0n);
}));

test('only platform pauses subscriptions; cumulative pause cannot reset and cancellation cannot block full refunds',()=>using(async f=>{
 const {s,start}=await f.sale('nft');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await revert(async()=>s.connect(f.signers[1]).setPaused.staticCall(true));
 await tx(s.setPaused(true));await f.timeTo((await f.now())+12*3600);await tx(s.setPaused(false));
 const paused=await s.accumulatedPause();assert.ok(paused>=43200n);
 await tx(s.setPaused(true));await f.timeTo((await f.now())+12*3600);
 assert.equal(await s.cancelled(),true);await revert(async()=>s.setPaused.staticCall(false));
 await tx(s.refundFor(f.addresses[2]));assert.equal(await s.bnbCredit(f.addresses[2]),PRICE);
 assert.equal(await s.bnbCredit(f.addresses[0]),0n);
}));

test('NFT safe-mint callback cannot claim twice, and a rejecting proceeds recipient cannot block finalization',()=>using(async f=>{
 const receiver=await f.deploy('RecipientHarness');await tx(f.identity.setOwner(34,receiver.target));
 const {s,start}=await f.sale('nft',{capacity:1n,creator:receiver.target});
 await tx(receiver.configure(false,true,s.target));await f.timeTo(start);
 await tx(receiver.subscribe(s.target,34,1,{value:PRICE}));await tx(s.finalize());
 await tx(s.claimFor(receiver.target,[1]));assert.equal(await s.ownerOf(1),receiver.target);assert.equal(await receiver.reentryFailures(),1n);
 await tx(receiver.configure(true,false,s.target));await revert(async()=>s.withdrawCreditFor.staticCall(receiver.target));
 assert.equal(await s.bnbCredit(receiver.target),PRICE*9n/10n);
 await tx(s.withdrawCreditFor(f.addresses[0]));
}));

test('BNB pull-payment reentry cannot collect a credit twice',()=>using(async f=>{
 const receiver=await f.deploy('RecipientHarness');const {s,start}=await f.sale('nft',{capacity:1n,creator:receiver.target});
 await f.timeTo(start);await tx(s.connect(f.signers[2]).subscribe(2,1,nextSubscription(),await f.now()+300,{value:PRICE}));await tx(s.finalize());
 await tx(receiver.configure(false,true,s.target));await tx(s.withdrawCreditFor(receiver.target));
 assert.equal(await receiver.received(),PRICE*9n/10n);assert.equal(await receiver.reentryFailures(),1n);
 assert.equal(await s.bnbCredit(receiver.target),0n);await revert(async()=>s.withdrawCreditFor.staticCall(receiver.target));
}));

test('token early exit is entire-position95/5, releases quota and allows reentry without consuming other escrow',()=>using(async f=>{
 const {s,start}=await f.sale('token');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,1000,nextSubscription(),await f.now()+300,{value:1000n*PRICE}));
 await tx(s.connect(f.signers[3]).subscribe(3,2000,nextSubscription(),await f.now()+300,{value:2000n*PRICE}));
 await tx(s.connect(f.signers[2]).exitAll(...await exitArgs(f,s)));
 assert.equal(await s.bnbCredit(f.addresses[2]),950n*PRICE);assert.equal(await s.bnbCredit(f.addresses[0]),50n*PRICE);
 assert.equal(await s.identityActiveUnits(2),0n);assert.equal(await s.activePrincipal(),2000n*PRICE);
 await tx(s.withdrawCreditFor(f.addresses[0]));await tx(s.withdrawCreditFor(f.addresses[2]));
 assert.equal(await f.provider.getBalance(s.target),2000n*PRICE);
 await tx(s.connect(f.signers[2]).subscribe(2,100,nextSubscription(),await f.now()+300,{value:100n*PRICE}));
 assert.equal(await s.activePrincipal(),2100n*PRICE);assert.equal(await s.positionCount(),2n);
}));

test('identity transfer cannot reset the4% cap or redirect original-wallet refund rights',()=>using(async f=>{
 const {s,start,end}=await f.sale('token',{minimum:PRICE*PUBLIC});await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,CAP,nextSubscription(),await f.now()+300,{value:CAP*PRICE}));await tx(f.identity.setOwner(2,f.addresses[3]));
 await revert(async()=>s.connect(f.signers[3]).subscribe.staticCall(2,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await f.timeTo(end);await tx(s.refundFor(2,f.addresses[2]));
 assert.equal(await s.bnbCredit(f.addresses[2]),CAP*PRICE);assert.equal(await s.bnbCredit(f.addresses[3]),0n);
}));

test('matured failure refunds take priority over early-exit fee; previously exited fees are not charged again',()=>using(async f=>{
 const {s,start,end}=await f.sale('token',{minimum:PRICE*10000n});await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,1000,nextSubscription(),await f.now()+300,{value:1000n*PRICE}));await tx(s.connect(f.signers[2]).exitAll(...await exitArgs(f,s)));
 await tx(s.connect(f.signers[2]).subscribe(2,2000,nextSubscription(),await f.now()+300,{value:2000n*PRICE}));await f.timeTo(end);
 await revert(async()=>s.connect(f.signers[2]).exitAll.staticCall(...await exitArgs(f,s)));await tx(s.refundFor(2,f.addresses[2]));
 assert.equal(await s.bnbCredit(f.addresses[2]),2950n*PRICE);assert.equal(await s.bnbCredit(f.addresses[0]),50n*PRICE);
 await revert(async()=>s.refundFor.staticCall(2,f.addresses[2]));
}));

test('early exit closes exactly15minutes before deadline; reaching minimum cannot close a sale early',()=>using(async f=>{
 const {s,start,end}=await f.sale('token');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,1000,nextSubscription(),await f.now()+300,{value:1000n*PRICE}));await revert(async()=>s.finalizePool.staticCall());
 await f.timeTo(end-901);assert.equal(await s.earlyExitOpen(),true);
 await f.timeTo(end-900);assert.equal(await s.earlyExitOpen(),false);await revert(async()=>s.connect(f.signers[2]).exitAll.staticCall(...await exitArgs(f,s)));
}));

test('soldout closes early exit immediately and caps total active allocation exactly',()=>using(async f=>{
 const {s,start}=await f.sale('token');await f.timeTo(start);let remaining=PUBLIC;
 for(let i=1;remaining>0n;i++){if(i!==2&&i!==3)await tx(f.identity.setOwner(i,f.addresses[i]));const amount=remaining>CAP?CAP:remaining;await tx(s.connect(f.signers[i]).subscribe(i,amount,nextSubscription(),await f.now()+300,{value:amount*PRICE}));remaining-=amount;}
 assert.equal(await s.activeUnits(),PUBLIC);assert.ok(await s.soldOutAt()>0n);assert.equal(await s.earlyExitOpen(),false);
 await revert(async()=>s.connect(f.signers[2]).exitAll.staticCall(...await exitArgs(f,s)));await revert(async()=>s.connect(f.signers[32]).subscribe.staticCall(32,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await tx(s.finalizePool());assert.equal(await s.poolCreated(),true);
}));

test('successful token pool atomically locks80%, credits15/5, burns unused inventory and irretrievably places LP',()=>using(async f=>{
 const units=1_000_000n,{s,token,pair}=await successfulToken(f,units);
 assert.equal(await s.liquidityBnb(),units*PRICE*80n/100n);
 assert.equal(await s.liquidityTokens(),units*E18*80n/100n);
 assert.equal(await s.bnbCredit(f.addresses[1]),units*PRICE*15n/100n);
 assert.equal(await s.bnbCredit(f.addresses[0]),units*PRICE*5n/100n);
 assert.equal(await pair.balanceOf(ZeroAddress),await pair.totalSupply());
 assert.equal(await token.balanceOf(s.target),units*E18);
 assert.equal(await token.totalSupply(),units*E18+await s.liquidityTokens());
 assert.equal(await token.totalSupply()+await s.burnedTokens(),1_000_000_000n*E18);
 await revert(async()=>s.finalizePool.staticCall());await revert(async()=>s.refundFor.staticCall(2,f.addresses[2]));
}));

test('batch delivery and fallback claim share one entitlement; helpers cannot substitute a recipient',()=>using(async f=>{
 const {s,token}=await successfulToken(f);const key=await s.positionKey(2,f.addresses[2]);
 await tx(s.connect(f.signers[3]).distribute([key,key]));
 assert.equal(await token.balanceOf(f.addresses[2]),1_000_000n*E18);assert.equal(await token.balanceOf(f.addresses[3]),0n);
 await revert(async()=>s.connect(f.signers[2]).claim.staticCall(2));await tx(s.distribute([key]));
 assert.equal(await token.balanceOf(f.addresses[2]),1_000_000n*E18);
}));

test('user self-claim remains available after an arbitrarily long time with no distribution executor',()=>using(async f=>{
 const {s,token}=await successfulToken(f);await f.timeTo((await f.now())+365*DAY);
 await tx(s.connect(f.signers[2]).claim(2));assert.equal(await token.balanceOf(f.addresses[2]),1_000_000n*E18);
 await tx(s.distribute([await s.positionKey(2,f.addresses[2])]));assert.equal(await token.balanceOf(s.target),0n);
}));

test('48hour pool timeout enables full principal refund and permanently closes finalization',()=>using(async f=>{
 const {s,start,end}=await f.sale('token');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,1000,nextSubscription(),await f.now()+300,{value:1000n*PRICE}));await f.timeTo(end+2*DAY);
 assert.equal(await s.refundEligible(),true);await revert(async()=>s.finalizePool.staticCall());
 await tx(s.refundFor(2,f.addresses[2]));assert.equal(await s.bnbCredit(f.addresses[2]),1000n*PRICE);
 assert.equal(await s.bnbCredit(f.addresses[0]),0n);assert.equal(await s.bnbCredit(f.addresses[1]),0n);
}));

test('unsolicited WBNB cannot block settlement or enter the80/15/5 participant split',()=>using(async f=>{
 const {s,start,end,pair}=await f.sale('token');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,1000,nextSubscription(),await f.now()+300,{value:1000n*PRICE}));
 await tx(f.wbnb.deposit({value:1n}));await tx(f.wbnb.transfer(pair.target,1));await f.timeTo(end);
 await tx(s.finalizePool());assert.equal(await s.poolCreated(),true);assert.equal(await s.externalPoolWbnb(),1n);
 assert.equal(await s.liquidityBnb(),800n*PRICE);assert.equal(await s.bnbCredit(f.addresses[0]),50n*PRICE);assert.equal(await s.bnbCredit(f.addresses[1]),150n*PRICE);
 assert.equal(await f.wbnb.balanceOf(pair.target),800n*PRICE+1n);assert.equal(await pair.balanceOf(ZeroAddress),await pair.totalSupply());
}));

test('ordinary transfers and buys are0%; official-pair incoming transfers, including liquidity deposits, are2%',()=>using(async f=>{
 const {s,token,pair}=await successfulToken(f);await tx(s.connect(f.signers[2]).claim(2));
 await tx(token.connect(f.signers[2]).transfer(f.addresses[3],1000n*E18));assert.equal(await token.balanceOf(f.addresses[3]),1000n*E18);
 const before=await token.balanceOf(pair.target);await tx(token.connect(f.signers[2]).transfer(pair.target,1000n*E18));
 assert.equal(await token.balanceOf(pair.target)-before,980n*E18);assert.equal(await token.collectedTax(),20n*E18);
 await tx(pair.swapOut(token.target,10n*E18,f.addresses[4]));assert.equal(await token.balanceOf(f.addresses[4]),10n*E18);
}));

test('tax conversion warms up, uses collected tax only, enforces min output and splits actual BNB equally',()=>using(async f=>{
 const {s,token,pair}=await successfulToken(f);await tx(s.connect(f.signers[2]).claim(2));
 await tx(token.connect(f.signers[2]).transfer(pair.target,100000n*E18));await syncPair(pair);
 await revert(async()=>token.conversionQuote(100n*E18));await f.timeTo((await f.now())+1801);await tx(token.updateOracle());
 const amount=1000n*E18,minOut=await token.conversionQuote(amount),collected=await token.collectedTax();
 await tx(token.convertTax(amount,(await f.now())+300));
 const received=await f.provider.getBalance(token.target);
 assert.ok(received>=minOut);assert.equal(await token.collectedTax(),collected-amount);
 assert.equal(await token.taxBnbCredit(f.addresses[1]),received/2n);
 assert.equal(await token.taxBnbCredit(f.addresses[0]),received-received/2n);
 assert.equal(await token.allowance(token.target,f.router.target),0n);
 await tx(token.withdrawTaxFor(f.addresses[1]));await tx(token.withdrawTaxFor(f.addresses[0]));assert.equal(await f.provider.getBalance(token.target),0n);
 await revert(async()=>token.conversionQuote(collected+1n));
}));

test('stale reference or price shock blocks conversion while ordinary transfers stay available',()=>using(async f=>{
 const {s,token,pair}=await successfulToken(f);await tx(s.connect(f.signers[2]).claim(2));
 await tx(token.connect(f.signers[2]).transfer(pair.target,100000n*E18));await syncPair(pair);
 await f.timeTo((await f.now())+1801);await tx(token.updateOracle());
 const bnb=await f.wbnb.balanceOf(pair.target);await tx(f.wbnb.deposit({value:bnb}));await tx(f.wbnb.transfer(pair.target,bnb));await syncPair(pair);
 await revert(async()=>token.conversionQuote(100n*E18));
 await f.timeTo((await f.now())+7201);await revert(async()=>token.conversionQuote(100n*E18));
 await tx(token.connect(f.signers[2]).transfer(f.addresses[3],1n*E18));assert.equal(await token.balanceOf(f.addresses[3]),E18);
 await tx(token.updateOracle());assert.equal(await token.averageUpdatedAt(),0n);
}));

test('fixture reproduces time-dependent sync gas underestimation and retains a bounded successful recovery',()=>using(async f=>{
 const {pair}=await successfulToken(f),at=await f.now();
 await f.rpc.request({method:'evm_setNextBlockTimestamp',params:[at]});await syncPair(pair);
 assert.equal(await pair.price0CumulativeLast(),0n);assert.equal(await pair.price1CumulativeLast(),0n);
 await f.rpc.request({method:'evm_setNextBlockTimestamp',params:[at]});const estimate=await pair.sync.estimateGas();
 await f.rpc.request({method:'evm_setNextBlockTimestamp',params:[at+1]});let failure;
 try{await f.rpc.request({method:'eth_sendTransaction',params:[{from:f.addresses[0],to:pair.target,data:pair.interface.encodeFunctionData('sync'),gas:'0x'+estimate.toString(16)}]});}catch(error){failure=error;}
 assert.ok(failure);assert.match(failure.message,/out of gas/i);assert.ok(failure.data.transactionHash);
 const trace=await f.rpc.request({method:'debug_traceTransaction',params:[failure.data.transactionHash,{disableMemory:true,disableStack:true,disableStorage:true}]});assert.equal(trace.failed,true);
 assert.equal(await pair.price0CumulativeLast(),0n);const receipt=await syncPair(pair);assert.ok(receipt.gasUsed>estimate);assert.ok(receipt.gasUsed<200_000n);assert.ok(await pair.price0CumulativeLast()>0n);
 fs.writeFileSync(path.join(root,'evidence/fixture-sync-gas-regression.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,localOnly:true,estimateAtSameTimestamp:String(estimate),
  failedTransaction:failure.data.transactionHash,failedTrace:true,boundedGasLimit:'200000',recoveryGasUsed:String(receipt.gasUsed),recoveryTransaction:receipt.hash,
  cumulativePriceAdvanced:true,contractSourceChanged:false,productionGasGuarantee:false},null,2)+'\n');
}));

test('randomized subscribe/exit ledger preserves all native liabilities and exact fixed-price positions',()=>using(async f=>{
 const {s,start}=await f.sale('token');await f.timeTo(start);let seed=1234567,units=0n,refund=0n,fee=0n;
 for(let i=0;i<50;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  if(units>0n && seed%4===0){const principal=units*PRICE;await tx(s.connect(f.signers[2]).exitAll(...await exitArgs(f,s)));fee+=principal*5n/100n;refund+=principal-principal*5n/100n;units=0n;}
  else{const add=BigInt(seed%1000+1);await tx(s.connect(f.signers[2]).subscribe(2,add,nextSubscription(),await f.now()+300,{value:add*PRICE}));units+=add;}
  assert.equal(await s.activeUnits(),units);assert.equal(await s.activePrincipal(),units*PRICE);
  assert.equal(await s.identityActiveUnits(2),units);assert.equal(await s.bnbCredit(f.addresses[2]),refund);assert.equal(await s.bnbCredit(f.addresses[0]),fee);
  assert.equal(await f.provider.getBalance(s.target),units*PRICE+refund+fee);
 }
}));

async function registeredFactories(f){
 const registry=await f.deploy('LaunchRegistry',[[f.identity.target,f.addresses[0],f.addresses[0],f.factory.target,f.router.target,f.wbnb.target,1800,7200]]);
 const nftVersion=keccak256(toUtf8Bytes('LOCAL-NFT-V1')),tokenVersion=keccak256(toUtf8Bytes('LOCAL-TOKEN-V1'));
 const nftFactory=await f.deploy('NftLaunchFactory',[registry.target,nftVersion]);
 const tokenFactory=await f.deploy('TokenLaunchFactory',[registry.target,tokenVersion]);
 const review=keccak256(toUtf8Bytes('LOCAL TEST FIXTURE ONLY; NO SECURITY REVIEW'));
 await tx(registry.registerTemplate(nftVersion,nftFactory.target,review));
 await tx(registry.registerTemplate(tokenVersion,tokenFactory.target,review));
 return {registry,nftFactory,tokenFactory,nftVersion,tokenVersion,review};
}
const requestId=label=>keccak256(toUtf8Bytes(label));

test('registry records append-only template provenance, rejects overwrite/spoofing and bounds project pages',()=>using(async f=>{
 const r=await registeredFactories(f);
 await revert(async()=>r.registry.connect(f.signers[2]).registerTemplate.staticCall(requestId('OTHER'),r.nftFactory.target,r.review));
 await revert(async()=>r.registry.registerTemplate.staticCall(r.nftVersion,r.nftFactory.target,r.review));
 await revert(async()=>r.registry.registerProject.staticCall(f.identity.target,f.addresses[2],2,r.nftVersion,r.review));
 assert.equal((await r.registry.templates(r.nftVersion)).factory,r.nftFactory.target);
 assert.equal((await r.registry.templates(r.nftVersion)).creationCodeHash,keccak256(artifacts.NftLaunch.bytecode));
 assert.deepEqual(Array.from(await r.registry.listProjects(100,100)),[]);
 await revert(async()=>r.registry.listProjects(0,101));
 await revert(async()=>r.registry.listProjects(0,0));
}));

test('NFT factory binds creator identity and immutable terms; identical requests recover without duplicate projects',()=>using(async f=>{
 const r=await registeredFactories(f),start=(await f.now())+100;
 const terms=['Collection','N','ipfs://bafy-local-only/',requestId('content'),start,PRICE,3,f.addresses[1]];
 const id=requestId('nft-creation');
 await revert(async()=>r.nftFactory.connect(f.signers[3]).create.staticCall(2,id,terms,await f.now()+300));
 const commitment=await r.nftFactory.configCommitment(f.addresses[2],2,id,terms);
 await tx(r.nftFactory.connect(f.signers[2]).create(2,id,terms,await f.now()+300,{gasLimit:12_000_000}));
 const key=await r.nftFactory.requestKey(f.addresses[2],id),project=await r.nftFactory.projectForRequest(key);
 const record=await r.registry.projects(project),sale=new Contract(project,artifacts.NftLaunch.abi,f.signers[0]);
 assert.equal(record.creator,f.addresses[2]);assert.equal(record.factory,r.nftFactory.target);assert.equal(record.kind,1n);
 assert.equal(record.configHash,commitment);assert.equal(await sale.configHash(),commitment);
 assert.equal(await sale.platformRecipient(),f.addresses[0]);assert.equal(await sale.creatorRecipient(),f.addresses[1]);
 assert.equal(await sale.endsAt(),BigInt(start+7*DAY));assert.equal(await sale.capacity(),3n);
 await tx(r.nftFactory.connect(f.signers[2]).create(2,id,terms,await f.now()+300));assert.equal(await r.registry.projectCount(),1n);
 const changed=[...terms];changed[6]=4;
 await revert(async()=>r.nftFactory.connect(f.signers[2]).create.staticCall(2,id,changed,await f.now()+300));
 assert.deepEqual(Array.from(await r.registry.listProjects(0,100)),[project]);
}));

test('retiring a template prevents new creation but preserves existing subscriptions, delivery and request recovery',()=>using(async f=>{
 const r=await registeredFactories(f),start=(await f.now())+100;
 const terms=['Collection','N','ipfs://bafy-local-only/',requestId('content'),start,PRICE,1,f.addresses[1]],id=requestId('old-project');
 await tx(r.nftFactory.connect(f.signers[2]).create(2,id,terms,await f.now()+300,{gasLimit:12_000_000}));
 const project=await r.nftFactory.projectForRequest(await r.nftFactory.requestKey(f.addresses[2],id));
 const sale=new Contract(project,artifacts.NftLaunch.abi,f.signers[0]);
 await tx(r.registry.setTemplateEnabled(r.nftVersion,false));
 assert.equal(await r.registry.canCreate(r.nftVersion,r.nftFactory.target),false);
 assert.equal(await r.nftFactory.connect(f.signers[2]).create.staticCall(2,id,terms,await f.now()+300),project);
 await revert(async()=>r.nftFactory.connect(f.signers[2]).create.staticCall(2,requestId('new-project'),terms,await f.now()+300));
 await f.timeTo(start);await tx(sale.connect(f.signers[3]).subscribe(3,1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await tx(sale.finalize());await tx(sale.claimFor(f.addresses[3],[1]));assert.equal(await sale.ownerOf(1),f.addresses[3]);
 assert.equal((await r.registry.projects(project)).configHash,await sale.configHash());
}));

test('token factory stores exact immutable creation code within EIP170 and registers only the fixed1B template',()=>using(async f=>{
 const r=await registeredFactories(f);
 assert.equal(await r.tokenFactory.creationCodeHash(),keccak256(artifacts.TokenLaunch.bytecode));
 assert.equal(await r.tokenFactory.storedCreationCode(),artifacts.TokenLaunch.bytecode);
 const stored=await f.provider.getCode(await r.tokenFactory.creationCodeStore());
 assert.equal(stored,'0x00'+artifacts.TokenLaunch.bytecode.slice(2));assert.ok((stored.length-2)/2<=24576);
 const start=(await f.now())+100,terms=['Token','T',start,PRICE,1000n*PRICE,f.addresses[1]],id=requestId('token-creation');
 await tx(r.tokenFactory.connect(f.signers[2]).create(2,id,terms,await f.now()+300,{gasLimit:15_000_000}));
 const project=await r.tokenFactory.projectForRequest(await r.tokenFactory.requestKey(f.addresses[2],id));
 const sale=new Contract(project,artifacts.TokenLaunch.abi,f.signers[0]);
 const token=new Contract(await sale.token(),artifacts.LaunchToken.abi,f.signers[0]);
 assert.equal(await token.GENESIS_SUPPLY(),1_000_000_000n*E18);assert.equal(await token.totalSupply(),999_999_999n*E18);
 assert.equal(await sale.capacity(),PUBLIC);assert.equal(await sale.minimumRaise(),1000n*PRICE);
 assert.equal(await sale.wbnb(),f.wbnb.target);assert.equal(await token.router(),f.router.target);
 assert.equal(await sale.platformAdmin(),f.addresses[0]);assert.equal((await r.registry.projects(project)).kind,2n);
 await tx(r.tokenFactory.connect(f.signers[2]).create(2,id,terms,await f.now()+300));assert.equal(await r.registry.projectCount(),1n);
 const changed=[...terms];changed[4]=2000n*PRICE;
 await revert(async()=>r.tokenFactory.connect(f.signers[2]).create.staticCall(2,id,changed,await f.now()+300));
}));

test('equal request IDs from different creators cannot collide or take another creator project',()=>using(async f=>{
 const r=await registeredFactories(f),start=(await f.now())+100;
 const terms=['Collection','N','ipfs://bafy-local-only/',requestId('content'),start,PRICE,3,f.addresses[1]],id=requestId('same-id');
 await tx(r.nftFactory.connect(f.signers[2]).create(2,id,terms,await f.now()+300,{gasLimit:12_000_000}));
 await tx(r.nftFactory.connect(f.signers[3]).create(3,id,terms,await f.now()+300,{gasLimit:12_000_000}));
 const a=await r.nftFactory.projectForRequest(await r.nftFactory.requestKey(f.addresses[2],id));
 const b=await r.nftFactory.projectForRequest(await r.nftFactory.requestKey(f.addresses[3],id));
 assert.notEqual(a,b);assert.equal(await r.registry.projectCount(),2n);
}));

test('changed configured dependency code stops new factory creation instead of silently accepting different bindings',()=>using(async f=>{
 const r=await registeredFactories(f),start=(await f.now())+100;
 assert.equal(await r.registry.environmentUnchanged(),true);
 await f.rpc.request({method:'hardhat_setCode',params:[f.router.target,'0x00']});
 assert.equal(await r.registry.environmentUnchanged(),false);
 const terms=['Collection','N','ipfs://bafy-local-only/',requestId('content'),start,PRICE,1,f.addresses[1]];
 await revert(async()=>r.nftFactory.connect(f.signers[2]).create.staticCall(2,requestId('changed-code'),terms,await f.now()+300));
 assert.equal(await r.registry.projectCount(),0n);
}));

test('subscription expiry and permanent request IDs prevent late or duplicate payments for both templates',()=>using(async f=>{
 for(const kind of ['nft','token']){
  const {s,start}=await f.sale(kind,{capacity:10n});await f.timeTo(start);const id=requestId('once-'+kind),deadline=start+100;
  await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,id,start-1,{value:PRICE}));
  await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,id,start+301,{value:PRICE}));
  await tx(s.connect(f.signers[2]).subscribe(2,1,id,deadline,{value:PRICE}));
  const commitment=await s.subscriptionRequests(f.addresses[2],id);assert.notEqual(commitment,'0x'+'0'.repeat(64));
  await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,id,deadline,{value:PRICE}));
  assert.equal(await s.activeUnits(),1n);
  await tx(s.connect(f.signers[3]).subscribe(3,1,id,deadline,{value:PRICE})); // IDs are scoped to the wallet
  await f.timeTo(deadline+1);await revert(async()=>s.connect(f.signers[2]).subscribe.staticCall(2,1,nextSubscription(),deadline,{value:PRICE}));
  assert.equal(await s.activeUnits(),2n);
 }
}));

test('stale exit revision cannot withdraw a changed or newly reentered token position',()=>using(async f=>{
 const {s,start}=await f.sale('token');await f.timeTo(start);
 await tx(s.connect(f.signers[2]).subscribe(2,100,nextSubscription(),start+300,{value:100n*PRICE}));
 const old=await exitArgs(f,s);await tx(s.connect(f.signers[2]).subscribe(2,100,nextSubscription(),start+300,{value:100n*PRICE}));
 await revert(async()=>s.connect(f.signers[2]).exitAll.staticCall(...old));
 const current=await exitArgs(f,s);await tx(s.connect(f.signers[2]).exitAll(...current));
 await tx(s.connect(f.signers[2]).subscribe(2,200,nextSubscription(),start+300,{value:200n*PRICE}));
 await revert(async()=>s.connect(f.signers[2]).exitAll.staticCall(...current));
 assert.equal(await s.activePrincipal(),200n*PRICE);
}));

test('factory refuses an expired or overly long creation deadline without creating a project',()=>using(async f=>{
 const r=await registeredFactories(f),now=await f.now(),terms=['Token','T',now+100,PRICE,1000n*PRICE,f.addresses[1]];
 await revert(async()=>r.tokenFactory.connect(f.signers[2]).create.staticCall(2,requestId('expired-create'),terms,now-1));
 await revert(async()=>r.tokenFactory.connect(f.signers[2]).create.staticCall(2,requestId('long-create'),terms,now+301));
 assert.equal(await r.registry.projectCount(),0n);
}));

async function agentFixture(f,kind='token',{capacity=2n,minimum=PRICE*1000n}={}){
 const r=await registeredFactories(f);await tx(f.identity.register('agenttwo',f.addresses[2]));await tx(f.identity.register('agentthree',f.addresses[3]));
 const start=(await f.now())+100,id=requestId('agent-'+kind),identityId=identityIdOf('agenttwo');
 const terms=kind==='nft'?['NFT','N','ipfs://bafy-local-only/',requestId('full-content'),start,PRICE,capacity,f.addresses[1]]:['Token','T',start,PRICE,minimum,f.addresses[1]];
 const factory=kind==='nft'?r.nftFactory:r.tokenFactory;
 await tx(factory.connect(f.signers[2]).create(identityId,id,terms,await f.now()+300,{gasLimit:15_000_000}));
 const project=await factory.projectForRequest(await factory.requestKey(f.addresses[2],id));
 const sale=new Contract(project,artifacts[kind==='nft'?'NftLaunch':'TokenLaunch'].abi,f.signers[0]);
 const config={schema:'echo-launch-runtime/v1',chainId:31337,mode:'local-test',executionReady:false,minConfirmations:1,
  registry:{address:r.registry.target,runtimeHash:keccak256(await f.provider.getCode(r.registry.target))},approvedTemplates:[]};
 for(const [factory,version,kindId] of [[r.nftFactory,r.nftVersion,1],[r.tokenFactory,r.tokenVersion,2]])config.approvedTemplates.push({versionId:version,kind:kindId,
  creationCodeHash:await factory.creationCodeHash(),factoryRuntimeHash:keccak256(await f.provider.getCode(factory.target))});
 const client=new LaunchAgentClient({provider:f.provider,config});
 await f.timeTo(start);
 return {r,project,sale,client,config,start,end:start+7*DAY,identityId,request:{project,wallet:f.addresses[2],handle:'agenttwo'}};
}
const consentFor=q=>({userConfirmed:true,quoteHash:q.quoteHash,wallet:q.wallet,project:q.project,chainId:q.chainId,action:q.action,configHash:q.configHash,
 maxPaymentWei:q.paymentWei,gasCapWei:'100000000000000000',expiresAt:String(q.deadline)});
async function localSubmit(f,client,q){const prepared=await client.prepare(q,consentFor(q));assert.equal(prepared.broadcast,false);assert.equal(prepared.localTestOnly,true);
 const receipt=await tx(f.signers[2].sendTransaction(prepared.transaction));return {prepared,receipt};}

test('Agent validates real registry/factory pins, reads one block and verifies normalized identity in both directions',()=>using(async f=>{
 const a=await agentFixture(f);const state=await a.client.snapshot(a.project,{wallet:f.addresses[2],handle:'ＡＧＥＮＴＴＷＯ.ai'});
 assert.equal(state.provenanceVerified,true);assert.equal(state.who.identityVerified,true);assert.equal(state.phase,'open');assert.equal(state.base.unitPrice,PRICE.toString());
 assert.deepEqual((await a.client.list()).projects,[a.project]);
 const badPin=structuredClone(a.config);badPin.registry.runtimeHash=requestId('wrong-runtime');
 await assert.rejects(()=>new LaunchAgentClient({provider:f.provider,config:badPin}).snapshot(a.project),/REGISTRY_CODE_MISMATCH/);
 const badTemplate=structuredClone(a.config);badTemplate.approvedTemplates=[];
 await assert.rejects(()=>new LaunchAgentClient({provider:f.provider,config:badTemplate}).snapshot(a.project),/UNAPPROVED_TEMPLATE/);
 const wrongChain={...a.config,chainId:56,mode:'production'};
 await assert.rejects(()=>new LaunchAgentClient({provider:f.provider,config:wrongChain}).snapshot(a.project),/WRONG_CHAIN/);
 const unregistered=await f.sale('nft');await assert.rejects(()=>a.client.snapshot(unregistered.s.target),/UNREGISTERED_PROJECT/);
 await assert.rejects(()=>a.client.quoteSubscription({...a.request,wallet:f.addresses[3],units:1}),/IDENTITY_NOT_VERIFIED/);
}));

test('Agent token budget uses integer wei, returns unused budget and enforces the4% public cap',()=>using(async f=>{
 const a=await agentFixture(f);const q=await a.client.quoteSubscription({...a.request,budgetWei:(123n*PRICE+7n).toString()});
 assert.equal(q.units,'123');assert.equal(q.paymentWei,(123n*PRICE).toString());assert.equal(q.unusedBudgetWei,'7');assert.equal(q.freeUnits,'0');
 await assert.rejects(()=>a.client.quoteSubscription({...a.request,units:CAP+1n}),/QUOTA_EXCEEDED/);
 await assert.rejects(()=>a.client.quoteSubscription({...a.request,units:1,budgetWei:'100'}),/AMBIGUOUS_QUANTITY/);
 await assert.rejects(()=>a.client.quoteSubscription({...a.request,budgetWei:1e18}),/INVALID_INTEGER/);
 await assert.rejects(()=>a.client.quoteSubscription({...a.request,units:'1e3'}),/INVALID_INTEGER/);
}));

test('unsigned preparation requires exact explicit consent, intact quote, gas cap and sufficient native balance',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000});
 await assert.rejects(()=>a.client.prepare(q,{}),/CONSENT_REQUIRED/);
 await assert.rejects(()=>a.client.prepare({...q,paymentWei:'0'},consentFor(q)),/QUOTE_INTEGRITY_FAILED/);
 await assert.rejects(()=>a.client.prepare(q,{...consentFor(q),gasCapWei:'1'}),/GAS_CAP_EXCEEDED/);
 const tampered=structuredClone(q);tampered.transaction.to=f.addresses[3];tampered.quoteHash=quoteDigest(tampered);
 await assert.rejects(()=>a.client.prepare(tampered,consentFor(tampered)),/STATE_CHANGED/);
 const prepared=await a.client.prepare(q,consentFor(q));assert.equal(prepared.transaction.value,q.paymentWei);assert.equal(prepared.broadcast,false);
 assert.throws(()=>bawPreviewArgs(prepared),/NOT_READY_FOR_LIVE_WALLET/);
 await f.rpc.request({method:'hardhat_setBalance',params:[f.addresses[2],'0x0']});
 await assert.rejects(()=>a.client.prepare(q,consentFor(q)),/INSUFFICIENT_BNB/);
}));

test('state changes and expired consent stop preparation instead of silently refreshing permission',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000});
 await tx(a.sale.connect(f.signers[3]).subscribe(identityIdOf('agentthree'),1,nextSubscription(),await f.now()+300,{value:PRICE}));
 await assert.rejects(()=>a.client.prepare(q,consentFor(q)),/STATE_CHANGED/);
 const fresh=await a.client.quoteSubscription({...a.request,units:1000});await f.timeTo(fresh.deadline+1);
 await assert.rejects(()=>a.client.prepare(fresh,consentFor(fresh)),/INVALID_DEADLINE|CONSENT_EXPIRED/);
}));

test('Agent proves token subscription separately from delivery, then verifies real claim Transfer after pool success',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000});
 const submitted=await localSubmit(f,a.client,q);const proof=await a.client.verifyReceipt({project:a.project,transactionHash:submitted.receipt.hash,quote:q});
 assert.equal(proof.subscriptionConfirmed,true);assert.equal(proof.deliveryConfirmed,false);assert.equal(proof.explorerUrl,null);
 const token=new Contract(await a.sale.token(),artifacts.LaunchToken.abi,f.signers[0]);assert.equal(await token.balanceOf(f.addresses[2]),0n);
 await f.timeTo(a.end);await tx(a.sale.finalizePool());
 const claim=await a.client.quoteAction({...a.request,action:'claim'}),delivered=await localSubmit(f,a.client,claim);
 const deliveryProof=await a.client.verifyReceipt({project:a.project,transactionHash:delivered.receipt.hash,quote:claim});
 assert.equal(deliveryProof.deliveryConfirmed,true);assert.equal(await token.balanceOf(f.addresses[2]),1000n*E18);
 await assert.rejects(()=>a.client.quoteAction({...a.request,action:'claim'}),/NOTHING_DUE/);
}));

test('Agent verifies exact reserved NFT IDs and both Delivered/Transfer events after sellout',()=>using(async f=>{
 const a=await agentFixture(f,'nft');const q=await a.client.quoteSubscription({...a.request,units:2});await localSubmit(f,a.client,q);await tx(a.sale.finalize());
 await assert.rejects(()=>a.client.quoteAction({...a.request,action:'claim',ids:['1','1']}),/DUPLICATE_NFT_ID/);
 const claim=await a.client.quoteAction({...a.request,action:'claim',ids:['1','2']}),submitted=await localSubmit(f,a.client,claim);
 const proof=await a.client.verifyReceipt({project:a.project,transactionHash:submitted.receipt.hash,quote:claim});assert.equal(proof.deliveryConfirmed,true);
 assert.equal(await a.sale.ownerOf(2),f.addresses[2]);
}));

test('failed token raise uses refund credit then native withdrawal, with distinct receipts and no failure fee',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1});await localSubmit(f,a.client,q);await f.timeTo(a.end);
 const refund=await a.client.quoteAction({...a.request,action:'refund'});assert.equal(refund.expectedReturnWei,PRICE.toString());assert.equal(refund.platformFeeWei,'0');
 const credited=await localSubmit(f,a.client,refund),creditProof=await a.client.verifyReceipt({project:a.project,transactionHash:credited.receipt.hash,quote:refund});
 assert.equal(creditProof.creditCreated,true);assert.equal(creditProof.nativePaymentConfirmed,false);assert.equal(await a.sale.bnbCredit(f.addresses[0]),0n);
 const withdraw=await a.client.quoteAction({...a.request,action:'withdraw-credit'}),paid=await localSubmit(f,a.client,withdraw);
 const paidProof=await a.client.verifyReceipt({project:a.project,transactionHash:paid.receipt.hash,quote:withdraw});
 assert.equal(paidProof.nativePaymentConfirmed,true);assert.equal(paidProof.grossBnbPaidWei,PRICE.toString());assert.equal(await a.sale.bnbCredit(f.addresses[2]),0n);
 await assert.rejects(()=>a.client.quoteAction({...a.request,action:'refund'}),/NOTHING_DUE/);
}));

test('Agent voluntary exit quotes95/5 and cannot reuse an old position revision after another subscription',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000});await localSubmit(f,a.client,q);
 const exit=await a.client.quoteAction({...a.request,action:'exit'});assert.equal(exit.expectedReturnWei,(950n*PRICE).toString());assert.equal(exit.platformFeeWei,(50n*PRICE).toString());
 const add=await a.client.quoteSubscription({...a.request,units:1});await localSubmit(f,a.client,add);
 await assert.rejects(()=>a.client.prepare(exit,consentFor(exit)),/STATE_CHANGED/);
 const freshExit=await a.client.quoteAction({...a.request,action:'exit'}),submitted=await localSubmit(f,a.client,freshExit);
 const proof=await a.client.verifyReceipt({project:a.project,transactionHash:submitted.receipt.hash,quote:freshExit});assert.equal(proof.creditCreated,true);assert.equal(proof.nativePaymentConfirmed,false);
}));

test('recovery checks recorded request and pending nonce, never recommends blind resubmission',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000}),prepared=await a.client.prepare(q,consentFor(q));
 await f.rpc.request({method:'evm_setAutomine',params:[false]});const pending=await f.signers[2].sendTransaction(prepared.transaction);
 const pendingProof=await a.client.verifyReceipt({project:a.project,transactionHash:pending.hash,quote:q});assert.equal(pendingProof.status,'pending');
 const recovery=await a.client.recover({...a.request,requestId:q.requestId});assert.equal(recovery.safeToResubmit,false);assert.equal(recovery.status,'wallet-has-pending-transaction');
 await f.rpc.request({method:'evm_setAutomine',params:[true]});await f.rpc.request({method:'evm_mine',params:[]});await pending.wait();
 const recorded=await a.client.recover({...a.request,requestId:q.requestId});assert.equal(recorded.status,'request-recorded-onchain');
 await assert.rejects(()=>a.client.quoteSubscription({...a.request,units:1000,requestId:q.requestId}),/REQUEST_ALREADY_RECORDED/);
}));

test('receipt policy waits for confirmations and rejects a real unrelated transaction as subscription proof',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000}),submitted=await localSubmit(f,a.client,q);
 const stricter=new LaunchAgentClient({provider:f.provider,config:{...a.config,minConfirmations:3}});
 assert.equal((await stricter.verifyReceipt({project:a.project,transactionHash:submitted.receipt.hash,quote:q})).status,'confirming');
 await f.rpc.request({method:'evm_mine',params:[]});await f.rpc.request({method:'evm_mine',params:[]});
 assert.equal((await stricter.verifyReceipt({project:a.project,transactionHash:submitted.receipt.hash,quote:q})).subscriptionConfirmed,true);
 const unrelated=await tx(f.signers[2].sendTransaction({to:f.addresses[3],value:0}));
 await assert.rejects(()=>a.client.verifyReceipt({project:a.project,transactionHash:unrelated.hash,quote:q}),/TRANSACTION_MISMATCH/);
 assert.equal((await a.client.verifyReceipt({project:a.project,transactionHash:'0x'+'f'.repeat(64),quote:q})).status,'not-found');
}));

test('actual Agent CLI quotes, simulates and checks receipt over a read-only local RPC transport',()=>using(async f=>{
 const a=await agentFixture(f),run=promisify(execFile),folder=fs.mkdtempSync(path.join(root,'evidence/agent-cli-'));
 const readMethods=new Set(['eth_chainId','net_version','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_call','eth_estimateGas','eth_getBalance','eth_getTransactionCount','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getLogs']);
 const server=http.createServer(async(req,res)=>{
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
  let body='';for await(const data of req){body+=data;if(body.length>1024*1024){res.writeHead(413);res.end();return;}}
  try{
   const input=JSON.parse(body),batch=Array.isArray(input)?input:[input];
   const responses=await Promise.all(batch.map(async item=>{
    try{if(!readMethods.has(item.method))throw Object.assign(Error('Read-only local transport'),{code:-32601});
     return {jsonrpc:'2.0',id:item.id,result:await f.rpc.request({method:item.method,params:item.params||[]})};
    }catch(e){return {jsonrpc:'2.0',id:item.id,error:{code:typeof e.code==='number'?e.code:-32000,message:e.message,data:e.data}};}
   }));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(input)?responses:responses[0]));
  }catch{res.writeHead(400);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const endpoint=`http://127.0.0.1:${server.address().port}`,configFile=path.join(folder,'local-config.json');fs.writeFileSync(configFile,JSON.stringify(a.config));
 const cli=async args=>JSON.parse((await run(process.execPath,['agent/echo-launch-agent.mjs',...args,'--config',configFile,'--rpc',endpoint],{cwd:root,timeout:20000,maxBuffer:1024*1024})).stdout);
 try{
  const listed=await cli(['list']);assert.deepEqual(listed.projects,[a.project]);
  const quote=await cli(['quote','--project',a.project,'--wallet',f.addresses[2],'--handle','agenttwo','--budget-wei',(1000n*PRICE+7n).toString()]);
  assert.equal(quote.units,'1000');assert.equal(quote.unusedBudgetWei,'7');
  const quoteFile=path.join(folder,'quote.json'),consentFile=path.join(folder,'synthetic-local-consent.json');fs.writeFileSync(quoteFile,JSON.stringify(quote));fs.writeFileSync(consentFile,JSON.stringify(consentFor(quote)));
  const prepared=await cli(['prepare','--quote-file',quoteFile,'--consent-file',consentFile]);assert.equal(prepared.broadcast,false);assert.equal(prepared.localTestOnly,true);
  const receipt=await tx(f.signers[2].sendTransaction(prepared.transaction)); // only the test harness submits, on chain31337
  const proof=await cli(['receipt','--project',a.project,'--hash',receipt.hash,'--quote-file',quoteFile]);assert.equal(proof.subscriptionConfirmed,true);assert.equal(proof.deliveryConfirmed,false);
  const termsFile=path.join(folder,'creation-terms.json');fs.writeFileSync(termsFile,JSON.stringify({name:'CLI project',symbol:'CLI',startsAt:await f.now()+100,unitPrice:String(PRICE),minimumRaise:String(PRICE*1000n),creatorRecipient:f.addresses[1]}));
  const creation=await cli(['quote-create','--wallet',f.addresses[2],'--handle','agenttwo','--version-id',a.r.tokenVersion,'--terms-file',termsFile]);
  const createFile=path.join(folder,'creation-quote.json');fs.writeFileSync(createFile,JSON.stringify(creation));fs.writeFileSync(consentFile,JSON.stringify(consentFor(creation)));
  const createPrepared=await cli(['prepare','--quote-file',createFile,'--consent-file',consentFile]),createReceipt=await tx(f.signers[2].sendTransaction(createPrepared.transaction));
  const creationProof=await cli(['receipt','--project',creation.project,'--hash',createReceipt.hash,'--quote-file',createFile]);assert.equal(creationProof.creationConfirmed,true);
  const recovered=await cli(['recover-create','--wallet',f.addresses[2],'--version-id',a.r.tokenVersion,'--request-id',creation.requestId]);assert.equal(recovered.project,creation.project);assert.equal(recovered.safeToResubmit,false);
  await f.timeTo(a.end);await tx(a.sale.finalizePool());
  const distribution=await cli(['quote','--action','distribute','--project',a.project,'--wallet',f.addresses[0],'--limit','10']),distFile=path.join(folder,'distribution-quote.json');
  fs.writeFileSync(distFile,JSON.stringify(distribution));fs.writeFileSync(consentFile,JSON.stringify(consentFor(distribution)));
  const distPrepared=await cli(['prepare','--quote-file',distFile,'--consent-file',consentFile]),distReceipt=await tx(f.signers[0].sendTransaction(distPrepared.transaction));
  const distributionProof=await cli(['receipt','--project',a.project,'--hash',distReceipt.hash,'--quote-file',distFile]);assert.equal(distributionProof.deliveryConfirmed,true);
  const recoveredBatch=await cli(['recover-distribution','--project',a.project,'--keys',distribution.keys.join(',')]);assert.equal(recoveredBatch.receiptAttributionVerified,false);
  fs.writeFileSync(path.join(root,'evidence/agent-cli-local-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),localTestOnly:true,chainId:31337,readOnlyRpcTransport:true,quote,prepared,proof,creation,creationProof,distribution,distributionProof,realWalletUsed:false,mainnetTransaction:false},null,2)+'\n');
 }finally{await new Promise(resolve=>server.close(resolve));}
}));

test('Agent discloses one-sided WBNB and invalidates an older consent without blocking mature refunds',()=>using(async f=>{
 const a=await agentFixture(f),q=await a.client.quoteSubscription({...a.request,units:1000});await localSubmit(f,a.client,q);
 const token=new Contract(await a.sale.token(),artifacts.LaunchToken.abi,f.signers[0]),pair=await token.pair();
 await tx(f.wbnb.deposit({value:1n}));await tx(f.wbnb.transfer(pair,1));
 const before=await a.client.quoteSubscription({...a.request,units:1});assert.equal(before.poolObservation.externalWbnbWei,'1');assert.match(before.poolObservation.disclosure,/not subscription principal/);
 await tx(f.wbnb.deposit({value:1n}));await tx(f.wbnb.transfer(pair,1));
 await assert.rejects(()=>a.client.prepare(before,consentFor(before)),/STATE_CHANGED/);
 await f.timeTo(a.end+2*DAY);const refund=await a.client.quoteAction({...a.request,action:'refund'});
 const submitted=await localSubmit(f,a.client,refund);const proof=await a.client.verifyReceipt({project:a.project,transactionHash:submitted.receipt.hash,quote:refund});
 assert.equal(proof.creditCreated,true);assert.equal(refund.expectedReturnWei,(1000n*PRICE).toString());
}));

test('production-mode reader rejects a stale RPC block before preparing any transaction',()=>using(async f=>{
 const a=await agentFixture(f),provider=new Proxy(f.provider,{get(target,key){if(key==='send')return async(method,params)=>method==='eth_chainId'?'0x38':target.send(method,params);const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const client=new LaunchAgentClient({provider,config:{...a.config,chainId:56,mode:'production',maxBlockAgeSeconds:120}});
 await assert.rejects(()=>client.snapshot(a.project),/STALE_BLOCK/);
}));

async function creatorFixture(f){
 const r=await registeredFactories(f);await tx(f.identity.register('agenttwo',f.addresses[2]));
 const config={schema:'echo-launch-runtime/v1',chainId:31337,mode:'local-test',executionReady:false,minConfirmations:1,
  registry:{address:r.registry.target,runtimeHash:keccak256(await f.provider.getCode(r.registry.target))},approvedTemplates:[]};
 for(const [factory,version,kind] of [[r.nftFactory,r.nftVersion,1],[r.tokenFactory,r.tokenVersion,2]])config.approvedTemplates.push({versionId:version,kind,creationCodeHash:await factory.creationCodeHash(),factoryRuntimeHash:keccak256(await f.provider.getCode(factory.target))});
 const client=new LaunchAgentClient({provider:f.provider,config});
 const input=async kind=>({wallet:f.addresses[2],handle:'agenttwo',versionId:kind===1?r.nftVersion:r.tokenVersion,requestId:requestId('sdk-create-'+kind),
  terms:kind===1?{name:'艺术',symbol:'123中文',baseURI:'ipfs://bafy-local-only/',metadataRoot:requestId('content-root'),startsAt:String(await f.now()+100),unitPrice:String(PRICE),supply:'3',creatorRecipient:f.addresses[1]}:
   {name:'Token',symbol:'任意代号',startsAt:String(await f.now()+100),unitPrice:String(PRICE),minimumRaise:String(1000n*PRICE),creatorRecipient:f.addresses[1]}});
 return {r,client,config,input};
}
async function distributedFixture(f){
 const a=await agentFixture(f);await localSubmit(f,a.client,await a.client.quoteSubscription({...a.request,units:1000}));
 await tx(a.sale.connect(f.signers[3]).subscribe(identityIdOf('agentthree'),2000,nextSubscription(),await f.now()+300,{value:2000n*PRICE}));
 await f.timeTo(a.end);await tx(a.sale.finalizePool());return a;
}
async function submitDistribution(f,client,q){const prepared=await client.prepare(q,consentFor(q));return {prepared,receipt:await tx(f.signers[0].sendTransaction(prepared.transaction))};}

test('Agent creator quote predicts exact CREATE2 address and proves NFT/token factory plus registry receipts',()=>using(async f=>{
 const a=await creatorFixture(f);
 for(const kind of [1,2]){
  const input=await a.input(kind),q=await a.client.quoteCreate(input);assert.equal(q.paymentWei,'0');assert.equal(q.kind,kind);assert.equal(q.units,'0');assert.equal(q.broadcast,false);
  if(kind===2)assert.equal(q.projection.belowQuarterWarning,true);else assert.match(q.contentStatus,/not-independently/);
  const {receipt}=await localSubmit(f,a.client,q),proof=await a.client.verifyReceipt({project:q.project,transactionHash:receipt.hash,quote:q});
  assert.equal(proof.creationConfirmed,true);assert.equal(proof.subscriptionConfirmed,false);assert.equal(proof.deliveryConfirmed,false);
  const state=await a.client.snapshot(q.project);assert.equal(state.phase,'scheduled');assert.equal(state.configHash,q.configHash);assert.equal(state.base.creatorRecipient,f.addresses[1]);
 }
 assert.equal(await a.r.registry.projectCount(),2n);
}));

test('Agent creation recovers identical requests after retirement and rejects conflicting reuse without a second signature',()=>using(async f=>{
 const a=await creatorFixture(f),input=await a.input(2),q=await a.client.quoteCreate(input);await localSubmit(f,a.client,q);
 await tx(a.r.registry.setTemplateEnabled(a.r.tokenVersion,false));const recovered=await a.client.quoteCreate(input);
 assert.equal(recovered.status,'already-created');assert.equal(recovered.transaction,null);assert.equal(recovered.project,q.project);assert.equal(recovered.safeToResubmit,false);
 await assert.rejects(()=>a.client.prepare(q,consentFor(q)),/CREATION_ALREADY_RECORDED/);
 await assert.rejects(()=>a.client.quoteCreate({...input,terms:{...input.terms,name:'Different'}}),/CONFLICTING_CREATION_REQUEST/);
 await assert.rejects(()=>a.client.quoteCreate({...input,requestId:requestId('new-retired')}),/TEMPLATE_DISABLED/);
 await tx(f.identity.setOwner(identityIdOf('agenttwo'),f.addresses[3]));
 assert.equal((await a.client.recoverCreation({wallet:input.wallet,versionId:input.versionId,requestId:input.requestId})).status,'creation-recorded-onchain');
 assert.equal(await a.r.registry.projectCount(),1n);
}));

test('Agent creator cannot bypass ownership, future start, immutable config or explicit gas consent',()=>using(async f=>{
 const a=await creatorFixture(f),input=await a.input(2);
 await assert.rejects(()=>a.client.quoteCreate({...input,wallet:f.addresses[3]}),/IDENTITY_NOT_VERIFIED/);
 const current=await f.now();await assert.rejects(()=>a.client.quoteCreate({...input,terms:{...input.terms,startsAt:current}}),/START_MUST_BE_FUTURE/);
 await assert.rejects(()=>a.client.quoteCreate({...input,terms:{...input.terms,minimumRaise:'0'}}),/INVALID_CREATION_TERMS/);
 const q=await a.client.quoteCreate(input);await assert.rejects(()=>a.client.prepare(q,{...consentFor(q),gasCapWei:'1'}),/GAS_CAP_EXCEEDED/);
 await tx(a.r.registry.setTemplateEnabled(a.r.tokenVersion,false));await assert.rejects(()=>a.client.prepare(q,consentFor(q)),/TEMPLATE_DISABLED/);
 assert.equal(await a.r.registry.projectCount(),0n);
}));

async function indexFixture(f,options={}){
 const a=await agentFixture(f),startBlock=(await f.provider.getTransactionReceipt(a.r.registry.deploymentTransaction().hash)).blockNumber;
 const folder=fs.mkdtempSync(path.join(root,'evidence/project-index-')),databasePath=path.join(folder,'index.sqlite');
 const settings={provider:f.provider,config:a.config,databasePath,startBlock,maxBlocksPerSync:256,...options};
 return {...a,folder,databasePath,settings,index:new LaunchProjectIndex(settings)};
}
const indexProvider=(provider,overrides)=>new Proxy(provider,{get(target,key){if(key in overrides)return overrides[key];const value=target[key];return typeof value==='function'?value.bind(target):value;}});

async function nftItemFixture(f,capacity){
 const a=await agentFixture(f,'nft',{capacity}),folder=fs.mkdtempSync(path.join(root,'evidence/nft-items-'));
 const settings={provider:f.provider,config:a.config,databasePath:path.join(folder,'index.sqlite'),startBlock:(await f.provider.getTransactionReceipt(a.r.registry.deploymentTransaction().hash)).blockNumber,maxBlocksPerSync:256};
 return {...a,settings,index:new LaunchProjectIndex(settings)};
}
async function readOnlyRpcBridge(f){
 const methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_call','eth_getLogs','eth_getBalance','eth_getTransactionReceipt']);
 const server=http.createServer(async(req,res)=>{try{let text='';for await(const part of req){text+=part;if(text.length>1024*1024)throw Error('READ_LIMIT');}
  const input=JSON.parse(text),batch=Array.isArray(input)?input:[input],output=await Promise.all(batch.map(async x=>{try{if(!methods.has(x.method))throw Error('READ_ONLY');return {jsonrpc:'2.0',id:x.id,result:await f.rpc.request({method:x.method,params:x.params??[]})};}catch{return {jsonrpc:'2.0',id:x.id,error:{code:-32000,message:'Local read unavailable'}};}}));
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(input)?output:output[0]));
 }catch{res.writeHead(400);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}
test('NFT item pages verify125reserved IDs,actual delivery and transferred ownership at one frozen block',()=>using(async f=>{
 const a=await nftItemFixture(f,125n);
 try{
  for(const n of [100,25])await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,n,nextSubscription(),await f.now()+300,{value:BigInt(n)*PRICE,gasLimit:5000000}));
  await tx(a.sale.finalize());for(const [start,count] of [[1,100],[101,25]])await tx(a.sale.claimFor(f.addresses[2],Array.from({length:count},(_,i)=>start+i),{gasLimit:10000000}));
  await tx(a.sale.connect(f.signers[2]).transferFrom(f.addresses[2],f.addresses[3],1));await a.index.sync();
  const state=(await a.index.state(a.project,{wallet:f.addresses[2]})).state,scope={project:a.project,wallet:f.addresses[2],blockNumber:state.blockNumber,blockHash:state.blockHash,limit:20};
  const first=await a.index.nftItems(scope);assert.equal(first.items.length,20);assert.equal(first.items[0].tokenId,'1');assert.equal(first.items[0].currentOwner,f.addresses[3]);
  assert.equal(first.items[0].reservedWallet,f.addresses[2]);assert.equal(first.items[1].currentOwner,f.addresses[2]);assert.equal(first.contentVerified,false);assert.equal(first.scope,'page-only');
  await assert.rejects(()=>a.index.nftItems({...scope,wallet:f.addresses[3],cursor:first.nextCursor}),/NFT_ITEM_SCOPE/);
  await assert.rejects(()=>a.index.nftItems({...scope,limit:51}),/NFT_ITEM_PAGE_LIMIT/);
  await tx(a.sale.connect(f.signers[2]).transferFrom(f.addresses[2],f.addresses[3],2));await a.index.sync();assert.deepEqual(await a.index.nftItems(scope),first);
  let page=first,pages=1,items=[...first.items];while(page.nextCursor){page=await a.index.nftItems({...scope,cursor:page.nextCursor});pages++;assert.ok(page.items.length<=20);items.push(...page.items);assert.ok(pages<10);}
  assert.equal(items.length,125);assert.equal(new Set(items.map(i=>i.tokenId)).size,125);assert.equal(items.at(-1).tokenId,'125');
  assert.ok(items.every(i=>i.minted&&i.deliveryReceipt.status===1&&i.tokenURI===state.extra.contentBaseURI+i.tokenId+'.json'));
  const api=await createRuntimeReadServer({index:a.index,staticRoot:path.resolve(root,'../../frontend/dist')});try{
   const params=new URLSearchParams({address:a.project,wallet:f.addresses[2],block:String(state.blockNumber),hash:state.blockHash,limit:'20'});
   const response=await fetch(api.url+'/launch-api/nft-items?'+params);assert.equal(response.status,200);assert.deepEqual(await response.json(),first);
  }finally{await api.close();}
  const rpc=await readOnlyRpcBridge(f);try{
   const file=path.join(path.dirname(a.settings.databasePath),'config.json');fs.writeFileSync(file,JSON.stringify(a.config));
   const common=['--config',file,'--database',a.settings.databasePath,'--start-block',String(a.settings.startBlock),'--rpc',rpc.url,'--address',a.project,'--wallet',f.addresses[2],'--block',String(state.blockNumber),'--block-hash',state.blockHash,'--limit','20'];
   const cli=async args=>JSON.parse((await promisify(execFile)(process.execPath,['agent/echo-project-index.mjs','nft-items',...common,...args],{cwd:root,timeout:40000,maxBuffer:1024*1024})).stdout);
   assert.deepEqual(await cli([]),first);const second=await cli(['--cursor',first.nextCursor]);assert.equal(second.items[0].tokenId,'21');
  }finally{await rpc.close();}
  fs.writeFileSync(path.join(root,'evidence/nft-item-pages-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),localOnly:true,chainId:31337,itemsVerified:125,pages,
   originalWallet:f.addresses[2],transferredOwner:f.addresses[3],snapshot:{blockNumber:state.blockNumber,blockHash:state.blockHash},first,last:page,
   newBlocksExcluded:true,wrongScopeRejected:true,cliReadOnlyVerified:true,publicContentAvailabilityVerified:false,financialExecutionAllowed:false},null,2)+'\n');
 }finally{a.index.close();}
}));

test('NFT item reads separate typed nonexistence from RPC failure,missing mint Transfers and orphaned blocks',()=>using(async f=>{
 const a=await nftItemFixture(f,3n);let bad;
 try{
  await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,1,nextSubscription(),await f.now()+300,{value:PRICE}));await a.index.sync();
  const state=(await a.index.state(a.project,{wallet:f.addresses[2]})).state,scope={project:a.project,wallet:f.addresses[2],blockNumber:state.blockNumber,blockHash:state.blockHash};
  try{await a.sale.ownerOf(1,{blockTag:state.blockNumber});}catch(error){fs.writeFileSync(path.join(root,'evidence/nft-owner-nonexistence-diagnostic.json'),JSON.stringify({code:error.code,data:error.data,nestedData:error.info?.error?.data,revert:error.revert},null,2));}
  const pending=await a.index.nftItems(scope);assert.equal(pending.items[0].minted,false);assert.equal(pending.items[0].currentOwner,null);assert.equal(pending.items[0].deliveryReceipt,null);assert.equal(pending.items[0].tokenURI,null);
  const selector=a.sale.interface.getFunction('ownerOf').selector;
  bad=new LaunchProjectIndex({...a.settings,provider:indexProvider(f.provider,{call:async tx=>{if(tx.data?.startsWith(selector))throw Error('LOCAL_RPC_FAILURE');return f.provider.call(tx);}})});
  await assert.rejects(()=>bad.nftItems(scope),/NFT_OWNER_READ_UNAVAILABLE/);bad.close();bad=null;
  bad=new LaunchProjectIndex({...a.settings,provider:indexProvider(f.provider,{call:async tx=>{if(tx.data?.startsWith(selector))throw Object.assign(Error('wrong token'),{code:'CALL_EXCEPTION',data:a.sale.interface.encodeErrorResult('ERC721NonexistentToken',[999])});return f.provider.call(tx);}})});
  await assert.rejects(()=>bad.nftItems(scope),/NFT_OWNER_READ_UNAVAILABLE/);bad.close();bad=null;
  const fork=await f.rpc.request({method:'evm_snapshot',params:[]});
  await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,2,nextSubscription(),await f.now()+300,{value:2n*PRICE}));await tx(a.sale.finalize());await tx(a.sale.claimFor(f.addresses[2],[1]));await a.index.sync();
  const head=a.index.status().head,mintedScope={...scope,blockNumber:head.number,blockHash:head.hash},topic=a.sale.interface.getEvent('Transfer').topicHash;
  bad=new LaunchProjectIndex({...a.settings,provider:indexProvider(f.provider,{getTransactionReceipt:async hash=>{const receipt=await f.provider.getTransactionReceipt(hash);return new Proxy(receipt,{get(target,key){if(key==='logs')return target.logs.filter(l=>l.topics[0]!==topic);return Reflect.get(target,key);}});}})});
  await assert.rejects(()=>bad.nftItems(mintedScope),/PARTICIPANT_PROOF_MISMATCH/);bad.close();bad=null;
  assert.equal(await f.rpc.request({method:'evm_revert',params:[fork]}),true);await assert.rejects(()=>a.index.nftItems(mintedScope),/HISTORY_CURSOR_REORG/);
 }finally{bad?.close();a.index.close();}
}));

test('participant history pages520receipts durably with exact retry,scope and frozen-block accounting',()=>using(async f=>{
 const a=await indexFixture(f,{confirmations:3});let index=a.index;
 const subscribe=()=>tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,1,nextSubscription(),f.now().then(t=>t+300),{value:PRICE,gasLimit:500000}));
 try{
  for(let i=0;i<520;i++)await subscribe();
  for(let i=0;i<2;i++)await f.timeTo((await f.now())+1);
  let sync;do{sync=await index.sync();}while(!sync.caughtUp);
  const initial=await index.state(a.project,{wallet:f.addresses[2]});assert.equal(initial.participant,null);
  assert.ok(initial.participantHistory.totalEvents>1000);assert.equal(initial.participantHistory.complete,false);
  const scope={project:a.project,wallet:f.addresses[2]},firstCursor=initial.participantHistory.cursor;
  const first=await index.history({...scope,cursor:firstCursor,limit:25});assert.equal(first.progress.processedEvents,25);assert.equal(first.observation,null);
  assert.deepEqual(await index.history({...scope,cursor:firstCursor,limit:25}),first);
  await assert.rejects(()=>index.history({...scope,wallet:f.addresses[3],cursor:first.progress.cursor}),/HISTORY_SCOPE/);
  await assert.rejects(()=>index.history({...scope,project:f.addresses[3],cursor:first.progress.cursor}),/HISTORY_SCOPE/);
  await assert.rejects(()=>index.history({...scope,cursor:first.progress.scanId+'.100'}),/HISTORY_CURSOR_STALE/);
  await assert.rejects(()=>index.history({...scope,cursor:first.progress.cursor,limit:51}),/HISTORY_PAGE_LIMIT/);
  index.close();index=new LaunchProjectIndex(a.settings);
  assert.deepEqual(await index.history({...scope,cursor:firstCursor,limit:25}),first);
  await subscribe();for(let i=0;i<2;i++)await f.timeTo((await f.now())+1);await index.sync();const latest=await index.state(a.project,{wallet:f.addresses[2]});
  assert.ok(latest.state.blockNumber>initial.state.blockNumber);assert.notEqual(latest.participantHistory.scanId,first.progress.scanId);
  let page=first,pages=1,lastCursor;while(!page.progress.complete){const before=page.progress.processedEvents;lastCursor=page.progress.cursor;page=await index.history({...scope,cursor:lastCursor,limit:25});pages++;
   assert.equal(page.progress.blockHash,initial.state.blockHash);assert.ok(page.progress.processedEvents-before<=25);assert.ok(pages<100);}
  const proof=page.observation.participant;assert.equal(proof.subscribedUnits,'520');assert.equal(proof.activeUnits,'520');assert.equal(proof.status,'subscribing');
  assert.equal(proof.refundablePrincipalWei,'0');assert.equal(proof.receiptProofsTotal,520);assert.equal(proof.receiptProofs.length,50);assert.equal(proof.receiptPreviewTruncated,true);
  assert.equal(proof.verifiedHistory.complete,true);assert.equal(proof.verifiedHistory.eventCount,initial.participantHistory.totalEvents);assert.equal(page.observation.quoteAuthority,false);
  assert.equal(page.observation.index.confirmationsRequired,3);assert.equal(page.observation.state.base.activePrincipal,String(520n*PRICE));
  const cached=await index.state(a.project,{wallet:f.addresses[2]});assert.equal(cached.participant,null);assert.equal(cached.participantHistory.totalEvents,latest.participantHistory.totalEvents);
  const api=await createRuntimeReadServer({index,staticRoot:path.resolve(root,'../../frontend/dist')});
  try{
   const query=new URLSearchParams({address:a.project,wallet:f.addresses[2],cursor:lastCursor,limit:'25'});
   const response=await fetch(api.url+'/launch-api/history?'+query);assert.equal(response.status,200);assert.deepEqual(await response.json(),page);
   query.set('wallet',f.addresses[3]);const wrong=await fetch(api.url+'/launch-api/history?'+query);assert.equal((await wrong.json()).error,'HISTORY_SCOPE');
   const arbitrary=await fetch(api.url+'/launch-api/history?'+query+'&rpc=https://invalid.example');assert.equal((await arbitrary.json()).error,'INVALID_READ_PARAMETERS');
   const write=await fetch(api.url+'/launch-api/history',{method:'POST'});assert.equal(write.status,405);
  }finally{await api.close();}
  fs.writeFileSync(path.join(root,'evidence/participant-history-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),localOnly:true,chainId:31337,
   realSubscriptionTransactions:521,frozenSubscriptionTransactions:520,pages,eventsVerified:proof.verifiedHistory.eventCount,receiptsVerified:proof.receiptProofsTotal,
   receiptPreviewCount:proof.receiptProofs.length,restartResumed:true,retryIdempotent:true,wrongScopeRejected:true,newBlocksExcluded:true,completedObservation:page.observation,
   publicServiceDeployed:false,financialExecutionAllowed:false},null,2)+'\n');
 }finally{index.close();}
}));

test('participant history page failures leave progress unchanged and orphaned scans are discarded',()=>using(async f=>{
 const a=await indexFixture(f,{maxReorgDepth:128});let index=a.index,unavailable=false,corrupt=false;
 try{
  await index.sync();const fork=await f.rpc.request({method:'evm_snapshot',params:[]});
  for(let i=0;i<101;i++)await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,1,nextSubscription(),await f.now()+300,{value:PRICE,gasLimit:500000}));
  await index.sync();const initial=await index.state(a.project,{wallet:f.addresses[2]}),scope={project:a.project,wallet:f.addresses[2]};assert.equal(initial.participant,null);
  index.close();index=new LaunchProjectIndex({...a.settings,provider:indexProvider(f.provider,{getTransactionReceipt:async hash=>{
   if(unavailable)throw Error('LOCAL_RECEIPT_UNAVAILABLE');const receipt=await f.provider.getTransactionReceipt(hash);
   return corrupt?{hash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,status:0,logs:receipt.logs}:receipt;
  }})});
  unavailable=true;await assert.rejects(()=>index.history({...scope,cursor:initial.participantHistory.cursor}),/LOCAL_RECEIPT_UNAVAILABLE/);unavailable=false;
  corrupt=true;await assert.rejects(()=>index.history({...scope,cursor:initial.participantHistory.cursor}),/PARTICIPANT_PROOF_MISMATCH/);corrupt=false;
  const retry=await index.history({...scope,cursor:initial.participantHistory.cursor,limit:25});assert.equal(retry.progress.processedEvents,25);
  assert.deepEqual(await index.history({...scope,cursor:initial.participantHistory.cursor,limit:25}),retry);
  assert.equal(await f.rpc.request({method:'evm_revert',params:[fork]}),true);
  await assert.rejects(()=>index.history({...scope,cursor:retry.progress.cursor}),/HISTORY_CURSOR_REORG/);
  for(let i=0;i<102;i++)await f.timeTo((await f.now())+1);
  const rewound=await index.sync();assert.ok(rewound.rewoundBlocks>0);
  await assert.rejects(()=>index.history({...scope,cursor:retry.progress.cursor}),/HISTORY_SCAN_UNAVAILABLE/);
  const clean=await index.state(a.project,{wallet:f.addresses[2]});assert.equal(clean.participant.status,'no-subscription');assert.equal(clean.participant.subscribedUnits,'0');
 }finally{index.close();}
}));

test('participant history reconciles NFT refund principal and payout across receipt pages',()=>using(async f=>{
 const a=await agentFixture(f,'nft',{capacity:102n}),folder=fs.mkdtempSync(path.join(root,'evidence/nft-history-'));
 const startBlock=(await f.provider.getTransactionReceipt(a.r.registry.deploymentTransaction().hash)).blockNumber;
 const index=new LaunchProjectIndex({provider:f.provider,config:a.config,databasePath:path.join(folder,'index.sqlite'),startBlock,maxBlocksPerSync:256});
 try{
  for(let i=0;i<101;i++)await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,1,nextSubscription(),await f.now()+300,{value:PRICE,gasLimit:500000}));
  await f.timeTo(a.end);await tx(a.sale.refundFor(f.addresses[2]));await tx(a.sale.withdrawCreditFor(f.addresses[2]));await index.sync();
  const observation=await index.state(a.project,{wallet:f.addresses[2]});assert.equal(observation.participant,null);
  let result={progress:observation.participantHistory};while(!result.progress.complete)result=await index.history({project:a.project,wallet:f.addresses[2],cursor:result.progress.cursor,limit:17});
  const p=result.observation.participant;assert.equal(p.status,'refund-paid');assert.equal(p.subscribedUnits,'101');assert.equal(p.activeUnits,'0');
  assert.equal(p.refundCreditedWei,String(101n*PRICE));assert.equal(p.withdrawnBnbWei,String(101n*PRICE));assert.equal(p.availableCreditWei,'0');assert.equal(p.holdingBalance,'0');assert.equal(p.receiptProofsTotal,103);
 }finally{index.close();}
}));

test('participant history CLI follows pages in one read-only command and explicitly returns incomplete cursors',()=>using(async f=>{
 const a=await indexFixture(f),run=promisify(execFile),methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_call','eth_getLogs','eth_getBalance','eth_getTransactionReceipt']),observed=new Set();let api;
 try{
  for(let i=0;i<101;i++)await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,1,nextSubscription(),await f.now()+300,{value:PRICE,gasLimit:500000}));
  await a.index.sync();a.index.close();
  api=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024)throw Error('READ_LIMIT');}
   const input=JSON.parse(body),batch=Array.isArray(input)?input:[input],out=await Promise.all(batch.map(async item=>{observed.add(item.method);try{
    if(!methods.has(item.method))throw Error('READ_ONLY');return {jsonrpc:'2.0',id:item.id,result:await f.rpc.request({method:item.method,params:item.params??[]})};
   }catch{return {jsonrpc:'2.0',id:item.id,error:{code:-32000,message:'Local read unavailable'}};}}));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(input)?out:out[0]));
  }catch{res.writeHead(400);res.end();}});await new Promise(r=>api.listen(0,'127.0.0.1',r));
  const configFile=path.join(a.folder,'config.json');fs.writeFileSync(configFile,JSON.stringify(a.config));
  const common=['--config',configFile,'--database',a.databasePath,'--start-block',String(a.settings.startBlock),'--rpc',`http://127.0.0.1:${api.address().port}`,'--address',a.project,'--wallet',f.addresses[2]];
  const cli=async args=>JSON.parse((await run(process.execPath,['agent/echo-project-index.mjs',...args,...common],{cwd:root,timeout:40000,maxBuffer:1024*1024})).stdout);
  const partial=await cli(['state','--follow-history','--max-pages','1','--limit','25']);assert.equal(partial.participant,null);assert.equal(partial.historyFollow.complete,false);assert.equal(partial.participantHistory.processedEvents,25);
  const next=await cli(['history','--cursor',partial.historyFollow.cursor,'--limit','25']);assert.equal(next.progress.processedEvents,50);
  const complete=await cli(['state','--follow-history','--max-pages','100','--limit','50']);assert.equal(complete.historyFollow.complete,true);assert.equal(complete.historyFollow.cursor,null);
  assert.equal(complete.participant.activeUnits,'101');assert.equal(complete.participant.receiptProofsTotal,101);assert.equal(complete.financialExecutionAllowed,false);
  assert.ok([...observed].every(m=>methods.has(m)));assert.ok(![...observed].some(m=>/send|sign/i.test(m)));
  fs.writeFileSync(path.join(root,'evidence/participant-history-cli-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),localOnly:true,chainId:31337,partial,completed:complete,observedRpcMethods:[...observed],walletSigning:false,transactionBroadcast:false},null,2)+'\n');
 }finally{try{a.index.close();}catch{}if(api)await new Promise(r=>api.close(r));}
}));

test('index persists registered projects,constructor transfers and exact event amounts across restart without duplicates',()=>using(async f=>{
 const a=await indexFixture(f);let index=a.index;
 try{
  const receipt=await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,CAP,nextSubscription(),await f.now()+300,{value:CAP*PRICE}));
  const first=await index.sync();assert.equal(first.status.projects,1);assert.equal(first.status.health,'healthy');assert.equal(first.caughtUp,true);
  const project=index.projects().projects[0];assert.equal(project.address,a.project);assert.equal(project.interpreted,1);assert.equal(project.audited,false);assert.equal(project.contentVerified,false);
  const events=index.events({limit:500}).events,sub=events.find(e=>e.name==='Subscribed');assert.equal(sub.args.units,String(CAP));assert.equal(sub.args.principal,String(CAP*PRICE));assert.equal(sub.tx_hash,receipt.hash);
  const mint=events.find(e=>e.name==='Transfer'&&e.args.from===ZeroAddress);assert.equal(mint.args.value,String(1_000_000_000n*E18));assert.ok(mint.block_number<=sub.block_number);
  const counts=index.status();assert.equal((await index.sync()).indexedEvents,0);assert.equal(index.status().events,counts.events);
  index.close();index=new LaunchProjectIndex({...a.settings,provider:null});assert.deepEqual(index.status().head,counts.head);assert.equal(index.events({limit:500}).events.length,counts.events);
  assert.equal(index.status().financialExecutionAllowed,false);
  fs.writeFileSync(path.join(root,'evidence/project-index-local-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,localOnly:true,firstSync:first,
   cachedProject:project,subscription:sub,constructorTransfer:mint,restartPreservedCursor:true,noDuplicateRescan:true,financialExecutionAllowed:false},null,2)+'\n');
 }finally{index.close();}
}));

test('index honors confirmation depth and bounded catch-up pages',()=>using(async f=>{
 const a=await indexFixture(f,{confirmations:3,maxBlocksPerSync:2});
 try{
  let result=await a.index.sync();assert.equal(result.indexedBlocks,2);assert.equal(result.status.health,'syncing');assert.equal(result.caughtUp,false);
  for(let i=0;i<20&&!result.caughtUp;i++)result=await a.index.sync();assert.equal(result.caughtUp,true);
  const head=await f.provider.getBlock('latest');assert.equal(result.status.head.number,head.number-2);assert.equal(a.index.projects().projects.length,0);
  await f.timeTo((await f.now())+1);await f.timeTo((await f.now())+1);await a.index.sync();assert.equal(a.index.projects().projects.length,1);
 }finally{a.index.close();}
}));

test('index rolls back orphaned project registrations and receipts on a shallow reorg',()=>using(async f=>{
 const a=await indexFixture(f);
 try{
  await a.index.sync();const snapshot=await f.rpc.request({method:'evm_snapshot',params:[]}),id=nextSubscription();
  await tx(a.r.tokenFactory.connect(f.signers[2]).create(a.identityId,id,['Orphan','O',await f.now()+100,PRICE,1000n*PRICE,f.addresses[1]],await f.now()+300,{gasLimit:15_000_000}));
  const orphan=await a.r.tokenFactory.projectForRequest(await a.r.tokenFactory.requestKey(f.addresses[2],id));
  const receipt=await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,10,nextSubscription(),await f.now()+300,{value:10n*PRICE}));
  await a.index.sync();assert.equal(a.index.status().projects,2);assert.ok(a.index.events({limit:500}).events.some(e=>e.tx_hash===receipt.hash));
  assert.equal(await f.rpc.request({method:'evm_revert',params:[snapshot]}),true);
  await tx(a.sale.connect(f.signers[3]).subscribe(identityIdOf('agentthree'),20,nextSubscription(),await f.now()+300,{value:20n*PRICE}));await f.timeTo((await f.now())+1);
  const result=await a.index.sync();assert.equal(result.rewoundBlocks,2);assert.equal(a.index.status().projects,1);
  assert.ok(!a.index.projects().projects.some(p=>p.address===orphan));assert.ok(!a.index.events({limit:500}).events.some(e=>e.tx_hash===receipt.hash));
  assert.equal(a.index.events({limit:500}).events.find(e=>e.name==='Subscribed').args.units,'20');
 }finally{a.index.close();}
}));

test('index read failures leave the committed cursor and rows intact and a retry resumes safely',()=>using(async f=>{
 const a=await indexFixture(f);let broken=false;
 try{
  a.index.close();a.index=new LaunchProjectIndex({...a.settings,provider:indexProvider(f.provider,{getLogs:async filter=>{if(broken)throw Error('https://secret-rpc.example/token');return f.provider.getLogs(filter);}})});
  await a.index.sync();const before=a.index.status();await f.timeTo((await f.now())+1);broken=true;
  await assert.rejects(()=>a.index.sync(),/^Error: INDEX_RPC_READ_FAILED$/);assert.deepEqual(a.index.status().head,before.head);assert.equal(a.index.status().events,before.events);assert.equal(a.index.status().lastError,'INDEX_RPC_READ_FAILED');
  broken=false;assert.equal((await a.index.sync()).indexedBlocks,1);assert.equal(a.index.status().health,'healthy');
 }finally{a.index.close();}
}));

test('index refuses a deep reorg without truncating previously committed data',()=>using(async f=>{
 const a=await indexFixture(f,{maxReorgDepth:1});
 try{
  await a.index.sync();const snapshot=await f.rpc.request({method:'evm_snapshot',params:[]});
  await f.timeTo((await f.now())+1);await f.timeTo((await f.now())+1);await a.index.sync();const before=a.index.status();
  await f.rpc.request({method:'evm_revert',params:[snapshot]});await f.timeTo((await f.now())+2);await f.timeTo((await f.now())+2);
  await assert.rejects(()=>a.index.sync(),/INDEX_REORG_BEYOND_HISTORY/);assert.deepEqual(a.index.status().head,before.head);assert.equal(a.index.status().events,before.events);
 }finally{a.index.close();}
}));

test('index marks unapproved templates uninterpreted and rejects configured factory pin mismatches',()=>using(async f=>{
 const a=await indexFixture(f);a.index.close();
 const raw=new LaunchProjectIndex({...a.settings,databasePath:':memory:',config:{...a.config,approvedTemplates:[]}});
 try{await raw.sync();const p=raw.projects().projects[0];assert.equal(p.interpreted,0);assert.equal(p.asset_address,null);assert.equal(p.templateReview,'unreviewed-template');assert.ok(!raw.events().events.some(e=>e.name==='Transfer'));}finally{raw.close();}
 const config=structuredClone(a.config);config.approvedTemplates[1].factoryRuntimeHash=requestId('wrong-runtime');
 const wrong=new LaunchProjectIndex({...a.settings,config,databasePath:':memory:'});
 try{await assert.rejects(()=>wrong.sync(),/INDEX_TEMPLATE_PIN_MISMATCH/);assert.equal(wrong.status().head,null);assert.equal(wrong.status().projects,0);}finally{wrong.close();}
}));

test('index preserves unrelated databases and rejects source identity changes and overlapping sync',()=>using(async f=>{
 const a=await indexFixture(f);let release;const wait=new Promise(r=>release=r);
 try{
  const alien=path.join(a.folder,'unrelated.sqlite'),db=openTestDb(alien);db.exec('CREATE TABLE example(value TEXT); INSERT INTO example VALUES(\'keep\');');db.close();
  assert.throws(()=>new LaunchProjectIndex({...a.settings,databasePath:alien}),/INDEX_NOT_OWN_DATABASE/);const reopened=openTestDb(alien);assert.equal(reopened.prepare('SELECT value FROM example').get().value,'keep');reopened.close();
  assert.throws(()=>new LaunchProjectIndex({...a.settings,confirmations:2}),/INDEX_IDENTITY_MISMATCH/);
  a.index.close();a.index=new LaunchProjectIndex({...a.settings,provider:indexProvider(f.provider,{send:async(...args)=>{await wait;return f.provider.send(...args);}})});
  const pending=a.index.sync();await assert.rejects(()=>a.index.sync(),/INDEX_SYNC_IN_PROGRESS/);release();await pending;
  assert.throws(()=>a.index.projects({limit:101}),/INDEX_PAGE/);assert.throws(()=>a.index.events({offset:-1}),/INDEX_INTEGER/);
 }finally{release();a.index.close();}
}));

test('index rejects wrong-chain and malformed RPC logs before committing any cursor or project',()=>using(async f=>{
 const a=await indexFixture(f);a.index.close();
 const cases=[
  [{send:async(method,params)=>method==='eth_chainId'?'0x38':f.provider.send(method,params)},'WRONG_CHAIN'],
  [{getLogs:async filter=>(await f.provider.getLogs(filter)).map(log=>({...log,removed:true}))},'INDEX_NONCANONICAL_LOG'],
  [{getLogs:async filter=>(await f.provider.getLogs(filter)).map(log=>({...log,blockHash:requestId('not-canonical')}))},'INDEX_NONCANONICAL_LOG'],
  [{getLogs:async filter=>(await f.provider.getLogs(filter)).map(log=>({...log,address:f.addresses[9]}))},'INDEX_LOG_ADDRESS']
 ];
 for(const [overrides,error] of cases){const index=new LaunchProjectIndex({...a.settings,databasePath:':memory:',provider:indexProvider(f.provider,overrides)});
  try{await assert.rejects(()=>index.sync(),new RegExp(error));assert.equal(index.status().head,null);assert.equal(index.status().projects,0);assert.equal(index.status().events,0);}finally{index.close();}}
}));

test('confirmed state views bind every field to the indexed block and never become a payment quote',()=>using(async f=>{
 const a=await indexFixture(f);
 try{
  await a.index.sync();const first=await a.index.state(a.project,{wallet:f.addresses[2],handle:'agenttwo'});assert.equal(first.state.who.position.units,'0');
  await tx(a.sale.connect(f.signers[2]).subscribe(a.identityId,1000,nextSubscription(),await f.now()+300,{value:1000n*PRICE}));
  const historical=await a.index.state(a.project,{wallet:f.addresses[2],handle:'agenttwo'});assert.equal(historical.state.who.position.units,'0');assert.equal(historical.state.blockHash,first.state.blockHash);
  assert.equal((await a.client.snapshot(a.project,{wallet:f.addresses[2],handle:'agenttwo'})).who.position.units,'1000');
  await a.index.sync();const current=await a.index.state(a.project,{wallet:f.addresses[2],handle:'agenttwo'});assert.equal(current.state.who.position.units,'1000');assert.equal(current.state.base.activePrincipal,String(1000n*PRICE));
  assert.equal(current.quoteAuthority,false);assert.equal(current.executionReady,false);assert.equal(current.state.executionReady,false);assert.equal(current.state.historical,true);assert.equal(current.audited,false);
  await assert.rejects(()=>a.client.historicalSnapshot(a.project,{blockNumber:current.state.blockNumber+100}),/INVALID_OBSERVATION_BLOCK/);
  await assert.rejects(()=>a.index.state(f.addresses[9]),/INDEX_PROJECT_NOT_CONFIRMED/);
 }finally{a.index.close();}
}));

test('indexed state rejects orphaned cursors and unapproved templates before exposing project state',()=>using(async f=>{
 const a=await indexFixture(f);let raw;
 try{
  const snapshot=await f.rpc.request({method:'evm_snapshot',params:[]});await f.timeTo((await f.now())+1);await a.index.sync();
  await f.rpc.request({method:'evm_revert',params:[snapshot]});await f.timeTo((await f.now())+2);
  await assert.rejects(()=>a.index.state(a.project),/INDEX_CURSOR_REORG/);
  raw=new LaunchProjectIndex({...a.settings,databasePath:':memory:',config:{...a.config,approvedTemplates:[]}});await raw.sync();await assert.rejects(()=>raw.state(a.project),/INDEX_UNAPPROVED_TEMPLATE/);
 }finally{raw?.close();a.index.close();}
}));

test('local read service connects the browser reader to actual NFT/token state without write or arbitrary RPC routes',async()=>{
 const directory=fs.mkdtempSync(path.join(root,'evidence/runtime-read-')),rehearsal=await createLocalRuntimeRehearsal({directory});let service;
 try{
  const staticRoot=path.resolve(root,'../../frontend/dist');service=await createRuntimeReadServer({index:rehearsal.index,staticRoot});
  const front=await import(pathToFileURL(path.join(staticRoot,'launch/runtime-read.mjs'))),reader=front.createRuntimeReader({origin:service.url});
  const status=await reader.status(),projects=await reader.projects();assert.equal(status.chainId,31337);assert.equal(projects.projects.length,2);
  const before=(await rehearsal.provider.getBlock('latest')).number,observations=[];
  for(const project of projects.projects){const state=await reader.state(project.address,rehearsal.sampleWallet),events=await reader.events(project.address);
   assert.equal(state.state.base.activeUnits,project.kind===1?'1':'1000');assert.equal(state.state.phase,'open');assert.equal(state.financialExecutionAllowed,false);assert.ok(events.events.some(e=>e.name==='Subscribed'));observations.push(state);}
  assert.equal((await fetch(service.url+'/launch/')).status,200);assert.equal((await fetch(service.url+'/launch/runtime-read.mjs')).status,200);
  assert.equal((await fetch(service.url+'/launch-api/state',{method:'POST',body:'{}'})).status,405);
  assert.equal((await fetch(service.url+'/launch-api/status',{headers:{Origin:'https://external.example'}})).status,403);
  const proxy=await fetch(service.url+'/launch-api/state?address='+projects.projects[0].address+'&rpc=https://secret.example');assert.equal(proxy.status,503);assert.equal((await proxy.json()).error,'INVALID_READ_PARAMETERS');
  assert.equal((await fetch(service.url+'/.openai/hosting.json')).status,404);assert.equal((await fetch(service.url+'/launch-api/execute')).status,404);
  assert.equal((await rehearsal.provider.getBlock('latest')).number,before);reader.cancel();
  fs.writeFileSync(path.join(root,'evidence/runtime-read-local-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,localOnly:true,readOnly:true,status,observations,
   browserReaderUsed:true,actualRenderedBrowserVerified:false,postRejected:true,crossOriginRejected:true,rpcOverrideRejected:true,hiddenPathsRejected:true,noApiChainWrites:true,uploaded:false,publicDeployment:false},null,2)+'\n');
 }finally{await service?.close();await rehearsal.close();}
});

test('participant receipt proofs distinguish pending delivery, transferred holdings, refund credit, payout, early exit and mixed credit',async()=>{
 const directory=fs.mkdtempSync(path.join(root,'evidence/participant-life-')),r=await createLocalRuntimeRehearsal({directory,lifecycle:true});
 try{
  assert.equal(r.cases.length,14);const proofs={};
  for(const c of r.cases)proofs[c.key]=(await r.index.state(c.address,{wallet:r.sampleWallet})).participant;
  assert.equal(proofs['nft-claimable'].status,'claimable');assert.equal(proofs['nft-claimable'].claimableUnits,'3');
  assert.equal(proofs['nft-delivered'].status,'delivery-confirmed');assert.equal(proofs['nft-delivered'].deliveredUnits,'3');assert.equal(proofs['nft-delivered'].holdingBalance,'2');
  assert.equal(proofs['token-claimable'].claimableUnits,'1000');assert.equal(proofs['token-delivered'].deliveredUnits,'1000');assert.equal(proofs['token-delivered'].holdingBalance,String(750n*E18));
  for(const kind of ['nft','token']){
   assert.equal(proofs[kind+'-refund-available'].status,'refundable');assert.equal(proofs[kind+'-refund-available'].refundablePrincipalWei,String(PRICE*(kind==='nft'?1n:1000n)));assert.equal(proofs[kind+'-refund-available'].refundCreditedWei,'0');
   assert.equal(proofs[kind+'-refund-credit'].status,'refund-credit');assert.equal(proofs[kind+'-refund-credit'].withdrawnBnbWei,'0');assert.equal(proofs[kind+'-refund-credit'].refundPayoutAttributed,false);
   assert.equal(proofs[kind+'-refund-paid'].status,'refund-paid');assert.equal(proofs[kind+'-refund-paid'].refundPayoutAttributed,true);assert.equal(proofs[kind+'-refund-paid'].availableCreditWei,'0');
  }
  assert.equal(proofs['token-exit-credit'].status,'exit-credit');assert.equal(proofs['token-exit-credit'].exitRefundCreditedWei,String(950n*PRICE));
  const mixed=proofs['token-mixed-credit'];assert.equal(mixed.status,'mixed-credit');assert.equal(mixed.refundPayoutAttributed,false);assert.equal(mixed.withdrawnBnbWei,String(950n*PRICE));assert.equal(mixed.availableCreditWei,String(1000n*PRICE));
  const c=r.cases.find(c=>c.key==='token-mixed-credit'),sale=new Contract(c.address,artifacts.TokenLaunch.abi,await r.provider.getSigner(0));
  await tx(sale.withdrawCreditFor(r.sampleWallet,{gasLimit:300_000}));await r.index.sync();const paid=(await r.index.state(c.address,{wallet:r.sampleWallet})).participant;
  assert.equal(paid.creditScope,'mixed');assert.equal(paid.status,'refund-paid');assert.equal(paid.refundPayoutAttributed,true);
  fs.writeFileSync(path.join(root,'evidence/participant-lifecycle-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,localOnly:true,proofs,mixedFullyWithdrawn:paid,publicDeployment:false,realWalletUsed:false},null,2)+'\n');
 }finally{await r.close();}
});

test('participant proof refuses a receipt with a missing asset Transfer instead of treating Delivered alone as delivery',async()=>{
 const directory=fs.mkdtempSync(path.join(root,'evidence/participant-corrupt-')),r=await createLocalRuntimeRehearsal({directory,lifecycle:true});let bad;
 try{
  const project=r.cases.find(c=>c.key==='token-delivered').address,state=await r.index.state(project,{wallet:r.sampleWallet}),asset=state.state.extra.token;
  const provider=indexProvider(r.provider,{getTransactionReceipt:async hash=>{const receipt=await r.provider.getTransactionReceipt(hash);return new Proxy(receipt,{get(target,key){if(key==='logs')return target.logs.filter(log=>log.address.toLowerCase()!==asset.toLowerCase());return Reflect.get(target,key);}});}});
  const config=JSON.parse(fs.readFileSync(path.join(directory,'rehearsal.json'),'utf8'));bad=new LaunchProjectIndex({provider,config:config.config,databasePath:path.join(directory,'index.sqlite'),startBlock:config.startBlock,maxBlocksPerSync:256});
  await assert.rejects(()=>bad.state(project,{wallet:r.sampleWallet}),/PARTICIPANT_PROOF_MISMATCH/);
 }finally{bad?.close();await r.close();}
});

test('index CLI syncs through read-only RPC and reads its durable cache after RPC shutdown',()=>using(async f=>{
 const a=await indexFixture(f);a.index.close();const run=promisify(execFile),methods=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_call','eth_getLogs']),observed=new Set();
 const server=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req){body+=chunk;if(body.length>1024*1024)throw Error('too large');}
  const input=JSON.parse(body),batch=Array.isArray(input)?input:[input],results=await Promise.all(batch.map(async item=>{observed.add(item.method);try{if(!methods.has(item.method))throw Error('read only');return {jsonrpc:'2.0',id:item.id,result:await f.rpc.request({method:item.method,params:item.params??[]})};}catch{return {jsonrpc:'2.0',id:item.id,error:{code:-32000,message:'Local read failed'}};}}));
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(Array.isArray(input)?results:results[0]));}catch{res.writeHead(400);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let closed=false;
 try{
  const configFile=path.join(a.folder,'config.json');fs.writeFileSync(configFile,JSON.stringify(a.config));
  const common=['--config',configFile,'--database',a.databasePath,'--start-block',String(a.settings.startBlock),'--max-blocks','256'];
  const cli=async args=>JSON.parse((await run(process.execPath,['agent/echo-project-index.mjs',...args,...common],{cwd:root,timeout:20000,maxBuffer:1024*1024})).stdout);
  const result=await cli(['sync','--rpc',`http://127.0.0.1:${server.address().port}`]);assert.equal(result.status.projects,1);assert.equal(result.caughtUp,true);
  await new Promise(r=>server.close(r));closed=true;
  const projects=await cli(['projects']),events=await cli(['events','--limit','500']);assert.equal(projects.projects[0].address,a.project);assert.ok(events.events.some(e=>e.name==='Transfer'));assert.ok([...observed].every(m=>methods.has(m)));
  await assert.rejects(()=>cli(['execute']),error=>{assert.match(error.stderr,/INDEX_INVALID_COMMAND/);return true;});
 }finally{if(!closed)await new Promise(r=>server.close(r));}
}));

test('publicly recomputed quote checksums cannot replace authoritative creation or batch display details',()=>using(async f=>{
 const c=await creatorFixture(f),q=await c.client.quoteCreate(await c.input(2)),changed=structuredClone(q);changed.project=f.addresses[5];changed.quoteHash=quoteDigest(changed);
 await assert.rejects(()=>c.client.prepare(changed,consentFor(changed)),/QUOTE_DETAILS_CHANGED/);
 const a=await distributedFixture(f),batch=await a.client.quoteDistribution({project:a.project,wallet:f.addresses[0]});
 batch.deliveries[0].wallet=f.addresses[5];batch.quoteHash=quoteDigest(batch);await assert.rejects(()=>a.client.prepare(batch,consentFor(batch)),/QUOTE_DETAILS_CHANGED/);
}));

test('Agent batch delivery is permissionless, bounded and pays only original ledger recipients with exact Transfer proof',()=>using(async f=>{
 const a=await distributedFixture(f),q=await a.client.quoteDistribution({project:a.project,wallet:f.addresses[0],limit:2});
 assert.equal(q.deliveries.length,2);assert.equal(q.units,'3000');assert.equal(q.paymentWei,'0');assert.equal(q.destinationPolicy,'original-onchain-wallet-only');
 const {receipt}=await submitDistribution(f,a.client,q),proof=await a.client.verifyReceipt({project:a.project,transactionHash:receipt.hash,quote:q});
 assert.equal(proof.deliveryConfirmed,true);assert.equal(proof.confirmedDeliveryCount,2);assert.ok(proof.deliveryItems.every(p=>p.receiptConfirmed));
 const recovery=await a.client.recoverDistribution({project:a.project,keys:q.keys});assert.ok(recovery.positions.every(p=>p.delivered));assert.equal(recovery.receiptAttributionVerified,false);assert.equal(recovery.safeToResubmit,false);
 await assert.rejects(()=>a.client.quoteDistribution({project:a.project,wallet:f.addresses[0]}),/NOTHING_DUE/);
 fs.writeFileSync(path.join(root,'evidence/agent-distribution-local-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,quote:q,proof,gasUsed:String(receipt.gasUsed),realWalletUsed:false,remoteWrites:false},null,2)+'\n');
}));

test('Agent distinguishes a concurrently self-claimed position from transfers actually proven in the batch receipt',()=>using(async f=>{
 const a=await distributedFixture(f),q=await a.client.quoteDistribution({project:a.project,wallet:f.addresses[0]}),prepared=await a.client.prepare(q,consentFor(q));
 await tx(a.sale.connect(f.signers[2]).claim(a.identityId));
 await assert.rejects(()=>a.client.prepare(q,consentFor(q)),/STATE_CHANGED/);
 const receipt=await tx(f.signers[0].sendTransaction(prepared.transaction)),proof=await a.client.verifyReceipt({project:a.project,transactionHash:receipt.hash,quote:q});
 assert.equal(proof.confirmed,true);assert.equal(proof.deliveryConfirmed,false);assert.equal(proof.confirmedDeliveryCount,1);
 assert.equal(proof.deliveryItems.find(p=>p.wallet===f.addresses[2]).attribution,'not-proven-by-this-receipt');
 assert.equal(proof.deliveryItems.find(p=>p.wallet===f.addresses[3]).attribution,'this-receipt');
}));

test('Agent rejects duplicate/unknown batch keys and NFT distribution routes before signing preparation',()=>using(async f=>{
 const a=await distributedFixture(f),q=await a.client.quoteDistribution({project:a.project,wallet:f.addresses[0]});
 await assert.rejects(()=>a.client.quoteDistribution({project:a.project,wallet:f.addresses[0],keys:[q.keys[0],q.keys[0]]}),/DUPLICATE_DISTRIBUTION_KEY/);
 await assert.rejects(()=>a.client.quoteDistribution({project:a.project,wallet:f.addresses[0],keys:[requestId('unknown')]}),/UNKNOWN_DISTRIBUTION_KEY/);
 await assert.rejects(()=>a.client.quoteDistribution({project:a.project,wallet:f.addresses[0],limit:101}),/INVALID_PAGE/);
 const nft=await agentFixture(f,'nft');await assert.rejects(()=>nft.client.quoteDistribution({project:nft.project,wallet:f.addresses[0]}),/DISTRIBUTION_UNAVAILABLE/);
}));

async function nftContentFixture(){
 const folder=fs.mkdtempSync(path.join(root,'evidence/nft-chain-content-')),assetRoot=path.resolve(root,'../../frontend/dist/assets');
 const content=await buildNftContent({supply:'3',items:Array.from({length:3},(_,i)=>({tokenId:String(i+1),imageFile:'echo-sculpture-v4.webp',metadata:{name:'ECHO local proof #'+(i+1),attributes:[{trait_type:'Local test edition',value:i+1}]}}))},{assetRoot});
 const file=path.join(folder,'collection.car');fs.writeFileSync(file,content.car);return {content,file};
}
test('actual NFT content package is bound through Agent creation,subscription and sequential on-chain tokenURI delivery',()=>using(async f=>{
 const a=await creatorFixture(f),{content,file}=await nftContentFixture(),input=await a.input(1);
 input.terms.baseURI=content.baseURI;input.terms.metadataRoot=content.metadataRoot;
 const q=await a.client.quoteCreate({...input,contentCarPath:file});assert.match(q.contentStatus,/complete-local-content-package-verified/);assert.equal(q.contentReference.carSha256,content.carSha256);
 await assert.rejects(()=>a.client.prepare(q,consentFor(q)),/QUOTE_DETAILS_CHANGED/);
 const prepared=await a.client.prepare(q,consentFor(q),{contentCarPath:file}),created=await tx(f.signers[2].sendTransaction(prepared.transaction));
 const createdProof=await a.client.verifyReceipt({project:q.project,transactionHash:created.hash,quote:q});assert.equal(createdProof.creationConfirmed,true);
 await f.timeTo(Number(input.terms.startsAt));const sub=await a.client.quoteSubscription({project:q.project,wallet:f.addresses[2],handle:'agenttwo',units:3,contentCarPath:file});
 assert.equal(sub.contentReference.metadataRoot,content.metadataRoot);const subPrepared=await a.client.prepare(sub,consentFor(sub),{contentCarPath:file});
 const subscribed=await tx(f.signers[2].sendTransaction(subPrepared.transaction)),s=new Contract(q.project,artifacts.NftLaunch.abi,f.signers[0]);
 assert.equal((await a.client.verifyReceipt({project:q.project,transactionHash:subscribed.hash,quote:sub})).subscriptionConfirmed,true);
 await tx(s.finalize());fs.renameSync(file,file+'.offline'); // old mature delivery does not depend on content retrieval
 const claim=await a.client.quoteAction({project:q.project,wallet:f.addresses[2],handle:'agenttwo',action:'claim',ids:['1','2','3']}),delivered=await localSubmit(f,a.client,claim);
 assert.equal((await a.client.verifyReceipt({project:q.project,transactionHash:delivered.receipt.hash,quote:claim})).deliveryConfirmed,true);
 for(let id=1;id<=3;id++)assert.equal(await s.tokenURI(id),content.baseURI+id+'.json');assert.equal(await s.metadataRoot(),content.metadataRoot);
 fs.writeFileSync(path.join(root,'evidence/nft-content-chain-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,rootCid:content.rootCid,metadataRoot:content.metadataRoot,supply:3,
  project:q.project,created:created.hash,subscribed:subscribed.hash,delivered:delivered.receipt.hash,allUrisMatch:true,contentRetrievalDoesNotGateMatureClaims:true,publicPinning:false,uploaded:false},null,2)+'\n');
}));

test('a mismatching content commitment or modified CAR prevents NFT creation preparation',()=>using(async f=>{
 const a=await creatorFixture(f),{content,file}=await nftContentFixture(),input=await a.input(1);input.terms.baseURI=content.baseURI;input.terms.metadataRoot=requestId('wrong-content-root');
 await assert.rejects(()=>a.client.quoteCreate({...input,contentCarPath:file}),/CONTENT_MANIFEST/);
 input.terms.metadataRoot=content.metadataRoot;const q=await a.client.quoteCreate({...input,contentCarPath:file});
 const bytes=Buffer.from(content.car);bytes[bytes.length-10]^=1;fs.writeFileSync(file,bytes);
 await assert.rejects(()=>a.client.prepare(q,consentFor(q),{contentCarPath:file}),/CONTENT_BLOCK_HASH/);
 assert.equal(await a.r.registry.projectCount(),0n);
}));
