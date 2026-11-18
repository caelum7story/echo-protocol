import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,Contract,ContractFactory,Interface,keccak256,toUtf8Bytes} from 'ethers';
import {createLocalChain} from './local-chain.mjs';
const root=path.resolve(import.meta.dirname,'..'),E18=10n**18n,PUBLIC=555555555n,CAP=22222222n,DAY=86400,MAX=(1n<<256n)-1n,results=[];
const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
const rng=seed=>{let n=seed>>>0;return bound=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n%bound;};};
const rejected=fn=>assert.rejects(fn,e=>e.code==='CALL_EXCEPTION');
let requestSequence=0;
const request=()=>keccak256(toUtf8Bytes('STATEFUL-LOCAL-REQUEST-'+(++requestSequence)));
async function fixture(){
 const chain=await createLocalChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all([0,1,2,3,4].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
 const tx=async p=>{const r=await(await p).wait();assert.equal(r.status,1);return r;};
 const deploy=async(name,args=[])=>{const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:15000000});await c.waitForDeployment();return c;};
 const identity=await deploy('MockIdentity'),wbnb=await deploy('MockWBNB'),factory=await deploy('MockFactory'),router=await deploy('MockRouter',[factory.target,wbnb.target]);
 for(const i of [2,3])await tx(identity.setOwner(i,addresses[i]));
 const now=async()=>Number((await chain.provider.request({method:'eth_getBlockByNumber',params:['latest',false]})).timestamp);
 const timeTo=async timestamp=>{await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[timestamp]});await chain.provider.request({method:'evm_mine',params:[]});};
 const sale=async(kind,{price=1n,supply=12n,minimum=price*100n}={})=>{
  const start=await now()+100,base=[identity.target,addresses[0],addresses[0],addresses[1],start,price,kind==='token'?PUBLIC:supply,keccak256(toUtf8Bytes('LOCAL STATEFUL TEST ONLY'))];
  const s=kind==='token'?await deploy('TokenLaunch',[base,minimum,'Local model token','MODEL',factory.target,router.target,wbnb.target,1800,7200]):await deploy('NftLaunch',[base,'Local model NFT','MODEL','ipfs://local-model-only/',keccak256(toUtf8Bytes('NOT PUBLIC CONTENT'))]);
  return {s,start,end:start+7*DAY,token:kind==='token'?new Contract(await s.token(),artifact('LaunchToken').abi,signers[0]):null};
 };
 return {chain,provider,signers,addresses,tx,sale,now,timeTo,close:async()=>{provider.destroy();await chain.close();}};
}
async function using(fn){const f=await fixture();try{await fn(f);}finally{await f.close();}}

