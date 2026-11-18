import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,Contract,ContractFactory,Interface,id,keccak256,toUtf8Bytes} from 'ethers';
import {createLocalChain} from './local-chain.mjs';
const root=path.resolve(import.meta.dirname,'..'),E18=10n**18n,PRICE=10n**10n,PUBLIC=555555555n,DAY=86400,observations=[];
const fixtureArtifacts=JSON.parse(fs.readFileSync(path.join(root,'evidence/recipient-adversarial-fixtures.json'),'utf8')).contracts;
const artifact=name=>fixtureArtifacts[name]??JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
let sequence=0;const request=()=>keccak256(toUtf8Bytes('LOCAL-ADVERSARIAL-'+(++sequence))),guardError=id('ReentrancyGuardReentrantCall()').slice(0,10);
async function using(fn){
 const chain=await createLocalChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all([0,1,2,3,4].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress())),transactions=[],failed=[],donations=[];
 const tx=async promise=>{const r=await(await promise).wait();assert.equal(r.status,1);transactions.push({hash:r.hash,status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash,gasUsed:String(r.gasUsed),kind:'call'});return r;};
 const deploy=async(name,args=[],value=0n)=>{const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{value,gasLimit:15000000});await c.waitForDeployment();const receipt=await c.deploymentTransaction().wait();assert.equal(receipt.status,1);transactions.push({hash:receipt.hash,status:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:String(receipt.gasUsed),kind:'deployment',contract:name,address:receipt.contractAddress});return c;};
 async function failedTx(fn,expected){
  let caught;try{await tx(fn());}catch(e){caught=e;}assert.ok(caught,'Must observe an actual failed local transaction');
  const raw=caught.error??caught.info?.error,data=typeof caught.data==='string'?caught.data:typeof raw?.data==='string'?raw.data:raw?.data?.data;
  const hash=caught.receipt?.hash??raw?.data?.transactionHash;assert.match(hash??'',/^0x[0-9a-fA-F]{64}$/);const receipt=await chain.provider.request({method:'eth_getTransactionReceipt',params:[hash]});assert.equal(receipt.status,'0x0');
  let decoded;for(const name of ['NftLaunch','LaunchToken','TokenLaunch'])try{decoded=new Interface(artifact(name).abi).parseError(data);if(decoded)break;}catch{}
  if(expected)assert.equal(decoded?.name,expected,'Must identify the specific revert');
  failed.push({hash,status:receipt.status,blockNumber:Number(BigInt(receipt.blockNumber)),blockHash:receipt.blockHash,error:decoded?.name??'untyped-revert',gasUsed:String(BigInt(receipt.gasUsed))});return decoded;
 }
 const identity=await deploy('MockIdentity'),wbnb=await deploy('MockWBNB'),factory=await deploy('MockFactory'),router=await deploy('MockRouter',[factory.target,wbnb.target]);for(const i of [2,3])await tx(identity.setOwner(i,addresses[i]));
 const now=async()=>Number((await chain.provider.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
 const timeTo=async t=>{await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[t]});await chain.provider.request({method:'evm_mine',params:[]});};
 const sale=async(kind,{creator=addresses[1],platform=addresses[0],capacity=3n,minimum=100n*PRICE}={})=>{
  const start=await now()+100,base=[identity.target,addresses[0],platform,creator,start,PRICE,kind==='token'?PUBLIC:capacity,request()],s=kind==='token'?await deploy('TokenLaunch',[base,minimum,'Local adversarial token','LOCAL',factory.target,router.target,wbnb.target,1800,7200]):await deploy('NftLaunch',[base,'Local adversarial NFT','LOCAL','ipfs://local-adversarial-only/',request()]);
  return {s,start,end:start+7*DAY,token:kind==='token'?new Contract(await s.token(),artifact('LaunchToken').abi,signers[0]):null};
 };
 const subscribe=async(s,i,units)=>tx(s.connect(signers[i]).subscribe(i,units,request(),await now()+300,{value:units*PRICE,gasLimit:500000}));
 const subscribeActor=async(s,actor,identityId,units)=>{await tx(identity.setOwner(identityId,actor.target));return tx(actor.invoke(s.target,s.interface.encodeFunctionData('subscribe',[identityId,units,request(),await now()+300]),{value:units*PRICE,gasLimit:700000}));};
 const force=async(target,amount)=>{const before=await provider.getBalance(target),actor=await deploy('ForceNative',[target],amount),after=await provider.getBalance(target);assert.equal(after-before,amount);assert.equal(await provider.getCode(actor.target),'0x');donations.push({recipient:target,amountWei:String(amount),beforeWei:String(before),afterWei:String(after),transactionHash:actor.deploymentTransaction().hash,actorRemoved:true});};
 try{await fn({chain,provider,signers,addresses,transactions,failed,donations,tx,deploy,failedTx,identity,wbnb,factory,router,now,timeTo,sale,subscribe,subscribeActor,force});}finally{provider.destroy();await chain.close();}
}
const finish=(f,caseId,data)=>observations.push({caseId,...data,transactions:f.transactions,failedTransactions:f.failed,forcedDonations:f.donations});

