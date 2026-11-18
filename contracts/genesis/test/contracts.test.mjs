import test from 'node:test';import assert from 'node:assert/strict';import {ContractFactory,Contract,keccak256,ZeroAddress,MaxUint256}from'ethers';
import {fixture,artifacts,E,mined}from'./helpers.mjs';
const fails=async promise=>assert.rejects(async()=>{const r=await promise;if(r?.wait)await r.wait();});
const params=async(f,who,id,shares=1,referrerId=0)=>{const q=await f.launch.quote(await who.getAddress(),id,shares,referrerId);return{q,m:{identityId:id,shares,referrerId,quoteHash:q.stateHash,maxCost:q.cost,deadline:await f.now()+300}};};
const events=(f,r,name)=>r.logs.flatMap(l=>{try{const e=f.launch.interface.parseLog(l);return e?.name===name?[e]:[];}catch{return[];}});

test('fixed 21.25M supply, direct reward reserve, initially disabled constructor and immutable tax ABI',async t=>{
 const f=await fixture(t);assert.equal(await f.token.totalSupply(),E('21250000'));assert.equal(await f.token.balanceOf(f.ra),E('4250000'));assert.equal(await f.token.balanceOf(f.launch.target),E('17000000'));
 assert.equal(await f.token.controller(),f.launch.target);assert.equal(await f.launch.RESCUE_DELAY(),86400n);assert.equal(await f.token.OPENING_TAX_SECONDS(),1800n);
 assert(!artifacts.EchoToken.abi.some(x=>x.type==='function'&&/^(set|mint|upgrade|transferOwnership)/i.test(x.name)));assert(!artifacts.EchoLaunch.abi.some(x=>x.type==='function'&&/tax.*(set|rate)|(set|rate).*tax/i.test(x.name)));
 const other=await f.deploy('EchoLaunch',[f.config]);assert.equal(await other.mintEnabled(),false);await fails(other.quote(f.al,1,1,0));
 await fails(f.deploy('EchoLaunch',[{...f.config,treasury:ZeroAddress}]));await fails(f.deploy('EchoLaunch',[{...f.config,rewards:ZeroAddress}]));await fails(f.deploy('EchoLaunch',[{...f.config,rescueVault:ZeroAddress}]));await fails(f.deploy('EchoLaunch',[{...f.config,identityCodeHash:'0x'+'00'.repeat(32)}]));
});

test('one free + nine paid: immediate 10,000 tokens, exact 70/30 direct native payment and no end time',async t=>{
 const f=await fixture(t);await f.issue();const before=await f.p.getBalance(f.pa);const receipt=await f.mint(f.alice,1,10);const e=events(f,receipt,'Minted')[0];
 assert.equal(e.args.cost,E('.018'));assert.equal(e.args.freeShares,1n);assert.equal(await f.token.balanceOf(f.al),E('10000'));assert.equal(await f.p.getBalance(f.pa)-before,E('.0054'));
 assert.equal(await f.launch.pendingLiquidityBnb(),E('.0126'));assert.equal(await f.launch.pendingLiquidityTokens(),E('6300'));assert.equal(await f.launch.freeClaimed(),1n);
 await mined(f.token.connect(f.alice).transfer(f.ba,E('100')));assert.equal(await f.token.balanceOf(f.ba),E('100'));assert.equal(await f.token.balanceOf(f.token.target),0n);
 await f.advance(366*86400);await f.issue(f.bob,2);await f.mint(f.bob,2);assert.equal(await f.token.balanceOf(f.ba),E('1100'));
});

