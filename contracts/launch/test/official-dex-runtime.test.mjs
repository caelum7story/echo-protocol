import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,Contract,ContractFactory,ZeroAddress,keccak256,toUtf8Bytes} from 'ethers';
import {createLocalChain} from './local-chain.mjs';
import {root} from '../scripts/compile.mjs';

// This executes exact public mainnet runtime bytes in an isolated chain31337 with EMPTY
// DEX storage, not a historical-state fork. All accounts and transactions are synthetic.
const capture=JSON.parse(fs.readFileSync(path.join(root,'references/pancake-v2/deployed-runtime.json'),'utf8'));
const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
const legacy=JSON.parse(fs.readFileSync(path.join(root,'evidence/baseline-agent41/TokenLaunch.json'),'utf8'));
const PRICE=10_000_000_000n,UNITS=1_000_000n,E18=10n**18n,DAY=86400;
const tx=async promise=>(await promise).wait();
const reverted=async fn=>assert.rejects(fn,e=>e.code==='CALL_EXCEPTION');
const measurements=[];
// Match the Agent's existing130% local gas buffer. A mined block can update cumulative
// prices when the estimate's timestamp did not, so an unbuffered estimate is not a cap.
async function buffered(method,args,overrides={}){
 const estimate=await method.estimateGas(...args,overrides),gasLimit=(estimate*130n+99n)/100n;
 const receipt=await tx(method(...args,{...overrides,gasLimit}));
 measurements.push({operation:'buffered-local-call',estimateGas:String(estimate),gasLimit:String(gasLimit),usedGas:String(receipt.gasUsed)});
 return receipt;
}
async function using(fn){
 assert.equal(capture.chainId,56);assert.equal(capture.readOnly,true);
 for(const c of Object.values(capture.codes))assert.equal(keccak256(c.code),c.runtimeHash);
 const chain=await createLocalChain({runtimeCodes:['factory','router','wbnb'].map(role=>capture.codes[role])});
 const provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all(Array.from({length:6},(_,i)=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const factory=new Contract(capture.codes.factory.address,['function allPairsLength() view returns(uint256)','function feeTo() view returns(address)'],signers[0]);
 const router=new Contract(capture.codes.router.address,[...artifact('IV2Router').abi,
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable',
  'function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns(uint256,uint256,uint256)'],signers[0]);
 const wbnb=new Contract(capture.codes.wbnb.address,[...artifact('IWBNB').abi,'function withdraw(uint256)'],signers[0]);
 const now=async()=>Number((await chain.provider.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
 const timeTo=async time=>{await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[time]});await chain.provider.request({method:'evm_mine',params:[]});};
 const deploy=async(a,args)=>{const c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:20_000_000});await c.waitForDeployment();return c;};
 const identity=await deploy(artifact('MockIdentity'),[]);await tx(identity.setOwner(2,addresses[2]));
 assert.equal(await factory.allPairsLength(),0n);assert.equal(await factory.feeTo(),ZeroAddress);
 async function sale({old=false}={}){
  const start=(await now())+100,base=[identity.target,addresses[0],addresses[0],addresses[1],start,PRICE,555_555_555n,keccak256(toUtf8Bytes('isolated-runtime-test'))];
  const s=await deploy(old?legacy:artifact('TokenLaunch'),[base,PRICE*UNITS,'Launch','RUNTIME',factory.target,router.target,wbnb.target,1800,7200]);
  const token=new Contract(await s.token(),artifact('LaunchToken').abi,signers[0]);
  const pair=new Contract(await token.pair(),[...artifact('IV2Pair').abi,'function sync()','function skim(address)','function burn(address) returns(uint256,uint256)'],signers[0]);
  assert.equal(keccak256(await provider.getCode(pair.target)),capture.codes.pair.runtimeHash,'Factory-created pair must match independently observed mainnet pair runtime');
  await timeTo(start);await tx(s.connect(signers[2]).subscribe(2,UNITS,keccak256(toUtf8Bytes('one-request')),await now()+300,{value:PRICE*UNITS}));
  return {s,token,pair,start,end:start+7*DAY};
 }
 const f={provider,rpc:chain.provider,signers,addresses,factory,router,wbnb,now,timeTo,sale};
 try{await fn(f);}finally{provider.destroy();await chain.close();}
}
async function assertSettlement(f,c,donation){
 const receipt=await tx(c.s.finalizePool()),raised=PRICE*UNITS,contribution=raised*80n/100n;
 assert.equal(await c.s.poolCreated(),true);assert.equal(await c.s.externalPoolWbnb(),donation);
 assert.equal(await c.s.liquidityBnb(),contribution);assert.equal(await c.s.liquidityTokens(),contribution*E18/PRICE);
 assert.equal(await c.s.bnbCredit(f.addresses[1]),raised*15n/100n);assert.equal(await c.s.bnbCredit(f.addresses[0]),raised*5n/100n);
 assert.equal(await f.provider.getBalance(c.s.target),raised-contribution);
 assert.equal(await f.wbnb.balanceOf(c.pair.target),contribution+donation);
 const reserves=await c.pair.getReserves(),tokenFirst=(await c.pair.token0())===c.token.target;
 assert.equal(tokenFirst?reserves[0]:reserves[1],contribution*E18/PRICE);assert.equal(tokenFirst?reserves[1]:reserves[0],contribution+donation);
 assert.ok(await c.pair.totalSupply()>1000n);assert.equal(await c.pair.balanceOf(ZeroAddress),await c.pair.totalSupply());
 assert.equal(await c.pair.balanceOf(c.s.target),0n);assert.equal(await c.pair.balanceOf(f.addresses[0]),0n);assert.equal(await c.pair.balanceOf(f.addresses[1]),0n);
 await reverted(()=>c.pair.burn.staticCall(f.addresses[0])); // no withdrawable LP is held at the pair
 assert.equal(await c.token.balanceOf(c.s.target),UNITS*E18);assert.equal(await c.token.collectedTax(),0n);
 assert.equal(await c.token.totalSupply()+await c.s.burnedTokens(),1_000_000_000n*E18);
 await tx(c.s.connect(f.signers[2]).claim(2));assert.equal(await c.token.balanceOf(f.addresses[2]),UNITS*E18);
 assert.equal(await c.token.balanceOf(c.s.target),0n);
 measurements.push({donationWei:String(donation),finalizeGas:String(receipt.gasUsed),pairRuntimeHash:capture.codes.pair.runtimeHash,allLpIrrecoverable:true,participantAllocationUnchanged:true});
}