test('NFT success credits survive rejected BNB and cross-recipient reentry without blocking other payouts',{timeout:120000},()=>using(async f=>{
 const actor=await f.deploy('CallbackRecipient'),{s,start}=await f.sale('nft',{creator:actor.target,capacity:2n});await f.force(s.target,37n);await f.timeTo(start);await f.subscribe(s,2,2n);await f.tx(s.finalize());
 const principal=2n*PRICE,creator=principal-principal/10n,platform=principal/10n;assert.equal(await s.activePrincipal(),principal);assert.equal(await s.totalBnbCredit(),principal);
 await f.tx(actor.configure(1,0,0,s.target,'0x'));await f.failedTx(()=>s.withdrawCreditFor(actor.target,{gasLimit:500000}),'NativeTransferFailed');assert.equal(await s.bnbCredit(actor.target),creator);assert.equal(await s.totalBnbCredit(),principal);assert.equal(await actor.receivedBnb(),0n);
 const payload=s.interface.encodeFunctionData('withdrawCreditFor',[f.addresses[0]]);await f.tx(actor.configure(2,0,0,s.target,payload));await f.tx(s.withdrawCreditFor(actor.target,{gasLimit:700000}));assert.equal(await actor.receivedBnb(),creator);assert.equal(await actor.reentryFailures(),1n);assert.equal(await actor.lastError(),guardError);assert.equal(await s.bnbCredit(f.addresses[0]),platform);
 const before=await f.provider.getBalance(f.addresses[0]);await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[0]));assert.equal(await f.provider.getBalance(f.addresses[0])-before,platform);await f.failedTx(()=>s.withdrawCreditFor(actor.target,{gasLimit:300000}),'NothingDue');
 assert.equal(await s.totalBnbCredit(),0n);assert.equal(await f.provider.getBalance(s.target),37n);await f.tx(s.claimFor(f.addresses[2],[1,2]));assert.equal(await s.balanceOf(f.addresses[2]),2n);
 finish(f,'nft-success-rejected-and-cross-entry-credit',{principalWei:String(principal),forcedSurplusWei:'37',remainingBalanceWei:'37',reentryGuardVerified:true,otherRecipientPaid:true,delivered:2});
}));

test('forced BNB cannot satisfy the token minimum or reduce refund rights of a rejecting original wallet',{timeout:120000},()=>using(async f=>{
 const actor=await f.deploy('CallbackRecipient'),{s,start,end}=await f.sale('token',{minimum:1000n*PRICE}),donation=10000n*PRICE;
 await f.timeTo(start);await f.subscribeActor(s,actor,7,100n);await f.subscribe(s,2,50n);await f.force(s.target,donation);assert.equal(await s.activePrincipal(),150n*PRICE);assert.ok(await f.provider.getBalance(s.target)>await s.minimumRaise());await f.timeTo(end);
 await f.failedTx(()=>s.finalizePool({gasLimit:3500000}),'Unavailable');assert.equal(await s.poolCreated(),false);await f.tx(s.refundFor(7,actor.target));await f.tx(s.refundFor(2,f.addresses[2]));assert.equal(await s.bnbCredit(f.addresses[0]),0n);
 await f.tx(actor.configure(1,0,0,s.target,'0x'));await f.failedTx(()=>s.withdrawCreditFor(actor.target,{gasLimit:500000}),'NativeTransferFailed');assert.equal(await s.bnbCredit(actor.target),100n*PRICE);
 const before=await f.provider.getBalance(f.addresses[2]);await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[2]));assert.equal(await f.provider.getBalance(f.addresses[2])-before,50n*PRICE);
 await f.tx(actor.configure(2,0,0,s.target,s.interface.encodeFunctionData('refundFor',[7,actor.target])));await f.tx(s.withdrawCreditFor(actor.target,{gasLimit:700000}));assert.equal(await actor.receivedBnb(),100n*PRICE);assert.equal(await actor.lastError(),guardError);assert.equal(await s.totalBnbCredit(),0n);assert.equal(await f.provider.getBalance(s.target),donation);
 finish(f,'token-failure-forced-bnb-and-refund',{principalWei:String(150n*PRICE),forcedSurplusWei:String(donation),remainingBalanceWei:String(donation),minimumNotSatisfiedByBalance:true,fullRefundsPaid:true,reentryGuardVerified:true});
}));

