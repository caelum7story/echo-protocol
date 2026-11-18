// Read-only public-chain proof for the explicitly submitted first Registry.
import fs from 'node:fs';import path from 'node:path';
import {FetchRequest,JsonRpcProvider,formatEther} from 'ethers';
import {OfficialWalletReviews,reviewDigest} from '../lib/official-wallet-review.mjs';
import {recoverLaunchDeployment} from './recover-deployment.mjs';
const root=path.resolve(import.meta.dirname,'..'),[previewFile,submissionFile,resultFile]=process.argv.slice(2);
if(process.argv.length!==5||[previewFile,submissionFile,resultFile].some(f=>!path.isAbsolute(f))||fs.existsSync(resultFile))throw Error('REGISTRY_NEW_RECOVERY_REPORT_REQUIRED');
const preview=JSON.parse(fs.readFileSync(previewFile,'utf8')),submission=JSON.parse(fs.readFileSync(submissionFile,'utf8')),spec=JSON.parse(fs.readFileSync(path.join(root,'release/deployment-spec.confirmed.json'),'utf8'));
if(!/^0x[0-9a-fA-F]{64}$/.test(submission.result?.txHash??'')||submission.reviewId!==preview.reviewId||submission.userAnswer!=='确认执行本次 Registry 部署')throw Error('REGISTRY_SUBMISSION_HASH_REQUIRED');
spec.environmentCodeHashes=Object.fromEntries(Object.entries(preview.network.dependencies).map(([key,value])=>[key,value.runtimeHash]));
// The dataseed endpoints returned missing trie node for historical state.
// PublicNode was independently probed for this receipt block before switching.
const rpcUrl='https://bsc-rpc.publicnode.com';
const request=new FetchRequest(rpcUrl);request.timeout=15000;const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1}),reviews=new OfficialWalletReviews({databasePath:path.resolve(root,'../../work/echo-launch-production-20261115/mainnet/wallet-reviews.sqlite'),wallet:submission.wallet});
const tracedProvider=new Proxy(provider,{get(target,key){const value=Reflect.get(target,key);if(typeof value!=='function')return value;return async(...args)=>{try{return await value.apply(target,args);}catch(error){console.error(JSON.stringify({readMethod:String(key),code:error.code??null,shortMessage:error.shortMessage??null,reason:error.reason??null,serverMessage:String(error.error?.message??error.info?.error?.message??'').slice(0,180),args:key==='getCode'?args:undefined}));throw error;}};}});
try{
 let deploymentRecovery;
 const receipt=await reviews.reconcileReceipt({id:submission.reviewId,provider,transactionHash:submission.result.txHash,verifyIntent:async({review,receipt})=>{
  deploymentRecovery=await recoverLaunchDeployment(tracedProvider,{spec,records:{registry:{hash:receipt.transactionHash,expectedSender:submission.wallet}},minConfirmations:12,maxBlockAgeSeconds:120});
  const registry=deploymentRecovery.steps.find(s=>s.key==='registry');
  if(registry?.status!=='deployed-configuration-verified'||registry.receipt?.status!=='confirmed'||registry.address.toLowerCase()!==preview.predictedRegistry.toLowerCase()||registry.receipt.blockHash.toLowerCase()!==receipt.blockHash.toLowerCase())throw Error('REGISTRY_RUNTIME_OR_RECEIPT_UNVERIFIED');
  return {intentVerified:true,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,transactionDigest:reviewDigest(review.transaction)};
 }});
 const result={schema:'echo-launch-registry-confirmation/v1',observedAt:new Date().toISOString(),chainId:56,rpcUrl,address:preview.predictedRegistry,transactionHash:submission.result.txHash,receipt,deploymentRecovery,balanceAfterBNB:formatEther(await provider.getBalance(submission.wallet,'latest')),actualGasFeeBNB:receipt.actualFeeWei?formatEther(receipt.actualFeeWei):null,issuanceOpen:false,subscriptionOpen:false,nextTransactionsAuthorized:false,independentAudit:false};
 fs.writeFileSync(resultFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({address:result.address,transactionHash:result.transactionHash,receipt:result.receipt,registry:deploymentRecovery?.steps.find(s=>s.key==='registry'),balanceAfterBNB:result.balanceAfterBNB,actualGasFeeBNB:result.actualGasFeeBNB,issuanceOpen:false,subscriptionOpen:false},null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'REGISTRY_RECOVERY_READ_FAILED',retryAllowed:false,broadcast:false}));process.exitCode=1;}
finally{reviews.close();provider.destroy();}