test('exact BNB, bounded maxCost, deadline, wrong owner, cross-deployment and stale pricing all fail closed',async t=>{
 const f=await fixture(t);await f.issue();await f.mint();const {q,m}=await params(f,f.alice,1);
 await fails(f.launch.connect(f.bob).mint(m,{value:q.cost}));await fails(f.launch.connect(f.alice).mint(m,{value:q.cost-1n}));await fails(f.launch.connect(f.alice).mint(m,{value:q.cost+1n}));
 await fails(f.launch.connect(f.alice).mint({...m,maxCost:q.cost-1n},{value:q.cost}));await fails(f.launch.connect(f.alice).mint({...m,deadline:await f.now()-1},{value:q.cost}));await fails(f.launch.connect(f.alice).mint({...m,deadline:await f.now()+3600},{value:q.cost}));
 await fails(f.launch.setPricing([3571428571429n,10000,1500,E('.01')+1n,900]));
 const p=Array.from(await f.launch.pricing());p[0]=E('.003');await fails(f.launch.connect(f.alice).setPricing(p));await mined(f.launch.setPricing(p));await fails(f.launch.connect(f.alice).mint(m,{value:q.cost}));
 const fresh=await f.launch.quote(f.al,1,1,0);assert.equal(fresh.cost,E('.003'));await f.mint();assert.equal(await f.launch.mintedById(1),2n);
 const other=await f.deploy('EchoLaunch',[f.config]);await mined(other.setMintEnabled(true));await fails(other.connect(f.alice).mint(m,{value:q.cost}));
 await fails(f.launch.setPricing([0,10000,1500,E('.1'),900]));await fails(f.launch.setPricing([E('.002'),9999,1500,E('.1'),900]));
});

test('stable official identity quotas survive ownership transfer, and first-free cannot be replayed',async t=>{
 const f=await fixture(t);await f.issue();await f.mint(f.alice,1,10);await mined(f.identity.connect(f.alice).transfer(1,f.ba));await fails(f.launch.quote(f.al,1,1,0));await fails(f.launch.quote(f.ba,1,1,0));
 assert.equal(await f.launch.mintedById(1),10n);await f.issue(f.bob,2);await f.mint(f.bob,2);assert.equal((await f.launch.quote(f.ba,2,1,0)).free,0n);assert.equal((await f.launch.quote(f.ba,2,1,0)).cost,E('.002'));
});

test('distinct invited first mints unlock one paid quota; self, replay and changed attribution rejected',async t=>{
 const f=await fixture(t);await f.issue();await f.issue(f.bob,2);await f.issue(f.alice,3);await f.mint(f.alice,1,10);
 await fails(f.launch.quote(f.al,3,1,1));await fails(f.launch.quote(f.ba,2,1,2));await f.mint(f.bob,2,1,1);assert.equal(await f.launch.successfulInvites(1),1n);
 await f.mint(f.bob,2,1,1);assert.equal(await f.launch.successfulInvites(1),1n);await fails(f.launch.quote(f.ba,2,1,0));
 assert.equal((await f.launch.quote(f.al,1,1,0)).free,0n);await f.mint(f.alice,1);assert.equal(await f.launch.mintedById(1),11n);await fails(f.launch.quote(f.al,1,1,0));
});

test('owner early opening requires funded liquidity, burns all project LP and gates pool trades beforehand',async t=>{
 const f=await fixture(t);await f.issue();await f.mint();await fails(f.launch.openEarly());await fails(f.launch.connect(f.alice).openEarly());
 await fails(f.token.connect(f.alice).transfer(f.pair.target,1));await f.mint(f.alice,1,9);await fails(f.launch.openEarly());await mined(f.launch.setPricing([E('.002'),10000,1500,E('.01'),900]));await mined(f.launch.openEarly());assert.equal(await f.launch.opened(),true);assert.equal(await f.token.openedAt(),BigInt(await f.now()));
 assert.equal(await f.pair.balanceOf(f.aa),0n);assert.equal(await f.pair.balanceOf(f.launch.target),0n);assert.equal(await f.pair.balanceOf(await f.launch.DEAD()),await f.pair.totalSupply());assert.equal(await f.launch.pendingLiquidityBnb(),0n);
 await fails(f.launch.openEarly());await fails(f.launch.quote(f.al,1,1,0));
});

test('market-linked mint waits for TWAP, follows max(spot,TWAP), and rejects stale or divergent data',async t=>{
 const f=await fixture(t);await mined(f.identity.issueBatch(f.al,100,10));for(let i=100;i<110;i++)await f.mint(f.alice,i,10);await mined(f.launch.openEarly());await f.issue(f.bob,3);await f.mint(f.bob,3);
 await fails(f.launch.quote(f.ba,3,1,0));const opened=Number(await f.token.openedAt());await f.setNextTimestamp(opened+299);await mined(f.oracle.update({gasLimit:200000}));await fails(f.launch.quote(f.ba,3,1,0));await f.setNextTimestamp(opened+300);await mined(f.oracle.update({gasLimit:200000}));
 const r=await f.oracle.read();const q=await f.launch.quote(f.ba,3,1,0);assert(q.unitPrice>=r.spot*1000n&&q.unitPrice>=r.twap*1000n);await f.mint(f.bob,3);assert.equal(await f.token.balanceOf(f.ba),E('2000'));
 await f.advance(901);await fails(f.launch.quote(f.ba,3,1,0));await mined(f.oracle.update());await f.buy(f.bob,E('.02'),f.ba);await fails(f.launch.quote(f.ba,3,1,0));
});

