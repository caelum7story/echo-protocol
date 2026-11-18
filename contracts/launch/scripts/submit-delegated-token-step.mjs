// At most the two exact token deployment steps authorized in this chat.
// Uses the existing durable one-shot official-wallet journal;never retries execute.
import fs from 'node:fs';import path from 'node:path';
import {Contract,FetchRequest,JsonRpcProvider,keccak256} from 'ethers';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
import {buildLaunchDeploymentPlan} from './prepare-deployment.mjs';
import {OfficialWalletReviews,reviewDigest} from '../lib/official-wallet-review.mjs';
const root=path.resolve(import.meta.dirname,'..'),[stage,previewFile,resultFile]=process.argv.slice(2),mainnet=path.resolve(root,'../../work/echo-launch-production-20261115/mainnet'),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
if(process.argv.length!==5||!['factory','register-token'].includes(stage)||![previewFile,resultFile].every(path.isAbsolute)||fs.existsSync(resultFile))throw Error('TOKEN_STEP_NEW_RESULT_REQUIRED');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),preview=read(previewFile),grant=read(path.join(mainnet,'project-completion-delegation-20261115.json')),configuration=inspectReleaseConfiguration(root),spec=read(path.join(root,'release/deployment-spec.confirmed.json')),plan=await buildLaunchDeploymentPlan(spec),current=read(path.join(mainnet,'current-deployment.json')),wallet=configuration.roles.gasWallet;
const normalize=transaction=>({chainId:56,from:wallet,to:transaction.to,value:'0',data:transaction.data}),factoryTx={...normalize(plan.deployments[2].transaction),gasLimit:'9000000'},registerTx=normalize(plan.registrations[1].transaction),expected=stage==='factory'?factoryTx:registerTx;
if(grant.schema!=='echo-launch-project-completion-delegation/v1'||grant.userAuthorizationType!=='standing-project-delegation'||grant.expiresAtMs<=Date.now()||!same(grant.wallet,wallet)||!same(grant.factory,plan.deployments[2].predictedAddress)||!same(grant.registry,current.registry.address)||grant.estimatedRemainingGasBudgetWei!=='1000000000000000'||grant.economicChangesAllowed!==false||grant.extraWalletPermissionsAllowed!==false||preview.previewAccepted!==true||preview.previewExpiresAt<=Date.now())throw Error('TOKEN_STEP_AUTHORITY_OR_PREVIEW_REQUIRED');
const original=preview.officialPreview?.data;
if(original?.simulationResult?.simulationCode!=='000000000'||original.simulationResult.simulationErrorDetail||original.simulationResult.authorityChanges?.length||original.simulationResult.allowanceChanges?.length||original.risks?.riskDetails?.length||original.risks?.riskBehaviors?.length||Object.keys(original.risks?.addresses??{}).length)throw Error('TOKEN_STEP_UNREVIEWED_RISK');
if(stage==='factory'&&original.gasLimit!==9000000)throw Error('TOKEN_STEP_GAS_LIMIT_NOT_BOUND');
if(stage==='register-token'&&!current.tokenFactoryDeployed)throw Error('TOKEN_STEP_FACTORY_REQUIRED');
const authority={schema:'echo-launch-bounded-deployment-authority/v1',chainId:56,wallet,source:grant.source,recordedAtMs:Date.parse(grant.recordedAt),expiresAtMs:grant.expiresAtMs,allowedTransactionDigests:[reviewDigest(factoryTx),reviewDigest(registerTx)],estimatedGasBudgetWei:grant.estimatedRemainingGasBudgetWei,estimatedBudgetIsNotSignedFeeCap:true};
const confirmation={authorizationType:'bounded-project-delegation',approvalDigest:preview.approvalDigest,acknowledgedWalletEstimatedGas:true,reviewPreparedAtMs:Date.now(),authority};
const request=new FetchRequest('https://bsc-rpc.publicnode.com');request.timeout=15000;const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1}),reviews=new OfficialWalletReviews({databasePath:path.join(mainnet,'wallet-reviews.sqlite'),wallet});
try{
 const result=await reviews.submitConfirmed({id:preview.reviewId,confirmation,revalidate:async review=>{
  if(reviewDigest(review.transaction)!==reviewDigest(expected)||review.approvalDigest!==preview.approvalDigest)throw Error('TOKEN_STEP_REVIEW_CHANGED');
  const head=await provider.getBlock('latest'),now=Math.floor(Date.now()/1000);if(Number(BigInt(await provider.send('eth_chainId',[])))!==56||!head||now-head.timestamp>120||head.timestamp>now+30)throw Error('TOKEN_STEP_CHAIN_STALE');
  const at=head.number-12,block=await provider.getBlock(at),registryArtifact=read(path.join(root,'artifacts/LaunchRegistry.json')),registry=new Contract(current.registry.address,registryArtifact.abi,provider);
  const [registryCode,proxyCode,envOk,admin,recipient,nonce,pendingNonce,balance,gasPriceRaw,gas]=await Promise.all([provider.getCode(current.registry.address,at),provider.getCode(plan.deployments[2].proxy,at),registry.environmentUnchanged({blockTag:at}),registry.platformAdmin({blockTag:at}),registry.platformRecipient({blockTag:at}),provider.getTransactionCount(wallet,'latest'),provider.getTransactionCount(wallet,'pending'),provider.getBalance(wallet,'latest'),provider.send('eth_gasPrice',[]),provider.estimateGas(review.transaction)]);
  if(keccak256(registryCode)!==current.registry.runtimeHash||keccak256(proxyCode)!==plan.deployments[2].proxyRuntimeHash||!envOk||!same(admin,configuration.roles.platformAdmin)||!same(recipient,configuration.roles.platformRecipient)||nonce!==preview.latestNonce||pendingNonce!==nonce)throw Error('TOKEN_STEP_STATE_CHANGED');
  if(stage==='factory'){if(await provider.getCode(plan.deployments[2].predictedAddress,'latest')!=='0x')throw Error('TOKEN_FACTORY_OCCUPIED_RECOVER_FIRST');}
  else{const t=await registry.templates(plan.templates.tokenVersion,{blockTag:at});if(!same(t.factory,'0x0000000000000000000000000000000000000000'))throw Error('TOKEN_TEMPLATE_EXISTS_RECOVER_FIRST');if(keccak256(await provider.getCode(current.tokenFactory.address,at))!==current.tokenFactory.runtimeHash)throw Error('TOKEN_FACTORY_RUNTIME_CHANGED');}
  const gasPrice=BigInt(gasPriceRaw),gasUnits=stage==='factory'?9000000n:(gas*130n+99n)/100n,fee=gasUnits*gasPrice,spent=BigInt(current.delegatedDeploymentGasSpentWei??'0');
  if(gasUnits<gas||balance<fee||fee+spent>BigInt(authority.estimatedGasBudgetWei)||(await provider.getBlock(at))?.hash!==block.hash)throw Error('TOKEN_STEP_BUDGET_OR_BLOCK_CHANGED');
  return {intentVerified:true,chainId:56,transactionDigest:reviewDigest(review.transaction),pendingNonce,confirmedNonce:nonce,observedAtMs:Date.now(),cumulativeEstimatedFeeWei:String(spent+fee)};
 }});
 const record={schema:'echo-launch-token-step-submission/v1',observedAt:new Date().toISOString(),stage,chainId:56,wallet,reviewId:preview.reviewId,predictedFactory:plan.deployments[2].predictedAddress,registry:current.registry.address,standingUserAuthorizationSource:grant.source,...result,issuanceUiOpen:false,subscriptionUiOpen:false};
 fs.writeFileSync(resultFile,JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record,null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'TOKEN_STEP_SUBMIT_STOPPED',retryAllowed:false}));process.exitCode=1;}
finally{reviews.close();provider.destroy();}
