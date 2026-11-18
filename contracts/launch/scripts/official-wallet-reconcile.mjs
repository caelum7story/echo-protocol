// Terminal-only receipt recovery. No wallet sign, execute, raw transaction or retry command.
import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {FetchRequest,JsonRpcProvider} from 'ethers';
import {OfficialWalletReviews} from '../lib/official-wallet-review.mjs';
let reviews,provider;
try{
 const {positionals,values:v}=parseArgs({allowPositionals:true,options:Object.fromEntries(['wallet-db','wallet','id','transaction-hash'].map(k=>[k,{type:'string'}]))});
 if(positionals.length!==1||!['status','receipt'].includes(positionals[0])||!v['wallet-db']||!path.isAbsolute(v['wallet-db'])||!/^0x[0-9a-fA-F]{40}$/.test(v.wallet??'')||!/^[0-9a-f]{64}$/.test(v.id??''))throw Error('WALLET_RECOVERY_ARGUMENTS');
 const stat=fs.lstatSync(v['wallet-db']);if(!stat.isFile()||stat.isSymbolicLink())throw Error('WALLET_RECOVERY_DATABASE_REQUIRED');
 reviews=new OfficialWalletReviews({databasePath:v['wallet-db'],wallet:v.wallet});
 const review=reviews.get(v.id);if(!review||review.transaction.from.toLowerCase()!==v.wallet.toLowerCase())throw Error('WALLET_RECOVERY_SCOPE');
 let result;
 if(positionals[0]==='status')result={id:review.id,purpose:review.purpose,phase:review.phase,transactionHash:review.result?.txHash??null,receipt:review.result?.receipt??null,receiptError:review.result?.receiptError??null,previewExpiresAt:review.preview.expiresAt,automaticExecutionAllowed:false,retryAllowed:false};
 else{
  const rpc=new URL(process.env.ECHO_LAUNCH_RPC_URL??'');if(rpc.protocol!=='https:'||rpc.username||rpc.password)throw Error('WALLET_RECOVERY_HTTPS_RPC_REQUIRED');
  const request=new FetchRequest(rpc.href);request.timeout=15000;provider=new JsonRpcProvider(request,undefined,{cacheTimeout:-1});
  result=await reviews.reconcileReceipt({id:v.id,provider,transactionHash:v['transaction-hash']});
 }
 console.log(JSON.stringify({command:positionals[0],result,financialAuthorization:false,broadcast:false,businessIntentVerificationRequired:true,automaticDistributionEnabled:false},null,2));
}catch(error){console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message??'')?error.message:'WALLET_RECOVERY_FAILED',broadcast:false,retryAllowed:false}));process.exitCode=1;}
finally{reviews?.close();provider?.destroy();}
