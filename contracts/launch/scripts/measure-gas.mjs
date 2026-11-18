import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BrowserProvider,Contract,ContractFactory,Wallet,ZeroAddress,keccak256,toUtf8Bytes,toBeHex} from 'ethers';
import {compile,root} from './compile.mjs';
import {createLocalChain} from '../test/local-chain.mjs';
import {quoteGasBudget} from './gas-budget.mjs';

// In-process EVM only. These deterministic keys/accounts are synthetic fixtures;
// no external RPC,wallet files,secrets,real signing service or public send exists.
const hash=value=>createHash('sha256').update(value).digest('hex');
const fixedInputs=['scripts/compile.mjs','scripts/measure-gas.mjs','scripts/gas-budget.mjs','test/local-chain.mjs','package-lock.json','references/pancake-v2/deployed-runtime.json'];
const initialHashes=Object.fromEntries(fixedInputs.map(f=>[f,hash(fs.readFileSync(path.join(root,f)))]));
const compiled=compile(),capture=JSON.parse(fs.readFileSync(path.join(root,'references/pancake-v2/deployed-runtime.json'),'utf8'));
assert.equal(compiled.lockfileSha256,initialHashes['package-lock.json']);
assert.equal(capture.chainId,56);assert.equal(capture.readOnly,true);
for(const c of Object.values(capture.codes))assert.equal(keccak256(c.code),c.runtimeHash);
const chain=await createLocalChain({runtimeCodes:['factory','router','wbnb'].map(k=>capture.codes[k])});
const provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
const measurements=[],checks={},id=s=>keccak256(toUtf8Bytes('LOCAL-GAS-'+s)),PRICE=10_000_000_000n,E18=10n**18n;
let sequence=0;
try{
 assert.equal(Number((await provider.getNetwork()).chainId),31337);
 const admin=await provider.getSigner(0),creator=await provider.getSigner(1),buyer=await provider.getSigner(2),operator=await provider.getSigner(3);
 const addresses=await Promise.all([admin,creator,buyer,operator].map(s=>s.getAddress()));
 const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
 const now=async()=>Number((await chain.provider.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
 const timeTo=async timestamp=>{await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[timestamp]});await chain.provider.request({method:'evm_mine',params:[]});};
 async function record(label,role,estimate,transaction,extra={}){
  const receipt=await transaction.wait();assert.equal(receipt.status,1);assert.ok(receipt.gasUsed>0n&&receipt.gasUsed<=transaction.gasLimit);
  measurements.push({id:label,callerRole:role,estimatedGas:String(estimate),gasLimit:String(transaction.gasLimit),gasUsed:String(receipt.gasUsed),transactionHash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,...extra});
  console.log(JSON.stringify({operation:label,gasUsed:String(receipt.gasUsed)}));return receipt;
 }
 async function call(label,role,method,args=[],overrides={},extra={}){
  const estimate=await method.estimateGas(...args,overrides),gasLimit=(estimate*130n+99n)/100n;assert.ok(gasLimit<=15_000_000n);
  return record(label,role,estimate,await method(...args,{...overrides,gasLimit}),extra);
 }
 async function deploy(name,args=[],label=null){
  const a=artifact(name),factory=new ContractFactory(a.abi,a.bytecode,admin),request=await factory.getDeployTransaction(...args),estimate=await admin.estimateGas(request);
  const c=await factory.deploy(...args,{gasLimit:(estimate*130n+99n)/100n});await c.waitForDeployment();
  if(label)await record(label,'platform-admin',estimate,c.deploymentTransaction(),{contract:c.target});return c;
 }
 const identity=await deploy('MockIdentity');for(const n of [1,2])await(await identity.setOwner(n,addresses[n])).wait();
 const registry=await deploy('LaunchRegistry',[[identity.target,addresses[0],addresses[0],capture.codes.factory.address,capture.codes.router.address,capture.codes.wbnb.address,1800,7200]],'startup.registry');
 const versions=[id('NFT-V1'),id('TOKEN-V1')],nftFactory=await deploy('NftLaunchFactory',[registry.target,versions[0]],'startup.nft-factory'),tokenFactory=await deploy('TokenLaunchFactory',[registry.target,versions[1]],'startup.token-factory-including-code-store');
 for(const [n,f] of [nftFactory,tokenFactory].entries())await call('startup.register-'+(n?'token':'nft'),'platform-admin',registry.registerTemplate,[versions[n],f.target,id('LOCAL MEASUREMENT; NOT SECURITY REVIEW')]);
 const code=await tokenFactory.storedCreationCode();assert.equal(keccak256(code),await tokenFactory.creationCodeHash());checks.creationCodeStoreVerified=true;
 async function create(kind,label,{supply=1,minimum=1000n*PRICE}={}){
  const start=await now()+100,f=kind==='nft'?nftFactory:tokenFactory,request=id('CREATE-'+(++sequence));
  // Placeholder NFT URI/root are measurement fixtures,not artwork admission evidence.
  const terms=kind==='nft'?['Local gas NFT','GASN','ipfs://local-measurement-only/',id('NOT-PUBLIC-CONTENT'),start,PRICE,supply,addresses[1]]:['Local gas token','GAST',start,PRICE,minimum,addresses[1]];
  await call(label,'creator',f.connect(creator).create,[1,request,terms,await now()+300]);
  const sale=new Contract(await f.projectForRequest(await f.requestKey(addresses[1],request)),artifact(kind==='nft'?'NftLaunch':'TokenLaunch').abi,operator);
  if(kind==='token'){
   const token=new Contract(await sale.token(),artifact('LaunchToken').abi,operator),pair=new Contract(await token.pair(),artifact('IV2Pair').abi,operator);
   assert.equal(keccak256(await provider.getCode(pair.target)),capture.codes.pair.runtimeHash);checks.factoryCreatedExactPairRuntime=true;
  }
  return {sale,start,end:start+7*86400};
 }
 for(const count of [1,10,100]){
  const c=await create('nft','nft.create.'+count,{supply:count});await timeTo(c.start);
  await call('nft.subscribe.'+count,'participant',c.sale.connect(buyer).subscribe,[2,count,id('NFT-SUB-'+count),await now()+300],{value:PRICE*BigInt(count)});
  await call('nft.finalize.'+count,'operator',c.sale.finalize);
  await call('nft.deliver.'+count,'helper',c.sale.claimFor,[addresses[2],Array.from({length:count},(_,i)=>i+1)],{},{items:count});
  assert.equal(await c.sale.balanceOf(addresses[2]),BigInt(count));
  await call('nft.withdraw-platform.'+count,'operator',c.sale.withdrawCreditFor,[addresses[0]]);
 }
 //100 distinct fresh recipients exercise the expensive zero-to-nonzero ERC20 balances.
 const recipients=[];
 for(let n=0;n<100;n++){
  const wallet=new Wallet(toBeHex(1000+n,32),provider);recipients.push(wallet);
  await(await admin.sendTransaction({to:wallet.address,value:E18})).wait();await(await identity.setOwner(1000+n,wallet.address)).wait();
 }
 checks.syntheticRecipients=recipients.length;
 for(const count of [1,5,20,100]){
  const c=await create('token','token.create.'+count,{minimum:1000n*BigInt(count)*PRICE}),token=new Contract(await c.sale.token(),artifact('LaunchToken').abi,operator);
  await timeTo(c.start);const keys=[];
  for(let n=0;n<count;n++){
   const method=c.sale.connect(recipients[n]).subscribe,args=[1000+n,1000,id('TOKEN-SUB-'+count+'-'+n),await now()+300];
   if(n===0)await call('token.subscribe-first.'+count,'participant',method,args,{value:1000n*PRICE});
   else await(await method(...args,{value:1000n*PRICE,gasLimit:500000})).wait();
   keys.push(await c.sale.positionKey(1000+n,recipients[n].address));
  }
  await timeTo(c.end);await call('token.finalize-pool.'+count,'operator',c.sale.finalizePool,[],{},{participants:count});
  await call('token.distribute.'+count,'platform-executor',c.sale.distribute,[keys],{},{items:count,freshRecipients:true});
  for(const wallet of recipients.slice(0,count))assert.equal(await token.balanceOf(wallet.address),1000n*E18);
  const replay=await call('token.distribute-already-delivered.'+count,'platform-executor',c.sale.distribute,[keys],{},{items:count,noNewDelivery:true});
  assert.equal(replay.logs.filter(log=>{try{return c.sale.interface.parseLog(log)?.name==='Delivered';}catch{return false;}}).length,0);
  assert.equal(await token.balanceOf(c.sale.target),0n);assert.equal(await c.sale.poolCreated(),true);
  await call('token.withdraw-platform.'+count,'operator',c.sale.withdrawCreditFor,[addresses[0]]);
 }
 checks.tokenNoDuplicateDelivery=true;checks.nftDeliveryVerified=true;
 {
  const c=await create('token','token.create-fallback'),token=new Contract(await c.sale.token(),artifact('LaunchToken').abi,operator);await timeTo(c.start);
  await(await c.sale.connect(buyer).subscribe(2,1000,id('FALLBACK'),await now()+300,{value:1000n*PRICE})).wait();
  await timeTo(c.end);await call('token.finalize-pool-fallback','operator',c.sale.finalizePool);
  await call('token.self-claim-fallback','participant',c.sale.connect(buyer).claim,[2]);assert.equal(await token.balanceOf(addresses[2]),1000n*E18);
  const r=await call('token.distribute-after-self-claim','platform-executor',c.sale.distribute,[[await c.sale.positionKey(2,addresses[2])]]);
  assert.equal(r.logs.filter(log=>{try{return c.sale.interface.parseLog(log)?.name==='Delivered';}catch{return false;}}).length,0);checks.selfClaimAndBatchNoDuplicate=true;
 }
 for(const kind of ['nft','token']){
  const c=await create(kind,kind+'.create-failure',{supply:2,minimum:2000n*PRICE});await timeTo(c.start);
  const units=kind==='nft'?1n:1000n;
  await call(kind+'.subscribe-failure','participant',c.sale.connect(buyer).subscribe,[2,units,id('FAIL-'+kind),await now()+300],{value:PRICE*units});
  await timeTo(c.end);const args=kind==='nft'?[addresses[2]]:[2,addresses[2]];
  await call(kind+'.record-full-refund','helper',c.sale.refundFor,args);assert.equal(await c.sale.bnbCredit(addresses[2]),PRICE*units);assert.equal(await c.sale.bnbCredit(addresses[0]),0n);assert.equal(await c.sale.bnbCredit(addresses[1]),0n);
  await call(kind+'.pay-full-refund','helper',c.sale.withdrawCreditFor,[addresses[2]]);assert.equal(await c.sale.bnbCredit(addresses[2]),0n);
 }
 const c=await create('token','token.create-early-exit',{minimum:1000n*PRICE});await timeTo(c.start);
 await(await c.sale.connect(buyer).subscribe(2,1000,id('EXIT'),await now()+300,{value:1000n*PRICE})).wait();
 const position=await c.sale.positions(await c.sale.positionKey(2,addresses[2]));
 await call('token.exit-all','participant',c.sale.connect(buyer).exitAll,[2,position.revision,await now()+300]);assert.equal(await c.sale.bnbCredit(addresses[2]),950n*PRICE);
 await call('token.pay-early-exit','helper',c.sale.withdrawCreditFor,[addresses[2]]);checks.refundAndExitRulesUnchanged=true;
 const inputHashes={...Object.fromEntries(Object.entries(compiled.sourceHashes).map(([f,digest])=>[f.startsWith('@')?'node_modules/'+f:f,digest])),...initialHashes};
 for(const [file,digest] of Object.entries(inputHashes))assert.equal(hash(fs.readFileSync(path.join(root,file))),digest,'Measurement input changed during execution: '+file);
 const report={schema:'echo-launch-local-gas/v1',at:new Date().toISOString(),chainId:31337,localOnly:true,completed:true,realWalletUsed:false,remoteWrites:false,compiler:compiled.compiler,
  environment:'In-process EDR Shanghai;exact captured PancakeSwapV2 factory/router/WBNB/pair runtime on fresh empty storage;mock identity;synthetic accounts. Not a historical fork.',
  captureBlock:capture.blockNumber,checks,measurements,inputHashes,
  limitations:'No public-chain gas quote,public testnet,real wallet compatibility,funding,independent review or deployment authorization is established. Constructor calldata,state,network hardfork,identity costs and recipient type can change gas.'};
 const startup=measurements.filter(x=>x.id.startsWith('startup.')).map(x=>({id:x.id,count:'1'})),firstProject=[...startup,{id:'token.finalize-pool.100',count:'1'},{id:'token.distribute.100',count:'1'},{id:'token.withdraw-platform.100',count:'1'}];
 fs.writeFileSync(path.join(root,'evidence/gas-measurement.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(root,'evidence/gas-platform-startup-plan.json'),JSON.stringify(startup,null,2)+'\n');
 fs.writeFileSync(path.join(root,'evidence/gas-platform-first-project-plan.json'),JSON.stringify(firstProject,null,2)+'\n');
 const scenarios=['50000000','100000000','1000000000'].map(gasPriceWei=>({gasPriceWei,meaning:'illustrative scenario;not current network price',startup:quoteGasBudget(report,startup,{gasPriceWei}),startupAndFirst100RecipientTokenProject:quoteGasBudget(report,firstProject,{gasPriceWei})}));
 fs.writeFileSync(path.join(root,'evidence/gas-budget-scenarios.json'),JSON.stringify({at:new Date().toISOString(),scenarios,minimumRaiseChanged:false,feesChanged:false,platformFunded:false,executionReady:false},null,2)+'\n');
 console.log(JSON.stringify({completed:true,operationsMeasured:measurements.length,checks,realWalletUsed:false,remoteWrites:false}));
}finally{provider.destroy();await chain.close();}