test('actual V2 buy/sell swaps apply fixed 1%, 30% opening sell and exact 1800-second transition to 2%',async t=>{
 const f=await fixture(t);await f.open();const path=[f.w.target,f.token.target];let gross=(await f.router.getAmountsOut(E('.0001'),path))[1];let before=await f.token.balanceOf(f.ba);let taxes=await f.token.balanceOf(f.token.target);
 await f.buy(f.bob,E('.0001'),f.ba);assert.equal(await f.token.balanceOf(f.ba)-before,gross-gross/100n);assert.equal(await f.token.balanceOf(f.token.target)-taxes,gross/100n);
 taxes=await f.token.balanceOf(f.token.target);await f.sell(f.alice,E('100'));assert.equal(await f.token.balanceOf(f.token.target)-taxes,E('30'));
 const opened=Number(await f.token.openedAt());await f.advance(opened+1799-await f.now());assert.equal(await f.token.currentSellTaxBps(),3000n);await f.advance(1);assert.equal(await f.token.currentSellTaxBps(),200n);
 taxes=await f.token.balanceOf(f.token.target);await f.sell(f.alice,E('100'));assert.equal(await f.token.balanceOf(f.token.target)-taxes,E('2'));
 const b=await f.token.balanceOf(f.token.target);await mined(f.token.connect(f.alice).transfer(f.ba,E('100')));assert.equal(await f.token.balanceOf(f.token.target),b);
});

test('independent tax processing sends BNB directly, caps batch/price impact and cannot be called through token privileges',async t=>{
 const f=await fixture(t);await f.open();await f.sell(f.alice,E('1000'));const bal=await f.token.balanceOf(f.token.target);const [amount,minOut]=await f.launch.taxQuote(MaxUint256);assert(amount<=bal);assert(minOut>0n);
 const before=await f.p.getBalance(f.pa);await mined(f.launch.connect(f.bob).processTaxes(MaxUint256,minOut,await f.now()+300,{gasLimit:800000}));assert((await f.p.getBalance(f.pa))>before);assert.equal(await f.token.balanceOf(f.token.target),bal-amount);
 await fails(f.token.connect(f.bob).swapTax(f.router.target,f.ba,1,1,await f.now()+30));await fails(f.launch.processAutomaticTaxes(await f.now()+30));await fails(f.token.connect(f.bob).burnLiquidityReserve(1));await fails(f.token.openTrading());
 await fails(f.launch.processTaxes(1,MaxUint256,await f.now()+30));
});

test('automatic tax conversion is outside swap hooks; failure is deferred without freezing wallet transfers or paid mint',async t=>{
 const f=await fixture(t);await f.open();await f.sell(f.alice,E('1000'));await mined(f.router.setFail(true));await f.issue(f.bob,5);await f.mint(f.bob,5);
 const receipt=await f.mint(f.bob,5);assert.equal(events(f,receipt,'TaxProcessingDeferred').length,1);assert.equal(await f.launch.mintedById(5),2n);await mined(f.token.connect(f.alice).transfer(f.ba,E('1')));
 await mined(f.router.setFail(false));await mined(f.launch.processTaxes(MaxUint256,1,await f.now()+300,{gasLimit:800000}));
});

test('failed immediate treasury receipt atomically rolls back paid mint, identity count, free claims and supply',async t=>{
 const f=await fixture(t,{rejectTreasury:true});await f.issue();await fails(f.mint(f.alice,1,10));assert.equal(await f.launch.totalMinted(),0n);assert.equal(await f.launch.freeClaimed(),0n);assert.equal(await f.token.balanceOf(f.al),0n);assert.equal(await f.launch.pendingLiquidityBnb(),0n);
 await f.mint();assert.equal(await f.token.balanceOf(f.al),E('1000'));await fails(f.mint());assert.equal(await f.launch.mintedById(1),1n);
});

