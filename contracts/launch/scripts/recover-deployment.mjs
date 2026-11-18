import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AbiCoder,Contract,FetchRequest,Interface,JsonRpcProvider,ZeroAddress,ZeroHash,getAddress,getCreateAddress,keccak256} from 'ethers';
import {buildLaunchDeploymentPlan,loadDeploymentProxyReference} from './prepare-deployment.mjs';
import {getDeploymentLayouts,expectedDeploymentRuntime,assertDeploymentLayoutsCurrent} from './deployment-layout.mjs';
const root=path.resolve(import.meta.dirname,'..'),keys=['registry','nftFactory','tokenFactory','registerNft','registerToken'];
const fail=code=>{throw Error(code);},same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',name+'.json'),'utf8'));
const hash32=value=>{if(typeof value!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value)||same(value,ZeroHash))fail('DEPLOY_RECOVERY_HASH');return value.toLowerCase();};
const addr=value=>{try{const out=getAddress(value);if(out===ZeroAddress)fail('DEPLOY_RECOVERY_ADDRESS');return out;}catch{fail('DEPLOY_RECOVERY_ADDRESS');}};
const number=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)fail('DEPLOY_RECOVERY_READ_POLICY');return value;};
const environmentType='tuple(address identity,address platformAdmin,address platformRecipient,address dexFactory,address router,address wbnb,uint256 oracleWindow,uint256 oracleMaxAge)';
export async function recoverLaunchDeployment(provider,{spec,records={},minConfirmations=12,maxBlockAgeSeconds=120,allowHistoricalLocal=false}={}){
 try{return await recover(provider,{spec,records,minConfirmations,maxBlockAgeSeconds,allowHistoricalLocal});}
 catch(error){if(/^DEPLOY_[A-Z_]+$/.test(error.message))throw error;fail('DEPLOY_RECOVERY_READ_UNAVAILABLE');}
}
async function recover(provider,{spec,records,minConfirmations,maxBlockAgeSeconds,allowHistoricalLocal}){
 const reference=loadDeploymentProxyReference(),plan=await buildLaunchDeploymentPlan(spec,{reference}),layouts=getDeploymentLayouts();
 number(minConfirmations,1,10000);number(maxBlockAgeSeconds,1,600);
 if(allowHistoricalLocal&&plan.chainId!==31337)fail('DEPLOY_RECOVERY_LOCAL_HISTORY_ONLY');
 if(Number(BigInt(await provider.send('eth_chainId',[])))!==plan.chainId)fail('DEPLOY_RECOVERY_WRONG_CHAIN');
 if(!records||typeof records!=='object'||Array.isArray(records)||Object.keys(records).some(k=>!keys.includes(k)))fail('DEPLOY_RECOVERY_RECORDS');
 const latest=await provider.getBlock('latest');if(!latest||latest.number<minConfirmations-1)fail('DEPLOY_RECOVERY_CONFIRMATIONS_UNAVAILABLE');
 const block=await provider.getBlock(latest.number-minConfirmations+1);if(!block)fail('DEPLOY_RECOVERY_BLOCK_UNAVAILABLE');
 const now=Math.floor(Date.now()/1000);
 if(!allowHistoricalLocal&&([latest,block].some(b=>!Number.isSafeInteger(b.timestamp)||now-b.timestamp>maxBlockAgeSeconds||b.timestamp-now>30)))fail('DEPLOY_RECOVERY_STALE_BLOCK');
 if(!same(keccak256(await provider.getCode(reference.address,block.number)),reference.runtimeHash))fail('DEPLOY_RECOVERY_HELPER_CODE');
 const e=plan.environment,environmentCodeHashes={};
 for(const role of ['identity','dexFactory','router','wbnb']){const expected=hash32(spec.environmentCodeHashes?.[role]),code=await provider.getCode(e[role],block.number);if(code==='0x'||!same(keccak256(code),expected))fail('DEPLOY_RECOVERY_ENVIRONMENT_CODE');environmentCodeHashes[role]=expected;}
 const router=new Contract(e.router,['function factory() view returns(address)','function WETH() view returns(address)'],provider);
 if(!same(await router.factory({blockTag:block.number}),e.dexFactory)||!same(await router.WETH({blockTag:block.number}),e.wbnb))fail('DEPLOY_RECOVERY_ROUTER_BINDINGS');
 const registryAddress=plan.deployments[0].predictedAddress,store=getCreateAddress({from:plan.deployments[2].predictedAddress,nonce:1});
 const immutableValues=[{...e,environmentHash:keccak256(AbiCoder.defaultAbiCoder().encode(['uint256',environmentType],[plan.chainId,e])),identityRuntimeHash:environmentCodeHashes.identity,dexFactoryRuntimeHash:environmentCodeHashes.dexFactory,routerRuntimeHash:environmentCodeHashes.router,wbnbRuntimeHash:environmentCodeHashes.wbnb},
  {registry:registryAddress,versionId:plan.templates.nftVersion,creationCodeHash:keccak256(layouts.creationBytecodes.NftLaunch)},
  {registry:registryAddress,versionId:plan.templates.tokenVersion,creationCodeHash:keccak256(layouts.creationBytecodes.TokenLaunch),creationCodeStore:store}];
 const expectedCodes=plan.deployments.map((intent,i)=>expectedDeploymentRuntime(intent.label,immutableValues[i],layouts)),states=[];
 async function verifyCode(index,at){const code=await provider.getCode(plan.deployments[index].predictedAddress,at);if(!same(code,expectedCodes[index]))fail('DEPLOY_RECOVERY_RUNTIME_OR_IMMUTABLE');if(index===2&& !same(await provider.getCode(store,at),'0x00'+layouts.creationBytecodes.TokenLaunch.slice(2)))fail('DEPLOY_RECOVERY_CREATION_CODE_STORE');return keccak256(code);}
 for(const [i,intent]of plan.deployments.entries()){
  const code=await provider.getCode(intent.predictedAddress,block.number),nonce=await provider.getTransactionCount(intent.predictedAddress,block.number);number(nonce,0,Number.MAX_SAFE_INTEGER);
  if(code==='0x'){if(nonce!==0)fail('DEPLOY_RECOVERY_OCCUPIED_NONCE');states.push({key:keys[i],address:intent.predictedAddress,status:'not-deployed',runtimeHash:null});}
  else states.push({key:keys[i],address:intent.predictedAddress,status:'deployed-configuration-verified',runtimeHash:await verifyCode(i,block.number)});
 }
 const registry=new Contract(registryAddress,artifact('LaunchRegistry').abi,provider),registryInterface=new Interface(artifact('LaunchRegistry').abi),templateProofs=[];
 async function verifyTemplate(index,at,{allowMissing=true}={}){
  const version=index===0?plan.templates.nftVersion:plan.templates.tokenVersion,entry=await registry.templates(version,{blockTag:at});
  if(same(entry.factory,ZeroAddress)){if(!allowMissing)fail('DEPLOY_RECOVERY_TEMPLATE_MISSING');return {status:'not-registered'};}
  if(!same(entry.factory,plan.deployments[index+1].predictedAddress)||!same(entry.factoryRuntimeHash,keccak256(expectedCodes[index+1]))||!same(entry.creationCodeHash,immutableValues[index+1].creationCodeHash)||!same(entry.reviewDocumentHash,index===0?plan.templates.nftReviewDocumentHash:plan.templates.tokenReviewDocumentHash)||Number(entry.kind)!==index+1)fail('DEPLOY_RECOVERY_TEMPLATE_CONFLICT');
  return {status:entry.enabled?'registered':'registered-disabled',versionId:version,factory:entry.factory,factoryRuntimeHash:entry.factoryRuntimeHash,creationCodeHash:entry.creationCodeHash,reviewDocumentHash:entry.reviewDocumentHash};
 }
 for(let i=0;i<2;i++){const proof=states[0].status==='not-deployed'?{status:'registry-not-deployed'}:await verifyTemplate(i,block.number);if(proof.status.startsWith('registered')&&states[i+1].status==='not-deployed')fail('DEPLOY_RECOVERY_TEMPLATE_FACTORY_MISSING');templateProofs.push(proof);states.push({key:keys[i+3],address:registryAddress,...proof});}
 const receiptProofs=[];
 for(const [i,key]of keys.entries()){
  const record=records[key];if(!record){receiptProofs.push({key,status:'no-recorded-submission',callerAttributed:false});continue;}
  if(typeof record!=='object'||Array.isArray(record))fail('DEPLOY_RECOVERY_RECORDS');
  const txHash=hash32(record.hash),expectedSender=addr(record.expectedSender),transaction=await provider.getTransaction(txHash),receipt=await provider.getTransactionReceipt(txHash),expected=i<3?plan.deployments[i].transaction:plan.registrations[i-3].transaction;
  if(!transaction){receiptProofs.push({key,hash:txHash,status:'unresolved',callerAttributed:false,reason:receipt?'Receipt exists but transaction envelope is unavailable':'Transaction and receipt unavailable;never infer dropped or retry automatically'});continue;}
  // This adapter only attributes direct outer EVM calls. AA/relayer/batch envelopes need their own reviewed adapter.
  if(!same(transaction.hash,txHash)||Number(transaction.chainId)!==plan.chainId||!same(transaction.from,expectedSender)||!same(transaction.to,expected.to)||!same(transaction.data,expected.data)||BigInt(transaction.value)!==0n)fail('DEPLOY_RECOVERY_UNSUPPORTED_OR_CHANGED_ENVELOPE');
  if(!receipt){receiptProofs.push({key,hash:txHash,status:'pending',callerAttributed:true});continue;}
  if(!same(receipt.hash??receipt.transactionHash,txHash)||!same(receipt.from,expectedSender)||!same(receipt.to,expected.to)||receipt.contractAddress!==null||receipt.blockNumber!==transaction.blockNumber||!same(receipt.blockHash,transaction.blockHash)||![0,1].includes(receipt.status)||receipt.blockNumber>latest.number)fail('DEPLOY_RECOVERY_RECEIPT_MISMATCH');
  const receiptBlock=await provider.getBlock(receipt.blockNumber);if(!same(receiptBlock?.hash,receipt.blockHash))fail('DEPLOY_RECOVERY_RECEIPT_REORG');
  if(receipt.blockNumber>block.number){receiptProofs.push({key,hash:txHash,status:'confirming',observedReceiptStatus:receipt.status,callerAttributed:true,confirmations:latest.number-receipt.blockNumber+1});continue;}
  if(receipt.status===0){receiptProofs.push({key,hash:txHash,status:'failed',callerAttributed:true,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash});continue;}
  if(i<3){if(!same(keccak256(await provider.getCode(reference.address,receipt.blockNumber)),reference.runtimeHash))fail('DEPLOY_RECOVERY_HISTORICAL_HELPER');await verifyCode(i,receipt.blockNumber);}
  else{
   if(!same(await provider.getCode(registryAddress,receipt.blockNumber),expectedCodes[0]))fail('DEPLOY_RECOVERY_HISTORICAL_REGISTRY');
   const index=i-3,version=index===0?plan.templates.nftVersion:plan.templates.tokenVersion,review=index===0?plan.templates.nftReviewDocumentHash:plan.templates.tokenReviewDocumentHash;
   const matches=receipt.logs.filter(log=>same(log.address,registryAddress)).flatMap(log=>{try{const event=registryInterface.parseLog(log);return event?.name==='TemplateRegistered'?[event]:[];}catch{return [];}}).filter(event=>same(event.args.versionId,version)&&same(event.args.factory,plan.deployments[index+1].predictedAddress)&&Number(event.args.kind)===index+1&&same(event.args.creationCodeHash,immutableValues[index+1].creationCodeHash)&&same(event.args.reviewDocumentHash,review));
   if(matches.length!==1)fail('DEPLOY_RECOVERY_TEMPLATE_EVENT');await verifyTemplate(index,receipt.blockNumber,{allowMissing:false});
  }
  if(!same((await provider.getBlock(receipt.blockNumber))?.hash,receipt.blockHash))fail('DEPLOY_RECOVERY_RECEIPT_REORG');
  receiptProofs.push({key,hash:txHash,status:'confirmed',callerAttributed:true,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,confirmations:latest.number-receipt.blockNumber+1});
 }
 if(!same((await provider.getBlock(block.number))?.hash,block.hash)||!same((await provider.getBlock(latest.number))?.hash,latest.hash))fail('DEPLOY_RECOVERY_BLOCK_REORG');assertDeploymentLayoutsCurrent(layouts);
 const unsettled=receiptProofs.some(p=>['unresolved','pending','confirming'].includes(p.status));
 const steps=states.map((state,i)=>{const proof=receiptProofs[i],done=['deployed-configuration-verified','registered'].includes(state.status),blocked=state.status==='registered-disabled';return {...state,receipt:proof,
  nextAction:blocked?'stop-template-retired-do-not-reactivate':unsettled?'wait-and-reconcile-known-submissions':done?'skip-repeat-recheck-before-dependent-preview':proof.status==='failed'?'failed-submission-needs-new-state-wallet-preview-and-user-confirmation':'check-wallet-pending-nonce-and-prepare-fresh-preview',automaticSubmissionAllowed:false};});
 const configurationVerified=states.slice(0,3).every(s=>s.status==='deployed-configuration-verified')&&templateProofs.every(p=>p.status==='registered');
 return {schema:'echo-launch-readonly-deployment-recovery/v1',observedAt:new Date().toISOString(),chainId:plan.chainId,blockNumber:block.number,blockHash:block.hash,headNumber:latest.number,minConfirmations,maxBlockAgeSeconds,historicalLocalOverride:allowHistoricalLocal,environmentCodeHashes,steps,configurationVerified,knownSubmissionsSettled:!unsettled,
  runtimeCandidate:configurationVerified?{schema:'echo-launch-runtime/v1',chainId:plan.chainId,mode:plan.chainId===31337?'local-test':plan.chainId===97?'testnet':'production',executionReady:false,registry:{address:registryAddress,runtimeHash:states[0].runtimeHash},approvedTemplates:templateProofs.map((p,i)=>({kind:i+1,versionId:p.versionId,creationCodeHash:p.creationCodeHash,factoryRuntimeHash:p.factoryRuntimeHash})),minConfirmations,maxBlockAgeSeconds,notes:'Read-only configuration candidate. No signing,spending,release approval or official wallet compatibility is established.'}:null,
  directOuterEvmReceiptAdapterOnly:true,binanceWalletPreviewVerified:false,readOnly:true,executionReady:false,productionReady:false,broadcast:false,filesModified:false,
  limitations:['Source/compiler/immutable positions and exact runtime are checked;this is not independent security review.','No receipt record means no caller or gas attribution;verified existing state is distinct from proof of a user submission.','Unknown,pending or confirming hashes never authorize a new submission. Retired templates are never reactivated.','AA/relayer/batch wallet envelopes need a separate reviewed adapter and real-wallet evidence.','Every later financial action requires fresh wallet/status/simulation,fee display and explicit user confirmation.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file]=process.argv.slice(2);if(!file||process.argv.length!==3||!process.env.ECHO_LAUNCH_RPC_URL)throw Error('Usage: set ECHO_LAUNCH_RPC_URL,then node scripts/recover-deployment.mjs <explicit-spec-and-records.json>');
 const input=JSON.parse(fs.readFileSync(file,'utf8')),request=new FetchRequest(process.env.ECHO_LAUNCH_RPC_URL);request.timeout=15000;const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});
 try{console.log(JSON.stringify(await recoverLaunchDeployment(provider,input),null,2));}finally{provider.destroy();}
}