test('rejected malformed and gas-griefing NFT callbacks roll back a full batch while independent holders can claim',{timeout:120000},()=>using(async f=>{
 const actor=await f.deploy('CallbackRecipient'),{s,start}=await f.sale('nft',{capacity:3n});await f.timeTo(start);await f.subscribeActor(s,actor,7,2n);await f.subscribe(s,2,1n);await f.tx(s.finalize());
 for(const mode of [1,2,4]){
  await f.tx(actor.configure(0,mode,2,s.target,'0x'));await f.failedTx(()=>s.claimFor(actor.target,[1,2],{gasLimit:700000}),mode===1?'Error':'ERC721InvalidReceiver');
  assert.equal(await s.deliveredCount(),0n);assert.equal(await s.balanceOf(actor.target),0n);assert.equal(await actor.nftCallbacks(),0n);await assert.rejects(()=>s.ownerOf(1),e=>e.code==='CALL_EXCEPTION');
 }
 await f.tx(s.claimFor(f.addresses[2],[3]));assert.equal(await s.ownerOf(3),f.addresses[2]);
 await f.tx(actor.configure(0,3,0,s.target,s.interface.encodeFunctionData('claimFor',[actor.target,[1]])));await f.tx(s.claimFor(actor.target,[1,2],{gasLimit:1000000}));assert.equal(await s.deliveredCount(),3n);assert.equal(await actor.nftCallbacks(),2n);assert.equal(await actor.reentryFailures(),2n);assert.equal(await actor.lastError(),guardError);
 await f.failedTx(()=>s.claimFor(actor.target,[1,2],{gasLimit:700000}),'Unauthorized');assert.equal(await s.deliveredCount(),3n);
 finish(f,'nft-callback-batch-atomicity',{rejectionModes:3,partialBatchRolledBack:true,otherHolderClaimed:true,reentryGuardVerified:true,delivered:3});
}));

test('token batch delivery does not invoke a recipient native or NFT callback and is not blocked by rejected creator proceeds',{timeout:120000},()=>using(async f=>{
 const actor=await f.deploy('CallbackRecipient'),{s,start,end,token}=await f.sale('token',{creator:actor.target});await f.tx(actor.configure(1,1,0,s.target,'0x'));await f.timeTo(start);await f.subscribeActor(s,actor,7,1000000n);await f.subscribe(s,2,1000000n);await f.force(s.target,53n);await f.timeTo(end);await f.tx(s.finalizePool({gasLimit:3500000}));
 const principal=2000000n*PRICE,L=principal*80n/100n,C=principal*15n/100n,P=principal-L-C;assert.equal(await s.liquidityBnb(),L);assert.equal(await s.bnbCredit(actor.target),C);assert.equal(await s.bnbCredit(f.addresses[0]),P);assert.equal(await f.provider.getBalance(s.target),C+P+53n);
 const a=await s.positionKey(7,actor.target),b=await s.positionKey(2,f.addresses[2]);await f.tx(s.distribute([a,a,b],{gasLimit:1000000}));await f.tx(s.distribute([a,b]));assert.equal(await token.balanceOf(actor.target),1000000n*E18);assert.equal(await token.balanceOf(f.addresses[2]),1000000n*E18);assert.equal(await actor.nftCallbacks(),0n);assert.equal(await actor.receivedBnb(),0n);
 await f.failedTx(()=>s.withdrawCreditFor(actor.target,{gasLimit:500000}),'NativeTransferFailed');await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[0]));assert.equal(await s.bnbCredit(actor.target),C);assert.equal(await s.totalBnbCredit(),C);assert.equal(await token.totalSupply()+await s.burnedTokens(),1000000000n*E18);
 finish(f,'token-callback-free-batch-delivery',{principalWei:String(principal),liquidityWei:String(L),forcedSurplusWei:'53',outstandingCreatorCreditWei:String(C),duplicateDeliveryPrevented:true,otherRecipientPaid:true,tokenCallbacksInvoked:0});
}));

