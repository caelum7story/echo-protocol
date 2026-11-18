import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BrowserProvider,Contract,ContractFactory,ZeroAddress,keccak256,toUtf8Bytes,toQuantity} from 'ethers';
import {root,compile} from './compile.mjs';
import {createHistoricalFork} from '../test/historical-fork.mjs';
const capture=JSON.parse(fs.readFileSync(path.join(root,'references/pancake-v2/deployed-runtime.json'),'utf8')),compiled=compile();
const hash=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),read=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
const files=['test/historical-fork.mjs','scripts/test-historical-dex.mjs','scripts/compile.mjs','references/pancake-v2/deployed-runtime.json','package-lock.json','artifacts/compile-report.json',...['TokenLaunch','LaunchToken','MockIdentity','IV2Router','IV2Pair','IWBNB'].map(name=>'artifacts/'+name+'.json')];
const inputHashes={...Object.fromEntries(Object.entries(compiled.sourceHashes).map(([f,d])=>[f.startsWith('@')?'node_modules/'+f:f,d])),...Object.fromEntries(files.map(f=>[f,hash(f)]))};
for(const [f,digest]of Object.entries(inputHashes))assert.equal(hash(f),digest,'Compile current source first');
let fork,provider;const checks={},transactions=[];
try{
 fork=await createHistoricalFork();provider=new BrowserProvider(fork.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 assert.equal(Number((await provider.getNetwork()).chainId),31337);
 const signers=await Promise.all([0,1,2,3].map(n=>provider.getSigner(n))),wallets=await Promise.all(signers.map(s=>s.getAddress()));
 const now=async()=>Number((await fork.provider.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
 const timeTo=async timestamp=>{await fork.provider.request({method:'evm_setNextBlockTimestamp',params:[timestamp]});await fork.provider.request({method:'evm_mine',params:[]});};
 async function tx(label,p){const r=await(await p).wait();assert.equal(r.status,1);transactions.push({label,hash:r.hash,blockNumber:r.blockNumber,gasUsed:String(r.gasUsed)});return r;}
 async function call(label,method,args=[],value=0n){const estimate=await method.estimateGas(...args,{value}),gasLimit=(estimate*160n+99n)/100n;return tx(label,method(...args,{value,gasLimit}));}
 async function deploy(name,args=[]){const a=read(name),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:15000000});await c.waitForDeployment();await tx('deploy-'+name,Promise.resolve(c.deploymentTransaction()));return c;}
 const factory=new Contract(capture.codes.factory.address,['function allPairsLength() view returns(uint256)','function feeTo() view returns(address)'],signers[0]);
 const router=new Contract(capture.codes.router.address,[...read('IV2Router').abi,'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable','function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns(uint256,uint256,uint256)'],signers[2]);
 const remoteValue=async(method)=>{const result=await fork.readRemote('eth_call',[{to:factory.target,data:factory.interface.encodeFunctionData(method)},toQuantity(fork.anchor.number)]);return factory.interface.decodeFunctionResult(method,result)[0];};
 const originalPairs=await factory.allPairsLength(),feeTo=await factory.feeTo();assert.equal(originalPairs,await remoteValue('allPairsLength'));assert.ok(originalPairs>0n);assert.equal(feeTo,await remoteValue('feeTo'));assert.notEqual(feeTo,ZeroAddress);
 for(const role of ['factory','router','wbnb','pair'])assert.equal(keccak256(await provider.getCode(capture.codes[role].address)),capture.codes[role].runtimeHash);
 const existing=new Contract(capture.codes.pair.address,read('IV2Pair').abi,signers[0]),remoteReserves=await fork.readRemote('eth_call',[{to:existing.target,data:existing.interface.encodeFunctionData('getReserves')},toQuantity(fork.anchor.number)]);
 const existingReserves=await existing.getReserves();assert.equal(existing.interface.encodeFunctionResult('getReserves',existingReserves),remoteReserves);checks.inheritedExistingStorage=true;checks.actualNonzeroFeeTo=feeTo;
 const observedStorage={factoryPairs:String(originalPairs),feeTo,existingPair:existing.target,existingPairReserves:[...existingReserves].map(String)};
 const identity=await deploy('MockIdentity');await tx('local-identity',identity.setOwner(2,wallets[2]));
 const start=await now()+100,price=10000000000n,units=1000000n,E18=10n**18n;
 const sale=await deploy('TokenLaunch',[[identity.target,wallets[0],wallets[0],wallets[1],start,price,555555555n,keccak256(toUtf8Bytes('LOCAL HISTORICAL FORK ONLY'))],price*units,'Historical local launch','FORK',factory.target,router.target,capture.codes.wbnb.address,1800,7200]);
 const token=new Contract(await sale.token(),read('LaunchToken').abi,signers[2]),pair=new Contract(await token.pair(),[...read('IV2Pair').abi,'function kLast() view returns(uint256)'],signers[2]);
 assert.equal(await factory.allPairsLength(),originalPairs+1n);assert.equal(keccak256(await provider.getCode(pair.target)),capture.codes.pair.runtimeHash);
 await timeTo(start);await call('subscribe',sale.connect(signers[2]).subscribe,[2,units,keccak256(toUtf8Bytes('FORK-REQUEST')),await now()+300],price*units);await timeTo(start+7*86400);
 await call('finalize-pool',sale.finalizePool);assert.equal(await sale.poolCreated(),true);assert.equal(await sale.liquidityBnb(),price*units*80n/100n);assert.equal(await sale.bnbCredit(wallets[1]),price*units*15n/100n);assert.equal(await sale.bnbCredit(wallets[0]),price*units*5n/100n);
 assert.equal(await pair.balanceOf(ZeroAddress),await pair.totalSupply());assert.ok(await pair.kLast()>0n);checks.initialLpIrrecoverable=true;checks.successAccountingUnchanged=true;
 await call('claim',sale.connect(signers[2]).claim,[2]);assert.equal(await token.balanceOf(wallets[2]),units*E18);
 await call('router-buy',router.swapExactETHForTokensSupportingFeeOnTransferTokens,[0,[capture.codes.wbnb.address,token.target],wallets[2],await now()+300],100000000000000n);assert.equal(await token.collectedTax(),0n);
 await call('approve-router',token.approve,[router.target,1000000n*E18]);
 await call('router-sell',router.swapExactTokensForETHSupportingFeeOnTransferTokens,[1000n*E18,0,[token.target,capture.codes.wbnb.address],wallets[2],await now()+300]);assert.equal(await token.collectedTax(),20n*E18);checks.actualRouterBuy0Sell2=true;
 const beforeFee=await pair.balanceOf(feeTo);await call('add-taxed-liquidity',router.addLiquidityETH,[token.target,1000n*E18,0,0,wallets[2],await now()+300],10000000000000n);assert.ok(await pair.balanceOf(feeTo)>beforeFee);assert.ok(await token.collectedTax()>20n*E18);checks.actualProtocolFeeLpMint=true;
 await timeTo(await now()+1800);await call('update-oracle',token.updateOracle);const tax=await token.collectedTax();assert.ok(await token.conversionQuote(tax)>0n);await call('convert-tax',token.convertTax,[tax,await now()+300]);assert.equal(await token.collectedTax(),0n);checks.taxConversionWithFeeOn=true;
 const secondStart=await now()+100;
 const second=await deploy('TokenLaunch',[[identity.target,wallets[0],wallets[0],wallets[1],secondStart,price,555555555n,keccak256(toUtf8Bytes('LOCAL HISTORICAL DONATION CASE'))],price*units,'Historical donation case','FORKD',factory.target,router.target,capture.codes.wbnb.address,1800,7200]);
 const secondToken=new Contract(await second.token(),read('LaunchToken').abi,signers[2]),secondPair=new Contract(await secondToken.pair(),[...read('IV2Pair').abi,'function sync()'],signers[2]);
 assert.equal(keccak256(await provider.getCode(secondPair.target)),capture.codes.pair.runtimeHash);
 const wbnb=new Contract(capture.codes.wbnb.address,read('IWBNB').abi,signers[2]);
 await call('donate-one-wei-deposit',wbnb.deposit,[],1n);await call('donate-one-wei-transfer',wbnb.transfer,[secondPair.target,1n]);await call('sync-one-wei-donation',secondPair.sync);
 await timeTo(secondStart);await call('subscribe-donation-case',second.connect(signers[2]).subscribe,[2,units,keccak256(toUtf8Bytes('FORK-DONATION-REQUEST')),await now()+300],price*units);
 await timeTo(secondStart+7*86400);await call('finalize-with-synced-donation',second.finalizePool);
 assert.equal(await second.poolCreated(),true);assert.equal(await second.externalPoolWbnb(),1n);assert.equal(await second.liquidityBnb(),price*units*80n/100n);
 assert.equal(await second.bnbCredit(wallets[1]),price*units*15n/100n);assert.equal(await second.bnbCredit(wallets[0]),price*units*5n/100n);
 assert.equal(await wbnb.balanceOf(secondPair.target),await second.liquidityBnb()+1n);assert.equal(await secondPair.balanceOf(ZeroAddress),await secondPair.totalSupply());
 checks.syncedOneWeiDonationSettles=true;checks.donationNotCountedAsPrincipalOrFees=true;
 assert.equal(await factory.allPairsLength(),originalPairs+2n);
 await assert.rejects(()=>fork.readRemote('eth_sendRawTransaction',['0x']),/REMOTE_METHOD_DENIED/);
 await fork.assertAnchor();assert.equal(fork.stats.remoteWritesForwarded,0);assert.equal(fork.stats.blockedMethods.eth_sendRawTransaction,1);checks.remoteWriteFilter=true;
 for(const [f,digest]of Object.entries(inputHashes))assert.equal(hash(f),digest,'Fork input changed during execution');
 const result={at:new Date().toISOString(),exitCode:0,localChainId:31337,sourceChainId:56,historicalStateFork:true,compiler:compiled.compiler,anchor:fork.anchor,observedStorage,checks,transactions,rpc:fork.stats,inputHashes,remoteWrites:false,realWalletUsed:false,testnet:false,audit:false,
  limitations:'Recent fixed canonical BSC checkpoint,not proof of old archival coverage. EDR Shanghai execution with real inherited DEX state and mock identity;synthetic local deployments/balances only. Does not establish BSC consensus equivalence,public testnet,real-wallet compatibility,all reserve extremes or independent review.'};
 fs.writeFileSync(path.join(root,'evidence/historical-dex-fork-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({exitCode:0,anchor:fork.anchor,checks,transactions:transactions.length,rpc:fork.stats}));
}catch(error){
 const result={at:new Date().toISOString(),exitCode:1,historicalStateFork:false,stage:'historical-fork-attempt',error:String(error.shortMessage??error.message).slice(0,2000),observation:error.forkObservation??(fork?{anchor:fork.anchor,stats:fork.stats}:null),checks,transactions,inputHashes,remoteWrites:false,realWalletUsed:false};
 fs.writeFileSync(path.join(root,'evidence/historical-dex-fork-result.json'),JSON.stringify(result,null,2)+'\n');console.error(JSON.stringify(result));process.exitCode=1;
}finally{provider?.destroy();await fork?.close();}
