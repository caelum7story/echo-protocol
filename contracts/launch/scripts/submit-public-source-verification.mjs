// Publishes only already-reviewed Solidity sources; no wallet/session material.
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dir=path.resolve(root,'../../work/echo-launch-production-20261115/source-verification-mainnet'),stdJsonInput=JSON.parse(fs.readFileSync(path.join(dir,'standard-input.json'))),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))),current=JSON.parse(fs.readFileSync(path.resolve(dir,'../mainnet/current-deployment.json')));
const results=[];
for(const [key,name] of [['registry','LaunchRegistry'],['tokenFactory','TokenLaunchFactory']]){
 const d=current[key];if(!d?.address||!d.transactionHash)throw Error('VERIFIED_DEPLOYMENT_REQUIRED');
 const body={stdJsonInput,compilerVersion:manifest.compiler.replace(/\.Emscripten\.clang$/,''),contractIdentifier:`src/${name}.sol:${name}`,creationTransactionHash:d.transactionHash};
 try{const r=await fetch(`https://sourcify.dev/server/v2/verify/56/${d.address}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const result=await r.json();results.push({key,address:d.address,httpStatus:r.status,result});console.log(JSON.stringify(results.at(-1)));}catch(e){results.push({key,address:d.address,status:'request-unknown',error:e.name});}
}
fs.writeFileSync(path.join(dir,'sourcify-submissions.json'),JSON.stringify({observedAt:new Date().toISOString(),results},null,2)+'\n',{flag:'wx'});
