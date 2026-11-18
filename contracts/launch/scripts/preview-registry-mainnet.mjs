// Explicit first-Registry preview only. No execute/sign/broadcast path.
import fs from 'node:fs';import path from 'node:path';
import {FetchRequest,JsonRpcProvider,formatEther} from 'ethers';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
import {inspectReleaseNetwork} from '../lib/release-preflight.mjs';
import {buildLaunchDeploymentPlan} from './prepare-deployment.mjs';
import {OfficialWalletReviews} from '../lib/official-wallet-review.mjs';
const root=path.resolve(import.meta.dirname,'..'),destination=process.argv[2];
if(process.argv.length!==3||!destination||!path.isAbsolute(destination)||fs.existsSync(destination))throw Error('REGISTRY_NEW_REPORT_REQUIRED');
const configuration=inspectReleaseConfiguration(root),spec=JSON.parse(fs.readFileSync(path.join(root,'release/deployment-spec.confirmed.json'),'utf8')),bindings=JSON.parse(fs.readFileSync(path.join(root,'evidence/public-bindings-bsc56.json'),'utf8')),plan=await buildLaunchDeploymentPlan(spec),intent=plan.deployments[0],wallet=configuration.roles.gasWallet;
const mainnet=path.resolve(root,'../../work/echo-launch-production-20261115/mainnet'),db=path.join(mainnet,'wallet-reviews.sqlite');
if(intent.label!=='LaunchRegistry'||intent.predictedAddress.toLowerCase()!=='0x03a972943388833d26f47a51c3c28b164ac8a317'||intent.transaction.value!=='0'||!fs.existsSync(db))throw Error('REGISTRY_CONFIRMED_SCOPE_CHANGED');
const request=new FetchRequest('https://bsc-dataseed.bnbchain.org');request.timeout=15000;
const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});let reviews;
try{
 const network=await inspectReleaseNetwork(provider,{configuration,plan,bindings});
 const transaction={chainId:56,from:wallet,...intent.transaction};
 const [latestNonce,pendingNonce,balance,gasPrice,estimatedGas,latestCode]=await Promise.all([provider.getTransactionCount(wallet,'latest'),provider.getTransactionCount(wallet,'pending'),provider.getBalance(wallet,'latest'),provider.send('eth_gasPrice',[]),provider.estimateGas(transaction),provider.getCode(intent.predictedAddress,'latest')]);
 if(latestNonce!==pendingNonce)throw Error('REGISTRY_PENDING_WALLET_TRANSACTION');if(latestCode!=='0x')throw Error('REGISTRY_ALREADY_OCCUPIED_RECOVER_FIRST');
 const estimatedFee=estimatedGas*BigInt(gasPrice),diagnosticReserve=(estimatedFee*130n+99n)/100n;
 if(balance<diagnosticReserve)throw Error('REGISTRY_INSUFFICIENT_BNB_RESERVE');
 reviews=new OfficialWalletReviews({databasePath:db,wallet});
 const review=await reviews.preview({transaction,purpose:'deployment',intentId:intent.initCodeHash,context:{label:intent.label,predictedAddress:intent.predictedAddress,estimatedFeeWei:String(estimatedFee),observedAt:network.observedAt,nonce:latestNonce,gasPriceWei:String(BigInt(gasPrice))}});
 if(review.success===false)throw Error('REGISTRY_OFFICIAL_PREVIEW_REJECTED');
 const result={schema:'echo-launch-registry-fresh-preview/v1',observedAt:new Date().toISOString(),chainId:56,wallet,to:transaction.to,predictedRegistry:intent.predictedAddress,calldataBytes:(transaction.data.length-2)/2,initCodeHash:intent.initCodeHash,valueBNB:'0',balanceBNB:formatEther(balance),estimatedGas:String(estimatedGas),gasPriceWei:String(BigInt(gasPrice)),estimatedFeeBNB:formatEther(estimatedFee),diagnostic30PercentReserveBNB:formatEther(diagnosticReserve),explicitWalletFeeCapBound:false,nonce:latestNonce,pendingNonce,network,reviewId:review.id,approvalDigest:review.approvalDigest,previewExpiresAt:review.preview.expiresAt,previewExpiresAtISO:new Date(review.preview.expiresAt).toISOString(),parsedTx:review.preview.parsedTx,simulationResult:review.preview.simulationResult,risks:review.preview.risks,requireAppConfirmation:review.preview.requireConfirmation,officialSimulationPassed:true,independentAudit:false,staticHighFindings:4,issuanceOpen:false,subscriptionOpen:false,financialActionExecuted:false,freshConfirmationRequired:true};
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({...result,network:{anchor:network.anchor,helperVerified:network.helperVerified,dependencies:network.dependencies,deployments:network.deployments}},null,2));
}finally{reviews?.close();provider.destroy();}
