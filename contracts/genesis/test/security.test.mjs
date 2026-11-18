import test from'node:test';import assert from'node:assert/strict';import solc from'solc';import{ContractFactory,getCreateAddress}from'ethers';import{fixture,E,mined,artifacts}from'./helpers.mjs';
test('treasury callback cannot re-enter Mint to claim another free identity',async t=>{
 const f=await fixture(t);const launch=await f.deploy('EchoLaunch',[{...f.config,treasury:f.receiver.target}]);await mined(launch.setMintEnabled(true));await f.issue(f.alice,1);await f.issue(f.receiver.target,99);
 const q=await launch.quote(f.receiver.target,99,1,0);const m={identityId:99,shares:1,referrerId:0,quoteHash:q.stateHash,maxCost:0,deadline:await f.now()+300};await mined(f.receiver.setAttack(launch.target,launch.interface.encodeFunctionData('mint',[m])));
 const main=await launch.quote(f.al,1,10,0);await mined(launch.connect(f.alice).mint({identityId:1,shares:10,referrerId:0,quoteHash:main.stateHash,maxCost:main.cost,deadline:await f.now()+300},{value:main.cost,gasLimit:2000000}));assert.equal(await f.receiver.attempted(),true);assert.equal(await f.receiver.reentered(),false);assert.equal(await launch.mintedById(99),0n);assert.equal(await launch.totalMinted(),10n);assert.equal(await launch.freeClaimed(),1n);
});
test('smart Agent wallet owning official identity can Mint and receive tokens directly without tx.origin assumptions',async t=>{
 const f=await fixture(t);const source='pragma solidity 0.8.24;contract LocalWallet{address immutable owner=msg.sender;receive()external payable{}function execute(address t,bytes calldata d,uint v)external{require(msg.sender==owner);(bool ok,bytes memory r)=t.call{value:v}(d);if(!ok)assembly{revert(add(r,32),mload(r))}}}';const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'W.sol':{content:source}},settings:{outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));const a=out.contracts['W.sol'].LocalWallet;const w=await new ContractFactory(a.abi,'0x'+a.evm.bytecode.object,f.admin).deploy();await w.waitForDeployment();await mined(f.admin.sendTransaction({to:w.target,value:E('1')}));await f.issue(w.target,7);
 const q=await f.launch.quote(w.target,7,10,0);const m={identityId:7,shares:10,referrerId:0,quoteHash:q.stateHash,maxCost:q.cost,deadline:await f.now()+300};await mined(w.execute(f.launch.target,f.launch.interface.encodeFunctionData('mint',[m]),q.cost,{gasLimit:2000000}));assert.equal(await f.token.balanceOf(w.target),E('10000'));assert.equal(await f.launch.mintedById(7),10n);
});
test('oracle downtime longer than an hour forces a new observation window before paid Mint resumes',async t=>{
 const f=await fixture(t);await f.open();await f.issue(f.bob,1);await f.mint(f.bob,1);await f.advance(3601);await mined(f.oracle.update());assert.equal(await f.oracle.twapWeiPerToken(),0n);await assert.rejects(f.launch.quote(f.ba,1,1,0));await f.advance(300);await mined(f.oracle.update());assert((await f.launch.quote(f.ba,1,1,0)).cost>0n);
});

test('Agent client refuses a wrong chain or missing/mismatched verified mainnet runtime before preparing payment',async()=>{
 const{prepareMint}=await import('../integration/client.mjs');const args={launchAddress:'0x0000000000000000000000000000000000000001',wallet:'0x0000000000000000000000000000000000000002',identityId:1,shares:1};
 await assert.rejects(prepareMint({...args,provider:{send:async()=> '0x1'}}),/Wrong chain/);
 await assert.rejects(prepareMint({...args,provider:{send:async()=> '0x38',getCode:async()=> '0x1234'}}),/Unverified launch runtime/);
 await assert.rejects(prepareMint({...args,expectedRuntimeHash:'0x'+'00'.repeat(32),provider:{send:async()=> '0x38',getCode:async()=> '0x1234'}}),/Unverified launch runtime/);
});

test('independent participants may use concurrent fixed-price quotes; same-identity replay still fails',async t=>{
 const f=await fixture(t);await f.issue(f.alice,1);await f.issue(f.bob,2);const qa=await f.launch.quote(f.al,1,2,0),qb=await f.launch.quote(f.ba,2,2,0);const deadline=await f.now()+300;
 await mined(f.launch.connect(f.alice).mint({identityId:1,shares:2,referrerId:0,quoteHash:qa.stateHash,maxCost:qa.cost,deadline},{value:qa.cost,gasLimit:2000000}));
 await mined(f.launch.connect(f.bob).mint({identityId:2,shares:2,referrerId:0,quoteHash:qb.stateHash,maxCost:qb.cost,deadline},{value:qb.cost,gasLimit:2000000}));assert.equal(await f.launch.totalMinted(),4n);assert.equal(await f.launch.freeClaimed(),2n);
 await assert.rejects(async()=>{await(await f.launch.connect(f.bob).mint({identityId:2,shares:2,referrerId:0,quoteHash:qb.stateHash,maxCost:qb.cost,deadline},{value:qb.cost,gasLimit:2000000})).wait();});
});


test('canonical pre-created pair cannot deny deployment or acquire project LP',async t=>{
 const f=await fixture(t);const nonce=await f.p.getTransactionCount(f.aa,'pending');const parent=getCreateAddress({from:f.aa,nonce});const predictedToken=getCreateAddress({from:parent,nonce:1});await mined(f.factory.connect(f.bob).createPair(predictedToken,f.w.target));const existing=await f.factory.getPair(predictedToken,f.w.target);
 const launch=await f.deploy('EchoLaunch',[f.config]);assert.equal(launch.target.toLowerCase(),parent.toLowerCase());assert.equal((await launch.token()).toLowerCase(),predictedToken.toLowerCase());assert.equal((await launch.pair()).toLowerCase(),existing.toLowerCase());
});
