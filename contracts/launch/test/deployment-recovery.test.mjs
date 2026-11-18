import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BrowserProvider,Contract,ContractFactory,ZeroHash,id,keccak256,getBytes,hexlify} from 'ethers';
import {createLocalChain} from './local-chain.mjs';
import {buildLaunchDeploymentPlan,loadDeploymentProxyReference} from '../scripts/prepare-deployment.mjs';
import {getDeploymentLayouts} from '../scripts/deployment-layout.mjs';
import {recoverLaunchDeployment} from '../scripts/recover-deployment.mjs';
import {LaunchAgentClient} from '../lib/agent-client.mjs';
const root=path.resolve(import.meta.dirname,'..'),artifact=n=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',n+'.json'),'utf8'));
const reference=loadDeploymentProxyReference(),observations=[],transactions=[],readOptions={minConfirmations:1,maxBlockAgeSeconds:120,allowHistoricalLocal:true};
let chain,provider,signers,wallets,spec,plan,records={},registry;
const opts=(overrides={})=>({spec,records,...readOptions,...overrides});
const summarize=(name,result)=>observations.push({name,blockNumber:result.blockNumber,blockHash:result.blockHash,configurationVerified:result.configurationVerified,knownSubmissionsSettled:result.knownSubmissionsSettled,steps:result.steps,runtimeCandidate:result.runtimeCandidate,executionReady:result.executionReady,readOnly:result.readOnly});
async function send(transaction,sender,label){const response=await signers[sender].sendTransaction({...transaction,gasLimit:15000000}),receipt=await response.wait();assert.equal(receipt.status,1);transactions.push({label,hash:receipt.hash,from:response.from,to:response.to,value:String(response.value),inputHash:keccak256(response.data),blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,status:receipt.status,contractAddress:receipt.contractAddress,gasUsed:String(receipt.gasUsed),logs:receipt.logs.map(l=>({address:l.address,topics:[...l.topics],data:l.data}))});return receipt;}
function wrap(overrides={}){const out={};for(const method of ['send','getBlock','getCode','getTransactionCount','getTransaction','getTransactionReceipt','call'])out[method]=provider[method].bind(provider);return {...out,...overrides};}
test.before(async()=>{
 chain=await createLocalChain({runtimeCodes:[{address:reference.address,code:reference.runtime}]});provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));wallets=await Promise.all(signers.map(s=>s.getAddress()));assert.equal(Number((await provider.getNetwork()).chainId),31337);
 const deploy=async(name,args=[])=>{const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args,{gasLimit:15000000});await c.waitForDeployment();return c;};
 const identity=await deploy('MockIdentity'),wbnb=await deploy('MockWBNB'),dex=await deploy('MockFactory'),router=await deploy('MockRouter',[dex.target,wbnb.target]);
 const environment={identity:identity.target,platformAdmin:wallets[0],platformRecipient:wallets[3],dexFactory:dex.target,router:router.target,wbnb:wbnb.target,oracleWindow:1800,oracleMaxAge:7200},environmentCodeHashes={};
 for(const key of ['identity','wbnb','dexFactory','router'])environmentCodeHashes[key]=keccak256(await provider.getCode(environment[key]));
 spec={schema:'echo-launch-deployment-spec/v1',chainId:31337,namespace:'LOCAL-RECOVERY-ONLY',environment,environmentCodeHashes,templates:{nftVersion:id('LOCAL-RECOVERY-NFT'),tokenVersion:id('LOCAL-RECOVERY-TOKEN'),nftReviewDocumentHash:id('LOCAL-ONLY-NOT-AN-AUDIT-NFT'),tokenReviewDocumentHash:id('LOCAL-ONLY-NOT-AN-AUDIT-TOKEN')}};
 plan=await buildLaunchDeploymentPlan(spec);
});
test.after(async()=>{fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/deployment-recovery-walkthrough.json'),JSON.stringify({observedAt:new Date().toISOString(),chainId:31337,environment:'Captured helper bytecode on isolated local state;synthetic EOAs,mock identity/DEX;faults intentionally injected through owned test RPC',spec,plan,records,observations,transactions,immutableLayout:getDeploymentLayouts(),publicTransactions:false,realWalletUsed:false,binanceWalletPreviewVerified:false,independentSecurityReview:false,productionReady:false},(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');provider?.destroy();await chain?.close();});
test('five confirmed direct-call receipts recover exact deployed runtimes,all immutable occurrences,code store and template events',async()=>{
 const initial=await recoverLaunchDeployment(provider,opts());assert.equal(initial.configurationVerified,false);assert.equal(initial.steps[0].status,'not-deployed');assert.equal(initial.runtimeCandidate,null);summarize('before-deployment',initial);
 for(const [i,intent]of plan.deployments.entries()){
  const receipt=await send(intent.transaction,1,'deploy-'+intent.label);assert.equal(receipt.contractAddress,null);records[['registry','nftFactory','tokenFactory'][i]]={hash:receipt.hash,expectedSender:wallets[1]};
  const result=await recoverLaunchDeployment(provider,opts());assert.equal(result.steps[i].status,'deployed-configuration-verified');assert.equal(result.steps[i].receipt.status,'confirmed');assert.equal(result.steps[i].automaticSubmissionAllowed,false);summarize('after-'+intent.label,result);
 }
 registry=new Contract(plan.deployments[0].predictedAddress,artifact('LaunchRegistry').abi,signers[0]);
 for(const [i,step]of plan.registrations.entries()){const receipt=await send(step.transaction,0,step.label);records[i===0?'registerNft':'registerToken']={hash:receipt.hash,expectedSender:wallets[0]};}
 const result=await recoverLaunchDeployment(provider,opts());assert.equal(result.configurationVerified,true);assert.ok(result.steps.every(s=>s.receipt.status==='confirmed'));assert.equal(result.runtimeCandidate.executionReady,false);assert.equal(result.runtimeCandidate.registry.address,registry.target);assert.equal(result.runtimeCandidate.approvedTemplates.length,2);summarize('five-steps-confirmed',result);
 const client=new LaunchAgentClient({provider,config:result.runtimeCandidate});assert.equal(client.configStatus().configured,true);assert.equal(client.configStatus().executionReady,false);await client.list({offset:0,limit:1});
 const noHashes=await recoverLaunchDeployment(provider,opts({records:{}}));assert.equal(noHashes.configurationVerified,true);assert.ok(noHashes.steps.every(s=>s.receipt.callerAttributed===false&&s.nextAction.startsWith('skip-repeat')));summarize('existing-state-without-caller-attribution',noHashes);
});
test('an actually pending deployment and an unavailable hash wait without resubmission,then recover the same successful hash',async()=>{
 const other={...spec,namespace:'LOCAL-ACTUAL-PENDING'},p=await buildLaunchDeploymentPlan(other);let response;
 await chain.provider.request({method:'evm_setAutomine',params:[false]});
 try{response=await signers[1].sendTransaction({...p.deployments[0].transaction,gasLimit:15000000});const result=await recoverLaunchDeployment(provider,opts({spec:other,records:{registry:{hash:response.hash,expectedSender:wallets[1]}}}));assert.equal(result.steps[0].receipt.status,'pending');assert.equal(result.steps[0].status,'not-deployed');assert.equal(result.knownSubmissionsSettled,false);assert.ok(result.steps.every(s=>s.nextAction==='wait-and-reconcile-known-submissions'));summarize('actual-pending',result);}
 finally{await chain.provider.request({method:'evm_mine',params:[]});await chain.provider.request({method:'evm_setAutomine',params:[true]});}
 const receipt=await response.wait();assert.equal(receipt.status,1);const recovered=await recoverLaunchDeployment(provider,opts({spec:other,records:{registry:{hash:response.hash,expectedSender:wallets[1]}}}));assert.equal(recovered.steps[0].receipt.status,'confirmed');assert.equal(recovered.steps[0].status,'deployed-configuration-verified');summarize('same-pending-hash-confirmed',recovered);
 const before=await provider.getTransactionCount(wallets[1],'pending'),unknown=await recoverLaunchDeployment(provider,opts({records:{registry:{hash:id('UNAVAILABLE-TRANSACTION'),expectedSender:wallets[1]}}}));assert.equal(unknown.steps[0].receipt.status,'unresolved');assert.equal(unknown.knownSubmissionsSettled,false);assert.equal(await provider.getTransactionCount(wallets[1],'pending'),before);summarize('unknown-is-not-dropped-or-zero',unknown);
});
test('a mined deployment remains confirming until the explicit canonical confirmation policy is met',async()=>{
 const other={...spec,namespace:'LOCAL-CONFIRMATIONS'},p=await buildLaunchDeploymentPlan(other),receipt=await send(p.deployments[0].transaction,1,'confirmation-candidate');
 const input=opts({spec:other,records:{registry:{hash:receipt.hash,expectedSender:wallets[1]}},minConfirmations:2}),waiting=await recoverLaunchDeployment(provider,input);assert.equal(waiting.steps[0].receipt.status,'confirming');assert.equal(waiting.steps[0].status,'not-deployed');summarize('one-of-two-confirmations',waiting);
 await chain.provider.request({method:'evm_mine',params:[]});const ready=await recoverLaunchDeployment(provider,input);assert.equal(ready.steps[0].receipt.status,'confirmed');assert.equal(ready.steps[0].receipt.confirmations,2);summarize('two-confirmations',ready);
});
test('a real reverted duplicate is a failed user submission even when valid configuration already exists',async()=>{
 let failure;try{await chain.provider.request({method:'eth_sendTransaction',params:[{from:wallets[1],to:plan.deployments[0].transaction.to,data:plan.deployments[0].transaction.data,value:'0x0',gas:'0xe4e1c0'}]});}catch(error){failure=error;}
 const failedHash=failure?.info?.error?.data?.transactionHash??failure?.data?.transactionHash;assert.ok(failedHash,'Expected real failed local transaction hash');const receipt=await provider.getTransactionReceipt(failedHash);assert.equal(receipt.status,0);
 const provisional=await recoverLaunchDeployment(provider,opts({records:{...records,registry:{hash:failedHash,expectedSender:wallets[1]}},minConfirmations:2}));assert.equal(provisional.steps[0].receipt.status,'confirming');assert.equal(provisional.steps[0].receipt.observedReceiptStatus,0);assert.equal(provisional.knownSubmissionsSettled,false);summarize('failed-receipt-still-needs-confirmations',provisional);await chain.provider.request({method:'evm_mine',params:[]});
 const result=await recoverLaunchDeployment(provider,opts({records:{...records,registry:{hash:failedHash,expectedSender:wallets[1]}}}));assert.equal(result.steps[0].receipt.status,'failed');assert.equal(result.configurationVerified,true);assert.equal(result.steps[0].nextAction,'skip-repeat-recheck-before-dependent-preview');assert.equal(result.executionReady,false);summarize('real-failed-duplicate-with-separate-existing-state',result);transactions.push({label:'failed-duplicate',hash:failedHash,status:0,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:String(receipt.gasUsed)});
});
test('wrong caller,substituted transactions,unsupported outer envelopes and missing template events cannot become receipt proofs',async()=>{
 await assert.rejects(recoverLaunchDeployment(provider,opts({records:{registry:{...records.registry,expectedSender:wallets[0]}}})),/DEPLOY_RECOVERY_UNSUPPORTED_OR_CHANGED_ENVELOPE/);
 await assert.rejects(recoverLaunchDeployment(provider,opts({records:{registry:{hash:records.nftFactory.hash,expectedSender:wallets[1]}}})),/DEPLOY_RECOVERY_UNSUPPORTED_OR_CHANGED_ENVELOPE/);
 const indirect=wrap({getTransaction:async hash=>{const tx=await provider.getTransaction(hash);return hash===records.registry.hash?{...tx,to:wallets[3]}:tx;}});
 await assert.rejects(recoverLaunchDeployment(indirect,opts()),/DEPLOY_RECOVERY_UNSUPPORTED_OR_CHANGED_ENVELOPE/);
 const noEvent=wrap({getTransactionReceipt:async hash=>{const receipt=await provider.getTransactionReceipt(hash);return hash===records.registerNft.hash?{...receipt,logs:[]}:receipt;}});
 await assert.rejects(recoverLaunchDeployment(noEvent,opts()),/DEPLOY_RECOVERY_TEMPLATE_EVENT/);
 observations.push({name:'receipt-adversarial-inputs-rejected',cases:4,publicTransactions:false});
});
test('a modified duplicate immutable is rejected even when its public admin getter remains correct,and code-store corruption is rejected',async()=>{
 const original=await provider.getCode(registry.target),field=getDeploymentLayouts().layouts.LaunchRegistry.fields.find(f=>f.name==='platformAdmin');assert.ok(field.ranges.length>1);let getterStillCorrect=false;
 try{for(const range of field.ranges){const changed=getBytes(original);changed[range.start+31]^=1;await chain.provider.request({method:'hardhat_setCode',params:[registry.target,hexlify(changed)]});if(await registry.platformAdmin()===wallets[0]){getterStillCorrect=true;break;}await chain.provider.request({method:'hardhat_setCode',params:[registry.target,original]});}
  assert.equal(getterStillCorrect,true);await assert.rejects(recoverLaunchDeployment(provider,opts()),/DEPLOY_RECOVERY_RUNTIME_OR_IMMUTABLE/);
 }finally{await chain.provider.request({method:'hardhat_setCode',params:[registry.target,original]});}
 const token=new Contract(plan.deployments[2].predictedAddress,artifact('TokenLaunchFactory').abi,provider),store=await token.creationCodeStore(),storeCode=await provider.getCode(store);
 try{await chain.provider.request({method:'hardhat_setCode',params:[store,'0x01'+storeCode.slice(4)]});await assert.rejects(recoverLaunchDeployment(provider,opts()),/DEPLOY_RECOVERY_CREATION_CODE_STORE/);}finally{await chain.provider.request({method:'hardhat_setCode',params:[store,storeCode]});}
 observations.push({name:'all-immutable-occurrences-and-full-store-rejected-tampering',getterRemainedCorrect:true});
});
test('retired templates stop the rollout and conflicting immutable version records or environment pins are not rewritten',async()=>{
 await send({to:registry.target,data:registry.interface.encodeFunctionData('setTemplateEnabled',[spec.templates.nftVersion,false]),value:'0'},0,'retire-nft-template');
 const retired=await recoverLaunchDeployment(provider,opts());assert.equal(retired.configurationVerified,false);assert.equal(retired.steps[3].status,'registered-disabled');assert.equal(retired.steps[3].nextAction,'stop-template-retired-do-not-reactivate');assert.equal(retired.runtimeCandidate,null);summarize('retired-template',retired);
 await send({to:registry.target,data:registry.interface.encodeFunctionData('setTemplateEnabled',[spec.templates.nftVersion,true]),value:'0'},0,'restore-only-owned-test-template');
 await assert.rejects(recoverLaunchDeployment(provider,opts({spec:{...spec,templates:{...spec.templates,nftReviewDocumentHash:id('OTHER-ATTESTATION')}}})),/DEPLOY_RECOVERY_TEMPLATE_CONFLICT/);
 await assert.rejects(recoverLaunchDeployment(provider,opts({spec:{...spec,environmentCodeHashes:{...spec.environmentCodeHashes,identity:id('OTHER-CODE')}}})),/DEPLOY_RECOVERY_ENVIRONMENT_CODE/);
});
test('stale snapshots,wrong chain,canonical changes and RPC failure stop verification without displaying missing data as zero',async()=>{
 await assert.rejects(recoverLaunchDeployment(provider,opts({allowHistoricalLocal:false})),/DEPLOY_RECOVERY_STALE_BLOCK/);
 const wrong=wrap({send:async(method,params)=>method==='eth_chainId'?'0x38':provider.send(method,params)});await assert.rejects(recoverLaunchDeployment(wrong,opts()),/DEPLOY_RECOVERY_WRONG_CHAIN/);
 const head=await provider.getBlock('latest');let reads=0;const reorg=wrap({getBlock:async n=>{const block=await provider.getBlock(n);return n===head.number&&++reads>=2?{...block,hash:ZeroHash}:block;}});await assert.rejects(recoverLaunchDeployment(reorg,opts()),/DEPLOY_RECOVERY_BLOCK_REORG/);
 await assert.rejects(recoverLaunchDeployment(wrap({getCode:async()=>{throw Error('Test RPC unavailable');}}),opts()),/DEPLOY_RECOVERY_READ_UNAVAILABLE/);
 observations.push({name:'stale-chain-reorg-and-read-faults-rejected',cases:4});
});
