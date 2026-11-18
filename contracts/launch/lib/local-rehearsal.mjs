import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,Contract,ContractFactory,keccak256,toUtf8Bytes} from 'ethers';
import {createLocalChain} from '../test/local-chain.mjs';
import {identityIdOf} from './agent-client.mjs';
import {LaunchProjectIndex} from './project-index.mjs';
import {buildNftContent} from './nft-content.mjs';
const root=path.resolve(import.meta.dirname,'..'),PRICE=10_000_000_000n;
export async function createLocalRuntimeRehearsal({directory,lifecycle=false,pagination=false}){
 const chain=await createLocalChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 let index;
 try{
  if(Number((await provider.getNetwork()).chainId)!==31337)throw Error('LOCAL_REHEARSAL_ONLY');
  const signers=await Promise.all([0,1,2].map(n=>provider.getSigner(n))),wallets=await Promise.all(signers.map(s=>s.getAddress()));
  const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
  const deploy=async(name,args=[])=>{const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:15_000_000});await c.waitForDeployment();return c;};
  const tx=async promise=>(await promise).wait(),now=async()=>Number((await provider.getBlock('latest')).timestamp),id=label=>keccak256(toUtf8Bytes(label));
  const identity=await deploy('MockIdentity'),wbnb=await deploy('MockWBNB'),factory=await deploy('MockFactory'),router=await deploy('MockRouter',[factory.target,wbnb.target]);
  await tx(identity.register('rehearsal',wallets[2]));const identityId=identityIdOf('rehearsal');
  const registry=await deploy('LaunchRegistry',[[identity.target,wallets[0],wallets[0],factory.target,router.target,wbnb.target,1800,7200]]);
  const startBlock=(await provider.getTransactionReceipt(registry.deploymentTransaction().hash)).blockNumber;
  const versions=[id('LOCAL-REHEARSAL-NFT'),id('LOCAL-REHEARSAL-TOKEN')],nft=await deploy('NftLaunchFactory',[registry.target,versions[0]]),token=await deploy('TokenLaunchFactory',[registry.target,versions[1]]);
  for(const [i,f] of [nft,token].entries())await tx(registry.registerTemplate(versions[i],f.target,id('LOCAL TEST ONLY; NOT A SECURITY REVIEW')));
  const config={schema:'echo-launch-runtime/v1',chainId:31337,mode:'local-test',executionReady:false,minConfirmations:1,
   registry:{address:registry.target,runtimeHash:keccak256(await provider.getCode(registry.target))},approvedTemplates:[]};
  for(const [i,f] of [nft,token].entries())config.approvedTemplates.push({versionId:versions[i],kind:i+1,creationCodeHash:await f.creationCodeHash(),factoryRuntimeHash:keccak256(await provider.getCode(f.target))});
  const reference=JSON.parse(fs.readFileSync(path.resolve(root,'../../work/echo-launch-preview-20261113/nft-content-20261114/reference.json'),'utf8')),cases=[];
  const create=async(kind,key,start,{supply=3,minimum=1000n*PRICE,content=reference}={})=>{
   const f=kind===1?nft:token,request=id('LOCAL-REHEARSAL-CREATE-'+key),terms=kind===1?['Local NFT '+key,'LOCALNFT','ipfs://'+content.rootCid+'/',content.metadataRoot,start,PRICE,supply,wallets[1]]:['Local token '+key,'LOCALT',start,PRICE,minimum,wallets[1]];
   await tx(f.connect(signers[2]).create(identityId,request,terms,await now()+300,{gasLimit:15_000_000}));
   return new Contract(await f.projectForRequest(await f.requestKey(wallets[2],request)),artifact(kind===1?'NftLaunch':'TokenLaunch').abi,signers[2]);
  };
  const timeTo=async timestamp=>{await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[timestamp]});await chain.provider.request({method:'evm_mine',params:[]});};
  if(lifecycle){
   const start=await now()+100,definitions=[
    [1,'nft-claimable','NFT · 成功待领取','NFT · Ready to claim'],[1,'nft-delivered','NFT · 已交付后转出 1 枚','NFT · Delivered; 1 transferred out'],
    [1,'nft-refund-available','NFT · 失败后可退本金','NFT · Failed; refund available'],[1,'nft-refund-credit','NFT · 退款已记账','NFT · Refund credit'],[1,'nft-refund-paid','NFT · 本金已支付','NFT · Principal paid'],
    [2,'token-claimable','代币 · 建池成功待交付','Token · Pool ready; delivery pending'],[2,'token-delivered','代币 · 已交付后转出 250 枚','Token · Delivered; 250 transferred out'],
    [2,'token-refund-available','代币 · 失败后可退本金','Token · Failed; refund available'],[2,'token-refund-credit','代币 · 募集失败退款记账','Token · Failed raise; refund credit'],[2,'token-refund-paid','代币 · 募集失败本金支付','Token · Failed raise; principal paid'],
    [2,'token-exit-credit','代币 · 提前退出 95% 记账','Token · Early exit 95% credit'],[2,'token-mixed-credit','代币 · 退出与失败退款混合','Token · Exit and failure refund credits']
   ];
   const finished=[];
   for(const [kind,key,zh,en] of definitions){const sale=await create(kind,key,start,{minimum:key.includes('refund')||key.includes('mixed')?2000n*PRICE:1000n*PRICE});finished.push({kind,key,sale});cases.push({address:sale.target,key,zh,en});}
   await timeTo(start);
   for(const {kind,key,sale} of finished){const units=kind===1?(key.includes('claimable')||key.includes('delivered')?3:1):1000;
    await tx(sale.subscribe(identityId,units,id('LOCAL-SUB-'+key),await now()+300,{value:PRICE*BigInt(units),gasLimit:1_000_000}));
    if(key.includes('exit')||key.includes('mixed')){const position=await sale.positions(await sale.positionKey(identityId,wallets[2]));await tx(sale.exitAll(identityId,position.revision,await now()+300,{gasLimit:1_000_000}));}
    if(key.includes('mixed')){await tx(sale.withdrawCreditFor(wallets[2],{gasLimit:300_000}));await tx(sale.subscribe(identityId,1000,id('LOCAL-RESUB-'+key),await now()+300,{value:1000n*PRICE,gasLimit:1_000_000}));}
    if(kind===1&&(key.includes('claimable')||key.includes('delivered'))){await tx(sale.finalize({gasLimit:1_000_000}));if(key.includes('delivered')){await tx(sale.claimFor(wallets[2],[1,2,3],{gasLimit:1_000_000}));await tx(sale.transferFrom(wallets[2],wallets[1],1,{gasLimit:300_000}));}}
   }
   await timeTo(start+7*86400);
   for(const {kind,key,sale} of finished){
    if(kind===2&&(key.includes('claimable')||key.includes('delivered'))){await tx(sale.finalizePool({gasLimit:3_000_000}));if(key.includes('delivered')){
      await tx(sale.distribute([await sale.positionKey(identityId,wallets[2])],{gasLimit:1_000_000}));await tx(new Contract(await sale.token(),artifact('LaunchToken').abi,signers[2]).transfer(wallets[1],250n*10n**18n,{gasLimit:300_000}));}}
    if((key.includes('refund')||key.includes('mixed'))&&!key.endsWith('available')){await tx(kind===1?sale.refundFor(wallets[2],{gasLimit:500_000}):sale.refundFor(identityId,wallets[2],{gasLimit:500_000}));if(key.endsWith('paid'))await tx(sale.withdrawCreditFor(wallets[2],{gasLimit:300_000}));}
   }
  }
  if(pagination){
   const content=await buildNftContent({supply:'125',items:Array.from({length:125},(_,i)=>({tokenId:String(i+1),imageFile:'echo-sculpture-v4.webp',metadata:{name:'Local pagination NFT #'+(i+1)}}))},{assetRoot:path.resolve(root,'../../frontend/dist/assets')});
   fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'pagination-nft.car'),content.car);
   const starts=await now()+100,nftPages=await create(1,'nft-item-pages',starts,{supply:125,content}),tokenPages=await create(2,'token-history-pages',starts);await timeTo(starts);
   for(const n of [100,25])await tx(nftPages.subscribe(identityId,n,id('LOCAL-PAGE-NFT-'+n),await now()+300,{value:PRICE*BigInt(n),gasLimit:5000000}));
   await tx(nftPages.finalize());for(const [first,count] of [[1,100],[101,25]])await tx(nftPages.claimFor(wallets[2],Array.from({length:count},(_,i)=>first+i),{gasLimit:10000000}));
   await tx(nftPages.transferFrom(wallets[2],wallets[1],1));
   for(let i=0;i<520;i++)await tx(tokenPages.subscribe(identityId,1,id('LOCAL-PAGE-TOKEN-'+i),await now()+300,{value:PRICE,gasLimit:500000}));
   cases.push({address:nftPages.target,key:'nft-item-pages',zh:'NFT · 125 枚分页核对',en:'NFT · 125 item pages'},{address:tokenPages.target,key:'token-history-pages',zh:'代币 · 520 笔认购历史',en:'Token · 520 subscription receipts'});
  }
  const start=await now()+100;
  const projects=[];
  for(const [i,f] of [nft,token].entries()){
   const request=id('LOCAL-REHEARSAL-CREATE-'+i),terms=i===0?['Local NFT rehearsal','LOCALNFT','ipfs://'+reference.rootCid+'/',reference.metadataRoot,start,PRICE,3,wallets[1]]:['Local token rehearsal','LOCALT',start,PRICE,1000n*PRICE,wallets[1]];
   await tx(f.connect(signers[2]).create(identityId,request,terms,await now()+300,{gasLimit:15_000_000}));const address=await f.projectForRequest(await f.requestKey(wallets[2],request));
   projects.push(new Contract(address,artifact(i===0?'NftLaunch':'TokenLaunch').abi,signers[2]));cases.push({address,key:i===0?'nft-open':'token-open',zh:i===0?'NFT · 认购中':'代币 · 认购中',en:i===0?'NFT · Subscriptions open':'Token · Subscriptions open'});
  }
  await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[start]});await chain.provider.request({method:'evm_mine',params:[]});
  for(const [i,sale] of projects.entries())await tx(sale.subscribe(identityId,i===0?1:1000,id('LOCAL-REHEARSAL-SUBSCRIBE-'+i),await now()+300,{value:PRICE*(i===0?1n:1000n),gasLimit:1_000_000}));
  fs.mkdirSync(directory,{recursive:true});index=new LaunchProjectIndex({provider,config,databasePath:path.join(directory,'index.sqlite'),startBlock,maxBlocksPerSync:256});let synced;do{synced=await index.sync();}while(!synced.caughtUp);
  fs.writeFileSync(path.join(directory,'rehearsal.json'),JSON.stringify({chainId:31337,localOnly:true,config,startBlock,projects:projects.map(s=>s.target),cases,lifecycle,sampleWallet:wallets[2],identity:'rehearsal.ai',publicDeployment:false,realWalletUsed:false},null,2)+'\n');
  return {index,provider,chain,config,projects,cases,sampleWallet:wallets[2],close:async()=>{index.close();provider.destroy();await chain.close();}};
 }catch(error){index?.close();provider.destroy();await chain.close();throw error;}
}
