// Read-only reconciliation of either delegated token step;unknown submissions are not retried.
import fs from 'node:fs';import path from 'node:path';import {FetchRequest,JsonRpcProvider,Contract,formatEther} from 'ethers';
import {OfficialWalletReviews,reviewDigest} from '../lib/official-wallet-review.mjs';import {recoverLaunchDeployment} from './recover-deployment.mjs';
const root=path.resolve(import.meta.dirname,'..'),[submissionFile,resultFile]=process.argv.slice(2),mainnet=path.resolve(root,'../../work/echo-launch-production-20261115/mainnet'),read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
if(process.argv.length!==4||![submissionFile,resultFile].every(path.isAbsolute)||fs.existsSync(resultFile))throw Error('TOKEN_STEP_NEW_RECEIPT_REPORT_REQUIRED');
const submission=read(submissionFile),current=read(path.join(mainnet,'current-deployment.json')),spec=read(path.join(root,'release/deployment-spec.confirmed.json')),bindings=read(path.join(root,'evidence/public-bindings-bsc56.json'));
spec.environmentCodeHashes=Object.fromEntries([['identity','identity'],['dexFactory','factory'],['router','router'],['wbnb','wbnb']].map(([a,b])=>[a,bindings.contracts[b].observedRuntimeHash]));
const stage=submission.stage;if(!['factory','register-token'].includes(stage)||!/^0x[0-9a-fA-F]{64}$/.test(submission.result?.txHash??''))throw Error('TOKEN_STEP_KNOWN_SUBMISSION_REQUIRED');
const records={registry:{hash:current.registry.transactionHash,expectedSender:submission.wallet}};
if(stage==='factory')records.tokenFactory={hash:submission.result.txHash,expectedSender:submission.wallet};else{records.tokenFactory={hash:current.tokenFactory.transactionHash,expectedSender:submission.wallet};records.registerToken={hash:submission.result.txHash,expectedSender:submission.wallet};}
const request=new FetchRequest('https://bsc-rpc.publicnode.com');request.timeout=15000;const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1}),reviews=new OfficialWalletReviews({databasePath:path.join(mainnet,'wallet-reviews.sqlite'),wallet:submission.wallet});
try{
 let recovery;const key=stage==='factory'?'tokenFactory':'registerToken';
 const receipt=await reviews.reconcileReceipt({id:submission.reviewId,provider,transactionHash:submission.result.txHash,verifyIntent:async({review,receipt})=>{
  recovery=await recoverLaunchDeployment(provider,{spec,records,minConfirmations:12,maxBlockAgeSeconds:120});const step=recovery.steps.find(s=>s.key===key);
  if(step?.status!==(stage==='factory'?'deployed-configuration-verified':'registered')||step.receipt?.status!=='confirmed'||step.receipt.blockHash.toLowerCase()!==receipt.blockHash.toLowerCase())throw Error('TOKEN_STEP_RUNTIME_OR_EVENT_UNVERIFIED');
  return {intentVerified:true,transactionHash:receipt.transactionHash,blockHash:receipt.blockHash,transactionDigest:reviewDigest(review.transaction)};
 }});
 const result={schema:'echo-launch-token-step-confirmation/v1',observedAt:new Date().toISOString(),stage,chainId:56,transactionHash:submission.result.txHash,receipt,recovery,balanceAfterBNB:formatEther(await provider.getBalance(submission.wallet,'latest')),actualGasFeeBNB:receipt.actualFeeWei?formatEther(receipt.actualFeeWei):null};
 fs.writeFileSync(resultFile,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 if(receipt.confirmed){
  const latest=read(path.join(mainnet,'current-deployment.json')),applied=latest.delegatedDeploymentFeeTransactions??[];
  if(!applied.includes(result.transactionHash)){latest.delegatedDeploymentGasSpentWei=String(BigInt(latest.delegatedDeploymentGasSpentWei??'0')+BigInt(receipt.actualFeeWei));applied.push(result.transactionHash);latest.delegatedDeploymentFeeTransactions=applied;}
  latest.balanceBNB=result.balanceAfterBNB;latest.financialTransactionsSubmitted=stage==='factory'?2:3;
  if(stage==='factory'){
   const s=recovery.steps.find(x=>x.key==='tokenFactory'),a=read(path.join(root,'artifacts/TokenLaunchFactory.json')),factory=new Contract(s.address,a.abi,provider);
   latest.tokenFactoryDeployed=true;latest.tokenFactory={address:s.address,runtimeHash:s.runtimeHash,transactionHash:result.transactionHash,blockNumber:receipt.blockNumber,creationCodeStore:await factory.creationCodeStore(),creationCodeHash:await factory.creationCodeHash(),versionId:await factory.versionId()};
  }else{latest.templatesRegistered=true;latest.tokenTemplate={...recovery.steps.find(s=>s.key==='registerToken'),transactionHash:result.transactionHash,blockNumber:receipt.blockNumber};}
  latest.lastMainnetStepAt=result.observedAt;fs.writeFileSync(path.join(mainnet,'current-deployment.json'),JSON.stringify(latest,null,2)+'\n');
 }
 console.log(JSON.stringify({stage,transactionHash:result.transactionHash,receipt:result.receipt,step:recovery?.steps.find(s=>s.key===key),balanceAfterBNB:result.balanceAfterBNB,actualGasFeeBNB:result.actualGasFeeBNB},null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'TOKEN_STEP_RECEIPT_READ_FAILED',broadcast:false,retryAllowed:false}));process.exitCode=1;}
finally{reviews.close();provider.destroy();}