for(const [seed,mode,price]of [[13,'success',1n],[71,'success',19n],[2026,'failed',7n],[42,'failed-cap',10000000000n],[511,'cancelled',19n],[1337,'pool-timeout',7n]]){
 test('token independent cash ledger seed'+seed+' '+mode,{timeout:120000},()=>using(async f=>{
  const minimum=mode.startsWith('failed')?PUBLIC*price:100n*price,c=await f.sale('token',{price,minimum}),{s,token}=c;
  const credits=[0n,0n,0n,0n],positions=[null,null,{units:0n,principal:0n,revision:0n,delivered:false},{units:0n,principal:0n,revision:0n,delivered:false}],oldRequests=[null,null,null,null];
  let received=0n,withdrawn=0n,liquidity=0n,activeUnits=0n,activePrincipal=0n,pool=false,paused=false,checks=0,accepted=0,denied=0;
  const random=rng(seed);
  async function invariant(){
   const [balance,units,principal,totalCredit,ends,supply,burn,...actualCredits]=await Promise.all([f.provider.getBalance(s.target),s.activeUnits(),s.activePrincipal(),s.totalBnbCredit(),s.endsAt(),token.totalSupply(),s.burnedTokens(),...f.addresses.slice(0,4).map(a=>s.bnbCredit(a))]);
   const held=pool?0n:positions[2].principal+positions[3].principal;
   assert.equal(balance+withdrawn+liquidity,received,'global principal conservation');assert.equal(balance,held+credits.reduce((a,b)=>a+b,0n),'escrow liabilities equal held BNB');
   assert.equal(units,activeUnits);assert.equal(principal,activePrincipal);assert.equal(totalCredit,credits.reduce((a,b)=>a+b,0n));assert.equal(ends,BigInt(c.end));assert.equal(supply+burn,1000000000n*E18);assert.deepEqual(actualCredits,credits);
   for(const i of [2,3]){
    const p=await s.positions(await s.positionKey(i,f.addresses[i])),expected=positions[i];assert.equal(p.units,expected.units);assert.equal(p.principal,expected.principal);assert.equal(p.revision,expected.revision);assert.equal(p.delivered,expected.delivered);
    assert.equal(await s.identityActiveUnits(i),expected.units);assert.ok(expected.units<=CAP);assert.equal(await token.balanceOf(f.addresses[i]),expected.delivered?expected.units*E18:0n);
   }
   checks++;
  }
  async function subscribe(i,units){
   const id=request(),args=[i,units,id,await f.now()+300],value=units*price;
   if(paused||units===0n||units>CAP-positions[i].units){await rejected(()=>s.connect(f.signers[i]).subscribe.staticCall(...args,{value}));denied++;return;}
   await f.tx(s.connect(f.signers[i]).subscribe(...args,{value,gasLimit:500000}));const p=positions[i];p.units+=units;p.principal+=value;p.revision++;received+=value;activeUnits+=units;activePrincipal+=value;oldRequests[i]={args,value};accepted++;
  }
  async function exit(i){
   const p=positions[i],args=[i,p.revision,await f.now()+300];
   if(p.principal===0n){await rejected(()=>s.connect(f.signers[i]).exitAll.staticCall(...args));denied++;return;}
   await f.tx(s.connect(f.signers[i]).exitAll(...args,{gasLimit:500000}));const fee=p.principal*5n/100n;credits[0]+=fee;credits[i]+=p.principal-fee;activeUnits-=p.units;activePrincipal-=p.principal;p.units=0n;p.principal=0n;p.revision++;
  }
  async function withdraw(i){
   if(credits[i]===0n){await rejected(()=>s.withdrawCreditFor.staticCall(f.addresses[i]));denied++;return;}
   const before=await f.provider.getBalance(f.addresses[i]),amount=credits[i];await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[i],{gasLimit:200000}));assert.equal(await f.provider.getBalance(f.addresses[i])-before,amount);withdrawn+=amount;credits[i]=0n;
  }
  await f.timeTo(c.start);
  if(mode==='failed-cap'){await subscribe(2,CAP);await subscribe(2,1n);await invariant();await exit(2);await invariant();}
  for(let step=0;step<32;step++){
   const i=2+random(2),action=random(7);
   if(action<3)await subscribe(i,BigInt(random(201)));
   else if(action===3)await exit(i);
   else if(action===4)await withdraw(random(4));
   else if(action===5){if(paused){await f.timeTo(await f.now()+17);await f.tx(s.setPaused(false));paused=false;}else{await f.tx(s.setPaused(true));paused=true;}}
   else if(oldRequests[i]){const old=oldRequests[i];await rejected(()=>s.connect(f.signers[i]).subscribe.staticCall(...old.args,{value:old.value}));denied++;}
   else{await rejected(async()=>s.connect(f.signers[i]).subscribe.staticCall(i,1,request(),await f.now()-1,{value:price}));denied++;}
   await invariant();
  }
  if(paused){await f.tx(s.setPaused(false));paused=false;}
  if(!mode.startsWith('failed')&&activeUnits<100n)await subscribe(2,100n-activeUnits);
  if(mode==='cancelled'){await f.tx(s.setPaused(true));paused=true;await f.timeTo(await f.now()+24*3600);assert.equal(await s.cancelled(),true);await rejected(()=>s.setPaused.staticCall(false));}
  else await f.timeTo(c.end);
  if(mode==='pool-timeout'){await f.timeTo(c.end+48*3600-1);assert.equal(await s.refundEligible(),false);await s.finalizePool.staticCall();await f.timeTo(c.end+48*3600);assert.equal(await s.refundEligible(),true);await rejected(()=>s.finalizePool.staticCall());}
  if(mode==='success'){
   await f.tx(s.finalizePool({gasLimit:3000000}));pool=true;liquidity=activePrincipal*80n/100n;const creator=activePrincipal*15n/100n;credits[1]+=creator;credits[0]+=activePrincipal-liquidity-creator;
   if(positions[2].units){await f.tx(s.connect(f.signers[2]).claim(2));positions[2].delivered=true;positions[2].revision++;}
   const keys=await Promise.all([2,3].map(i=>s.positionKey(i,f.addresses[i])));await f.tx(s.distribute(keys));for(const i of [2,3])if(positions[i].units&&!positions[i].delivered){positions[i].delivered=true;positions[i].revision++;}
   await invariant();await f.tx(s.distribute(keys));await rejected(()=>s.setPaused.staticCall(true));
  }else{
   assert.equal(await s.refundEligible(),true);
   for(const i of [2,3]){
    const p=positions[i];if(!p.principal)continue;const value=p.principal;
    await rejected(async()=>s.connect(f.signers[i]).exitAll.staticCall(i,p.revision,await f.now()+300));
    await f.tx(s.refundFor(i,f.addresses[i]));credits[i]+=value;p.principal=0n;p.units=0n;p.revision++;await invariant();await rejected(()=>s.refundFor.staticCall(i,f.addresses[i]));
   }
  }
  for(let i=0;i<4;i++){await withdraw(i);await invariant();}assert.equal(await f.provider.getBalance(s.target),0n);assert.equal(await s.subscriptionsOpen(),false);
  results.push({kind:'token',seed,mode,priceWei:String(price),accepted,rejected:denied,invariantChecks:checks,receivedWei:String(received),withdrawnWei:String(withdrawn),liquidityWei:String(liquidity),finalEscrowWei:'0'});
 }));
}