test('actual deployed V2 runtime reproduces legacy one-wei denial and preserves full timeout refund',{timeout:120000},()=>using(async f=>{
 const c=await f.sale({old:true});await tx(f.wbnb.deposit({value:1n}));await tx(f.wbnb.transfer(c.pair.target,1));await tx(c.pair.sync());
 await f.timeTo(c.end);await reverted(()=>c.s.finalizePool.staticCall());assert.equal(await c.s.settled(),false);assert.equal(await c.s.totalBnbCredit(),0n);
 await f.timeTo(c.end+2*DAY);await tx(c.s.refundFor(2,f.addresses[2]));assert.equal(await c.s.bnbCredit(f.addresses[2]),PRICE*UNITS);
 await tx(c.s.withdrawCreditFor(f.addresses[2]));assert.equal(await f.provider.getBalance(c.s.target),0n);
}));

for(const [name,donation,sync] of [['empty',0n,false],['unsynced-one-wei',1n,false],['synced-one-wei',1n,true],['synced-large-donation',E18,true]]){
 test('actual deployed V2 runtime settles '+name+' without changing participant accounting',{timeout:120000},()=>using(async f=>{
  const c=await f.sale();
  if(donation){await tx(f.wbnb.deposit({value:donation}));await tx(f.wbnb.transfer(c.pair.target,donation));if(sync)await tx(c.pair.sync());}
  await reverted(()=>c.pair.mint.staticCall(f.addresses[4])); // no public token supply can create attacker LP before genesis
  await f.timeTo(c.end);await assertSettlement(f,c,donation);
 }));
}

