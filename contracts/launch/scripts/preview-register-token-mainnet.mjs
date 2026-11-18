// Read-only preflight and official wallet preview; never broadcasts.
import fs from 'node:fs';import path from 'node:path';
import {Contract,FetchRequest,JsonRpcProvider,formatEther,keccak256} from 'ethers';
import {inspectReleaseConfiguration} from '../lib/release-config.mjs';
import {buildLaunchDeploymentPlan} from './prepare-deployment.mjs';
import {OfficialWalletReviews,officialTransport} from '../lib/official-wallet-review.mjs';
const root=path.resolve(import.meta.dirname,'..'),destination=process.argv[2],mainnet=path.resolve(root,'../../work/echo-launch-production-20261115/mainnet'),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
if(process.argv.length!==3||!path.isAbsolute(destination)||fs.existsSync(destination))throw Error('NEW_PREVIEW_REPORT_REQUIRED');
const cfg=inspectReleaseConfiguration(root),spec=read(path.join(root,'release/deployment-spec.confirmed.json')),plan=await buildLaunchDeploymentPlan(spec),current=read(path.join(mainnet,'current-deployment.json')),intent=plan.registrations[1],wallet=cfg.roles.gasWallet;
const req=new FetchRequest('https://bsc-rpc.publicnode.com');req.timeout=15000;const provider=new JsonRpcProvider(req,undefined,{cacheTimeout:-1});let reviews,officialPreview;
try{
 if(!current.tokenFactoryDeployed||Number(BigInt(await provider.send('eth_chainId',[])))!==56)throw Error('TOKEN_FACTORY_REQUIRED');
 const head=await provider.getBlock('latest'),now=Math.floor(Date.now()/1000);if(!head||now-head.timestamp>120||head.timestamp>now+30)throw Error('CHAIN_STALE');const block=await provider.getBlock(head.number-12);
 const registry=new Contract(current.registry.address,read(path.join(root,'artifacts/LaunchRegistry.json')).abi,provider);
 const [rc,fc,env,admin,recipient,entry,latestNonce,pendingNonce,balance]=await Promise.all([provider.getCode(current.registry.address,block.number),provider.getCode(current.tokenFactory.address,block.number),registry.environmentUnchanged({blockTag:block.number}),registry.platformAdmin({blockTag:block.number}),registry.platformRecipient({blockTag:block.number}),registry.templates(plan.templates.tokenVersion,{blockTag:block.number}),provider.getTransactionCount(wallet,'latest'),provider.getTransactionCount(wallet,'pending'),provider.getBalance(wallet,'latest')]);
 if(keccak256(rc)!==current.registry.runtimeHash||keccak256(fc)!==current.tokenFactory.runtimeHash||!env||!same(admin,cfg.roles.platformAdmin)||!same(recipient,cfg.roles.platformRecipient)||!same(entry.factory,'0x0000000000000000000000000000000000000000')||latestNonce!==pendingNonce||(await provider.getBlock(block.number))?.hash!==block.hash)throw Error('REGISTRATION_STATE_CHANGED');
 const transaction={chainId:56,from:wallet,...intent.transaction},[gas,priceRaw]=await Promise.all([provider.estimateGas(transaction),provider.send('eth_gasPrice',[])]),price=BigInt(priceRaw);
 const result={schema:'echo-launch-register-token-preview/v1',observedAt:new Date().toISOString(),chainId:56,wallet,to:transaction.to,method:'registerTemplate',versionId:plan.templates.tokenVersion,factory:current.tokenFactory.address,valueBNB:'0',latestNonce,pendingNonce,balanceBNB:formatEther(balance),estimatedGas:String(gas),gasPriceWei:String(price),estimatedFeeBNB:formatEther(gas*price),signing:false,broadcast:false};
 reviews=new OfficialWalletReviews({databasePath:path.join(mainnet,'wallet-reviews.sqlite'),wallet,transport:async input=>{const r=await officialTransport(input);if(input.command==='preview')officialPreview=r;return r;}});
 const r=await reviews.preview({transaction,purpose:'deployment',intentId:'register-token-'+plan.templates.tokenVersion,context:{label:'Register token template',nonce:latestNonce,observedAt:result.observedAt}});
 Object.assign(result,{officialPreview,previewAccepted:r.success!==false,reviewId:r.id,approvalDigest:r.approvalDigest,previewExpiresAt:r.preview?.expiresAt});
 fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));if(!result.previewAccepted)process.exitCode=2;
}catch(e){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(e.message??'')?e.message:'REGISTRATION_PREVIEW_FAILED',shortMessage:e.shortMessage??null,serverMessage:String(e.error?.message??'').slice(0,200),broadcast:false}));process.exitCode=1;}finally{reviews?.close();provider.destroy();}
