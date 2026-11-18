import test from'node:test';import assert from'node:assert/strict';import {MaxUint256,Interface}from'ethers';import{fixture,E,mined,artifacts}from'./helpers.mjs';import{prepareMint}from'../integration/client.mjs';
const consent=async(f,shares,overrides={})=>({chainId:1337,launch:f.launch.target,wallet:f.al,identityId:1,shares,referrerId:0,expiresAt:await f.now()+300,pricingVersion:Number(await f.launch.pricingVersion()),maxMintWei:E('.002').toString(),maxGasWei:E('.1').toString(),autoPaid:true,...overrides});
test('Agent automatic paid fallback needs wallet-bound, identity-bound, quantity-bound, time- and gas-capped consent; never broadcasts',async t=>{
 const f=await fixture(t);await f.issue();await f.mint();const args={provider:f.p,launchAddress:f.launch.target,wallet:f.al,identityId:1,shares:1,expectedChainId:1337};
 await assert.rejects(prepareMint(args));const c=await consent(f,1);const r=await prepareMint({...args,consent:c});assert.equal(r.broadcast,false);assert.equal(BigInt(r.request.value),E('.002'));assert.equal(await f.launch.mintedById(1),1n);
 for(const changes of[{maxMintWei:'1'},{expiresAt:await f.now()-1},{wallet:f.ba},{identityId:2},{shares:2},{referrerId:99},{chainId:56},{pricingVersion:0},{maxGasWei:'1'},{autoPaid:false,approvedQuoteHash:'0x'+'00'.repeat(32)}])await assert.rejects(prepareMint({...args,consent:{...c,...changes}}));
 const p=Array.from(await f.launch.pricing());p[0]=E('.001');await mined(f.launch.setPricing(p));await assert.rejects(prepareMint({...args,consent:c}));
});

test('free-to-paid exhaustion race: no silent debit; Agent may re-quote under previously approved ceiling',async t=>{
 const f=await fixture(t);await mined(f.identity.issueBatch(f.al,1,1002,{gasLimit:40000000}));
 for(let id=1;id<=999;id++)await f.fastMint(f.alice,id,1);
 const qA=await f.launch.quote(f.al,1000,1,0),qB=await f.launch.quote(f.al,1001,1,0);assert.equal(qA.free,1n);assert.equal(qB.free,1n);await f.mint(f.alice,1000);
 assert.equal(await f.launch.freeClaimed(),1000n);const stale={identityId:1001,shares:1,referrerId:0,quoteHash:qB.stateHash,maxCost:0,deadline:await f.now()+300};await assert.rejects(async()=>{await(await f.launch.connect(f.alice).mint(stale,{gasLimit:2000000,value:0})).wait();});
 assert.equal(await f.launch.mintedById(1001),0n);const args={provider:f.p,launchAddress:f.launch.target,wallet:f.al,identityId:1001,shares:1,expectedChainId:1337};await assert.rejects(prepareMint(args));
 const c=await consent(f,1,{identityId:1001});const prepared=await prepareMint({...args,consent:c});assert.equal(prepared.summary.freeShares,0);assert.equal(prepared.summary.costWei,E('.002').toString());await(await f.alice.sendTransaction(prepared.request)).wait();assert.equal(await f.launch.mintedById(1001),1n);assert.equal(await f.launch.freeClaimed(),1000n);assert.equal(await f.launch.totalPaid(),1n);
});

test('paid Mint then immediate own-pool sale has no gross profit for sizes 1..10 after normal sell tax',async t=>{
 const f=await fixture(t);await f.open();await f.issue(f.bob,1);await f.mint(f.bob,1);await f.issue(f.admin,2);await f.mint(f.admin,2,1,1);await f.advance(1500);await mined(f.oracle.update());const recipient=await f.signers[6].getAddress();
 let snap=await f.g.request({method:'evm_snapshot',params:[]});
 for(let qty=1;qty<=10;qty++){
  const q=await f.launch.quote(f.ba,1,qty,0);const before=await f.p.getBalance(recipient);await f.mint(f.bob,1,qty);await f.sell(f.bob,E(String(qty*1000)),recipient);const proceeds=await f.p.getBalance(recipient)-before;assert(proceeds<q.cost,`size ${qty}: ${proceeds} vs ${q.cost}`);await f.g.request({method:'evm_revert',params:[snap]});snap=await f.g.request({method:'evm_snapshot',params:[]});
 }
});