test('actual router executes zero-tax buys,2% sells and bounded tax conversion to real native credits',{timeout:120000},()=>using(async f=>{
 const c=await f.sale();await f.timeTo(c.end);await assertSettlement(f,c,0n);
 const buy=10n**15n,expectedBuy=(await f.router.getAmountsOut(buy,[f.wbnb.target,c.token.target]))[1];
 const buyReceipt=await buffered(f.router.connect(f.signers[4]).swapExactETHForTokensSupportingFeeOnTransferTokens,[expectedBuy,[f.wbnb.target,c.token.target],f.addresses[4],await f.now()+300],{value:buy});
 assert.equal(await c.token.balanceOf(f.addresses[4]),expectedBuy);assert.equal(await c.token.collectedTax(),0n);
 const amount=1000n*E18,tax=amount*2n/100n,expectedSell=(await f.router.getAmountsOut(amount-tax,[c.token.target,f.wbnb.target]))[1];
 await tx(c.token.connect(f.signers[4]).approve(f.router.target,amount));
 const bnbBefore=await f.provider.getBalance(f.addresses[3]);
 const sellReceipt=await buffered(f.router.connect(f.signers[4]).swapExactTokensForETHSupportingFeeOnTransferTokens,[amount,expectedSell,[c.token.target,f.wbnb.target],f.addresses[3],await f.now()+300]);
 assert.equal(await f.provider.getBalance(f.addresses[3])-bnbBefore,expectedSell);assert.equal(await c.token.collectedTax(),tax);
 await f.timeTo(await f.now()+1800);await tx(c.token.updateOracle());const minimum=await c.token.conversionQuote(tax);
 const conversion=await buffered(c.token.convertTax,[tax,await f.now()+300]);
 const creator=await c.token.taxBnbCredit(f.addresses[1]),platform=await c.token.taxBnbCredit(f.addresses[0]),total=creator+platform;
 assert.ok(total>=minimum);assert.equal(await f.provider.getBalance(c.token.target),total);assert.equal(creator,total/2n);assert.equal(platform,total-creator);
 assert.equal(await c.token.collectedTax(),0n);assert.equal(await c.token.allowance(c.token.target,f.router.target),0n);
 const recipientBefore=await f.provider.getBalance(f.addresses[1]);await tx(c.token.withdrawTaxFor(f.addresses[1]));assert.equal(await f.provider.getBalance(f.addresses[1])-recipientBefore,creator);
 measurements.push({buyGas:String(buyReceipt.gasUsed),sellGas:String(sellReceipt.gasUsed),conversionGas:String(conversion.gasUsed),taxTokens:String(tax),taxBnb:String(total),routerRuntimeHash:capture.codes.router.runtimeHash});
}));

test('actual router later-liquidity deposits take2%, while ordinary transfers and genesis LP remain unchanged',{timeout:120000},()=>using(async f=>{
 const c=await f.sale();await f.timeTo(c.end);await assertSettlement(f,c,0n);
 const originalLockedLp=await c.pair.balanceOf(ZeroAddress),amount=100n*E18,bnb=amount*await c.s.liquidityBnb()/await c.s.liquidityTokens();
 await tx(c.token.connect(f.signers[2]).approve(f.router.target,amount));
 const receipt=await buffered(f.router.connect(f.signers[2]).addLiquidityETH,[c.token.target,amount,0,0,f.addresses[2],await f.now()+300],{value:bnb});
 assert.equal(await c.token.collectedTax(),amount*2n/100n);assert.ok(await c.pair.balanceOf(f.addresses[2])>0n);
 assert.equal(await c.pair.balanceOf(ZeroAddress),originalLockedLp);
 const priorTax=await c.token.collectedTax();await tx(c.token.connect(f.signers[2]).transfer(f.addresses[3],3n*E18));
 assert.equal(await c.token.balanceOf(f.addresses[3]),3n*E18);assert.equal(await c.token.collectedTax(),priorTax);
 measurements.push({laterLiquidityGas:String(receipt.gasUsed),taxedIncomingPair:true,originalLpUnchanged:true});
}));

test('actual pair price shock and stale observation stop tax conversion without stopping ordinary transfers',{timeout:120000},()=>using(async f=>{
 const c=await f.sale();await f.timeTo(c.end);await assertSettlement(f,c,0n);
 await tx(c.token.connect(f.signers[2]).transfer(c.pair.target,1000n*E18));await tx(c.pair.sync());
 await f.timeTo(await f.now()+1800);await tx(c.token.updateOracle());const tax=await c.token.collectedTax();
 assert.ok(await c.token.conversionQuote(tax)>0n);
 await tx(f.wbnb.deposit({value:await c.s.liquidityBnb()}));await tx(f.wbnb.transfer(c.pair.target,await c.s.liquidityBnb()));await tx(c.pair.sync());
 await reverted(()=>c.token.conversionQuote(tax));
 await tx(c.token.connect(f.signers[2]).transfer(f.addresses[3],E18));assert.equal(await c.token.balanceOf(f.addresses[3]),E18);
 await f.timeTo(await f.now()+7201);await reverted(()=>c.token.conversionQuote(tax));await tx(c.token.updateOracle());
 assert.equal(await c.token.averagePriceX112(),0n);await reverted(()=>c.token.conversionQuote(tax));
 assert.equal(await c.token.collectedTax(),tax);
}));

test.after(()=>{
 fs.writeFileSync(path.join(root,'evidence/official-dex-runtime-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),chainId:31337,sourceBlock:capture.blockNumber,
  sourceBlockHash:capture.blockHash,measurements,realWalletUsed:false,remoteWrites:false,storage:'Fresh empty DEX storage, feeTo zero, synthetic balances',
  limitations:'Exact deployed V2 factory/router/WBNB/pair runtime execution on isolated local state. Not a historical-state mainnet fork, testnet rehearsal, measured production gas guarantee or independent audit.'},null,2)+'\n');
});