test('gas-griefing or propagated callback failure preserves an early-exit credit and cannot consume another refund',{timeout:120000},()=>using(async f=>{
 const actor=await f.deploy('CallbackRecipient'),{s,start}=await f.sale('token');await f.timeTo(start);await f.subscribeActor(s,actor,7,100n);await f.subscribe(s,2,200n);
 const key=await s.positionKey(7,actor.target);await f.tx(actor.invoke(s.target,s.interface.encodeFunctionData('exitAll',[7,(await s.positions(key)).revision,await f.now()+300]),{gasLimit:700000}));
 const refund=95n*PRICE;assert.equal(await s.bnbCredit(actor.target),refund);assert.equal(await s.activePrincipal(),200n*PRICE);
 for(const mode of [4,3]){await f.tx(actor.configure(mode,0,0,s.target,s.interface.encodeFunctionData('withdrawCreditFor',[actor.target])));await f.failedTx(()=>s.withdrawCreditFor(actor.target,{gasLimit:700000}),'NativeTransferFailed');assert.equal(await s.bnbCredit(actor.target),refund);assert.equal(await actor.receivedBnb(),0n);assert.equal(await s.activePrincipal(),200n*PRICE);}
 const p=await s.positions(await s.positionKey(2,f.addresses[2]));await f.tx(s.connect(f.signers[2]).exitAll(2,p.revision,await f.now()+300));await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[2]));assert.equal(await s.bnbCredit(actor.target),refund);
 await f.tx(actor.configure(2,0,0,s.target,s.interface.encodeFunctionData('withdrawCreditFor',[actor.target])));await f.tx(s.withdrawCreditFor(actor.target,{gasLimit:700000}));assert.equal(await actor.receivedBnb(),refund);assert.equal(await actor.lastError(),guardError);await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[0]));assert.equal(await s.totalBnbCredit(),0n);assert.equal(await f.provider.getBalance(s.target),0n);
 finish(f,'token-exit-gas-grief-and-recovery',{rejectionModes:2,creditPreserved:true,otherRecipientPaid:true,reentryGuardVerified:true,finalEscrowWei:'0'});
}));

test('forced token-contract BNB is excluded from tax conversion and rejecting tax recipients cannot block their peer',{timeout:120000},()=>using(async f=>{
 const actor=await f.deploy('CallbackRecipient'),{s,start,end,token}=await f.sale('token',{creator:actor.target});await f.timeTo(start);await f.subscribe(s,2,1000000n);await f.timeTo(end);await f.tx(s.finalizePool({gasLimit:3500000}));await f.tx(s.distribute([await s.positionKey(2,f.addresses[2])]));
 await f.failedTx(()=>f.signers[2].sendTransaction({to:token.target,value:1n,gasLimit:100000}),'Forbidden');await f.force(token.target,41n);
 await f.tx(token.connect(f.signers[2]).transfer(await token.pair(),10000n*E18));const pair=new Contract(await token.pair(),artifact('MockPair').abi,f.signers[0]);await f.tx(pair.sync({gasLimit:200000}));await f.timeTo(await f.now()+1801);await f.tx(token.updateOracle());
 const minimum=await token.conversionQuote(100n*E18),receipt=await f.tx(token.convertTax(100n*E18,await f.now()+300,{gasLimit:1500000}));const event=receipt.logs.map(log=>{try{return token.interface.parseLog(log);}catch{return null;}}).find(x=>x?.name==='TaxConverted');assert.ok(event);const received=event.args.bnb;assert.ok(received>=minimum);assert.equal(await token.totalTaxBnbCredit(),received);assert.equal(await f.provider.getBalance(token.target),received+41n);
 const creator=received/2n,platform=received-creator;assert.equal(await token.taxBnbCredit(actor.target),creator);assert.equal(await token.taxBnbCredit(f.addresses[0]),platform);assert.equal(await token.allowance(token.target,f.router.target),0n);
 await f.tx(actor.configure(1,0,0,token.target,'0x'));await f.failedTx(()=>token.withdrawTaxFor(actor.target,{gasLimit:500000}),'TransferFailed');assert.equal(await token.taxBnbCredit(actor.target),creator);await f.tx(token.connect(f.signers[4]).withdrawTaxFor(f.addresses[0]));assert.equal(await token.totalTaxBnbCredit(),creator);
 await f.tx(actor.configure(2,0,0,token.target,token.interface.encodeFunctionData('convertTax',[1,await f.now()+300])));await f.tx(token.withdrawTaxFor(actor.target,{gasLimit:700000}));assert.equal(await actor.receivedBnb(),creator);assert.equal(await actor.lastError(),guardError);assert.equal(await token.totalTaxBnbCredit(),0n);assert.equal(await f.provider.getBalance(token.target),41n);
 finish(f,'tax-forced-bnb-and-isolated-recipient-credit',{forcedSurplusWei:'41',convertedBnbWei:String(received),minimumBnbWei:String(minimum),remainingBalanceWei:'41',donationExcludedFromTaxCredit:true,otherRecipientPaid:true,reentryGuardVerified:true});
}));
test.after(()=>fs.writeFileSync(path.join(root,'evidence/recipient-adversarial-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),environment:'isolated-EVM31337;synthetic-actors;mock-identity-and-DEX',observations,realWalletUsed:false,remoteWrites:false,independentSecurityReview:false},null,2)+'\n'));