for(const [seed,mode,price]of [[2,'success',1n],[5,'success',19n],[17,'failed',7n],[31,'cancelled',19n]]){
 test('NFT independent reservation and cash ledger seed'+seed+' '+mode,{timeout:120000},()=>using(async f=>{
  const supply=mode==='success'?12n:100n,c=await f.sale('nft',{price,supply}),{s}=c,credits=[0n,0n,0n,0n],principal=[0n,0n,0n,0n],refunded=[false,false,false,false],reserved=new Map(),delivered=new Set(),random=rng(seed);
  let received=0n,withdrawn=0n,count=0n,settled=false,success=false,checks=0;
  async function invariant(){
   const held=success?0n:principal.reduce((n,p,i)=>n+(refunded[i]?0n:p),0n),balance=await f.provider.getBalance(s.target);
   assert.equal(balance+withdrawn,received);assert.equal(balance,held+credits.reduce((a,b)=>a+b,0n));assert.equal(await s.totalBnbCredit(),credits.reduce((a,b)=>a+b,0n));assert.equal(await s.activePrincipal(),received);assert.equal(await s.activeUnits(),count);assert.equal(await s.reservedCount(),count);assert.equal(await s.deliveredCount(),BigInt(delivered.size));assert.equal(await s.endsAt(),BigInt(c.end));
   for(let i=0;i<4;i++)assert.equal(await s.bnbCredit(f.addresses[i]),credits[i]);
   for(const [id,i]of reserved){assert.equal(await s.reservedFor(id),f.addresses[i]);if(delivered.has(id))assert.equal(await s.ownerOf(id),f.addresses[i]);}
   checks++;
  }
  async function subscribe(i,units){const requestId=request(),args=[i,units,requestId,await f.now()+300],value=units*price;if(units> supply-count){await rejected(()=>s.connect(f.signers[i]).subscribe.staticCall(...args,{value}));return;}
   await f.tx(s.connect(f.signers[i]).subscribe(...args,{value,gasLimit:500000}));for(let n=1n;n<=units;n++)reserved.set(String(count+n),i);count+=units;received+=value;principal[i]+=value;
   await rejected(()=>s.connect(f.signers[i]).subscribe.staticCall(...args,{value}));
  }
  async function withdraw(i){if(!credits[i])return;const before=await f.provider.getBalance(f.addresses[i]),amount=credits[i];await f.tx(s.connect(f.signers[4]).withdrawCreditFor(f.addresses[i]));assert.equal(await f.provider.getBalance(f.addresses[i])-before,amount);credits[i]=0n;withdrawn+=amount;}
  await f.timeTo(c.start);
  for(let step=0;step<10;step++){if(count===supply)break;await subscribe(2+random(2),BigInt(1+random(4)));await invariant();}
  if(mode==='success'&&count<supply){await subscribe(2,supply-count);await invariant();}
  if(mode==='cancelled'){await f.tx(s.setPaused(true));await f.timeTo(await f.now()+24*3600);assert.equal(await s.cancelled(),true);}else if(mode==='failed')await f.timeTo(c.end);
  success=mode==='success';
  if(success){
   await f.tx(s.finalize());settled=true;credits[0]=received/10n;credits[1]=received-credits[0];await invariant();
   const first=[...reserved][0];await rejected(()=>s.claimFor.staticCall(f.addresses[first[1]===2?3:2],[first[0]]));
   for(const i of [2,3]){const ids=[...reserved].filter(([,who])=>who===i).map(([id])=>id);if(!ids.length)continue;await f.tx(s.connect(f.signers[4]).claimFor(f.addresses[i],ids));ids.forEach(id=>delivered.add(id));await invariant();await rejected(()=>s.claimFor.staticCall(f.addresses[i],ids));}
  }else{
   for(const i of [2,3]){if(!principal[i])continue;await f.tx(s.refundFor(f.addresses[i]));refunded[i]=true;credits[i]+=principal[i];await invariant();await rejected(()=>s.refundFor.staticCall(f.addresses[i]));}
   await f.tx(s.finalize());settled=true;assert.equal(await s.deliveredCount(),0n);
  }
  for(let i=0;i<4;i++){await withdraw(i);await invariant();}assert.equal(settled,true);assert.equal(await f.provider.getBalance(s.target),0n);assert.equal(await s.subscriptionsOpen(),false);
  results.push({kind:'nft',seed,mode,priceWei:String(price),reserved:String(count),delivered:delivered.size,invariantChecks:checks,receivedWei:String(received),withdrawnWei:String(withdrawn),finalEscrowWei:'0'});
 }));
}

