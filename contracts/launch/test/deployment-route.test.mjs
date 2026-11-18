import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,Contract,ContractFactory,ZeroAddress,ZeroHash,id,keccak256} from 'ethers';
import {createLocalChain} from './local-chain.mjs';
import {identityIdOf} from '../lib/agent-client.mjs';
import {buildLaunchDeploymentPlan,create2DeploymentIntent,inspectDeploymentIntent,loadDeploymentProxyReference} from '../scripts/prepare-deployment.mjs';
const root=path.resolve(import.meta.dirname,'..'),reference=loadDeploymentProxyReference(),PRICE=10_000_000_000n;
const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
let chain,provider,signers,wallets,identity,plan,registry,nftFactory,tokenFactory,spec;
const observations=[],receipts=[];
const tx=async(promise,label)=>{const receipt=await(await promise).wait();assert.equal(receipt.status,1);receipts.push({label,transactionHash:receipt.hash,to:receipt.to,contractAddress:receipt.contractAddress,blockNumber:receipt.blockNumber,status:receipt.status,gasUsed:receipt.gasUsed.toString()});return receipt;};
const now=async()=>Number((await provider.getBlock('latest')).timestamp);
test.before(async()=>{
 chain=await createLocalChain({runtimeCodes:[{address:reference.address,code:reference.runtime}]});provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 assert.equal(Number((await provider.getNetwork()).chainId),31337);signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));wallets=await Promise.all(signers.map(s=>s.getAddress()));
 const deploy=async(name,args=[])=>{const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:15000000});await c.waitForDeployment();return c;};
 identity=await deploy('MockIdentity');const wbnb=await deploy('MockWBNB'),dex=await deploy('MockFactory'),router=await deploy('MockRouter',[dex.target,wbnb.target]);
 await tx(identity.register('route',wallets[2]),'local-identity-fixture');
 spec={schema:'echo-launch-deployment-spec/v1',chainId:31337,namespace:'LOCAL-ROUTE-TEST-ONLY',environment:{identity:identity.target,platformAdmin:wallets[0],platformRecipient:wallets[3],dexFactory:dex.target,router:router.target,wbnb:wbnb.target,oracleWindow:1800,oracleMaxAge:7200},templates:{nftVersion:id('LOCAL-ROUTE-NFT'),tokenVersion:id('LOCAL-ROUTE-TOKEN'),nftReviewDocumentHash:id('LOCAL TEST;NOT AN AUDIT;NFT'),tokenReviewDocumentHash:id('LOCAL TEST;NOT AN AUDIT;TOKEN')}};
 plan=await buildLaunchDeploymentPlan(spec);
});
test.after(async()=>{
 fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/deployment-route-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),chainId:31337,environment:'Captured exact existing public deployment-helper runtime on fresh isolated local storage;identity and DEX test doubles',publicCapture:{chainId:reference.chainId,block:reference.block,address:reference.address,runtimeHash:reference.runtimeHash},plan,observations,receipts,publicTransactions:false,realWalletUsed:false,binanceWalletPreviewVerified:false,independentSecurityReview:false,productionReady:false},null,2)+'\n');
 provider?.destroy();await chain?.close();
});
test('existing-destination CREATE2 calls deploy Registry/factories with explicit immutable authority and register both templates',async()=>{
 assert.equal(plan.deployments.length,3);assert.equal(plan.registrations.length,2);assert.equal(plan.executionReady,false);
 for(const intent of plan.deployments){
  const before=await inspectDeploymentIntent(provider,intent);assert.equal(before.status,'not-deployed');
  assert.equal(await provider.call(intent.transaction),intent.predictedAddress.toLowerCase());
  const estimate=await signers[1].estimateGas(intent.transaction);await tx(signers[1].sendTransaction({...intent.transaction,gasLimit:15000000}),'deploy-'+intent.label);
  const code=await provider.getCode(intent.predictedAddress),runtimeHash=keccak256(code);
  assert.notEqual(code,'0x');assert.ok((code.length-2)/2<=24576);assert.equal((await inspectDeploymentIntent(provider,intent)).status,'occupied-unverified');
  assert.equal((await inspectDeploymentIntent(provider,intent,{expectedRuntimeHash:runtimeHash})).status,'existing-code-matches');
  observations.push({label:intent.label,predictedAddress:intent.predictedAddress,estimateGas:estimate.toString(),runtimeHash,initCodeBytes:(intent.transaction.data.length-2)/2-32,before});
 }
 registry=new Contract(plan.deployments[0].predictedAddress,artifact('LaunchRegistry').abi,signers[0]);nftFactory=new Contract(plan.deployments[1].predictedAddress,artifact('NftLaunchFactory').abi,signers[2]);tokenFactory=new Contract(plan.deployments[2].predictedAddress,artifact('TokenLaunchFactory').abi,signers[2]);
 assert.equal(await registry.platformAdmin(),wallets[0]);assert.notEqual(await registry.platformAdmin(),reference.address);assert.notEqual(await registry.platformAdmin(),wallets[1]);assert.equal(await registry.platformRecipient(),wallets[3]);assert.equal(await registry.environmentUnchanged(),true);
 for(const [i,f]of [nftFactory,tokenFactory].entries()){assert.equal(await f.registry(),registry.target);assert.equal(await f.versionId(),i===0?spec.templates.nftVersion:spec.templates.tokenVersion);assert.equal(await f.creationCodeHash(),keccak256(artifact(i===0?'NftLaunch':'TokenLaunch').bytecode));}
 assert.equal(await tokenFactory.storedCreationCode(),artifact('TokenLaunch').bytecode);
 await assert.rejects(signers[1].estimateGas(plan.registrations[0].transaction));
 for(const step of plan.registrations)await tx(signers[0].sendTransaction(step.transaction),step.label);
 assert.equal(await registry.canCreate(spec.templates.nftVersion,nftFactory.target),true);assert.equal(await registry.canCreate(spec.templates.tokenVersion,tokenFactory.target),true);
});
test('projects from the proxy-deployed factories complete NFT delivery and token pool/distribution locally',async()=>{
 const content=JSON.parse(fs.readFileSync(path.resolve(root,'../../work/echo-launch-preview-20261113/nft-content-20261114/reference.json'),'utf8')),identityId=identityIdOf('route'),start=await now()+100;
 const requests=[id('LOCAL-ROUTE-CREATE-NFT'),id('LOCAL-ROUTE-CREATE-TOKEN')];
 await tx(nftFactory.create(identityId,requests[0],['Route NFT','RNFT','ipfs://'+content.rootCid+'/',content.metadataRoot,start,PRICE,3,wallets[2]],await now()+300,{gasLimit:15000000}),'create-local-nft');
 await tx(tokenFactory.create(identityId,requests[1],['Route Token','RTOK',start,PRICE,1000n*PRICE,wallets[2]],await now()+300,{gasLimit:15000000}),'create-local-token');
 const nft=new Contract(await nftFactory.projectForRequest(await nftFactory.requestKey(wallets[2],requests[0])),artifact('NftLaunch').abi,signers[2]);
 const token=new Contract(await tokenFactory.projectForRequest(await tokenFactory.requestKey(wallets[2],requests[1])),artifact('TokenLaunch').abi,signers[2]);
 await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[start]});await chain.provider.request({method:'evm_mine',params:[]});
 await tx(nft.subscribe(identityId,3,id('LOCAL-ROUTE-SUB-NFT'),await now()+300,{value:3n*PRICE,gasLimit:1000000}),'subscribe-local-nft');await tx(nft.finalize(),'finalize-local-nft');await tx(nft.claimFor(wallets[2],[1,2,3],{gasLimit:1000000}),'deliver-local-nfts');assert.equal(await nft.balanceOf(wallets[2]),3n);
 await tx(token.subscribe(identityId,1000,id('LOCAL-ROUTE-SUB-TOKEN'),await now()+300,{value:1000n*PRICE,gasLimit:1000000}),'subscribe-local-token');
 await chain.provider.request({method:'evm_setNextBlockTimestamp',params:[start+7*86400]});await chain.provider.request({method:'evm_mine',params:[]});
 await tx(token.finalizePool({gasLimit:3000000}),'pool-local-token');await tx(token.distribute([await token.positionKey(identityId,wallets[2])],{gasLimit:1000000}),'distribute-local-token');
 assert.equal(await new Contract(await token.token(),artifact('LaunchToken').abi,provider).balanceOf(wallets[2]),1000n*10n**18n);
 observations.push({label:'project-lifecycles',nft:nft.target,token:token.target,nftDelivered:'3',tokenDelivered:'1000000000000000000000',realWallet:false});
});
test('public salt predeployment cannot replace explicit admin/recipient and duplicate CREATE2 is not retried as success',async()=>{
 const other=await buildLaunchDeploymentPlan({...spec,namespace:'LOCAL-PUBLIC-SALT-OTHER-CALLER'}),intent=other.deployments[0];
 await tx(signers[3].sendTransaction({...intent.transaction,gasLimit:15000000}),'other-caller-same-explicit-constructor');
 const deployed=new Contract(intent.predictedAddress,artifact('LaunchRegistry').abi,provider);assert.equal(await deployed.platformAdmin(),wallets[0]);assert.equal(await deployed.platformRecipient(),wallets[3]);
 const before=await provider.getCode(intent.predictedAddress);await assert.rejects(signers[1].estimateGas(intent.transaction));assert.equal(await provider.getCode(intent.predictedAddress),before);
 assert.equal((await inspectDeploymentIntent(provider,intent)).status,'occupied-unverified');assert.equal((await inspectDeploymentIntent(provider,intent,{expectedRuntimeHash:id('WRONG-CODE')})).status,'occupied-unverified');
});
test('wrong chain,changed calldata,helper bytecode and canonical block changes fail before a deployment can be proposed',async()=>{
 const intent=plan.deployments[0];await assert.rejects(inspectDeploymentIntent(provider,{...intent,chainId:56}),/DEPLOY_WRONG_CHAIN/);
 await assert.rejects(inspectDeploymentIntent(provider,{...intent,transaction:{...intent.transaction,value:'1'}}),/DEPLOY_INTENT_SCOPE/);
 await assert.rejects(inspectDeploymentIntent(provider,{...intent,transaction:{...intent.transaction,data:intent.transaction.data+'00'}}),/DEPLOY_INTENT_CHANGED/);
 const proxyFault={send:provider.send.bind(provider),getBlock:provider.getBlock.bind(provider),getCode:async()=> '0x6000'};await assert.rejects(inspectDeploymentIntent(proxyFault,intent),/DEPLOY_PROXY_RUNTIME_CHANGED/);
 const blockFault={send:provider.send.bind(provider),getCode:provider.getCode.bind(provider),getTransactionCount:provider.getTransactionCount.bind(provider),getBlock:async n=>{const b=await provider.getBlock(n);return n==='latest'?b:{...b,hash:ZeroHash};}};await assert.rejects(inspectDeploymentIntent(blockFault,intent),/DEPLOY_BLOCK_CHANGED/);
});
test('an empty-code address with a creation nonce remains occupied and cannot be reported ready',async()=>{
 const intent=create2DeploymentIntent({chainId:31337,reference,salt:id('LOCAL-NONCE-COLLISION'),initCode:artifact('LaunchRegistry').bytecode,label:'nonce-collision'});
 await chain.provider.request({method:'hardhat_setNonce',params:[intent.predictedAddress,'0x1']});
 const inspection=await inspectDeploymentIntent(provider,intent,{expectedRuntimeHash:keccak256('0x')});assert.equal(inspection.creationNonce,1);assert.equal(inspection.status,'occupied-unverified');assert.equal(inspection.observedRuntimeHash,null);
});
test('missing recipients,invalid oracle bounds and zero review/version fields cannot produce a launch plan',async()=>{
 for(const broken of [{...spec,environment:{...spec.environment,platformAdmin:ZeroAddress}},{...spec,environment:{...spec.environment,platformRecipient:null}},{...spec,environment:{...spec.environment,oracleMaxAge:spec.environment.oracleWindow-1}},{...spec,templates:{...spec.templates,nftVersion:ZeroHash}},{...spec,namespace:'../../unreviewed'}])await assert.rejects(buildLaunchDeploymentPlan(broken));
 assert.throws(()=>create2DeploymentIntent({chainId:31337,reference,salt:id('TOO-LARGE'),initCode:'0x'+'00'.repeat(49153),label:'oversized'}),/DEPLOY_INVALID_INIT_CODE/);
});
