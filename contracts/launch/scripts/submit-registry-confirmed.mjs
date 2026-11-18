// One explicitly confirmed Registry call through the official terminal CLI.
// The durable wallet-review boundary prohibits an execute retry after timeout.
import fs from 'node:fs';import path from 'node:path';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
import {inspectReleaseNetwork} from '../lib/release-preflight.mjs';
import {OfficialWalletReviews,reviewDigest} from '../lib/official-wallet-review.mjs';
import {buildLaunchDeploymentPlan} from './prepare-deployment.mjs';
const root=path.resolve(import.meta.dirname,'..'),[previewFile,confirmationFile,resultFile]=process.argv.slice(2),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
if(process.argv.length!==5||[previewFile,confirmationFile,resultFile].some(f=>!path.isAbsolute(f))||fs.existsSync(resultFile))throw Error('REGISTRY_EXPLICIT_NEW_RESULT_REQUIRED');
const preview=JSON.parse(fs.readFileSync(previewFile,'utf8')),confirmation=JSON.parse(fs.readFileSync(confirmationFile,'utf8'));
if(preview.schema!=='echo-launch-registry-fresh-preview/v1'||!preview.officialSimulationPassed||preview.previewExpiresAt<=Date.now()||confirmation.userAnswer!=='确认执行本次 Registry 部署'||confirmation.approvalDigest!==preview.approvalDigest||confirmation.humanConfirmed!==true)throw Error('REGISTRY_FRESH_CONFIRMATION_REQUIRED');
const configuration=inspectReleaseConfiguration(root),spec=JSON.parse(fs.readFileSync(path.join(root,'release/deployment-spec.confirmed.json'),'utf8')),bindings=JSON.parse(fs.readFileSync(path.join(root,'evidence/public-bindings-bsc56.json'),'utf8')),plan=await buildLaunchDeploymentPlan(spec),intent=plan.deployments[0],wallet=configuration.roles.gasWallet;
if(!same(preview.wallet,wallet)||!same(preview.predictedRegistry,intent.predictedAddress)||preview.initCodeHash!==intent.initCodeHash||intent.transaction.value!=='0')throw Error('REGISTRY_CONFIRMED_INTENT_CHANGED');
const request=new FetchRequest('https://bsc-dataseed.bnbchain.org');request.timeout=15000;const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1}),reviews=new OfficialWalletReviews({databasePath:path.resolve(root,'../../work/echo-launch-production-20261115/mainnet/wallet-reviews.sqlite'),wallet});
try{
 const result=await reviews.submitConfirmed({id:preview.reviewId,confirmation,revalidate:async review=>{
  if(review.approvalDigest!==preview.approvalDigest||review.intentId!==intent.initCodeHash||!same(review.transaction.from,wallet)||!same(review.transaction.to,intent.transaction.to)||review.transaction.data!==intent.transaction.data||review.transaction.value!=='0')throw Error('REGISTRY_REVIEW_CHANGED');
  await inspectReleaseNetwork(provider,{configuration,plan,bindings});
  const [confirmedNonce,pendingNonce,balance,price,gas,code]=await Promise.all([provider.getTransactionCount(wallet,'latest'),provider.getTransactionCount(wallet,'pending'),provider.getBalance(wallet,'latest'),provider.send('eth_gasPrice',[]),provider.estimateGas(review.transaction),provider.getCode(intent.predictedAddress,'latest')]);
  if(confirmedNonce!==preview.nonce||pendingNonce!==confirmedNonce||code!=='0x'||BigInt(price)>BigInt(preview.gasPriceWei)||gas>BigInt(preview.estimatedGas)*130n/100n||balance<gas*BigInt(price)*130n/100n)throw Error('REGISTRY_STATE_OR_FEE_CHANGED');
  return {intentVerified:true,chainId:56,transactionDigest:reviewDigest(review.transaction),pendingNonce,confirmedNonce,observedAtMs:Date.now()};
 }});
 const record={schema:'echo-launch-registry-submission/v1',observedAt:new Date().toISOString(),chainId:56,wallet,predictedRegistry:intent.predictedAddress,reviewId:preview.reviewId,confirmationSource:confirmation.source,userAnswer:confirmation.userAnswer,...result,issuanceOpen:false,subscriptionOpen:false};
 fs.writeFileSync(resultFile,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record,null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'REGISTRY_SUBMIT_STOPPED',retryAllowed:false,manualRecoveryRequired:true}));process.exitCode=1;}
finally{reviews.close();provider.destroy();}