test('one-wei successful threshold cannot create zero liquidity and returns full principal at48hours',{timeout:120000},()=>using(async f=>{
 const c=await f.sale('token',{price:1n,minimum:1n});await f.timeTo(c.start);await f.tx(c.s.connect(f.signers[2]).subscribe(2,1,request(),await f.now()+300,{value:1}));await f.timeTo(c.end);
 await rejected(()=>c.s.finalizePool.staticCall());assert.equal(await c.s.settled(),false);assert.equal(await c.s.totalBnbCredit(),0n);assert.equal(await f.provider.getBalance(c.s.target),1n);
 await f.timeTo(c.end+48*3600);await f.tx(c.s.refundFor(2,f.addresses[2]));assert.equal(await c.s.bnbCredit(f.addresses[2]),1n);assert.equal(await c.s.bnbCredit(f.addresses[0]),0n);await f.tx(c.s.connect(f.signers[4]).withdrawCreditFor(f.addresses[2]));assert.equal(await f.provider.getBalance(c.s.target),0n);
 results.push({kind:'boundary',case:'one-wei-zero-liquidity-full-timeout-refund',verified:true});
}));
test('constructor rejects maximum-price multiplication overflow before accepting any principal',{timeout:120000},()=>using(async f=>{
 await f.sale('token',{price:MAX/PUBLIC,minimum:1n});let failure;
 try{await f.sale('token',{price:MAX/PUBLIC+1n,minimum:1n});}catch(error){failure=error;}
 assert.ok(failure,'Overflowing configuration must not deploy');
 const raw=failure.error??failure.info?.error,data=typeof failure.data==='string'?failure.data:typeof raw?.data==='string'?raw.data:raw?.data?.data;
 const decoded=new Interface(artifact('TokenLaunch').abi).parseError(data);
 assert.equal(decoded?.name,'InvalidConfig');
 const failedHash=raw?.data?.transactionHash;assert.match(failedHash,/^0x[0-9a-fA-F]{64}$/);
 const receipt=await f.chain.provider.request({method:'eth_getTransactionReceipt',params:[failedHash]});assert.equal(receipt.status,'0x0');
 results.push({kind:'boundary',case:'uint256-price-capacity-product',verified:true,decodedError:decoded.name,failedReceiptStatus:receipt.status});
}));
test.after(()=>fs.writeFileSync(path.join(root,'evidence/stateful-funds-walkthrough.json'),JSON.stringify({at:new Date().toISOString(),results,environment:'isolated-EVM31337;synthetic EOA actors;mock identity/DEX',independentCashModel:true,remoteWrites:false,realWalletUsed:false,independentSecurityReview:false},null,2)+'\n'));
