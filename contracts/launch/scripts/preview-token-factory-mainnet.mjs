// The next exact,confirmed-template transaction is previewed even when the locally
// observed balance is low,so the official CLI can report its actual result.
// There is deliberately no execute/sign/broadcast path in this command.
import fs from 'node:fs';import path from 'node:path';
import {Contract,FetchRequest,JsonRpcProvider,formatEther,keccak256} from 'ethers';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
import {buildLaunchDeploymentPlan} from './prepare-deployment.mjs';
import {OfficialWalletReviews,officialTransport} from '../lib/official-wallet-review.mjs';
const root=path.resolve(import.meta.dirname,'..'),destination=process.argv[2],gasAuthorizationFile=process.argv[3],same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
if(![3,4].includes(process.argv.length)||!destination||!path.isAbsolute(destination)||fs.existsSync(destination)||gasAuthorizationFile&&!path.isAbsolute(gasAuthorizationFile))throw Error('TOKEN_FACTORY_NEW_REPORT_REQUIRED');
const gasLimitAuthorization=gasAuthorizationFile?JSON.parse(fs.readFileSync(gasAuthorizationFile,'utf8')):undefined;
const configuration=inspectReleaseConfiguration(root),spec=JSON.parse(fs.readFileSync(path.join(root,'release/deployment-spec.confirmed.json'),'utf8')),plan=await buildLaunchDeploymentPlan(spec),intent=plan.deployments[2],wallet=configuration.roles.gasWallet,mainnet=path.resolve(root,'../../work/echo-launch-production-20261115/mainnet'),current=JSON.parse(fs.readFileSync(path.join(mainnet,'current-deployment.json'),'utf8'));
if(intent.label!=='TokenLaunchFactory'||!same(intent.predictedAddress,'0x8564076727E84bBEf05dBF6f50feC16A1d864266')||!same(current.registry.address,plan.deployments[0].predictedAddress)||current.registry.receiptConfirmed!==true||intent.transaction.value!=='0')throw Error('TOKEN_FACTORY_CONFIRMED_SCOPE_CHANGED');
const request=new FetchRequest('https://bsc-rpc.publicnode.com');request.timeout=15000;const provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});let reviews,officialPreview,result;
try{
 if(Number(BigInt(await provider.send('eth_chainId',[])))!==56)throw Error('TOKEN_FACTORY_WRONG_CHAIN');
 const head=await provider.getBlock('latest'),now=Math.floor(Date.now()/1000);
 if(!head||head.number<12||now-head.timestamp>120||head.timestamp>now+30)throw Error('TOKEN_FACTORY_STALE_HEAD');
 const block=await provider.getBlock(head.number-12);
 const [code,proxyCode,latestCode,latestNonce,pendingNonce,balance]=await Promise.all([provider.getCode(current.registry.address,block.number),provider.getCode(intent.proxy,block.number),provider.getCode(intent.predictedAddress,'latest'),provider.getTransactionCount(wallet,'latest'),provider.getTransactionCount(wallet,'pending'),provider.getBalance(wallet,'latest')]);
 if(keccak256(code)!==current.registry.runtimeHash||keccak256(proxyCode)!==intent.proxyRuntimeHash)throw Error('TOKEN_FACTORY_DEPENDENCY_CODE_CHANGED');
 if(latestCode!=='0x'||await provider.getTransactionCount(intent.predictedAddress,'latest')!==0)throw Error('TOKEN_FACTORY_ALREADY_OCCUPIED_RECOVER_FIRST');
 if(latestNonce!==pendingNonce)throw Error('TOKEN_FACTORY_PENDING_WALLET_TRANSACTION');
 const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/LaunchRegistry.json'),'utf8')),registry=new Contract(current.registry.address,artifact.abi,provider);
 const [admin,recipient,environmentOk]=await Promise.all([registry.platformAdmin({blockTag:block.number}),registry.platformRecipient({blockTag:block.number}),registry.environmentUnchanged({blockTag:block.number})]);
 if(!same(admin,configuration.roles.platformAdmin)||!same(recipient,configuration.roles.platformRecipient)||!environmentOk)throw Error('TOKEN_FACTORY_REGISTRY_ENVIRONMENT_CHANGED');
 if((await provider.getBlock(block.number))?.hash!==block.hash)throw Error('TOKEN_FACTORY_CANONICAL_BLOCK_CHANGED');
 const transaction={chainId:56,from:wallet,...intent.transaction};
 const [estimatedGas,gasPriceRaw]=await Promise.all([provider.estimateGas(transaction),provider.send('eth_gasPrice',[])]),gasPrice=BigInt(gasPriceRaw),estimatedFee=estimatedGas*gasPrice;
 result={schema:'echo-launch-token-factory-official-preview/v1',observedAt:new Date().toISOString(),chainId:56,wallet,to:intent.proxy,predictedTokenFactory:intent.predictedAddress,registry:current.registry.address,initCodeHash:intent.initCodeHash,calldataBytes:(transaction.data.length-2)/2,valueBNB:'0',balanceBNB:formatEther(balance),estimatedGas:String(estimatedGas),gasPriceWei:String(gasPrice),estimatedFeeBNB:formatEther(estimatedFee),diagnostic30PercentReserveBNB:formatEther((estimatedFee*130n+99n)/100n),gasLimitAuthorization,gasUnitsCapAtObservedRpcPriceBNB:gasLimitAuthorization?formatEther(BigInt(gasLimitAuthorization.gasLimit)*gasPrice):null,explicitWalletFeeCapBound:false,latestNonce,pendingNonce,anchor:{number:block.number,hash:block.hash},localBalanceDidNotSuppressOfficialPreview:true,signing:false,broadcast:false,issuanceOpen:false,subscriptionOpen:false};
 reviews=new OfficialWalletReviews({databasePath:path.join(mainnet,'wallet-reviews.sqlite'),wallet,transport:async input=>{const response=await officialTransport(input);if(input.command==='preview')officialPreview=response;return response;}});
 try{
  const review=await reviews.preview({transaction,purpose:'deployment',intentId:intent.initCodeHash,context:{label:intent.label,predictedAddress:intent.predictedAddress,registry:current.registry.address,observedAt:result.observedAt,nonce:latestNonce},gasLimitAuthorization});
  result.officialPreview=officialPreview;
  if(review.success===false)result.previewAccepted=false;
  else Object.assign(result,{previewAccepted:true,reviewId:review.id,approvalDigest:review.approvalDigest,previewExpiresAt:review.preview.expiresAt,previewExpiresAtISO:new Date(review.preview.expiresAt).toISOString(),freshConfirmationRequired:true});
 }catch(error){result.previewAccepted=false;result.officialPreview=officialPreview??null;result.bridgeError=/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'TOKEN_FACTORY_PREVIEW_NOT_VERIFIED';}
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result,null,2));if(!result.previewAccepted)process.exitCode=2;
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error.message??'')?error.message:'TOKEN_FACTORY_PREFLIGHT_FAILED',shortMessage:error.shortMessage??null,serverMessage:String(error.error?.message??error.info?.error?.message??'').slice(0,180),signing:false,broadcast:false}));process.exitCode=1;}
finally{reviews?.close();provider.destroy();}