test('24-hour rescue: pause, one queue, no early execution, no automatic execution, cancellation and fixed vault',async t=>{
 const f=await fixture(t);const asset=await f.deploy('MockAsset');await mined(asset.mint(f.launch.target,100));await fails(f.launch.queueRescue(asset.target,1));await fails(f.launch.connect(f.alice).setPaused(true));await mined(f.launch.setPaused(true));await mined(f.launch.queueRescue(asset.target,20));
 await fails(f.launch.queueRescue(asset.target,1));await fails(f.launch.setPaused(false));await fails(f.launch.executeRescue());await f.advance(86399);await fails(f.launch.executeRescue());await f.advance(1);
 assert.equal(await asset.balanceOf(f.va),0n);await fails(f.launch.connect(f.alice).executeRescue());await mined(f.launch.executeRescue());assert.equal(await asset.balanceOf(f.va),20n);assert.equal((await f.launch.rescue()).eta,0n);await fails(f.launch.executeRescue());
 await mined(f.launch.queueRescue(asset.target,1));await mined(f.launch.cancelRescue());await mined(f.launch.setPaused(false));assert.equal(await f.launch.rescueVault(),f.va);
});

test('LP rescue forbidden; project-token rescue retires mint, but native BNB rescue retains original non-retiring semantics',async t=>{
 const f=await fixture(t);await f.issue();await f.mint(f.alice,1,10);await mined(f.launch.setPaused(true));await mined(f.launch.queueRescue(ZeroAddress,E('.001')));await f.advance(86400);const before=await f.p.getBalance(f.va);await mined(f.launch.executeRescue());assert.equal(await f.p.getBalance(f.va)-before,E('.001'));assert.equal(await f.launch.retired(),false);assert.equal(await f.launch.pendingLiquidityBnb(),E('.0116'));
 await mined(f.launch.queueRescue(f.pair.target,1));await f.advance(86400);await fails(f.launch.executeRescue());await mined(f.launch.cancelRescue());await mined(f.launch.queueRescue(f.token.target,1));await f.advance(86400);await mined(f.launch.executeRescue());assert.equal(await f.launch.retired(),true);assert.equal(await f.launch.closed(),true);await fails(f.launch.setPaused(false));await fails(f.launch.setMintEnabled(true));
});

test('two-step ownership preserves fixed recipients and renouncement is disabled',async t=>{
 const f=await fixture(t);await fails(f.launch.renounceOwnership());await mined(f.launch.transferOwnership(f.ba));assert.equal(await f.launch.owner(),f.aa);await fails(f.launch.connect(f.alice).acceptOwnership());await mined(f.launch.connect(f.bob).acceptOwnership());assert.equal(await f.launch.owner(),f.ba);assert.equal(await f.launch.treasury(),f.pa);assert.equal(await f.launch.rewardVault(),f.ra);assert.equal(await f.launch.rescueVault(),f.va);await fails(f.launch.setPaused(true));
});

test('full production-contract issuance: 10,000 shares, automatic 5,000-share opening, no boundary crossing, final reserve burn',async t=>{
 const f=await fixture(t);await mined(f.identity.issueBatch(f.al,1000,1001,{gasLimit:40000000}));
 for(let i=0;i<1000;i++){
  const id=1000+i;
  if(i===499){await f.fastMint(f.alice,id,9);await fails(f.launch.quote(f.al,id,2,0));await f.fastMint(f.alice,id,1);assert.equal(await f.launch.opened(),true);assert.equal(await f.launch.totalMinted(),5000n);assert.equal(await f.launch.freeClaimed(),500n);await f.advance(300);await mined(f.oracle.update());}
  else await f.fastMint(f.alice,id,10);
  if(i%100===99)console.log('issuance progress',i+1,'/ 1000 identities');
 }
 assert.equal(await f.launch.totalMinted(),10000n);assert.equal(await f.launch.totalPaid(),9000n);assert.equal(await f.launch.freeClaimed(),1000n);assert.equal(await f.launch.closed(),true);assert.equal(await f.token.totalSupply(),E('20550000'));assert.equal(await f.token.balanceOf(f.launch.target),0n);assert.equal(await f.token.balanceOf(f.al),E('10000000'));assert.equal(await f.token.balanceOf(f.ra),E('4250000'));assert.equal(await f.token.balanceOf(f.pair.target),E('6300000'));
 assert.equal(await f.pair.balanceOf(f.launch.target),0n);await fails(f.launch.quote(f.al,2000,1,0));
});
